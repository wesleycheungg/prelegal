"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useId, useState } from "react";

import { useSession } from "./session";
import { Button, Notice, Panel, inputClass } from "./ui";
import { AuthError, signIn, signUp } from "@/lib/auth";

/**
 * Signing in and registering, which are the same form twice.
 *
 * They take the same two fields and differ only in which endpoint they call and
 * what the buttons say, so writing them separately would mean two of everything
 * — including two chances to get the error handling wrong.
 */
export function CredentialsForm({ mode }: { mode: "sign-in" | "sign-up" }) {
  const registering = mode === "sign-up";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { refresh } = useSession();
  const router = useRouter();
  const emailId = useId();
  const passwordId = useId();

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (busy) return;

    setBusy(true);
    setError(null);

    try {
      await (registering ? signUp : signIn)(email, password);
      // The session cookie is set by now; the header and everything else read
      // it from here.
      await refresh();
      router.push("/");
    } catch (cause) {
      setError(
        cause instanceof AuthError
          ? cause.message
          : "Something went wrong. Please try again.",
      );
      setBusy(false);
    }
  };

  return (
    <Panel className="w-full max-w-md p-8">
      <h1 className="text-2xl font-semibold tracking-tight text-navy">
        {registering ? "Create your account" : "Welcome back"}
      </h1>
      <p className="mt-1 text-sm text-muted">
        {registering
          ? "An account keeps the agreements you draft, so you can come back to them."
          : "Sign in to reach the agreements you have saved."}
      </p>

      <form className="mt-6 space-y-4" onSubmit={submit}>
        <div>
          <label
            htmlFor={emailId}
            className="block text-sm font-medium text-navy"
          >
            Email
          </label>
          <input
            id={emailId}
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            className={`mt-1.5 ${inputClass}`}
          />
        </div>

        <div>
          <label
            htmlFor={passwordId}
            className="block text-sm font-medium text-navy"
          >
            Password
          </label>
          <input
            id={passwordId}
            type="password"
            // Tells a password manager whether to offer a saved password or a
            // new one, which is the difference between the two screens.
            autoComplete={registering ? "new-password" : "current-password"}
            required
            minLength={registering ? 8 : undefined}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            className={`mt-1.5 ${inputClass}`}
          />
          {registering && (
            <p className="mt-1 text-xs text-muted">At least 8 characters.</p>
          )}
        </div>

        {error && <Notice tone="error">{error}</Notice>}

        <Button type="submit" disabled={busy} className="w-full">
          {busy
            ? registering
              ? "Creating…"
              : "Signing in…"
            : registering
              ? "Create account"
              : "Sign in"}
        </Button>
      </form>

      <p className="mt-6 text-sm text-muted">
        {registering ? "Already have an account? " : "New here? "}
        <Link
          href={registering ? "/sign-in" : "/sign-up"}
          className="font-medium text-brand underline underline-offset-2"
        >
          {registering ? "Sign in" : "Create one"}
        </Link>
      </p>

      <p className="mt-4 text-xs text-muted">
        Accounts and saved documents are cleared whenever the server restarts.
      </p>
    </Panel>
  );
}
