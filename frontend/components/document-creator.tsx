"use client";

import { useMemo, useState } from "react";

import { AgreementDocument } from "./agreement-document";
import { DocumentChat } from "./document-chat";
import { DocumentForm } from "./document-form";
import { agreementFileName, buildAgreement } from "@/lib/agreement";
import {
  type DocumentValues,
  createDefaultValues,
  isComplete,
} from "@/lib/document-values";
import type { DocumentDefinition } from "@/lib/templates";

interface DocumentCreatorProps {
  /** Every agreement the app can create, parsed at build time. */
  documents: DocumentDefinition[];
}

/** Chat is where a user starts; the form is there to correct and to fall back on. */
type Mode = "chat" | "form";

/**
 * Owns which agreement is being written, its values, and the live preview.
 *
 * The chat and the form are two ways into the same values, so anything settled
 * in conversation can be corrected in the form and the other way about. Keeping
 * both means the assistant misreading something is never a dead end, and there
 * is still a way through without it.
 */
export function DocumentCreator({ documents }: DocumentCreatorProps) {
  const [slug, setSlug] = useState<string | null>(null);
  const [values, setValues] = useState<DocumentValues | null>(null);
  const [mode, setMode] = useState<Mode>("chat");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const chosen = documents.find((entry) => entry.slug === slug) ?? null;

  const agreement = useMemo(
    () =>
      chosen && values
        ? buildAgreement(chosen.schema, values, chosen.standardTerms)
        : null,
    [chosen, values],
  );

  /** Switching document starts its own values; nothing carries across. */
  const choose = (next: string) => {
    const target = documents.find((candidate) => candidate.slug === next);
    if (!target) return;
    setSlug(next);
    setValues(createDefaultValues(target.schema));
  };

  const update = (patch: Partial<DocumentValues>) =>
    setValues((current) => (current ? { ...current, ...patch } : current));

  /**
   * Builds the PDF in the browser and saves it straight to disk.
   *
   * The renderer is imported on demand: it is by far the largest dependency
   * here, and nobody should pay for it just to load the page.
   */
  const download = async () => {
    if (!chosen || !values || !agreement) return;

    setBusy(true);
    setError(null);
    let url: string | undefined;

    try {
      const [{ pdf }, { AgreementPdf }] = await Promise.all([
        import("@react-pdf/renderer"),
        import("./document-pdf"),
      ]);

      const blob = await pdf(<AgreementPdf agreement={agreement} />).toBlob();
      url = URL.createObjectURL(blob);

      const link = document.createElement("a");
      link.href = url;
      link.download = agreementFileName(chosen.schema, values);
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
            {/*
              Names the tool, not the document. The agreement carries its own
              title as a heading, and two headings reading the same thing is one
              too many for anyone navigating by them.
            */}
            <h1 className="text-lg font-semibold text-slate-900">
              Agreement Creator
            </h1>
            <p className="text-sm text-slate-500">
              {chosen
                ? `${chosen.schema.title} — talk it through and download it.`
                : "Talk it through and download a complete agreement."}
            </p>
          </div>

          {error ? (
            <p role="alert" className="text-sm text-red-600">
              {error}
            </p>
          ) : (
            chosen &&
            values &&
            !isComplete(chosen.schema, values) && (
              <p className="text-sm text-slate-500">
                Blank details become empty lines to complete by hand.
              </p>
            )
          )}

          <button
            type="button"
            onClick={download}
            disabled={busy || !chosen}
            className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-slate-700 disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900"
          >
            {busy ? "Preparing…" : "Download PDF"}
          </button>
        </div>
      </header>

      <main className="workspace mx-auto grid w-full max-w-[1600px] flex-1 gap-8 px-6 py-8 lg:grid-cols-[minmax(0,26rem)_minmax(0,1fr)] lg:items-start">
        <div className="no-print flex flex-col gap-4 lg:sticky lg:top-8 lg:max-h-[calc(100vh-4rem)] lg:overflow-y-auto lg:pr-2">
          {/*
            The assistant picks the document, but it needs the backend to do it.
            This is the way through when the backend is not running, and the way
            to change your mind without saying so.
          */}
          <div>
            <label
              className="block text-sm font-medium text-slate-800"
              htmlFor="document-type"
            >
              Agreement type
            </label>
            <select
              id="document-type"
              value={slug ?? ""}
              onChange={(event) => choose(event.target.value)}
              className="mt-1.5 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-slate-900 focus:outline-none"
            >
              <option value="" disabled>
                Not chosen yet
              </option>
              {documents.map((entry) => (
                <option key={entry.slug} value={entry.slug}>
                  {entry.schema.title}
                </option>
              ))}
            </select>
          </div>

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
                disabled={option === "form" && !chosen}
                onClick={() => setMode(option)}
                className={`flex-1 rounded-md px-3 py-1.5 text-sm font-medium capitalize transition-colors disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900 ${
                  mode === option
                    ? "bg-white text-slate-900 shadow-sm"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                {option}
              </button>
            ))}
          </div>

          {mode === "chat" || !chosen || !values ? (
            <DocumentChat
              document={
                chosen && values
                  ? { slug: chosen.slug, schema: chosen.schema, values }
                  : null
              }
              onDocument={choose}
              onValues={(merge) =>
                setValues((current) => (current ? merge(current) : current))
              }
            />
          ) : (
            <DocumentForm
              schema={chosen.schema}
              values={values}
              onChange={update}
            />
          )}
        </div>

        <div className="paper rounded-lg border border-slate-200 bg-white p-8 shadow-sm sm:p-12">
          {agreement ? (
            <AgreementDocument agreement={agreement} />
          ) : (
            <p className="text-sm text-slate-500">
              Tell the assistant what you need and the agreement will appear
              here.
            </p>
          )}
        </div>
      </main>
    </>
  );
}
