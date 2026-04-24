/**
 * CVPlayerProfileScreen — mock 03.
 * AI summary + Edit/Regenerate + Key Signals + generation log.
 */

import React, { useState, useCallback } from "react";
import {
  View, Text, Pressable, StyleSheet, Platform, Alert,
} from "react-native";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useTheme } from "../../../hooks/useTheme";
import { useAuth } from "../../../hooks/useAuth";
import { useCVProfile } from "../../../hooks/useCVProfile";
import type { MainStackParamList } from "../../../navigation/types";
import type { CVKeySignal } from "../../../hooks/useCVProfile";
import { fontFamily } from "../../../theme";
import { SmartIcon } from "../../../components/SmartIcon";
import { CVScreen } from "../components/CVScreen";
import { InfoCard, Badge } from "../components/primitives";
import { Loader } from "../../../components/Loader";

export default function CVPlayerProfileScreen() {
  const nav = useNavigation<NativeStackNavigationProp<MainStackParamList>>();
  const { colors } = useTheme();
  const { user } = useAuth();
  const { data, isLoading, regenerateAISummary, approveAISummary } = useCVProfile(user?.uid ?? "");
  const [busy, setBusy] = useState<null | "regenerate" | "approve">(null);

  const handleRegenerate = useCallback(async () => {
    setBusy("regenerate");
    const res = await regenerateAISummary(true);
    setBusy(null);
    if (!res.generated) {
      if (Platform.OS === "web") console.warn("Regeneration failed");
      else Alert.alert("Regenerate", "Could not regenerate right now. Try again in a moment.");
    }
  }, [regenerateAISummary]);

  const handleApprove = useCallback(async () => {
    setBusy("approve");
    const ok = await approveAISummary();
    setBusy(null);
    if (!ok && Platform.OS !== "web") {
      Alert.alert("Approve", "Approval failed. Try again.");
    }
  }, [approveAISummary]);

  if (isLoading || !data) {
    return (
      <CVScreen
        label="Player Profile"
        onBack={() => nav.goBack()}
        scroll={false}
        contentContainerStyle={styles.loadingContainer}
      >
        <Loader />
      </CVScreen>
    );
  }

  const { player_profile: pp } = data;

  const statusBadge =
    pp.ai_summary_status === "approved"   ? { label: "Done",         tone: "done" as const } :
    pp.ai_summary_status === "needs_update" ? { label: "Needs update", tone: "draft" as const } :
    pp.ai_summary                          ? { label: "Draft",        tone: "draft" as const } :
                                             { label: "Empty",        tone: "empty" as const };

  return (
    <CVScreen label="Player Profile" onBack={() => nav.goBack()}>
      <InfoCard overline="AI Summary" badge={statusBadge}>
        {pp.ai_summary_last_generated ? (
          <Text style={[styles.subline, { color: colors.muted }]}>
            Generated from verified data · {formatDate(pp.ai_summary_last_generated)}
          </Text>
        ) : null}
        {pp.ai_summary_status === "approved" && pp.ai_summary_approved_at ? (
          <View style={styles.approvedRow}>
            <SmartIcon name="checkmark-circle-outline" size={13} color={colors.accent} />
            <Text style={[styles.approvedText, { color: colors.accent }]}>
              Approved · {formatDate(pp.ai_summary_approved_at)}
            </Text>
          </View>
        ) : null}

        {pp.ai_summary ? (
          <View style={[styles.quote, { backgroundColor: colors.cream06, borderLeftColor: colors.accent }]}>
            <Text style={[styles.quoteText, { color: colors.tomoCream }]}>
              {pp.ai_summary}
            </Text>
          </View>
        ) : (
          <View style={[styles.emptyQuote, { borderColor: colors.cream10 }]}>
            <Text style={[styles.emptyQuoteText, { color: colors.muted }]}>
              No summary yet. Tap Regenerate to have Tomo draft one from your verified data.
            </Text>
          </View>
        )}

        <View style={styles.btnRow}>
          <Pressable
            onPress={handleRegenerate}
            disabled={busy !== null}
            style={({ pressed }) => [
              styles.btn,
              {
                backgroundColor: pressed ? colors.cream10 : colors.cream06,
                borderColor: colors.cream10,
                opacity: busy ? 0.5 : 1,
              },
            ]}
          >
            {busy === "regenerate" ? (
              <Loader size="sm" />
            ) : (
              <SmartIcon name="refresh-outline" size={13} color={colors.tomoCream} />
            )}
            <Text style={[styles.btnText, { color: colors.tomoCream }]}>
              {pp.ai_summary ? "Regenerate" : "Generate"}
            </Text>
          </Pressable>

          {pp.ai_summary && pp.ai_summary_status !== "approved" ? (
            <Pressable
              onPress={handleApprove}
              disabled={busy !== null}
              style={({ pressed }) => [
                styles.btn,
                {
                  backgroundColor: pressed ? colors.sage15 : colors.sage08,
                  borderColor: colors.sage30,
                  opacity: busy ? 0.5 : 1,
                },
              ]}
            >
              {busy === "approve" ? (
                <Loader size="sm" />
              ) : (
                <SmartIcon name="checkmark-outline" size={13} color={colors.accent} />
              )}
              <Text style={[styles.btnText, { color: colors.accent }]}>Approve</Text>
            </Pressable>
          ) : null}
        </View>
      </InfoCard>

      <InfoCard overline="Key Signals" badge={{ label: "Auto", tone: "auto" }}>
        <Text style={[styles.subline, { color: colors.muted, marginBottom: 12 }]}>
          What tomo highlighted
        </Text>

        {pp.key_signals.strengths.length === 0 && pp.key_signals.focus_areas.length === 0 ? (
          <Text style={[styles.emptyHint, { color: colors.muted }]}>
            Log more tests to generate signals.
          </Text>
        ) : (
          <>
            {pp.key_signals.strengths.map((s) => (
              <SignalRow key={s.metric_key} signal={s} kind="strength" />
            ))}
            {pp.key_signals.physical_maturity ? (
              <View style={styles.signalRow}>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.signalLabel, { color: colors.tomoCream }]}>
                    Physical maturity
                  </Text>
                  <Text style={[styles.signalDetail, { color: colors.muted }]}>
                    {pp.key_signals.physical_maturity.label} · {pp.key_signals.physical_maturity.detail}
                  </Text>
                </View>
              </View>
            ) : null}
            {pp.key_signals.focus_areas.map((s) => (
              <SignalRow key={s.metric_key} signal={s} kind="focus" />
            ))}
          </>
        )}
      </InfoCard>

      {pp.versions.length > 0 ? (
        <InfoCard overline={`Generation log · ${pp.versions.length} versions`}>
          {pp.versions.slice(0, 6).map((v, i) => (
            <View
              key={v.version_number}
              style={[styles.versionRow, i > 0 ? { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.cream10 } : null]}
            >
              <View
                style={[
                  styles.versionDot,
                  {
                    backgroundColor: v.approved ? colors.accent : colors.cream20,
                    borderColor: v.approved ? colors.sage30 : colors.cream10,
                  },
                ]}
              />
              <Text style={[styles.versionText, { color: colors.tomoCream }]}>
                v{v.version_number}
              </Text>
              <Text style={[styles.versionDate, { color: colors.muted }]}>
                {formatDate(v.generated_at)}
              </Text>
              {v.approved ? <Badge label="Approved" tone="done" /> : null}
            </View>
          ))}
        </InfoCard>
      ) : null}
    </CVScreen>
  );
}

function SignalRow({ signal, kind }: { signal: CVKeySignal; kind: "strength" | "focus" }) {
  const { colors } = useTheme();
  return (
    <View style={styles.signalRow}>
      <View style={{ flex: 1 }}>
        <Text style={[styles.signalLabel, { color: colors.tomoCream }]}>{signal.label}</Text>
        <Text style={[styles.signalDetail, { color: colors.muted }]}>
          {signal.percentile_label} · {signal.detail}
        </Text>
      </View>
      <Text
        style={[
          styles.signalTag,
          { color: kind === "strength" ? colors.accent : colors.body },
        ]}
      >
        {kind === "strength" ? "STRENGTH" : "FOCUS"}
      </Text>
    </View>
  );
}

function formatDate(iso: string | null): string {
  if (!iso) return "";
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
  subline: {
    fontFamily: fontFamily.regular,
    fontSize: 11,
    marginBottom: 8,
    marginTop: -4,
  },
  approvedRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 10,
  },
  approvedText: {
    fontFamily: fontFamily.medium,
    fontSize: 11,
  },
  quote: {
    borderLeftWidth: 3,
    paddingLeft: 12,
    paddingRight: 10,
    paddingVertical: 10,
    borderRadius: 8,
    marginBottom: 12,
  },
  quoteText: {
    fontFamily: fontFamily.regular,
    fontStyle: "italic",
    fontSize: 13,
    lineHeight: 20,
  },
  emptyQuote: {
    borderWidth: 1,
    borderStyle: "dashed",
    borderRadius: 8,
    padding: 12,
    marginBottom: 12,
  },
  emptyQuoteText: {
    fontFamily: fontFamily.regular,
    fontSize: 12,
    lineHeight: 18,
  },
  btnRow: {
    flexDirection: "row",
    gap: 8,
  },
  btn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 9,
    borderRadius: 8,
    borderWidth: 1,
  },
  btnText: {
    fontFamily: fontFamily.medium,
    fontSize: 12,
  },
  emptyHint: {
    fontFamily: fontFamily.regular,
    fontSize: 12,
  },
  signalRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    gap: 10,
  },
  signalLabel: {
    fontFamily: fontFamily.medium,
    fontSize: 13,
    marginBottom: 2,
  },
  signalDetail: {
    fontFamily: fontFamily.regular,
    fontSize: 11,
  },
  signalTag: {
    fontFamily: fontFamily.medium,
    fontSize: 9,
    letterSpacing: 1.2,
  },
  versionRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 10,
  },
  versionDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    borderWidth: 1,
  },
  versionText: {
    fontFamily: fontFamily.medium,
    fontSize: 12,
    width: 32,
  },
  versionDate: {
    flex: 1,
    fontFamily: fontFamily.regular,
    fontSize: 11,
  },
});
