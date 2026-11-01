"use client";
import { useState } from "react";
import { useTranslations, useLocale } from "next-intl";
import {
  Layers,
  LayoutGrid,
  Box,
  Download,
  FileText,
  LogOut,
  Menu,
} from "lucide-react";
import { Link, usePathname } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { cn } from "@/lib/utils";
const nav = [
  { key: "applications", icon: LayoutGrid },
  { key: "deployments", icon: Box },
  { key: "installations", icon: Download },
  { key: "audit", icon: FileText },
] as const;
export function LanguageSwitch() {
  const t = useTranslations("Console"),
    locale = useLocale(),
    path = usePathname();
  return (
    <nav className="flex items-center gap-1" aria-label={t("language")}>
      {(["en", "zh"] as const).map((language) => (
        <Button
          key={language}
          variant={locale === language ? "secondary" : "ghost"}
          asChild
        >
          <Link
            href={path}
            locale={language}
            aria-current={locale === language ? "page" : undefined}
          >
            {t(`languages.${language}`)}
          </Link>
        </Button>
      ))}
    </nav>
  );
}
export function Shell({
  children,
  name,
  csrf,
  resource,
}: {
  children: React.ReactNode;
  name: string;
  csrf: string;
  resource: string;
}) {
  const t = useTranslations("Console"),
    locale = useLocale();
  const [menu, setMenu] = useState(false),
    [error, setError] = useState("");
  async function logout() {
    try {
      const r = await fetch(`/api/auth/logout?locale=${locale}`, {
        method: "POST",
        headers: { "x-csrf-token": csrf },
      });
      const data = await r.json();
      if (!r.ok) throw Error(data.error);
      window.location.assign(data.location);
    } catch {
      setError("unavailable");
    }
  }
  return (
    <div className="min-h-screen bg-background">
      <aside
        className={cn(
          "fixed inset-y-0 left-0 hidden w-[216px] flex-col border-r bg-sidebar md:flex",
          menu &&
            "inset-y-auto top-14 flex w-full border-b md:inset-y-0 md:top-0 md:w-[216px]",
        )}
      >
        <Link
          href="/applications"
          className="hidden h-14 items-center gap-3 px-5 font-semibold md:flex"
        >
          <Layers className="size-6 text-primary" />
          {t("brand")}
        </Link>
        <nav aria-label={t("menu")} className="flex flex-col gap-1 p-3">
          {nav.map(({ key, icon: Icon }) => (
            <Link
              key={key}
              href={`/${key}`}
              onClick={() => setMenu(false)}
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-3 text-sm text-sidebar-foreground hover:bg-sidebar-accent",
                resource === key &&
                  "bg-sidebar-accent text-primary font-medium",
              )}
              aria-current={resource === key ? "page" : undefined}
            >
              <Icon className="size-5" />
              {t(key)}
            </Link>
          ))}
        </nav>
        <div className="mt-auto hidden items-center gap-3 border-t p-5 md:flex">
          <Avatar>
            <AvatarFallback>{name.slice(0, 2).toUpperCase()}</AvatarFallback>
          </Avatar>
          <span className="truncate text-sm">{name}</span>
        </div>
      </aside>
      <div className="md:ml-[216px]">
        <header className="flex h-14 items-center justify-between gap-3 border-b px-4 md:px-7">
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="icon"
              className="md:hidden"
              aria-label={t("menu")}
              aria-expanded={menu}
              onClick={() => setMenu(!menu)}
            >
              <Menu />
            </Button>
            <span className="hidden text-sm text-muted-foreground sm:block">
              {t("workspace")}
            </span>
            <span className="hidden text-muted-foreground sm:block">/</span>
            <span className="text-sm">{t(resource)}</span>
          </div>
          <div className="flex items-center gap-2">
            <LanguageSwitch />
            <Button variant="ghost" onClick={logout}>
              <LogOut data-icon="inline-start" />
              <span className="hidden sm:inline">{t("signOut")}</span>
              <span className="sr-only sm:hidden">{t("signOut")}</span>
            </Button>
          </div>
        </header>
        <main className="flex flex-col gap-7 p-4 md:p-7">
          {error ? (
            <Alert variant="destructive">
              <AlertDescription>{t(`errors.${error}`)}</AlertDescription>
            </Alert>
          ) : null}
          {children}
        </main>
      </div>
    </div>
  );
}
