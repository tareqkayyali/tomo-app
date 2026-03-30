/**
 * Notification Center — module exports.
 *
 * Usage:
 *   import { createNotification, resolveByType } from '@/services/notifications';
 */

// Core engine
export {
  createNotification,
  resolveBySourceRef,
  resolveByType,
  markRead,
  markActed,
  dismiss,
  markAllRead,
  getNotifications,
  getUnreadCount,
} from './notificationEngine';

// Templates
export {
  NOTIFICATION_TEMPLATES,
  CATEGORY_COLORS,
  CATEGORY_PRIORITY,
  interpolate,
  type NotificationType,
  type NotificationCategory,
  type NotificationTemplate,
} from './notificationTemplates';

// Event-driven triggers
export { processDataEvent } from './notificationTriggers';

// Time-driven / scheduled triggers
export {
  triggerSessionNotifications,
  triggerStreakAtRisk,
  triggerRestDayReminder,
  triggerBedtimeReminder,
  triggerSmartCheckinReminder,
  triggerSnapshotNotifications,
  checkStudyTrainingConflict,
} from './scheduledTriggers';

// Context engine
export { adjustPriorityByContext, getTimeOfDayBoost } from './contextEngine';

// Push delivery
export { schedulePush, deliverQueuedPushes } from './pushDelivery';

// Expiry resolver
export { resolveByConditions, resolvePassedExams, runConditionExpiryCheck } from './expiryResolver';
