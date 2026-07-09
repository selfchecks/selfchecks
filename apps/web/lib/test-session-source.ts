export type TestSessionSourceField = {
  href?: string;
  label: string;
  value: string;
};

export function formatTestSessionSource(
  source: string | null | undefined,
): TestSessionSourceField[] {
  const rawSource = source?.trim();

  if (!rawSource) {
    return [
      {
        label: "Source",
        value: "-",
      },
    ];
  }

  const parts = rawSource
    .split("|")
    .map((part) => part.trim())
    .filter(Boolean);

  if (parts.length <= 1) {
    return [
      {
        label: "Source",
        value: rawSource,
      },
    ];
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

export function getTestSessionSourceBranch(
  source: string | null | undefined,
): string | undefined {
  return formatTestSessionSource(source).find((field) => field.label === "Version")
    ?.value;
}

function pushSourceField(
  fields: TestSessionSourceField[],
  label: TestSessionSourceField["label"],
  value: string | undefined,
) {
  if (!value) {
    return;
  }

  fields.push({
    label,
    value,
  });
}

function parseSourceDetail(detail: string): TestSessionSourceField {
  const match = detail.match(/^(pipeline|job)\s+(.+)$/i);

  const [, kind, rawValue] = match ?? [];

  if (!kind || !rawValue) {
    return {
      label: "Detail",
      value: detail,
    };
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
