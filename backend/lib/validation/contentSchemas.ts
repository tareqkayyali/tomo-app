import { z } from "zod";

// ---------- Content JSONB (flexible) ----------

export const contentJsonSchema = z.record(z.string(), z.unknown()).default({});

// ---------- Create ----------

export const contentItemCreateSchema = z.object({
  category: z.string().min(1, "Category is required"),
  subcategory: z.string().default(""),
  sport_id: z.string().nullable().optional(),
  key: z.string().default(""),
  sort_order: z.number().int().default(0),
  content: contentJsonSchema,
  active: z.boolean().default(true),
});

export type ContentItemCreateInput = z.infer<typeof contentItemCreateSchema>;

// ---------- Update ----------

export const contentItemUpdateSchema = z.object({
  category: z.string().min(1).optional(),
  subcategory: z.string().optional(),
  sport_id: z.string().nullable().optional(),
  key: z.string().optional(),
  sort_order: z.number().int().optional(),
  content: contentJsonSchema.optional(),
  active: z.boolean().optional(),
});

export type ContentItemUpdateInput = z.infer<typeof contentItemUpdateSchema>;

// ---------- Filters ----------

export const contentItemFilterSchema = z.object({
  category: z.string().optional(),
  subcategory: z.string().optional(),
  sport_id: z.string().optional(),
  active: z
    .string()
    .optional()
    .transform((v) =>
      v === "true" ? true : v === "false" ? false : undefined
    ),
  search: z.string().optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export type ContentItemFilters = z.infer<typeof contentItemFilterSchema>;
