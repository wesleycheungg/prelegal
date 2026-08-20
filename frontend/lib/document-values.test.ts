import { beforeAll, describe, expect, it } from "vitest";

import {
  createDefaultValues,
  formatCount,
  formatDate,
  isComplete,
  resolveField,
  sanitizeYears,
} from "./document-values";
import type { DocumentSchema } from "./field-schema";
import { loadDocument, loadFixtures, sampleValues } from "@/test/helpers";

let schema: DocumentSchema;

beforeAll(async () => {
  schema = (await loadFixtures()).schema;
});

const field = (key: string) => schema.fields.find((spec) => spec.key === key)!;

describe("createDefaultValues", () => {
  it("starts from the template's suggested wording", () => {
    expect(createDefaultValues(schema).fields.purpose).toBe(
      "Evaluating whether to enter into a business relationship with the other party.",
    );
  });

  it("leaves the date blank so it can be written in at signing", () => {
    expect(createDefaultValues(schema).fields.effective_date).toBe("");
  });

  it("selects the first alternative and takes its number from the template", () => {
    expect(createDefaultValues(schema).choices.mnda_term).toEqual({
      index: 0,
      number: "1",
    });
  });

  it("gives a grouped field one empty value per line", () => {
    const values = createDefaultValues(schema);

    expect(values.fields.governing_law).toBe("");
    expect(values.fields.jurisdiction).toBe("");
  });

  it("starts both parties empty", () => {
    expect(createDefaultValues(schema).party1).toEqual({
      name: "",
      title: "",
      company: "",
      noticeAddress: "",
    });
  });
});

describe("sanitizeYears", () => {
  it("keeps a whole number", () => {
    expect(sanitizeYears("3")).toBe("3");
  });

  it("refuses anything that is not a count", () => {
    // These flow straight into the agreement's wording.
    expect(sanitizeYears("-3")).toBe("3");
    expect(sanitizeYears("1.5")).toBe("15");
    expect(sanitizeYears("0")).toBe("");
    expect(sanitizeYears("two")).toBe("");
  });
});

describe("formatCount", () => {
  it("singularises the template's own unit", () => {
    expect(formatCount("1", "year(s)")).toBe("1 year");
    expect(formatCount("3", "year(s)")).toBe("3 years");
  });

  it("leaves a unit it was not given a plural for alone", () => {
    // Guessing a plural for wording we did not write would be inventing it.
    expect(formatCount("3", "business days")).toBe("3 business days");
  });

  it("renders a blank rather than collapsing the sentence", () => {
    expect(formatCount("", "year(s)")).toBe("______");
  });
});

describe("formatDate", () => {
  it("writes a date out in full", () => {
    expect(formatDate("2026-08-03")).toBe("August 3, 2026");
  });

  it("does not shift across time zones", () => {
    expect(formatDate("2026-01-01")).toBe("January 1, 2026");
  });

  it("returns nothing for an empty or unusable value", () => {
    expect(formatDate("")).toBe("");
    expect(formatDate("not a date")).toBe("");
  });
});

describe("resolveField", () => {
  it("fills a number into the chosen sentence", () => {
    const values = sampleValues();

    expect(resolveField(field("mnda_term"), values)[0].value).toBe(
      "Expires 2 years from Effective Date.",
    );
  });

  it("leaves a blank in the sentence when the number is missing", () => {
    const values = sampleValues();
    values.choices.mnda_term = { index: 0, number: "" };

    expect(resolveField(field("mnda_term"), values)[0].value).toBe(
      "Expires ______ from Effective Date.",
    );
  });

  it("uses an alternative that takes no number as written", () => {
    const values = sampleValues();
    values.choices.term_of_confidentiality = { index: 1, number: "" };

    expect(
      resolveField(field("term_of_confidentiality"), values)[0].value,
    ).toBe("In perpetuity.");
  });

  it("ignores a selection the template has no sentence for", () => {
    const values = sampleValues();
    values.choices.mnda_term = { index: 99, number: "2" };

    // Falls back to the first rather than rendering nothing.
    expect(resolveField(field("mnda_term"), values)[0].value).toContain(
      "Expires",
    );
  });
});

describe("isComplete", () => {
  it("is true once everything that shapes the agreement is filled in", () => {
    expect(isComplete(schema, sampleValues())).toBe(true);
  });

  it("does not require an optional field", () => {
    const values = sampleValues();
    values.fields.mnda_modifications = "";

    expect(isComplete(schema, values)).toBe(true);
  });

  it("requires both companies", () => {
    const values = sampleValues();
    values.party2.company = "";

    expect(isComplete(schema, values)).toBe(false);
  });

  it("requires a number when the chosen sentence has one", () => {
    const values = sampleValues();
    values.choices.mnda_term = { index: 0, number: "" };

    expect(isComplete(schema, values)).toBe(false);
  });

  it("does not require a number when the chosen sentence has none", () => {
    const values = sampleValues();
    values.choices.mnda_term = { index: 1, number: "" };

    expect(isComplete(schema, values)).toBe(true);
  });

  it("requires every line of a grouped field", () => {
    const values = sampleValues();
    values.fields.jurisdiction = "";

    expect(isComplete(schema, values)).toBe(false);
  });
});

describe("across documents", () => {
  it("defaults every document without throwing", async () => {
    const documents = await import("@/test/helpers").then((m) =>
      m.loadAllDocuments(),
    );

    for (const document of documents) {
      const values = createDefaultValues(document.schema);
      expect(
        Object.keys(values.fields).length + Object.keys(values.choices).length,
      ).toBeGreaterThan(0);
    }
  });

  it("reads an optional field left empty as None.", async () => {
    const pilot = await loadDocument("pilot-agreement");
    const fees = pilot.schema.fields.find((spec) => spec.key === "fees")!;
    const values = createDefaultValues(pilot.schema);
    values.fields.fees = "";

    expect(resolveField(fees, values)[0].value).toBe("None.");
  });
});
