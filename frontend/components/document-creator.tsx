"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { AgreementDocument } from "./agreement-document";
import { DocumentChat } from "./document-chat";
import { DocumentForm } from "./document-form";
import { useSession } from "./session";
import { Button, Notice, Panel, focusRing, inputClass } from "./ui";
import { agreementFileName, buildAgreement } from "@/lib/agreement";
import {
  type DocumentValues,
  createDefaultValues,
  isComplete,
} from "@/lib/document-values";
import {
  SaveError,
  createSavedDocument,
  readSavedDocument,
  suggestedName,
  updateSavedDocument,
} from "@/lib/saved-documents";
import type { DocumentDefinition } from "@/lib/templates";

interface DocumentCreatorProps {
  /** Every agreement the app can create, parsed at build time. */
  documents: DocumentDefinition[];
}

/** Chat is where a user starts; the form is there to correct and to fall back on. */
type Mode = "chat" | "form";

/** How far the current agreement has got towards being stored. */
type SaveState =
  | { kind: "unsaved" }
  | { kind: "saving" }
  | { kind: "saved"; at: Date }
  | { kind: "failed"; message: string };

/** Long enough that a burst of typing is one write, short enough to feel live. */
const AUTOSAVE_DELAY_MS = 1200;

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

  const [savedId, setSavedId] = useState<number | null>(null);
  const [name, setName] = useState("");
  const [save, setSave] = useState<SaveState>({ kind: "unsaved" });

  const { user } = useSession();
  const chosen = documents.find((entry) => entry.slug === slug) ?? null;

  /** What the server already holds, so an unchanged document is not rewritten. */
  const persisted = useRef<string | null>(null);

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
    // A different agreement is a different document, not an edit of this one.
    setSavedId(null);
    setName("");
    setSave({ kind: "unsaved" });
    persisted.current = null;
  };

  const update = (patch: Partial<DocumentValues>) =>
    setValues((current) => (current ? { ...current, ...patch } : current));

  /**
   * Reopen whatever `?document=` names.
   *
   * Read from the URL rather than held in memory so a saved agreement survives
   * a reload and can be linked to. `window.location` rather than
   * `useSearchParams`, which would put this page behind a Suspense boundary for
   * a value that cannot be prerendered anyway.
   */
  useEffect(() => {
    const id = Number(
      new URLSearchParams(window.location.search).get("document"),
    );
    if (!id || !user) return;

    let cancelled = false;

    readSavedDocument(id)
      .then((document) => {
        if (
          cancelled ||
          !documents.some((entry) => entry.slug === document.slug)
        ) {
          return;
        }
        persisted.current = snapshot(document.name, document.values);
        setSlug(document.slug);
        setValues(document.values);
        setSavedId(document.id);
        setName(document.name);
        setSave({ kind: "saved", at: new Date(document.updated_at) });
      })
      .catch(() => {
        if (!cancelled) setError("Could not open that document.");
      });

    return () => {
      cancelled = true;
    };
  }, [documents, user]);

  const store = useCallback(async () => {
    if (!chosen || !values) return;

    const title = name.trim() || suggestedName(chosen.schema.title, values);
    setSave({ kind: "saving" });

    try {
      const stored = savedId
        ? await updateSavedDocument(savedId, chosen.slug, title, values)
        : await createSavedDocument(chosen.slug, title, values);

      persisted.current = snapshot(stored.name, values);
      setSavedId(stored.id);
      setName(stored.name);
      setSave({ kind: "saved", at: new Date() });
    } catch (cause) {
      setSave({
        kind: "failed",
        message: cause instanceof SaveError ? cause.message : "Could not save.",
      });
    }
  }, [chosen, values, name, savedId]);

  /**
   * Once it has been saved once, keep it saved.
   *
   * Only after the user has asked for it: nobody who has not pressed Save
   * should find half-finished agreements in their list. Debounced so a sentence
   * typed into the form is one write rather than thirty.
   *
   * What decides whether to write is a snapshot of what the server already has,
   * rather than a flag saying whether the last change counted. A flag has to be
   * cleared by something, and whatever clears it runs in the same commit as the
   * save it was meant to ignore — which cost the first edit after every save,
   * silently, at the exact moment someone corrects a typo they have just
   * spotted. Comparing content cannot get that wrong.
   */
  useEffect(() => {
    if (!savedId || !values) return;
    if (snapshot(name, values) === persisted.current) return;

    const timer = setTimeout(() => void store(), AUTOSAVE_DELAY_MS);
    return () => clearTimeout(timer);
  }, [values, name, savedId, store]);

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
      <div className="no-print border-b border-line bg-surface">
        <div className="mx-auto flex max-w-[1600px] flex-wrap items-center gap-4 px-6 py-4">
          <div className="mr-auto">
            {/*
              Names the task, not the document. The agreement carries its own
              title as a heading, and two headings reading the same thing is one
              too many for anyone navigating by them.
            */}
            <h1 className="text-lg font-semibold tracking-tight text-navy">
              Draft an agreement
            </h1>
            <p className="text-sm text-muted">
              {chosen
                ? `${chosen.schema.title} — talk it through and download it.`
                : "Talk it through and download a complete agreement."}
            </p>
          </div>

          {chosen && values && !isComplete(chosen.schema, values) && (
            <p className="text-sm text-muted">
              Blank details become empty lines to complete by hand.
            </p>
          )}

          {chosen && <SaveControls />}

          <Button onClick={download} disabled={busy || !chosen}>
            {busy ? "Preparing…" : "Download PDF"}
          </Button>
        </div>

        {error && (
          <div className="mx-auto max-w-[1600px] px-6 pb-4">
            <Notice tone="error">{error}</Notice>
          </div>
        )}
      </div>

      <main className="workspace mx-auto grid w-full max-w-[1600px] flex-1 gap-8 px-6 py-8 lg:grid-cols-[minmax(0,26rem)_minmax(0,1fr)] lg:items-start">
        <div className="no-print flex flex-col gap-4 lg:sticky lg:top-8 lg:max-h-[calc(100vh-4rem)] lg:overflow-y-auto lg:pr-2">
          {/*
            The assistant picks the document, but it needs the backend to do it.
            This is the way through when the backend is not running, and the way
            to change your mind without saying so.
          */}
          <div>
            <label
              className="block text-sm font-medium text-navy"
              htmlFor="document-type"
            >
              Agreement type
            </label>
            <select
              id="document-type"
              value={slug ?? ""}
              onChange={(event) => choose(event.target.value)}
              className={`mt-1.5 ${inputClass}`}
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
          <div className="flex gap-1 rounded-lg bg-canvas p-1">
            {(["chat", "form"] as const).map((option) => (
              <button
                key={option}
                type="button"
                aria-pressed={mode === option}
                disabled={option === "form" && !chosen}
                onClick={() => setMode(option)}
                className={`flex-1 rounded-md px-3 py-1.5 text-sm font-medium capitalize transition-colors disabled:opacity-50 ${focusRing} ${
                  mode === option
                    ? "bg-surface text-navy shadow-xs"
                    : "text-muted hover:text-navy"
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

        <Panel className="paper p-8 sm:p-12">
          {agreement ? (
            <AgreementDocument agreement={agreement} />
          ) : (
            /*
              Sized to the document that will replace it, so choosing one does
              not make the page jump — and so an empty workspace reads as
              waiting rather than as something that failed to load.
            */
            <div className="flex min-h-[32rem] flex-col items-center justify-center px-6 text-center">
              <p className="text-base font-medium text-navy">
                Your agreement will appear here
              </p>
              <p className="mt-2 max-w-sm text-sm text-muted">
                Tell the assistant what you need — or pick an agreement type on
                the left — and it is drafted as you talk.
              </p>
            </div>
          )}
        </Panel>
      </main>
    </>
  );

  /** The save button, and what it has to say for itself. */
  function SaveControls() {
    if (!user) {
      return (
        <Link
          href="/sign-in"
          className={`rounded-md px-2 py-1 text-sm font-medium text-brand underline underline-offset-2 ${focusRing}`}
        >
          Sign in to save
        </Link>
      );
    }

    return (
      <div className="flex items-center gap-3">
        {savedId ? (
          <>
            <label className="sr-only" htmlFor="document-name">
              Document name
            </label>
            <input
              id="document-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              className={`w-56 ${inputClass}`}
            />
          </>
        ) : (
          <Button
            variant="secondary"
            onClick={store}
            disabled={save.kind === "saving"}
          >
            {save.kind === "saving" ? "Saving…" : "Save"}
          </Button>
        )}

        {/*
          Outside the branch above, because a first save that fails leaves no
          document id — and reporting it only once there is one would mean the
          one failure nobody hears about is the first.
        */}
        <span
          role="status"
          className={`text-sm ${
            save.kind === "failed" ? "text-red-700" : "text-muted"
          }`}
        >
          {save.kind === "saving" && "Saving…"}
          {save.kind === "saved" && "Saved"}
          {save.kind === "failed" && save.message}
        </span>
      </div>
    );
  }
}

/** What was last written, as something two renders can be compared by. */
function snapshot(name: string, values: DocumentValues): string {
  return JSON.stringify({ name, values });
}
