"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { ChevronsUpDown, Layers, LogOut, X } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { navigation } from "@/components/console-navigation";
import { LanguageSwitch } from "@/components/language-switch";
import { NavigationSearch } from "@/components/navigation-search";
import { ThemeMenu } from "@/components/theme-menu";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Separator } from "@/components/ui/separator";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar";
import { TooltipProvider } from "@/components/ui/tooltip";
import type { Resource } from "../../src/console.ts";

export type ConsoleResource = Resource | "requests";

function ConsoleSidebar({
  resource,
  name,
  signingOut,
  onSignOut,
}: {
  resource: ConsoleResource;
  name: string;
  signingOut: boolean;
  onSignOut: () => void;
}) {
  const t = useTranslations("Console");
  const { isMobile, setOpenMobile } = useSidebar();

  return (
    <Sidebar
      collapsible="icon"
      mobileTitle={t("menu")}
      mobileDescription={t("navigateDescription")}
    >
      <SidebarHeader className="gap-0">
        <div className="flex items-center gap-2">
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton
                size="lg"
                asChild
                tooltip={t("brand")}
                className="group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:p-0!"
              >
                <Link
                  href="/applications"
                  aria-label={t("brand")}
                  onClick={() => setOpenMobile(false)}
                >
                  <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
                    <Layers className="size-4" aria-hidden="true" />
                  </span>
                  <span className="grid min-w-0 flex-1 gap-0.5 text-left group-data-[collapsible=icon]:hidden">
                    <span className="truncate font-semibold">{t("brand")}</span>
                    <span className="truncate text-xs text-muted-foreground">
                      {t("console")}
                    </span>
                  </span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
          {isMobile ? (
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={t("close")}
              onClick={() => setOpenMobile(false)}
            >
              <X />
            </Button>
          ) : null}
        </div>
      </SidebarHeader>

      <SidebarContent>
        <nav aria-label={t("menu")}>
          {navigation.map(({ title, items }) => (
            <SidebarGroup key={title}>
              <SidebarGroupLabel>{t(title)}</SidebarGroupLabel>
              <SidebarMenu>
                {items.map(({ key, icon: Icon }) => (
                  <SidebarMenuItem key={key}>
                    <SidebarMenuButton
                      asChild
                      isActive={resource === key}
                      tooltip={t(key)}
                    >
                      <Link
                        href={`/${key}`}
                        aria-label={t(key)}
                        aria-current={resource === key ? "page" : undefined}
                        onClick={() => setOpenMobile(false)}
                      >
                        <Icon aria-hidden="true" />
                        <span>{t(key)}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroup>
          ))}
        </nav>
      </SidebarContent>

      <Separator />
      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <SidebarMenuButton
                  size="lg"
                  tooltip={name}
                  aria-label={t("accountMenu", { name })}
                  className="group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:p-0!"
                >
                  <Avatar className="size-8 shrink-0">
                    <AvatarFallback>
                      {Array.from(name).slice(0, 2).join("").toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <span className="grid min-w-0 flex-1 gap-0.5 text-left group-data-[collapsible=icon]:hidden">
                    <span className="truncate font-medium">{name}</span>
                    <span className="truncate text-xs text-muted-foreground">
                      {t("operator")}
                    </span>
                  </span>
                  <ChevronsUpDown
                    aria-hidden="true"
                    className="group-data-[collapsible=icon]:hidden"
                  />
                </SidebarMenuButton>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                side={isMobile ? "top" : "right"}
                align="end"
                className="min-w-44"
              >
                <DropdownMenuLabel className="max-w-60 truncate">
                  {name}
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuGroup>
                  <DropdownMenuItem disabled={signingOut} onSelect={onSignOut}>
                    <LogOut />
                    {t("signOut")}
                  </DropdownMenuItem>
                </DropdownMenuGroup>
              </DropdownMenuContent>
            </DropdownMenu>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}

export function ConsoleShell({
  children,
  name,
  csrf,
  resource,
  defaultOpen,
}: {
  children: React.ReactNode;
  name: string;
  csrf: string;
  resource: ConsoleResource;
  defaultOpen: boolean;
}) {
  const t = useTranslations("Console");
  const locale = useLocale();
  const [signingOut, setSigningOut] = useState(false);
  const [logoutFailed, setLogoutFailed] = useState(false);

  async function logout() {
    setSigningOut(true);
    setLogoutFailed(false);
    try {
      const response = await fetch(`/api/auth/logout?locale=${locale}`, {
        method: "POST",
        headers: { "x-csrf-token": csrf },
      });
      if (!response.ok) throw new Error();
      const { location } = await response.json();
      window.location.assign(location);
    } catch {
      setLogoutFailed(true);
      setSigningOut(false);
    }
  }

  return (
    <TooltipProvider delayDuration={300}>
      <SidebarProvider defaultOpen={defaultOpen}>
        <a
          href="#console-content"
          className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:rounded-md focus:bg-background focus:px-3 focus:py-2 focus:ring-2"
        >
          {t("skipToContent")}
        </a>
        <ConsoleSidebar
          resource={resource}
          name={name}
          signingOut={signingOut}
          onSignOut={logout}
        />

        <SidebarInset className="min-w-0">
          <header className="sticky top-0 z-20 flex h-14 shrink-0 items-center gap-2 border-b bg-background px-3 sm:gap-3 sm:px-5">
            <SidebarTrigger variant="outline" aria-label={t("menu")} />
            <Separator orientation="vertical" className="my-4" />
            <Breadcrumb aria-label={t("breadcrumb")} className="min-w-0 flex-1">
              <BreadcrumbList className="flex-nowrap">
                <BreadcrumbItem className="hidden xl:inline-flex">
                  {t(
                    resource === "requests" || resource === "audit"
                      ? "governance"
                      : "workspace",
                  )}
                </BreadcrumbItem>
                <BreadcrumbSeparator className="hidden xl:flex" />
                <BreadcrumbItem className="min-w-0">
                  <BreadcrumbPage className="truncate">
                    {t(resource)}
                  </BreadcrumbPage>
                </BreadcrumbItem>
              </BreadcrumbList>
            </Breadcrumb>
            <NavigationSearch />
            <ThemeMenu />
            <LanguageSwitch />
          </header>

          <div
            id="console-content"
            tabIndex={-1}
            className="mx-auto flex w-full max-w-screen-2xl flex-1 scroll-mt-14 flex-col gap-5 px-4 py-6 sm:px-6 lg:px-8"
          >
            {logoutFailed ? (
              <Alert variant="destructive">
                <AlertDescription>{t("errors.unavailable")}</AlertDescription>
              </Alert>
            ) : null}
            {children}
          </div>
        </SidebarInset>
      </SidebarProvider>
    </TooltipProvider>
  );
}
