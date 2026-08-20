// @vitest-environment jsdom

import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { SavedDocuments } from "./saved-documents";
import { SessionProvider } from "./session";
import { currentUser } from "@/lib/auth";
import { deleteSavedDocument, listSavedDocuments } from "@/lib/saved-documents";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
  usePathname: () => "/documents",
}));

vi.mock("@/lib/auth", async () => ({
  ...(await vi.importActual<typeof import("@/lib/auth")>("@/lib/auth")),
  currentUser: vi.fn(async () => null),
}));

vi.mock("@/lib/saved-documents", async () => ({
  ...(await vi.importActual<typeof import("@/lib/saved-documents")>(
    "@/lib/saved-documents",
  )),
  listSavedDocuments: vi.fn(async () => []),
  deleteSavedDocument: vi.fn(async () => {}),
}));

const USER = {
  id: 1,
  email: "ada@example.com",
  created_at: "2026-08-20T09:00:00Z",
};

const SAVED = [
  {
    id: 7,
    slug: "mutual-nda",
    name: "Acme and Globex",
    created_at: "2026-08-19T09:00:00Z",
    updated_at: "2026-08-20T09:00:00Z",
  },
  {
    id: 8,
    slug: "pilot-agreement",
    name: "Pilot with Initech",
    created_at: "2026-08-18T09:00:00Z",
    updated_at: "2026-08-18T09:00:00Z",
  },
];

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(currentUser).mockResolvedValue(null);
  vi.mocked(listSavedDocuments).mockResolvedValue([]);
});

afterEach(() => {
  vi.restoreAllMocks();
});

const renderList = () =>
  render(
    <SessionProvider>
      <SavedDocuments />
    </SessionProvider>,
  );

describe("SavedDocuments", () => {
  describe("signed out", () => {
    it("asks the visitor to sign in, and does not ask the server for anything", async () => {
      renderList();

      expect(
        await screen.findByText(
          "Sign in to see the agreements you have saved.",
        ),
      ).toBeInTheDocument();
      expect(listSavedDocuments).not.toHaveBeenCalled();
    });

    it("offers the way in", async () => {
      renderList();

      expect(
        await screen.findByRole("link", { name: "Sign in" }),
      ).toHaveAttribute("href", "/sign-in");
    });
  });

  describe("signed in", () => {
    beforeEach(() => {
      vi.mocked(currentUser).mockResolvedValue(USER);
    });

    it("lists what was saved", async () => {
      vi.mocked(listSavedDocuments).mockResolvedValue(SAVED);
      renderList();

      expect(
        await screen.findByRole("link", { name: "Acme and Globex" }),
      ).toBeInTheDocument();
      expect(
        screen.getByRole("link", { name: "Pilot with Initech" }),
      ).toBeInTheDocument();
    });

    it("links each one back to the creator by id", async () => {
      // The id lives in the URL so a saved agreement survives a reload and can
      // be bookmarked.
      vi.mocked(listSavedDocuments).mockResolvedValue(SAVED);
      renderList();

      expect(
        await screen.findByRole("link", { name: "Acme and Globex" }),
      ).toHaveAttribute("href", "/?document=7");
    });

    it("says so when there is nothing saved yet", async () => {
      renderList();

      expect(
        await screen.findByText("You have not saved anything yet."),
      ).toBeInTheDocument();
      expect(
        screen.getByRole("link", { name: "Draft an agreement" }),
      ).toHaveAttribute("href", "/");
    });

    it("removes a document when asked, without a reload", async () => {
      const user = userEvent.setup();
      vi.mocked(listSavedDocuments).mockResolvedValue(SAVED);
      renderList();

      const row = (
        await screen.findByRole("link", { name: "Acme and Globex" })
      ).closest("li")!;
      await user.click(within(row).getByRole("button", { name: "Delete" }));

      await waitFor(() => expect(deleteSavedDocument).toHaveBeenCalledWith(7));
      await waitFor(() =>
        expect(
          screen.queryByRole("link", { name: "Acme and Globex" }),
        ).not.toBeInTheDocument(),
      );
      // The other one is untouched.
      expect(
        screen.getByRole("link", { name: "Pilot with Initech" }),
      ).toBeInTheDocument();
    });

    it("keeps the document listed when deleting fails", async () => {
      const user = userEvent.setup();
      vi.mocked(listSavedDocuments).mockResolvedValue(SAVED);
      vi.mocked(deleteSavedDocument).mockRejectedValue(new Error("nope"));
      renderList();

      const row = (
        await screen.findByRole("link", { name: "Acme and Globex" })
      ).closest("li")!;
      await user.click(within(row).getByRole("button", { name: "Delete" }));

      expect(await screen.findByRole("alert")).toBeInTheDocument();
      expect(
        screen.getByRole("link", { name: "Acme and Globex" }),
      ).toBeInTheDocument();
    });

    it("says so when the list cannot be loaded", async () => {
      vi.mocked(listSavedDocuments).mockRejectedValue(new Error("down"));
      renderList();

      expect(await screen.findByRole("alert")).toHaveTextContent(
        "Could not load your documents.",
      );
    });

    it("warns that saved documents do not survive a restart", async () => {
      renderList();

      expect(
        await screen.findByText(/cleared when the server restarts/),
      ).toBeInTheDocument();
    });
  });
});
