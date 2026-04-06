/**
 * PadelShotCapsule — Log padel shot session inline in chat.
 */
import React, { useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { colors } from '../../../theme/colors';
import { spacing, borderRadius, fontFamily } from '../../../theme';
import type { PadelShotCapsule as PadelShotCapsuleType, CapsuleAction } from '../../../types/chat';
import { PillSelector } from './shared/PillSelector';
import { CapsuleNumberInput } from './shared/CapsuleNumberInput';
import { CapsuleSubmitButton } from './shared/CapsuleSubmitButton';

interface Props {
  card: PadelShotCapsuleType;
  onSubmit: (action: CapsuleAction) => void;
}

const SHOT_TYPES = [
  { id: 'forehand_drive', label: 'Forehand Drive' },
  { id: 'backhand_drive', label: 'Backhand Drive' },
  { id: 'forehand_volley', label: 'FH Volley' },
  { id: 'backhand_volley', label: 'BH Volley' },
  { id: 'bandeja', label: 'Bandeja' },
  { id: 'vibora', label: 'Vibora' },
  { id: 'lob', label: 'Lob' },
  { id: 'smash', label: 'Smash' },
];

const SESSION_TYPES = [
  { id: 'training', label: 'Training' },
  { id: 'match', label: 'Match' },
];

export function PadelShotCapsuleComponent({ card, onSubmit }: Props) {
  const [shotType, setShotType] = useState('');
  const [overall, setOverall] = useState('');
  const [sessionType, setSessionType] = useState('training');

  const handleSubmit = () => {
    if (!shotType || !overall) return;
    onSubmit({
      type: 'padel_shot_capsule',
      toolName: 'log_padel_session',
      toolInput: {
        shots: [{ shotType, subMetrics: {}, overall: parseInt(overall) }],
        sessionType,
      },
      agentType: 'output',
    });
  };

  return (
    <View style={styles.container}>
      <Text style={styles.heading}>Log Padel Session</Text>
      <PillSelector options={SHOT_TYPES} selected={shotType} onSelect={setShotType} label="Shot Type" />
      <CapsuleNumberInput label="Rating (0-100)" value={overall} onChange={setOverall} placeholder="75" />
      <PillSelector options={SESSION_TYPES} selected={sessionType} onSelect={setSessionType} label="Session Type" />
      <CapsuleSubmitButton title="Log Shot" disabled={!shotType || !overall} onPress={handleSubmit} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { backgroundColor: colors.backgroundElevated, borderRadius: borderRadius.lg, padding: spacing.md, gap: spacing.sm },
  heading: { fontFamily: fontFamily.semiBold, fontSize: 16, color: colors.textPrimary },
});
