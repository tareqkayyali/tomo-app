/**
 * BlazePodsCapsule — Log BlazePods reaction session inline in chat.
 */
import React, { useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { colors } from '../../../theme/colors';
import { spacing, borderRadius, fontFamily } from '../../../theme';
import type { BlazePodsCapsule as BlazePodsCapsuleType, CapsuleAction } from '../../../types/chat';
import { PillSelector } from './shared/PillSelector';
import { CapsuleNumberInput } from './shared/CapsuleNumberInput';
import { CapsuleSubmitButton } from './shared/CapsuleSubmitButton';

interface Props {
  card: BlazePodsCapsuleType;
  onSubmit: (action: CapsuleAction) => void;
}

const DRILL_TYPES = [
  { id: 'reaction_grid_4x4', label: '4x4 Grid' },
  { id: 'rapid_response', label: 'Rapid Response' },
  { id: 'peripheral_vision', label: 'Peripheral Vision' },
  { id: 'color_chase', label: 'Color Chase' },
  { id: 'custom', label: 'Custom Drill' },
];

export function BlazePodsCapsuleComponent({ card, onSubmit }: Props) {
  const [drillType, setDrillType] = useState('');
  const [avgReaction, setAvgReaction] = useState('');
  const [bestReaction, setBestReaction] = useState('');
  const [totalHits, setTotalHits] = useState('');

  const handleSubmit = () => {
    if (!drillType) return;
    onSubmit({
      type: 'blazepods_capsule',
      toolName: 'log_blazepods_session',
      toolInput: {
        drillType,
        ...(avgReaction ? { avgReactionMs: parseInt(avgReaction) } : {}),
        ...(bestReaction ? { bestReactionMs: parseInt(bestReaction) } : {}),
        ...(totalHits ? { totalHits: parseInt(totalHits) } : {}),
      },
      agentType: 'output',
    });
  };

  return (
    <View style={styles.container}>
      <Text style={styles.heading}>⚡ Log BlazePods Session</Text>
      <PillSelector options={DRILL_TYPES} selected={drillType} onSelect={setDrillType} label="Drill Type" />
      <CapsuleNumberInput label="Avg Reaction (ms)" value={avgReaction} onChange={setAvgReaction} placeholder="350" />
      <CapsuleNumberInput label="Best Reaction (ms)" value={bestReaction} onChange={setBestReaction} placeholder="280" />
      <CapsuleNumberInput label="Total Hits" value={totalHits} onChange={setTotalHits} placeholder="25" />
      <CapsuleSubmitButton title="Log Session" disabled={!drillType} onPress={handleSubmit} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { backgroundColor: colors.backgroundElevated, borderRadius: borderRadius.lg, padding: spacing.md, gap: spacing.sm },
  heading: { fontFamily: fontFamily.semiBold, fontSize: 16, color: colors.textPrimary },
});
