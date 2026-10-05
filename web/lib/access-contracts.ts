import { z } from "zod";
export const roleDefinition = z
  .object({
    key: z.string().regex(/^[a-z][a-z0-9_.-]{0,63}$/),
    name: z.string().min(1).max(200),
    description: z.string().max(1000),
    active: z.boolean(),
  })
  .strict();
export const roleConfiguration = z
  .object({
    version: z.number().int().nonnegative(),
    roles: z.array(roleDefinition).max(100),
  })
  .strict();
export type AppRole = z.infer<typeof roleDefinition>;
