import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase/admin";

/**
 * POST /api/v1/cv/upload-photo
 * Accepts base64 image data, uploads to Supabase Storage, returns public URL.
 * Body: { image: "data:image/jpeg;base64,..." }
 */
export async function POST(req: NextRequest) {
  const auth = requireAuth(req);
  if ("error" in auth) return auth.error;

  try {
    const body = await req.json();
    const imageData: string = body.image;
    if (!imageData) {
      return NextResponse.json({ error: "No image data provided" }, { status: 400 });
    }

    const db = supabaseAdmin();

    // Extract base64 content
    const matches = imageData.match(/^data:image\/(\w+);base64,(.+)$/);
    let buffer: Buffer;
    let ext: string;

    if (matches) {
      ext = matches[1] === 'jpeg' ? 'jpg' : matches[1];
      buffer = Buffer.from(matches[2], 'base64');
    } else {
      // Assume raw base64 JPEG
      ext = 'jpg';
      buffer = Buffer.from(imageData, 'base64');
    }

    const path = `avatars/${auth.user.id}.${ext}`;

    // Upload to Supabase Storage (create bucket if needed)
    const { error: uploadError } = await db.storage
      .from('profiles')
      .upload(path, buffer, {
        contentType: `image/${ext === 'jpg' ? 'jpeg' : ext}`,
        upsert: true,
      });

    if (uploadError) {
      // Bucket might not exist — try creating it
      if (uploadError.message?.includes('not found') || uploadError.message?.includes('Bucket')) {
        await db.storage.createBucket('profiles', { public: true });
        const { error: retryErr } = await db.storage
          .from('profiles')
          .upload(path, buffer, {
            contentType: `image/${ext === 'jpg' ? 'jpeg' : ext}`,
            upsert: true,
          });
        if (retryErr) throw retryErr;
      } else {
        throw uploadError;
      }
    }

    // Get public URL
    const { data: urlData } = db.storage.from('profiles').getPublicUrl(path);
    const publicUrl = urlData.publicUrl;

    // Update user profile
    await (db as any)
      .from('users')
      .update({ photo_url: publicUrl, avatar_url: publicUrl })
      .eq('id', auth.user.id);

    return NextResponse.json({ ok: true, url: publicUrl });
  } catch (err) {
    console.error('[CV] Photo upload failed:', err);
    return NextResponse.json(
      { error: "Failed to upload photo", detail: String(err) },
      { status: 500 }
    );
  }
}
