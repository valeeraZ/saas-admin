"use client";
import { useRef, useState } from "react";
import { useTranslations, useFormatter } from "next-intl";
import type { ReviewRequest } from "../../src/access-requests.ts";
import { WorkspaceHeading } from "@/components/workspace-heading";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Table,
  TableHeader,
  TableHead,
  TableBody,
  TableRow,
  TableCell,
} from "@/components/ui/table";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectGroup,
  SelectItem,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import {
  Empty,
  EmptyHeader,
  EmptyTitle,
  EmptyDescription,
} from "@/components/ui/empty";
type Page = { items: ReviewRequest[]; nextCursor: string | null };
export function RequestsWorkspace({
  initial,
  csrf,
}: {
  initial: Page;
  csrf: string;
}) {
  const t = useTranslations("Console"),
    fmt = useFormatter();
  const [page, setPage] = useState(initial),
    [status, setStatus] = useState("pending"),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [selected, setSelected] = useState<{
      request: ReviewRequest;
      decision: "approved" | "rejected";
    } | null>(null),
    [comment, setComment] = useState("");
  const operation = useRef<{ body: string; key: string } | null>(null),
    controller = useRef<AbortController | null>(null);
  async function load(filter = status, more = false) {
    controller.current?.abort();
    const request = new AbortController();
    controller.current = request;
    setBusy(true);
    setError("");
    const params = new URLSearchParams({ status: filter });
    if (more && page.nextCursor) params.set("cursor", page.nextCursor);
    try {
      const r = await fetch("/api/requests?" + params, {
        cache: "no-store",
        signal: request.signal,
      });
      if (!r.ok) throw Error();
      const next: Page = await r.json();
      if (!request.signal.aborted)
        setPage((old) => ({
          items: more ? [...old.items, ...next.items] : next.items,
          nextCursor: next.nextCursor,
        }));
    } catch {
      if (!request.signal.aborted) {
        setPage({ items: [], nextCursor: null });
        setError("unavailable");
      }
    } finally {
      if (!request.signal.aborted) setBusy(false);
    }
  }
  async function decide(e: React.FormEvent) {
    e.preventDefault();
    if (!selected) return;
    setBusy(true);
    setError("");
    const body = JSON.stringify({
      id: selected.request.id,
      decision: selected.decision,
      comment: comment.trim(),
    });
    if (operation.current?.body !== body)
      operation.current = { body, key: crypto.randomUUID() };
    try {
      const r = await fetch("/api/requests", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-csrf-token": csrf,
          "idempotency-key": operation.current.key,
        },
        body,
      });
      if (!r.ok) {
        if (r.status < 500) operation.current = null;
        throw Error(r.status === 409 ? "requestConflict" : "unavailable");
      }
      operation.current = null;
      setSelected(null);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "unavailable");
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <WorkspaceHeading
        title={t("requests")}
        description={t("requestsDescription")}
      />
      <div className="flex flex-wrap items-center gap-3">
        <Select
          value={status}
          onValueChange={(filter) => {
            setStatus(filter);
            void load(filter);
          }}
          disabled={busy}
        >
          <SelectTrigger aria-label={t("status")} className="w-48">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              {["pending", "approved", "rejected", "all"].map((s) => (
                <SelectItem key={s} value={s}>
                  {t(s)}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
        <Button variant="outline" disabled={busy} onClick={() => load()}>
          {t("refresh")}
        </Button>
      </div>
      {error ? (
        <Alert variant="destructive">
          <AlertDescription>{t("errors." + error)}</AlertDescription>
        </Alert>
      ) : null}
      <div
        className="min-w-0 overflow-hidden rounded-lg border"
        aria-busy={busy}
      >
        <Table scrollLabel={t("requests")}>
          <TableHeader className="bg-muted/40">
            <TableRow>
              {[
                "user",
                "application",
                "roles",
                "status",
                "review",
                "actions",
              ].map((k) => (
                <TableHead key={k}>{t(k)}</TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {page.items.map((r) => (
              <TableRow key={r.id}>
                <TableCell>
                  <div className="flex flex-col gap-1">
                    <span>{r.displayName}</span>
                    <span className="text-muted-foreground text-xs">
                      {r.email}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {fmt.dateTime(new Date(r.createdAt), {
                        dateStyle: "medium",
                        timeStyle: "short",
                      })}
                    </span>
                  </div>
                </TableCell>
                <TableCell>{r.appName}</TableCell>
                <TableCell>{r.roles.join(", ")}</TableCell>
                <TableCell>
                  <Badge variant="secondary">{t(r.status)}</Badge>
                </TableCell>
                <TableCell className="max-w-72 whitespace-normal">
                  <div className="flex min-w-40 max-w-72 flex-col gap-1">
                    <span className="break-all text-xs text-muted-foreground">
                      {r.reviewer}
                    </span>
                    {r.reviewedAt ? (
                      <span className="text-xs text-muted-foreground">
                        {fmt.dateTime(new Date(r.reviewedAt), {
                          dateStyle: "medium",
                          timeStyle: "short",
                        })}
                      </span>
                    ) : null}
                    <span className="whitespace-pre-wrap break-words">
                      {r.comment}
                    </span>
                  </div>
                </TableCell>
                <TableCell>
                  {r.status === "pending" ? (
                    <div className="flex flex-wrap gap-2">
                      {(["approved", "rejected"] as const).map((decision) => (
                        <Button
                          key={decision}
                          variant={
                            decision === "rejected" ? "outline" : "default"
                          }
                          disabled={busy}
                          onClick={() => {
                            setSelected({ request: r, decision });
                            setComment("");
                            setError("");
                            operation.current = null;
                          }}
                        >
                          {t(
                            decision === "approved"
                              ? "approveRequest"
                              : "rejectRequest",
                          )}
                        </Button>
                      ))}
                    </div>
                  ) : null}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        {!page.items.length && !error ? (
          <Empty className="border-0">
            <EmptyHeader>
              <EmptyTitle>{t("empty")}</EmptyTitle>
              <EmptyDescription>{t("requestsEmpty")}</EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : null}
      </div>
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          {t("showing", { count: fmt.number(page.items.length) })}
        </p>
        {page.nextCursor ? (
          <Button
            variant="outline"
            disabled={busy}
            onClick={() => load(status, true)}
          >
            {t("loadMore")}
          </Button>
        ) : null}
      </div>
      <Dialog
        open={!!selected}
        onOpenChange={(open) => {
          if (!open && !busy) setSelected(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {t(
                selected?.decision === "rejected"
                  ? "rejectRequest"
                  : "approveRequest",
              )}
            </DialogTitle>
            <DialogDescription>
              {selected?.request.appName} · {selected?.request.displayName} ·{" "}
              {selected?.request.roles.join(", ")}
            </DialogDescription>
          </DialogHeader>
          <p className="whitespace-pre-wrap break-words text-sm">
            {selected?.request.reason}
          </p>
          <form onSubmit={decide} className="flex flex-col gap-4">
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="review-comment">{t("comment")}</FieldLabel>
                <Textarea
                  id="review-comment"
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  required
                  maxLength={2000}
                  disabled={busy}
                />
              </Field>
            </FieldGroup>
            {error ? (
              <Alert variant="destructive">
                <AlertDescription>{t("errors." + error)}</AlertDescription>
              </Alert>
            ) : null}
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                disabled={busy}
                onClick={() => setSelected(null)}
              >
                {t("cancel")}
              </Button>
              <Button disabled={busy || !comment.trim()} type="submit">
                {t(busy ? "saving" : "confirm")}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
