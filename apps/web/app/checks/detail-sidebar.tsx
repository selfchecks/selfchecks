import { AppSidebar } from "@/components/app-sidebar";

export function DetailSidebar({
  accountLabel,
  projectSlug = "default",
}: {
  accountLabel: string;
  projectSlug?: string;
}) {
  return <AppSidebar accountLabel={accountLabel} projectSlug={projectSlug} />;
}
