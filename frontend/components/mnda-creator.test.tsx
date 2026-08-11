// @vitest-environment jsdom

import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { MndaCreator } from "./mnda-creator";
import type { CoverPageTemplate } from "@/lib/cover-page-template";
import { loadFixtures } from "@/test/helpers";

// The PDF renderer is dynamically imported by the download handler. Stubbing it
// keeps these tests about the flow; `mnda-pdf.test.tsx` covers real output.
const toBlob = vi.fn(async () => new Blob(["%PDF-1.3"], { type: "application/pdf" }));
const pdf = vi.fn(() => ({ toBlob }));

// The chat pane checks whether the backend is up when it mounts. These tests
// are about the form and the download, so that check is stubbed out rather than
// left to whatever a relative fetch does in this environment.
vi.mock("@/lib/chat", async () => ({
  ...(await vi.importActual<typeof import("@/lib/chat")>("@/lib/chat")),
  backendIsReachable: vi.fn(async () => true),
  sendMessage: vi.fn(),
}));

vi.mock("@react-pdf/renderer", () => ({
  pdf,
  // Referenced by `mnda-pdf.tsx`, which is imported alongside the renderer.
  Document: "Document",
  Page: "Page",
  Text: "Text",
  View: "View",
  Link: "Link",
  StyleSheet: { create: (styles: unknown) => styles },
}));

let template: CoverPageTemplate;
let standardTerms: string;

beforeAll(async () => {
  ({ template, standardTerms } = await loadFixtures());
});

beforeEach(() => {
  vi.clearAllMocks();
  URL.createObjectURL = vi.fn(() => "blob:mnda");
  URL.revokeObjectURL = vi.fn();
});

afterEach(() => {
  vi.restoreAllMocks();
});

const renderCreator = () =>
  render(<MndaCreator template={template} standardTerms={standardTerms} />);

/**
 * Renders with the form showing.
 *
 * Chat is what opens by default; these tests are about the form driving the
 * document, which is a path that has to keep working whether or not anyone
 * talks to the assistant.
 */
const renderForm = async () => {
  const rendered = renderCreator();
  await userEvent.click(screen.getByRole("tab", { name: "form" }));
  return rendered;
};

/** Scopes a query to the rendered agreement, away from the form's own wording. */
const agreement = () => within(screen.getByRole("article", { name: "Agreement" }));

describe("MndaCreator", () => {
  it("opens with the chat beside the document", () => {
    renderCreator();
    expect(screen.getByRole("region", { name: "Chat" })).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { level: 1, name: "Mutual NDA Creator" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Cover Page" })).toBeInTheDocument();
  });

  it("starts from the template's suggested purpose", async () => {
    await renderForm();
    expect(screen.getByLabelText("Purpose")).toHaveValue(
      "Evaluating whether to enter into a business relationship with the other party.",
    );
  });

  it("updates the document as the user types", async () => {
    const user = userEvent.setup();
    await renderForm();

    await user.type(screen.getByLabelText("Governing Law"), "Delaware");

    expect(agreement().getByText(/Governing Law: ?Delaware/)).toBeInTheDocument();
  });

  it("reflects a changed term in the document immediately", async () => {
    const user = userEvent.setup();
    await renderForm();

    expect(
      agreement().getByText("Expires 1 year from Effective Date."),
    ).toBeInTheDocument();

    await user.click(screen.getByLabelText(/Continues until terminated/));

    expect(
      agreement().getByText(
        "Continues until terminated in accordance with the terms of the MNDA.",
      ),
    ).toBeInTheDocument();
  });

  it("copies a party's company into the signature table", async () => {
    const user = userEvent.setup();
    await renderForm();

    const party1 = screen.getByRole("group", { name: "Party 1" });
    await user.type(within(party1).getByLabelText("Company"), "Acme Inc.");

    const row = screen.getByRole("rowheader", { name: "Company" }).closest("tr")!;
    expect(within(row).getAllByRole("cell")[0]).toHaveTextContent("Acme Inc.");
  });

  it("carries what the form was given back to the chat and on to the document", async () => {
    // The two are ways into one set of values. If they held separate state,
    // switching would quietly lose whatever the other had gathered.
    const user = userEvent.setup();
    await renderForm();

    await user.type(screen.getByLabelText("Governing Law"), "Delaware");
    await user.click(screen.getByRole("tab", { name: "chat" }));

    expect(screen.getByRole("region", { name: "Chat" })).toBeInTheDocument();
    expect(screen.queryByLabelText("Governing Law")).not.toBeInTheDocument();
    expect(agreement().getByText(/Governing Law: ?Delaware/)).toBeInTheDocument();

    await user.click(screen.getByRole("tab", { name: "form" }));
    expect(screen.getByLabelText("Governing Law")).toHaveValue("Delaware");
  });

  it("warns while details are still blank", () => {
    renderCreator();
    expect(
      screen.getByText("Blank details become empty lines to complete by hand."),
    ).toBeInTheDocument();
  });

  describe("download", () => {
    it("builds a PDF and saves it under a name identifying the parties", async () => {
      const user = userEvent.setup();
      const click = vi
        .spyOn(HTMLAnchorElement.prototype, "click")
        .mockImplementation(() => {});
      await renderForm();

      const party1 = screen.getByRole("group", { name: "Party 1" });
      const party2 = screen.getByRole("group", { name: "Party 2" });
      await user.type(within(party1).getByLabelText("Company"), "Acme Inc.");
      await user.type(within(party2).getByLabelText("Company"), "Globex Ltd.");

      await user.click(screen.getByRole("button", { name: "Download PDF" }));

      await waitFor(() => expect(click).toHaveBeenCalled());
      const anchor = click.mock.instances[0] as HTMLAnchorElement;
      expect(anchor.download).toBe("Mutual NDA - Acme Inc. and Globex Ltd..pdf");
      expect(anchor.href).toBe("blob:mnda");
      expect(pdf).toHaveBeenCalledTimes(1);
    });

    it("releases the object URL once the download has started", async () => {
      const user = userEvent.setup();
      vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
      renderCreator();

      await user.click(screen.getByRole("button", { name: "Download PDF" }));

      await waitFor(() =>
        expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:mnda"),
      );
    });

    it("re-enables the button after a download", async () => {
      const user = userEvent.setup();
      vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
      renderCreator();

      await user.click(screen.getByRole("button", { name: "Download PDF" }));

      await waitFor(() =>
        expect(screen.getByRole("button", { name: "Download PDF" })).toBeEnabled(),
      );
    });

    it("reports a failure instead of failing silently", async () => {
      const user = userEvent.setup();
      vi.spyOn(console, "error").mockImplementation(() => {});
      toBlob.mockRejectedValueOnce(new Error("no fonts"));
      renderCreator();

      await user.click(screen.getByRole("button", { name: "Download PDF" }));

      const alert = await screen.findByRole("alert");
      expect(alert).toHaveTextContent("Could not build the PDF. Please try again.");
    });

    it("recovers on a retry after a failure", async () => {
      const user = userEvent.setup();
      vi.spyOn(console, "error").mockImplementation(() => {});
      vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
      toBlob.mockRejectedValueOnce(new Error("transient"));
      renderCreator();

      const button = screen.getByRole("button", { name: "Download PDF" });
      await user.click(button);
      await screen.findByRole("alert");

      await user.click(screen.getByRole("button", { name: "Download PDF" }));

      await waitFor(() => expect(screen.queryByRole("alert")).not.toBeInTheDocument());
    });
  });
});
