import { z } from "zod";
const uuid = z.string().uuid();
export const suffix = z
  .string()
  .regex(/^\/[a-z][a-z0-9-]{0,62}$/)
  .refine(
    (s) =>
      ![
        "api",
        "auth",
        "admin",
        "_next",
        "settings",
        "tenants",
        "invitations",
        "health",
      ].includes(s.slice(1)),
    "Reserved suffix",
  );
export const operation = z.discriminatedUnion("kind", [
  z
    .object({
      kind: z.literal("app"),
      id: uuid,
      name: z.string().trim().min(1).max(200),
      description: z.string().max(1000),
      suffix,
      active: z.boolean(),
    })
    .strict(),
  z
    .object({
      kind: z.literal("deployment"),
      id: uuid,
      appId: uuid,
      digest: z.string().regex(/^sha256:[a-f0-9]{64}$/),
      reviewer: z.string().trim().min(1).max(200),
      ready: z.boolean(),
    })
    .strict(),
  z
    .object({
      kind: z.literal("installation"),
      tenantId: uuid,
      appId: uuid,
      deploymentId: uuid,
      enabled: z.boolean(),
      entitled: z.boolean(),
      validUntil: z.iso.datetime(),
    })
    .strict(),
]);
export const tenantId = uuid;
export const context = z.object({
  tenant: z.object({ id: uuid, status: z.literal("active") }),
  membership: z.object({
    tenantId: uuid,
    userId: uuid,
    status: z.literal("active"),
  }),
});
export const permissions = z.object({
  tenantId: uuid,
  userId: uuid,
  appId: uuid,
  allowed: z.boolean(),
  roles: z.array(z.string().min(1)).max(1000),
});
export const item = z
  .object({
    id: uuid,
    name: z.string().min(1).max(200),
    description: z.string().max(1000),
    suffix,
    roles: z.array(z.string()),
  })
  .strict();
export const catalog = z
  .object({
    tenantId: uuid,
    items: z.array(item).max(50),
    nextCursor: uuid.nullable(),
  })
  .strict();
