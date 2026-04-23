import React from "react";
import { View, Text, Pressable, StyleSheet } from "react-native";
import { useTheme } from "../../../hooks/useTheme";
import { fontFamily } from "../../../theme";
import { SmartIcon } from "../../../components/SmartIcon";
import type { CVNextStep } from "../../../hooks/useCVProfile";

interface Props {
  steps: CVNextStep[];
  onOpenRoadmap?: () => void;
}

export function NextStepsPreview({ steps, onOpenRoadmap }: Props) {
  const { colors } = useTheme();
  const preview = steps.slice(0, 3);

  if (preview.length === 0) return null;

  return (
    <Pressable
      onPress={onOpenRoadmap}
      style={({ pressed }) => [
        styles.card,
        {
          backgroundColor: pressed ? colors.cream06 : colors.cream03,
          borderColor: colors.cream10,
        },
      ]}
    >
      <View style={styles.headerRow}>
        <View style={{ flex: 1 }}>
          <Text style={[styles.overline, { color: colors.muted }]}>NEXT STEPS</Text>
          <Text style={[styles.title, { color: colors.tomoCream }]}>
            {steps.length} ways to strengthen your CV
          </Text>
        </View>
        <View style={[styles.countChip, { borderColor: colors.sage30, backgroundColor: colors.sage08 }]}>
          <View style={[styles.dot, { backgroundColor: colors.accent }]} />
          <Text style={[styles.countText, { color: colors.accent }]}>{steps.length} TIPS</Text>
        </View>
      </View>

      <View style={styles.list}>
        {preview.map((step, i) => (
          <View
            key={step.key}
            style={[styles.stepRow, { borderTopColor: i === 0 ? "transparent" : colors.cream10 }]}
          >
            <View style={[styles.stepNumber, { borderColor: colors.cream20 }]}>
              <Text style={[styles.stepNumberText, { color: colors.muted }]}>{i + 1}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.stepTitle, { color: colors.tomoCream }]}>{step.title}</Text>
              <Text style={[styles.stepSubtitle, { color: colors.muted }]}>{step.subtitle}</Text>
            </View>
            <Text style={[styles.impact, { color: colors.accent }]}>+{step.impact_pct}%</Text>
          </View>
        ))}
      </View>

      {steps.length > preview.length ? (
        <View style={[styles.footer, { borderTopColor: colors.cream10 }]}>
          <Text style={[styles.seeAll, { color: colors.accent }]}>
            See full roadmap
          </Text>
          <SmartIcon name="chevron-forward" size={14} color={colors.accent} />
        </View>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 18,
    borderWidth: 1,
    padding: 16,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 12,
  },
  overline: {
    fontFamily: fontFamily.medium,
    fontSize: 9,
    letterSpacing: 1.5,
    marginBottom: 4,
  },
  title: {
    fontFamily: fontFamily.medium,
    fontSize: 14,
  },
  countChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
  },
  dot: { width: 6, height: 6, borderRadius: 3 },
  countText: {
    fontFamily: fontFamily.medium,
    fontSize: 9,
    letterSpacing: 1,
  },
  list: {
    gap: 0,
  },
  stepRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  stepNumber: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  stepNumberText: {
    fontFamily: fontFamily.medium,
    fontSize: 11,
  },
  stepTitle: {
    fontFamily: fontFamily.medium,
    fontSize: 13,
    marginBottom: 2,
  },
  stepSubtitle: {
    fontFamily: fontFamily.regular,
    fontSize: 10,
  },
  impact: {
    fontFamily: fontFamily.semiBold,
    fontSize: 12,
  },
  footer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingTop: 12,
    marginTop: 4,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  seeAll: {
    fontFamily: fontFamily.medium,
    fontSize: 12,
  },
});
