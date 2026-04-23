/**
 * Shared CV sub-screen primitives — reusable across all 11 sub-screens.
 */

import React from "react";
import { View, Text, Pressable, StyleSheet, ViewStyle, StyleProp } from "react-native";
import { useTheme } from "../../../hooks/useTheme";
import { SmartIcon } from "../../../components/SmartIcon";
import { fontFamily } from "../../../theme";

// ─── Badge ──────────────────────────────────────────────────

type BadgeTone = "auto" | "empty" | "done" | "draft" | "warning" | "neutral";

export function Badge({ label, tone = "neutral" }: { label: string; tone?: BadgeTone }) {
  const { colors } = useTheme();
  const palette: Record<BadgeTone, { bg: string; border: string; fg: string }> = {
    auto:    { bg: colors.sage08,  border: colors.sage30, fg: colors.accent },
    done:    { bg: colors.sage15,  border: colors.sage30, fg: colors.accent },
    empty:   { bg: colors.cream06, border: colors.cream10, fg: colors.muted },
    draft:   { bg: colors.cream06, border: colors.cream10, fg: colors.body },
    warning: { bg: colors.cream06, border: colors.cream10, fg: colors.body },
    neutral: { bg: colors.cream03, border: colors.cream10, fg: colors.muted },
  };
  const p = palette[tone];
  return (
    <View style={[badgeStyles.chip, { backgroundColor: p.bg, borderColor: p.border }]}>
      <View style={[badgeStyles.dot, { backgroundColor: p.fg }]} />
      <Text style={[badgeStyles.text, { color: p.fg }]}>{label.toUpperCase()}</Text>
    </View>
  );
}

const badgeStyles = StyleSheet.create({
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 5,
    borderWidth: 1,
  },
  dot: { width: 5, height: 5, borderRadius: 2.5 },
  text: {
    fontFamily: fontFamily.medium,
    fontSize: 8.5,
    letterSpacing: 1,
  },
});

// ─── InfoCard ───────────────────────────────────────────────

export function InfoCard({
  overline,
  badge,
  children,
  style,
}: {
  overline?: string;
  badge?: { label: string; tone?: BadgeTone };
  children?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  const { colors } = useTheme();
  return (
    <View
      style={[
        cardStyles.card,
        { backgroundColor: colors.cream03, borderColor: colors.cream10 },
        style,
      ]}
    >
      {(overline || badge) && (
        <View style={cardStyles.header}>
          {overline ? (
            <Text style={[cardStyles.overline, { color: colors.muted }]}>
              {overline.toUpperCase()}
            </Text>
          ) : <View />}
          {badge ? <Badge label={badge.label} tone={badge.tone} /> : null}
        </View>
      )}
      {children}
    </View>
  );
}

const cardStyles = StyleSheet.create({
  card: {
    borderRadius: 18,
    borderWidth: 1,
    padding: 16,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  overline: {
    fontFamily: fontFamily.medium,
    fontSize: 9,
    letterSpacing: 1.5,
  },
});

// ─── InfoRow ────────────────────────────────────────────────

export function InfoRow({
  label,
  value,
  accent,
  divider = true,
}: {
  label: string;
  value: React.ReactNode;
  accent?: boolean;
  divider?: boolean;
}) {
  const { colors } = useTheme();
  return (
    <View
      style={[
        rowStyles.row,
        divider ? { borderTopColor: colors.cream10, borderTopWidth: StyleSheet.hairlineWidth } : null,
      ]}
    >
      <Text style={[rowStyles.label, { color: colors.muted }]}>{label}</Text>
      {typeof value === "string" || typeof value === "number" ? (
        <Text
          style={[
            rowStyles.value,
            { color: accent ? colors.accent : colors.tomoCream },
          ]}
        >
          {value || "—"}
        </Text>
      ) : (
        value
      )}
    </View>
  );
}

const rowStyles = StyleSheet.create({
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 12,
  },
  label: {
    fontFamily: fontFamily.regular,
    fontSize: 12,
  },
  value: {
    fontFamily: fontFamily.medium,
    fontSize: 13,
  },
});

// ─── EmptyState ─────────────────────────────────────────────

export function EmptyState({
  icon = "add-circle-outline",
  title,
  description,
  cta,
  onCtaPress,
}: {
  icon?: string;
  title: string;
  description?: string;
  cta?: string;
  onCtaPress?: () => void;
}) {
  const { colors } = useTheme();
  return (
    <View style={[emptyStyles.wrap, { borderColor: colors.cream10 }]}>
      <View style={[emptyStyles.iconWrap, { backgroundColor: colors.sage15 }]}>
        <SmartIcon name={icon as any} size={22} color={colors.accent} />
      </View>
      <Text style={[emptyStyles.title, { color: colors.tomoCream }]}>{title}</Text>
      {description ? (
        <Text style={[emptyStyles.desc, { color: colors.muted }]}>{description}</Text>
      ) : null}
      {cta ? (
        <Pressable
          onPress={onCtaPress}
          style={({ pressed }) => [
            emptyStyles.cta,
            {
              backgroundColor: pressed ? colors.sage15 : colors.sage08,
              borderColor: colors.sage30,
            },
          ]}
        >
          <Text style={[emptyStyles.ctaText, { color: colors.accent }]}>{cta}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const emptyStyles = StyleSheet.create({
  wrap: {
    borderWidth: 1,
    borderStyle: "dashed",
    borderRadius: 14,
    paddingVertical: 22,
    paddingHorizontal: 16,
    alignItems: "center",
    gap: 10,
  },
  iconWrap: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
  },
  title: {
    fontFamily: fontFamily.medium,
    fontSize: 14,
    textAlign: "center",
  },
  desc: {
    fontFamily: fontFamily.regular,
    fontSize: 11,
    lineHeight: 16,
    textAlign: "center",
    maxWidth: 280,
  },
  cta: {
    marginTop: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
  },
  ctaText: {
    fontFamily: fontFamily.medium,
    fontSize: 11,
    letterSpacing: 0.5,
  },
});

// ─── Chip / Pill ────────────────────────────────────────────

export function Chip({
  label,
  onPress,
  tone = "neutral",
  icon,
}: {
  label: string;
  onPress?: () => void;
  tone?: "neutral" | "primary" | "outline";
  icon?: string;
}) {
  const { colors } = useTheme();
  const palette = {
    neutral: { bg: colors.cream06, border: colors.cream10, fg: colors.tomoCream },
    primary: { bg: colors.sage15, border: colors.sage30, fg: colors.accent },
    outline: { bg: "transparent", border: colors.cream20, fg: colors.body },
  } as const;
  const p = palette[tone];
  const Component = onPress ? Pressable : View;
  return (
    <Component
      onPress={onPress as any}
      style={[chipStyles.chip, { backgroundColor: p.bg, borderColor: p.border }]}
    >
      {icon ? <SmartIcon name={icon as any} size={11} color={p.fg} /> : null}
      <Text style={[chipStyles.text, { color: p.fg }]}>{label}</Text>
    </Component>
  );
}

const chipStyles = StyleSheet.create({
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
  },
  text: {
    fontFamily: fontFamily.medium,
    fontSize: 11,
  },
});

// ─── PercentileBar ──────────────────────────────────────────

export function PercentileBar({
  label,
  value,
  unit,
  percentile,
  rankHint,
}: {
  label: string;
  value: number;
  unit: string;
  percentile: number;
  rankHint?: string;
}) {
  const { colors } = useTheme();
  const zone =
    percentile >= 75 ? "elite" : percentile >= 40 ? "on_par" : "dev_priority";

  const barColor =
    zone === "elite"        ? colors.accent :
    zone === "on_par"       ? colors.body :
                              colors.muted;

  return (
    <View style={pctStyles.wrap}>
      <View style={pctStyles.headerRow}>
        <Text style={[pctStyles.label, { color: colors.tomoCream }]}>{label}</Text>
        <View style={pctStyles.valueCluster}>
          <Text style={[pctStyles.value, { color: colors.tomoCream }]}>
            {value}
            <Text style={[pctStyles.unit, { color: colors.muted }]}> {unit}</Text>
          </Text>
          <Text style={[pctStyles.rank, { color: barColor }]}>
            {Math.round(percentile)}th
          </Text>
        </View>
      </View>
      <View style={[pctStyles.track, { backgroundColor: colors.cream06 }]}>
        <View
          style={[
            pctStyles.fill,
            { width: `${Math.max(2, Math.min(100, percentile))}%`, backgroundColor: barColor },
          ]}
        />
      </View>
      {rankHint ? (
        <View style={pctStyles.hintRow}>
          <Text style={[pctStyles.hint, { color: colors.muted }]}>{rankHint}</Text>
          <Text style={[pctStyles.zoneHint, { color: barColor }]}>
            {zone === "elite" ? "Elite zone" : zone === "on_par" ? "On par" : "Dev priority"}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

const pctStyles = StyleSheet.create({
  wrap: { paddingVertical: 8 },
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 6,
  },
  label: { fontFamily: fontFamily.medium, fontSize: 13 },
  valueCluster: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: 8,
  },
  value: { fontFamily: fontFamily.semiBold, fontSize: 13 },
  unit: { fontFamily: fontFamily.regular, fontSize: 11 },
  rank: { fontFamily: fontFamily.medium, fontSize: 11 },
  track: {
    height: 4,
    borderRadius: 2,
    overflow: "hidden",
  },
  fill: { height: "100%", borderRadius: 2 },
  hintRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 4,
  },
  hint: { fontFamily: fontFamily.regular, fontSize: 10 },
  zoneHint: { fontFamily: fontFamily.medium, fontSize: 10 },
});

// ─── Divider ────────────────────────────────────────────────

export function Divider() {
  const { colors } = useTheme();
  return (
    <View
      style={{
        height: StyleSheet.hairlineWidth,
        backgroundColor: colors.cream10,
      }}
    />
  );
}
