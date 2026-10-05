"use client";
import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectGroup,
  SelectItem,
} from "@/components/ui/select";
import { FieldGroup, Field, FieldLabel } from "@/components/ui/field";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableCell,
  TableHead,
} from "@/components/ui/table";
type User = { id: string; displayName: string; email: string };
type Grant = {
  userId: string;
  displayName: string;
  roles: string[];
  enabled: boolean;
};
export function AccessDialog({
  appId,
  name,
  csrf,
  onClose,
}: {
  appId: string;
  name: string;
  csrf: string;
  onClose: () => void;
}) {
  const t = useTranslations("Console");
  const [users, setUsers] = useState<User[]>([]),
    [grants, setGrants] = useState<Grant[]>([]),
    [userId, setUserId] = useState(""),
    [roles, setRoles] = useState("viewer"),
    [enabled, setEnabled] = useState(true),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [revision, setRevision] = useState(0);
  const operation = useRef<{ body: string; key: string } | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    async function load(kind: string) {
      const rows: unknown[] = [];
      let cursor: string | null = null;
      const seen = new Set<string>();
      do {
        const params = new URLSearchParams({ kind, appId });
        if (cursor) params.set("cursor", cursor);
        const r = await fetch("/api/access?" + params, {
          cache: "no-store",
          signal: controller.signal,
        });
        if (!r.ok) throw Error("unavailable");
        const page = await r.json();
        rows.push(...page.items);
        cursor = page.nextCursor;
        if (cursor) {
          if (seen.has(cursor)) throw Error("unavailable");
          seen.add(cursor);
        }
      } while (cursor);
      return rows;
    }
    setBusy(true);
    setError("");
    Promise.all([load("users"), load("grants")])
      .then(([u, g]) => {
        setUsers(u as User[]);
        setGrants(g as Grant[]);
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          setError("unavailable");
          setGrants([]);
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setBusy(false);
      });
    return () => controller.abort();
  }, [appId, revision]);
  async function save(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const body = JSON.stringify({
      appId,
      userId,
      roles: roles
        .split(",")
        .map((x) => x.trim())
        .filter(Boolean),
      enabled,
    });
    if (operation.current?.body !== body)
      operation.current = { body, key: crypto.randomUUID() };
    try {
      const r = await fetch("/api/access", {
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
        throw Error(r.status === 400 ? "invalid" : "unavailable");
      }
      operation.current = null;
      setRevision((x) => x + 1);
    } catch (e) {
      setError(
        e instanceof Error && e.message === "invalid"
          ? "invalid"
          : "unavailable",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t("manageAccess")}</DialogTitle>
          <DialogDescription>{name}</DialogDescription>
        </DialogHeader>
        {error ? (
          <Alert variant="destructive">
            <AlertDescription>{t("errors." + error)}</AlertDescription>
          </Alert>
        ) : null}
        <form onSubmit={save}>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="app-access-user">{t("user")}</FieldLabel>
              <Select value={userId} onValueChange={setUserId}>
                <SelectTrigger id="app-access-user">
                  <SelectValue placeholder={t("selectUser")} />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {users.map((u) => (
                      <SelectItem key={u.id} value={u.id}>
                        {u.displayName} · {u.email}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </Field>
            <Field>
              <FieldLabel htmlFor="app-access-roles">{t("roles")}</FieldLabel>
              <Input
                id="app-access-roles"
                value={roles}
                onChange={(e) => setRoles(e.target.value)}
                required
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="app-access-state">{t("access")}</FieldLabel>
              <Select
                value={enabled ? "enabled" : "revoked"}
                onValueChange={(x) => setEnabled(x === "enabled")}
              >
                <SelectTrigger id="app-access-state">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    <SelectItem value="enabled">{t("active")}</SelectItem>
                    <SelectItem value="revoked">{t("revoked")}</SelectItem>
                  </SelectGroup>
                </SelectContent>
              </Select>
            </Field>
            <Button disabled={busy || !userId}>{t("save")}</Button>
          </FieldGroup>
        </form>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("user")}</TableHead>
              <TableHead>{t("roles")}</TableHead>
              <TableHead>{t("status")}</TableHead>
              <TableHead>{t("actions")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {grants.map((g) => (
              <TableRow key={g.userId}>
                <TableCell>{g.displayName}</TableCell>
                <TableCell>{g.roles.join(", ")}</TableCell>
                <TableCell>{t(g.enabled ? "active" : "revoked")}</TableCell>
                <TableCell>
                  <Button
                    variant="outline"
                    onClick={() => {
                      setUserId(g.userId);
                      setRoles(g.roles.join(", "));
                      setEnabled(g.enabled);
                    }}
                  >
                    {t("edit")}
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </DialogContent>
    </Dialog>
  );
}
