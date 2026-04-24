import React from 'react';
import { View, StyleSheet } from 'react-native';

const EMPTY_BRICK = 'rgba(245,243,237,0.06)';

type Props = {
  total: number;
  done: number;
  color: string;
  brickHeight?: number;
};

/**
 * Flex row of `total` rounded bricks; first `done` filled with rising opacity.
 */
export function SegmentRail({ total, done, color, brickHeight = 4 }: Props) {
  const n = Math.max(0, Math.floor(total));
  const d = Math.max(0, Math.min(Math.floor(done), n));
  if (n === 0) return null;

  return (
    <View style={styles.row}>
      {Array.from({ length: n }, (_, i) => {
        const filled = i < d;
        let opacity = 0.5;
        if (filled && d > 0) {
          opacity = 0.5 + 0.5 * ((i + 1) / d);
        }
        return (
          <View
            key={i}
            style={[
              styles.brick,
              {
                height: brickHeight,
                backgroundColor: filled ? color : EMPTY_BRICK,
                opacity: filled ? opacity : 1,
              },
            ]}
          />
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    gap: 3,
    alignItems: 'center',
  },
  brick: {
    flex: 1,
    borderRadius: 4,
    minWidth: 2,
  },
});
