/**
 * CVAwardsCharacterScreen — mock 10.
 * 4 categories (Awards · Leadership · Languages · Character) with +ADD pills.
 */

import React, { useState, useCallback } from "react";
import {
  View, Text, Pressable, StyleSheet, ActivityIndicator, Modal, TextInput,
  Platform, Alert, KeyboardAvoidingView,
} from "react-native";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useTheme } from "../../../hooks/useTheme";
import { useAuth } from "../../../hooks/useAuth";
import { useCVProfile } from "../../../hooks/useCVProfile";
import type { CVCharacterTrait, TraitCategory } from "../../../hooks/useCVProfile";
import type { MainStackParamList } from "../../../navigation/types";
import { fontFamily } from "../../../theme";
import { SmartIcon } from "../../../components/SmartIcon";
import { CVScreen } from "../components/CVScreen";
import { InfoCard, EmptyState, Chip } from "../components/primitives";

const CATEGORIES: Array<{
  key: TraitCategory;
  title: string;
  hint: string;
  example: string;
}> = [
  { key: "award",      title: "Awards & honours",  hint: "Player of tournament, top scorer, MVP",     example: "U17 Cup · Top scorer · 2025" },
  { key: "leadership", title: "Leadership",        hint: "Captaincy, vice-captain, senior roles",      example: "Captain · Al-Wehdat U17 · 2024—" },
  { key: "language",   title: "Languages",         hint: "Spoken and fluency level",                   example: "Arabic · English (B2) · Turkish (A2)" },
  { key: "character",  title: "Character traits",  hint: "Work rate, composure, teamwork",             example: "High work-rate · Calm under pressure" },
];

export default function CVAwardsCharacterScreen() {
  const nav = useNavigation<NativeStackNavigationProp<MainStackParamList>>();
  const { colors } = useTheme();
  const { user } = useAuth();
  const { data, isLoading, addTrait, deleteTrait } = useCVProfile(user?.uid ?? "");
  const [activeCategory, setActiveCategory] = useState<TraitCategory | null>(null);
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState(false);

  const openAdd = useCallback((cat: TraitCategory) => {
    setActiveCategory(cat);
    setTitle("");
  }, []);

  const submit = useCallback(async () => {
    if (!activeCategory || !title.trim()) return;
    setBusy(true);
    const ok = await addTrait({
      trait_category: activeCategory,
      title: title.trim(),
      description: null,
      level: null,
      date: null,
    });
    setBusy(false);
    if (ok) {
      setActiveCategory(null);
      setTitle("");
    } else if (Platform.OS !== "web") {
      Alert.alert("Add", "Could not save. Try again.");
    }
  }, [activeCategory, title, addTrait]);

  if (isLoading || !data) {
    return (
      <CVScreen label="Awards & Character" onBack={() => nav.goBack()}>
        <ActivityIndicator color={colors.accent} style={{ marginTop: 64 }} />
      </CVScreen>
    );
  }

  const ac = data.awards_character;
  const hasAny = ac.total_count > 0;

  const byCategory: Record<TraitCategory, CVCharacterTrait[]> = {
    award:      ac.awards,
    leadership: ac.leadership,
    language:   ac.languages,
    character:  ac.character,
  };

  return (
    <CVScreen label="Awards & Character" onBack={() => nav.goBack()}>
      <InfoCard
        overline="Recognition & Traits"
        badge={hasAny ? { label: `${ac.total_count} entries`, tone: "done" } : { label: "Empty", tone: "empty" }}
      >
        {hasAny ? (
          <Text style={[styles.subline, { color: colors.muted }]}>
            The human side of your CV — recruiters want to see this.
          </Text>
        ) : (
          <EmptyState
            icon="ribbon-outline"
            title="No awards or traits yet"
            description="Add awards, leadership roles, languages, and character traits. This is the human side of the CV."
          />
        )}
      </InfoCard>

      <InfoCard overline="Categories" badge={{ label: "4 groups", tone: "neutral" }}>
        {CATEGORIES.map((cat, i) => (
          <View
            key={cat.key}
            style={[
              styles.catRow,
              i > 0 ? { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.cream10 } : null,
            ]}
          >
            <View style={styles.catHeader}>
              <Text style={[styles.catTitle, { color: colors.tomoCream }]}>{cat.title}</Text>
              <Chip label="+ ADD" tone="primary" onPress={() => openAdd(cat.key)} />
            </View>
            <Text style={[styles.catHint, { color: colors.muted }]}>{cat.hint}</Text>
            {byCategory[cat.key].length > 0 ? (
              <View style={styles.traitChips}>
                {byCategory[cat.key].map((t) => (
                  <Pressable
                    key={t.id}
                    onLongPress={() => {
                      if (Platform.OS === "web") {
                        if ((globalThis as any).confirm?.(`Remove "${t.title}"?`)) deleteTrait(t.id);
                      } else {
                        Alert.alert(t.title, "Remove this entry?", [
                          { text: "Cancel", style: "cancel" },
                          { text: "Remove", style: "destructive", onPress: () => deleteTrait(t.id) },
                        ]);
                      }
                    }}
                  >
                    <View style={[styles.traitChip, { backgroundColor: colors.cream06, borderColor: colors.cream10 }]}>
                      <Text style={[styles.traitText, { color: colors.tomoCream }]}>{t.title}</Text>
                    </View>
                  </Pressable>
                ))}
              </View>
            ) : (
              <Text style={[styles.catExample, { color: colors.body }]}>e.g. {cat.example}</Text>
            )}
          </View>
        ))}
      </InfoCard>

      <Modal
        visible={activeCategory !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setActiveCategory(null)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          style={[styles.modalBackdrop, { backgroundColor: "rgba(0,0,0,0.55)" }]}
        >
          <View style={[styles.modalCard, { backgroundColor: colors.background, borderColor: colors.cream10 }]}>
            <Text style={[styles.modalTitle, { color: colors.tomoCream }]}>
              Add{" "}
              {activeCategory === "award"
                ? "award"
                : activeCategory === "leadership"
                ? "leadership role"
                : activeCategory === "language"
                ? "language"
                : "character trait"}
            </Text>
            <TextInput
              value={title}
              onChangeText={setTitle}
              placeholder="Free text — one line is fine"
              placeholderTextColor={colors.muted}
              autoFocus
              style={[
                styles.input,
                { color: colors.tomoCream, backgroundColor: colors.cream06, borderColor: colors.cream10 },
              ]}
            />
            <View style={styles.modalBtnRow}>
              <Pressable
                onPress={() => setActiveCategory(null)}
                style={({ pressed }) => [
                  styles.modalBtn,
                  { backgroundColor: pressed ? colors.cream10 : colors.cream06, borderColor: colors.cream10 },
                ]}
              >
                <Text style={[styles.modalBtnText, { color: colors.body }]}>Cancel</Text>
              </Pressable>
              <Pressable
                onPress={submit}
                disabled={busy || !title.trim()}
                style={({ pressed }) => [
                  styles.modalBtn,
                  {
                    backgroundColor: pressed ? colors.sage15 : colors.sage08,
                    borderColor: colors.sage30,
                    opacity: busy || !title.trim() ? 0.5 : 1,
                  },
                ]}
              >
                {busy ? (
                  <ActivityIndicator size="small" color={colors.accent} />
                ) : (
                  <Text style={[styles.modalBtnText, { color: colors.accent }]}>Save</Text>
                )}
              </Pressable>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </CVScreen>
  );
}

const styles = StyleSheet.create({
  subline: {
    fontFamily: fontFamily.regular,
    fontSize: 11,
    marginTop: -4,
  },
  catRow: {
    paddingVertical: 14,
    gap: 8,
  },
  catHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  catTitle: {
    fontFamily: fontFamily.semiBold,
    fontSize: 13,
  },
  catHint: {
    fontFamily: fontFamily.regular,
    fontSize: 11,
    lineHeight: 16,
  },
  catExample: {
    fontFamily: fontFamily.regular,
    fontStyle: "italic",
    fontSize: 11,
    marginTop: 2,
  },
  traitChips: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    marginTop: 4,
  },
  traitChip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
    borderWidth: 1,
  },
  traitText: {
    fontFamily: fontFamily.medium,
    fontSize: 11,
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
    marginBottom: 14,
  },
  input: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontFamily: fontFamily.regular,
    fontSize: 14,
    marginBottom: 16,
  },
  modalBtnRow: {
    flexDirection: "row",
    gap: 10,
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
