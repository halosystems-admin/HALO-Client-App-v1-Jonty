import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Loader2, Mic, Pause, Play, Radio, StopCircle } from 'lucide-react';
import { getTranscribeWebSocketUrl, transcribeAudio } from '../../services/api';

export interface HeaderConsultationRecorderProps {
  onBeforeStart?: () => void;
  onLiveTranscriptUpdate: (transcript: string) => void;
  onLiveStopped: (transcript: string) => void;
  onError?: (message: string) => void;
}

type RecorderStatus =
  | 'idle'
  | 'connecting'
  | 'recording'
  | 'paused'
  | 'finishing'
  | 'error';

export const HeaderConsultationRecorder: React.FC<HeaderConsultationRecorderProps> = ({
  onBeforeStart,
  onLiveTranscriptUpdate,
  onLiveStopped,
  onError,
}) => {
  const [status, setStatus] = useState<RecorderStatus>('idle');
  const [audioLevel, setAudioLevel] = useState(0);
  const [elapsedMs, setElapsedMs] = useState(0);

  const wsRef = useRef<WebSocket | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const rafRef = useRef<number | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const recordingMimeTypeRef = useRef<string>('audio/webm');
  const transcriptRef = useRef<string>('');
  const timerRef = useRef<number | null>(null);
  const statusRef = useRef<RecorderStatus>('idle');
  const stopPromiseRef = useRef<Promise<void> | null>(null);

  const setRecorderStatus = (next: RecorderStatus) => {
    statusRef.current = next;
    setStatus(next);
  };

  const stopAudioVisualization = () => {
    if (rafRef.current != null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    if (audioContextRef.current) {
      audioContextRef.current.close().catch(() => {});
      audioContextRef.current = null;
    }
    analyserRef.current = null;
    setAudioLevel(0);
  };

  const startAudioVisualization = (stream: MediaStream) => {
    try {
      const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 512;
      const source = audioContext.createMediaStreamSource(stream);
      source.connect(analyser);
      audioContextRef.current = audioContext;
      analyserRef.current = analyser;

      const dataArray = new Uint8Array(analyser.frequencyBinCount);

      const tick = () => {
        if (!analyserRef.current) return;
        analyserRef.current.getByteTimeDomainData(dataArray);
        let sum = 0;
        for (let i = 0; i < dataArray.length; i++) {
          const v = (dataArray[i] - 128) / 128;
          sum += v * v;
        }
        const rms = Math.sqrt(sum / dataArray.length);
        setAudioLevel(rms);
        rafRef.current = requestAnimationFrame(tick);
      };

      rafRef.current = requestAnimationFrame(tick);
    } catch {
      // Visualization is best-effort only.
    }
  };

  const stopTimer = () => {
    if (timerRef.current != null) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
  };

  const startTimer = () => {
    stopTimer();
    const startedAt = performance.now() - elapsedMs;
    timerRef.current = window.setInterval(() => {
      setElapsedMs(performance.now() - startedAt);
    }, 500);
  };

  const detachSocketHandlers = () => {
    if (!wsRef.current) return;
    wsRef.current.onopen = null;
    wsRef.current.onmessage = null;
    wsRef.current.onclose = null;
    wsRef.current.onerror = null;
  };

  const closeSocket = () => {
    if (!wsRef.current) return;
    const socket = wsRef.current;
    detachSocketHandlers();
    try {
      if (socket.readyState === WebSocket.OPEN) socket.send('end');
      socket.close();
    } catch {
      // ignore
    }
    wsRef.current = null;
  };

  const stopStream = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
  };

  const stopMediaRecorder = async () => {
    const recorder = mediaRecorderRef.current;
    if (!recorder || recorder.state === 'inactive') {
      mediaRecorderRef.current = null;
      return;
    }

    await new Promise<void>((resolve) => {
      const handleStop = () => resolve();
      recorder.addEventListener('stop', handleStop, { once: true });
      recorder.stop();
    });

    mediaRecorderRef.current = null;
  };

  const resetVisualState = () => {
    stopAudioVisualization();
    stopTimer();
    setElapsedMs(0);
    setAudioLevel(0);
  };

  const runFallbackTranscription = useCallback(async (): Promise<string> => {
    if (!chunksRef.current.length) return '';
    try {
      const blob = new Blob(chunksRef.current, {
        type: recordingMimeTypeRef.current || 'audio/webm',
      });

      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => {
          try {
            const result = reader.result as string;
            const encoded = result.split(',')[1] || '';
            resolve(encoded);
          } catch (err) {
            reject(err);
          }
        };
        reader.onerror = () => reject(reader.error || new Error('Failed to read recording.'));
        reader.readAsDataURL(blob);
      });

      if (!base64) return '';

      const transcript = await transcribeAudio(
        base64,
        recordingMimeTypeRef.current || 'audio/webm'
      );
      return transcript?.trim() || '';
    } catch (err) {
      console.error('[HeaderConsultationRecorder] Fallback transcription failed:', err);
      onError?.(
        'Live transcription was unavailable and the backup transcription also failed. Please try again.'
      );
      return '';
    }
  }, [onError]);

  const finalizeStop = useCallback(async () => {
    if (stopPromiseRef.current) return stopPromiseRef.current;

    const task = (async () => {
      setRecorderStatus('finishing');

      const streamedText = transcriptRef.current.trim();

      closeSocket();
      await stopMediaRecorder();
      stopStream();
      resetVisualState();

      let finalText = streamedText;
      if (!finalText && chunksRef.current.length > 0) {
        finalText = await runFallbackTranscription();
      }

      chunksRef.current = [];
      transcriptRef.current = '';

      if (finalText) {
        onLiveStopped(finalText);
      }

      setRecorderStatus('idle');
    })()
      .catch((err) => {
        console.error('[HeaderConsultationRecorder] Finalize error:', err);
        setRecorderStatus('error');
        onError?.('Could not finish this consultation recording. Please try again.');
      })
      .finally(() => {
        stopPromiseRef.current = null;
      });

    stopPromiseRef.current = task;
    return task;
  }, [onError, onLiveStopped, runFallbackTranscription]);

  useEffect(() => {
    return () => {
      closeSocket();
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        mediaRecorderRef.current.stop();
      }
      stopStream();
      resetVisualState();
    };
  }, []);

  const startLive = useCallback(async () => {
    if (statusRef.current !== 'idle' && statusRef.current !== 'error') return;

    transcriptRef.current = '';
    chunksRef.current = [];
    setElapsedMs(0);
    setRecorderStatus('connecting');

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      startAudioVisualization(stream);

      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : MediaRecorder.isTypeSupported('audio/ogg;codecs=opus')
          ? 'audio/ogg;codecs=opus'
          : 'audio/webm';
      recordingMimeTypeRef.current = mimeType;

      const ws = new WebSocket(getTranscribeWebSocketUrl());
      wsRef.current = ws;
      ws.binaryType = 'arraybuffer';

      ws.onopen = () => {
        onBeforeStart?.();
        const mediaRecorder = new MediaRecorder(stream, { mimeType });
        mediaRecorderRef.current = mediaRecorder;
        mediaRecorder.ondataavailable = (event) => {
          if (event.data.size > 0) {
            chunksRef.current.push(event.data);
            if (ws.readyState === WebSocket.OPEN && statusRef.current === 'recording') {
              ws.send(event.data);
            }
          }
        };
        mediaRecorder.start(250);
        setRecorderStatus('recording');
        startTimer();
      };

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data as string) as {
            type: string;
            transcript?: string;
            message?: string;
          };
          if (msg.type === 'transcript' && typeof msg.transcript === 'string' && msg.transcript.trim()) {
            const prev = transcriptRef.current;
            const nextChunk = msg.transcript.trim();
            const separator =
              prev && !prev.endsWith(' ') && !nextChunk.startsWith(' ') ? ' ' : '';
            transcriptRef.current = `${prev}${separator}${nextChunk}`;
            onLiveTranscriptUpdate(transcriptRef.current);
          }
          if (msg.type === 'error') {
            onError?.(msg.message || 'Live transcription error');
          }
        } catch {
          // Ignore malformed events.
        }
      };

      ws.onclose = () => {
        if (statusRef.current === 'finishing' || statusRef.current === 'idle') return;
        onError?.('Live transcription connection lost. Finalising the consultation now.');
        void finalizeStop();
      };

      ws.onerror = () => {
        if (statusRef.current === 'connecting') {
          onError?.('Live transcription failed to connect. Check that DEEPGRAM_API_KEY is configured on the server.');
        }
      };
    } catch (err) {
      closeSocket();
      stopStream();
      resetVisualState();
      setRecorderStatus('error');
      onError?.(
        err instanceof Error ? err.message : 'Could not access microphone. Please check your browser permissions.'
      );
    }
  }, [finalizeStop, onBeforeStart, onError, onLiveTranscriptUpdate]);

  const stopLive = useCallback(async () => {
    if (!['connecting', 'recording', 'paused'].includes(statusRef.current)) return;
    await finalizeStop();
  }, [finalizeStop]);

  const togglePause = useCallback(() => {
    const recorder = mediaRecorderRef.current;
    if (!recorder) return;

    if (statusRef.current === 'recording' && recorder.state === 'recording') {
      recorder.pause();
      stopTimer();
      setRecorderStatus('paused');
      return;
    }

    if (statusRef.current === 'paused' && recorder.state === 'paused') {
      recorder.resume();
      startTimer();
      setRecorderStatus('recording');
    }
  }, [elapsedMs]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.code !== 'Space') return;
      const target = event.target as HTMLElement;
      const isTyping =
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.isContentEditable;
      if (isTyping) return;
      event.preventDefault();

      if (statusRef.current === 'recording' || statusRef.current === 'paused') {
        void stopLive();
        return;
      }

      if (statusRef.current === 'idle' || statusRef.current === 'error') {
        void startLive();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [startLive, stopLive]);

  const statusMeta = useMemo(() => {
    if (status === 'connecting') {
      return {
        title: 'Connecting',
        subtitle: 'Preparing live transcription...',
        badge: 'Connecting to microphone',
      };
    }
    if (status === 'recording') {
      return {
        title: 'Recording',
        subtitle: `${Math.floor(elapsedMs / 1000 / 60)
          .toString()
          .padStart(2, '0')}:${Math.floor((elapsedMs / 1000) % 60)
          .toString()
          .padStart(2, '0')} - Dictating live`,
        badge: 'Consultation recording live',
      };
    }
    if (status === 'paused') {
      return {
        title: 'Paused',
        subtitle: 'Resume to continue this consultation',
        badge: 'Consultation paused',
      };
    }
    if (status === 'finishing') {
      return {
        title: 'Finishing',
        subtitle: 'Finalising and transcribing audio...',
        badge: 'Processing recording',
      };
    }
    if (status === 'error') {
      return {
        title: 'Retry Recording',
        subtitle: 'The last attempt did not complete',
        badge: 'Recorder needs attention',
      };
    }
      return {
        title: 'Record Consultation',
        subtitle: 'Space to start - Dictate while you examine',
        badge: 'Ready to record',
      };
  }, [elapsedMs, status]);

  const isBusy = status === 'connecting' || status === 'finishing';
  const isActive = status === 'recording' || status === 'paused' || status === 'finishing';

  return (
    <div className="flex items-center gap-3">
      <div className="hidden md:flex min-w-[170px] flex-col items-end text-right">
        <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">
          {statusMeta.badge}
        </span>
        {isActive && (
          <span className="mt-1 text-xs text-slate-500">
            {status === 'finishing' ? 'Preparing transcript...' : 'Consultation in progress'}
          </span>
        )}
      </div>

      <div className="flex items-center gap-2">
        {(status === 'recording' || status === 'paused') && (
          <button
            type="button"
            onClick={togglePause}
            className="hidden h-12 items-center gap-2 rounded-2xl border border-[#cfe3ef] bg-white px-4 text-sm font-semibold text-[#2f84b4] shadow-sm transition hover:border-[#9fd0e6] hover:bg-[#f2f9fd] hover:text-[#236f9b] md:inline-flex"
          >
            {status === 'paused' ? (
              <>
                <Play className="h-4 w-4" /> Resume
              </>
            ) : (
              <>
                <Pause className="h-4 w-4" /> Pause
              </>
            )}
          </button>
        )}

        <button
          type="button"
          onClick={
            status === 'recording' || status === 'paused'
              ? () => void stopLive()
              : () => void startLive()
          }
          disabled={isBusy}
          className={`inline-flex h-12 min-w-[220px] items-center gap-3 rounded-2xl border px-4 text-sm font-semibold shadow-sm transition ${
            isActive
              ? 'border-[#f0c6cc] bg-white text-slate-700 hover:bg-rose-50'
              : 'border-[#cfe3ef] bg-white text-[#2f84b4] hover:border-[#9fd0e6] hover:bg-[#f2f9fd] hover:text-[#236f9b]'
          } ${isBusy ? 'cursor-not-allowed opacity-75' : ''}`}
        >
          <div
            className={`flex h-8 w-8 items-center justify-center rounded-full ${
              status === 'finishing'
                ? 'bg-sky-100 text-sky-600'
                : status === 'recording' || status === 'paused'
                  ? 'bg-rose-100 text-rose-600'
                  : 'bg-sky-100 text-sky-600'
            }`}
          >
            {status === 'finishing' ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : status === 'recording' || status === 'paused' ? (
              <StopCircle className="h-4 w-4" />
            ) : (
              <Mic className="h-4 w-4" />
            )}
          </div>

          <div className="flex flex-col items-start leading-tight">
            <span className="text-xs uppercase tracking-[0.18em] text-slate-500">
              {statusMeta.title}
            </span>
            <span className="mt-0.5 text-[11px] font-medium text-slate-500">
              {statusMeta.subtitle}
            </span>
          </div>

          <div className="ml-auto hidden items-end gap-[2px] md:flex">
            {Array.from({ length: 8 }).map((_, index) => {
              const intensity =
                status === 'recording'
                  ? Math.max(0.15, Math.min(1, audioLevel * 5 + index * 0.04))
                  : 0.18;
              const height = 4 + intensity * 10;
              return (
                <span
                  key={index}
                  className={`w-[3px] rounded-full ${
                    status === 'recording' ? 'bg-[#57afd8]' : 'bg-slate-300'
                  }`}
                  style={{ height }}
                />
              );
            })}
          </div>
        </button>

        {(status === 'recording' || status === 'paused') && (
          <div className="inline-flex h-12 items-center gap-2 rounded-2xl border border-[#d8e7ef] bg-white px-4 text-sm font-semibold text-slate-500 shadow-sm md:hidden">
            <Radio className={`h-4 w-4 ${status === 'paused' ? 'text-slate-400' : 'text-rose-500'}`} />
            {status === 'paused' ? 'Paused' : 'Live'}
          </div>
        )}
      </div>
    </div>
  );
};
