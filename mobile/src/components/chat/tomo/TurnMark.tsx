import React from 'react';
import { View, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { T } from './tokens';

/**
 * Turn separator. A faint sphere dot with fading hairlines.
 * Do NOT render before the first turn or after the last.
 */
export function TurnMark() {
  return (
    <View style={styles.row}>
      <LinearGradient
        colors={['transparent', T.cream06, T.cream06]}
        start={{ x: 0, y: 0.5 }}
        end={{ x: 1, y: 0.5 }}
        style={styles.line}
      />
      <View style={styles.sphereOuter}>
        <View style={styles.sphereInner} />
      </View>
      <LinearGradient
        colors={[T.cream06, T.cream06, 'transparent']}
        start={{ x: 0, y: 0.5 }}
        end={{ x: 1, y: 0.5 }}
        style={styles.line}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    marginTop: 22,
    marginBottom: 8,
    opacity: 0.8,
  },
  line: {
    flex: 1,
    height: 1,
  },
  sphereOuter: {
    width: 8,
    height: 8,
    borderRadius: 999,
    backgroundColor: '#7A9B76',
    shadowColor: T.sageLight,
    shadowOpacity: 0.35,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 0 },
  },
  sphereInner: {
    position: 'absolute',
    top: 1,
    left: 1,
    width: 3,
    height: 3,
    borderRadius: 999,
    backgroundColor: '#C8DCC3',
  },
});
