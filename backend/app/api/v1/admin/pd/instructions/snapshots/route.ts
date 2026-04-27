import { NextRequest, NextResponse } from "next/server";
import { requireEnterprise } from "@/lib/admin/enterpriseAuth";
import { logAudit } from "@/lib/admin/audit";
import {
  listSnapshots,
  publishSnapshot,
} from "@/services/admin/snapshotService";
import { z } from "zod";

const publishBodySchema = z.object({
  label: z.string().min(1).max(200),
  notes: z.string().max(2000).optional(),
});

export async function GET(req: NextRequest) {
  const auth = await requireEnterprise(req, "institutional_pd");
  if ("error" in auth) return auth.error;
  try {
    const snapshots = await listSnapshots();
    return NextResponse.json({ snapshots });
  } catch (err) {
    return NextResponse.json(
      { error: "Failed to list snapshots", detail: String(err) },
      { status: 500 },
    );
  }
}

export async function POST(req: NextRequest) {
  const auth = await requireEnterprise(req, "institutional_pd");
  if ("error" in auth) return auth.error;

  const body = await req.json().catch(() => null);
  const parsed = publishBodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  try {
    const snap = await publishSnapshot({
      label: parsed.data.label,
      notes: parsed.data.notes ?? null,
      publishedBy: auth.user.id,
    });
    await logAudit({
      actor: auth.user,
      action: "create",
      resource_type: "methodology_publish_snapshot",
      resource_id: snap.id,
      metadata: {
        action: "publish",
        label: snap.label,
        directive_count: snap.directive_count,
      },
      req,
    });
    return NextResponse.json(snap, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const isClient = message.toLowerCase().includes("no approved rules");
    return NextResponse.json(
      { error: isClient ? message : "Failed to publish snapshot", detail: message },
      { status: isClient ? 400 : 500 },
    );
  }
}
