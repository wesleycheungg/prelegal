/**
 * The data a user supplies, and the pure functions that turn it into the
 * wording that appears on a cover page.
 *
 * Values are keyed by the field names in `field-schema` rather than named one
 * by one, because eleven documents have eleven different field sets and a typed
 * property per field would mean eleven of these files. The cost is real and
 * worth naming: `values.fields.purpose` is a map lookup, so a mistyped key is
 * caught by a test rather than by the compiler. `test/field-schemas.json` is
 * that test — it pins every key of every document.
 *
 * Everything here is pure and free of React and Node APIs: the same functions
 * back the live preview today and could back a server-side renderer later.
 */

import type { AgreementLine } from "./agreement";
import { fillPlaceholder } from "./cover-page-template";
import type { DocumentSchema, FieldSpec } from "./field-schema";

export interface Party {
  name: string;
  title: string;
  company: string;
  noticeAddress: string;
}

/** Which of a choice field's options is selected, and its number if it takes one. */
export interface ChoiceValue {
  index: number;
  number: string;
}

export interface DocumentValues {
  /** Text, date and grouped-line values, by field key. */
  fields: Record<string, string>;
  /** Choice selections, by field key. */
  choices: Record<string, ChoiceValue>;
  party1: Party;
  party2: Party;
}

const emptyParty = (): Party => ({
  name: "",
  title: "",
  company: "",
  noticeAddress: "",
});

/**
 * Starting values.
 *
 * Suggested wordings come from the template's own brackets so they stay in one
 * place. Dates are deliberately blank: an unsigned agreement often leaves the
 * effective date to be filled in at signing, and defaulting it to "today" would
 * bake the build date into a prerendered page.
 */
export function createDefaultValues(schema: DocumentSchema): DocumentValues {
  const fields: Record<string, string> = {};
  const choices: Record<string, ChoiceValue> = {};

  for (const field of schema.fields) {
    switch (field.kind) {
      case "text":
        fields[field.key] = field.initial;
        break;
      case "date":
        fields[field.key] = "";
        break;
      case "group":
        for (const line of field.lines) fields[line.key] = "";
        break;
      case "choice":
        choices[field.key] = {
          index: 0,
          number: sanitizeNumber(field.options[0]?.sentence ?? ""),
        };
        break;
    }
  }

  return { fields, choices, party1: emptyParty(), party2: emptyParty() };
}

/** Stands in for a value the user has not supplied, so it reads as a gap. */
const BLANK = "______";

/**
 * Constrains a count to a whole number.
 *
 * A number input's `min` is not enforced for typed input, and whatever it holds
 * flows straight into the agreement's wording — "Expires -3 years from Effective
 * Date." is not a term anyone can sign. Leading zeros go too, so a lone "0"
 * becomes empty and renders as a blank to fill in rather than a void term.
 */
export function sanitizeYears(input: string): string {
  return input.replace(/\D/g, "").replace(/^0+/, "");
}

/** The digits of a sentence's placeholder, e.g. `"[1 year(s)]"` gives `"1"`. */
function sanitizeNumber(sentence: string): string {
  return sanitizeYears(/\[([^\]]*)\]/.exec(sentence)?.[1] ?? "");
}

/**
 * `"1"` becomes `"1 year"`, `"3"` becomes `"3 years"`.
 *
 * A cleared input yields a blank rather than an empty string, so the sentence
 * around it does not collapse into a double space. The unit is the template's
 * own — `"year(s)"` singularises to `"year"`, anything else is left alone,
 * because guessing a plural for wording we did not write would be inventing it.
 */
export function formatCount(count: string, unit: string): string {
  const trimmed = count.trim();
  if (!trimmed) return BLANK;
  if (!unit) return trimmed;

  const singular = unit.replace(/\(s\)$/, "");
  const plural = unit.endsWith("(s)") ? `${singular}s` : unit;
  return `${trimmed} ${trimmed === "1" ? singular : plural}`;
}

/**
 * Formats an ISO date as e.g. `August 3, 2026`.
 *
 * Pinned to UTC and `en-US` so the server render and the browser render always
 * agree, and so a date never shifts by a day across time zones.
 */
export function formatDate(iso: string): string {
  if (!iso) return "";
  const date = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  }).format(date);
}

/** The selected option of a choice field, falling back to the first. */
export function selectedOption(field: FieldSpec, values: DocumentValues) {
  if (field.kind !== "choice") return null;
  const chosen = values.choices[field.key]?.index ?? 0;
  return field.options[chosen] ?? field.options[0] ?? null;
}

/**
 * What a field contributes to the document.
 *
 * Choice fields resolve to the template's own sentence with a number dropped
 * into its bracket — the app never writes the sentence, it only picks which of
 * the template's it is.
 */
export function resolveField(
  field: FieldSpec,
  values: DocumentValues,
): AgreementLine[] {
  switch (field.kind) {
    case "text": {
      const value = values.fields[field.key] ?? "";
      // An optional field left empty says so, rather than leaving a rule to
      // sign around something nobody meant to add.
      if (!value.trim() && !field.required) return [{ value: "None." }];
      return [{ value }];
    }

    case "date":
      return [{ value: formatDate(values.fields[field.key] ?? "") }];

    case "choice": {
      const option = selectedOption(field, values);
      if (!option) return [{ value: "" }];
      if (!option.unit) return [{ value: option.sentence }];

      const count = values.choices[field.key]?.number ?? "";
      return [
        {
          value: fillPlaceholder(
            option.sentence,
            formatCount(count, option.unit),
          ),
        },
      ];
    }

    case "group":
      return field.lines.map((line) => ({
        label: line.label,
        value: values.fields[line.key] ?? "",
      }));
  }
}

/** True once every field that shapes the agreement's meaning has been filled. */
export function isComplete(
  schema: DocumentSchema,
  values: DocumentValues,
): boolean {
  const filled = (field: FieldSpec): boolean => {
    switch (field.kind) {
      case "choice": {
        const option = selectedOption(field, values);
        if (!option?.unit) return true;
        return (values.choices[field.key]?.number ?? "").trim() !== "";
      }
      case "group":
        return field.lines.every((line) =>
          (values.fields[line.key] ?? "").trim(),
        );
      default:
        return (values.fields[field.key] ?? "").trim() !== "";
    }
  };

  return (
    schema.fields.filter((field) => field.required).every(filled) &&
    values.party1.company.trim() !== "" &&
    values.party2.company.trim() !== ""
  );
}
