/**
 * Onboarding Navigator
 *
 * Phase 2 replacement for the old OnboardingScreen for players. A
 * four-screen stack (Sport → Position → HeightWeight → Goal) with
 * per-step persistence via /onboarding/progress. On mount it reads
 * the stored state and jumps straight to the last unanswered step
 * so a crash or app-switch resumes the flow.
 */
import React, { useEffect, useState } from 'react';
import { View, StyleSheet } from 'react-native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { TomoLoader } from '../components/TomoLoader';
import { SportScreen } from '../screens/onboarding/SportScreen';
import { PositionScreen } from '../screens/onboarding/PositionScreen';
import { HeightWeightScreen } from '../screens/onboarding/HeightWeightScreen';
import { GoalScreen } from '../screens/onboarding/GoalScreen';
import { getOnboardingProgress, OnboardingStep } from '../services/api';
import { useTheme } from '../hooks/useTheme';
import type { OnboardingStackParamList } from './types';

const Stack = createNativeStackNavigator<OnboardingStackParamList>();

type InitialRoute = keyof OnboardingStackParamList;

// Mapping from the last-answered step to the next screen the user
// should see. Keeps the resume logic in one place.
function resumeRouteFromStep(step: OnboardingStep | undefined): InitialRoute {
  switch (step) {
    case 'sport':
      return 'Position';
    case 'position':
      return 'HeightWeight';
    case 'heightWeight':
      return 'Goal';
    case 'goal':
      // All steps answered but finalize didn't complete — return to Goal
      // so they can tap "Start training" again.
      return 'Goal';
    default:
      return 'Sport';
  }
}

type ResumePayload = {
  route: InitialRoute;
  sport?: OnboardingStackParamList['Position']['sport'];
};

export function OnboardingNavigator() {
  const { colors } = useTheme();
  const [resume, setResume] = useState<ResumePayload | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { state } = await getOnboardingProgress();
        if (cancelled) return;
        const route = resumeRouteFromStep(state?.step);
        const sport = state?.answers?.sport as ResumePayload['sport'] | undefined;
        // If Position would be the next screen but no sport is stored,
        // fall back to Sport to avoid an invalid route.
        if (route === 'Position' && !sport) {
          setResume({ route: 'Sport' });
          return;
        }
        setResume({ route, sport });
      } catch {
        // On any error, start from the top. The saves from earlier
        // steps are still persisted and will be merged on finalize.
        setResume({ route: 'Sport' });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (!resume) {
    return (
      <View style={[styles.loading, { backgroundColor: colors.background }]}>
        <TomoLoader />
      </View>
    );
  }

  return (
    <Stack.Navigator
      initialRouteName={resume.route}
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: colors.background },
        animation: 'slide_from_right',
        // Disable swipe-back — onboarding is linear.
        gestureEnabled: false,
      }}
    >
      <Stack.Screen name="Sport" component={SportScreen} />
      <Stack.Screen
        name="Position"
        component={PositionScreen}
        initialParams={resume.sport ? { sport: resume.sport } : undefined}
      />
      <Stack.Screen name="HeightWeight" component={HeightWeightScreen} />
      <Stack.Screen name="Goal" component={GoalScreen} />
    </Stack.Navigator>
  );
}

const styles = StyleSheet.create({
  loading: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
