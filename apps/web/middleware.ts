import { withAuth } from "next-auth/middleware";

type MiddlewareRequest = {
  nextUrl: {
    pathname: string;
    searchParams: URLSearchParams;
  };
};

export function isTraceViewerArtifactRequest(request: MiddlewareRequest): boolean {
  const segments = request.nextUrl.pathname.split("/");

  return (
    segments.length === 6 &&
    segments[1] === "api" &&
    segments[2] === "runs" &&
    segments[4] === "artifacts" &&
    request.nextUrl.searchParams.get("traceViewer") === "1" &&
    Boolean(request.nextUrl.searchParams.get("token"))
  );
}

export default withAuth({
  callbacks: {
    authorized({ req, token }) {
      return isTraceViewerArtifactRequest(req) || Boolean(token);
    },
  },
  pages: {
    signIn: "/login",
  },
});

export const config = {
  matcher: [
    "/((?!api/auth|api/setup|api/cli|setup|login|trace-viewer|_next/static|_next/image|favicon.ico).*)",
  ],
};
