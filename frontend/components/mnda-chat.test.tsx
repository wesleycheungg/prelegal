// @vitest-environment jsdom

import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { MndaChat } from "./mnda-chat";
import { sampleValues } from "@/test/helpers";

/**
 * The network is mocked at `lib/chat`, the module boundary, rather than at
 * `fetch` — the same way `mnda-creator.test.tsx` mocks the PDF renderer. These
 * tests are about what the pane does with an answer, not how it asks.
 */
vi.mock("@/lib/chat", async () => {
  const actual = await vi.importActual<typeof import("@/lib/chat")>("@/lib/chat");
  return {
    ...actual,
    backendIsReachable: vi.fn(),
    sendMessage: vi.fn(),
  };
});

const { backendIsReachable, sendMessage, ChatError } = await import("@/lib/chat");

const reachable = vi.mocked(backendIsReachable);
const send = vi.mocked(sendMessage);

/** A reply that settled one field, since a bare reply settles nothing. */
const replyWith = (reply: string, fields: Record<string, unknown> = {}) => ({
  reply,
  fields: {
    purpose: null,
    effective_date: null,
    mnda_term_kind: null,
    mnda_term_years: null,
    confidentiality_kind: null,
    confidentiality_years: null,
    governing_law: null,
    jurisdiction: null,
    modifications: null,
    party1_company: null,
    party1_name: null,
    party1_title: null,
    party1_notice_address: null,
    party2_company: null,
    party2_name: null,
    party2_title: null,
    party2_notice_address: null,
    ...fields,
  },
});

function setup(onValues = vi.fn()) {
  render(<MndaChat values={sampleValues()} onValues={onValues} />);
  return { onValues, user: userEvent.setup() };
}

beforeEach(() => {
  vi.clearAllMocks();
  reachable.mockResolvedValue(true);
});

describe("MndaChat", () => {
  it("opens with a greeting, without asking the assistant for one", async () => {
    setup();

    expect(screen.getByText(/I can put together a Mutual NDA/)).toBeInTheDocument();
    await waitFor(() => expect(reachable).toHaveBeenCalled());
    expect(send).not.toHaveBeenCalled();
  });

  it("sends what the user types and shows the reply", async () => {
    send.mockResolvedValue(replyWith("Who are the two companies?"));
    const { user } = setup();

    await user.type(screen.getByLabelText("Message"), "I need an NDA");
    await user.click(screen.getByRole("button", { name: "Send" }));

    expect(await screen.findByText("Who are the two companies?")).toBeInTheDocument();
    expect(screen.getByText("I need an NDA")).toBeInTheDocument();
  });

  it("writes what the assistant settled into the values", async () => {
    send.mockResolvedValue(
      replyWith("Noted.", { governing_law: "Delaware", party1_company: "Acme Inc." }),
    );
    const { onValues, user } = setup();

    await user.type(screen.getByLabelText("Message"), "Delaware law, we're Acme");
    await user.click(screen.getByRole("button", { name: "Send" }));

    await waitFor(() => expect(onValues).toHaveBeenCalled());
    const values = onValues.mock.calls[0][0];
    expect(values.governingLaw).toBe("Delaware");
    expect(values.party1.company).toBe("Acme Inc.");
  });

  it("lists what each turn filled in", async () => {
    send.mockResolvedValue(replyWith("Noted.", { governing_law: "Delaware" }));
    const { user } = setup();

    await user.type(screen.getByLabelText("Message"), "Delaware");
    await user.click(screen.getByRole("button", { name: "Send" }));

    const filled = await screen.findByRole("list", { name: "Filled in" });
    expect(filled).toHaveTextContent("Governing Law");
  });

  it("does not claim to have filled in anything when a turn settled nothing", async () => {
    // The list is read from the fields, not the sentence, so a reply that only
    // asks a question cannot appear to have changed the document.
    send.mockResolvedValue(replyWith("How long should it run?"));
    const { user } = setup();

    await user.type(screen.getByLabelText("Message"), "hello");
    await user.click(screen.getByRole("button", { name: "Send" }));

    await screen.findByText("How long should it run?");
    expect(screen.queryByRole("list", { name: "Filled in" })).not.toBeInTheDocument();
  });

  it("never sends its own greeting back to the assistant", async () => {
    send.mockResolvedValue(replyWith("Right."));
    const { user } = setup();

    await user.type(screen.getByLabelText("Message"), "hello");
    await user.click(screen.getByRole("button", { name: "Send" }));

    await waitFor(() => expect(send).toHaveBeenCalled());
    expect(send.mock.calls[0][0]).toEqual([{ role: "user", content: "hello" }]);
  });

  it("explains a failure and gives the message back", async () => {
    send.mockRejectedValue(new ChatError("The assistant is unavailable just now."));
    const { user } = setup();

    await user.type(screen.getByLabelText("Message"), "Delaware law");
    await user.click(screen.getByRole("button", { name: "Send" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "The assistant is unavailable just now.",
    );
    // Back in the box, so sending again is one keystroke.
    expect(screen.getByLabelText("Message")).toHaveValue("Delaware law");
  });

  it("leaves the agreement alone when a turn fails", async () => {
    send.mockRejectedValue(new ChatError("Nope."));
    const { onValues, user } = setup();

    await user.type(screen.getByLabelText("Message"), "Delaware");
    await user.click(screen.getByRole("button", { name: "Send" }));

    await screen.findByRole("alert");
    expect(onValues).not.toHaveBeenCalled();
  });

  it("says so when the backend is not running, rather than failing on send", async () => {
    reachable.mockResolvedValue(false);
    setup();

    const notice = await screen.findByRole("status");
    expect(notice).toHaveTextContent("needs the backend running");
    expect(screen.queryByLabelText("Message")).not.toBeInTheDocument();
  });

  it("will not send an empty message", async () => {
    const { user } = setup();

    await user.click(screen.getByRole("button", { name: "Send" }));

    expect(send).not.toHaveBeenCalled();
  });

  it("sends on Enter and takes a new line on shift and Enter", async () => {
    send.mockResolvedValue(replyWith("Right."));
    const { user } = setup();
    const box = screen.getByLabelText("Message");

    await user.type(box, "first{Shift>}{Enter}{/Shift}second");
    expect(send).not.toHaveBeenCalled();

    await user.type(box, "{Enter}");
    await waitFor(() => expect(send).toHaveBeenCalled());
    expect(send.mock.calls[0][0][0].content).toBe("first\nsecond");
  });
});
