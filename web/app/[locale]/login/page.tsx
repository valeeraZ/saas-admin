import { getTranslations } from "next-intl/server";
import { ArrowRight, Layers } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { LanguageSwitch } from "@/components/language-switch";
import { ThemeMenu } from "@/components/theme-menu";

export default async function Login({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const [{ locale }, { error }, t] = await Promise.all([
    params,
    searchParams,
    getTranslations("Console"),
  ]);
  const safeError =
    error &&
    ["unauthorized", "forbidden", "identityUnavailable"].includes(error)
      ? error
      : null;

  return (
    <div className="flex min-h-svh flex-col bg-muted/35">
      <header className="flex h-14 shrink-0 items-center justify-end gap-2 px-4 sm:px-6">
        <ThemeMenu />
        <LanguageSwitch />
      </header>
      <main className="m-auto flex w-full max-w-md flex-col items-center gap-5 px-4 py-8">
        <div className="flex items-center gap-2.5 text-sm font-semibold">
          <span className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <Layers className="size-4" aria-hidden="true" />
          </span>
          {t("brand")}
        </div>
        <Card className="w-full">
          <CardHeader>
            <CardTitle>
              <h1 className="text-xl font-semibold tracking-tight">
                {t("loginTitle")}
              </h1>
            </CardTitle>
            <CardDescription>{t("loginDescription")}</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            {safeError ? (
              <Alert variant="destructive">
                <AlertDescription>{t(`errors.${safeError}`)}</AlertDescription>
              </Alert>
            ) : null}
            <Button asChild size="lg">
              <a href={`/api/auth/login?locale=${locale}`}>
                {t("signIn")}
                <ArrowRight data-icon="inline-end" />
              </a>
            </Button>
          </CardContent>
          <CardFooter>
            <p className="text-xs text-muted-foreground">
              {t("loginFootnote")}
            </p>
          </CardFooter>
        </Card>
      </main>
    </div>
  );
}
