/**
 * DrillBuilderScreen — Coach programme builder
 *
 * List view → Create/Edit programme → Week/Day drill grid → Publish
 * Coaches assign drills from the drill DB to specific week/day slots,
 * set prescription (sets, reps, RPE, rest, intensity, progression),
 * and publish to targeted players.
 */

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  TextInput,
  FlatList,
  Alert,
  Modal,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { SmartIcon } from '../../components/SmartIcon';
import { Loader } from '../../components/Loader';

import { useTheme } from '../../hooks/useTheme';
import {
  listProgrammes,
  createProgramme,
  getProgramme,
  addDrillToProgramme,
  deleteProgrammeDrill,
  publishProgramme,
  getCoachDrills,
} from '../../services/api';
import { spacing, borderRadius, layout, shadows, fontFamily, screenBg } from '../../theme';
import type { ThemeColors } from '../../theme/colors';
import { colors } from '../../theme/colors';

import type {
  CoachProgramme,
  ProgrammeDrill,
  SeasonCycle,
  ProgressionType,
} from '../../types/programme';
import {
  CATEGORY_COLORS as CAT_COLORS,
  CATEGORY_LABELS as CAT_LABELS,
  CATEGORY_ICONS as CAT_ICONS,
  DAY_NAMES as DAYS,
  CYCLE_LABELS as CYC_LABELS,
  CYCLE_COLORS as CYC_COLORS,
} from '../../types/programme';

// ── Types ────────────────────────────────────────────────────────

interface DrillSearchResult {
  id: string;
  name: string;
  category: string;
  difficulty_level: string;
  duration_minutes: number;
}

type ScreenMode = 'list' | 'editor';

// ── Main Component ──────────────────────────────────────────────

export function DrillBuilderScreen() {
  const { colors } = useTheme();
  const [mode, setMode] = useState<ScreenMode>('list');
  const [programmes, setProgrammes] = useState<CoachProgramme[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeProgramme, setActiveProgramme] = useState<CoachProgramme | null>(null);

  const fetchProgrammes = useCallback(async () => {
    setLoading(true);
    try {
      const data = await listProgrammes();
      setProgrammes(data);
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchProgrammes();
  }, [fetchProgrammes]);

  const handleSelectProgramme = useCallback(async (id: string) => {
    try {
      const prog = await getProgramme(id);
      if (prog) {
        setActiveProgramme(prog);
        setMode('editor');
      }
    } catch {
      if (Platform.OS === 'web') {
        window.alert('Could not load programme');
      } else {
        Alert.alert('Error', 'Could not load programme');
      }
    }
  }, []);

  const handleBack = useCallback(() => {
    setMode('list');
    setActiveProgramme(null);
    fetchProgrammes();
  }, [fetchProgrammes]);

  if (mode === 'editor' && activeProgramme) {
    return (
      <ProgrammeEditor
        programme={activeProgramme}
        setProgramme={setActiveProgramme}
        onBack={handleBack}
        colors={colors}
      />
    );
  }

  return (
    <ProgrammeList
      programmes={programmes}
      loading={loading}
      onSelect={handleSelectProgramme}
      onCreated={(id) => handleSelectProgramme(id)}
      onRefresh={fetchProgrammes}
      colors={colors}
    />
  );
}

// ══════════════════════════════════════════════════════════════════
// Programme List View
// ══════════════════════════════════════════════════════════════════

function ProgrammeList({
  programmes,
  loading,
  onSelect,
  onCreated,
  onRefresh,
  colors,
}: {
  programmes: CoachProgramme[];
  loading: boolean;
  onSelect: (id: string) => void;
  onCreated: (id: string) => void;
  onRefresh: () => void;
  colors: ThemeColors;
}) {
  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({
    name: '',
    description: '',
    seasonCycle: 'in_season' as SeasonCycle,
    weeks: 4,
  });

  const handleCreate = async () => {
    if (!form.name.trim()) {
      if (Platform.OS === 'web') {
        window.alert('Give your programme a name');
      } else {
        Alert.alert('Name required', 'Give your programme a name');
      }
      return;
    }
    setCreating(true);
    try {
      const prog = await createProgramme({
        name: form.name.trim(),
        description: form.description.trim() || undefined,
        seasonCycle: form.seasonCycle,
        startDate: new Date().toISOString().split('T')[0],
        weeks: form.weeks,
        targetType: 'all',
      });
      if (prog) {
        setShowCreate(false);
        setForm({ name: '', description: '', seasonCycle: 'in_season', weeks: 4 });
        onCreated(prog.id);
      }
    } catch {
      if (Platform.OS === 'web') {
        window.alert('Could not create programme');
      } else {
        Alert.alert('Error', 'Could not create programme');
      }
    } finally {
      setCreating(false);
    }
  };

  const cycles: SeasonCycle[] = ['pre_season', 'in_season', 'off_season', 'exam_period'];

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: screenBg }]} edges={['top']}>
      <View style={styles.header}>
        <Text style={[styles.headerTitle, { color: colors.textOnDark }]}>Programmes</Text>
        <Pressable
          onPress={() => setShowCreate(true)}
          style={[styles.createBtn, { backgroundColor: colors.accent1 }]}
        >
          <SmartIcon name="add" size={18} color={colors.textOnDark} />
          <Text style={[styles.createBtnText, { color: colors.textOnDark }]}>New</Text>
        </Pressable>
      </View>

      {loading ? (
        <View style={styles.centered}>
          <Loader size="lg" />
        </View>
      ) : programmes.length === 0 ? (
        <View style={styles.centered}>
          <SmartIcon name="barbell-outline" size={48} color={colors.textInactive} />
          <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
            No programmes yet
          </Text>
          <Text style={[styles.emptySubtext, { color: colors.textInactive }]}>
            Create your first training programme
          </Text>
        </View>
      ) : (
        <FlatList
          data={programmes}
          keyExtractor={(p) => p.id}
          contentContainerStyle={styles.listContent}
          renderItem={({ item }) => {
            const cycleColor = CYC_COLORS[item.seasonCycle] || colors.accent1;
            return (
              <Pressable
                onPress={() => onSelect(item.id)}
                style={({ pressed }) => [
                  styles.progCard,
                  { backgroundColor: colors.surfaceElevated, opacity: pressed ? 0.85 : 1 },
                ]}
              >
                <View style={styles.progCardTop}>
                  <View style={[styles.cycleBadge, { backgroundColor: cycleColor + '22' }]}>
                    <Text style={[styles.cycleBadgeText, { color: cycleColor }]}>
                      {CYC_LABELS[item.seasonCycle] || item.seasonCycle}
                    </Text>
                  </View>
                  <View
                    style={[
                      styles.statusDot,
                      {
                        backgroundColor:
                          item.status === 'published'
                            ? colors.success
                            : item.status === 'draft'
                            ? colors.textInactive
                            : colors.error,
                      },
                    ]}
                  />
                </View>
                <Text style={[styles.progName, { color: colors.textOnDark }]}>{item.name}</Text>
                {item.description ? (
                  <Text
                    style={[styles.progDesc, { color: colors.textSecondary }]}
                    numberOfLines={2}
                  >
                    {item.description}
                  </Text>
                ) : null}
                <View style={styles.progMeta}>
                  <Text style={[styles.progMetaText, { color: colors.textInactive }]}>
                    {item.weeks} week{item.weeks !== 1 ? 's' : ''} · {item.drills?.length ?? 0} drills
                  </Text>
                  <Text style={[styles.progMetaText, { color: colors.textInactive }]}>
                    {item.status}
                  </Text>
                </View>
              </Pressable>
            );
          }}
        />
      )}

      {/* ── Create Programme Modal ─────────────────────────── */}
      <Modal visible={showCreate} transparent animationType="slide">
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.modalOverlay}
        >
          <View style={[styles.modalContent, { backgroundColor: colors.surfaceElevated }]}>
            <Text style={[styles.modalTitle, { color: colors.textOnDark }]}>New Programme</Text>

            <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>Name</Text>
            <TextInput
              style={[styles.input, { color: colors.textOnDark, backgroundColor: colors.surface, borderColor: colors.border }]}
              placeholder="e.g. Pre-Season Strength"
              placeholderTextColor={colors.textInactive}
              value={form.name}
              onChangeText={(t) => setForm((f) => ({ ...f, name: t }))}
            />

            <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>Description</Text>
            <TextInput
              style={[styles.input, styles.inputMulti, { color: colors.textOnDark, backgroundColor: colors.surface, borderColor: colors.border }]}
              placeholder="Optional notes..."
              placeholderTextColor={colors.textInactive}
              value={form.description}
              onChangeText={(t) => setForm((f) => ({ ...f, description: t }))}
              multiline
            />

            <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>Season Cycle</Text>
            <View style={styles.chipRow}>
              {cycles.map((c) => {
                const active = form.seasonCycle === c;
                const cc = CYC_COLORS[c];
                return (
                  <Pressable
                    key={c}
                    onPress={() => setForm((f) => ({ ...f, seasonCycle: c }))}
                    style={[
                      styles.chip,
                      { backgroundColor: active ? cc + '33' : colors.surface, borderColor: active ? cc : colors.border },
                    ]}
                  >
                    <Text style={[styles.chipText, { color: active ? cc : colors.textSecondary }]}>
                      {CYC_LABELS[c]}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>Weeks</Text>
            <View style={styles.weeksPicker}>
              {[2, 4, 6, 8, 12].map((w) => (
                <Pressable
                  key={w}
                  onPress={() => setForm((f) => ({ ...f, weeks: w }))}
                  style={[
                    styles.weekBtn,
                    {
                      backgroundColor: form.weeks === w ? colors.accent1 : colors.surface,
                      borderColor: form.weeks === w ? colors.accent1 : colors.border,
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.weekBtnText,
                      { color: form.weeks === w ? colors.textOnDark : colors.textSecondary },
                    ]}
                  >
                    {w}
                  </Text>
                </Pressable>
              ))}
            </View>

            <View style={styles.modalActions}>
              <Pressable
                onPress={() => setShowCreate(false)}
                style={[styles.modalBtn, { backgroundColor: colors.surface }]}
              >
                <Text style={[styles.modalBtnText, { color: colors.textSecondary }]}>Cancel</Text>
              </Pressable>
              <Pressable
                onPress={handleCreate}
                disabled={creating}
                style={[styles.modalBtn, { backgroundColor: colors.accent1, opacity: creating ? 0.6 : 1 }]}
              >
                {creating ? (
                  <Loader size="sm" />
                ) : (
                  <Text style={[styles.modalBtnText, { color: colors.textOnDark }]}>Create</Text>
                )}
              </Pressable>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}

// ══════════════════════════════════════════════════════════════════
// Programme Editor — Week/Day Grid + Drill Assignment
// ══════════════════════════════════════════════════════════════════

function ProgrammeEditor({
  programme,
  setProgramme,
  onBack,
  colors,
}: {
  programme: CoachProgramme;
  setProgramme: (p: CoachProgramme) => void;
  onBack: () => void;
  colors: ThemeColors;
}) {
  const [selectedWeek, setSelectedWeek] = useState(1);
  const [selectedDay, setSelectedDay] = useState(1); // 0=Sun..6=Sat, default Mon
  const [showDrillPicker, setShowDrillPicker] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);

  const drillsForWeekDay = useMemo(() => {
    return (programme.drills || []).filter(
      (d) => d.weekNumber === selectedWeek && d.dayOfWeek === selectedDay,
    );
  }, [programme.drills, selectedWeek, selectedDay]);

  // Count drills per day for the selected week (for dot indicators)
  const drillCountByDay = useMemo(() => {
    const counts: Record<number, number> = {};
    for (const d of programme.drills || []) {
      if (d.weekNumber === selectedWeek) {
        counts[d.dayOfWeek] = (counts[d.dayOfWeek] || 0) + 1;
      }
    }
    return counts;
  }, [programme.drills, selectedWeek]);

  const handleDeleteDrill = useCallback(
    async (drillRecordId: string) => {
      setDeleting(drillRecordId);
      try {
        await deleteProgrammeDrill(programme.id, drillRecordId);
        setProgramme({
          ...programme,
          drills: (programme.drills || []).filter((d) => d.id !== drillRecordId),
        });
      } catch {
        if (Platform.OS === 'web') {
          window.alert('Could not remove drill');
        } else {
          Alert.alert('Error', 'Could not remove drill');
        }
      } finally {
        setDeleting(null);
      }
    },
    [programme, setProgramme],
  );

  const handleDrillAdded = useCallback(
    (newDrills: ProgrammeDrill[]) => {
      setProgramme({
        ...programme,
        drills: [...(programme.drills || []), ...newDrills],
      });
      setShowDrillPicker(false);
    },
    [programme, setProgramme],
  );

  const handlePublish = useCallback(async () => {
    if (programme.status === 'published') {
      if (Platform.OS === 'web') {
        window.alert('This programme has already been published.');
      } else {
        Alert.alert('Already published', 'This programme has already been published.');
      }
      return;
    }
    if (Platform.OS === 'web') {
      if (window.confirm('This will add drills to all target players\' calendars and send push notifications. Continue?')) {
        setPublishing(true);
        try {
          const result = await publishProgramme(programme.id);
          if (result) {
            window.alert(`${result.eventsCreated} events created for ${result.playersTargeted} player${result.playersTargeted !== 1 ? 's' : ''}.`);
            setProgramme({ ...programme, status: 'published' });
          }
        } catch {
          window.alert('Failed to publish programme');
        } finally {
          setPublishing(false);
        }
      }
    } else {
      Alert.alert(
        'Publish Programme',
        'This will add drills to all target players\' calendars and send push notifications. Continue?',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Publish',
            style: 'default',
            onPress: async () => {
              setPublishing(true);
              try {
                const result = await publishProgramme(programme.id);
                if (result) {
                  Alert.alert(
                    'Published!',
                    `${result.eventsCreated} events created for ${result.playersTargeted} player${result.playersTargeted !== 1 ? 's' : ''}.`,
                  );
                  setProgramme({ ...programme, status: 'published' });
                }
              } catch {
                Alert.alert('Error', 'Failed to publish programme');
              } finally {
                setPublishing(false);
              }
            },
          },
        ],
      );
    }
  }, [programme, setProgramme]);

  const totalDrills = (programme.drills || []).length;

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: screenBg }]} edges={['top']}>
      {/* ── Header ─────────────────────────────────────── */}
      <View style={styles.editorHeader}>
        <Pressable onPress={onBack} hitSlop={12}>
          <SmartIcon name="arrow-back" size={24} color={colors.textOnDark} />
        </Pressable>
        <View style={styles.editorHeaderCenter}>
          <Text style={[styles.editorTitle, { color: colors.textOnDark }]} numberOfLines={1}>
            {programme.name}
          </Text>
          <View style={styles.editorSubRow}>
            <View
              style={[
                styles.statusPill,
                {
                  backgroundColor:
                    programme.status === 'published' ? colors.success + '22' : colors.surface,
                },
              ]}
            >
              <Text
                style={[
                  styles.statusPillText,
                  {
                    color:
                      programme.status === 'published' ? colors.success : colors.textInactive,
                  },
                ]}
              >
                {programme.status}
              </Text>
            </View>
            <Text style={[styles.drillCountText, { color: colors.textInactive }]}>
              {totalDrills} drill{totalDrills !== 1 ? 's' : ''}
            </Text>
          </View>
        </View>
        <Pressable
          onPress={handlePublish}
          disabled={publishing || programme.status === 'published'}
          style={[
            styles.publishBtn,
            {
              backgroundColor: programme.status === 'published' ? colors.surface : colors.accent1,
              opacity: publishing ? 0.6 : 1,
            },
          ]}
        >
          {publishing ? (
            <Loader size="sm" />
          ) : (
            <>
              <SmartIcon
                name={programme.status === 'published' ? 'checkmark-circle' : 'send'}
                size={14}
                color={programme.status === 'published' ? colors.success : colors.textOnDark}
              />
              <Text
                style={[
                  styles.publishBtnText,
                  { color: programme.status === 'published' ? colors.success : colors.textOnDark },
                ]}
              >
                {programme.status === 'published' ? 'Live' : 'Publish'}
              </Text>
            </>
          )}
        </Pressable>
      </View>

      {/* ── Week Strip ────────────────────────────────── */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.weekStrip}
      >
        {Array.from({ length: programme.weeks }, (_, i) => i + 1).map((w) => {
          const isActive = selectedWeek === w;
          const weekDrillCount = (programme.drills || []).filter(
            (d) => d.weekNumber === w,
          ).length;
          return (
            <Pressable
              key={w}
              onPress={() => setSelectedWeek(w)}
              style={[
                styles.weekTab,
                {
                  backgroundColor: isActive ? colors.accent1 : colors.surface,
                  borderColor: isActive ? colors.accent1 : colors.border,
                },
              ]}
            >
              <Text
                style={[
                  styles.weekTabText,
                  { color: isActive ? colors.textOnDark : colors.textSecondary },
                ]}
              >
                Wk {w}
              </Text>
              {weekDrillCount > 0 && (
                <Text
                  style={[
                    styles.weekDrillCount,
                    { color: isActive ? colors.textOnDark + '99' : colors.textInactive },
                  ]}
                >
                  {weekDrillCount}
                </Text>
              )}
            </Pressable>
          );
        })}
      </ScrollView>

      {/* ── Day Strip ─────────────────────────────────── */}
      <View style={styles.dayStrip}>
        {[1, 2, 3, 4, 5, 6, 0].map((d) => {
          const isActive = selectedDay === d;
          const count = drillCountByDay[d] || 0;
          return (
            <Pressable
              key={d}
              onPress={() => setSelectedDay(d)}
              style={[
                styles.dayTab,
                {
                  backgroundColor: isActive ? colors.accent1 + '22' : 'transparent',
                  borderBottomColor: isActive ? colors.accent1 : 'transparent',
                },
              ]}
            >
              <Text
                style={[
                  styles.dayTabText,
                  { color: isActive ? colors.accent1 : colors.textSecondary },
                ]}
              >
                {DAYS[d]}
              </Text>
              {count > 0 && (
                <View style={[styles.dayDot, { backgroundColor: colors.accent1 }]}>
                  <Text style={[styles.dayDotText, { color: colors.textOnDark }]}>{count}</Text>
                </View>
              )}
            </Pressable>
          );
        })}
      </View>

      {/* ── Drill List for Selected Week/Day ──────────── */}
      <ScrollView style={styles.drillList} contentContainerStyle={styles.drillListContent}>
        {drillsForWeekDay.length === 0 ? (
          <View style={styles.emptyDay}>
            <SmartIcon name="calendar-outline" size={32} color={colors.textInactive} />
            <Text style={[styles.emptyDayText, { color: colors.textInactive }]}>
              No drills on {DAYS[selectedDay]} · Week {selectedWeek}
            </Text>
          </View>
        ) : (
          drillsForWeekDay.map((drill, idx) => {
            const catColor = CAT_COLORS[drill.drillCategory as keyof typeof CAT_COLORS] || colors.accent1;
            const isDeleting = deleting === drill.id;
            return (
              <View
                key={drill.id}
                style={[styles.drillCard, { backgroundColor: colors.surfaceElevated }]}
              >
                <View style={[styles.drillCatBar, { backgroundColor: catColor }]} />
                <View style={styles.drillCardBody}>
                  <View style={styles.drillCardTopRow}>
                    <View style={styles.drillCardInfo}>
                      <Text style={[styles.drillOrderBadge, { color: colors.textInactive }]}>
                        #{idx + 1}
                      </Text>
                      <Text style={[styles.drillName, { color: colors.textOnDark }]} numberOfLines={1}>
                        {drill.drillName || 'Untitled Drill'}
                      </Text>
                    </View>
                    <Pressable
                      onPress={() => handleDeleteDrill(drill.id)}
                      disabled={isDeleting}
                      hitSlop={8}
                    >
                      {isDeleting ? (
                        <Loader size="sm" />
                      ) : (
                        <SmartIcon name="trash-outline" size={16} color={colors.error} />
                      )}
                    </Pressable>
                  </View>

                  {/* Prescription row */}
                  <View style={styles.rxRow}>
                    <RxPill label="Sets" value={String(drill.sets)} color={colors} />
                    <RxPill label="Reps" value={drill.reps} color={colors} />
                    <RxPill label="RPE" value={String(drill.rpeTarget)} color={colors} />
                    <RxPill label="Rest" value={`${drill.restSeconds}s`} color={colors} />
                    {drill.durationMin ? (
                      <RxPill label="Dur" value={`${drill.durationMin}m`} color={colors} />
                    ) : null}
                  </View>

                  {/* Tags */}
                  <View style={styles.tagRow}>
                    <View style={[styles.catPill, { backgroundColor: catColor + '22' }]}>
                      <Text style={[styles.catPillText, { color: catColor }]}>
                        {CAT_ICONS[drill.drillCategory as keyof typeof CAT_ICONS] || ''}{' '}
                        {CAT_LABELS[drill.drillCategory as keyof typeof CAT_LABELS] || drill.drillCategory}
                      </Text>
                    </View>
                    {drill.isMandatory && (
                      <View style={[styles.mandatoryBadge, { backgroundColor: colors.error + '22' }]}>
                        <Text style={[styles.mandatoryText, { color: colors.error }]}>Mandatory</Text>
                      </View>
                    )}
                    {drill.progression !== 'none' && (
                      <View style={[styles.progressionBadge, { backgroundColor: colors.surface }]}>
                        <SmartIcon name="trending-up" size={10} color={colors.textSecondary} />
                        <Text style={[styles.progressionText, { color: colors.textSecondary }]}>
                          {drill.progression.replace('_', ' ')}
                        </Text>
                      </View>
                    )}
                  </View>

                  {drill.coachNotes ? (
                    <Text style={[styles.coachNotes, { color: colors.textInactive }]} numberOfLines={2}>
                      {drill.coachNotes}
                    </Text>
                  ) : null}
                </View>
              </View>
            );
          })
        )}

        {/* Add Drill button */}
        {programme.status !== 'published' && (
          <Pressable
            onPress={() => setShowDrillPicker(true)}
            style={({ pressed }) => [
              styles.addDrillBtn,
              { borderColor: colors.accent1, opacity: pressed ? 0.7 : 1 },
            ]}
          >
            <SmartIcon name="add-circle-outline" size={20} color={colors.accent1} />
            <Text style={[styles.addDrillText, { color: colors.accent1 }]}>Add Drill</Text>
          </Pressable>
        )}
      </ScrollView>

      {/* ── Drill Picker Modal ────────────────────────── */}
      <Modal visible={showDrillPicker} transparent animationType="slide">
        <DrillPicker
          programmeId={programme.id}
          weekNumber={selectedWeek}
          dayOfWeek={selectedDay}
          onDrillAdded={handleDrillAdded}
          onClose={() => setShowDrillPicker(false)}
          colors={colors}
        />
      </Modal>
    </SafeAreaView>
  );
}

// ── Rx Pill (prescription mini badge) ─────────────────────────

function RxPill({ label, value, color }: { label: string; value: string; color: ThemeColors }) {
  return (
    <View style={[styles.rxPill, { backgroundColor: color.surface }]}>
      <Text style={[styles.rxLabel, { color: color.textInactive }]}>{label}</Text>
      <Text style={[styles.rxValue, { color: color.textOnDark }]}>{value}</Text>
    </View>
  );
}

// ══════════════════════════════════════════════════════════════════
// Drill Picker — Search + Prescription Form
// ══════════════════════════════════════════════════════════════════

function DrillPicker({
  programmeId,
  weekNumber,
  dayOfWeek,
  onDrillAdded,
  onClose,
  colors,
}: {
  programmeId: string;
  weekNumber: number;
  dayOfWeek: number;
  onDrillAdded: (drills: ProgrammeDrill[]) => void;
  onClose: () => void;
  colors: ThemeColors;
}) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<DrillSearchResult[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [selectedDrill, setSelectedDrill] = useState<DrillSearchResult | null>(null);
  const [adding, setAdding] = useState(false);

  // Prescription form state
  const [sets, setSets] = useState('3');
  const [reps, setReps] = useState('10');
  const [rpeTarget, setRpeTarget] = useState('7');
  const [restSeconds, setRestSeconds] = useState('60');
  const [intensity, setIntensity] = useState('moderate');
  const [durationMin, setDurationMin] = useState('');
  const [coachNotes, setCoachNotes] = useState('');
  const [isMandatory, setIsMandatory] = useState(true);
  const [repeatWeeks, setRepeatWeeks] = useState('1');
  const [progression, setProgression] = useState<ProgressionType>('none');

  const searchTimeout = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    // Load initial drills
    setSearchLoading(true);
    getCoachDrills(undefined, undefined)
      .then(setResults)
      .catch(() => {})
      .finally(() => setSearchLoading(false));
  }, []);

  const handleSearch = useCallback((text: string) => {
    setQuery(text);
    if (searchTimeout.current) clearTimeout(searchTimeout.current);
    searchTimeout.current = setTimeout(async () => {
      setSearchLoading(true);
      try {
        const res = await getCoachDrills(undefined, text || undefined);
        setResults(res);
      } catch {
        // silent
      } finally {
        setSearchLoading(false);
      }
    }, 300);
  }, []);

  const handleAdd = useCallback(async () => {
    if (!selectedDrill) return;
    setAdding(true);
    try {
      const payload = {
        drillId: selectedDrill.id,
        drillName: selectedDrill.name,
        drillCategory: selectedDrill.category || 'training',
        weekNumber,
        dayOfWeek,
        sets: parseInt(sets, 10) || 3,
        reps,
        intensity,
        restSeconds: parseInt(restSeconds, 10) || 60,
        rpeTarget: parseInt(rpeTarget, 10) || 7,
        durationMin: durationMin ? parseInt(durationMin, 10) : undefined,
        coachNotes: coachNotes.trim() || undefined,
        isMandatory,
        repeatWeeks: parseInt(repeatWeeks, 10) || 1,
        progression,
      };
      const newDrills = await addDrillToProgramme(programmeId, payload);
      if (newDrills) {
        onDrillAdded(newDrills);
      }
    } catch {
      if (Platform.OS === 'web') {
        window.alert('Could not add drill');
      } else {
        Alert.alert('Error', 'Could not add drill');
      }
    } finally {
      setAdding(false);
    }
  }, [selectedDrill, programmeId, weekNumber, dayOfWeek, sets, reps, intensity, restSeconds, rpeTarget, durationMin, coachNotes, isMandatory, repeatWeeks, progression, onDrillAdded]);

  const progressionOptions: ProgressionType[] = ['none', 'load_5pct', 'load_10pct', 'reps_plus1', 'sets_plus1'];
  const progressionLabels: Record<ProgressionType, string> = {
    none: 'None',
    load_5pct: '+5% load',
    load_10pct: '+10% load',
    reps_plus1: '+1 rep',
    sets_plus1: '+1 set',
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={styles.modalOverlay}
    >
      <View style={[styles.pickerContainer, { backgroundColor: colors.surfaceElevated }]}>
        {/* Header */}
        <View style={styles.pickerHeader}>
          <Text style={[styles.pickerTitle, { color: colors.textOnDark }]}>
            {selectedDrill ? 'Set Prescription' : 'Choose Drill'}
          </Text>
          <Pressable onPress={onClose} hitSlop={12}>
            <SmartIcon name="close" size={24} color={colors.textSecondary} />
          </Pressable>
        </View>

        {!selectedDrill ? (
          /* ── Search + Results ─────────────────────────── */
          <>
            <View style={[styles.searchBar, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <SmartIcon name="search" size={18} color={colors.textInactive} />
              <TextInput
                style={[styles.searchInput, { color: colors.textOnDark }]}
                placeholder="Search drills..."
                placeholderTextColor={colors.textInactive}
                value={query}
                onChangeText={handleSearch}
                autoFocus
              />
            </View>
            {searchLoading ? (
              <Loader size="sm" style={{ marginTop: spacing.md }} />
            ) : (
              <FlatList
                data={results}
                keyExtractor={(d) => d.id}
                style={styles.searchResults}
                renderItem={({ item }) => {
                  const catColor = CAT_COLORS[item.category as keyof typeof CAT_COLORS] || colors.accent1;
                  return (
                    <Pressable
                      onPress={() => setSelectedDrill(item)}
                      style={({ pressed }) => [
                        styles.searchResultItem,
                        { backgroundColor: pressed ? colors.surface : 'transparent' },
                      ]}
                    >
                      <View style={[styles.searchResultDot, { backgroundColor: catColor }]} />
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.searchResultName, { color: colors.textOnDark }]}>
                          {item.name}
                        </Text>
                        <Text style={[styles.searchResultMeta, { color: colors.textInactive }]}>
                          {CAT_LABELS[item.category as keyof typeof CAT_LABELS] || item.category}
                          {item.duration_minutes ? ` · ${item.duration_minutes}min` : ''}
                          {item.difficulty_level ? ` · ${item.difficulty_level}` : ''}
                        </Text>
                      </View>
                      <SmartIcon name="chevron-forward" size={16} color={colors.textInactive} />
                    </Pressable>
                  );
                }}
                ListEmptyComponent={
                  <Text style={[styles.noResults, { color: colors.textInactive }]}>
                    No drills found
                  </Text>
                }
              />
            )}
          </>
        ) : (
          /* ── Prescription Form ────────────────────────── */
          <ScrollView style={styles.rxForm} contentContainerStyle={{ paddingBottom: spacing.xxl }}>
            <View style={[styles.selectedDrillBanner, { backgroundColor: colors.surface }]}>
              <Text style={[styles.selectedDrillName, { color: colors.textOnDark }]}>
                {selectedDrill.name}
              </Text>
              <Pressable onPress={() => setSelectedDrill(null)}>
                <Text style={[styles.changeDrillLink, { color: colors.accent1 }]}>Change</Text>
              </Pressable>
            </View>

            {/* Numeric inputs row */}
            <View style={styles.rxFormRow}>
              <RxInput label="Sets" value={sets} onChange={setSets} colors={colors} />
              <RxInput label="Reps" value={reps} onChange={setReps} colors={colors} />
              <RxInput label="RPE" value={rpeTarget} onChange={setRpeTarget} colors={colors} />
              <RxInput label="Rest (s)" value={restSeconds} onChange={setRestSeconds} colors={colors} />
            </View>

            <View style={styles.rxFormRow}>
              <RxInput label="Duration (min)" value={durationMin} onChange={setDurationMin} colors={colors} placeholder="Optional" />
              <RxInput label="Repeat Wks" value={repeatWeeks} onChange={setRepeatWeeks} colors={colors} />
            </View>

            {/* Intensity */}
            <Text style={[styles.rxFieldLabel, { color: colors.textSecondary }]}>Intensity</Text>
            <View style={styles.chipRow}>
              {['light', 'moderate', 'hard', 'max'].map((i) => (
                <Pressable
                  key={i}
                  onPress={() => setIntensity(i)}
                  style={[
                    styles.chip,
                    {
                      backgroundColor: intensity === i ? colors.accent1 + '22' : colors.surface,
                      borderColor: intensity === i ? colors.accent1 : colors.border,
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.chipText,
                      { color: intensity === i ? colors.accent1 : colors.textSecondary },
                    ]}
                  >
                    {i.charAt(0).toUpperCase() + i.slice(1)}
                  </Text>
                </Pressable>
              ))}
            </View>

            {/* Progression */}
            <Text style={[styles.rxFieldLabel, { color: colors.textSecondary }]}>Progression</Text>
            <View style={styles.chipRow}>
              {progressionOptions.map((p) => (
                <Pressable
                  key={p}
                  onPress={() => setProgression(p)}
                  style={[
                    styles.chip,
                    {
                      backgroundColor: progression === p ? colors.accent1 + '22' : colors.surface,
                      borderColor: progression === p ? colors.accent1 : colors.border,
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.chipText,
                      { color: progression === p ? colors.accent1 : colors.textSecondary },
                    ]}
                  >
                    {progressionLabels[p]}
                  </Text>
                </Pressable>
              ))}
            </View>

            {/* Mandatory toggle */}
            <Pressable
              onPress={() => setIsMandatory(!isMandatory)}
              style={styles.toggleRow}
            >
              <SmartIcon
                name={isMandatory ? 'checkbox' : 'square-outline'}
                size={22}
                color={isMandatory ? colors.accent1 : colors.textInactive}
              />
              <Text style={[styles.toggleLabel, { color: colors.textOnDark }]}>Mandatory</Text>
            </Pressable>

            {/* Coach notes */}
            <Text style={[styles.rxFieldLabel, { color: colors.textSecondary }]}>Coach Notes</Text>
            <TextInput
              style={[styles.input, styles.inputMulti, { color: colors.textOnDark, backgroundColor: colors.surface, borderColor: colors.border }]}
              placeholder="Optional notes for the player..."
              placeholderTextColor={colors.textInactive}
              value={coachNotes}
              onChangeText={setCoachNotes}
              multiline
            />

            {/* Add button */}
            <Pressable
              onPress={handleAdd}
              disabled={adding}
              style={[styles.addConfirmBtn, { backgroundColor: colors.accent1, opacity: adding ? 0.6 : 1 }]}
            >
              {adding ? (
                <Loader size="sm" />
              ) : (
                <Text style={[styles.addConfirmText, { color: colors.textOnDark }]}>
                  Add to Wk {weekNumber} · {DAYS[dayOfWeek]}
                </Text>
              )}
            </Pressable>
          </ScrollView>
        )}
      </View>
    </KeyboardAvoidingView>
  );
}

// ── Rx Form Input ─────────────────────────────────────────────

function RxInput({
  label,
  value,
  onChange,
  colors,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  colors: ThemeColors;
  placeholder?: string;
}) {
  return (
    <View style={styles.rxInputWrap}>
      <Text style={[styles.rxInputLabel, { color: colors.textInactive }]}>{label}</Text>
      <TextInput
        style={[styles.rxInputField, { color: colors.textOnDark, backgroundColor: colors.surface, borderColor: colors.border }]}
        value={value}
        onChangeText={onChange}
        keyboardType="default"
        placeholder={placeholder}
        placeholderTextColor={colors.textInactive}
      />
    </View>
  );
}

// ══════════════════════════════════════════════════════════════════
// Styles
// ══════════════════════════════════════════════════════════════════

const styles = StyleSheet.create({
  container: { flex: 1 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: spacing.md },

  // ── Header ────────────────
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: layout.screenMargin,
    paddingVertical: spacing.md,
  },
  headerTitle: { fontSize: 24, fontFamily: fontFamily.bold },
  createBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: spacing.compact,
    paddingVertical: 8,
    borderRadius: borderRadius.md,
  },
  createBtnText: { fontSize: 14, fontFamily: fontFamily.bold },

  // ── List ──────────────────
  listContent: { paddingHorizontal: layout.screenMargin, paddingBottom: spacing.xxl },
  emptyText: { fontSize: 16, fontFamily: fontFamily.semiBold },
  emptySubtext: { fontSize: 13 },
  progCard: {
    padding: spacing.md,
    borderRadius: borderRadius.lg,
    marginBottom: spacing.compact,
  },
  progCardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.sm },
  cycleBadge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    borderRadius: borderRadius.sm,
  },
  cycleBadgeText: { fontSize: 11, fontFamily: fontFamily.bold, textTransform: 'uppercase', letterSpacing: 0.5 },
  statusDot: { width: 8, height: 8, borderRadius: 4 },
  progName: { fontSize: 17, fontFamily: fontFamily.bold, marginBottom: 4 },
  progDesc: { fontSize: 13, lineHeight: 18, marginBottom: spacing.sm },
  progMeta: { flexDirection: 'row', justifyContent: 'space-between' },
  progMetaText: { fontSize: 12 },

  // ── Editor Header ─────────
  editorHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: layout.screenMargin,
    paddingVertical: spacing.compact,
    gap: spacing.compact,
  },
  editorHeaderCenter: { flex: 1 },
  editorTitle: { fontSize: 18, fontFamily: fontFamily.bold },
  editorSubRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: 2 },
  statusPill: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: borderRadius.sm,
  },
  statusPillText: { fontSize: 11, fontFamily: fontFamily.bold, textTransform: 'uppercase' },
  drillCountText: { fontSize: 12 },
  publishBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: spacing.compact,
    paddingVertical: 8,
    borderRadius: borderRadius.md,
  },
  publishBtnText: { fontSize: 13, fontFamily: fontFamily.bold },

  // ── Week Strip ────────────
  weekStrip: {
    paddingHorizontal: layout.screenMargin,
    paddingVertical: spacing.sm,
    gap: spacing.sm,
  },
  weekTab: {
    paddingHorizontal: spacing.compact,
    paddingVertical: 8,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    alignItems: 'center',
    minWidth: 56,
  },
  weekTabText: { fontSize: 13, fontFamily: fontFamily.semiBold },
  weekDrillCount: { fontSize: 10, marginTop: 2 },

  // ── Day Strip ─────────────
  dayStrip: {
    flexDirection: 'row',
    paddingHorizontal: layout.screenMargin,
    borderBottomWidth: 0.5,
    borderBottomColor: colors.creamSoft,
  },
  dayTab: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: spacing.sm,
    borderBottomWidth: 2,
  },
  dayTabText: { fontSize: 13, fontFamily: fontFamily.semiBold },
  dayDot: {
    width: 16,
    height: 16,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 3,
  },
  dayDotText: { fontSize: 9, fontFamily: fontFamily.bold },

  // ── Drill List ────────────
  drillList: { flex: 1 },
  drillListContent: { paddingHorizontal: layout.screenMargin, paddingVertical: spacing.md, paddingBottom: spacing.huge },
  emptyDay: { alignItems: 'center', justifyContent: 'center', paddingTop: spacing.xxxl, gap: spacing.sm },
  emptyDayText: { fontSize: 14 },

  drillCard: {
    flexDirection: 'row',
    borderRadius: borderRadius.md,
    marginBottom: spacing.compact,
    overflow: 'hidden',
  },
  drillCatBar: { width: 4 },
  drillCardBody: { flex: 1, padding: spacing.compact },
  drillCardTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  drillCardInfo: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flex: 1 },
  drillOrderBadge: { fontSize: 11, fontFamily: fontFamily.bold },
  drillName: { fontSize: 14, fontFamily: fontFamily.semiBold, flex: 1 },

  rxRow: { flexDirection: 'row', gap: spacing.xs, marginTop: spacing.sm, flexWrap: 'wrap' },
  rxPill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: borderRadius.sm,
    alignItems: 'center',
  },
  rxLabel: { fontSize: 9, fontFamily: fontFamily.semiBold, textTransform: 'uppercase' },
  rxValue: { fontSize: 13, fontFamily: fontFamily.bold },

  tagRow: { flexDirection: 'row', gap: spacing.xs, marginTop: spacing.sm, flexWrap: 'wrap' },
  catPill: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: borderRadius.sm },
  catPillText: { fontSize: 10, fontFamily: fontFamily.bold },
  mandatoryBadge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: borderRadius.sm },
  mandatoryText: { fontSize: 10, fontFamily: fontFamily.bold },
  progressionBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: borderRadius.sm,
  },
  progressionText: { fontSize: 10, fontFamily: fontFamily.semiBold },
  coachNotes: { fontSize: 12, fontStyle: 'italic', marginTop: spacing.xs },

  addDrillBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.compact,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderRadius: borderRadius.md,
    marginTop: spacing.sm,
  },
  addDrillText: { fontSize: 14, fontFamily: fontFamily.semiBold },

  // ── Modal / Picker ────────
  modalOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  modalContent: {
    borderTopLeftRadius: borderRadius.xl,
    borderTopRightRadius: borderRadius.xl,
    padding: layout.cardPadding,
    paddingBottom: spacing.xxxl,
  },
  modalTitle: { fontSize: 20, fontFamily: fontFamily.bold, marginBottom: spacing.md },
  modalActions: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.lg },
  modalBtn: {
    flex: 1,
    paddingVertical: spacing.compact,
    borderRadius: borderRadius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalBtnText: { fontSize: 15, fontFamily: fontFamily.bold },

  // ── Form Fields ───────────
  fieldLabel: { fontSize: 12, fontFamily: fontFamily.semiBold, textTransform: 'uppercase', letterSpacing: 0.5, marginTop: spacing.md, marginBottom: spacing.xs },
  input: {
    borderWidth: 1,
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.compact,
    paddingVertical: 10,
    fontSize: 15,
  },
  inputMulti: { minHeight: 64, textAlignVertical: 'top' },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  chip: {
    paddingHorizontal: spacing.compact,
    paddingVertical: 6,
    borderRadius: borderRadius.md,
    borderWidth: 1,
  },
  chipText: { fontSize: 13, fontFamily: fontFamily.semiBold },
  weeksPicker: { flexDirection: 'row', gap: spacing.sm },
  weekBtn: {
    width: 44,
    height: 44,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  weekBtnText: { fontSize: 15, fontFamily: fontFamily.bold },

  // ── Drill Picker ──────────
  pickerContainer: {
    borderTopLeftRadius: borderRadius.xl,
    borderTopRightRadius: borderRadius.xl,
    maxHeight: '85%',
    padding: layout.cardPadding,
  },
  pickerHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  pickerTitle: { fontSize: 20, fontFamily: fontFamily.bold },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.compact,
    borderWidth: 1,
    borderRadius: borderRadius.md,
    height: 44,
  },
  searchInput: { flex: 1, fontSize: 15 },
  searchResults: { marginTop: spacing.sm },
  searchResultItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.compact,
    paddingHorizontal: spacing.sm,
    gap: spacing.compact,
    borderRadius: borderRadius.sm,
  },
  searchResultDot: { width: 6, height: 6, borderRadius: 3 },
  searchResultName: { fontSize: 14, fontFamily: fontFamily.semiBold },
  searchResultMeta: { fontSize: 12, marginTop: 1 },
  noResults: { textAlign: 'center', marginTop: spacing.xl, fontSize: 14 },

  // ── Rx Form ───────────────
  rxForm: { marginTop: spacing.sm },
  selectedDrillBanner: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: spacing.compact,
    borderRadius: borderRadius.md,
    marginBottom: spacing.md,
  },
  selectedDrillName: { fontSize: 15, fontFamily: fontFamily.bold, flex: 1 },
  changeDrillLink: { fontSize: 13, fontFamily: fontFamily.semiBold },
  rxFormRow: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.sm },
  rxInputWrap: { flex: 1 },
  rxInputLabel: { fontSize: 11, fontFamily: fontFamily.semiBold, textTransform: 'uppercase', marginBottom: 4 },
  rxInputField: {
    borderWidth: 1,
    borderRadius: borderRadius.sm,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 15,
    fontFamily: fontFamily.semiBold,
    textAlign: 'center',
  },
  rxFieldLabel: { fontSize: 12, fontFamily: fontFamily.semiBold, textTransform: 'uppercase', letterSpacing: 0.5, marginTop: spacing.compact, marginBottom: spacing.xs },
  toggleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.compact },
  toggleLabel: { fontSize: 14, fontFamily: fontFamily.semiBold },
  addConfirmBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.compact,
    borderRadius: borderRadius.md,
    marginTop: spacing.lg,
  },
  addConfirmText: { fontSize: 15, fontFamily: fontFamily.bold },
});
