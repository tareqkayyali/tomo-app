/**
 * CVHubScreen — Player Passport home. Matches mock 01.
 *
 * Landing page for the CV. Shows identity hero, completeness meter,
 * Download PDF + Share Link actions, Next Steps preview, and a sectioned
 * TOC that drills into each of the 10 sub-screens.
 */

import React, { useCallback, useState } from "react";
import { View, Text, Pressable, StyleSheet, Platform, Alert, Share, Linking } from "react-native";
import * as FileSystem from "expo-file-system";
import * as Print from "expo-print";
import * as Sharing from "expo-sharing";
import * as WebBrowser from "expo-web-browser";
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
import { Loader } from "../../../components/Loader";

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
  const { data: cv, isLoading, error, publish, refetch } = useCVProfile(user?.uid ?? "");
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

    try {
      if (Platform.OS === "web") {
        // Web: hit the server-side Playwright endpoint directly.
        const pdfUrl = `${API_BASE_URL}/api/v1/cv/pdf`;
        const token = await getIdToken();
        const res = await fetch(pdfUrl, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        if (!res.ok) {
          const fallback = res.headers.get("X-Fallback-URL");
          if (fallback) { await WebBrowser.openBrowserAsync(fallback); return; }
          throw new Error(`HTTP ${res.status}`);
        }
        const blob = await res.blob();
        const blobUrl = URL.createObjectURL(blob);
        window.open(blobUrl, "_blank");
      } else {
        // Native (iOS / Android): render the CV print page HTML on-device
        // using the platform's own WebKit PDF engine via expo-print.
        // This is reliable on every device and requires no server Chromium.
        if (!cv) throw new Error("No CV data");

        // Ensure the CV is published so the public /t/<slug> page exists.
        let publicUrl = cv.share.public_url;
        if (!publicUrl) {
          const published = await publish();
          if (!published) throw new Error("Publish failed");
          publicUrl = published.public_url;
        }

        const printUrl = `${publicUrl}?print=1`;
        const token = await getIdToken();
        const htmlRes = await fetch(printUrl, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        if (!htmlRes.ok) throw new Error(`Fetch HTML ${htmlRes.status}`);
        const rawHtml = await htmlRes.text();

        // Inject a <base href> so the WebKit print engine resolves the
        // relative CSS / image / font URLs from the right origin. Without
        // this, expo-print sees the HTML in isolation and the stylesheet
        // never loads — producing the unstyled single-column output.
        const origin = new URL(publicUrl).origin;
        const html = /<head[^>]*>/i.test(rawHtml)
          ? rawHtml.replace(/<head([^>]*)>/i, `<head$1><base href="${origin}/" />`)
          : `<base href="${origin}/" />${rawHtml}`;

        const { uri } = await Print.printToFileAsync({ html, base64: false });

        // Present the iOS / Android share sheet so the user can "Save to
        // Files", AirDrop, or open in their PDF viewer of choice.
        if (await Sharing.isAvailableAsync()) {
          await Sharing.shareAsync(uri, {
            mimeType: "application/pdf",
            dialogTitle: "Save your Player CV",
            UTI: "com.adobe.pdf",
          });
        } else if (Platform.OS === "android") {
          const contentUri = await (FileSystem as any).getContentUriAsync(uri);
          await Linking.openURL(contentUri);
        } else {
          await Linking.openURL(uri);
        }
      }
    } catch {
      if (Platform.OS !== "web") {
        Alert.alert("PDF", "Could not generate the PDF. Try again.");
      }
    } finally {
      setDownloading(false);
    }
  }, [cv, publish, downloading]);

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
      <CVScreen
        label="Player Passport"
        onBack={() => nav.goBack()}
        scroll={false}
        contentContainerStyle={hubStyles.loadingContainer}
      >
        <Loader />
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
  loadingContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingBottom: 0,
  },
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
