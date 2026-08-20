"use client";

import {
  type ReactNode,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";

import { type User, currentUser } from "@/lib/auth";

interface Session {
  user: User | null;
  /** True until the first answer arrives, so nothing flashes "signed out". */
  loading: boolean;
  /** Called after signing in or out, to re-read who is signed in. */
  refresh: () => Promise<void>;
}

const SessionContext = createContext<Session>({
  user: null,
  loading: true,
  refresh: async () => {},
});

/**
 * Who is signed in, asked once and shared.
 *
 * The session lives in an HttpOnly cookie, so the only way to know is to ask
 * the server. Holding the answer here means the header and the page below it
 * agree, and that a page load costs one request rather than one per component.
 */
export function SessionProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setUser(await currentUser());
    setLoading(false);
  }, []);

  useEffect(() => {
    const controller = new AbortController();

    currentUser(controller.signal).then((found) => {
      if (controller.signal.aborted) return;
      setUser(found);
      setLoading(false);
    });

    return () => controller.abort();
  }, []);

  return (
    <SessionContext value={{ user, loading, refresh }}>
      {children}
    </SessionContext>
  );
}

export function useSession(): Session {
  return useContext(SessionContext);
}
