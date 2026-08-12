/** Shared fixtures and utilities for the test suite. */

import { inflateSync } from "node:zlib";

import {
  type CoverPageTemplate,
  parseCoverPageTemplate,
} from "@/lib/cover-page-template";
import type { ChatFields } from "@/lib/chat";
import type { MndaValues } from "@/lib/mnda";
import { prepareStandardTerms } from "@/lib/standard-terms";
import { TEMPLATE_FILE, readTemplate } from "@/lib/templates";

/**
 * Loads the real templates from `templates/`.
 *
 * Tests deliberately run against the actual files rather than inline fixtures:
 * the parser's whole job is to cope with these documents, and a fixture that
 * drifted from them would test nothing.
 */
export async function loadFixtures(): Promise<{
  template: CoverPageTemplate;
  standardTerms: string;
  coverPageMarkdown: string;
}> {
  const [coverPageMarkdown, standardTermsMarkdown] = await Promise.all([
    readTemplate(TEMPLATE_FILE.mutualNdaCoverPage),
    readTemplate(TEMPLATE_FILE.mutualNda),
  ]);

  return {
    template: parseCoverPageTemplate(coverPageMarkdown),
    standardTerms: prepareStandardTerms(standardTermsMarkdown),
    coverPageMarkdown,
  };
}

/** A fully populated agreement, for tests that need every field present. */
export function sampleValues(overrides: Partial<MndaValues> = {}): MndaValues {
  return {
    purpose: "Evaluating a potential partnership.",
    effectiveDate: "2026-08-03",
    mndaTermKind: "fixed",
    mndaTermYears: "2",
    confidentialityKind: "fixed",
    confidentialityYears: "3",
    governingLaw: "Delaware",
    jurisdiction: "courts located in New Castle, DE",
    modifications: "",
    party1: {
      name: "Ada Lovelace",
      title: "CEO",
      company: "Acme Inc.",
      noticeAddress: "legal@acme.example",
    },
    party2: {
      name: "Alan Turing",
      title: "General Counsel",
      company: "Globex Ltd.",
      noticeAddress: "1 Globex Way\nLondon",
    },
    ...overrides,
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
    const runs = [...content.matchAll(/\[([\s\S]*?)\]\s*TJ/g)].map(([, array]) =>
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
  "\x85": "\u2026",
  "\x91": "\u2018",
  "\x92": "\u2019",
  "\x93": "\u201c",
  "\x94": "\u201d",
  "\x96": "\u2013",
  "\x97": "\u2014",
};

function decodeWinAnsi(text: string): string {
  return text.replace(/[\x85\x91-\x97]/g, (char) => WIN_ANSI[char] ?? char);
}

/** Counts `/Type /Page` entries, tolerating either spacing. */
export function countPdfPages(pdf: Buffer): number {
  return [...pdf.toString("latin1").matchAll(/\/Type\s*\/Page[^s]/g)].length;
}

/**
 * A turn that settled nothing, to be overridden one field at a time.
 *
 * Shared because it is the full field list written out, and two copies of that
 * would be two things to keep in step with the backend's own schema.
 */
export function emptyChatFields(overrides: Partial<ChatFields> = {}): ChatFields {
  return {
    purpose: null,
    effective_date: null,
    mnda_term_kind: null,
    mnda_term_years: null,
    confidentiality_kind: null,
    confidentiality_years: null,
    governing_law: null,
    jurisdiction: null,
    modifications: null,
    party1_company: null,
    party1_name: null,
    party1_title: null,
    party1_notice_address: null,
    party2_company: null,
    party2_name: null,
    party2_title: null,
    party2_notice_address: null,
    ...overrides,
  };
}
