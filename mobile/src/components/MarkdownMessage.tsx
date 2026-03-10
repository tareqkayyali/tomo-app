/**
 * MarkdownMessage — renders AI chat text with full markdown support
 *
 * Uses @ronradtke/react-native-markdown-display with Tomo theme.
 * Handles: bold, italic, headers, bullet/numbered lists, tables,
 * inline code, code blocks, blockquotes, horizontal rules, links.
 */

import React, { useMemo } from 'react';
import { StyleSheet, Platform } from 'react-native';
import Markdown from '@ronradtke/react-native-markdown-display';
import { fontFamily } from '../theme';
import { useTheme } from '../hooks/useTheme';
import type { ThemeColors } from '../theme/colors';

interface MarkdownMessageProps {
  content: string;
}

const monoFont = Platform.OS === 'ios' ? 'Menlo' : 'monospace';

function createMarkdownStyles(colors: ThemeColors) {
  return StyleSheet.create({
    // ── Base body text ──────────────────────────────────────────────
    body: {
      fontFamily: fontFamily.regular,
      fontSize: 16,
      lineHeight: 24,
      color: colors.textOnDark,
    },

    // ── Paragraphs ──────────────────────────────────────────────────
    paragraph: {
      marginTop: 0,
      marginBottom: 10,
    },

    // ── Bold / Italic ───────────────────────────────────────────────
    strong: {
      fontFamily: fontFamily.semiBold,
      color: colors.textOnDark,
    },
    em: {
      fontFamily: fontFamily.regular,
      fontStyle: 'italic',
      color: colors.textOnDark,
    },

    // ── Headings ────────────────────────────────────────────────────
    heading1: {
      fontFamily: fontFamily.bold,
      fontSize: 22,
      lineHeight: 30,
      color: colors.textOnDark,
      marginTop: 16,
      marginBottom: 8,
    },
    heading2: {
      fontFamily: fontFamily.semiBold,
      fontSize: 19,
      lineHeight: 26,
      color: colors.textOnDark,
      marginTop: 14,
      marginBottom: 6,
    },
    heading3: {
      fontFamily: fontFamily.semiBold,
      fontSize: 17,
      lineHeight: 24,
      color: colors.textOnDark,
      marginTop: 12,
      marginBottom: 4,
    },
    heading4: {
      fontFamily: fontFamily.semiBold,
      fontSize: 16,
      lineHeight: 22,
      color: colors.textOnDark,
      marginTop: 10,
      marginBottom: 4,
    },

    // ── Links ───────────────────────────────────────────────────────
    link: {
      color: colors.accent1,
      textDecorationLine: 'underline',
    },

    // ── Bullet / Numbered Lists ─────────────────────────────────────
    bullet_list: {
      marginVertical: 4,
    },
    ordered_list: {
      marginVertical: 4,
    },
    list_item: {
      flexDirection: 'row',
      marginVertical: 3,
    },
    bullet_list_icon: {
      color: colors.textOnDark,
      fontSize: 16,
      lineHeight: 24,
      marginRight: 8,
    },
    ordered_list_icon: {
      color: colors.textOnDark,
      fontFamily: fontFamily.medium,
      fontSize: 16,
      lineHeight: 24,
      marginRight: 8,
    },
    bullet_list_content: {
      flex: 1,
    },
    ordered_list_content: {
      flex: 1,
    },

    // ── Inline Code ─────────────────────────────────────────────────
    code_inline: {
      fontFamily: monoFont,
      fontSize: 14,
      color: colors.accent2,
      backgroundColor: colors.chipBackground,
      borderRadius: 4,
      paddingHorizontal: 5,
      paddingVertical: 2,
    },

    // ── Code Block (fenced) ─────────────────────────────────────────
    fence: {
      fontFamily: monoFont,
      fontSize: 14,
      lineHeight: 20,
      color: colors.textOnDark,
      backgroundColor: colors.cardLight,
      borderRadius: 8,
      padding: 12,
      marginVertical: 8,
      borderWidth: 1,
      borderColor: colors.glassBorder,
    },
    code_block: {
      fontFamily: monoFont,
      fontSize: 14,
      lineHeight: 20,
      color: colors.textOnDark,
      backgroundColor: colors.cardLight,
      borderRadius: 8,
      padding: 12,
      marginVertical: 8,
      borderWidth: 1,
      borderColor: colors.glassBorder,
    },

    // ── Tables ──────────────────────────────────────────────────────
    table: {
      borderWidth: 1,
      borderColor: colors.borderLight,
      borderRadius: 8,
      marginVertical: 8,
    },
    thead: {
      backgroundColor: colors.chipBackground,
    },
    th: {
      fontFamily: fontFamily.semiBold,
      fontSize: 14,
      color: colors.textOnDark,
      padding: 8,
      borderRightWidth: 1,
      borderColor: colors.border,
    },
    tbody: {},
    tr: {
      borderBottomWidth: 1,
      borderColor: colors.divider,
    },
    td: {
      fontFamily: fontFamily.regular,
      fontSize: 14,
      color: colors.textOnDark,
      padding: 8,
      borderRightWidth: 1,
      borderColor: colors.divider,
    },

    // ── Blockquote ──────────────────────────────────────────────────
    blockquote: {
      backgroundColor: 'rgba(255, 107, 53, 0.06)',
      borderLeftWidth: 3,
      borderLeftColor: colors.accent1,
      paddingLeft: 12,
      paddingVertical: 4,
      marginVertical: 8,
    },

    // ── Horizontal Rule ─────────────────────────────────────────────
    hr: {
      backgroundColor: colors.glassBorder,
      height: 1,
      marginVertical: 12,
    },

    // ── Strikethrough ───────────────────────────────────────────────
    s: {
      textDecorationLine: 'line-through',
      color: colors.textInactive,
    },
  });
}

function MarkdownMessageInner({ content }: MarkdownMessageProps) {
  const { colors } = useTheme();
  const markdownStyles = useMemo(() => createMarkdownStyles(colors), [colors]);
  return (
    <Markdown style={markdownStyles} mergeStyle>
      {content}
    </Markdown>
  );
}

export const MarkdownMessage = React.memo(MarkdownMessageInner);
