import { LogEditPage } from "@/components/log-edit-page";

export default async function LogEditRoute({
  params
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  return <LogEditPage id={id} />;
}
