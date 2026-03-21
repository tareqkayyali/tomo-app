import { useState, useRef, useCallback } from 'react';
import { Platform } from 'react-native';
import { useAudioRecorder, AudioModule, RecordingPresets } from 'expo-audio';
import * as Haptics from 'expo-haptics';
import { transcribeAudio } from '../services/api';

type VoiceState = 'idle' | 'recording' | 'uploading' | 'error';

export function useVoiceInput() {
  const [state, setState] = useState<VoiceState>('idle');
  const [duration, setDuration] = useState(0);
  const [transcript, setTranscript] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startTimeRef = useRef(0);

  const startRecording = useCallback(async () => {
    try {
      setError(null);
      setTranscript(null);

      // Request permission
      const permStatus = await AudioModule.requestRecordingPermissionsAsync();
      if (!permStatus.granted) {
        setError('Microphone permission required');
        return;
      }

      // Start recording
      recorder.record();
      setState('recording');
      startTimeRef.current = Date.now();
      setDuration(0);

      // Start timer
      timerRef.current = setInterval(() => {
        const elapsed = Math.floor((Date.now() - startTimeRef.current) / 1000);
        setDuration(elapsed);

        // Auto-stop at 60 seconds
        if (elapsed >= 60) {
          stopRecording();
        }
      }, 100);

      if (Platform.OS !== 'web') {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      }
    } catch (err: any) {
      setState('error');
      setError(err.message || 'Failed to start recording');
    }
  }, []);

  const stopRecording = useCallback(async () => {
    try {
      // Clear timer
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }

      setState('uploading');

      if (Platform.OS !== 'web') {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      }

      // Stop recording and get URI
      await recorder.stop();
      const uri = recorder.uri;

      if (!uri) {
        setState('error');
        setError('No recording file');
        return;
      }

      // Upload and transcribe
      console.warn('[useVoiceInput] Uploading audio from:', uri);
      const text = await transcribeAudio(uri);
      console.warn('[useVoiceInput] Transcription result:', text);
      setTranscript(text);
      setState('idle');
    } catch (err: any) {
      console.warn('[useVoiceInput] Transcription error:', err.message, err);
      setState('error');
      setError(err.message || 'Transcription failed');
      // Reset to idle after error so user can retry
      setTimeout(() => setState('idle'), 2000);
    }
  }, []);

  const cancelRecording = useCallback(async () => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }

    try {
      await recorder.stop();
    } catch {}

    setState('idle');
    setDuration(0);
    setTranscript(null);
    setError(null);
  }, []);

  const clearTranscript = useCallback(() => {
    setTranscript(null);
  }, []);

  return {
    state,
    duration,
    transcript,
    error,
    startRecording,
    stopRecording,
    cancelRecording,
    clearTranscript,
    isRecording: state === 'recording',
    isUploading: state === 'uploading',
  };
}
