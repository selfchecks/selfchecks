const TRACE_VIEWER_ORIGIN = "https://trace.playwright.dev";

type TraceViewerProxyContext = {
  params: Promise<{
    assetPath?: string[];
  }>;
};

export async function GET(request: Request, context: TraceViewerProxyContext) {
  const { assetPath = [] } = await context.params;
  const requestUrl = new URL(request.url);
  const upstreamUrl = new URL(assetPath.join("/"), `${TRACE_VIEWER_ORIGIN}/`);

  upstreamUrl.search = requestUrl.search;

  const upstreamResponse = await fetch(upstreamUrl, {
    headers: {
      Accept: request.headers.get("accept") ?? "*/*",
    },
  });
  const headers = new Headers();
  const contentType = upstreamResponse.headers.get("content-type");

  if (contentType) {
    headers.set("Content-Type", contentType);
  }

  headers.set(
    "Cache-Control",
    assetPath.length === 0 || assetPath.join("/") === "index.html"
      ? "private, no-store"
      : "public, max-age=3600",
  );

  return new Response(upstreamResponse.body, {
    headers,
    status: upstreamResponse.status,
    statusText: upstreamResponse.statusText,
  });
}
