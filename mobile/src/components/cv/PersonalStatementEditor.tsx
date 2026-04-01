/**
 * PersonalStatementEditor — AI-drafted personal statement with approve/edit/regenerate workflow.
 * Uses GradientButton for all actions.
 */

import React, { useState, useCallback } from 'react';
import { View, Text, TextInput, ActivityIndicator, Platform, Alert } from 'react-native';
import { SmartIcon } from '../SmartIcon';
import { useTheme } from '../../hooks/useTheme';
import { GradientButton } from '../GradientButton';
import { API_BASE_URL } from '../../services/apiConfig';
import { getIdToken } from '../../services/auth';
import { fontFamily } from '../../theme';

async function authHeaders(): Promise<Record<string, string>> {
  const token = await getIdToken();
  return token ? { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } : { 'Content-Type': 'application/json' };
}

interface Props {
  statement: string | null;
  statementStatus: string;
  lastGenerated: string | null;
  cvType: 'club' | 'university';
  onApprove: () => void;
  onSaveEdit: (text: string) => void;
  onRefetch: () => void;
}

export function PersonalStatementEditor({
  statement, statementStatus, lastGenerated, cvType, onApprove, onSaveEdit, onRefetch,
}: Props) {
  const { colors } = useTheme();
  const [isEditing, setIsEditing] = useState(false);
  const [editText, setEditText] = useState(statement ?? '');
  const [isGenerating, setIsGenerating] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  const handleRegenerate = useCallback(async () => {
    setIsGenerating(true);
    setFeedback(null);
    try {
      const headers = await authHeaders();
      const res = await fetch(`${API_BASE_URL}/api/v1/cv/regenerate-statement`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ cv_type: cvType, force: true }),
      });
      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}));
        throw new Error(errBody.detail || errBody.error || `HTTP ${res.status}`);
      }
      const data = await res.json();

      // Check if anything was actually generated
      const generated = data.generated ?? {};
      const anyGenerated = Object.values(generated).some(Boolean);

      if (anyGenerated) {
        setFeedback(null);
        onRefetch();
      } else {
        setFeedback('Not enough data yet — log more sessions and tests to generate your statement');
      }
    } catch (err: any) {
      const msg = err?.message || 'Failed to generate statement';
      setFeedback(msg);
      if (Platform.OS === 'web') window.alert(msg);
      else Alert.alert('Error', msg);
    }
    setIsGenerating(false);
  }, [cvType, onRefetch]);

  const handleSaveEdit = useCallback(() => {
    if (editText.trim()) {
      onSaveEdit(editText.trim());
      setIsEditing(false);
    }
  }, [editText, onSaveEdit]);

  // ── Empty state ──
  if (!statement) {
    return (
      <View>
        <Text style={{ color: colors.textDisabled, fontFamily: fontFamily.regular, fontSize: 12, textAlign: 'center', marginBottom: 10 }}>
          AI will generate your {cvType === 'club' ? 'club' : 'university'} personal statement from your Tomo data
        </Text>
        {feedback && (
          <Text style={{ color: colors.tomoOrange, fontFamily: fontFamily.medium, fontSize: 11, textAlign: 'center', marginBottom: 8 }}>
            {feedback}
          </Text>
        )}
        <GradientButton
          title={isGenerating ? 'Generating...' : 'Generate with AI'}
          icon="sparkles"
          onPress={handleRegenerate}
          loading={isGenerating}
          disabled={isGenerating}
          small
        />
      </View>
    );
  }

  // ── Edit mode ──
  if (isEditing) {
    return (
      <View>
        <TextInput
          style={{
            color: colors.textPrimary,
            backgroundColor: colors.inputBackground,
            borderRadius: 8,
            padding: 12,
            fontFamily: fontFamily.regular,
            fontSize: 12,
            lineHeight: 19,
            minHeight: 100,
            textAlignVertical: 'top',
          }}
          value={editText}
          onChangeText={setEditText}
          multiline
          autoFocus
        />
        <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
          <GradientButton title="Save" icon="checkmark" onPress={handleSaveEdit} small style={{ flex: 1 }} />
          <GradientButton title="Cancel" icon="close" onPress={() => { setIsEditing(false); setEditText(statement); }} small style={{ flex: 1 }} />
        </View>
      </View>
    );
  }

  // ── Display mode ──
  return (
    <View>
      {statementStatus === 'needs_update' && (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#FF6B3512', borderColor: '#FF6B3525', borderWidth: 0.5, borderRadius: 6, padding: 8, marginBottom: 8 }}>
          <SmartIcon name="alert-circle" size={14} color={colors.tomoOrange} />
          <Text style={{ color: colors.tomoOrange, fontFamily: fontFamily.medium, fontSize: 10, flex: 1 }}>
            Your data has changed — consider regenerating
          </Text>
        </View>
      )}

      {statementStatus === 'approved' && (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 6 }}>
          <SmartIcon name="checkmark-circle" size={12} color="#2ECC71" />
          <Text style={{ color: '#2ECC71', fontFamily: fontFamily.medium, fontSize: 10 }}>
            Approved{lastGenerated ? ` · ${new Date(lastGenerated).toLocaleDateString()}` : ''}
          </Text>
        </View>
      )}

      <Text style={{
        color: '#CCCCCC', fontFamily: fontFamily.regular, fontSize: 12, lineHeight: 19,
        fontStyle: 'italic', borderLeftWidth: 2,
        borderLeftColor: statementStatus === 'approved' ? '#2ECC71' : colors.accent, paddingLeft: 10,
      }}>
        "{statement}"
      </Text>

      <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
        {statementStatus !== 'approved' && (
          <GradientButton title="Approve" icon="checkmark-circle" onPress={onApprove} small style={{ flex: 1 }} />
        )}
        <GradientButton title="Edit" icon="create" onPress={() => { setEditText(statement); setIsEditing(true); }} small style={{ flex: 1 }} />
        <GradientButton
          title={isGenerating ? '...' : 'Regenerate'}
          icon="sparkles"
          onPress={handleRegenerate}
          loading={isGenerating}
          disabled={isGenerating}
          small
          style={{ flex: 1 }}
        />
      </View>
    </View>
  );
}
