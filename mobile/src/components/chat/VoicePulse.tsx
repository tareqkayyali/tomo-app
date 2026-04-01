import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withSequence,
  withTiming,
  Easing,
} from 'react-native-reanimated';
import { SmartIcon } from '../SmartIcon';
import { useTheme } from '../../hooks/useTheme';
import { fontFamily, spacing } from '../../theme';

interface VoicePulseProps {
  duration: number;
  onStop: () => void;
  onCancel: () => void;
}

export const VoicePulse = React.memo(function VoicePulse({ duration, onStop, onCancel }: VoicePulseProps) {
  const { colors } = useTheme();

  const scale = useSharedValue(1);
  const opacity = useSharedValue(1);

  React.useEffect(() => {
    scale.value = withRepeat(
      withSequence(
        withTiming(1.25, { duration: 700, easing: Easing.inOut(Easing.ease) }),
        withTiming(1.0, { duration: 700, easing: Easing.inOut(Easing.ease) }),
      ),
      -1,
    );
    opacity.value = withRepeat(
      withSequence(
        withTiming(0.5, { duration: 700 }),
        withTiming(1.0, { duration: 700 }),
      ),
      -1,
    );
  }, []);

  const pulseStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
    opacity: opacity.value,
  }));

  const minutes = Math.floor(duration / 60);
  const seconds = duration % 60;
  const timeStr = `${minutes}:${seconds.toString().padStart(2, '0')}`;

  return (
    <View style={styles.container}>
      {/* Cancel button */}
      <Pressable
        onPress={onCancel}
        style={({ pressed }) => [styles.cancelBtn, { opacity: pressed ? 0.5 : 0.7 }]}
      >
        <SmartIcon name="close" size={20} color={colors.textInactive} />
      </Pressable>

      {/* Pulse + timer */}
      <View style={styles.center}>
        <Pressable onPress={onStop}>
          <Animated.View style={[styles.pulseCircle, { backgroundColor: colors.accent1 }, pulseStyle]}>
            <SmartIcon name="stop" size={18} color={colors.textOnDark} />
          </Animated.View>
        </Pressable>
        <Text style={[styles.timer, { color: colors.textOnDark }]}>{timeStr}</Text>
      </View>

      {/* Recording label */}
      <Text style={[styles.label, { color: colors.accent1 }]}>Recording...</Text>
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    flex: 1,
    gap: 12,
    paddingVertical: 4,
  },
  cancelBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  center: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  pulseCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  timer: {
    fontFamily: fontFamily.medium,
    fontSize: 14,
    minWidth: 36,
  },
  label: {
    fontFamily: fontFamily.medium,
    fontSize: 12,
  },
});
