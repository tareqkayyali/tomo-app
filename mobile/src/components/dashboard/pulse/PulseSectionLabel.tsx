import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { fontFamily } from '../../../theme/typography';

const LABEL_COLOR = 'rgba(245,243,237,0.35)';

type Props = {
  left: string;
  right?: string;
};

export function PulseSectionLabel({ left, right }: Props) {
  return (
    <View style={styles.row}>
      <Text style={styles.left}>{left}</Text>
      {right ? <Text style={styles.right}>{right}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  left: {
    fontFamily: fontFamily.medium,
    fontSize: 9,
    fontWeight: '500',
    letterSpacing: 2,
    textTransform: 'uppercase',
    color: LABEL_COLOR,
  },
  right: {
    fontFamily: fontFamily.medium,
    fontSize: 9,
    fontWeight: '500',
    letterSpacing: 1,
    color: LABEL_COLOR,
  },
});
