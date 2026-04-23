/**
 * CVVideoMediaScreen — mock 08.
 * Highlight reel empty state + Upload/Link options + Coach tips.
 */

import React from "react";
import { View, Text, Pressable, StyleSheet, ActivityIndicator, Platform, Alert } from "react-native";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useTheme } from "../../../hooks/useTheme";
import { useAuth } from "../../../hooks/useAuth";
import { useCVProfile } from "../../../hooks/useCVProfile";
import type { MainStackParamList } from "../../../navigation/types";
import { fontFamily } from "../../../theme";
import { SmartIcon } from "../../../components/SmartIcon";
import { CVScreen } from "../components/CVScreen";
import { InfoCard, EmptyState } from "../components/primitives";

const UPLOAD_OPTIONS: Array<{
  key: string;
  icon: string;
  title: string;
  sub: string;
  platform: string | null;
  media_type: "highlight_reel" | "social";
}> = [
  { key: "mp4",       icon: "cloud-upload-outline",  title: "Upload video",     sub: "MP4 · up to 500 MB · 1080p recommended", platform: null,        media_type: "highlight_reel" },
  { key: "youtube",   icon: "logo-youtube",          title: "Link YouTube",     sub: "Paste any public YouTube URL",             platform: "youtube",   media_type: "highlight_reel" },
  { key: "tiktok",    icon: "musical-notes-outline", title: "Link TikTok",      sub: "Paste a public TikTok URL",                platform: "tiktok",    media_type: "social" },
  { key: "instagram", icon: "logo-instagram",        title: "Instagram Reel",   sub: "Paste a public Reel URL",                  platform: "instagram", media_type: "social" },
];

const COACH_TIPS = [
  "Open with your strongest 10 seconds — scouts decide fast.",
  "Show 1v1 moments, not just goals.",
  "Add timestamps or short captions for position/match.",
];

export default function CVVideoMediaScreen() {
  const nav = useNavigation<NativeStackNavigationProp<MainStackParamList>>();
  const { colors } = useTheme();
  const { user } = useAuth();
  const { data, isLoading, addMedia } = useCVProfile(user?.uid ?? "");

  if (isLoading || !data) {
    return (
      <CVScreen label="Video & Media" onBack={() => nav.goBack()}>
        <ActivityIndicator color={colors.accent} style={{ marginTop: 64 }} />
      </CVScreen>
    );
  }

  const highlights = data.media.filter((m) => m.media_type === "highlight_reel");
  const social = data.media.filter((m) => m.media_type !== "highlight_reel");

  const handleAddOption = (opt: typeof UPLOAD_OPTIONS[number]) => {
    if (Platform.OS === "web") {
      const url = (globalThis as any).prompt?.(`Paste the ${opt.title.toLowerCase()} URL`);
      if (!url) return;
      addMedia({
        media_type: opt.media_type,
        platform: opt.platform as any,
        url,
        title: null,
        is_primary: opt.media_type === "highlight_reel" && highlights.length === 0,
      });
    } else {
      Alert.prompt?.(
        opt.title,
        opt.sub,
        (url) => {
          if (!url) return;
          addMedia({
            media_type: opt.media_type,
            platform: opt.platform as any,
            url,
            title: null,
            is_primary: opt.media_type === "highlight_reel" && highlights.length === 0,
          });
        }
      );
    }
  };

  return (
    <CVScreen label="Video & Media" onBack={() => nav.goBack()}>
      <InfoCard
        overline="Highlight Reel"
        badge={highlights.length > 0
          ? { label: `${highlights.length} linked`, tone: "done" }
          : { label: "Empty", tone: "empty" }}
      >
        {highlights.length === 0 ? (
          <EmptyState
            icon="play-circle-outline"
            title="No highlight videos yet"
            description="CVs with highlight videos get 4x more scout views. A 60–90 second reel is the sweet spot."
          />
        ) : (
          highlights.map((m, i) => (
            <View
              key={m.id}
              style={[
                styles.mediaRow,
                i > 0 ? { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.cream10 } : null,
              ]}
            >
              <SmartIcon name="play-circle-outline" size={18} color={colors.accent} />
              <View style={{ flex: 1 }}>
                <Text style={[styles.mediaTitle, { color: colors.tomoCream }]} numberOfLines={1}>
                  {m.title ?? m.platform ?? "Highlight reel"}
                </Text>
                <Text style={[styles.mediaUrl, { color: colors.muted }]} numberOfLines={1}>
                  {m.url}
                </Text>
              </View>
              {m.is_primary ? (
                <View style={[styles.primaryPill, { backgroundColor: colors.sage15, borderColor: colors.sage30 }]}>
                  <Text style={[styles.primaryText, { color: colors.accent }]}>PRIMARY</Text>
                </View>
              ) : null}
            </View>
          ))
        )}
      </InfoCard>

      <InfoCard overline="Upload or Link" badge={{ label: "4 options", tone: "neutral" }}>
        {UPLOAD_OPTIONS.map((opt, i) => (
          <Pressable
            key={opt.key}
            onPress={() => handleAddOption(opt)}
            style={({ pressed }) => [
              styles.optionRow,
              {
                backgroundColor: pressed ? colors.cream06 : "transparent",
                borderTopColor: colors.cream10,
                borderTopWidth: i > 0 ? StyleSheet.hairlineWidth : 0,
              },
            ]}
          >
            <View style={[styles.optionIcon, { backgroundColor: colors.cream06, borderColor: colors.cream10 }]}>
              <SmartIcon name={opt.icon as any} size={16} color={colors.tomoCream} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.optionTitle, { color: colors.tomoCream }]}>{opt.title}</Text>
              <Text style={[styles.optionSub, { color: colors.muted }]}>{opt.sub}</Text>
            </View>
            <SmartIcon name="chevron-forward" size={14} color={colors.muted} />
          </Pressable>
        ))}
      </InfoCard>

      {social.length > 0 ? (
        <InfoCard overline="Also linked" badge={{ label: `${social.length}`, tone: "neutral" }}>
          {social.map((m, i) => (
            <View
              key={m.id}
              style={[
                styles.mediaRow,
                i > 0 ? { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.cream10 } : null,
              ]}
            >
              <SmartIcon
                name={m.platform === "instagram" ? "logo-instagram" : m.platform === "tiktok" ? "musical-notes-outline" : "link-outline"}
                size={16}
                color={colors.muted}
              />
              <Text style={[styles.mediaUrl, { color: colors.muted, flex: 1 }]} numberOfLines={1}>
                {m.url}
              </Text>
            </View>
          ))}
        </InfoCard>
      ) : null}

      <InfoCard overline="Coach Tips" badge={{ label: "Editorial", tone: "neutral" }}>
        {COACH_TIPS.map((tip, i) => (
          <View
            key={i}
            style={[
              styles.tipRow,
              i > 0 ? { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.cream10 } : null,
            ]}
          >
            <Text style={[styles.tipNum, { color: colors.muted }]}>{String(i + 1).padStart(2, "0")}</Text>
            <Text style={[styles.tipText, { color: colors.tomoCream }]}>{tip}</Text>
          </View>
        ))}
      </InfoCard>
    </CVScreen>
  );
}

const styles = StyleSheet.create({
  mediaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 10,
  },
  mediaTitle: {
    fontFamily: fontFamily.medium,
    fontSize: 13,
    marginBottom: 2,
  },
  mediaUrl: {
    fontFamily: fontFamily.regular,
    fontSize: 11,
  },
  primaryPill: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    borderWidth: 1,
  },
  primaryText: {
    fontFamily: fontFamily.medium,
    fontSize: 8,
    letterSpacing: 1,
  },
  optionRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 12,
  },
  optionIcon: {
    width: 32,
    height: 32,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  optionTitle: {
    fontFamily: fontFamily.medium,
    fontSize: 13,
    marginBottom: 2,
  },
  optionSub: {
    fontFamily: fontFamily.regular,
    fontSize: 11,
  },
  tipRow: {
    flexDirection: "row",
    gap: 10,
    paddingVertical: 10,
  },
  tipNum: {
    fontFamily: fontFamily.medium,
    fontSize: 11,
    width: 22,
  },
  tipText: {
    flex: 1,
    fontFamily: fontFamily.regular,
    fontSize: 12,
    lineHeight: 18,
  },
});
