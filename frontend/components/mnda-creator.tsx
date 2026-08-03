"use client";

import { useState } from "react";

import { AgreementDocument } from "./agreement-document";
import { MndaForm } from "./mnda-form";
import type { CoverPageTemplate } from "@/lib/cover-page-template";
import { type MndaValues, createDefaultValues, isComplete } from "@/lib/mnda";

interface MndaCreatorProps {
  template: CoverPageTemplate;
  /** Standard Terms markdown, already prepared for rendering. */
  standardTerms: string;
}

/**
 * Owns the agreement's values and lays the tool out as a form beside a live
 * preview of the document it produces.
 */
export function MndaCreator({ template, standardTerms }: MndaCreatorProps) {
  const [values, setValues] = useState<MndaValues>(() =>
    createDefaultValues(template),
  );

  const update = (patch: Partial<MndaValues>) =>
    setValues((current) => ({ ...current, ...patch }));

  const complete = isComplete(values);

  return (
    <>
      <header className="no-print border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-[1600px] flex-wrap items-center gap-4 px-6 py-4">
          <div className="mr-auto">
            <h1 className="text-lg font-semibold text-slate-900">
              Mutual NDA Creator
            </h1>
            <p className="text-sm text-slate-500">
              Fill in the details and download a complete agreement.
            </p>
          </div>

          {!complete && (
            <p className="text-sm text-slate-500">
              Blank details will print as empty lines to complete by hand.
            </p>
          )}

          <button
            type="button"
            onClick={() => window.print()}
            className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-slate-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900"
          >
            Download PDF
          </button>
        </div>
      </header>

      <main className="workspace mx-auto grid w-full max-w-[1600px] flex-1 gap-8 px-6 py-8 lg:grid-cols-[minmax(0,26rem)_minmax(0,1fr)] lg:items-start">
        <div className="no-print lg:sticky lg:top-8 lg:max-h-[calc(100vh-4rem)] lg:overflow-y-auto lg:pr-2">
          <MndaForm template={template} values={values} onChange={update} />
        </div>

        <div className="paper rounded-lg border border-slate-200 bg-white p-8 shadow-sm sm:p-12">
          <AgreementDocument
            template={template}
            values={values}
            standardTerms={standardTerms}
          />
        </div>
      </main>
    </>
  );
}
