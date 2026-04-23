/**
 * CVReferencesScreen — mock 09.
 * Reference list + How-it-works 4-step + Who-to-ask (ASK pills).
 */

import React, { useState, useCallback } from "react";
import {
  View, Text, Pressable, StyleSheet, Modal, TextInput,
  Platform, Alert, Share, KeyboardAvoidingView,
} from "react-native";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useTheme } from "../../../hooks/useTheme";
import { useAuth } from "../../../hooks/useAuth";
import { useCVProfile } from "../../../hooks/useCVProfile";
import type { CVReferenceEntry } from "../../../hooks/useCVProfile";
import type { MainStackParamList } from "../../../navigation/types";
import { fontFamily } from "../../../theme";
import { SmartIcon } from "../../../components/SmartIcon";
import { CVScreen } from "../components/CVScreen";
import { InfoCard, EmptyState, Chip, Badge } from "../components/primitives";
import { Loader } from "../../../components/Loader";

const HOW_IT_WORKS = [
  { title: "Send request",      desc: "Enter name, role and email — we send a short form" },
  { title: "They write",        desc: "Coach submits rating + 2 lines. 60 seconds." },
  { title: "Identity check",    desc: "Tomo verifies they coached/saw you" },
  { title: "Auto-publish",      desc: "Verified reference appears on your CV with a badge" },
];

const WHO_TO_ASK = [
  { role: "Current coach",         hint: "Closest to your week-to-week level" },
  { role: "Previous academy coach", hint: "Speaks to your development arc" },
  { role: "National-team scout",    hint: "Rare, but a huge signal" },
];

export default function CVReferencesScreen() {
  const nav = useNavigation<NativeStackNavigationProp<MainStackParamList>>();
  const { colors } = useTheme();
  const { user } = useAuth();
  const { data, isLoading, requestReference } = useCVProfile(user?.uid ?? "");
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState({ role: "", name: "", referee_role: "", club: "", email: "" });
  const [busy, setBusy] = useState(false);

  const openModal = useCallback((roleLabel: string) => {
    setForm({ role: roleLabel, name: "", referee_role: roleLabel, club: "", email: "" });
    setModalOpen(true);
  }, []);

  const submit = useCallback(async () => {
    if (!form.name || !form.email || !form.club) {
      if (Platform.OS !== "web") Alert.alert("Missing", "Name, club, and email are required.");
      return;
    }
    setBusy(true);
    const res = await requestReference({
      referee_name: form.name,
      referee_role: form.referee_role,
      club_institution: form.club,
      email: form.email,
    });
    setBusy(false);
    if (!res) {
      if (Platform.OS !== "web") Alert.alert("Request", "Could not send request. Try again.");
      return;
    }
    setModalOpen(false);
    try {
      if (Platform.OS === "web") {
        await (navigator as any)?.clipboard?.writeText?.(res.referee_link);
      } else {
        await Share.share({ message: `Write me a reference: ${res.referee_link}` });
      }
    } catch { /* user dismissed */ }
  }, [form, requestReference]);

  if (isLoading || !data) {
    return (
      <CVScreen label="References" onBack={() => nav.goBack()}>
        <Loader style={{ marginTop: 64 }} />
      </CVScreen>
    );
  }

  const hasAny = data.references.length > 0;

  return (
    <CVScreen label="References" onBack={() => nav.goBack()}>
      <InfoCard
        overline="Coach & Scout References"
        badge={hasAny ? { label: `${data.references.length} tracked`, tone: "done" } : { label: "Empty", tone: "empty" }}
      >
        {hasAny ? (
          data.references.map((r) => <ReferenceRow key={r.id} entry={r} />)
        ) : (
          <EmptyState
            icon="person-outline"
            title="No references yet"
            description="A 2-line note from a coach or scout can make your CV unignorable. Request via link — they sign it in seconds."
          />
        )}
      </InfoCard>

      <InfoCard overline="How It Works" badge={{ label: "4 steps", tone: "neutral" }}>
        {HOW_IT_WORKS.map((step, i) => (
          <View
            key={i}
            style={[
              styles.stepRow,
              i > 0 ? { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.cream10 } : null,
            ]}
          >
            <Text style={[styles.stepNum, { color: colors.muted }]}>{String(i + 1).padStart(2, "0")}</Text>
            <View style={{ flex: 1 }}>
              <Text style={[styles.stepTitle, { color: colors.tomoCream }]}>{step.title}</Text>
              <Text style={[styles.stepDesc, { color: colors.muted }]}>{step.desc}</Text>
            </View>
          </View>
        ))}
      </InfoCard>

      <InfoCard overline="Who to Ask" badge={{ label: "3 ideas", tone: "neutral" }}>
        {WHO_TO_ASK.map((w, i) => (
          <View
            key={w.role}
            style={[
              styles.askRow,
              i > 0 ? { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.cream10 } : null,
            ]}
          >
            <View style={{ flex: 1 }}>
              <Text style={[styles.askRole, { color: colors.tomoCream }]}>{w.role}</Text>
              <Text style={[styles.askHint, { color: colors.muted }]}>{w.hint}</Text>
            </View>
            <Chip label="+ ASK" tone="primary" onPress={() => openModal(w.role)} />
          </View>
        ))}
      </InfoCard>

      <Modal visible={modalOpen} transparent animationType="fade" onRequestClose={() => setModalOpen(false)}>
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          style={[styles.modalBackdrop, { backgroundColor: "rgba(0,0,0,0.55)" }]}
        >
          <View style={[styles.modalCard, { backgroundColor: colors.background, borderColor: colors.cream10 }]}>
            <Text style={[styles.modalTitle, { color: colors.tomoCream }]}>Ask for a reference</Text>
            <Text style={[styles.modalSub, { color: colors.muted }]}>Role: {form.role}</Text>

            <ModalInput
              label="Name"
              value={form.name}
              onChangeText={(v) => setForm({ ...form, name: v })}
              placeholder="e.g. Yazan Abu Odeh"
            />
            <ModalInput
              label="Club / institution"
              value={form.club}
              onChangeText={(v) => setForm({ ...form, club: v })}
              placeholder="e.g. Al-Wehdat"
            />
            <ModalInput
              label="Email"
              value={form.email}
              onChangeText={(v) => setForm({ ...form, email: v })}
              placeholder="coach@club.com"
              keyboardType="email-address"
              autoCapitalize="none"
            />

            <View style={styles.modalBtnRow}>
              <Pressable
                onPress={() => setModalOpen(false)}
                style={({ pressed }) => [
                  styles.modalBtn,
                  { backgroundColor: pressed ? colors.cream10 : colors.cream06, borderColor: colors.cream10 },
                ]}
              >
                <Text style={[styles.modalBtnText, { color: colors.body }]}>Cancel</Text>
              </Pressable>
              <Pressable
                onPress={submit}
                disabled={busy}
                style={({ pressed }) => [
                  styles.modalBtn,
                  {
                    backgroundColor: pressed ? colors.sage15 : colors.sage08,
                    borderColor: colors.sage30,
                    opacity: busy ? 0.5 : 1,
                  },
                ]}
              >
                {busy ? (
                  <Loader size="sm" />
                ) : (
                  <Text style={[styles.modalBtnText, { color: colors.accent }]}>Send request</Text>
                )}
              </Pressable>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </CVScreen>
  );
}

function ReferenceRow({ entry }: { entry: CVReferenceEntry }) {
  const { colors } = useTheme();
  const statusTone: "done" | "draft" | "neutral" | "warning" =
    entry.status === "published"          ? "done" :
    entry.status === "submitted"          ? "draft" :
    entry.status === "identity_verified"  ? "draft" :
    entry.status === "rejected"           ? "warning" :
                                            "neutral";
  const statusLabel =
    entry.status === "published"         ? "Verified" :
    entry.status === "submitted"         ? "Awaiting check" :
    entry.status === "identity_verified" ? "Verifying" :
    entry.status === "rejected"          ? "Rejected" :
                                           "Requested";
  return (
    <View style={[styles.refRow, { borderTopColor: colors.cream10 }]}>
      <View style={{ flex: 1 }}>
        <Text style={[styles.refName, { color: colors.tomoCream }]}>{entry.referee_name}</Text>
        <Text style={[styles.refMeta, { color: colors.muted }]}>
          {entry.referee_role} · {entry.club_institution}
        </Text>
        {entry.submitted_note ? (
          <Text style={[styles.refNote, { color: colors.body }]} numberOfLines={2}>
            "{entry.submitted_note}"
          </Text>
        ) : null}
      </View>
      <Badge label={statusLabel} tone={statusTone} />
    </View>
  );
}

function ModalInput({
  label, value, onChangeText, placeholder, keyboardType, autoCapitalize,
}: {
  label: string;
  value: string;
  onChangeText: (v: string) => void;
  placeholder: string;
  keyboardType?: any;
  autoCapitalize?: any;
}) {
  const { colors } = useTheme();
  return (
    <View style={{ marginBottom: 12 }}>
      <Text style={[styles.inputLabel, { color: colors.muted }]}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.muted}
        keyboardType={keyboardType}
        autoCapitalize={autoCapitalize}
        style={[
          styles.input,
          {
            color: colors.tomoCream,
            backgroundColor: colors.cream06,
            borderColor: colors.cream10,
          },
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  stepRow: {
    flexDirection: "row",
    gap: 12,
    paddingVertical: 10,
  },
  stepNum: {
    fontFamily: fontFamily.medium,
    fontSize: 11,
    width: 22,
  },
  stepTitle: {
    fontFamily: fontFamily.medium,
    fontSize: 13,
    marginBottom: 2,
  },
  stepDesc: {
    fontFamily: fontFamily.regular,
    fontSize: 11,
    lineHeight: 16,
  },
  askRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 12,
  },
  askRole: {
    fontFamily: fontFamily.medium,
    fontSize: 13,
    marginBottom: 2,
  },
  askHint: {
    fontFamily: fontFamily.regular,
    fontSize: 11,
  },
  refRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    paddingVertical: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  refName: {
    fontFamily: fontFamily.semiBold,
    fontSize: 13,
    marginBottom: 2,
  },
  refMeta: {
    fontFamily: fontFamily.regular,
    fontSize: 11,
  },
  refNote: {
    fontFamily: fontFamily.regular,
    fontStyle: "italic",
    fontSize: 11,
    marginTop: 4,
    lineHeight: 16,
  },
  modalBackdrop: {
    flex: 1,
    justifyContent: "center",
    padding: 24,
  },
  modalCard: {
    borderRadius: 18,
    borderWidth: 1,
    padding: 20,
  },
  modalTitle: {
    fontFamily: fontFamily.semiBold,
    fontSize: 18,
    letterSpacing: -0.3,
    marginBottom: 4,
  },
  modalSub: {
    fontFamily: fontFamily.regular,
    fontSize: 12,
    marginBottom: 16,
  },
  inputLabel: {
    fontFamily: fontFamily.medium,
    fontSize: 10,
    letterSpacing: 1.2,
    textTransform: "uppercase",
    marginBottom: 6,
  },
  input: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontFamily: fontFamily.regular,
    fontSize: 14,
  },
  modalBtnRow: {
    flexDirection: "row",
    gap: 10,
    marginTop: 4,
  },
  modalBtn: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 1,
  },
  modalBtnText: {
    fontFamily: fontFamily.medium,
    fontSize: 13,
  },
});
