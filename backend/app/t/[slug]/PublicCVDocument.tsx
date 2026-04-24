import type { PublicCVBundle } from "@/services/cv/cvPublicView";
import type { CVAcademicProfile } from "@/services/cv/cvAssembler";

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
    academic,
    completeness_pct,
    share,
    last_updated,
    next_steps,
  } = bundle;

  const topStrengths = player_profile.key_signals.strengths.slice(0, 3);
  const topFocus = player_profile.key_signals.focus_areas.slice(0, 3);
  const benchmarkRows = verified_performance.benchmarks.slice(0, 12);
  const benchmarkLeft = benchmarkRows.filter((_, i) => i % 2 === 0);
  const benchmarkRight = benchmarkRows.filter((_, i) => i % 2 === 1);

  const clubCareer = career.filter((c) => c.entry_type !== "national_team").slice(0, 5);
  const nationalTeam = career.filter((c) => c.entry_type === "national_team");

  const currentYear = new Date().getFullYear();
  const reportId = buildReportId(identity.full_name, identity.date_of_birth, identity.nationality);

  return (
    <div className={printMode ? "cv-print-mode" : ""}>
      <div className="cv2-root">
        <div className="cv2-stack">

          {/* ── PAGE 1 ─────────────────────────────────────────────── */}
          <section className="cv2-page">
            <header className="cv2-header">
              <div className="cv2-brand">● tomo</div>
              <div className="cv2-meta">
                <span>REPORT · {formatIsoDate(last_updated) ?? "—"}</span>
                <span>ID · {reportId}</span>
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
                  <Stat label="FT" value={identity.preferred_foot ? identity.preferred_foot.charAt(0).toUpperCase() : "—"} />
                  <Stat label="MAT" value={formatMaturity(identity.phv_offset_years)} />
                </div>
              </div>

              <div className="cv2-score-card">
                <div className="cv2-score-row">
                  <div className="cv2-score-ring">{Math.max(0, Math.min(100, completeness_pct))}%</div>
                  <div>
                    <div className="cv2-score-label">PROFILE SCORE</div>
                    <div className="cv2-score-sub">{completeness_pct}% complete</div>
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
              <article className="cv2-panel cv2-ai-panel">
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
                <div>{`updated ${formatMonthYear(last_updated) ?? "—"}`}</div>
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

          {/* ── PAGE 2 ─────────────────────────────────────────────── */}
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

              {/* Top: Positions (left) + Career (right, spans 2 rows) */}
              <div className="cv2-page2-top">
                <div className="cv2-page2-left-col">

                  <article className="cv2-panel">
                    <h3>PLAYING POSITIONS</h3>
                    <div className="cv2-pos-block">
                      <div className="cv2-label">PRIMARY</div>
                      <div className="cv2-pos-main">{positions.primary_label ?? positions.primary_position ?? "—"}</div>
                      {positions.primary_position && (
                        <div className="cv2-pos-abbr">({positions.primary_position})</div>
                      )}
                    </div>
                    {positions.has_secondary && (
                      <div className="cv2-pos-block">
                        <div className="cv2-label">SECONDARY</div>
                        <div className="cv2-pos-sub">{positions.secondary_positions.join(" · ")}</div>
                      </div>
                    )}
                  </article>

                  <article className="cv2-panel cv2-awards-panel">
                    <h3>AWARDS &amp; CHARACTER</h3>
                    <div className="cv2-awards">
                      {awards_character.awards.slice(0, 3).map((a) => (
                        <div key={a.id} className="cv2-award-row">
                          <span className="cv2-award-year">{a.date ? new Date(a.date).getFullYear() : currentYear}</span>
                          <span className="cv2-award-title">{a.title}</span>
                          {a.description && (
                            <span className="cv2-award-org">{a.description}</span>
                          )}
                        </div>
                      ))}
                    </div>
                    <div className="cv2-tags-row">
                      {[...awards_character.leadership, ...awards_character.character]
                        .slice(0, 6)
                        .map((t) => (
                          <span key={t.id} className="cv2-tag">{t.title}</span>
                        ))}
                    </div>
                    {awards_character.languages.length > 0 && (
                      <div className="cv2-lang-row">
                        {awards_character.languages.map((l) => (
                          <span key={l.id}>
                            {l.title}{l.level ? ` · ${l.level}` : ""}
                          </span>
                        ))}
                      </div>
                    )}
                  </article>

                </div>

                <article className="cv2-panel cv2-career">
                  <h3>CAREER HISTORY</h3>
                  {clubCareer.length === 0 ? (
                    <div className="cv2-empty">No career entries yet</div>
                  ) : (
                    clubCareer.map((c) => (
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

                  {nationalTeam.length > 0 && (
                    <div className="cv2-national-block">
                      <div className="cv2-national-label">NATIONAL TEAM</div>
                      <div className="cv2-national-grid">
                        {nationalTeam.slice(0, 3).map((c) => (
                          <div key={c.id} className="cv2-national-row">
                            <span>{c.started_month ? c.started_month.slice(0, 4) : "—"}</span>
                            <span>{c.club_name}</span>
                            {c.appearances != null && <span>{c.appearances} caps</span>}
                            {c.goals != null && <span>{c.goals} goals</span>}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </article>
              </div>

              {/* Academic Profile — conditional, full-width */}
              {academic && (
                <article className="cv2-panel cv2-academic">
                  <div className="cv2-academic-header">
                    <h3>STUDY · ACADEMIC PROFILE</h3>
                    {(academic.dual_load_note || academic.exam_session_label) && (
                      <div className="cv2-academic-sub">
                        {[academic.dual_load_note, academic.exam_session_label ? `EXAM SESSION ${academic.exam_session_label}` : null]
                          .filter(Boolean)
                          .join(" · ")
                          .toUpperCase()}
                      </div>
                    )}
                  </div>
                  <div className="cv2-academic-body">
                    <div className="cv2-academic-school">
                      {academic.school_name && <div className="cv2-academic-school-name">{academic.school_name}</div>}
                      {academic.diploma_program && <div className="cv2-academic-diploma">{academic.diploma_program}</div>}
                      <div className="cv2-academic-stats">
                        {academic.grade_year && (
                          <div className="cv2-academic-stat">
                            <span className="cv2-label">GRADE</span>
                            <span>{academic.grade_year}{academic.program_label ? ` · ${academic.program_label}` : ""}</span>
                          </div>
                        )}
                        {academic.gpa_current != null && (
                          <div className="cv2-academic-stat">
                            <span className="cv2-label">GPA</span>
                            <span>{academic.gpa_current} / {academic.gpa_max}</span>
                          </div>
                        )}
                        {academic.class_rank_pct != null && (
                          <div className="cv2-academic-stat">
                            <span className="cv2-label">RANK</span>
                            <span>Top {academic.class_rank_pct}%</span>
                          </div>
                        )}
                        {academic.attendance_pct != null && (
                          <div className="cv2-academic-stat">
                            <span className="cv2-label">ATT.</span>
                            <span>{academic.attendance_pct}%</span>
                          </div>
                        )}
                      </div>
                    </div>
                    {academic.subjects.length > 0 && (
                      <div className="cv2-academic-subjects">
                        <div className="cv2-subject-header">
                          <span>SUBJECT</span>
                          <span>LVL</span>
                          <span>GRADE</span>
                          <span>TRND</span>
                        </div>
                        {academic.subjects.map((s, i) => (
                          <div key={i} className="cv2-subject-row">
                            <span>{s.name}</span>
                            <span>{s.level ?? "—"}</span>
                            <span>{s.grade != null ? `${s.grade}/${s.grade_max}` : "—"}</span>
                            <span className="cv2-trend">{trendArrow(s.trend)}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </article>
              )}

              {/* Bottom: Media + Refs (left) | Health + Next Steps (right) */}
              <div className="cv2-page2-bottom">
                <div className="cv2-page2-bottom-left">

                  <article className="cv2-panel">
                    <h3>VIDEO &amp; MEDIA</h3>
                    {media.length === 0 ? (
                      <div className="cv2-empty">No linked media</div>
                    ) : (
                      media.slice(0, 4).map((m) => (
                        <div key={m.id} className="cv2-media-row">
                          <span>▶ {m.title ?? m.media_type.replace(/_/g, " ")}</span>
                          <a href={m.url} target="_blank" rel="noopener noreferrer">
                            {m.platform ?? "open"}
                          </a>
                        </div>
                      ))
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

                </div>

                <div className="cv2-page2-bottom-right">

                  <article className="cv2-panel cv2-health-panel">
                    <h3>HEALTH · LOAD · CONSENT</h3>
                    {health_status ? (
                      <>
                        <div className="cv2-health-status-row">
                          <span className="cv2-health-title">{health_status.status_label.toUpperCase()}</span>
                          {verified_performance.acwr != null && (
                            <span className="cv2-health-acwr">
                              ACWR {verified_performance.acwr.toFixed(2)} {verified_performance.training_balance ?? ""}
                            </span>
                          )}
                        </div>
                        <div className="cv2-health-sub">
                          {[
                            health_status.availability.match_ready ? "Match-ready" : "Not match-ready",
                            `${health_status.availability.training_load} training load`,
                            health_status.availability.restrictions.length === 0 ? "no restrictions" : health_status.availability.restrictions.join(", "),
                            `last screening ${health_status.availability.last_screening_date ? formatIsoDate(health_status.availability.last_screening_date) : "—"}`,
                          ].join(" · ")}
                        </div>
                        <div className="cv2-health-consent">
                          This report is shared by the athlete under Tomo&apos;s consent framework. All performance values are sourced from on-platform sensors and verified sessions. Injury and medical details beyond readiness are held privately by default.
                        </div>
                      </>
                    ) : (
                      <div className="cv2-health-sub">Health details hidden by athlete consent.</div>
                    )}
                  </article>

                  <article className="cv2-panel cv2-next">
                    <h3>NEXT STEPS · CV SCORE GAIN</h3>
                    {next_steps.length === 0 ? (
                      <div className="cv2-empty">No recommended actions</div>
                    ) : (
                      next_steps.slice(0, 5).map((s) => (
                        <div key={s.key} className="cv2-next-row">
                          <span className="cv2-next-impact">+{s.impact_pct}</span>
                          <span className="cv2-next-title">{s.title}</span>
                          <span className="cv2-next-hint">{s.hint}</span>
                        </div>
                      ))
                    )}
                  </article>

                </div>
              </div>
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

// ── Sub-components ────────────────────────────────────────────────────────

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
  label, value, pct, zone,
}: {
  label: string; value: string; pct: number; zone: "good" | "warn";
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

// ── Helpers ───────────────────────────────────────────────────────────────

function zoneClass(zone: string): string {
  if (zone === "elite") return "elite";
  if (zone === "on_par") return "mid";
  return "low";
}

function trendArrow(trend: CVAcademicProfile["subjects"][number]["trend"]): string {
  if (trend === "up") return "↑";
  if (trend === "down") return "↓";
  return "→";
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
    return new Date(iso).toLocaleDateString("en-US", { month: "short", year: "numeric" }).toUpperCase();
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

function buildReportId(
  fullName: string | null | undefined,
  dob: string | null | undefined,
  nationality: string | null | undefined
): string {
  const base = surname(fullName).slice(0, 3);
  const nat = (nationality ?? "na").slice(0, 3).toUpperCase();
  const year = dob ? new Date(dob).getFullYear() : new Date().getFullYear();
  return `${base}-${year}-${nat}`;
}

function formatPeriod(start: string | null, end: string | null, isCurrent: boolean): string {
  if (!start) return isCurrent ? "PRESENT" : "—";
  return `${start} — ${isCurrent ? "PRESENT" : end ?? "—"}`;
}

function ordinal(n: number): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return `${n}st`;
  if (mod10 === 2 && mod100 !== 12) return `${n}nd`;
  if (mod10 === 3 && mod100 !== 13) return `${n}rd`;
  return `${n}th`;
}
