"use client";

import { useTheme } from "next-themes";
import { useTranslations } from "next-intl";
import { Monitor, Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const themes = [
  { key: "light", icon: Sun },
  { key: "dark", icon: Moon },
  { key: "system", icon: Monitor },
] as const;

export function ThemeMenu() {
  const t = useTranslations("Console");
  const { theme, setTheme } = useTheme();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon-sm" aria-label={t("theme")}>
          <Sun className="dark:hidden" />
          <Moon className="hidden dark:block" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuRadioGroup value={theme} onValueChange={setTheme}>
          {themes.map(({ key, icon: Icon }) => (
            <DropdownMenuRadioItem key={key} value={key}>
              <Icon />
              {t(`themes.${key}`)}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
