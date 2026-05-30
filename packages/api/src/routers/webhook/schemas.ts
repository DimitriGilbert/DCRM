import { z } from "zod";

export const createOutgoingWebhookSchema = z.object({
  name: z.string().min(1).max(200),
  eventType: z.string().min(1),
  enabled: z.boolean().optional().default(true),
  url: z.string().min(1).max(2048).url().refine(
    (val) => val.startsWith("https://") || val.startsWith("http://"),
    { message: "URL must use http or https scheme" },
  ),
  method: z.enum(["POST", "PUT", "PATCH"]).optional().default("POST"),
  /** Raw (unencrypted) auth values — encrypted server-side before storage. */
  authConfig: z.union([
    z.object({
      mode: z.literal("none"),
    }),
    z.object({
      mode: z.literal("bearer"),
      token: z.string().min(1),
    }),
    z.object({
      mode: z.literal("basic"),
      username: z.string().min(1),
      password: z.string().min(1),
    }),
    z.object({
      mode: z.literal("hmac"),
      secret: z.string().min(1),
      headerName: z.string().min(1),
      algorithm: z.enum(["sha256", "sha512"]).optional().default("sha256"),
    }),
    z.object({
      mode: z.literal("custom_headers"),
      headers: z.array(z.object({
        name: z.string().min(1),
        value: z.string().min(1),
      })).min(1),
    }),
  ]).optional().default({ mode: "none" }),
  headers: z.record(z.string(), z.string()).optional(),
  timeoutMs: z.number().int().min(1000).max(60_000).optional().default(10_000),
  maxRetries: z.number().int().min(0).max(10).optional().default(3),
});

export const updateOutgoingWebhookSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1).max(200).optional(),
  eventType: z.string().min(1).optional(),
  enabled: z.boolean().optional(),
  url: z.string().min(1).max(2048).url().refine(
    (val) => val.startsWith("https://") || val.startsWith("http://"),
    { message: "URL must use http or https scheme" },
  ).optional(),
  method: z.enum(["POST", "PUT", "PATCH"]).optional(),
  authConfig: z.union([
    z.object({ mode: z.literal("none") }),
    z.object({ mode: z.literal("bearer"), token: z.string().min(1) }),
    z.object({ mode: z.literal("basic"), username: z.string().min(1), password: z.string().min(1) }),
    z.object({ mode: z.literal("hmac"), secret: z.string().min(1), headerName: z.string().min(1), algorithm: z.enum(["sha256", "sha512"]).optional() }),
    z.object({ mode: z.literal("custom_headers"), headers: z.array(z.object({ name: z.string().min(1), value: z.string().min(1) })).min(1) }),
  ]).optional(),
  headers: z.record(z.string(), z.string()).nullable().optional(),
  timeoutMs: z.number().int().min(1000).max(60_000).optional(),
  maxRetries: z.number().int().min(0).max(10).optional(),
});

export const deleteOutgoingWebhookSchema = z.object({
  id: z.string().min(1),
});
