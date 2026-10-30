import { useState, useEffect, useCallback, useRef } from 'react';
import { audioRecorder } from '@/services/voice/audioRecorder';
import { computerService } from '@/services/native/computerService';

interface IWindow extends Window {
  SpeechRecognition?: any;
  webkitSpeechRecognition?: any;
}

export function useVoiceInput(onResult?: (text: string) => void, onInterim?: (text: string) => void) {
  const [isListening, setIsListening] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [audioLevel, setAudioLevel] = useState(0);
  const [isSupported] = useState(() => {
    const hasMedia = typeof navigator !== 'undefined' && Boolean(navigator.mediaDevices && typeof navigator.mediaDevices.getUserMedia === 'function');
    const win = typeof window !== 'undefined' ? (window as unknown as IWindow) : ({} as IWindow);
    const hasWebSpeech = Boolean(win.SpeechRecognition || win.webkitSpeechRecognition);
    return hasMedia || hasWebSpeech;
  });
  const [whisperAvailable, setWhisperAvailable] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const recognitionRef = useRef<any>(null);
  const webSpeechActiveRef = useRef(false);

  // Check capabilities on mount
  useEffect(() => {
    // Check if local Whisper runtime is installed/available
    computerService.checkWhisperStatus().then((status) => {
      setWhisperAvailable(status.available);
      console.log('[Foundry Voice] Local Whisper status:', status);
    }).catch(() => {
      setWhisperAvailable(false);
    });

    // Wire visual audio level callback
    audioRecorder.setAudioLevelCallback((level) => {
      setAudioLevel(level);
    });

    return () => {
      audioRecorder.cancel();
    };
  }, []);

  const startListening = useCallback(async () => {
    if (isListening || isTranscribing) return;

    setErrorMessage(null);
    setTranscript('');

    // Method 1: High-Fidelity Audio Recording for Whisper (Native & Web)
    if (typeof navigator !== 'undefined' && Boolean(navigator.mediaDevices && typeof navigator.mediaDevices.getUserMedia === 'function')) {
      try {
        await audioRecorder.start();
        setIsListening(true);
        webSpeechActiveRef.current = false;
        console.log('[Foundry Voice] Audio recording started via AudioRecorder.');
        return;
      } catch (err: any) {
        console.warn('[Foundry Voice] AudioRecorder failed to start, trying Web Speech fallback:', err);
      }
    }

    // Method 2: Web Speech API Fallback (if browser permits)
    const win = window as unknown as IWindow;
    const SpeechRecognition = win.SpeechRecognition || win.webkitSpeechRecognition;

    if (SpeechRecognition) {
      try {
        const recognition = new SpeechRecognition();
        recognition.continuous = false;
        recognition.interimResults = true;
        recognition.lang = 'en-US';

        recognition.onstart = () => {
          setIsListening(true);
          webSpeechActiveRef.current = true;
        };

        recognition.onresult = (event: any) => {
          let current = '';
          for (let i = 0; i < event.results.length; i++) {
            current += event.results[i][0].transcript;
          }
          setTranscript(current);
          if (onInterim) {
            onInterim(current);
          }
          if (event.results[0]?.isFinal && onResult) {
            onResult(current);
          }
        };

        recognition.onerror = (event: any) => {
          console.warn('[Foundry Voice] Speech recognition error:', event.error);
          setIsListening(false);
          webSpeechActiveRef.current = false;
          setErrorMessage(event.error ? `Speech error: ${event.error}` : 'Voice recognition error');
        };

        recognition.onend = () => {
          setIsListening(false);
          webSpeechActiveRef.current = false;
        };

        recognitionRef.current = recognition;
        recognition.start();
        return;
      } catch (err: any) {
        console.warn('[Foundry Voice] Web Speech start failed:', err);
      }
    }

    setErrorMessage('Microphone access is unavailable.');
  }, [isListening, isTranscribing, onResult, onInterim]);

  const stopListening = useCallback(async () => {
    if (!isListening) return;

    setIsListening(false);

    // If Web Speech API was running
    if (webSpeechActiveRef.current && recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch {
        // ignore
      }
      webSpeechActiveRef.current = false;
      return;
    }

    // If AudioRecorder was recording, stop and transcribe via Whisper
    if (audioRecorder.isRecordingActive()) {
      setIsTranscribing(true);
      try {
        console.log('[Foundry Voice] Stopping audio recording and encoding WAV...');
        const wavBytes = await audioRecorder.stop();
        console.log(`[Foundry Voice] Encoded WAV buffer: ${wavBytes.length} bytes. Transcribing via Whisper...`);

        const text = await computerService.transcribeAudio(wavBytes);
        console.log('[Foundry Voice] Whisper transcribed text:', text);

        if (text && text.trim()) {
          const cleaned = text.trim();
          setTranscript(cleaned);
          if (onResult) {
            onResult(cleaned);
          }
        } else {
          setErrorMessage('No speech detected. Please speak clearly and try again.');
        }
      } catch (err: any) {
        console.error('[Foundry Voice] Transcription failed:', err);
        setErrorMessage(err.message || 'Speech transcription failed.');
      } finally {
        setIsTranscribing(false);
        setAudioLevel(0);
      }
    }
  }, [isListening, onResult]);

  const toggleListening = useCallback(async () => {
    if (isListening) {
      await stopListening();
    } else {
      await startListening();
    }
  }, [isListening, startListening, stopListening]);

  return {
    isListening,
    isTranscribing,
    transcript,
    audioLevel,
    isSupported,
    whisperAvailable,
    errorMessage,
    startListening,
    stopListening,
    toggleListening,
  };
}
