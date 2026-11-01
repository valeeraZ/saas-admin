import { notFound, redirect } from "next/navigation";
import { requireSession } from "@/lib/auth";
import { ConsoleError } from "@/lib/security";
import {
  resources,
  readConsole,
  type Resource,
} from "../../../../src/console.ts";
import { Shell } from "@/components/shell";
import { Workspace } from "@/components/workspace";
export const dynamic = "force-dynamic";
export default async function Page({
  params,
}: {
  params: Promise<{ locale: string; resource: string }>;
}) {
  const { locale, resource } = await params;
  if (!resources.includes(resource as Resource)) notFound();
  let s;
  try {
    s = await requireSession();
  } catch (e) {
    if (e instanceof ConsoleError) redirect(`/${locale}/login?error=${e.code}`);
    throw e;
  }
  const initial = await readConsole({ resource });
  return (
    <Shell name={s.name} csrf={s.csrf} resource={resource}>
      <Workspace
        resource={resource as Resource}
        csrf={s.csrf}
        initial={initial}
      />
    </Shell>
  );
}
