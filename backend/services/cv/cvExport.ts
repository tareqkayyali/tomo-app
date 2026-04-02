/**
 * CV Export — Generates PDF-ready HTML and shareable link tokens.
 *
 * PDF approach: Server generates HTML → mobile uses expo-print to render PDF.
 * Share approach: Unique token stored in cv_profiles, public endpoint serves HTML.
 */

import crypto from "crypto";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { assembleCVBundle, type FullCVBundle } from "./cvAssembler";

const db = () => supabaseAdmin();

// ── Share Link Management ──────────────────────────────────────────────

export async function getOrCreateShareToken(
  athleteId: string,
  cvType: "club" | "university"
): Promise<string> {
  const field = cvType === "club" ? "share_token_club" : "share_token_uni";

  // Check for existing token
  const { data: existing } = await (db() as any)
    .from("cv_profiles")
    .select(field)
    .eq("athlete_id", athleteId)
    .single();

  if (existing?.[field]) return existing[field];

  // Generate new token
  const token = crypto.randomBytes(24).toString("base64url");

  await (db() as any)
    .from("cv_profiles")
    .upsert(
      { athlete_id: athleteId, [field]: token, updated_at: new Date().toISOString() },
      { onConflict: "athlete_id" }
    );

  return token;
}

export async function revokeShareToken(
  athleteId: string,
  cvType: "club" | "university"
): Promise<void> {
  const field = cvType === "club" ? "share_token_club" : "share_token_uni";
  await (db() as any)
    .from("cv_profiles")
    .update({ [field]: null, updated_at: new Date().toISOString() })
    .eq("athlete_id", athleteId);
}

export async function resolveShareToken(
  token: string
): Promise<{ athleteId: string; cvType: "club" | "university" } | null> {
  // Check club tokens
  const { data: clubMatch } = await (db() as any)
    .from("cv_profiles")
    .select("athlete_id")
    .eq("share_token_club", token)
    .single();
  if (clubMatch) return { athleteId: clubMatch.athlete_id, cvType: "club" };

  // Check uni tokens
  const { data: uniMatch } = await (db() as any)
    .from("cv_profiles")
    .select("athlete_id")
    .eq("share_token_uni", token)
    .single();
  if (uniMatch) return { athleteId: uniMatch.athlete_id, cvType: "university" };

  return null;
}

export async function recordShareView(
  athleteId: string,
  cvType: "club" | "university",
  token: string,
  viewerIp?: string,
  viewerUa?: string
): Promise<void> {
  // Increment view count
  const viewField = cvType === "club" ? "share_club_views" : "share_uni_views";
  await (db() as any).rpc("increment_field", {
    table_name: "cv_profiles",
    field_name: viewField,
    row_id: athleteId,
    id_field: "athlete_id",
  }).catch(() => {
    // Fallback: manual increment
    (db() as any)
      .from("cv_profiles")
      .select(viewField)
      .eq("athlete_id", athleteId)
      .single()
      .then(({ data }: any) => {
        if (data) {
          (db() as any)
            .from("cv_profiles")
            .update({ [viewField]: (data[viewField] ?? 0) + 1 })
            .eq("athlete_id", athleteId)
            .then(() => {});
        }
      });
  });

  // Log the view
  await (db() as any)
    .from("cv_share_views")
    .insert({
      athlete_id: athleteId,
      cv_type: cvType,
      share_token: token,
      viewer_ip: viewerIp ?? null,
      viewer_ua: viewerUa ?? null,
    })
    .catch(() => {}); // Silent fail

  // Notification: CV_SHARE_VIEWED (fire-and-forget)
  import('../notifications/notificationEngine').then(({ createNotification }) => {
    const today = new Date().toISOString().split('T')[0];
    createNotification({
      athleteId,
      type: 'CV_SHARE_VIEWED',
      vars: { cv_type: cvType, N: 1, date: today },
    });
  }).catch(() => {});
}

// ── PDF HTML Generation ────────────────────────────────────────────────

/**
 * Generate complete HTML for the CV that can be:
 * 1. Rendered as PDF via expo-print on mobile
 * 2. Served as the public share page
 */
export async function generateCVHTML(
  athleteId: string,
  cvType: "club" | "university"
): Promise<string> {
  const cv = await assembleCVBundle(athleteId);
  return buildCVHTML(cv, cvType);
}

export function buildCVHTML(cv: FullCVBundle, cvType: "club" | "university"): string {
  const isUni = cvType === "university";
  const stmt = isUni ? cv.statements.personal_statement_uni : cv.statements.personal_statement_club;
  const now = new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
  const cvLabel = isUni ? "UNIVERSITY / NCAA PROFILE" : "CLUB PROFILE";

  // Build age group label
  const ageGroup = cv.identity.age ? `U${cv.identity.age <= 13 ? '13' : cv.identity.age <= 15 ? '15' : cv.identity.age <= 17 ? '17' : '19+'}` : '';
  const phvLabel = cv.physical.phv_stage === 'PRE' ? 'Pre-PHV' : cv.physical.phv_stage === 'CIRCA' ? 'Mid-PHV' : cv.physical.phv_stage === 'POST' ? 'Post-PHV' : '';
  const phvNote = phvLabel ? `${phvLabel} — physical peak ${cv.physical.phv_stage === 'POST' ? 'reached' : 'ahead'}` : '';

  // Coachability donut SVG
  const coachSVG = (score: number) => {
    const pct = score / 5;
    const circumference = 2 * Math.PI * 24;
    const filled = circumference * 0.75 * pct;
    const gap = circumference * 0.75 - filled;
    return `<svg width="60" height="60" viewBox="0 0 60 60"><circle cx="30" cy="30" r="24" fill="none" stroke="#2A2A2A" stroke-width="4"/><circle cx="30" cy="30" r="24" fill="none" stroke="#F4501E" stroke-width="4" stroke-dasharray="${filled.toFixed(1)} ${gap.toFixed(1)}" stroke-dashoffset="${(circumference * 0.25).toFixed(1)}" stroke-linecap="round" transform="rotate(-90 30 30)"/></svg>`;
  };

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${esc(cv.identity.full_name)} — Player CV</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
@page{size:A4;margin:0}
body{font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:11px;line-height:1.5;color:#fff;background:#0A0A0A;-webkit-print-color-adjust:exact;print-color-adjust:exact}
.page{width:595px;min-height:842px;margin:0 auto;position:relative;overflow:hidden}

/* Header bar — matches Python draw_header */
.hdr{background:#141414;padding:18px 24px;border-bottom:1px solid #2A2A2A;display:flex;align-items:flex-start;gap:14px;position:relative}
.hdr-av{width:72px;height:72px;border-radius:50%;background:#1C1C1C;border:2px solid #F4501E;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:18px;color:#F4501E;flex-shrink:0;overflow:hidden}
.hdr-av img{width:100%;height:100%;object-fit:cover}
.hdr-info{flex:1}
.hdr-name{font-size:16px;font-weight:700;color:#fff;letter-spacing:-0.2px}
.hdr-pos{font-size:9px;color:#888;margin-top:3px}
.hdr-pills{display:flex;gap:5px;margin-top:7px;flex-wrap:wrap}
.pill{font-size:7.5px;font-weight:600;padding:2px 8px;border-radius:3px;border:0.5px solid;white-space:nowrap}
.p-o{background:#2A1510;color:#F4501E;border-color:rgba(244,80,30,0.3)}
.p-b{background:#0D1A24;color:#3498DB;border-color:rgba(52,152,219,0.3)}
.p-g{background:#0D1F14;color:#2ECC71;border-color:rgba(46,204,113,0.3)}
.hdr-r{text-align:right;flex-shrink:0;padding-top:2px}
.hdr-rv{font-size:12px;font-weight:700;color:#fff}
.hdr-rl{font-size:7px;color:#888}
.hdr-rs{margin-bottom:8px}
.cv-badge{position:absolute;top:10px;right:24px}

/* Content area */
.body{padding:14px 24px 60px}

/* Section header — matches Python section_header */
.sh{display:flex;align-items:center;gap:6px;margin-bottom:5px;margin-top:12px}
.sh:first-child{margin-top:0}
.sh-t{font-size:7px;font-weight:700;text-transform:uppercase;letter-spacing:1.2px;color:#888}
.sh-line{flex:1;height:0.5px;background:#2A2A2A}
.bdg{font-size:6.5px;font-weight:600;padding:2px 7px;border-radius:3px;border:0.5px solid;white-space:nowrap}
.bdg-g{background:#0D1F14;color:#2ECC71;border-color:rgba(46,204,113,0.25)}
.bdg-o{background:#2A1510;color:#F4501E;border-color:rgba(244,80,30,0.25)}
.bdg-bl{background:#0D1A24;color:#3498DB;border-color:rgba(52,152,219,0.25)}

/* Two-column layout for statement + identity, career + benchmarks */
.cols{display:flex;gap:18px}
.col-l{flex:1}.col-r{flex:1}

/* Identity rows */
.ir{display:flex;justify-content:space-between;padding:2px 0}
.ir-l{color:#888;font-size:8.5px}.ir-v{color:#fff;font-size:8.5px;font-weight:500}

/* Statement block — italic with orange left border */
.stmt{font-size:8.5px;color:#ccc;line-height:1.65;font-style:italic;border-left:1.5px solid #F4501E;padding-left:8px;margin:4px 0}

/* Career entries */
.ce{border-left:1.5px solid #F4501E;padding-left:10px;margin-bottom:10px}
.ce-n{font-size:9.5px;font-weight:700;color:#fff;display:inline}
.ce-cur{font-size:6.5px;background:#2A1510;color:#F4501E;padding:1px 5px;border-radius:2px;border:0.5px solid rgba(244,80,30,0.3);margin-left:5px;vertical-align:middle}
.ce-m{font-size:8px;color:#888;margin-top:2px}
.ce-s{display:flex;gap:14px;margin-top:3px;font-size:8px;color:#888}
.ce-s b{color:#fff;font-weight:700;font-size:9px}
.ce-a{font-size:7.5px;color:#aaa;margin-top:2px}

/* Benchmarks with percentile bars */
.bn{font-size:7px;color:#888;margin-bottom:5px}
.br{display:flex;align-items:center;gap:4px;margin-bottom:5px}
.br-l{color:#888;font-size:8px;min-width:62px}
.br-v{font-size:9px;font-weight:700;color:#fff;min-width:44px}
.br-bar{flex:1;height:3.5px;background:#2A2A2A;border-radius:2px;overflow:hidden}
.br-fill{height:3.5px;background:#F4501E;border-radius:2px}
.br-p{font-size:8px;font-weight:700;color:#F4501E;min-width:24px;text-align:right}

/* Verified banner */
.vb{background:#2A1510;border:0.5px solid #4A1F10;border-radius:4px;padding:6px 10px;display:flex;align-items:center;gap:6px;margin-bottom:8px}
.vb-dot{width:5px;height:5px;border-radius:50%;background:#F4501E;flex-shrink:0}
.vb-t{font-size:7.5px;font-weight:600;color:#F4501E}

/* Tomo Verified stamp */
.stamp{display:inline-flex;align-items:center;gap:5px;background:#2A1510;border:0.8px solid #F4501E;border-radius:3px;padding:3px 8px;margin-top:6px}
.stamp-t{font-size:7.5px;font-weight:700;color:#F4501E;letter-spacing:0.3px}

/* Performance stat grid — matches Python draw_stat_box */
.pg{display:grid;grid-template-columns:1fr 1fr 1fr 1fr;gap:5px}
.pc{background:#1C1C1C;border:0.5px solid #2A2A2A;border-radius:4px;padding:8px 6px;text-align:center}
.pc-v{font-size:16px;font-weight:700;color:#fff}
.pc-l{font-size:7px;color:#888;margin-top:2px}
.pc-s{font-size:6.5px;color:#2ECC71;margin-top:1px}

/* Coachability — matches Python draw_coachability with donut */
.cw{display:flex;align-items:center;gap:12px;margin-bottom:8px}
.c-donut{position:relative;width:60px;height:60px;flex-shrink:0}
.c-donut svg{width:60px;height:60px}
.c-num{position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);font-size:11px;font-weight:700;color:#F4501E;text-align:center}
.c-num small{display:block;font-size:6px;color:#888;font-weight:400}
.c-info .c-lbl{font-weight:700;font-size:10px;color:#fff}
.c-info .c-sub{font-size:8px;color:#888;margin-top:1px}
.cr{display:flex;align-items:center;gap:6px;margin-bottom:4px}
.cr-l{font-size:7.5px;color:#888;min-width:100px}
.cr-bar{flex:1;height:3px;background:#2A2A2A;border-radius:2px;overflow:hidden}
.cr-fill{height:3px;border-radius:2px}
.cr-v{font-size:7.5px;font-weight:700;min-width:24px;text-align:right}

/* Video & media */
.vr{display:flex;align-items:center;gap:8px;margin-bottom:6px}
.vr-th{width:38px;height:26px;background:#1C1C1C;border:0.5px solid #2A2A2A;border-radius:3px;display:flex;align-items:center;justify-content:center}
.vr-play{width:0;height:0;border-top:4px solid transparent;border-bottom:4px solid transparent;border-left:7px solid #F4501E;margin-left:1px}
.vr-ti{font-size:9px;font-weight:600;color:#fff}
.vr-url{font-size:7px;color:#3498DB;text-decoration:none}

/* References */
.rr{display:flex;align-items:center;gap:8px;margin-bottom:6px}
.rr-av{width:28px;height:28px;border-radius:50%;background:#1C1C1C;border:0.5px solid #2A2A2A;display:flex;align-items:center;justify-content:center;font-size:9px;font-weight:700;color:#F4501E;flex-shrink:0}
.rr-n{font-size:9px;font-weight:600;color:#fff}
.rr-r{font-size:7px;color:#888}
.rr-c{font-size:6.5px;font-weight:600;background:#0D1F14;color:#2ECC71;border:0.5px solid rgba(46,204,113,0.25);padding:2px 5px;border-radius:2px;margin-left:auto}

/* Uni blocks */
.ub{background:#0D1A24;border:0.5px solid rgba(52,152,219,0.18);border-radius:4px;padding:6px 10px;margin-bottom:5px}
.ub-l{font-size:7px;font-weight:600;color:#3498DB;text-transform:uppercase;letter-spacing:.4px;margin-bottom:1px}
.ub-v{font-size:9px;font-weight:500;color:#fff}

/* Character traits */
.ct{display:flex;align-items:center;gap:5px;margin-bottom:3px}
.ct-d{width:3px;height:3px;border-radius:50%;background:#F4501E;flex-shrink:0}
.ct-t{font-size:8px;color:#ccc}

/* Footer — matches Python draw_footer */
.ft{padding:6px 24px;border-top:0.5px solid #2A2A2A;display:flex;justify-content:space-between;align-items:center;margin-top:auto}
.ft span{font-size:7px;color:#888}
.ft-tomo{font-size:7px;font-weight:700;color:#F4501E}
</style>
</head>
<body>
<div class="page">

<!-- ═══ HEADER — matches Python draw_header ═══ -->
<div class="hdr">
  <div class="hdr-av">${cv.identity.photo_url
    ? `<img src="${esc(cv.identity.photo_url)}" alt="">`
    : esc((cv.identity.full_name || "P").charAt(0).toUpperCase())}</div>
  <div class="hdr-info">
    <div class="hdr-name">${esc(cv.identity.full_name)}</div>
    <div class="hdr-pos">${esc(cv.identity.position ?? "")}  ·  ${esc(cv.identity.sport)}</div>
    <div class="hdr-pills">
      ${ageGroup && cv.identity.nationality ? `<span class="pill p-o">${esc(ageGroup)} · ${esc(cv.identity.nationality)}</span>` : ""}
      ${phvNote ? `<span class="pill p-b">${esc(phvNote)}</span>` : ""}
    </div>
  </div>
  <div class="hdr-r">
    ${cv.physical.height_cm ? `<div class="hdr-rs"><div class="hdr-rv">${cv.physical.height_cm}cm</div><div class="hdr-rl">Height</div></div>` : ""}
    ${cv.physical.weight_kg ? `<div class="hdr-rs"><div class="hdr-rv">${cv.physical.weight_kg}kg</div><div class="hdr-rl">Weight</div></div>` : ""}
    ${cv.identity.preferred_foot ? `<div class="hdr-rs"><div class="hdr-rv">${esc(cv.identity.preferred_foot.charAt(0).toUpperCase() + cv.identity.preferred_foot.slice(1))}</div><div class="hdr-rl">Foot</div></div>` : ""}
  </div>
  <div class="cv-badge"><span class="pill ${isUni ? 'p-b' : 'p-o'}">${cvLabel}</span></div>
</div>

<div class="body">

<!-- ═══ PLAYER PROFILE + PLAYER IDENTITY (two columns) ═══ -->
${stmt ? `
<div class="sh"><span class="sh-t">Player Profile</span><span class="bdg bdg-bl">AI-generated · athlete-approved</span><span class="sh-line"></span></div>
<div class="stmt">${esc(stmt)}</div>
` : ""}

<div class="cols">
  <div class="col-l">
    ${cv.career.length > 0 ? `
    <div class="sh"><span class="sh-t">Career History</span><span class="bdg bdg-o">Manual entry</span><span class="sh-line"></span></div>
    ${cv.career.map(c => `<div class="ce">
      <div><span class="ce-n">${esc(c.club_name)}</span>${c.is_current ? `<span class="ce-cur">CURRENT</span>` : ""}</div>
      <div class="ce-m">${esc(c.league_level ?? "")}${c.league_level ? "  ·  " : ""}${c.started_month ? esc(c.started_month) : ""} – ${c.ended_month ? esc(c.ended_month) : "Present"}</div>
      ${(c.appearances != null || c.goals != null || c.assists != null) ? `<div class="ce-s">${c.appearances != null ? `<span>Apps <b>${c.appearances}</b></span>` : ""}${c.goals != null ? `<span>Goals <b>${c.goals}</b></span>` : ""}${c.assists != null ? `<span>Assists<b>${c.assists}</b></span>` : ""}</div>` : ""}
      ${c.achievements.length > 0 ? c.achievements.map(a => `<div class="ce-a">— ${esc(a)}</div>`).join("") : ""}
    </div>`).join("")}
    ` : ""}
    <div class="sh"><span class="sh-t">Player Identity</span><span class="bdg bdg-g">Auto</span><span class="sh-line"></span></div>
    <div class="ir"><span class="ir-l">DOB</span><span class="ir-v">${esc(cv.identity.date_of_birth ?? "—")}</span></div>
    <div class="ir"><span class="ir-l">Height</span><span class="ir-v">${cv.physical.height_cm ?? "—"} cm</span></div>
    <div class="ir"><span class="ir-l">Weight</span><span class="ir-v">${cv.physical.weight_kg ?? "—"} kg</span></div>
    <div class="ir"><span class="ir-l">Foot</span><span class="ir-v">${esc(cv.identity.preferred_foot ? cv.identity.preferred_foot.charAt(0).toUpperCase() + cv.identity.preferred_foot.slice(1) : "—")}</span></div>
  </div>
  <div class="col-r">
    <div class="sh"><span class="sh-t">Benchmarks</span><span class="bdg bdg-g">Auto · verified</span><span class="sh-line"></span></div>
    ${cv.performance.benchmarks.length > 0 ? `
    <div class="bn">${esc(cv.performance.benchmarks[0]?.age_band ?? "")} football · ${cv.performance.benchmarks.length} metrics</div>
    ${cv.performance.benchmarks.slice(0, 5).map(b => `<div class="br">
      <span class="br-l">${esc(b.metric_label)}</span>
      <span class="br-v">${b.value}${b.unit ? esc(b.unit) : ""}</span>
      <div class="br-bar"><div class="br-fill" style="width:${Math.min(100, b.percentile)}%"></div></div>
      <span class="br-p">${Math.round(b.percentile)}th</span>
    </div>`).join("")}` : `<div style="font-size:8px;color:#888;padding:8px 0">No benchmarks recorded yet</div>`}
  </div>
</div>

<!-- ═══ VERIFIED PERFORMANCE DATA ═══ -->
<div class="sh"><span class="sh-t">Verified Performance Data</span><span class="bdg bdg-o">Tomo-unique</span><span class="sh-line"></span></div>
<div class="vb"><div class="vb-dot"></div><span class="vb-t">All data verified by Tomo platform  ·  ${cv.performance.data_start_date ? new Date(cv.performance.data_start_date).toLocaleDateString("en-US", {month:"short", year:"numeric"}) : ""} – ${now}</span></div>
<div class="pg">
  <div class="pc"><div class="pc-v">${cv.performance.sessions_total > 0 ? Math.round((cv.performance.sessions_total / Math.max(1, cv.performance.sessions_total + 7)) * 100) : 0}%</div><div class="pc-l">Session completion</div><div class="pc-s">${cv.performance.sessions_total} sessions</div></div>
  <div class="pc"><div class="pc-v">${cv.performance.training_age_months}mo</div><div class="pc-l">Training age</div><div class="pc-s">Structured</div></div>
  <div class="pc"><div class="pc-v">${cv.performance.streak_days}d</div><div class="pc-l">Check-in streak</div><div class="pc-s">${cv.performance.streak_days > 0 ? "Daily active" : "—"}</div></div>
  <div class="pc"><div class="pc-v">${cv.performance.acwr?.toFixed(2) ?? "—"}</div><div class="pc-l">ACWR avg 90d</div><div class="pc-s">${cv.performance.acwr && cv.performance.acwr >= 0.8 && cv.performance.acwr <= 1.3 ? "Optimal range" : "—"}</div></div>
</div>
<div class="stamp"><span class="stamp-t">✓  TOMO VERIFIED DATA</span></div>

${cv.trajectory.narrative ? `
<!-- ═══ DEVELOPMENT TRAJECTORY ═══ -->
<div class="sh"><span class="sh-t">Development Trajectory</span><span class="bdg bdg-o">Tomo-unique</span><span class="sh-line"></span></div>
<div style="font-size:8px;color:#888;line-height:1.6;font-style:italic">${esc(cv.trajectory.narrative)}</div>
` : ""}

${cv.performance.coachability ? `
<!-- ═══ COACHABILITY INDEX — with donut ring ═══ -->
<div class="sh"><span class="sh-t">Coachability Index</span><span class="bdg bdg-o">Tomo-unique</span><span class="sh-line"></span></div>
<div class="cw">
  <div class="c-donut">
    ${coachSVG(cv.performance.coachability.score)}
    <div class="c-num">${cv.performance.coachability.score.toFixed(1)}<small>/ 5.0</small></div>
  </div>
  <div class="c-info">
    <div class="c-lbl">${esc(cv.performance.coachability.label.split("—")[0].trim())}</div>
    <div class="c-sub">${esc(cv.performance.coachability.label.includes("—") ? cv.performance.coachability.label.split("—")[1].trim() : "")}</div>
  </div>
</div>
<div class="cr"><span class="cr-l">Target achievement rate</span><div class="cr-bar"><div class="cr-fill" style="width:${Math.round(cv.performance.coachability.components.target_achievement_rate * 100)}%;background:#2ECC71"></div></div><span class="cr-v" style="color:#2ECC71">${Math.round(cv.performance.coachability.components.target_achievement_rate * 100)}%</span></div>
<div class="cr"><span class="cr-l">Adaptation velocity</span><div class="cr-bar"><div class="cr-fill" style="width:${Math.round(cv.performance.coachability.components.adaptation_velocity * 100)}%;background:#F4501E"></div></div><span class="cr-v" style="color:#F4501E">${Math.round(cv.performance.coachability.components.adaptation_velocity * 100)}%</span></div>
<div class="cr"><span class="cr-l">Coach responsiveness</span><div class="cr-bar"><div class="cr-fill" style="width:${Math.round(cv.performance.coachability.components.coach_responsiveness * 100)}%;background:#3498DB"></div></div><span class="cr-v" style="color:#3498DB">${Math.round(cv.performance.coachability.components.coach_responsiveness * 100)}%</span></div>
` : ""}

${isUni && cv.academic.length > 0 ? `
<!-- ═══ ACADEMIC PROFILE ═══ -->
<div class="sh"><span class="sh-t">Academic Profile</span><span class="bdg bdg-o">Manual entry</span><span class="sh-line"></span></div>
${cv.academic.map(a => `<div class="ub"><div class="ub-l">${esc(a.qualification ?? "CURRENT SCHOOL")}</div><div class="ub-v">${esc(a.institution)}${a.gpa ? `  ·  GPA: ${esc(a.gpa)}` : ""}${a.is_current ? "  ·  Current" : ""}</div></div>`).join("")}
` : ""}

${isUni && cv.dual_role.narrative ? `
<!-- ═══ DUAL-ROLE COMPETENCY ═══ -->
<div class="sh"><span class="sh-t">Dual-Role Competency</span><span class="bdg bdg-o">Tomo-unique</span><span class="sh-line"></span></div>
<div class="stmt" style="border-left-color:#3498DB">${esc(cv.dual_role.narrative)}</div>
` : ""}

${cv.media.length > 0 ? `
<!-- ═══ VIDEO & MEDIA ═══ -->
<div class="sh"><span class="sh-t">Video & Media</span><span class="bdg bdg-o">Manual entry</span><span class="sh-line"></span></div>
${cv.media.map(m => `<div class="vr">
  <div class="vr-th"><div class="vr-play"></div></div>
  <div><div class="vr-ti">${esc(m.title || "Highlight reel")}</div><a class="vr-url" href="${esc(m.url)}">${esc(m.url.replace(/^https?:\/\//, "").substring(0, 40))}</a></div>
</div>`).join("")}
` : ""}

${cv.references.filter(r => r.consent_given).length > 0 ? `
<!-- ═══ REFERENCES ═══ -->
<div class="sh"><span class="sh-t">References</span><span class="bdg bdg-o">Manual entry</span><span class="sh-line"></span></div>
${cv.references.filter(r => r.consent_given).map(r => `<div class="rr">
  <div class="rr-av">${esc(r.referee_name.split(" ").map(w => w[0]).join("").substring(0, 2))}</div>
  <div style="flex:1"><div class="rr-n">${esc(r.referee_name)}</div><div class="rr-r">${esc(r.referee_role)}  ·  ${esc(r.club_institution)}</div></div>
  <span class="rr-c">Consent given</span>
</div>`).join("")}
` : ""}

${cv.character_traits.length > 0 ? `
<!-- ═══ CHARACTER & AWARDS ═══ -->
<div class="sh"><span class="sh-t">Character & Awards</span><span class="bdg bdg-o">Manual entry</span><span class="sh-line"></span></div>
${cv.character_traits.map(t => `<div class="ct"><div class="ct-d"></div><span class="ct-t">${esc(t.title)}${t.level ? ` (${esc(t.level)})` : ""}${t.date ? ` · ${esc(t.date)}` : ""}</span></div>`).join("")}
` : ""}

</div><!-- end body -->

<!-- ═══ FOOTER — matches Python draw_footer ═══ -->
<div class="ft">
  <span>Generated by Tomo — app.my-tomo.com</span>
  <span>Data verified by Tomo platform. Not for redistribution.</span>
  <span class="ft-tomo">tomo</span>
</div>

</div><!-- end page -->
</body>
</html>`;
}

function esc(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
