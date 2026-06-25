import { TraceArtifactViewer } from "./trace-artifact-viewer";

type TraceArtifactPageProps = {
  params: Promise<{
    artifactId: string;
    runId: string;
  }>;
};

export default async function TraceArtifactPage({ params }: TraceArtifactPageProps) {
  const { artifactId, runId } = await params;
  const encodedRunId = encodeURIComponent(runId);
  const encodedArtifactId = encodeURIComponent(artifactId);
  const artifactUrl = `/api/runs/${encodedRunId}/artifacts/${encodedArtifactId}`;
  const downloadUrl = `/api/runs/${encodedRunId}/artifacts/${encodedArtifactId}?download=1`;

  return (
    <TraceArtifactViewer
      artifactUrl={artifactUrl}
      downloadUrl={downloadUrl}
      runId={runId}
    />
  );
}
