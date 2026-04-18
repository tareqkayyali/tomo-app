/**
 * SlideUpPanel — Shared slide-up panel wrapper for Dashboard quick-access.
 *
 * Used by ProgramPanel, MetricsPanel, ProgressPanel.
 * Slides up from bottom, 78% screen height, with backdrop tap-to-dismiss.
 */

import React, { useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Dimensions,
  ScrollView,
  Pressable,
} from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  Easing,
  runOnJS,
} from 'react-native-reanimated';
import Svg, { Line } from 'react-native-svg';
import { fontFamily } from '../../../theme/typography';
import { useTheme } from '../../../hooks/useTheme';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');
const PANEL_HEIGHT = SCREEN_HEIGHT * 0.78;

interface SlideUpPanelProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  subtitle: string;
  children: React.ReactNode;
  /**
   * Optional freshness stamp rendered under the subtitle.
   * Caller decides when to show/hide (e.g. only when data is >5min stale).
   * Tapping the row calls `onRefresh`.
   */
  freshness?: { label: string; onRefresh: () => void } | null;
}

export function SlideUpPanel({ isOpen, onClose, title, subtitle, children, freshness }: SlideUpPanelProps) {
  const { colors } = useTheme();
  const translateY = useSharedValue(PANEL_HEIGHT);
  const backdropOpacity = useSharedValue(0);

  useEffect(() => {
    if (isOpen) {
      translateY.value = withTiming(0, { duration: 280, easing: Easing.out(Easing.cubic) });
      backdropOpacity.value = withTiming(1, { duration: 200 });
    } else {
      translateY.value = withTiming(PANEL_HEIGHT, { duration: 250, easing: Easing.in(Easing.cubic) });
      backdropOpacity.value = withTiming(0, { duration: 200 });
    }
  }, [isOpen]);

  const panelStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
  }));

  const backdropStyle = useAnimatedStyle(() => ({
    opacity: backdropOpacity.value,
    pointerEvents: backdropOpacity.value > 0 ? 'auto' : 'none',
  }));

  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <Animated.View style={[styles.backdrop, backdropStyle as any]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
      </Animated.View>

      {/* Panel */}
      <Animated.View style={[styles.panel, { backgroundColor: colors.background }, panelStyle]}>
        {/* Drag handle */}
        <View style={styles.handleRow}>
          <View style={styles.handle} />
        </View>

        {/* Header */}
        <View style={[styles.header, { borderBottomColor: colors.borderLight }]}>
          <View style={styles.headerText}>
            <Text style={[styles.title, { color: colors.textOnDark }]}>{title}</Text>
            <Text style={[styles.subtitle, { color: colors.textMuted }]}>{subtitle}</Text>
            {freshness && (
              <TouchableOpacity onPress={freshness.onRefresh} activeOpacity={0.6} style={styles.freshnessRow}>
                <Text style={[styles.freshnessText, { color: colors.textMuted }]}>
                  {freshness.label}
                </Text>
              </TouchableOpacity>
            )}
          </View>
          <TouchableOpacity style={styles.closeBtn} onPress={onClose} activeOpacity={0.7}>
            <Svg viewBox="0 0 10 10" width={10} height={10}>
              <Line x1={1} y1={1} x2={9} y2={9} stroke={colors.textOnDark} strokeWidth={1.5} strokeLinecap="round" />
              <Line x1={9} y1={1} x2={1} y2={9} stroke={colors.textOnDark} strokeWidth={1.5} strokeLinecap="round" />
            </Svg>
          </TouchableOpacity>
        </View>

        {/* Content */}
        <ScrollView
          style={styles.content}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.contentInner}
        >
          {children}
        </ScrollView>
      </Animated.View>
    </>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.55)',
    zIndex: 49,
  },
  panel: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: PANEL_HEIGHT,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    zIndex: 50,
  },
  handleRow: {
    alignItems: 'center',
    paddingTop: 10,
    paddingBottom: 10,
  },
  handle: {
    width: 30,
    height: 3,
    borderRadius: 2,
    backgroundColor: 'rgba(245,243,237,0.12)',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingHorizontal: 20,
    paddingBottom: 14,
    borderBottomWidth: 1,
  },
  headerText: {
    flex: 1,
  },
  title: {
    fontFamily: fontFamily.semiBold,
    fontSize: 13,
  },
  subtitle: {
    fontFamily: fontFamily.regular,
    fontSize: 10,
    marginTop: 1,
  },
  freshnessRow: {
    marginTop: 6,
    alignSelf: 'flex-start',
  },
  freshnessText: {
    fontFamily: fontFamily.regular,
    fontSize: 10,
    textDecorationLine: 'underline',
    textDecorationColor: 'rgba(122,141,126,0.4)',
  },
  closeBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(245,243,237,0.07)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: {
    flex: 1,
  },
  contentInner: {
    padding: 20,
    paddingBottom: 40,
  },
});
