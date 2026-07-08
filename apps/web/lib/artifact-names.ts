import path from "node:path";

type ArtifactNameSource = {
  path: string;
  type: string;
};

const PLAYWRIGHT_TRACE_FILE_PATTERN = /^trace(?:-\d+)?\.zip$/i;

export function getArtifactFileName(artifact: ArtifactNameSource): string {
  const fileName = path.basename(artifact.path);

  if (artifact.type !== "TRACE" || !PLAYWRIGHT_TRACE_FILE_PATTERN.test(fileName)) {
    return fileName;
  }

  const testOutputName = getPlaywrightTestOutputName(artifact.path);

  return testOutputName ? `${testOutputName}.${fileName}` : fileName;
}

function getPlaywrightTestOutputName(filePath: string): string | undefined {
  const segments = path.normalize(filePath).split(path.sep);
  const testResultsIndex = segments.lastIndexOf("test-results");
  const testOutputName =
    testResultsIndex >= 0 ? segments[testResultsIndex + 1] : undefined;

  if (!testOutputName || PLAYWRIGHT_TRACE_FILE_PATTERN.test(testOutputName)) {
    return undefined;
  }

  return testOutputName;
}
