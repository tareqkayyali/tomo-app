import { NextRequest, NextResponse } from "next/server";
import { requireEnterprise } from "@/lib/admin/enterpriseAuth";
import { logAudit } from "@/lib/admin/audit";
import {
  getSnapshot,
  getLiveSnapshot,
  rollbackToSnapshot,
} from "@/services/admin/snapshotService";

interface Params { params: Promise<{ id: string }> }

export async function GET(req: NextRequest, { params }: Params) {
  const auth = await requireEnterprise(req, "institutional_pd");
  if ("error" in auth) return auth.error;
  const { id } = await params;
  try {
    const snap = id === "live" ? await getLiveSnapshot() : await getSnapshot(id);
    if (!snap) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json(snap);
  } catch (err) {
    return NextResponse.json(
      { error: "Failed to load snapshot", detail: String(err) },
      { status: 500 },
    );
  }
}

/** PUT with body { _action: "rollback" } makes this snapshot live. */
export async function PUT(req: NextRequest, { params }: Params) {
  const auth = await requireEnterprise(req, "institutional_pd");
  if ("error" in auth) return auth.error;
  const { id } = await params;

  const body = await req.json().catch(() => null);
  if (body?._action !== "rollback") {
    return NextResponse.json(
      { error: "Only rollback action is supported on snapshots." },
      { status: 400 },
    );
  }

  try {
    const before = await getSnapshot(id);
    if (!before) return NextResponse.json({ error: "Not found" }, { status: 404 });
    const after = await rollbackToSnapshot(id, auth.user.id);
    await logAudit({
      actor: auth.user,
      action: "update",
      resource_type: "methodology_publish_snapshot",
      resource_id: id,
      metadata: { action: "rollback", label: after.label },
      req,
    });
    return NextResponse.json(after);
  } catch (err) {
    return NextResponse.json(
      { error: "Failed to rollback", detail: String(err) },
      { status: 500 },
    );
  }
}
