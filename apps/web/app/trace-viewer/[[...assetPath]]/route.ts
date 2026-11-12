const TRACE_VIEWER_ORIGIN = "https://trace.playwright.dev";
const TRACE_VIEWER_DOCUMENTS = new Set([
  "index.html",
  "snapshot.html",
  "sw.bundle.js",
  "manifest.webmanifest",
  "playwright-logo.svg",
]);

function getTraceViewerPath(assetPath: string[]): string | undefined {
  if (assetPath.length === 0) {
    return "/index.html";
  }

  // Next has already decoded the route segments. Reject ambiguous URL syntax
  // rather than letting the URL parser normalize it into another resource.
  if (assetPath.some((segment) => !/^[a-zA-Z0-9_-][a-zA-Z0-9_.-]*$/.test(segment))) {
    return undefined;
  }

  const path = assetPath.join("/");
  const isRootResource =
    assetPath.length === 1 &&
    (TRACE_VIEWER_DOCUMENTS.has(path) ||
      /^[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+\.(js|css|woff2?|ttf)$/.test(path));
  const isAsset =
    assetPath.length > 1 &&
    assetPath[0] === "assets" &&
    /\.(js|css|json|wasm|woff2?|ttf|otf|png|jpe?g|gif|webp|svg|ico)$/.test(path);

  return isRootResource || isAsset ? `/${path}` : undefined;
}

type TraceViewerProxyContext = {
  params: Promise<{
    assetPath?: string[];
  }>;
};

export async function GET(request: Request, context: TraceViewerProxyContext) {
  const { assetPath = [] } = await context.params;
  const upstreamPath = getTraceViewerPath(assetPath);

  if (!upstreamPath) {
    return new Response("Not found", { status: 404 });
  }

  const requestUrl = new URL(request.url);
  const upstreamUrl = new URL(upstreamPath, TRACE_VIEWER_ORIGIN);

  if (
    upstreamUrl.origin !== TRACE_VIEWER_ORIGIN ||
    upstreamUrl.pathname !== upstreamPath
  ) {
    return new Response("Not found", { status: 404 });
  }

  upstreamUrl.search = requestUrl.search;

  const upstreamResponse = await fetch(upstreamUrl, {
    headers: {
      Accept: request.headers.get("accept") ?? "*/*",
    },
    redirect: "manual",
  });

  if (upstreamResponse.status >= 300 && upstreamResponse.status < 400) {
    await upstreamResponse.body?.cancel();
    return new Response("Trace viewer upstream redirected", {
      status: 502,
      headers: { "Cache-Control": "no-store" },
    });
  }
  const headers = new Headers();
  const contentType = upstreamResponse.headers.get("content-type");

  if (contentType) {
    headers.set("Content-Type", contentType);
  }

  headers.set(
    "Cache-Control",
    upstreamPath === "/index.html" ? "private, no-store" : "public, max-age=3600",
  );

  return new Response(upstreamResponse.body, {
    headers,
    status: upstreamResponse.status,
    statusText: upstreamResponse.statusText,
  });
}
