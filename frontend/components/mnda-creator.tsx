"use client";

import { useMemo, useState } from "react";

import { AgreementDocument } from "./agreement-document";
import { MndaChat } from "./mnda-chat";
import { MndaForm } from "./mnda-form";
import { agreementFileName, buildAgreement } from "@/lib/agreement";
import type { CoverPageTemplate } from "@/lib/cover-page-template";
import { type MndaValues, createDefaultValues, isComplete } from "@/lib/mnda";

interface MndaCreatorProps {
  template: CoverPageTemplate;
  /** Standard Terms markdown, already prepared for rendering. */
  standardTerms: string;
}

/** Chat is where a user starts; the form is there to correct and to fall back on. */
type Mode = "chat" | "form";

/**
 * Owns the agreement's values and lays the tool out beside a live preview of
 * the document it produces.
 *
 * The chat and the form are two ways into the same values, so anything settled
 * in conversation can be corrected in the form and the other way about. Keeping
 * both means the assistant misreading something is never a dead end, and there
 * is still a way through without it.
 */
export function MndaCreator({ template, standardTerms }: MndaCreatorProps) {
  const [values, setValues] = useState<MndaValues>(() =>
    createDefaultValues(template),
  );
  const [mode, setMode] = useState<Mode>("chat");
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
              Talk it through and download a complete agreement.
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
        <div className="no-print flex flex-col gap-4 lg:sticky lg:top-8 lg:max-h-[calc(100vh-4rem)] lg:overflow-y-auto lg:pr-2">
          {/*
            Two buttons rather than a tablist. `role="tab"` announces a widget
            the arrow keys move through, and building that for a choice of two
            would be machinery for its own sake; `aria-pressed` describes what
            these actually are and how they actually behave.
          */}
          <div className="flex gap-1 rounded-lg bg-slate-100 p-1">
            {(["chat", "form"] as const).map((option) => (
              <button
                key={option}
                type="button"
                aria-pressed={mode === option}
                onClick={() => setMode(option)}
                className={`flex-1 rounded-md px-3 py-1.5 text-sm font-medium capitalize transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900 ${
                  mode === option
                    ? "bg-white text-slate-900 shadow-sm"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                {option}
              </button>
            ))}
          </div>

          {mode === "chat" ? (
            <MndaChat values={values} onValues={setValues} />
          ) : (
            <MndaForm template={template} values={values} onChange={update} />
          )}
        </div>

        <div className="paper rounded-lg border border-slate-200 bg-white p-8 shadow-sm sm:p-12">
          <AgreementDocument agreement={agreement} />
        </div>
      </main>
    </>
  );
}
