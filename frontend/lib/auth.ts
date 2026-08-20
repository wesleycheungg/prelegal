/**
 * Registering, signing in, and finding out who is signed in.
 *
 * The session is an HttpOnly cookie the browser holds and JavaScript cannot
 * read, so there is no token to keep here and nothing to put in local storage.
 * "Who am I" is a question for the server, asked with `currentUser`.
 *
 * The server's own messages are passed through rather than replaced: it already
 * distinguishes an address that is taken from a password that is too short, and
 * saying so is more use than a generic failure.
 */

export interface User {
  id: number;
  email: string;
  created_at: string;
}

/** Raised when the server refuses, or cannot be reached. */
export class AuthError extends Error {}

async function post(path: string, body?: unknown): Promise<Response> {
  try {
    return await fetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new AuthError("Could not reach the server. Is the backend running?");
  }
}

/**
 * The server's explanation, where it has one.
 *
 * FastAPI reports a failed field check as a list of problems rather than a
 * sentence, so the first one is unwrapped: "Password must be at least 8
 * characters" is worth showing, `[{...}]` is not.
 */
async function detailFrom(response: Response): Promise<string> {
  try {
    const { detail } = await response.json();
    if (typeof detail === "string") return detail;
    if (Array.isArray(detail) && typeof detail[0]?.msg === "string") {
      return detail[0].msg.replace(/^Value error, /, "");
    }
  } catch {
    // Falls through to the generic message below.
  }

  return "Something went wrong. Please try again.";
}

async function userFrom(response: Response): Promise<User> {
  if (!response.ok) throw new AuthError(await detailFrom(response));
  return (await response.json()) as User;
}

export async function signUp(email: string, password: string): Promise<User> {
  return userFrom(await post("/api/auth/signup", { email, password }));
}

export async function signIn(email: string, password: string): Promise<User> {
  return userFrom(await post("/api/auth/signin", { email, password }));
}

/**
 * Ends the session, and does not complain if it cannot.
 *
 * Signing out is a thing the user has decided; failing it because the server
 * did not answer would leave the app insisting they are still signed in. If the
 * backend is unreachable then `currentUser` reads as signed out anyway, and if
 * it comes back the cookie either expired or still works — neither of which is
 * improved by an error message here.
 */
export async function signOut(): Promise<void> {
  try {
    await post("/api/auth/signout");
  } catch {
    // Nothing useful to say, and nothing useful to do about it.
  }
}

/**
 * Whoever the session cookie names, or null.
 *
 * Null covers signed out, an expired cookie, and — routinely here — a cookie
 * naming a user the rebuilt database no longer has. None of those is an error
 * worth showing anyone, so they all read the same.
 */
export async function currentUser(signal?: AbortSignal): Promise<User | null> {
  try {
    const response = await fetch("/api/auth/me", { signal });
    return response.ok ? ((await response.json()) as User) : null;
  } catch {
    return null;
  }
}
