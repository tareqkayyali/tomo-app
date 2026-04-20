/**
 * PlayerScreen — the universal screen shell from the Player App design.
 *
 * Every top-level tomo screen can wrap its content in this component to
 * inherit:
 *   - SafeArea top
 *   - Ink background with subtle radial gradient
 *   - Consistent header (uppercase label + 20pt title + right icon cluster)
 *   - 20px horizontal padding
 *
 * Usage:
 *   <PlayerScreen label="Profile" title="Tareq">
 *     …content…
 *   </PlayerScreen>
 *
 *   <PlayerScreen
 *     label="Settings"
 *     title="Settings"
 *     right={<><BellBtn/><AvatarBtn/></>}
 *     onBack={() => nav.goBack()}
 *   >
 *     …content…
 *   </PlayerScreen>
 */
import React, { memo } from 'react';
import { View, Text, Pressable, StyleSheet, ScrollView, ScrollViewProps, ViewStyle, StyleProp } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '../../../hooks/useTheme';
import TomoIcon from '../TomoIcon';

// ─────────────────────────────────────────────────────────────
// PlayerHeader — the uppercase label + title + right cluster
// ─────────────────────────────────────────────────────────────

export interface PlayerHeaderProps {
  /** Small uppercase label above the title, e.g. "PROFILE" or "SETTINGS". */
  label?: string;
  /** Large page title, e.g. "Tareq" or "My Rules". */
  title: string;
  /** Optional caption / subtitle under the title (11pt muted). */
  caption?: string;
  /** Right-hand action cluster (buttons/icons). */
  right?: React.ReactNode;
  /** When set, adds a Chevron-left back button on the left of the header. */
  onBack?: () => void;
}

export const PlayerHeader = memo(({ label, title, caption, right, onBack }: PlayerHeaderProps) => {
  const { colors } = useTheme();
  return (
    <View style={styles.header}>
      {onBack && (
        <Pressable
          onPress={onBack}
          style={({ pressed }) => ({
            width: 36,
            height: 36,
            borderRadius: 12,
            borderWidth: 1,
            borderColor: colors.cream10,
            backgroundColor: pressed ? colors.cream06 : colors.cream03,
            alignItems: 'center',
            justifyContent: 'center',
            marginRight: 12,
          })}
          accessibilityRole="button"
          accessibilityLabel="Go back"
        >
          <TomoIcon name="Chevron-left" size={16} color={colors.tomoCream} />
        </Pressable>
      )}
      <View style={{ flex: 1 }}>
        {label && (
          <Text
            style={{
              fontFamily: 'Poppins_500Medium',
              fontSize: 9.5,
              letterSpacing: 1.8,
              color: colors.muted,
              textTransform: 'uppercase',
            }}
          >
            {label}
          </Text>
        )}
        <Text
          style={{
            fontFamily: 'Poppins_600SemiBold',
            fontSize: 20,
            color: colors.tomoCream,
            letterSpacing: -0.4,
            marginTop: label ? 2 : 0,
          }}
          numberOfLines={1}
        >
          {title}
        </Text>
        {caption && (
          <Text
            style={{
              fontFamily: 'Poppins_400Regular',
              fontSize: 11,
              color: colors.muted,
              marginTop: 3,
            }}
            numberOfLines={2}
          >
            {caption}
          </Text>
        )}
      </View>
      {right && <View style={styles.right}>{right}</View>}
    </View>
  );
});
PlayerHeader.displayName = 'PlayerHeader';

// ─────────────────────────────────────────────────────────────
// PlayerScreen — full-screen shell
// ─────────────────────────────────────────────────────────────

export interface PlayerScreenProps extends Omit<PlayerHeaderProps, 'title'> {
  /** Optional — omit to render no header. */
  title?: string;
  /** If true (default), wraps children in a ScrollView. Set false for
   *  screens with their own FlatList/VirtualizedList. */
  scroll?: boolean;
  /** Inner content. */
  children: React.ReactNode;
  /** Scroll content padding at bottom (above tab bar). Default 120. */
  bottomPadding?: number;
  /** SafeArea edges — default ['top']. */
  edges?: ('top' | 'right' | 'bottom' | 'left')[];
  /** Scroll props passed through. */
  scrollProps?: Omit<ScrollViewProps, 'children' | 'style' | 'contentContainerStyle'>;
  /** Style for the inner scroll content container. */
  contentStyle?: StyleProp<ViewStyle>;
}

export const PlayerScreen = memo(
  ({
    label,
    title,
    caption,
    right,
    onBack,
    scroll = true,
    children,
    bottomPadding = 120,
    edges = ['top'],
    scrollProps,
    contentStyle,
  }: PlayerScreenProps) => {
    const { colors } = useTheme();

    const header = title ? (
      <PlayerHeader label={label} title={title} caption={caption} right={right} onBack={onBack} />
    ) : null;

    return (
      <SafeAreaView style={[styles.root, { backgroundColor: colors.background }]} edges={edges as any}>
        {header}
        {scroll ? (
          <ScrollView
            showsVerticalScrollIndicator={false}
            {...scrollProps}
            style={{ flex: 1 }}
            contentContainerStyle={[{ paddingBottom: bottomPadding }, contentStyle]}
          >
            {children}
          </ScrollView>
        ) : (
          <View style={{ flex: 1 }}>{children}</View>
        )}
      </SafeAreaView>
    );
  }
);
PlayerScreen.displayName = 'PlayerScreen';

// ─────────────────────────────────────────────────────────────
// RoundIconButton — 36x36 rounded icon slot
// Reusable for header right clusters.
// ─────────────────────────────────────────────────────────────

export interface RoundIconButtonProps {
  onPress?: () => void;
  children: React.ReactNode;
  active?: boolean;
}

export const RoundIconButton = memo(({ onPress, children, active }: RoundIconButtonProps) => {
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => ({
        width: 36,
        height: 36,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: active ? colors.sage30 : colors.cream10,
        backgroundColor: active ? colors.sage12 : pressed ? colors.cream06 : colors.cream03,
        alignItems: 'center',
        justifyContent: 'center',
      })}
    >
      {children}
    </Pressable>
  );
});
RoundIconButton.displayName = 'RoundIconButton';

// ─────────────────────────────────────────────────────────────
// PlayerSection — vertically-grouped section with optional label
// Used to group content into rhythmic blocks under the header.
// ─────────────────────────────────────────────────────────────

export interface PlayerSectionProps {
  label?: string;
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  /** Horizontal padding. Default 20 (matches page gutter). */
  hPadding?: number;
  /** Vertical padding. Default 10 top / 14 bottom. */
  marginTop?: number;
  marginBottom?: number;
}

export const PlayerSection = memo(({ label, children, style, hPadding = 20, marginTop = 10, marginBottom = 14 }: PlayerSectionProps) => {
  const { colors } = useTheme();
  return (
    <View style={[{ paddingHorizontal: hPadding, marginTop, marginBottom }, style]}>
      {label && (
        <Text
          style={{
            fontFamily: 'Poppins_500Medium',
            fontSize: 9,
            letterSpacing: 2,
            color: 'rgba(245,243,237,0.35)',
            textTransform: 'uppercase',
            marginBottom: 10,
          }}
        >
          {label}
        </Text>
      )}
      {children}
    </View>
  );
});
PlayerSection.displayName = 'PlayerSection';

// ─────────────────────────────────────────────────────────────
// PlayerRow — list-item row primitive (settings rows, etc.)
// ─────────────────────────────────────────────────────────────

export interface PlayerRowProps {
  iconName?: string;
  title: string;
  subtitle?: string;
  right?: React.ReactNode;
  onPress?: () => void;
  destructive?: boolean;
}

export const PlayerRow = memo(({ iconName, title, subtitle, right, onPress, destructive }: PlayerRowProps) => {
  const { colors } = useTheme();
  const titleColor = destructive ? '#B08A7A' : colors.tomoCream;
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 14,
        paddingVertical: 13,
        backgroundColor: pressed ? colors.cream06 : colors.cream03,
        borderWidth: 1,
        borderColor: colors.cream08,
        borderRadius: 12,
        gap: 12,
        marginBottom: 6,
      })}
    >
      {iconName && (
        <View
          style={{
            width: 32,
            height: 32,
            borderRadius: 10,
            backgroundColor: colors.cream06,
            borderWidth: 1,
            borderColor: colors.cream10,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <TomoIcon name={iconName} size={16} color={destructive ? '#B08A7A' : colors.tomoCream} />
        </View>
      )}
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text
          style={{
            fontFamily: 'Poppins_500Medium',
            fontSize: 13,
            color: titleColor,
            letterSpacing: -0.1,
          }}
          numberOfLines={1}
        >
          {title}
        </Text>
        {subtitle && (
          <Text
            style={{
              fontFamily: 'Poppins_400Regular',
              fontSize: 10.5,
              color: colors.muted,
              marginTop: 2,
            }}
            numberOfLines={2}
          >
            {subtitle}
          </Text>
        )}
      </View>
      {right || <TomoIcon name="Chevron-right" size={14} color={colors.muted} />}
    </Pressable>
  );
});
PlayerRow.displayName = 'PlayerRow';

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 14,
  },
  right: {
    flexDirection: 'row',
    gap: 6,
    marginLeft: 12,
  },
});
