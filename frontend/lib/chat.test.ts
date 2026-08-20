import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import {
  ChatError,
  applyFields,
  backendIsReachable,
  filledFieldNames,
  sendMessage,
  toChatFields,
} from "./chat";
import { createDefaultValues } from "./document-values";
import type { DocumentSchema } from "./field-schema";
import { loadFixtures, sampleValues } from "@/test/helpers";

let schema: DocumentSchema;

beforeAll(async () => {
  schema = (await loadFixtures()).schema;
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("toChatFields", () => {
  it("flattens the values into the names the backend uses", () => {
    const fields = toChatFields(schema, sampleValues());

    expect(fields.purpose).toBe("Evaluating a potential partnership.");
    expect(fields.governing_law).toBe("Delaware");
    expect(fields.party1_company).toBe("Acme Inc.");
    expect(fields.party2_notice_address).toBe("1 Globex Way\nLondon");
  });

  it("sends a choice as its index and its number", () => {
    const fields = toChatFields(schema, sampleValues());

    expect(fields.mnda_term_option).toBe(0);
    expect(fields.mnda_term_number).toBe("2");
  });

  it("sends null for anything not yet answered", () => {
    const fields = toChatFields(schema, createDefaultValues(schema));

    expect(fields.governing_law).toBeNull();
    expect(fields.party1_company).toBeNull();
  });
});

describe("applyFields", () => {
  it("writes what the assistant learned into the values", () => {
    const merged = applyFields(schema, createDefaultValues(schema), {
      governing_law: "Delaware",
      party1_company: "Acme Inc.",
    });

    expect(merged.fields.governing_law).toBe("Delaware");
    expect(merged.party1.company).toBe("Acme Inc.");
  });

  it("leaves everything a turn said nothing about alone", () => {
    const values = sampleValues();

    const merged = applyFields(schema, values, { governing_law: "New York" });

    expect(merged.fields.governing_law).toBe("New York");
    expect(merged.fields.purpose).toBe("Evaluating a potential partnership.");
    expect(merged.party1.company).toBe("Acme Inc.");
  });

  it("keeps both parties separate", () => {
    const merged = applyFields(schema, sampleValues(), {
      party2_title: "Director",
    });

    expect(merged.party2.title).toBe("Director");
    expect(merged.party1.title).toBe("CEO");
  });

  it("applies a choice and its number together", () => {
    const merged = applyFields(schema, sampleValues(), {
      mnda_term_option: 1,
      mnda_term_number: "5",
    });

    expect(merged.choices.mnda_term).toEqual({ index: 1, number: "5" });
  });

  it("ignores a choice the template has no sentence for", () => {
    // An index outside the options would be a sentence the document does not
    // have, so the existing selection stands.
    const merged = applyFields(schema, sampleValues(), { mnda_term_option: 7 });

    expect(merged.choices.mnda_term.index).toBe(0);
  });

  it("sanitises a number even though the backend already did", () => {
    const merged = applyFields(schema, sampleValues(), {
      mnda_term_number: "-3",
    });

    expect(merged.choices.mnda_term.number).toBe("3");
  });

  it("does not mutate what it was given", () => {
    const values = sampleValues();

    applyFields(schema, values, { governing_law: "New York" });

    expect(values.fields.governing_law).toBe("Delaware");
  });
});

describe("filledFieldNames", () => {
  it("names the fields a turn filled in", () => {
    const names = filledFieldNames(schema, {
      governing_law: "Delaware",
      party1_company: "Acme Inc.",
    });

    expect(names).toEqual(["Governing Law", "PARTY 1 Company"]);
  });

  it("names a choice once however many parts it has", () => {
    const names = filledFieldNames(schema, {
      mnda_term_option: 0,
      mnda_term_number: "2",
    });

    expect(names).toEqual(["MNDA Term"]);
  });

  it("says nothing about a field left null", () => {
    expect(filledFieldNames(schema, { governing_law: null })).toEqual([]);
  });

  it("uses the document's own party names", async () => {
    const design = (await import("@/test/helpers")).loadDocument;
    const partner = await design("design-partner-agreement");

    expect(
      filledFieldNames(partner.schema, { party2_company: "Globex" }),
    ).toEqual(["PARTNER Company"]);
  });
});

describe("sendMessage", () => {
  const ok = (body: unknown) =>
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify(body), { status: 200 })),
    );

  it("sends the document, the history and the values", async () => {
    const fetchMock = vi.fn<
      (url: string, init: RequestInit) => Promise<Response>
    >(
      async () =>
        new Response(
          JSON.stringify({ reply: "Hi", document: "mutual-nda", fields: {} }),
        ),
    );
    vi.stubGlobal("fetch", fetchMock);

    await sendMessage([{ role: "user", content: "Hello" }], {
      slug: "mutual-nda",
      schema,
      values: sampleValues(),
    });

    const body = JSON.parse(String(fetchMock.mock.calls[0][1].body));
    expect(body.document).toBe("mutual-nda");
    expect(body.messages).toEqual([{ role: "user", content: "Hello" }]);
    expect(body.values.governing_law).toBe("Delaware");
  });

  it("sends no document and no values while one is being chosen", async () => {
    const fetchMock = vi.fn<
      (url: string, init: RequestInit) => Promise<Response>
    >(
      async () =>
        new Response(
          JSON.stringify({ reply: "Which?", document: null, fields: {} }),
        ),
    );
    vi.stubGlobal("fetch", fetchMock);

    await sendMessage([{ role: "user", content: "an NDA" }], null);

    const body = JSON.parse(String(fetchMock.mock.calls[0][1].body));
    expect(body.document).toBeNull();
    expect(body.values).toEqual({});
  });

  it("returns the assistant's turn", async () => {
    ok({
      reply: "Noted.",
      document: "mutual-nda",
      fields: { governing_law: "Delaware" },
    });

    const turn = await sendMessage([{ role: "user", content: "Delaware" }], {
      slug: "mutual-nda",
      schema,
      values: sampleValues(),
    });

    expect(turn.reply).toBe("Noted.");
    expect(turn.fields.governing_law).toBe("Delaware");
  });

  it("explains an unreachable backend", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError("Failed to fetch");
      }),
    );

    await expect(
      sendMessage([{ role: "user", content: "hi" }], null),
    ).rejects.toThrow(ChatError);
  });

  it("passes the server's own explanation through", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({ detail: "That message is too long." }),
            {
              status: 413,
            },
          ),
      ),
    );

    await expect(
      sendMessage([{ role: "user", content: "hi" }], null),
    ).rejects.toThrow("That message is too long.");
  });

  it("falls back to a readable message when the body is not JSON", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("<html>502</html>", { status: 502 })),
    );

    await expect(
      sendMessage([{ role: "user", content: "hi" }], null),
    ).rejects.toThrow("The assistant could not answer. Please try again.");
  });
});

describe("backendIsReachable", () => {
  it("is true when health answers", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("{}", { status: 200 })),
    );

    await expect(backendIsReachable()).resolves.toBe(true);
  });

  it("is false when nothing answers", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError("Failed to fetch");
      }),
    );

    await expect(backendIsReachable()).resolves.toBe(false);
  });
});
