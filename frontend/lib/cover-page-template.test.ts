import { beforeAll, describe, expect, it } from "vitest";

import {
  type CoverPageTemplate,
  fillPlaceholder,
  parseCoverPageTemplate,
  placeholderOf,
  placeholderUnit,
  splitAroundPlaceholder,
} from "./cover-page-template";
import { loadCoverPage } from "@/test/helpers";

describe("placeholder helpers", () => {
  it("reads the text inside the first marker", () => {
    expect(placeholderOf("Governing Law: [Fill in state]")).toBe(
      "Fill in state",
    );
  });

  it("returns null when there is no marker", () => {
    expect(placeholderOf("In perpetuity.")).toBeNull();
  });

  it("replaces only the first marker", () => {
    expect(fillPlaceholder("[a] and [b]", "X")).toBe("X and [b]");
  });

  it("inserts the replacement literally, not as a substitution pattern", () => {
    // `$&` would otherwise expand to the whole match.
    expect(fillPlaceholder("Expires [1 year(s)] later", "$& $1 $$")).toBe(
      "Expires $& $1 $$ later",
    );
  });

  it("splits around the marker", () => {
    expect(splitAroundPlaceholder("Expires [1 year(s)] from then.")).toEqual([
      "Expires ",
      " from then.",
    ]);
  });

  it("puts everything before the split when there is no marker", () => {
    expect(splitAroundPlaceholder("In perpetuity.")).toEqual([
      "In perpetuity.",
      "",
    ]);
  });

  it("strips the leading number from a placeholder to leave the unit", () => {
    expect(placeholderUnit("Expires [1 year(s)] later")).toBe("year(s)");
  });

  it("returns an empty unit when there is no marker", () => {
    expect(placeholderUnit("In perpetuity.")).toBe("");
  });
});

describe("parseCoverPageTemplate", () => {
  let template: CoverPageTemplate;

  beforeAll(async () => {
    template = parseCoverPageTemplate(await loadCoverPage());
  });

  it("reads the document title", () => {
    expect(template.title).toBe("Mutual Non-Disclosure Agreement");
  });

  it("captures the intro paragraph without its headings", () => {
    expect(template.intro).toContain("consists of");
    expect(template.intro).not.toContain("#");
    expect(template.intro).not.toContain("USING THIS");
  });

  it("finds every section of the cover page", () => {
    expect(Object.keys(template.sections)).toEqual([
      "Purpose",
      "Effective Date",
      "MNDA Term",
      "Term of Confidentiality",
      "Governing Law & Jurisdiction",
      "MNDA Modifications",
    ]);
  });

  it("reads the party names from the signature table", () => {
    expect(template.partyRoles).toEqual(["PARTY 1", "PARTY 2"]);
  });

  it("marks a section carrying the optional marker", () => {
    expect(template.sections["MNDA Modifications"].required).toBe(false);
    expect(template.sections["Purpose"].required).toBe(true);
  });

  it("reads the <label> hints as help text", () => {
    expect(template.sections["Purpose"].hint).toBe(
      "How Confidential Information may be used",
    );
    expect(template.sections["MNDA Term"].hint).toBe("The length of this MNDA");
  });

  it("leaves hint markup out of the section body", () => {
    for (const section of Object.values(template.sections)) {
      expect(section.body).not.toContain("<label>");
    }
  });

  it("collects the two term choices with their placeholders intact", () => {
    const { choices } = template.sections["MNDA Term"];
    expect(choices).toHaveLength(2);
    expect(choices[0]).toBe("Expires [1 year(s)] from Effective Date.");
    expect(choices[1]).toBe(
      "Continues until terminated in accordance with the terms of the MNDA.",
    );
  });

  it("collects the confidentiality choices", () => {
    const { choices } = template.sections["Term of Confidentiality"];
    expect(choices).toHaveLength(2);
    expect(choices[0]).toContain("[1 year(s)]");
    expect(choices[1]).toBe("In perpetuity.");
  });

  it("keeps checkbox lines out of section bodies", () => {
    expect(template.sections["MNDA Term"].body).toBe("");
  });

  it("keeps the suggested purpose in the body as a placeholder", () => {
    expect(placeholderOf(template.sections["Purpose"].body)).toBe(
      "Evaluating whether to enter into a business relationship with the other party.",
    );
  });

  it("keeps both labelled lines of the governing law section", () => {
    const { body } = template.sections["Governing Law & Jurisdiction"];
    expect(body).toContain("Governing Law: [Fill in state]");
    expect(body).toContain("Jurisdiction: [Fill in city or county and state");
  });

  it("extracts the signing statement", () => {
    expect(template.signingStatement).toBe(
      "By signing this Cover Page, each party agrees to enter into this MNDA as of the Effective Date.",
    );
  });

  it("extracts the Common Paper attribution required by the licence", () => {
    expect(template.attribution).toContain("Common Paper");
    expect(template.attribution).toContain("CC BY 4.0");
  });

  it("keeps the signature table out of the section bodies", () => {
    for (const section of Object.values(template.sections)) {
      expect(section.body).not.toContain("|");
      expect(section.body).not.toContain("PARTY 1");
    }
  });

  it("keeps the signing statement and attribution out of section bodies", () => {
    for (const section of Object.values(template.sections)) {
      expect(section.body).not.toContain("By signing this Cover Page");
      expect(section.body).not.toContain("free to use under");
    }
  });
});

describe("parseCoverPageTemplate edge cases", () => {
  it("does not treat a document without a signing statement as all-blank", () => {
    // Regression: an empty extract must not compare equal to every blank line,
    // which would silently strip the blank lines out of every body.
    const parsed = parseCoverPageTemplate(
      ["# Title", "", "### Notes", "", "first", "", "second", ""].join("\n"),
    );

    expect(parsed.signingStatement).toBe("");
    expect(parsed.attribution).toBe("");
    expect(parsed.sections.Notes.body).toBe("first\n\nsecond");
  });

  it("ignores headings deeper than three levels", () => {
    const parsed = parseCoverPageTemplate(
      "# T\n\n### Real\n\n#### Not a section\n",
    );
    expect(Object.keys(parsed.sections)).toEqual(["Real"]);
    expect(parsed.sections.Real.body).toContain("#### Not a section");
  });

  it("returns empty structures for an empty document", () => {
    const parsed = parseCoverPageTemplate("");
    expect(parsed.title).toBe("");
    expect(parsed.intro).toBe("");
    expect(parsed.sections).toEqual({});
  });

  it("records a section with no content", () => {
    const parsed = parseCoverPageTemplate("### Empty\n");
    expect(parsed.sections.Empty).toEqual({
      heading: "Empty",
      hint: null,
      choices: [],
      body: "",
      required: true,
    });
  });

  it("treats a checked and an unchecked box the same way", () => {
    const parsed = parseCoverPageTemplate("### Pick\n- [x] One\n- [ ] Two\n");
    expect(parsed.sections.Pick.choices).toEqual(["One", "Two"]);
  });
});
