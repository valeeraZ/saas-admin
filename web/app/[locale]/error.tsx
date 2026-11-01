"use client";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
export default function ErrorPage({ reset }: { reset: () => void }) {
  const t = useTranslations("Console");
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-5 p-6">
      <h1 className="text-2xl font-semibold">{t("errorTitle")}</h1>
      <p>{t("errors.unavailable")}</p>
      <Button onClick={reset}>{t("retry")}</Button>
    </main>
  );
}
