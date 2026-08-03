"use client";

import { useMemo, useState } from "react";

import { AgreementDocument } from "./agreement-document";
import { MndaForm } from "./mnda-form";
import { agreementFileName, buildAgreement } from "@/lib/agreement";
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
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const agreement = useMemo(
    () => buildAgreement(template, values, standardTerms),
    [template, values, standardTerms],
  );

  const update = (patch: Partial<MndaValues>) =>
    setValues((current) => ({ ...current, ...patch }));

  /**
   * Builds the PDF in the browser and saves it straight to disk.
   *
   * The renderer is imported on demand: it is by far the largest dependency
   * here, and nobody should pay for it just to load the form.
   */
  const download = async () => {
    setBusy(true);
    setError(null);
    let url: string | undefined;

    try {
      const [{ pdf }, { MndaPdf }] = await Promise.all([
        import("@react-pdf/renderer"),
        import("./mnda-pdf"),
      ]);

      const blob = await pdf(<MndaPdf agreement={agreement} />).toBlob();
      url = URL.createObjectURL(blob);

      const link = document.createElement("a");
      link.href = url;
      link.download = agreementFileName(values);
      link.click();
    } catch (cause) {
      console.error(cause);
      setError("Could not build the PDF. Please try again.");
    } finally {
      // Revoked on the next tick so the download has taken the URL.
      const created = url;
      if (created) setTimeout(() => URL.revokeObjectURL(created), 0);
      setBusy(false);
    }
  };

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

          {error ? (
            <p role="alert" className="text-sm text-red-600">
              {error}
            </p>
          ) : (
            !isComplete(values) && (
              <p className="text-sm text-slate-500">
                Blank details become empty lines to complete by hand.
              </p>
            )
          )}

          <button
            type="button"
            onClick={download}
            disabled={busy}
            className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-slate-700 disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900"
          >
            {busy ? "Preparing…" : "Download PDF"}
          </button>
        </div>
      </header>

      <main className="workspace mx-auto grid w-full max-w-[1600px] flex-1 gap-8 px-6 py-8 lg:grid-cols-[minmax(0,26rem)_minmax(0,1fr)] lg:items-start">
        <div className="no-print lg:sticky lg:top-8 lg:max-h-[calc(100vh-4rem)] lg:overflow-y-auto lg:pr-2">
          <MndaForm template={template} values={values} onChange={update} />
        </div>

        <div className="paper rounded-lg border border-slate-200 bg-white p-8 shadow-sm sm:p-12">
          <AgreementDocument agreement={agreement} />
        </div>
      </main>
    </>
  );
}
