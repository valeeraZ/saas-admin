"use client";
import { useTranslations } from "next-intl";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Field,
  FieldGroup,
  FieldLabel,
  FieldDescription,
  FieldSet,
  FieldLegend,
} from "@/components/ui/field";
import type { AppRole } from "@/lib/access-contracts";
export function RolesEditor({
  value,
  onChange,
  disabled,
}: {
  value: AppRole[];
  onChange: (roles: AppRole[]) => void;
  disabled: boolean;
}) {
  const t = useTranslations("Console");
  function update(index: number, change: Partial<AppRole>) {
    onChange(value.map((r, i) => (i === index ? { ...r, ...change } : r)));
  }
  return (
    <FieldSet disabled={disabled}>
      <FieldLegend>{t("roles")}</FieldLegend>
      <FieldDescription>{t("rolesDescription")}</FieldDescription>
      <FieldGroup>
        {value.map((r, i) => (
          <FieldSet key={i} className="rounded-lg border p-4">
            <FieldLegend className="sr-only">
              {t("roleNumber", { number: i + 1 })}
            </FieldLegend>
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor={`role-key-${i}`}>
                  {t("roleKey")}
                </FieldLabel>
                <Input
                  id={`role-key-${i}`}
                  value={r.key}
                  onChange={(e) => update(i, { key: e.target.value })}
                  required
                  maxLength={64}
                  pattern={"[a-z][a-z0-9_.\\-]{0,63}"}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor={`role-name-${i}`}>
                  {t("roleName")}
                </FieldLabel>
                <Input
                  id={`role-name-${i}`}
                  value={r.name}
                  onChange={(e) => update(i, { name: e.target.value })}
                  required
                  maxLength={200}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor={`role-description-${i}`}>
                  {t("description")}
                </FieldLabel>
                <Textarea
                  id={`role-description-${i}`}
                  value={r.description}
                  onChange={(e) => update(i, { description: e.target.value })}
                  maxLength={1000}
                />
              </Field>
              <Field orientation="horizontal">
                <FieldLabel htmlFor={`role-active-${i}`}>
                  {t("active")}
                </FieldLabel>
                <Switch
                  id={`role-active-${i}`}
                  checked={r.active}
                  disabled={disabled}
                  onCheckedChange={(active) => update(i, { active })}
                />
                <Button
                  type="button"
                  variant="outline"
                  disabled={disabled}
                  onClick={() =>
                    onChange(value.filter((_, index) => index !== i))
                  }
                >
                  <Trash2 data-icon="inline-start" />
                  {t("removeRole")}
                </Button>
              </Field>
            </FieldGroup>
          </FieldSet>
        ))}
        <Button
          type="button"
          variant="outline"
          disabled={disabled || value.length >= 100}
          onClick={() =>
            onChange([
              ...value,
              { key: "", name: "", description: "", active: true },
            ])
          }
        >
          <Plus data-icon="inline-start" />
          {t("addRole")}
        </Button>
      </FieldGroup>
    </FieldSet>
  );
}
