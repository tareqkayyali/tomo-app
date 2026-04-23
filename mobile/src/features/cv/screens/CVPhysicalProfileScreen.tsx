/**
 * CVPhysicalProfileScreen — mock 04.
 * Benchmarks vs U19 + Strength Zones + Development Focus.
 */

import React from "react";
import { View, Text, Pressable, StyleSheet, ActivityIndicator } from "react-native";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useTheme } from "../../../hooks/useTheme";
import { useAuth } from "../../../hooks/useAuth";
import { useCVProfile } from "../../../hooks/useCVProfile";
import type { CVBenchmarkRow } from "../../../hooks/useCVProfile";
import type { MainStackParamList } from "../../../navigation/types";
import { fontFamily } from "../../../theme";
import { SmartIcon } from "../../../components/SmartIcon";
import { CVScreen } from "../components/CVScreen";
import { InfoCard, PercentileBar, EmptyState } from "../components/primitives";

export default function CVPhysicalProfileScreen() {
  const nav = useNavigation<NativeStackNavigationProp<MainStackParamList>>();
  const { colors } = useTheme();
  const { user } = useAuth();
  const { data, isLoading } = useCVProfile(user?.uid ?? "");

  if (isLoading || !data) {
    return (
      <CVScreen label="Physical Profile" onBack={() => nav.goBack()}>
        <ActivityIndicator color={colors.accent} style={{ marginTop: 64 }} />
      </CVScreen>
    );
  }

  const vp = data.verified_performance;
  const ageGroup = data.identity.age_group ?? "U19";

  if (vp.benchmarks.length === 0) {
    return (
      <CVScreen label="Physical Profile" onBack={() => nav.goBack()}>
        <EmptyState
          icon="pulse-outline"
          title="No tests logged yet"
          description="Run a phone test or log a manual benchmark to start building your physical profile."
          cta="Run a test"
          onCtaPress={() => nav.navigate("PhoneTestsList")}
        />
      </CVScreen>
    );
  }

  return (
    <CVScreen label="Physical Profile" onBack={() => nav.goBack()}>
      <InfoCard
        overline={`Benchmarked vs ${ageGroup} ${capitalize(data.identity.sport)}`}
        badge={{ label: "Auto", tone: "auto" }}
      >
        <Text style={[styles.subline, { color: colors.muted }]}>
          All data verified by tomo · {vp.benchmarks.length} of 6 tests
        </Text>
        {vp.benchmarks.map((b) => (
          <PercentileBar
            key={b.metric_key}
            label={b.metric_label}
            value={b.value}
            unit={b.unit}
            percentile={b.percentile}
            rankHint={
              b.direction === "lower_is_better"
                ? `vs ${ageGroup} · lower is better`
                : `vs ${ageGroup} · higher is better`
            }
          />
        ))}
      </InfoCard>

      {vp.strength_zones.length > 0 ? (
        <InfoCard
          overline="Strength Zones"
          badge={{ label: `${vp.strength_zones.length} elite`, tone: "done" }}
        >
          {vp.strength_zones.map((b, i) => (
            <BenchmarkPill key={b.metric_key} bench={b} divider={i > 0} />
          ))}
        </InfoCard>
      ) : null}

      {vp.development_focus.length > 0 ? (
        <InfoCard
          overline="Development Focus"
          badge={{ label: `${vp.development_focus.length} priority`, tone: "draft" }}
        >
          <Text style={[styles.subline, { color: colors.muted }]}>
            Ordered by impact on your overall profile
          </Text>
          {vp.development_focus.map((b, i) => (
            <BenchmarkPill key={b.metric_key} bench={b} divider={i > 0} />
          ))}
        </InfoCard>
      ) : null}

      <Pressable
        onPress={() => nav.navigate("PhoneTestsList")}
        style={({ pressed }) => [
          styles.testHistoryBtn,
          { borderColor: colors.cream10, backgroundColor: pressed ? colors.cream06 : "transparent" },
        ]}
      >
        <Text style={[styles.testHistoryText, { color: colors.muted }]}>TEST HISTORY</Text>
        <SmartIcon name="chevron-forward" size={14} color={colors.muted} />
      </Pressable>
    </CVScreen>
  );
}

function BenchmarkPill({ bench, divider }: { bench: CVBenchmarkRow; divider: boolean }) {
  const { colors } = useTheme();
  return (
    <View
      style={[
        styles.benchRow,
        divider ? { borderTopColor: colors.cream10, borderTopWidth: StyleSheet.hairlineWidth } : null,
      ]}
    >
      <View style={{ flex: 1 }}>
        <Text style={[styles.benchLabel, { color: colors.tomoCream }]}>{bench.metric_label}</Text>
        <Text style={[styles.benchSub, { color: colors.muted }]}>
          {bench.value} {bench.unit}
        </Text>
      </View>
      <Text style={[styles.benchRank, { color: colors.accent }]}>
        {Math.round(bench.percentile)}
        <Text style={[styles.benchRankSuffix, { color: colors.muted }]}>th</Text>
      </Text>
    </View>
  );
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

const styles = StyleSheet.create({
  subline: {
    fontFamily: fontFamily.regular,
    fontSize: 11,
    marginBottom: 8,
    marginTop: -4,
  },
  benchRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
  },
  benchLabel: {
    fontFamily: fontFamily.medium,
    fontSize: 13,
    marginBottom: 2,
  },
  benchSub: {
    fontFamily: fontFamily.regular,
    fontSize: 11,
  },
  benchRank: {
    fontFamily: fontFamily.semiBold,
    fontSize: 16,
  },
  benchRankSuffix: {
    fontFamily: fontFamily.regular,
    fontSize: 10,
  },
  testHistoryBtn: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 6,
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 1,
  },
  testHistoryText: {
    fontFamily: fontFamily.medium,
    fontSize: 10,
    letterSpacing: 1.5,
  },
});
