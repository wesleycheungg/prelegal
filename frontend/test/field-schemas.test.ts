/**
 * The contract between this app and the backend.
 *
 * Both derive each document's fields from the same cover page markdown, in two
 * languages. A key only one side knows is a value the assistant fills in and
 * the document never receives — silent, and in a signed agreement expensive. So
 * the derivation is written down once, in `field-schemas.json` at the
 * repository root, and asserted from both suites: this file, and
 * `backend/tests/test_field_schema.py`.
 *
 * Regenerate after changing a cover page or the derivation rules:
 *
 *     UPDATE_SCHEMAS=1 npm test -- field-schemas
 *
 * and read the diff before committing it. A change here is a change to what
 * the two ends promise each other.
 */

import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { fieldKeys } from "@/lib/field-schema";
import { loadDocuments } from "@/lib/templates";

const FIXTURE = path.join(process.cwd(), "..", "field-schemas.json");

async function derive() {
  const documents = await loadDocuments();

  return Object.fromEntries(
    documents.map((document) => [
      document.slug,
      {
        title: document.schema.title,
        party_roles: document.schema.partyRoles,
        fields: document.schema.fields.map((field) => ({
          key: field.key,
          kind: field.kind,
          label: field.label,
          required: field.required,
          wire_keys: fieldKeys(field),
          ...(field.kind === "choice"
            ? { units: field.options.map((option) => option.unit) }
            : {}),
        })),
      },
    ]),
  );
}

describe("field schemas", () => {
  it("match what the backend is told to expect", async () => {
    const derived = await derive();

    if (process.env.UPDATE_SCHEMAS) {
      await writeFile(FIXTURE, `${JSON.stringify(derived, null, 2)}\n`, "utf8");
    }

    const committed = JSON.parse(await readFile(FIXTURE, "utf8"));
    expect(derived).toEqual(committed);
  });

  it("covers every document in the catalog", async () => {
    const documents = await loadDocuments();
    expect(documents).toHaveLength(11);
    expect(documents.map((document) => document.slug)).toContain("mutual-nda");
  });
});
