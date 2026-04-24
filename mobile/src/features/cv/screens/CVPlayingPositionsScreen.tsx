/**
 * CVPlayingPositionsScreen — mock 05.
 * Simplified pitch map + primary position + secondary chips.
 */

import React from "react";
import { View, Text, Pressable, StyleSheet } from "react-native";
import Svg, { Rect, Line, Circle } from "react-native-svg";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useTheme } from "../../../hooks/useTheme";
import { useAuth } from "../../../hooks/useAuth";
import { useCVProfile } from "../../../hooks/useCVProfile";
import type { MainStackParamList } from "../../../navigation/types";
import { fontFamily } from "../../../theme";
import { CVScreen } from "../components/CVScreen";
import { InfoCard, Chip, Badge } from "../components/primitives";
import { Loader } from "../../../components/Loader";

// Rough pitch coordinates (as % of width/height) for football positions
const POSITION_COORDS: Record<string, { x: number; y: number }> = {
  GK:  { x: 50, y: 92 },
  CB:  { x: 50, y: 75 },
  LB:  { x: 20, y: 75 },
  RB:  { x: 80, y: 75 },
  FB:  { x: 80, y: 75 },
  CDM: { x: 50, y: 60 },
  CM:  { x: 50, y: 50 },
  CAM: { x: 50, y: 35 },
  LW:  { x: 20, y: 25 },
  RW:  { x: 80, y: 25 },
  WM:  { x: 20, y: 45 },
  ST:  { x: 50, y: 15 },
  CF:  { x: 50, y: 15 },
};

const SECONDARY_SUGGESTIONS = ["CM", "RW", "LW", "ST", "CF"];

export default function CVPlayingPositionsScreen() {
  const nav = useNavigation<NativeStackNavigationProp<MainStackParamList>>();
  const { colors } = useTheme();
  const { user } = useAuth();
  const { data, isLoading } = useCVProfile(user?.uid ?? "");

  if (isLoading || !data) {
    return (
      <CVScreen
        label="Playing Positions"
        onBack={() => nav.goBack()}
        scroll={false}
        contentContainerStyle={styles.loadingContainer}
      >
        <Loader />
      </CVScreen>
    );
  }

  const { positions } = data;
  const primary = positions.primary_position;
  const primaryCoord = primary ? POSITION_COORDS[primary] : null;
  const secondarySuggestions = SECONDARY_SUGGESTIONS.filter(
    (p) => p !== primary && !positions.secondary_positions.includes(p)
  ).slice(0, 5);

  return (
    <CVScreen label="Playing Positions" onBack={() => nav.goBack()}>
      <InfoCard
        overline="Pitch Map"
        badge={{ label: positions.is_set ? "Primary set" : "Primary only", tone: "auto" }}
      >
        <View style={[styles.pitchWrap, { backgroundColor: colors.cream03, borderColor: colors.cream10 }]}>
          <Svg width="100%" height="100%" viewBox="0 0 100 100" preserveAspectRatio="xMidYMid meet">
            <Rect x="0" y="0" width="100" height="100" fill="none" stroke={colors.cream10} strokeWidth="0.4" />
            <Line x1="0" y1="50" x2="100" y2="50" stroke={colors.cream10} strokeWidth="0.4" />
            <Circle cx="50" cy="50" r="10" fill="none" stroke={colors.cream10} strokeWidth="0.4" />
            <Rect x="30" y="0" width="40" height="15" fill="none" stroke={colors.cream10} strokeWidth="0.4" />
            <Rect x="30" y="85" width="40" height="15" fill="none" stroke={colors.cream10} strokeWidth="0.4" />
            {primaryCoord ? (
              <>
                <Circle cx={primaryCoord.x} cy={primaryCoord.y} r="7" fill={colors.sage15} stroke={colors.sage30} strokeWidth="0.6" />
                <Circle cx={primaryCoord.x} cy={primaryCoord.y} r="4" fill={colors.accent} />
              </>
            ) : null}
            {positions.secondary_positions.map((sec) => {
              const c = POSITION_COORDS[sec];
              if (!c) return null;
              return (
                <Circle
                  key={sec}
                  cx={c.x}
                  cy={c.y}
                  r="4"
                  fill="none"
                  stroke={colors.cream20}
                  strokeWidth="0.8"
                  strokeDasharray="1,1"
                />
              );
            })}
          </Svg>
          {primary ? (
            <View style={[styles.pitchBadge, { backgroundColor: colors.sage15, borderColor: colors.sage30 }]}>
              <Text style={[styles.pitchBadgeText, { color: colors.accent }]}>{primary}</Text>
              <Text style={[styles.pitchBadgeSubtext, { color: colors.accent }]}>PRIMARY</Text>
            </View>
          ) : null}
        </View>
      </InfoCard>

      <InfoCard
        overline="Primary Position"
        badge={{ label: primary ? "Set" : "Choose", tone: primary ? "done" : "empty" }}
      >
        {primary ? (
          <View style={styles.primaryRow}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.primaryLabel, { color: colors.tomoCream }]}>
                {positions.primary_label ?? primary}
              </Text>
              <Text style={[styles.primaryDesc, { color: colors.muted }]}>
                {positions.primary_description ?? ""}
              </Text>
            </View>
            <View style={[styles.positionCode, { backgroundColor: colors.sage15, borderColor: colors.sage30 }]}>
              <Text style={[styles.positionCodeText, { color: colors.accent }]}>{primary}</Text>
            </View>
          </View>
        ) : (
          <Text style={[styles.primaryDesc, { color: colors.muted }]}>
            Set your primary position in Player Identity.
          </Text>
        )}
      </InfoCard>

      <InfoCard
        overline="Secondary Positions"
        badge={positions.has_secondary
          ? { label: `${positions.secondary_positions.length} set`, tone: "done" }
          : { label: "+4% CV", tone: "draft" }}
      >
        <Text style={[styles.subline, { color: colors.muted }]}>
          Add up to 2 secondary positions you can confidently play. Clubs filter by versatility.
        </Text>

        {positions.has_secondary ? (
          <View style={styles.chipRow}>
            {positions.secondary_positions.map((sec) => (
              <Chip key={sec} label={sec} tone="primary" />
            ))}
          </View>
        ) : (
          <View style={styles.chipRow}>
            {secondarySuggestions.map((sec) => (
              <Chip
                key={sec}
                label={`+ ${sec}`}
                tone="outline"
                onPress={() => nav.push("Profile")}
              />
            ))}
          </View>
        )}

        <Pressable
          onPress={() => nav.push("Profile")}
          style={({ pressed }) => [
            styles.chooseBtn,
            {
              backgroundColor: pressed ? colors.sage15 : colors.sage08,
              borderColor: colors.sage30,
              marginTop: 14,
            },
          ]}
        >
          <Text style={[styles.chooseText, { color: colors.accent }]}>
            {positions.has_secondary ? "EDIT POSITIONS" : "+ CHOOSE POSITIONS"}
          </Text>
        </Pressable>
      </InfoCard>
    </CVScreen>
  );
}

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingBottom: 0,
  },
  pitchWrap: {
    aspectRatio: 0.82,
    borderRadius: 14,
    borderWidth: 1,
    padding: 12,
    position: "relative",
  },
  pitchBadge: {
    position: "absolute",
    bottom: 16,
    alignSelf: "center",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: "center",
  },
  pitchBadgeText: {
    fontFamily: fontFamily.semiBold,
    fontSize: 14,
    letterSpacing: -0.2,
  },
  pitchBadgeSubtext: {
    fontFamily: fontFamily.medium,
    fontSize: 8,
    letterSpacing: 1.4,
    marginTop: 2,
  },
  primaryRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  primaryLabel: {
    fontFamily: fontFamily.semiBold,
    fontSize: 15,
    marginBottom: 2,
  },
  primaryDesc: {
    fontFamily: fontFamily.regular,
    fontSize: 12,
    lineHeight: 17,
  },
  positionCode: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
  },
  positionCodeText: {
    fontFamily: fontFamily.semiBold,
    fontSize: 13,
  },
  subline: {
    fontFamily: fontFamily.regular,
    fontSize: 11,
    lineHeight: 16,
    marginBottom: 12,
    marginTop: -4,
  },
  chipRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
  },
  chooseBtn: {
    alignItems: "center",
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
  },
  chooseText: {
    fontFamily: fontFamily.medium,
    fontSize: 11,
    letterSpacing: 1.2,
  },
});
