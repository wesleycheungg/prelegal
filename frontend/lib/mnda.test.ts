import { beforeAll, describe, expect, it } from "vitest";

import type { CoverPageTemplate } from "./cover-page-template";
import {
  createDefaultValues,
  formatEffectiveDate,
  formatYears,
  isComplete,
  resolveConfidentialityTerm,
  resolveMndaTerm,
  sanitizeYears,
} from "./mnda";
import { loadFixtures, sampleValues } from "@/test/helpers";

let template: CoverPageTemplate;

beforeAll(async () => {
  ({ template } = await loadFixtures());
});

describe("createDefaultValues", () => {
  it("takes the suggested purpose from the template", () => {
    expect(createDefaultValues(template).purpose).toBe(
      "Evaluating whether to enter into a business relationship with the other party.",
    );
  });

  it("leaves the effective date blank so it can be set at signing", () => {
    expect(createDefaultValues(template).effectiveDate).toBe("");
  });

  it("starts on the fixed-term options with one year", () => {
    const values = createDefaultValues(template);
    expect(values.mndaTermKind).toBe("fixed");
    expect(values.mndaTermYears).toBe("1");
    expect(values.confidentialityKind).toBe("fixed");
    expect(values.confidentialityYears).toBe("1");
  });

  it("starts both parties empty", () => {
    const { party1, party2 } = createDefaultValues(template);
    const empty = { name: "", title: "", company: "", noticeAddress: "" };
    expect(party1).toEqual(empty);
    expect(party2).toEqual(empty);
  });

  it("does not share party objects between the two parties", () => {
    const values = createDefaultValues(template);
    values.party1.name = "Ada";
    expect(values.party2.name).toBe("");
  });
});

describe("sanitizeYears", () => {
  it("keeps a whole number of years", () => {
    expect(sanitizeYears("3")).toBe("3");
    expect(sanitizeYears("18")).toBe("18");
  });

  it("rejects a negative term, which cannot be signed", () => {
    // Without this the agreement reads "Expires -3 years from Effective Date."
    expect(sanitizeYears("-3")).toBe("3");
  });

  it("rejects a fractional or exponent term", () => {
    expect(sanitizeYears("1.5")).toBe("15");
    expect(sanitizeYears("1e5")).toBe("15");
  });

  it("treats zero as unset, so it renders as a blank to fill in", () => {
    expect(sanitizeYears("0")).toBe("");
    expect(sanitizeYears("000")).toBe("");
  });

  it("drops leading zeros", () => {
    expect(sanitizeYears("007")).toBe("7");
  });

  it("passes an empty field through", () => {
    expect(sanitizeYears("")).toBe("");
  });

  it("strips stray characters", () => {
    expect(sanitizeYears("2 years")).toBe("2");
    expect(sanitizeYears("abc")).toBe("");
  });
});

describe("formatYears", () => {
  it("uses the singular for one year", () => {
    expect(formatYears("1")).toBe("1 year");
  });

  it("uses the plural for other numbers", () => {
    expect(formatYears("2")).toBe("2 years");
    expect(formatYears("10")).toBe("10 years");
    expect(formatYears("0")).toBe("0 years");
  });

  it("tolerates surrounding whitespace", () => {
    expect(formatYears("  3 ")).toBe("3 years");
  });

  it("falls back to a blank rather than collapsing the sentence", () => {
    // Otherwise a cleared input reads "Expires  from Effective Date."
    expect(formatYears("")).toBe("______");
    expect(formatYears("   ")).toBe("______");
  });
});

describe("formatEffectiveDate", () => {
  it("writes the date out in full", () => {
    expect(formatEffectiveDate("2026-08-03")).toBe("August 3, 2026");
  });

  it("does not shift the day across time zones", () => {
    // Parsed as UTC, so a date never lands on the day before.
    expect(formatEffectiveDate("2026-01-01")).toBe("January 1, 2026");
    expect(formatEffectiveDate("2026-12-31")).toBe("December 31, 2026");
  });

  it("returns nothing for a blank date", () => {
    expect(formatEffectiveDate("")).toBe("");
  });

  it("returns nothing for an unparseable date", () => {
    expect(formatEffectiveDate("not-a-date")).toBe("");
    expect(formatEffectiveDate("2026-13-45")).toBe("");
  });
});

describe("resolveMndaTerm", () => {
  it("fills the year count into the template's own sentence", () => {
    const values = sampleValues({ mndaTermKind: "fixed", mndaTermYears: "2" });
    expect(resolveMndaTerm(template, values)).toBe(
      "Expires 2 years from Effective Date.",
    );
  });

  it("uses the singular for a one-year term", () => {
    const values = sampleValues({ mndaTermYears: "1" });
    expect(resolveMndaTerm(template, values)).toBe(
      "Expires 1 year from Effective Date.",
    );
  });

  it("uses the alternative wording when the term is open-ended", () => {
    const values = sampleValues({ mndaTermKind: "untilTerminated" });
    expect(resolveMndaTerm(template, values)).toBe(
      "Continues until terminated in accordance with the terms of the MNDA.",
    );
  });

  it("ignores the year count when the term is open-ended", () => {
    const values = sampleValues({
      mndaTermKind: "untilTerminated",
      mndaTermYears: "99",
    });
    expect(resolveMndaTerm(template, values)).not.toContain("99");
  });
});

describe("resolveConfidentialityTerm", () => {
  it("fills the year count and keeps the trade secret carve-out", () => {
    const values = sampleValues({ confidentialityYears: "3" });
    const resolved = resolveConfidentialityTerm(template, values);
    expect(resolved).toContain("3 years from Effective Date");
    expect(resolved).toContain("trade secret");
  });

  it("uses the perpetual wording when chosen", () => {
    const values = sampleValues({ confidentialityKind: "perpetual" });
    expect(resolveConfidentialityTerm(template, values)).toBe("In perpetuity.");
  });
});

describe("isComplete", () => {
  it("is true when every meaningful field is filled", () => {
    expect(isComplete(sampleValues())).toBe(true);
  });

  it("does not require modifications, names or titles", () => {
    const values = sampleValues({
      modifications: "",
      party1: { ...sampleValues().party1, name: "", title: "" },
    });
    expect(isComplete(values)).toBe(true);
  });

  it.each([
    ["purpose", { purpose: "  " }],
    ["effective date", { effectiveDate: "" }],
    ["governing law", { governingLaw: "" }],
    ["jurisdiction", { jurisdiction: "" }],
  ])("is false without a %s", (_label, patch) => {
    expect(isComplete(sampleValues(patch))).toBe(false);
  });

  it("is false without either company", () => {
    const base = sampleValues();
    expect(
      isComplete(sampleValues({ party1: { ...base.party1, company: "" } })),
    ).toBe(false);
    expect(
      isComplete(sampleValues({ party2: { ...base.party2, company: "" } })),
    ).toBe(false);
  });

  it("is false when a chosen fixed term has no year count", () => {
    expect(isComplete(sampleValues({ mndaTermYears: "" }))).toBe(false);
    expect(isComplete(sampleValues({ confidentialityYears: " " }))).toBe(false);
  });

  it("ignores a blank year count when that term is not in use", () => {
    const values = sampleValues({
      mndaTermKind: "untilTerminated",
      mndaTermYears: "",
      confidentialityKind: "perpetual",
      confidentialityYears: "",
    });
    expect(isComplete(values)).toBe(true);
  });
});
