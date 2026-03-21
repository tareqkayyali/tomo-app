import { z } from "zod";

// ---------- Sub-attribute schema ----------

export const subAttributeSchema = z.object({
  name: z.string().min(1, "Name is required"),
  weight: z.number().min(0).max(1).default(0),
  description: z.string().default(""),
  unit: z.string().default(""),
});

// ---------- Sport schemas ----------

export const sportCreateSchema = z.object({
  id: z
    .string()
    .min(1, "ID is required")
    .max(50)
    .regex(/^[a-z0-9_-]+$/, "ID must be lowercase alphanumeric with dashes/underscores"),
  label: z.string().min(1, "Label is required").max(100),
  icon: z.string().default(""),
  color: z
    .string()
    .regex(/^#[0-9A-Fa-f]{6}$/, "Must be a valid hex color")
    .default("#FF6B35"),
  sort_order: z.number().int().default(0),
  available: z.boolean().default(true),
  config: z.record(z.string(), z.unknown()).default({}),
});

export const sportUpdateSchema = sportCreateSchema.omit({ id: true }).partial();

// ---------- Attribute schemas ----------

export const attributeCreateSchema = z.object({
  sport_id: z.string().min(1, "Sport is required"),
  key: z
    .string()
    .min(1, "Key is required")
    .max(50)
    .regex(/^[a-z0-9_]+$/, "Key must be lowercase alphanumeric with underscores"),
  label: z.string().min(1, "Label is required").max(10),
  full_name: z.string().min(1, "Full name is required").max(100),
  abbreviation: z.string().max(10).default(""),
  description: z.string().max(500).default(""),
  color: z
    .string()
    .regex(/^#[0-9A-Fa-f]{6}$/, "Must be a valid hex color")
    .default("#888888"),
  max_value: z.number().int().min(1).max(999).default(99),
  sort_order: z.number().int().default(0),
  sub_attributes: z.array(subAttributeSchema).default([]),
});

export const attributeUpdateSchema = attributeCreateSchema.omit({ sport_id: true }).partial();

// ---------- Types ----------

export type SportCreateInput = z.infer<typeof sportCreateSchema>;
export type SportUpdateInput = z.infer<typeof sportUpdateSchema>;
export type AttributeCreateInput = z.infer<typeof attributeCreateSchema>;
export type AttributeUpdateInput = z.infer<typeof attributeUpdateSchema>;
export type SubAttribute = z.infer<typeof subAttributeSchema>;
