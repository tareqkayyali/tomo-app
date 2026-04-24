/**
 * Parent Link by Code
 *
 * Parent-side of the child-initiated consent flow. Parent enters the
 * 6-char code their child showed them. Before acceptance we show a
 * plain-English summary of what Tomo collects (COPPA/GDPR-K
 * disclosure requirement). Tapping "I consent and link" calls
 * /relationships/accept-guardian which creates the relationship AND
 * writes a parental consent audit row for the child.
 */
import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  Linking,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { SmartIcon } from '../../components/SmartIcon';
import { PlayerScreen } from '../../components/tomo-ui/playerDesign';
import {
  colors,
  spacing,
  typography,
  borderRadius,
  fontFamily,
  layout,
} from '../../theme';
import { acceptAsGuardian } from '../../services/api';
import { getLegalDocUrl } from '../../services/legalVersions';
import { useAuth } from '../../hooks/useAuth';

const CODE_LEN = 6;

interface ParentLinkByCodeScreenProps {
  /** Override the default back behavior. Used when this screen is
   *  embedded inside the parent onboarding wizard. */
  onBack?: () => void;
  /** Optional callback for onboarding wrappers to run post-link actions. */
  onLinkedSuccess?: () => Promise<void>;
}

export function ParentLinkByCodeScreen({ onBack, onLinkedSuccess }: ParentLinkByCodeScreenProps = {}) {
  const navigation = useNavigation<any>();
  const handleBack = onBack ?? (() => navigation.goBack());
  const { refreshProfile } = useAuth();
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<{ consentGranted: boolean } | null>(null);

  const cleanCode = code.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, CODE_LEN);
  const canSubmit = cleanCode.length === CODE_LEN && !loading;

  const handleAccept = async () => {
    if (!canSubmit) return;
    setLoading(true);
    setError(null);
    try {
      const result = await acceptAsGuardian(cleanCode);
      if (onLinkedSuccess) {
        await onLinkedSuccess();
      }
      setSuccess({ consentGranted: result.consentGranted });
      // Refresh so the parent dashboard loads the linked child.
      await refreshProfile();
    } catch (e) {
      const msg = (e as Error).message;
      if (msg.toLowerCase().includes('invalid')) setError("That code isn't valid or it's been used.");
      else if (msg.toLowerCase().includes('expired')) setError('That code has expired. Ask your child to generate a new one.');
      else if (msg.toLowerCase().includes('already')) setError("You're already linked to this athlete.");
      else if (msg.toLowerCase().includes('not a parent-consent')) setError('This code is not a parent invite.');
      else setError(msg);
    } finally {
      setLoading(false);
    }
  };

  const openDoc = (doc: 'privacy' | 'terms') => {
    Linking.openURL(getLegalDocUrl(doc)).catch(() => {});
  };

  if (success) {
    return (
      <PlayerScreen label="LINK" title="Enter code" onBack={handleBack}>
        <View style={styles.successWrap}>
          <SmartIcon name="checkmark-circle-outline" size={56} color={colors.accent1} />
          <Text style={styles.successTitle}>You're all set</Text>
          <Text style={styles.successBody}>
            {success.consentGranted
              ? "Consent recorded — your child can now use Tomo. They'll see you linked the next time they open the app."
              : "Linked — your child's account is connected to yours."}
          </Text>
        </View>
      </PlayerScreen>
    );
  }

  return (
    <PlayerScreen label="LINK" title="Enter code" onBack={handleBack} scroll={false}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.kav}
      >
        <View style={styles.scroll}>
          <View style={styles.iconWrap}>
            <SmartIcon name="shield-checkmark-outline" size={40} color={colors.accent1} />
          </View>

          <Text style={styles.title}>Link your child's account</Text>
          <Text style={styles.subtitle}>
            Enter the 6-character code your child shared with you.
          </Text>

          {error && (
            <View style={styles.errorBanner}>
              <SmartIcon name="alert-circle" size={18} color={colors.error} />
              <Text style={styles.errorText}>{error}</Text>
            </View>
          )}

          <Text style={styles.label}>Code</Text>
          <TextInput
            value={cleanCode}
            onChangeText={(v) => {
              setCode(v);
              setError(null);
            }}
            autoCapitalize="characters"
            autoCorrect={false}
            maxLength={CODE_LEN}
            placeholder="ABCD12"
            placeholderTextColor={colors.textInactive}
            style={styles.input}
          />

          <Text style={styles.sectionTitle}>What Tomo collects about your child</Text>
          <View style={styles.collectsList}>
            <CollectItem text="Account info — name, email, date of birth." />
            <CollectItem text="Athletic profile — sport, position, height, weight, goal." />
            <CollectItem text="Daily check-ins — energy, sleep, soreness, mood, academic stress." />
            <CollectItem text="Training sessions + test results they log." />
            <CollectItem text="Conversations with the Tomo AI coach." />
          </View>

          <Text style={styles.legalLinksIntro}>Read in full:</Text>
          <View style={styles.legalLinks}>
            <TouchableOpacity onPress={() => openDoc('privacy')}>
              <Text style={styles.legalLink}>Privacy Policy</Text>
            </TouchableOpacity>
            <Text style={styles.legalSep}>•</Text>
            <TouchableOpacity onPress={() => openDoc('terms')}>
              <Text style={styles.legalLink}>Terms of Service</Text>
            </TouchableOpacity>
          </View>

          <Text style={styles.rightsNote}>
            You can revoke consent any time from Settings → Linked Children, and request deletion of
            your child's data.
          </Text>

          <TouchableOpacity
            onPress={handleAccept}
            disabled={!canSubmit}
            style={[styles.acceptBtn, !canSubmit && styles.btnDisabled]}
            activeOpacity={0.8}
          >
            <Text style={styles.acceptBtnText}>
              {loading ? 'Linking...' : 'I consent and link'}
            </Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </PlayerScreen>
  );
}

function CollectItem({ text }: { text: string }) {
  return (
    <View style={listStyles.row}>
      <SmartIcon name="checkmark" size={14} color={colors.accent1} />
      <Text style={listStyles.text}>{text}</Text>
    </View>
  );
}

const listStyles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    marginBottom: spacing.xs,
  },
  text: {
    flex: 1,
    ...typography.bodySmall,
    color: colors.textOnDark,
    lineHeight: 20,
  },
});

const styles = StyleSheet.create({
  kav: { flex: 1 },
  scroll: {
    flexGrow: 1,
    paddingHorizontal: layout.screenMargin,
    paddingTop: spacing.md,
    paddingBottom: spacing.xxl,
    maxWidth: layout.authMaxWidth,
    width: '100%',
    alignSelf: 'center',
  },
  iconWrap: {
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  title: {
    fontFamily: fontFamily.bold,
    fontSize: 24,
    color: colors.textOnDark,
    textAlign: 'center',
    marginBottom: spacing.xs,
  },
  subtitle: {
    ...typography.bodyOnDark,
    color: colors.textInactive,
    textAlign: 'center',
    marginBottom: spacing.lg,
  },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.readinessRedBg,
    padding: spacing.md,
    borderRadius: borderRadius.md,
    marginBottom: spacing.md,
  },
  errorText: {
    ...typography.bodySmall,
    color: colors.error,
    marginLeft: spacing.sm,
    flex: 1,
  },
  label: {
    ...typography.metadataSmall,
    color: colors.textInactive,
    marginBottom: spacing.xs,
  },
  input: {
    backgroundColor: colors.backgroundElevated,
    borderWidth: 1,
    borderColor: colors.borderLight,
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    fontFamily: fontFamily.bold,
    fontSize: 24,
    letterSpacing: 6,
    color: colors.accent1,
    textAlign: 'center',
    marginBottom: spacing.xl,
  },
  sectionTitle: {
    fontFamily: fontFamily.semiBold,
    fontSize: 15,
    color: colors.textOnDark,
    marginBottom: spacing.sm,
  },
  collectsList: {
    marginBottom: spacing.md,
  },
  legalLinksIntro: {
    ...typography.bodySmall,
    color: colors.textInactive,
    marginBottom: spacing.xs,
  },
  legalLinks: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  legalLink: {
    ...typography.bodySmall,
    color: colors.accent1,
    fontFamily: fontFamily.semiBold,
  },
  legalSep: {
    color: colors.textInactive,
  },
  rightsNote: {
    ...typography.bodySmall,
    color: colors.textInactive,
    marginBottom: spacing.xl,
    lineHeight: 18,
  },
  acceptBtn: {
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: colors.accent1,
    alignItems: 'center',
  },
  btnDisabled: {
    opacity: 0.5,
  },
  acceptBtnText: {
    fontFamily: fontFamily.semiBold,
    fontSize: 15,
    color: colors.background,
  },

  // Success state
  successWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: layout.screenMargin,
    paddingTop: spacing.xxl,
    gap: spacing.md,
  },
  successTitle: {
    fontFamily: fontFamily.bold,
    fontSize: 24,
    color: colors.textOnDark,
    textAlign: 'center',
    marginTop: spacing.md,
  },
  successBody: {
    ...typography.bodyOnDark,
    color: colors.textInactive,
    textAlign: 'center',
    paddingHorizontal: spacing.md,
  },
});
