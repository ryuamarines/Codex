import { LogDetailPage } from "@/components/log-detail-page";

export default async function LogDetailRoute({
  params
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  return <LogDetailPage id={id} />;
}
