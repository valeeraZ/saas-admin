"use client";

import { useLocale, useTranslations } from "next-intl";
import { Link, usePathname } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";
import { Button } from "@/components/ui/button";

export function LanguageSwitch() {
  const t = useTranslations("Console");
  const locale = useLocale();
  const pathname = usePathname();

  return (
    <nav className="flex items-center gap-1" aria-label={t("language")}>
      {routing.locales.map((language) => (
        <Button
          key={language}
          variant={locale === language ? "secondary" : "ghost"}
          size="sm"
          asChild
        >
          <Link
            href={pathname}
            locale={language}
            lang={language}
            aria-current={locale === language ? "page" : undefined}
          >
            {t(`languages.${language}`)}
          </Link>
        </Button>
      ))}
    </nav>
  );
}
