import { redirect } from "next/navigation";
import { requireSession } from "@/lib/auth";
import { ConsoleError } from "@/lib/security";
import { Shell } from "@/components/shell";
import { RequestsWorkspace } from "@/components/requests-workspace";
import { readRequests } from "../../../../src/access-requests.ts";
export const dynamic = "force-dynamic";
export default async function Page({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  let session;
  try {
    session = await requireSession();
  } catch (e) {
    if (e instanceof ConsoleError) redirect(`/${locale}/login?error=${e.code}`);
    throw e;
  }
  const initial = await readRequests(`oidc:${session.sub}`);
  return (
    <Shell name={session.name} csrf={session.csrf} resource="requests">
      <RequestsWorkspace initial={initial} csrf={session.csrf} />
    </Shell>
  );
}
