/**
 * Tests for LeaderboardScreen logic
 *
 * Validates the pure helpers that power the leaderboard:
 *   TAB_CONFIG, getRankDisplay, getAvatarColor,
 *   formatLeaderboardScore, getEmptyMessage
 *
 * UI rendering is not tested here (no React Native test renderer).
 * We reproduce the pure logic inline to avoid RN import chains.
 */

import { getArchetypeProfile } from '../../services/archetypeProfile';

let passed = 0;
let failed = 0;

function assert(condition: boolean, label: string) {
  if (condition) {
    passed++;
    console.log(`  \u2713 ${label}`);
  } else {
    failed++;
    console.error(`  \u2717 ${label}`);
  }
}

// ---------------------------------------------------------------------------
// Reproduce pure helpers (mirrors LeaderboardScreen exports)
// ---------------------------------------------------------------------------

type LeaderboardTab = 'points' | 'streaks' | 'archetype' | 'team';

interface TabConfig {
  key: LeaderboardTab;
  label: string;
  icon: string;
}

const TAB_CONFIG: TabConfig[] = [
  { key: 'points', label: 'Points', icon: 'trophy-outline' },
  { key: 'streaks', label: 'Streaks', icon: 'flame-outline' },
  { key: 'archetype', label: 'Archetype', icon: 'sparkles-outline' },
  { key: 'team', label: 'Team', icon: 'people-outline' },
];

function getRankDisplay(rank: number): { icon: string; color: string } | null {
  switch (rank) {
    case 1: return { icon: 'medal', color: '#FFD700' };
    case 2: return { icon: 'medal', color: '#C0C0C0' };
    case 3: return { icon: 'medal', color: '#CD7F32' };
    default: return null;
  }
}

function getAvatarColor(archetype: string | null | undefined): string {
  return getArchetypeProfile(archetype).color;
}

function formatLeaderboardScore(
  totalPoints: number,
  currentStreak: number,
  tab: LeaderboardTab,
): string {
  switch (tab) {
    case 'points':
    case 'archetype':
    case 'team':
      return `${totalPoints.toLocaleString('en-US')} pts`;
    case 'streaks':
      return `${currentStreak}d`;
  }
}

function getEmptyMessage(tab: LeaderboardTab): string {
  switch (tab) {
    case 'points': return 'No points data yet. Check in to start earning.';
    case 'streaks': return 'No streak data yet. Build your streak.';
    case 'archetype': return 'No archetype data yet. Keep checking in to unlock yours.';
    case 'team': return 'No team data yet. Join or create a team in your profile.';
  }
}

// ---------------------------------------------------------------------------
// TAB_CONFIG — structure
// ---------------------------------------------------------------------------
console.log('\nTAB_CONFIG — structure');

(() => {
  assert(TAB_CONFIG.length === 4, 'has 4 tabs');
  assert(TAB_CONFIG[0].key === 'points', 'first tab is points');
  assert(TAB_CONFIG[1].key === 'streaks', 'second tab is streaks');
  assert(TAB_CONFIG[2].key === 'archetype', 'third tab is archetype');
  assert(TAB_CONFIG[3].key === 'team', 'fourth tab is team');
})();

(() => {
  const keys = TAB_CONFIG.map(t => t.key);
  const unique = new Set(keys);
  assert(unique.size === 4, 'all tab keys are unique');
})();

(() => {
  let allValid = true;
  for (const tab of TAB_CONFIG) {
    if (!tab.key || !tab.label || !tab.icon) allValid = false;
    if (tab.label.length === 0) allValid = false;
  }
  assert(allValid, 'all tabs have key, label, and icon');
})();

(() => {
  const labels = TAB_CONFIG.map(t => t.label);
  const unique = new Set(labels);
  assert(unique.size === 4, 'all tab labels are unique');
})();

(() => {
  for (const tab of TAB_CONFIG) {
    assert(tab.icon.includes('-outline'), `${tab.key} icon is outline style: ${tab.icon}`);
  }
})();

// ---------------------------------------------------------------------------
// getRankDisplay — top 3
// ---------------------------------------------------------------------------
console.log('\ngetRankDisplay — top 3');

(() => {
  const gold = getRankDisplay(1);
  assert(gold !== null, 'rank 1 → not null');
  assert(gold!.icon === 'medal', 'rank 1 icon is medal');
  assert(gold!.color === '#FFD700', 'rank 1 is gold');

  const silver = getRankDisplay(2);
  assert(silver !== null, 'rank 2 → not null');
  assert(silver!.icon === 'medal', 'rank 2 icon is medal');
  assert(silver!.color === '#C0C0C0', 'rank 2 is silver');

  const bronze = getRankDisplay(3);
  assert(bronze !== null, 'rank 3 → not null');
  assert(bronze!.icon === 'medal', 'rank 3 icon is medal');
  assert(bronze!.color === '#CD7F32', 'rank 3 is bronze');
})();

// ---------------------------------------------------------------------------
// getRankDisplay — rank > 3 returns null
// ---------------------------------------------------------------------------
console.log('\ngetRankDisplay — rank > 3');

(() => {
  assert(getRankDisplay(4) === null, 'rank 4 → null');
  assert(getRankDisplay(5) === null, 'rank 5 → null');
  assert(getRankDisplay(10) === null, 'rank 10 → null');
  assert(getRankDisplay(100) === null, 'rank 100 → null');
  assert(getRankDisplay(0) === null, 'rank 0 → null');
  assert(getRankDisplay(-1) === null, 'rank -1 → null');
})();

// ---------------------------------------------------------------------------
// getRankDisplay — unique colors
// ---------------------------------------------------------------------------
console.log('\ngetRankDisplay — unique colors');

(() => {
  const colors = [1, 2, 3].map(r => getRankDisplay(r)!.color);
  const unique = new Set(colors);
  assert(unique.size === 3, 'gold, silver, bronze have unique colors');
})();

// ---------------------------------------------------------------------------
// getRankDisplay — gold is brightest
// ---------------------------------------------------------------------------
console.log('\ngetRankDisplay — medal color values');

(() => {
  const gold = getRankDisplay(1)!;
  const silver = getRankDisplay(2)!;
  const bronze = getRankDisplay(3)!;
  // Gold (#FFD700) should have the highest red component
  assert(gold.color === '#FFD700', 'gold is #FFD700');
  assert(silver.color === '#C0C0C0', 'silver is #C0C0C0');
  assert(bronze.color === '#CD7F32', 'bronze is #CD7F32');
})();

// ---------------------------------------------------------------------------
// getAvatarColor — archetypes
// ---------------------------------------------------------------------------
console.log('\ngetAvatarColor — archetypes');

(() => {
  assert(getAvatarColor('phoenix') === '#FF6B6B', 'phoenix → #FF6B6B');
  assert(getAvatarColor('titan') === '#4C6EF5', 'titan → #4C6EF5');
  assert(getAvatarColor('blade') === '#12B886', 'blade → #12B886');
  assert(getAvatarColor('surge') === '#FFD43B', 'surge → #FFD43B');
})();

// ---------------------------------------------------------------------------
// getAvatarColor — null/undefined/unknown → default
// ---------------------------------------------------------------------------
console.log('\ngetAvatarColor — fallback');

(() => {
  const defaultColor = '#4A90A4';
  assert(getAvatarColor(null) === defaultColor, 'null → default');
  assert(getAvatarColor(undefined) === defaultColor, 'undefined → default');
  assert(getAvatarColor('unknown') === defaultColor, 'unknown → default');
  assert(getAvatarColor('') === defaultColor, 'empty → default');
})();

// ---------------------------------------------------------------------------
// getAvatarColor — always returns valid hex
// ---------------------------------------------------------------------------
console.log('\ngetAvatarColor — valid hex');

(() => {
  const inputs = ['phoenix', 'titan', 'blade', 'surge', null, undefined, '', 'xyz'];
  let allHex = true;
  for (const input of inputs) {
    const color = getAvatarColor(input);
    if (!color.startsWith('#') || color.length < 4) allHex = false;
  }
  assert(allHex, 'all avatar colors are valid hex');
})();

// ---------------------------------------------------------------------------
// formatLeaderboardScore — points tab
// ---------------------------------------------------------------------------
console.log('\nformatLeaderboardScore — points tab');

(() => {
  assert(formatLeaderboardScore(0, 5, 'points') === '0 pts', '0 points');
  assert(formatLeaderboardScore(100, 5, 'points') === '100 pts', '100 points');
  assert(formatLeaderboardScore(1000, 5, 'points') === '1,000 pts', '1000 → 1,000 pts');
  assert(formatLeaderboardScore(12345, 10, 'points') === '12,345 pts', '12345 → 12,345 pts');
})();

// ---------------------------------------------------------------------------
// formatLeaderboardScore — streaks tab
// ---------------------------------------------------------------------------
console.log('\nformatLeaderboardScore — streaks tab');

(() => {
  assert(formatLeaderboardScore(500, 0, 'streaks') === '0d', '0 streak');
  assert(formatLeaderboardScore(500, 7, 'streaks') === '7d', '7d streak');
  assert(formatLeaderboardScore(500, 30, 'streaks') === '30d', '30d streak');
  assert(formatLeaderboardScore(500, 100, 'streaks') === '100d', '100d streak');
})();

// ---------------------------------------------------------------------------
// formatLeaderboardScore — archetype and team use points
// ---------------------------------------------------------------------------
console.log('\nformatLeaderboardScore — archetype/team use points');

(() => {
  assert(formatLeaderboardScore(250, 10, 'archetype') === '250 pts', 'archetype shows points');
  assert(formatLeaderboardScore(250, 10, 'team') === '250 pts', 'team shows points');
  assert(formatLeaderboardScore(1500, 10, 'archetype') === '1,500 pts', 'archetype formats thousands');
  assert(formatLeaderboardScore(1500, 10, 'team') === '1,500 pts', 'team formats thousands');
})();

// ---------------------------------------------------------------------------
// formatLeaderboardScore — all tabs return strings
// ---------------------------------------------------------------------------
console.log('\nformatLeaderboardScore — always string');

(() => {
  const tabs: LeaderboardTab[] = ['points', 'streaks', 'archetype', 'team'];
  for (const tab of tabs) {
    const result = formatLeaderboardScore(100, 10, tab);
    assert(typeof result === 'string', `${tab} returns string`);
    assert(result.length > 0, `${tab} returns non-empty`);
  }
})();

// ---------------------------------------------------------------------------
// getEmptyMessage — all tabs
// ---------------------------------------------------------------------------
console.log('\ngetEmptyMessage — all tabs');

(() => {
  const tabs: LeaderboardTab[] = ['points', 'streaks', 'archetype', 'team'];
  for (const tab of tabs) {
    const msg = getEmptyMessage(tab);
    assert(typeof msg === 'string', `${tab} returns string`);
    assert(msg.length > 10, `${tab} message is descriptive (len=${msg.length})`);
  }
})();

// ---------------------------------------------------------------------------
// getEmptyMessage — unique messages per tab
// ---------------------------------------------------------------------------
console.log('\ngetEmptyMessage — unique messages');

(() => {
  const tabs: LeaderboardTab[] = ['points', 'streaks', 'archetype', 'team'];
  const messages = tabs.map(getEmptyMessage);
  const unique = new Set(messages);
  assert(unique.size === 4, 'each tab has a unique empty message');
})();

// ---------------------------------------------------------------------------
// getEmptyMessage — constructive tone
// ---------------------------------------------------------------------------
console.log('\ngetEmptyMessage — constructive tone');

(() => {
  const tabs: LeaderboardTab[] = ['points', 'streaks', 'archetype', 'team'];
  const banned = ['grind', 'beast', 'crush', 'destroy', 'kill', 'smash', 'dominate'];
  let clean = true;
  for (const tab of tabs) {
    const msg = getEmptyMessage(tab).toLowerCase();
    for (const word of banned) {
      if (msg.includes(word)) clean = false;
    }
  }
  assert(clean, 'no banned words in empty messages');
})();

(() => {
  const tabs: LeaderboardTab[] = ['points', 'streaks', 'archetype', 'team'];
  let noExclamation = true;
  for (const tab of tabs) {
    if (getEmptyMessage(tab).includes('!')) noExclamation = false;
  }
  assert(noExclamation, 'no exclamation marks in empty messages');
})();

// ---------------------------------------------------------------------------
// getEmptyMessage — mentions action
// ---------------------------------------------------------------------------
console.log('\ngetEmptyMessage — action-oriented');

(() => {
  const pointsMsg = getEmptyMessage('points');
  assert(
    pointsMsg.toLowerCase().includes('check in') || pointsMsg.toLowerCase().includes('earning'),
    'points empty message suggests action',
  );

  const streaksMsg = getEmptyMessage('streaks');
  assert(
    streaksMsg.toLowerCase().includes('build') || streaksMsg.toLowerCase().includes('streak'),
    'streaks empty message suggests action',
  );

  const teamMsg = getEmptyMessage('team');
  assert(
    teamMsg.toLowerCase().includes('join') || teamMsg.toLowerCase().includes('create'),
    'team empty message suggests joining/creating',
  );
})();

// ---------------------------------------------------------------------------
// Integration: TAB_CONFIG + formatLeaderboardScore alignment
// ---------------------------------------------------------------------------
console.log('\nIntegration: tabs + score formatting');

(() => {
  // Every tab in config should produce a valid score string
  for (const tab of TAB_CONFIG) {
    const score = formatLeaderboardScore(500, 15, tab.key);
    assert(score.length > 0, `${tab.key} produces score`);
  }
})();

// ---------------------------------------------------------------------------
// Integration: TAB_CONFIG + getEmptyMessage alignment
// ---------------------------------------------------------------------------
console.log('\nIntegration: tabs + empty messages');

(() => {
  for (const tab of TAB_CONFIG) {
    const msg = getEmptyMessage(tab.key);
    assert(msg.length > 0, `${tab.key} has empty message`);
  }
})();

// ---------------------------------------------------------------------------
// Integration: avatarColor uses archetypeProfile
// ---------------------------------------------------------------------------
console.log('\nIntegration: avatarColor uses archetypeProfile');

(() => {
  const archetypes = ['phoenix', 'titan', 'blade', 'surge'];
  for (const arch of archetypes) {
    const avatarColor = getAvatarColor(arch);
    const profileColor = getArchetypeProfile(arch).color;
    assert(avatarColor === profileColor, `${arch} avatar matches profile: ${avatarColor}`);
  }
})();

// ---------------------------------------------------------------------------
// Podium layout: ranks 1-3 in Silver-Gold-Bronze order
// ---------------------------------------------------------------------------
console.log('\nPodium layout logic');

(() => {
  // The podium renders: entries[1] (rank 2), entries[0] (rank 1), entries[2] (rank 3)
  // So the visual order is: Silver — Gold — Bronze
  const entries = [
    { name: 'Alice', rank: 1 },
    { name: 'Bob', rank: 2 },
    { name: 'Carol', rank: 3 },
  ];
  // Layout array: [entries[1], entries[0], entries[2]] = [Bob, Alice, Carol]
  const layout = [entries[1], entries[0], entries[2]];
  assert(layout[0].name === 'Bob', 'left slot is 2nd place');
  assert(layout[1].name === 'Alice', 'center slot is 1st place');
  assert(layout[2].name === 'Carol', 'right slot is 3rd place');
})();

// ---------------------------------------------------------------------------
// Score display: streaks show days, others show points
// ---------------------------------------------------------------------------
console.log('\nScore display tab discrimination');

(() => {
  const pts = formatLeaderboardScore(1000, 30, 'points');
  const stk = formatLeaderboardScore(1000, 30, 'streaks');
  assert(pts.includes('pts'), 'points tab shows pts');
  assert(stk.includes('d'), 'streaks tab shows d');
  assert(!pts.includes('d'), 'points tab does not show d suffix');
  assert(!stk.includes('pts'), 'streaks tab does not show pts');
})();

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------
test('all assertions pass', () => {
  expect(failed).toBe(0);
});
