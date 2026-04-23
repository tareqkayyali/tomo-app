import React from "react";
import { View, Text, Image, StyleSheet } from "react-native";
import { useTheme } from "../../../hooks/useTheme";
import { fontFamily } from "../../../theme";
import type { CVIdentity } from "../../../hooks/useCVProfile";

interface Props {
  identity: CVIdentity;
  isPublished: boolean;
  verified: boolean;
}

export function CVHero({ identity, isPublished, verified }: Props) {
  const { colors } = useTheme();

  const metaLine1 = [
    identity.primary_position,
    capitalize(identity.sport),
    identity.age != null ? `Age ${identity.age}` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  const metaLine2 = [
    identity.nationality,
    identity.preferred_foot ? `${capitalize(identity.preferred_foot)} foot` : null,
    formatPhv(identity.phv_stage, identity.phv_offset_years),
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <View style={[styles.card, { backgroundColor: colors.cream03, borderColor: colors.cream10 }]}>
      <View style={styles.row}>
        <Avatar photoUrl={identity.photo_url} />

        <View style={{ flex: 1 }}>
          <View style={styles.badgeRow}>
            <Text style={[styles.badge, { color: colors.muted }]}>
              {isPublished ? "PUBLISHED PLAYER" : "REGISTERED PLAYER"}
            </Text>
            {verified && (
              <View style={[styles.verifiedChip, { backgroundColor: colors.sage15, borderColor: colors.sage30 }]}>
                <Text style={[styles.verifiedText, { color: colors.accent }]}>VERIFIED</Text>
              </View>
            )}
          </View>

          <Text style={[styles.name, { color: colors.tomoCream }]}>
            {identity.full_name || "Unnamed athlete"}
          </Text>

          {metaLine1 ? (
            <Text style={[styles.meta, { color: colors.body }]}>{metaLine1}</Text>
          ) : null}
          {metaLine2 ? (
            <Text style={[styles.meta, { color: colors.muted }]}>{metaLine2}</Text>
          ) : null}
        </View>
      </View>
    </View>
  );
}

function Avatar({ photoUrl }: { photoUrl: string | null }) {
  const { colors } = useTheme();
  if (photoUrl) {
    return <Image source={{ uri: photoUrl }} style={styles.avatar} />;
  }
  return (
    <View style={[styles.avatar, styles.avatarFallback, { backgroundColor: colors.cream06, borderColor: colors.cream10 }]} />
  );
}

function capitalize(s: string | null | undefined): string {
  if (!s) return "";
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function formatPhv(stage: string | null, offset: number | null): string | null {
  if (!stage) return null;
  const label = stage === "POST" ? "Post-PHV" : stage === "PRE" ? "Pre-PHV" : "Circa-PHV";
  if (offset == null) return label;
  const sign = offset > 0 ? "+" : "";
  return `${label} (${sign}${offset.toFixed(1)}y)`;
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 18,
    borderWidth: 1,
    padding: 16,
  },
  row: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 14,
  },
  avatar: {
    width: 64,
    height: 64,
    borderRadius: 32,
  },
  avatarFallback: {
    borderWidth: 1,
  },
  badgeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 6,
  },
  badge: {
    fontFamily: fontFamily.medium,
    fontSize: 9,
    letterSpacing: 1.5,
  },
  verifiedChip: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    borderWidth: 1,
  },
  verifiedText: {
    fontFamily: fontFamily.medium,
    fontSize: 8,
    letterSpacing: 1,
  },
  name: {
    fontFamily: fontFamily.semiBold,
    fontSize: 20,
    letterSpacing: -0.3,
    marginBottom: 4,
  },
  meta: {
    fontFamily: fontFamily.regular,
    fontSize: 12,
    lineHeight: 17,
  },
});
