import { beforeAll, describe, expect, it } from "vitest";

import { type Agreement, agreementFileName, buildAgreement } from "./agreement";
import type { CoverPageTemplate } from "./cover-page-template";
import type { MndaValues } from "./mnda";
import { loadFixtures, sampleValues } from "@/test/helpers";

let template: CoverPageTemplate;
let standardTerms: string;

const build = (values: MndaValues = sampleValues()): Agreement =>
  buildAgreement(template, values, standardTerms);

beforeAll(async () => {
  ({ template, standardTerms } = await loadFixtures());
});

describe("buildAgreement", () => {
  it("carries the title and intro through from the template", () => {
    const agreement = build();
    expect(agreement.title).toBe("Mutual Non-Disclosure Agreement");
    expect(agreement.intro.map((run) => run.text).join("")).toContain(
      "consists of",
    );
  });

  it("lays the cover page fields out in the template's order", () => {
    expect(build().fields.map((field) => field.heading)).toEqual([
      "Purpose",
      "Effective Date",
      "MNDA Term",
      "Term of Confidentiality",
      "Governing Law & Jurisdiction",
      "MNDA Modifications",
    ]);
  });

  it("resolves the user's values into the fields", () => {
    const agreement = build();
    const value = (heading: string) =>
      agreement.fields.find((field) => field.heading === heading)?.lines[0]
        .value;

    expect(value("Purpose")).toBe("Evaluating a potential partnership.");
    expect(value("Effective Date")).toBe("August 3, 2026");
    expect(value("MNDA Term")).toBe("Expires 2 years from Effective Date.");
    expect(value("Term of Confidentiality")).toContain("3 years");
  });

  it("labels the two governing law lines separately", () => {
    const field = build().fields.find(
      (candidate) => candidate.heading === "Governing Law & Jurisdiction",
    );

    expect(field?.lines).toEqual([
      { label: "Governing Law", value: "Delaware" },
      { label: "Jurisdiction", value: "courts located in New Castle, DE" },
    ]);
  });

  it("records no modifications as 'None.' rather than a blank", () => {
    expect(build(sampleValues({ modifications: "" })).fields.at(-1)?.lines[0]
      .value).toBe("None.");
    expect(
      build(sampleValues({ modifications: "   " })).fields.at(-1)?.lines[0]
        .value,
    ).toBe("None.");
  });

  it("keeps supplied modifications", () => {
    const agreement = build(sampleValues({ modifications: "Section 5 amended." }));
    expect(agreement.fields.at(-1)?.lines[0].value).toBe("Section 5 amended.");
  });

  it("leaves unfilled values empty so they render as a rule to write on", () => {
    const agreement = build(sampleValues({ governingLaw: "", jurisdiction: "" }));
    const field = agreement.fields.find(
      (candidate) => candidate.heading === "Governing Law & Jurisdiction",
    );
    expect(field?.lines.map((line) => line.value)).toEqual(["", ""]);
  });

  it("builds the signature rows in the template's order", () => {
    expect(build().signatureRows.map((row) => row.label)).toEqual([
      "Signature",
      "Print Name",
      "Title",
      "Company",
      "Notice Address",
      "Date",
    ]);
  });

  it("fills each party into its own column", () => {
    const rows = build().signatureRows;
    const row = (label: string) =>
      rows.find((candidate) => candidate.label === label)?.values;

    expect(row("Print Name")).toEqual(["Ada Lovelace", "Alan Turing"]);
    expect(row("Company")).toEqual(["Acme Inc.", "Globex Ltd."]);
    expect(row("Notice Address")).toEqual([
      "legal@acme.example",
      "1 Globex Way\nLondon",
    ]);
  });

  it("leaves the hand-signed rows empty, with room to write on Signature", () => {
    const rows = build().signatureRows;
    const signature = rows.find((row) => row.label === "Signature");
    const date = rows.find((row) => row.label === "Date");

    expect(signature?.values).toEqual(["", ""]);
    expect(signature?.tall).toBe(true);
    expect(date?.values).toEqual(["", ""]);
  });

  it("splits the Standard Terms into their eleven numbered clauses", () => {
    const agreement = build();
    expect(agreement.clauses).toHaveLength(11);
    expect(agreement.clauses[0].map((run) => run.text).join("")).toContain(
      "Introduction",
    );
    expect(agreement.clauses[10].map((run) => run.text).join("")).toContain(
      "General",
    );
  });

  it("strips the list numbering, since rendering supplies it", () => {
    for (const clause of build().clauses) {
      expect(clause[0].text).not.toMatch(/^\d+\./);
    }
  });

  it("emphasises the clause headings and cover page cross-references", () => {
    const first = build().clauses[0];
    expect(first[0]).toEqual({ text: "Introduction", bold: true });
    expect(first.some((run) => run.bold && run.text === "Purpose")).toBe(true);
  });

  it("keeps the licence attribution on both the cover page and the terms", () => {
    const agreement = build();
    const text = (runs: { text: string }[]) =>
      runs.map((run) => run.text).join("");

    expect(text(agreement.attribution)).toContain("CC BY 4.0");
    expect(text(agreement.standardTermsFooter)).toContain("CC BY 4.0");
  });

  it("keeps the attribution's link target", () => {
    expect(
      build().attribution.some((run) => run.href?.includes("creativecommons")),
    ).toBe(true);
  });

  it("does not mistake the trailing attribution for a clause", () => {
    for (const clause of build().clauses) {
      expect(clause.map((run) => run.text).join("")).not.toContain(
        "free to use under",
      );
    }
  });
});

describe("agreementFileName", () => {
  it("names both parties when both companies are known", () => {
    expect(agreementFileName(sampleValues())).toBe(
      "Mutual NDA - Acme Inc. and Globex Ltd..pdf",
    );
  });

  it("falls back to a plain name when a company is missing", () => {
    const base = sampleValues();
    expect(
      agreementFileName(sampleValues({ party2: { ...base.party2, company: "" } })),
    ).toBe("Mutual NDA.pdf");
  });

  it("falls back to a plain name when neither company is known", () => {
    const base = sampleValues();
    const values = sampleValues({
      party1: { ...base.party1, company: "  " },
      party2: { ...base.party2, company: "" },
    });
    expect(agreementFileName(values)).toBe("Mutual NDA.pdf");
  });

  it("strips characters that are illegal in filenames", () => {
    const base = sampleValues();
    const values = sampleValues({
      party1: { ...base.party1, company: 'A/B:C*D?E"F<G>H|I\\J' },
    });
    const name = agreementFileName(values);

    expect(name).toBe("Mutual NDA - ABCDEFGHIJ and Globex Ltd..pdf");
    for (const illegal of ['/', "\\", ":", "*", "?", '"', "<", ">", "|"]) {
      expect(name, illegal).not.toContain(illegal);
    }
  });

  it("always ends in .pdf", () => {
    expect(agreementFileName(sampleValues())).toMatch(/\.pdf$/);
  });
});
