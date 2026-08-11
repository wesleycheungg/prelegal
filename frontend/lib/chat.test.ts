import { describe, expect, it } from "vitest";

import {
  type ChatFields,
  applyFields,
  filledFieldNames,
  toChatFields,
} from "./chat";
import { sampleValues } from "@/test/helpers";

/** A turn that settled nothing, to be overridden one field at a time. */
const nothing = (): ChatFields => ({
  purpose: null,
  effective_date: null,
  mnda_term_kind: null,
  mnda_term_years: null,
  confidentiality_kind: null,
  confidentiality_years: null,
  governing_law: null,
  jurisdiction: null,
  modifications: null,
  party1_company: null,
  party1_name: null,
  party1_title: null,
  party1_notice_address: null,
  party2_company: null,
  party2_name: null,
  party2_title: null,
  party2_notice_address: null,
});

describe("toChatFields", () => {
  it("sends what the user has already given", () => {
    const fields = toChatFields(sampleValues());

    expect(fields.party1_company).toBe("Acme Inc.");
    expect(fields.governing_law).toBe("Delaware");
    expect(fields.mnda_term_kind).toBe("fixed");
  });

  it("reports an unanswered field as nothing rather than as empty", () => {
    // The assistant is told a null is a question still to ask. An empty string
    // would read as settled, and it would stop asking.
    const fields = toChatFields(sampleValues({ modifications: "" }));

    expect(fields.modifications).toBeNull();
  });
});

describe("applyFields", () => {
  it("writes in what the turn settled", () => {
    const values = applyFields(
      sampleValues({ governingLaw: "" }),
      { ...nothing(), governing_law: "Delaware" },
    );

    expect(values.governingLaw).toBe("Delaware");
  });

  it("leaves everything the turn said nothing about", () => {
    const before = sampleValues();

    const after = applyFields(before, { ...nothing(), purpose: "A new purpose." });

    expect(after.purpose).toBe("A new purpose.");
    expect(after.governingLaw).toBe(before.governingLaw);
    expect(after.party1).toEqual(before.party1);
  });

  it("keeps the rest of a party when one of its details arrives", () => {
    // The regression this guards: a party is an object, and merging it whole
    // would wipe the name and title to set the company.
    const before = sampleValues();

    const after = applyFields(before, { ...nothing(), party1_company: "Initech" });

    expect(after.party1.company).toBe("Initech");
    expect(after.party1.name).toBe(before.party1.name);
    expect(after.party1.title).toBe(before.party1.title);
    expect(after.party1.noticeAddress).toBe(before.party1.noticeAddress);
  });

  it("does not touch the other party", () => {
    const before = sampleValues();

    const after = applyFields(before, { ...nothing(), party1_company: "Initech" });

    expect(after.party2).toEqual(before.party2);
  });

  it.each([
    ["-3", "3"],
    ["1.5", "15"],
    ["0", ""],
    ["two", ""],
  ])("reduces a term of %s years to %s", (given, expected) => {
    // The backend sanitises too. This is the last gate before the value reaches
    // the document, and "Expires -3 years from Effective Date." is not signable.
    const values = applyFields(sampleValues(), {
      ...nothing(),
      mnda_term_years: given,
    });

    expect(values.mndaTermYears).toBe(expected);
  });

  it("accepts a term the assistant chose from the template", () => {
    const values = applyFields(sampleValues(), {
      ...nothing(),
      mnda_term_kind: "untilTerminated",
    });

    expect(values.mndaTermKind).toBe("untilTerminated");
  });
});

describe("filledFieldNames", () => {
  it("names what was filled in", () => {
    const names = filledFieldNames({
      ...nothing(),
      governing_law: "Delaware",
      party1_company: "Acme Inc.",
    });

    expect(names).toEqual(["Governing Law", "Party 1 Company"]);
  });

  it("names a term once, though it is two fields", () => {
    const names = filledFieldNames({
      ...nothing(),
      mnda_term_kind: "fixed",
      mnda_term_years: "2",
    });

    expect(names).toEqual(["MNDA Term"]);
  });

  it("says nothing when a turn settled nothing", () => {
    expect(filledFieldNames(nothing())).toEqual([]);
  });
});
