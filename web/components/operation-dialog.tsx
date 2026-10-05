"use client";
import { useEffect, useState, useRef } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Field,
  FieldGroup,
  FieldLabel,
  FieldDescription,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectTrigger,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectValue,
} from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";
export type Edit = { kind: string; values: Record<string, string | boolean> };
const definitions: Record<
  string,
  { title: string; fields: string[]; toggles: string[]; description?: string }
> = {
  app: {
    title: "newApp",
    fields: ["name", "description", "suffix"],
    toggles: ["active"],
    description: "mountDescription",
  },
  "runtime-deployment": {
    title: "newDeployment",
    fields: ["appId", "targetOrigin", "digest", "runtime", "assetVersion"],
    toggles: [],
  },
  publication: {
    fields: ["appId", "deploymentId", "validUntil"],
    title: "newInstallation",
    toggles: ["enabled", "entitled"],
    description: "publicationDescription",
  },
  "deployment-status": {
    title: "approve",
    fields: [],
    toggles: [],
    description: "approveDescription",
  },
  "replace-deployment": {
    title: "replace",
    fields: ["replacementId", "assetsUntil"],
    toggles: [],
    description: "replaceDescription",
  },
  route: {
    title: "route",
    fields: ["targetOrigin"],
    toggles: [],
    description: "originDescription",
  },
  deployment: {
    title: "edit",
    fields: ["appId", "digest"],
    toggles: ["ready"],
    description: "approveDescription",
  },
};
const dates = ["validUntil", "assetsUntil"];
const help: Record<string, string> = {
  targetOrigin: "originDescription",
  assetVersion: "versionDescription",
  assetsUntil: "assetsDescription",
  appId: "idDescription",
  deploymentId: "idDescription",
  replacementId: "idDescription",
};
function localDate(value: string) {
  const date = new Date(value);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 16);
}
export function OperationDialog({
  edit,
  csrf,
  onClose,
  onSaved,
}: {
  edit: Edit | null;
  csrf: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const t = useTranslations("Console");
  const [values, setValues] = useState<Record<string, string | boolean>>({}),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [reviewed, setReviewed] = useState(false),
    [choices, setChoices] = useState<{ id: string; name: string }[]>([]);
  const operationKey = useRef("");
  useEffect(() => {
    if (!edit) return;
    const next = { ...edit.values };
    for (const key of dates)
      if (typeof next[key] === "string" && next[key])
        next[key] = localDate(String(next[key]));
    setValues(next);
    setError("");
    setReviewed(false);
    operationKey.current = crypto.randomUUID();
    if (["publication", "runtime-deployment"].includes(edit.kind)) {
      const controller = new AbortController();
      fetch("/api/management?resource=applications", {
        signal: controller.signal,
      })
        .then((r) => (r.ok ? r.json() : { items: [] }))
        .then((d) =>
          setChoices(
            d.items.map((r: { id: string; name: string }) => ({
              id: r.id,
              name: r.name,
            })),
          ),
        )
        .catch(() => {});
      return () => controller.abort();
    }
  }, [edit]);
  if (!edit) return null;
  const definition = definitions[edit.kind],
    revoking =
      edit.kind === "deployment-status" && edit.values.status === "revoked";
  const confirming = [
    "deployment-status",
    "replace-deployment",
    "publication",
    "deployment",
    "route",
  ].includes(edit.kind);
  const title = revoking
    ? "revoke"
    : edit.kind === "app" && edit.values.existing
      ? "edit"
      : definition.title;
  function change(key: string, value: string | boolean) {
    setValues((v) => ({ ...v, [key]: value }));
    operationKey.current = crypto.randomUUID();
  }
  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (!edit) return;
    setBusy(true);
    setError("");
    try {
      const body: Record<string, unknown> = { kind: edit.kind, ...values };
      delete body.existing;
      for (const key of dates)
        if (body[key]) body[key] = new Date(String(body[key])).toISOString();
      if (edit.kind === "runtime-deployment")
        body.assetVersion =
          body.runtime === "nextjs" ? body.assetVersion : null;
      const response = await fetch("/api/management", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-csrf-token": csrf,
          "idempotency-key": operationKey.current,
        },
        body: JSON.stringify(body),
      });
      const data = await response.json();
      if (!response.ok) throw Error(data.error);
      onSaved();
      onClose();
    } catch (e) {
      const code = e instanceof Error ? e.message : "unavailable";
      setError(
        [
          "invalid",
          "conflict",
          "csrf",
          "tooLarge",
          "writesDisabled",
          "unauthorized",
          "forbidden",
          "identityUnavailable",
        ].includes(code)
          ? code
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
        if (!open && !busy) onClose();
      }}
    >
      <DialogContent
        className="max-h-[90dvh] overflow-y-auto sm:max-w-lg"
        showCloseButton={!busy}
      >
        <DialogHeader>
          <DialogTitle>{t(title)}</DialogTitle>
          <DialogDescription>
            {t(
              revoking
                ? "revokeDescription"
                : (definition.description ?? "idDescription"),
            )}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={save} className="flex flex-col gap-5">
          <FieldGroup>
            {definition.fields.map((key) => (
              <Field key={key} data-invalid={error === "invalid"}>
                <FieldLabel htmlFor={`field-${key}`}>
                  {t(key === "suffix" ? "mount" : key)}
                </FieldLabel>
                {key === "runtime" ? (
                  <Select
                    value={String(values[key] ?? "http")}
                    onValueChange={(value) => change(key, value)}
                  >
                    <SelectTrigger id={`field-${key}`}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        {["http", "nextjs"].map((value) => (
                          <SelectItem key={value} value={value}>
                            {t(value)}
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                ) : key === "description" ? (
                  <Textarea
                    id={`field-${key}`}
                    maxLength={1000}
                    value={String(values[key] ?? "")}
                    onChange={(e) => change(key, e.target.value)}
                    aria-invalid={error === "invalid"}
                  />
                ) : (
                  <Input
                    id={`field-${key}`}
                    type={dates.includes(key) ? "datetime-local" : "text"}
                    value={String(values[key] ?? "")}
                    onChange={(e) => change(key, e.target.value)}
                    required={
                      key !== "assetVersion" || values.runtime === "nextjs"
                    }
                    maxLength={key === "name" ? 200 : 300}
                    readOnly={
                      (key === "suffix" && Boolean(edit.values.existing)) ||
                      (edit.kind === "deployment" &&
                        ["appId", "digest"].includes(key))
                    }
                    aria-invalid={error === "invalid"}
                    list={
                      key === "appId" ? "application-references" : undefined
                    }
                  />
                )}
                {key === "appId" ? (
                  <datalist id="application-references">
                    {choices.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </datalist>
                ) : null}
                {help[key] ? (
                  <FieldDescription>{t(help[key])}</FieldDescription>
                ) : null}
              </Field>
            ))}
            {definition.toggles.map((key) => (
              <Field key={key} orientation="horizontal">
                <FieldLabel htmlFor={`field-${key}`}>{t(key)}</FieldLabel>
                <Switch
                  id={`field-${key}`}
                  checked={Boolean(values[key])}
                  onCheckedChange={(value) => change(key, value)}
                />
              </Field>
            ))}
            {confirming ? (
              <Field orientation="horizontal">
                <FieldLabel htmlFor="operation-reviewed">
                  {t("reviewed")}
                </FieldLabel>
                <Switch
                  id="operation-reviewed"
                  checked={reviewed}
                  onCheckedChange={setReviewed}
                />
              </Field>
            ) : null}
          </FieldGroup>
          {error ? (
            <Alert variant="destructive">
              <AlertDescription>{t(`errors.${error}`)}</AlertDescription>
            </Alert>
          ) : null}
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={busy}
              onClick={onClose}
            >
              {t("cancel")}
            </Button>
            <Button
              type="submit"
              variant={revoking ? "destructive" : "default"}
              disabled={busy || (confirming && !reviewed)}
            >
              {t(
                busy
                  ? "saving"
                  : edit.kind === "app" && !edit.values.existing
                    ? "create"
                    : confirming
                      ? "confirm"
                      : "save",
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
