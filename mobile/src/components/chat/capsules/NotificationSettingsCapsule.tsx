/**
 * NotificationSettingsCapsule — Toggle notification preferences inline in chat.
 */
import React, { useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { colors } from '../../../theme/colors';
import { spacing, borderRadius, fontFamily } from '../../../theme';
import type { NotificationSettingsCapsule as NotificationSettingsCapsuleType, CapsuleAction } from '../../../types/chat';
import { CapsuleToggle } from './shared/CapsuleToggle';
import { PillSelector } from './shared/PillSelector';
import { CapsuleSubmitButton } from './shared/CapsuleSubmitButton';

interface Props {
  card: NotificationSettingsCapsuleType;
  onSubmit: (action: CapsuleAction) => void;
}

const REMINDER_TIMES = [
  { id: '06:00', label: '6am' },
  { id: '07:00', label: '7am' },
  { id: '08:00', label: '8am' },
  { id: '09:00', label: '9am' },
  { id: '20:00', label: '8pm' },
  { id: '21:00', label: '9pm' },
];

export function NotificationSettingsCapsuleComponent({ card, onSubmit }: Props) {
  const c = card.current;
  const [dailyReminder, setDailyReminder] = useState(c.dailyReminder);
  const [reminderTime, setReminderTime] = useState(c.dailyReminderTime);
  const [streakReminders, setStreakReminders] = useState(c.streakReminders);
  const [milestoneAlerts, setMilestoneAlerts] = useState(c.milestoneAlerts);
  const [redDayGuidance, setRedDayGuidance] = useState(c.redDayGuidance);
  const [weeklySummary, setWeeklySummary] = useState(c.weeklySummary);

  const hasChanges = dailyReminder !== c.dailyReminder
    || reminderTime !== c.dailyReminderTime
    || streakReminders !== c.streakReminders
    || milestoneAlerts !== c.milestoneAlerts
    || redDayGuidance !== c.redDayGuidance
    || weeklySummary !== c.weeklySummary;

  const handleSave = () => {
    onSubmit({
      type: 'notification_settings_capsule',
      toolName: 'update_notification_settings',
      toolInput: {
        dailyReminder,
        dailyReminderTime: reminderTime,
        streakReminders,
        milestoneAlerts,
        redDayGuidance,
        weeklySummary,
      },
      agentType: 'output',
    });
  };

  return (
    <View style={styles.container}>
      <Text style={styles.heading}>Notification Settings</Text>
      <CapsuleToggle label="Daily Reminder" description="Morning check-in nudge" value={dailyReminder} onChange={setDailyReminder} />
      {dailyReminder && (
        <PillSelector options={REMINDER_TIMES} selected={reminderTime} onSelect={setReminderTime} label="Reminder Time" />
      )}
      <CapsuleToggle label="Streak Reminders" description="Don't break your streak!" value={streakReminders} onChange={setStreakReminders} />
      <CapsuleToggle label="Milestone Alerts" description="Celebrate achievements" value={milestoneAlerts} onChange={setMilestoneAlerts} />
      <CapsuleToggle label="Red Day Guidance" description="Recovery alerts on low readiness" value={redDayGuidance} onChange={setRedDayGuidance} />
      <CapsuleToggle label="Weekly Summary" description="Performance recap every Sunday" value={weeklySummary} onChange={setWeeklySummary} />
      <CapsuleSubmitButton title="Save Settings" disabled={!hasChanges} onPress={handleSave} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { backgroundColor: colors.backgroundElevated, borderRadius: borderRadius.lg, padding: spacing.md, gap: spacing.sm },
  heading: { fontFamily: fontFamily.semiBold, fontSize: 16, color: colors.textPrimary },
});
