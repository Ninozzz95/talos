import { z } from "zod";

export const capabilitiesSchema = z.object({
  navigation: z.boolean(),
  screenshots: z.boolean(),
  accessibilitySnapshot: z.boolean(),
  actions: z.literal(false),
  downloads: z.literal(false),
  uploads: z.literal(false),
});

export const createSessionSchema = z.object({
  ownerRef: z.string().min(1),
  mode: z.literal("read_only"),
  viewport: z.object({ width: z.number().int().min(320).max(3840), height: z.number().int().min(240).max(2160) }),
  ttlSeconds: z.number().int().positive().max(86_400),
  capabilities: capabilitiesSchema,
});

export const navigateSchema = z.object({
  url: z.string().url(),
  waitUntil: z.enum(["load", "domcontentloaded", "networkidle", "commit"]).default("domcontentloaded"),
  timeoutMs: z.number().int().positive().max(120_000).default(15_000),
});

export type CreateSessionInput = z.infer<typeof createSessionSchema>;
export type NavigateInput = z.infer<typeof navigateSchema>;
export type Capabilities = z.infer<typeof capabilitiesSchema>;
