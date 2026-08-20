/** Shared fixtures and utilities for the test suite. */

import { inflateSync } from "node:zlib";

import type { ChatFields } from "@/lib/chat";
import type { DocumentValues } from "@/lib/document-values";
import {
  type DocumentDefinition,
  loadDocuments,
  readTemplate,
} from "@/lib/templates";

/**
 * Loads the real documents from `templates/`.
 *
 * Tests deliberately run against the actual files rather than inline fixtures:
 * the parser's whole job is to cope with these documents, and a fixture that
 * drifted from them would test nothing.
 */
export async function loadAllDocuments(): Promise<DocumentDefinition[]> {
  return loadDocuments();
}

/** One document by slug, for tests about a particular agreement. */
export async function loadDocument(slug: string): Promise<DocumentDefinition> {
  const documents = await loadDocuments();
  const found = documents.find((document) => document.slug === slug);
  if (!found) throw new Error(`No document '${slug}'`);
  return found;
}

/** A cover page's raw markdown, for the tests about parsing it. */
export function loadCoverPage(slug = "mutual-nda"): Promise<string> {
  return readTemplate(`${slug}-cover-page.md`);
}

/** The Mutual NDA, which most tests use because it is the one that shipped. */
export function loadFixtures(): Promise<DocumentDefinition> {
  return loadDocument("mutual-nda");
}

/**
 * A fully populated Mutual NDA, for tests that need every field present.
 *
 * Keyed by the field names `field-schema` derives, which is what the whole app
 * uses now — `mnda_term` rather than a `mndaTermKind` property.
 */
export function sampleValues(
  overrides: Partial<DocumentValues> = {},
): DocumentValues {
  return {
    fields: {
      purpose: "Evaluating a potential partnership.",
      effective_date: "2026-08-03",
      governing_law: "Delaware",
      jurisdiction: "courts located in New Castle, DE",
      mnda_modifications: "",
      ...overrides.fields,
    },
    choices: {
      mnda_term: { index: 0, number: "2" },
      term_of_confidentiality: { index: 0, number: "3" },
      ...overrides.choices,
    },
    party1: {
      name: "Ada Lovelace",
      title: "CEO",
      company: "Acme Inc.",
      noticeAddress: "legal@acme.example",
      ...overrides.party1,
    },
    party2: {
      name: "Alan Turing",
      title: "General Counsel",
      company: "Globex Ltd.",
      noticeAddress: "1 Globex Way\nLondon",
      ...overrides.party2,
    },
  };
}

/**
 * Pulls the visible text out of a PDF, one entry per page.
 *
 * react-pdf writes text as hex-encoded runs inside Flate-compressed content
 * streams, and gives each page exactly one such stream, so inflating them in
 * turn separates the pages. The streams appear in file order, which is not
 * page order — this says *which* page something landed on, never which number.
 */
export function extractPdfPages(pdf: Buffer): string[] {
  const pages: string[] = [];

  for (const match of pdf.toString("latin1").matchAll(/stream/g)) {
    let start = match.index + match[0].length;
    while (pdf[start] === 0x0d || pdf[start] === 0x0a) start += 1;

    const end = pdf.indexOf("endstream", start);
    if (end < 0) continue;

    let body: Buffer;
    try {
      body = inflateSync(pdf.subarray(start, end));
    } catch {
      continue; // Not a compressed stream (fonts, metadata).
    }

    const content = body.toString("latin1");
    if (!content.includes("TJ")) continue;

    // `[\s\S]` rather than the `s` flag, which needs a newer target than this
    // project compiles to.
    const runs = [...content.matchAll(/\[([\s\S]*?)\]\s*TJ/g)].map(
      ([, array]) =>
        [...array.matchAll(/<([0-9A-Fa-f]+)>/g)]
          .map(([, hex]) => Buffer.from(hex, "hex").toString("latin1"))
          .join(""),
    );

    if (runs.length) pages.push(decodeWinAnsi(runs.join(" ")));
  }

  return pages;
}

/**
 * The whole document's text. Good enough to assert on content; it says nothing
 * about layout.
 */
export function extractPdfText(pdf: Buffer): string {
  return extractPdfPages(pdf).join("\n");
}

/**
 * The WinAnsi code points that differ from Latin-1 (the punctuation the
 * templates actually use). Without this, curly quotes decode as control
 * characters and assertions on the prose fail for the wrong reason.
 */
const WIN_ANSI: Record<string, string> = {
  "\x85": "…",
  "\x91": "‘",
  "\x92": "’",
  "\x93": "“",
  "\x94": "”",
  "\x96": "–",
  "\x97": "—",
};

function decodeWinAnsi(text: string): string {
  return text.replace(/[\x85\x91-\x97]/g, (char) => WIN_ANSI[char] ?? char);
}

/** Counts `/Type /Page` entries, tolerating either spacing. */
export function countPdfPages(pdf: Buffer): number {
  return [...pdf.toString("latin1").matchAll(/\/Type\s*\/Page[^s]/g)].length;
}

/**
 * A turn that settled nothing.
 *
 * The wire shape is now a plain map, so an empty turn is an empty object —
 * there is no longer a field list to keep in step by hand.
 */
export function emptyChatFields(overrides: ChatFields = {}): ChatFields {
  return { ...overrides };
}
