import { describe, expect, it } from "vitest";

import { parseInline } from "./inline-markdown";

describe("parseInline", () => {
  it("returns a single run for plain text", () => {
    expect(parseInline("Just prose.")).toEqual([{ text: "Just prose." }]);
  });

  it("returns nothing for an empty string", () => {
    expect(parseInline("")).toEqual([]);
  });

  it("marks bold spans", () => {
    expect(parseInline("**MNDA**")).toEqual([{ text: "MNDA", bold: true }]);
  });

  it("captures link text and target", () => {
    expect(parseInline("[CC BY 4.0](https://example.com/licence)")).toEqual([
      { text: "CC BY 4.0", href: "https://example.com/licence" },
    ]);
  });

  it("keeps the text surrounding a token", () => {
    expect(parseInline('the ("**Cover Page**") above')).toEqual([
      { text: 'the ("' },
      { text: "Cover Page", bold: true },
      { text: '") above' },
    ]);
  });

  it("handles several tokens of mixed kinds in order", () => {
    expect(parseInline("**A** then [B](u) then **C**")).toEqual([
      { text: "A", bold: true },
      { text: " then " },
      { text: "B", href: "u" },
      { text: " then " },
      { text: "C", bold: true },
    ]);
  });

  it("handles adjacent tokens with no text between", () => {
    expect(parseInline("**A****B**")).toEqual([
      { text: "A", bold: true },
      { text: "B", bold: true },
    ]);
  });

  it("leaves an unclosed bold marker as literal text", () => {
    expect(parseInline("**not closed")).toEqual([{ text: "**not closed" }]);
  });

  it("leaves a bracket that is not a link as literal text", () => {
    expect(parseInline("see [Fill in state] here")).toEqual([
      { text: "see [Fill in state] here" },
    ]);
  });

  it("is not greedy across separate bold spans", () => {
    const runs = parseInline("**one** middle **two**");
    expect(runs.filter((run) => run.bold).map((run) => run.text)).toEqual([
      "one",
      "two",
    ]);
  });

  it("preserves the full text when runs are concatenated", () => {
    const source = "A **bold** and a [link](https://x.example) and a tail.";
    const rebuilt = parseInline(source)
      .map((run) => run.text)
      .join("");
    expect(rebuilt).toBe("A bold and a link and a tail.");
  });
});
