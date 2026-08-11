/**
 * Parser for `templates/mutual-nda-cover-page.md`.
 *
 * The Common Paper cover page is a fill-in-the-blanks document: headings mark
 * the fields, `<label>` tags describe them, `- [ ]` lines offer alternative
 * wordings, and `[bracketed text]` marks the parts a user replaces. Rather than
 * duplicating that prose in the app, we parse it out and let the template stay
 * the single source of truth for the legal wording.
 *
 * Pure and dependency-free so it can run at build time, in the browser, or in a
 * future backend without change.
 */

/** A `### Heading` block of the cover page. */
export interface CoverPageSection {
  /** Heading text, e.g. `"MNDA Term"`. */
  heading: string;
  /** The `<label>` hint beneath the heading, used as form help text. */
  hint: string | null;
  /** `- [ ]` alternatives in source order, with `[placeholders]` left intact. */
  choices: string[];
  /** Remaining prose, with hint and choice lines removed. */
  body: string;
}

export interface CoverPageTemplate {
  /** Document title, from the leading `#` heading. */
  title: string;
  /** The paragraph explaining what the MNDA consists of. Markdown. */
  intro: string;
  /** Sections keyed by heading. */
  sections: Record<string, CoverPageSection>;
  /** The "By signing this Cover Page..." sentence. */
  signingStatement: string;
  /** Common Paper's CC BY attribution line. Markdown. Required by the licence. */
  attribution: string;
}

/** Headings this app knows how to fill in. */
export const SECTION = {
  purpose: "Purpose",
  effectiveDate: "Effective Date",
  mndaTerm: "MNDA Term",
  confidentiality: "Term of Confidentiality",
  governingLaw: "Governing Law & Jurisdiction",
  modifications: "MNDA Modifications",
} as const;

const SIGNING_STATEMENT = /^By signing this Cover Page.*$/m;
const ATTRIBUTION = /^Common Paper Mutual Non-Disclosure Agreement.*$/m;
const LABEL = /^<label>(.*)<\/label>$/;
const CHOICE = /^-\s+\[[ xX]\]\s+(.*)$/;
const HEADING = /^(#{1,3})\s+(.*)$/;

/**
 * A `[bracketed]` fill-in marker.
 *
 * Markdown links (`[text](url)`) match this too, so only apply it to choices and
 * field bodies — never to `intro` or `attribution`, which contain links.
 */
const PLACEHOLDER = /\[([^\]]*)\]/;

/** Returns the text inside the first `[bracketed]` marker, if any. */
export function placeholderOf(text: string): string | null {
  return PLACEHOLDER.exec(text)?.[1] ?? null;
}

/**
 * Replaces the first `[bracketed]` marker with `value`. The replacement is
 * inserted literally — a `$` in user input is not a substitution pattern.
 */
export function fillPlaceholder(text: string, value: string): string {
  return text.replace(PLACEHOLDER, () => value);
}

/**
 * Splits text either side of its `[bracketed]` marker so the form can render an
 * input where the marker sits, keeping the sentence readable around it.
 */
export function splitAroundPlaceholder(text: string): [before: string, after: string] {
  const match = PLACEHOLDER.exec(text);
  if (!match) return [text, ""];
  return [text.slice(0, match.index), text.slice(match.index + match[0].length)];
}

/**
 * The unit trailing the number in a placeholder: `"1 year(s)"` gives
 * `"year(s)"`. Lets the form label a number input without restating the
 * template's wording.
 */
export function placeholderUnit(text: string): string {
  return (placeholderOf(text) ?? "").replace(/^\s*\d+\s*/, "");
}

export function parseCoverPageTemplate(markdown: string): CoverPageTemplate {
  const signingStatement = SIGNING_STATEMENT.exec(markdown)?.[0] ?? "";
  const attribution = ATTRIBUTION.exec(markdown)?.[0] ?? "";

  let title = "";
  const introLines: string[] = [];
  const sections: Record<string, CoverPageSection> = {};
  let current: CoverPageSection | null = null;
  const bodyLines: string[] = [];

  const flush = () => {
    if (current) {
      current.body = bodyLines.join("\n").trim();
      sections[current.heading] = current;
      bodyLines.length = 0;
    }
  };

  for (const line of markdown.split("\n")) {
    const heading = HEADING.exec(line);
    if (heading) {
      const [, hashes, text] = heading;
      if (hashes === "#") {
        title = text;
      } else if (hashes === "###") {
        flush();
        current = { heading: text, hint: null, choices: [], body: "" };
      }
      // `##` is the "USING THIS..." banner, which the intro paragraph follows.
      continue;
    }

    // The signature table, signing statement and attribution trail the last
    // section but are rendered separately, so they never belong to a body.
    // Both extracts may be empty, which must not match every blank line.
    if (
      line.startsWith("|") ||
      (signingStatement !== "" && line === signingStatement) ||
      (attribution !== "" && line === attribution)
    ) {
      continue;
    }

    if (!current) {
      introLines.push(line);
      continue;
    }

    const label = LABEL.exec(line.trim());
    if (label) {
      current.hint = label[1];
      continue;
    }

    const choice = CHOICE.exec(line.trim());
    if (choice) {
      current.choices.push(choice[1].trim());
      continue;
    }

    bodyLines.push(line);
  }
  flush();

  return {
    title,
    intro: introLines.join("\n").trim(),
    sections,
    signingStatement,
    attribution,
  };
}
