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

import { DocumentCreator } from "./document-creator";
import type { DocumentDefinition } from "@/lib/templates";
import { loadAllDocuments } from "@/test/helpers";

// The PDF renderer is dynamically imported by the download handler. Stubbing it
// keeps these tests about the flow; `document-pdf.test.tsx` covers real output.
const toBlob = vi.fn(
  async () => new Blob(["%PDF-1.3"], { type: "application/pdf" }),
);
const pdf = vi.fn(() => ({ toBlob }));

// The chat pane checks whether the backend is up when it mounts. These tests
// are about picking a document, the form and the download, so that check is
// stubbed rather than left to whatever a relative fetch does here.
vi.mock("@/lib/chat", async () => ({
  ...(await vi.importActual<typeof import("@/lib/chat")>("@/lib/chat")),
  backendIsReachable: vi.fn(async () => true),
  sendMessage: vi.fn(),
}));

vi.mock("@react-pdf/renderer", () => ({
  pdf,
  // Referenced by `document-pdf.tsx`, imported alongside the renderer.
  Document: "Document",
  Page: "Page",
  Text: "Text",
  View: "View",
  Link: "Link",
  StyleSheet: { create: (styles: unknown) => styles },
}));

let documents: DocumentDefinition[];

beforeAll(async () => {
  documents = await loadAllDocuments();
});

beforeEach(() => {
  vi.clearAllMocks();
  URL.createObjectURL = vi.fn(() => "blob:agreement");
  URL.revokeObjectURL = vi.fn();
});

afterEach(() => {
  vi.restoreAllMocks();
});

const renderCreator = () => render(<DocumentCreator documents={documents} />);

/** Picks a document, which is what the chat normally does. */
const choose = async (title: string) => {
  const user = userEvent.setup();
  await user.selectOptions(screen.getByLabelText("Agreement type"), [
    within(screen.getByLabelText("Agreement type")).getByRole("option", {
      name: title,
    }),
  ]);
};

const showForm = async () => {
  await userEvent.setup().click(screen.getByRole("button", { name: "form" }));
};

/** Scopes a query to the rendered agreement, away from the form's own wording. */
const agreement = () =>
  within(screen.getByRole("article", { name: "Agreement" }));

describe("DocumentCreator", () => {
  it("opens with the chat and nothing chosen", () => {
    renderCreator();

    expect(screen.getByRole("region", { name: "Chat" })).toBeInTheDocument();
    expect(
      screen.getByText(/Tell the assistant what you need/),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("article", { name: "Agreement" }),
    ).not.toBeInTheDocument();
  });

  it("offers every catalogued agreement", () => {
    renderCreator();

    const picker = within(screen.getByLabelText("Agreement type"));
    expect(
      picker.getByRole("option", { name: "Mutual Non-Disclosure Agreement" }),
    ).toBeInTheDocument();
    expect(
      picker.getByRole("option", { name: "Cloud Service Agreement" }),
    ).toBeInTheDocument();
  });

  it("shows the document once one is chosen", async () => {
    renderCreator();

    await choose("Mutual Non-Disclosure Agreement");

    expect(
      agreement().getByRole("heading", {
        name: "Mutual Non-Disclosure Agreement",
      }),
    ).toBeInTheDocument();
    expect(
      agreement().getByRole("heading", { name: "Cover Page" }),
    ).toBeInTheDocument();
    // The header names the tool; the document names itself.
    expect(
      screen.getByRole("heading", { level: 1, name: "Agreement Creator" }),
    ).toBeInTheDocument();
  });

  it("cannot download or open the form before a document is chosen", () => {
    renderCreator();

    expect(screen.getByRole("button", { name: "Download PDF" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "form" })).toBeDisabled();
  });

  it("starts from the template's suggested purpose", async () => {
    renderCreator();
    await choose("Mutual Non-Disclosure Agreement");
    await showForm();

    expect(screen.getByLabelText("Purpose")).toHaveValue(
      "Evaluating whether to enter into a business relationship with the other party.",
    );
  });

  it("updates the document as the user types", async () => {
    const user = userEvent.setup();
    renderCreator();
    await choose("Mutual Non-Disclosure Agreement");
    await showForm();

    await user.type(screen.getByLabelText("Governing Law"), "Delaware");

    expect(
      agreement().getByText(/Governing Law: ?Delaware/),
    ).toBeInTheDocument();
  });

  it("reflects a changed term in the document immediately", async () => {
    const user = userEvent.setup();
    renderCreator();
    await choose("Mutual Non-Disclosure Agreement");
    await showForm();

    expect(
      agreement().getByText("Expires 1 year from Effective Date."),
    ).toBeInTheDocument();

    const term = screen.getByRole("group", { name: /MNDA Term/ });
    await user.click(within(term).getAllByRole("radio")[1]);

    expect(
      agreement().getByText(
        "Continues until terminated in accordance with the terms of the MNDA.",
      ),
    ).toBeInTheDocument();
  });

  it("carries what the form was given back to the chat and on to the document", async () => {
    // The two are ways into one set of values. If they held separate state,
    // switching would quietly lose whatever the other had gathered.
    const user = userEvent.setup();
    renderCreator();
    await choose("Mutual Non-Disclosure Agreement");
    await showForm();

    await user.type(screen.getByLabelText("Governing Law"), "Delaware");
    await user.click(screen.getByRole("button", { name: "chat" }));

    expect(screen.getByRole("region", { name: "Chat" })).toBeInTheDocument();
    expect(screen.queryByLabelText("Governing Law")).not.toBeInTheDocument();
    expect(
      agreement().getByText(/Governing Law: ?Delaware/),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "form" }));
    expect(screen.getByLabelText("Governing Law")).toHaveValue("Delaware");
  });

  it("starts afresh when the document changes", async () => {
    // A Pilot Agreement has no Purpose to carry over, and a value from the
    // previous document would have nowhere to live.
    const user = userEvent.setup();
    renderCreator();
    await choose("Mutual Non-Disclosure Agreement");
    await showForm();
    await user.type(screen.getByLabelText("Governing Law"), "Delaware");

    await choose("Pilot Agreement");
    await showForm();

    expect(
      agreement().getByRole("heading", { name: "Pilot Agreement" }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Governing Law")).toHaveValue("");
    expect(screen.queryByLabelText("Purpose")).not.toBeInTheDocument();
  });

  it("names the parties the way the chosen document names them", async () => {
    renderCreator();
    await choose("Design Partner Agreement");
    await showForm();

    expect(screen.getByRole("group", { name: "PROVIDER" })).toBeInTheDocument();
    expect(screen.getByRole("group", { name: "PARTNER" })).toBeInTheDocument();
  });

  it("warns while details are still blank", async () => {
    renderCreator();
    await choose("Mutual Non-Disclosure Agreement");

    expect(
      screen.getByText("Blank details become empty lines to complete by hand."),
    ).toBeInTheDocument();
  });

  describe("download", () => {
    const fillCompanies = async () => {
      const user = userEvent.setup();
      await showForm();
      const party1 = screen.getByRole("group", { name: "PARTY 1" });
      const party2 = screen.getByRole("group", { name: "PARTY 2" });
      await user.type(within(party1).getByLabelText("Company"), "Acme Inc.");
      await user.type(within(party2).getByLabelText("Company"), "Globex Ltd.");
    };

    it("builds a PDF and saves it under a name identifying the parties", async () => {
      const user = userEvent.setup();
      const click = vi
        .spyOn(HTMLAnchorElement.prototype, "click")
        .mockImplementation(() => {});
      renderCreator();
      await choose("Mutual Non-Disclosure Agreement");
      await fillCompanies();

      await user.click(screen.getByRole("button", { name: "Download PDF" }));

      await waitFor(() => expect(click).toHaveBeenCalled());
      const anchor = click.mock.instances[0] as HTMLAnchorElement;
      expect(anchor.download).toBe(
        "Mutual Non-Disclosure Agreement - Acme Inc. and Globex Ltd..pdf",
      );
      expect(anchor.href).toBe("blob:agreement");
      expect(pdf).toHaveBeenCalledTimes(1);
    });

    it("names the file after whichever document is open", async () => {
      const user = userEvent.setup();
      const click = vi
        .spyOn(HTMLAnchorElement.prototype, "click")
        .mockImplementation(() => {});
      renderCreator();
      await choose("Pilot Agreement");

      await user.click(screen.getByRole("button", { name: "Download PDF" }));

      await waitFor(() => expect(click).toHaveBeenCalled());
      expect((click.mock.instances[0] as HTMLAnchorElement).download).toBe(
        "Pilot Agreement.pdf",
      );
    });

    it("releases the object URL once the download has started", async () => {
      const user = userEvent.setup();
      vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(
        () => {},
      );
      renderCreator();
      await choose("Mutual Non-Disclosure Agreement");

      await user.click(screen.getByRole("button", { name: "Download PDF" }));

      await waitFor(() =>
        expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:agreement"),
      );
    });

    it("re-enables the button after a download", async () => {
      const user = userEvent.setup();
      vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(
        () => {},
      );
      renderCreator();
      await choose("Mutual Non-Disclosure Agreement");

      await user.click(screen.getByRole("button", { name: "Download PDF" }));

      await waitFor(() =>
        expect(
          screen.getByRole("button", { name: "Download PDF" }),
        ).toBeEnabled(),
      );
    });

    it("reports a failure instead of failing silently", async () => {
      const user = userEvent.setup();
      vi.spyOn(console, "error").mockImplementation(() => {});
      toBlob.mockRejectedValueOnce(new Error("no fonts"));
      renderCreator();
      await choose("Mutual Non-Disclosure Agreement");

      await user.click(screen.getByRole("button", { name: "Download PDF" }));

      expect(await screen.findByRole("alert")).toHaveTextContent(
        "Could not build the PDF. Please try again.",
      );
    });

    it("recovers on a retry after a failure", async () => {
      const user = userEvent.setup();
      vi.spyOn(console, "error").mockImplementation(() => {});
      vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(
        () => {},
      );
      toBlob.mockRejectedValueOnce(new Error("transient"));
      renderCreator();
      await choose("Mutual Non-Disclosure Agreement");

      await user.click(screen.getByRole("button", { name: "Download PDF" }));
      await screen.findByRole("alert");

      await user.click(screen.getByRole("button", { name: "Download PDF" }));

      await waitFor(() =>
        expect(screen.queryByRole("alert")).not.toBeInTheDocument(),
      );
    });
  });
});
