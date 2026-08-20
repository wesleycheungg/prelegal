import { describe, expect, it } from "vitest";

import { loadDocuments, readTemplate } from "./templates";

describe("readTemplate", () => {
  it("reads a template from the repository's templates/ directory", async () => {
    const coverPage = await readTemplate("mutual-nda-cover-page.md");
    const standardTerms = await readTemplate("mutual-nda.md");

    expect(coverPage).toContain("# Mutual Non-Disclosure Agreement");
    expect(standardTerms).toContain("# Standard Terms");
  });

  it("rejects when a template is missing", async () => {
    await expect(readTemplate("no-such-template.md")).rejects.toThrow();
  });
});

describe("loadDocuments", () => {
  it("finds every agreement in the catalog", async () => {
    const documents = await loadDocuments();

    expect(documents).toHaveLength(11);
    expect(documents.map((document) => document.slug)).toEqual(
      expect.arrayContaining([
        "mutual-nda",
        "cloud-service-agreement",
        "pilot-agreement",
        "ai-addendum",
      ]),
    );
  });

  it("pairs a cover page with the standard terms of the same name", async () => {
    const documents = await loadDocuments();
    const nda = documents.find((document) => document.slug === "mutual-nda")!;

    expect(nda.schema.title).toBe("Mutual Non-Disclosure Agreement");
    // The terms, not the cover page: this is what renders below the fields.
    expect(nda.standardTerms).toContain("Confidential Information");
    expect(nda.standardTerms).not.toContain("# Standard Terms");
  });

  it("describes each document from the catalog, for the assistant to match on", async () => {
    const documents = await loadDocuments();

    for (const document of documents) {
      expect(document.description.length).toBeGreaterThan(20);
    }
  });

  it("gives every document a usable set of fields", async () => {
    const documents = await loadDocuments();

    for (const document of documents) {
      expect(document.schema.fields.length).toBeGreaterThan(0);
      expect(document.schema.partyRoles).toHaveLength(2);
    }
  });
});
