/**
 * CVCareerHistoryScreen — mock 07.
 * Career entries grouped by type (Clubs / Academies / National).
 * Empty state with "What to add" examples + CV Impact stamp.
 */

import React, { useMemo } from "react";
import { View, Text, Pressable, StyleSheet, Platform, Alert } from "react-native";
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
  const { data, isLoading } = useCVProfile(user?.uid ?? "");

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

  const footer = (
    <View style={{ padding: 16, paddingBottom: 32, backgroundColor: colors.background }}>
      <Pressable
        onPress={() => {
          if (Platform.OS === "web") console.warn("Career edit flow — coming in follow-up");
          else Alert.alert("Career", "Career editor coming next.");
        }}
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
                  <CareerRow key={e.id} entry={e} />
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
    </CVScreen>
  );
}

function CareerRow({ entry }: { entry: CVCareerEntry }) {
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
});
