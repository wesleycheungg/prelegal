// @vitest-environment jsdom

import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import { DocumentChat } from "./document-chat";
import { ChatError, backendIsReachable, sendMessage } from "@/lib/chat";
import {
  type DocumentValues,
  createDefaultValues,
} from "@/lib/document-values";
import type { DocumentDefinition } from "@/lib/templates";
import { loadFixtures, sampleValues } from "@/test/helpers";

vi.mock("@/lib/chat", async () => ({
  ...(await vi.importActual<typeof import("@/lib/chat")>("@/lib/chat")),
  backendIsReachable: vi.fn(async () => true),
  sendMessage: vi.fn(),
}));

const reachable = vi.mocked(backendIsReachable);
const send = vi.mocked(sendMessage);

let mnda: DocumentDefinition;

beforeAll(async () => {
  mnda = await loadFixtures();
});

beforeEach(() => {
  vi.clearAllMocks();
  reachable.mockResolvedValue(true);
});

afterEach(() => {
  vi.restoreAllMocks();
});

const reply = (
  overrides: Partial<Awaited<ReturnType<typeof sendMessage>>> = {},
) => ({
  reply: "Noted.",
  document: null,
  fields: {},
  ...overrides,
});

function renderChat({
  values = sampleValues(),
  chosen = true,
}: { values?: DocumentValues; chosen?: boolean } = {}) {
  const onValues = vi.fn();
  const onDocument = vi.fn();

  const view = render(
    <DocumentChat
      document={
        chosen ? { slug: mnda.slug, schema: mnda.schema, values } : null
      }
      onDocument={onDocument}
      onValues={onValues}
    />,
  );

  return { onValues, onDocument, ...view };
}

const transcript = () =>
  within(screen.getByRole("log", { name: "Conversation" }));
const composer = () => screen.getByLabelText("Message");
const say = async (text: string) => {
  const user = userEvent.setup();
  await user.type(composer(), text);
  await user.click(screen.getByRole("button", { name: "Send" }));
};

describe("DocumentChat", () => {
  it("opens with a greeting that costs no request", () => {
    renderChat();

    expect(
      transcript().getByText(/I can help you put together an agreement/),
    ).toBeInTheDocument();
    expect(send).not.toHaveBeenCalled();
  });

  it("shows what the user said and what came back", async () => {
    send.mockResolvedValue(reply({ reply: "Both companies noted." }));
    renderChat();

    await say("Acme and Globex");

    expect(transcript().getByText("Acme and Globex")).toBeInTheDocument();
    expect(
      await transcript().findByText("Both companies noted."),
    ).toBeInTheDocument();
  });

  it("never sends the greeting back as something the assistant said", async () => {
    send.mockResolvedValue(reply());
    renderChat();

    await say("Hello");

    await waitFor(() => expect(send).toHaveBeenCalled());
    expect(send.mock.calls[0][0]).toEqual([{ role: "user", content: "Hello" }]);
  });

  it("merges a reply into whatever the values are when it arrives", async () => {
    // A reply lands a second after it was asked for, and the form is reachable
    // in the meantime; merging into a stale copy would discard what was typed.
    send.mockResolvedValue(reply({ fields: { governing_law: "Delaware" } }));
    const { onValues } = renderChat();

    await say("Delaware law");

    await waitFor(() => expect(onValues).toHaveBeenCalled());
    const merge = onValues.mock.calls[0][0];
    const edited = sampleValues({
      fields: { jurisdiction: "typed while waiting" },
    });

    expect(merge(edited).fields.jurisdiction).toBe("typed while waiting");
    expect(merge(edited).fields.governing_law).toBe("Delaware");
  });

  it("lists what a turn actually filled in", async () => {
    send.mockResolvedValue(reply({ fields: { governing_law: "Delaware" } }));
    renderChat();

    await say("Delaware law");

    const filled = await screen.findByRole("list", { name: "Filled in" });
    expect(within(filled).getByText("Governing Law")).toBeInTheDocument();
  });

  describe("choosing a document", () => {
    it("asks the assistant with no document until one is settled", async () => {
      send.mockResolvedValue(reply({ reply: "Which kind?" }));
      renderChat({ chosen: false });

      await say("I need an agreement");

      await waitFor(() => expect(send).toHaveBeenCalled());
      expect(send.mock.calls[0][1]).toBeNull();
    });

    it("passes on the document the assistant settled on", async () => {
      send.mockResolvedValue(
        reply({
          reply: "A Pilot Agreement fits.",
          document: "pilot-agreement",
        }),
      );
      const { onDocument } = renderChat({ chosen: false });

      await say("trialling our product");

      await waitFor(() =>
        expect(onDocument).toHaveBeenCalledWith("pilot-agreement"),
      );
    });

    it("does not change the document once one is chosen", async () => {
      send.mockResolvedValue(reply({ document: "pilot-agreement" }));
      const { onDocument } = renderChat({ chosen: true });

      await say("actually make it a pilot");

      await waitFor(() => expect(send).toHaveBeenCalled());
      expect(onDocument).not.toHaveBeenCalled();
    });
  });

  describe("when the agreement changes while a reply is in flight", () => {
    it("does not write the answer into a different document", async () => {
      // Effective Date and Governing Law exist on nearly every cover page, so
      // a stale reply merges cleanly and silently into the wrong agreement.
      let settle: (value: Awaited<ReturnType<typeof sendMessage>>) => void;
      send.mockReturnValue(
        new Promise((resolve) => {
          settle = resolve;
        }),
      );
      const { onValues, rerender } = renderChat();

      await say("Effective 1 March 2026");

      rerender(
        <DocumentChat
          document={{
            slug: "cloud-service-agreement",
            schema: mnda.schema,
            values: createDefaultValues(mnda.schema),
          }}
          onDocument={vi.fn()}
          onValues={onValues}
        />,
      );
      settle!(reply({ fields: { effective_date: "2026-03-01" } }));

      await screen.findByRole("alert");
      expect(onValues).not.toHaveBeenCalled();
    });

    it("does not undo a document the user picked by hand", async () => {
      let settle: (value: Awaited<ReturnType<typeof sendMessage>>) => void;
      send.mockReturnValue(
        new Promise((resolve) => {
          settle = resolve;
        }),
      );
      const { onDocument, rerender } = renderChat({ chosen: false });

      await say("something for a customer trial");

      rerender(
        <DocumentChat
          document={{
            slug: "mutual-nda",
            schema: mnda.schema,
            values: sampleValues(),
          }}
          onDocument={onDocument}
          onValues={vi.fn()}
        />,
      );
      settle!(reply({ document: "pilot-agreement" }));

      await screen.findByRole("alert");
      expect(onDocument).not.toHaveBeenCalled();
    });

    it("says so rather than dropping the answer silently", async () => {
      let settle: (value: Awaited<ReturnType<typeof sendMessage>>) => void;
      send.mockReturnValue(
        new Promise((resolve) => {
          settle = resolve;
        }),
      );
      const { onValues, rerender } = renderChat();

      await say("Delaware law");

      rerender(
        <DocumentChat
          document={{
            slug: "pilot-agreement",
            schema: mnda.schema,
            values: createDefaultValues(mnda.schema),
          }}
          onDocument={vi.fn()}
          onValues={onValues}
        />,
      );
      settle!(reply({ fields: { governing_law: "Delaware" } }));

      expect(await screen.findByRole("alert")).toHaveTextContent(
        /changed agreement/i,
      );
    });
  });

  describe("focus", () => {
    it("returns to the message box after a reply", async () => {
      send.mockResolvedValue(reply());
      renderChat();

      await say("Acme and Globex");

      await waitFor(() => expect(document.activeElement).toBe(composer()));
    });

    it("returns to the message box after a failure", async () => {
      send.mockRejectedValue(new ChatError("The assistant is unavailable."));
      renderChat();

      await say("Acme and Globex");

      await waitFor(() => expect(document.activeElement).toBe(composer()));
    });

    it("returns to the message box when a reply chooses the document", async () => {
      // The pane rebuilds around the new document, which is exactly when a
      // focus call made before the re-render would be lost.
      send.mockResolvedValue(reply({ document: "pilot-agreement" }));
      const { rerender } = renderChat({ chosen: false });

      await say("trialling our product");
      await waitFor(() => expect(send).toHaveBeenCalled());

      rerender(
        <DocumentChat
          document={{
            slug: "pilot-agreement",
            schema: mnda.schema,
            values: createDefaultValues(mnda.schema),
          }}
          onDocument={vi.fn()}
          onValues={vi.fn()}
        />,
      );

      await waitFor(() => expect(document.activeElement).toBe(composer()));
    });
  });

  describe("when something goes wrong", () => {
    it("says so without losing what was typed", async () => {
      send.mockRejectedValue(
        new ChatError("The assistant is unavailable just now."),
      );
      renderChat();

      await say("Acme and Globex");

      expect(await screen.findByRole("alert")).toHaveTextContent(
        "The assistant is unavailable just now.",
      );
      // Said, so it stays said; and back in the box so it need not be retyped.
      expect(transcript().getByText("Acme and Globex")).toBeInTheDocument();
      expect(composer()).toHaveValue("Acme and Globex");
    });

    it("leaves the document untouched", async () => {
      send.mockRejectedValue(new ChatError("Nope."));
      const { onValues } = renderChat();

      await say("Acme and Globex");

      await screen.findByRole("alert");
      expect(onValues).not.toHaveBeenCalled();
    });

    it("explains an unexpected failure in the same place", async () => {
      send.mockRejectedValue(new TypeError("undefined is not a function"));
      renderChat();

      await say("Acme");

      expect(await screen.findByRole("alert")).toHaveTextContent(
        "Something went wrong. Please try again.",
      );
    });
  });

  describe("when the backend is not running", () => {
    it("says so and points at the form", async () => {
      reachable.mockResolvedValue(false);
      renderChat();

      const notice = await screen.findByRole("status");
      expect(notice).toHaveTextContent("The chat needs the backend running");
      expect(notice).toHaveTextContent("You can still use the form");
    });

    it("takes the composer away rather than failing on send", async () => {
      reachable.mockResolvedValue(false);
      renderChat();

      await screen.findByRole("status");
      expect(screen.queryByLabelText("Message")).not.toBeInTheDocument();
    });
  });

  describe("the composer", () => {
    it("sends on Enter and starts a new line on Shift+Enter", async () => {
      const user = userEvent.setup();
      send.mockResolvedValue(reply());
      renderChat();

      await user.type(composer(), "First{Shift>}{Enter}{/Shift}Second");
      expect(send).not.toHaveBeenCalled();

      await user.type(composer(), "{Enter}");
      await waitFor(() => expect(send).toHaveBeenCalled());
      expect(send.mock.calls[0][0][0].content).toBe("First\nSecond");
    });

    it("will not send an empty message", async () => {
      const user = userEvent.setup();
      renderChat();

      await user.type(composer(), "   ");

      expect(screen.getByRole("button", { name: "Send" })).toBeDisabled();
      expect(send).not.toHaveBeenCalled();
    });
  });
});
