import type { ReactNode } from "react";

import type { Agreement, SignatureRow } from "@/lib/agreement";
import type { TextRun } from "@/lib/inline-markdown";

/**
 * The agreement as it appears on screen. A direct rendering of the shared
 * `Agreement` model — the PDF renders the same model, so the two stay in step.
 */
export function AgreementDocument({ agreement }: { agreement: Agreement }) {
  return (
    <article className="document">
      <h1>{agreement.title}</h1>
      <p>
        <Runs runs={agreement.intro} />
      </p>

      <Divider>Cover Page</Divider>

      {agreement.fields.map((field) => (
        <section key={field.heading} className="avoid-break">
          <h2>{field.heading}</h2>
          <p className="whitespace-pre-line">
            {field.lines.map((line, index) => (
              <span key={line.label ?? index}>
                {index > 0 && <br />}
                {line.label && `${line.label}: `}
                <Value text={line.value} />
              </span>
            ))}
          </p>
        </section>
      ))}

      <p className="avoid-break">{agreement.signingStatement}</p>

      <SignatureTable rows={agreement.signatureRows} />

      <p className="mt-8 text-xs">
        <Runs runs={agreement.attribution} />
      </p>

      <Divider>Standard Terms</Divider>

      <ol>
        {agreement.clauses.map((clause, index) => (
          <li key={index}>
            <Runs runs={clause} />
          </li>
        ))}
      </ol>

      <p className="text-xs">
        <Runs runs={agreement.standardTermsFooter} />
      </p>
    </article>
  );
}

function Runs({ runs }: { runs: TextRun[] }) {
  return (
    <>
      {runs.map((run, index) => {
        if (run.href) {
          return (
            <a key={index} href={run.href}>
              {run.text}
            </a>
          );
        }
        return run.bold ? <strong key={index}>{run.text}</strong> : run.text;
      })}
    </>
  );
}

function Divider({ children }: { children: ReactNode }) {
  return (
    <div className="mt-10 mb-6 border-t border-slate-300 pt-6">
      <h2 className="text-center">{children}</h2>
    </div>
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

function SignatureTable({ rows }: { rows: SignatureRow[] }) {
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
