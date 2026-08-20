// @vitest-environment jsdom

import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { CredentialsForm } from "./credentials-form";
import { SessionProvider } from "./session";
import { AuthError, currentUser, signIn, signUp } from "@/lib/auth";

const push = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
  usePathname: () => "/sign-in",
}));

vi.mock("@/lib/auth", async () => ({
  ...(await vi.importActual<typeof import("@/lib/auth")>("@/lib/auth")),
  signIn: vi.fn(),
  signUp: vi.fn(),
  currentUser: vi.fn(async () => null),
}));

const USER = {
  id: 1,
  email: "ada@example.com",
  created_at: "2026-08-20T09:00:00Z",
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(currentUser).mockResolvedValue(null);
});

afterEach(() => {
  vi.restoreAllMocks();
});

const renderForm = (mode: "sign-in" | "sign-up") =>
  render(
    <SessionProvider>
      <CredentialsForm mode={mode} />
    </SessionProvider>,
  );

const fillIn = async (
  email = "ada@example.com",
  password = "correct-horse",
) => {
  const user = userEvent.setup();
  await user.type(screen.getByLabelText("Email"), email);
  await user.type(screen.getByLabelText("Password"), password);
  return user;
};

describe("CredentialsForm", () => {
  describe("signing in", () => {
    it("asks for an email and a password", () => {
      renderForm("sign-in");

      expect(screen.getByLabelText("Email")).toBeInTheDocument();
      expect(screen.getByLabelText("Password")).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: "Sign in" }),
      ).toBeInTheDocument();
    });

    it("signs in and goes to the app", async () => {
      vi.mocked(signIn).mockResolvedValue(USER);
      renderForm("sign-in");

      const user = await fillIn();
      await user.click(screen.getByRole("button", { name: "Sign in" }));

      await waitFor(() =>
        expect(signIn).toHaveBeenCalledWith("ada@example.com", "correct-horse"),
      );
      await waitFor(() => expect(push).toHaveBeenCalledWith("/"));
    });

    it("shows why it was refused, and stays put", async () => {
      vi.mocked(signIn).mockRejectedValue(
        new AuthError("Incorrect email or password"),
      );
      renderForm("sign-in");

      const user = await fillIn();
      await user.click(screen.getByRole("button", { name: "Sign in" }));

      expect(await screen.findByRole("alert")).toHaveTextContent(
        "Incorrect email or password",
      );
      expect(push).not.toHaveBeenCalled();
    });

    it("can be tried again after a refusal", async () => {
      vi.mocked(signIn).mockRejectedValueOnce(
        new AuthError("Incorrect email or password"),
      );
      renderForm("sign-in");

      const user = await fillIn();
      await user.click(screen.getByRole("button", { name: "Sign in" }));
      await screen.findByRole("alert");

      vi.mocked(signIn).mockResolvedValue(USER);
      await user.click(screen.getByRole("button", { name: "Sign in" }));

      await waitFor(() => expect(push).toHaveBeenCalledWith("/"));
    });

    it("offers the way to register instead", () => {
      renderForm("sign-in");

      expect(screen.getByRole("link", { name: "Create one" })).toHaveAttribute(
        "href",
        "/sign-up",
      );
    });

    it("asks the password manager for a saved password", () => {
      renderForm("sign-in");

      expect(screen.getByLabelText("Password")).toHaveAttribute(
        "autocomplete",
        "current-password",
      );
    });
  });

  describe("registering", () => {
    it("registers and goes to the app", async () => {
      vi.mocked(signUp).mockResolvedValue(USER);
      renderForm("sign-up");

      const user = await fillIn();
      await user.click(screen.getByRole("button", { name: "Create account" }));

      await waitFor(() =>
        expect(signUp).toHaveBeenCalledWith("ada@example.com", "correct-horse"),
      );
      await waitFor(() => expect(push).toHaveBeenCalledWith("/"));
    });

    it("says what the server will require of a password", () => {
      renderForm("sign-up");

      expect(screen.getByText("At least 8 characters.")).toBeInTheDocument();
      expect(screen.getByLabelText("Password")).toHaveAttribute(
        "minlength",
        "8",
      );
    });

    it("asks the password manager for a new password", () => {
      renderForm("sign-up");

      expect(screen.getByLabelText("Password")).toHaveAttribute(
        "autocomplete",
        "new-password",
      );
    });

    it("passes on an address that is already taken", async () => {
      vi.mocked(signUp).mockRejectedValue(
        new AuthError("That email is already registered"),
      );
      renderForm("sign-up");

      const user = await fillIn();
      await user.click(screen.getByRole("button", { name: "Create account" }));

      expect(await screen.findByRole("alert")).toHaveTextContent(
        "That email is already registered",
      );
    });

    it("warns that accounts do not survive a restart", () => {
      // True of this build, and better said than discovered.
      renderForm("sign-up");

      expect(
        screen.getByText(/cleared whenever the server restarts/),
      ).toBeInTheDocument();
    });
  });

  it("will not submit twice while the first is in flight", async () => {
    vi.mocked(signIn).mockImplementation(
      () => new Promise(() => {}) as Promise<typeof USER>,
    );
    renderForm("sign-in");

    const user = await fillIn();
    const button = screen.getByRole("button", { name: "Sign in" });
    await user.click(button);

    expect(button).toBeDisabled();
    expect(signIn).toHaveBeenCalledTimes(1);
  });
});
