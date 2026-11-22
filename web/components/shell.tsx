import { cookies } from "next/headers";
import { ConsoleShell, type ConsoleResource } from "@/components/console-shell";

export async function Shell({
  children,
  name,
  csrf,
  resource,
}: {
  children: React.ReactNode;
  name: string;
  csrf: string;
  resource: ConsoleResource;
}) {
  const defaultOpen = (await cookies()).get("sidebar_state")?.value !== "false";

  return (
    <ConsoleShell
      name={name}
      csrf={csrf}
      resource={resource}
      defaultOpen={defaultOpen}
    >
      {children}
    </ConsoleShell>
  );
}
