import { useState, useRef, useCallback } from 'react';
import { Platform } from 'react-native';
import { transcribeAudio } from '../services/api';

type VoiceState = 'idle' | 'recording' | 'uploading' | 'error';

const IS_WEB = Platform.OS === 'web';

/**
 * Voice input hook — single hook, platform-branched internally.
 * Web: uses browser SpeechRecognition API (no server call).
 * Native: uses expo-audio + server transcription.
 */
export function useVoiceInput() {
  const [state, setState] = useState<VoiceState>('idle');
  const [duration, setDuration] = useState(0);
  const [transcript, setTranscript] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const recognitionRef = useRef<any>(null);
  const recorderRef = useRef<any>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startTimeRef = useRef(0);
  const stopRef = useRef<() => void>(() => {});

  const startRecording = useCallback(async () => {
    try {
      setError(null);
      setTranscript(null);

      if (IS_WEB) {
        // ── Web: SpeechRecognition API ──
        const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
        if (!SpeechRecognition) {
          setError('Voice not supported in this browser');
          setState('error');
          setTimeout(() => setState('idle'), 2000);
          return;
        }

        const recognition = new SpeechRecognition();
        recognition.continuous = true;
        recognition.interimResults = false;
        recognition.lang = 'en-US';

        let finalTranscript = '';

        recognition.onresult = (event: any) => {
          for (let i = event.resultIndex; i < event.results.length; i++) {
            if (event.results[i].isFinal) {
              finalTranscript += event.results[i][0].transcript + ' ';
            }
          }
        };

        recognition.onerror = (event: any) => {
          if (event.error !== 'aborted') {
            setError(event.error || 'Voice error');
            setState('error');
            setTimeout(() => setState('idle'), 2000);
          }
        };

        recognition.onend = () => {
          if (timerRef.current) {
            clearInterval(timerRef.current);
            timerRef.current = null;
          }
          if (finalTranscript.trim()) {
            setTranscript(finalTranscript.trim());
          }
          setState('idle');
        };

        recognitionRef.current = recognition;
        recognition.start();
      } else {
        // ── Native: expo-av Recording ──
        const { Audio } = require('expo-av');
        const permStatus = await Audio.requestPermissionsAsync();
        if (!permStatus.granted) {
          setError('Microphone permission required');
          setState('error');
          setTimeout(() => setState('idle'), 2000);
          return;
        }

        await Audio.setAudioModeAsync({
          allowsRecordingIOS: true,
          playsInSilentModeIOS: true,
        });

        // Create recorder if needed
        if (!recorderRef.current) {
          const recording = new Audio.Recording();
          await recording.prepareToRecordAsync(Audio.RecordingOptionsPresets.HIGH_QUALITY);
          await recording.startAsync();
          recorderRef.current = recording;
        } else {
          await recorderRef.current.startAsync();
        }

        const Haptics = require('expo-haptics');
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      }

      setState('recording');
      startTimeRef.current = Date.now();
      setDuration(0);

      timerRef.current = setInterval(() => {
        const elapsed = Math.floor((Date.now() - startTimeRef.current) / 1000);
        setDuration(elapsed);
        if (elapsed >= 60) stopRef.current();
      }, 100);
    } catch (err: any) {
      console.warn('[useVoiceInput] Start error:', err.message);
      setState('error');
      setError(err.message || 'Failed to start');
      setTimeout(() => setState('idle'), 2000);
    }
  }, []);

  const stopRecording = useCallback(async () => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }

    if (IS_WEB) {
      // Web: stop SpeechRecognition (onend fires and sets transcript)
      if (recognitionRef.current) {
        recognitionRef.current.stop();
        recognitionRef.current = null;
      }
    } else {
      // Native: stop recording, upload, transcribe
      try {
        setState('uploading');
        const Haptics = require('expo-haptics');
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

        if (recorderRef.current) {
          await recorderRef.current.stopAndUnloadAsync();
          const uri = recorderRef.current.getURI();
          recorderRef.current = null;

          if (uri) {
            const text = await transcribeAudio(uri);
            setTranscript(text);
          }
        }
        setState('idle');
      } catch (err: any) {
        console.warn('[useVoiceInput] Stop error:', err.message);
        setState('error');
        setError(err.message || 'Transcription failed');
        setTimeout(() => setState('idle'), 2000);
      }
    }
  }, []);

  stopRef.current = stopRecording;

  const cancelRecording = useCallback(async () => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (IS_WEB && recognitionRef.current) {
      recognitionRef.current.abort();
      recognitionRef.current = null;
    }
    if (!IS_WEB && recorderRef.current) {
      try { await recorderRef.current.stopAndUnloadAsync(); } catch {}
      recorderRef.current = null;
    }
    setState('idle');
    setDuration(0);
    setTranscript(null);
    setError(null);
  }, []);

  const clearTranscript = useCallback(() => { setTranscript(null); }, []);

  return {
    state, duration, transcript, error,
    startRecording, stopRecording, cancelRecording, clearTranscript,
    isRecording: state === 'recording',
    isUploading: state === 'uploading',
  };
}
