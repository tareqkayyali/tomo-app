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
        const SpeechRecognition =
          (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
        if (!SpeechRecognition) {
          setError('Voice not supported in this browser');
          setState('error');
          setTimeout(() => setState('idle'), 2500);
          return;
        }

        // Gate on explicit mic permission so the UI never sits in
        // "recording" while the browser silently blocks audio capture.
        // getUserMedia throws immediately if the user denies/has denied.
        try {
          const media = await navigator.mediaDevices.getUserMedia({ audio: true });
          // We only needed permission — stop the tracks right away so we
          // don't hold the mic while SpeechRecognition runs its own stream.
          media.getTracks().forEach((t) => t.stop());
        } catch (permErr: any) {
          const name = permErr?.name || '';
          const msg =
            name === 'NotAllowedError'
              ? 'Microphone access denied'
              : name === 'NotFoundError'
              ? 'No microphone detected'
              : permErr?.message || 'Mic permission failed';
          setError(msg);
          setState('error');
          setTimeout(() => setState('idle'), 2500);
          return;
        }

        const recognition = new SpeechRecognition();
        recognition.continuous = true;
        // Interim results help us detect that audio is actually being
        // captured (some browsers deliver final results only at end).
        recognition.interimResults = true;
        recognition.lang = 'en-US';

        let finalTranscript = '';
        let interimTranscript = '';

        recognition.onresult = (event: any) => {
          interimTranscript = '';
          for (let i = event.resultIndex; i < event.results.length; i++) {
            const piece = event.results[i][0].transcript;
            if (event.results[i].isFinal) {
              finalTranscript += piece + ' ';
            } else {
              interimTranscript += piece;
            }
          }
        };

        recognition.onerror = (event: any) => {
          if (event.error && event.error !== 'aborted' && event.error !== 'no-speech') {
            setError(event.error);
            setState('error');
            setTimeout(() => setState('idle'), 2500);
          }
        };

        recognition.onend = () => {
          if (timerRef.current) {
            clearInterval(timerRef.current);
            timerRef.current = null;
          }
          const combined = (finalTranscript + interimTranscript).trim();
          if (combined) setTranscript(combined);
          setState('idle');
        };

        recognitionRef.current = recognition;
        recognition.start();
      } else {
        // ── Native: expo-av Recording ──
        // Tear down any stale recorder from a previous failed stop —
        // starting a fresh session on top of an orphaned recorder silently
        // produced empty m4a uploads, which is the classic "transcription
        // not working" symptom.
        if (recorderRef.current) {
          try { await recorderRef.current.stopAndUnloadAsync(); } catch {}
          recorderRef.current = null;
        }

        const { Audio } = require('expo-av');
        const permStatus = await Audio.requestPermissionsAsync();
        if (!permStatus.granted) {
          setError('Microphone permission required');
          setState('error');
          setTimeout(() => setState('idle'), 2500);
          return;
        }

        await Audio.setAudioModeAsync({
          allowsRecordingIOS: true,
          playsInSilentModeIOS: true,
        });

        const recording = new Audio.Recording();
        await recording.prepareToRecordAsync(Audio.RecordingOptionsPresets.HIGH_QUALITY);
        await recording.startAsync();
        recorderRef.current = recording;

        try {
          const Haptics = require('expo-haptics');
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        } catch {}
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
