/**
 * CVCareerHistoryScreen — mock 07.
 * Career entries grouped by type (Clubs / Academies / National).
 * Empty state with "What to add" examples + CV Impact stamp.
 */

import React, { useMemo } from "react";
import { View, Text, Pressable, StyleSheet, Platform, Alert, Modal, TextInput, Switch } from "react-native";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useTheme } from "../../../hooks/useTheme";
import { useAuth } from "../../../hooks/useAuth";
import { useCVProfile } from "../../../hooks/useCVProfile";
import type { CVCareerEntry } from "../../../hooks/useCVProfile";
import type { MainStackParamList } from "../../../navigation/types";
import { fontFamily } from "../../../theme";
import { SmartIcon } from "../../../components/SmartIcon";
import { CVScreen } from "../components/CVScreen";
import { InfoCard, EmptyState } from "../components/primitives";
import { Loader } from "../../../components/Loader";

const TYPE_ORDER: Array<{
  key: CVCareerEntry["entry_type"];
  label: string;
  example: { name: string; detail: string };
}> = [
  { key: "club",          label: "Clubs",      example: { name: "From your first academy to your current team", detail: "Al-Wehdat U17 · 2024—present" } },
  { key: "academy",       label: "Academies",  example: { name: "Development centres and talent programmes", detail: "Jordan FA Talent Centre · 2022—2024" } },
  { key: "national_team", label: "National",   example: { name: "Representative honours — U15, U17, U19 squads", detail: "Jordan U17 · 3 caps" } },
];

export default function CVCareerHistoryScreen() {
  const nav = useNavigation<NativeStackNavigationProp<MainStackParamList>>();
  const { colors } = useTheme();
  const { user } = useAuth();
  const { data, isLoading, addCareer, updateCareer, deleteCareer } = useCVProfile(user?.uid ?? "");
  const [editorOpen, setEditorOpen] = React.useState(false);
  const [editingId, setEditingId] = React.useState<string | null>(null);
  const [entryType, setEntryType] = React.useState<CVCareerEntry["entry_type"]>("club");
  const [clubName, setClubName] = React.useState("");
  const [leagueLevel, setLeagueLevel] = React.useState("");
  const [country, setCountry] = React.useState("");
  const [position, setPosition] = React.useState("");
  const [startedMonth, setStartedMonth] = React.useState("");
  const [endedMonth, setEndedMonth] = React.useState("");
  const [isCurrent, setIsCurrent] = React.useState(false);

  const grouped = useMemo(() => {
    const result: Record<string, CVCareerEntry[]> = {};
    for (const e of data?.career ?? []) {
      (result[e.entry_type] = result[e.entry_type] ?? []).push(e);
    }
    return result;
  }, [data?.career]);

  if (isLoading || !data) {
    return (
      <CVScreen label="Career History" onBack={() => nav.goBack()}>
        <Loader style={{ marginTop: 64 }} />
      </CVScreen>
    );
  }

  const hasAny = data.career.length > 0;

  const resetEditor = React.useCallback(() => {
    setEditingId(null);
    setEntryType("club");
    setClubName("");
    setLeagueLevel("");
    setCountry("");
    setPosition("");
    setStartedMonth("");
    setEndedMonth("");
    setIsCurrent(false);
  }, []);

  const openCreate = React.useCallback(() => {
    resetEditor();
    setEditorOpen(true);
  }, [resetEditor]);

  const openEdit = React.useCallback((entry: CVCareerEntry) => {
    setEditingId(entry.id);
    setEntryType(entry.entry_type);
    setClubName(entry.club_name ?? "");
    setLeagueLevel(entry.league_level ?? "");
    setCountry(entry.country ?? "");
    setPosition(entry.position ?? "");
    setStartedMonth(entry.started_month ?? "");
    setEndedMonth(entry.ended_month ?? "");
    setIsCurrent(entry.is_current);
    setEditorOpen(true);
  }, []);

  const saveEntry = React.useCallback(async () => {
    const name = clubName.trim();
    if (!name) {
      if (Platform.OS === "web") console.warn("Career entry requires team name");
      else Alert.alert("Career", "Please add the team or academy name.");
      return;
    }
    const payload = {
      entry_type: entryType,
      club_name: name,
      league_level: leagueLevel.trim() || null,
      country: country.trim() || null,
      position: position.trim() || null,
      started_month: startedMonth.trim() || null,
      ended_month: isCurrent ? null : endedMonth.trim() || null,
      is_current: isCurrent,
      appearances: null,
      goals: null,
      assists: null,
      clean_sheets: null,
      achievements: [],
      injury_note: null,
    };
    if (editingId) await updateCareer(editingId, payload);
    else await addCareer(payload as any);
    setEditorOpen(false);
    resetEditor();
  }, [
    clubName,
    country,
    editingId,
    endedMonth,
    entryType,
    isCurrent,
    leagueLevel,
    position,
    startedMonth,
    updateCareer,
    addCareer,
    resetEditor,
  ]);

  const footer = (
    <View style={{ padding: 16, paddingBottom: 32, backgroundColor: colors.background }}>
      <Pressable
        onPress={openCreate}
        style={({ pressed }) => [
          styles.footerBtn,
          { backgroundColor: pressed ? colors.sage15 : colors.sage08, borderColor: colors.sage30 },
        ]}
      >
        <SmartIcon name="add-outline" size={14} color={colors.accent} />
        <Text style={[styles.footerText, { color: colors.accent }]}>ADD CLUB OR ACADEMY</Text>
      </Pressable>
    </View>
  );

  return (
    <CVScreen label="Career History" onBack={() => nav.goBack()} footer={footer}>
      <InfoCard
        overline="Your Path"
        badge={{ label: hasAny ? `${data.career.length} entries` : "Empty", tone: hasAny ? "done" : "empty" }}
      >
        {hasAny ? (
          TYPE_ORDER.map(({ key, label }) => {
            const entries = grouped[key] ?? [];
            if (entries.length === 0) return null;
            return (
              <View key={key} style={styles.group}>
                <Text style={[styles.groupLabel, { color: colors.muted }]}>
                  {label.toUpperCase()}
                </Text>
                {entries.map((e) => (
                  <CareerRow
                    key={e.id}
                    entry={e}
                    onEdit={() => openEdit(e)}
                    onDelete={async () => {
                      if (Platform.OS === "web") {
                        const ok = globalThis.confirm?.(`Delete "${e.club_name}"?`) ?? false;
                        if (!ok) return;
                      } else {
                        const ok = await new Promise<boolean>((resolve) => {
                          Alert.alert("Delete entry", `Remove "${e.club_name}" from career history?`, [
                            { text: "Cancel", style: "cancel", onPress: () => resolve(false) },
                            { text: "Delete", style: "destructive", onPress: () => resolve(true) },
                          ]);
                        });
                        if (!ok) return;
                      }
                      await deleteCareer(e.id);
                    }}
                  />
                ))}
              </View>
            );
          })
        ) : (
          <EmptyState
            icon="time-outline"
            title="No career entries yet"
            description="Add clubs, academies or national-team duties to show your path. Clubs want to see progression."
          />
        )}
      </InfoCard>

      {!hasAny ? (
        <InfoCard overline="What to add" badge={{ label: "3 types", tone: "neutral" }}>
          {TYPE_ORDER.map((t, i) => (
            <View
              key={t.key}
              style={[
                styles.exampleRow,
                i > 0 ? { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.cream10 } : null,
              ]}
            >
              <View style={{ flex: 1 }}>
                <View style={styles.exampleHeader}>
                  <Text style={[styles.exampleTitle, { color: colors.tomoCream }]}>{t.label}</Text>
                  <Text style={[styles.exampleTag, { color: colors.muted }]}>EXAMPLE</Text>
                </View>
                <Text style={[styles.exampleDesc, { color: colors.muted }]}>{t.example.name}</Text>
                <Text style={[styles.exampleDetail, { color: colors.body }]}>
                  {t.example.detail}
                </Text>
              </View>
            </View>
          ))}
        </InfoCard>
      ) : null}

      <View style={[styles.impactCard, { backgroundColor: colors.sage08, borderColor: colors.sage30 }]}>
        <Text style={[styles.impactOverline, { color: colors.accent }]}>CV IMPACT</Text>
        <Text style={[styles.impactText, { color: colors.accent }]}>
          Adding your career is the single fastest way to raise your CV completeness and the #1 thing recruiters check.
        </Text>
        <View style={[styles.impactChip, { backgroundColor: colors.sage15, borderColor: colors.sage30 }]}>
          <Text style={[styles.impactPct, { color: colors.accent }]}>+12%</Text>
        </View>
      </View>

      <Modal visible={editorOpen} transparent animationType="fade" onRequestClose={() => setEditorOpen(false)}>
        <View style={styles.modalBackdrop}>
          <View style={[styles.modalCard, { backgroundColor: colors.background, borderColor: colors.cream10 }]}>
            <Text style={[styles.modalTitle, { color: colors.tomoCream }]}>
              {editingId ? "Edit career entry" : "Add career entry"}
            </Text>
            <View style={styles.typeRow}>
              {TYPE_ORDER.map((t) => (
                <Pressable
                  key={t.key}
                  onPress={() => setEntryType(t.key)}
                  style={({ pressed }) => [
                    styles.typePill,
                    {
                      borderColor: entryType === t.key ? colors.sage30 : colors.cream10,
                      backgroundColor:
                        entryType === t.key ? colors.sage15 : pressed ? colors.cream06 : colors.cream03,
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.typePillText,
                      { color: entryType === t.key ? colors.accent : colors.muted },
                    ]}
                  >
                    {t.label}
                  </Text>
                </Pressable>
              ))}
            </View>
            <TextInput
              value={clubName}
              onChangeText={setClubName}
              placeholder="Team / academy name"
              placeholderTextColor={colors.muted}
              style={[styles.input, { borderColor: colors.cream10, color: colors.tomoCream }]}
            />
            <TextInput
              value={leagueLevel}
              onChangeText={setLeagueLevel}
              placeholder="League level (optional)"
              placeholderTextColor={colors.muted}
              style={[styles.input, { borderColor: colors.cream10, color: colors.tomoCream }]}
            />
            <TextInput
              value={country}
              onChangeText={setCountry}
              placeholder="Country (optional)"
              placeholderTextColor={colors.muted}
              style={[styles.input, { borderColor: colors.cream10, color: colors.tomoCream }]}
            />
            <TextInput
              value={position}
              onChangeText={setPosition}
              placeholder="Position (optional)"
              placeholderTextColor={colors.muted}
              style={[styles.input, { borderColor: colors.cream10, color: colors.tomoCream }]}
            />
            <View style={styles.monthRow}>
              <TextInput
                value={startedMonth}
                onChangeText={setStartedMonth}
                placeholder="Start (YYYY-MM)"
                placeholderTextColor={colors.muted}
                style={[styles.input, styles.monthInput, { borderColor: colors.cream10, color: colors.tomoCream }]}
              />
              <TextInput
                value={endedMonth}
                onChangeText={setEndedMonth}
                editable={!isCurrent}
                placeholder={isCurrent ? "Current" : "End (YYYY-MM)"}
                placeholderTextColor={colors.muted}
                style={[styles.input, styles.monthInput, { borderColor: colors.cream10, color: colors.tomoCream, opacity: isCurrent ? 0.6 : 1 }]}
              />
            </View>
            <View style={styles.currentRow}>
              <Text style={[styles.currentLabel, { color: colors.tomoCream }]}>I currently play here</Text>
              <Switch value={isCurrent} onValueChange={setIsCurrent} />
            </View>
            <View style={styles.modalActions}>
              <Pressable
                onPress={() => {
                  setEditorOpen(false);
                  resetEditor();
                }}
                style={({ pressed }) => [
                  styles.modalBtn,
                  { borderColor: colors.cream10, backgroundColor: pressed ? colors.cream06 : "transparent" },
                ]}
              >
                <Text style={[styles.modalBtnText, { color: colors.muted }]}>Cancel</Text>
              </Pressable>
              <Pressable
                onPress={saveEntry}
                style={({ pressed }) => [
                  styles.modalBtn,
                  { borderColor: colors.sage30, backgroundColor: pressed ? colors.sage15 : colors.sage08 },
                ]}
              >
                <Text style={[styles.modalBtnText, { color: colors.accent }]}>
                  {editingId ? "Save changes" : "Add entry"}
                </Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </CVScreen>
  );
}

function CareerRow({
  entry,
  onEdit,
  onDelete,
}: {
  entry: CVCareerEntry;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const { colors } = useTheme();
  const period = [entry.started_month, entry.is_current ? "present" : entry.ended_month]
    .filter(Boolean)
    .join("—");

  return (
    <View style={[styles.entryRow, { borderTopColor: colors.cream10 }]}>
      <View style={{ flex: 1 }}>
        <View style={styles.entryHeader}>
          <Text style={[styles.entryClub, { color: colors.tomoCream }]} numberOfLines={1}>
            {entry.club_name}
          </Text>
          {entry.is_current ? (
            <View style={[styles.currentPill, { backgroundColor: colors.sage15, borderColor: colors.sage30 }]}>
              <Text style={[styles.currentText, { color: colors.accent }]}>CURRENT</Text>
            </View>
          ) : null}
        </View>
        <Text style={[styles.entryMeta, { color: colors.muted }]}>
          {[entry.league_level, entry.country, period].filter(Boolean).join(" · ")}
        </Text>
        {entry.appearances != null || entry.goals != null || entry.assists != null ? (
          <Text style={[styles.entryStats, { color: colors.body }]}>
            {[
              entry.appearances != null ? `${entry.appearances} apps` : null,
              entry.goals != null ? `${entry.goals}g` : null,
              entry.assists != null ? `${entry.assists}a` : null,
              entry.clean_sheets != null ? `${entry.clean_sheets} cs` : null,
            ]
              .filter(Boolean)
              .join(" · ")}
          </Text>
        ) : null}
      </View>
      <View style={styles.entryActions}>
        <Pressable onPress={onEdit} style={styles.entryActionBtn}>
          <SmartIcon name="create-outline" size={15} color={colors.muted} />
        </Pressable>
        <Pressable onPress={onDelete} style={styles.entryActionBtn}>
          <SmartIcon name="trash-outline" size={15} color={colors.muted} />
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  group: {
    marginTop: 8,
  },
  groupLabel: {
    fontFamily: fontFamily.medium,
    fontSize: 9,
    letterSpacing: 1.4,
    marginTop: 8,
    marginBottom: 2,
  },
  entryRow: {
    paddingVertical: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    gap: 8,
    alignItems: "center",
  },
  entryHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  entryClub: {
    flex: 1,
    fontFamily: fontFamily.semiBold,
    fontSize: 13,
  },
  currentPill: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    borderWidth: 1,
  },
  currentText: {
    fontFamily: fontFamily.medium,
    fontSize: 8,
    letterSpacing: 1,
  },
  entryMeta: {
    fontFamily: fontFamily.regular,
    fontSize: 11,
    marginTop: 2,
  },
  entryStats: {
    fontFamily: fontFamily.medium,
    fontSize: 11,
    marginTop: 4,
  },
  entryActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  entryActionBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  exampleRow: {
    paddingVertical: 12,
  },
  exampleHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 4,
  },
  exampleTitle: {
    fontFamily: fontFamily.semiBold,
    fontSize: 13,
  },
  exampleTag: {
    fontFamily: fontFamily.medium,
    fontSize: 9,
    letterSpacing: 1,
  },
  exampleDesc: {
    fontFamily: fontFamily.regular,
    fontSize: 11,
    lineHeight: 16,
  },
  exampleDetail: {
    fontFamily: fontFamily.medium,
    fontStyle: "italic",
    fontSize: 11,
    marginTop: 4,
  },
  impactCard: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 16,
    position: "relative",
    paddingRight: 64,
  },
  impactOverline: {
    fontFamily: fontFamily.medium,
    fontSize: 9,
    letterSpacing: 1.5,
    marginBottom: 8,
  },
  impactText: {
    fontFamily: fontFamily.regular,
    fontSize: 12,
    lineHeight: 17,
  },
  impactChip: {
    position: "absolute",
    top: 14,
    right: 14,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
  },
  impactPct: {
    fontFamily: fontFamily.semiBold,
    fontSize: 12,
  },
  footerBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 1,
  },
  footerText: {
    fontFamily: fontFamily.medium,
    fontSize: 12,
    letterSpacing: 1.2,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.45)",
    justifyContent: "center",
    paddingHorizontal: 18,
  },
  modalCard: {
    borderWidth: 1,
    borderRadius: 14,
    padding: 14,
    gap: 8,
  },
  modalTitle: {
    fontFamily: fontFamily.semiBold,
    fontSize: 16,
  },
  typeRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
  },
  typePill: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  typePillText: {
    fontFamily: fontFamily.medium,
    fontSize: 11,
  },
  input: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 9,
    fontFamily: fontFamily.regular,
    fontSize: 12,
  },
  monthRow: {
    flexDirection: "row",
    gap: 8,
  },
  monthInput: {
    flex: 1,
  },
  currentRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 2,
  },
  currentLabel: {
    fontFamily: fontFamily.regular,
    fontSize: 12,
  },
  modalActions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 8,
    marginTop: 4,
  },
  modalBtn: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  modalBtnText: {
    fontFamily: fontFamily.medium,
    fontSize: 12,
  },
});
