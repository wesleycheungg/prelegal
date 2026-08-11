/**
 * The finished agreement, described independently of how it is displayed.
 *
 * Both the on-screen preview and the downloaded PDF render this one model, so
 * the document a user reads and the document they download cannot drift apart
 * — which for a legal agreement matters more than the small cost of the extra
 * layer.
 */

import { type CoverPageTemplate, SECTION } from "./cover-page-template";
import { type TextRun, parseInline } from "./inline-markdown";
import {
  type MndaValues,
  formatEffectiveDate,
  resolveConfidentialityTerm,
  resolveMndaTerm,
} from "./mnda";

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

export interface Agreement {
  title: string;
  intro: TextRun[];
  fields: AgreementField[];
  signingStatement: string;
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
  template: CoverPageTemplate,
  values: MndaValues,
  standardTerms: string,
): Agreement {
  const blocks = paragraphs(standardTerms);

  return {
    title: template.title,
    intro: parseInline(template.intro),
    fields: [
      { heading: SECTION.purpose, lines: [{ value: values.purpose }] },
      {
        heading: SECTION.effectiveDate,
        lines: [{ value: formatEffectiveDate(values.effectiveDate) }],
      },
      {
        heading: SECTION.mndaTerm,
        lines: [{ value: resolveMndaTerm(template, values) }],
      },
      {
        heading: SECTION.confidentiality,
        lines: [{ value: resolveConfidentialityTerm(template, values) }],
      },
      {
        heading: SECTION.governingLaw,
        lines: [
          { label: "Governing Law", value: values.governingLaw },
          { label: "Jurisdiction", value: values.jurisdiction },
        ],
      },
      {
        heading: SECTION.modifications,
        lines: [{ value: values.modifications.trim() || "None." }],
      },
    ],
    signingStatement: template.signingStatement,
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
    attribution: parseInline(template.attribution),
    clauses: blocks
      .filter((block) => NUMBERED.test(block))
      .map((block) => parseInline(block.replace(NUMBERED, ""))),
    standardTermsFooter: parseInline(
      blocks.find((block) => !NUMBERED.test(block)) ?? "",
    ),
  };
}

/** A filename naming both parties where known, e.g. `Mutual NDA - Acme and Globex.pdf`. */
export function agreementFileName(values: MndaValues): string {
  const parties = [values.party1.company, values.party2.company]
    .map((company) => company.trim())
    .filter(Boolean);

  const suffix = parties.length === 2 ? ` - ${parties.join(" and ")}` : "";
  // Strip characters that are awkward or illegal in filenames.
  return `Mutual NDA${suffix}`.replace(/[\\/:*?"<>|]/g, "") + ".pdf";
}
