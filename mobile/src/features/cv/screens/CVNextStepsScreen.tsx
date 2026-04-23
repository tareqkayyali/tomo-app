/**
 * CVNextStepsScreen — mock 12.
 * Roadmap hero (51% → 96%) + 5 ordered steps + "Or let tomo do it" card.
 */

import React from "react";
import { View, Text, Pressable, StyleSheet, Platform, Alert } from "react-native";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useTheme } from "../../../hooks/useTheme";
import { useAuth } from "../../../hooks/useAuth";
import { useCVProfile } from "../../../hooks/useCVProfile";
import type { CVNextStep } from "../../../hooks/useCVProfile";
import type { MainStackParamList } from "../../../navigation/types";
import { fontFamily } from "../../../theme";
import { SmartIcon } from "../../../components/SmartIcon";
import { CVScreen } from "../components/CVScreen";
import { InfoCard } from "../components/primitives";
import { Loader } from "../../../components/Loader";

const ROUTE_MAP: Record<CVNextStep["target_section"], keyof MainStackParamList> = {
  playing_positions:    "CVPlayingPositions",
  career_history:       "CVCareerHistory",
  video_media:          "CVVideoMedia",
  references:           "CVReferences",
  awards_character:     "CVAwardsCharacter",
  player_profile:       "CVPlayerProfile",
  health_status:        "CVHealthStatus",
};

export default function CVNextStepsScreen() {
  const nav = useNavigation<NativeStackNavigationProp<MainStackParamList>>();
  const { colors } = useTheme();
  const { user } = useAuth();
  const { data, isLoading } = useCVProfile(user?.uid ?? "");

  if (isLoading || !data) {
    return (
      <CVScreen label="Next Steps" onBack={() => nav.goBack()}>
        <Loader style={{ marginTop: 64 }} />
      </CVScreen>
    );
  }

  const currentPct = data.completeness_pct;
  const totalGain = data.next_steps.reduce((s, step) => s + step.impact_pct, 0);
  const projectedPct = Math.min(100, currentPct + totalGain);
  const totalMinutes = data.next_steps.reduce((s, step) => s + step.estimated_minutes, 0);

  return (
    <CVScreen label="Next Steps" onBack={() => nav.goBack()}>
      <View style={[styles.heroCard, { backgroundColor: colors.cream03, borderColor: colors.cream10 }]}>
        <View style={styles.heroHeader}>
          <Text style={[styles.heroOverline, { color: colors.muted }]}>YOUR PATH TO 100%</Text>
          <View style={[styles.roadmapChip, { backgroundColor: colors.sage08, borderColor: colors.sage30 }]}>
            <Text style={[styles.roadmapText, { color: colors.accent }]}>ROADMAP</Text>
          </View>
        </View>
        <View style={styles.heroValueRow}>
          <Text style={[styles.heroCurrent, { color: colors.tomoCream }]}>{currentPct}%</Text>
          <SmartIcon name="arrow-forward-outline" size={22} color={colors.muted} />
          <Text style={[styles.heroProjected, { color: colors.accent }]}>{projectedPct}%</Text>
        </View>
        <Text style={[styles.heroSub, { color: colors.muted }]}>
          {data.next_steps.length} improvements · {totalGain}% total gain · under {totalMinutes} minutes total
        </Text>
        <View style={[styles.progressTrack, { backgroundColor: colors.cream06 }]}>
          <View
            style={[styles.progressCurrent, { width: `${currentPct}%`, backgroundColor: colors.accent }]}
          />
          <View
            style={[
              styles.progressProjected,
              {
                left: `${currentPct}%`,
                width: `${Math.max(0, projectedPct - currentPct)}%`,
                borderColor: colors.sage30,
              },
            ]}
          />
        </View>
      </View>

      <InfoCard
        overline={`${data.next_steps.length} Steps`}
        badge={{ label: "Ordered by impact", tone: "done" }}
      >
        {data.next_steps.length === 0 ? (
          <Text style={[styles.emptyText, { color: colors.muted }]}>
            Your CV is complete. Nothing left to add right now.
          </Text>
        ) : (
          data.next_steps.map((step, i) => (
            <Pressable
              key={step.key}
              onPress={() => nav.navigate(ROUTE_MAP[step.target_section] as any)}
              style={({ pressed }) => [
                styles.stepRow,
                {
                  backgroundColor: pressed ? colors.cream06 : "transparent",
                  borderTopColor: colors.cream10,
                  borderTopWidth: i > 0 ? StyleSheet.hairlineWidth : 0,
                },
              ]}
            >
              <View style={[styles.stepNumBubble, { borderColor: colors.cream20 }]}>
                <Text style={[styles.stepNumBubbleText, { color: colors.muted }]}>{i + 1}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.stepTitle, { color: colors.tomoCream }]}>{step.title}</Text>
                <Text style={[styles.stepSubtitle, { color: colors.muted }]}>{step.subtitle}</Text>
              </View>
              <Text style={[styles.stepImpact, { color: colors.accent }]}>+{step.impact_pct}%</Text>
              <SmartIcon name="chevron-forward" size={14} color={colors.muted} />
            </Pressable>
          ))
        )}
      </InfoCard>

      <View style={[styles.autopilotCard, { backgroundColor: colors.sage08, borderColor: colors.sage30 }]}>
        <View style={styles.autopilotHeader}>
          <Text style={[styles.autopilotOverline, { color: colors.accent }]}>OR LET TOMO DO IT</Text>
          <View style={[styles.aiPill, { backgroundColor: colors.sage30 }]}>
            <Text style={[styles.aiPillText, { color: colors.accent }]}>AI</Text>
          </View>
        </View>
        <Text style={[styles.autopilotText, { color: colors.accent }]}>
          Connect your coach or import a CSV — we'll fill career, references, and media in one shot.
        </Text>
        <View style={styles.autopilotBtnRow}>
          <Pressable
            onPress={() => {
              if (Platform.OS !== "web") Alert.alert("Connect coach", "Coming soon.");
            }}
            style={({ pressed }) => [
              styles.autopilotBtn,
              {
                backgroundColor: pressed ? colors.sage15 : colors.cream06,
                borderColor: colors.sage30,
              },
            ]}
          >
            <SmartIcon name="people-outline" size={13} color={colors.accent} />
            <Text style={[styles.autopilotBtnText, { color: colors.accent }]}>Connect coach</Text>
          </Pressable>
          <Pressable
            onPress={() => {
              if (Platform.OS !== "web") Alert.alert("Import CSV", "Coming soon.");
            }}
            style={({ pressed }) => [
              styles.autopilotBtn,
              {
                backgroundColor: pressed ? colors.sage15 : colors.cream06,
                borderColor: colors.sage30,
              },
            ]}
          >
            <SmartIcon name="document-outline" size={13} color={colors.accent} />
            <Text style={[styles.autopilotBtnText, { color: colors.accent }]}>Import CSV</Text>
          </Pressable>
        </View>
      </View>
    </CVScreen>
  );
}

const styles = StyleSheet.create({
  heroCard: {
    borderRadius: 18,
    borderWidth: 1,
    padding: 16,
  },
  heroHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  heroOverline: {
    fontFamily: fontFamily.medium,
    fontSize: 9,
    letterSpacing: 1.5,
  },
  roadmapChip: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 5,
    borderWidth: 1,
  },
  roadmapText: {
    fontFamily: fontFamily.medium,
    fontSize: 9,
    letterSpacing: 1,
  },
  heroValueRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 6,
  },
  heroCurrent: {
    fontFamily: fontFamily.semiBold,
    fontSize: 32,
    letterSpacing: -0.8,
  },
  heroProjected: {
    fontFamily: fontFamily.semiBold,
    fontSize: 32,
    letterSpacing: -0.8,
  },
  heroSub: {
    fontFamily: fontFamily.regular,
    fontSize: 11,
    marginBottom: 10,
  },
  progressTrack: {
    height: 6,
    borderRadius: 3,
    position: "relative",
    overflow: "visible",
  },
  progressCurrent: {
    position: "absolute",
    top: 0,
    bottom: 0,
    left: 0,
    borderRadius: 3,
  },
  progressProjected: {
    position: "absolute",
    top: 0,
    bottom: 0,
    borderWidth: 1,
    borderStyle: "dashed",
    borderRadius: 3,
  },
  stepRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 4,
    marginHorizontal: -4,
  },
  stepNumBubble: {
    width: 26,
    height: 26,
    borderRadius: 13,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  stepNumBubbleText: {
    fontFamily: fontFamily.medium,
    fontSize: 12,
  },
  stepTitle: {
    fontFamily: fontFamily.medium,
    fontSize: 13,
    marginBottom: 2,
  },
  stepSubtitle: {
    fontFamily: fontFamily.regular,
    fontSize: 11,
  },
  stepImpact: {
    fontFamily: fontFamily.semiBold,
    fontSize: 13,
  },
  emptyText: {
    fontFamily: fontFamily.regular,
    fontSize: 12,
    textAlign: "center",
    paddingVertical: 16,
  },
  autopilotCard: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 16,
  },
  autopilotHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  autopilotOverline: {
    fontFamily: fontFamily.medium,
    fontSize: 9,
    letterSpacing: 1.5,
  },
  aiPill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 5,
  },
  aiPillText: {
    fontFamily: fontFamily.semiBold,
    fontSize: 9,
    letterSpacing: 1,
  },
  autopilotText: {
    fontFamily: fontFamily.regular,
    fontSize: 12,
    lineHeight: 17,
    marginBottom: 12,
  },
  autopilotBtnRow: {
    flexDirection: "row",
    gap: 8,
  },
  autopilotBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
  },
  autopilotBtnText: {
    fontFamily: fontFamily.medium,
    fontSize: 12,
  },
});
