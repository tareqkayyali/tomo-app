import type { PublicCVBundle } from "@/services/cv/cvPublicView";

interface Props {
  bundle: PublicCVBundle;
  printMode: boolean;
}

export function PublicCVDocument({ bundle, printMode }: Props) {
  const {
    identity,
    physical,
    positions,
    player_profile,
    verified_performance,
    career,
    media,
    references,
    awards_character,
    health_status,
    completeness_pct,
    share,
    last_updated,
  } = bundle;

  const topStrengths = player_profile.key_signals.strengths.slice(0, 3);
  const topFocus = player_profile.key_signals.focus_areas.slice(0, 3);
  const benchmarkRows = verified_performance.benchmarks.slice(0, 12);
  const benchmarkLeft = benchmarkRows.filter((_, i) => i % 2 === 0);
  const benchmarkRight = benchmarkRows.filter((_, i) => i % 2 === 1);
  const currentYear = new Date().getFullYear();

  return (
    <div className={printMode ? "cv-print-mode" : ""}>
      <div className="cv2-root">
        <div className="cv2-stack">
          <section className="cv2-page">
            <header className="cv2-header">
              <div className="cv2-brand">● tomo</div>
              <div className="cv2-meta">
                <span>REPORT · {formatIsoDate(last_updated) ?? "—"}</span>
                <span>ID · {buildReportId(identity.full_name, identity.nationality)}</span>
              </div>
              <div className="cv2-verified">✓ VERIFIED BY TOMO</div>
            </header>

            <div className="cv2-hero-grid">
              <div className="cv2-photo-card">
                {identity.photo_url ? (
                  <img src={identity.photo_url} alt={identity.full_name || "Player"} />
                ) : (
                  <div className="cv2-photo-fallback">10</div>
                )}
              </div>

              <div className="cv2-title-card">
                <div className="cv2-kicker">SCOUT REPORT · CONFIDENTIAL</div>
                <h1>{identity.full_name || "Player"}</h1>
                <div className="cv2-id-grid">
                  <Stat label="POS" value={positions.primary_position ?? "—"} />
                  <Stat label="AGE" value={identity.age != null ? String(identity.age) : "—"} />
                  <Stat label="NAT" value={identity.nationality ?? "—"} />
                  <Stat label="GRP" value={identity.age_group ?? "—"} />
                  <Stat label="HT" value={physical.height_cm != null ? `${physical.height_cm}cm` : "—"} />
                  <Stat label="WT" value={physical.weight_kg != null ? `${physical.weight_kg}kg` : "—"} />
                  <Stat
                    label="FT"
                    value={identity.preferred_foot ? identity.preferred_foot.charAt(0).toUpperCase() : "—"}
                  />
                  <Stat label="M*A" value={formatMaturity(identity.phv_offset_years)} />
                </div>
              </div>

              <div className="cv2-score-card">
                <div className="cv2-score-row">
                  <div className="cv2-score-ring">{Math.max(0, Math.min(100, completeness_pct))}%</div>
                  <div>
                    <div className="cv2-score-label">PROFILE SCORE</div>
                    <div className="cv2-score-sub">{completeness_pct}% Complete</div>
                  </div>
                </div>
                <MetricLine label="SESSIONS" value={String(verified_performance.sessions_total)} />
                <MetricLine label="TRAINING AGE" value={verified_performance.training_age_label} />
                <MetricLine label="STREAK" value={`${verified_performance.streak_days} d active`} />
                <MetricLine
                  label="ACWR"
                  value={
                    verified_performance.acwr != null
                      ? `${verified_performance.acwr.toFixed(2)} ${verified_performance.training_balance ?? ""}`.trim()
                      : "—"
                  }
                />
                <MetricLine label="VIEWS" value={String(share.share_views_count)} />
              </div>
            </div>

            <div className="cv2-main-grid">
              <article className="cv2-panel">
                <h3>AI PROFILE · {player_profile.ai_summary_status.toUpperCase()}</h3>
                <p>{player_profile.ai_summary ?? "No approved summary yet."}</p>
              </article>

              <article className="cv2-panel">
                <h3>TOP SIGNALS</h3>
                {topStrengths.length === 0 ? (
                  <div className="cv2-empty">No strength signals yet</div>
                ) : (
                  topStrengths.map((s) => (
                    <SignalMetric
                      key={s.metric_key}
                      label={compactSignalLabel(s.label)}
                      value={extractSignalValue(s.detail)}
                      pct={extractPercentile(s.percentile_label)}
                      zone="good"
                    />
                  ))
                )}
              </article>

              <article className="cv2-panel">
                <h3>FOCUS · DEVELOPMENT PRIORITIES</h3>
                {topFocus.length === 0 ? (
                  <div className="cv2-empty">No focus priorities yet</div>
                ) : (
                  topFocus.map((s) => (
                    <SignalMetric
                      key={s.metric_key}
                      label={compactSignalLabel(s.label)}
                      value={extractSignalValue(s.detail)}
                      pct={extractPercentile(s.percentile_label)}
                      zone="warn"
                    />
                  ))
                )}
              </article>
            </div>

            <section className="cv2-panel cv2-benchmarks">
              <div className="cv2-bench-header">
                <h3>BENCHMARKS · VS {identity.age_group ?? "U19"} {capitalize(identity.sport)} · ALL TESTS</h3>
                <div>{`n = ${benchmarkRows.length} · updated ${formatMonthYear(last_updated) ?? "—"}`}</div>
              </div>
              <div className="cv2-bench-grid">
                <div>
                  {benchmarkLeft.map((b) => (
                    <BenchmarkRow key={b.metric_key} metric={b} />
                  ))}
                </div>
                <div>
                  {benchmarkRight.map((b) => (
                    <BenchmarkRow key={b.metric_key} metric={b} />
                  ))}
                </div>
              </div>
            </section>

            <footer className="cv2-footer">
              <span>{share.public_url.replace(/^https?:\/\//, "")}</span>
              <span>SCOUT REPORT · {surname(identity.full_name)}</span>
              <span>01 / 02</span>
            </footer>
          </section>

          <section className="cv2-page cv2-page-break">
            <header className="cv2-header">
              <div className="cv2-brand">● tomo</div>
              <div className="cv2-meta">
                <span>{surname(identity.full_name).toUpperCase()}</span>
                <span>PAGE 02</span>
                <span>CAREER · MEDIA · REFERENCES · NEXT</span>
              </div>
            </header>

            <div className="cv2-page2-grid">
              <article className="cv2-panel">
                <h3>PLAYING POSITIONS</h3>
                <div className="cv2-pos-block">
                  <div className="cv2-label">PRIMARY</div>
                  <div className="cv2-pos-main">{positions.primary_label ?? positions.primary_position ?? "—"}</div>
                  <div className="cv2-pos-sub">{positions.primary_position ?? "—"}</div>
                </div>
                <div className="cv2-pos-block">
                  <div className="cv2-label">SECONDARY</div>
                  <div className="cv2-pos-sub">{positions.secondary_positions.join(" · ") || "—"}</div>
                </div>
              </article>

              <article className="cv2-panel cv2-career">
                <h3>CAREER HISTORY</h3>
                {career.length === 0 ? (
                  <div className="cv2-empty">No career entries yet</div>
                ) : (
                  career.slice(0, 5).map((c) => (
                    <div key={c.id} className="cv2-career-row">
                      <div className="cv2-dot" />
                      <div>
                        <div className="cv2-career-period">{formatPeriod(c.started_month, c.ended_month, c.is_current)}</div>
                        <div className="cv2-career-club">{c.club_name}</div>
                        <div className="cv2-career-meta">
                          {[c.position, c.league_level, c.country].filter(Boolean).join(" · ")}
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </article>

              <article className="cv2-panel">
                <h3>AWARDS & CHARACTER</h3>
                <div className="cv2-awards">
                  {awards_character.awards.slice(0, 3).map((a) => (
                    <div key={a.id} className="cv2-award-row">
                      <span>{a.date ? new Date(a.date).getFullYear() : currentYear}</span>
                      <span>{a.title}</span>
                    </div>
                  ))}
                  {[...awards_character.leadership, ...awards_character.character]
                    .slice(0, 6)
                    .map((t) => (
                      <span key={t.id} className="cv2-tag">
                        {t.title}
                      </span>
                    ))}
                  {awards_character.languages.length > 0 && (
                    <div className="cv2-lang-row">
                      {awards_character.languages.map((l) => (
                        <span key={l.id}>{l.title}</span>
                      ))}
                    </div>
                  )}
                </div>
              </article>

              <article className="cv2-panel">
                <h3>VIDEO & MEDIA</h3>
                {media.length === 0 ? (
                  <div className="cv2-empty">No linked media</div>
                ) : (
                  media.slice(0, 4).map((m) => (
                    <div key={m.id} className="cv2-media-row">
                      <span>▶ {m.title ?? m.media_type.replace("_", " ")}</span>
                      <a href={m.url} target="_blank" rel="noopener noreferrer">
                        {m.platform ?? "open"}
                      </a>
                    </div>
                  ))
                )}
              </article>

              <article className="cv2-panel">
                <h3>HEALTH · LOAD · CONSENT</h3>
                {health_status ? (
                  <>
                    <div className="cv2-health-title">{health_status.status_label.toUpperCase()}</div>
                    <div className="cv2-health-sub">
                      Match-ready {health_status.availability.match_ready ? "yes" : "no"} · training load{" "}
                      {health_status.availability.training_load}
                    </div>
                    <div className="cv2-health-sub">
                      ACWR {verified_performance.acwr != null ? verified_performance.acwr.toFixed(2) : "—"}{" "}
                      {verified_performance.training_balance ?? ""}
                    </div>
                  </>
                ) : (
                  <div className="cv2-health-sub">Health details hidden by athlete consent.</div>
                )}
              </article>

              <article className="cv2-panel">
                <h3>REFERENCES</h3>
                {references.length === 0 ? (
                  <div className="cv2-empty">No published references yet</div>
                ) : (
                  references.slice(0, 4).map((r) => (
                    <div key={r.id} className="cv2-ref-row">
                      <div>
                        <div className="cv2-ref-name">{r.referee_name}</div>
                        <div className="cv2-ref-meta">
                          {[r.referee_role, r.club_institution].filter(Boolean).join(" · ")}
                        </div>
                      </div>
                      <span className="cv2-ref-status">{r.status.toUpperCase()}</span>
                    </div>
                  ))
                )}
              </article>

              <article className="cv2-panel cv2-next">
                <h3>NEXT STEPS · CV SCORE GAIN</h3>
                {bundle.next_steps.length === 0 ? (
                  <div className="cv2-empty">No recommended actions</div>
                ) : (
                  bundle.next_steps.slice(0, 5).map((s) => (
                    <div key={s.key} className="cv2-next-row">
                      <span>+{s.impact_pct}</span>
                      <span>{s.title}</span>
                      <span>{s.estimated_minutes} min</span>
                    </div>
                  ))
                )}
              </article>
            </div>

            <footer className="cv2-footer">
              <span>{share.public_url.replace(/^https?:\/\//, "")}</span>
              <span>SCOUT REPORT · {surname(identity.full_name)}</span>
              <span>02 / 02</span>
            </footer>
          </section>
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="cv2-stat">
      <div>{label}</div>
      <div>{value}</div>
    </div>
  );
}

function MetricLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="cv2-metric-line">
      <span>{label}</span>
      <span>{value}</span>
    </div>
  );
}

function SignalMetric({
  label,
  value,
  pct,
  zone,
}: {
  label: string;
  value: string;
  pct: number;
  zone: "good" | "warn";
}) {
  return (
    <div className="cv2-signal-row">
      <div className="cv2-signal-l">
        <div>{label}</div>
        <div>{value}</div>
      </div>
      <div className="cv2-signal-r">
        <div className="cv2-signal-track">
          <div className={`cv2-signal-fill ${zone}`} style={{ width: `${Math.max(4, Math.min(100, pct))}%` }} />
        </div>
        <span>{pct}</span>
      </div>
    </div>
  );
}

function BenchmarkRow({ metric }: { metric: PublicCVBundle["verified_performance"]["benchmarks"][number] }) {
  const p = Math.max(1, Math.min(99, Math.round(metric.percentile)));
  return (
    <div className="cv2-bench-row">
      <div>{metric.metric_label}</div>
      <div>{metric.value} {metric.unit}</div>
      <div className="cv2-bench-track">
        <div className={`cv2-bench-fill ${zoneClass(metric.zone)}`} style={{ width: `${p}%` }} />
      </div>
      <div>{ordinal(p)}</div>
    </div>
  );
}

function zoneClass(zone: string): string {
  if (zone === "elite") return "elite";
  if (zone === "on_par") return "mid";
  return "low";
}

function extractPercentile(label: string): number {
  const m = label.match(/(\d{1,3})/);
  if (!m) return 50;
  const n = Number(m[1]);
  return Number.isFinite(n) ? Math.max(1, Math.min(99, n)) : 50;
}

function extractSignalValue(detail: string): string {
  const chunks = detail.split("·").map((s) => s.trim()).filter(Boolean);
  return chunks.length > 1 ? chunks[chunks.length - 1] : detail;
}

function compactSignalLabel(label: string): string {
  return label.replace(/\s+/g, " ").trim();
}

function capitalize(s: string | null | undefined): string {
  if (!s) return "—";
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function formatIsoDate(iso: string | null | undefined): string | null {
  if (!iso) return null;
  try {
    return new Date(iso).toISOString().slice(0, 10);
  } catch {
    return null;
  }
}

function formatMonthYear(iso: string | null | undefined): string | null {
  if (!iso) return null;
  try {
    return new Date(iso).toLocaleDateString("en-US", { month: "short", year: "numeric" });
  } catch {
    return null;
  }
}

function formatMaturity(offset: number | null | undefined): string {
  if (offset == null || !Number.isFinite(offset)) return "—";
  const sign = offset > 0 ? "+" : "";
  return `${sign}${offset.toFixed(1)}y`;
}

function surname(fullName: string | null | undefined): string {
  if (!fullName) return "player";
  const parts = fullName.trim().split(/\s+/);
  return parts[parts.length - 1].toUpperCase();
}

function buildReportId(fullName: string | null | undefined, nationality: string | null | undefined): string {
  const base = surname(fullName).slice(0, 3);
  const nat = (nationality ?? "na").slice(0, 3).toUpperCase();
  const day = new Date().toISOString().slice(2, 10).replace(/-/g, "");
  return `${base}-${day}-${nat}`;
}

function formatPeriod(start: string | null, end: string | null, isCurrent: boolean): string {
  if (!start) return isCurrent ? "PRESENT" : "—";
  return `${start} — ${isCurrent ? "PRESENT" : end ?? "—"}`;
}

function ordinal(n: number): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return `${n}th`.replace("1th", "1st");
  if (mod10 === 2 && mod100 !== 12) return `${n}th`.replace("2th", "2nd");
  if (mod10 === 3 && mod100 !== 13) return `${n}th`.replace("3th", "3rd");
  return `${n}th`;
}
