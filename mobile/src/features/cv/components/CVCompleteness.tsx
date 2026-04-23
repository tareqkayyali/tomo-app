import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { useTheme } from "../../../hooks/useTheme";
import { fontFamily } from "../../../theme";

interface Props {
  pct: number;
  label?: string;
}

export function CVCompleteness({ pct, label = "CV COMPLETENESS" }: Props) {
  const { colors } = useTheme();
  const clamped = Math.max(0, Math.min(100, pct));

  return (
    <View>
      <View style={styles.row}>
        <Text style={[styles.label, { color: colors.muted }]}>{label}</Text>
        <Text style={[styles.pct, { color: colors.accent }]}>{clamped}%</Text>
      </View>
      <View style={[styles.track, { backgroundColor: colors.cream06 }]}>
        <View style={[styles.fill, { width: `${clamped}%`, backgroundColor: colors.accent }]} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  label: {
    fontFamily: fontFamily.medium,
    fontSize: 9,
    letterSpacing: 1.5,
  },
  pct: {
    fontFamily: fontFamily.semiBold,
    fontSize: 14,
  },
  track: {
    height: 4,
    borderRadius: 2,
    overflow: "hidden",
  },
  fill: {
    height: "100%",
    borderRadius: 2,
  },
});
