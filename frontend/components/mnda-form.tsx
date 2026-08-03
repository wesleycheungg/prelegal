"use client";

import { type ReactNode, useId } from "react";

import {
  type CoverPageSection,
  type CoverPageTemplate,
  SECTION,
  placeholderOf,
  placeholderUnit,
  splitAroundPlaceholder,
} from "@/lib/cover-page-template";
import { type MndaValues, type Party, sanitizeYears } from "@/lib/mnda";

const inputClass =
  "w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-xs placeholder:text-slate-400 focus:border-slate-900 focus:outline-none";

interface MndaFormProps {
  template: CoverPageTemplate;
  values: MndaValues;
  onChange: (patch: Partial<MndaValues>) => void;
}

export function MndaForm({ template, values, onChange }: MndaFormProps) {
  const section = (heading: string) => template.sections[heading];
  const governingLaw = section(SECTION.governingLaw);

  return (
    <form className="space-y-8" onSubmit={(event) => event.preventDefault()}>
      <Group title="Agreement">
        <TextField
          label={SECTION.purpose}
          hint={section(SECTION.purpose)?.hint}
          value={values.purpose}
          onChange={(purpose) => onChange({ purpose })}
          multiline
        />

        <DateField
          label={SECTION.effectiveDate}
          value={values.effectiveDate}
          onChange={(effectiveDate) => onChange({ effectiveDate })}
        />

        <TermField
          section={section(SECTION.mndaTerm)}
          usesPlaceholder={values.mndaTermKind === "fixed"}
          years={values.mndaTermYears}
          onSelect={(usesPlaceholder) =>
            onChange({ mndaTermKind: usesPlaceholder ? "fixed" : "untilTerminated" })
          }
          onYearsChange={(mndaTermYears) => onChange({ mndaTermYears })}
        />

        <TermField
          section={section(SECTION.confidentiality)}
          usesPlaceholder={values.confidentialityKind === "fixed"}
          years={values.confidentialityYears}
          onSelect={(usesPlaceholder) =>
            onChange({
              confidentialityKind: usesPlaceholder ? "fixed" : "perpetual",
            })
          }
          onYearsChange={(confidentialityYears) =>
            onChange({ confidentialityYears })
          }
        />

        <TextField
          label="Governing Law"
          placeholder={hintFor(governingLaw, "Governing Law:")}
          value={values.governingLaw}
          onChange={(law) => onChange({ governingLaw: law })}
        />

        <TextField
          label="Jurisdiction"
          placeholder={hintFor(governingLaw, "Jurisdiction:")}
          value={values.jurisdiction}
          onChange={(jurisdiction) => onChange({ jurisdiction })}
        />

        <TextField
          label={SECTION.modifications}
          hint={section(SECTION.modifications)?.body}
          value={values.modifications}
          onChange={(modifications) => onChange({ modifications })}
          multiline
        />
      </Group>

      <PartyGroup
        title="Party 1"
        party={values.party1}
        onChange={(patch) => onChange({ party1: { ...values.party1, ...patch } })}
      />

      <PartyGroup
        title="Party 2"
        party={values.party2}
        onChange={(patch) => onChange({ party2: { ...values.party2, ...patch } })}
      />
    </form>
  );
}

/**
 * Pulls the `[bracketed]` guidance off a labelled line of a section body, e.g.
 * `"Governing Law: [Fill in state]"`, for use as an input placeholder.
 */
function hintFor(section: CoverPageSection | undefined, prefix: string): string {
  const line = section?.body
    .split("\n")
    .find((candidate) => candidate.trim().startsWith(prefix));
  return (line && placeholderOf(line)) ?? "";
}

function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <fieldset className="space-y-5">
      <legend className="mb-4 w-full border-b border-slate-200 pb-2 text-sm font-semibold tracking-wide text-slate-900 uppercase">
        {title}
      </legend>
      {children}
    </fieldset>
  );
}

function PartyGroup({
  title,
  party,
  onChange,
}: {
  title: string;
  party: Party;
  onChange: (patch: Partial<Party>) => void;
}) {
  return (
    <Group title={title}>
      <TextField
        label="Company"
        value={party.company}
        onChange={(company) => onChange({ company })}
      />
      <TextField
        label="Print Name"
        value={party.name}
        onChange={(name) => onChange({ name })}
      />
      <TextField
        label="Title"
        value={party.title}
        onChange={(value) => onChange({ title: value })}
      />
      <TextField
        label="Notice Address"
        hint="Use either email or postal address"
        value={party.noticeAddress}
        onChange={(noticeAddress) => onChange({ noticeAddress })}
        multiline
      />
    </Group>
  );
}

/**
 * A field's caption. Renders as a `<legend>` for the radio groups, which caption
 * a fieldset rather than a single control, so both share one set of styles.
 */
function Label({
  as: Caption = "label",
  htmlFor,
  label,
  hint,
}: {
  as?: "label" | "legend";
  htmlFor?: string;
  label: string;
  hint?: string | null;
}) {
  return (
    <>
      <Caption
        htmlFor={htmlFor}
        className="block text-sm font-medium text-slate-800"
      >
        {label}
      </Caption>
      {hint && <p className="mt-0.5 text-xs text-slate-500">{hint}</p>}
    </>
  );
}

function TextField({
  label,
  hint,
  placeholder,
  value,
  onChange,
  multiline = false,
}: {
  label: string;
  hint?: string | null;
  placeholder?: string;
  value: string;
  onChange: (value: string) => void;
  multiline?: boolean;
}) {
  const id = useId();
  const shared = {
    id,
    value,
    placeholder,
    className: inputClass,
    onChange: (
      event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
    ) => onChange(event.target.value),
  };

  return (
    <div>
      <Label htmlFor={id} label={label} hint={hint} />
      <div className="mt-1.5">
        {multiline ? <textarea rows={3} {...shared} /> : <input {...shared} />}
      </div>
    </div>
  );
}

function DateField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  const id = useId();

  return (
    <div>
      <Label
        htmlFor={id}
        label={label}
        hint="Leave blank to complete by hand at signing"
      />
      <div className="mt-1.5 flex gap-2">
        <input
          id={id}
          type="date"
          value={value}
          className={inputClass}
          onChange={(event) => onChange(event.target.value)}
        />
        <button
          type="button"
          onClick={() => onChange(today())}
          className="shrink-0 rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
        >
          Today
        </button>
      </div>
    </div>
  );
}

/** Today in the viewer's own time zone, as `yyyy-mm-dd`. */
function today(): string {
  const now = new Date();
  return new Date(now.getTime() - now.getTimezoneOffset() * 60_000)
    .toISOString()
    .slice(0, 10);
}

/**
 * A section offering two wordings, the first of which contains a number the
 * user sets — the shape shared by MNDA Term and Term of Confidentiality. The
 * radio labels are the template's own sentences, with a number input sitting
 * where the placeholder does.
 */
function TermField({
  section,
  usesPlaceholder,
  years,
  onSelect,
  onYearsChange,
}: {
  section: CoverPageSection | undefined;
  usesPlaceholder: boolean;
  years: string;
  onSelect: (usesPlaceholder: boolean) => void;
  onYearsChange: (years: string) => void;
}) {
  const name = useId();
  if (!section) return null;

  const [withPlaceholder, without] = section.choices;
  if (!withPlaceholder || !without) return null;

  const [before, after] = splitAroundPlaceholder(withPlaceholder);

  return (
    <fieldset>
      <Label as="legend" label={section.heading} hint={section.hint} />

      <div className="mt-2 space-y-2">
        <label className="flex gap-2 text-sm text-slate-700">
          <input
            type="radio"
            name={name}
            checked={usesPlaceholder}
            onChange={() => onSelect(true)}
            className="mt-1 shrink-0"
          />
          <span>
            {before}
            <input
              type="number"
              min={1}
              value={years}
              aria-label={`${section.heading} length`}
              onChange={(event) => onYearsChange(sanitizeYears(event.target.value))}
              onFocus={() => onSelect(true)}
              className="mx-1 w-16 rounded border border-slate-300 px-1.5 py-0.5 text-sm"
            />
            {placeholderUnit(withPlaceholder)}
            {after}
          </span>
        </label>

        <label className="flex gap-2 text-sm text-slate-700">
          <input
            type="radio"
            name={name}
            checked={!usesPlaceholder}
            onChange={() => onSelect(false)}
            className="mt-1 shrink-0"
          />
          <span>{without}</span>
        </label>
      </div>
    </fieldset>
  );
}
