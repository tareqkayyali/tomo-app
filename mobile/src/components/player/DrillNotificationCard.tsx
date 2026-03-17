/**
 * DrillNotificationCard — Rich notification card for coach-assigned drills.
 *
 * Shows: coach name, programme, drill list with prescriptions,
 * "Add to schedule" + "Ask Tomo" action buttons.
 */

import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Alert } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { PlayerNotification, DrillAssignedNotifData } from '../../types/programme';
import { CATEGORY_COLORS, CATEGORY_LABELS } from '../../types/programme';
import { actOnNotification } from '../../services/api';
import type { ThemeColors } from '../../theme';

interface Props {
  notification: PlayerNotification;
  onActed: () => void;
  colors: ThemeColors;
}

export function DrillNotificationCard({ notification, onActed, colors }: Props) {
  const navigation = useNavigation<any>();
  const [loading, setLoading] = useState(false);
  const s = createStyles(colors);

  const data = notification.data as unknown as DrillAssignedNotifData;
  const isActed = notification.isActed;
  const isUnread = !notification.read;

  const handleAddToSchedule = async () => {
    if (isActed) return;
    Alert.alert(
      'Add all drills',
      `Add ${data.drillCount} drill${data.drillCount > 1 ? 's' : ''} from ${data.coachName} to your schedule?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Add all',
          onPress: async () => {
            setLoading(true);
            try {
              const result = await actOnNotification(notification.id, 'add_to_schedule');
              if (result.success) {
                onActed();
                Alert.alert(
                  'Added to schedule',
                  `${result.eventsAdded} training sessions added to your Timeline.`
                );
              }
            } catch (err: any) {
              Alert.alert('Error', err.message);
            } finally {
              setLoading(false);
            }
          },
        },
      ]
    );
  };

  const handleViewInChat = () => {
    const drillNames = data.drills
      .slice(0, 3)
      .map((d) => d.drillName)
      .join(', ');
    const chatPrompt = `My coach ${data.coachName} assigned me these drills: ${drillNames}. Can you explain what each drill involves and how I should approach them?`;

    navigation.navigate('FullChat', {
      preloadMessage: chatPrompt,
    });
  };

  return (
    <View style={[s.card, isUnread && s.unread, isActed && s.acted]}>
      {/* Header */}
      <View style={s.cardHeader}>
        <View style={s.coachRow}>
          <View style={s.coachAvatar}>
            <Text style={s.coachAvatarText}>
              {(data.coachName ?? 'C')
                .split(' ')
                .map((n) => n[0])
                .join('')
                .slice(0, 2)
                .toUpperCase()}
            </Text>
          </View>
          <View style={s.coachInfo}>
            <Text style={s.coachName}>{data.coachName}</Text>
            <Text style={s.notifMeta}>
              {data.drillCount} drill{data.drillCount > 1 ? 's' : ''} assigned ·{' '}
              {formatRelTime(notification.createdAt)}
            </Text>
          </View>
          {isActed ? (
            <View style={s.actedBadge}>
              <Text style={s.actedBadgeText}>Added</Text>
            </View>
          ) : isUnread ? (
            <View style={s.unreadDot} />
          ) : null}
        </View>
      </View>

      {/* Programme name */}
      <View style={s.programmeBanner}>
        <Text style={s.programmeLabel}>PROGRAMME</Text>
        <Text style={s.programmeName}>{data.programmeName}</Text>
      </View>

      {/* Drill list */}
      <View style={s.drillList}>
        {data.drills.map((drill, i) => {
          const catKey = drill.drillCategory as keyof typeof CATEGORY_COLORS;
          const color = CATEGORY_COLORS[catKey] ?? '#6B6B6B';
          const label = CATEGORY_LABELS[catKey] ?? drill.drillCategory;
          const dateStr = formatDateShort(drill.scheduledDate);

          return (
            <View key={i} style={[s.drillItem, { borderLeftColor: color }]}>
              {drill.isMandatory && (
                <View style={s.mandTag}>
                  <Text style={s.mandTagText}>Mandatory</Text>
                </View>
              )}
              <View style={s.drillItemHeader}>
                <View style={[s.catPill, { backgroundColor: color + '18' }]}>
                  <Text style={[s.catPillText, { color }]}>{label}</Text>
                </View>
                <Text style={s.drillDate}>{dateStr}</Text>
              </View>
              <Text style={s.drillName}>{drill.drillName}</Text>
              {/* Prescription row */}
              <View style={s.prescRow}>
                <Text style={s.prescItem}>{drill.sets} sets</Text>
                <Text style={s.prescDivider}>·</Text>
                <Text style={s.prescItem}>{drill.reps} reps</Text>
                <Text style={s.prescDivider}>·</Text>
                <Text style={s.prescItem}>RPE {drill.rpeTarget}</Text>
                <Text style={s.prescDivider}>·</Text>
                <Text style={s.prescItem}>
                  {Math.round(drill.restSeconds / 60)}min rest
                </Text>
                {drill.durationMin && (
                  <>
                    <Text style={s.prescDivider}>·</Text>
                    <Text style={s.prescItem}>{drill.durationMin}min total</Text>
                  </>
                )}
              </View>
              {drill.intensity ? (
                <Text style={s.intensityText}>{drill.intensity}</Text>
              ) : null}
              {drill.coachNotes ? (
                <View style={s.coachNoteBox}>
                  <Text style={s.coachNoteLabel}>Coach note</Text>
                  <Text style={s.coachNoteText}>{drill.coachNotes}</Text>
                </View>
              ) : null}
            </View>
          );
        })}
      </View>

      {/* Action buttons */}
      {!isActed ? (
        <View style={s.actionRow}>
          <TouchableOpacity style={s.chatBtn} onPress={handleViewInChat}>
            <Text style={s.chatBtnText}>Ask Tomo about these</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[s.addBtn, loading && { opacity: 0.6 }]}
            onPress={handleAddToSchedule}
            disabled={loading}
          >
            <Text style={s.addBtnText}>
              {loading ? 'Adding...' : 'Add to schedule'}
            </Text>
          </TouchableOpacity>
        </View>
      ) : (
        <TouchableOpacity style={s.viewScheduleBtn} onPress={handleViewInChat}>
          <Text style={s.viewScheduleBtnText}>View drill details in Tomo</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

// ── Helpers ──────────────────────────────────────────────────────

function formatDateShort(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

function formatRelTime(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  if (diff < 60000) return 'Just now';
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
  return `${Math.floor(diff / 86400000)}d ago`;
}

// ── Styles ──────────────────────────────────────────────────────

function createStyles(_colors: ThemeColors) {
  return StyleSheet.create({
    card: {
      backgroundColor: '#111',
      borderRadius: 14,
      borderWidth: 0.5,
      borderColor: '#1E1E1E',
      overflow: 'hidden',
    },
    unread: { borderColor: 'rgba(255,107,53,.3)' },
    acted: { opacity: 0.85 },
    cardHeader: { padding: 14, paddingBottom: 10 },
    coachRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    coachAvatar: {
      width: 36,
      height: 36,
      borderRadius: 10,
      backgroundColor: '#3498DB',
      alignItems: 'center',
      justifyContent: 'center',
      flexShrink: 0,
    },
    coachAvatarText: { fontSize: 13, fontFamily: 'Poppins_700Bold', color: '#FFF' },
    coachInfo: { flex: 1 },
    coachName: { fontSize: 13, fontFamily: 'Poppins_700Bold', color: '#FFF' },
    notifMeta: { fontSize: 10, fontFamily: 'Poppins_400Regular', color: '#6B6B6B', marginTop: 1 },
    unreadDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#FF6B35' },
    actedBadge: {
      backgroundColor: 'rgba(46,204,113,.12)',
      borderRadius: 5,
      paddingHorizontal: 8,
      paddingVertical: 3,
      borderWidth: 0.5,
      borderColor: 'rgba(46,204,113,.3)',
    },
    actedBadgeText: { fontSize: 9, fontFamily: 'Poppins_600SemiBold', color: '#2ECC71' },
    programmeBanner: {
      paddingHorizontal: 14,
      paddingBottom: 10,
      borderBottomWidth: 0.5,
      borderBottomColor: '#1E1E1E',
    },
    programmeLabel: {
      fontSize: 8,
      fontFamily: 'Poppins_600SemiBold',
      color: '#555',
      letterSpacing: 0.1,
      textTransform: 'uppercase',
      marginBottom: 2,
    },
    programmeName: { fontSize: 12, fontFamily: 'Poppins_600SemiBold', color: '#B0B0B0' },
    drillList: { padding: 10, gap: 8 },
    drillItem: {
      backgroundColor: '#0D0D0D',
      borderRadius: 9,
      padding: 10,
      borderLeftWidth: 3,
      position: 'relative',
    },
    mandTag: {
      position: 'absolute',
      top: 7,
      right: 8,
      backgroundColor: 'rgba(26,188,156,.12)',
      borderRadius: 4,
      paddingHorizontal: 6,
      paddingVertical: 2,
    },
    mandTagText: { fontSize: 8, fontFamily: 'Poppins_700Bold', color: '#1ABC9C' },
    drillItemHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 5,
    },
    catPill: { borderRadius: 4, paddingHorizontal: 7, paddingVertical: 2 },
    catPillText: { fontSize: 9, fontFamily: 'Poppins_700Bold' },
    drillDate: { fontSize: 10, fontFamily: 'Poppins_400Regular', color: '#555' },
    drillName: { fontSize: 13, fontFamily: 'Poppins_700Bold', color: '#FFF', marginBottom: 6 },
    prescRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 4, marginBottom: 4 },
    prescItem: { fontSize: 10, fontFamily: 'Poppins_600SemiBold', color: '#9B9B9B' },
    prescDivider: { fontSize: 10, color: '#3D3D3D' },
    intensityText: { fontSize: 10, fontFamily: 'Poppins_400Regular', color: '#6B6B6B', marginBottom: 4 },
    coachNoteBox: {
      backgroundColor: 'rgba(52,152,219,.08)',
      borderRadius: 6,
      padding: 7,
      marginTop: 4,
    },
    coachNoteLabel: {
      fontSize: 8,
      fontFamily: 'Poppins_700Bold',
      color: '#3498DB',
      letterSpacing: 0.08,
      marginBottom: 2,
    },
    coachNoteText: { fontSize: 10, fontFamily: 'Poppins_400Regular', color: '#9B9B9B', lineHeight: 15 },
    actionRow: {
      flexDirection: 'row',
      gap: 8,
      padding: 12,
      paddingTop: 6,
      borderTopWidth: 0.5,
      borderTopColor: '#1E1E1E',
    },
    chatBtn: {
      flex: 1,
      padding: 10,
      borderRadius: 8,
      borderWidth: 0.5,
      borderColor: '#2D2D2D',
      alignItems: 'center',
    },
    chatBtnText: { fontSize: 11, fontFamily: 'Poppins_500Medium', color: '#6B6B6B' },
    addBtn: {
      flex: 1.5,
      padding: 10,
      borderRadius: 8,
      backgroundColor: '#FF6B35',
      alignItems: 'center',
    },
    addBtnText: { fontSize: 11, fontFamily: 'Poppins_700Bold', color: '#FFF' },
    viewScheduleBtn: {
      margin: 12,
      marginTop: 6,
      padding: 10,
      borderRadius: 8,
      borderWidth: 0.5,
      borderColor: '#2D2D2D',
      alignItems: 'center',
    },
    viewScheduleBtnText: { fontSize: 11, fontFamily: 'Poppins_400Regular', color: '#6B6B6B' },
  });
}
