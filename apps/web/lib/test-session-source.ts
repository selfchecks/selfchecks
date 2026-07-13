export type TestSessionSourceField = {
  href?: string;
  label: string;
  value: string;
};

export type TestSessionSourceMetadata = {
  commitSha?: string;
  jobUrl?: string;
  pipelineUrl?: string;
  ref?: string;
  repository?: string;
  source?: string;
};

export function formatTestSessionSource(
  value: TestSessionSourceMetadata | string | null | undefined,
): TestSessionSourceField[] {
  const metadata = normalizeMetadata(value);
  const hasStructuredMetadata = Boolean(
    metadata.repository ||
    metadata.ref ||
    metadata.pipelineUrl ||
    metadata.jobUrl ||
    (!metadata.source && metadata.commitSha),
  );

  if (!hasStructuredMetadata) {
    return formatLegacySource(metadata.source);
  }

  const fields: TestSessionSourceField[] = [];

  pushSourceField(fields, "Repository", metadata.repository);
  pushSourceField(fields, "Version", metadata.ref);
  pushSourceField(fields, "Commit", shortenCommitSha(metadata.commitSha));
  pushUrlField(fields, "Pipeline", metadata.pipelineUrl);
  pushUrlField(fields, "Job", metadata.jobUrl);

  return fields.length > 0 ? fields : [{ label: "Source", value: "-" }];
}

export function getTestSessionSourceBranch(
  value: TestSessionSourceMetadata | string | null | undefined,
): string | undefined {
  const metadata = normalizeMetadata(value);

  return (
    metadata.ref ||
    formatLegacySource(metadata.source).find((field) => field.label === "Version")
      ?.value
  );
}

function normalizeMetadata(
  value: TestSessionSourceMetadata | string | null | undefined,
): TestSessionSourceMetadata {
  if (typeof value === "string" || value == null) {
    return {
      source: value ?? undefined,
    };
  }

  return value;
}

function formatLegacySource(
  source: string | null | undefined,
): TestSessionSourceField[] {
  const rawSource = source?.trim();

  if (!rawSource) {
    return [{ label: "Source", value: "-" }];
  }

  const parts = rawSource
    .split("|")
    .map((part) => part.trim())
    .filter(Boolean);

  if (parts.length <= 1) {
    return [{ label: "Source", value: rawSource }];
  }

  const [repository, version, commit, ...details] = parts;
  const fields: TestSessionSourceField[] = [];

  pushSourceField(fields, "Repository", repository);
  pushSourceField(fields, "Version", version);
  pushSourceField(fields, "Commit", commit);

  for (const detail of details) {
    fields.push(parseSourceDetail(detail));
  }

  return fields.length > 0 ? fields : [{ label: "Source", value: rawSource }];
}

function pushSourceField(
  fields: TestSessionSourceField[],
  label: TestSessionSourceField["label"],
  value: string | undefined,
) {
  if (value) {
    fields.push({ label, value });
  }
}

function pushUrlField(
  fields: TestSessionSourceField[],
  label: TestSessionSourceField["label"],
  value: string | undefined,
) {
  if (!value) {
    return;
  }

  fields.push({
    ...(isHttpUrl(value) ? { href: value } : {}),
    label,
    value,
  });
}

function shortenCommitSha(value: string | undefined): string | undefined {
  return value && value.length > 8 ? value.slice(0, 8) : value;
}

function parseSourceDetail(detail: string): TestSessionSourceField {
  const match = detail.match(/^(pipeline|job)\s+(.+)$/i);
  const [, kind, rawValue] = match ?? [];

  if (!kind || !rawValue) {
    return { label: "Detail", value: detail };
  }

  const label = kind.toLowerCase() === "pipeline" ? "Pipeline" : "Job";
  const value = rawValue.trim();

  return {
    ...(isHttpUrl(value) ? { href: value } : {}),
    label,
    value,
  };
}

function isHttpUrl(value: string) {
  try {
    const url = new URL(value);

    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}
