"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Search } from "lucide-react";
import { useRouter } from "@/i18n/navigation";
import { navigation } from "@/components/console-navigation";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";

export function NavigationSearch() {
  const t = useTranslations("Console");
  const router = useRouter();
  const trigger = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    function handleShortcut(event: KeyboardEvent) {
      if (
        event.defaultPrevented ||
        event.key.toLowerCase() !== "k" ||
        !(event.metaKey || event.ctrlKey) ||
        event.altKey ||
        event.shiftKey
      )
        return;
      // Leave shortcuts local to open forms, sheets and menus.
      if (
        !open &&
        document.querySelector(
          '[role="dialog"], [role="alertdialog"], [role="menu"]',
        )
      )
        return;
      event.preventDefault();
      if (!event.repeat) setOpen(!open);
    }
    document.addEventListener("keydown", handleShortcut);
    return () => document.removeEventListener("keydown", handleShortcut);
  }, [open]);

  return (
    <>
      <Button
        ref={trigger}
        variant="outline"
        size="sm"
        className="justify-start sm:w-40 xl:w-52"
        aria-label={t("navigate")}
        aria-keyshortcuts="Meta+K Control+K"
        aria-haspopup="dialog"
        onClick={() => setOpen(true)}
      >
        <Search data-icon="inline-start" />
        <span className="hidden truncate sm:inline">{t("navigate")}</span>
        <kbd className="ml-auto hidden rounded border bg-muted px-1 font-mono text-xs lg:inline">
          <span aria-hidden="true">⌘</span>K
        </kbd>
      </Button>
      <CommandDialog
        open={open}
        onOpenChange={setOpen}
        title={t("navigate")}
        description={t("navigateDescription")}
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          trigger.current?.focus();
        }}
      >
        <Command>
          <CommandInput
            placeholder={t("navigate")}
            aria-label={t("navigate")}
          />
          <CommandList>
            <CommandEmpty>{t("empty")}</CommandEmpty>
            {navigation.map(({ title, items }) => (
              <CommandGroup key={title} heading={t(title)}>
                {items.map(({ key, icon: Icon }) => (
                  <CommandItem
                    key={key}
                    value={key}
                    keywords={[t(key)]}
                    onSelect={() => {
                      setOpen(false);
                      router.push(`/${key}`);
                    }}
                  >
                    <Icon />
                    {t(key)}
                  </CommandItem>
                ))}
              </CommandGroup>
            ))}
          </CommandList>
        </Command>
      </CommandDialog>
    </>
  );
}
