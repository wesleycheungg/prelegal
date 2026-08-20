/**
 * Turns a parsed cover page into the typed fields the app fills in.
 *
 * `cover-page-template` reads the markdown's grammar — headings, hints,
 * choices, brackets. This module decides what each section *means*: whether it
 * is a date, a pick between the template's own sentences, a pair of labelled
 * lines, or free text. Everything downstream — the form, the chat, the preview,
 * the PDF — reads these specs rather than naming any document's fields, which
 * is what lets one set of components serve all eleven agreements.
 *
 * The dialect the classification relies on, all of it already Common Paper's:
 *
 * - `- [ ]` alternatives                       -> a choice between them
 * - `Label: [guidance]` lines, two or more     -> a group of labelled lines
 * - a lone `[placeholder]` mentioning a date   -> a date
 * - anything else                              -> free text
 *
 * A bracket is a suggested value the user can keep, except when it opens with
 * "Fill in", which marks it as guidance about what to write instead. That
 * distinction is Common Paper's own: the Mutual NDA offers
 * `[Evaluating whether to enter into a business relationship...]` as a real
 * default but `[Fill in state]` as an instruction.
 *
 * Pure and dependency-free, and mirrored by `backend/app/field_schema.py`. The
 * two are held together by `test/field-schemas.json`, which both test suites
 * assert against, so neither can drift without a red test.
 */

import {
  type CoverPageSection,
  type CoverPageTemplate,
  placeholderOf,
  placeholderUnit,
} from "./cover-page-template";

export interface ChoiceOption {
  /** The template's own sentence, with any `[placeholder]` left intact. */
  sentence: string;
  /** The unit after the number, e.g. `"year(s)"`, when the sentence takes one. */
  unit: string | null;
}

/** One `Label: [guidance]` line within a grouped field. */
export interface GroupLine {
  key: string;
  label: string;
  /** The bracketed guidance, shown in the input rather than entered into it. */
  placeholder: string;
}

interface FieldCommon {
  /** Wire name, from the heading. Stable across frontend and backend. */
  key: string;
  /** The heading as written, used as the caption and in the document. */
  label: string;
  hint: string | null;
  required: boolean;
}

export type FieldSpec =
  | (FieldCommon & {
      kind: "text";
      /** Suggested wording the user may keep, or `""`. */
      initial: string;
      /** Guidance shown in an empty input. */
      placeholder: string;
      multiline: boolean;
    })
  | (FieldCommon & { kind: "date" })
  | (FieldCommon & { kind: "choice"; options: ChoiceOption[] })
  | (FieldCommon & { kind: "group"; lines: GroupLine[] });

export interface DocumentSchema {
  title: string;
  intro: string;
  signingStatement: string;
  attribution: string;
  partyRoles: [string, string];
  fields: FieldSpec[];
}

/**
 * A heading as a wire name: `"Governing Law & Jurisdiction"` becomes
 * `"governing_law_jurisdiction"`.
 *
 * snake_case rather than kebab because these become attribute names on the
 * backend's generated Pydantic model, where a hyphen is not a legal identifier.
 */
export function slugify(heading: string): string {
  return heading
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

/** A `Label: [guidance]` line. */
const LABELLED_LINE = /^(.+?):\s*\[(.*)\]\s*$/;
/** Opens a bracket that instructs rather than suggests. */
const GUIDANCE = /^(fill in|describe|list )/i;
/**
 * A bracket asking for a date.
 *
 * Anchored to whole words: an unanchored `/date/` also matches "updates",
 * which would turn a text field into a date picker.
 */
const DATE_PLACEHOLDER = /\bdates?\b/i;
/** Beyond this, a suggested value reads as prose and wants room to edit. */
const MULTILINE_CHARS = 40;

function labelledLines(body: string): { label: string; placeholder: string }[] {
  return body
    .split("\n")
    .map((line) => LABELLED_LINE.exec(line.trim()))
    .filter((match): match is RegExpExecArray => match !== null)
    .map((match) => ({ label: match[1], placeholder: match[2] }));
}

function hintFor(section: CoverPageSection): string | null {
  if (section.hint) return section.hint;
  // Prose with nothing to fill in is guidance about the field, not part of it
  // — "List any modifications to the MNDA" reads as help text.
  if (section.body && !section.body.includes("[")) return section.body;
  return null;
}

function classify(section: CoverPageSection): FieldSpec {
  const key = slugify(section.heading);
  const common = {
    key,
    label: section.heading,
    hint: hintFor(section),
    required: section.required,
  };

  if (section.choices.length >= 2) {
    return {
      ...common,
      kind: "choice",
      options: section.choices.map((sentence) => ({
        sentence,
        // Only a bracket holding a number is something the user fills in; the
        // rest of the sentence is the template's wording and stays as written.
        unit: /\d/.test(placeholderOf(sentence) ?? "")
          ? placeholderUnit(sentence)
          : null,
      })),
    };
  }

  const lines = labelledLines(section.body);
  if (lines.length >= 2) {
    return {
      ...common,
      kind: "group",
      lines: lines.map((line) => ({
        key: slugify(line.label),
        label: line.label,
        placeholder: line.placeholder,
      })),
    };
  }

  const placeholder = placeholderOf(section.body) ?? "";
  if (placeholder && DATE_PLACEHOLDER.test(placeholder)) {
    return { ...common, kind: "date" };
  }

  const guidance = GUIDANCE.test(placeholder);
  return {
    ...common,
    kind: "text",
    initial: guidance ? "" : placeholder,
    placeholder: guidance ? placeholder : "",
    multiline: !placeholder || placeholder.length > MULTILINE_CHARS,
  };
}

/** Raised when a cover page cannot be turned into a usable set of fields. */
export class SchemaError extends Error {}

/**
 * The document's fields, in the order the cover page lists them.
 *
 * Throws rather than dropping anything: a cover page whose fields collide would
 * otherwise lose a value silently, and the place to find that out is the build,
 * not a signed agreement with a gap in it.
 */
export function parseDocumentSchema(
  template: CoverPageTemplate,
): DocumentSchema {
  const fields = Object.values(template.sections).map(classify);

  const seen = new Set<string>();
  for (const key of fields.flatMap(fieldKeys)) {
    if (seen.has(key)) {
      throw new SchemaError(
        `${template.title}: two fields both named "${key}". Rename one heading.`,
      );
    }
    seen.add(key);
  }

  return {
    title: template.title,
    intro: template.intro,
    signingStatement: template.signingStatement,
    attribution: template.attribution,
    partyRoles: template.partyRoles,
    fields,
  };
}

/** Wire names for a choice field: which sentence, and the number inside it. */
export const optionKey = (key: string) => `${key}_option`;
export const numberKey = (key: string) => `${key}_number`;

/**
 * Every wire name a field owns.
 *
 * One name for a text or date field, one per line for a group, and two for a
 * choice — which sentence, and the number that goes in it. The backend derives
 * exactly these, which is what the shared fixture pins.
 */
export function fieldKeys(field: FieldSpec): string[] {
  switch (field.kind) {
    case "choice":
      return [optionKey(field.key), numberKey(field.key)];
    case "group":
      return field.lines.map((line) => line.key);
    default:
      return [field.key];
  }
}
