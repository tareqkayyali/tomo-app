/**
 * Home Screen — AI Chat (Connected)
 * Tomo UI Aesthetic doc Section 4
 *
 * Layout (ChatGPT-style):
 *   - "tomo" wordmark centered 60px from top
 *   - Personalized motivational quote based on athlete data
 *   - Suggestion chips from backend (visible when chat is empty)
 *   - Scrollable chat: user bubbles (right, gray) / AI text (left, full-width, markdown rendered)
 *   - Fixed input bar: multiline, auto-expand, send/stop toggle
 *   - Typing indicator (3-dot) + character-by-character typewriter
 *   - Scroll-to-bottom button, pull-to-refresh, auto-scroll, error handling
 */

import React, { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TextInput,
  Pressable,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  RefreshControl,
  Keyboard,
  PanResponder,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  withDelay,
  withSequence,
  Easing,
} from 'react-native-reanimated';
import {
  spacing,
  borderRadius,
  layout,
  fontFamily,
} from '../theme';
import type { ThemeColors } from '../theme/colors';
import { useTheme } from '../hooks/useTheme';
import { MarkdownMessage } from '../components/MarkdownMessage';
import {
  sendChatMessage,
  sendAgentChatMessage,
  getChatSuggestions,
  getToday,
  listChatSessions,
  createChatSession,
  loadChatSession,
  endChatSession,
} from '../services/api';
import type { AgentChatResponse } from '../services/api';
import { ResponseRenderer } from '../components/chat/ResponseRenderer';
import type { TomoResponse, ChatSession as ServerChatSession } from '../types/chat';
import { useAuth } from '../hooks/useAuth';
import { HeaderProfileButton } from '../components/HeaderProfileButton';
import { NotificationBell } from '../components/NotificationBell';
import { CheckinHeaderButton } from '../components/CheckinHeaderButton';
import { useCheckinStatus } from '../hooks/useCheckinStatus';
import { RoleSwitcher } from '../components/RoleSwitcher';
import { useAllQuotes } from '../hooks/useContentHelpers';
import type { Quote } from '../hooks/useContentHelpers';
import { track } from '../services/analytics';
import {
  getSavedChats,
  saveChat,
  deleteChat,
  createNewChat,
  getActiveChatId,
  setActiveChatId,
} from '../services/savedChats';
import type { SavedChat, SavedMessage } from '../services/savedChats';
import type {
  ChatMessage as ChatMessageType,
  SuggestionChip as SuggestionChipType,
} from '../types';

// ---------------------------------------------------------------------------
// Motivational Quotes — loaded from ContentBundle via useAllQuotes hook
// Fallback: hardcoded quotes in fallbackContent.ts
// ---------------------------------------------------------------------------

/**
 * Builds a flat pool of quotes from ContentBundle, then picks one
 * using the provided seed index so each new chat gets a fresh quote.
 */
function pickQuoteForAthlete(
  allQuotes: Record<string, Quote[]>,
  data: { readiness?: string; sleepHours?: number; streak?: number; sport?: string },
  seed: number,
): Quote {
  const ALL_QUOTES = [
    ...(allQuotes.high_energy ?? []),
    ...(allQuotes.recovery ?? []),
    ...(allQuotes.low_sleep ?? []),
    ...(allQuotes.streak ?? []),
    ...(allQuotes.general ?? []),
  ];

  if (ALL_QUOTES.length === 0) {
    return { text: "Champions are made in practice.", author: "Tomo" };
  }

  return ALL_QUOTES[Math.abs(seed) % ALL_QUOTES.length];
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface DisplayMessage {
  id: string;
  role: 'user' | 'ai' | 'typing' | 'streaming';
  text: string;
  structured?: TomoResponse | null;
  error?: boolean;
  /** Attached confirmation data for confirm_card buttons */
  confirmAction?: AgentChatResponse['pendingConfirmation'];
}

// ---------------------------------------------------------------------------
// Themed Styles Factory
// ---------------------------------------------------------------------------

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    flex: {
      flex: 1,
    },

    // ── Wordmark ──────────────────────────────────────────────────────
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingTop: layout.headerOffset - 44,
      paddingHorizontal: spacing.lg,
      paddingBottom: spacing.md,
    },
    headerLeft: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
    },
    headerBtn: {
      width: 36,
      height: 36,
      alignItems: 'center',
      justifyContent: 'center',
    },
    wordmarkWrap: {
      position: 'absolute',
      left: 0,
      right: 0,
      alignItems: 'center',
      pointerEvents: 'none',
    },
    wordmarkPill: {
      paddingHorizontal: 20,
      paddingVertical: 7,
      borderRadius: 18,
    },
    wordmark: {
      fontFamily: fontFamily.medium,
      fontSize: 15,
      lineHeight: 20,
      color: '#FFFFFF',
      letterSpacing: 3,
    },

    // ── Loading ───────────────────────────────────────────────────────
    loadingContainer: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
    },

    // ── Motivational Quote ─────────────────────────────────────────────
    quoteContainer: {
      paddingHorizontal: spacing.md,
      marginBottom: 16,
      alignItems: 'center',
    },
    quoteText: {
      fontFamily: fontFamily.medium,
      fontSize: 17,
      lineHeight: 26,
      color: colors.textOnDark,
      textAlign: 'center',
    },
    quoteMark: {
      fontFamily: fontFamily.bold,
      fontSize: 22,
      color: colors.accent1,
    },
    quoteAuthor: {
      fontFamily: fontFamily.regular,
      fontSize: 14,
      color: colors.textInactive,
      marginTop: 10,
    },

    // ── Empty State ────────────────────────────────────────────────────
    emptyContainer: {
      flex: 1,
      justifyContent: 'space-between',
      alignItems: 'center',
    },
    emptyCenter: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      paddingHorizontal: spacing.lg,
    },
    emptySubtitle: {
      fontFamily: fontFamily.regular,
      fontSize: 15,
      lineHeight: 22,
      color: colors.textInactive,
      textAlign: 'center',
      paddingHorizontal: spacing.lg,
    },
    chipsContainer: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      justifyContent: 'center',
      paddingHorizontal: spacing.lg,
      paddingBottom: spacing.md,
      gap: spacing.sm,
    },
    chip: {
      backgroundColor: colors.chipBackground,
      paddingVertical: 10,
      paddingHorizontal: spacing.md,
      borderRadius: borderRadius.full,
      borderWidth: 1,
      borderColor: colors.glassBorder,
    },
    chipPressed: {
      opacity: 0.7,
    },
    chipText: {
      fontFamily: fontFamily.medium,
      fontSize: 14,
      color: colors.textOnDark,
    },

    // ── Chat Messages (ChatGPT-style) ───────────────────────────────
    chatContent: {
      paddingTop: spacing.md,
      paddingBottom: spacing.md,
    },
    messageRow: {
      marginBottom: 12,
      paddingHorizontal: layout.screenMargin,
    },
    messageRowUser: {
      alignItems: 'flex-end',
    },
    messageRowAi: {
      alignItems: 'flex-start',
    },
    aiMessageContainer: {
      width: '100%',
    },
    userBubble: {
      maxWidth: '80%',
      backgroundColor: colors.cardLight,
      borderRadius: borderRadius.chat,
      borderBottomRightRadius: spacing.xs,
      paddingVertical: 10,
      paddingHorizontal: spacing.md,
    },
    userBubbleText: {
      fontFamily: fontFamily.medium,
      fontSize: 16,
      lineHeight: 24,
      color: colors.textOnDark,
    },
    typingBubble: {
      backgroundColor: colors.cardLight,
      borderRadius: 16,
      paddingVertical: 12,
      paddingHorizontal: 16,
    },
    bubbleError: {
      borderColor: colors.error,
      borderWidth: 1,
    },
    bubbleTextError: {
      color: colors.error,
    },
    retryHint: {
      fontFamily: fontFamily.medium,
      fontSize: 11,
      color: colors.error,
      marginTop: spacing.xs,
    },

    // ── Streaming Cursor ──────────────────────────────────────────────
    streamingCursor: {
      color: colors.accent1,
      fontSize: 16,
      fontFamily: fontFamily.regular,
    },

    // ── Typing Indicator ──────────────────────────────────────────────
    typingContainer: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      paddingVertical: 4,
      paddingHorizontal: 2,
    },
    typingDot: {
      width: 7,
      height: 7,
      borderRadius: 3.5,
      backgroundColor: colors.textInactive,
    },

    // ── Input Bar ─────────────────────────────────────────────────────
    inputBarContainer: {
      paddingHorizontal: spacing.md,
      paddingTop: spacing.sm,
      paddingBottom: spacing.lg,
      backgroundColor: colors.background,
    },
    inputBar: {
      flexDirection: 'row',
      alignItems: 'flex-end',
      backgroundColor: colors.inputBackground,
      borderRadius: 24,
      paddingLeft: spacing.md,
      paddingRight: spacing.sm,
      paddingVertical: 8,
      minHeight: 48,
      maxHeight: 160,
    },
    textInput: {
      flex: 1,
      fontFamily: fontFamily.regular,
      fontSize: 16,
      color: colors.textOnDark,
      textAlign: 'left',
      paddingVertical: 4,
      maxHeight: 140,
      writingDirection: 'ltr',
    },
    sendButton: {
      width: 36,
      height: 36,
      alignItems: 'center',
      justifyContent: 'center',
    },
    sendButtonPressed: {
      opacity: 0.6,
    },
    stopButton: {
      width: 36,
      height: 36,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.textInactive,
      borderRadius: 18,
    },
    stopIcon: {
      width: 12,
      height: 12,
      borderRadius: 2,
      backgroundColor: colors.background,
    },

    // ── Scroll-to-bottom Button ────────────────────────────────────────
    scrollDownBtn: {
      position: 'absolute',
      bottom: 90,
      alignSelf: 'center',
      width: 36,
      height: 36,
      borderRadius: 18,
      backgroundColor: colors.chipBackground,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
      borderColor: colors.glassBorder,
    },

    // ── Saved Chats Overlay ────────────────────────────────────────────
    savedOverlay: {
      flex: 1,
      backgroundColor: colors.background,
      paddingHorizontal: spacing.lg,
    },
    savedHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingVertical: spacing.md,
      borderBottomWidth: 1,
      borderBottomColor: colors.glassBorder,
    },
    savedTitle: {
      fontFamily: fontFamily.bold,
      fontSize: 20,
      color: colors.textOnDark,
    },
    savedEmpty: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      gap: spacing.sm,
    },
    savedEmptyText: {
      fontFamily: fontFamily.semiBold,
      fontSize: 16,
      color: colors.textOnDark,
      marginTop: spacing.sm,
    },
    savedEmptyHint: {
      fontFamily: fontFamily.regular,
      fontSize: 13,
      color: colors.textInactive,
      textAlign: 'center',
      paddingHorizontal: spacing.xl,
    },
    savedList: {
      paddingTop: spacing.md,
      paddingBottom: spacing.xl,
    },
    savedItem: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: spacing.compact,
      paddingHorizontal: spacing.md,
      borderRadius: borderRadius.md,
      marginBottom: spacing.xs,
    },
    savedItemActive: {
      backgroundColor: 'rgba(255, 107, 53, 0.08)',
      borderWidth: 1,
      borderColor: 'rgba(255, 107, 53, 0.2)',
    },
    savedItemContent: {
      flex: 1,
    },
    savedItemTitle: {
      fontFamily: fontFamily.semiBold,
      fontSize: 15,
      color: colors.textOnDark,
      marginBottom: 2,
    },
    savedItemTitleActive: {
      color: colors.accent1,
    },
    savedItemMeta: {
      fontFamily: fontFamily.regular,
      fontSize: 12,
      color: colors.textInactive,
    },
    savedDeleteBtn: {
      width: 32,
      height: 32,
      alignItems: 'center',
      justifyContent: 'center',
    },
    savedActiveDot: {
      width: 8,
      height: 8,
      borderRadius: 4,
      backgroundColor: colors.accent1,
      marginLeft: spacing.sm,
    },

    // ── Confirmation Card ──────────────────────────────────────────
    confirmCard: {
      marginHorizontal: spacing.md,
      marginBottom: spacing.sm,
      backgroundColor: colors.cardLight,
      borderRadius: borderRadius.md,
      borderWidth: 1,
      borderColor: colors.glassBorder,
      padding: spacing.md,
    },
    confirmHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      marginBottom: 8,
    },
    confirmTitle: {
      fontFamily: fontFamily.semiBold,
      fontSize: 14,
      color: colors.accent1,
    },
    confirmPreview: {
      fontFamily: fontFamily.regular,
      fontSize: 15,
      lineHeight: 22,
      color: colors.textOnDark,
      marginBottom: 12,
    },
    confirmButtons: {
      flexDirection: 'row',
      gap: 10,
    },
    confirmBtn: {
      flex: 1,
      paddingVertical: 10,
      borderRadius: borderRadius.full,
      alignItems: 'center',
    },
    confirmBtnCancel: {
      backgroundColor: 'transparent',
      borderWidth: 1,
      borderColor: colors.glassBorder,
    },
    confirmBtnCancelText: {
      fontFamily: fontFamily.medium,
      fontSize: 14,
      color: colors.textInactive,
    },
    confirmBtnConfirm: {
      backgroundColor: colors.accent1,
    },
    confirmBtnConfirmText: {
      fontFamily: fontFamily.medium,
      fontSize: 14,
      color: '#FFFFFF',
    },
    batchActionRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 8,
      marginBottom: 8,
      paddingVertical: 6,
      paddingHorizontal: 8,
      backgroundColor: `${colors.glassBorder}44`,
      borderRadius: borderRadius.sm,
    },
  });
}

/** Hook that returns themed styles for this screen */
function useHomeStyles() {
  const { colors } = useTheme();
  return useMemo(() => createStyles(colors), [colors]);
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function SuggestionChip({
  chip,
  onPress,
}: {
  chip: SuggestionChipType;
  onPress: (message: string) => void;
}) {
  const styles = useHomeStyles();
  return (
    <Pressable
      onPress={() => onPress(chip.message)}
      style={({ pressed }) => [
        styles.chip,
        pressed && styles.chipPressed,
      ]}
    >
      <Text style={styles.chipText}>{chip.label}</Text>
    </Pressable>
  );
}

/** Blinking cursor for streaming messages */
function StreamingCursor() {
  const styles = useHomeStyles();
  const opacity = useSharedValue(1);

  useEffect(() => {
    opacity.value = withRepeat(
      withSequence(
        withTiming(0, { duration: 400 }),
        withTiming(1, { duration: 400 }),
      ),
      -1,
      false,
    );
  }, []);

  const animStyle = useAnimatedStyle(() => ({ opacity: opacity.value }));

  return (
    <Animated.Text style={[styles.streamingCursor, animStyle]}>{'▍'}</Animated.Text>
  );
}

function ChatBubble({
  message,
  onChipPress,
  onConfirm,
  onCancel,
}: {
  message: DisplayMessage;
  onChipPress?: (action: string) => void;
  onConfirm?: () => void;
  onCancel?: () => void;
}) {
  const styles = useHomeStyles();
  const isUser = message.role === 'user';
  const isTyping = message.role === 'typing';
  const isStreaming = message.role === 'streaming';

  // Typing indicator — small pill with bounce dots
  if (isTyping) {
    return (
      <View style={[styles.messageRow, styles.messageRowAi]}>
        <View style={styles.typingBubble}>
          <TypingDots />
        </View>
      </View>
    );
  }

  // User message — gray bubble, right-aligned
  if (isUser) {
    return (
      <View style={[styles.messageRow, styles.messageRowUser]}>
        <View style={[styles.userBubble, message.error && styles.bubbleError]}>
          <Text
            style={[styles.userBubbleText, message.error && styles.bubbleTextError]}
          >
            {message.text}
          </Text>
          {message.error && <Text style={styles.retryHint}>Tap to retry</Text>}
        </View>
      </View>
    );
  }

  // AI message — structured card or markdown fallback
  return (
    <View style={[styles.messageRow, styles.messageRowAi]}>
      <View style={styles.aiMessageContainer}>
        {message.structured && !isStreaming ? (
          <ResponseRenderer
            response={message.structured}
            onChipPress={onChipPress}
            onConfirm={onConfirm}
            onCancel={onCancel}
          />
        ) : message.text ? (
          <MarkdownMessage content={message.text} />
        ) : null}
        {isStreaming && <StreamingCursor />}
      </View>
    </View>
  );
}

/** Animated 3-dot typing indicator */
function TypingDots() {
  const styles = useHomeStyles();
  const dot1 = useSharedValue(0);
  const dot2 = useSharedValue(0);
  const dot3 = useSharedValue(0);

  useEffect(() => {
    const bounce = (delay: number) =>
      withRepeat(
        withDelay(
          delay,
          withSequence(
            withTiming(-4, { duration: 300 }),
            withTiming(0, { duration: 300 }),
          ),
        ),
        -1,
        false,
      );

    dot1.value = bounce(0);
    dot2.value = bounce(150);
    dot3.value = bounce(300);
  }, []);

  const anim1 = useAnimatedStyle(() => ({ transform: [{ translateY: dot1.value }] }));
  const anim2 = useAnimatedStyle(() => ({ transform: [{ translateY: dot2.value }] }));
  const anim3 = useAnimatedStyle(() => ({ transform: [{ translateY: dot3.value }] }));

  return (
    <View style={styles.typingContainer}>
      <Animated.View style={[styles.typingDot, anim1]} />
      <Animated.View style={[styles.typingDot, anim2]} />
      <Animated.View style={[styles.typingDot, anim3]} />
    </View>
  );
}

/** Motivational Quote Card */
function QuoteCard({ quote }: { quote: Quote }) {
  const styles = useHomeStyles();
  const fadeIn = useSharedValue(0);

  useEffect(() => {
    fadeIn.value = withTiming(1, { duration: 1000, easing: Easing.out(Easing.cubic) });
  }, []);

  const animStyle = useAnimatedStyle(() => ({
    opacity: fadeIn.value,
    transform: [{ translateY: (1 - fadeIn.value) * 10 }],
  }));

  return (
    <Animated.View style={[styles.quoteContainer, animStyle]}>
      <Text style={styles.quoteText}>
        <Text style={styles.quoteMark}>{'\u201C'} </Text>
        {quote.text}
        <Text style={styles.quoteMark}> {'\u201D'}</Text>
      </Text>
      <Text style={styles.quoteAuthor} numberOfLines={1}>{'— ' + quote.author}</Text>
    </Animated.View>
  );
}

/** Confirmation Card — shown when agent wants to execute a write action.
 *  Supports batch actions: when actions[] has multiple items, shows each
 *  with individual confirm buttons plus a "Confirm All" option.
 */
function ConfirmationCard({
  confirmation,
  onConfirm,
  onCancel,
  onConfirmSingle,
}: {
  confirmation: NonNullable<AgentChatResponse['pendingConfirmation']>;
  onConfirm: () => void;
  onCancel: () => void;
  /** Confirm a single action from a batch by index */
  onConfirmSingle?: (index: number) => void;
}) {
  const styles = useHomeStyles();
  const { colors } = useTheme();
  const actions = confirmation.actions;
  const isBatch = actions && actions.length > 1;

  return (
    <View style={styles.confirmCard}>
      <View style={styles.confirmHeader}>
        <Ionicons name="shield-checkmark-outline" size={18} color={colors.accent1} />
        <Text style={styles.confirmTitle}>
          {isBatch ? `Confirm ${actions.length} Actions` : 'Confirm Action'}
        </Text>
      </View>

      {isBatch ? (
        <>
          {actions.map((action, idx) => (
            <View key={idx} style={styles.batchActionRow}>
              <Text style={styles.confirmPreview} numberOfLines={2}>
                {action.preview.replace(/ Reply "yes".*/, '')}
              </Text>
              {onConfirmSingle && (
                <Pressable
                  onPress={() => onConfirmSingle(idx)}
                  style={({ pressed }) => [
                    styles.confirmBtn,
                    styles.confirmBtnConfirm,
                    { paddingHorizontal: 12, paddingVertical: 6 },
                    pressed && { opacity: 0.7 },
                  ]}
                >
                  <Text style={[styles.confirmBtnConfirmText, { fontSize: 12 }]}>✓</Text>
                </Pressable>
              )}
            </View>
          ))}
          <View style={styles.confirmButtons}>
            <Pressable
              onPress={onCancel}
              style={({ pressed }) => [styles.confirmBtn, styles.confirmBtnCancel, pressed && { opacity: 0.7 }]}
            >
              <Text style={styles.confirmBtnCancelText}>Cancel All</Text>
            </Pressable>
            <Pressable
              onPress={onConfirm}
              style={({ pressed }) => [styles.confirmBtn, styles.confirmBtnConfirm, pressed && { opacity: 0.7 }]}
            >
              <Text style={styles.confirmBtnConfirmText}>Confirm All ({actions.length})</Text>
            </Pressable>
          </View>
        </>
      ) : (
        <>
          <Text style={styles.confirmPreview}>{confirmation.preview}</Text>
          <View style={styles.confirmButtons}>
            <Pressable
              onPress={onCancel}
              style={({ pressed }) => [styles.confirmBtn, styles.confirmBtnCancel, pressed && { opacity: 0.7 }]}
            >
              <Text style={styles.confirmBtnCancelText}>Cancel</Text>
            </Pressable>
            <Pressable
              onPress={onConfirm}
              style={({ pressed }) => [styles.confirmBtn, styles.confirmBtnConfirm, pressed && { opacity: 0.7 }]}
            >
              <Text style={styles.confirmBtnConfirmText}>Confirm</Text>
            </Pressable>
          </View>
        </>
      )}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Convert backend ChatMessage to display format */
function toDisplayMessage(msg: ChatMessageType): DisplayMessage {
  return {
    id: msg.id,
    role: msg.role,
    text: msg.content,
  };
}

const TYPING_MSG: DisplayMessage = {
  id: '__typing__',
  role: 'typing',
  text: '',
};

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

/** Saved Chats List overlay */
function SavedChatsList({
  chats,
  activeChatId,
  onSelect,
  onDelete,
  onClose,
}: {
  chats: SavedChat[];
  activeChatId: string;
  onSelect: (chat: SavedChat) => void;
  onDelete: (chatId: string) => void;
  onClose: () => void;
}) {
  const styles = useHomeStyles();
  const { colors } = useTheme();
  return (
    <View style={styles.savedOverlay}>
      <View style={styles.savedHeader}>
        <Text style={styles.savedTitle}>Saved Chats</Text>
        <Pressable onPress={onClose} hitSlop={12}>
          <Ionicons name="close" size={24} color={colors.textOnDark} />
        </Pressable>
      </View>
      {chats.length === 0 ? (
        <View style={styles.savedEmpty}>
          <Ionicons name="chatbubbles-outline" size={40} color={colors.textInactive} />
          <Text style={styles.savedEmptyText}>No saved chats yet</Text>
          <Text style={styles.savedEmptyHint}>
            Start a conversation and it will appear here.
          </Text>
        </View>
      ) : (
        <FlatList
          data={chats}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.savedList}
          showsVerticalScrollIndicator={false}
          renderItem={({ item }) => {
            const isActive = item.id === activeChatId;
            const msgCount = item.messages.length;
            const timeAgo = getTimeAgo(item.updatedAt);
            return (
              <Pressable
                onPress={() => onSelect(item)}
                style={({ pressed }) => [
                  styles.savedItem,
                  isActive && styles.savedItemActive,
                  pressed && { opacity: 0.7 },
                ]}
              >
                <View style={styles.savedItemContent}>
                  <Text
                    style={[styles.savedItemTitle, isActive && styles.savedItemTitleActive]}
                    numberOfLines={1}
                  >
                    {item.title}
                  </Text>
                  <Text style={styles.savedItemMeta}>
                    {msgCount} message{msgCount !== 1 ? 's' : ''} · {timeAgo}
                  </Text>
                </View>
                {!isActive && (
                  <Pressable
                    onPress={() => onDelete(item.id)}
                    hitSlop={12}
                    style={styles.savedDeleteBtn}
                  >
                    <Ionicons name="trash-outline" size={16} color={colors.textInactive} />
                  </Pressable>
                )}
                {isActive && (
                  <View style={styles.savedActiveDot} />
                )}
              </Pressable>
            );
          }}
        />
      )}
    </View>
  );
}

function getTimeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days === 1) return 'yesterday';
  if (days < 7) return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString();
}

export function HomeScreen() {
  const { colors, isDark, toggle } = useTheme();
  const styles = useHomeStyles();
  const { profile } = useAuth();
  const navigation = useNavigation<any>();
  const { needsCheckin } = useCheckinStatus();
  // sportConfig removed — no mock data sync needed
  const allQuotes = useAllQuotes();
  const [messages, setMessages] = useState<DisplayMessage[]>([]);
  const [inputText, setInputText] = useState('');
  const [chips, setChips] = useState<SuggestionChipType[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSending, setIsSending] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [todayData, setTodayData] = useState<any>(null);
  const flatListRef = useRef<FlatList<DisplayMessage>>(null);

  // ── Session state (server-side) ─────────────────────────────────────
  const [sessionId, setSessionIdRaw] = useState<string | null>(null);
  const sessionIdRef = useRef<string | null>(null);
  const setSessionId = useCallback((id: string | null) => {
    sessionIdRef.current = id;
    setSessionIdRaw(id);
  }, []);
  const [serverSessions, setServerSessions] = useState<ServerChatSession[]>([]);

  // ── Saved chats state (local) ───────────────────────────────────────
  const [currentChat, setCurrentChat] = useState<SavedChat>(createNewChat());
  const [savedChatsList, setSavedChatsList] = useState<SavedChat[]>([]);
  const [showSavedChats, setShowSavedChats] = useState(false);
  const [quoteIndex, setQuoteIndex] = useState(() => Math.floor(Math.random() * 100));
  const [showScrollDown, setShowScrollDown] = useState(false);
  const [pendingConfirmation, setPendingConfirmation] = useState<
    AgentChatResponse['pendingConfirmation']
  >(null);

  // ── Load history + chips + today data + saved chats on mount ───────
  const loadData = useCallback(async () => {
    try {
      const [chipsRes, todayRes, saved, activeId, sessionsRes] = await Promise.allSettled([
        getChatSuggestions(),
        getToday(),
        getSavedChats(),
        getActiveChatId(),
        listChatSessions(),
      ]);
      if (chipsRes.status === 'fulfilled') {
        setChips(chipsRes.value.suggestions);
      }
      if (todayRes.status === 'fulfilled') {
        setTodayData(todayRes.value);
      }

      // Load server sessions
      if (sessionsRes.status === 'fulfilled') {
        setServerSessions(sessionsRes.value);
      }

      // Restore saved chats
      const allChats = saved.status === 'fulfilled' ? saved.value : [];
      setSavedChatsList(allChats);

      const lastActiveId = activeId.status === 'fulfilled' ? activeId.value : null;

      if (lastActiveId) {
        const found = allChats.find((c) => c.id === lastActiveId);
        if (found) {
          setCurrentChat(found);
          setMessages(
            found.messages.map((m) => ({
              id: m.id,
              role: m.role,
              text: m.text,
              structured: m.structured ?? undefined,
              confirmAction: m.confirmAction ?? undefined,
            })),
          );
        }
      }
    } catch {
      // Show empty state on error
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const userId = profile?.uid || profile?.id || '';

  // ── Pick quote (changes on every new chat) ─────────────────────────
  const currentQuote = useMemo(() => {
    return pickQuoteForAthlete(
      allQuotes,
      {
        readiness: todayData?.readiness,
        sleepHours: todayData?.latestCheckin?.sleepHours,
        streak: profile?.currentStreak,
        sport: profile?.sport,
      },
      quoteIndex,
    );
  }, [allQuotes, todayData, profile?.currentStreak, profile?.sport, quoteIndex]);

  // ── Pull-to-refresh ────────────────────────────────────────────────
  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true);
    try {
      const [chipsRes, todayRes] = await Promise.allSettled([
        getChatSuggestions(),
        getToday(),
      ]);
      if (chipsRes.status === 'fulfilled') {
        setChips(chipsRes.value.suggestions);
      }
      if (todayRes.status === 'fulfilled') {
        setTodayData(todayRes.value);
      }
    } catch {
      // Keep current data
    } finally {
      setIsRefreshing(false);
    }
  }, []);

  // ── Auto-scroll helper ─────────────────────────────────────────────
  const scrollToBottom = useCallback(() => {
    setTimeout(() => {
      flatListRef.current?.scrollToEnd({ animated: true });
    }, 100);
  }, []);

  // ── Scroll handler for scroll-to-bottom button ─────────────────────
  const handleScroll = useCallback((event: any) => {
    const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent;
    const distFromBottom = contentSize.height - layoutMeasurement.height - contentOffset.y;
    setShowScrollDown(distFromBottom > 100);
  }, []);

  // ── Persist current chat to saved chats ────────────────────────────
  const persistChat = useCallback(
    async (updatedMessages: DisplayMessage[]) => {
      const savedMessages: SavedMessage[] = updatedMessages
        .filter((m) => m.role !== 'typing' && m.role !== 'streaming' && !m.error)
        .map((m) => ({
          id: m.id,
          role: m.role as 'user' | 'ai',
          text: m.text,
          timestamp: new Date().toISOString(),
          structured: m.structured ?? null,
          confirmAction: m.confirmAction ?? null,
        }));

      const updated: SavedChat = {
        ...currentChat,
        messages: savedMessages,
        updatedAt: new Date().toISOString(),
      };
      setCurrentChat(updated);
      await saveChat(updated);
      await setActiveChatId(updated.id);

      // Refresh saved list
      const all = await getSavedChats();
      setSavedChatsList(all);
    },
    [currentChat],
  );

  // ── Send message (with typewriter animation + cancel support) ────
  const TYPEWRITER_AI_ID = '__typewriter_ai__';
  const typewriterRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (typewriterRef.current) clearInterval(typewriterRef.current);
      if (abortRef.current) abortRef.current.abort();
    };
  }, []);

  /** Cancel an in-progress request — keeps partial text (like ChatGPT) */
  const handleCancel = useCallback(() => {
    // Abort the fetch
    if (abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
    }
    // Stop typewriter
    if (typewriterRef.current) {
      clearInterval(typewriterRef.current);
      typewriterRef.current = null;
    }
    // Remove typing indicator; finalize any streaming text as 'ai'
    setMessages((prev) =>
      prev
        .filter((m) => m.id !== TYPING_MSG.id)
        .map((m) =>
          m.id === TYPEWRITER_AI_ID
            ? { ...m, role: 'ai' as const }
            : m,
        ),
    );
    setIsSending(false);
  }, []);

  const handleSend = useCallback(
    async (text?: string, confirmedAction?: AgentChatResponse['pendingConfirmation']) => {
      const content = (text ?? inputText).trim();
      if (!content || isSending) return;

      // Clear pending confirmation when sending a new message
      if (!confirmedAction) setPendingConfirmation(null);

      setInputText('');

      // Optimistic user bubble (skip if this is a confirmation action)
      const tempUserMsg: DisplayMessage = {
        id: `temp-user-${Date.now()}`,
        role: 'user',
        text: confirmedAction ? `Confirmed: ${confirmedAction.preview}` : content,
      };

      setMessages((prev) => [...prev, tempUserMsg]);
      setIsSending(true);
      scrollToBottom();

      // Show typing indicator while waiting for API response
      setMessages((prev) => [...prev, TYPING_MSG]);
      scrollToBottom();

      // Create abort controller for this request
      const abortController = new AbortController();
      abortRef.current = abortController;

      try {
        // Route through the agent endpoint with session
        const agentResponse = await sendAgentChatMessage(
          {
            message: content,
            sessionId: sessionIdRef.current ?? undefined,
            activeTab: 'Chat',
            timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
            confirmedAction: confirmedAction
              ? {
                  toolName: confirmedAction.toolName,
                  toolInput: confirmedAction.toolInput,
                  agentType: confirmedAction.agentType,
                  actions: confirmedAction.actions,
                }
              : undefined,
          },
          abortController.signal,
        );

        // Capture session ID from response
        if (agentResponse.sessionId && agentResponse.sessionId !== sessionIdRef.current) {
          setSessionId(agentResponse.sessionId);
        }

        // If cancelled while awaiting, bail out
        if (abortController.signal.aborted) return;

        // Remove typing indicator
        setMessages((prev) => prev.filter((m) => m.id !== TYPING_MSG.id));

        // Handle pending confirmation from agent
        if (agentResponse.pendingConfirmation) {
          setPendingConfirmation(agentResponse.pendingConfirmation);
        }

        // Build AI response message with structured data + confirmation action
        const aiMsg: DisplayMessage = {
          id: `ai-${Date.now()}`,
          role: 'ai' as const,
          text: agentResponse.message,
          structured: agentResponse.structured ?? null,
          confirmAction: agentResponse.pendingConfirmation ?? undefined,
        };

        // If structured data is present, skip typewriter and show cards immediately
        if (agentResponse.structured) {
          setMessages((prev) => [...prev, aiMsg]);
          scrollToBottom();
        } else {
          // Character-by-character typewriter (ChatGPT-style) for plain text
          const fullText = agentResponse.message;
          const totalChars = fullText.length;
          const TICK_MS = 16; // 60fps aligned
          const TARGET_MS = 5000; // aim for ~5s total display
          const charsPerTick = Math.max(1, Math.ceil(totalChars / (TARGET_MS / TICK_MS)));
          let charIndex = 0;
          let tickCount = 0;

          // Add streaming message (empty initially)
          setMessages((prev) => [
            ...prev,
            { id: TYPEWRITER_AI_ID, role: 'streaming' as const, text: '' },
          ]);
          scrollToBottom();

          await new Promise<void>((resolve) => {
            typewriterRef.current = setInterval(() => {
              // If cancelled during typewriter, finalize partial text
              if (abortController.signal.aborted) {
                if (typewriterRef.current) clearInterval(typewriterRef.current);
                typewriterRef.current = null;
                setMessages((prev) =>
                  prev.map((m) =>
                    m.id === TYPEWRITER_AI_ID
                      ? { ...m, role: 'ai' as const }
                      : m,
                  ),
                );
                resolve();
                return;
              }

              charIndex = Math.min(charIndex + charsPerTick, totalChars);
              tickCount++;

              setMessages((prev) =>
                prev.map((m) =>
                  m.id === TYPEWRITER_AI_ID
                    ? { ...m, text: fullText.slice(0, charIndex) }
                    : m,
                ),
              );

              // Throttle scroll to every ~10 ticks
              if (tickCount % 10 === 0) scrollToBottom();

              if (charIndex >= totalChars) {
                if (typewriterRef.current) clearInterval(typewriterRef.current);
                typewriterRef.current = null;

                // Finalize as AI message
                setMessages((prev) =>
                  prev.map((m) =>
                    m.id === TYPEWRITER_AI_ID ? { ...aiMsg } : m,
                  ),
                );
                resolve();
              }
            }, TICK_MS);
          });
        }

        track('chat_message_sent', { sport: undefined });
        scrollToBottom();

        // Persist chat with final messages
        setMessages((prev) => {
          const final = [...prev];
          setTimeout(() => persistChat(final), 200);
          return final;
        });
      } catch (err: unknown) {
        // If user manually cancelled, clean up quietly
        if (abortController.signal.aborted) {
          setMessages((prev) =>
            prev.filter((m) => m.id !== TYPING_MSG.id && m.id !== TYPEWRITER_AI_ID),
          );
          return;
        }

        // Real error — show error bubble with tap to retry
        setMessages((prev) => {
          const cleaned = prev.filter(
            (m) => m.id !== TYPING_MSG.id && m.id !== TYPEWRITER_AI_ID,
          );
          return cleaned.map((m) =>
            m.id === tempUserMsg.id
              ? { ...m, error: true, text: content }
              : m,
          );
        });
      } finally {
        abortRef.current = null;
        setIsSending(false);
      }
    },
    [inputText, isSending, scrollToBottom, persistChat],
  );

  // ── Retry failed message ───────────────────────────────────────────
  const handleRetry = useCallback(
    (msg: DisplayMessage) => {
      if (!msg.error) return;
      setMessages((prev) => prev.filter((m) => m.id !== msg.id));
      handleSend(msg.text);
    },
    [handleSend],
  );

  // ── Chip press ─────────────────────────────────────────────────────
  const handleChipPress = useCallback(
    (message: string) => {
      handleSend(message);
    },
    [handleSend],
  );

  // ── New chat ───────────────────────────────────────────────────────
  const handleNewChat = useCallback(async () => {
    const newChat = createNewChat();
    setCurrentChat(newChat);
    setMessages([]);
    setPendingConfirmation(null);
    setSessionId(null); // Will be created on first message
    setQuoteIndex((prev) => prev + 1);
    await setActiveChatId(newChat.id);
    setShowSavedChats(false);
  }, []);

  // ── Confirmation gate handlers ──────────────────────────────────
  const handleConfirmAction = useCallback(() => {
    if (!pendingConfirmation) return;
    const confirmation = pendingConfirmation;
    setPendingConfirmation(null);
    handleSend(confirmation.preview, confirmation);
  }, [pendingConfirmation, handleSend]);

  /** Confirm a single action from a batch (by index) */
  const handleConfirmSingle = useCallback(
    (index: number) => {
      if (!pendingConfirmation?.actions) return;
      const action = pendingConfirmation.actions[index];
      if (!action) return;

      // Build a single-action confirmation to send
      const singleConfirm: NonNullable<AgentChatResponse['pendingConfirmation']> = {
        toolName: action.toolName,
        toolInput: action.toolInput,
        agentType: action.agentType,
        preview: action.preview,
      };

      // Remove this action from the pending list
      const remaining = pendingConfirmation.actions.filter((_, i) => i !== index);
      if (remaining.length > 0) {
        // Keep the card with remaining actions
        setPendingConfirmation({
          ...remaining[0],
          actions: remaining.length > 1 ? remaining : undefined,
        });
      } else {
        setPendingConfirmation(null);
      }

      handleSend(action.preview, singleConfirm);
    },
    [pendingConfirmation, handleSend],
  );

  const handleCancelAction = useCallback(() => {
    setPendingConfirmation(null);
    // Add a system-like AI message confirming cancellation
    setMessages((prev) => [
      ...prev,
      {
        id: `ai-cancel-${Date.now()}`,
        role: 'ai' as const,
        text: 'Got it, cancelled.',
      },
    ]);
  }, []);

  // ── Select a saved chat ────────────────────────────────────────────
  const handleSelectChat = useCallback(
    async (chat: SavedChat) => {
      setCurrentChat(chat);
      setMessages(
        chat.messages.map((m) => ({
          id: m.id,
          role: m.role,
          text: m.text,
          structured: m.structured ?? undefined,
          confirmAction: m.confirmAction ?? undefined,
        })),
      );
      await setActiveChatId(chat.id);
      setShowSavedChats(false);
    },
    [],
  );

  // ── Delete a saved chat ────────────────────────────────────────────
  const handleDeleteChat = useCallback(
    async (chatId: string) => {
      await deleteChat(chatId);
      const all = await getSavedChats();
      setSavedChatsList(all);
    },
    [],
  );

  // ── Swipe-down on input bar to dismiss keyboard ──────────────────
  const inputBarPan = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, g) => g.dy > 4,
      onPanResponderMove: (_, g) => {
        if (g.dy > 8) Keyboard.dismiss();
      },
    }),
  ).current;

  // ── Render ─────────────────────────────────────────────────────────

  const isEmpty = messages.length === 0 && !isLoading;

  if (isLoading) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.header}>
          <Text style={styles.wordmark}>TOMO</Text>
        </View>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.accent1} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={0}
      >
        {/* ─── Header with Wordmark + Chat Controls ────────────────── */}
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <Pressable onPress={toggle} hitSlop={8} style={styles.headerBtn} accessibilityRole="button" accessibilityLabel="Toggle theme">
              <Ionicons
                name={isDark ? 'moon' : 'sunny'}
                size={20}
                color={colors.accent1}
              />
            </Pressable>
            <Pressable
              onPress={() => setShowSavedChats(true)}
              hitSlop={8}
              style={styles.headerBtn}
              accessibilityRole="button"
              accessibilityLabel="Saved chats"
            >
              <Ionicons name="chatbubbles-outline" size={22} color={colors.textOnDark} />
            </Pressable>
          </View>
          <View style={styles.wordmarkWrap}>
            <LinearGradient
              colors={colors.gradientOrangeCyan}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.wordmarkPill}
            >
              <Text style={styles.wordmark}>TOMO</Text>
            </LinearGradient>
          </View>
          <View style={styles.headerLeft}>
            <Pressable
              onPress={handleNewChat}
              hitSlop={8}
              style={styles.headerBtn}
              accessibilityRole="button"
              accessibilityLabel="New chat"
            >
              <Ionicons name="create-outline" size={22} color={colors.textOnDark} />
            </Pressable>
            <CheckinHeaderButton needsCheckin={needsCheckin} onPress={() => navigation.navigate('Checkin' as any)} />
            <NotificationBell />
            <HeaderProfileButton
              initial={profile?.name?.charAt(0)?.toUpperCase() || '?'}
              photoUrl={profile?.photoUrl}
            />
          </View>
        </View>

        {/* ─── Dev Role Switcher (dev builds only) ───────────────── */}
        <RoleSwitcher />

        {/* ─── Saved Chats Overlay ─────────────────────────────────── */}
        {showSavedChats && (
          <SavedChatsList
            chats={savedChatsList}
            activeChatId={currentChat.id}
            onSelect={handleSelectChat}
            onDelete={handleDeleteChat}
            onClose={() => setShowSavedChats(false)}
          />
        )}

        {/* ─── Chat Area ───────────────────────────────────────────── */}
        {!showSavedChats && isEmpty ? (
          <Pressable style={styles.emptyContainer} onPress={Keyboard.dismiss}>
            <View style={styles.emptyCenter}>
              {/* ── Motivational Quote ──────────────────────────────── */}
              <QuoteCard quote={currentQuote} />

              <Text style={styles.emptySubtitle}>
                Ask about training, recovery, nutrition, or how you're feeling.
              </Text>
            </View>
            <View style={styles.chipsContainer}>
              {chips.map((chip, i) => (
                <SuggestionChip
                  key={`${chip.label}-${i}`}
                  chip={chip}
                  onPress={handleChipPress}
                />
              ))}
            </View>
          </Pressable>
        ) : !showSavedChats ? (
          <>
            <FlatList
              ref={flatListRef}
              data={messages}
              keyExtractor={(item) => item.id}
              renderItem={({ item }) => {
                const confirmHandler = item.confirmAction
                  ? () => {
                      const action = item.confirmAction!;
                      setPendingConfirmation(null);
                      handleSend(action.preview, action);
                    }
                  : undefined;
                const cancelHandler = item.confirmAction
                  ? () => {
                      setPendingConfirmation(null);
                      setMessages((prev) => [
                        ...prev,
                        { id: `ai-cancel-${Date.now()}`, role: 'ai' as const, text: 'Got it, cancelled.' },
                      ]);
                    }
                  : undefined;

                const bubble = (
                  <ChatBubble
                    message={item}
                    onChipPress={handleChipPress}
                    onConfirm={confirmHandler}
                    onCancel={cancelHandler}
                  />
                );

                // Only wrap in Pressable for error retry — otherwise render directly
                // (Pressable with disabled=true blocks child touch events on web)
                if (item.error) {
                  return (
                    <Pressable onPress={() => handleRetry(item)}>
                      {bubble}
                    </Pressable>
                  );
                }
                return bubble;
              }}
              contentContainerStyle={styles.chatContent}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode="on-drag"
              onContentSizeChange={scrollToBottom}
              onScroll={handleScroll}
              scrollEventThrottle={100}
              refreshControl={
                <RefreshControl
                  refreshing={isRefreshing}
                  onRefresh={handleRefresh}
                  tintColor={colors.accent1}
                  colors={[colors.accent1]}
                />
              }
            />
            {showScrollDown && (
              <Pressable
                style={styles.scrollDownBtn}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel="Scroll to bottom"
                onPress={() => {
                  flatListRef.current?.scrollToEnd({ animated: true });
                  setShowScrollDown(false);
                }}
              >
                <Ionicons name="chevron-down" size={20} color={colors.textOnDark} />
              </Pressable>
            )}
          </>
        ) : null}

        {/* ─── Confirmation Card (agent write action gate) ────────── */}
        {!showSavedChats && pendingConfirmation && (
          <ConfirmationCard
            confirmation={pendingConfirmation}
            onConfirm={handleConfirmAction}
            onCancel={handleCancelAction}
            onConfirmSingle={handleConfirmSingle}
          />
        )}

        {/* ─── Input Bar ───────────────────────────────────────────── */}
        {!showSavedChats && (
          <View style={styles.inputBarContainer} {...inputBarPan.panHandlers}>
            <View style={styles.inputBar}>
              <TextInput
                style={styles.textInput}
                value={inputText}
                onChangeText={setInputText}
                placeholder="Ask anything"
                placeholderTextColor={colors.textInactive}
                multiline
                blurOnSubmit={false}
                textAlignVertical="center"
                editable={!isSending}
              />

              {isSending ? (
                <Pressable
                  onPress={handleCancel}
                  style={({ pressed }) => [
                    styles.stopButton,
                    pressed && styles.sendButtonPressed,
                  ]}
                  hitSlop={8}
                  accessibilityRole="button"
                  accessibilityLabel="Stop generating"
                >
                  <View style={styles.stopIcon} />
                </Pressable>
              ) : (
                <Pressable
                  onPress={() => handleSend()}
                  style={({ pressed }) => [
                    styles.sendButton,
                    pressed && styles.sendButtonPressed,
                  ]}
                  hitSlop={8}
                  disabled={!inputText.trim()}
                  accessibilityRole="button"
                  accessibilityLabel="Send message"
                >
                  <Ionicons
                    name="arrow-up-circle"
                    size={28}
                    color={inputText.trim() ? colors.accent1 : colors.textInactive}
                  />
                </Pressable>
              )}
            </View>
          </View>
        )}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

