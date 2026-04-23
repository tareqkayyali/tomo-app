import React from "react";
import { View, Text, Pressable, StyleSheet } from "react-native";
import { useTheme } from "../../../hooks/useTheme";
import { fontFamily } from "../../../theme";
import { SmartIcon } from "../../../components/SmartIcon";
import type { CVSectionState } from "../../../hooks/useCVProfile";

export const STATE_LABELS: Record<CVSectionState, { label: string; tone: "positive" | "neutral" | "warning" }> = {
  auto_complete:     { label: "Complete", tone: "positive" },
  approved:          { label: "Approved", tone: "positive" },
  ai_draft_pending:  { label: "Draft",    tone: "warning" },
  needs_input:       { label: "Add",      tone: "warning" },
  insufficient_data: { label: "No data",  tone: "neutral" },
  empty:             { label: "Empty",    tone: "neutral" },
};

interface Props {
  title: string;
  subtitle?: string;
  state: CVSectionState;
  onPress?: () => void;
}

export function SectionRow({ title, subtitle, state, onPress }: Props) {
  const { colors } = useTheme();
  const stateMeta = STATE_LABELS[state];

  const toneColor =
    stateMeta.tone === "positive" ? colors.accent :
    stateMeta.tone === "warning"  ? colors.body :
    colors.muted;

  const indicatorColor =
    stateMeta.tone === "positive" ? colors.accent :
    stateMeta.tone === "warning"  ? colors.body :
    colors.cream20;

  return (
    <Pressable onPress={onPress} style={({ pressed }) => [
      styles.row,
      { borderColor: colors.cream10, backgroundColor: pressed ? colors.cream06 : "transparent" },
    ]}>
      <View style={{ flex: 1 }}>
        <Text style={[styles.title, { color: colors.tomoCream }]}>{title}</Text>
        {subtitle ? <Text style={[styles.subtitle, { color: colors.muted }]}>{subtitle}</Text> : null}
      </View>

      <View style={styles.rightCluster}>
        <View style={[styles.indicatorTrack, { backgroundColor: colors.cream06 }]}>
          <View style={[styles.indicatorFill, { backgroundColor: indicatorColor }]} />
        </View>
        <SmartIcon name="chevron-forward" size={14} color={toneColor} />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 14,
    paddingHorizontal: 14,
    borderTopWidth: StyleSheet.hairlineWidth,
    gap: 12,
  },
  title: {
    fontFamily: fontFamily.medium,
    fontSize: 14,
    letterSpacing: -0.1,
  },
  subtitle: {
    fontFamily: fontFamily.regular,
    fontSize: 11,
    marginTop: 2,
  },
  rightCluster: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  indicatorTrack: {
    width: 40,
    height: 3,
    borderRadius: 2,
    overflow: "hidden",
  },
  indicatorFill: {
    width: "100%",
    height: "100%",
  },
});
