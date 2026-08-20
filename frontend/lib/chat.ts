/**
 * Talking to the assistant, and turning what it says into agreement values.
 *
 * The backend names its fields flatly, in the snake_case keys that
 * `field-schema` derives from each cover page's headings; this module is the
 * one place that translates, so nothing else has to know the wire shape. Both
 * ends derive those keys from the same markdown, and `test/field-schemas.json`
 * is asserted by both test suites so they cannot drift apart unnoticed.
 *
 * Everything here is pure apart from `sendMessage` and `backendIsReachable`,
 * which are the only two functions that touch the network.
 */

import {
  type ChoiceValue,
  type DocumentValues,
  type Party,
  sanitizeYears,
} from "./document-values";
import {
  type DocumentSchema,
  fieldKeys,
  numberKey,
  optionKey,
} from "./field-schema";

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
export type ChatFields = Record<string, string | number | null>;

export interface ChatReply {
  reply: string;
  /** The document the assistant settled on, while one is still being chosen. */
  document: string | null;
  fields: ChatFields;
}

/** Raised when the assistant cannot be reached or cannot answer. */
export class ChatError extends Error {}

const PARTY_KEYS: Record<string, keyof Party> = {
  company: "company",
  name: "name",
  title: "title",
  notice_address: "noticeAddress",
};

/** The current values, in the shape the backend reads. */
export function toChatFields(
  schema: DocumentSchema,
  values: DocumentValues,
): ChatFields {
  const orNull = (text: string | undefined) => text?.trim() || null;
  const fields: ChatFields = {};

  for (const field of schema.fields) {
    switch (field.kind) {
      case "text":
      case "date":
        fields[field.key] = orNull(values.fields[field.key]);
        break;
      case "group":
        for (const line of field.lines) {
          fields[line.key] = orNull(values.fields[line.key]);
        }
        break;
      case "choice": {
        const choice = values.choices[field.key];
        fields[optionKey(field.key)] = choice?.index ?? null;
        fields[numberKey(field.key)] = orNull(choice?.number);
        break;
      }
    }
  }

  for (const [party, key] of [
    [values.party1, "party1"],
    [values.party2, "party2"],
  ] as const) {
    for (const [wire, prop] of Object.entries(PARTY_KEYS)) {
      fields[`${key}_${wire}`] = orNull(party[prop]);
    }
  }

  return fields;
}

/**
 * The values with whatever the assistant just learned written into them.
 *
 * A `null` leaves the existing value alone, so a turn that settles one detail
 * cannot blank out the rest. Numbers run through `sanitizeYears` again even
 * though the backend already checked them: this is the point where a value
 * enters the document, which is where the form validates too, and a term of
 * "-3 years" is not something to take on trust from anywhere.
 */
export function applyFields(
  schema: DocumentSchema,
  values: DocumentValues,
  fields: ChatFields,
): DocumentValues {
  const merged: DocumentValues = {
    fields: { ...values.fields },
    choices: { ...values.choices },
    party1: applyParty(values.party1, "party1", fields),
    party2: applyParty(values.party2, "party2", fields),
  };

  const text = (key: string) => {
    const value = fields[key];
    return typeof value === "string" ? value : null;
  };

  for (const field of schema.fields) {
    switch (field.kind) {
      case "text":
      case "date": {
        const value = text(field.key);
        if (value !== null) merged.fields[field.key] = value;
        break;
      }

      case "group":
        for (const line of field.lines) {
          const value = text(line.key);
          if (value !== null) merged.fields[line.key] = value;
        }
        break;

      case "choice": {
        const current: ChoiceValue = merged.choices[field.key] ?? {
          index: 0,
          number: "",
        };
        const option = fields[optionKey(field.key)];
        const count = text(numberKey(field.key));

        merged.choices[field.key] = {
          // An index outside the template's own options would be a sentence
          // the document does not have, so it is ignored rather than trusted.
          index:
            typeof option === "number" &&
            option >= 0 &&
            option < field.options.length
              ? option
              : current.index,
          number: count === null ? current.number : sanitizeYears(count),
        };
        break;
      }
    }
  }

  return merged;
}

function applyParty(party: Party, prefix: string, fields: ChatFields): Party {
  const updated = { ...party };

  for (const [wire, prop] of Object.entries(PARTY_KEYS)) {
    const value = fields[`${prefix}_${wire}`];
    if (typeof value === "string") updated[prop] = value;
  }

  return updated;
}

/**
 * The names of the fields a turn filled in, for showing the user what changed.
 *
 * Read from the fields themselves rather than from the assistant's sentence,
 * so what is listed is what actually reached the document — the two can differ
 * when a value is discarded as unusable. Labels come from the schema, so a
 * document's own headings are what the user sees.
 */
export function filledFieldNames(
  schema: DocumentSchema,
  fields: ChatFields,
): string[] {
  const labels = new Map<string, string>();

  for (const field of schema.fields) {
    for (const key of fieldKeys(field)) labels.set(key, field.label);
    if (field.kind === "group") {
      for (const line of field.lines) labels.set(line.key, line.label);
    }
  }

  for (const [index, role] of schema.partyRoles.entries()) {
    for (const wire of Object.keys(PARTY_KEYS)) {
      const readable = wire
        .replace(/_/g, " ")
        .replace(/\b\w/g, (c) => c.toUpperCase());
      labels.set(`party${index + 1}_${wire}`, `${role} ${readable}`);
    }
  }

  const names = Object.entries(fields)
    .filter(([, value]) => value !== null)
    .map(([key]) => labels.get(key))
    .filter((name): name is string => Boolean(name));

  return [...new Set(names)];
}

/**
 * Whether the backend is there.
 *
 * `npm run dev` serves the frontend alone on port 3000, where nothing answers
 * `/api/*`. Asking first means the chat can say so plainly instead of failing
 * on the user's first message.
 */
export async function backendIsReachable(
  signal?: AbortSignal,
): Promise<boolean> {
  try {
    const response = await fetch("/api/health", { signal });
    return response.ok;
  } catch {
    return false;
  }
}

/**
 * Sends the conversation and returns the assistant's next turn.
 *
 * `document` is null until one has been chosen, which is what puts the
 * assistant in the conversation about which agreement is wanted.
 */
export async function sendMessage(
  messages: ChatMessage[],
  document: {
    schema: DocumentSchema;
    slug: string;
    values: DocumentValues;
  } | null,
): Promise<ChatReply> {
  let response: Response;

  try {
    response = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        document: document?.slug ?? null,
        messages,
        values: document ? toChatFields(document.schema, document.values) : {},
      }),
    });
  } catch {
    throw new ChatError(
      "Could not reach the assistant. Is the backend running?",
    );
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
