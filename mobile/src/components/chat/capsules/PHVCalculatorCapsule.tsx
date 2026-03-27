/**
 * PHVCalculatorCapsule — Calculate maturity stage inline in chat.
 */
import React, { useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { colors } from '../../../theme/colors';
import { spacing, borderRadius, fontFamily } from '../../../theme';
import type { PHVCalculatorCapsule as PHVCalculatorCapsuleType, CapsuleAction } from '../../../types/chat';
import { PillSelector } from './shared/PillSelector';
import { CapsuleNumberInput } from './shared/CapsuleNumberInput';
import { CapsuleSubmitButton } from './shared/CapsuleSubmitButton';
import { calculatePHV, calculateAgeDecimal, validatePHVInputs } from '../../../utils/phvCalculator';

interface Props {
  card: PHVCalculatorCapsuleType;
  onSubmit: (action: CapsuleAction) => void;
}

const SEX_OPTIONS = [
  { id: 'male', label: 'Male' },
  { id: 'female', label: 'Female' },
];

function formatDateInput(raw: string): string {
  const digits = raw.replace(/\D/g, '').slice(0, 8);
  if (digits.length <= 4) return digits;
  if (digits.length <= 6) return `${digits.slice(0, 4)}-${digits.slice(4)}`;
  return `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6)}`;
}

function isValidDate(str: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(str)) return false;
  const d = new Date(str + 'T12:00:00');
  return !isNaN(d.getTime());
}

export function PHVCalculatorCapsuleComponent({ card, onSubmit }: Props) {
  const [sex, setSex] = useState(card.sex ?? '');
  const [dob, setDob] = useState(card.dob ?? '');
  const todayStr = new Date().toISOString().split('T')[0];
  const [testDate, setTestDate] = useState(todayStr);
  const [height, setHeight] = useState(card.standingHeightCm ? String(card.standingHeightCm) : '');
  const [sitting, setSitting] = useState(card.sittingHeightCm ? String(card.sittingHeightCm) : '');
  const [weight, setWeight] = useState(card.weightKg ? String(card.weightKg) : '');
  const [result, setResult] = useState<any>(null);

  const handleDobChange = (text: string) => setDob(formatDateInput(text));
  const handleTestDateChange = (text: string) => setTestDate(formatDateInput(text));

  const handleCalculate = () => {
    if (!sex || !isValidDate(dob)) return;
    const ageDecimal = calculateAgeDecimal(dob, isValidDate(testDate) ? testDate : undefined);
    const inputs = {
      sex: sex as 'male' | 'female',
      ageDecimal,
      standingHeightCm: parseFloat(height),
      sittingHeightCm: parseFloat(sitting),
      weightKg: parseFloat(weight),
    };
    const errors = validatePHVInputs(inputs);
    if (errors.length > 0) return;

    const phvResult = calculatePHV(inputs);
    setResult(phvResult);
  };

  const handleSave = () => {
    if (!result) return;
    onSubmit({
      type: 'phv_calculator_capsule',
      toolName: 'save_phv',
      toolInput: {
        standing_height_cm: parseFloat(height),
        sitting_height_cm: parseFloat(sitting),
        weight_kg: parseFloat(weight),
        maturity_offset: result.maturityOffset,
        phv_stage: result.maturityCategory,
        date_of_birth: dob,
        sex,
        age_decimal: isValidDate(dob) ? calculateAgeDecimal(dob, isValidDate(testDate) ? testDate : undefined) : 0,
        measurement_date: isValidDate(testDate) ? testDate : todayStr,
      },
      agentType: 'output',
    });
  };

  if (result) {
    return (
      <View style={styles.container}>
        <Text style={styles.heading}>📊 Growth Stage Result</Text>
        <View style={styles.resultRow}>
          <Text style={styles.offsetValue}>
            {result.maturityOffset > 0 ? '+' : ''}{result.maturityOffset} yrs
          </Text>
          <Text style={styles.stageBadge}>{result.ltadStage}</Text>
        </View>
        <Text style={styles.note}>{result.trainabilityNote}</Text>
        <CapsuleSubmitButton title="Save Result" onPress={handleSave} />
      </View>
    );
  }

  const canCalculate = sex && isValidDate(dob) && height && sitting && weight;

  return (
    <View style={styles.container}>
      <Text style={styles.heading}>📏 Growth Stage Calculator</Text>
      <PillSelector options={SEX_OPTIONS} selected={sex} onSelect={setSex} label="Sex" />
      <View style={styles.dateRow}>
        <View style={styles.dateField}>
          <Text style={styles.dateLabel}>Date of Birth</Text>
          <View style={styles.dateInputWrap}>
            <Text style={styles.dateInput} numberOfLines={1}>
              {dob || ''}
            </Text>
          </View>
          {!dob ? <Text style={styles.dateHint}>Set in profile settings</Text> : null}
        </View>
        <View style={styles.dateField}>
          <Text style={styles.dateLabel}>Date of Test</Text>
          <View style={styles.dateInputWrap}>
            <Text style={styles.dateInput} numberOfLines={1}>
              {testDate}
            </Text>
          </View>
          <Text style={styles.dateHint}>Today</Text>
        </View>
      </View>
      <CapsuleNumberInput label="Standing Height (cm)" value={height} onChange={setHeight} placeholder="170" />
      <CapsuleNumberInput label="Sitting Height (cm)" value={sitting} onChange={setSitting} placeholder="85" />
      <CapsuleNumberInput label="Weight (kg)" value={weight} onChange={setWeight} placeholder="60" />
      <CapsuleSubmitButton title="Calculate" disabled={!canCalculate} onPress={handleCalculate} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { backgroundColor: colors.backgroundElevated, borderRadius: borderRadius.lg, padding: spacing.md, gap: spacing.sm },
  heading: { fontFamily: fontFamily.semiBold, fontSize: 16, color: colors.textPrimary },
  resultRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  offsetValue: { fontFamily: fontFamily.bold, fontSize: 28, color: colors.accent1 },
  stageBadge: { fontFamily: fontFamily.semiBold, fontSize: 14, color: colors.accent2, backgroundColor: 'rgba(0,217,255,0.1)', paddingHorizontal: 12, paddingVertical: 4, borderRadius: borderRadius.full, overflow: 'hidden' },
  note: { fontFamily: fontFamily.regular, fontSize: 13, color: colors.textSecondary, lineHeight: 19 },
  dateRow: { flexDirection: 'row', gap: spacing.sm },
  dateField: { flex: 1, gap: 4 },
  dateLabel: { fontFamily: fontFamily.semiBold, fontSize: 12, color: colors.textInactive },
  dateInputWrap: {
    backgroundColor: colors.inputBackground,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    paddingHorizontal: spacing.compact,
    minHeight: 40,
    justifyContent: 'center',
  },
  dateInput: { fontFamily: fontFamily.regular, fontSize: 14, color: colors.textPrimary },
  dateHint: { fontFamily: fontFamily.regular, fontSize: 11, color: colors.textInactive },
});
