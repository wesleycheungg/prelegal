"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import type { ReactNode } from "react";

import { useSession } from "./session";
import { focusRing } from "./ui";
import { signOut } from "@/lib/auth";

/**
 * The bar across the top of every screen.
 *
 * Marked `no-print` in full: printing is how the agreement is exported, and
 * nothing here belongs on it.
 */
export function AppShell({ children }: { children: ReactNode }) {
  const { user, loading, refresh } = useSession();
  const pathname = usePathname();
  const router = useRouter();

  const leave = async () => {
    await signOut();
    await refresh();
    router.push("/");
  };

  return (
    <>
      <header className="no-print border-b border-line bg-surface">
        <div className="mx-auto flex max-w-[1600px] flex-wrap items-center gap-x-6 gap-y-3 px-6 py-3">
          <Link
            href="/"
            className={`rounded-sm text-lg font-semibold tracking-tight text-navy ${focusRing}`}
          >
            Prelegal
          </Link>

          <nav className="flex items-center gap-1 text-sm">
            <NavLink href="/" current={pathname}>
              Create
            </NavLink>
            {user && (
              <NavLink href="/documents" current={pathname}>
                My documents
              </NavLink>
            )}
          </nav>

          <div className="ml-auto flex items-center gap-3 text-sm">
            {/*
              Nothing is rendered until the first answer about the session, so
              a signed-in user never sees "Sign in" flash before their email.
            */}
            {loading ? null : user ? (
              <>
                <span className="hidden text-muted sm:inline">
                  {user.email}
                </span>
                <button
                  type="button"
                  onClick={leave}
                  className={`rounded-md px-2 py-1 font-medium text-navy hover:text-brand ${focusRing}`}
                >
                  Sign out
                </button>
              </>
            ) : (
              <>
                <Link
                  href="/sign-in"
                  className={`rounded-md px-2 py-1 font-medium text-navy hover:text-brand ${focusRing}`}
                >
                  Sign in
                </Link>
                <Link
                  href="/sign-up"
                  className={`rounded-md bg-submit px-3 py-1.5 font-medium text-white transition-colors hover:bg-submit/90 ${focusRing}`}
                >
                  Create account
                </Link>
              </>
            )}
          </div>
        </div>
      </header>

      {children}
    </>
  );
}

function NavLink({
  href,
  current,
  children,
}: {
  href: string;
  current: string;
  children: ReactNode;
}) {
  const active = current === href;

  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={`rounded-md px-3 py-1.5 font-medium transition-colors ${focusRing} ${
        active ? "bg-brand/10 text-brand" : "text-navy hover:bg-canvas"
      }`}
    >
      {children}
    </Link>
  );
}
