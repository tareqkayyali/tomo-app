/**
 * CapsuleSubmitButton — thin wrapper over the Tomo chat CTA primitive.
 *
 * Capsule code still imports { CapsuleSubmitButton } from here; the
 * visual language is now the shared <CTA> used throughout chat.
 */

import React from 'react';
import { View, StyleSheet } from 'react-native';
import { CTA } from '../../tomo';
import { Loader } from '../../../Loader';

interface CapsuleSubmitButtonProps {
  title: string;
  onPress: () => void;
  disabled?: boolean;
  loading?: boolean;
  /** primary = solid sage, subtle/danger = muted sage-on-transparent */
  variant?: 'primary' | 'subtle' | 'danger';
}

export function CapsuleSubmitButton({
  title,
  onPress,
  disabled,
  loading,
  variant = 'primary',
}: CapsuleSubmitButtonProps) {
  if (loading) {
    return (
      <View style={styles.loader}>
        <Loader size="sm" />
      </View>
    );
  }
  const tone = variant === 'primary' ? 'primary' : 'muted';
  return (
    <CTA tone={tone} onPress={onPress} disabled={disabled}>
      {title}
    </CTA>
  );
}

const styles = StyleSheet.create({
  loader: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    marginTop: 10,
  },
});
