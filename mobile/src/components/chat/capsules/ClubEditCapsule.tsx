/**
 * ClubEditCapsule — Inline club/career entry editor within chat.
 * Shows existing entries and a form to add or edit a club.
 */

import React, { useState } from 'react';
import { View, Text, StyleSheet, TextInput, Pressable } from 'react-native';
import { colors } from '../../../theme/colors';
import { spacing, borderRadius, fontFamily } from '../../../theme';
import type { ClubEditCapsule as ClubEditCapsuleType, ClubEditCapsuleEntry, CapsuleAction } from '../../../types/chat';
import { PillSelector } from './shared/PillSelector';
import { CapsuleSubmitButton } from './shared/CapsuleSubmitButton';
import { CapsuleToggle } from './shared/CapsuleToggle';

interface ClubEditCapsuleProps {
  card: ClubEditCapsuleType;
  onSubmit: (action: CapsuleAction) => void;
}

const ENTRY_TYPES = [
  { id: 'club', label: 'Club' },
  { id: 'academy', label: 'Academy' },
  { id: 'national_team', label: 'National Team' },
  { id: 'trial', label: 'Trial' },
  { id: 'camp', label: 'Camp' },
];

export function ClubEditCapsuleComponent({ card, onSubmit }: ClubEditCapsuleProps) {
  const [mode, setMode] = useState<'list' | 'add' | 'edit'>('add');
  const [editingEntry, setEditingEntry] = useState<ClubEditCapsuleEntry | null>(null);

  // Form state
  const [clubName, setClubName] = useState('');
  const [entryType, setEntryType] = useState('club');
  const [leagueLevel, setLeagueLevel] = useState('');
  const [country, setCountry] = useState('');
  const [position, setPosition] = useState('');
  const [startedMonth, setStartedMonth] = useState('');
  const [isCurrent, setIsCurrent] = useState(true);

  const existingEntries = Array.isArray(card.existingEntries) ? card.existingEntries : [];

  const startEdit = (entry: ClubEditCapsuleEntry) => {
    setMode('edit');
    setEditingEntry(entry);
    setClubName(entry.club_name);
    setEntryType(entry.entry_type);
    setLeagueLevel(entry.league_level ?? '');
    setCountry(entry.country ?? '');
    setPosition(entry.position ?? '');
    setStartedMonth(entry.started_month ?? '');
    setIsCurrent(entry.is_current);
  };

  const handleSubmit = () => {
    if (!clubName.trim()) return;

    if (mode === 'edit' && editingEntry) {
      onSubmit({
        type: 'club_edit_capsule',
        toolName: 'update_career_entry',
        toolInput: {
          entry_id: editingEntry.id,
          club_name: clubName.trim(),
          entry_type: entryType,
          league_level: leagueLevel.trim() || null,
          country: country.trim() || null,
          position: position.trim() || null,
          started_month: startedMonth.trim() || null,
          is_current: isCurrent,
        },
        agentType: 'mastery',
      });
    } else {
      onSubmit({
        type: 'club_edit_capsule',
        toolName: 'add_career_entry',
        toolInput: {
          club_name: clubName.trim(),
          entry_type: entryType,
          league_level: leagueLevel.trim() || null,
          country: country.trim() || null,
          position: position.trim() || null,
          started_month: startedMonth.trim() || null,
          is_current: isCurrent,
        },
        agentType: 'mastery',
      });
    }
  };

  return (
    <View style={styles.container}>
      {/* Existing entries */}
      {existingEntries.length > 0 && (
        <View style={styles.existingSection}>
          <Text style={styles.sectionLabel}>Career History</Text>
          {existingEntries.map((entry) => (
            <Pressable
              key={entry.id}
              style={({ pressed }) => [styles.entryRow, pressed && styles.entryPressed]}
              onPress={() => startEdit(entry)}
            >
              <View style={styles.entryInfo}>
                <Text style={styles.entryName}>
                  {entry.club_name}
                  {entry.is_current && <Text style={styles.currentBadge}> (Current)</Text>}
                </Text>
                <Text style={styles.entryMeta}>
                  {entry.entry_type}{entry.league_level ? ` \u2022 ${entry.league_level}` : ''}{entry.country ? ` \u2022 ${entry.country}` : ''}
                </Text>
              </View>
              <Text style={styles.editHint}>Edit</Text>
            </Pressable>
          ))}
        </View>
      )}

      {/* Add/Edit form */}
      <View style={styles.formSection}>
        <Text style={styles.heading}>
          {mode === 'edit' ? 'Edit Club' : 'Add Club / Career Entry'}
        </Text>

        <View style={styles.fieldRow}>
          <Text style={styles.fieldLabel}>Club Name</Text>
          <TextInput
            style={styles.input}
            placeholder="e.g. FC Barcelona"
            placeholderTextColor={colors.textSecondary}
            value={clubName}
            onChangeText={setClubName}
          />
        </View>

        <View style={styles.fieldRow}>
          <Text style={styles.fieldLabel}>Type</Text>
          <PillSelector
            options={ENTRY_TYPES}
            selected={entryType}
            onSelect={setEntryType}
          />
        </View>

        <View style={styles.fieldRow}>
          <Text style={styles.fieldLabel}>League / Level</Text>
          <TextInput
            style={styles.input}
            placeholder="e.g. La Liga, Premier League U18"
            placeholderTextColor={colors.textSecondary}
            value={leagueLevel}
            onChangeText={setLeagueLevel}
          />
        </View>

        <View style={styles.fieldRow}>
          <Text style={styles.fieldLabel}>Country</Text>
          <TextInput
            style={styles.input}
            placeholder="e.g. Spain"
            placeholderTextColor={colors.textSecondary}
            value={country}
            onChangeText={setCountry}
          />
        </View>

        <View style={styles.fieldRow}>
          <Text style={styles.fieldLabel}>Position</Text>
          <TextInput
            style={styles.input}
            placeholder="e.g. CM, ST"
            placeholderTextColor={colors.textSecondary}
            value={position}
            onChangeText={setPosition}
          />
        </View>

        <View style={styles.fieldRow}>
          <Text style={styles.fieldLabel}>Start Month</Text>
          <TextInput
            style={styles.input}
            placeholder="YYYY-MM (e.g. 2024-09)"
            placeholderTextColor={colors.textSecondary}
            value={startedMonth}
            onChangeText={setStartedMonth}
          />
        </View>

        <CapsuleToggle
          label="Current Club"
          value={isCurrent}
          onChange={setIsCurrent}
          description="Mark as your current club"
        />

        <CapsuleSubmitButton
          title={mode === 'edit' ? 'Update Entry' : 'Add to CV'}
          disabled={!clubName.trim()}
          onPress={handleSubmit}
        />

        {mode === 'edit' && (
          <Pressable
            onPress={() => {
              setMode('add');
              setEditingEntry(null);
              setClubName('');
              setEntryType('club');
              setLeagueLevel('');
              setCountry('');
              setPosition('');
              setStartedMonth('');
              setIsCurrent(true);
            }}
            style={styles.cancelButton}
          >
            <Text style={styles.cancelText}>Cancel Edit</Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.backgroundElevated,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    gap: spacing.md,
  },
  existingSection: {
    gap: spacing.xs,
  },
  sectionLabel: {
    fontFamily: fontFamily.semiBold,
    fontSize: 13,
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  entryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.background,
    borderRadius: borderRadius.md,
    padding: spacing.sm,
  },
  entryPressed: {
    opacity: 0.7,
  },
  entryInfo: {
    flex: 1,
    gap: 2,
  },
  entryName: {
    fontFamily: fontFamily.medium,
    fontSize: 15,
    color: colors.textPrimary,
  },
  currentBadge: {
    fontFamily: fontFamily.semiBold,
    fontSize: 12,
    color: colors.accent1,
  },
  entryMeta: {
    fontFamily: fontFamily.regular,
    fontSize: 12,
    color: colors.textSecondary,
  },
  editHint: {
    fontFamily: fontFamily.medium,
    fontSize: 12,
    color: colors.accent2,
  },
  formSection: {
    gap: spacing.sm,
  },
  heading: {
    fontFamily: fontFamily.semiBold,
    fontSize: 16,
    color: colors.textPrimary,
  },
  fieldRow: {
    gap: 4,
  },
  fieldLabel: {
    fontFamily: fontFamily.medium,
    fontSize: 13,
    color: colors.textSecondary,
  },
  input: {
    fontFamily: fontFamily.regular,
    fontSize: 15,
    color: colors.textPrimary,
    backgroundColor: colors.inputBackground,
    borderRadius: borderRadius.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    minHeight: 42,
  },
  cancelButton: {
    alignItems: 'center',
    paddingVertical: spacing.xs,
  },
  cancelText: {
    fontFamily: fontFamily.medium,
    fontSize: 13,
    color: colors.textSecondary,
  },
});
