import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Agreement Creator | Prelegal",
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
      <body className="flex min-h-full flex-col">{children}</body>
    </html>
  );
}
