import { describe, expect, it } from "vitest";

import { parseCoverPageTemplate } from "./cover-page-template";
import {
  SchemaError,
  fieldKeys,
  parseDocumentSchema,
  slugify,
} from "./field-schema";

const parse = (markdown: string) =>
  parseDocumentSchema(parseCoverPageTemplate(markdown));

const withField = (section: string) => parse(`# Test\n\n${section}\n`);

describe("slugify", () => {
  it("makes a wire name out of a heading", () => {
    expect(slugify("Governing Law & Jurisdiction")).toBe(
      "governing_law_jurisdiction",
    );
    expect(slugify("MNDA Term")).toBe("mnda_term");
  });

  it("does not leave separators at either end", () => {
    expect(slugify("  Fees!  ")).toBe("fees");
  });
});

describe("classifying a section", () => {
  it("reads two or more alternatives as a choice", () => {
    const [field] = withField(
      "### Term\n- [x]     Expires [1 year(s)] from Effective Date.\n" +
        "- [ ]     Continues until terminated.",
    ).fields;

    expect(field.kind).toBe("choice");
    if (field.kind !== "choice") return;
    expect(field.options[0].unit).toBe("year(s)");
    // The second sentence takes no number, so nothing is filled into it.
    expect(field.options[1].unit).toBeNull();
  });

  it("reads two or more labelled lines as a group", () => {
    const [field] = withField(
      "### Governing Law & Jurisdiction\nGoverning Law: [Fill in state]\n\n" +
        "Jurisdiction: [Fill in city]",
    ).fields;

    expect(field.kind).toBe("group");
    if (field.kind !== "group") return;
    expect(field.lines.map((line) => line.key)).toEqual([
      "governing_law",
      "jurisdiction",
    ]);
    expect(field.lines[0].placeholder).toBe("Fill in state");
  });

  it("reads a bracket asking for a date as a date", () => {
    expect(withField("### Effective Date\n[Today's date]").fields[0].kind).toBe(
      "date",
    );
  });

  it("does not mistake a word containing 'date' for a date", () => {
    // "updates" contains "date"; an unanchored match would pick a date input.
    const [field] = withField(
      "### Release Notes\n[Fill in which updates apply]",
    ).fields;

    expect(field.kind).toBe("text");
  });

  it("keeps a suggested value as the starting text", () => {
    const [field] = withField("### Fees\n[None]").fields;

    expect(field.kind).toBe("text");
    if (field.kind !== "text") return;
    expect(field.initial).toBe("None");
    expect(field.placeholder).toBe("");
  });

  it("treats a bracket that instructs as guidance rather than a value", () => {
    const [field] = withField("### Governing Law\n[Fill in state]").fields;

    expect(field.kind).toBe("text");
    if (field.kind !== "text") return;
    // Nothing is pre-filled: "Fill in state" is not something to sign.
    expect(field.initial).toBe("");
    expect(field.placeholder).toBe("Fill in state");
  });

  it("gives a long suggestion room to edit and a short one a single line", () => {
    const long = withField(
      "### Purpose\n[Evaluating whether to enter into a business relationship.]",
    ).fields[0];
    const short = withField("### Fees\n[None]").fields[0];

    expect(long.kind === "text" && long.multiline).toBe(true);
    expect(short.kind === "text" && short.multiline).toBe(false);
  });
});

describe("hints", () => {
  it("prefers the label tag", () => {
    const [field] = withField(
      "### Purpose\n<label>How it may be used</label>\n[Something]",
    ).fields;

    expect(field.hint).toBe("How it may be used");
  });

  it("falls back to prose with nothing to fill in", () => {
    const [field] = withField(
      "### MNDA Modifications\nList any modifications to the MNDA",
    ).fields;

    expect(field.hint).toBe("List any modifications to the MNDA");
  });

  it("never uses a bracketed body as a hint", () => {
    expect(withField("### Purpose\n[A suggestion]").fields[0].hint).toBeNull();
  });
});

describe("required and optional", () => {
  it("treats a field as required unless the template says otherwise", () => {
    expect(withField("### Purpose\n[Something]").fields[0].required).toBe(true);
  });

  it("reads the optional marker", () => {
    const [field] = withField("### Fees\n<optional/>\n[None]").fields;

    expect(field.required).toBe(false);
  });

  it("keeps the marker out of the body", () => {
    const [field] = withField("### Fees\n<optional/>\n[None]").fields;

    expect(field.kind === "text" && field.initial).toBe("None");
  });
});

describe("wire names", () => {
  it("gives a choice one name for the sentence and one for the number", () => {
    const [field] = withField(
      "### Term\n- [x] Expires [1 year(s)].\n- [ ] Forever.",
    ).fields;

    expect(fieldKeys(field)).toEqual(["term_option", "term_number"]);
  });

  it("gives a group one name per line", () => {
    const [field] = withField("### Law\nA: [x]\n\nB: [y]").fields;

    expect(fieldKeys(field)).toEqual(["a", "b"]);
  });
});

describe("collisions", () => {
  it("refuses a cover page whose fields would share a name", () => {
    // Silently dropping one would lose whatever the user put in it.
    expect(() => parse("# Test\n\n### Fees\n[a]\n\n### FEES\n[b]\n")).toThrow(
      SchemaError,
    );
  });

  it("refuses a heading with nothing to make a name from", () => {
    // The key becomes an attribute on the backend's generated model, where an
    // empty name is not something it can build at all.
    expect(() => withField("### ???\n[None]")).toThrow(SchemaError);
  });

  it("refuses a section offering only one alternative", () => {
    // Choice lines are taken out of the body, so a lone one would disappear
    // from the document rather than render as prose.
    expect(() => withField("### Term\n- [x] The only option.")).toThrow(SchemaError);
  });

  it("refuses a cover page that repeats a heading", () => {
    // Sections are keyed by heading, so the second would overwrite the first.
    expect(() => parse("# Test\n\n### Fees\n[a]\n\n### Fees\n[b]\n")).toThrow(
      /Two sections both headed/,
    );
  });
});
