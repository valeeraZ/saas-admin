"use client";
import { useState, useRef } from "react";
import { useTranslations, useFormatter } from "next-intl";
import {
  Plus,
  Pencil,
  Search,
  RefreshCw,
  Box,
  Check,
  ArrowRightLeft,
  Ban,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "@/components/ui/input-group";
import { WorkspaceHeading } from "@/components/workspace-heading";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import {
  Empty,
  EmptyHeader,
  EmptyTitle,
  EmptyDescription,
} from "@/components/ui/empty";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { AccessDialog } from "./access-dialog";
import { OperationDialog, type Edit } from "./operation-dialog";
import type { Resource } from "../../src/console.ts";
type Row = Record<string, unknown>;
type Page = { items: Row[]; nextCursor: string | null };
const text = (r: Row, key: string) => String(r[key] ?? "");
export function Workspace({
  resource,
  csrf,
  initial,
}: {
  resource: Resource;
  csrf: string;
  initial: Page;
}) {
  const t = useTranslations("Console"),
    fmt = useFormatter();
  const [data, setData] = useState(initial),
    [q, setQ] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [notice, setNotice] = useState(false),
    [edit, setEdit] = useState<Edit | null>(null),
    [details, setDetails] = useState<Row | null>(null);
  const [access, setAccess] = useState<Row | null>(null);
  const request = useRef<AbortController | null>(null);
  async function load(more = false, search = q) {
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    setBusy(true);
    setError("");
    const params = new URLSearchParams({ resource, q: search });
    if (more && data.nextCursor) params.set("cursor", data.nextCursor);
    try {
      const r = await fetch("/api/management?" + params, {
          signal: controller.signal,
          cache: "no-store",
        }),
        next = await r.json();
      if (!r.ok) throw Error(next.error);
      setData((old) => ({
        items: more ? [...old.items, ...next.items] : next.items,
        nextCursor: next.nextCursor,
      }));
    } catch (e) {
      if (controller.signal.aborted) return;
      setData({ items: [], nextCursor: null });
      const code = e instanceof Error ? e.message : "unavailable";
      setError(
        ["unauthorized", "forbidden", "identityUnavailable"].includes(code)
          ? code
          : "unavailable",
      );
    } finally {
      if (!controller.signal.aborted) setBusy(false);
    }
  }
  function create() {
    const date = new Date(Date.now() + 86400000 * 30).toISOString();
    setEdit(
      resource === "applications"
        ? {
            kind: "app",
            values: {
              id: crypto.randomUUID(),
              name: "",
              description: "",
              suffix: "",
              active: true,
            },
          }
        : resource === "deployments"
          ? {
              kind: "runtime-deployment",
              values: {
                id: crypto.randomUUID(),
                appId: "",
                targetOrigin: "",
                digest: "",
                runtime: "http",
                assetVersion: "",
              },
            }
          : {
              kind: "publication",
              values: {
                appId: "",
                deploymentId: "",
                enabled: true,
                entitled: true,
                validUntil: date,
              },
            },
    );
  }
  const date = (value: unknown) =>
    value
      ? fmt.dateTime(new Date(String(value)), {
          dateStyle: "medium",
          timeStyle: "short",
        })
      : "—";
  const badge = (status: string) => (
    <Badge
      variant={
        status === "ready" || status === "active" ? "success" : "secondary"
      }
    >
      {t(status)}
    </Badge>
  );
  const application = (r: Row) => (
    <div className="flex items-center gap-4">
      <div className="hidden size-10 shrink-0 items-center justify-center rounded-lg bg-muted sm:flex">
        <Box className="size-5 text-muted-foreground" />
      </div>
      <div className="flex max-w-36 flex-col gap-1 sm:max-w-80">
        <span className="truncate font-medium">
          {text(r, "name") || text(r, "appName")}
        </span>
        {r.description ? (
          <span className="truncate text-sm text-muted-foreground">
            {text(r, "description")}
          </span>
        ) : null}
      </div>
    </div>
  );
  return (
    <>
      {access ? (
        <AccessDialog
          appId={text(access, "id")}
          name={text(access, "name")}
          csrf={csrf}
          onClose={() => setAccess(null)}
        />
      ) : null}
      <WorkspaceHeading
        title={t(resource)}
        description={t(`${resource}Description`)}
      >
        {resource !== "audit" ? (
          <Button onClick={create}>
            <Plus data-icon="inline-start" />
            {t(
              resource === "applications"
                ? "newApp"
                : resource === "deployments"
                  ? "newDeployment"
                  : "newInstallation",
            )}
          </Button>
        ) : null}
      </WorkspaceHeading>
      <div className="flex items-center gap-2">
        <form
          className="w-72 max-w-full min-w-0"
          onSubmit={(e) => {
            e.preventDefault();
            load(false);
          }}
        >
          <InputGroup>
            <InputGroupInput
              placeholder={t("search", { resource: t(resource) })}
              aria-label={t("search", { resource: t(resource) })}
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
            <InputGroupAddon align="inline-end">
              <InputGroupButton
                type="submit"
                size="icon-xs"
                disabled={busy}
                aria-label={t("search", { resource: t(resource) })}
              >
                <Search />
              </InputGroupButton>
            </InputGroupAddon>
          </InputGroup>
        </form>
        <Button
          variant="outline"
          size="icon"
          onClick={() => load()}
          disabled={busy}
          aria-label={t("refresh")}
        >
          <RefreshCw />
        </Button>
      </div>
      {notice ? (
        <Alert>
          <AlertDescription>{t("saved")}</AlertDescription>
        </Alert>
      ) : null}
      {error ? (
        <Alert variant="destructive">
          <AlertDescription>{t(`errors.${error}`)}</AlertDescription>
        </Alert>
      ) : null}
      <div
        className="min-w-0 overflow-hidden rounded-lg border"
        aria-busy={busy}
      >
        <Table scrollLabel={t(resource)}>
          <TableHeader className="bg-muted/40">
            <TableRow>
              {(resource === "applications"
                ? ["application", "mount", "status", "deployments", "actions"]
                : resource === "deployments"
                  ? [
                      "application",
                      "deploymentId",
                      "runtime",
                      "status",
                      "reviewer",
                      "actions",
                    ]
                  : resource === "publications"
                    ? [
                        "application",
                        "deploymentId",
                        "access",
                        "validUntil",
                        "actions",
                      ]
                    : ["createdAt", "operator", "operation", "key", "actions"]
              ).map((key) => (
                <TableHead key={key}>{t(key)}</TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.items.map((r) => (
              <TableRow key={text(r, "rowKey")}>
                {resource === "applications" ? (
                  <>
                    <TableCell className="py-3">{application(r)}</TableCell>
                    <TableCell className="font-mono text-xs">
                      {text(r, "suffix")}
                    </TableCell>
                    <TableCell>
                      {badge(r.active ? "active" : "inactive")}
                    </TableCell>
                    <TableCell>
                      {fmt.number(Number(r.deploymentCount))}
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          onClick={() =>
                            setEdit({
                              kind: "app",
                              values: {
                                id: text(r, "id"),
                                name: text(r, "name"),
                                description: text(r, "description"),
                                suffix: text(r, "suffix"),
                                active: Boolean(r.active),
                                existing: true,
                              },
                            })
                          }
                        >
                          <Pencil data-icon="inline-start" />
                          {t("edit")}
                        </Button>
                        <Button variant="outline" onClick={() => setAccess(r)}>
                          {t("manageAccess")}
                        </Button>
                        <Button variant="ghost" onClick={() => setDetails(r)}>
                          {t("details")}
                        </Button>
                      </div>
                    </TableCell>
                  </>
                ) : resource === "deployments" ? (
                  <>
                    <TableCell className="py-3">{application(r)}</TableCell>
                    <TableCell>
                      <button
                        className="max-w-44 truncate text-left font-mono text-xs underline-offset-4 hover:underline"
                        onClick={() => setDetails(r)}
                      >
                        {text(r, "id")}
                      </button>
                      <p className="text-xs text-muted-foreground">
                        {text(r, "assetVersion")}
                      </p>
                    </TableCell>
                    <TableCell>
                      {r.managed ? t(text(r, "runtime")) : t("legacy")}
                    </TableCell>
                    <TableCell>{badge(text(r, "status"))}</TableCell>
                    <TableCell
                      className="max-w-40 truncate text-xs"
                      title={text(r, "reviewer")}
                    >
                      {text(r, "reviewer")}
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-2">
                        {r.managed && r.status === "pending" ? (
                          <Button
                            variant="outline"
                            onClick={() =>
                              setEdit({
                                kind: "deployment-status",
                                values: {
                                  deploymentId: text(r, "id"),
                                  status: "ready",
                                },
                              })
                            }
                          >
                            <Check data-icon="inline-start" />
                            {t("approve")}
                          </Button>
                        ) : null}
                        {r.managed && r.status === "ready" ? (
                          <Button
                            variant="outline"
                            onClick={() =>
                              setEdit({
                                kind: "replace-deployment",
                                values: {
                                  deploymentId: text(r, "id"),
                                  replacementId: "",
                                  assetsUntil: new Date(
                                    Date.now() + 86400000,
                                  ).toISOString(),
                                },
                              })
                            }
                          >
                            <ArrowRightLeft data-icon="inline-start" />
                            {t("replace")}
                          </Button>
                        ) : null}
                        {r.managed && r.status !== "revoked" ? (
                          <Button
                            variant="ghost"
                            onClick={() =>
                              setEdit({
                                kind: "deployment-status",
                                values: {
                                  deploymentId: text(r, "id"),
                                  status: "revoked",
                                },
                              })
                            }
                          >
                            <Ban data-icon="inline-start" />
                            {t("revoke")}
                          </Button>
                        ) : null}
                        {!r.managed ? (
                          <Button
                            variant="outline"
                            onClick={() =>
                              setEdit({
                                kind: "route",
                                values: {
                                  deploymentId: text(r, "id"),
                                  targetOrigin: text(r, "targetOrigin"),
                                },
                              })
                            }
                          >
                            {t("route")}
                          </Button>
                        ) : null}
                        {!r.managed ? (
                          <Button
                            variant="outline"
                            onClick={() =>
                              setEdit({
                                kind: "deployment",
                                values: {
                                  id: text(r, "id"),
                                  appId: text(r, "appId"),
                                  digest: text(r, "digest"),
                                  reviewer: text(r, "reviewer"),
                                  ready: r.status === "ready",
                                },
                              })
                            }
                          >
                            {t("edit")}
                          </Button>
                        ) : null}
                        <Button variant="ghost" onClick={() => setDetails(r)}>
                          {t("details")}
                        </Button>
                      </div>
                    </TableCell>
                  </>
                ) : resource === "publications" ? (
                  <>
                    <TableCell className="py-3">{application(r)}</TableCell>
                    <TableCell className="font-mono text-xs">
                      {text(r, "deploymentId")}
                    </TableCell>
                    <TableCell>
                      {badge(
                        r.enabled && r.entitled && r.current
                          ? "active"
                          : "inactive",
                      )}
                    </TableCell>
                    <TableCell>{date(r.validUntil)}</TableCell>
                    <TableCell>
                      <Button
                        variant="outline"
                        onClick={() =>
                          setEdit({
                            kind: "publication",
                            values: {
                              appId: text(r, "appId"),
                              deploymentId: text(r, "deploymentId"),
                              enabled: Boolean(r.enabled),
                              entitled: Boolean(r.entitled),
                              validUntil: text(r, "validUntil"),
                            },
                          })
                        }
                      >
                        <Pencil data-icon="inline-start" />
                        {t("edit")}
                      </Button>
                    </TableCell>
                  </>
                ) : (
                  <>
                    <TableCell className="py-3 whitespace-nowrap">
                      {date(r.createdAt)}
                    </TableCell>
                    <TableCell
                      className="max-w-48 truncate text-xs"
                      title={text(r, "actor")}
                    >
                      {text(r, "actor")}
                    </TableCell>
                    <TableCell>
                      {t(
                        `operationKinds.${String((r.body as { kind?: string })?.kind ?? "app")}`,
                      )}
                    </TableCell>
                    <TableCell className="font-mono text-xs">
                      {text(r, "key")}
                    </TableCell>
                    <TableCell>
                      <Button variant="outline" onClick={() => setDetails(r)}>
                        {t("details")}
                      </Button>
                    </TableCell>
                  </>
                )}
              </TableRow>
            ))}
          </TableBody>
        </Table>
        {!data.items.length && !error ? (
          <Empty className="border-0">
            <EmptyHeader>
              <EmptyTitle>{t("empty")}</EmptyTitle>
              <EmptyDescription>{t("emptyDescription")}</EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : null}
      </div>
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          {t("showing", { count: fmt.number(data.items.length) })}
        </p>
        {data.nextCursor ? (
          <Button variant="outline" disabled={busy} onClick={() => load(true)}>
            {t("loadMore")}
          </Button>
        ) : null}
      </div>
      <OperationDialog
        edit={edit}
        csrf={csrf}
        onClose={() => setEdit(null)}
        onSaved={() => {
          setNotice(true);
          load();
        }}
      />
      <Dialog
        open={Boolean(details)}
        onOpenChange={(open) => {
          if (!open) setDetails(null);
        }}
      >
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{t("details")}</DialogTitle>
            <DialogDescription>{t(resource)}</DialogDescription>
          </DialogHeader>
          <pre className="max-h-[60dvh] overflow-auto rounded-lg bg-muted p-4 text-xs">
            {JSON.stringify(details, null, 2)}
          </pre>
        </DialogContent>
      </Dialog>
    </>
  );
}
