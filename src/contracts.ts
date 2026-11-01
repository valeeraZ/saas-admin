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
        "app-assets",
      ].includes(s.slice(1)),
    "Reserved suffix",
  );
export const targetOrigin = z
  .string()
  .url()
  .refine((value) => {
    try {
      const u = new URL(value);
      return (
        ["http:", "https:"].includes(u.protocol) &&
        u.pathname === "/" &&
        !u.username &&
        !u.password &&
        !u.search &&
        !u.hash
      );
    } catch {
      return false;
    }
  }, "Target must be an HTTP(S) origin");
export const runtime = z.enum(["http", "nextjs"]);
export const assetVersion = z
  .string()
  .regex(/^[a-zA-Z0-9-]{1,80}$/)
  .nullable();
export const operation = z.discriminatedUnion("kind", [
  z
    .object({
      kind: z.literal("runtime-deployment"),
      id: uuid,
      appId: uuid,
      digest: z.string().regex(/^sha256:[a-f0-9]{64}$/),
      targetOrigin,
      runtime,
      assetVersion,
    })
    .strict(),
  z
    .object({
      kind: z.literal("deployment-status"),
      deploymentId: uuid,
      status: z.enum(["ready", "revoked"]),
    })
    .strict(),
  z
    .object({
      kind: z.literal("replace-deployment"),
      deploymentId: uuid,
      replacementId: uuid,
      assetsUntil: z.iso.datetime(),
    })
    .strict(),
  z
    .object({ kind: z.literal("route"), deploymentId: uuid, targetOrigin })
    .strict(),
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
      kind: z.literal("publication"),
      appId: uuid,
      deploymentId: uuid,
      enabled: z.boolean(),
      entitled: z.boolean(),
      validUntil: z.iso.datetime(),
    })
    .strict(),
]);
export const entityId = uuid;
export const context = z.object({
  user: z.object({
    id: uuid,
    displayName: z.string().max(200),
    email: z.string().max(254),
    emailVerified: z.boolean(),
    status: z.literal("active"),
  }),
});
export const permissions = z.object({
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
    items: z.array(item).max(50),
    nextCursor: uuid.nullable(),
  })
  .strict();

export const resolvedRoute = z
  .object({
    user: context.shape.user,
    userId: uuid,
    appId: uuid,
    deploymentId: uuid,
    suffix,
    targetOrigin,
    roles: z.array(z.string().min(1)).min(1),
  })
  .strict();

export const runtimeMetadata = z
  .object({
    appId: uuid,
    deploymentId: uuid,
    suffix,
    targetOrigin,
    runtime,
    assetVersion,
    status: z.enum(["ready", "retired"]),
    assetsUntil: z.iso.datetime().nullable(),
    digest: z.string().regex(/^sha256:[a-f0-9]{64}$/),
    reviewer: z.string().min(1).max(200),
    reviewedAt: z.iso.datetime(),
  })
  .strict();
export const runtimeRoute = resolvedRoute
  .extend(runtimeMetadata.shape)
  .strict();

export const discovery = z
  .object({
    items: z
      .array(
        z
          .object({
            id: entityId,
            name: z.string().min(1).max(200),
            description: z.string().max(1000),
            suffix,
          })
          .strict(),
      )
      .max(50),
    nextCursor: entityId.nullable(),
  })
  .strict();
