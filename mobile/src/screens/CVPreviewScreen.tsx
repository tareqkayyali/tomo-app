/**
 * CVPreviewScreen — Generates and exports the CV as PDF or share link.
 * Uses expo-print for PDF generation (no WebView dependency).
 * Shows loading state while HTML is fetched, then allows Download PDF / Share.
 */

import React, { useState, useCallback, useEffect } from 'react';
import {
  View, Text, TouchableOpacity, ActivityIndicator, SafeAreaView,
  StyleSheet, Platform, Alert, Share, ScrollView,
} from 'react-native';
import { SmartIcon } from '../components/SmartIcon';
import { TomoLoader } from '../components/TomoLoader';

const CV_LOADER_MESSAGES = [
  { title: 'Building Your CV', subtitle: 'Compiling your athlete profile...', icon: 'person-circle-outline' as const },
  { title: 'Adding Performance Data', subtitle: 'Pulling your test results...', icon: 'stats-chart-outline' as const },
  { title: 'Almost Ready', subtitle: 'Your CV is nearly complete...', icon: 'document-text-outline' as const },
];
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { useTheme } from '../hooks/useTheme';
import { API_BASE_URL } from '../services/apiConfig';
import { getIdToken } from '../services/auth';
import { fontFamily } from '../theme';

async function authHeaders(): Promise<Record<string, string>> {
  const token = await getIdToken();
  return token ? { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } : { 'Content-Type': 'application/json' };
}

interface Props {
  cvType?: 'club' | 'university';
  onBack?: () => void;
}

export function CVPreviewScreen({ cvType = 'club', onBack }: Props) {
  const { colors } = useTheme();
  const [html, setHtml] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isExporting, setIsExporting] = useState(false);
  const [exportStatus, setExportStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Fetch CV HTML on mount
  const fetchHTML = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const headers = await authHeaders();
      const res = await fetch(`${API_BASE_URL}/api/v1/cv/export`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ cv_type: cvType, format: 'pdf_html' }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setHtml(data.html);
    } catch (err) {
      setError(String(err));
    }
    setIsLoading(false);
  }, [cvType]);

  useEffect(() => { fetchHTML(); }, [fetchHTML]);

  // Download PDF
  const handleDownloadPDF = useCallback(async () => {
    if (!html) return;
    setIsExporting(true);
    setExportStatus('Generating PDF...');
    try {
      const { uri } = await Print.printToFileAsync({ html, base64: false });
      setExportStatus('PDF ready');

      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, {
          mimeType: 'application/pdf',
          dialogTitle: 'Save your Player CV',
          UTI: 'com.adobe.pdf',
        });
        setExportStatus('PDF shared');
      } else {
        const msg = 'PDF saved successfully';
        if (Platform.OS === 'web') window.alert(msg);
        else Alert.alert('Success', msg);
      }
    } catch (err) {
      setExportStatus(null);
      const msg = 'Failed to generate PDF';
      if (Platform.OS === 'web') window.alert(msg);
      else Alert.alert('Error', msg);
    }
    setIsExporting(false);
  }, [html]);

  // Share link
  const handleShareLink = useCallback(async () => {
    setIsExporting(true);
    setExportStatus('Creating share link...');
    try {
      const headers = await authHeaders();
      const res = await fetch(`${API_BASE_URL}/api/v1/cv/export`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ cv_type: cvType, format: 'share_link' }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();

      if (Platform.OS === 'web') {
        await navigator.clipboard?.writeText(data.url);
        window.alert('Share link copied to clipboard!');
      } else {
        await Share.share({ message: `Check out my Player CV: ${data.url}`, title: 'My Player CV' });
      }
      setExportStatus('Link shared');
    } catch (err) {
      setExportStatus(null);
      const msg = 'Failed to generate share link';
      if (Platform.OS === 'web') window.alert(msg);
      else Alert.alert('Error', msg);
    }
    setIsExporting(false);
  }, [cvType]);

  return (
    <SafeAreaView style={[s.safe, { backgroundColor: colors.background }]}>
      {/* Top bar */}
      <View style={[s.topBar, { borderBottomColor: colors.border }]}>
        {onBack && (
          <TouchableOpacity onPress={onBack} style={s.backBtn}>
            <SmartIcon name="arrow-back" size={20} color={colors.textPrimary} />
          </TouchableOpacity>
        )}
        <Text style={[s.topTitle, { color: colors.textPrimary }]}>
          {cvType === 'university' ? 'University CV' : 'Club CV'} Export
        </Text>
        <View style={{ width: 28 }} />
      </View>

      <ScrollView contentContainerStyle={s.content}>
        {/* Status area */}
        {isLoading ? (
          <View style={s.statusArea}>
            <TomoLoader messages={CV_LOADER_MESSAGES} />
          </View>
        ) : error ? (
          <View style={s.statusArea}>
            <SmartIcon name="alert-circle-outline" size={48} color={colors.error} />
            <Text style={[s.statusText, { color: colors.textSecondary }]}>Failed to load CV</Text>
            <TouchableOpacity style={[s.retryBtn, { borderColor: colors.accent }]} onPress={fetchHTML}>
              <Text style={{ color: colors.accent, fontFamily: fontFamily.semiBold, fontSize: 13 }}>Retry</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={s.statusArea}>
            <View style={[s.readyIcon, { backgroundColor: colors.accent + '15' }]}>
              <SmartIcon name="document-text" size={40} color={colors.accent} />
            </View>
            <Text style={[s.readyTitle, { color: colors.textPrimary }]}>Your CV is ready</Text>
            <Text style={[s.readySubtitle, { color: colors.textSecondary }]}>
              Download as PDF or generate a shareable link for scouts and recruiters
            </Text>

            {exportStatus && (
              <View style={[s.statusBadge, { backgroundColor: '#2ECC7115', borderColor: '#2ECC7125' }]}>
                <SmartIcon name="checkmark-circle" size={14} color="#2ECC71" />
                <Text style={{ color: '#2ECC71', fontFamily: fontFamily.medium, fontSize: 12 }}>{exportStatus}</Text>
              </View>
            )}
          </View>
        )}

        {/* Info cards */}
        {!isLoading && !error && (
          <View style={s.infoSection}>
            <View style={[s.infoCard, { backgroundColor: colors.backgroundElevated, borderColor: colors.border }]}>
              <SmartIcon name="download-outline" size={20} color={colors.accent} />
              <View style={{ flex: 1 }}>
                <Text style={[s.infoTitle, { color: colors.textPrimary }]}>PDF Download</Text>
                <Text style={[s.infoDesc, { color: colors.textSecondary }]}>
                  A4 format, print-ready. Send directly to clubs or attach to emails.
                </Text>
              </View>
            </View>
            <View style={[s.infoCard, { backgroundColor: colors.backgroundElevated, borderColor: colors.border }]}>
              <SmartIcon name="link-outline" size={20} color={colors.accent} />
              <View style={{ flex: 1 }}>
                <Text style={[s.infoTitle, { color: colors.textPrimary }]}>Shareable Link</Text>
                <Text style={[s.infoDesc, { color: colors.textSecondary }]}>
                  Live link that always shows your latest data. Track when scouts view it.
                </Text>
              </View>
            </View>
          </View>
        )}
      </ScrollView>

      {/* Bottom action bar */}
      {!isLoading && !error && (
        <View style={[s.bottomBar, { borderTopColor: colors.border }]}>
          <TouchableOpacity
            style={[s.actionBtn, { backgroundColor: colors.accent }]}
            onPress={handleDownloadPDF}
            disabled={isExporting}>
            {isExporting ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <>
                <SmartIcon name="download-outline" size={16} color="#fff" />
                <Text style={[s.actionText, { color: '#fff' }]}>Download PDF</Text>
              </>
            )}
          </TouchableOpacity>
          <TouchableOpacity
            style={[s.actionBtnOutline, { borderColor: colors.accent }]}
            onPress={handleShareLink}
            disabled={isExporting}>
            <SmartIcon name="link-outline" size={16} color={colors.accent} />
            <Text style={[s.actionText, { color: colors.accent }]}>Share Link</Text>
          </TouchableOpacity>
        </View>
      )}
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1 },
  topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 0.5 },
  backBtn: { padding: 4 },
  topTitle: { fontFamily: fontFamily.bold, fontSize: 16 },

  content: { flex: 1, paddingHorizontal: 20 },
  statusArea: { alignItems: 'center', justifyContent: 'center', paddingTop: 60, gap: 12 },
  statusText: { fontFamily: fontFamily.medium, fontSize: 14, marginTop: 8 },
  retryBtn: { marginTop: 12, paddingHorizontal: 20, paddingVertical: 10, borderRadius: 8, borderWidth: 1 },

  readyIcon: { width: 80, height: 80, borderRadius: 40, alignItems: 'center', justifyContent: 'center' },
  readyTitle: { fontFamily: fontFamily.bold, fontSize: 20, marginTop: 8 },
  readySubtitle: { fontFamily: fontFamily.regular, fontSize: 13, textAlign: 'center', maxWidth: 280, lineHeight: 19 },
  statusBadge: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, borderWidth: 0.5, marginTop: 8 },

  infoSection: { gap: 10, marginTop: 32 },
  infoCard: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, padding: 14, borderRadius: 12, borderWidth: 0.5 },
  infoTitle: { fontFamily: fontFamily.semiBold, fontSize: 13 },
  infoDesc: { fontFamily: fontFamily.regular, fontSize: 11, lineHeight: 16, marginTop: 2 },

  bottomBar: { flexDirection: 'row', gap: 10, paddingHorizontal: 16, paddingVertical: 12, borderTopWidth: 0.5 },
  actionBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 13, borderRadius: 8 },
  actionBtnOutline: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 13, borderRadius: 8, borderWidth: 1, backgroundColor: 'transparent' },
  actionText: { fontFamily: fontFamily.semiBold, fontSize: 13 },
});
