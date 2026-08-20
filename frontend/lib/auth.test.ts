import { afterEach, describe, expect, it, vi } from "vitest";

import { AuthError, currentUser, signIn, signOut, signUp } from "./auth";

const USER = {
  id: 1,
  email: "ada@example.com",
  created_at: "2026-08-20T09:00:00Z",
};

type Fetch = (url: string, init?: RequestInit) => Promise<Response>;

const answering = (body: unknown, status = 200) =>
  vi.fn<Fetch>(async () => new Response(JSON.stringify(body), { status }));

afterEach(() => {
  vi.restoreAllMocks();
});

describe("signUp", () => {
  it("registers and returns the new user", async () => {
    const fetchMock = answering(USER, 201);
    vi.stubGlobal("fetch", fetchMock);

    await expect(signUp("ada@example.com", "correct-horse")).resolves.toEqual(
      USER,
    );
    expect(fetchMock.mock.calls[0][0]).toBe("/api/auth/signup");
  });

  it("passes on the server's reason for refusing", async () => {
    // The server already distinguishes a taken address from a weak password,
    // and saying which is more use than a generic failure.
    vi.stubGlobal(
      "fetch",
      answering({ detail: "That email is already registered" }, 409),
    );

    await expect(signUp("ada@example.com", "correct-horse")).rejects.toThrow(
      "That email is already registered",
    );
  });

  it("unwraps a field validation message", async () => {
    // FastAPI reports these as a list of objects, which is not a sentence.
    vi.stubGlobal(
      "fetch",
      answering(
        { detail: [{ msg: "String should have at least 8 characters" }] },
        422,
      ),
    );

    await expect(signUp("ada@example.com", "short")).rejects.toThrow(
      "String should have at least 8 characters",
    );
  });

  it("strips pydantic's prefix from a custom validator message", async () => {
    vi.stubGlobal(
      "fetch",
      answering(
        { detail: [{ msg: "Value error, Password must be at most 72 bytes" }] },
        422,
      ),
    );

    await expect(signUp("ada@example.com", "x".repeat(80))).rejects.toThrow(
      "Password must be at most 72 bytes",
    );
  });
});

describe("signIn", () => {
  it("returns the user", async () => {
    vi.stubGlobal("fetch", answering(USER));

    await expect(signIn("ada@example.com", "correct-horse")).resolves.toEqual(
      USER,
    );
  });

  it("reports a refusal without guessing which half was wrong", async () => {
    vi.stubGlobal(
      "fetch",
      answering({ detail: "Incorrect email or password" }, 401),
    );

    await expect(signIn("ada@example.com", "wrong")).rejects.toThrow(
      "Incorrect email or password",
    );
  });

  it("explains an unreachable backend", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError("Failed to fetch");
      }),
    );

    await expect(signIn("ada@example.com", "correct-horse")).rejects.toThrow(
      AuthError,
    );
  });

  it("falls back to a readable message when the body is not JSON", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("<html>500</html>", { status: 500 })),
    );

    await expect(signIn("ada@example.com", "correct-horse")).rejects.toThrow(
      "Something went wrong. Please try again.",
    );
  });
});

describe("currentUser", () => {
  it("returns whoever the cookie names", async () => {
    vi.stubGlobal("fetch", answering(USER));

    await expect(currentUser()).resolves.toEqual(USER);
  });

  it("is null when signed out", async () => {
    // Routine here rather than exceptional: the database is rebuilt on every
    // start while the cookie in the browser outlives it.
    vi.stubGlobal("fetch", answering({ detail: "Not signed in" }, 401));

    await expect(currentUser()).resolves.toBeNull();
  });

  it("is null when the backend is not running", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError("Failed to fetch");
      }),
    );

    await expect(currentUser()).resolves.toBeNull();
  });
});

describe("signOut", () => {
  it("asks the server to clear the cookie", async () => {
    const fetchMock = answering({}, 204);
    vi.stubGlobal("fetch", fetchMock);

    await signOut();

    expect(fetchMock.mock.calls[0][0]).toBe("/api/auth/signout");
  });

  it("does not fail when the backend is unreachable", async () => {
    // The user has decided to sign out. Refusing to because the server did not
    // answer would leave the app insisting they are still signed in.
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError("Failed to fetch");
      }),
    );

    await expect(signOut()).resolves.toBeUndefined();
  });
});
