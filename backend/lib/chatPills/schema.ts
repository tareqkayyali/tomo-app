/**
 * Chat Pills — Zod schemas for CMS config validation.
 *
 * Rules enforced here:
 *   - Tag strings must be in the finite CONTEXT_TAGS taxonomy.
 *   - Fixed mode requires exactly 4 fixedIds.
 *   - defaultFallbackIds must have exactly 4 IDs.
 *   - Library IDs must be unique and match slug pattern.
 *   - fixedIds and defaultFallbackIds must reference existing library IDs
 *     that are enabled and allowInEmptyState — enforced in `chatPillsConfigSchema`
 *     via refinement.
 */

import { z } from "zod";
import { CONTEXT_TAGS } from "./tagTaxonomy";

const tagSchema = z.enum(CONTEXT_TAGS as [string, ...string[]]);

export const chatPillSchema = z.object({
  id: z
    .string()
    .min(1)
    .max(64)
    .regex(/^[a-z0-9_]+$/, "id must be lowercase slug: a-z, 0-9, underscore"),
  label: z.string().min(1).max(24),
  message: z.string().min(1).max(200),
  enabled: z.boolean(),
  allowInEmptyState: z.boolean(),
  allowInResponse: z.boolean(),
  tags: z.array(tagSchema).max(20),
  excludeTags: z.array(tagSchema).max(20).default([]),
  priority: z.number().int().min(1).max(10),
});

export const chatPillsEmptyStateSchema = z.object({
  mode: z.enum(["fixed", "dynamic"]),
  fixedIds: z.array(z.string()).length(4, "fixedIds must have exactly 4 IDs"),
  defaultFallbackIds: z
    .array(z.string())
    .length(4, "defaultFallbackIds must have exactly 4 IDs"),
});

export const chatPillsInResponseSchema = z.object({
  enabled: z.boolean(),
  maxPerResponse: z.number().int().min(1).max(3),
  shadowMode: z.boolean(),
});

export const chatPillsConfigSchema = z
  .object({
    version: z.literal(1),
    emptyState: chatPillsEmptyStateSchema,
    inResponse: chatPillsInResponseSchema,
    library: z.array(chatPillSchema).min(4),
  })
  .superRefine((config, ctx) => {
    // Library IDs unique
    const ids = new Set<string>();
    for (const [i, pill] of config.library.entries()) {
      if (ids.has(pill.id)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["library", i, "id"],
          message: `Duplicate pill id: ${pill.id}`,
        });
      }
      ids.add(pill.id);
    }

    // Fixed / fallback IDs reference library entries that are enabled + allowInEmptyState
    const emptyStateEligible = new Set(
      config.library
        .filter((p) => p.enabled && p.allowInEmptyState)
        .map((p) => p.id)
    );
    const checkReferences = (list: string[], pathPrefix: string[]) => {
      const seen = new Set<string>();
      for (const [i, id] of list.entries()) {
        if (seen.has(id)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: [...pathPrefix, i],
            message: `Duplicate ID in list: ${id}`,
          });
        }
        seen.add(id);
        if (!emptyStateEligible.has(id)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: [...pathPrefix, i],
            message: `Pill "${id}" is not enabled or not allowed in empty state`,
          });
        }
      }
    };
    checkReferences(config.emptyState.fixedIds, ["emptyState", "fixedIds"]);
    checkReferences(config.emptyState.defaultFallbackIds, [
      "emptyState",
      "defaultFallbackIds",
    ]);
  });

export type ChatPillInput = z.infer<typeof chatPillSchema>;
export type ChatPillsConfigInput = z.infer<typeof chatPillsConfigSchema>;
