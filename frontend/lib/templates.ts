/**
 * Reads the agreement templates from the repository's `templates/` directory.
 *
 * Server-only: this uses `node:fs` and runs when the page is prerendered, so the
 * markdown files stay the single source of truth instead of being copied into
 * the app. Import it from Server Components only.
 */

import { readFile } from "node:fs/promises";
import path from "node:path";

import { parseCoverPageTemplate } from "./cover-page-template";
import { type DocumentSchema, parseDocumentSchema } from "./field-schema";
import { prepareStandardTerms } from "./standard-terms";

/** `templates/` and `catalog.json` sit beside `frontend/` at the repo root. */
const REPO_ROOT = path.join(process.cwd(), "..");
const TEMPLATES_DIR = path.join(REPO_ROOT, "templates");

/** Marks a template as the fillable front half of a document. */
const COVER_PAGE_SUFFIX = "-cover-page";

export function readTemplate(filename: string): Promise<string> {
  return readFile(path.join(TEMPLATES_DIR, filename), "utf8");
}

interface CatalogEntry {
  name: string;
  description: string;
  filename: string;
}

/** One agreement a user can create: its cover page, its terms, and its blurb. */
export interface DocumentDefinition {
  /** Addressed by the standard terms' filename, e.g. `"mutual-nda"`. */
  slug: string;
  /** What it is for, from the catalog. Shown to the user and to the assistant. */
  description: string;
  schema: DocumentSchema;
  /** The Standard Terms, prepared for rendering. */
  standardTerms: string;
}

async function readCatalog(): Promise<CatalogEntry[]> {
  const json = await readFile(path.join(REPO_ROOT, "catalog.json"), "utf8");
  return (JSON.parse(json) as { templates: CatalogEntry[] }).templates;
}

const slugOf = (entry: CatalogEntry) =>
  path.basename(entry.filename).replace(/\.md$/, "");

/**
 * Every document the app can create, in catalog order.
 *
 * A document is a cover page paired with the Standard Terms of the same name —
 * `mutual-nda-cover-page.md` with `mutual-nda.md` — which is the convention
 * Common Paper's own two-part agreements already follow. A cover page with no
 * matching terms is a mistake worth failing the build over rather than a
 * document to offer half of.
 */
export async function loadDocuments(): Promise<DocumentDefinition[]> {
  const entries = await readCatalog();
  const bySlug = new Map(entries.map((entry) => [slugOf(entry), entry]));

  const coverPages = entries.filter((entry) =>
    slugOf(entry).endsWith(COVER_PAGE_SUFFIX),
  );

  return Promise.all(
    coverPages.map(async (coverPage) => {
      const slug = slugOf(coverPage).slice(0, -COVER_PAGE_SUFFIX.length);
      const terms = bySlug.get(slug);
      if (!terms) {
        throw new Error(
          `${coverPage.filename} has no matching ${slug}.md in catalog.json`,
        );
      }

      const [coverPageMarkdown, termsMarkdown] = await Promise.all([
        readTemplate(path.basename(coverPage.filename)),
        readTemplate(path.basename(terms.filename)),
      ]);

      return {
        slug,
        // The Standard Terms' catalog entry describes the agreement; the cover
        // page's describes the form. The name comes from the cover page's own
        // title, which is what the finished document is called.
        description: terms.description,
        schema: parseDocumentSchema(parseCoverPageTemplate(coverPageMarkdown)),
        standardTerms: prepareStandardTerms(termsMarkdown),
      };
    }),
  );
}
