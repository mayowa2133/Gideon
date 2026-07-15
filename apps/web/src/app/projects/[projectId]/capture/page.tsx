import { CaptureWorkspace } from "@/components/CaptureWorkspace";

export default async function CapturePage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  return <CaptureWorkspace projectId={projectId} />;
}
