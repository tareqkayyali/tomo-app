/**
 * Visibility Preferences Screen — P4.4 (2026-04-18)
 *
 * Athlete-facing per-domain visibility matrix. Controls what each
 * linked guardian (coach / parent) can read. T3 athletes see this
 * primarily — their default is fail-closed (nothing visible until
 * opt-in, UK Children's Code Standard 7). T1/T2 athletes may still
 * use it for fine-grained revocation though defaults are true.
 *
 * Optimistic local toggle → batched save on blur / explicit Save.
 * Safety domain is always-on when a guardian is linked and CANNOT be
 * toggled off — parent/coach must be able to read safety signals
 * regardless of athlete preference (safety is life-impact).
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Switch,
  Pressable,
  Alert,
  Platform,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Loader } from '../../components/Loader';

import { useTheme } from '../../hooks/useTheme';
import { PlayerScreen } from '../../components/tomo-ui/playerDesign';
import { spacing, borderRadius, fontFamily } from '../../theme';
import {
  getVisibilityPreferences,
  putVisibilityPreferences,
  type LinkedGuardian,
  type VisibilityDomain,
  type VisibilityPreferenceRow,
} from '../../services/api';

const DOMAINS: Array<{ key: VisibilityDomain; label: string; helper: string; locked?: boolean }> = [
  { key: 'training',  label: 'Training',  helper: 'Sessions, load, performance data' },
  { key: 'academic',  label: 'Academic',  helper: 'Study blocks, exam dates, school stress' },
  { key: 'wellbeing', label: 'Wellbeing', helper: 'Sleep, check-ins, mood trend' },
  { key: 'safety',    label: 'Safety',    helper: 'Injury flags, recovery alerts (always on)', locked: true },
  { key: 'logistics', label: 'Logistics', helper: 'Calendar events, schedule changes' },
  { key: 'cv',        label: 'CV',        helper: 'Performance CV + shared profile' },
];

type Key = `${string}::${VisibilityDomain}`;

function key(guardianId: string, domain: VisibilityDomain): Key {
  return `${guardianId}::${domain}` as Key;
}

export function VisibilityPreferencesScreen() {
  const { colors } = useTheme();
  const navigation = useNavigation<any>();
  const [guardians, setGuardians] = useState<LinkedGuardian[]>([]);
  const [state, setState] = useState<Record<Key, boolean>>({});
  const [initialState, setInitialState] = useState<Record<Key, boolean>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await getVisibilityPreferences();
      setGuardians(res.guardians);
      const init: Record<Key, boolean> = {};
      // Seed: safety is always true; others default false (fail-closed).
      for (const g of res.guardians) {
        for (const d of DOMAINS) {
          init[key(g.guardianId, d.key)] = d.key === 'safety' ? true : false;
        }
      }
      // Overlay server preferences.
      for (const p of res.preferences as VisibilityPreferenceRow[]) {
        init[key(p.guardianId, p.domain)] = p.visible;
      }
      // Enforce safety always-on.
      for (const g of res.guardians) {
        init[key(g.guardianId, 'safety')] = true;
      }
      setState(init);
      setInitialState(init);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const dirtyEntries = useMemo(() => {
    const changed: Array<{ guardianId: string; domain: VisibilityDomain; visible: boolean }> = [];
    for (const [k, v] of Object.entries(state)) {
      if (initialState[k as Key] === v) continue;
      const [guardianId, domain] = (k as string).split('::') as [string, VisibilityDomain];
      // Skip safety — always on, never save a toggled-off state.
      if (domain === 'safety') continue;
      changed.push({ guardianId, domain, visible: v });
    }
    return changed;
  }, [state, initialState]);

  const toggle = useCallback(
    (guardianId: string, domain: VisibilityDomain, locked: boolean | undefined) => (value: boolean) => {
      if (locked) {
        if (Platform.OS !== 'web') {
          Alert.alert(
            'Safety is always visible',
            "Your coach and parent always see injury flags and recovery alerts — this keeps you safe.",
          );
        }
        return;
      }
      setState((prev) => ({ ...prev, [key(guardianId, domain)]: value }));
    },
    []
  );

  const save = useCallback(async () => {
    if (dirtyEntries.length === 0) return;
    try {
      setSaving(true);
      setError(null);
      await putVisibilityPreferences(dirtyEntries);
      setInitialState({ ...state });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }, [dirtyEntries, state]);

  return (
    <PlayerScreen
      label="SETTINGS"
      title="Who sees what"
      caption="You choose per-domain what each coach or parent can see. Safety signals are always shared — that's non-negotiable."
      onBack={() => navigation.goBack()}
      contentStyle={styles.scroll}
    >
        {loading && (
          <Loader size="lg" style={{ marginTop: 32 }} />
        )}

        {error && !loading && (
          <View style={[styles.errorBox, { borderColor: colors.error ?? '#E74C3C' }]}>
            <Text style={{ color: colors.error ?? '#E74C3C' }}>{error}</Text>
          </View>
        )}

        {!loading && guardians.length === 0 && (
          <View style={[styles.card, { borderColor: colors.border, backgroundColor: colors.cardLight }]}>
            <Text style={{ color: colors.textSecondary }}>
              No coach or parent linked yet. Share your invite code to connect them.
            </Text>
          </View>
        )}

        {!loading && guardians.map((g) => (
          <View
            key={g.guardianId}
            style={[styles.card, { borderColor: colors.border, backgroundColor: colors.cardLight }]}
          >
            <View style={styles.guardianHeader}>
              <Text style={[styles.guardianName, { color: colors.textPrimary }]}>
                {g.name ?? g.email ?? 'Guardian'}
              </Text>
              <Text style={[styles.guardianRole, { color: colors.textSecondary }]}>
                {g.relationshipType === 'coach' ? 'Coach' : 'Parent'}
              </Text>
            </View>

            {DOMAINS.map((d) => {
              const k = key(g.guardianId, d.key);
              const value = state[k] ?? false;
              return (
                <View key={d.key} style={styles.row}>
                  <View style={styles.rowMain}>
                    <Text style={[styles.rowLabel, { color: colors.textPrimary }]}>{d.label}</Text>
                    <Text style={[styles.rowHelper, { color: colors.textSecondary }]}>
                      {d.helper}
                    </Text>
                  </View>
                  <Switch
                    value={value}
                    onValueChange={toggle(g.guardianId, d.key, d.locked)}
                    disabled={d.locked}
                    trackColor={{ false: colors.border, true: colors.accent1 + '88' }}
                    thumbColor={value ? colors.accent1 : colors.textInactive}
                  />
                </View>
              );
            })}
          </View>
        ))}

        <View style={{ height: 24 }} />

      {!loading && dirtyEntries.length > 0 && (
        <View style={[styles.saveBar, { borderTopColor: colors.border, backgroundColor: colors.background }]}>
          <Text style={[styles.saveHint, { color: colors.textSecondary }]}>
            {dirtyEntries.length} change{dirtyEntries.length === 1 ? '' : 's'} pending
          </Text>
          <Pressable
            onPress={save}
            disabled={saving}
            style={({ pressed }) => [
              styles.saveBtn,
              { backgroundColor: colors.accent1 },
              pressed && { opacity: 0.85 },
            ]}
          >
            {saving ? (
              <Loader size="sm" />
            ) : (
              <Text style={styles.saveBtnText}>Save</Text>
            )}
          </Pressable>
        </View>
      )}
    </PlayerScreen>
  );
}

const styles = StyleSheet.create({
  headerArea: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
  },
  title: {
    fontFamily: fontFamily.semiBold,
    fontSize: 26,
    fontWeight: '700',
  },
  subtitle: {
    fontSize: 13,
    marginTop: 4,
    lineHeight: 18,
  },
  scroll: {
    paddingHorizontal: spacing.md,
    paddingBottom: 90,
    gap: spacing.sm,
  },
  card: {
    padding: spacing.md,
    borderRadius: borderRadius.md,
    borderWidth: 0.5,
  },
  guardianHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  guardianName: {
    fontSize: 16,
    fontFamily: fontFamily.semiBold,
    fontWeight: '600',
  },
  guardianRole: {
    fontSize: 11,
    fontFamily: fontFamily.medium,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
  },
  rowMain: {
    flex: 1,
    paddingRight: spacing.sm,
  },
  rowLabel: {
    fontSize: 14,
    fontFamily: fontFamily.medium,
    fontWeight: '600',
  },
  rowHelper: {
    fontSize: 12,
    marginTop: 2,
  },
  errorBox: {
    padding: spacing.md,
    borderRadius: borderRadius.md,
    borderWidth: 0.5,
  },
  saveBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderTopWidth: 0.5,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  saveHint: {
    fontSize: 13,
  },
  saveBtn: {
    paddingHorizontal: 24,
    paddingVertical: 10,
    borderRadius: 999,
  },
  saveBtnText: {
    color: '#fff',
    fontFamily: fontFamily.semiBold,
    fontSize: 14,
    fontWeight: '700',
  },
});
