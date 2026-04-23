/**
 * Public Player CV — /t/<slug>
 *
 * Unauthenticated scout-facing view of the athlete's CV. Respects the
 * athlete's three medical-consent toggles (share_with_scouts_summary,
 * share_raw_data) via cvPublicView.applyScoutMasking. PII (email/phone/
 * guardian) is always stripped. Records a view on each load.
 *
 * Query params:
 *   ?print=1   — print-friendly layout (used by the PDF renderer)
 */

import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { headers as nextHeaders } from "next/headers";
import { resolvePublicCVBySlug, recordScoutView } from "@/services/cv/cvPublicView";
import type { PublicCVBundle } from "@/services/cv/cvPublicView";
import { PublicCVDocument } from "./PublicCVDocument";
import "./public-cv.css";

export async function generateMetadata(
  { params }: { params: Promise<{ slug: string }> }
): Promise<Metadata> {
  const { slug } = await params;
  const resolved = await resolvePublicCVBySlug(slug);
  if (!resolved) {
    return {
      title: "Player CV — Tomo",
      description: "This player's CV is not available.",
      robots: { index: false, follow: false },
    };
  }

  const bundle = resolved.bundle;
  const name = bundle.identity.full_name || "Player";
  const position = bundle.positions.primary_label ?? bundle.identity.primary_position ?? "";
  const sport = bundle.identity.sport.charAt(0).toUpperCase() + bundle.identity.sport.slice(1);
  const description = bundle.player_profile.ai_summary?.slice(0, 160) ??
    `${name} · ${position ? `${position} · ` : ""}${sport} · Verified by Tomo.`;

  return {
    title: `${name} — Player Passport`,
    description,
    robots: { index: true, follow: true },
    openGraph: {
      title: `${name} — Player Passport`,
      description,
      type: "profile",
    },
  };
}

export default async function PublicCVPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ print?: string }>;
}) {
  const { slug } = await params;
  const sp = await searchParams;
  const printMode = sp.print === "1";

  const resolved = await resolvePublicCVBySlug(slug);
  if (!resolved) notFound();

  if (!printMode) {
    const hdrs = await nextHeaders();
    const ip = hdrs.get("x-forwarded-for") ?? hdrs.get("x-real-ip") ?? null;
    const ua = hdrs.get("user-agent") ?? null;
    recordScoutView(resolved.athlete_id, slug, ip, ua).catch(() => {});
  }

  return <PublicCVDocument bundle={resolved.bundle} printMode={printMode} />;
}
