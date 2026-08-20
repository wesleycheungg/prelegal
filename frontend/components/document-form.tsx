"use client";

import { type ReactNode, useId } from "react";

import { Label, focusRing, inputClass } from "./ui";
import { splitAroundPlaceholder } from "@/lib/cover-page-template";
import {
  type DocumentValues,
  type Party,
  sanitizeYears,
} from "@/lib/document-values";
import type { DocumentSchema, FieldSpec } from "@/lib/field-schema";

interface DocumentFormProps {
  schema: DocumentSchema;
  values: DocumentValues;
  onChange: (patch: Partial<DocumentValues>) => void;
}

/**
 * The whole document as a form, built from its schema.
 *
 * Every control is chosen by the field's kind rather than by its name, so the
 * same component serves an eleven-field Cloud Service Agreement and a six-field
 * Mutual NDA. The wording on every radio is the template's own sentence.
 */
export function DocumentForm({ schema, values, onChange }: DocumentFormProps) {
  const setField = (key: string, value: string) =>
    onChange({ fields: { ...values.fields, [key]: value } });

  return (
    <form className="space-y-8" onSubmit={(event) => event.preventDefault()}>
      <Group title="Agreement">
        {schema.fields.map((field) => (
          <Field
            key={field.key}
            field={field}
            values={values}
            onChange={onChange}
            setField={setField}
          />
        ))}
      </Group>

      {schema.partyRoles.map((role, index) => {
        const key = index === 0 ? "party1" : "party2";
        const party = values[key as "party1" | "party2"];

        return (
          <PartyGroup
            key={role}
            title={role}
            party={party}
            onChange={(patch) => onChange({ [key]: { ...party, ...patch } })}
          />
        );
      })}
    </form>
  );
}

function Field({
  field,
  values,
  onChange,
  setField,
}: {
  field: FieldSpec;
  values: DocumentValues;
  onChange: (patch: Partial<DocumentValues>) => void;
  setField: (key: string, value: string) => void;
}) {
  switch (field.kind) {
    case "text":
      return (
        <TextField
          label={field.label}
          hint={field.hint}
          placeholder={field.placeholder}
          value={values.fields[field.key] ?? ""}
          onChange={(value) => setField(field.key, value)}
          multiline={field.multiline}
        />
      );

    case "date":
      return (
        <DateField
          label={field.label}
          value={values.fields[field.key] ?? ""}
          onChange={(value) => setField(field.key, value)}
        />
      );

    case "group":
      return (
        <>
          {field.lines.map((line) => (
            <TextField
              key={line.key}
              label={line.label}
              placeholder={line.placeholder}
              value={values.fields[line.key] ?? ""}
              onChange={(value) => setField(line.key, value)}
            />
          ))}
        </>
      );

    case "choice":
      return (
        <ChoiceField
          field={field}
          value={values.choices[field.key] ?? { index: 0, number: "" }}
          onChange={(choice) =>
            onChange({ choices: { ...values.choices, [field.key]: choice } })
          }
        />
      );
  }
}

function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <fieldset className="space-y-5">
      <legend className="mb-4 w-full border-b border-line pb-2 text-sm font-semibold tracking-wide text-navy uppercase">
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
          className={`shrink-0 rounded-md border border-line bg-surface px-3 py-2 text-sm font-medium text-navy hover:bg-canvas ${focusRing}`}
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
 * A pick between the template's alternative wordings.
 *
 * The radio labels are the sentences themselves, with a number input sitting
 * where the template's placeholder does, so what the user reads while choosing
 * is exactly what the document will say.
 */
function ChoiceField({
  field,
  value,
  onChange,
}: {
  field: Extract<FieldSpec, { kind: "choice" }>;
  value: { index: number; number: string };
  onChange: (value: { index: number; number: string }) => void;
}) {
  const name = useId();

  return (
    <fieldset>
      <Label as="legend" label={field.label} hint={field.hint} />

      <div className="mt-2 space-y-2">
        {field.options.map((option, index) => {
          const [before, after] = splitAroundPlaceholder(option.sentence);
          const selected = value.index === index;

          return (
            <label key={index} className="flex gap-2 text-sm text-navy">
              <input
                type="radio"
                name={name}
                checked={selected}
                onChange={() => onChange({ ...value, index })}
                className={`mt-1 shrink-0 accent-brand ${focusRing}`}
              />
              <span>
                {option.unit === null ? (
                  option.sentence
                ) : (
                  <>
                    {before}
                    <input
                      type="number"
                      min={1}
                      value={value.number}
                      aria-label={`${field.label} length`}
                      onChange={(event) =>
                        onChange({
                          index,
                          number: sanitizeYears(event.target.value),
                        })
                      }
                      // Typing a number is a clear enough statement of intent
                      // that the option it belongs to should be the one chosen.
                      onFocus={() => onChange({ ...value, index })}
                      className={`mx-1 w-16 rounded border border-line px-1.5 py-0.5 text-sm ${focusRing}`}
                    />
                    {option.unit}
                    {after}
                  </>
                )}
              </span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
