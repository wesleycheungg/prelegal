/**
 * The agreements a user has saved.
 *
 * What crosses the wire is `DocumentValues` verbatim — the same object the
 * creator holds and the form edits. Nothing is reshaped on the way out or back,
 * so reopening a document is the same as never having closed it.
 */

import type { DocumentValues } from "./document-values";

export interface SavedDocumentSummary {
  id: number;
  slug: string;
  name: string;
  created_at: string;
  updated_at: string;
}

export interface SavedDocument extends SavedDocumentSummary {
  values: DocumentValues;
}

/** Raised when the server refuses, or cannot be reached. */
export class SaveError extends Error {}

async function request(
  path: string,
  init: RequestInit = {},
): Promise<Response> {
  try {
    return await fetch(path, {
      headers: init.body ? { "Content-Type": "application/json" } : undefined,
      ...init,
    });
  } catch {
    throw new SaveError("Could not reach the server. Is the backend running?");
  }
}

async function bodyOf<T>(response: Response): Promise<T> {
  if (!response.ok) {
    if (response.status === 401) {
      throw new SaveError("Sign in to save documents.");
    }
    let detail = "Could not save. Please try again.";
    try {
      const body = await response.json();
      if (typeof body?.detail === "string") detail = body.detail;
    } catch {
      // Falls through to the generic message above.
    }
    throw new SaveError(detail);
  }

  return (await response.json()) as T;
}

export async function listSavedDocuments(
  signal?: AbortSignal,
): Promise<SavedDocumentSummary[]> {
  return bodyOf(await request("/api/documents", { signal }));
}

export async function readSavedDocument(id: number): Promise<SavedDocument> {
  return bodyOf(await request(`/api/documents/${id}`));
}

export async function createSavedDocument(
  slug: string,
  name: string,
  values: DocumentValues,
): Promise<SavedDocument> {
  return bodyOf(
    await request("/api/documents", {
      method: "POST",
      body: JSON.stringify({ slug, name, values }),
    }),
  );
}

export async function updateSavedDocument(
  id: number,
  slug: string,
  name: string,
  values: DocumentValues,
): Promise<SavedDocument> {
  return bodyOf(
    await request(`/api/documents/${id}`, {
      method: "PUT",
      body: JSON.stringify({ slug, name, values }),
    }),
  );
}

export async function deleteSavedDocument(id: number): Promise<void> {
  const response = await request(`/api/documents/${id}`, { method: "DELETE" });
  if (!response.ok) throw new SaveError("Could not delete that document.");
}

/**
 * What to call a document that nobody has named.
 *
 * The two companies if they are known, because that is how anyone refers to an
 * agreement; otherwise what kind of agreement it is, which at least
 * distinguishes it from the others in a list.
 */
export function suggestedName(title: string, values: DocumentValues): string {
  const parties = [values.party1.company, values.party2.company]
    .map((company) => company.trim())
    .filter(Boolean);

  return parties.length === 2 ? `${title} — ${parties.join(" and ")}` : title;
}
