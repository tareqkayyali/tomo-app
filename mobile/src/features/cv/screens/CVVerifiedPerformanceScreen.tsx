/**
 * CVVerifiedPerformanceScreen — mock 06.
 * Verified-by-Tomo banner + 4 KPIs + ACWR balance bar + 7-day session log.
 */

import React from "react";
import { View, Text, StyleSheet, ActivityIndicator } from "react-native";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useTheme } from "../../../hooks/useTheme";
import { useAuth } from "../../../hooks/useAuth";
import { useCVProfile } from "../../../hooks/useCVProfile";
import type { MainStackParamList } from "../../../navigation/types";
import { fontFamily } from "../../../theme";
import { SmartIcon } from "../../../components/SmartIcon";
import { CVScreen } from "../components/CVScreen";
import { InfoCard, Badge } from "../components/primitives";

export default function CVVerifiedPerformanceScreen() {
  const nav = useNavigation<NativeStackNavigationProp<MainStackParamList>>();
  const { colors } = useTheme();
  const { user } = useAuth();
  const { data, isLoading } = useCVProfile(user?.id ?? "");

  if (isLoading || !data) {
    return (
      <CVScreen label="Verified Performance" onBack={() => nav.goBack()}>
        <ActivityIndicator color={colors.accent} style={{ marginTop: 64 }} />
      </CVScreen>
    );
  }

  const vp = data.verified_performance;
  const acwr = vp.acwr;
  const acwrLabel =
    vp.training_balance === "balanced" ? "Balanced" :
    vp.training_balance === "under"    ? "Under-loaded" :
    vp.training_balance === "over"     ? "Over-loaded" : "No data";
  const acwrPct =
    acwr != null ? Math.min(100, Math.max(0, ((acwr - 0.4) / 1.4) * 100)) : 0;

  return (
    <CVScreen label="Verified Performance" onBack={() => nav.goBack()}>
      <View style={[styles.banner, { backgroundColor: colors.sage15, borderColor: colors.sage30 }]}>
        <View style={[styles.bannerIcon, { backgroundColor: colors.sage30 }]}>
          <SmartIcon name="shield-checkmark-outline" size={16} color={colors.accent} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[styles.bannerTitle, { color: colors.accent }]}>
            ALL DATA VERIFIED BY TOMO
          </Text>
          <Text style={[styles.bannerSub, { color: colors.accent }]}>
            Collected from on-platform sensors and sessions
          </Text>
        </View>
      </View>

      <InfoCard
        overline="Performance KPIs"
        badge={{ label: "Live", tone: "done" }}
      >
        <Text style={[styles.subline, { color: colors.muted }]}>
          All-time across structured training
        </Text>
        <View style={styles.kpiGrid}>
          <KPITile value={String(vp.sessions_total)} label="Sessions" hint="all time" />
          <KPITile value={vp.training_age_label} label="Training age" hint={dataStartHint(vp.data_start_date)} />
          <KPITile value={`${vp.streak_days} d`} label="Streak" hint="active" />
          <KPITile
            value={acwr != null ? acwr.toFixed(2) : "—"}
            label="ACWR"
            hint={vp.training_balance ?? "balanced"}
          />
        </View>
      </InfoCard>

      <InfoCard
        overline="Training Balance"
        badge={{ label: acwr != null ? `ACWR ${acwr.toFixed(2)}` : "No data", tone: "auto" }}
      >
        <Text style={[styles.balanceLabel, { color: colors.tomoCream }]}>
          Acute : Chronic workload ratio
        </Text>
        <Text style={[styles.balanceValue, { color: colors.accent }]}>{acwrLabel}</Text>
        <View style={[styles.acwrTrack, { backgroundColor: colors.cream06 }]}>
          <View
            style={[
              styles.acwrZone,
              { left: "29%", width: "28%", backgroundColor: colors.sage15 },
            ]}
          />
          {acwr != null ? (
            <View
              style={[
                styles.acwrMarker,
                { left: `${acwrPct}%`, backgroundColor: colors.accent, borderColor: colors.sage30 },
              ]}
            />
          ) : null}
        </View>
        <View style={styles.acwrLegend}>
          <Text style={[styles.acwrLegendText, { color: colors.muted }]}>Under</Text>
          <Text style={[styles.acwrLegendText, { color: colors.accent }]}>Sweet spot</Text>
          <Text style={[styles.acwrLegendText, { color: colors.muted }]}>Over</Text>
        </View>
      </InfoCard>

      <InfoCard
        overline="Session Log"
        badge={{ label: "Last 7 days", tone: "neutral" }}
      >
        {vp.session_log.length === 0 ? (
          <Text style={[styles.emptyLog, { color: colors.muted }]}>
            No completed sessions in the last 7 days.
          </Text>
        ) : (
          vp.session_log.map((s, i) => (
            <View
              key={`${s.date}-${i}`}
              style={[
                styles.logRow,
                i > 0 ? { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.cream10 } : null,
              ]}
            >
              <View style={{ flex: 1 }}>
                <Text style={[styles.logTitle, { color: colors.tomoCream }]} numberOfLines={1}>
                  {s.title}
                </Text>
                <Text style={[styles.logMeta, { color: colors.muted }]}>
                  {relativeDate(s.date)} · {s.duration_min != null ? `${s.duration_min} min` : s.category}
                </Text>
              </View>
              <Text style={[styles.logLoad, { color: colors.accent }]}>
                {s.load_au != null ? `${s.load_au} AU` : "—"}
              </Text>
            </View>
          ))
        )}
      </InfoCard>
    </CVScreen>
  );
}

function KPITile({ value, label, hint }: { value: string; label: string; hint: string }) {
  const { colors } = useTheme();
  return (
    <View style={[styles.tile, { backgroundColor: colors.cream06, borderColor: colors.cream10 }]}>
      <Text style={[styles.tileValue, { color: colors.tomoCream }]}>{value}</Text>
      <Text style={[styles.tileLabel, { color: colors.body }]}>{label}</Text>
      <Text style={[styles.tileHint, { color: colors.muted }]}>{hint}</Text>
    </View>
  );
}

function dataStartHint(start: string | null): string {
  if (!start) return "since launch";
  try {
    const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    const d = new Date(start);
    return `since ${months[d.getMonth()]}`;
  } catch {
    return "since launch";
  }
}

function relativeDate(iso: string): string {
  try {
    const d = new Date(iso);
    const diffMs = Date.now() - d.getTime();
    const days = Math.floor(diffMs / 86400000);
    if (days <= 0) return "Today";
    if (days === 1) return "Yesterday";
    if (days < 7) return `${days} d ago`;
    return `${Math.floor(days / 7)} w ago`;
  } catch {
    return iso;
  }
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
  },
  bannerIcon: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
  },
  bannerTitle: {
    fontFamily: fontFamily.semiBold,
    fontSize: 11,
    letterSpacing: 1.3,
  },
  bannerSub: {
    fontFamily: fontFamily.regular,
    fontSize: 11,
    marginTop: 2,
  },
  subline: {
    fontFamily: fontFamily.regular,
    fontSize: 11,
    marginBottom: 10,
    marginTop: -4,
  },
  kpiGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  tile: {
    flexBasis: "47%",
    flexGrow: 1,
    borderRadius: 12,
    borderWidth: 1,
    padding: 14,
    gap: 4,
  },
  tileValue: {
    fontFamily: fontFamily.semiBold,
    fontSize: 22,
    letterSpacing: -0.3,
  },
  tileLabel: {
    fontFamily: fontFamily.medium,
    fontSize: 11,
  },
  tileHint: {
    fontFamily: fontFamily.regular,
    fontSize: 10,
  },
  balanceLabel: {
    fontFamily: fontFamily.medium,
    fontSize: 12,
    marginBottom: 4,
  },
  balanceValue: {
    fontFamily: fontFamily.semiBold,
    fontSize: 15,
    marginBottom: 12,
  },
  acwrTrack: {
    height: 8,
    borderRadius: 4,
    position: "relative",
    overflow: "visible",
  },
  acwrZone: {
    position: "absolute",
    top: 0,
    bottom: 0,
    borderRadius: 4,
  },
  acwrMarker: {
    position: "absolute",
    width: 12,
    height: 12,
    borderRadius: 6,
    top: -2,
    marginLeft: -6,
    borderWidth: 2,
  },
  acwrLegend: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 8,
  },
  acwrLegendText: {
    fontFamily: fontFamily.regular,
    fontSize: 10,
  },
  emptyLog: {
    fontFamily: fontFamily.regular,
    fontSize: 12,
    paddingVertical: 8,
  },
  logRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    gap: 10,
  },
  logTitle: {
    fontFamily: fontFamily.medium,
    fontSize: 13,
    marginBottom: 2,
  },
  logMeta: {
    fontFamily: fontFamily.regular,
    fontSize: 11,
  },
  logLoad: {
    fontFamily: fontFamily.semiBold,
    fontSize: 12,
  },
});
