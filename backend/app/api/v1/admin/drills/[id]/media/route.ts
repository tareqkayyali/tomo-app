import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin/apiAuth";
import { uploadDrillMedia } from "@/services/admin/drillAdminService";

const MAX_VIDEO_SIZE = 100 * 1024 * 1024; // 100MB
const MAX_IMAGE_SIZE = 5 * 1024 * 1024; // 5MB
const ALLOWED_VIDEO_TYPES = ["video/mp4", "video/webm"];
const ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdmin(req);
  if ("error" in auth) return auth.error;

  const { id } = await params;

  const formData = await req.formData();
  const file = formData.get("file") as File | null;
  const type = formData.get("type") as "video" | "image" | null;

  if (!file || !type) {
    return NextResponse.json(
      { error: "File and type are required" },
      { status: 400 }
    );
  }

  // Validate file type and size
  if (type === "video") {
    if (!ALLOWED_VIDEO_TYPES.includes(file.type)) {
      return NextResponse.json(
        { error: `Invalid video type. Allowed: ${ALLOWED_VIDEO_TYPES.join(", ")}` },
        { status: 400 }
      );
    }
    if (file.size > MAX_VIDEO_SIZE) {
      return NextResponse.json(
        { error: "Video must be under 100MB" },
        { status: 400 }
      );
    }
  } else {
    if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
      return NextResponse.json(
        { error: `Invalid image type. Allowed: ${ALLOWED_IMAGE_TYPES.join(", ")}` },
        { status: 400 }
      );
    }
    if (file.size > MAX_IMAGE_SIZE) {
      return NextResponse.json(
        { error: "Image must be under 5MB" },
        { status: 400 }
      );
    }
  }

  try {
    const url = await uploadDrillMedia(id, file, type);
    return NextResponse.json({ url });
  } catch (err) {
    return NextResponse.json(
      { error: "Upload failed", detail: String(err) },
      { status: 500 }
    );
  }
}
