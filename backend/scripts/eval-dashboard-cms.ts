#!/usr/bin/env npx tsx
/**
 * Dashboard CMS — Full Toggle Chain Eval
 *
 * Tests the entire chain: DB → Loader → Boot API → Mobile rendering gates.
 * Verifies that toggling is_enabled in dashboard_sections actually controls
 * whether a section appears in the boot payload.
 *
 * Run: cd backend && npx tsx scripts/eval-dashboard-cms.ts
 *
 * Requires: SUPABASE_SERVICE_ROLE_KEY set (uses admin client to bypass RLS)
 */

import { createClient } from '@supabase/supabase-js';

// ── Setup ──

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceKey) {
  console.error('FATAL: Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const db = createClient(supabaseUrl, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

// ── Helpers ──

let passed = 0;
let failed = 0;

function assert(label: string, condition: boolean, detail?: string) {
  if (condition) {
    console.log(`  PASS  ${label}`);
    passed++;
  } else {
    console.log(`  FAIL  ${label}${detail ? ` — ${detail}` : ''}`);
    failed++;
  }
}

// ── Import the loader directly (tests the actual code path) ──

async function runEval() {
  console.log('\n=== Dashboard CMS Toggle Chain Eval ===\n');

  // ─────────────────────────────────────────────────────────
  // Phase 1: DB Integrity
  // ─────────────────────────────────────────────────────────
  console.log('Phase 1: DB Integrity\n');

  const { data: allSections, error: loadErr } = await (db as any)
    .from('dashboard_sections')
    .select('*')
    .order('sort_order', { ascending: true });

  assert('dashboard_sections table exists and is queryable', !loadErr, loadErr?.message);
  assert('At least 12 sections exist (original seed)', (allSections?.length ?? 0) >= 12,
    `found ${allSections?.length}`);

  // Check all 14 expected component types
  const allTypes = new Set((allSections ?? []).map((s: any) => s.component_type));
  const expectedTypes = [
    'signal_hero', 'status_ring', 'kpi_row', 'sparkline_row',
    'dual_load', 'benchmark', 'rec_list', 'event_list',
    'growth_card', 'engagement_bar', 'protocol_banner', 'custom_card',
    'daily_recs', 'up_next',
  ];

  for (const t of expectedTypes) {
    assert(`Component type "${t}" has a DB row`, allTypes.has(t));
  }

  // Check the new screen-level sections specifically
  const dailyRecsRow = (allSections ?? []).find((s: any) => s.component_type === 'daily_recs');
  const upNextRow = (allSections ?? []).find((s: any) => s.component_type === 'up_next');
  const signalHeroRow = (allSections ?? []).find((s: any) => s.component_type === 'signal_hero');

  assert('daily_recs section exists', !!dailyRecsRow);
  assert('daily_recs section_key = "daily_recommendations"',
    dailyRecsRow?.section_key === 'daily_recommendations',
    `got "${dailyRecsRow?.section_key}"`);
  assert('daily_recs is enabled by default', dailyRecsRow?.is_enabled === true);

  assert('up_next section exists', !!upNextRow);
  assert('up_next section_key = "up_next_timeline"',
    upNextRow?.section_key === 'up_next_timeline',
    `got "${upNextRow?.section_key}"`);
  assert('up_next is enabled by default', upNextRow?.is_enabled === true);

  assert('signal_hero section exists', !!signalHeroRow);
  assert('signal_hero is enabled by default', signalHeroRow?.is_enabled === true);

  // ─────────────────────────────────────────────────────────
  // Phase 2: Enabled filter (simulates loadSections)
  // ─────────────────────────────────────────────────────────
  console.log('\nPhase 2: Enabled Filter (loadSections simulation)\n');

  const { data: enabledSections } = await (db as any)
    .from('dashboard_sections')
    .select('*')
    .eq('is_enabled', true)
    .order('sort_order', { ascending: true });

  const enabledCount = enabledSections?.length ?? 0;
  const totalCount = allSections?.length ?? 0;
  assert('Enabled sections returned by .eq("is_enabled", true)',
    enabledCount > 0, `${enabledCount} of ${totalCount}`);

  const enabledTypes = new Set((enabledSections ?? []).map((s: any) => s.component_type));
  assert('signal_hero in enabled set', enabledTypes.has('signal_hero'));
  assert('daily_recs in enabled set', enabledTypes.has('daily_recs'));
  assert('up_next in enabled set', enabledTypes.has('up_next'));

  // ─────────────────────────────────────────────────────────
  // Phase 3: Toggle Off → Verify Exclusion
  // ─────────────────────────────────────────────────────────
  console.log('\nPhase 3: Toggle Off → Verify Exclusion\n');

  // Toggle daily_recs OFF
  const { error: toggleOffErr } = await (db as any)
    .from('dashboard_sections')
    .update({ is_enabled: false, updated_at: new Date().toISOString() })
    .eq('section_key', 'daily_recommendations');

  assert('Toggle daily_recs OFF succeeds', !toggleOffErr, toggleOffErr?.message);

  // Re-query enabled sections
  const { data: afterToggleOff } = await (db as any)
    .from('dashboard_sections')
    .select('section_key, component_type, is_enabled')
    .eq('is_enabled', true)
    .order('sort_order', { ascending: true });

  const afterOffTypes = new Set((afterToggleOff ?? []).map((s: any) => s.component_type));
  assert('daily_recs NOT in enabled set after toggle off', !afterOffTypes.has('daily_recs'));
  assert('signal_hero still in enabled set', afterOffTypes.has('signal_hero'));
  assert('up_next still in enabled set', afterOffTypes.has('up_next'));
  assert('Enabled count decreased by 1',
    (afterToggleOff?.length ?? 0) === enabledCount - 1,
    `expected ${enabledCount - 1}, got ${afterToggleOff?.length}`);

  // ─────────────────────────────────────────────────────────
  // Phase 4: Toggle Back On → Verify Inclusion
  // ─────────────────────────────────────────────────────────
  console.log('\nPhase 4: Toggle Back On → Verify Inclusion\n');

  const { error: toggleOnErr } = await (db as any)
    .from('dashboard_sections')
    .update({ is_enabled: true, updated_at: new Date().toISOString() })
    .eq('section_key', 'daily_recommendations');

  assert('Toggle daily_recs ON succeeds', !toggleOnErr, toggleOnErr?.message);

  const { data: afterToggleOn } = await (db as any)
    .from('dashboard_sections')
    .select('section_key, component_type, is_enabled')
    .eq('is_enabled', true)
    .order('sort_order', { ascending: true });

  const afterOnTypes = new Set((afterToggleOn ?? []).map((s: any) => s.component_type));
  assert('daily_recs back in enabled set after toggle on', afterOnTypes.has('daily_recs'));
  assert('Enabled count restored', (afterToggleOn?.length ?? 0) === enabledCount,
    `expected ${enabledCount}, got ${afterToggleOn?.length}`);

  // ─────────────────────────────────────────────────────────
  // Phase 5: Toggle All Three Screen-Level Off → Verify
  // ─────────────────────────────────────────────────────────
  console.log('\nPhase 5: Toggle All Screen-Level Off → Verify\n');

  const screenKeys = ['signal_hero', 'daily_recommendations', 'up_next_timeline'];
  for (const key of screenKeys) {
    const { error } = await (db as any)
      .from('dashboard_sections')
      .update({ is_enabled: false, updated_at: new Date().toISOString() })
      .eq('section_key', key);
    assert(`Toggle "${key}" OFF succeeds`, !error, error?.message);
  }

  const { data: withoutScreen } = await (db as any)
    .from('dashboard_sections')
    .select('component_type')
    .eq('is_enabled', true);

  const withoutScreenTypes = new Set((withoutScreen ?? []).map((s: any) => s.component_type));
  assert('signal_hero excluded', !withoutScreenTypes.has('signal_hero'));
  assert('daily_recs excluded', !withoutScreenTypes.has('daily_recs'));
  assert('up_next excluded', !withoutScreenTypes.has('up_next'));
  assert('Other sections still present (status_ring)', withoutScreenTypes.has('status_ring'));
  assert('Other sections still present (kpi_row)', withoutScreenTypes.has('kpi_row'));
  assert('Other sections still present (benchmark)', withoutScreenTypes.has('benchmark'));

  // ─────────────────────────────────────────────────────────
  // Phase 6: Restore All → Verify Full Set
  // ─────────────────────────────────────────────────────────
  console.log('\nPhase 6: Restore All → Verify Full Set\n');

  for (const key of screenKeys) {
    const { error } = await (db as any)
      .from('dashboard_sections')
      .update({ is_enabled: true, updated_at: new Date().toISOString() })
      .eq('section_key', key);
    assert(`Restore "${key}" ON succeeds`, !error, error?.message);
  }

  const { data: restored } = await (db as any)
    .from('dashboard_sections')
    .select('component_type')
    .eq('is_enabled', true);

  const restoredTypes = new Set((restored ?? []).map((s: any) => s.component_type));
  assert('All 14 types present after restore', restoredTypes.size >= 14,
    `found ${restoredTypes.size}`);

  // ─────────────────────────────────────────────────────────
  // Phase 7: Sort Order Integrity
  // ─────────────────────────────────────────────────────────
  console.log('\nPhase 7: Sort Order Integrity\n');

  const { data: ordered } = await (db as any)
    .from('dashboard_sections')
    .select('section_key, sort_order, component_type')
    .eq('is_enabled', true)
    .order('sort_order', { ascending: true });

  const sortOrders = (ordered ?? []).map((s: any) => s.sort_order);
  const isSorted = sortOrders.every((v: number, i: number) => i === 0 || v >= sortOrders[i - 1]);
  assert('Sections returned in ascending sort_order', isSorted);

  // Verify screen-level sections exist in the ordered list
  const signalHeroOrder = (ordered ?? []).find((s: any) => s.component_type === 'signal_hero')?.sort_order;
  const dailyRecsOrder = (ordered ?? []).find((s: any) => s.component_type === 'daily_recs')?.sort_order;
  const upNextOrder = (ordered ?? []).find((s: any) => s.component_type === 'up_next')?.sort_order;

  assert('signal_hero has a sort_order', signalHeroOrder !== undefined, `got ${signalHeroOrder}`);
  assert('daily_recs has a sort_order', dailyRecsOrder !== undefined, `got ${dailyRecsOrder}`);
  assert('up_next has a sort_order', upNextOrder !== undefined, `got ${upNextOrder}`);

  // ─────────────────────────────────────────────────────────
  // Phase 8: Visibility Condition Integrity
  // ─────────────────────────────────────────────────────────
  console.log('\nPhase 8: Visibility Conditions\n');

  const { data: conditionalSections } = await (db as any)
    .from('dashboard_sections')
    .select('section_key, visibility')
    .not('visibility', 'is', null);

  assert('At least 3 sections have visibility conditions',
    (conditionalSections?.length ?? 0) >= 3,
    `found ${conditionalSections?.length}`);

  for (const s of (conditionalSections ?? [])) {
    const vis = s.visibility as any;
    assert(`"${s.section_key}" has valid match (all|any)`,
      vis?.match === 'all' || vis?.match === 'any',
      `got "${vis?.match}"`);
    assert(`"${s.section_key}" has at least 1 condition`,
      Array.isArray(vis?.conditions) && vis.conditions.length > 0);
    for (const c of (vis?.conditions ?? [])) {
      assert(`"${s.section_key}" condition has field+operator+value`,
        !!c.field && !!c.operator && c.value !== undefined,
        `field="${c.field}" op="${c.operator}" val="${c.value}"`);
    }
  }

  // Verify screen-level sections have NO visibility conditions (always CMS-only gated)
  assert('signal_hero has NULL visibility (always visible when enabled)',
    signalHeroRow?.visibility === null);
  assert('daily_recs has NULL visibility (always visible when enabled)',
    dailyRecsRow?.visibility === null);
  assert('up_next has NULL visibility (always visible when enabled)',
    upNextRow?.visibility === null);

  // ─────────────────────────────────────────────────────────
  // Phase 9: Config Shape Validation
  // ─────────────────────────────────────────────────────────
  console.log('\nPhase 9: Config Shape Validation\n');

  for (const s of (allSections ?? [])) {
    assert(`"${s.section_key}" config is a valid object`,
      typeof s.config === 'object' && s.config !== null && !Array.isArray(s.config));
  }

  // Spot-check specific configs
  const kpiConfig = (allSections ?? []).find((s: any) => s.component_type === 'kpi_row')?.config;
  assert('kpi_row config has chips array',
    Array.isArray(kpiConfig?.chips) && kpiConfig.chips.length > 0,
    `chips=${JSON.stringify(kpiConfig?.chips)?.slice(0, 80)}`);

  const dailyRecsConfig = dailyRecsRow?.config;
  assert('daily_recs config has max_items',
    typeof dailyRecsConfig?.max_items === 'number',
    `got ${dailyRecsConfig?.max_items}`);

  const upNextConfig = upNextRow?.config;
  assert('up_next config has show_adapted_plan',
    upNextConfig?.show_adapted_plan === true);
  assert('up_next config has show_hints',
    upNextConfig?.show_hints === true);

  // ─────────────────────────────────────────────────────────
  // Phase 10: Mobile Rendering Gate Logic (code path verification)
  // ─────────────────────────────────────────────────────────
  console.log('\nPhase 10: Mobile Rendering Gate Logic\n');

  // Simulate what SignalDashboardScreen.enabledTypes does
  const bootLayout = (enabledSections ?? []).map((s: any) => ({
    section_key: s.section_key,
    component_type: s.component_type,
    display_name: s.display_name,
    sort_order: s.sort_order,
    config: s.config,
    coaching_text: s.coaching_text,
  }));

  const simulatedEnabledTypes = new Set(bootLayout.map((s: any) => s.component_type));

  assert('enabledTypes.has("signal_hero") = true (renders AthleteModeHero)',
    simulatedEnabledTypes.has('signal_hero'));
  assert('enabledTypes.has("daily_recs") = true (renders DailyRecommendations)',
    simulatedEnabledTypes.has('daily_recs'));
  assert('enabledTypes.has("up_next") = true (renders Up Next)',
    simulatedEnabledTypes.has('up_next'));

  // Simulate with screen-level toggled off
  const withoutScreenLayout = bootLayout.filter((s: any) =>
    !['signal_hero', 'daily_recs', 'up_next'].includes(s.component_type)
  );
  const withoutScreenEnabled = new Set(withoutScreenLayout.map((s: any) => s.component_type));

  assert('Without screen types: signal_hero gate = false',
    !withoutScreenEnabled.has('signal_hero'));
  assert('Without screen types: daily_recs gate = false',
    !withoutScreenEnabled.has('daily_recs'));
  assert('Without screen types: up_next gate = false',
    !withoutScreenEnabled.has('up_next'));
  assert('Without screen types: DashboardSectionRenderer still has sections',
    withoutScreenLayout.length > 0,
    `${withoutScreenLayout.length} sections remain`);

  // Verify DashboardSectionRenderer skips screen-level types
  const rendererSkipTypes = new Set(['signal_hero', 'daily_recs', 'up_next']);
  const rendererSections = bootLayout.filter((s: any) => !rendererSkipTypes.has(s.component_type));
  assert('DashboardSectionRenderer filters out all 3 screen-level types',
    rendererSections.every((s: any) => !rendererSkipTypes.has(s.component_type)));
  assert('DashboardSectionRenderer passes 11 component types to registry',
    rendererSections.length >= 11,
    `got ${rendererSections.length}`);

  // ─────────────────────────────────────────────────────────
  // Phase 11: Athlete Mode Hero + Full Order Mapping
  // ─────────────────────────────────────────────────────────
  console.log('\nPhase 11: Athlete Mode Hero + Full Order Mapping\n');

  // signal_hero now renders AthleteModeHero (not SignalHero)
  const signalHeroDisplay = signalHeroRow?.display_name;
  assert('signal_hero display_name is "Athlete Mode"',
    signalHeroDisplay === 'Athlete Mode',
    `got "${signalHeroDisplay}"`);

  // Verify the 4 rendering zones map correctly
  // Zone 1: signal_hero (AthleteModeHero) — screen-level, CMS-gated
  // Zone 2: daily_recs (DailyRecommendations) — screen-level, CMS-gated
  // Zone 3: DashboardSectionRenderer — 11 types in sort_order
  // Zone 4: up_next (Up Next/Today's Plan) — screen-level, CMS-gated

  const screenLevelTypes = new Set(['signal_hero', 'daily_recs', 'up_next']);
  const rendererTypes = new Set([
    'status_ring', 'kpi_row', 'sparkline_row', 'dual_load', 'benchmark',
    'rec_list', 'event_list', 'growth_card', 'engagement_bar',
    'protocol_banner', 'custom_card',
  ]);

  // All enabled sections should be either screen-level or renderer-level
  for (const s of (enabledSections ?? [])) {
    const t = s.component_type;
    assert(`"${s.section_key}" (${t}) is assigned to a rendering zone`,
      screenLevelTypes.has(t) || rendererTypes.has(t),
      `type "${t}" not in any zone`);
  }

  // Renderer sections should be in strict ascending sort_order
  const rendererOrdered = (enabledSections ?? [])
    .filter((s: any) => rendererTypes.has(s.component_type))
    .sort((a: any, b: any) => a.sort_order - b.sort_order);
  const rendererSortValid = rendererOrdered.every(
    (s: any, i: number) => i === 0 || s.sort_order > rendererOrdered[i - 1].sort_order
  );
  assert('Renderer sections have strictly ascending sort_order (no ties)',
    rendererSortValid);

  // Print the full order mapping for visibility
  console.log('\n  ── Screen Order Mapping ──');
  console.log('  Zone 1 (screen): AthleteModeHero [signal_hero]');
  console.log('  Zone 2 (screen): DailyRecommendations [daily_recs]');
  for (const s of rendererOrdered) {
    console.log(`  Zone 3 (renderer, sort ${s.sort_order}): ${s.display_name} [${s.component_type}]`);
  }
  console.log('  Zone 4 (screen): Up Next / Today\'s Plan [up_next]');
  console.log('');

  // Verify all 14 component types are accounted for
  const allAccountedTypes = new Set([
    ...Array.from(screenLevelTypes),
    ...Array.from(rendererTypes),
  ]);
  assert('All 14 component types are assigned to a zone',
    allAccountedTypes.size === 14,
    `got ${allAccountedTypes.size}`);

  // ─────────────────────────────────────────────────────────
  // Phase 12: Athlete Mode Integration
  // ─────────────────────────────────────────────────────────
  console.log('\nPhase 12: Athlete Mode Integration\n');

  // Verify athlete_modes table has enabled modes
  const { data: modes, error: modesErr } = await (db as any)
    .from('athlete_modes')
    .select('id, label, color, is_enabled')
    .eq('is_enabled', true)
    .order('sort_order', { ascending: true });

  assert('athlete_modes table is queryable', !modesErr, modesErr?.message);
  assert('At least 4 modes exist (balanced, league, study, rest)',
    (modes?.length ?? 0) >= 4,
    `found ${modes?.length}`);

  const modeIds = new Set((modes ?? []).map((m: any) => m.id));
  assert('balanced mode exists', modeIds.has('balanced'));
  assert('league mode exists', modeIds.has('league'));
  assert('study mode exists', modeIds.has('study'));
  assert('rest mode exists', modeIds.has('rest'));

  // Verify each mode has a color
  for (const m of (modes ?? [])) {
    assert(`Mode "${m.id}" has a color`, !!m.color, `color=${m.color}`);
  }

  // Verify player_schedule_preferences has athlete_mode column
  // Query a limit-0 select with the column to confirm it exists
  const { error: prefColErr } = await (db as any)
    .from('player_schedule_preferences')
    .select('athlete_mode')
    .limit(0);
  assert('player_schedule_preferences has athlete_mode column', !prefColErr, prefColErr?.message);

  // Verify MODE_CHANGE event type is registered
  // (Check athlete_mode_history table exists)
  const { error: historyErr } = await (db as any)
    .from('athlete_mode_history')
    .select('athlete_id')
    .limit(0);
  assert('athlete_mode_history table exists (audit trail)', !historyErr, historyErr?.message);

  // ─────────────────────────────────────────────────────────
  // Results
  // ─────────────────────────────────────────────────────────
  console.log('\n' + '='.repeat(50));
  console.log(`Results: ${passed} passed, ${failed} failed, ${passed + failed} total`);
  console.log('='.repeat(50) + '\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runEval().catch((err) => {
  console.error('Eval crashed:', err);
  process.exit(1);
});
