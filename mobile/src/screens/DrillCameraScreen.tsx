/**
 * Drill Camera Screen
 * Record training drill videos using the device camera.
 * Videos are saved locally and can be uploaded to Firebase Storage.
 *
 * Flow: preview → recording → review → save/discard
 */

import React, { useState, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Alert,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { SmartIcon } from '../components/SmartIcon';
import { colors, spacing, fontFamily, borderRadius } from '../theme';
import { uploadDrillVideo, getFileSize } from '../services/storage';
import { useAuth } from '../hooks/useAuth';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RouteProp } from '@react-navigation/native';
import type { MainStackParamList } from '../navigation/types';

type Props = {
  navigation: NativeStackNavigationProp<MainStackParamList, 'DrillCamera'>;
  route: RouteProp<MainStackParamList, 'DrillCamera'>;
};

export function DrillCameraScreen({ navigation, route }: Props) {
  const { drillId, drillName } = route.params;
  const { profile } = useAuth();

  const [permission, requestPermission] = useCameraPermissions();
  const [isRecording, setIsRecording] = useState(false);
  const [videoUri, setVideoUri] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [facing, setFacing] = useState<'front' | 'back'>('front');
  const cameraRef = useRef<CameraView>(null);

  const handleStartRecording = useCallback(async () => {
    if (!cameraRef.current) return;
    setIsRecording(true);
    try {
      const video = await cameraRef.current.recordAsync({
        maxDuration: 120, // 2 min max
      });
      if (video?.uri) {
        setVideoUri(video.uri);
      }
    } catch {
      if (Platform.OS === 'web') {
        window.alert('Could not record video. Please try again.');
      } else {
        Alert.alert('Error', 'Could not record video. Please try again.');
      }
    } finally {
      setIsRecording(false);
    }
  }, []);

  const handleStopRecording = useCallback(() => {
    cameraRef.current?.stopRecording();
  }, []);

  const handleSaveVideo = useCallback(async () => {
    if (!videoUri || !profile?.uid) return;

    const sizeMB = await getFileSize(videoUri);
    if (sizeMB > 100) {
      if (Platform.OS === 'web') {
        window.alert('Video must be under 100 MB.');
      } else {
        Alert.alert('File Too Large', 'Video must be under 100 MB.');
      }
      return;
    }

    setUploading(true);
    setUploadProgress(0);
    try {
      const downloadUrl = await uploadDrillVideo(
        profile.uid,
        drillId,
        videoUri,
        setUploadProgress,
      );
      if (Platform.OS === 'web') {
        window.alert('Your drill recording has been saved.');
        navigation.goBack();
      } else {
        Alert.alert('Saved', 'Your drill recording has been saved.', [
          { text: 'OK', onPress: () => navigation.goBack() },
        ]);
      }
    } catch {
      if (Platform.OS === 'web') {
        window.alert('Could not upload video. Check your connection and try again.');
      } else {
        Alert.alert('Upload Failed', 'Could not upload video. Check your connection and try again.');
      }
    } finally {
      setUploading(false);
    }
  }, [videoUri, profile?.uid, drillId, navigation]);

  const handleDiscard = useCallback(() => {
    setVideoUri(null);
  }, []);

  const toggleFacing = useCallback(() => {
    setFacing((prev) => (prev === 'front' ? 'back' : 'front'));
  }, []);

  // Permission not yet determined
  if (!permission) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.accent1} size="large" />
      </View>
    );
  }

  // Permission denied
  if (!permission.granted) {
    return (
      <SafeAreaView style={styles.center} edges={['top']}>
        <SmartIcon name="camera-outline" size={64} color={colors.textInactive} />
        <Text style={styles.permTitle}>Camera Access Required</Text>
        <Text style={styles.permSub}>
          Tomo needs camera access to record your training drills so you can review your form.
        </Text>
        <Pressable style={styles.permButton} onPress={requestPermission}>
          <Text style={styles.permButtonText}>Grant Access</Text>
        </Pressable>
        <Pressable onPress={() => navigation.goBack()} style={styles.skipButton}>
          <Text style={styles.skipButtonText}>Skip</Text>
        </Pressable>
      </SafeAreaView>
    );
  }

  // Video recorded — show review screen
  if (videoUri) {
    return (
      <SafeAreaView style={styles.center} edges={['top']}>
        <SmartIcon name="videocam" size={64} color={colors.accent1} />
        <Text style={styles.reviewTitle}>Recording Complete</Text>
        <Text style={styles.reviewSub}>{drillName}</Text>

        {uploading ? (
          <View style={styles.uploadingWrap}>
            <ActivityIndicator color={colors.accent1} size="large" />
            <Text style={styles.uploadText}>
              Uploading... {Math.round(uploadProgress * 100)}%
            </Text>
            <View style={styles.progressTrack}>
              <View
                style={[styles.progressFill, { width: `${uploadProgress * 100}%` }]}
              />
            </View>
          </View>
        ) : (
          <View style={styles.reviewActions}>
            <Pressable style={styles.saveButton} onPress={handleSaveVideo}>
              <SmartIcon name="cloud-upload-outline" size={22} color={colors.textPrimary} />
              <Text style={styles.saveButtonText}>Save Recording</Text>
            </Pressable>
            <Pressable style={styles.retakeButton} onPress={handleDiscard}>
              <SmartIcon name="refresh-outline" size={20} color={colors.accent1} />
              <Text style={styles.retakeText}>Retake</Text>
            </Pressable>
            <Pressable onPress={() => navigation.goBack()} style={styles.skipButton}>
              <Text style={styles.skipButtonText}>Discard & Go Back</Text>
            </Pressable>
          </View>
        )}
      </SafeAreaView>
    );
  }

  // Camera preview
  return (
    <View style={styles.full}>
      <CameraView
        ref={cameraRef}
        style={styles.camera}
        facing={facing}
        mode="video"
      >
        {/* Top overlay */}
        <SafeAreaView style={styles.topOverlay} edges={['top']}>
          <Pressable onPress={() => navigation.goBack()} style={styles.closeButton}>
            <SmartIcon name="close" size={28} color={colors.textPrimary} />
          </Pressable>
          <Text style={styles.drillLabel}>{drillName}</Text>
          <Pressable onPress={toggleFacing} style={styles.flipButton}>
            <SmartIcon name="camera-reverse-outline" size={24} color={colors.textPrimary} />
          </Pressable>
        </SafeAreaView>

        {/* Bottom controls */}
        <View style={styles.bottomOverlay}>
          {isRecording && (
            <View style={styles.recordingBadge}>
              <View style={styles.recordingDot} />
              <Text style={styles.recordingText}>REC</Text>
            </View>
          )}

          <Pressable
            onPress={isRecording ? handleStopRecording : handleStartRecording}
            style={styles.recordButtonOuter}
          >
            <View
              style={[
                styles.recordButtonInner,
                isRecording && styles.recordButtonStop,
              ]}
            />
          </Pressable>

          <Text style={styles.hint}>
            {isRecording ? 'Tap to stop' : 'Tap to record'}
          </Text>
        </View>
      </CameraView>
    </View>
  );
}

const styles = StyleSheet.create({
  full: { flex: 1, backgroundColor: '#000' },
  center: {
    flex: 1,
    backgroundColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
  },
  camera: { flex: 1 },

  // Top overlay
  topOverlay: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.sm,
  },
  closeButton: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  drillLabel: {
    fontFamily: fontFamily.semiBold,
    fontSize: 16,
    color: colors.textPrimary,
  },
  flipButton: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Bottom overlay
  bottomOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    alignItems: 'center',
    paddingBottom: 60,
  },
  recordingBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(255,0,0,0.7)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: borderRadius.full,
    marginBottom: spacing.lg,
  },
  recordingDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.textPrimary,
  },
  recordingText: {
    fontFamily: fontFamily.bold,
    fontSize: 13,
    color: colors.textPrimary,
    letterSpacing: 1,
  },
  recordButtonOuter: {
    width: 80,
    height: 80,
    borderRadius: 40,
    borderWidth: 4,
    borderColor: colors.textPrimary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  recordButtonInner: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: colors.error,
  },
  recordButtonStop: {
    width: 32,
    height: 32,
    borderRadius: 6,
  },
  hint: {
    fontFamily: fontFamily.medium,
    fontSize: 14,
    color: 'rgba(255,255,255,0.7)',
    marginTop: spacing.sm,
  },

  // Permission screen
  permTitle: {
    fontFamily: fontFamily.bold,
    fontSize: 22,
    color: colors.textOnDark,
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
  },
  permSub: {
    fontFamily: fontFamily.regular,
    fontSize: 15,
    color: colors.textInactive,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: spacing.xl,
  },
  permButton: {
    backgroundColor: colors.accent1,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xl,
    borderRadius: borderRadius.xl,
  },
  permButtonText: {
    fontFamily: fontFamily.bold,
    fontSize: 16,
    color: colors.textPrimary,
  },
  skipButton: {
    paddingVertical: spacing.md,
  },
  skipButtonText: {
    fontFamily: fontFamily.medium,
    fontSize: 15,
    color: colors.textInactive,
  },

  // Review screen
  reviewTitle: {
    fontFamily: fontFamily.bold,
    fontSize: 24,
    color: colors.textOnDark,
    marginTop: spacing.lg,
    marginBottom: spacing.xs,
  },
  reviewSub: {
    fontFamily: fontFamily.medium,
    fontSize: 16,
    color: colors.textInactive,
    marginBottom: spacing.xl,
  },
  reviewActions: {
    alignItems: 'center',
    gap: spacing.md,
    width: '100%',
  },
  saveButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    backgroundColor: colors.accent1,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xl,
    borderRadius: borderRadius.xl,
    width: '100%',
  },
  saveButtonText: {
    fontFamily: fontFamily.bold,
    fontSize: 17,
    color: colors.textPrimary,
  },
  retakeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xl,
    borderRadius: borderRadius.full,
    borderWidth: 1,
    borderColor: colors.accent1,
  },
  retakeText: {
    fontFamily: fontFamily.medium,
    fontSize: 15,
    color: colors.accent1,
  },

  // Upload progress
  uploadingWrap: {
    alignItems: 'center',
    gap: spacing.md,
    marginTop: spacing.lg,
    width: '100%',
  },
  uploadText: {
    fontFamily: fontFamily.medium,
    fontSize: 15,
    color: colors.textInactive,
  },
  progressTrack: {
    width: '80%',
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.backgroundElevated,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 3,
    backgroundColor: colors.accent1,
  },
});
