/**
 * PlayerCVScreen — Professional Player CV built from Tomo data fabric.
 * All action buttons use GradientButton (orange→cyan gradient).
 * Photo upload, PDF export, share link, AI generation all functional.
 */

import React, { useState, useCallback } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity,
  ActivityIndicator, TextInput, Alert, Modal, SafeAreaView, Platform,
  Linking, Image, Share,
} from 'react-native';
import { SmartIcon } from '../components/SmartIcon';
import * as ImagePicker from 'expo-image-picker';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { useTheme } from '../hooks/useTheme';
import { useAuth } from '../hooks/useAuth';
import {
  useCVProfile,
  type CVCareerEntry, type CVAcademicEntry, type CVMediaLink,
  type CVReference, type CVCharacterTrait, type CVSectionState,
} from '../hooks/useCVProfile';
import { updateUser } from '../services/api';
import * as FileSystem from 'expo-file-system';
import { PersonalStatementEditor } from '../components/cv/PersonalStatementEditor';
import { GradientButton } from '../components/GradientButton';
import { API_BASE_URL } from '../services/apiConfig';
import { getIdToken } from '../services/auth';
import { fontFamily, spacing, borderRadius } from '../theme';

import { colors } from '../theme/colors';

async function authHeaders(): Promise<Record<string, string>> {
  const token = await getIdToken();
  return token ? { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } : { 'Content-Type': 'application/json' };
}

// ── Constants ──

const POSITIONS = [
  { key: 'ST', label: 'Striker' }, { key: 'CAM', label: 'Attacking Mid' },
  { key: 'WM', label: 'Wide Mid' }, { key: 'CM', label: 'Central Mid' },
  { key: 'CDM', label: 'Defensive Mid' }, { key: 'FB', label: 'Full Back' },
  { key: 'CB', label: 'Centre Back' }, { key: 'GK', label: 'Goalkeeper' },
];
const FEET = ['left', 'right', 'both'] as const;
const ENTRY_TYPES = ['club', 'academy', 'national_team', 'trial', 'camp', 'showcase'] as const;
const MEDIA_TYPES = ['highlight_reel', 'full_match', 'training', 'social'] as const;
const PLATFORMS = ['youtube', 'vimeo', 'instagram', 'tiktok', 'wyscout', 'hudl', 'other'] as const;
const QUALIFICATIONS = ['High School', 'GCSE', 'A-Level', 'IB', 'Tawjihi', 'Bachelor', 'Other'] as const;
const RELATIONSHIPS = ['current_coach', 'former_coach', 'academy_director', 'teacher', 'other'] as const;
const TRAIT_CATEGORIES = ['leadership', 'community', 'language', 'award', 'camp'] as const;
const TRAIT_LEVELS = ['club', 'regional', 'national', 'international'] as const;

type CVTab = 'club' | 'university';

// ── Section State Badge ──

const STATE_CONFIG: Record<CVSectionState, { label: string; color: string; bgAlpha: string }> = {
  auto_complete: { label: 'Auto', color: colors.accent, bgAlpha: '15' },
  needs_input: { label: 'Add', color: colors.accent, bgAlpha: '15' },
  ai_draft_pending: { label: 'AI Draft', color: colors.textSecondary, bgAlpha: '12' },
  approved: { label: 'Done', color: colors.accent, bgAlpha: '15' },
  insufficient_data: { label: 'Needs data', color: colors.textSecondary, bgAlpha: '12' },
};

function StateBadge({ state }: { state: CVSectionState }) {
  const cfg = STATE_CONFIG[state];
  return (
    <View style={[bs.badge, { backgroundColor: cfg.color + cfg.bgAlpha, borderColor: cfg.color + '30' }]}>
      <Text style={[bs.badgeText, { color: cfg.color }]}>{cfg.label}</Text>
    </View>
  );
}

// ── Section Card ──

function Section({ title, icon, state, children, colors, onEdit }: {
  title: string; icon: string; state?: CVSectionState;
  children: React.ReactNode; colors: any; onEdit?: () => void;
}) {
  return (
    <View style={[ss.card, { backgroundColor: colors.backgroundElevated, borderColor: colors.border }]}>
      <View style={ss.cardHeader}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 }}>
          <SmartIcon name={icon as any} size={16} color={colors.accent} />
          <Text style={[ss.cardTitle, { color: colors.textPrimary }]}>{title}</Text>
        </View>
        {state && <StateBadge state={state} />}
        {onEdit && (
          <TouchableOpacity onPress={onEdit} style={{ marginLeft: 8, padding: 4 }}>
            <SmartIcon name="create-outline" size={16} color={colors.textSecondary} />
          </TouchableOpacity>
        )}
      </View>
      {children}
    </View>
  );
}

// ── Stat Chip ──

function Stat({ label, value, unit, colors }: {
  label: string; value: string | number | null; unit?: string; colors: any;
}) {
  if (value == null) return null;
  return (
    <View style={ss.statItem}>
      <Text style={[ss.statValue, { color: colors.accent }]}>{value}{unit ? ` ${unit}` : ''}</Text>
      <Text style={[ss.statLabel, { color: colors.textSecondary }]}>{label}</Text>
    </View>
  );
}

// ── Percentile Bar ──

function PercentileRow({ label, value, unit, percentile, colors }: {
  label: string; value: number; unit: string; percentile: number; colors: any;
}) {
  return (
    <View style={ss.pctRow}>
      <Text style={[ss.pctLabel, { color: colors.textSecondary }]}>{label}</Text>
      <Text style={[ss.pctValue, { color: colors.textPrimary }]}>{value}{unit ? ` ${unit}` : ''}</Text>
      <View style={[ss.pctTrack, { backgroundColor: colors.border }]}>
        <View style={[ss.pctFill, { width: `${Math.min(100, percentile)}%`, backgroundColor: colors.accent }]} />
      </View>
      <Text style={[ss.pctTag, { color: colors.accent }]}>{Math.round(percentile)}th</Text>
    </View>
  );
}

// ── Completeness Bar ──

function CompletenessBar({ pct, label, colors }: { pct: number; label: string; colors: any }) {
  return (
    <View style={ss.completeRow}>
      <Text style={[ss.completeLabel, { color: colors.textSecondary }]}>{label}</Text>
      <View style={[ss.completeTrack, { backgroundColor: colors.border }]}>
        <View style={[ss.completeFill, { width: `${pct}%`, backgroundColor: colors.accent }]} />
      </View>
      <Text style={[ss.completePct, { color: colors.accent }]}>{pct}%</Text>
    </View>
  );
}

// ── Id Row ──

function IdRow({ label, value, colors, accent }: { label: string; value: string | null; colors: any; accent?: boolean }) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 5 }}>
      <Text style={{ color: colors.textSecondary, fontFamily: fontFamily.regular, fontSize: 11 }}>{label}</Text>
      <Text style={{ color: accent ? colors.accent : colors.textPrimary, fontFamily: fontFamily.medium, fontSize: 12 }}>{value ?? '—'}</Text>
    </View>
  );
}

// ── Coachability Bar ──

function CoachBar({ label, value, colors }: { label: string; value: number; colors: any }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 7 }}>
      <Text style={{ color: colors.textSecondary, fontFamily: fontFamily.regular, fontSize: 11, flex: 1 }}>{label}</Text>
      <View style={{ width: 88, height: 4, backgroundColor: colors.border, borderRadius: 2, overflow: 'hidden' }}>
        <View style={{ height: 4, borderRadius: 2, width: `${Math.round(value * 100)}%`, backgroundColor: colors.accent }} />
      </View>
      <Text style={{ color: colors.textPrimary, fontFamily: fontFamily.semiBold, fontSize: 10, width: 30, textAlign: 'right' }}>{Math.round(value * 100)}%</Text>
    </View>
  );
}

// ── Chip Selector ──

function ChipSelector({ options, selected, onSelect, colors }: {
  options: readonly string[]; selected: string; onSelect: (v: string) => void; colors: any;
}) {
  return (
    <View style={[ms.roleRow, { flexWrap: 'wrap' }]}>
      {options.map(o => (
        <TouchableOpacity key={o}
          style={[ms.roleChip, { borderColor: selected === o ? colors.accent : colors.border, backgroundColor: selected === o ? colors.accent + '20' : 'transparent' }]}
          onPress={() => onSelect(o)}>
          <Text style={[ms.roleText, { color: selected === o ? colors.accent : colors.textSecondary }]}>
            {o.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}
          </Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}

// ══════════════════════════════════════════════════════════════════════
// MODALS
// ══════════════════════════════════════════════════════════════════════

// ── Profile Editor ──

function ProfileEditorModal({ visible, onClose, onSave, initial, colors }: {
  visible: boolean; onClose: () => void; onSave: (d: Record<string, any>) => void; initial: Record<string, any>; colors: any;
}) {
  const [pos, setPos] = useState('');
  const [height, setHeight] = useState('');
  const [weight, setWeight] = useState('');
  const [dob, setDob] = useState('');
  const [foot, setFoot] = useState('');
  const [style, setStyle] = useState('');
  const [nationality, setNationality] = useState('');
  const [saving, setSaving] = useState(false);

  React.useEffect(() => {
    if (visible) {
      setPos(initial.position ?? ''); setHeight(initial.height_cm ? String(initial.height_cm) : '');
      setWeight(initial.weight_kg ? String(initial.weight_kg) : ''); setDob(initial.date_of_birth ?? '');
      setFoot(initial.preferred_foot ?? ''); setStyle(initial.playing_style ?? '');
      setNationality(initial.nationality ?? '');
    }
  }, [visible]);

  return (
    <Modal visible={visible} animationType="slide" transparent>
      <View style={[ms.modalOverlay, { backgroundColor: colors.overlay }]}>
        <ScrollView><View style={[ms.modalContent, { backgroundColor: colors.backgroundElevated, borderColor: colors.border }]}>
          <Text style={[ms.modalTitle, { color: colors.textPrimary }]}>Edit Profile</Text>
          <Text style={[ms.label, { color: colors.textSecondary }]}>Position</Text>
          <ChipSelector options={POSITIONS.map(p => p.key)} selected={pos} onSelect={setPos} colors={colors} />
          <Text style={[ms.label, { color: colors.textSecondary }]}>Nationality</Text>
          <TextInput style={[ms.input, { color: colors.textPrimary, backgroundColor: colors.inputBackground }]} value={nationality} onChangeText={setNationality} placeholder="e.g. Jordanian" placeholderTextColor={colors.textDisabled} />
          <View style={ms.yearRow}>
            <View style={{ flex: 1 }}><Text style={[ms.label, { color: colors.textSecondary }]}>Height (cm)</Text>
              <TextInput style={[ms.input, { color: colors.textPrimary, backgroundColor: colors.inputBackground }]} value={height} onChangeText={setHeight} keyboardType="decimal-pad" placeholder="175" placeholderTextColor={colors.textDisabled} /></View>
            <View style={{ flex: 1, marginLeft: 12 }}><Text style={[ms.label, { color: colors.textSecondary }]}>Weight (kg)</Text>
              <TextInput style={[ms.input, { color: colors.textPrimary, backgroundColor: colors.inputBackground }]} value={weight} onChangeText={setWeight} keyboardType="decimal-pad" placeholder="70" placeholderTextColor={colors.textDisabled} /></View>
          </View>
          <Text style={[ms.label, { color: colors.textSecondary }]}>Date of Birth (YYYY-MM-DD)</Text>
          <TextInput style={[ms.input, { color: colors.textPrimary, backgroundColor: colors.inputBackground }]} value={dob} onChangeText={setDob} placeholder="2010-06-15" placeholderTextColor={colors.textDisabled} />
          <Text style={[ms.label, { color: colors.textSecondary }]}>Preferred Foot</Text>
          <ChipSelector options={FEET} selected={foot} onSelect={setFoot} colors={colors} />
          <Text style={[ms.label, { color: colors.textSecondary }]}>Playing Style</Text>
          <TextInput style={[ms.input, { color: colors.textPrimary, backgroundColor: colors.inputBackground }]} value={style} onChangeText={setStyle} placeholder="e.g. Creative playmaker" placeholderTextColor={colors.textDisabled} />
          <View style={ms.modalActions}>
            <GradientButton title="Cancel" icon="close" onPress={onClose} small style={{ flex: 1 }} />
            <GradientButton title={saving ? 'Saving...' : 'Save'} icon="checkmark" loading={saving} onPress={() => {
              setSaving(true);
              const u: Record<string, any> = {};
              if (pos && pos !== initial.position) u.position = pos;
              if (height && parseFloat(height) !== initial.height_cm) u.height_cm = parseFloat(height);
              if (weight && parseFloat(weight) !== initial.weight_kg) u.weight_kg = parseFloat(weight);
              if (dob && dob !== initial.date_of_birth) u.date_of_birth = dob;
              if (foot && foot !== initial.preferred_foot) u.preferred_foot = foot;
              if (style !== (initial.playing_style ?? '')) u.playing_style = style;
              if (nationality && nationality !== initial.nationality) u.nationality = nationality;
              onSave(u); setSaving(false);
            }} small style={{ flex: 1 }} />
          </View>
        </View></ScrollView>
      </View>
    </Modal>
  );
}

// ── Career Editor ──

function CareerEditorModal({ visible, onClose, onSave, initial, colors }: {
  visible: boolean; onClose: () => void; onSave: (d: Omit<CVCareerEntry, 'id'>) => void; initial?: CVCareerEntry | null; colors: any;
}) {
  const [et, setEt] = useState('club'); const [name, setName] = useState(''); const [level, setLevel] = useState('');
  const [country, setCountry] = useState(''); const [sm, setSm] = useState(''); const [em, setEm] = useState('');
  const [cur, setCur] = useState(false); const [apps, setApps] = useState(''); const [goals, setGoals] = useState('');
  const [assists, setAssists] = useState(''); const [ach, setAch] = useState('');

  React.useEffect(() => { if (visible) {
    setEt(initial?.entry_type ?? 'club'); setName(initial?.club_name ?? ''); setLevel(initial?.league_level ?? '');
    setCountry(initial?.country ?? ''); setSm(initial?.started_month ?? ''); setEm(initial?.ended_month ?? '');
    setCur(initial?.is_current ?? false); setApps(initial?.appearances ? String(initial.appearances) : '');
    setGoals(initial?.goals ? String(initial.goals) : ''); setAssists(initial?.assists ? String(initial.assists) : '');
    setAch(initial?.achievements?.join(', ') ?? '');
  }}, [visible]);

  return (
    <Modal visible={visible} animationType="slide" transparent>
      <View style={[ms.modalOverlay, { backgroundColor: colors.overlay }]}>
        <ScrollView><View style={[ms.modalContent, { backgroundColor: colors.backgroundElevated, borderColor: colors.border }]}>
          <Text style={[ms.modalTitle, { color: colors.textPrimary }]}>{initial ? 'Edit Entry' : 'Add Career Entry'}</Text>
          <Text style={[ms.label, { color: colors.textSecondary }]}>Type</Text>
          <ChipSelector options={ENTRY_TYPES} selected={et} onSelect={setEt} colors={colors} />
          <Text style={[ms.label, { color: colors.textSecondary }]}>Club / Organisation</Text>
          <TextInput style={[ms.input, { color: colors.textPrimary, backgroundColor: colors.inputBackground }]} value={name} onChangeText={setName} placeholder="e.g. Al-Wihdat SC Academy" placeholderTextColor={colors.textDisabled} />
          <Text style={[ms.label, { color: colors.textSecondary }]}>League Level</Text>
          <TextInput style={[ms.input, { color: colors.textPrimary, backgroundColor: colors.inputBackground }]} value={level} onChangeText={setLevel} placeholder="e.g. CAT2 Academy" placeholderTextColor={colors.textDisabled} />
          <Text style={[ms.label, { color: colors.textSecondary }]}>Country</Text>
          <TextInput style={[ms.input, { color: colors.textPrimary, backgroundColor: colors.inputBackground }]} value={country} onChangeText={setCountry} placeholder="Jordan" placeholderTextColor={colors.textDisabled} />
          <View style={ms.yearRow}>
            <View style={{ flex: 1 }}><Text style={[ms.label, { color: colors.textSecondary }]}>Start (YYYY-MM)</Text>
              <TextInput style={[ms.input, { color: colors.textPrimary, backgroundColor: colors.inputBackground }]} value={sm} onChangeText={setSm} placeholder="2023-09" placeholderTextColor={colors.textDisabled} /></View>
            <View style={{ flex: 1, marginLeft: 12 }}><Text style={[ms.label, { color: colors.textSecondary }]}>End (YYYY-MM)</Text>
              <TextInput style={[ms.input, { color: colors.textPrimary, backgroundColor: colors.inputBackground }]} value={em} onChangeText={setEm} placeholder="Present" placeholderTextColor={colors.textDisabled} editable={!cur} /></View>
          </View>
          <TouchableOpacity style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8 }} onPress={() => setCur(!cur)}>
            <SmartIcon name={cur ? 'checkbox' : 'square-outline'} size={20} color={colors.accent} />
            <Text style={{ color: colors.textPrimary, fontFamily: fontFamily.medium, fontSize: 13 }}>Current</Text>
          </TouchableOpacity>
          <View style={[ms.yearRow, { marginTop: 4 }]}>
            <View style={{ flex: 1 }}><Text style={[ms.label, { color: colors.textSecondary }]}>Apps</Text>
              <TextInput style={[ms.input, { color: colors.textPrimary, backgroundColor: colors.inputBackground }]} value={apps} onChangeText={setApps} keyboardType="number-pad" placeholderTextColor={colors.textDisabled} /></View>
            <View style={{ flex: 1, marginLeft: 8 }}><Text style={[ms.label, { color: colors.textSecondary }]}>Goals</Text>
              <TextInput style={[ms.input, { color: colors.textPrimary, backgroundColor: colors.inputBackground }]} value={goals} onChangeText={setGoals} keyboardType="number-pad" placeholderTextColor={colors.textDisabled} /></View>
            <View style={{ flex: 1, marginLeft: 8 }}><Text style={[ms.label, { color: colors.textSecondary }]}>Assists</Text>
              <TextInput style={[ms.input, { color: colors.textPrimary, backgroundColor: colors.inputBackground }]} value={assists} onChangeText={setAssists} keyboardType="number-pad" placeholderTextColor={colors.textDisabled} /></View>
          </View>
          <Text style={[ms.label, { color: colors.textSecondary }]}>Achievements (comma separated)</Text>
          <TextInput style={[ms.input, { color: colors.textPrimary, backgroundColor: colors.inputBackground }]} value={ach} onChangeText={setAch} placeholder="e.g. League Winner" placeholderTextColor={colors.textDisabled} />
          <View style={ms.modalActions}>
            <GradientButton title="Cancel" icon="close" onPress={onClose} small style={{ flex: 1 }} />
            <GradientButton title="Save" icon="checkmark" small style={{ flex: 1 }} onPress={() => {
              if (!name.trim()) { if (Platform.OS === 'web') window.alert('Enter club name'); else Alert.alert('Enter club name'); return; }
              onSave({ entry_type: et, club_name: name.trim(), league_level: level || null, country: country || null, position: null, started_month: sm || null, ended_month: cur ? null : (em || null), is_current: cur, appearances: apps ? parseInt(apps) : null, goals: goals ? parseInt(goals) : null, assists: assists ? parseInt(assists) : null, clean_sheets: null, achievements: ach.split(',').map(a => a.trim()).filter(Boolean), injury_note: null });
            }} />
          </View>
        </View></ScrollView>
      </View>
    </Modal>
  );
}

// ── Media Link Modal ──

function MediaModal({ visible, onClose, onSave, colors }: {
  visible: boolean; onClose: () => void; onSave: (d: Omit<CVMediaLink, 'id'>) => void; colors: any;
}) {
  const [mt, setMt] = useState<string>('highlight_reel'); const [pl, setPl] = useState<string>('youtube');
  const [url, setUrl] = useState(''); const [title, setTitle] = useState(''); const [primary, setPrimary] = useState(false);

  React.useEffect(() => { if (visible) { setMt('highlight_reel'); setPl('youtube'); setUrl(''); setTitle(''); setPrimary(false); }}, [visible]);

  return (
    <Modal visible={visible} animationType="slide" transparent>
      <View style={[ms.modalOverlay, { backgroundColor: colors.overlay }]}>
        <ScrollView><View style={[ms.modalContent, { backgroundColor: colors.backgroundElevated, borderColor: colors.border }]}>
          <Text style={[ms.modalTitle, { color: colors.textPrimary }]}>Add Video or Link</Text>
          <Text style={[ms.label, { color: colors.textSecondary }]}>Type</Text>
          <ChipSelector options={MEDIA_TYPES} selected={mt} onSelect={setMt} colors={colors} />
          <Text style={[ms.label, { color: colors.textSecondary }]}>Platform</Text>
          <ChipSelector options={PLATFORMS} selected={pl} onSelect={setPl} colors={colors} />
          <Text style={[ms.label, { color: colors.textSecondary }]}>URL</Text>
          <TextInput style={[ms.input, { color: colors.textPrimary, backgroundColor: colors.inputBackground }]} value={url} onChangeText={setUrl} placeholder="https://youtube.com/..." placeholderTextColor={colors.textDisabled} autoCapitalize="none" keyboardType="url" />
          <Text style={[ms.label, { color: colors.textSecondary }]}>Title</Text>
          <TextInput style={[ms.input, { color: colors.textPrimary, backgroundColor: colors.inputBackground }]} value={title} onChangeText={setTitle} placeholder="Highlight reel 2024/25" placeholderTextColor={colors.textDisabled} />
          <TouchableOpacity style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 12 }} onPress={() => setPrimary(!primary)}>
            <SmartIcon name={primary ? 'checkbox' : 'square-outline'} size={20} color={colors.accent} />
            <Text style={{ color: colors.textPrimary, fontFamily: fontFamily.medium, fontSize: 13 }}>Primary highlight</Text>
          </TouchableOpacity>
          <View style={ms.modalActions}>
            <GradientButton title="Cancel" icon="close" onPress={onClose} small style={{ flex: 1 }} />
            <GradientButton title="Save" icon="checkmark" small style={{ flex: 1 }} onPress={() => {
              if (!url.trim()) { if (Platform.OS === 'web') window.alert('Enter URL'); else Alert.alert('Enter URL'); return; }
              onSave({ media_type: mt, platform: pl, url: url.trim(), title: title.trim() || null, is_primary: primary }); onClose();
            }} />
          </View>
        </View></ScrollView>
      </View>
    </Modal>
  );
}

// ── Reference Modal ──

function ReferenceModal({ visible, onClose, onSave, colors }: {
  visible: boolean; onClose: () => void; onSave: (d: Omit<CVReference, 'id'>) => void; colors: any;
}) {
  const [name, setName] = useState(''); const [role, setRole] = useState(''); const [club, setClub] = useState('');
  const [email, setEmail] = useState(''); const [phone, setPhone] = useState('');
  const [rel, setRel] = useState<string>('current_coach'); const [consent, setConsent] = useState(false);

  React.useEffect(() => { if (visible) { setName(''); setRole(''); setClub(''); setEmail(''); setPhone(''); setRel('current_coach'); setConsent(false); }}, [visible]);

  return (
    <Modal visible={visible} animationType="slide" transparent>
      <View style={[ms.modalOverlay, { backgroundColor: colors.overlay }]}>
        <ScrollView><View style={[ms.modalContent, { backgroundColor: colors.backgroundElevated, borderColor: colors.border }]}>
          <Text style={[ms.modalTitle, { color: colors.textPrimary }]}>Add Reference</Text>
          <Text style={[ms.label, { color: colors.textSecondary }]}>Coach Name</Text>
          <TextInput style={[ms.input, { color: colors.textPrimary, backgroundColor: colors.inputBackground }]} value={name} onChangeText={setName} placeholder="Ahmad Haddad" placeholderTextColor={colors.textDisabled} />
          <Text style={[ms.label, { color: colors.textSecondary }]}>Role / Title</Text>
          <TextInput style={[ms.input, { color: colors.textPrimary, backgroundColor: colors.inputBackground }]} value={role} onChangeText={setRole} placeholder="Head Academy Coach" placeholderTextColor={colors.textDisabled} />
          <Text style={[ms.label, { color: colors.textSecondary }]}>Club / Institution</Text>
          <TextInput style={[ms.input, { color: colors.textPrimary, backgroundColor: colors.inputBackground }]} value={club} onChangeText={setClub} placeholder="Al-Wihdat SC" placeholderTextColor={colors.textDisabled} />
          <Text style={[ms.label, { color: colors.textSecondary }]}>Relationship</Text>
          <ChipSelector options={RELATIONSHIPS} selected={rel} onSelect={setRel} colors={colors} />
          <Text style={[ms.label, { color: colors.textSecondary }]}>Email (optional)</Text>
          <TextInput style={[ms.input, { color: colors.textPrimary, backgroundColor: colors.inputBackground }]} value={email} onChangeText={setEmail} placeholder="coach@email.com" placeholderTextColor={colors.textDisabled} keyboardType="email-address" autoCapitalize="none" />
          <Text style={[ms.label, { color: colors.textSecondary }]}>Phone (optional)</Text>
          <TextInput style={[ms.input, { color: colors.textPrimary, backgroundColor: colors.inputBackground }]} value={phone} onChangeText={setPhone} placeholder="+962..." placeholderTextColor={colors.textDisabled} keyboardType="phone-pad" />
          <TouchableOpacity style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 12 }} onPress={() => setConsent(!consent)}>
            <SmartIcon name={consent ? 'checkbox' : 'square-outline'} size={20} color={colors.accent} />
            <Text style={{ color: colors.textPrimary, fontFamily: fontFamily.medium, fontSize: 13 }}>Coach has given consent to be listed</Text>
          </TouchableOpacity>
          <View style={ms.modalActions}>
            <GradientButton title="Cancel" icon="close" onPress={onClose} small style={{ flex: 1 }} />
            <GradientButton title="Save" icon="checkmark" small style={{ flex: 1 }} onPress={() => {
              if (!name.trim() || !role.trim() || !club.trim()) { if (Platform.OS === 'web') window.alert('Fill in name, role, and club'); else Alert.alert('Fill in name, role, and club'); return; }
              onSave({ referee_name: name.trim(), referee_role: role.trim(), club_institution: club.trim(), email: email.trim() || null, phone: phone.trim() || null, relationship: rel, consent_given: consent }); onClose();
            }} />
          </View>
        </View></ScrollView>
      </View>
    </Modal>
  );
}

// ── Academic Modal ──

function AcademicModal({ visible, onClose, onSave, colors }: {
  visible: boolean; onClose: () => void; onSave: (d: Omit<CVAcademicEntry, 'id'>) => void; colors: any;
}) {
  const [inst, setInst] = useState(''); const [country, setCountry] = useState('');
  const [qual, setQual] = useState<string>('High School'); const [ys, setYs] = useState(''); const [ye, setYe] = useState('');
  const [gpa, setGpa] = useState(''); const [scale, setScale] = useState('4.0'); const [cur, setCur] = useState(true);

  React.useEffect(() => { if (visible) { setInst(''); setCountry(''); setQual('High School'); setYs(''); setYe(''); setGpa(''); setScale('4.0'); setCur(true); }}, [visible]);

  return (
    <Modal visible={visible} animationType="slide" transparent>
      <View style={[ms.modalOverlay, { backgroundColor: colors.overlay }]}>
        <ScrollView><View style={[ms.modalContent, { backgroundColor: colors.backgroundElevated, borderColor: colors.border }]}>
          <Text style={[ms.modalTitle, { color: colors.textPrimary }]}>Add School / University</Text>
          <Text style={[ms.label, { color: colors.textSecondary }]}>Institution</Text>
          <TextInput style={[ms.input, { color: colors.textPrimary, backgroundColor: colors.inputBackground }]} value={inst} onChangeText={setInst} placeholder="International Academy" placeholderTextColor={colors.textDisabled} />
          <Text style={[ms.label, { color: colors.textSecondary }]}>Country</Text>
          <TextInput style={[ms.input, { color: colors.textPrimary, backgroundColor: colors.inputBackground }]} value={country} onChangeText={setCountry} placeholder="Jordan" placeholderTextColor={colors.textDisabled} />
          <Text style={[ms.label, { color: colors.textSecondary }]}>Qualification</Text>
          <ChipSelector options={QUALIFICATIONS} selected={qual} onSelect={setQual} colors={colors} />
          <View style={ms.yearRow}>
            <View style={{ flex: 1 }}><Text style={[ms.label, { color: colors.textSecondary }]}>Start Year</Text>
              <TextInput style={[ms.input, { color: colors.textPrimary, backgroundColor: colors.inputBackground }]} value={ys} onChangeText={setYs} keyboardType="number-pad" placeholder="2022" placeholderTextColor={colors.textDisabled} /></View>
            <View style={{ flex: 1, marginLeft: 12 }}><Text style={[ms.label, { color: colors.textSecondary }]}>End Year</Text>
              <TextInput style={[ms.input, { color: colors.textPrimary, backgroundColor: colors.inputBackground }]} value={ye} onChangeText={setYe} keyboardType="number-pad" placeholder="2027" placeholderTextColor={colors.textDisabled} editable={!cur} /></View>
          </View>
          <TouchableOpacity style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8 }} onPress={() => setCur(!cur)}>
            <SmartIcon name={cur ? 'checkbox' : 'square-outline'} size={20} color={colors.accent} />
            <Text style={{ color: colors.textPrimary, fontFamily: fontFamily.medium, fontSize: 13 }}>Currently enrolled</Text>
          </TouchableOpacity>
          <View style={ms.yearRow}>
            <View style={{ flex: 1 }}><Text style={[ms.label, { color: colors.textSecondary }]}>GPA</Text>
              <TextInput style={[ms.input, { color: colors.textPrimary, backgroundColor: colors.inputBackground }]} value={gpa} onChangeText={setGpa} placeholder="3.8" placeholderTextColor={colors.textDisabled} /></View>
            <View style={{ flex: 1, marginLeft: 12 }}><Text style={[ms.label, { color: colors.textSecondary }]}>Scale</Text>
              <TextInput style={[ms.input, { color: colors.textPrimary, backgroundColor: colors.inputBackground }]} value={scale} onChangeText={setScale} placeholder="4.0" placeholderTextColor={colors.textDisabled} /></View>
          </View>
          <View style={ms.modalActions}>
            <GradientButton title="Cancel" icon="close" onPress={onClose} small style={{ flex: 1 }} />
            <GradientButton title="Save" icon="checkmark" small style={{ flex: 1 }} onPress={() => {
              if (!inst.trim()) { if (Platform.OS === 'web') window.alert('Enter institution'); else Alert.alert('Enter institution'); return; }
              onSave({ institution: inst.trim(), country: country.trim() || null, qualification: qual, year_start: ys ? parseInt(ys) : null, year_end: cur ? null : (ye ? parseInt(ye) : null), gpa: gpa.trim() || null, gpa_scale: scale.trim() || '4.0', predicted_grade: null, honours: [], ncaa_eligibility_id: null, is_current: cur }); onClose();
            }} />
          </View>
        </View></ScrollView>
      </View>
    </Modal>
  );
}

// ── Character Trait / Award Modal ──

function TraitModal({ visible, onClose, onSave, colors }: {
  visible: boolean; onClose: () => void; onSave: (d: Omit<CVCharacterTrait, 'id'>) => void; colors: any;
}) {
  const [cat, setCat] = useState<string>('award'); const [title, setTitle] = useState('');
  const [desc, setDesc] = useState(''); const [lvl, setLvl] = useState<string>('club'); const [date, setDate] = useState('');

  React.useEffect(() => { if (visible) { setCat('award'); setTitle(''); setDesc(''); setLvl('club'); setDate(''); }}, [visible]);

  return (
    <Modal visible={visible} animationType="slide" transparent>
      <View style={[ms.modalOverlay, { backgroundColor: colors.overlay }]}>
        <ScrollView><View style={[ms.modalContent, { backgroundColor: colors.backgroundElevated, borderColor: colors.border }]}>
          <Text style={[ms.modalTitle, { color: colors.textPrimary }]}>Add Award or Trait</Text>
          <Text style={[ms.label, { color: colors.textSecondary }]}>Category</Text>
          <ChipSelector options={TRAIT_CATEGORIES} selected={cat} onSelect={setCat} colors={colors} />
          <Text style={[ms.label, { color: colors.textSecondary }]}>Title</Text>
          <TextInput style={[ms.input, { color: colors.textPrimary, backgroundColor: colors.inputBackground }]} value={title} onChangeText={setTitle} placeholder="e.g. Player of the Tournament" placeholderTextColor={colors.textDisabled} />
          <Text style={[ms.label, { color: colors.textSecondary }]}>Description (optional)</Text>
          <TextInput style={[ms.input, { color: colors.textPrimary, backgroundColor: colors.inputBackground }]} value={desc} onChangeText={setDesc} placeholder="Dubai Youth League 2025" placeholderTextColor={colors.textDisabled} />
          {(cat === 'award' || cat === 'camp') && <>
            <Text style={[ms.label, { color: colors.textSecondary }]}>Level</Text>
            <ChipSelector options={TRAIT_LEVELS} selected={lvl} onSelect={setLvl} colors={colors} />
            <Text style={[ms.label, { color: colors.textSecondary }]}>Date (YYYY-MM-DD)</Text>
            <TextInput style={[ms.input, { color: colors.textPrimary, backgroundColor: colors.inputBackground }]} value={date} onChangeText={setDate} placeholder="2025-03-15" placeholderTextColor={colors.textDisabled} />
          </>}
          <View style={ms.modalActions}>
            <GradientButton title="Cancel" icon="close" onPress={onClose} small style={{ flex: 1 }} />
            <GradientButton title="Save" icon="checkmark" small style={{ flex: 1 }} onPress={() => {
              if (!title.trim()) { if (Platform.OS === 'web') window.alert('Enter title'); else Alert.alert('Enter title'); return; }
              onSave({ trait_category: cat, title: title.trim(), description: desc.trim() || null, level: (cat === 'award' || cat === 'camp') ? lvl : null, date: date || null }); onClose();
            }} />
          </View>
        </View></ScrollView>
      </View>
    </Modal>
  );
}

// ══════════════════════════════════════════════════════════════════════
// MAIN SCREEN
// ══════════════════════════════════════════════════════════════════════

export function PlayerCVScreen() {
  const { colors } = useTheme();
  const { user, profile, refreshProfile } = useAuth();
  const uid = user?.uid ?? '';

  const {
    data, isLoading, refetch,
    updateProfile: updateCVProfile,
    addCareer, updateCareer, deleteCareer,
    addMedia, deleteMedia,
    addReference, deleteReference,
    addAcademic, deleteAcademic,
    addTrait, deleteTrait,
  } = useCVProfile(uid);

  const [activeTab, setActiveTab] = useState<CVTab>('club');
  const [profileModalVisible, setProfileModalVisible] = useState(false);
  const [careerModalVisible, setCareerModalVisible] = useState(false);
  const [editingCareer, setEditingCareer] = useState<CVCareerEntry | null>(null);
  const [mediaModalVisible, setMediaModalVisible] = useState(false);
  const [referenceModalVisible, setReferenceModalVisible] = useState(false);
  const [academicModalVisible, setAcademicModalVisible] = useState(false);
  const [traitModalVisible, setTraitModalVisible] = useState(false);

  // Photo upload state
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);

  // Export state
  const [isExporting, setIsExporting] = useState(false);

  // ── Photo upload handler (reuses ProfileScreen pattern) ──
  const handlePickPhoto = useCallback(async () => {
    if (Platform.OS === 'web') {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) { window.alert('Photo library access is needed.'); return; }
      const result = await ImagePicker.launchImageLibraryAsync({ allowsEditing: true, aspect: [1, 1], quality: 0.7 });
      if (!result.canceled && result.assets[0]) await doUpload(result.assets[0].uri);
    } else {
      Alert.alert('Profile Photo', 'Choose a source', [
        { text: 'Camera', onPress: async () => {
          const perm = await ImagePicker.requestCameraPermissionsAsync();
          if (!perm.granted) { Alert.alert('Permission Required', 'Camera access is needed.'); return; }
          const result = await ImagePicker.launchCameraAsync({ allowsEditing: true, aspect: [1, 1], quality: 0.7 });
          if (!result.canceled && result.assets[0]) await doUpload(result.assets[0].uri);
        }},
        { text: 'Photo Library', onPress: async () => {
          const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
          if (!perm.granted) { Alert.alert('Permission Required', 'Photo library access is needed.'); return; }
          const result = await ImagePicker.launchImageLibraryAsync({ allowsEditing: true, aspect: [1, 1], quality: 0.7 });
          if (!result.canceled && result.assets[0]) await doUpload(result.assets[0].uri);
        }},
        { text: 'Cancel', style: 'cancel' },
      ]);
    }
  }, [uid]);

  const doUpload = useCallback(async (uri: string) => {
    if (!uid) return;
    setUploadingPhoto(true);
    try {
      // Convert image to base64 and upload via backend API
      let base64: string;
      if (Platform.OS === 'web') {
        // On web, fetch the blob and convert to base64
        const response = await fetch(uri);
        const blob = await response.blob();
        base64 = await new Promise<string>((resolve) => {
          const reader = new FileReader();
          reader.onloadend = () => resolve(reader.result as string);
          reader.readAsDataURL(blob);
        });
      } else {
        const b64 = await FileSystem.readAsStringAsync(uri, { encoding: 'base64' });
        base64 = `data:image/jpeg;base64,${b64}`;
      }

      const headers = await authHeaders();
      const res = await fetch(`${API_BASE_URL}/api/v1/cv/upload-photo`, {
        method: 'POST', headers,
        body: JSON.stringify({ image: base64 }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const { url } = await res.json();
      setPhotoUri(url);
      if (refreshProfile) await refreshProfile();
      refetch();
    } catch (e: any) {
      console.error('[CV] Photo upload error:', e);
      if (Platform.OS === 'web') window.alert('Could not upload photo.');
      else Alert.alert('Error', 'Could not upload photo.');
    }
    setUploadingPhoto(false);
  }, [uid, refreshProfile, refetch]);

  // ── PDF download handler ──
  const handleDownloadPDF = useCallback(async () => {
    setIsExporting(true);
    try {
      const headers = await authHeaders();
      const res = await fetch(`${API_BASE_URL}/api/v1/cv/export`, {
        method: 'POST', headers,
        body: JSON.stringify({ cv_type: activeTab, format: 'pdf_html' }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const { html } = await res.json();
      const { uri } = await Print.printToFileAsync({ html, base64: false });
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, { mimeType: 'application/pdf', dialogTitle: 'Save your Player CV', UTI: 'com.adobe.pdf' });
      } else {
        if (Platform.OS === 'web') window.alert('PDF generated successfully');
        else Alert.alert('Success', 'PDF generated');
      }
    } catch (err) {
      if (Platform.OS === 'web') window.alert('Failed to generate PDF');
      else Alert.alert('Error', 'Failed to generate PDF');
    }
    setIsExporting(false);
  }, [activeTab]);

  // ── Share link handler ──
  const handleShareLink = useCallback(async () => {
    setIsExporting(true);
    try {
      const headers = await authHeaders();
      const res = await fetch(`${API_BASE_URL}/api/v1/cv/export`, {
        method: 'POST', headers,
        body: JSON.stringify({ cv_type: activeTab, format: 'share_link' }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const { url } = await res.json();
      if (Platform.OS === 'web') {
        await navigator.clipboard?.writeText(url);
        window.alert('Share link copied to clipboard!');
      } else {
        await Share.share({ message: `Check out my Player CV: ${url}`, title: 'My Player CV' });
      }
    } catch {
      if (Platform.OS === 'web') window.alert('Failed to generate share link');
      else Alert.alert('Error', 'Failed to generate share link');
    }
    setIsExporting(false);
  }, [activeTab]);

  // ── Profile save handler ──
  const handleProfileSave = useCallback(async (updates: Record<string, any>) => {
    if (Object.keys(updates).length === 0) { setProfileModalVisible(false); return; }
    try {
      await updateUser(updates);
      if (refreshProfile) await refreshProfile();
      refetch?.();
    } catch (e: any) {
      if (Platform.OS === 'web') window.alert('Failed to save: ' + (e?.message || 'Unknown error'));
      else Alert.alert('Error', 'Could not save profile changes.');
    }
    setProfileModalVisible(false);
  }, [refetch, refreshProfile]);

  if (isLoading || !data) {
    return (<View style={[ss.loading, { backgroundColor: colors.background }]}><ActivityIndicator size="large" color={colors.accent} /></View>);
  }

  const cv = data;
  const isUni = activeTab === 'university';
  const completeness = isUni ? cv.completeness.uni_pct : cv.completeness.club_pct;
  const nextActions = isUni ? cv.completeness.next_actions_uni : cv.completeness.next_actions_club;
  const displayPhoto = photoUri || cv.identity.photo_url || (profile as any)?.photoUrl || null;

  return (
    <SafeAreaView style={[ss.safe, { backgroundColor: colors.background }]}>
      <ScrollView style={ss.scroll} contentContainerStyle={ss.scrollContent}>

        {/* ── HEADER ── */}
        <View style={[ss.headerCard, { backgroundColor: colors.backgroundElevated, borderColor: colors.border }]}>
          <TouchableOpacity style={ss.editProfileBtn} onPress={() => setProfileModalVisible(true)}>
            <SmartIcon name="create-outline" size={18} color={colors.accent} />
          </TouchableOpacity>

          {/* Avatar — tappable for photo upload */}
          <TouchableOpacity onPress={handlePickPhoto} style={[ss.avatar, { borderColor: colors.accent }]}>
            {uploadingPhoto ? (
              <ActivityIndicator size="small" color={colors.accent} />
            ) : displayPhoto ? (
              <Image source={{ uri: displayPhoto }} style={{ width: 54, height: 54, borderRadius: 27 }} />
            ) : (
              <Text style={[ss.avatarText, { color: colors.accent }]}>{(cv.identity.full_name || 'P').charAt(0).toUpperCase()}</Text>
            )}
            <View style={ss.cameraOverlay}>
              <SmartIcon name="camera" size={12} color="#F5F3ED" />
            </View>
          </TouchableOpacity>

          <Text style={[ss.playerName, { color: colors.textPrimary }]}>{cv.identity.full_name || 'Player'}</Text>
          <Text style={[ss.playerMeta, { color: colors.textSecondary }]}>
            {cv.identity.position ?? '—'} · {cv.identity.sport} · Age {cv.identity.age ?? '—'}
          </Text>
          {cv.identity.nationality && (
            <Text style={[ss.playerMeta, { color: colors.textSecondary, marginTop: 0 }]}>
              {cv.identity.nationality}{cv.identity.preferred_foot ? ` · ${cv.identity.preferred_foot.charAt(0).toUpperCase() + cv.identity.preferred_foot.slice(1)} foot` : ''}
            </Text>
          )}
          {cv.physical.phv_stage && (
            <View style={[ss.phvPill, { backgroundColor: colors.secondarySubtle, borderColor: colors.secondaryMuted }]}>
              <Text style={{ color: colors.textSecondary, fontSize: 10, fontFamily: fontFamily.semiBold }}>
                {cv.physical.phv_stage === 'PRE' ? 'Pre-PHV' : cv.physical.phv_stage === 'CIRCA' ? 'Mid-PHV' : 'Post-PHV'}
                {cv.physical.phv_offset_years != null ? ` (${cv.physical.phv_offset_years > 0 ? '+' : ''}${cv.physical.phv_offset_years.toFixed(1)}y)` : ''}
              </Text>
            </View>
          )}
          <CompletenessBar pct={completeness} label="CV completeness" colors={colors} />
          <View style={[ss.tabs, { borderTopColor: colors.border }]}>
            <TouchableOpacity style={[ss.tab, activeTab === 'club' && { borderBottomColor: colors.accent }]} onPress={() => setActiveTab('club')}>
              <Text style={[ss.tabText, { color: activeTab === 'club' ? colors.accent : colors.textSecondary }]}>Club profile</Text></TouchableOpacity>
            <TouchableOpacity style={[ss.tab, activeTab === 'university' && { borderBottomColor: colors.accent }]} onPress={() => setActiveTab('university')}>
              <Text style={[ss.tabText, { color: activeTab === 'university' ? colors.accent : colors.textSecondary }]}>University / NCAA</Text></TouchableOpacity>
          </View>
        </View>

        {/* ── EXPORT ACTIONS ── */}
        <View style={ss.exportSection}>
          <GradientButton title="Download PDF" icon="download-outline" onPress={handleDownloadPDF} loading={isExporting} disabled={isExporting} small style={{ flex: 1 }} />
          <GradientButton title="Share Link" icon="link-outline" onPress={handleShareLink} loading={isExporting} disabled={isExporting} small style={{ flex: 1 }} />
        </View>

        {/* ── NEXT ACTIONS ── */}
        {nextActions.length > 0 && (
          <View style={[ss.nextActionsCard, { backgroundColor: colors.accent + '10', borderColor: colors.accent + '25' }]}>
            <Text style={{ color: colors.accent, fontFamily: fontFamily.semiBold, fontSize: 11, marginBottom: 4 }}>Next steps to improve your CV</Text>
            {nextActions.map((action, i) => (
              <Text key={i} style={{ color: colors.textSecondary, fontFamily: fontFamily.regular, fontSize: 12, marginTop: 2 }}>{i + 1}. {action}</Text>
            ))}
          </View>
        )}

        {/* ── 1. PLAYER IDENTITY ── */}
        <Section title="Player Identity" icon="person-outline" state={cv.section_states.identity} colors={colors} onEdit={() => setProfileModalVisible(true)}>
          <IdRow label="Full name" value={cv.identity.full_name} colors={colors} />
          <IdRow label="Date of birth" value={cv.identity.date_of_birth} colors={colors} />
          <IdRow label="Nationality" value={cv.identity.nationality} colors={colors} />
          <IdRow label="Height / Weight" value={cv.physical.height_cm && cv.physical.weight_kg ? `${cv.physical.height_cm} cm · ${cv.physical.weight_kg} kg` : null} colors={colors} />
          <IdRow label="Preferred foot" value={cv.identity.preferred_foot} colors={colors} />
        </Section>

        {/* ── 2. PERSONAL STATEMENT ── */}
        <Section title="Player Profile" icon="document-text-outline" state={cv.section_states.personal_statement} colors={colors}>
          <PersonalStatementEditor
            statement={isUni ? cv.statements.personal_statement_uni : cv.statements.personal_statement_club}
            statementStatus={cv.statements.statement_status} lastGenerated={cv.statements.statement_last_generated}
            cvType={isUni ? 'university' : 'club'}
            onApprove={() => updateCVProfile({ statement_status: 'approved' })}
            onSaveEdit={(text) => updateCVProfile(isUni ? { personal_statement_uni: text, statement_status: 'approved' } : { personal_statement_club: text, statement_status: 'approved' })}
            onRefetch={refetch}
          />
        </Section>

        {/* ── 3. PHYSICAL PROFILE ── */}
        <Section title="Physical Profile" icon="fitness-outline" state={cv.section_states.physical} colors={colors}>
          {cv.performance.benchmarks.length > 0 && (
            <Text style={{ color: colors.textSecondary, fontSize: 10, marginBottom: 8, fontFamily: fontFamily.regular }}>
              Benchmarked vs {cv.performance.benchmarks[0]?.age_band} {cv.identity.sport} · Verified by Tomo
            </Text>
          )}
          {cv.performance.benchmarks.length > 0 ? (
            cv.performance.benchmarks.slice(0, 6).map(b => (
              <PercentileRow key={b.metric_key} label={b.metric_label} value={b.value} unit={b.unit} percentile={b.percentile} colors={colors} />
            ))
          ) : (
            <View style={ss.statRow}>
              <Stat label="Height" value={cv.physical.height_cm} unit="cm" colors={colors} />
              <Stat label="Weight" value={cv.physical.weight_kg} unit="kg" colors={colors} />
              <Stat label="PHV" value={cv.physical.phv_stage} colors={colors} />
            </View>
          )}
        </Section>

        {/* ── 4. POSITIONS ── */}
        <Section title="Playing Positions" icon="football-outline" state={cv.section_states.positions} colors={colors}>
          <IdRow label="Primary" value={cv.positions.primary_position} colors={colors} accent />
          {cv.positions.secondary_positions.length > 0 && <IdRow label="Secondary" value={cv.positions.secondary_positions.join(', ')} colors={colors} />}
          {cv.positions.formation_preference && <IdRow label="Formation" value={cv.positions.formation_preference} colors={colors} />}
        </Section>

        {/* ── 5. CAREER HISTORY ── */}
        <Section title="Career History" icon="shield-outline" state={cv.section_states.career_history} colors={colors}>
          {cv.career.length === 0 ? <Text style={[ss.emptyText, { color: colors.textDisabled }]}>No career entries yet</Text> : (
            cv.career.map(entry => (
              <TouchableOpacity key={entry.id} style={[ss.careerItem, { borderLeftColor: colors.accent }]}
                onPress={() => { setEditingCareer(entry); setCareerModalVisible(true); }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Text style={[ss.clubName, { color: colors.textPrimary }]}>{entry.club_name}</Text>
                  {entry.is_current && <View style={[ss.currentPill, { backgroundColor: colors.accent + '20', borderColor: colors.accent + '30' }]}><Text style={{ color: colors.accent, fontSize: 9, fontFamily: fontFamily.semiBold }}>Current</Text></View>}
                </View>
                <Text style={[ss.clubMeta, { color: colors.textSecondary }]}>{entry.league_level ? `${entry.league_level} · ` : ''}{entry.started_month ?? '?'} – {entry.ended_month ?? 'Present'}</Text>
                {(entry.appearances || entry.goals || entry.assists) && (
                  <View style={{ flexDirection: 'row', gap: 12, marginTop: 4 }}>
                    {entry.appearances != null && <Text style={[ss.ceStat, { color: colors.textSecondary }]}>Apps <Text style={{ color: colors.textPrimary, fontFamily: fontFamily.semiBold }}>{entry.appearances}</Text></Text>}
                    {entry.goals != null && <Text style={[ss.ceStat, { color: colors.textSecondary }]}>Goals <Text style={{ color: colors.textPrimary, fontFamily: fontFamily.semiBold }}>{entry.goals}</Text></Text>}
                    {entry.assists != null && <Text style={[ss.ceStat, { color: colors.textSecondary }]}>Assists <Text style={{ color: colors.textPrimary, fontFamily: fontFamily.semiBold }}>{entry.assists}</Text></Text>}
                  </View>
                )}
              </TouchableOpacity>
            ))
          )}
          <GradientButton title="Add club or academy" icon="add-circle-outline" onPress={() => { setEditingCareer(null); setCareerModalVisible(true); }} small style={{ marginTop: 8 }} />
        </Section>

        {/* ── 6. VERIFIED PERFORMANCE ── */}
        <Section title="Verified Performance Data" icon="shield-checkmark-outline" state={cv.section_states.performance_data} colors={colors}>
          <View style={[ss.verifiedBanner, { backgroundColor: colors.accent + '12', borderColor: colors.accent + '25' }]}>
            <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: colors.accent }} />
            <Text style={{ color: colors.accent, fontSize: 10, fontFamily: fontFamily.medium }}>All data verified by Tomo platform</Text>
          </View>
          <View style={ss.perfGrid}>
            <View style={[ss.perfCard, { backgroundColor: colors.background, borderColor: colors.border }]}><Text style={[ss.perfVal, { color: colors.textPrimary }]}>{cv.performance.sessions_total}</Text><Text style={[ss.perfLabel, { color: colors.textSecondary }]}>Sessions</Text></View>
            <View style={[ss.perfCard, { backgroundColor: colors.background, borderColor: colors.border }]}><Text style={[ss.perfVal, { color: colors.textPrimary }]}>{cv.performance.training_age_months}mo</Text><Text style={[ss.perfLabel, { color: colors.textSecondary }]}>Training age</Text></View>
            <View style={[ss.perfCard, { backgroundColor: colors.background, borderColor: colors.border }]}><Text style={[ss.perfVal, { color: colors.textPrimary }]}>{cv.performance.streak_days}d</Text><Text style={[ss.perfLabel, { color: colors.textSecondary }]}>Streak</Text></View>
            <View style={[ss.perfCard, { backgroundColor: colors.background, borderColor: colors.border }]}><Text style={[ss.perfVal, { color: colors.textPrimary }]}>{cv.performance.acwr?.toFixed(2) ?? '—'}</Text><Text style={[ss.perfLabel, { color: colors.textSecondary }]}>ACWR</Text></View>
          </View>
        </Section>

        {/* ── 7. TRAJECTORY ── */}
        {cv.trajectory.metric_trends.length > 0 && (
          <Section title="Development Trajectory" icon="trending-up-outline" state={cv.section_states.trajectory} colors={colors}>
            {cv.trajectory.metric_trends.map(t => (
              <View key={t.metric_key} style={{ marginBottom: 8 }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                  <Text style={{ color: colors.textPrimary, fontFamily: fontFamily.medium, fontSize: 12 }}>{t.metric_label}</Text>
                  {t.total_improvement_pct != null && <Text style={{ color: t.total_improvement_pct >= 0 ? colors.accent : colors.textSecondary, fontFamily: fontFamily.semiBold, fontSize: 12 }}>{t.total_improvement_pct > 0 ? '+' : ''}{t.total_improvement_pct}%</Text>}
                </View>
              </View>
            ))}
            {cv.trajectory.narrative && <Text style={[ss.statementText, { color: colors.textSecondary, borderLeftColor: colors.border, marginTop: 8 }]}>"{cv.trajectory.narrative}"</Text>}
          </Section>
        )}

        {/* ── 8. COACHABILITY ── */}
        {cv.performance.coachability && (
          <Section title="Coachability Index" icon="school-outline" state={cv.section_states.coachability} colors={colors}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: 12 }}>
              <View style={[ss.coachRing, { borderColor: colors.accent }]}><Text style={[ss.coachNum, { color: colors.accent }]}>{cv.performance.coachability.score.toFixed(1)}</Text></View>
              <View style={{ flex: 1 }}>
                <Text style={{ color: colors.textPrimary, fontFamily: fontFamily.semiBold, fontSize: 13 }}>{cv.performance.coachability.label.split('—')[0].trim()}</Text>
                <Text style={{ color: colors.textSecondary, fontFamily: fontFamily.regular, fontSize: 11, marginTop: 2 }}>{cv.performance.coachability.label.includes('—') ? cv.performance.coachability.label.split('—')[1].trim() : ''}</Text>
              </View>
            </View>
            <CoachBar label="Target achievement" value={cv.performance.coachability.components.target_achievement_rate} colors={colors} />
            <CoachBar label="Adaptation velocity" value={cv.performance.coachability.components.adaptation_velocity} colors={colors} />
            <CoachBar label="Responsiveness" value={cv.performance.coachability.components.coach_responsiveness} colors={colors} />
          </Section>
        )}

        {/* ── 9. COMPETITIONS ── */}
        {cv.competitions.length > 0 && (
          <Section title="Competition Record" icon="medal-outline" state={cv.section_states.competitions} colors={colors}>
            {cv.competitions.slice(0, 5).map(c => (
              <View key={c.id} style={[ss.compItem, { borderColor: colors.border }]}>
                <Text style={{ color: colors.textPrimary, fontFamily: fontFamily.medium, fontSize: 13 }}>{c.competition_name ?? 'Match'}{c.opponent ? ` vs ${c.opponent}` : ''}</Text>
                <View style={{ flexDirection: 'row', gap: 8, marginTop: 4 }}>
                  {c.result && <View style={[ss.resultBadge, { backgroundColor: c.result.startsWith('W') ? colors.accentMuted : c.result.startsWith('L') ? colors.secondarySubtle : colors.secondarySubtle }]}>
                    <Text style={{ color: c.result.startsWith('W') ? colors.accent : c.result.startsWith('L') ? colors.textSecondary : colors.textSecondary, fontFamily: fontFamily.semiBold, fontSize: 11 }}>{c.result}</Text></View>}
                  {c.minutes_played != null && <Text style={{ color: colors.textSecondary, fontFamily: fontFamily.regular, fontSize: 11 }}>{c.minutes_played} min</Text>}
                </View>
              </View>
            ))}
          </Section>
        )}

        {/* ── 10. ACADEMIC (uni only) ── */}
        {isUni && (
          <Section title="Academic Profile" icon="school-outline" state={cv.section_states.academic} colors={colors}>
            {cv.academic.length === 0 ? <Text style={[ss.emptyText, { color: colors.textDisabled }]}>Add your school or university</Text> : (
              cv.academic.map(a => (
                <View key={a.id} style={{ marginBottom: 8 }}>
                  <Text style={{ color: colors.textPrimary, fontFamily: fontFamily.semiBold, fontSize: 13 }}>{a.institution}</Text>
                  <Text style={{ color: colors.textSecondary, fontFamily: fontFamily.regular, fontSize: 11 }}>{a.qualification ?? ''}{a.year_start ? ` · ${a.year_start}` : ''}{a.year_end ? `–${a.year_end}` : a.is_current ? ' – Present' : ''}</Text>
                  {a.gpa && <Text style={{ color: colors.accent, fontFamily: fontFamily.medium, fontSize: 11, marginTop: 2 }}>GPA: {a.gpa}{a.gpa_scale ? ` / ${a.gpa_scale}` : ''}</Text>}
                </View>
              ))
            )}
            <GradientButton title="Add school / university" icon="add-circle-outline" onPress={() => setAcademicModalVisible(true)} small style={{ marginTop: 8 }} />
          </Section>
        )}

        {/* ── 11. DUAL-ROLE (uni only) ── */}
        {isUni && cv.dual_role.dual_load_index != null && (
          <Section title="Dual-Role Competency" icon="git-compare-outline" state={cv.section_states.dual_role} colors={colors}>
            <View style={[ss.verifiedBanner, { backgroundColor: colors.secondarySubtle, borderColor: colors.secondarySubtle }]}>
              <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: colors.textSecondary }} />
              <Text style={{ color: colors.textSecondary, fontSize: 10, fontFamily: fontFamily.medium }}>Tomo-unique — verified academic-athletic balance</Text>
            </View>
            <View style={ss.statRow}>
              <Stat label="Dual Load Index" value={cv.dual_role.dual_load_index} colors={colors} />
              {cv.dual_role.exam_period_training_rate != null && <Stat label="Exam training rate" value={`${Math.round(cv.dual_role.exam_period_training_rate * 100)}%`} colors={colors} />}
            </View>
            {cv.dual_role.narrative && <Text style={[ss.statementText, { color: colors.textSecondary, borderLeftColor: colors.textSecondary, marginTop: 10 }]}>"{cv.dual_role.narrative}"</Text>}
          </Section>
        )}

        {/* ── 12. VIDEO & MEDIA ── */}
        <Section title="Video & Media" icon="videocam-outline" state={cv.section_states.video_media} colors={colors}>
          {cv.media.length === 0 ? <Text style={[ss.emptyText, { color: colors.textDisabled }]}>CVs with highlight videos get 4x more scout views</Text> : (
            cv.media.map(m => (
              <TouchableOpacity key={m.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 8 }} onPress={() => Linking.openURL(m.url).catch(() => {})}>
                <View style={[ss.vidThumb, { backgroundColor: colors.background, borderColor: colors.border }]}><SmartIcon name="play" size={14} color={colors.accent} /></View>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: colors.textPrimary, fontFamily: fontFamily.medium, fontSize: 12 }}>{m.title || 'Video'}</Text>
                  <Text style={{ color: colors.textSecondary, fontFamily: fontFamily.regular, fontSize: 10 }}>{m.platform ?? m.media_type}</Text>
                </View>
                {m.is_primary && <View style={[ss.currentPill, { backgroundColor: colors.accent + '20', borderColor: colors.accent + '30' }]}><Text style={{ color: colors.accent, fontSize: 9, fontFamily: fontFamily.semiBold }}>Primary</Text></View>}
              </TouchableOpacity>
            ))
          )}
          <GradientButton title="Add video or link" icon="add-circle-outline" onPress={() => setMediaModalVisible(true)} small style={{ marginTop: 8 }} />
        </Section>

        {/* ── 13. REFERENCES ── */}
        <Section title="References" icon="people-outline" state={cv.section_states.references} colors={colors}>
          {cv.references.length === 0 ? <Text style={[ss.emptyText, { color: colors.textDisabled }]}>Add coach references to build credibility</Text> : (
            cv.references.map(r => (
              <View key={r.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                <View style={[ss.refAvatar, { backgroundColor: colors.background, borderColor: colors.border }]}><Text style={{ color: colors.accent, fontFamily: fontFamily.semiBold, fontSize: 11 }}>{r.referee_name.charAt(0)}</Text></View>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: colors.textPrimary, fontFamily: fontFamily.semiBold, fontSize: 12 }}>{r.referee_name}</Text>
                  <Text style={{ color: colors.textSecondary, fontFamily: fontFamily.regular, fontSize: 10 }}>{r.referee_role} · {r.club_institution}</Text>
                </View>
                {r.consent_given && <View style={{ backgroundColor: colors.accentSoft, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 }}><Text style={{ color: colors.accent, fontSize: 9, fontFamily: fontFamily.semiBold }}>Confirmed</Text></View>}
              </View>
            ))
          )}
          <GradientButton title="Add reference" icon="add-circle-outline" onPress={() => setReferenceModalVisible(true)} small style={{ marginTop: 8 }} />
        </Section>

        {/* ── 14. AWARDS & CHARACTER ── */}
        <Section title="Awards & Character" icon="trophy-outline" state={cv.section_states.character_traits} colors={colors}>
          {cv.character_traits.length === 0 ? <Text style={[ss.emptyText, { color: colors.textDisabled }]}>Add awards, leadership roles, or languages</Text> : (
            cv.character_traits.map(t => (
              <View key={t.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                <View style={{ width: 4, height: 4, borderRadius: 2, backgroundColor: colors.accent }} />
                <Text style={{ color: colors.textSecondary, fontFamily: fontFamily.regular, fontSize: 12 }}>{t.title}{t.level ? ` (${t.level})` : ''}{t.date ? ` · ${t.date}` : ''}</Text>
              </View>
            ))
          )}
          <GradientButton title="Add award or trait" icon="add-circle-outline" onPress={() => setTraitModalVisible(true)} small style={{ marginTop: 8 }} />
        </Section>

        {/* ── INJURY STATUS ── */}
        <View style={[ss.injuryBar, { backgroundColor: cv.injury_status.has_active_injury ? colors.secondarySubtle : colors.accentSoft, borderColor: cv.injury_status.has_active_injury ? colors.secondaryMuted : colors.accentBorder }]}>
          <SmartIcon name={cv.injury_status.has_active_injury ? 'medkit' : 'checkmark-circle'} size={14} color={cv.injury_status.has_active_injury ? colors.textSecondary : colors.accent} />
          <Text style={{ color: cv.injury_status.has_active_injury ? colors.textSecondary : colors.accent, fontFamily: fontFamily.medium, fontSize: 11 }}>{cv.injury_status.status_label}</Text>
        </View>

        <View style={{ height: 100 }} />
      </ScrollView>

      {/* ── MODALS ── */}
      <ProfileEditorModal visible={profileModalVisible} onClose={() => setProfileModalVisible(false)}
        initial={{ position: cv.identity.position ?? '', height_cm: cv.physical.height_cm, weight_kg: cv.physical.weight_kg, date_of_birth: cv.identity.date_of_birth ?? '', preferred_foot: cv.identity.preferred_foot ?? '', playing_style: cv.identity.playing_style ?? '', nationality: cv.identity.nationality ?? '' }}
        onSave={handleProfileSave} colors={colors} />

      <CareerEditorModal visible={careerModalVisible} onClose={() => { setCareerModalVisible(false); setEditingCareer(null); }} initial={editingCareer}
        onSave={async (d) => { if (editingCareer) await updateCareer(editingCareer.id, d); else await addCareer(d); setCareerModalVisible(false); setEditingCareer(null); }} colors={colors} />

      <MediaModal visible={mediaModalVisible} onClose={() => setMediaModalVisible(false)}
        onSave={async (d) => { await addMedia(d); setMediaModalVisible(false); }} colors={colors} />

      <ReferenceModal visible={referenceModalVisible} onClose={() => setReferenceModalVisible(false)}
        onSave={async (d) => { await addReference(d); setReferenceModalVisible(false); }} colors={colors} />

      <AcademicModal visible={academicModalVisible} onClose={() => setAcademicModalVisible(false)}
        onSave={async (d) => { await addAcademic(d); setAcademicModalVisible(false); }} colors={colors} />

      <TraitModal visible={traitModalVisible} onClose={() => setTraitModalVisible(false)}
        onSave={async (d) => { await addTrait(d); setTraitModalVisible(false); }} colors={colors} />
    </SafeAreaView>
  );
}

// ══════════════════════════════════════════════════════════════════════
// STYLES
// ══════════════════════════════════════════════════════════════════════

const ss = StyleSheet.create({
  safe: { flex: 1 }, loading: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  scroll: { flex: 1 }, scrollContent: { padding: 16, gap: 10 },

  headerCard: { borderRadius: 12, borderWidth: 1, padding: 16, alignItems: 'center', position: 'relative' as const },
  editProfileBtn: { position: 'absolute' as const, top: 12, right: 12, zIndex: 1, padding: 6 },
  avatar: { width: 56, height: 56, borderRadius: 28, borderWidth: 2, justifyContent: 'center', alignItems: 'center', marginBottom: 8, overflow: 'hidden' },
  avatarText: { fontFamily: fontFamily.bold, fontSize: 22 },
  cameraOverlay: { position: 'absolute', bottom: 0, right: 0, backgroundColor: 'rgba(0,0,0,0.6)', borderRadius: 10, padding: 3 },
  playerName: { fontFamily: fontFamily.bold, fontSize: 18, marginBottom: 2 },
  playerMeta: { fontFamily: fontFamily.regular, fontSize: 12, marginBottom: 4 },
  phvPill: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 4, borderWidth: 0.5, marginTop: 4, marginBottom: 8 },

  completeRow: { flexDirection: 'row', alignItems: 'center', gap: 8, width: '100%', paddingHorizontal: 4, marginBottom: 8 },
  completeLabel: { fontFamily: fontFamily.regular, fontSize: 11 },
  completeTrack: { flex: 1, height: 4, borderRadius: 2, overflow: 'hidden' },
  completeFill: { height: 4, borderRadius: 2 },
  completePct: { fontFamily: fontFamily.semiBold, fontSize: 11, minWidth: 32, textAlign: 'right' },

  tabs: { flexDirection: 'row', borderTopWidth: 0.5, marginTop: 4, width: '100%' },
  tab: { flex: 1, paddingVertical: 10, alignItems: 'center', borderBottomWidth: 2, borderBottomColor: 'transparent' },
  tabText: { fontFamily: fontFamily.medium, fontSize: 12 },

  card: { borderRadius: 12, borderWidth: 0.5, padding: 14, overflow: 'hidden' },
  cardHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  cardTitle: { fontFamily: fontFamily.semiBold, fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5 },

  statRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  statItem: { alignItems: 'center', minWidth: 60 },
  statValue: { fontFamily: fontFamily.bold, fontSize: 18 },
  statLabel: { fontFamily: fontFamily.regular, fontSize: 10, marginTop: 2 },

  pctRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  pctLabel: { fontFamily: fontFamily.regular, fontSize: 11, minWidth: 80 },
  pctValue: { fontFamily: fontFamily.bold, fontSize: 13, minWidth: 48 },
  pctTrack: { flex: 1, height: 5, borderRadius: 3, overflow: 'hidden' },
  pctFill: { height: 5, borderRadius: 3 },
  pctTag: { fontFamily: fontFamily.semiBold, fontSize: 10, minWidth: 30, textAlign: 'right' },

  statementText: { fontFamily: fontFamily.regular, fontSize: 12, lineHeight: 19, fontStyle: 'italic', borderLeftWidth: 2, paddingLeft: 10 },

  careerItem: { borderLeftWidth: 2, paddingLeft: 12, marginBottom: 12 },
  clubName: { fontFamily: fontFamily.semiBold, fontSize: 13 },
  clubMeta: { fontFamily: fontFamily.regular, fontSize: 10, marginTop: 2 },
  ceStat: { fontFamily: fontFamily.regular, fontSize: 10 },
  currentPill: { paddingHorizontal: 6, paddingVertical: 1, borderRadius: 3, borderWidth: 0.5 },

  verifiedBanner: { flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 0.5, borderRadius: 8, padding: 8, marginBottom: 10 },

  perfGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  perfCard: { width: '47%', borderRadius: 8, padding: 10, borderWidth: 0.5 },
  perfVal: { fontFamily: fontFamily.bold, fontSize: 20 },
  perfLabel: { fontFamily: fontFamily.regular, fontSize: 10, marginTop: 1 },

  coachRing: { width: 52, height: 52, borderRadius: 26, borderWidth: 3, justifyContent: 'center', alignItems: 'center' },
  coachNum: { fontFamily: fontFamily.bold, fontSize: 15 },

  compItem: { borderBottomWidth: 0.5, paddingVertical: 8 },
  resultBadge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6 },

  vidThumb: { width: 44, height: 30, borderRadius: 5, borderWidth: 0.5, justifyContent: 'center', alignItems: 'center' },
  refAvatar: { width: 32, height: 32, borderRadius: 16, borderWidth: 0.5, justifyContent: 'center', alignItems: 'center' },

  exportSection: { flexDirection: 'row', gap: 8 },
  nextActionsCard: { borderRadius: 8, borderWidth: 0.5, padding: 12 },
  injuryBar: { flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 0.5, borderRadius: 8, padding: 10 },
  emptyText: { fontFamily: fontFamily.regular, fontSize: 12, textAlign: 'center', paddingVertical: 12 },
});

const bs = StyleSheet.create({
  badge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 4, borderWidth: 0.5 },
  badgeText: { fontFamily: fontFamily.semiBold, fontSize: 9, letterSpacing: 0.3 },
});

const ms = StyleSheet.create({
  modalOverlay: { flex: 1, justifyContent: 'flex-end' },
  modalContent: { borderTopLeftRadius: 16, borderTopRightRadius: 16, padding: 20, borderWidth: 1, borderBottomWidth: 0 },
  modalTitle: { fontFamily: fontFamily.bold, fontSize: 18, marginBottom: 16 },
  label: { fontFamily: fontFamily.medium, fontSize: 12, marginBottom: 4, marginTop: 12 },
  input: { height: 42, borderRadius: 8, paddingHorizontal: 12, fontFamily: fontFamily.regular, fontSize: 14 },
  roleRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  roleChip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, borderWidth: 1 },
  roleText: { fontFamily: fontFamily.medium, fontSize: 11 },
  yearRow: { flexDirection: 'row' },
  modalActions: { flexDirection: 'row', gap: 12, marginTop: 20 },
});
