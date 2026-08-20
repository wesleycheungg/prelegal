import { readFile } from "node:fs/promises";
import path from "node:path";

import { beforeAll, describe, expect, it } from "vitest";

import { type Agreement, agreementFileName, buildAgreement } from "./agreement";
import { createDefaultValues } from "./document-values";
import type { DocumentDefinition } from "./templates";
import { loadDocument, loadFixtures, sampleValues } from "@/test/helpers";

let mnda: DocumentDefinition;

beforeAll(async () => {
  mnda = await loadFixtures();
});

const build = (values = sampleValues()) =>
  buildAgreement(mnda.schema, values, mnda.standardTerms);

describe("buildAgreement", () => {
  it("still produces exactly what it produced before the refactor", async () => {
    // Captured from the shipped Mutual NDA before the schema layer existed.
    // KAN-3 and KAN-5 put this document in front of users; generalising the
    // machinery underneath it is not allowed to change a word of it.
    const fixture = JSON.parse(
      await readFile(
        path.join(process.cwd(), "test/mutual-nda-agreement.json"),
        "utf8",
      ),
    );

    const { partyRoles, disclaimer, ...agreement } = build();

    expect(agreement).toEqual(fixture);
    // Two additions since, and nothing else. Who signs, which used to be
    // hardcoded in the renderers (KAN-6), and the draft notice (KAN-7).
    expect(partyRoles).toEqual(["PARTY 1", "PARTY 2"]);
    expect(disclaimer.heading).toBe("Draft — subject to legal review");
  });

  it("titles the agreement from the cover page", () => {
    expect(build().title).toBe("Mutual Non-Disclosure Agreement");
  });

  it("lays the fields out in the order the cover page lists them", () => {
    expect(build().fields.map((field) => field.heading)).toEqual([
      "Purpose",
      "Effective Date",
      "MNDA Term",
      "Term of Confidentiality",
      "Governing Law & Jurisdiction",
      "MNDA Modifications",
    ]);
  });

  it("resolves a choice to the template's own sentence", () => {
    const term = build().fields.find((field) => field.heading === "MNDA Term");

    expect(term?.lines[0].value).toBe("Expires 2 years from Effective Date.");
  });

  it("uses the alternative sentence when it is the one chosen", () => {
    const values = sampleValues();
    values.choices.mnda_term = { index: 1, number: "2" };

    const term = build(values).fields.find(
      (field) => field.heading === "MNDA Term",
    );

    expect(term?.lines[0].value).toBe(
      "Continues until terminated in accordance with the terms of the MNDA.",
    );
  });

  it("labels each line of a grouped field", () => {
    const law = build().fields.find(
      (field) => field.heading === "Governing Law & Jurisdiction",
    );

    expect(law?.lines).toEqual([
      { label: "Governing Law", value: "Delaware" },
      { label: "Jurisdiction", value: "courts located in New Castle, DE" },
    ]);
  });

  it("reads an empty optional field as None.", () => {
    const modifications = build().fields.find(
      (field) => field.heading === "MNDA Modifications",
    );

    expect(modifications?.lines[0].value).toBe("None.");
  });

  it("leaves a required field empty so the document shows a rule to write on", () => {
    const values = sampleValues();
    values.fields.purpose = "";

    const purpose = build(values).fields.find(
      (field) => field.heading === "Purpose",
    );

    expect(purpose?.lines[0].value).toBe("");
  });

  it("keeps the numbered Standard Terms clauses", () => {
    const agreement = build();

    expect(agreement.clauses).toHaveLength(11);
    expect(agreement.standardTermsFooter.length).toBeGreaterThan(0);
  });
});

describe("other documents", () => {
  let pilot: DocumentDefinition;

  beforeAll(async () => {
    pilot = await loadDocument("pilot-agreement");
  });

  it("builds an agreement the same way", () => {
    const agreement = buildAgreement(
      pilot.schema,
      createDefaultValues(pilot.schema),
      pilot.standardTerms,
    );

    expect(agreement.title).toBe("Pilot Agreement");
    expect(agreement.partyRoles).toEqual(["PROVIDER", "CUSTOMER"]);
    expect(agreement.clauses.length).toBeGreaterThan(0);
  });

  it("carries the document's own party names into the signature rows", () => {
    const values = createDefaultValues(pilot.schema);
    values.party1.company = "Acme Inc.";

    const agreement: Agreement = buildAgreement(
      pilot.schema,
      values,
      pilot.standardTerms,
    );
    const company = agreement.signatureRows.find(
      (row) => row.label === "Company",
    );

    expect(company?.values).toEqual(["Acme Inc.", ""]);
  });
});

describe("agreementFileName", () => {
  it("names both parties when both are known", () => {
    expect(agreementFileName(mnda.schema, sampleValues())).toBe(
      "Mutual Non-Disclosure Agreement - Acme Inc. and Globex Ltd..pdf",
    );
  });

  it("falls back to the document's title when a company is missing", () => {
    const values = sampleValues();
    values.party2.company = "";

    expect(agreementFileName(mnda.schema, values)).toBe(
      "Mutual Non-Disclosure Agreement.pdf",
    );
  });

  it("strips characters that are illegal in filenames", () => {
    const values = sampleValues();
    values.party1.company = "A/C: Ltd";
    values.party2.company = "B?Co";

    expect(agreementFileName(mnda.schema, values)).toBe(
      "Mutual Non-Disclosure Agreement - AC Ltd and BCo.pdf",
    );
  });
});
