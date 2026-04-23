/**
 * CVIdentityScreen — mock 02. Personal details + sport profile tables.
 * All fields are AUTO-populated from users/snapshot.
 */

import React from "react";
import { View, Text, StyleSheet, Pressable, ActivityIndicator } from "react-native";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useTheme } from "../../../hooks/useTheme";
import { useAuth } from "../../../hooks/useAuth";
import { useCVProfile } from "../../../hooks/useCVProfile";
import type { MainStackParamList } from "../../../navigation/types";
import { fontFamily } from "../../../theme";
import { SmartIcon } from "../../../components/SmartIcon";
import { CVScreen } from "../components/CVScreen";
import { InfoCard, InfoRow, Chip } from "../components/primitives";

export default function CVIdentityScreen() {
  const nav = useNavigation<NativeStackNavigationProp<MainStackParamList>>();
  const { colors } = useTheme();
  const { user } = useAuth();
  const { data, isLoading } = useCVProfile(user?.id ?? "");

  if (isLoading || !data) {
    return (
      <CVScreen label="Player Identity" onBack={() => nav.goBack()}>
        <ActivityIndicator color={colors.accent} style={{ marginTop: 64 }} />
      </CVScreen>
    );
  }

  const { identity, physical } = data;

  const footer = (
    <View style={{ padding: 16, paddingBottom: 32, backgroundColor: colors.background }}>
      <Pressable
        onPress={() => nav.navigate("Profile")}
        style={({ pressed }) => [
          styles.footerBtn,
          { backgroundColor: pressed ? colors.sage15 : colors.sage08, borderColor: colors.sage30 },
        ]}
      >
        <SmartIcon name="create-outline" size={14} color={colors.accent} />
        <Text style={[styles.footerText, { color: colors.accent }]}>EDIT IDENTITY</Text>
      </Pressable>
    </View>
  );

  return (
    <CVScreen label="Player Identity" onBack={() => nav.goBack()} footer={footer}>
      <View style={[styles.hero, { backgroundColor: colors.cream03, borderColor: colors.cream10 }]}>
        <View style={styles.heroRow}>
          <View style={[styles.avatar, { backgroundColor: colors.cream06, borderColor: colors.cream10 }]} />
          <View style={{ flex: 1 }}>
            <Text style={[styles.overline, { color: colors.muted }]}>IDENTITY BLOCK</Text>
            <Text style={[styles.name, { color: colors.tomoCream }]}>
              {identity.full_name || "—"}
            </Text>
            <Text style={[styles.subline, { color: colors.body }]}>
              {[identity.primary_position, capitalize(identity.sport), identity.age_group]
                .filter(Boolean)
                .join(" · ")}
            </Text>
          </View>
        </View>
        <View style={styles.chipRow}>
          {identity.nationality ? <Chip label={identity.nationality} /> : null}
          {identity.preferred_foot ? (
            <Chip label={`${capitalize(identity.preferred_foot)} foot`} />
          ) : null}
          {identity.phv_stage ? (
            <Chip label={formatPhv(identity.phv_stage, identity.phv_offset_years)} />
          ) : null}
        </View>
      </View>

      <InfoCard overline="Personal Details" badge={{ label: "Auto", tone: "auto" }}>
        <Text style={[styles.sectionHint, { color: colors.muted }]}>
          Sourced from your account
        </Text>
        <InfoRow label="Full name" value={identity.full_name || "—"} divider={false} />
        <InfoRow label="Date of birth" value={formatDate(identity.date_of_birth)} />
        <InfoRow label="Nationality" value={identity.nationality || "—"} />
        <InfoRow
          label="Height"
          value={physical.height_cm != null ? `${physical.height_cm} cm` : "—"}
        />
        <InfoRow
          label="Weight"
          value={physical.weight_kg != null ? `${physical.weight_kg} kg` : "—"}
        />
        <InfoRow
          label="Preferred foot"
          value={identity.preferred_foot ? capitalize(identity.preferred_foot) : "—"}
        />
        <InfoRow
          label="Maturity"
          value={formatPhv(identity.phv_stage, identity.phv_offset_years) || "—"}
        />
      </InfoCard>

      <InfoCard overline="Sport Profile" badge={{ label: "Auto", tone: "auto" }}>
        <InfoRow label="Primary sport" value={capitalize(identity.sport)} divider={false} />
        <InfoRow label="Primary position" value={identity.primary_position || "—"} />
        <InfoRow label="Current age group" value={identity.age_group || "—"} />
      </InfoCard>
    </CVScreen>
  );
}

function capitalize(s: string | null | undefined): string {
  if (!s) return "";
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  try {
    const d = new Date(iso);
    const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    return `${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}`;
  } catch {
    return iso;
  }
}

function formatPhv(stage: string | null, offset: number | null): string {
  if (!stage) return "";
  const label = stage === "POST" ? "Post-PHV" : stage === "PRE" ? "Pre-PHV" : "Circa-PHV";
  if (offset == null) return label;
  const sign = offset > 0 ? "+" : "";
  return `${label} (${sign}${offset.toFixed(1)}y)`;
}

const styles = StyleSheet.create({
  hero: {
    borderRadius: 18,
    borderWidth: 1,
    padding: 16,
    gap: 12,
  },
  heroRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
  },
  avatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    borderWidth: 1,
  },
  overline: {
    fontFamily: fontFamily.medium,
    fontSize: 9,
    letterSpacing: 1.5,
    marginBottom: 4,
  },
  name: {
    fontFamily: fontFamily.semiBold,
    fontSize: 18,
    letterSpacing: -0.3,
    marginBottom: 2,
  },
  subline: {
    fontFamily: fontFamily.regular,
    fontSize: 12,
  },
  chipRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
  },
  sectionHint: {
    fontFamily: fontFamily.regular,
    fontSize: 10,
    marginBottom: 6,
    marginTop: -4,
  },
  footerBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 1,
  },
  footerText: {
    fontFamily: fontFamily.medium,
    fontSize: 12,
    letterSpacing: 1.2,
  },
});
