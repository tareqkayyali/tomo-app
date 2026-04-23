/**
 * CVHubScreen — Player Passport home. Matches mock 01.
 *
 * Landing page for the CV. Shows identity hero, completeness meter,
 * Download PDF + Share Link actions, Next Steps preview, and a sectioned
 * TOC that drills into each of the 10 sub-screens.
 */

import React, { useCallback, useState } from "react";
import { View, Text, Pressable, StyleSheet, ActivityIndicator, Platform, Alert, Share, Linking } from "react-native";
import * as FileSystem from "expo-file-system";
import * as Sharing from "expo-sharing";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useTheme } from "../../../hooks/useTheme";
import { useAuth } from "../../../hooks/useAuth";
import { useCVProfile } from "../../../hooks/useCVProfile";
import type { MainStackParamList } from "../../../navigation/types";
import { fontFamily } from "../../../theme";
import { SmartIcon } from "../../../components/SmartIcon";
import { API_BASE_URL } from "../../../services/apiConfig";
import { getIdToken } from "../../../services/auth";
import { CVScreen } from "../components/CVScreen";
import { CVHero } from "../components/CVHero";
import { CVCompleteness } from "../components/CVCompleteness";
import { NextStepsPreview } from "../components/NextStepsPreview";
import { SectionRow } from "../components/SectionRow";

type Nav = NativeStackNavigationProp<MainStackParamList>;

interface SectionConfig {
  title: string;
  subtitleKey: "player_profile" | "physical_profile" | "playing_positions" | "verified_performance" | "career_history" | "video_media" | "references" | "awards_character" | "health_status" | "identity";
  route: keyof MainStackParamList;
}

const SECTION_ORDER: SectionConfig[] = [
  { title: "Player Identity",      subtitleKey: "identity",             route: "CVIdentity" },
  { title: "Player Profile",       subtitleKey: "player_profile",       route: "CVPlayerProfile" },
  { title: "Physical Profile",     subtitleKey: "physical_profile",     route: "CVPhysicalProfile" },
  { title: "Playing Positions",    subtitleKey: "playing_positions",    route: "CVPlayingPositions" },
  { title: "Verified Performance", subtitleKey: "verified_performance", route: "CVVerifiedPerformance" },
  { title: "Career History",       subtitleKey: "career_history",       route: "CVCareerHistory" },
  { title: "Video & Media",        subtitleKey: "video_media",          route: "CVVideoMedia" },
  { title: "References",           subtitleKey: "references",           route: "CVReferences" },
  { title: "Awards & Character",   subtitleKey: "awards_character",     route: "CVAwardsCharacter" },
  { title: "Health Status",        subtitleKey: "health_status",        route: "CVHealthStatus" },
];

export default function CVHubScreen() {
  const nav = useNavigation<Nav>();
  const { colors } = useTheme();
  const { user } = useAuth();
  const { data: cv, isLoading, error, publish, refetch } = useCVProfile(user?.id ?? "");
  const [downloading, setDownloading] = useState(false);

  const handleShare = useCallback(async () => {
    if (!cv) return;
    let url = cv.share.public_url;
    if (!url) {
      const res = await publish();
      if (!res) {
        if (Platform.OS === "web") console.warn("Publish failed");
        else Alert.alert("Share", "Failed to publish your CV. Try again.");
        return;
      }
      url = res.public_url;
    }
    try {
      if (Platform.OS === "web") {
        await (navigator as any)?.clipboard?.writeText?.(url);
      } else {
        await Share.share({ message: url, url });
      }
    } catch {
      /* user dismissed */
    }
  }, [cv, publish]);

  const handleDownload = useCallback(async () => {
    if (downloading) return;
    setDownloading(true);
    const pdfUrl = `${API_BASE_URL}/api/v1/cv/pdf`;

    try {
      if (Platform.OS === "web") {
        const token = await getIdToken();
        const res = await fetch(pdfUrl, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        if (!res.ok) {
          const fallback = res.headers.get("X-Fallback-URL");
          if (fallback) {
            await Linking.openURL(fallback);
            return;
          }
          throw new Error(`HTTP ${res.status}`);
        }
        const blob = await res.blob();
        const blobUrl = URL.createObjectURL(blob);
        window.open(blobUrl, "_blank");
      } else {
        const token = await getIdToken();
        const targetPath = `${FileSystem.documentDirectory}tomo-cv-${Date.now()}.pdf`;
        const dl = await FileSystem.createDownloadResumable(
          pdfUrl,
          targetPath,
          { headers: token ? { Authorization: `Bearer ${token}` } : {} }
        ).downloadAsync();
        if (!dl) throw new Error("Download failed");
        if (await Sharing.isAvailableAsync()) {
          await Sharing.shareAsync(dl.uri, { mimeType: "application/pdf" });
        } else {
          Alert.alert("Saved", `PDF saved to ${dl.uri}`);
        }
      }
    } catch (err) {
      if (Platform.OS !== "web") {
        Alert.alert(
          "PDF",
          "PDF renderer isn't ready on this deploy. Tap Share Link to send the web version instead."
        );
      }
    } finally {
      setDownloading(false);
    }
  }, [downloading]);

  const rightCluster = (
    <Pressable
      onPress={handleDownload}
      accessibilityRole="button"
      accessibilityLabel="Download PDF"
      style={({ pressed }) => [
        hubStyles.iconBtn,
        { backgroundColor: pressed ? colors.cream06 : colors.cream03, borderColor: colors.cream10 },
      ]}
    >
      <SmartIcon name="download-outline" size={16} color={colors.tomoCream} />
    </Pressable>
  );

  if (error) {
    return (
      <CVScreen label="Player Passport" onBack={() => nav.goBack()}>
        <View style={{ paddingTop: 32, gap: 12 }}>
          <Text style={[hubStyles.errorText, { color: colors.tomoCream, marginTop: 0 }]}>
            Couldn't load your CV.
          </Text>
          <Text
            style={[
              hubStyles.errorText,
              {
                color: colors.muted,
                marginTop: 0,
                fontSize: 11,
                textAlign: "left",
                paddingHorizontal: 16,
              },
            ]}
            selectable
          >
            {error}
          </Text>
          <Pressable
            onPress={refetch}
            style={({ pressed }) => [
              hubStyles.iconBtn,
              {
                alignSelf: "center",
                width: "auto",
                paddingHorizontal: 16,
                backgroundColor: pressed ? colors.sage15 : colors.sage08,
                borderColor: colors.sage30,
              },
            ]}
          >
            <Text style={{ color: colors.accent, fontFamily: fontFamily.medium, fontSize: 12 }}>
              Retry
            </Text>
          </Pressable>
        </View>
      </CVScreen>
    );
  }

  if (isLoading || !cv) {
    return (
      <CVScreen label="Player Passport" onBack={() => nav.goBack()}>
        <View style={{ paddingVertical: 64 }}>
          <ActivityIndicator color={colors.accent} />
        </View>
      </CVScreen>
    );
  }

  const verified =
    cv.verified_performance.sessions_total >= 10 && cv.verified_performance.benchmarks.length >= 2;

  return (
    <CVScreen
      label="Player Passport"
      onBack={() => nav.goBack()}
      right={rightCluster}
    >
      <CVHero identity={cv.identity} isPublished={cv.share.is_published} verified={verified} />

      <View
        style={[
          hubStyles.metricsCard,
          { backgroundColor: colors.cream03, borderColor: colors.cream10 },
        ]}
      >
        <CVCompleteness pct={cv.completeness_pct} />

        <View style={hubStyles.actionRow}>
          <ActionButton
            icon="download-outline"
            label="Download PDF"
            onPress={handleDownload}
            colors={colors}
            tone="primary"
          />
          <ActionButton
            icon="share-outline"
            label={cv.share.is_published ? "Copy link" : "Share link"}
            onPress={handleShare}
            colors={colors}
            tone="secondary"
          />
        </View>
      </View>

      {cv.next_steps.length > 0 ? (
        <NextStepsPreview
          steps={cv.next_steps}
          onOpenRoadmap={() => nav.navigate("CVNextSteps")}
        />
      ) : null}

      <View style={[hubStyles.sectionsCard, { backgroundColor: colors.cream03, borderColor: colors.cream10 }]}>
        <View style={hubStyles.sectionsHeader}>
          <Text style={[hubStyles.overline, { color: colors.muted }]}>SECTIONS</Text>
          <Text style={[hubStyles.totalPill, { color: colors.muted }]}>
            {SECTION_ORDER.length} total
          </Text>
        </View>
        {SECTION_ORDER.map((s, idx) => {
          const state = cv.section_states[s.subtitleKey];
          return (
            <SectionRow
              key={s.route}
              title={s.title}
              state={state}
              onPress={() => nav.navigate(s.route as any)}
            />
          );
        })}
      </View>
    </CVScreen>
  );
}

interface ActionButtonProps {
  icon: string;
  label: string;
  onPress: () => void;
  colors: any;
  tone: "primary" | "secondary";
}

function ActionButton({ icon, label, onPress, colors, tone }: ActionButtonProps) {
  const bg = tone === "primary" ? colors.sage15 : colors.cream06;
  const border = tone === "primary" ? colors.sage30 : colors.cream10;
  const fg = tone === "primary" ? colors.accent : colors.tomoCream;

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        hubStyles.actionBtn,
        {
          backgroundColor: bg,
          borderColor: border,
          opacity: pressed ? 0.85 : 1,
        },
      ]}
    >
      <SmartIcon name={icon as any} size={14} color={fg} />
      <Text style={[hubStyles.actionLabel, { color: fg }]}>{label}</Text>
    </Pressable>
  );
}

const hubStyles = StyleSheet.create({
  errorText: {
    fontFamily: fontFamily.regular,
    fontSize: 13,
    textAlign: "center",
    marginTop: 64,
  },
  iconBtn: {
    width: 36,
    height: 36,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  metricsCard: {
    borderRadius: 18,
    borderWidth: 1,
    padding: 16,
  },
  actionRow: {
    flexDirection: "row",
    gap: 10,
    marginTop: 16,
  },
  actionBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
  },
  actionLabel: {
    fontFamily: fontFamily.medium,
    fontSize: 12,
  },
  sectionsCard: {
    borderRadius: 18,
    borderWidth: 1,
    paddingBottom: 4,
  },
  sectionsHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingTop: 14,
    paddingBottom: 8,
  },
  overline: {
    fontFamily: fontFamily.medium,
    fontSize: 9,
    letterSpacing: 1.5,
  },
  totalPill: {
    fontFamily: fontFamily.regular,
    fontSize: 10,
  },
});
