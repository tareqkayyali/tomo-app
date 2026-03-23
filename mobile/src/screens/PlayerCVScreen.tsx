/**
 * PlayerCVScreen — Full player CV auto-built from app data.
 * 10 sections: Header, Physical, DNA, Benchmarks, Mastery,
 * Training Stats, Club History, Competitions, Development, Export.
 */

import React, { useState, useCallback } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity,
  ActivityIndicator, TextInput, Alert, Modal, SafeAreaView, Platform, Pressable,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../hooks/useTheme';
import { useAuth } from '../hooks/useAuth';
import { useCVProfile, type ClubEntry } from '../hooks/useCVProfile';
import { useFootballProgress } from '../hooks/useFootballProgress';
import { useAthleteSnapshot } from '../hooks/useAthleteSnapshot';
import { updateUser } from '../services/api';
import { fontFamily, spacing, borderRadius } from '../theme';
import type { FootballPosition } from '../types/football';

const POSITIONS = [
  { key: 'ST', label: 'Striker' },
  { key: 'CAM', label: 'Attacking Midfielder' },
  { key: 'WM', label: 'Wide Midfielder' },
  { key: 'CM', label: 'Central Midfielder' },
  { key: 'FB', label: 'Full Back' },
  { key: 'CB', label: 'Centre Back' },
  { key: 'GK', label: 'Goalkeeper' },
];

const FEET = ['left', 'right', 'both'] as const;

// ── Profile Editor Modal ──

function ProfileEditorModal({
  visible,
  onClose,
  onSave,
  initial,
}: {
  visible: boolean;
  onClose: () => void;
  onSave: (data: Record<string, any>) => void;
  initial: { position?: string; height_cm?: number; weight_kg?: number; date_of_birth?: string; preferred_foot?: string; playing_style?: string };
}) {
  const { colors } = useTheme();
  const [pos, setPos] = useState('');
  const [height, setHeight] = useState('');
  const [weight, setWeight] = useState('');
  const [dob, setDob] = useState('');
  const [foot, setFoot] = useState('');
  const [style, setStyle] = useState('');
  const [saving, setSaving] = useState(false);

  // Reset fields from initial data whenever modal opens
  React.useEffect(() => {
    if (visible) {
      setPos(initial.position ?? '');
      setHeight(initial.height_cm ? String(initial.height_cm) : '');
      setWeight(initial.weight_kg ? String(initial.weight_kg) : '');
      setDob(initial.date_of_birth ?? '');
      setFoot(initial.preferred_foot ?? '');
      setStyle(initial.playing_style ?? '');
    }
  }, [visible, initial.position, initial.height_cm, initial.weight_kg, initial.date_of_birth, initial.preferred_foot, initial.playing_style]);

  const handleSave = async () => {
    setSaving(true);
    const updates: Record<string, any> = {};
    if (pos && pos !== initial.position) updates.position = pos;
    if (height && parseFloat(height) !== initial.height_cm) updates.height_cm = parseFloat(height);
    if (weight && parseFloat(weight) !== initial.weight_kg) updates.weight_kg = parseFloat(weight);
    if (dob && dob !== initial.date_of_birth) updates.date_of_birth = dob;
    if (foot && foot !== initial.preferred_foot) updates.preferred_foot = foot;
    if (style !== (initial.playing_style ?? '')) updates.playing_style = style;
    onSave(updates);
    setSaving(false);
  };

  return (
    <Modal visible={visible} animationType="slide" transparent>
      <View style={[ms.modalOverlay, { backgroundColor: colors.overlay }]}>
        <View style={[ms.modalContent, { backgroundColor: colors.backgroundElevated, borderColor: colors.border }]}>
          <Text style={[ms.modalTitle, { color: colors.textPrimary }]}>Edit Profile</Text>

          <Text style={[ms.label, { color: colors.textSecondary }]}>Position</Text>
          <View style={ms.roleRow}>
            {POSITIONS.map((p) => (
              <TouchableOpacity
                key={p.key}
                style={[ms.roleChip, { borderColor: pos === p.key ? colors.accent : colors.border, backgroundColor: pos === p.key ? colors.accent + '20' : 'transparent' }]}
                onPress={() => setPos(p.key)}
              >
                <Text style={[ms.roleText, { color: pos === p.key ? colors.accent : colors.textSecondary }]}>{p.key}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <View style={ms.yearRow}>
            <View style={{ flex: 1 }}>
              <Text style={[ms.label, { color: colors.textSecondary }]}>Height (cm)</Text>
              <TextInput
                style={[ms.input, { color: colors.textPrimary, backgroundColor: colors.inputBackground, borderColor: colors.border }]}
                value={height} onChangeText={setHeight} keyboardType="decimal-pad" placeholder="175"
                placeholderTextColor={colors.textDisabled}
              />
            </View>
            <View style={{ flex: 1, marginLeft: 12 }}>
              <Text style={[ms.label, { color: colors.textSecondary }]}>Weight (kg)</Text>
              <TextInput
                style={[ms.input, { color: colors.textPrimary, backgroundColor: colors.inputBackground, borderColor: colors.border }]}
                value={weight} onChangeText={setWeight} keyboardType="decimal-pad" placeholder="70"
                placeholderTextColor={colors.textDisabled}
              />
            </View>
          </View>

          <Text style={[ms.label, { color: colors.textSecondary }]}>Date of Birth (YYYY-MM-DD)</Text>
          <TextInput
            style={[ms.input, { color: colors.textPrimary, backgroundColor: colors.inputBackground, borderColor: colors.border }]}
            value={dob} onChangeText={setDob} placeholder="2010-06-15"
            placeholderTextColor={colors.textDisabled}
          />

          <Text style={[ms.label, { color: colors.textSecondary }]}>Preferred Foot</Text>
          <View style={ms.roleRow}>
            {FEET.map((f) => (
              <TouchableOpacity
                key={f}
                style={[ms.roleChip, { borderColor: foot === f ? colors.accent : colors.border, backgroundColor: foot === f ? colors.accent + '20' : 'transparent' }]}
                onPress={() => setFoot(f)}
              >
                <Text style={[ms.roleText, { color: foot === f ? colors.accent : colors.textSecondary }]}>
                  {f.charAt(0).toUpperCase() + f.slice(1)}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={[ms.label, { color: colors.textSecondary }]}>Playing Style</Text>
          <TextInput
            style={[ms.input, { color: colors.textPrimary, backgroundColor: colors.inputBackground, borderColor: colors.border }]}
            value={style} onChangeText={setStyle} placeholder="e.g. Creative playmaker"
            placeholderTextColor={colors.textDisabled}
          />

          <View style={ms.modalActions}>
            <TouchableOpacity style={[ms.modalBtn, { borderColor: colors.border }]} onPress={onClose}>
              <Text style={{ color: colors.textSecondary, fontFamily: fontFamily.medium }}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[ms.modalBtn, { backgroundColor: colors.accent }]}
              onPress={handleSave}
              disabled={saving}
            >
              <Text style={{ color: colors.textOnAccent, fontFamily: fontFamily.semiBold }}>
                {saving ? 'Saving...' : 'Save'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

// ── Club Editor Modal ──

function ClubEditorModal({
  visible,
  onClose,
  onSave,
  initial,
}: {
  visible: boolean;
  onClose: () => void;
  onSave: (data: Omit<ClubEntry, 'id'>) => void;
  initial?: ClubEntry | null;
}) {
  const { colors } = useTheme();
  const [name, setName] = useState(initial?.club_name ?? '');
  const [role, setRole] = useState(initial?.role ?? 'player');
  const [startYear, setStartYear] = useState(String(initial?.start_year ?? new Date().getFullYear()));
  const [endYear, setEndYear] = useState(initial?.end_year ? String(initial.end_year) : '');
  const [achievements, setAchievements] = useState(initial?.achievements?.join(', ') ?? '');

  return (
    <Modal visible={visible} animationType="slide" transparent>
      <View style={[ms.modalOverlay, { backgroundColor: colors.overlay }]}>
        <View style={[ms.modalContent, { backgroundColor: colors.backgroundElevated, borderColor: colors.border }]}>
          <Text style={[ms.modalTitle, { color: colors.textPrimary }]}>
            {initial ? 'Edit Club' : 'Add Club / Academy'}
          </Text>

          <Text style={[ms.label, { color: colors.textSecondary }]}>Club / Academy Name</Text>
          <TextInput
            style={[ms.input, { color: colors.textPrimary, backgroundColor: colors.inputBackground, borderColor: colors.border }]}
            value={name}
            onChangeText={setName}
            placeholder="e.g. Arsenal Academy"
            placeholderTextColor={colors.textDisabled}
          />

          <Text style={[ms.label, { color: colors.textSecondary }]}>Role</Text>
          <View style={ms.roleRow}>
            {['player', 'captain', 'trialist'].map((r) => (
              <TouchableOpacity
                key={r}
                style={[ms.roleChip, { borderColor: role === r ? colors.accent : colors.border, backgroundColor: role === r ? colors.accent + '20' : 'transparent' }]}
                onPress={() => setRole(r)}
              >
                <Text style={[ms.roleText, { color: role === r ? colors.accent : colors.textSecondary }]}>
                  {r.charAt(0).toUpperCase() + r.slice(1)}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <View style={ms.yearRow}>
            <View style={{ flex: 1 }}>
              <Text style={[ms.label, { color: colors.textSecondary }]}>Start Year</Text>
              <TextInput
                style={[ms.input, { color: colors.textPrimary, backgroundColor: colors.inputBackground, borderColor: colors.border }]}
                value={startYear}
                onChangeText={setStartYear}
                keyboardType="number-pad"
              />
            </View>
            <View style={{ flex: 1, marginLeft: 12 }}>
              <Text style={[ms.label, { color: colors.textSecondary }]}>End Year</Text>
              <TextInput
                style={[ms.input, { color: colors.textPrimary, backgroundColor: colors.inputBackground, borderColor: colors.border }]}
                value={endYear}
                onChangeText={setEndYear}
                placeholder="Current"
                placeholderTextColor={colors.textDisabled}
                keyboardType="number-pad"
              />
            </View>
          </View>

          <Text style={[ms.label, { color: colors.textSecondary }]}>Achievements (comma separated)</Text>
          <TextInput
            style={[ms.input, { color: colors.textPrimary, backgroundColor: colors.inputBackground, borderColor: colors.border }]}
            value={achievements}
            onChangeText={setAchievements}
            placeholder="e.g. League Winner, Top Scorer"
            placeholderTextColor={colors.textDisabled}
          />

          <View style={ms.modalActions}>
            <TouchableOpacity style={[ms.modalBtn, { borderColor: colors.border }]} onPress={onClose}>
              <Text style={{ color: colors.textSecondary, fontFamily: fontFamily.medium }}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[ms.modalBtn, { backgroundColor: colors.accent }]}
              onPress={() => {
                if (!name.trim()) { Alert.alert('Enter club name'); return; }
                onSave({
                  club_name: name.trim(),
                  role,
                  start_year: parseInt(startYear) || new Date().getFullYear(),
                  end_year: endYear ? parseInt(endYear) : null,
                  achievements: achievements.split(',').map((a) => a.trim()).filter(Boolean),
                  notes: null,
                });
              }}
            >
              <Text style={{ color: colors.textOnAccent, fontFamily: fontFamily.semiBold }}>Save</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

// ── Section Card ──

function Section({ title, icon, children, colors }: {
  title: string; icon: string; children: React.ReactNode; colors: any;
}) {
  return (
    <View style={[ss.card, { backgroundColor: colors.backgroundElevated, borderColor: colors.border }]}>
      <View style={ss.cardHeader}>
        <Ionicons name={icon as any} size={16} color={colors.accent} />
        <Text style={[ss.cardTitle, { color: colors.textPrimary }]}>{title}</Text>
      </View>
      {children}
    </View>
  );
}

// ── Stat Chip ──

function Stat({ label, value, unit, color, colors }: {
  label: string; value: string | number | null; unit?: string; color?: string; colors: any;
}) {
  if (value == null) return null;
  return (
    <View style={ss.statItem}>
      <Text style={[ss.statValue, { color: color || colors.accent }]}>
        {value}{unit ? ` ${unit}` : ''}
      </Text>
      <Text style={[ss.statLabel, { color: colors.textSecondary }]}>{label}</Text>
    </View>
  );
}

// ── Main Screen ──

export function PlayerCVScreen() {
  const { colors } = useTheme();
  const { user, profile, refreshProfile } = useAuth();
  const uid = user?.uid ?? '';
  const age = profile?.age ?? 16;
  const position = (profile?.position ?? 'CAM') as FootballPosition;

  const { data: cvData, isLoading, addClub, updateClub, deleteClub, refetch } = useCVProfile(uid);
  const { card } = useFootballProgress(uid, age, position);
  const snapshotHook = useAthleteSnapshot(uid);
  const snapshot = (snapshotHook as any)?.snapshot ?? null;

  const [clubModalVisible, setClubModalVisible] = useState(false);
  const [editingClub, setEditingClub] = useState<ClubEntry | null>(null);
  const [profileModalVisible, setProfileModalVisible] = useState(false);

  const handleProfileSave = useCallback(async (updates: Record<string, any>) => {
    if (Object.keys(updates).length === 0) {
      setProfileModalVisible(false);
      return;
    }
    try {
      await updateUser(updates);
      // Refresh profile data
      if (refreshProfile) await refreshProfile();
      refetch?.();
    } catch (e: any) {
      console.error('[CV] Profile save error:', e);
      if (Platform.OS === 'web') window.alert('Failed to save: ' + (e?.message || 'Unknown error'));
      else Alert.alert('Error', 'Could not save profile changes.');
    }
    setProfileModalVisible(false);
  }, [refetch]);

  if (isLoading) {
    return (
      <View style={[ss.loading, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.accent} />
      </View>
    );
  }

  const snap = cvData?.snapshot || snapshot || {};
  const clubs = cvData?.clubs ?? [];
  const competitions = cvData?.competitions ?? [];
  const currentClub = clubs.find((c) => !c.end_year);

  return (
    <SafeAreaView style={[ss.safe, { backgroundColor: colors.background }]}>
      <ScrollView style={ss.scroll} contentContainerStyle={ss.scrollContent}>

        {/* 1. HEADER */}
        <View style={[ss.headerCard, { backgroundColor: colors.backgroundElevated, borderColor: colors.border }]}>
          <TouchableOpacity
            style={ss.editProfileBtn}
            onPress={() => setProfileModalVisible(true)}
          >
            <Ionicons name="create-outline" size={18} color={colors.accent} />
          </TouchableOpacity>
          <View style={[ss.avatar, { borderColor: colors.accent }]}>
            <Text style={[ss.avatarText, { color: colors.accent }]}>
              {(profile?.name ?? 'P').charAt(0).toUpperCase()}
            </Text>
          </View>
          <Text style={[ss.playerName, { color: colors.textPrimary }]}>{profile?.name ?? 'Player'}</Text>
          <Text style={[ss.playerMeta, { color: colors.textSecondary }]}>
            {position} · Age {age}{currentClub ? ` · ${currentClub.club_name}` : ''}
          </Text>
          {(profile as any)?.preferred_foot && (
            <Text style={[ss.playerMeta, { color: colors.textSecondary, marginTop: 2 }]}>
              {(profile as any).preferred_foot.charAt(0).toUpperCase() + (profile as any).preferred_foot.slice(1)} foot
              {(profile as any)?.playing_style ? ` · ${(profile as any).playing_style}` : ''}
            </Text>
          )}
          {card && (
            <View style={ss.ratingRow}>
              <View style={[ss.ratingBadge, { backgroundColor: colors.accent + '20' }]}>
                <Text style={[ss.ratingNum, { color: colors.accent }]}>{card.overallRating}</Text>
                <Text style={[ss.ratingLabel, { color: colors.textSecondary }]}>OVR</Text>
              </View>
            </View>
          )}
        </View>

        {/* 2. PHYSICAL PROFILE */}
        <Section title="Physical Profile" icon="body-outline" colors={colors}>
          <View style={ss.statRow}>
            <Stat label="Height" value={snap.height_cm as number} unit="cm" colors={colors} />
            <Stat label="Weight" value={snap.weight_kg as number} unit="kg" colors={colors} />
            <Stat label="PHV Stage" value={snap.phv_stage as string} colors={colors} />
            <Stat label="Maturity" value={snap.phv_offset_years != null ? `${(snap.phv_offset_years as number) > 0 ? '+' : ''}${(snap.phv_offset_years as number).toFixed(1)} yrs` : null} colors={colors} />
          </View>
        </Section>

        {/* 3. PERFORMANCE DNA */}
        {card && (
          <Section title="Performance DNA" icon="star-outline" colors={colors}>
            <View style={ss.attrGrid}>
              {Object.entries(card.attributes).map(([key, attr]: [string, any]) => (
                <View key={key} style={ss.attrItem}>
                  <Text style={[ss.attrScore, { color: colors.accent }]}>{attr.score}</Text>
                  <Text style={[ss.attrName, { color: colors.textSecondary }]}>
                    {key.substring(0, 3).toUpperCase()}
                  </Text>
                  {attr.trend !== 0 && (
                    <Ionicons
                      name={attr.trend > 0 ? 'trending-up' : 'trending-down'}
                      size={12}
                      color={attr.trend > 0 ? colors.accent : colors.error}
                    />
                  )}
                </View>
              ))}
            </View>
          </Section>
        )}

        {/* 4. TEST BENCHMARKS */}
        <Section title="Test Benchmarks" icon="speedometer-outline" colors={colors}>
          {snap.speed_profile && typeof snap.speed_profile === 'object' ? (
            <View style={ss.statRow}>
              {Object.entries(snap.speed_profile as Record<string, number>).slice(0, 4).map(([k, v]) => (
                <Stat key={k} label={k.replace(/_/g, ' ')} value={typeof v === 'number' ? v.toFixed(2) : v} colors={colors} />
              ))}
            </View>
          ) : (
            <Text style={[ss.emptyText, { color: colors.textDisabled }]}>Record tests to populate benchmarks</Text>
          )}
          {snap.strength_benchmarks && typeof snap.strength_benchmarks === 'object' && (
            <View style={[ss.statRow, { marginTop: 8 }]}>
              {Object.entries(snap.strength_benchmarks as Record<string, number>).slice(0, 4).map(([k, v]) => (
                <Stat key={k} label={k.replace(/_/g, ' ')} value={typeof v === 'number' ? v.toFixed(1) : v} colors={colors} />
              ))}
            </View>
          )}
        </Section>

        {/* 5. MASTERY PILLARS */}
        {snap.mastery_scores && typeof snap.mastery_scores === 'object' && (
          <Section title="Mastery Pillars" icon="trophy-outline" colors={colors}>
            {Object.entries(snap.mastery_scores as Record<string, number>).map(([pillar, score]) => (
              <View key={pillar} style={ss.pillarRow}>
                <Text style={[ss.pillarName, { color: colors.textPrimary }]}>{pillar.replace(/_/g, ' ')}</Text>
                <View style={[ss.pillarTrack, { backgroundColor: colors.border }]}>
                  <View style={[ss.pillarFill, { width: `${Math.min(score, 100)}%`, backgroundColor: colors.accent }]} />
                </View>
                <Text style={[ss.pillarScore, { color: colors.accent }]}>P{Math.round(score)}</Text>
              </View>
            ))}
          </Section>
        )}

        {/* 6. TRAINING STATS */}
        <Section title="Training Stats" icon="fitness-outline" colors={colors}>
          <View style={ss.statRow}>
            <Stat label="Sessions" value={snap.sessions_total as number} colors={colors} />
            <Stat label="Training Age" value={snap.training_age_weeks ? `${snap.training_age_weeks}w` : null} colors={colors} />
            <Stat label="Streak" value={snap.streak_days ? `${snap.streak_days}d` : null} colors={colors} />
            <Stat label="ACWR" value={snap.acwr != null ? (snap.acwr as number).toFixed(2) : null} colors={colors} color={
              snap.acwr != null ? ((snap.acwr as number) > 1.5 ? colors.error : (snap.acwr as number) > 1.3 ? colors.warning : colors.accent) : undefined
            } />
          </View>
        </Section>

        {/* 7. CLUB & ACADEMY HISTORY */}
        <Section title="Club & Academy History" icon="shield-outline" colors={colors}>
          {clubs.length === 0 ? (
            <Text style={[ss.emptyText, { color: colors.textDisabled }]}>No clubs added yet</Text>
          ) : (
            clubs.map((club) => (
              <TouchableOpacity
                key={club.id}
                style={[ss.clubItem, { borderColor: colors.border }]}
                onPress={() => { setEditingClub(club); setClubModalVisible(true); }}
              >
                <View style={{ flex: 1 }}>
                  <Text style={[ss.clubName, { color: colors.textPrimary }]}>{club.club_name}</Text>
                  <Text style={[ss.clubMeta, { color: colors.textSecondary }]}>
                    {club.role} · {club.start_year}–{club.end_year ?? 'Present'}
                  </Text>
                  {club.achievements.length > 0 && (
                    <View style={ss.achieveRow}>
                      {club.achievements.map((a) => (
                        <View key={a} style={[ss.achieveBadge, { backgroundColor: colors.accent + '15' }]}>
                          <Text style={[ss.achieveText, { color: colors.accent }]}>{a}</Text>
                        </View>
                      ))}
                    </View>
                  )}
                </View>
                <Ionicons name="chevron-forward" size={16} color={colors.textDisabled} />
              </TouchableOpacity>
            ))
          )}
          <TouchableOpacity
            style={[ss.addBtn, { borderColor: colors.accent }]}
            onPress={() => { setEditingClub(null); setClubModalVisible(true); }}
          >
            <Ionicons name="add-circle-outline" size={16} color={colors.accent} />
            <Text style={[ss.addBtnText, { color: colors.accent }]}>Add Club / Academy</Text>
          </TouchableOpacity>
        </Section>

        {/* 8. COMPETITION RESULTS */}
        <Section title="Competition Results" icon="medal-outline" colors={colors}>
          {competitions.length === 0 ? (
            <Text style={[ss.emptyText, { color: colors.textDisabled }]}>No competition results recorded</Text>
          ) : (
            competitions.slice(0, 5).map((comp) => (
              <View key={comp.id} style={[ss.compItem, { borderColor: colors.border }]}>
                <Text style={[ss.compName, { color: colors.textPrimary }]}>
                  {comp.payload.competition_name ?? 'Match'}
                  {comp.payload.opponent ? ` vs ${comp.payload.opponent}` : ''}
                </Text>
                <View style={ss.compDetails}>
                  {comp.payload.result && (
                    <View style={[ss.resultBadge, {
                      backgroundColor: comp.payload.result.startsWith('W') ? colors.accent + '20' :
                        comp.payload.result.startsWith('L') ? colors.error + '20' : colors.warning + '20'
                    }]}>
                      <Text style={[ss.resultText, {
                        color: comp.payload.result.startsWith('W') ? colors.accent :
                          comp.payload.result.startsWith('L') ? colors.error : colors.warning
                      }]}>{comp.payload.result}</Text>
                    </View>
                  )}
                  {comp.payload.minutes_played != null && (
                    <Text style={[ss.compMins, { color: colors.textSecondary }]}>{comp.payload.minutes_played} min</Text>
                  )}
                </View>
              </View>
            ))
          )}
        </Section>

        {/* 9. DEVELOPMENT TRAJECTORY */}
        {card && card.history.length > 0 && (
          <Section title="Development" icon="trending-up-outline" colors={colors}>
            <View style={ss.devRow}>
              <View style={{ flex: 1 }}>
                <Text style={[ss.devLabel, { color: colors.textSecondary }]}>Rating Trend (30d)</Text>
                <Text style={[ss.devValue, { color: colors.accent }]}>
                  {card.history[0]?.overall ?? '—'} → {card.overallRating}
                </Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[ss.devLabel, { color: colors.textSecondary }]}>Sessions Logged</Text>
                <Text style={[ss.devValue, { color: colors.textPrimary }]}>{snap.sessions_total ?? 0}</Text>
              </View>
            </View>
          </Section>
        )}

        {/* 10. EXPORT */}
        <View style={ss.exportSection}>
          <TouchableOpacity style={[ss.exportBtn, { backgroundColor: colors.accent }]}>
            <Ionicons name="share-outline" size={18} color={colors.textOnAccent} />
            <Text style={[ss.exportBtnText, { color: colors.textOnAccent }]}>Share CV</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[ss.exportBtnOutline, { borderColor: colors.accent }]}>
            <Ionicons name="download-outline" size={18} color={colors.accent} />
            <Text style={[ss.exportBtnText, { color: colors.accent }]}>Export PDF</Text>
          </TouchableOpacity>
        </View>

        <View style={{ height: 100 }} />
      </ScrollView>

      {/* Profile Editor Modal */}
      <ProfileEditorModal
        visible={profileModalVisible}
        onClose={() => setProfileModalVisible(false)}
        initial={{
          position: profile?.position ?? '',
          height_cm: snap.height_cm as number | undefined,
          weight_kg: snap.weight_kg as number | undefined,
          date_of_birth: (profile as any)?.dateOfBirth ?? (profile as any)?.date_of_birth ?? '',
          preferred_foot: (profile as any)?.preferred_foot ?? '',
          playing_style: (profile as any)?.playing_style ?? '',
        }}
        onSave={handleProfileSave}
      />

      {/* Club Editor Modal */}
      <ClubEditorModal
        visible={clubModalVisible}
        onClose={() => { setClubModalVisible(false); setEditingClub(null); }}
        initial={editingClub}
        onSave={async (data) => {
          if (editingClub) {
            await updateClub(editingClub.id, data);
          } else {
            await addClub(data);
          }
          setClubModalVisible(false);
          setEditingClub(null);
        }}
      />
    </SafeAreaView>
  );
}

// ── Styles ──

const ss = StyleSheet.create({
  safe: { flex: 1 },
  loading: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  scroll: { flex: 1 },
  scrollContent: { padding: 16, gap: 12 },

  headerCard: { borderRadius: 8, borderWidth: 1, padding: 20, alignItems: 'center', position: 'relative' as const },
  editProfileBtn: { position: 'absolute' as const, top: 12, right: 12, zIndex: 1, padding: 6 },
  avatar: { width: 72, height: 72, borderRadius: 36, borderWidth: 2, justifyContent: 'center', alignItems: 'center', marginBottom: 8 },
  avatarText: { fontFamily: fontFamily.bold, fontSize: 28 },
  playerName: { fontFamily: fontFamily.bold, fontSize: 22, marginBottom: 2 },
  playerMeta: { fontFamily: fontFamily.regular, fontSize: 13, marginBottom: 12 },
  ratingRow: { flexDirection: 'row', gap: 12 },
  ratingBadge: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 8, alignItems: 'center' },
  ratingNum: { fontFamily: fontFamily.bold, fontSize: 32 },
  ratingLabel: { fontFamily: fontFamily.semiBold, fontSize: 10, letterSpacing: 1 },

  card: { borderRadius: 8, borderWidth: 1, padding: 16 },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 },
  cardTitle: { fontFamily: fontFamily.semiBold, fontSize: 14 },

  statRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  statItem: { alignItems: 'center', minWidth: 70 },
  statValue: { fontFamily: fontFamily.bold, fontSize: 18 },
  statLabel: { fontFamily: fontFamily.regular, fontSize: 10, marginTop: 2 },

  attrGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-around' },
  attrItem: { alignItems: 'center', width: '30%', marginBottom: 12 },
  attrScore: { fontFamily: fontFamily.bold, fontSize: 24 },
  attrName: { fontFamily: fontFamily.semiBold, fontSize: 10, letterSpacing: 1, marginTop: 2 },

  pillarRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  pillarName: { fontFamily: fontFamily.medium, fontSize: 12, width: 100, textTransform: 'capitalize' },
  pillarTrack: { flex: 1, height: 6, borderRadius: 3, marginHorizontal: 8, overflow: 'hidden' },
  pillarFill: { height: '100%', borderRadius: 3 },
  pillarScore: { fontFamily: fontFamily.semiBold, fontSize: 11, width: 32, textAlign: 'right' },

  clubItem: { flexDirection: 'row', alignItems: 'center', borderBottomWidth: 1, paddingVertical: 10 },
  clubName: { fontFamily: fontFamily.semiBold, fontSize: 14 },
  clubMeta: { fontFamily: fontFamily.regular, fontSize: 11, marginTop: 2, textTransform: 'capitalize' },
  achieveRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: 4 },
  achieveBadge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 8 },
  achieveText: { fontFamily: fontFamily.medium, fontSize: 10 },

  addBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 10, borderRadius: 8, borderWidth: 1, borderStyle: 'dashed', marginTop: 8 },
  addBtnText: { fontFamily: fontFamily.medium, fontSize: 13 },

  compItem: { borderBottomWidth: 1, paddingVertical: 8 },
  compName: { fontFamily: fontFamily.medium, fontSize: 13 },
  compDetails: { flexDirection: 'row', gap: 8, marginTop: 4 },
  resultBadge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6 },
  resultText: { fontFamily: fontFamily.semiBold, fontSize: 11 },
  compMins: { fontFamily: fontFamily.regular, fontSize: 11 },

  devRow: { flexDirection: 'row', gap: 16 },
  devLabel: { fontFamily: fontFamily.regular, fontSize: 11, marginBottom: 4 },
  devValue: { fontFamily: fontFamily.bold, fontSize: 18 },

  exportSection: { flexDirection: 'row', gap: 12, marginTop: 8 },
  exportBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 14, borderRadius: 12 },
  exportBtnOutline: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 14, borderRadius: 12, borderWidth: 1 },
  exportBtnText: { fontFamily: fontFamily.semiBold, fontSize: 14 },

  emptyText: { fontFamily: fontFamily.regular, fontSize: 12, textAlign: 'center', paddingVertical: 12 },
});

// ── Modal Styles ──

const ms = StyleSheet.create({
  modalOverlay: { flex: 1, justifyContent: 'flex-end' },
  modalContent: { borderTopLeftRadius: 16, borderTopRightRadius: 16, padding: 20, borderWidth: 1, borderBottomWidth: 0 },
  modalTitle: { fontFamily: fontFamily.bold, fontSize: 18, marginBottom: 16 },
  label: { fontFamily: fontFamily.medium, fontSize: 12, marginBottom: 4, marginTop: 12 },
  input: { height: 42, borderRadius: 8, borderWidth: 1, paddingHorizontal: 12, fontFamily: fontFamily.regular, fontSize: 14 },
  roleRow: { flexDirection: 'row', gap: 8 },
  roleChip: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 8, borderWidth: 1 },
  roleText: { fontFamily: fontFamily.medium, fontSize: 12 },
  yearRow: { flexDirection: 'row' },
  modalActions: { flexDirection: 'row', gap: 12, marginTop: 20 },
  modalBtn: { flex: 1, alignItems: 'center', paddingVertical: 12, borderRadius: 8, borderWidth: 1 },
});
