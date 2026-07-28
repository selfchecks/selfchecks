import type { Metadata } from "next";
import type { ReactNode } from "react";

import { AppNotesIntegration } from "@/components/appnotes-integration";

import "./globals.css";

export const metadata: Metadata = {
  description: "Self-hosted synthetic checks runner and dashboard.",
  icons: {
    icon: [{ type: "image/svg+xml", url: "/favicon.svg" }],
  },
  title: "SelfChecks",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: ReactNode;
}>) {
  return (
    <html className="dark" lang="en">
      <body suppressHydrationWarning>
        {children}
        <AppNotesIntegration />
      </body>
    </html>
  );
}
