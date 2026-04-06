/**
 * JournalSheet — Modal bottom sheet for pre/post training journaling.
 * Two tabs: Pre-Training (target) / Post-Training (reflection).
 * Variant copy for standard/recovery/match.
 * Uses React Native Modal (no external bottom sheet library).
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, TextInput, Pressable, Modal, ScrollView,
  StyleSheet, KeyboardAvoidingView, Platform, ActivityIndicator,
} from 'react-native';
import { SmartIcon } from '../SmartIcon';
import { useTheme } from '../../hooks/useTheme';
import { spacing, borderRadius, fontFamily } from '../../theme';
import { emitRefresh } from '../../utils/refreshBus';
import {
  saveJournalPreSession,
  saveJournalPostSession,
  getJournalForEvent,
} from '../../services/api';
import type { JournalEntry } from '../../services/api';
import type { CalendarEvent, JournalState } from '../../types';

import { colors } from '../../theme/colors';

// ── Variant Copy ──────────────────────────────────────────

const VARIANT_COPY = {
  standard: {
    prePrompt: "What's your target today?",
    prePlaceholder: "e.g. Hit 90% of last week's squat PB",
    postPrompt: 'What happened?',
    postPlaceholder: "e.g. Left knee felt better, stuck with pause squats",
    outcomes: [
      { id: 'fell_short', label: 'Fell short', emoji: '' },
      { id: 'hit_it', label: 'Hit it', emoji: '' },
      { id: 'exceeded', label: 'Exceeded', emoji: '' },
    ],
  },
  recovery: {
    prePrompt: 'How are you going into this recovery session?',
    prePlaceholder: 'e.g. Focus on mobility and hydration',
    postPrompt: 'What did you notice?',
    postPlaceholder: 'e.g. Foam rolling helped lower back',
    outcomes: [
      { id: 'fell_short', label: 'Felt rough', emoji: '' },
      { id: 'hit_it', label: 'OK', emoji: '' },
      { id: 'exceeded', label: 'Felt great', emoji: '' },
    ],
  },
  match: {
    prePrompt: "What's your focus for this match?",
    prePlaceholder: 'e.g. Stay composed under pressure',
    postPrompt: 'What was your standout moment?',
    postPlaceholder: 'e.g. Won most aerial duels',
    outcomes: [
      { id: 'fell_short', label: 'Tough one', emoji: '' },
      { id: 'hit_it', label: 'Solid', emoji: '' },
      { id: 'exceeded', label: 'Strong', emoji: '' },
    ],
  },
};

type JournalVariant = 'standard' | 'recovery' | 'match';

const EVENT_TYPE_TO_VARIANT: Record<string, JournalVariant> = {
  training: 'standard',
  match: 'match',
  recovery: 'recovery',
};

// ── Props ─────────────────────────────────────────────────

interface JournalSheetProps {
  visible: boolean;
  event: CalendarEvent | null;
  onClose: () => void;
}

// ── Component ─────────────────────────────────────────────

export function JournalSheet({ visible, event, onClose }: JournalSheetProps) {
  const { colors } = useTheme();
  const [activeTab, setActiveTab] = useState<'pre' | 'post'>('pre');
  const [journal, setJournal] = useState<JournalEntry | null>(null);
  const [loading, setLoading] = useState(false);

  // Pre fields
  const [target, setTarget] = useState('');
  const [mentalCue, setMentalCue] = useState('');

  // Post fields
  const [outcome, setOutcome] = useState('');
  const [reflection, setReflection] = useState('');
  const [bodyFeel, setBodyFeel] = useState('');

  const [submitting, setSubmitting] = useState(false);

  const variant = event ? (EVENT_TYPE_TO_VARIANT[event.type] ?? 'standard') : 'standard';
  const copy = VARIANT_COPY[variant];

  // Load existing journal on open
  useEffect(() => {
    if (!visible || !event) return;
    setLoading(true);
    getJournalForEvent(event.id)
      .then(({ journal: j }) => {
        setJournal(j);
        if (j) {
          setTarget(j.pre_target ?? '');
          setMentalCue(j.pre_mental_cue ?? '');
          setOutcome(j.post_outcome ?? '');
          setReflection(j.post_reflection ?? '');
          setBodyFeel(j.post_body_feel?.toString() ?? '');
          // Auto-select tab based on state
          if (j.journal_state === 'pre_set') setActiveTab('post');
          else if (j.journal_state === 'complete') setActiveTab('post');
          else setActiveTab('pre');
        } else {
          // Reset
          setTarget('');
          setMentalCue('');
          setOutcome('');
          setReflection('');
          setBodyFeel('');
          setActiveTab('pre');
        }
      })
      .catch(() => {
        setJournal(null);
        setActiveTab('pre');
      })
      .finally(() => setLoading(false));
  }, [visible, event?.id]);

  const handleSavePre = useCallback(async () => {
    if (!event || !target.trim() || submitting) return;
    setSubmitting(true);
    try {
      await saveJournalPreSession({
        calendar_event_id: event.id,
        pre_target: target.trim(),
        ...(mentalCue.trim() ? { pre_mental_cue: mentalCue.trim() } : {}),
      });
      emitRefresh('calendar');
      emitRefresh('notifications');
      onClose();
    } catch (err) {
      if (Platform.OS === 'web') {
        window.alert?.((err as Error).message ?? 'Failed to save target');
      }
    } finally {
      setSubmitting(false);
    }
  }, [event, target, mentalCue, submitting, onClose]);

  const handleSavePost = useCallback(async () => {
    if (!journal?.id || !outcome || !reflection.trim() || submitting) return;
    setSubmitting(true);
    try {
      await saveJournalPostSession({
        journal_id: journal.id,
        post_outcome: outcome as 'fell_short' | 'hit_it' | 'exceeded',
        post_reflection: reflection.trim(),
        ...(bodyFeel ? { post_body_feel: parseInt(bodyFeel) } : {}),
      });
      emitRefresh('calendar');
      emitRefresh('notifications');
      onClose();
    } catch (err) {
      if (Platform.OS === 'web') {
        window.alert?.((err as Error).message ?? 'Failed to save reflection');
      }
    } finally {
      setSubmitting(false);
    }
  }, [journal, outcome, reflection, bodyFeel, submitting, onClose]);

  if (!event) return null;

  const isLocked = journal?.locked_at != null;
  const canSavePre = target.trim().length > 0;
  const canSavePost = outcome !== '' && reflection.trim().length > 0 && journal?.id != null;

  return (
    <Modal visible={visible} transparent animationType="slide">
      <Pressable style={[ms.overlay]} onPress={onClose}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={ms.keyboardView}
        >
          <Pressable
            style={[ms.sheet, { backgroundColor: colors.backgroundElevated }]}
            onPress={(e) => e.stopPropagation()}
          >
            {/* Handle bar */}
            <View style={[ms.handleBar, { backgroundColor: colors.textMuted + '40' }]} />

            {/* Header */}
            <View style={ms.headerRow}>
              <SmartIcon name="book-outline" size={20} color={colors.accent2} />
              <Text style={[ms.headerTitle, { color: colors.textOnDark }]}>
                {event.name}
              </Text>
              <Pressable onPress={onClose} hitSlop={12}>
                <SmartIcon name="close" size={22} color={colors.textMuted} />
              </Pressable>
            </View>

            {/* Tab switcher — underline pattern */}
            <View style={ms.tabRow}>
              {(['pre', 'post'] as const).map(tab => (
                <Pressable
                  key={tab}
                  style={[ms.tab, activeTab === tab && { borderBottomColor: colors.accent2 }]}
                  onPress={() => setActiveTab(tab)}
                >
                  <Text style={[
                    ms.tabText,
                    { color: activeTab === tab ? colors.accent2 : colors.textMuted },
                  ]}>
                    {tab === 'pre' ? 'Pre-Training' : 'Post-Training'}
                  </Text>
                </Pressable>
              ))}
            </View>

            {loading ? (
              <View style={ms.loadingContainer}>
                <ActivityIndicator color={colors.accent2} />
              </View>
            ) : (
              <ScrollView style={ms.content} keyboardShouldPersistTaps="handled">
                {activeTab === 'pre' ? (
                  /* ── PRE TAB ── */
                  <View style={ms.tabContent}>
                    <Text style={[ms.label, { color: colors.textSecondary }]}>{copy.prePrompt}</Text>
                    <TextInput
                      style={[ms.textInput, { backgroundColor: colors.inputBackground, color: colors.textPrimary }]}
                      placeholder={copy.prePlaceholder}
                      placeholderTextColor={colors.textInactive}
                      value={target}
                      onChangeText={setTarget}
                      multiline
                      numberOfLines={3}
                      maxLength={500}
                      editable={!isLocked}
                    />
                    {variant !== 'recovery' && (
                      <>
                        <Text style={[ms.label, { color: colors.textSecondary }]}>Mental cue (optional)</Text>
                        <TextInput
                          style={[ms.cueInput, { backgroundColor: colors.inputBackground, color: colors.textPrimary }]}
                          placeholder="One word — e.g. Slow and controlled"
                          placeholderTextColor={colors.textInactive}
                          value={mentalCue}
                          onChangeText={setMentalCue}
                          maxLength={100}
                          editable={!isLocked}
                        />
                      </>
                    )}
                    {!isLocked && (
                      <Pressable
                        style={[ms.submitBtn, { backgroundColor: canSavePre ? colors.accent2 : colors.textMuted + '30' }]}
                        onPress={handleSavePre}
                        disabled={!canSavePre || submitting}
                      >
                        {submitting ? (
                          <ActivityIndicator size="small" color="#F5F3ED" />
                        ) : (
                          <Text style={ms.submitText}>Set target</Text>
                        )}
                      </Pressable>
                    )}
                  </View>
                ) : (
                  /* ── POST TAB ── */
                  <View style={ms.tabContent}>
                    {/* Target reminder */}
                    {journal?.pre_target && (
                      <View style={[ms.reminderBox, { backgroundColor: colors.inputBackground }]}>
                        <Text style={[ms.reminderLabel, { color: colors.textSecondary }]}>Your target was:</Text>
                        <Text style={[ms.reminderText, { color: colors.textPrimary }]}>"{journal.pre_target}"</Text>
                      </View>
                    )}

                    {!journal?.id && (
                      <Text style={[ms.hint, { color: colors.textMuted }]}>
                        Set a pre-training target first to unlock reflection.
                      </Text>
                    )}

                    {journal?.id && (
                      <>
                        <Text style={[ms.label, { color: colors.textSecondary }]}>How did it go?</Text>
                        <View style={ms.outcomeRow}>
                          {copy.outcomes.map(o => (
                            <Pressable
                              key={o.id}
                              style={[
                                ms.outcomePill,
                                { borderColor: outcome === o.id ? colors.accent2 : colors.textMuted + '30' },
                                outcome === o.id && { backgroundColor: colors.accent2 + '20' },
                              ]}
                              onPress={() => setOutcome(o.id)}
                            >
                              {o.emoji ? <Text style={ms.outcomeEmoji}>{o.emoji}</Text> : null}
                              <Text style={[ms.outcomeLabel, { color: outcome === o.id ? colors.accent2 : colors.textSecondary }]}>
                                {o.label}
                              </Text>
                            </Pressable>
                          ))}
                        </View>

                        <Text style={[ms.label, { color: colors.textSecondary }]}>{copy.postPrompt}</Text>
                        <TextInput
                          style={[ms.textInput, { backgroundColor: colors.inputBackground, color: colors.textPrimary }]}
                          placeholder={copy.postPlaceholder}
                          placeholderTextColor={colors.textInactive}
                          value={reflection}
                          onChangeText={setReflection}
                          multiline
                          numberOfLines={3}
                          maxLength={1000}
                          editable={!isLocked}
                        />

                        {!isLocked && (
                          <Pressable
                            style={[ms.submitBtn, { backgroundColor: canSavePost ? colors.accent2 : colors.textMuted + '30' }]}
                            onPress={handleSavePost}
                            disabled={!canSavePost || submitting}
                          >
                            {submitting ? (
                              <ActivityIndicator size="small" color="#F5F3ED" />
                            ) : (
                              <Text style={ms.submitText}>Log reflection</Text>
                            )}
                          </Pressable>
                        )}
                      </>
                    )}

                    {/* AI insight */}
                    {journal?.ai_insight && (
                      <View style={[ms.insightBox, { backgroundColor: colors.accent2 + '10' }]}>
                        <SmartIcon name="sparkles-outline" size={14} color={colors.accent2} />
                        <Text style={[ms.insightText, { color: colors.textSecondary }]}>{journal.ai_insight}</Text>
                      </View>
                    )}
                  </View>
                )}
              </ScrollView>
            )}
          </Pressable>
        </KeyboardAvoidingView>
      </Pressable>
    </Modal>
  );
}

// ── Styles ─────────────────────────────────────────────────

const ms = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'flex-end',
  },
  keyboardView: {
    justifyContent: 'flex-end',
  },
  sheet: {
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingTop: 8,
    paddingBottom: 40,
    paddingHorizontal: spacing.lg,
    maxHeight: '85%',
    flex: 0,
  },
  handleBar: {
    width: 36,
    height: 4,
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: 12,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  headerTitle: {
    fontFamily: fontFamily.bold,
    fontSize: 16,
    flex: 1,
  },
  tabRow: {
    flexDirection: 'row',
    gap: 0,
    marginBottom: 16,
  },
  tab: {
    flex: 1,
    paddingBottom: 8,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
    alignItems: 'center',
  },
  tabText: {
    fontFamily: fontFamily.medium,
    fontSize: 14,
  },
  loadingContainer: {
    paddingVertical: 40,
    alignItems: 'center',
  },
  content: {
    flexGrow: 1,
    flexShrink: 1,
  },
  tabContent: {
    gap: 12,
    paddingBottom: 40,
  },
  label: {
    fontFamily: fontFamily.medium,
    fontSize: 13,
  },
  textInput: {
    borderRadius: borderRadius.sm,
    padding: spacing.sm,
    fontFamily: fontFamily.regular,
    fontSize: 14,
    minHeight: 70,
    textAlignVertical: 'top',
  },
  cueInput: {
    borderRadius: borderRadius.sm,
    padding: spacing.sm,
    fontFamily: fontFamily.regular,
    fontSize: 14,
  },
  outcomeRow: {
    flexDirection: 'row',
    gap: 8,
  },
  outcomePill: {
    flex: 1,
    flexDirection: 'column',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 10,
    borderRadius: borderRadius.sm,
    borderWidth: 1,
  },
  outcomeEmoji: {
    fontSize: 20,
  },
  outcomeLabel: {
    fontFamily: fontFamily.medium,
    fontSize: 11,
  },
  reminderBox: {
    borderRadius: borderRadius.sm,
    padding: spacing.sm,
  },
  reminderLabel: {
    fontFamily: fontFamily.medium,
    fontSize: 12,
    marginBottom: 2,
  },
  reminderText: {
    fontFamily: fontFamily.regular,
    fontSize: 14,
    fontStyle: 'italic',
  },
  hint: {
    fontFamily: fontFamily.regular,
    fontSize: 13,
    textAlign: 'center',
    paddingVertical: 20,
  },
  submitBtn: {
    borderRadius: borderRadius.sm,
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: 4,
  },
  submitText: {
    fontFamily: fontFamily.bold,
    fontSize: 14,
    color: colors.textPrimary,
  },
  insightBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 6,
    borderRadius: borderRadius.sm,
    padding: spacing.sm,
    marginTop: 8,
  },
  insightText: {
    fontFamily: fontFamily.regular,
    fontSize: 13,
    flex: 1,
  },
});
