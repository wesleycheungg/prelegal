/**
 * Reads the agreement templates from the repository's `templates/` directory.
 *
 * Server-only: this uses `node:fs` and runs when the page is prerendered, so the
 * markdown files stay the single source of truth instead of being copied into
 * the app. Import it from Server Components only.
 */

import { readFile } from "node:fs/promises";
import path from "node:path";

/** `templates/` sits beside `frontend/` at the repository root. */
const TEMPLATES_DIR = path.join(process.cwd(), "..", "templates");

export const TEMPLATE_FILE = {
  mutualNdaCoverPage: "mutual-nda-cover-page.md",
  mutualNda: "mutual-nda.md",
} as const;

export function readTemplate(filename: string): Promise<string> {
  return readFile(path.join(TEMPLATES_DIR, filename), "utf8");
}
