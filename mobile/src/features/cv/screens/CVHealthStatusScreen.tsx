/**
 * CVHealthStatusScreen — mock 11.
 * Fully-fit hero + Availability + Injury log + Medical consent toggles.
 */

import React, { useCallback } from "react";
import { View, Text, StyleSheet, Switch, Pressable, Platform, Alert } from "react-native";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useTheme } from "../../../hooks/useTheme";
import { useAuth } from "../../../hooks/useAuth";
import { useCVProfile } from "../../../hooks/useCVProfile";
import type { CVInjuryEntry } from "../../../hooks/useCVProfile";
import type { MainStackParamList } from "../../../navigation/types";
import { fontFamily } from "../../../theme";
import { SmartIcon } from "../../../components/SmartIcon";
import { CVScreen } from "../components/CVScreen";
import { InfoCard, InfoRow, EmptyState, Badge } from "../components/primitives";
import { Loader } from "../../../components/Loader";

export default function CVHealthStatusScreen() {
  const nav = useNavigation<NativeStackNavigationProp<MainStackParamList>>();
  const { colors } = useTheme();
  const { user } = useAuth();
  const { data, isLoading, updateMedicalConsent } = useCVProfile(user?.uid ?? "");

  const toggleConsent = useCallback(
    async (key: "share_with_coach" | "share_with_scouts_summary" | "share_raw_data", value: boolean) => {
      const ok = await updateMedicalConsent({ [key]: value } as any);
      if (!ok && Platform.OS !== "web") Alert.alert("Consent", "Could not update. Try again.");
    },
    [updateMedicalConsent]
  );

  if (isLoading || !data) {
    return (
      <CVScreen
        label="Health Status"
        onBack={() => nav.goBack()}
        scroll={false}
        contentContainerStyle={styles.loadingContainer}
      >
        <Loader />
      </CVScreen>
    );
  }

  const hs = data.health_status;
  const heroIcon =
    hs.overall === "fully_fit" ? "checkmark-circle-outline" :
    hs.overall === "returning" ? "time-outline" :
    "alert-circle-outline";
  const heroBg =
    hs.overall === "fully_fit" ? colors.sage15 :
    hs.overall === "returning" ? colors.cream06 :
    colors.cream06;
  const heroBorder =
    hs.overall === "fully_fit" ? colors.sage30 :
    hs.overall === "returning" ? colors.cream10 :
    colors.cream10;
  const heroFg =
    hs.overall === "fully_fit" ? colors.accent :
    hs.overall === "returning" ? colors.body :
    colors.body;

  return (
    <CVScreen label="Health Status" onBack={() => nav.goBack()}>
      <View style={[styles.hero, { backgroundColor: heroBg, borderColor: heroBorder }]}>
        <View style={[styles.heroIcon, { backgroundColor: heroBorder }]}>
          <SmartIcon name={heroIcon as any} size={24} color={heroFg} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[styles.heroLabel, { color: heroFg }]}>CURRENT STATUS</Text>
          <Text style={[styles.heroStatus, { color: heroFg }]}>{hs.status_label}</Text>
          <Text style={[styles.heroDetail, { color: heroFg, opacity: 0.8 }]}>{hs.status_detail}</Text>
        </View>
        {hs.overall === "fully_fit" ? (
          <View style={[styles.clearedStamp, { borderColor: colors.sage30 }]}>
            <Text style={[styles.clearedText, { color: colors.accent }]}>CLEARED</Text>
          </View>
        ) : null}
      </View>

      <InfoCard overline="Availability" badge={{ label: "Auto", tone: "auto" }}>
        <InfoRow
          label="Match ready"
          value={hs.availability.match_ready ? "Yes" : "No"}
          accent={hs.availability.match_ready}
          divider={false}
        />
        <InfoRow
          label="Training load"
          value={capitalize(hs.availability.training_load)}
          accent={hs.availability.training_load === "full"}
        />
        <InfoRow
          label="Restrictions"
          value={hs.availability.restrictions.length === 0 ? "None" : hs.availability.restrictions.join(", ")}
        />
        <InfoRow
          label="Last screening"
          value={formatDate(hs.availability.last_screening_date)}
        />
      </InfoCard>

      <InfoCard
        overline="Injury History"
        badge={{
          label: hs.injury_log.filter((i) => i.status !== "cleared").length > 0
            ? `${hs.injury_log.filter((i) => i.status !== "cleared").length} open`
            : "0 open",
          tone: hs.injury_log.filter((i) => i.status !== "cleared").length > 0 ? "draft" : "done",
        }}
      >
        {hs.injury_log.length === 0 ? (
          <EmptyState
            icon="bandage-outline"
            title="No logged injuries"
            description="Any injury you log, or tomo detects via load spikes, appears here."
          />
        ) : (
          hs.injury_log.map((entry, i) => <InjuryRow key={entry.id} entry={entry} divider={i > 0} />)
        )}
      </InfoCard>

      <InfoCard
        overline="Medical Consent"
        badge={{ label: hs.medical_consent.signed ? "Signed" : "Off", tone: hs.medical_consent.signed ? "done" : "empty" }}
      >
        <ConsentRow
          label="Share with club coach"
          hint="Full view of availability + injury detail"
          value={hs.medical_consent.share_with_coach}
          onValueChange={(v) => toggleConsent("share_with_coach", v)}
        />
        <ConsentRow
          label="Share with scouts"
          hint="Summary only (status / availability / last screening)"
          value={hs.medical_consent.share_with_scouts_summary}
          onValueChange={(v) => toggleConsent("share_with_scouts_summary", v)}
        />
        <ConsentRow
          label="Share raw health data"
          hint="Wearable heart rate, HRV, load detail"
          value={hs.medical_consent.share_raw_data}
          onValueChange={(v) => toggleConsent("share_raw_data", v)}
        />
      </InfoCard>
    </CVScreen>
  );
}

function InjuryRow({ entry, divider }: { entry: CVInjuryEntry; divider: boolean }) {
  const { colors } = useTheme();
  return (
    <View
      style={[
        styles.injuryRow,
        divider ? { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.cream10 } : null,
      ]}
    >
      <View style={{ flex: 1 }}>
        <Text style={[styles.injuryTitle, { color: colors.tomoCream }]}>
          {entry.body_part}
          {entry.side ? ` (${entry.side})` : ""}
        </Text>
        <Text style={[styles.injuryMeta, { color: colors.muted }]}>
          {formatDate(entry.date_occurred)} · {entry.severity}
          {entry.cleared_at ? ` · cleared ${formatDate(entry.cleared_at)}` : ""}
        </Text>
      </View>
      <Badge
        label={entry.status}
        tone={entry.status === "cleared" ? "done" : entry.status === "active" ? "warning" : "draft"}
      />
    </View>
  );
}

function ConsentRow({
  label, hint, value, onValueChange,
}: {
  label: string;
  hint: string;
  value: boolean;
  onValueChange: (v: boolean) => void;
}) {
  const { colors } = useTheme();
  return (
    <View style={[styles.consentRow, { borderTopColor: colors.cream10 }]}>
      <View style={{ flex: 1 }}>
        <Text style={[styles.consentLabel, { color: colors.tomoCream }]}>{label}</Text>
        <Text style={[styles.consentHint, { color: colors.muted }]}>{hint}</Text>
      </View>
      <Switch
        value={value}
        onValueChange={onValueChange}
        thumbColor={value ? colors.accent : colors.cream20}
        trackColor={{ false: colors.cream10, true: colors.sage30 }}
      />
    </View>
  );
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  try {
    const d = new Date(iso);
    return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
  } catch {
    return iso;
  }
}

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingBottom: 0,
  },
  hero: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 16,
    borderRadius: 14,
    borderWidth: 1,
  },
  heroIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
  },
  heroLabel: {
    fontFamily: fontFamily.medium,
    fontSize: 9,
    letterSpacing: 1.4,
    marginBottom: 4,
  },
  heroStatus: {
    fontFamily: fontFamily.semiBold,
    fontSize: 18,
    letterSpacing: -0.3,
    marginBottom: 2,
  },
  heroDetail: {
    fontFamily: fontFamily.regular,
    fontSize: 11,
    lineHeight: 16,
  },
  clearedStamp: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
    borderWidth: 1,
    transform: [{ rotate: "-8deg" }],
  },
  clearedText: {
    fontFamily: fontFamily.semiBold,
    fontSize: 10,
    letterSpacing: 1.5,
  },
  injuryRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    paddingVertical: 10,
  },
  injuryTitle: {
    fontFamily: fontFamily.medium,
    fontSize: 13,
    marginBottom: 2,
  },
  injuryMeta: {
    fontFamily: fontFamily.regular,
    fontSize: 11,
  },
  consentRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    gap: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  consentLabel: {
    fontFamily: fontFamily.medium,
    fontSize: 13,
    marginBottom: 2,
  },
  consentHint: {
    fontFamily: fontFamily.regular,
    fontSize: 11,
    lineHeight: 16,
  },
});
