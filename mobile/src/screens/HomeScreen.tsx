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
import { useNavigation, useRoute, useFocusEffect } from '@react-navigation/native';
import { SmartIcon } from '../components/SmartIcon';
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
  sendAgentChatMessageStreaming,
  getChatSuggestions,
  getToday,
  listChatSessions,
  createChatSession,
  loadChatSession,
  endChatSession,
} from '../services/api';
import type { AgentChatResponse } from '../services/api';
import { ResponseRenderer } from '../components/chat/ResponseRenderer';
import type { TomoResponse, ChatSession as ServerChatSession, CapsuleAction } from '../types/chat';
import { useAuth } from '../hooks/useAuth';
import { HeaderProfileButton } from '../components/HeaderProfileButton';
import { NotificationBell } from '../components/NotificationBell';
import { CheckinHeaderButton } from '../components/CheckinHeaderButton';
import { QuickAccessBar } from '../components/QuickAccessBar';
import { ProactiveDashboard } from '../components/chat/ProactiveDashboard';
import { useBootData } from '../hooks/useBootData';
// useFavorites removed — favorites feature deprecated
import { useCheckinStatus } from '../hooks/useCheckinStatus';
import { useAllQuotes } from '../hooks/useContentHelpers';
import { useVoiceInput } from '../hooks/useVoiceInput';
import { VoicePulse } from '../components/chat/VoicePulse';
import type { Quote } from '../hooks/useContentHelpers';
import { track } from '../services/analytics';
import { emitRefresh } from '../utils/refreshBus';
import {
  getSavedChats,
  saveChat,
  deleteChat,
  createNewChat,
  getActiveChatId,
  setActiveChatId,
} from '../services/savedChats';
import type { SavedChat, SavedMessage } from '../services/savedChats';
import { usePageConfig } from '../hooks/usePageConfig';
import type {
  ChatMessage as ChatMessageType,
  SuggestionChip as SuggestionChipType,
} from '../types';
import * as Clipboard from 'expo-clipboard';
import { TomoLoader, CHAT_LOADER_MESSAGES } from '../components/TomoLoader';

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
  /** Streaming status text (e.g. "Checking your readiness...") */
  statusText?: string;
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
      fontFamily: fontFamily.display,
      fontSize: 18,
      lineHeight: 24,
      color: colors.electricGreen,
      letterSpacing: 2,
    },

    // ── Loading ───────────────────────────────────────────────────────
    loadingContainer: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      gap: 8,
    },
    loadingIconWrap: {
      width: 52,
      height: 52,
      borderRadius: 26,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: `${colors.accent2}12`,
      marginBottom: 4,
    },
    loadingTitle: {
      fontFamily: fontFamily.semiBold,
      fontSize: 15,
      color: colors.textOnDark,
      textAlign: 'center',
    },
    loadingSubtitle: {
      fontFamily: fontFamily.regular,
      fontSize: 12,
      color: colors.textMuted,
      textAlign: 'center',
      paddingHorizontal: spacing.xxl,
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
      fontFamily: fontFamily.note,
      fontSize: 14,
      color: colors.textOnDark,
    },
    capsuleChip: {
      backgroundColor: colors.accentSubtle,
      paddingVertical: 10,
      paddingHorizontal: spacing.md,
      borderRadius: borderRadius.full,
      borderWidth: 1,
      borderColor: colors.accentBorder,
    },
    capsuleChipPressed: {
      opacity: 0.7,
      backgroundColor: colors.accentSoft,
    },
    capsuleChipText: {
      fontFamily: fontFamily.medium,
      fontSize: 13,
      color: colors.accent2,
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
    statusText: {
      fontFamily: fontFamily.regular,
      fontSize: 13,
      color: colors.textSecondary,
    },
    typingStatusWrap: {
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      gap: spacing.xs,
      paddingVertical: spacing.xs,
    },

    // ── Copy Button ───────────────────────────────────────────────────
    copyRow: {
      flexDirection: 'row',
      justifyContent: 'flex-end',
      marginTop: 4,
    },
    copyBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      paddingVertical: 2,
      paddingHorizontal: 6,
      borderRadius: 8,
    },
    copyBtnPressed: {
      opacity: 0.5,
    },
    copiedText: {
      fontFamily: fontFamily.medium,
      fontSize: 11,
      color: colors.accent2,
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

    // ── Voice Transcribing ────────────────────────────────────────────
    transcribingContainer: {
      flex: 1,
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      justifyContent: 'center' as const,
      gap: 8,
      paddingVertical: 8,
    },
    transcribingText: {
      fontFamily: fontFamily.medium,
      fontSize: 14,
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
      backgroundColor: colors.accentSubtle,
      borderWidth: 1,
      borderColor: colors.accentBorder,
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
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      paddingVertical: 10,
      paddingHorizontal: 16,
      borderRadius: 12,
    },
    confirmBtnCancel: {
      backgroundColor: 'rgba(107, 107, 107, 0.12)',
      borderWidth: 1,
      borderColor: 'rgba(107, 107, 107, 0.3)',
    },
    confirmBtnCancelText: {
      fontFamily: fontFamily.medium,
      fontSize: 13,
      color: colors.textInactive,
    },
    confirmBtnConfirm: {
      backgroundColor: colors.accentMuted,
      borderWidth: 1,
      borderColor: colors.accentBorder,
    },
    confirmBtnConfirmText: {
      fontFamily: fontFamily.medium,
      fontSize: 13,
      color: colors.accent2,
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

const SuggestionChip = React.memo(function SuggestionChip({
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
});

// ── Capsule quick-action pool for empty chat screen ─────────────────
const CAPSULE_ACTIONS = [
  { label: 'Log a test', message: 'I want to log a new test' },
  { label: 'Check in', message: 'check in' },
  { label: 'Add event', message: 'I want to add a training session' },
  { label: 'My strengths', message: 'what are my strengths and gaps?' },
  { label: 'Leaderboard', message: 'show me the leaderboard' },
  { label: 'My rules', message: 'edit my schedule rules' },
  { label: 'Plan training', message: 'plan my training week' },
  { label: 'Plan study', message: 'plan my study schedule' },
  { label: 'Check conflicts', message: 'check for any schedule conflicts' },
  { label: 'My programs', message: 'my programs' },
  { label: 'Growth stage', message: 'calculate my growth stage' },
  { label: 'Notifications', message: 'notification settings' },
  { label: 'My readiness', message: "what's my readiness?" },
  { label: 'My streak', message: 'my streak' },
  { label: 'Edit CV', message: 'edit my CV profile' },
  { label: 'My timeline', message: 'help me manage my timeline' },
];

function pickRandom<T>(arr: T[], count: number): T[] {
  const shuffled = [...arr].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, count);
}

const RandomCapsuleChips = React.memo(function RandomCapsuleChips({
  onPress,
}: {
  onPress: (message: string) => void;
}) {
  const styles = useHomeStyles();
  const [picks] = useState(() => pickRandom(CAPSULE_ACTIONS, 3));

  return (
    <View style={styles.chipsContainer}>
      {picks.map((item, i) => (
        <Pressable
          key={`${item.label}-${i}`}
          onPress={() => onPress(item.message)}
          style={({ pressed }) => [
            styles.capsuleChip,
            pressed && styles.capsuleChipPressed,
          ]}
        >
          <Text style={styles.capsuleChipText}>{item.label}</Text>
        </Pressable>
      ))}
    </View>
  );
});

// ── Chat Loading Screen — delegates to shared TomoLoader ─────────────
const ChatLoadingScreen = React.memo(function ChatLoadingScreen() {
  const styles = useHomeStyles();
  return (
    <View style={styles.loadingContainer}>
      <TomoLoader messages={CHAT_LOADER_MESSAGES} />
    </View>
  );
});

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

const CopyButton = React.memo(function CopyButton({ text }: { text: string }) {
  const styles = useHomeStyles();
  const { colors } = useTheme();
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async () => {
    try {
      await Clipboard.setStringAsync(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {}
  }, [text]);

  return (
    <View style={styles.copyRow}>
      <Pressable
        onPress={handleCopy}
        style={({ pressed }) => [styles.copyBtn, pressed && styles.copyBtnPressed]}
        hitSlop={8}
        accessibilityRole="button"
        accessibilityLabel="Copy message"
      >
        {copied ? (
          <>
            <SmartIcon name="checkmark" size={14} color={colors.accent2} />
            <Text style={styles.copiedText}>Copied!</Text>
          </>
        ) : (
          <SmartIcon name="copy-outline" size={14} color={colors.textInactive} />
        )}
      </Pressable>
    </View>
  );
});

const ChatBubble = React.memo(function ChatBubble({
  message,
  onChipPress,
  onConfirm,
  onCancel,
  onCapsuleSubmit,
  onNavigate,
}: {
  message: DisplayMessage;
  onChipPress?: (action: string) => void;
  onConfirm?: () => void;
  onCancel?: () => void;
  onCapsuleSubmit?: (action: CapsuleAction) => void;
  onNavigate?: (deepLink: { tabName: string; params?: Record<string, any>; screen?: string }) => void;
}) {
  const styles = useHomeStyles();
  const isUser = message.role === 'user';
  const isTyping = message.role === 'typing';
  const isStreaming = message.role === 'streaming';

  // Typing indicator — status text only (no dots), with green streaming cursor
  if (isTyping) {
    return (
      <View style={[styles.messageRow, styles.messageRowAi]}>
        <View style={styles.typingStatusWrap}>
          <Text style={styles.statusText}>{message.statusText || 'Thinking...'}</Text>
          <StreamingCursor />
        </View>
      </View>
    );
  }

  // User message — gray bubble, right-aligned
  if (isUser) {
    const displayText = message.text.replace(/\s*\[drillId:[^\]]*\]/g, '');
    return (
      <View style={[styles.messageRow, styles.messageRowUser]}>
        <View style={[styles.userBubble, message.error && styles.bubbleError]}>
          <Text
            style={[styles.userBubbleText, message.error && styles.bubbleTextError]}
          >
            {displayText}
          </Text>
          {message.error && <Text style={styles.retryHint}>Tap to retry</Text>}
          {!message.error && <CopyButton text={displayText} />}
        </View>
      </View>
    );
  }

  // Streaming — show status text + cursor only (never render MarkdownMessage during streaming)
  if (isStreaming) {
    return (
      <View style={[styles.messageRow, styles.messageRowAi]}>
        <View style={styles.typingStatusWrap}>
          <Text style={styles.statusText}>{message.statusText || 'Processing...'}</Text>
          <StreamingCursor />
        </View>
      </View>
    );
  }

  // No content to render — skip empty container
  const hasText = !!message.text?.trim();
  const hasCards = message.structured && ((message.structured.cards?.length ?? 0) > 0 || (message.structured.chips?.length ?? 0) > 0);
  if (!hasText && !hasCards) return null;

  // AI message — structured card or markdown fallback
  return (
    <View style={[styles.messageRow, styles.messageRowAi]}>
      <View style={styles.aiMessageContainer}>
        {message.structured && ((message.structured.cards?.length ?? 0) > 0 || (message.structured.chips?.length ?? 0) > 0) ? (
          <>
            <ResponseRenderer
              response={message.structured}
              onChipPress={onChipPress}
              onConfirm={onConfirm}
              onCancel={onCancel}
              onCapsuleSubmit={onCapsuleSubmit}
              onNavigate={onNavigate}
            />
            {/* Show text above cards if both exist — but NOT for self-contained cards
                (confirm_card, choice_card) which render their own content */}
            {message.text && !message.structured.headline
              && !(message.structured.cards ?? []).some(
                (c: any) => c.type === 'confirm_card' || c.type === 'choice_card'
              ) && (
              <MarkdownMessage content={message.text} />
            )}
          </>
        ) : message.text ? (
          <MarkdownMessage content={message.text} />
        ) : null}
        {message.text && <CopyButton text={message.text} />}
      </View>
    </View>
  );
});

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
const QuoteCard = React.memo(function QuoteCard({ quote }: { quote: Quote }) {
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
});

/** Confirmation Card — shown when agent wants to execute a write action.
 *  Supports batch actions: when actions[] has multiple items, shows each
 *  with individual confirm buttons plus a "Confirm All" option.
 */
const ConfirmationCard = React.memo(function ConfirmationCard({
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
        <SmartIcon name="shield-checkmark-outline" size={18} color={colors.accent1} />
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
              <SmartIcon name="close-outline" size={16} color={colors.textInactive} />
              <Text style={styles.confirmBtnCancelText}>Cancel All</Text>
            </Pressable>
            <Pressable
              onPress={onConfirm}
              style={({ pressed }) => [styles.confirmBtn, styles.confirmBtnConfirm, pressed && { opacity: 0.7 }]}
            >
              <SmartIcon name="checkmark-circle-outline" size={16} color={colors.accent2} />
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
              <SmartIcon name="close-outline" size={16} color={colors.textInactive} />
              <Text style={styles.confirmBtnCancelText}>Cancel</Text>
            </Pressable>
            <Pressable
              onPress={onConfirm}
              style={({ pressed }) => [styles.confirmBtn, styles.confirmBtnConfirm, pressed && { opacity: 0.7 }]}
            >
              <SmartIcon name="checkmark-circle-outline" size={16} color={colors.accent2} />
              <Text style={styles.confirmBtnConfirmText}>Confirm</Text>
            </Pressable>
          </View>
        </>
      )}
    </View>
  );
});

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
          <SmartIcon name="close" size={24} color={colors.textOnDark} />
        </Pressable>
      </View>
      {chats.length === 0 ? (
        <View style={styles.savedEmpty}>
          <SmartIcon name="chatbubbles-outline" size={40} color={colors.textInactive} />
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
                    <SmartIcon name="trash-outline" size={16} color={colors.textInactive} />
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
  const { colors } = useTheme();
  const styles = useHomeStyles();
  const pageConfig = usePageConfig('tomo_chat');
  const { profile } = useAuth();
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const { needsCheckin, isStale, checkinAgeHours } = useCheckinStatus();
  const { bootData } = useBootData();
  // favorites removed
  // sportConfig removed — no mock data sync needed
  const allQuotes = useAllQuotes();
  const [messages, setMessages] = useState<DisplayMessage[]>([]);
  const [inputText, setInputText] = useState('');
  const [chips, setChips] = useState<SuggestionChipType[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSending, setIsSending] = useState(false);

  // Voice input
  const {
    state: voiceState,
    duration: voiceDuration,
    transcript,
    startRecording,
    stopRecording,
    cancelRecording,
    clearTranscript,
    isRecording,
    isUploading,
  } = useVoiceInput();

  // When transcript arrives, populate input
  useEffect(() => {
    if (transcript) {
      setInputText(transcript);
      clearTranscript();
    }
  }, [transcript]);

  // Handle prefillMessage from navigation (e.g. "Ask Tomo" from ProgramCard, Mastery buttons)
  useEffect(() => {
    if (route.params?.prefillMessage) {
      const msg = route.params.prefillMessage;
      const shouldAutoSend = route.params?.autoSend;
      // Clear the params so it doesn't re-trigger
      navigation.setParams({ prefillMessage: undefined, newSession: undefined, autoSend: undefined });
      // Start a fresh session if requested (avoids agent lock from previous conversation)
      if (route.params?.newSession) {
        handleNewChat().then(() => {
          if (shouldAutoSend) {
            // Small delay to ensure state is settled before sending
            setTimeout(() => handleSend(msg), 150);
          } else {
            setInputText(msg);
          }
        });
      } else if (shouldAutoSend) {
        handleNewChat().then(() => {
          setTimeout(() => handleSend(msg), 150);
        });
      } else {
        setInputText(msg);
      }
    }
  }, [route.params?.prefillMessage]);

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
      // Core data — blocks the loading screen
      const [chipsRes, todayRes, saved, activeId] = await Promise.allSettled([
        getChatSuggestions(),
        getToday(),
        getSavedChats(),
        getActiveChatId(),
      ]);
      if (chipsRes.status === 'fulfilled') {
        setChips(chipsRes.value.suggestions);
      }
      if (todayRes.status === 'fulfilled') {
        setTodayData(todayRes.value);
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

    // Sessions sidebar — non-blocking, loads after chat is visible
    listChatSessions()
      .then(setServerSessions)
      .catch(() => {});
  }, []);

  const userId = profile?.uid || profile?.id || '';
  const prevUserIdRef = useRef(userId);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // SECURITY: Reset ALL chat state when user identity changes (prevents cross-user data leak)
  useEffect(() => {
    if (prevUserIdRef.current && userId && prevUserIdRef.current !== userId) {
      // User changed — wipe all local state
      setMessages([]);
      setCurrentChat(createNewChat());
      setSavedChatsList([]);
      setTodayData(null);
      setServerSessions([]);
      setChips([]);
      setIsLoading(true);
      // Re-fetch everything for the new user
      loadData();
    }
    prevUserIdRef.current = userId;
  }, [userId, loadData]);

  // Re-warm suggestions + today data when screen re-focuses (stale after 60s)
  const lastWarmRef = useRef(Date.now());
  useFocusEffect(
    useCallback(() => {
      const elapsed = Date.now() - lastWarmRef.current;
      if (elapsed > 60_000) {
        lastWarmRef.current = Date.now();
        Promise.allSettled([getChatSuggestions(), getToday()]).then(([chipsRes, todayRes]) => {
          if (chipsRes.status === 'fulfilled') setChips(chipsRes.value.suggestions);
          if (todayRes.status === 'fulfilled') setTodayData(todayRes.value);
        });
      }
    }, [])
  );

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
    async (text?: string, confirmedAction?: AgentChatResponse['pendingConfirmation'], capsuleAction?: CapsuleAction) => {
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

      // Show typing indicator while waiting for API response (dedupe)
      setMessages((prev) =>
        prev.some((m) => m.id === '__typing__') ? prev : [...prev, TYPING_MSG]
      );
      scrollToBottom();

      // Create abort controller for this request
      const abortController = new AbortController();
      abortRef.current = abortController;

      try {
        const chatPayload = {
          message: content,
          sessionId: sessionIdRef.current ?? undefined,
          activeTab: 'Chat' as const,
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          confirmedAction: confirmedAction
            ? {
                toolName: confirmedAction.toolName,
                toolInput: confirmedAction.toolInput,
                agentType: confirmedAction.agentType,
                actions: confirmedAction.actions,
              }
            : undefined,
          capsuleAction: capsuleAction ?? undefined,
        };

        // ── Try SSE streaming first, fall back to non-streaming ──
        let streamingSucceeded = false;
        const streamingTextRef = { current: '' };
        const streamMsgId = TYPEWRITER_AI_ID;

        try {
          await new Promise<void>((resolve, reject) => {
            // Keep typing indicator visible until first delta arrives
            let streamingStarted = false;
            let deltaCount = 0;

            sendAgentChatMessageStreaming(
              chatPayload,
              {
                onDelta: (text) => {
                  streamingTextRef.current += text;
                  deltaCount++;

                  if (!streamingStarted) {
                    // First delta: swap typing indicator for streaming message with text
                    streamingStarted = true;
                    setMessages((prev) => [
                      ...prev.filter((m) => m.id !== TYPING_MSG.id),
                      { id: streamMsgId, role: 'streaming' as const, text: streamingTextRef.current },
                    ]);
                  } else {
                    setMessages((prev) =>
                      prev.map((m) =>
                        m.id === streamMsgId
                          ? { ...m, text: streamingTextRef.current }
                          : m,
                      ),
                    );
                  }
                  // Throttle scroll
                  if (deltaCount % 5 === 0) scrollToBottom();
                },
                onStatus: (status) => {
                  // Update BOTH typing indicator and streaming message with status text
                  // Before first delta: typing indicator is visible, update its statusText
                  // After first delta: streaming message is visible, update that instead
                  setMessages((prev) =>
                    prev.map((m) => {
                      if (m.id === TYPING_MSG.id) return { ...m, statusText: status };
                      if (m.id === streamMsgId) return { ...m, statusText: status };
                      return m;
                    }),
                  );
                },
                onDone: (response) => {
                  streamingSucceeded = true;

                  // Capture session ID
                  if (response.sessionId && response.sessionId !== sessionIdRef.current) {
                    setSessionId(response.sessionId);
                  }

                  // Handle pending confirmation
                  if (response.pendingConfirmation) {
                    setPendingConfirmation(response.pendingConfirmation);
                  }

                  // Build final AI message
                  const aiMsg: DisplayMessage = {
                    id: `ai-${Date.now()}`,
                    role: 'ai' as const,
                    text: response.message,
                    structured: response.structured ?? null,
                    confirmAction: response.pendingConfirmation ?? undefined,
                  };

                  // Replace streaming placeholder (or typing indicator) with final message
                  if (!streamingStarted) {
                    // No deltas arrived — swap typing indicator for final message
                    setMessages((prev) => [
                      ...prev.filter((m) => m.id !== TYPING_MSG.id),
                      aiMsg,
                    ]);
                  } else {
                    setMessages((prev) =>
                      prev.map((m) => (m.id === streamMsgId ? { ...aiMsg } : m)),
                    );
                  }

                  // Emit refresh events
                  if (response.refreshTargets?.length) {
                    for (const target of response.refreshTargets) {
                      emitRefresh(target);
                    }
                  }

                  resolve();
                },
                onError: (err) => reject(err),
              },
              abortController.signal,
            );
          });
        } catch (streamErr) {
          // Streaming failed — clean up BOTH streaming placeholder AND typing indicator
          setMessages((prev) => prev.filter((m) => m.id !== streamMsgId && m.id !== TYPING_MSG.id));

          if (abortController.signal.aborted) throw streamErr;

          // Fall back to non-streaming request
          if (!streamingSucceeded) {
            setMessages((prev) =>
              prev.some((m) => m.id === '__typing__') ? prev : [...prev, TYPING_MSG]
            );

            const agentResponse = await sendAgentChatMessage(
              chatPayload,
              abortController.signal,
            );

            if (agentResponse.sessionId && agentResponse.sessionId !== sessionIdRef.current) {
              setSessionId(agentResponse.sessionId);
            }
            if (abortController.signal.aborted) return;
            setMessages((prev) => prev.filter((m) => m.id !== TYPING_MSG.id));

            if (agentResponse.pendingConfirmation) {
              setPendingConfirmation(agentResponse.pendingConfirmation);
            }

            const aiMsg: DisplayMessage = {
              id: `ai-${Date.now()}`,
              role: 'ai' as const,
              text: agentResponse.message,
              structured: agentResponse.structured ?? null,
              confirmAction: agentResponse.pendingConfirmation ?? undefined,
            };

            setMessages((prev) => [...prev, aiMsg]);

            if (agentResponse.refreshTargets?.length) {
              for (const target of agentResponse.refreshTargets) {
                emitRefresh(target);
              }
            }
          }
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
  // ── Deep navigation handler ─────────────────────────────────────
  const handleDeepNavigate = useCallback(
    (deepLink: { tabName: string; params?: Record<string, any>; screen?: string }) => {
      try {
        if (deepLink.screen) {
          // Navigate to specific sub-screen within a tab
          navigation.navigate(deepLink.screen, deepLink.params ?? {});
        } else if (deepLink.tabName) {
          // Navigate to main tab
          const parent = navigation.getParent?.();
          if (parent) {
            parent.navigate(deepLink.tabName, deepLink.params ?? {});
          } else {
            navigation.navigate(deepLink.tabName, deepLink.params ?? {});
          }
        }
      } catch (e) {
        // Fallback: try direct navigation
        navigation.navigate(deepLink.screen ?? deepLink.tabName, deepLink.params ?? {});
      }
    },
    [navigation],
  );

  const handleChipPress = useCallback(
    (message: string) => {
      // Strip [drillId:...] brackets from display — keep them in the API call for tool routing
      // The user sees a clean message, but the backend still gets the drill ID
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

  // ── Capsule submit handler ──────────────────────────────────────
  const handleCapsuleSubmit = useCallback((capsuleAction: CapsuleAction) => {
    // Build a preview message from the capsule action
    const previewParts: string[] = [];
    if (capsuleAction.toolName === 'log_test_result') {
      const { testType, score, unit } = capsuleAction.toolInput;
      previewParts.push(`Log ${score}${unit ? unit : ''} for ${(testType as string).replace(/-/g, ' ')}`);
    } else if (capsuleAction.toolName === 'log_check_in') {
      previewParts.push('Check-in submitted');
    } else if (capsuleAction.toolName === 'get_program_details') {
      const name = capsuleAction.toolInput.programName ?? 'program';
      previewParts.push(`Show me the drills for ${name}`);
    } else if (capsuleAction.toolName === 'interact_program') {
      const name = capsuleAction.toolInput.programName ?? 'program';
      const action = capsuleAction.toolInput.action;
      if (action === 'player_selected' || action === 'active') {
        previewParts.push(`Add ${name} to my training`);
      } else if (action === 'done') {
        previewParts.push(`Mark ${name} as done`);
      } else if (action === 'dismissed') {
        previewParts.push(`Dismiss ${name}`);
      } else {
        previewParts.push(`${name} — ${action}`);
      }
    } else if (capsuleAction.toolName === 'create_event') {
      const title = capsuleAction.toolInput.title ?? 'event';
      previewParts.push(`Add ${title} to calendar`);
    } else if (capsuleAction.toolName === 'generate_regular_study_plan') {
      const { subjects, planWeeks } = capsuleAction.toolInput;
      previewParts.push(`Generate ${planWeeks ?? 4}-week regular study plan for ${Array.isArray(subjects) ? subjects.join(', ') : 'subjects'}`);
    } else if (capsuleAction.toolName === '__submit_training_mix__') {
      previewParts.push('Training mix set');
    } else if (capsuleAction.toolName === '__submit_study_plan__') {
      previewParts.push('Study plan set');
    } else if (capsuleAction.toolName === '__accept_week_plan__') {
      previewParts.push('Lock it in');
    } else if (capsuleAction.toolName === '__edit_week_plan_item__') {
      previewParts.push('Update session');
    } else if (capsuleAction.toolName.startsWith('__') && capsuleAction.toolName.endsWith('__')) {
      // Synthetic capsule markers (double-underscore sentinels) are internal
      // routing hints, never user-facing — suppress the raw name from the
      // optimistic bubble and use a generic acknowledgement instead.
      previewParts.push('Submitted');
    } else {
      // Generic fallback — humanize tool name
      previewParts.push(capsuleAction.toolName.replace(/_/g, ' '));
    }
    const previewText = previewParts.join(' ');
    handleSend(previewText, undefined, capsuleAction);
  }, [handleSend]);

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
        <ChatLoadingScreen />
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
        {/* ─── Standardized Header ────────────────── */}
        <View style={{
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'center',
          paddingHorizontal: layout.screenMargin,
          paddingTop: spacing.sm,
          paddingBottom: spacing.sm,
        }}>
          <QuickAccessBar actions={[
            { key: 'saved', icon: 'chatbubbles-outline', label: 'Saved Chats', onPress: () => setShowSavedChats(true) },
            { key: 'new', icon: 'create-outline', label: 'New Chat', onPress: handleNewChat },
          ]} />
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
            <CheckinHeaderButton needsCheckin={needsCheckin} isStale={isStale} checkinAgeHours={checkinAgeHours} onPress={() => navigation.navigate('Checkin' as any)} />
            <NotificationBell />
            <HeaderProfileButton
              initial={profile?.name?.charAt(0)?.toUpperCase() || '?'}
              photoUrl={profile?.photoUrl}
            />
          </View>
        </View>

        {/* RoleSwitcher removed — use Supabase SQL to change roles */}

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
            {bootData ? (
              <View style={styles.emptyCenter}>
                <ProactiveDashboard bootData={bootData} onChipPress={handleChipPress} onViewNotifications={() => navigation.navigate('Notifications' as any)} />
              </View>
            ) : (
              <>
                <View style={styles.emptyCenter}>
                  {/* ── Motivational Quote (fallback when boot data unavailable) ── */}
                  <QuoteCard quote={currentQuote} />
                  <Text style={styles.emptySubtitle}>
                    {pageConfig?.metadata?.emptyStates?.['chat_subtitle'] || 'Ask about training, recovery, nutrition, or how you\'re feeling.'}
                  </Text>
                </View>
                <RandomCapsuleChips onPress={handleChipPress} />
              </>
            )}
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
                    onCapsuleSubmit={handleCapsuleSubmit}
                    onNavigate={handleDeepNavigate}
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
              windowSize={7}
              maxToRenderPerBatch={5}
              initialNumToRender={15}
              removeClippedSubviews={Platform.OS !== 'web'}
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
                <SmartIcon name="chevron-down" size={20} color={colors.textOnDark} />
              </Pressable>
            )}
          </>
        ) : null}

        {/* Confirmation handled by inline confirm_card in ResponseRenderer */}

        {/* ─── Input Bar ───────────────────────────────────────────── */}
        {!showSavedChats && (
          <View style={styles.inputBarContainer} {...inputBarPan.panHandlers}>
            <View style={styles.inputBar}>
              {isRecording ? (
                /* ─── Recording Mode ─── */
                <VoicePulse
                  duration={voiceDuration}
                  onStop={stopRecording}
                  onCancel={cancelRecording}
                />
              ) : isUploading ? (
                /* ─── Transcribing Mode ─── */
                <View style={styles.transcribingContainer}>
                  <ActivityIndicator size={18} color={colors.accent2} />
                  <Text style={[styles.transcribingText, { color: colors.accent2 }]}>
                    Transcribing...
                  </Text>
                </View>
              ) : (
                /* ─── Normal Input Mode ─── */
                <>
                  <TextInput
                    style={styles.textInput}
                    value={inputText}
                    onChangeText={setInputText}
                    placeholder={pageConfig?.metadata?.emptyStates?.['input_placeholder'] || "Ask Tomo"}
                    placeholderTextColor={colors.textInactive}
                    multiline
                    blurOnSubmit={false}
                    textAlignVertical="center"
                    editable={!isSending}
                    onKeyPress={(e) => {
                      // Enter (without Shift) sends the message on web/desktop
                      if (
                        e.nativeEvent.key === 'Enter' &&
                        !(e.nativeEvent as any).shiftKey
                      ) {
                        e.preventDefault?.();
                        if (inputText.trim() && !isSending) {
                          handleSend();
                        }
                      }
                    }}
                    onSubmitEditing={() => {
                      if (inputText.trim() && !isSending) {
                        handleSend();
                      }
                    }}
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
                  ) : inputText.trim() ? (
                    <Pressable
                      onPress={() => handleSend()}
                      style={({ pressed }) => [
                        styles.sendButton,
                        pressed && styles.sendButtonPressed,
                      ]}
                      hitSlop={8}
                      accessibilityRole="button"
                      accessibilityLabel="Send message"
                    >
                      <SmartIcon
                        name="arrow-up-circle"
                        size={28}
                        color={colors.accent1}
                      />
                    </Pressable>
                  ) : (
                    /* ─── Mic Button (all platforms, when input empty) ─── */
                    <Pressable
                      onPress={startRecording}
                      style={({ pressed }) => [
                        styles.sendButton,
                        pressed && styles.sendButtonPressed,
                      ]}
                      hitSlop={8}
                      accessibilityRole="button"
                      accessibilityLabel="Voice input"
                    >
                      <SmartIcon
                        name="mic-outline"
                        size={26}
                        color={colors.accent1}
                      />
                    </Pressable>
                  )}
                </>
              )}
            </View>
          </View>
        )}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

