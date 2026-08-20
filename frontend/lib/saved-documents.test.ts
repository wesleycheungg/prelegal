import { afterEach, describe, expect, it, vi } from "vitest";

import {
  SaveError,
  createSavedDocument,
  deleteSavedDocument,
  listSavedDocuments,
  readSavedDocument,
  suggestedName,
  updateSavedDocument,
} from "./saved-documents";
import { sampleValues } from "@/test/helpers";

type Fetch = (url: string, init?: RequestInit) => Promise<Response>;

const answering = (body: unknown, status = 200) =>
  vi.fn<Fetch>(async () => new Response(JSON.stringify(body), { status }));

afterEach(() => {
  vi.restoreAllMocks();
});

describe("createSavedDocument", () => {
  it("sends the document and its values untouched", async () => {
    const values = sampleValues();
    const fetchMock = answering({ id: 1, slug: "mutual-nda", values }, 201);
    vi.stubGlobal("fetch", fetchMock);

    await createSavedDocument("mutual-nda", "Acme and Globex", values);

    const [path, init] = fetchMock.mock.calls[0];
    expect(path).toBe("/api/documents");
    expect(init?.method).toBe("POST");
    // Reshaping on the way out would mean reopening returned something else.
    expect(JSON.parse(String(init?.body))).toEqual({
      slug: "mutual-nda",
      name: "Acme and Globex",
      values,
    });
  });

  it("says to sign in when there is no session", async () => {
    vi.stubGlobal("fetch", answering({ detail: "Not signed in" }, 401));

    await expect(
      createSavedDocument("mutual-nda", "x", sampleValues()),
    ).rejects.toThrow("Sign in to save documents.");
  });

  it("passes on the server's reason", async () => {
    vi.stubGlobal(
      "fetch",
      answering({ detail: "That document is too large to save." }, 413),
    );

    await expect(
      createSavedDocument("mutual-nda", "x", sampleValues()),
    ).rejects.toThrow("That document is too large to save.");
  });

  it("explains an unreachable backend", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError("Failed to fetch");
      }),
    );

    await expect(
      createSavedDocument("mutual-nda", "x", sampleValues()),
    ).rejects.toThrow(SaveError);
  });
});

describe("updateSavedDocument", () => {
  it("puts to the document's own address", async () => {
    const fetchMock = answering({ id: 7 });
    vi.stubGlobal("fetch", fetchMock);

    await updateSavedDocument(7, "mutual-nda", "Renamed", sampleValues());

    expect(fetchMock.mock.calls[0][0]).toBe("/api/documents/7");
    expect(fetchMock.mock.calls[0][1]?.method).toBe("PUT");
  });
});

describe("listSavedDocuments and readSavedDocument", () => {
  it("lists what is saved", async () => {
    vi.stubGlobal("fetch", answering([{ id: 1, name: "Acme and Globex" }]));

    await expect(listSavedDocuments()).resolves.toEqual([
      { id: 1, name: "Acme and Globex" },
    ]);
  });

  it("reads one back whole", async () => {
    const values = sampleValues();
    vi.stubGlobal("fetch", answering({ id: 1, slug: "mutual-nda", values }));

    const document = await readSavedDocument(1);

    expect(document.values).toEqual(values);
  });
});

describe("deleteSavedDocument", () => {
  it("succeeds on a 204", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(null, { status: 204 })),
    );

    await expect(deleteSavedDocument(1)).resolves.toBeUndefined();
  });

  it("reports a refusal", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(null, { status: 404 })),
    );

    await expect(deleteSavedDocument(1)).rejects.toThrow(SaveError);
  });
});

describe("suggestedName", () => {
  it("names both companies, which is how anyone refers to an agreement", () => {
    expect(suggestedName("Mutual NDA", sampleValues())).toBe(
      "Mutual NDA — Acme Inc. and Globex Ltd.",
    );
  });

  it("falls back to the kind of agreement when a company is missing", () => {
    const values = sampleValues();
    values.party2.company = "";

    expect(suggestedName("Mutual NDA", values)).toBe("Mutual NDA");
  });
});
