/**
 * Onboarding Screen — Digital Twin Profiling
 * 6-9 step wizard that runs after signup, before main app.
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
  Platform,
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
import DateTimePicker from '@react-native-community/datetimepicker';
import { Button, Input } from '../components';
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
  Gender,
  PrimaryGoal,
  OnboardingData,
  EducationType,
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
  | 'footballExperienceCompetition'
  | 'profileSkillsGoals'
  | 'sportDetails'
  | 'academic'
  | 'summary';

// ── Sport Selection ───────────────────────────────────────────────────────
const SPORT_OPTIONS: { key: string; label: string; icon: keyof typeof Ionicons.glyphMap; color: string }[] = [
  { key: 'football', label: 'Football', icon: 'football-outline', color: colors.accent },
  { key: 'padel', label: 'Padel', icon: 'tennisball-outline', color: colors.info },
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

const GOALS: { value: PrimaryGoal; label: string; icon: string }[] = [
  { value: 'improve_fitness', label: 'Improve fitness', icon: 'trending-up-outline' },
  { value: 'get_recruited', label: 'Get recruited', icon: 'star-outline' },
  { value: 'recover_from_injury', label: 'Recover from injury', icon: 'medkit-outline' },
  { value: 'stay_consistent', label: 'Stay consistent', icon: 'checkmark-circle-outline' },
  { value: 'have_fun', label: 'Have fun', icon: 'happy-outline' },
];

// ── Education ─────────────────────────────────────────────────────────────
const SCHOOL_GRADES = Array.from({ length: 12 }, (_, i) => i + 1);
const UNI_YEARS = Array.from({ length: 6 }, (_, i) => i + 1);

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

  const [primaryGoal, setPrimaryGoal] = useState<PrimaryGoal | ''>('');

  // ── Multi-sport + Football state ──────────────────────────────────
  const [selectedSports, setSelectedSports] = useState<string[]>([]);
  const [footballPosition, setFootballPosition] = useState('');
  const [footballExperience, setFootballExperience] = useState('');
  const [footballCompetition, setFootballCompetition] = useState('');
  const [footballSelfAssessment, setFootballSelfAssessment] = useState<Record<string, number>>({});

  // ── Date of birth state ──────────────────────────────────────────
  const [showDobPicker, setShowDobPicker] = useState(false);
  const [dobDate, setDobDate] = useState(new Date(2008, 0, 1));
  const [dobSelected, setDobSelected] = useState(false);
  const [calculatedAge, setCalculatedAge] = useState<number | null>(null);

  const onDobChange = useCallback((event: any, selectedDate?: Date) => {
    setShowDobPicker(Platform.OS === 'ios');
    if (selectedDate) {
      setDobDate(selectedDate);
      setDobSelected(true);
      const age = Math.floor((Date.now() - selectedDate.getTime()) / (365.25 * 24 * 60 * 60 * 1000));
      setCalculatedAge(age);
    }
  }, []);

  // ── Education state ────────────────────────────────────────────────
  const [educationType, setEducationType] = useState<EducationType | ''>('');
  const [educationYear, setEducationYear] = useState(0);

  const toggleSport = useCallback((key: string) => {
    setSelectedSports((prev) =>
      prev.includes(key) ? prev.filter((s) => s !== key) : [...prev, key],
    );
  }, []);

  // ── Dynamic step sequence ─────────────────────────────────────────
  const hasFootball = selectedSports.includes('football');
  const hasPadel = selectedSports.includes('padel');
  const isMultiSport = hasFootball && hasPadel;

  // ── Load sport positions (padel) ──────────────────────────────────
  const padelSport = hasPadel ? 'padel' : profile?.sport;
  useEffect(() => {
    if (padelSport) {
      getSportPositions(padelSport)
        .then((res) => {
          setPositions(res.positions ?? []);
          setStyles(res.playingStyles ?? []);
        })
        .catch(() => {
          setPositions([]);
          setStyles([]);
        });
    }
  }, [padelSport]);

  const stepSequence = useMemo<StepId[]>(() => {
    const seq: StepId[] = ['intro', 'sportSelection'];
    if (isMultiSport) seq.push('multiSportMessage');
    if (hasFootball) {
      seq.push('footballPosition', 'footballExperienceCompetition');
    }
    seq.push('profileSkillsGoals');
    if (hasPadel) seq.push('sportDetails');
    seq.push('academic', 'summary');
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
      case 'footballExperienceCompetition': return footballExperience !== '' && footballCompetition !== '';
      case 'profileSkillsGoals': return gender !== '' && primaryGoal !== '';
      case 'sportDetails': return true;
      case 'academic': return educationType !== '';
      case 'summary': return true;
      default: return false;
    }
  }, [currentStepId, selectedSports, footballPosition, footballExperience, footballCompetition, gender, primaryGoal, educationType]);

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

  // ── Submit ──────────────────────────────────────────────────────────
  const handleSubmit = useCallback(async () => {
    setIsSubmitting(true);
    try {
      const data: OnboardingData = {
        height: height ? Number(height) : undefined,
        weight: weight ? Number(weight) : undefined,
        gender: gender as Gender,
        dateOfBirth: dobSelected ? dobDate.toISOString().split('T')[0] : undefined,
        age: calculatedAge ?? undefined,
        position: position || footballPosition || undefined,
        playingStyle: playingStyle || undefined,
        primaryGoal: primaryGoal as PrimaryGoal,
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
        educationType: educationType as OnboardingData['educationType'],
        educationYear: educationYear > 0 ? educationYear : undefined,
      };

      await submitOnboarding(data);
      await refreshProfile();
    } catch (err) {
      console.error('[Onboarding] submit failed:', err);
      Alert.alert('Tomo', 'Could not save your profile. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  }, [
    height, weight, gender, position, playingStyle,
    primaryGoal, refreshProfile,
    selectedSports, footballPosition, footballExperience,
    footballCompetition, footballSelfAssessment,
    educationType, educationYear, dobSelected, dobDate, calculatedAge,
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

      // ── Football Experience + Competition (merged) ─────────────
      case 'footballExperienceCompetition':
        return (
          <>
            <Text style={styles_s.stepTitle}>Experience & Competition</Text>
            <Text style={styles_s.stepSubtitle}>
              Tell us about your football background.
            </Text>

            {/* Experience Level */}
            <Text style={styles_s.fieldLabel}>Experience Level</Text>
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
                  <Ionicons name="checkmark-circle" size={20} color={colors.textPrimary} />
                )}
              </TouchableOpacity>
            ))}

            {/* Competition Level */}
            <Text style={[styles_s.fieldLabel, { marginTop: spacing.lg }]}>Competition Level</Text>
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
                  color={footballCompetition === c.value ? colors.textPrimary : colors.textInactive}
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
                  <Ionicons name="checkmark-circle" size={20} color={colors.textPrimary} />
                )}
              </TouchableOpacity>
            ))}
          </>
        );

      // ── Profile, Skills & Goals (merged) ──────────────────────────
      case 'profileSkillsGoals':
        return (
          <>
            <Text style={styles_s.stepTitle}>About You</Text>
            <Text style={styles_s.stepSubtitle}>
              Help us personalize your experience
            </Text>

            {/* Section 1: Gender */}
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

            {/* Section 2: Date of Birth */}
            <Text style={styles_s.fieldLabel}>Date of Birth</Text>
            <Pressable
              onPress={() => setShowDobPicker(true)}
              style={[styles_s.dobPickerButton, { backgroundColor: colors.inputBackground }]}
            >
              <Ionicons name="calendar-outline" size={18} color={colors.accent2} />
              <Text style={[styles_s.dobPickerText, { color: dobSelected ? colors.textOnDark : colors.textMuted }]}>
                {dobSelected
                  ? dobDate.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
                  : 'Select your date of birth'}
              </Text>
            </Pressable>
            {showDobPicker && (
              <DateTimePicker
                value={dobDate}
                mode="date"
                display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                onChange={onDobChange}
                maximumDate={new Date()}
                minimumDate={new Date(2000, 0, 1)}
                themeVariant="dark"
              />
            )}
            {calculatedAge != null && (
              <Text style={[styles_s.dobAgeLabel, { color: colors.accent2 }]}>
                Age: {calculatedAge} years
              </Text>
            )}

            {/* Section 3: Height + Weight */}
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

            {/* Section 3: Football Self-Assessment (optional) */}
            {hasFootball && (
              <>
                <Text style={[styles_s.fieldLabel, { marginTop: spacing.lg }]}>Rate Yourself (optional)</Text>
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
            )}

            {/* Section 4: Primary Goal */}
            <Text style={[styles_s.fieldLabel, { marginTop: spacing.lg }]}>Your Main Goal</Text>
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
                  color={primaryGoal === g.value ? colors.textPrimary : colors.textInactive}
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
                  <Ionicons name="checkmark-circle" size={20} color={colors.textPrimary} />
                )}
              </TouchableOpacity>
            ))}
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

            {positions?.length > 0 && (
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

            {styles?.length > 0 && (
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

      // ── Academic (redesigned) ──────────────────────────────────────
      case 'academic':
        return (
          <>
            <Text style={styles_s.stepTitle}>Education</Text>
            <Text style={styles_s.stepSubtitle}>
              Are you currently in school or university?
            </Text>

            {/* Education type — big cards like sport selection */}
            <TouchableOpacity
              style={[
                styles_s.sportCard,
                educationType === 'school' && { borderColor: colors.accent1, backgroundColor: `${colors.accent1}18` },
              ]}
              onPress={() => { setEducationType('school'); setEducationYear(0); }}
            >
              <View style={[styles_s.sportIconBox, { backgroundColor: `${colors.accent1}20` }]}>
                <Ionicons name="school-outline" size={28} color={colors.accent1} />
              </View>
              <Text style={[styles_s.sportCardLabel, educationType === 'school' && { color: colors.accent1 }]}>
                School
              </Text>
              {educationType === 'school' && (
                <Ionicons name="checkmark-circle" size={22} color={colors.accent1} />
              )}
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles_s.sportCard,
                educationType === 'university' && { borderColor: colors.accent2, backgroundColor: `${colors.accent2}18` },
              ]}
              onPress={() => { setEducationType('university'); setEducationYear(0); }}
            >
              <View style={[styles_s.sportIconBox, { backgroundColor: `${colors.accent2}20` }]}>
                <Ionicons name="library-outline" size={28} color={colors.accent2} />
              </View>
              <Text style={[styles_s.sportCardLabel, educationType === 'university' && { color: colors.accent2 }]}>
                University
              </Text>
              {educationType === 'university' && (
                <Ionicons name="checkmark-circle" size={22} color={colors.accent2} />
              )}
            </TouchableOpacity>

            {/* Grade / Year chips */}
            {educationType === 'school' && (
              <>
                <Text style={[styles_s.fieldLabel, { marginTop: spacing.lg }]}>Grade</Text>
                <View style={styles_s.chipGrid}>
                  {SCHOOL_GRADES.map((g) => (
                    <TouchableOpacity
                      key={g}
                      style={[
                        styles_s.selectChip,
                        educationYear === g && styles_s.selectChipActive,
                      ]}
                      onPress={() => setEducationYear(g)}
                    >
                      <Text
                        style={[
                          styles_s.selectChipText,
                          educationYear === g && styles_s.selectChipTextActive,
                        ]}
                      >
                        {g}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </>
            )}

            {educationType === 'university' && (
              <>
                <Text style={[styles_s.fieldLabel, { marginTop: spacing.lg }]}>Year</Text>
                <View style={styles_s.chipGrid}>
                  {UNI_YEARS.map((y) => (
                    <TouchableOpacity
                      key={y}
                      style={[
                        styles_s.selectChip,
                        educationYear === y && styles_s.selectChipActive,
                      ]}
                      onPress={() => setEducationYear(y)}
                    >
                      <Text
                        style={[
                          styles_s.selectChipText,
                          educationYear === y && styles_s.selectChipTextActive,
                        ]}
                      >
                        {y}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </>
            )}
          </>
        );

      // ── Summary ──────────────────────────────────────────────────
      case 'summary': {
        const sportNames = selectedSports
          .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
          .join(' + ');

        const educationLabel = educationType
          ? `${educationType === 'school' ? 'School' : 'University'}${educationYear > 0 ? ` - ${educationType === 'school' ? 'Grade' : 'Year'} ${educationYear}` : ''}`
          : undefined;

        return (
          <View style={styles_s.centeredContent}>
            <View style={styles_s.completeIcon}>
              <Ionicons name="checkmark-circle" size={56} color={colors.readinessGreen} />
            </View>
            <Text style={styles_s.introTitle}>Your profile is ready!</Text>
            <Text style={styles_s.introSubtitle}>
              Tomo now has everything it needs to personalize your experience.
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
              <SummaryRow label="Goal" value={GOALS.find((g) => g.value === primaryGoal)?.label || '—'} />
              {educationLabel && <SummaryRow label="Education" value={educationLabel} />}
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
            title="Let's Tomo!"
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
    maxWidth: layout.authMaxWidth,
    width: '100%',
    alignSelf: 'center',
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

  // ── DOB Picker ──────────────────────────────────────────────────
  dobPickerButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderRadius: borderRadius.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.compact,
    minHeight: 48,
    marginBottom: spacing.xs,
  },
  dobPickerText: {
    fontFamily: fontFamily.medium,
    fontSize: 15,
  },
  dobAgeLabel: {
    fontFamily: fontFamily.semiBold,
    fontSize: 13,
    marginBottom: spacing.sm,
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
    color: colors.textPrimary,
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
    color: colors.textPrimary,
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
    color: colors.textPrimary,
  },

  // ── Nav Buttons ───────────────────────────────────────────────────
  navRow: {
    flexDirection: 'row',
    paddingHorizontal: layout.screenMargin,
    paddingBottom: spacing.lg,
    paddingTop: spacing.sm,
    gap: spacing.sm,
    maxWidth: layout.authMaxWidth,
    width: '100%',
    alignSelf: 'center',
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
