/**
 * The finished agreement, described independently of how it is displayed.
 *
 * Both the on-screen preview and the downloaded PDF render this one model, so
 * the document a user reads and the document they download cannot drift apart
 * — which for a legal agreement matters more than the small cost of the extra
 * layer.
 *
 * It is also what keeps eleven document types from becoming eleven renderers:
 * the fields come from the schema, so this is the only place that had to learn
 * about more than one document.
 */

import { type DocumentValues, resolveField } from "./document-values";
import type { DocumentSchema } from "./field-schema";
import { type TextRun, parseInline } from "./inline-markdown";

export interface AgreementLine {
  /** Inline label, e.g. `"Governing Law"`, where the field has more than one. */
  label?: string;
  /** Empty means unsupplied: render a rule to write on. */
  value: string;
}

export interface AgreementField {
  heading: string;
  lines: AgreementLine[];
}

export interface SignatureRow {
  label: string;
  values: [string, string];
  /** Signed by hand, so leave room to write. */
  tall?: boolean;
}

/**
 * The notice every generated agreement carries.
 *
 * On the model rather than in the two renderers, for the same reason everything
 * else is: the preview and the download must say the same thing. It is a notice
 * *about* the document, kept visually apart from it — never a term of the
 * agreement, which contains only the template's own wording.
 */
export const DISCLAIMER = {
  heading: "Draft — subject to legal review",
  body:
    "This document was generated from a template and is not legal advice. " +
    "Have a qualified lawyer review it before anyone signs.",
} as const;

export interface Agreement {
  title: string;
  /** The draft notice, shown on screen and printed on the PDF. */
  disclaimer: typeof DISCLAIMER;
  intro: TextRun[];
  fields: AgreementField[];
  signingStatement: string;
  /** What the two signing parties are called on this document. */
  partyRoles: [string, string];
  signatureRows: SignatureRow[];
  /** Common Paper's CC BY attribution. Required by the licence. */
  attribution: TextRun[];
  /** The numbered Standard Terms clauses. */
  clauses: TextRun[][];
  /** The attribution closing the Standard Terms. */
  standardTermsFooter: TextRun[];
}

/** Splits markdown into blocks separated by blank lines. */
function paragraphs(markdown: string): string[] {
  return markdown
    .split(/\n\s*\n/)
    .map((block) => block.trim())
    .filter(Boolean);
}

const NUMBERED = /^\d+\.\s+/;

export function buildAgreement(
  schema: DocumentSchema,
  values: DocumentValues,
  standardTerms: string,
): Agreement {
  const blocks = paragraphs(standardTerms);

  return {
    title: schema.title,
    disclaimer: DISCLAIMER,
    intro: parseInline(schema.intro),
    fields: schema.fields.map((field) => ({
      heading: field.label,
      lines: resolveField(field, values),
    })),
    signingStatement: schema.signingStatement,
    partyRoles: schema.partyRoles,
    signatureRows: [
      { label: "Signature", values: ["", ""], tall: true },
      { label: "Print Name", values: [values.party1.name, values.party2.name] },
      { label: "Title", values: [values.party1.title, values.party2.title] },
      {
        label: "Company",
        values: [values.party1.company, values.party2.company],
      },
      {
        label: "Notice Address",
        values: [values.party1.noticeAddress, values.party2.noticeAddress],
      },
      { label: "Date", values: ["", ""] },
    ],
    attribution: parseInline(schema.attribution),
    clauses: blocks
      .filter((block) => NUMBERED.test(block))
      .map((block) => parseInline(block.replace(NUMBERED, ""))),
    standardTermsFooter: parseInline(
      blocks.find((block) => !NUMBERED.test(block)) ?? "",
    ),
  };
}

/**
 * A filename naming both parties where known, e.g.
 * `Mutual Non-Disclosure Agreement - Acme and Globex.pdf`.
 */
export function agreementFileName(
  schema: DocumentSchema,
  values: DocumentValues,
): string {
  const parties = [values.party1.company, values.party2.company]
    .map((company) => company.trim())
    .filter(Boolean);

  const suffix = parties.length === 2 ? ` - ${parties.join(" and ")}` : "";
  // Strip characters that are awkward or illegal in filenames.
  return `${schema.title}${suffix}`.replace(/[\\/:*?"<>|]/g, "") + ".pdf";
}
