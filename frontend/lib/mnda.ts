/**
 * The data a user supplies, and the pure functions that turn it into the
 * wording that appears on the cover page.
 *
 * Everything here is pure and free of React and Node APIs: the same functions
 * back the live preview today and could back a server-side renderer later.
 */

import {
  type CoverPageTemplate,
  SECTION,
  fillPlaceholder,
  placeholderOf,
} from "./cover-page-template";

export type MndaTermKind = "fixed" | "untilTerminated";
export type ConfidentialityKind = "fixed" | "perpetual";

export interface Party {
  name: string;
  title: string;
  company: string;
  noticeAddress: string;
}

export interface MndaValues {
  purpose: string;
  /** ISO `yyyy-mm-dd`, or empty to leave blank for completion at signing. */
  effectiveDate: string;
  mndaTermKind: MndaTermKind;
  mndaTermYears: string;
  confidentialityKind: ConfidentialityKind;
  confidentialityYears: string;
  governingLaw: string;
  jurisdiction: string;
  modifications: string;
  party1: Party;
  party2: Party;
}

/** Index into a section's `choices`, matching the order in the template. */
const FIRST_CHOICE = 0;
const SECOND_CHOICE = 1;

const DEFAULT_YEARS = "1";

const emptyParty = (): Party => ({
  name: "",
  title: "",
  company: "",
  noticeAddress: "",
});

/**
 * Starting values. The default purpose comes from the template's own
 * placeholder so the suggested wording stays in one place.
 *
 * The effective date is deliberately blank: an unsigned agreement often leaves
 * it to be filled in at signing, and defaulting it to "today" would bake the
 * build date into a prerendered page.
 */
export function createDefaultValues(template: CoverPageTemplate): MndaValues {
  const purposeBody = template.sections[SECTION.purpose]?.body ?? "";

  return {
    purpose: placeholderOf(purposeBody) ?? "",
    effectiveDate: "",
    mndaTermKind: "fixed",
    mndaTermYears: DEFAULT_YEARS,
    confidentialityKind: "fixed",
    confidentialityYears: DEFAULT_YEARS,
    governingLaw: "",
    jurisdiction: "",
    modifications: "",
    party1: emptyParty(),
    party2: emptyParty(),
  };
}

/** Stands in for a value the user has not supplied, so it reads as a gap. */
const BLANK = "______";

/**
 * `"1"` becomes `"1 year"`, `"3"` becomes `"3 years"`.
 *
 * A cleared input yields a blank rather than an empty string, so the sentence
 * around it does not collapse into a double space.
 */
export function formatYears(years: string): string {
  const trimmed = years.trim();
  if (!trimmed) return BLANK;
  return `${trimmed} ${trimmed === "1" ? "year" : "years"}`;
}

/**
 * Formats an ISO date as e.g. `August 3, 2026`.
 *
 * Pinned to UTC and `en-US` so the server render and the browser render always
 * agree, and so a date never shifts by a day across time zones.
 */
export function formatEffectiveDate(iso: string): string {
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

function resolveChoice(
  template: CoverPageTemplate,
  heading: string,
  index: number,
  years?: string,
): string {
  const choice = template.sections[heading]?.choices[index] ?? "";
  return years === undefined ? choice : fillPlaceholder(choice, formatYears(years));
}

/** The MNDA Term wording implied by the user's selection. */
export function resolveMndaTerm(
  template: CoverPageTemplate,
  values: MndaValues,
): string {
  return values.mndaTermKind === "fixed"
    ? resolveChoice(template, SECTION.mndaTerm, FIRST_CHOICE, values.mndaTermYears)
    : resolveChoice(template, SECTION.mndaTerm, SECOND_CHOICE);
}

/** The Term of Confidentiality wording implied by the user's selection. */
export function resolveConfidentialityTerm(
  template: CoverPageTemplate,
  values: MndaValues,
): string {
  return values.confidentialityKind === "fixed"
    ? resolveChoice(
        template,
        SECTION.confidentiality,
        FIRST_CHOICE,
        values.confidentialityYears,
      )
    : resolveChoice(template, SECTION.confidentiality, SECOND_CHOICE);
}

/** True once every field that shapes the agreement's meaning has been filled. */
export function isComplete(values: MndaValues): boolean {
  const termsSet =
    (values.mndaTermKind !== "fixed" || values.mndaTermYears.trim() !== "") &&
    (values.confidentialityKind !== "fixed" ||
      values.confidentialityYears.trim() !== "");

  return Boolean(
    termsSet &&
      values.purpose.trim() &&
      values.effectiveDate &&
      values.governingLaw.trim() &&
      values.jurisdiction.trim() &&
      values.party1.company.trim() &&
      values.party2.company.trim(),
  );
}
