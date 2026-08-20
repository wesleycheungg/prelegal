import { renderToBuffer } from "@react-pdf/renderer";
import { beforeAll, describe, expect, it } from "vitest";

import { AgreementPdf } from "./document-pdf";
import { buildAgreement } from "@/lib/agreement";
import { createDefaultValues } from "@/lib/document-values";
import type { DocumentValues } from "@/lib/document-values";
import type { DocumentDefinition } from "@/lib/templates";
import {
  countPdfPages,
  extractPdfPages,
  extractPdfText,
  loadFixtures,
  sampleValues,
} from "@/test/helpers";

/**
 * Renders the real PDF and reads its content back.
 *
 * These assertions cover what the document *says*. They say nothing about how
 * it looks — borders, spacing and page breaks are checked by hand, per
 * `docs/manual-testing.md`.
 */

let mnda: DocumentDefinition;
let filled: { pdf: Buffer; text: string };

const renderPdf = async (values: DocumentValues) =>
  renderToBuffer(
    <AgreementPdf
      agreement={buildAgreement(mnda.schema, values, mnda.standardTerms)}
    />,
  );

beforeAll(async () => {
  mnda = await loadFixtures();
  const pdf = await renderPdf(sampleValues());
  filled = { pdf, text: extractPdfText(pdf) };
}, 60_000);

describe("MndaPdf", () => {
  it("produces a valid PDF", () => {
    expect(filled.pdf.subarray(0, 5).toString()).toBe("%PDF-");
    expect(filled.pdf.toString("latin1")).toContain("%%EOF");
  });

  it("runs to several pages", () => {
    expect(countPdfPages(filled.pdf)).toBeGreaterThanOrEqual(3);
  });

  it("stays small, because the text is text and not an image", () => {
    expect(filled.pdf.byteLength).toBeLessThan(200_000);
  });

  it("embeds the text as searchable text", () => {
    expect(filled.text.length).toBeGreaterThan(5_000);
  });

  it("titles the document", () => {
    expect(filled.text).toContain("Mutual Non-Disclosure Agreement");
  });

  it("separates the cover page from the standard terms", () => {
    expect(filled.text).toContain("COVER PAGE");
    expect(filled.text).toContain("STANDARD TERMS");
  });

  it("includes every cover page heading", () => {
    for (const heading of [
      "PURPOSE",
      "EFFECTIVE DATE",
      "MNDA TERM",
      "TERM OF CONFIDENTIALITY",
      "GOVERNING LAW & JURISDICTION",
      "MNDA MODIFICATIONS",
    ]) {
      expect(filled.text, heading).toContain(heading);
    }
  });

  it("includes the resolved values", () => {
    expect(filled.text).toContain("Evaluating a potential partnership.");
    expect(filled.text).toContain("August 3, 2026");
    expect(filled.text).toContain("Expires 2 years from Effective Date.");
    expect(filled.text).toContain("Delaware");
    expect(filled.text).toContain("courts located in New Castle, DE");
  });

  it("includes both parties' details", () => {
    for (const detail of [
      "Acme Inc.",
      "Globex Ltd.",
      "Ada Lovelace",
      "Alan Turing",
      "General Counsel",
      "legal@acme.example",
    ]) {
      expect(filled.text, detail).toContain(detail);
    }
  });

  it("includes the signature block", () => {
    expect(filled.text).toContain("PARTY 1");
    expect(filled.text).toContain("PARTY 2");
    for (const row of ["Signature", "Print Name", "Title", "Company", "Date"]) {
      expect(filled.text, row).toContain(row);
    }
  });

  it("keeps the signature block on a single page", () => {
    // A row split from its PARTY 1 / PARTY 2 header would leave someone
    // signing an unlabelled box, so the table must never break across pages.
    const page = extractPdfPages(filled.pdf).find((text) =>
      text.includes("PARTY 1"),
    );

    expect(page).toBeDefined();
    for (const row of ["Signature", "Print Name", "Title", "Company", "Date"]) {
      expect(page, row).toContain(row);
    }
  });

  it("includes the signing statement", () => {
    expect(filled.text).toContain("By signing this Cover Page");
  });

  it("includes all eleven standard terms clauses", () => {
    // Presence only: the extractor walks content streams in file order, which
    // is not page order, so it cannot speak to sequence. Clause ordering is
    // asserted against the model in `lib/agreement.test.ts`.
    for (const heading of [
      "Introduction",
      "Use and Protection of Confidential Information",
      "Exceptions",
      "Disclosures Required by Law",
      "Term and Termination",
      "Return or Destruction of Confidential Information",
      "Proprietary Rights",
      "Disclaimer",
      "Governing Law and Jurisdiction",
      "Equitable Relief",
      "General",
    ]) {
      expect(filled.text, heading).toContain(heading);
    }
  });

  it("carries the Common Paper attribution required by the licence", () => {
    expect(filled.text).toContain("free to use under");
    expect(filled.text).toContain("CC BY 4.0");
  });

  it("preserves the typography of the legal prose", () => {
    // Curly quotes and apostrophes must survive encoding, or the agreement
    // reads as though words are missing.
    expect(filled.text).toContain("party’s");
    expect(filled.text).toContain("“AS IS”");
  });

  it("writes a rule to sign on where a detail is missing", async () => {
    const text = extractPdfText(
      await renderPdf(
        sampleValues({ fields: { governing_law: "", jurisdiction: "" } }),
      ),
    );
    expect(text).toContain("______");
  });

  it("records no modifications as 'None.'", () => {
    expect(filled.text).toContain("None.");
  });

  it("uses the alternative term wording when chosen", async () => {
    const text = extractPdfText(
      await renderPdf(
        sampleValues({
          choices: {
            mnda_term: { index: 1, number: "2" },
            term_of_confidentiality: { index: 1, number: "3" },
          },
        }),
      ),
    );

    expect(text).toContain("Continues until terminated");
    expect(text).toContain("In perpetuity.");
    expect(text).not.toContain("Expires 2 years");
  });

  it("renders an agreement with nothing filled in", async () => {
    const pdf = await renderPdf(
      createDefaultValues((await loadFixtures()).schema),
    );

    expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
    expect(extractPdfText(pdf)).toContain("Mutual Non-Disclosure Agreement");
  });

  it("keeps accented Latin text, but silently drops characters outside Latin-1", async () => {
    // Documents a real limitation rather than asserting it is acceptable: the
    // built-in Times faces cover Latin-1 only, so CJK and similar scripts
    // vanish from the PDF without any error. Supporting them means embedding a
    // font. See `docs/manual-testing.md`.
    const text = extractPdfText(
      await renderPdf(
        sampleValues({
          fields: { purpose: "Evaluating Ünïcode and 株式会社." },
        }),
      ),
    );

    expect(text).toContain("Ünïcode");
    expect(text).not.toContain("株式会社");
  });

  it("survives values long enough to wrap and paginate", async () => {
    const pdf = await renderPdf(
      sampleValues({
        fields: {
          purpose: "Evaluating a partnership. ".repeat(200),
          mnda_modifications: "Clause amended. ".repeat(200),
        },
      }),
    );

    expect(countPdfPages(pdf)).toBeGreaterThan(3);
    expect(extractPdfText(pdf)).toContain("CC BY 4.0");
  });
}, 60_000);
