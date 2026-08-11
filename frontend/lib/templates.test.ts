import { describe, expect, it } from "vitest";

import { TEMPLATE_FILE, readTemplate } from "./templates";

describe("readTemplate", () => {
  it("reads the Mutual NDA templates from the repository's templates/ directory", async () => {
    const coverPage = await readTemplate(TEMPLATE_FILE.mutualNdaCoverPage);
    const standardTerms = await readTemplate(TEMPLATE_FILE.mutualNda);

    expect(coverPage).toContain("# Mutual Non-Disclosure Agreement");
    expect(standardTerms).toContain("# Standard Terms");
  });

  it("rejects when a template is missing", async () => {
    await expect(readTemplate("no-such-template.md")).rejects.toThrow();
  });
});
