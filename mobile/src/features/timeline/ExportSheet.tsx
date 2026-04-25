/**
 * Timeline Export bottom sheet — pick a date range + event-type chips and
 * export the result as a calendar-grid PDF via /api/v1/timeline/pdf.
 *
 * Range presets are computed against the user's local "today" (no tz lib
 * needed; we send the IANA tz to the server). Type chips default to all-on
 * so a one-tap export "just works".
 *
 * While Browserless renders (3-10s with no progress signal), we show a
 * synthetic progress bar — same UX as the CV export.
 */

import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Modal,
  View,
  Text,
  Pressable,
  StyleSheet,
  ScrollView,
  Animated,
  Easing,
} from "react-native";
import { useTheme } from "../../hooks/useTheme";
import { fontFamily } from "../../theme";
import { downloadPdf } from "../pdf/downloadPdf";

interface RangePreset {
  key: string;
  label: string;
  compute: (today: Date) => { from: string; to: string };
}

interface TypeChip {
  key: string;
  label: string;
}

const TYPE_CHIPS: TypeChip[] = [
  { key: "training",    label: "Training" },
  { key: "match",       label: "Match" },
  { key: "recovery",    label: "Recovery" },
  { key: "study_block", label: "Study" },
  { key: "exam",        label: "Exam" },
  { key: "other",       label: "Other" },
];

const RANGE_PRESETS: RangePreset[] = [
  {
    key: "this_week",
    label: "This week",
    compute: (today) => {
      const start = startOfWeek(today);
      const end = addDays(start, 6);
      return { from: iso(start), to: iso(end) };
    },
  },
  {
    key: "next_week",
    label: "Next week",
    compute: (today) => {
      const start = addDays(startOfWeek(today), 7);
      const end = addDays(start, 6);
      return { from: iso(start), to: iso(end) };
    },
  },
  {
    key: "this_month",
    label: "This month",
    compute: (today) => {
      const start = new Date(today.getFullYear(), today.getMonth(), 1);
      const end = new Date(today.getFullYear(), today.getMonth() + 1, 0);
      return { from: iso(start), to: iso(end) };
    },
  },
  {
    key: "next_month",
    label: "Next month",
    compute: (today) => {
      const start = new Date(today.getFullYear(), today.getMonth() + 1, 1);
      const end = new Date(today.getFullYear(), today.getMonth() + 2, 0);
      return { from: iso(start), to: iso(end) };
    },
  },
  {
    key: "next_30",
    label: "Next 30 days",
    compute: (today) => ({ from: iso(today), to: iso(addDays(today, 29)) }),
  },
];

function iso(d: Date): string {
  const y = d.getFullYear();
  const m = (d.getMonth() + 1).toString().padStart(2, "0");
  const day = d.getDate().toString().padStart(2, "0");
  return `${y}-${m}-${day}`;
}
function addDays(d: Date, n: number): Date {
  const c = new Date(d);
  c.setDate(c.getDate() + n);
  return c;
}
function startOfWeek(d: Date): Date {
  // Sunday-first to match the print grid.
  const c = new Date(d);
  c.setDate(c.getDate() - c.getDay());
  return c;
}

export function ExportSheet({
  visible,
  onClose,
}: {
  visible: boolean;
  onClose: () => void;
}) {
  const { colors } = useTheme();
  const [presetKey, setPresetKey] = useState<string>("this_week");
  const [enabled, setEnabled] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(TYPE_CHIPS.map((c) => [c.key, true]))
  );
  const [exporting, setExporting] = useState(false);
  const [progress, setProgress] = useState(0);
  const tickerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const progressAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!visible) {
      setExporting(false);
      setProgress(0);
      progressAnim.setValue(0);
      if (tickerRef.current) { clearInterval(tickerRef.current); tickerRef.current = null; }
    }
  }, [visible, progressAnim]);

  useEffect(() => {
    Animated.timing(progressAnim, {
      toValue: progress,
      duration: 200,
      easing: Easing.out(Easing.quad),
      useNativeDriver: false,
    }).start();
  }, [progress, progressAnim]);

  const range = useMemo(() => {
    const preset = RANGE_PRESETS.find((p) => p.key === presetKey) ?? RANGE_PRESETS[0];
    return preset.compute(new Date());
  }, [presetKey]);

  const selectedTypes = useMemo(
    () => TYPE_CHIPS.filter((c) => enabled[c.key]).map((c) => c.key),
    [enabled]
  );
  const canExport = selectedTypes.length > 0 && !exporting;

  function startTicker() {
    setProgress(0);
    if (tickerRef.current) clearInterval(tickerRef.current);
    tickerRef.current = setInterval(() => {
      setProgress((p) => (p < 95 ? p + 1 : p));
    }, 100);
  }
  function stopTicker(snap: number) {
    if (tickerRef.current) { clearInterval(tickerRef.current); tickerRef.current = null; }
    setProgress(snap);
  }

  async function handleExport() {
    if (!canExport) return;
    setExporting(true);
    startTicker();
    try {
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
      await downloadPdf({
        path: "/api/v1/timeline/pdf",
        method: "POST",
        body: {
          fromDate: range.from,
          toDate: range.to,
          eventTypes: selectedTypes,
          tz,
        },
        filenameStem: `tomo-timeline-${range.from}_${range.to}`,
        dialogTitle: "Save your Timeline",
        errorTitle: "Timeline PDF",
      });
      stopTicker(100);
      setTimeout(onClose, 250);
    } catch {
      stopTicker(0);
    } finally {
      setExporting(false);
    }
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.overlay} onPress={exporting ? undefined : onClose}>
        <Pressable
          style={[styles.sheet, { backgroundColor: colors.surfaceSheet }]}
          onPress={(e) => e.stopPropagation()}
        >
          <View style={[styles.handleBar, { backgroundColor: colors.cream10 }]} />

          <View style={styles.headerRow}>
            <Text style={[styles.eyebrow, { color: colors.tomoSage }]}>EXPORT TIMELINE</Text>
            <Pressable onPress={onClose} hitSlop={12} disabled={exporting}>
              <Text style={[styles.closeBtn, { color: colors.muted, opacity: exporting ? 0.4 : 1 }]}>✕</Text>
            </Pressable>
          </View>
          <Text style={[styles.title, { color: colors.tomoCream }]}>Pick range and types</Text>

          <ScrollView style={styles.body} keyboardShouldPersistTaps="handled">
            <Text style={[styles.label, { color: colors.muted }]}>RANGE</Text>
            <View style={styles.chipRow}>
              {RANGE_PRESETS.map((p) => {
                const sel = p.key === presetKey;
                return (
                  <Pressable
                    key={p.key}
                    onPress={() => !exporting && setPresetKey(p.key)}
                    style={[
                      styles.chip,
                      {
                        backgroundColor: sel ? colors.tomoSage : colors.cream03,
                        borderColor: sel ? colors.tomoSage : colors.cream10,
                        opacity: exporting ? 0.5 : 1,
                      },
                    ]}
                  >
                    <Text style={[styles.chipText, { color: sel ? colors.background : colors.tomoCream }]}>
                      {p.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
            <Text style={[styles.rangePreview, { color: colors.muted }]}>
              {range.from} → {range.to}
            </Text>

            <View style={styles.gap} />

            <Text style={[styles.label, { color: colors.muted }]}>EVENT TYPES</Text>
            <View style={styles.chipRow}>
              {TYPE_CHIPS.map((c) => {
                const sel = !!enabled[c.key];
                return (
                  <Pressable
                    key={c.key}
                    onPress={() =>
                      !exporting && setEnabled((prev) => ({ ...prev, [c.key]: !prev[c.key] }))
                    }
                    style={[
                      styles.chip,
                      {
                        backgroundColor: sel ? colors.tomoSage : colors.cream03,
                        borderColor: sel ? colors.tomoSage : colors.cream10,
                        opacity: exporting ? 0.5 : 1,
                      },
                    ]}
                  >
                    <Text style={[styles.chipText, { color: sel ? colors.background : colors.tomoCream }]}>
                      {c.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            <View style={styles.gap} />

            <Pressable
              onPress={handleExport}
              disabled={!canExport}
              style={[
                styles.exportBtn,
                {
                  backgroundColor: canExport ? colors.tomoSage : colors.cream06,
                  opacity: canExport ? 1 : 0.7,
                },
              ]}
            >
              <Text style={[styles.exportText, { color: colors.background }]}>
                {exporting ? "Generating PDF…" : "Export PDF"}
              </Text>
            </Pressable>

            {exporting && (
              <View style={styles.progressWrap}>
                <View style={[styles.progressTrack, { backgroundColor: colors.cream10 }]}>
                  <Animated.View
                    style={[
                      styles.progressFill,
                      {
                        backgroundColor: colors.tomoSage,
                        width: progressAnim.interpolate({
                          inputRange: [0, 100],
                          outputRange: ["0%", "100%"],
                        }),
                      },
                    ]}
                  />
                </View>
                <Text style={[styles.progressText, { color: colors.muted }]}>{progress}%</Text>
              </View>
            )}
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.45)",
    justifyContent: "flex-end",
  },
  sheet: {
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingTop: 8,
    paddingBottom: 32,
    paddingHorizontal: 20,
    maxHeight: "85%",
  },
  handleBar: {
    width: 36, height: 4, borderRadius: 2,
    alignSelf: "center", marginBottom: 12,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 4,
  },
  eyebrow: { fontFamily: fontFamily.medium, fontSize: 11, letterSpacing: 1 },
  closeBtn: { fontFamily: fontFamily.medium, fontSize: 18, paddingHorizontal: 4 },
  title: { fontFamily: fontFamily.bold, fontSize: 18, marginBottom: 12 },
  body: { flexGrow: 1, flexShrink: 1 },
  label: {
    fontFamily: fontFamily.medium,
    fontSize: 11, letterSpacing: 1, marginBottom: 8,
  },
  chipRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
  },
  chipText: { fontFamily: fontFamily.medium, fontSize: 13 },
  rangePreview: {
    fontFamily: fontFamily.regular,
    fontSize: 12,
    marginTop: 8,
  },
  gap: { height: 16 },
  exportBtn: {
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: "center",
  },
  exportText: { fontFamily: fontFamily.bold, fontSize: 15 },
  progressWrap: { marginTop: 12, alignItems: "center" },
  progressTrack: {
    width: "100%",
    height: 4,
    borderRadius: 2,
    overflow: "hidden",
  },
  progressFill: { height: 4, borderRadius: 2 },
  progressText: {
    fontFamily: fontFamily.medium,
    fontSize: 11,
    marginTop: 6,
  },
});
