import type { Metadata } from "next";
import "./globals.css";

import { AppShell } from "@/components/app-shell";
import { SessionProvider } from "@/components/session";

export const metadata: Metadata = {
  title: "Prelegal — draft an agreement",
  description:
    "Talk through what you need and generate a complete Common Paper agreement, ready to download.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="flex min-h-full flex-col">
        {/*
          One question about the session for the whole page, asked here so the
          header and whatever it sits above can never disagree about who is
          signed in.
        */}
        <SessionProvider>
          <AppShell>{children}</AppShell>
        </SessionProvider>
      </body>
    </html>
  );
}
