/**
 * Referee Submit — /ref/<token>
 *
 * Public unauthenticated form where a coach/scout submits a 2-line
 * reference for an athlete. Valid only while the cv_references row is
 * in 'requested' state with a matching request_token.
 */

import type { Metadata } from "next";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { RefereeSubmitForm } from "./RefereeSubmitForm";
import "../../t/[slug]/public-cv.css";

export const metadata: Metadata = {
  title: "Reference submission — Tomo",
  robots: { index: false, follow: false },
};

interface AthleteInfo {
  name: string;
  position: string | null;
  sport: string;
}

interface Resolved {
  referee_name: string;
  referee_role: string;
  club_institution: string;
  athlete: AthleteInfo;
  status: "requested" | "submitted" | "identity_verified" | "published" | "rejected";
}

async function resolveToken(token: string): Promise<Resolved | null> {
  const db = supabaseAdmin();
  const { data: row } = await (db as any)
    .from("cv_references")
    .select("referee_name, referee_role, club_institution, status, athlete_id")
    .eq("request_token", token)
    .single();
  if (!row) return null;

  const { data: athlete } = await (db as any)
    .from("users")
    .select("name, sport")
    .eq("id", row.athlete_id)
    .single();

  const { data: snapshot } = await (db as any)
    .from("athlete_snapshots")
    .select("position")
    .eq("athlete_id", row.athlete_id)
    .single();

  return {
    referee_name: row.referee_name,
    referee_role: row.referee_role,
    club_institution: row.club_institution,
    status: row.status,
    athlete: {
      name: athlete?.name ?? "this athlete",
      position: snapshot?.position ?? null,
      sport: athlete?.sport ?? "football",
    },
  };
}

export default async function RefereeSubmitPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const resolved = await resolveToken(token);

  if (!resolved) {
    return (
      <div className="cv-notfound">
        <div style={{ fontSize: 28, fontWeight: 600 }}>Link invalid</div>
        <div style={{ color: "rgba(245,243,237,0.5)", fontSize: 14 }}>
          This reference request link is not valid or has already been used.
        </div>
      </div>
    );
  }

  if (resolved.status !== "requested") {
    return (
      <div className="cv-notfound">
        <div style={{ fontSize: 28, fontWeight: 600 }}>Already submitted</div>
        <div style={{ color: "rgba(245,243,237,0.5)", fontSize: 14, maxWidth: 420 }}>
          Thank you — your reference for {resolved.athlete.name} has already been received.
          Tomo is verifying it now.
        </div>
      </div>
    );
  }

  return (
    <div className="cv-root">
      <div className="cv-container" style={{ maxWidth: 520 }}>
        <div className="cv-topbar">
          <span className="cv-topbar-brand">TOMO · REFERENCE</span>
        </div>

        <div className="cv-card">
          <div className="cv-card-header">
            <span className="cv-overline">You're writing a reference for</span>
          </div>
          <h1 className="cv-name" style={{ fontSize: 22, marginBottom: 4 }}>
            {resolved.athlete.name}
          </h1>
          <div className="cv-meta">
            {[resolved.athlete.position, capitalize(resolved.athlete.sport)].filter(Boolean).join(" · ")}
          </div>
          <div className="cv-meta-sub" style={{ marginTop: 10 }}>
            Hi {resolved.referee_name} — {resolved.athlete.name} asked for a short reference from
            {" "}their {resolved.referee_role.toLowerCase()} at {resolved.club_institution}.
            Rate them and leave a 2-line note. 60 seconds.
          </div>
        </div>

        <RefereeSubmitForm token={token} athleteName={resolved.athlete.name} />

        <div className="cv-footer">
          · TOMO · SECURE VERIFIED REFERENCE ·
        </div>
      </div>
    </div>
  );
}

function capitalize(s: string | null | undefined): string {
  if (!s) return "";
  return s.charAt(0).toUpperCase() + s.slice(1);
}
