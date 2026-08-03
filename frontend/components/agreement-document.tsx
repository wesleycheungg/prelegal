import type { ReactNode } from "react";
import ReactMarkdown from "react-markdown";

import { type CoverPageTemplate, SECTION } from "@/lib/cover-page-template";
import {
  type MndaValues,
  type Party,
  formatEffectiveDate,
  resolveConfidentialityTerm,
  resolveMndaTerm,
} from "@/lib/mnda";

interface AgreementDocumentProps {
  template: CoverPageTemplate;
  values: MndaValues;
  standardTerms: string;
}

/**
 * The agreement as it will appear on paper: the filled cover page followed by
 * the full Standard Terms. This is what the print stylesheet exports to PDF, so
 * it renders the finished document only — no editing affordances.
 */
export function AgreementDocument({
  template,
  values,
  standardTerms,
}: AgreementDocumentProps) {
  return (
    <article className="document">
      <h1>{template.title}</h1>
      <ReactMarkdown>{template.intro}</ReactMarkdown>

      <Divider>Cover Page</Divider>

      <Field heading={SECTION.purpose}>
        <Value text={values.purpose} />
      </Field>

      <Field heading={SECTION.effectiveDate}>
        <Value text={formatEffectiveDate(values.effectiveDate)} />
      </Field>

      <Field heading={SECTION.mndaTerm}>
        <Value text={resolveMndaTerm(template, values)} />
      </Field>

      <Field heading={SECTION.confidentiality}>
        <Value text={resolveConfidentialityTerm(template, values)} />
      </Field>

      <Field heading={SECTION.governingLaw}>
        Governing Law: <Value text={values.governingLaw} />
        <br />
        Jurisdiction: <Value text={values.jurisdiction} />
      </Field>

      <Field heading={SECTION.modifications}>
        {values.modifications.trim() || "None."}
      </Field>

      <p className="avoid-break">{template.signingStatement}</p>

      <SignatureTable party1={values.party1} party2={values.party2} />

      <div className="mt-8 text-xs">
        <ReactMarkdown>{template.attribution}</ReactMarkdown>
      </div>

      <Divider>Standard Terms</Divider>

      <ReactMarkdown>{standardTerms}</ReactMarkdown>
    </article>
  );
}

function Divider({ children }: { children: ReactNode }) {
  return (
    <div className="mt-10 mb-6 border-t border-slate-300 pt-6">
      <h2 className="text-center">{children}</h2>
    </div>
  );
}

function Field({
  heading,
  children,
}: {
  heading: string;
  children: ReactNode;
}) {
  return (
    <section className="avoid-break">
      <h2>{heading}</h2>
      <p className="whitespace-pre-line">{children}</p>
    </section>
  );
}

/**
 * A supplied value, or a rule to write one on. Unfilled details stay usable:
 * the document can be printed and completed by hand.
 */
function Value({ text }: { text: string }) {
  if (text.trim()) return <>{text}</>;
  return (
    <span
      aria-hidden="true"
      className="inline-block min-w-64 border-b border-slate-400 align-baseline"
    />
  );
}

function SignatureTable({ party1, party2 }: { party1: Party; party2: Party }) {
  // Signature and Date are always left empty — they are signed by hand.
  const rows: { label: string; values: [string, string]; tall?: boolean }[] = [
    { label: "Signature", values: ["", ""], tall: true },
    { label: "Print Name", values: [party1.name, party2.name] },
    { label: "Title", values: [party1.title, party2.title] },
    { label: "Company", values: [party1.company, party2.company] },
    {
      label: "Notice Address",
      values: [party1.noticeAddress, party2.noticeAddress],
    },
    { label: "Date", values: ["", ""] },
  ];

  return (
    <table className="w-full table-fixed border-collapse text-sm">
      <thead>
        <tr>
          <th className="w-40 border border-slate-400 px-3 py-2" />
          <th className="border border-slate-400 px-3 py-2 text-center font-bold">
            PARTY 1
          </th>
          <th className="border border-slate-400 px-3 py-2 text-center font-bold">
            PARTY 2
          </th>
        </tr>
      </thead>
      <tbody>
        {rows.map(({ label, values, tall }) => (
          <tr key={label}>
            <th className="border border-slate-400 px-3 py-2 text-left font-normal">
              {label}
            </th>
            {values.map((value, index) => (
              <td
                key={index}
                className="border border-slate-400 px-3 py-2 align-top whitespace-pre-line"
              >
                <span className={tall ? "block min-h-12" : "block min-h-6"}>
                  {value}
                </span>
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
