import { describe, expect, it } from "vitest";

import { prepareStandardTerms } from "./standard-terms";
import { loadFixtures } from "@/test/helpers";

describe("prepareStandardTerms", () => {
  it("drops the leading heading, since the document supplies its own", () => {
    expect(prepareStandardTerms("# Standard Terms\n\n1. Body.")).toBe(
      "1. Body.",
    );
  });

  it("only drops a heading at the very start", () => {
    const prepared = prepareStandardTerms("1. Body.\n\n# Later heading");
    expect(prepared).toContain("# Later heading");
  });

  it("leaves a document alone when it opens with prose", () => {
    expect(prepareStandardTerms("Just prose.")).toBe("Just prose.");
  });

  it("emphasises cover page cross-references", () => {
    expect(
      prepareStandardTerms('for the <span class="coverpage_link">Purpose</span>.'),
    ).toBe("for the **Purpose**.");
  });

  it("emphasises every cross-reference, not just the first", () => {
    const prepared = prepareStandardTerms(
      '<span class="coverpage_link">A</span> and <span class="coverpage_link">B</span>',
    );
    expect(prepared).toBe("**A** and **B**");
  });

  it("leaves no span markup behind in the real template", async () => {
    const { standardTerms } = await loadFixtures();
    expect(standardTerms).not.toContain("<span");
    expect(standardTerms).not.toContain("coverpage_link");
  });

  it("keeps all eleven clauses of the real template", async () => {
    const { standardTerms } = await loadFixtures();
    for (let clause = 1; clause <= 11; clause += 1) {
      expect(standardTerms, `clause ${clause}`).toContain(`${clause}. **`);
    }
  });

  it("keeps the Common Paper attribution required by the licence", async () => {
    const { standardTerms } = await loadFixtures();
    expect(standardTerms).toContain("CC BY 4.0");
  });
});
