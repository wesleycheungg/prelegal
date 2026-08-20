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
import { SessionProvider } from "./session";
import { currentUser } from "@/lib/auth";
import {
  createSavedDocument,
  readSavedDocument,
  updateSavedDocument,
} from "@/lib/saved-documents";
import type { DocumentDefinition } from "@/lib/templates";
import { loadAllDocuments, sampleValues } from "@/test/helpers";

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

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
  usePathname: () => "/",
}));

vi.mock("@/lib/auth", async () => ({
  ...(await vi.importActual<typeof import("@/lib/auth")>("@/lib/auth")),
  currentUser: vi.fn(async () => null),
}));

vi.mock("@/lib/saved-documents", async () => ({
  ...(await vi.importActual<typeof import("@/lib/saved-documents")>(
    "@/lib/saved-documents",
  )),
  createSavedDocument: vi.fn(),
  updateSavedDocument: vi.fn(),
  readSavedDocument: vi.fn(),
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
  vi.mocked(currentUser).mockResolvedValue(null);
  window.history.replaceState({}, "", "/");
  URL.createObjectURL = vi.fn(() => "blob:agreement");
  URL.revokeObjectURL = vi.fn();
});

afterEach(() => {
  vi.restoreAllMocks();
});

const renderCreator = () =>
  render(
    <SessionProvider>
      <DocumentCreator documents={documents} />
    </SessionProvider>,
  );

const USER = {
  id: 1,
  email: "ada@example.com",
  created_at: "2026-08-20T09:00:00Z",
};
const SAVED = {
  id: 7,
  slug: "mutual-nda",
  name: "Acme and Globex",
  created_at: "2026-08-19T09:00:00Z",
  updated_at: "2026-08-20T09:00:00Z",
};

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
      screen.getByRole("heading", { level: 1, name: "Draft an agreement" }),
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

  describe("saving", () => {
    it("offers the way in rather than a Save button when signed out", async () => {
      renderCreator();
      await choose("Mutual Non-Disclosure Agreement");

      expect(
        await screen.findByRole("link", { name: "Sign in to save" }),
      ).toHaveAttribute("href", "/sign-in");
      expect(
        screen.queryByRole("button", { name: "Save" }),
      ).not.toBeInTheDocument();
    });

    it("saves the agreement under a name built from the parties", async () => {
      const user = userEvent.setup();
      vi.mocked(currentUser).mockResolvedValue(USER);
      vi.mocked(createSavedDocument).mockResolvedValue({
        ...SAVED,
        values: {} as never,
      });
      renderCreator();
      await choose("Mutual Non-Disclosure Agreement");
      await showForm();

      const party1 = screen.getByRole("group", { name: "PARTY 1" });
      const party2 = screen.getByRole("group", { name: "PARTY 2" });
      await user.type(within(party1).getByLabelText("Company"), "Acme Inc.");
      await user.type(within(party2).getByLabelText("Company"), "Globex Ltd.");

      await user.click(await screen.findByRole("button", { name: "Save" }));

      await waitFor(() => expect(createSavedDocument).toHaveBeenCalled());
      const [slug, name] = vi.mocked(createSavedDocument).mock.calls[0];
      expect(slug).toBe("mutual-nda");
      expect(name).toBe(
        "Mutual Non-Disclosure Agreement — Acme Inc. and Globex Ltd.",
      );
    });

    it("says so once it is saved, and lets the name be changed", async () => {
      const user = userEvent.setup();
      vi.mocked(currentUser).mockResolvedValue(USER);
      vi.mocked(createSavedDocument).mockResolvedValue({
        ...SAVED,
        values: {} as never,
      });
      renderCreator();
      await choose("Mutual Non-Disclosure Agreement");

      await user.click(await screen.findByRole("button", { name: "Save" }));

      expect(await screen.findByText("Saved")).toBeInTheDocument();
      expect(screen.getByLabelText("Document name")).toHaveValue(
        "Acme and Globex",
      );
    });

    it("says why a save was refused", async () => {
      const user = userEvent.setup();
      const { SaveError } = await vi.importActual<
        typeof import("@/lib/saved-documents")
      >("@/lib/saved-documents");
      vi.mocked(currentUser).mockResolvedValue(USER);
      vi.mocked(createSavedDocument).mockRejectedValue(
        new SaveError("That document is too large to save."),
      );
      renderCreator();
      await choose("Mutual Non-Disclosure Agreement");

      await user.click(await screen.findByRole("button", { name: "Save" }));

      expect(
        await screen.findByText("That document is too large to save."),
      ).toBeInTheDocument();
    });

    it("does not save anything the user did not ask to save", async () => {
      // Nobody who has not pressed Save should find drafts in their list.
      const user = userEvent.setup();
      vi.mocked(currentUser).mockResolvedValue(USER);
      renderCreator();
      await choose("Mutual Non-Disclosure Agreement");
      await showForm();
      await user.type(screen.getByLabelText("Governing Law"), "Delaware");

      expect(createSavedDocument).not.toHaveBeenCalled();
      expect(updateSavedDocument).not.toHaveBeenCalled();
    });

    it("forgets the saved document when the agreement type changes", async () => {
      const user = userEvent.setup();
      vi.mocked(currentUser).mockResolvedValue(USER);
      vi.mocked(createSavedDocument).mockResolvedValue({
        ...SAVED,
        values: {} as never,
      });
      renderCreator();
      await choose("Mutual Non-Disclosure Agreement");
      await user.click(await screen.findByRole("button", { name: "Save" }));
      await screen.findByText("Saved");

      await choose("Pilot Agreement");

      // A different agreement is a new document, not an edit of the last one.
      expect(
        await screen.findByRole("button", { name: "Save" }),
      ).toBeInTheDocument();
    });
  });

  describe("reopening", () => {
    it("loads whatever ?document= names", async () => {
      vi.mocked(currentUser).mockResolvedValue(USER);
      vi.mocked(readSavedDocument).mockResolvedValue({
        ...SAVED,
        values: sampleValues(),
      });
      window.history.replaceState({}, "", "/?document=7");

      renderCreator();

      await waitFor(() => expect(readSavedDocument).toHaveBeenCalledWith(7));
      expect(
        await screen.findByRole("article", { name: "Agreement" }),
      ).toBeInTheDocument();
      expect(screen.getByLabelText("Document name")).toHaveValue(
        "Acme and Globex",
      );
    });

    it("puts the saved values back into the document", async () => {
      vi.mocked(currentUser).mockResolvedValue(USER);
      vi.mocked(readSavedDocument).mockResolvedValue({
        ...SAVED,
        values: sampleValues(),
      });
      window.history.replaceState({}, "", "/?document=7");

      renderCreator();

      expect(
        await within(
          await screen.findByRole("article", { name: "Agreement" }),
        ).findByText(/Governing Law: ?Delaware/),
      ).toBeInTheDocument();
    });

    it("says so when it cannot be opened", async () => {
      vi.mocked(currentUser).mockResolvedValue(USER);
      vi.mocked(readSavedDocument).mockRejectedValue(new Error("gone"));
      window.history.replaceState({}, "", "/?document=7");

      renderCreator();

      expect(await screen.findByRole("alert")).toHaveTextContent(
        "Could not open that document.",
      );
    });

    it("asks for nothing when signed out", async () => {
      window.history.replaceState({}, "", "/?document=7");

      renderCreator();

      await waitFor(() => expect(currentUser).toHaveBeenCalled());
      expect(readSavedDocument).not.toHaveBeenCalled();
    });
  });
});
