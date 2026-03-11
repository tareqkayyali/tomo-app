/**
 * Onboarding Screen — Digital Twin Profiling
 * 10-step wizard that runs after signup, before main app.
 * Tomo Flow doc Section 3.
 *
 * Dark aesthetic matching CheckinScreen style.
 */

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  Easing,
  SlideInRight,
  SlideInLeft,
} from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { Button, Input, Slider } from '../components';
import {
  colors,
  spacing,
  typography,
  borderRadius,
  fontFamily,
  layout,
  shadows,
} from '../theme';
import { submitOnboarding, getSportPositions } from '../services/api';
import { useAuth } from '../hooks/useAuth';
import type {
  Archetype,
  Gender,
  SeasonPhase,
  PrimaryGoal,
  OnboardingData,
} from '../types';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

// ── Step IDs for dynamic flow ─────────────────────────────────────────────
type StepId =
  | 'intro'
  | 'sportSelection'
  | 'multiSportMessage'
  | 'footballPosition'
  | 'footballExperience'
  | 'footballCompetition'
  | 'footballSelfAssessment'
  | 'physical'
  | 'sportDetails'
  | 'trainingBaseline'
  | 'recoveryBaseline'
  | 'injuryHistory'
  | 'academic'
  | 'goals'
  | 'archetype'
  | 'summary';

// ── Sport Selection ───────────────────────────────────────────────────────
const SPORT_OPTIONS: { key: string; label: string; icon: keyof typeof Ionicons.glyphMap; color: string }[] = [
  { key: 'football', label: 'Football', icon: 'football-outline', color: '#2ECC71' },
  { key: 'padel', label: 'Padel', icon: 'tennisball-outline', color: '#3498DB' },
];

// ── Football Position ────────────────────────────────────────────────────
const FOOTBALL_POSITIONS: { value: string; label: string }[] = [
  { value: 'GK', label: 'Goalkeeper' },
  { value: 'CB', label: 'Centre Back' },
  { value: 'FB', label: 'Full Back' },
  { value: 'CM', label: 'Centre Mid' },
  { value: 'WM', label: 'Wide Mid / Winger' },
  { value: 'ST', label: 'Striker' },
];

// ── Football Experience ──────────────────────────────────────────────────
const EXPERIENCE_LEVELS: { value: string; label: string; desc: string }[] = [
  { value: 'beginner', label: 'Just starting', desc: 'Less than 1 year' },
  { value: 'intermediate', label: '1–2 years', desc: 'Learning the game' },
  { value: 'advanced', label: '3–5 years', desc: 'Solid foundation' },
  { value: 'elite', label: '5+ years', desc: 'Experienced player' },
];

// ── Football Competition ─────────────────────────────────────────────────
const COMPETITION_LEVELS: { value: string; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { value: 'recreational', label: 'Recreational', icon: 'people-outline' },
  { value: 'club', label: 'Club', icon: 'shield-outline' },
  { value: 'academy', label: 'Academy', icon: 'school-outline' },
  { value: 'professional', label: 'Professional', icon: 'trophy-outline' },
];

// ── Football Self-Assessment Attributes ──────────────────────────────────
const FB_SELF_ASSESS_ATTRS: { key: string; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { key: 'pace', label: 'Pace', icon: 'flash-outline' },
  { key: 'shooting', label: 'Shooting', icon: 'football-outline' },
  { key: 'passing', label: 'Passing', icon: 'swap-horizontal-outline' },
  { key: 'dribbling', label: 'Dribbling', icon: 'walk-outline' },
  { key: 'defending', label: 'Defending', icon: 'shield-outline' },
  { key: 'physicality', label: 'Physicality', icon: 'barbell-outline' },
];

// Maps self-assessment 1-5 → rough 0-99 values
const SELF_ASSESS_MAP: Record<number, number> = { 1: 20, 2: 35, 3: 50, 4: 65, 5: 80 };

const GENDERS: { value: Gender; label: string }[] = [
  { value: 'male', label: 'Male' },
  { value: 'female', label: 'Female' },
  { value: 'other', label: 'Other' },
  { value: 'prefer_not_to_say', label: 'Prefer not to say' },
];

const SEASON_PHASES: { value: SeasonPhase; label: string; icon: string }[] = [
  { value: 'pre_season', label: 'Pre-Season', icon: 'fitness-outline' },
  { value: 'in_season', label: 'In-Season', icon: 'trophy-outline' },
  { value: 'off_season', label: 'Off-Season', icon: 'bed-outline' },
];

const SESSION_LENGTHS = [30, 45, 60, 75, 90, 120];

const GOALS: { value: PrimaryGoal; label: string; icon: string }[] = [
  { value: 'improve_fitness', label: 'Improve fitness', icon: 'trending-up-outline' },
  { value: 'get_recruited', label: 'Get recruited', icon: 'star-outline' },
  { value: 'recover_from_injury', label: 'Recover from injury', icon: 'medkit-outline' },
  { value: 'stay_consistent', label: 'Stay consistent', icon: 'checkmark-circle-outline' },
  { value: 'have_fun', label: 'Have fun', icon: 'happy-outline' },
];

const PAIN_AREAS = [
  'Head / Neck',
  'Shoulder',
  'Upper Back',
  'Lower Back',
  'Elbow / Forearm',
  'Wrist / Hand',
  'Hip / Groin',
  'Thigh / Hamstring',
  'Knee',
  'Shin / Calf',
  'Ankle',
  'Foot',
];

const ARCHETYPE_CARDS: {
  value: Archetype;
  emoji: string;
  name: string;
  color: string;
  desc: string;
}[] = [
  {
    value: 'phoenix',
    emoji: '🔥',
    name: 'Phoenix',
    color: '#FF6B6B',
    desc: 'Fast recovery, fast fatigue. Thrives on high intensity blocks.',
  },
  {
    value: 'titan',
    emoji: '⚡',
    name: 'Titan',
    color: '#4C6EF5',
    desc: 'Slow recovery, high volume tolerance. Steady accumulation.',
  },
  {
    value: 'blade',
    emoji: '🗡️',
    name: 'Blade',
    color: '#12B886',
    desc: 'Very slow recovery, extremely high quality when fresh.',
  },
  {
    value: 'surge',
    emoji: '🌊',
    name: 'Surge',
    color: '#FFD43B',
    desc: 'Variable recovery, thrives on variety and pressure.',
  },
];

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function OnboardingScreen() {
  const { profile, refreshProfile } = useAuth();
  const [step, setStep] = useState(1);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // ── Animated progress bar ───────────────────────────────────────────
  const progressWidth = useSharedValue(0.1);
  const progressStyle = useAnimatedStyle(() => ({
    width: `${progressWidth.value * 100}%`,
  }));

  // ── Step transition direction (for entering animation) ──────────────
  const [slideDirection, setSlideDirection] = useState<'right' | 'left'>('right');
  const [stepKey, setStepKey] = useState(0); // bumped to trigger re-enter

  // ── Form State ──────────────────────────────────────────────────────
  const [height, setHeight] = useState('');
  const [weight, setWeight] = useState('');
  const [gender, setGender] = useState<Gender | ''>('');

  const [positions, setPositions] = useState<string[]>([]);
  const [styles, setStyles] = useState<string[]>([]);
  const [position, setPosition] = useState('');
  const [playingStyle, setPlayingStyle] = useState('');

  const [trainingDays, setTrainingDays] = useState(4);
  const [sessionLength, setSessionLength] = useState(60);
  const [seasonPhase, setSeasonPhase] = useState<SeasonPhase>('in_season');

  const [sleepHours, setSleepHours] = useState(8);
  const [baselineEnergy, setBaselineEnergy] = useState(6);

  const [injuries, setInjuries] = useState('');
  const [painAreas, setPainAreas] = useState<string[]>([]);

  const [isStudent, setIsStudent] = useState(false);
  const [schoolHours, setSchoolHours] = useState('');
  const [examPeriods, setExamPeriods] = useState('');

  const [primaryGoal, setPrimaryGoal] = useState<PrimaryGoal | ''>('');

  const [selfArchetype, setSelfArchetype] = useState<Archetype | ''>('');

  // ── Multi-sport + Football state ──────────────────────────────────
  const [selectedSports, setSelectedSports] = useState<string[]>([]);
  const [footballPosition, setFootballPosition] = useState('');
  const [footballExperience, setFootballExperience] = useState('');
  const [footballCompetition, setFootballCompetition] = useState('');
  const [footballSelfAssessment, setFootballSelfAssessment] = useState<Record<string, number>>({});

  const toggleSport = useCallback((key: string) => {
    setSelectedSports((prev) =>
      prev.includes(key) ? prev.filter((s) => s !== key) : [...prev, key],
    );
  }, []);

  // ── Load sport positions (padel) ──────────────────────────────────
  useEffect(() => {
    if (profile?.sport) {
      getSportPositions(profile.sport)
        .then((res) => {
          setPositions(res.positions);
          setStyles(res.styles);
        })
        .catch(() => {
          setPositions([]);
          setStyles([]);
        });
    }
  }, [profile?.sport]);

  // ── Dynamic step sequence ─────────────────────────────────────────
  const hasFootball = selectedSports.includes('football');
  const hasPadel = selectedSports.includes('padel');
  const isMultiSport = hasFootball && hasPadel;

  const stepSequence = useMemo<StepId[]>(() => {
    const seq: StepId[] = ['intro', 'sportSelection'];
    if (isMultiSport) seq.push('multiSportMessage');
    if (hasFootball) {
      seq.push('footballPosition', 'footballExperience', 'footballCompetition', 'footballSelfAssessment');
    }
    seq.push('physical');
    if (hasPadel) seq.push('sportDetails');
    seq.push(
      'trainingBaseline', 'recoveryBaseline', 'injuryHistory',
      'academic', 'goals', 'archetype', 'summary',
    );
    return seq;
  }, [hasFootball, hasPadel, isMultiSport]);

  const totalSteps = stepSequence.length;
  const currentStepId = stepSequence[step - 1] as StepId | undefined;

  // ── Sync progress bar with step / totalSteps ──────────────────────
  useEffect(() => {
    progressWidth.value = withTiming(step / totalSteps, {
      duration: 300,
      easing: Easing.out(Easing.cubic),
    });
  }, [step, totalSteps, progressWidth]);

  // ── Navigation ──────────────────────────────────────────────────────
  const canProceed = useCallback((): boolean => {
    switch (currentStepId) {
      case 'intro': return true;
      case 'sportSelection': return selectedSports.length > 0;
      case 'multiSportMessage': return true;
      case 'footballPosition': return footballPosition !== '';
      case 'footballExperience': return footballExperience !== '';
      case 'footballCompetition': return footballCompetition !== '';
      case 'footballSelfAssessment': return true; // optional
      case 'physical': return gender !== '';
      case 'sportDetails': return true;
      case 'trainingBaseline': return true;
      case 'recoveryBaseline': return true;
      case 'injuryHistory': return true;
      case 'academic': return true;
      case 'goals': return primaryGoal !== '';
      case 'archetype': return selfArchetype !== '';
      case 'summary': return true;
      default: return false;
    }
  }, [currentStepId, selectedSports, footballPosition, footballExperience, footballCompetition, gender, primaryGoal, selfArchetype]);

  const handleNext = useCallback(() => {
    if (step < totalSteps && canProceed()) {
      setSlideDirection('right');
      setStepKey((k) => k + 1);
      setStep((s) => s + 1);
    }
  }, [step, totalSteps, canProceed]);

  const handleBack = useCallback(() => {
    if (step > 1) {
      setSlideDirection('left');
      setStepKey((k) => k + 1);
      setStep((s) => s - 1);
    }
  }, [step]);

  const togglePainArea = useCallback((area: string) => {
    setPainAreas((prev) =>
      prev.includes(area) ? prev.filter((a) => a !== area) : [...prev, area],
    );
  }, []);

  // ── Submit ──────────────────────────────────────────────────────────
  const handleSubmit = useCallback(async () => {
    setIsSubmitting(true);
    try {
      const data: OnboardingData = {
        height: height ? Number(height) : undefined,
        weight: weight ? Number(weight) : undefined,
        gender: gender as Gender,
        position: position || footballPosition || undefined,
        playingStyle: playingStyle || undefined,
        weeklyTrainingDays: trainingDays,
        typicalSessionLength: sessionLength,
        seasonPhase,
        typicalSleepHours: sleepHours,
        baselineEnergy,
        injuries: injuries || undefined,
        painAreas: painAreas.length > 0 ? painAreas : undefined,
        isStudent,
        schoolHours: schoolHours ? Number(schoolHours) : undefined,
        examPeriods: examPeriods || undefined,
        primaryGoal: primaryGoal as PrimaryGoal,
        selfSelectedArchetype: selfArchetype as Archetype,
        selectedSports: selectedSports.length > 0 ? selectedSports : undefined,
        footballPosition: footballPosition || undefined,
        footballExperience: (footballExperience || undefined) as OnboardingData['footballExperience'],
        footballCompetition: (footballCompetition || undefined) as OnboardingData['footballCompetition'],
        footballSelfAssessment:
          Object.keys(footballSelfAssessment).length > 0
            ? Object.fromEntries(
                Object.entries(footballSelfAssessment).map(([k, v]) => [k, SELF_ASSESS_MAP[v] ?? v]),
              )
            : undefined,
      };

      await submitOnboarding(data);
      await refreshProfile();
    } catch {
      Alert.alert(
        'Error',
        'Could not save your profile. Please try again.',
        [{ text: 'OK' }],
      );
    } finally {
      setIsSubmitting(false);
    }
  }, [
    height, weight, gender, position, playingStyle,
    trainingDays, sessionLength, seasonPhase,
    sleepHours, baselineEnergy, injuries, painAreas,
    isStudent, schoolHours, examPeriods,
    primaryGoal, selfArchetype, refreshProfile,
    selectedSports, footballPosition, footballExperience,
    footballCompetition, footballSelfAssessment,
  ]);

  // ── Render Steps ────────────────────────────────────────────────────
  const renderStep = () => {
    switch (currentStepId) {
      // ── Intro ────────────────────────────────────────────────────
      case 'intro':
        return (
          <View style={styles_s.centeredContent}>
            <View style={styles_s.introIcon}>
              <Ionicons name="body-outline" size={48} color={colors.accent1} />
            </View>
            <Text style={styles_s.introTitle}>
              Let's build your{'\n'}athletic profile
            </Text>
            <Text style={styles_s.introSubtitle}>
              This takes about 2 minutes and helps Tomo personalize
              your training, recovery, and wellness plans.
            </Text>
          </View>
        );

      // ── Sport Selection (multi-select) ───────────────────────────
      case 'sportSelection':
        return (
          <>
            <Text style={styles_s.stepTitle}>Your Sport</Text>
            <Text style={styles_s.stepSubtitle}>
              Which sports do you play? Select all that apply.
            </Text>
            {SPORT_OPTIONS.map((sp) => {
              const selected = selectedSports.includes(sp.key);
              return (
                <TouchableOpacity
                  key={sp.key}
                  style={[
                    styles_s.sportCard,
                    selected && { borderColor: sp.color, backgroundColor: `${sp.color}18` },
                  ]}
                  onPress={() => toggleSport(sp.key)}
                >
                  <View style={[styles_s.sportIconBox, { backgroundColor: `${sp.color}20` }]}>
                    <Ionicons name={sp.icon} size={28} color={sp.color} />
                  </View>
                  <Text style={[styles_s.sportCardLabel, selected && { color: sp.color }]}>
                    {sp.label}
                  </Text>
                  {selected && (
                    <Ionicons name="checkmark-circle" size={22} color={sp.color} />
                  )}
                </TouchableOpacity>
              );
            })}
          </>
        );

      // ── Multi-Sport Encouragement ────────────────────────────────
      case 'multiSportMessage':
        return (
          <View style={styles_s.centeredContent}>
            <View style={[styles_s.introIcon, { backgroundColor: 'rgba(0, 217, 255, 0.12)' }]}>
              <Ionicons name="trophy-outline" size={48} color={colors.accent2} />
            </View>
            <Text style={styles_s.introTitle}>
              Multi-sport athlete!
            </Text>
            <Text style={styles_s.introSubtitle}>
              Playing both football and padel gives you a training edge.
              Cross-training improves agility, reaction time, and
              decision-making. Tomo will track benefits across both sports.
            </Text>
          </View>
        );

      // ── Football Position ────────────────────────────────────────
      case 'footballPosition':
        return (
          <>
            <Text style={styles_s.stepTitle}>Football Position</Text>
            <Text style={styles_s.stepSubtitle}>
              What position do you play most often?
            </Text>
            <View style={styles_s.chipGrid}>
              {FOOTBALL_POSITIONS.map((p) => (
                <TouchableOpacity
                  key={p.value}
                  style={[
                    styles_s.selectChip,
                    footballPosition === p.value && styles_s.selectChipActive,
                  ]}
                  onPress={() => setFootballPosition(p.value)}
                >
                  <Text
                    style={[
                      styles_s.selectChipText,
                      footballPosition === p.value && styles_s.selectChipTextActive,
                    ]}
                  >
                    {p.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </>
        );

      // ── Football Experience ──────────────────────────────────────
      case 'footballExperience':
        return (
          <>
            <Text style={styles_s.stepTitle}>Experience Level</Text>
            <Text style={styles_s.stepSubtitle}>
              How long have you been playing football?
            </Text>
            {EXPERIENCE_LEVELS.map((e) => (
              <TouchableOpacity
                key={e.value}
                style={[
                  styles_s.goalCard,
                  footballExperience === e.value && styles_s.goalCardActive,
                ]}
                onPress={() => setFootballExperience(e.value)}
              >
                <View style={{ flex: 1 }}>
                  <Text
                    style={[
                      styles_s.goalText,
                      footballExperience === e.value && styles_s.goalTextActive,
                    ]}
                  >
                    {e.label}
                  </Text>
                  <Text
                    style={[
                      styles_s.expDesc,
                      footballExperience === e.value && styles_s.expDescActive,
                    ]}
                  >
                    {e.desc}
                  </Text>
                </View>
                {footballExperience === e.value && (
                  <Ionicons name="checkmark-circle" size={20} color="#FFFFFF" />
                )}
              </TouchableOpacity>
            ))}
          </>
        );

      // ── Football Competition ─────────────────────────────────────
      case 'footballCompetition':
        return (
          <>
            <Text style={styles_s.stepTitle}>Competition Level</Text>
            <Text style={styles_s.stepSubtitle}>
              What level do you compete at?
            </Text>
            {COMPETITION_LEVELS.map((c) => (
              <TouchableOpacity
                key={c.value}
                style={[
                  styles_s.goalCard,
                  footballCompetition === c.value && styles_s.goalCardActive,
                ]}
                onPress={() => setFootballCompetition(c.value)}
              >
                <Ionicons
                  name={c.icon}
                  size={22}
                  color={footballCompetition === c.value ? '#FFFFFF' : colors.textInactive}
                />
                <Text
                  style={[
                    styles_s.goalText,
                    footballCompetition === c.value && styles_s.goalTextActive,
                  ]}
                >
                  {c.label}
                </Text>
                {footballCompetition === c.value && (
                  <Ionicons name="checkmark-circle" size={20} color="#FFFFFF" />
                )}
              </TouchableOpacity>
            ))}
          </>
        );

      // ── Football Self-Assessment (optional) ──────────────────────
      case 'footballSelfAssessment':
        return (
          <>
            <Text style={styles_s.stepTitle}>Rate Yourself</Text>
            <Text style={styles_s.stepSubtitle}>
              How would you rate your abilities? This is optional — you can skip.
            </Text>
            {FB_SELF_ASSESS_ATTRS.map((attr) => (
              <View key={attr.key} style={styles_s.assessRow}>
                <View style={styles_s.assessLabel}>
                  <Ionicons name={attr.icon} size={16} color={colors.accent1} />
                  <Text style={styles_s.assessLabelText}>{attr.label}</Text>
                </View>
                <View style={styles_s.assessButtons}>
                  {[1, 2, 3, 4, 5].map((v) => (
                    <TouchableOpacity
                      key={v}
                      style={[
                        styles_s.assessBtn,
                        footballSelfAssessment[attr.key] === v && styles_s.assessBtnActive,
                      ]}
                      onPress={() =>
                        setFootballSelfAssessment((prev) => ({ ...prev, [attr.key]: v }))
                      }
                    >
                      <Text
                        style={[
                          styles_s.assessBtnText,
                          footballSelfAssessment[attr.key] === v && styles_s.assessBtnTextActive,
                        ]}
                      >
                        {v}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            ))}
          </>
        );

      // ── Physical Info ────────────────────────────────────────────
      case 'physical':
        return (
          <>
            <Text style={styles_s.stepTitle}>Physical Info</Text>
            <Text style={styles_s.stepSubtitle}>
              Help us understand your body to give better recommendations.
            </Text>

            <View style={styles_s.row}>
              <View style={styles_s.halfInput}>
                <Input
                  label="Height (cm)"
                  placeholder="175"
                  value={height}
                  onChangeText={setHeight}
                  keyboardType="number-pad"
                />
              </View>
              <View style={styles_s.halfInput}>
                <Input
                  label="Weight (kg)"
                  placeholder="70"
                  value={weight}
                  onChangeText={setWeight}
                  keyboardType="number-pad"
                />
              </View>
            </View>

            <Text style={styles_s.fieldLabel}>Gender</Text>
            <View style={styles_s.chipGrid}>
              {GENDERS.map((g) => (
                <TouchableOpacity
                  key={g.value}
                  style={[
                    styles_s.selectChip,
                    gender === g.value && styles_s.selectChipActive,
                  ]}
                  onPress={() => setGender(g.value)}
                >
                  <Text
                    style={[
                      styles_s.selectChipText,
                      gender === g.value && styles_s.selectChipTextActive,
                    ]}
                  >
                    {g.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </>
        );

      // ── Sport Details (padel position/style) ─────────────────────
      case 'sportDetails':
        return (
          <>
            <Text style={styles_s.stepTitle}>Padel Details</Text>
            <Text style={styles_s.stepSubtitle}>
              Optional position and playing style for padel.
            </Text>

            {positions.length > 0 && (
              <>
                <Text style={styles_s.fieldLabel}>Position</Text>
                <View style={styles_s.chipGrid}>
                  {positions.map((p) => (
                    <TouchableOpacity
                      key={p}
                      style={[
                        styles_s.selectChip,
                        position === p && styles_s.selectChipActive,
                      ]}
                      onPress={() => setPosition(p)}
                    >
                      <Text
                        style={[
                          styles_s.selectChipText,
                          position === p && styles_s.selectChipTextActive,
                        ]}
                      >
                        {p}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </>
            )}

            {styles.length > 0 && (
              <>
                <Text style={styles_s.fieldLabel}>Playing Style</Text>
                <View style={styles_s.chipGrid}>
                  {styles.map((s) => (
                    <TouchableOpacity
                      key={s}
                      style={[
                        styles_s.selectChip,
                        playingStyle === s && styles_s.selectChipActive,
                      ]}
                      onPress={() => setPlayingStyle(s)}
                    >
                      <Text
                        style={[
                          styles_s.selectChipText,
                          playingStyle === s && styles_s.selectChipTextActive,
                        ]}
                      >
                        {s}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </>
            )}
          </>
        );

      // ── Training Baseline ────────────────────────────────────────
      case 'trainingBaseline':
        return (
          <>
            <Text style={styles_s.stepTitle}>Training Baseline</Text>

            <Text style={styles_s.fieldLabel}>
              Days per week you train: {trainingDays}
            </Text>
            <Slider
              label=""
              value={trainingDays}
              onChange={setTrainingDays}
              min={1}
              max={7}
            />

            <Text style={styles_s.fieldLabel}>Typical session length</Text>
            <View style={styles_s.chipGrid}>
              {SESSION_LENGTHS.map((len) => (
                <TouchableOpacity
                  key={len}
                  style={[
                    styles_s.selectChip,
                    sessionLength === len && styles_s.selectChipActive,
                  ]}
                  onPress={() => setSessionLength(len)}
                >
                  <Text
                    style={[
                      styles_s.selectChipText,
                      sessionLength === len && styles_s.selectChipTextActive,
                    ]}
                  >
                    {len} min
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={styles_s.fieldLabel}>Season Phase</Text>
            <View style={styles_s.chipGrid}>
              {SEASON_PHASES.map((sp) => (
                <TouchableOpacity
                  key={sp.value}
                  style={[
                    styles_s.selectChip,
                    seasonPhase === sp.value && styles_s.selectChipActive,
                  ]}
                  onPress={() => setSeasonPhase(sp.value)}
                >
                  <Ionicons
                    name={sp.icon as keyof typeof Ionicons.glyphMap}
                    size={16}
                    color={seasonPhase === sp.value ? '#FFFFFF' : colors.textInactive}
                    style={styles_s.chipIcon}
                  />
                  <Text
                    style={[
                      styles_s.selectChipText,
                      seasonPhase === sp.value && styles_s.selectChipTextActive,
                    ]}
                  >
                    {sp.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </>
        );

      // ── Recovery Baseline ────────────────────────────────────────
      case 'recoveryBaseline':
        return (
          <>
            <Text style={styles_s.stepTitle}>Recovery Baseline</Text>

            <Text style={styles_s.fieldLabel}>
              Typical sleep: {sleepHours} hours
            </Text>
            <Slider
              label=""
              value={sleepHours}
              onChange={setSleepHours}
              min={4}
              max={12}
            />

            <Text style={styles_s.fieldLabel}>
              Typical energy level: {baselineEnergy}/10
            </Text>
            <Slider
              label=""
              value={baselineEnergy}
              onChange={setBaselineEnergy}
              min={1}
              max={10}
            />
          </>
        );

      // ── Injury History ───────────────────────────────────────────
      case 'injuryHistory':
        return (
          <>
            <Text style={styles_s.stepTitle}>Injury History</Text>
            <Text style={styles_s.stepSubtitle}>
              Optional — helps us keep you safe.
            </Text>

            <Input
              label="Current injuries or chronic conditions"
              placeholder="e.g. Recovering from knee sprain"
              value={injuries}
              onChangeText={setInjuries}
              multiline
            />

            <Text style={styles_s.fieldLabel}>Pain areas (select any)</Text>
            <View style={styles_s.chipGrid}>
              {PAIN_AREAS.map((area) => (
                <TouchableOpacity
                  key={area}
                  style={[
                    styles_s.selectChip,
                    painAreas.includes(area) && styles_s.selectChipPain,
                  ]}
                  onPress={() => togglePainArea(area)}
                >
                  <Text
                    style={[
                      styles_s.selectChipText,
                      painAreas.includes(area) && styles_s.selectChipTextPain,
                    ]}
                  >
                    {area}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </>
        );

      // ── Academic ─────────────────────────────────────────────────
      case 'academic':
        return (
          <>
            <Text style={styles_s.stepTitle}>Academic Life</Text>
            <Text style={styles_s.stepSubtitle}>
              Helps us balance training with school demands.
            </Text>

            <Text style={styles_s.fieldLabel}>Are you a student?</Text>
            <View style={styles_s.chipGrid}>
              <TouchableOpacity
                style={[
                  styles_s.selectChip,
                  isStudent && styles_s.selectChipActive,
                ]}
                onPress={() => setIsStudent(true)}
              >
                <Text
                  style={[
                    styles_s.selectChipText,
                    isStudent && styles_s.selectChipTextActive,
                  ]}
                >
                  Yes
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles_s.selectChip,
                  !isStudent && styles_s.selectChipActive,
                ]}
                onPress={() => setIsStudent(false)}
              >
                <Text
                  style={[
                    styles_s.selectChipText,
                    !isStudent && styles_s.selectChipTextActive,
                  ]}
                >
                  No
                </Text>
              </TouchableOpacity>
            </View>

            {isStudent && (
              <>
                <Input
                  label="School hours per day"
                  placeholder="6"
                  value={schoolHours}
                  onChangeText={setSchoolHours}
                  keyboardType="number-pad"
                />
                <Input
                  label="Heavy exam periods (optional)"
                  placeholder="e.g. June, December"
                  value={examPeriods}
                  onChangeText={setExamPeriods}
                />
              </>
            )}
          </>
        );

      // ── Goals ────────────────────────────────────────────────────
      case 'goals':
        return (
          <>
            <Text style={styles_s.stepTitle}>Your Main Goal</Text>
            <Text style={styles_s.stepSubtitle}>
              What's the #1 thing you want Tomo to help with?
            </Text>

            {GOALS.map((g) => (
              <TouchableOpacity
                key={g.value}
                style={[
                  styles_s.goalCard,
                  primaryGoal === g.value && styles_s.goalCardActive,
                ]}
                onPress={() => setPrimaryGoal(g.value)}
              >
                <Ionicons
                  name={g.icon as keyof typeof Ionicons.glyphMap}
                  size={22}
                  color={primaryGoal === g.value ? '#FFFFFF' : colors.textInactive}
                />
                <Text
                  style={[
                    styles_s.goalText,
                    primaryGoal === g.value && styles_s.goalTextActive,
                  ]}
                >
                  {g.label}
                </Text>
                {primaryGoal === g.value && (
                  <Ionicons name="checkmark-circle" size={20} color="#FFFFFF" />
                )}
              </TouchableOpacity>
            ))}
          </>
        );

      // ── Archetype Self-ID ────────────────────────────────────────
      case 'archetype':
        return (
          <>
            <Text style={styles_s.stepTitle}>Which sounds like you?</Text>
            <Text style={styles_s.stepSubtitle}>
              Pick the one that feels closest. Tomo will learn your
              true type over 14 days of check-ins.
            </Text>

            {ARCHETYPE_CARDS.map((a) => (
              <TouchableOpacity
                key={a.value}
                style={[
                  styles_s.archetypeCard,
                  selfArchetype === a.value && {
                    borderColor: a.color,
                    backgroundColor: `${a.color}18`,
                  },
                ]}
                onPress={() => setSelfArchetype(a.value)}
              >
                <View style={styles_s.archetypeHeader}>
                  <Text style={styles_s.archetypeEmoji}>{a.emoji}</Text>
                  <Text
                    style={[
                      styles_s.archetypeName,
                      selfArchetype === a.value && { color: a.color },
                    ]}
                  >
                    {a.name}
                  </Text>
                  {selfArchetype === a.value && (
                    <Ionicons name="checkmark-circle" size={20} color={a.color} />
                  )}
                </View>
                <Text style={styles_s.archetypeDesc}>{a.desc}</Text>
              </TouchableOpacity>
            ))}
          </>
        );

      // ── Summary ──────────────────────────────────────────────────
      case 'summary': {
        const sportNames = selectedSports
          .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
          .join(' + ');
        return (
          <View style={styles_s.centeredContent}>
            <View style={styles_s.completeIcon}>
              <Ionicons name="checkmark-circle" size={56} color={colors.readinessGreen} />
            </View>
            <Text style={styles_s.introTitle}>Your profile is ready!</Text>
            <Text style={styles_s.introSubtitle}>
              Tomo now has everything it needs to personalize your experience.
              {selfArchetype
                ? ` You identified as a ${ARCHETYPE_CARDS.find((a) => a.value === selfArchetype)?.name} — we'll confirm your true type after 14 check-ins.`
                : ''}
            </Text>

            <View style={styles_s.summaryCard}>
              <SummaryRow label="Sport" value={sportNames || '—'} />
              {hasFootball && footballPosition && (
                <SummaryRow
                  label="Position"
                  value={FOOTBALL_POSITIONS.find((p) => p.value === footballPosition)?.label || footballPosition}
                />
              )}
              {hasFootball && footballExperience && (
                <SummaryRow
                  label="Experience"
                  value={EXPERIENCE_LEVELS.find((e) => e.value === footballExperience)?.label || footballExperience}
                />
              )}
              {hasPadel && position && <SummaryRow label="Padel Position" value={position} />}
              <SummaryRow label="Training" value={`${trainingDays}x/week, ${sessionLength}min`} />
              <SummaryRow label="Sleep" value={`${sleepHours}h typical`} />
              <SummaryRow label="Goal" value={GOALS.find((g) => g.value === primaryGoal)?.label || '—'} />
              {selfArchetype && (
                <SummaryRow
                  label="Archetype"
                  value={`${ARCHETYPE_CARDS.find((a) => a.value === selfArchetype)?.emoji} ${ARCHETYPE_CARDS.find((a) => a.value === selfArchetype)?.name}`}
                />
              )}
            </View>
          </View>
        );
      }

      default:
        return null;
    }
  };

  return (
    <SafeAreaView style={styles_s.container}>
      {/* ─── Animated Progress Bar ─────────────────────────────────── */}
      <View style={styles_s.progressBar}>
        <Animated.View style={[styles_s.progressFill, progressStyle]} />
      </View>

      {/* ─── Step Counter ──────────────────────────────────────────── */}
      {currentStepId !== 'intro' && currentStepId !== 'summary' && (
        <Text style={styles_s.stepCounter}>
          {step} of {totalSteps}
        </Text>
      )}

      {/* ─── Content ───────────────────────────────────────────────── */}
      <ScrollView
        style={styles_s.scrollView}
        contentContainerStyle={styles_s.scrollContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <Animated.View
          key={stepKey}
          entering={
            slideDirection === 'right'
              ? SlideInRight.duration(280).easing(Easing.out(Easing.cubic))
              : SlideInLeft.duration(280).easing(Easing.out(Easing.cubic))
          }
        >
          {renderStep()}
        </Animated.View>
      </ScrollView>

      {/* ─── Navigation Buttons ────────────────────────────────────── */}
      <View style={styles_s.navRow}>
        {step > 1 && (
          <Button
            title="Back"
            onPress={handleBack}
            variant="outline"
            icon="arrow-back"
            style={styles_s.backBtn}
          />
        )}

        {currentStepId !== 'summary' ? (
          <Button
            title={currentStepId === 'intro' ? "Let's Go" : 'Next'}
            onPress={handleNext}
            variant="primary"
            icon={currentStepId === 'intro' ? 'arrow-forward' : undefined}
            disabled={!canProceed()}
            style={currentStepId === 'intro' ? styles_s.fullBtn : styles_s.nextBtn}
          />
        ) : (
          <Button
            title="Let's Go!"
            onPress={handleSubmit}
            variant="primary"
            icon="rocket"
            loading={isSubmitting}
            style={styles_s.nextBtn}
          />
        )}
      </View>
    </SafeAreaView>
  );
}

// ---------------------------------------------------------------------------
// Summary Row sub-component
// ---------------------------------------------------------------------------

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles_s.summaryRow}>
      <Text style={styles_s.summaryLabel}>{label}</Text>
      <Text style={styles_s.summaryValue}>{value}</Text>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles_s = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },

  // ── Progress ──────────────────────────────────────────────────────
  progressBar: {
    height: 3,
    backgroundColor: colors.backgroundElevated,
  },
  progressFill: {
    height: 3,
    backgroundColor: colors.accent1,
    borderRadius: 1.5,
  },
  stepCounter: {
    fontFamily: fontFamily.medium,
    fontSize: 13,
    color: colors.textInactive,
    textAlign: 'center',
    marginTop: spacing.sm,
  },

  // ── Scroll ────────────────────────────────────────────────────────
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: layout.screenMargin,
    paddingTop: spacing.lg,
    paddingBottom: spacing.lg,
  },

  // ── Step Headers ──────────────────────────────────────────────────
  stepTitle: {
    fontFamily: fontFamily.bold,
    fontSize: 24,
    color: colors.textOnDark,
    marginBottom: spacing.xs,
  },
  stepSubtitle: {
    ...typography.bodyOnDark,
    color: colors.textInactive,
    marginBottom: spacing.xl,
  },

  // ── Intro / Summary centered ──────────────────────────────────────
  centeredContent: {
    alignItems: 'center',
    paddingTop: spacing.huge,
  },
  introIcon: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: 'rgba(255, 107, 53, 0.12)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.xl,
  },
  introTitle: {
    fontFamily: fontFamily.bold,
    fontSize: 28,
    color: colors.textOnDark,
    textAlign: 'center',
    marginBottom: spacing.md,
  },
  introSubtitle: {
    ...typography.bodyOnDark,
    color: colors.textInactive,
    textAlign: 'center',
    paddingHorizontal: spacing.md,
    lineHeight: 22,
  },

  // ── Field Label ───────────────────────────────────────────────────
  fieldLabel: {
    fontFamily: fontFamily.semiBold,
    fontSize: 14,
    color: colors.textOnDark,
    marginBottom: spacing.sm,
    marginTop: spacing.md,
  },

  // ── Row layout ────────────────────────────────────────────────────
  row: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  halfInput: {
    flex: 1,
  },

  // ── Selectable Chips ──────────────────────────────────────────────
  chipGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  selectChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.backgroundElevated,
    borderWidth: 1.5,
    borderColor: colors.borderLight,
    borderRadius: borderRadius.full,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  selectChipActive: {
    backgroundColor: colors.accent1,
    borderColor: colors.accent1,
  },
  selectChipText: {
    fontFamily: fontFamily.medium,
    fontSize: 14,
    color: colors.textInactive,
  },
  selectChipTextActive: {
    color: '#FFFFFF',
  },
  selectChipPain: {
    backgroundColor: colors.readinessRedBg,
    borderColor: colors.readinessRed,
  },
  selectChipTextPain: {
    color: colors.readinessRed,
  },
  chipIcon: {
    marginRight: spacing.xs,
  },

  // ── Goal Cards ────────────────────────────────────────────────────
  goalCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.backgroundElevated,
    borderWidth: 1.5,
    borderColor: colors.borderLight,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    marginBottom: spacing.sm,
    gap: spacing.compact,
  },
  goalCardActive: {
    backgroundColor: colors.accent1,
    borderColor: colors.accent1,
  },
  goalText: {
    fontFamily: fontFamily.semiBold,
    fontSize: 15,
    color: colors.textInactive,
    flex: 1,
  },
  goalTextActive: {
    color: '#FFFFFF',
  },

  // ── Archetype Cards ───────────────────────────────────────────────
  archetypeCard: {
    backgroundColor: colors.backgroundElevated,
    borderWidth: 2,
    borderColor: colors.borderLight,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  archetypeHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.xs,
  },
  archetypeEmoji: {
    fontSize: 24,
  },
  archetypeName: {
    fontFamily: fontFamily.bold,
    fontSize: 18,
    color: colors.textOnDark,
    flex: 1,
  },
  archetypeDesc: {
    ...typography.bodyOnDark,
    color: colors.textInactive,
    marginLeft: 34, // Align with name (emoji + gap)
  },

  // ── Summary Card ──────────────────────────────────────────────────
  summaryCard: {
    backgroundColor: colors.backgroundElevated,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    marginTop: spacing.xl,
    width: '100%',
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
  },
  summaryLabel: {
    fontFamily: fontFamily.medium,
    fontSize: 14,
    color: colors.textInactive,
  },
  summaryValue: {
    fontFamily: fontFamily.semiBold,
    fontSize: 14,
    color: colors.textOnDark,
  },

  // ── Complete Icon ─────────────────────────────────────────────────
  completeIcon: {
    marginBottom: spacing.md,
  },

  // ── Sport Cards ────────────────────────────────────────────────────
  sportCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.backgroundElevated,
    borderWidth: 2,
    borderColor: colors.borderLight,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    marginBottom: spacing.sm,
    gap: spacing.compact,
  },
  sportIconBox: {
    width: 48,
    height: 48,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sportCardLabel: {
    fontFamily: fontFamily.bold,
    fontSize: 18,
    color: colors.textOnDark,
    flex: 1,
  },

  // ── Experience Description ─────────────────────────────────────────
  expDesc: {
    fontFamily: fontFamily.regular,
    fontSize: 12,
    color: colors.textInactive,
    marginTop: 2,
  },
  expDescActive: {
    color: 'rgba(255, 255, 255, 0.7)',
  },

  // ── Self-Assessment ────────────────────────────────────────────────
  assessRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.md,
  },
  assessLabel: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    width: 110,
  },
  assessLabelText: {
    fontFamily: fontFamily.medium,
    fontSize: 14,
    color: colors.textOnDark,
  },
  assessButtons: {
    flexDirection: 'row',
    gap: spacing.xs,
  },
  assessBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.backgroundElevated,
    borderWidth: 1.5,
    borderColor: colors.borderLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  assessBtnActive: {
    backgroundColor: colors.accent1,
    borderColor: colors.accent1,
  },
  assessBtnText: {
    fontFamily: fontFamily.semiBold,
    fontSize: 14,
    color: colors.textInactive,
  },
  assessBtnTextActive: {
    color: '#FFFFFF',
  },

  // ── Nav Buttons ───────────────────────────────────────────────────
  navRow: {
    flexDirection: 'row',
    paddingHorizontal: layout.screenMargin,
    paddingBottom: spacing.lg,
    paddingTop: spacing.sm,
    gap: spacing.sm,
  },
  backBtn: {
    flex: 1,
  },
  nextBtn: {
    flex: 2,
  },
  fullBtn: {
    flex: 1,
  },
});
