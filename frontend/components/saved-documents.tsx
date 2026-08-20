"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { useSession } from "./session";
import { Button, Notice, PageHeading, Panel } from "./ui";
import {
  type SavedDocumentSummary,
  SaveError,
  deleteSavedDocument,
  listSavedDocuments,
} from "@/lib/saved-documents";

/**
 * Everything this user has saved, newest first.
 *
 * Reopening hands the document's id back to the creator through the URL, which
 * is the one piece of state worth keeping there: it survives a reload, and it
 * makes a saved agreement something you can bookmark.
 */
export function SavedDocuments() {
  const { user, loading: checkingSession } = useSession();
  const [documents, setDocuments] = useState<SavedDocumentSummary[] | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;

    const controller = new AbortController();

    listSavedDocuments(controller.signal)
      .then((found) => {
        if (!controller.signal.aborted) setDocuments(found);
      })
      .catch((cause) => {
        if (controller.signal.aborted) return;
        setError(
          cause instanceof SaveError
            ? cause.message
            : "Could not load your documents.",
        );
      });

    return () => controller.abort();
  }, [user]);

  const remove = async (id: number) => {
    try {
      await deleteSavedDocument(id);
      setDocuments((current) =>
        (current ?? []).filter((document) => document.id !== id),
      );
    } catch {
      setError("Could not delete that document.");
    }
  };

  if (checkingSession) return null;

  if (!user) {
    return (
      <>
        <PageHeading title="My documents" />
        <Panel className="p-8 text-center">
          <p className="text-sm text-navy">
            Sign in to see the agreements you have saved.
          </p>
          <Link
            href="/sign-in"
            className="mt-4 inline-block rounded-md bg-submit px-4 py-2 text-sm font-medium text-white hover:bg-submit/90"
          >
            Sign in
          </Link>
        </Panel>
      </>
    );
  }

  return (
    <>
      <PageHeading title="My documents">
        Drafts you have saved. They are cleared when the server restarts.
      </PageHeading>

      {error && <Notice tone="error">{error}</Notice>}

      {documents === null ? (
        <p className="text-sm text-muted">Loading…</p>
      ) : documents.length === 0 ? (
        <Panel className="p-8 text-center">
          <p className="text-sm text-navy">You have not saved anything yet.</p>
          <p className="mt-1 text-sm text-muted">
            Draft an agreement and press Save to keep it here.
          </p>
          <Link
            href="/"
            className="mt-4 inline-block rounded-md bg-submit px-4 py-2 text-sm font-medium text-white hover:bg-submit/90"
          >
            Draft an agreement
          </Link>
        </Panel>
      ) : (
        <ul className="space-y-3">
          {documents.map((document) => (
            <li key={document.id}>
              <Panel className="flex flex-wrap items-center gap-4 p-4">
                <div className="mr-auto min-w-0">
                  <Link
                    href={`/?document=${document.id}`}
                    className="block truncate font-medium text-navy hover:text-brand"
                  >
                    {document.name}
                  </Link>
                  <p className="mt-0.5 text-xs text-muted">
                    Last changed {formatWhen(document.updated_at)}
                  </p>
                </div>

                <Link
                  href={`/?document=${document.id}`}
                  className="rounded-md border border-line px-3 py-1.5 text-sm font-medium text-navy hover:bg-canvas"
                >
                  Open
                </Link>
                <Button variant="danger" onClick={() => remove(document.id)}>
                  Delete
                </Button>
              </Panel>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

/**
 * A stored timestamp as a date somebody can read.
 *
 * Formatted in the viewer's own zone, unlike the agreement's dates, which are
 * pinned to UTC: this one is about when they were last here, not about a term
 * of a contract.
 */
export function formatWhen(iso: string): string {
  const when = new Date(iso);
  if (Number.isNaN(when.getTime())) return "";

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(when);
}
