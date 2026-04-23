/**
 * PublicCVDocument — long-form scout-facing render of the Player Passport.
 *
 * Receives a masked PublicCVBundle (PII stripped, medical consent honoured).
 * When printMode=true (?print=1), applies light-themed print styles by
 * adding cv-print-mode to the root — used by the Playwright PDF renderer.
 */

import type { PublicCVBundle } from "@/services/cv/cvPublicView";

interface Props {
  bundle: PublicCVBundle;
  printMode: boolean;
}

export function PublicCVDocument({ bundle, printMode }: Props) {
  const { identity, physical, positions, player_profile, verified_performance,
          career, media, references, awards_character, health_status,
          completeness_pct, share } = bundle;

  return (
    <div className={printMode ? "cv-print-mode" : ""}>
      <div className="cv-root">
        <div className="cv-container">
          <div className="cv-topbar">
            <span className="cv-topbar-brand">TOMO · PLAYER PASSPORT</span>
            <span className="cv-topbar-meta">
              {completeness_pct}% complete · {share.share_views_count} views
            </span>
          </div>

          {/* Hero */}
          <div className="cv-card cv-hero">
            <div className="cv-avatar">
              {identity.photo_url ? <img src={identity.photo_url} alt="" /> : null}
            </div>
            <div className="cv-hero-body">
              <div className="cv-hero-badge-row">
                <span className="cv-chip cv-chip-sage">VERIFIED BY TOMO</span>
                <span className="cv-chip">
                  {identity.age_group ?? "PLAYER"}
                </span>
              </div>
              <h1 className="cv-name">{identity.full_name || "—"}</h1>
              <div className="cv-meta">
                {[identity.primary_position, capitalize(identity.sport), identity.age != null ? `Age ${identity.age}` : null]
                  .filter(Boolean)
                  .join(" · ")}
              </div>
              <div className="cv-meta-sub">
                {[identity.nationality, identity.preferred_foot ? `${capitalize(identity.preferred_foot)} foot` : null, formatPhv(identity.phv_stage, identity.phv_offset_years)]
                  .filter(Boolean)
                  .join(" · ")}
              </div>
            </div>
          </div>

          {/* AI Summary */}
          {player_profile.ai_summary && player_profile.ai_summary_status === "approved" ? (
            <div className="cv-card">
              <div className="cv-card-header">
                <span className="cv-overline">Player Profile</span>
                <span className="cv-chip cv-chip-sage">APPROVED</span>
              </div>
              <p className="cv-quote">{player_profile.ai_summary}</p>
              {player_profile.key_signals.strengths.length > 0 ||
                player_profile.key_signals.focus_areas.length > 0 ||
                player_profile.key_signals.physical_maturity ? (
                <div style={{ marginTop: 16 }}>
                  <span className="cv-overline" style={{ display: "block", marginBottom: 10 }}>
                    Key Signals
                  </span>
                  {player_profile.key_signals.strengths.map((s) => (
                    <SignalRow
                      key={s.metric_key}
                      label={s.label}
                      detail={`${s.percentile_label} · ${s.detail}`}
                      tag="STRENGTH"
                      tone="elite"
                    />
                  ))}
                  {player_profile.key_signals.physical_maturity ? (
                    <SignalRow
                      label="Physical maturity"
                      detail={`${player_profile.key_signals.physical_maturity.label} · ${player_profile.key_signals.physical_maturity.detail}`}
                    />
                  ) : null}
                  {player_profile.key_signals.focus_areas.map((s) => (
                    <SignalRow
                      key={s.metric_key}
                      label={s.label}
                      detail={`${s.percentile_label} · ${s.detail}`}
                      tag="FOCUS"
                    />
                  ))}
                </div>
              ) : null}
            </div>
          ) : null}

          {/* Identity block */}
          <div className="cv-card">
            <div className="cv-card-header">
              <span className="cv-overline">Personal Details</span>
              <span className="cv-chip cv-chip-sage">AUTO</span>
            </div>
            <Row label="Full name" value={identity.full_name} />
            <Row label="Date of birth" value={formatDate(identity.date_of_birth)} />
            <Row label="Nationality" value={identity.nationality} />
            <Row label="Height" value={physical.height_cm != null ? `${physical.height_cm} cm` : null} />
            <Row label="Weight" value={physical.weight_kg != null ? `${physical.weight_kg} kg` : null} />
            <Row label="Preferred foot" value={identity.preferred_foot ? capitalize(identity.preferred_foot) : null} />
            <Row label="Maturity" value={formatPhv(identity.phv_stage, identity.phv_offset_years)} />
          </div>

          {/* Sport profile */}
          <div className="cv-card">
            <div className="cv-card-header">
              <span className="cv-overline">Sport Profile</span>
              <span className="cv-chip cv-chip-sage">AUTO</span>
            </div>
            <Row label="Primary sport" value={capitalize(identity.sport)} />
            <Row label="Primary position" value={positions.primary_label ?? positions.primary_position} accent />
            <Row label="Secondary positions" value={positions.secondary_positions.length > 0 ? positions.secondary_positions.join(" · ") : "—"} />
            <Row label="Current age group" value={identity.age_group} />
          </div>

          {/* Verified performance */}
          <div className="cv-banner-verified">
            <div className="cv-banner-icon">✓</div>
            <div>
              <div className="cv-banner-title">ALL DATA VERIFIED BY TOMO</div>
              <div className="cv-banner-sub">Collected from on-platform sensors and sessions</div>
            </div>
          </div>

          <div className="cv-card">
            <div className="cv-card-header">
              <span className="cv-overline">Performance KPIs</span>
              <span className="cv-chip cv-chip-sage">LIVE</span>
            </div>
            <div className="cv-kpi-grid">
              <KPI value={String(verified_performance.sessions_total)} label="Sessions" hint="all time" />
              <KPI value={verified_performance.training_age_label} label="Training age" hint="structured" />
              <KPI value={`${verified_performance.streak_days} d`} label="Streak" hint="active" />
              <KPI
                value={verified_performance.acwr != null ? verified_performance.acwr.toFixed(2) : "—"}
                label="ACWR"
                hint={verified_performance.training_balance ?? "—"}
              />
            </div>
          </div>

          {/* Benchmarks */}
          {verified_performance.benchmarks.length > 0 ? (
            <div className="cv-card">
              <div className="cv-card-header">
                <span className="cv-overline">
                  Benchmarked vs {identity.age_group ?? "U19"} {capitalize(identity.sport)}
                </span>
                <span className="cv-chip cv-chip-sage">AUTO</span>
              </div>
              {verified_performance.benchmarks.map((b) => (
                <div key={b.metric_key} className="cv-bench">
                  <div className="cv-bench-head">
                    <span className="cv-bench-label">{b.metric_label}</span>
                    <span className="cv-bench-cluster">
                      <span className="cv-bench-value">
                        {b.value}
                        <span className="cv-bench-unit">{b.unit}</span>
                      </span>
                      <span className={`cv-bench-rank cv-zone-${b.zone}`}>
                        {Math.round(b.percentile)}th
                      </span>
                    </span>
                  </div>
                  <div className="cv-bar-track">
                    <div
                      className={`cv-bar-fill cv-zone-${b.zone}-bg`}
                      style={{ width: `${Math.max(2, Math.min(100, b.percentile))}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          ) : null}

          {/* Career */}
          {career.length > 0 ? (
            <div className="cv-card">
              <div className="cv-card-header">
                <span className="cv-overline">Career History</span>
                <span className="cv-chip">{career.length} ENTRIES</span>
              </div>
              {career.map((c) => (
                <div key={c.id} className="cv-career">
                  <div className="cv-career-head">
                    <span className="cv-career-club">{c.club_name}</span>
                    {c.is_current ? <span className="cv-chip cv-chip-sage">CURRENT</span> : null}
                  </div>
                  <div className="cv-career-meta">
                    {[c.league_level, c.country, formatPeriod(c.started_month, c.ended_month, c.is_current)]
                      .filter(Boolean)
                      .join(" · ")}
                  </div>
                  {(c.appearances != null || c.goals != null || c.assists != null) ? (
                    <div className="cv-career-stats">
                      {[
                        c.appearances != null ? `${c.appearances} apps` : null,
                        c.goals != null ? `${c.goals}g` : null,
                        c.assists != null ? `${c.assists}a` : null,
                        c.clean_sheets != null ? `${c.clean_sheets} cs` : null,
                      ].filter(Boolean).join(" · ")}
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          ) : null}

          {/* Media */}
          {media.length > 0 ? (
            <div className="cv-card">
              <div className="cv-card-header">
                <span className="cv-overline">Video & Media</span>
                <span className="cv-chip">{media.length} LINKED</span>
              </div>
              {media.map((m, i) => (
                <div key={m.id} className="cv-row">
                  <span className="cv-row-label">{m.media_type.replace("_", " ")}</span>
                  <a
                    href={m.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="cv-row-value cv-row-accent"
                    style={{ textDecoration: "underline" }}
                  >
                    {m.platform ?? "link"}
                  </a>
                </div>
              ))}
            </div>
          ) : null}

          {/* Awards & Character */}
          {awards_character.total_count > 0 ? (
            <div className="cv-card">
              <div className="cv-card-header">
                <span className="cv-overline">Awards & Character</span>
                <span className="cv-chip">{awards_character.total_count} ENTRIES</span>
              </div>
              {awards_character.awards.length > 0 ? <TraitBlock label="Awards & honours" items={awards_character.awards} /> : null}
              {awards_character.leadership.length > 0 ? <TraitBlock label="Leadership" items={awards_character.leadership} /> : null}
              {awards_character.languages.length > 0 ? <TraitBlock label="Languages" items={awards_character.languages} /> : null}
              {awards_character.character.length > 0 ? <TraitBlock label="Character traits" items={awards_character.character} /> : null}
            </div>
          ) : null}

          {/* References */}
          {references.length > 0 ? (
            <div className="cv-card">
              <div className="cv-card-header">
                <span className="cv-overline">References</span>
                <span className="cv-chip cv-chip-sage">VERIFIED</span>
              </div>
              {references.map((r) => (
                <div key={r.id} className="cv-career">
                  <div className="cv-career-head">
                    <span className="cv-career-club">{r.referee_name}</span>
                    <span className="cv-chip cv-chip-sage">TOMO VERIFIED</span>
                  </div>
                  <div className="cv-career-meta">
                    {[r.referee_role, r.club_institution].filter(Boolean).join(" · ")}
                  </div>
                  {r.submitted_note ? (
                    <p style={{ fontStyle: "italic", fontSize: 12, marginTop: 6, color: "var(--cv-cream-body)", lineHeight: 1.5 }}>
                      "{r.submitted_note}"
                    </p>
                  ) : null}
                </div>
              ))}
            </div>
          ) : null}

          {/* Health (only if consent) */}
          {health_status ? (
            <div className="cv-card">
              <div className="cv-card-header">
                <span className="cv-overline">Health Status</span>
                <span className={`cv-chip ${health_status.overall === "fully_fit" ? "cv-chip-sage" : ""}`}>
                  {health_status.status_label.toUpperCase()}
                </span>
              </div>
              <Row label="Match ready" value={health_status.availability.match_ready ? "Yes" : "No"} accent={health_status.availability.match_ready} />
              <Row label="Training load" value={capitalize(health_status.availability.training_load)} />
              <Row label="Restrictions" value={health_status.availability.restrictions.length > 0 ? health_status.availability.restrictions.join(", ") : "None"} />
              <Row label="Last screening" value={formatDate(health_status.availability.last_screening_date)} />
            </div>
          ) : null}

          <div className="cv-footer">
            · TOMO PASSPORT · {share.public_url.replace(/^https?:\/\//, "")} ·
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Helpers ───

function Row({ label, value, accent }: { label: string; value: string | null | undefined; accent?: boolean }) {
  return (
    <div className="cv-row">
      <span className="cv-row-label">{label}</span>
      <span className={`cv-row-value ${accent ? "cv-row-accent" : ""}`}>{value || "—"}</span>
    </div>
  );
}

function KPI({ value, label, hint }: { value: string; label: string; hint: string }) {
  return (
    <div className="cv-kpi">
      <div className="cv-kpi-value">{value}</div>
      <div className="cv-kpi-label">{label}</div>
      <div className="cv-kpi-hint">{hint}</div>
    </div>
  );
}

function SignalRow({
  label,
  detail,
  tag,
  tone,
}: {
  label: string;
  detail: string;
  tag?: string;
  tone?: "elite" | "focus";
}) {
  return (
    <div className="cv-row">
      <div>
        <div className="cv-row-value" style={{ fontSize: 13 }}>{label}</div>
        <div className="cv-row-label" style={{ marginTop: 2 }}>{detail}</div>
      </div>
      {tag ? (
        <span className={`cv-bench-rank ${tone === "elite" ? "cv-zone-elite" : ""}`}>{tag}</span>
      ) : null}
    </div>
  );
}

function TraitBlock({ label, items }: { label: string; items: Array<{ id: string; title: string }> }) {
  return (
    <div style={{ paddingTop: 10 }}>
      <div className="cv-overline" style={{ marginBottom: 6 }}>{label}</div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
        {items.map((t) => (
          <span key={t.id} className="cv-chip">{t.title}</span>
        ))}
      </div>
    </div>
  );
}

function capitalize(s: string | null | undefined): string {
  if (!s) return "";
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function formatDate(iso: string | null | undefined): string | null {
  if (!iso) return null;
  try {
    const d = new Date(iso);
    const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
    return `${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}`;
  } catch {
    return iso;
  }
}

function formatPhv(stage: string | null | undefined, offset: number | null | undefined): string | null {
  if (!stage) return null;
  const label = stage === "POST" ? "Post-PHV" : stage === "PRE" ? "Pre-PHV" : "Circa-PHV";
  if (offset == null) return label;
  const sign = offset > 0 ? "+" : "";
  return `${label} (${sign}${offset.toFixed(1)}y)`;
}

function formatPeriod(start: string | null, end: string | null, isCurrent: boolean): string {
  if (!start) return isCurrent ? "present" : "";
  return `${start}—${isCurrent ? "present" : end ?? ""}`;
}
