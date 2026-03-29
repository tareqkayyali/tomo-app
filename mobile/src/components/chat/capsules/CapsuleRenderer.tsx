/**
 * CapsuleRenderer — Dispatcher for all capsule card types.
 * Routes each capsule type to its specific component.
 */

import React from 'react';
import type { VisualCard, CapsuleAction } from '../../../types/chat';
import { TestLogCapsuleComponent } from './TestLogCapsule';
import { CheckinCapsuleComponent } from './CheckinCapsule';
import { NavigationCapsuleComponent } from './NavigationCapsule';
import { ProgramActionCapsuleComponent } from './ProgramActionCapsule';
import { EventEditCapsuleComponent } from './EventEditCapsule';
import { CVEditCapsuleComponent } from './CVEditCapsule';
import { DrillRatingCapsuleComponent } from './DrillRatingCapsule';
import { ScheduleRulesCapsuleComponent } from './ScheduleRulesCapsule';
import { TrainingScheduleCapsuleComponent } from './TrainingScheduleCapsule';
import { StudyScheduleCapsuleComponent } from './StudyScheduleCapsule';
import { ConflictResolutionCapsuleComponent } from './ConflictResolutionCapsule';
import { ProgramInteractCapsuleComponent } from './ProgramInteractCapsule';
import { GhostSuggestionCapsuleComponent } from './GhostSuggestionCapsule';
import { DayLockCapsuleComponent } from './DayLockCapsule';
import { WhoopSyncCapsuleComponent } from './WhoopSyncCapsule';
import { LeaderboardCapsuleComponent } from './LeaderboardCapsule';
import { PHVCalculatorCapsuleComponent } from './PHVCalculatorCapsule';
import { StrengthsGapsCapsuleComponent } from './StrengthsGapsCapsule';
import { PadelShotCapsuleComponent } from './PadelShotCapsule';
import { BlazePodsCapsuleComponent } from './BlazePodsCapsule';
import { NotificationSettingsCapsuleComponent } from './NotificationSettingsCapsule';
import { ExamCapsuleComponent } from './ExamCapsule';
import { SubjectCapsuleComponent } from './SubjectCapsule';
import { TrainingCategoryCapsuleComponent } from './TrainingCategoryCapsule';
import { BulkTimelineEditCapsuleComponent } from './BulkTimelineEditCapsule';
import { TrainingJournalPreCapsuleComponent } from './TrainingJournalPreCapsule';
import { TrainingJournalPostCapsuleComponent } from './TrainingJournalPostCapsule';

interface CapsuleRendererProps {
  card: VisualCard;
  onSubmit: (action: CapsuleAction) => void;
  onNavigate?: (deepLink: { tabName: string; params?: Record<string, any> }) => void;
}

export function CapsuleRenderer({ card, onSubmit, onNavigate }: CapsuleRendererProps) {
  switch (card.type) {
    case 'test_log_capsule':
      return <TestLogCapsuleComponent card={card} onSubmit={onSubmit} />;
    case 'checkin_capsule':
      return <CheckinCapsuleComponent card={card} onSubmit={onSubmit} />;
    case 'navigation_capsule':
      return <NavigationCapsuleComponent card={card} onNavigate={onNavigate} />;
    case 'program_action_capsule':
      return <ProgramActionCapsuleComponent card={card} onSubmit={onSubmit} />;
    case 'event_edit_capsule':
      return <EventEditCapsuleComponent card={card} onSubmit={onSubmit} />;
    case 'cv_edit_capsule':
      return <CVEditCapsuleComponent card={card} onSubmit={onSubmit} />;
    case 'drill_rating_capsule':
      return <DrillRatingCapsuleComponent card={card} onSubmit={onSubmit} />;
    case 'schedule_rules_capsule':
      return <ScheduleRulesCapsuleComponent card={card} onSubmit={onSubmit} />;
    case 'training_schedule_capsule':
      return <TrainingScheduleCapsuleComponent card={card} onSubmit={onSubmit} />;
    case 'study_schedule_capsule':
      return <StudyScheduleCapsuleComponent card={card} onSubmit={onSubmit} />;
    case 'conflict_resolution_capsule':
      return <ConflictResolutionCapsuleComponent card={card} onAction={(msg) => {
        onSubmit({ type: 'conflict_resolution_capsule', toolName: '__send_message__', toolInput: { message: msg }, agentType: 'timeline' });
      }} />;
    case 'program_interact_capsule':
      return <ProgramInteractCapsuleComponent card={card} onSubmit={onSubmit} />;
    case 'ghost_suggestion_capsule':
      return <GhostSuggestionCapsuleComponent card={card} onSubmit={onSubmit} />;
    case 'day_lock_capsule':
      return <DayLockCapsuleComponent card={card} onSubmit={onSubmit} />;
    case 'whoop_sync_capsule':
      return <WhoopSyncCapsuleComponent card={card} onSubmit={onSubmit} />;
    case 'leaderboard_capsule':
      return <LeaderboardCapsuleComponent card={card} />;
    case 'phv_calculator_capsule':
      return <PHVCalculatorCapsuleComponent card={card} onSubmit={onSubmit} />;
    case 'strengths_gaps_capsule':
      return <StrengthsGapsCapsuleComponent card={card} />;
    case 'padel_shot_capsule':
      return <PadelShotCapsuleComponent card={card} onSubmit={onSubmit} />;
    case 'blazepods_capsule':
      return <BlazePodsCapsuleComponent card={card} onSubmit={onSubmit} />;
    case 'notification_settings_capsule':
      return <NotificationSettingsCapsuleComponent card={card} onSubmit={onSubmit} />;
    case 'exam_capsule':
      return <ExamCapsuleComponent card={card} onSubmit={onSubmit} />;
    case 'subject_capsule':
      return <SubjectCapsuleComponent card={card} onSubmit={onSubmit} />;
    case 'training_category_capsule':
      return <TrainingCategoryCapsuleComponent card={card} onSubmit={onSubmit} />;
    case 'bulk_timeline_edit_capsule':
      return <BulkTimelineEditCapsuleComponent card={card} onSubmit={onSubmit} />;
    case 'training_journal_pre_capsule':
      return <TrainingJournalPreCapsuleComponent card={card} onSubmit={onSubmit} />;
    case 'training_journal_post_capsule':
      return <TrainingJournalPostCapsuleComponent card={card} onSubmit={onSubmit} />;
    default:
      return null;
  }
}

/** Check if a card type is a capsule */
export function isCapsuleCard(type: string): boolean {
  return [
    'test_log_capsule',
    'checkin_capsule',
    'program_action_capsule',
    'cv_edit_capsule',
    'navigation_capsule',
    'event_edit_capsule',
    'drill_rating_capsule',
    'schedule_rules_capsule',
    'training_schedule_capsule',
    'study_schedule_capsule',
    'conflict_resolution_capsule',
    'program_interact_capsule',
    'ghost_suggestion_capsule',
    'day_lock_capsule',
    'whoop_sync_capsule',
    'leaderboard_capsule',
    'phv_calculator_capsule',
    'strengths_gaps_capsule',
    'padel_shot_capsule',
    'blazepods_capsule',
    'notification_settings_capsule',
    'exam_capsule',
    'subject_capsule',
    'training_category_capsule',
    'bulk_timeline_edit_capsule',
    'training_journal_pre_capsule',
    'training_journal_post_capsule',
  ].includes(type);
}
