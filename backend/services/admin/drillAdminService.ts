import { supabaseAdmin } from "@/lib/supabase/admin";
import type {
  DrillCreateInput,
  DrillUpdateInput,
  DrillFilters,
} from "@/lib/validation/drillSchemas";

const db = () => supabaseAdmin();

function generateSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

// ---------- List ----------

export async function listDrills(filters: DrillFilters) {
  const { sport_id, category, intensity, active, search, page, limit } =
    filters;
  const offset = (page - 1) * limit;

  let query = db()
    .from("training_drills")
    .select("*, drill_tags(tag), drill_equipment(id), drill_progressions(id)", {
      count: "exact",
    })
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (sport_id) query = query.eq("sport_id", sport_id);
  if (category) query = query.eq("category", category);
  if (intensity) query = query.eq("intensity", intensity);
  if (active !== undefined) query = query.eq("active", active);
  if (search) query = query.ilike("name", `%${search}%`);

  const { data, count, error } = await query;
  if (error) throw error;

  return {
    drills: data ?? [],
    total: count ?? 0,
    page,
    limit,
  };
}

// ---------- Get Full ----------

export async function getDrillFull(id: string) {
  const [drillRes, equipRes, progRes, tagRes] = await Promise.all([
    db().from("training_drills").select("*").eq("id", id).single(),
    db()
      .from("drill_equipment")
      .select("*")
      .eq("drill_id", id)
      .order("name"),
    db()
      .from("drill_progressions")
      .select("*")
      .eq("drill_id", id)
      .order("sort_order"),
    db().from("drill_tags").select("*").eq("drill_id", id).order("tag"),
  ]);

  if (drillRes.error) throw drillRes.error;
  if (!drillRes.data) return null;

  return {
    ...drillRes.data,
    equipment: equipRes.data ?? [],
    progressions: progRes.data ?? [],
    tags: (tagRes.data ?? []).map((t) => t.tag),
  };
}

// ---------- Create ----------

export async function createDrill(input: DrillCreateInput) {
  const { equipment, progressions, tags, ...drillData } = input;

  // Auto-generate slug if not provided
  if (!drillData.slug) {
    drillData.slug = generateSlug(drillData.name);
  }

  // Ensure unique slug for this sport
  const slug = await ensureUniqueSlug(drillData.sport_id, drillData.slug);

  const { data: drill, error: drillErr } = await db()
    .from("training_drills")
    .insert([{ ...drillData, slug }])
    .select()
    .single();

  if (drillErr) throw drillErr;

  // Insert children
  await Promise.all([
    equipment.length > 0
      ? db()
          .from("drill_equipment")
          .insert(equipment.map((e) => ({ ...e, drill_id: drill.id })))
      : Promise.resolve(),
    progressions.length > 0
      ? db()
          .from("drill_progressions")
          .insert(
            progressions.map((p, i) => ({
              ...p,
              drill_id: drill.id,
              sort_order: i + 1,
            }))
          )
      : Promise.resolve(),
    tags.length > 0
      ? db()
          .from("drill_tags")
          .insert(tags.map((tag) => ({ tag, drill_id: drill.id })))
      : Promise.resolve(),
  ]);

  return getDrillFull(drill.id);
}

// ---------- Update ----------

export async function updateDrill(id: string, input: DrillUpdateInput) {
  const { equipment, progressions, tags, ...drillData } = input;

  // Update slug if name changed
  if (drillData.name && !drillData.slug) {
    drillData.slug = generateSlug(drillData.name);
  }
  if (drillData.slug && drillData.sport_id) {
    drillData.slug = await ensureUniqueSlug(
      drillData.sport_id,
      drillData.slug,
      id
    );
  }

  // Update parent
  if (Object.keys(drillData).length > 0) {
    const { error } = await db()
      .from("training_drills")
      .update(drillData)
      .eq("id", id);
    if (error) throw error;
  }

  // Replace children if provided
  if (equipment !== undefined) {
    await db().from("drill_equipment").delete().eq("drill_id", id);
    if (equipment.length > 0) {
      await db()
        .from("drill_equipment")
        .insert(equipment.map((e) => ({ ...e, drill_id: id })));
    }
  }

  if (progressions !== undefined) {
    await db().from("drill_progressions").delete().eq("drill_id", id);
    if (progressions.length > 0) {
      await db()
        .from("drill_progressions")
        .insert(
          progressions.map((p, i) => ({
            ...p,
            drill_id: id,
            sort_order: i + 1,
          }))
        );
    }
  }

  if (tags !== undefined) {
    await db().from("drill_tags").delete().eq("drill_id", id);
    if (tags.length > 0) {
      await db()
        .from("drill_tags")
        .insert(tags.map((tag) => ({ tag, drill_id: id })));
    }
  }

  return getDrillFull(id);
}

// ---------- Delete ----------

export async function deleteDrill(id: string, hard = false) {
  if (hard) {
    const { error } = await db()
      .from("training_drills")
      .delete()
      .eq("id", id);
    if (error) throw error;
  } else {
    const { error } = await db()
      .from("training_drills")
      .update({ active: false })
      .eq("id", id);
    if (error) throw error;
  }
}

// ---------- Toggle Active ----------

export async function toggleDrillActive(id: string) {
  const { data } = await db()
    .from("training_drills")
    .select("active")
    .eq("id", id)
    .single();
  if (!data) throw new Error("Drill not found");

  const { error } = await db()
    .from("training_drills")
    .update({ active: !data.active })
    .eq("id", id);
  if (error) throw error;

  return { active: !data.active };
}

// ---------- Duplicate ----------

export async function duplicateDrill(id: string) {
  const original = await getDrillFull(id);
  if (!original) throw new Error("Drill not found");

  const {
    id: _id,
    created_at: _ca,
    equipment,
    progressions,
    tags,
    ...data
  } = original;

  return createDrill({
    ...data,
    name: `${data.name} (Copy)`,
    slug: undefined,
    intensity: data.intensity as "light" | "moderate" | "hard",
    category: data.category as "warmup" | "training" | "cooldown" | "recovery" | "activation",
    instructions: data.instructions as string[],
    attribute_keys: (data.attribute_keys as string[]) ?? [],
    age_bands: (data.age_bands as string[]) ?? [],
    position_keys: (data.position_keys as string[]) ?? [],
    video_url: data.video_url ?? "",
    image_url: data.image_url ?? "",
    equipment: equipment.map(
      ({ id: _id, drill_id: _did, ...rest }: Record<string, unknown>) => ({
        name: rest.name as string,
        quantity: (rest.quantity as number) ?? 1,
        optional: (rest.optional as boolean) ?? false,
      })
    ),
    progressions: progressions.map(
      ({ id: _id, drill_id: _did, ...rest }: Record<string, unknown>) => ({
        level: rest.level as number,
        label: rest.label as string,
        description: (rest.description as string) ?? "",
        duration_minutes: rest.duration_minutes as number | undefined,
      })
    ),
    tags,
  });
}

// ---------- Tags ----------

export async function getAllTags() {
  const { data, error } = await db()
    .from("drill_tags")
    .select("tag")
    .order("tag");
  if (error) throw error;

  const unique = [...new Set((data ?? []).map((t) => t.tag))];
  return unique;
}

// ---------- Reorder ----------

export async function reorderDrills(
  items: { id: string; sort_order: number }[]
) {
  for (const item of items) {
    await db()
      .from("training_drills")
      .update({ sort_order: item.sort_order })
      .eq("id", item.id);
  }
}

// ---------- Media Upload ----------

export async function uploadDrillMedia(
  drillId: string,
  file: File,
  type: "video" | "image"
) {
  const drill = await db()
    .from("training_drills")
    .select("sport_id")
    .eq("id", drillId)
    .single();
  if (!drill.data) throw new Error("Drill not found");

  const ext = file.name.split(".").pop() || (type === "video" ? "mp4" : "jpg");
  const path = `${drill.data.sport_id}/${drillId}/${type}.${ext}`;

  const { error: uploadErr } = await db()
    .storage.from("drill-media")
    .upload(path, file, { upsert: true });
  if (uploadErr) throw uploadErr;

  const {
    data: { publicUrl },
  } = db().storage.from("drill-media").getPublicUrl(path);

  const field = type === "video" ? "video_url" : "image_url";
  await db()
    .from("training_drills")
    .update({ [field]: publicUrl })
    .eq("id", drillId);

  return publicUrl;
}

// ---------- Helpers ----------

async function ensureUniqueSlug(
  sportId: string,
  baseSlug: string,
  excludeId?: string
): Promise<string> {
  let slug = baseSlug;
  let counter = 1;

  while (true) {
    let query = db()
      .from("training_drills")
      .select("id")
      .eq("sport_id", sportId)
      .eq("slug", slug);
    if (excludeId) query = query.neq("id", excludeId);

    const { data } = await query.limit(1);
    if (!data || data.length === 0) return slug;

    counter++;
    slug = `${baseSlug}-${counter}`;
  }
}
