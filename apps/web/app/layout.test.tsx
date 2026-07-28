import { type ReactElement } from "react";
import { describe, expect, it } from "vitest";

import { AppNotesIntegration } from "@/components/appnotes-integration";

import RootLayout, { metadata } from "./layout";

describe("metadata", () => {
  it("describes the product", () => {
    expect(metadata).toMatchObject({
      description: "Self-hosted synthetic checks runner and dashboard.",
      icons: {
        icon: [{ type: "image/svg+xml", url: "/favicon.svg" }],
      },
      title: "SelfChecks",
    });
  });
});

describe("RootLayout", () => {
  it("renders children in a dark English document shell", () => {
    const layout = RootLayout({
      children: <span>dashboard</span>,
    }) as ReactElement<{
      children: ReactElement<{
        children: ReactElement<Record<string, unknown>>[];
        suppressHydrationWarning: boolean;
      }>;
      className: string;
      lang: string;
    }>;
    const body = layout.props.children;
    const child = body.props.children[0]!;
    const appNotes = body.props.children[1]!;

    expect(layout.type).toBe("html");
    expect(layout.props.className).toBe("dark");
    expect(layout.props.lang).toBe("en");
    expect(body.props.suppressHydrationWarning).toBe(true);
    expect(child.props.children).toBe("dashboard");
    expect(appNotes.type).toBe(AppNotesIntegration);
  });
});
