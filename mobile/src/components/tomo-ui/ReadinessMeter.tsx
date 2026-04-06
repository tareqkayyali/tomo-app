/**
 * ReadinessMeter — v0 segmented readiness bar with large score.
 * 12 horizontal segments that fill based on score, with graduated opacity.
 */
import React, { memo, useMemo } from 'react';
import { StyleSheet, View, Text } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { useTheme } from '../../hooks/useTheme';
import { fontFamily } from '../../theme/typography';
import { animation } from '../../theme/spacing';

const SEGMENT_COUNT = 12;

export interface ReadinessMeterProps {
  /** Score 0-100 */
  score: number;
  /** Entrance delay index */
  enterIndex?: number;
}

const ReadinessMeter: React.FC<ReadinessMeterProps> = memo(({ score, enterIndex = 0 }) => {
  const { colors } = useTheme();
  const activeSegments = Math.round((score / 100) * SEGMENT_COUNT);

  const segments = useMemo(() =>
    Array.from({ length: SEGMENT_COUNT }, (_, i) => ({
      active: i < activeSegments,
      opacity: i < activeSegments ? 0.6 + (i / SEGMENT_COUNT) * 0.4 : 1,
    })),
    [activeSegments],
  );

  const enterDelay = enterIndex * animation.stagger.default;

  return (
    <Animated.View
      entering={FadeIn.delay(enterDelay).duration(animation.duration.normal)}
      style={styles.container}
    >
      <View style={styles.segmentRow}>
        {segments.map((seg, i) => (
          <View
            key={i}
            style={[
              styles.segment,
              {
                backgroundColor: seg.active ? colors.electricGreen : 'rgba(45,45,45,0.5)',
                opacity: seg.opacity,
              },
            ]}
          />
        ))}
      </View>
      <View style={styles.scoreRow}>
        <Text style={[styles.scoreValue, { color: colors.electricGreen }]}>
          {score}
        </Text>
        <Text style={styles.scoreSuffix}>/ 100</Text>
      </View>
    </Animated.View>
  );
});

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
  },
  segmentRow: {
    flexDirection: 'row',
    gap: 6,
    marginBottom: 12,
  },
  segment: {
    width: 20,
    height: 12,
    borderRadius: 2,
  },
  scoreRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 6,
  },
  scoreValue: {
    fontSize: 48,
    fontFamily: fontFamily.bold,
    letterSpacing: -1,
  },
  scoreSuffix: {
    fontSize: 14,
    fontFamily: fontFamily.medium,
    color: 'rgba(245,243,237,0.3)',
  },
});

ReadinessMeter.displayName = 'ReadinessMeter';

export default ReadinessMeter;
