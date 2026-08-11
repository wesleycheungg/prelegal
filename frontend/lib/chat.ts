/**
 * Talking to the assistant, and turning what it says into agreement values.
 *
 * The backend names its fields flatly and in snake_case; this module is the one
 * place that translates, so nothing else has to know the wire shape.
 *
 * Everything here is pure apart from `sendMessage` and `backendIsReachable`,
 * which are the only two functions that touch the network.
 */

import { type MndaValues, type Party, sanitizeYears } from "./mnda";

/** A turn in the conversation, as the backend expects it. */
export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

/**
 * The fields the assistant may set, exactly as they cross the wire.
 *
 * `null` means it said nothing about that field this turn, which is different
 * from clearing it — see `applyFields`.
 */
export interface ChatFields {
  purpose: string | null;
  effective_date: string | null;
  mnda_term_kind: "fixed" | "untilTerminated" | null;
  mnda_term_years: string | null;
  confidentiality_kind: "fixed" | "perpetual" | null;
  confidentiality_years: string | null;
  governing_law: string | null;
  jurisdiction: string | null;
  modifications: string | null;
  party1_company: string | null;
  party1_name: string | null;
  party1_title: string | null;
  party1_notice_address: string | null;
  party2_company: string | null;
  party2_name: string | null;
  party2_title: string | null;
  party2_notice_address: string | null;
}

export interface ChatReply {
  reply: string;
  fields: ChatFields;
}

/** Raised when the assistant cannot be reached or cannot answer. */
export class ChatError extends Error {}

/** The current values, in the shape the backend reads. */
export function toChatFields(values: MndaValues): ChatFields {
  const orNull = (text: string) => text.trim() || null;

  return {
    purpose: orNull(values.purpose),
    effective_date: orNull(values.effectiveDate),
    mnda_term_kind: values.mndaTermKind,
    mnda_term_years: orNull(values.mndaTermYears),
    confidentiality_kind: values.confidentialityKind,
    confidentiality_years: orNull(values.confidentialityYears),
    governing_law: orNull(values.governingLaw),
    jurisdiction: orNull(values.jurisdiction),
    modifications: orNull(values.modifications),
    party1_company: orNull(values.party1.company),
    party1_name: orNull(values.party1.name),
    party1_title: orNull(values.party1.title),
    party1_notice_address: orNull(values.party1.noticeAddress),
    party2_company: orNull(values.party2.company),
    party2_name: orNull(values.party2.name),
    party2_title: orNull(values.party2.title),
    party2_notice_address: orNull(values.party2.noticeAddress),
  };
}

/**
 * The values with whatever the assistant just learned written into them.
 *
 * A `null` leaves the existing value alone, so a turn that settles one detail
 * cannot blank out the rest. The years run through `sanitizeYears` again even
 * though the backend already checked them: this is the point where a value
 * enters the document, which is where the form validates too, and a term of
 * "-3 years" is not something to take on trust from anywhere.
 */
export function applyFields(values: MndaValues, fields: ChatFields): MndaValues {
  const merged: MndaValues = {
    ...values,
    // Spread, because `party1` and `party2` are objects and the caller's
    // `update` merges only the top level.
    party1: applyParty(values.party1, {
      company: fields.party1_company,
      name: fields.party1_name,
      title: fields.party1_title,
      noticeAddress: fields.party1_notice_address,
    }),
    party2: applyParty(values.party2, {
      company: fields.party2_company,
      name: fields.party2_name,
      title: fields.party2_title,
      noticeAddress: fields.party2_notice_address,
    }),
  };

  if (fields.purpose !== null) merged.purpose = fields.purpose;
  if (fields.effective_date !== null) merged.effectiveDate = fields.effective_date;
  if (fields.mnda_term_kind !== null) merged.mndaTermKind = fields.mnda_term_kind;
  if (fields.governing_law !== null) merged.governingLaw = fields.governing_law;
  if (fields.jurisdiction !== null) merged.jurisdiction = fields.jurisdiction;
  if (fields.modifications !== null) merged.modifications = fields.modifications;

  if (fields.confidentiality_kind !== null) {
    merged.confidentialityKind = fields.confidentiality_kind;
  }
  if (fields.mnda_term_years !== null) {
    merged.mndaTermYears = sanitizeYears(fields.mnda_term_years);
  }
  if (fields.confidentiality_years !== null) {
    merged.confidentialityYears = sanitizeYears(fields.confidentiality_years);
  }

  return merged;
}

function applyParty(party: Party, patch: Record<keyof Party, string | null>): Party {
  const updated = { ...party };

  for (const [key, value] of Object.entries(patch) as [keyof Party, string | null][]) {
    if (value !== null) updated[key] = value;
  }

  return updated;
}

/** How each field is named when the chat reports what it just filled in. */
const FIELD_LABELS: Record<keyof ChatFields, string> = {
  purpose: "Purpose",
  effective_date: "Effective Date",
  mnda_term_kind: "MNDA Term",
  mnda_term_years: "MNDA Term",
  confidentiality_kind: "Term of Confidentiality",
  confidentiality_years: "Term of Confidentiality",
  governing_law: "Governing Law",
  jurisdiction: "Jurisdiction",
  modifications: "MNDA Modifications",
  party1_company: "Party 1 Company",
  party1_name: "Party 1 Print Name",
  party1_title: "Party 1 Title",
  party1_notice_address: "Party 1 Notice Address",
  party2_company: "Party 2 Company",
  party2_name: "Party 2 Print Name",
  party2_title: "Party 2 Title",
  party2_notice_address: "Party 2 Notice Address",
};

/**
 * The names of the fields a turn filled in, for showing the user what changed.
 *
 * Read from the fields themselves rather than from the assistant's sentence,
 * so what is listed is what actually reached the document — the two can differ
 * when a value is discarded as unusable.
 */
export function filledFieldNames(fields: ChatFields): string[] {
  const names = Object.entries(fields)
    .filter(([, value]) => value !== null)
    .map(([key]) => FIELD_LABELS[key as keyof ChatFields]);

  return [...new Set(names)];
}

/**
 * Whether the backend is there.
 *
 * `npm run dev` serves the frontend alone on port 3000, where nothing answers
 * `/api/*`. Asking first means the chat can say so plainly instead of failing
 * on the user's first message.
 */
export async function backendIsReachable(signal?: AbortSignal): Promise<boolean> {
  try {
    const response = await fetch("/api/health", { signal });
    return response.ok;
  } catch {
    return false;
  }
}

/** Sends the conversation and returns the assistant's next turn. */
export async function sendMessage(
  messages: ChatMessage[],
  values: MndaValues,
): Promise<ChatReply> {
  let response: Response;

  try {
    response = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages, values: toChatFields(values) }),
    });
  } catch {
    throw new ChatError("Could not reach the assistant. Is the backend running?");
  }

  if (!response.ok) {
    throw new ChatError(await detailFrom(response));
  }

  return (await response.json()) as ChatReply;
}

/** The server's own explanation where there is one, since they read well. */
async function detailFrom(response: Response): Promise<string> {
  try {
    const body = await response.json();
    if (typeof body?.detail === "string") return body.detail;
  } catch {
    // Falls through to the generic message below.
  }

  return "The assistant could not answer. Please try again.";
}
