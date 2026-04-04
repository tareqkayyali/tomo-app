/**
 * Deep Navigation Engine — converts intent into precise screen navigation.
 * Used when an action requires a UI form that cannot be fully replicated in chat,
 * or when the player wants to go directly to a specific part of the app.
 */

import { logger } from "@/lib/logger";

// ── All navigable screens in the Tomo app ──
export type AppScreen =
  | "HomeScreen"          // Tomo Chat (default)
  | "TimelineScreen"      // Calendar grid + events
  | "OutputScreen"        // My Vitals / My Metrics / My Programs
  | "MasteryScreen"       // DNA card, pillars, streaks
  | "OwnItScreen"         // Recommendation feed
  | "ProfileScreen"       // User profile edit
  | "ScheduleRulesScreen" // School hours, sleep, league, exam period
  | "NotificationCenterScreen" // Full notification center
  | "NotificationSettingsScreen" // Push notification prefs
  | "CVPreviewScreen"     // CV as scout would see
  | "CVEditScreen"        // CV field editor
  | "WearableSettingsScreen" // WHOOP / wearable connections
  | "AppSettingsScreen"   // Language, units, theme
  | "TestHistoryScreen"   // All test results history
  | "DrillLibraryScreen"  // Browse/search drills
  | "JournalHistoryScreen"// Past journal entries
  | "AchievementsScreen"  // Milestones & achievements
  | "SleepDetailScreen"   // Sleep data deep dive
  | "GoalsScreen"         // Goal tracker (future)
  | "InjuryLogScreen"     // Injury history (future)
  | "NutritionLogScreen"; // Nutrition log (future)

export interface DeepNavAction {
  screen: AppScreen;
  params?: Record<string, any>;   // Pre-fill params passed to screen
  highlight?: string;             // Element ID to scroll to + highlight
  autoOpen?: string;              // Capsule or modal to open on arrival
}

export interface NavigateCardPayload {
  type: "navigation_capsule";
  icon: string;
  label: string;
  description: string;
  target: string;
  deepLink: {
    tabName: string;
    params?: Record<string, any>;
    screen?: string;      // Sub-screen within tab
    highlight?: string;   // Element to highlight on arrival
    autoOpen?: string;    // Modal/sheet to open on arrival
  };
}

// ── Screen metadata for navigation card rendering ──
interface ScreenMeta {
  icon: string;
  label: string;
  description: string;
  tabName: string;           // Which tab this screen belongs to
  screenName?: string;       // Sub-screen name for nested navigation
}

const SCREEN_META: Record<AppScreen, ScreenMeta> = {
  HomeScreen:                 { icon: "💬", label: "Tomo Chat",            description: "AI Command Center",                    tabName: "Home" },
  TimelineScreen:             { icon: "📅", label: "Timeline",             description: "Your calendar and daily schedule",     tabName: "Timeline" },
  OutputScreen:               { icon: "📊", label: "Output",               description: "Vitals, metrics, and programs",        tabName: "Output" },
  MasteryScreen:              { icon: "🏆", label: "Mastery",              description: "DNA card, pillars, and milestones",    tabName: "Mastery" },
  OwnItScreen:                { icon: "🎯", label: "Own It",               description: "Personalized recommendations",         tabName: "OwnIt" },
  ProfileScreen:              { icon: "👤", label: "Profile",              description: "Your sport, position, and details",    tabName: "Output", screenName: "Profile" },
  ScheduleRulesScreen:        { icon: "⚙️", label: "Schedule Rules",       description: "School hours, sleep, and load rules",  tabName: "Timeline", screenName: "MyRules" },
  NotificationCenterScreen:   { icon: "🔔", label: "Notifications",        description: "All your notifications",               tabName: "Home", screenName: "NotificationCenter" },
  NotificationSettingsScreen: { icon: "🔕", label: "Notification Settings", description: "Push notification preferences",       tabName: "Home", screenName: "NotificationSettings" },
  CVPreviewScreen:            { icon: "📋", label: "My CV",                description: "Your athlete CV as scouts see it",     tabName: "Mastery", screenName: "CVPreview" },
  CVEditScreen:               { icon: "✏️", label: "Edit CV",              description: "Update your CV fields",                tabName: "Mastery", screenName: "CVEdit" },
  WearableSettingsScreen:     { icon: "⌚", label: "Wearable",             description: "Connect or manage your wearable",      tabName: "Output", screenName: "WearableSettings" },
  AppSettingsScreen:          { icon: "⚙️", label: "App Settings",         description: "Language, units, and theme",           tabName: "Home", screenName: "AppSettings" },
  TestHistoryScreen:          { icon: "📈", label: "Test History",          description: "All your test results over time",     tabName: "Output", screenName: "TestHistory" },
  DrillLibraryScreen:         { icon: "🏋️", label: "Drill Library",        description: "Browse and search all drills",         tabName: "Output", screenName: "DrillLibrary" },
  JournalHistoryScreen:       { icon: "📓", label: "Journal History",       description: "Past training reflections",           tabName: "Output", screenName: "JournalHistory" },
  AchievementsScreen:         { icon: "🥇", label: "Achievements",         description: "Milestones and personal records",     tabName: "Mastery", screenName: "Achievements" },
  SleepDetailScreen:          { icon: "😴", label: "Sleep Data",            description: "Your sleep history and trends",       tabName: "Output", screenName: "SleepDetail" },
  GoalsScreen:                { icon: "🎯", label: "Goals",                description: "Your performance goals",               tabName: "Output", screenName: "Goals" },
  InjuryLogScreen:            { icon: "🛡️", label: "Injury Log",           description: "Your injury history and status",       tabName: "Output", screenName: "InjuryLog" },
  NutritionLogScreen:         { icon: "🍎", label: "Nutrition",            description: "Your nutrition and meal log",          tabName: "Output", screenName: "NutritionLog" },
};

/**
 * Resolve a DeepNavAction into a NavigateCardPayload for the chat response.
 */
export function resolveNavigation(action: DeepNavAction): NavigateCardPayload {
  const meta = SCREEN_META[action.screen];
  if (!meta) {
    logger.warn("[deep-nav] Unknown screen", { screen: action.screen });
    return {
      type: "navigation_capsule",
      icon: "🔗",
      label: action.screen,
      description: "Navigate to screen",
      target: action.screen,
      deepLink: { tabName: "Home" },
    };
  }

  return {
    type: "navigation_capsule",
    icon: meta.icon,
    label: meta.label,
    description: meta.description,
    target: meta.screenName ?? meta.tabName,
    deepLink: {
      tabName: meta.tabName,
      screen: meta.screenName,
      params: action.params,
      highlight: action.highlight,
      autoOpen: action.autoOpen,
    },
  };
}

/**
 * Keyword → Screen mapping for natural language navigation.
 * Returns the best matching DeepNavAction for a message, or null if no match.
 */
export function resolveNavigationFromMessage(message: string): DeepNavAction | null {
  const lower = message.toLowerCase();

  // Ordered from most specific to least specific
  const patterns: Array<{ regex: RegExp; action: DeepNavAction }> = [
    // Settings & Preferences
    { regex: /\b(school hours?|school time)\b/, action: { screen: "ScheduleRulesScreen", highlight: "school_hours_field" } },
    { regex: /\b(sleep (time|schedule|window))\b/, action: { screen: "ScheduleRulesScreen", highlight: "sleep_field" } },
    { regex: /\b(schedule rules?|my rules)\b/, action: { screen: "ScheduleRulesScreen" } },
    { regex: /\b(notification settings?|push settings?|push notifications?)\b/, action: { screen: "NotificationSettingsScreen" } },
    { regex: /\b(notifications?|notification center|what's new)\b/, action: { screen: "NotificationCenterScreen" } },
    { regex: /\b(app settings?|language|units|imperial|metric|theme)\b/, action: { screen: "AppSettingsScreen" } },
    { regex: /\b(wearable|whoop|connect.*device|my device)\b/, action: { screen: "WearableSettingsScreen" } },

    // CV & Profile
    { regex: /\b(scout view|as a scout|cv preview)\b/, action: { screen: "CVPreviewScreen", params: { mode: "scout" } } },
    { regex: /\b(edit (my )?cv|update (my )?cv)\b/, action: { screen: "CVEditScreen" } },
    { regex: /\b(my cv|athlete cv|show cv)\b/, action: { screen: "CVPreviewScreen" } },
    { regex: /\b(my profile|edit profile|update profile)\b/, action: { screen: "ProfileScreen" } },

    // Data & History
    { regex: /\b(sleep data|sleep history|sleep trends?)\b/, action: { screen: "SleepDetailScreen", params: { range: "7d" } } },
    { regex: /\b(test history|all (my )?tests|past tests)\b/, action: { screen: "TestHistoryScreen" } },
    { regex: /\b(journal history|past journals?|my journals?|old journals?)\b/, action: { screen: "JournalHistoryScreen" } },
    { regex: /\b(achievements?|milestones?|personal records?)\b/, action: { screen: "AchievementsScreen" } },

    // Training & Drills
    { regex: /\b(drill library|browse drills?|search drills?|all drills?)\b/, action: { screen: "DrillLibraryScreen" } },
    { regex: /\b(strength (drills?|programs?))\b/, action: { screen: "DrillLibraryScreen", params: { category: "strength" } } },
    { regex: /\b(speed (drills?|programs?))\b/, action: { screen: "DrillLibraryScreen", params: { category: "speed" } } },
    { regex: /\b(agility (drills?|programs?))\b/, action: { screen: "DrillLibraryScreen", params: { category: "agility" } } },

    // Future screens (will be built in Phase 2)
    { regex: /\b(my goals?|set.*goal|goal tracker)\b/, action: { screen: "GoalsScreen" } },
    { regex: /\b(injury (log|history)|my injur(y|ies))\b/, action: { screen: "InjuryLogScreen" } },
    { regex: /\b(nutrition|meal log|food log|what i ate)\b/, action: { screen: "NutritionLogScreen" } },

    // Main tabs
    { regex: /\b(timeline|my calendar|my schedule)\b/, action: { screen: "TimelineScreen" } },
    { regex: /\b(output|my vitals|my metrics)\b/, action: { screen: "OutputScreen" } },
    { regex: /\b(mastery|my progress|dna card)\b/, action: { screen: "MasteryScreen" } },
    { regex: /\b(own it|for (me|you)|recommendations?)\b/, action: { screen: "OwnItScreen" } },
  ];

  for (const { regex, action } of patterns) {
    if (regex.test(lower)) {
      return action;
    }
  }

  return null;
}
