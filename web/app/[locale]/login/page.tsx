import { getTranslations } from "next-intl/server";
import { Layers } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { LanguageSwitch } from "@/components/shell";
export default async function Login({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { locale } = await params,
    t = await getTranslations("Console"),
    { error } = await searchParams;
  const safeError =
    error &&
    ["unauthorized", "forbidden", "identityUnavailable"].includes(error)
      ? error
      : null;
  return (
    <div className="flex min-h-screen flex-col">
      <header className="flex h-16 items-center justify-between border-b px-6">
        <div className="flex items-center gap-3 font-semibold">
          <Layers className="size-6 text-primary" />
          {t("brand")}
        </div>
        <LanguageSwitch />
      </header>
      <main className="m-auto flex w-full max-w-md flex-col gap-6 px-6 py-12">
        <h1 className="text-3xl font-semibold tracking-tight">
          {t("loginTitle")}
        </h1>
        <p className="text-muted-foreground">{t("loginDescription")}</p>
        {safeError ? (
          <Alert variant="destructive">
            <AlertDescription>{t(`errors.${safeError}`)}</AlertDescription>
          </Alert>
        ) : null}
        <Button asChild size="lg">
          <a href={`/api/auth/login?locale=${locale}`}>{t("signIn")}</a>
        </Button>
        <p className="text-sm text-muted-foreground">{t("loginFootnote")}</p>
      </main>
    </div>
  );
}
