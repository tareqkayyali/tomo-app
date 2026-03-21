/**
 * PreviewScreen — Full component showcase for the CMS admin panel.
 * Shows representative UI components from ALL 5 tabs with current theme
 * colors applied. No auth or API calls required.
 *
 * Sections: Timeline · Output · Tomo Chat · Mastery · Own It · Shared
 */

import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, SafeAreaView, Pressable } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../hooks/useTheme';
import { fontFamily, spacing, borderRadius } from '../theme';

// ── Section Header ──

function SectionTitle({ icon, label, colors }: { icon: string; label: string; colors: any }) {
  return (
    <View style={[ss.sectionHeader, { borderBottomColor: colors.borderLight }]}>
      <Text style={[ss.sectionIcon]}>{icon}</Text>
      <Text style={[ss.sectionLabel, { color: colors.accent1 }]}>{label}</Text>
    </View>
  );
}

// ── Main ──

export function PreviewScreen() {
  const { colors } = useTheme();
  const [activeTab, setActiveTab] = useState(0);
  const tabs = ['All', 'Timeline', 'Output', 'Chat', 'Mastery', 'Own It'];

  return (
    <SafeAreaView style={[ss.root, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={ss.header}>
        <View>
          <Text style={[ss.headerSub, { color: colors.textMuted }]}>TOMO · THEME PREVIEW</Text>
          <Text style={[ss.headerTitle, { color: colors.textOnDark }]}>Component Showcase</Text>
        </View>
        <View style={ss.headerRight}>
          <View style={[ss.iconBtn, { backgroundColor: colors.glass, borderColor: colors.glassBorder }]}>
            <Ionicons name="notifications-outline" size={18} color={colors.textOnDark} />
          </View>
          <View style={[ss.iconBtn, { backgroundColor: colors.accent1 + '22', borderColor: colors.accent1 }]}>
            <Ionicons name="person" size={18} color={colors.accent1} />
          </View>
        </View>
      </View>

      {/* Tab filter */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={ss.tabRow} contentContainerStyle={ss.tabRowContent}>
        {tabs.map((t, i) => (
          <Pressable key={t} onPress={() => setActiveTab(i)} style={[ss.tab, activeTab === i && { borderBottomColor: colors.accent1, borderBottomWidth: 2 }]}>
            <Text style={[ss.tabText, { color: activeTab === i ? colors.accent1 : colors.textMuted }]}>{t}</Text>
          </Pressable>
        ))}
      </ScrollView>

      <ScrollView style={ss.scroll} contentContainerStyle={ss.scrollContent}>

        {/* ═══ TIMELINE TAB ═══ */}
        {(activeTab === 0 || activeTab === 1) && <>
          <SectionTitle icon="📅" label="Timeline" colors={colors} />

          {/* Calendar day strip */}
          <View style={[ss.card, { backgroundColor: colors.backgroundElevated }]}>
            <Text style={[ss.cardLabel, { color: colors.textMuted }]}>Calendar</Text>
            <View style={ss.dayStrip}>
              {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d, i) => (
                <View key={d} style={[ss.dayCell, i === 2 && { backgroundColor: colors.accent1, borderRadius: 12 }]}>
                  <Text style={[ss.dayName, { color: i === 2 ? '#FFF' : colors.textMuted }]}>{d}</Text>
                  <Text style={[ss.dayNum, { color: i === 2 ? '#FFF' : colors.textOnDark }]}>{18 + i}</Text>
                  {i === 2 && <View style={[ss.dayDot, { backgroundColor: '#FFF' }]} />}
                  {i === 4 && <View style={[ss.dayDot, { backgroundColor: colors.accent1 }]} />}
                </View>
              ))}
            </View>
          </View>

          {/* Event cards */}
          <View style={[ss.card, { backgroundColor: colors.backgroundElevated }]}>
            <Text style={[ss.cardLabel, { color: colors.textMuted }]}>Day Flow</Text>
            {[
              { time: '07:30', name: 'Morning Activation', type: 'training', color: colors.eventTraining },
              { time: '15:00', name: 'Speed & Agility', type: 'training', color: colors.eventTraining },
              { time: '17:30', name: 'League Match vs City FC', type: 'match', color: colors.eventMatch },
              { time: '19:30', name: 'Recovery Protocol', type: 'recovery', color: colors.eventRecovery },
              { time: '20:00', name: 'Math Study Block', type: 'study', color: colors.eventStudyBlock },
            ].map((ev, i) => (
              <View key={i} style={[ss.eventRow, { borderLeftColor: ev.color, borderLeftWidth: 3 }]}>
                <Text style={[ss.eventTime, { color: colors.textMuted }]}>{ev.time}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={[ss.eventName, { color: colors.textOnDark }]}>{ev.name}</Text>
                  <Text style={[ss.eventType, { color: ev.color }]}>{ev.type}</Text>
                </View>
              </View>
            ))}
          </View>

          {/* AI Insight card */}
          <View style={[ss.glassCard, { backgroundColor: colors.glass, borderColor: colors.glassBorder }]}>
            <View style={ss.insightHeader}>
              <Ionicons name="sparkles" size={16} color={colors.accent2} />
              <Text style={[ss.insightTitle, { color: colors.accent2 }]}>AI Insight</Text>
            </View>
            <Text style={[ss.insightBody, { color: colors.textOnDark }]}>
              Your ACWR is 1.3 — consider reducing intensity tomorrow. Recovery window optimal after 48h rest.
            </Text>
          </View>
        </>}

        {/* ═══ OUTPUT TAB ═══ */}
        {(activeTab === 0 || activeTab === 2) && <>
          <SectionTitle icon="⚡" label="Output" colors={colors} />

          {/* Readiness hero */}
          <View style={[ss.card, { backgroundColor: colors.backgroundElevated, alignItems: 'center' }]}>
            <Text style={[ss.cardLabel, { color: colors.textMuted, alignSelf: 'flex-start' }]}>Readiness</Text>
            <View style={[ss.readinessRing, { borderColor: colors.readinessGreen }]}>
              <Text style={[ss.readinessNum, { color: colors.readinessGreen }]}>85</Text>
              <Text style={[ss.readinessLabel, { color: colors.textMuted }]}>GREEN</Text>
            </View>
            <View style={ss.vitalsRow}>
              {[
                { label: 'Energy', val: '4/5', color: colors.readinessGreen },
                { label: 'Mood', val: '4/5', color: colors.readinessGreen },
                { label: 'Sleep', val: '8.2h', color: colors.readinessGreen },
                { label: 'Soreness', val: '2/5', color: colors.readinessYellow },
              ].map((v) => (
                <View key={v.label} style={ss.vitalChip}>
                  <Text style={[ss.vitalVal, { color: v.color }]}>{v.val}</Text>
                  <Text style={[ss.vitalLabel, { color: colors.textMuted }]}>{v.label}</Text>
                </View>
              ))}
            </View>
          </View>

          {/* Benchmark / Percentile bars */}
          <View style={[ss.card, { backgroundColor: colors.backgroundElevated }]}>
            <Text style={[ss.cardLabel, { color: colors.textMuted }]}>Benchmarks</Text>
            {[
              { label: '10m Sprint', pct: 78, zone: 'Good', zoneColor: '#2ECC71' },
              { label: 'CMJ Height', pct: 62, zone: 'Average', zoneColor: '#3498DB' },
              { label: 'Agility T-Test', pct: 45, zone: 'Developing', zoneColor: '#F39C12' },
              { label: 'Yo-Yo IR1', pct: 88, zone: 'Elite', zoneColor: '#27AE60' },
            ].map((m) => (
              <View key={m.label} style={ss.benchRow}>
                <View style={ss.benchHeader}>
                  <Text style={[ss.benchLabel, { color: colors.textOnDark }]}>{m.label}</Text>
                  <View style={[ss.zoneBadge, { backgroundColor: m.zoneColor + '22' }]}>
                    <Text style={[ss.zoneText, { color: m.zoneColor }]}>P{m.pct} · {m.zone}</Text>
                  </View>
                </View>
                <View style={[ss.barTrack, { backgroundColor: colors.glass }]}>
                  <View style={[ss.barFill, { width: `${m.pct}%`, backgroundColor: m.zoneColor }]} />
                  <View style={[ss.normMarker, { left: '50%' }]} />
                </View>
              </View>
            ))}
          </View>

          {/* Program card */}
          <View style={[ss.card, { backgroundColor: colors.backgroundElevated }]}>
            <Text style={[ss.cardLabel, { color: colors.textMuted }]}>Programs</Text>
            {[
              { name: 'Nordic Hamstring Protocol', cat: 'Injury Prevention', freq: '3x/week', priority: 'mandatory', priorityColor: '#FF453A' },
              { name: 'Sprint Development', cat: 'Speed', freq: '2x/week', priority: 'recommended', priorityColor: '#FF9500' },
              { name: 'ACL Prevention', cat: 'Injury Prevention', freq: '2x/week', priority: 'supplementary', priorityColor: '#2ECC71' },
            ].map((p) => (
              <View key={p.name} style={[ss.progCard, { borderLeftColor: p.priorityColor, borderLeftWidth: 3 }]}>
                <View style={ss.progHeader}>
                  <Text style={[ss.progName, { color: colors.textOnDark }]}>{p.name}</Text>
                  <View style={[ss.zoneBadge, { backgroundColor: p.priorityColor + '22' }]}>
                    <Text style={[ss.zoneText, { color: p.priorityColor }]}>{p.priority}</Text>
                  </View>
                </View>
                <Text style={[ss.progMeta, { color: colors.textMuted }]}>{p.cat} · {p.freq}</Text>
              </View>
            ))}
          </View>
        </>}

        {/* ═══ TOMO CHAT TAB ═══ */}
        {(activeTab === 0 || activeTab === 3) && <>
          <SectionTitle icon="💬" label="Tomo Chat" colors={colors} />

          <View style={[ss.card, { backgroundColor: colors.backgroundElevated }]}>
            <Text style={[ss.cardLabel, { color: colors.textMuted }]}>Conversation</Text>

            {/* AI message */}
            <View style={ss.chatRow}>
              <View style={[ss.agentBadge, { backgroundColor: colors.accent2 + '22' }]}>
                <Text style={[ss.agentText, { color: colors.accent2 }]}>Timeline Agent</Text>
              </View>
              <View style={[ss.chatBubbleAI, { backgroundColor: colors.glass, borderColor: colors.glassBorder }]}>
                <Text style={[ss.chatText, { color: colors.textOnDark }]}>
                  I've scheduled your Speed & Agility session for 3pm today. Want me to add a 15-min activation warmup before?
                </Text>
              </View>
              <Text style={[ss.chatTime, { color: colors.textMuted }]}>2:34 PM</Text>
            </View>

            {/* User message */}
            <View style={[ss.chatRowUser]}>
              <View style={[ss.chatBubbleUser, { backgroundColor: colors.accent1 + '22' }]}>
                <Text style={[ss.chatText, { color: colors.textOnDark }]}>Yes, add the warmup please</Text>
              </View>
              <Text style={[ss.chatTime, { color: colors.textMuted, textAlign: 'right' }]}>2:35 PM</Text>
            </View>

            {/* Suggestion chips */}
            <View style={ss.chipRow}>
              {['Show my week', 'Reschedule match', 'Add recovery'].map((c) => (
                <View key={c} style={[ss.chip, { backgroundColor: colors.accent1 + '15', borderColor: colors.accent1 + '40' }]}>
                  <Text style={[ss.chipText, { color: colors.accent1 }]}>{c}</Text>
                </View>
              ))}
            </View>

            {/* Confirmation card */}
            <View style={[ss.confirmCard, { backgroundColor: colors.accent1 + '10', borderColor: colors.accent1 + '30' }]}>
              <Text style={[ss.confirmTitle, { color: colors.accent1 }]}>Confirm Action</Text>
              <Text style={[ss.confirmBody, { color: colors.textOnDark }]}>Add Activation Warmup at 2:45 PM?</Text>
              <View style={ss.confirmActions}>
                <View style={[ss.confirmBtn, { backgroundColor: colors.accent1 }]}>
                  <Text style={ss.confirmBtnText}>Confirm</Text>
                </View>
                <View style={[ss.confirmBtnOutline, { borderColor: colors.textMuted }]}>
                  <Text style={[ss.confirmBtnOutlineText, { color: colors.textMuted }]}>Cancel</Text>
                </View>
              </View>
            </View>
          </View>
        </>}

        {/* ═══ MASTERY TAB ═══ */}
        {(activeTab === 0 || activeTab === 4) && <>
          <SectionTitle icon="🏆" label="Mastery" colors={colors} />

          {/* DNA Card mock */}
          <LinearGradient colors={[colors.accent1, colors.accent2]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={ss.dnaCard}>
            <View style={ss.dnaTop}>
              <View>
                <Text style={ss.dnaOvr}>OVR</Text>
                <Text style={ss.dnaScore}>78</Text>
              </View>
              <View style={ss.dnaBadges}>
                <View style={ss.dnaTierBadge}><Text style={ss.dnaTierText}>GOLD</Text></View>
                <View style={ss.dnaPosBadge}><Text style={ss.dnaPosText}>ST</Text></View>
              </View>
            </View>
            {/* Radar mock - hexagonal dots */}
            <View style={ss.radarMock}>
              {['PAC', 'SHO', 'PAS', 'DRI', 'DEF', 'PHY'].map((attr, i) => {
                const angle = (Math.PI / 3) * i - Math.PI / 2;
                const r = 40;
                const x = 50 + r * Math.cos(angle);
                const y = 45 + r * Math.sin(angle);
                return (
                  <View key={attr} style={[ss.radarLabel, { left: `${x - 8}%`, top: `${y - 6}%` }]}>
                    <Text style={ss.radarAttr}>{attr}</Text>
                    <Text style={ss.radarVal}>{[85, 72, 68, 80, 55, 74][i]}</Text>
                  </View>
                );
              })}
            </View>
          </LinearGradient>

          {/* Pillar cards */}
          <View style={[ss.card, { backgroundColor: colors.backgroundElevated }]}>
            <Text style={[ss.cardLabel, { color: colors.textMuted }]}>Mastery Pillars</Text>
            {[
              { emoji: '⚡', name: 'Speed & Power', pct: 75, badge: 'Strength', badgeColor: '#2ECC71' },
              { emoji: '🎯', name: 'Technical Skill', pct: 68, badge: 'Growth', badgeColor: '#F39C12' },
              { emoji: '🧠', name: 'Game Intelligence', pct: 72, badge: 'Strength', badgeColor: '#2ECC71' },
              { emoji: '💪', name: 'Physical Resilience', pct: 80, badge: 'Strength', badgeColor: '#2ECC71' },
              { emoji: '🔋', name: 'Endurance', pct: 55, badge: 'Growth', badgeColor: '#F39C12' },
            ].map((p) => (
              <View key={p.name} style={ss.pillarRow}>
                <Text style={ss.pillarEmoji}>{p.emoji}</Text>
                <View style={{ flex: 1 }}>
                  <View style={ss.pillarHeader}>
                    <Text style={[ss.pillarName, { color: colors.textOnDark }]}>{p.name}</Text>
                    <View style={[ss.zoneBadge, { backgroundColor: p.badgeColor + '22' }]}>
                      <Text style={[ss.zoneText, { color: p.badgeColor }]}>P{p.pct} · {p.badge}</Text>
                    </View>
                  </View>
                  <View style={[ss.barTrack, { backgroundColor: colors.glass }]}>
                    <View style={[ss.barFill, { width: `${p.pct}%`, backgroundColor: p.badgeColor }]} />
                  </View>
                </View>
              </View>
            ))}
          </View>

          {/* Streak */}
          <View style={[ss.card, { backgroundColor: colors.backgroundElevated, alignItems: 'center' }]}>
            <Text style={[ss.streakNum, { color: colors.accent1 }]}>12</Text>
            <Text style={[ss.streakLabel, { color: colors.textMuted }]}>DAY STREAK 🔥</Text>
          </View>
        </>}

        {/* ═══ OWN IT TAB ═══ */}
        {(activeTab === 0 || activeTab === 5) && <>
          <SectionTitle icon="⭐" label="Own It" colors={colors} />

          {/* Recommendation cards */}
          {[
            { type: 'READINESS', title: 'Rest Day Recommended', body: 'Your ACWR is 1.4 and climbing. Take a light day to avoid overtraining.', color: '#2ECC71', priority: 'P1', icon: 'shield-checkmark' as const },
            { type: 'LOAD_WARNING', title: 'Training Load Spike', body: 'Acute load 15% above chronic baseline. Reduce intensity in next session.', color: '#F39C12', priority: 'P2', icon: 'warning' as const },
            { type: 'DEVELOPMENT', title: 'Sprint PB Opportunity', body: 'Your 10m time has improved 8% this month. Test again this week.', color: colors.accent2, priority: 'P3', icon: 'trending-up' as const },
            { type: 'ACADEMIC', title: 'Exam in 5 Days', body: 'Math exam Friday. Study blocks auto-scheduled around training.', color: colors.accent2, priority: 'P3', icon: 'school' as const },
            { type: 'CV_OPPORTUNITY', title: 'Club Scout Viewed Profile', body: 'Arsenal Academy viewed your CV 2 hours ago.', color: '#3498DB', priority: 'P2', icon: 'eye' as const },
          ].map((r) => (
            <View key={r.title} style={[ss.recCard, { backgroundColor: colors.backgroundElevated, borderLeftColor: r.color, borderLeftWidth: 3 }]}>
              <View style={ss.recHeader}>
                <Ionicons name={r.icon} size={18} color={r.color} />
                <Text style={[ss.recType, { color: r.color }]}>{r.type.replace(/_/g, ' ')}</Text>
                <View style={[ss.priorityBadge, { backgroundColor: r.color + '22' }]}>
                  <Text style={[ss.priorityText, { color: r.color }]}>{r.priority}</Text>
                </View>
              </View>
              <Text style={[ss.recTitle, { color: colors.textOnDark }]}>{r.title}</Text>
              <Text style={[ss.recBody, { color: colors.textMuted }]}>{r.body}</Text>
            </View>
          ))}

          {/* Dual load bar */}
          <View style={[ss.card, { backgroundColor: colors.backgroundElevated }]}>
            <Text style={[ss.cardLabel, { color: colors.textMuted }]}>Dual Load Index</Text>
            <View style={ss.loadRow}>
              <Text style={[ss.loadLabel, { color: colors.accent1 }]}>Athletic</Text>
              <View style={[ss.barTrack, { backgroundColor: colors.glass, flex: 1 }]}>
                <View style={[ss.barFill, { width: '72%', backgroundColor: colors.accent1 }]} />
              </View>
              <Text style={[ss.loadVal, { color: colors.textOnDark }]}>72</Text>
            </View>
            <View style={ss.loadRow}>
              <Text style={[ss.loadLabel, { color: colors.accent2 }]}>Academic</Text>
              <View style={[ss.barTrack, { backgroundColor: colors.glass, flex: 1 }]}>
                <View style={[ss.barFill, { width: '58%', backgroundColor: colors.accent2 }]} />
              </View>
              <Text style={[ss.loadVal, { color: colors.textOnDark }]}>58</Text>
            </View>
          </View>
        </>}

        {/* ═══ SHARED COMPONENTS ═══ */}
        {activeTab === 0 && <>
          <SectionTitle icon="🎨" label="Shared Components" colors={colors} />

          {/* Gradient button */}
          <LinearGradient colors={[colors.accent1, colors.accent2]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={ss.gradBtn}>
            <Text style={ss.gradBtnText}>Gradient Button</Text>
          </LinearGradient>

          {/* Color swatches */}
          <View style={[ss.card, { backgroundColor: colors.backgroundElevated }]}>
            <Text style={[ss.cardLabel, { color: colors.textMuted }]}>Accent Palette</Text>
            <View style={ss.swatchRow}>
              {[
                { label: 'Accent 1', color: colors.accent1 },
                { label: 'Accent 2', color: colors.accent2 },
                { label: 'A1 Dark', color: colors.accent1Dark },
                { label: 'A1 Light', color: colors.accent1Light },
                { label: 'A2 Dark', color: colors.accent2Dark },
                { label: 'A2 Light', color: colors.accent2Light },
              ].map((s) => (
                <View key={s.label} style={ss.swatchItem}>
                  <View style={[ss.swatch, { backgroundColor: s.color }]} />
                  <Text style={[ss.swatchLabel, { color: colors.textMuted }]}>{s.label}</Text>
                </View>
              ))}
            </View>
          </View>

          {/* Typography */}
          <View style={[ss.card, { backgroundColor: colors.backgroundElevated }]}>
            <Text style={[ss.cardLabel, { color: colors.textMuted }]}>Typography Scale</Text>
            <Text style={[{ fontFamily: fontFamily.bold, fontSize: 36, letterSpacing: -0.72, color: colors.textOnDark }]}>Display 36</Text>
            <Text style={[{ fontFamily: fontFamily.bold, fontSize: 24, letterSpacing: -0.48, color: colors.textOnDark }]}>Heading 1</Text>
            <Text style={[{ fontFamily: fontFamily.semiBold, fontSize: 18, color: colors.textOnDark }]}>Heading 2</Text>
            <Text style={[{ fontFamily: fontFamily.medium, fontSize: 16, color: colors.textOnDark }]}>Body Large</Text>
            <Text style={[{ fontFamily: fontFamily.regular, fontSize: 14, color: colors.textOnDark }]}>Body Regular</Text>
            <Text style={[{ fontFamily: fontFamily.light, fontSize: 12, color: colors.textMuted }]}>Caption Light</Text>
            <Text style={[{ fontFamily: fontFamily.semiBold, fontSize: 10, letterSpacing: 0.8, textTransform: 'uppercase', color: colors.accent1 }]}>BUTTON LABEL</Text>
          </View>

          {/* Event colors */}
          <View style={[ss.card, { backgroundColor: colors.backgroundElevated }]}>
            <Text style={[ss.cardLabel, { color: colors.textMuted }]}>Event Colors</Text>
            <View style={ss.chipRow}>
              {[
                { l: 'Training', c: colors.eventTraining },
                { l: 'Match', c: colors.eventMatch },
                { l: 'Recovery', c: colors.eventRecovery },
                { l: 'Study', c: colors.eventStudyBlock },
                { l: 'Exam', c: colors.eventExam },
              ].map((e) => (
                <View key={e.l} style={[ss.chip, { backgroundColor: e.c + '22', borderColor: e.c + '40' }]}>
                  <View style={[ss.chipDot, { backgroundColor: e.c }]} />
                  <Text style={[ss.chipText, { color: e.c }]}>{e.l}</Text>
                </View>
              ))}
            </View>
          </View>

          {/* Readiness states */}
          <View style={[ss.card, { backgroundColor: colors.backgroundElevated }]}>
            <Text style={[ss.cardLabel, { color: colors.textMuted }]}>Readiness States</Text>
            <View style={ss.chipRow}>
              {[
                { l: 'Green', c: colors.readinessGreen },
                { l: 'Yellow', c: colors.readinessYellow },
                { l: 'Red', c: colors.readinessRed },
              ].map((s) => (
                <View key={s.l} style={[ss.chip, { backgroundColor: s.c + '22', borderColor: s.c + '40' }]}>
                  <View style={[ss.chipDot, { backgroundColor: s.c }]} />
                  <Text style={[ss.chipText, { color: s.c }]}>{s.l}</Text>
                </View>
              ))}
            </View>
          </View>

          {/* Glass surface */}
          <View style={[ss.glassCard, { backgroundColor: colors.glass, borderColor: colors.glassBorder }]}>
            <Text style={[ss.cardLabel, { color: colors.textMuted }]}>Glass Surface</Text>
            <Text style={[{ fontFamily: fontFamily.regular, fontSize: 13, color: colors.textOnDark }]}>
              This card uses glass + glassBorder colors. Used for overlays, sheets, and elevated containers.
            </Text>
          </View>
        </>}

        <View style={{ height: 80 }} />
      </ScrollView>

      {/* Bottom Tab Bar */}
      <View style={[ss.tabBar, { backgroundColor: colors.backgroundElevated, borderTopColor: colors.borderLight }]}>
        {[
          { icon: 'calendar-outline' as const, label: 'Timeline' },
          { icon: 'flash-outline' as const, label: 'Output' },
          { icon: 'chatbubble-outline' as const, label: 'Tomo', active: true },
          { icon: 'stats-chart-outline' as const, label: 'Mastery' },
          { icon: 'star-outline' as const, label: 'Own It' },
        ].map((t) => (
          <View key={t.label} style={ss.tabBarItem}>
            {t.active ? (
              <LinearGradient colors={[colors.accent1, colors.accent2]} style={ss.centerTab}>
                <Ionicons name={t.icon} size={20} color="#FFF" />
              </LinearGradient>
            ) : (
              <Ionicons name={t.icon} size={22} color={colors.textInactive} />
            )}
            <Text style={[ss.tabBarLabel, { color: t.active ? colors.accent1 : colors.textInactive }]}>{t.label}</Text>
          </View>
        ))}
      </View>
    </SafeAreaView>
  );
}

// ── Styles ──

const ss = StyleSheet.create({
  root: { flex: 1 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingTop: 12, paddingBottom: 8 },
  headerSub: { fontFamily: fontFamily.medium, fontSize: 9, letterSpacing: 1.5, textTransform: 'uppercase' },
  headerTitle: { fontFamily: fontFamily.bold, fontSize: 22, marginTop: 1 },
  headerRight: { flexDirection: 'row', gap: 8 },
  iconBtn: { width: 34, height: 34, borderRadius: 17, justifyContent: 'center', alignItems: 'center', borderWidth: 1 },

  tabRow: { maxHeight: 36, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.06)' },
  tabRowContent: { paddingHorizontal: 12, gap: 0 },
  tab: { paddingHorizontal: 12, paddingVertical: 8 },
  tabText: { fontFamily: fontFamily.medium, fontSize: 12 },

  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: 16, gap: 12, paddingTop: 12 },

  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 8, borderBottomWidth: 1, marginTop: 8 },
  sectionIcon: { fontSize: 16 },
  sectionLabel: { fontFamily: fontFamily.bold, fontSize: 14, letterSpacing: 0.5, textTransform: 'uppercase' },

  card: { borderRadius: 16, padding: 14 },
  glassCard: { borderRadius: 16, padding: 14, borderWidth: 1 },
  cardLabel: { fontFamily: fontFamily.semiBold, fontSize: 10, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 10 },

  // Calendar
  dayStrip: { flexDirection: 'row', justifyContent: 'space-between' },
  dayCell: { alignItems: 'center', paddingVertical: 6, paddingHorizontal: 6, width: 38 },
  dayName: { fontFamily: fontFamily.medium, fontSize: 9 },
  dayNum: { fontFamily: fontFamily.semiBold, fontSize: 14, marginTop: 2 },
  dayDot: { width: 4, height: 4, borderRadius: 2, marginTop: 3 },

  // Events
  eventRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8, paddingLeft: 10, borderRadius: 8, marginBottom: 4 },
  eventTime: { fontFamily: fontFamily.medium, fontSize: 11, width: 42 },
  eventName: { fontFamily: fontFamily.semiBold, fontSize: 13 },
  eventType: { fontFamily: fontFamily.medium, fontSize: 10, textTransform: 'capitalize', marginTop: 1 },

  // Insight
  insightHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 },
  insightTitle: { fontFamily: fontFamily.semiBold, fontSize: 12 },
  insightBody: { fontFamily: fontFamily.regular, fontSize: 12, lineHeight: 18 },

  // Readiness
  readinessRing: { width: 100, height: 100, borderRadius: 50, borderWidth: 4, justifyContent: 'center', alignItems: 'center', marginVertical: 8 },
  readinessNum: { fontFamily: fontFamily.bold, fontSize: 36 },
  readinessLabel: { fontFamily: fontFamily.semiBold, fontSize: 10, letterSpacing: 1 },
  vitalsRow: { flexDirection: 'row', gap: 12, marginTop: 8 },
  vitalChip: { alignItems: 'center' },
  vitalVal: { fontFamily: fontFamily.semiBold, fontSize: 14 },
  vitalLabel: { fontFamily: fontFamily.regular, fontSize: 9, marginTop: 1 },

  // Benchmarks
  benchRow: { marginBottom: 12 },
  benchHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  benchLabel: { fontFamily: fontFamily.medium, fontSize: 13 },
  zoneBadge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 8 },
  zoneText: { fontFamily: fontFamily.semiBold, fontSize: 10 },
  barTrack: { height: 6, borderRadius: 3, overflow: 'hidden', position: 'relative' },
  barFill: { height: '100%', borderRadius: 3 },
  normMarker: { position: 'absolute', top: -1, width: 2, height: 8, backgroundColor: 'rgba(255,255,255,0.5)', borderRadius: 1 },

  // Programs
  progCard: { paddingVertical: 8, paddingLeft: 10, borderRadius: 8, marginBottom: 6 },
  progHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  progName: { fontFamily: fontFamily.semiBold, fontSize: 13, flex: 1 },
  progMeta: { fontFamily: fontFamily.regular, fontSize: 11, marginTop: 2 },

  // Chat
  chatRow: { marginBottom: 10 },
  chatRowUser: { alignItems: 'flex-end', marginBottom: 10 },
  agentBadge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 8, alignSelf: 'flex-start', marginBottom: 4 },
  agentText: { fontFamily: fontFamily.semiBold, fontSize: 10, letterSpacing: 0.3 },
  chatBubbleAI: { borderRadius: 16, borderTopLeftRadius: 4, padding: 12, borderWidth: 1, maxWidth: '85%' },
  chatBubbleUser: { borderRadius: 16, borderTopRightRadius: 4, padding: 12, maxWidth: '80%' },
  chatText: { fontFamily: fontFamily.regular, fontSize: 13, lineHeight: 19 },
  chatTime: { fontFamily: fontFamily.regular, fontSize: 9, marginTop: 3 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 6 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 12, borderWidth: 1 },
  chipDot: { width: 6, height: 6, borderRadius: 3 },
  chipText: { fontFamily: fontFamily.medium, fontSize: 11 },
  confirmCard: { borderRadius: 12, padding: 12, borderWidth: 1, marginTop: 8 },
  confirmTitle: { fontFamily: fontFamily.semiBold, fontSize: 12, marginBottom: 4 },
  confirmBody: { fontFamily: fontFamily.regular, fontSize: 13, marginBottom: 10 },
  confirmActions: { flexDirection: 'row', gap: 8 },
  confirmBtn: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 10 },
  confirmBtnText: { fontFamily: fontFamily.semiBold, fontSize: 12, color: '#FFF' },
  confirmBtnOutline: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 10, borderWidth: 1 },
  confirmBtnOutlineText: { fontFamily: fontFamily.medium, fontSize: 12 },

  // DNA Card
  dnaCard: { borderRadius: 24, padding: 16, minHeight: 200 },
  dnaTop: { flexDirection: 'row', justifyContent: 'space-between' },
  dnaOvr: { fontFamily: fontFamily.semiBold, fontSize: 11, color: 'rgba(255,255,255,0.7)', letterSpacing: 2 },
  dnaScore: { fontFamily: fontFamily.bold, fontSize: 48, color: '#FFF' },
  dnaBadges: { alignItems: 'flex-end', gap: 4 },
  dnaTierBadge: { backgroundColor: 'rgba(255,255,255,0.2)', paddingHorizontal: 10, paddingVertical: 3, borderRadius: 8 },
  dnaTierText: { fontFamily: fontFamily.bold, fontSize: 11, color: '#FFF', letterSpacing: 1 },
  dnaPosBadge: { backgroundColor: 'rgba(0,0,0,0.3)', paddingHorizontal: 10, paddingVertical: 3, borderRadius: 8 },
  dnaPosText: { fontFamily: fontFamily.bold, fontSize: 12, color: '#FFF', letterSpacing: 1 },
  radarMock: { height: 120, position: 'relative', marginTop: 4 },
  radarLabel: { position: 'absolute', alignItems: 'center' },
  radarAttr: { fontFamily: fontFamily.bold, fontSize: 9, color: 'rgba(255,255,255,0.8)', letterSpacing: 0.5 },
  radarVal: { fontFamily: fontFamily.semiBold, fontSize: 12, color: '#FFF' },

  // Pillars
  pillarRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12 },
  pillarEmoji: { fontSize: 20 },
  pillarHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  pillarName: { fontFamily: fontFamily.semiBold, fontSize: 13 },

  // Streak
  streakNum: { fontFamily: fontFamily.bold, fontSize: 48 },
  streakLabel: { fontFamily: fontFamily.semiBold, fontSize: 12, letterSpacing: 1 },

  // Own It recs
  recCard: { borderRadius: 14, padding: 14, marginBottom: 4 },
  recHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 },
  recType: { fontFamily: fontFamily.semiBold, fontSize: 10, letterSpacing: 0.5, flex: 1 },
  priorityBadge: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 },
  priorityText: { fontFamily: fontFamily.bold, fontSize: 9 },
  recTitle: { fontFamily: fontFamily.semiBold, fontSize: 14, marginBottom: 3 },
  recBody: { fontFamily: fontFamily.regular, fontSize: 12, lineHeight: 17 },

  // Load bars
  loadRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  loadLabel: { fontFamily: fontFamily.semiBold, fontSize: 11, width: 60 },
  loadVal: { fontFamily: fontFamily.semiBold, fontSize: 13, width: 24, textAlign: 'right' },

  // Swatches
  swatchRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  swatchItem: { alignItems: 'center', gap: 4 },
  swatch: { width: 36, height: 36, borderRadius: 10 },
  swatchLabel: { fontFamily: fontFamily.medium, fontSize: 8 },

  // Gradient button
  gradBtn: { borderRadius: 20, paddingVertical: 14, alignItems: 'center' },
  gradBtnText: { fontFamily: fontFamily.semiBold, fontSize: 15, color: '#FFF', letterSpacing: 0.5 },

  // Tab bar
  tabBar: { flexDirection: 'row', borderTopWidth: 1, paddingVertical: 6, paddingBottom: 16 },
  tabBarItem: { flex: 1, alignItems: 'center', gap: 2 },
  tabBarLabel: { fontFamily: fontFamily.medium, fontSize: 9 },
  centerTab: { width: 40, height: 40, borderRadius: 14, justifyContent: 'center', alignItems: 'center', marginTop: -12 },
});
