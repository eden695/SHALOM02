import React, { createContext, useContext, useRef, useState, useEffect, useCallback } from 'react';
import { MediaRecordingManager, RecorderState } from '../services/audioVideoRecorder';

export interface FinishedRecording {
  blob: Blob;
  mimeType: string;
  duration: number;
  mediaType: 'audio' | 'video';
  previewUrl: string;
}

interface RecordingContextValue {
  recorderState: RecorderState;
  captureMethod: 'mic' | 'video' | 'import';
  setCaptureMethod: (m: 'mic' | 'video' | 'import') => void;
  facingMode: 'user' | 'environment';
  setFacingMode: (f: 'user' | 'environment') => void;
  isRecordingModalOpen: boolean;
  setIsRecordingModalOpen: (open: boolean) => void;
  finishedRecording: FinishedRecording | null;
  setFinishedRecording: React.Dispatch<React.SetStateAction<FinishedRecording | null>>;
  startAudio: () => Promise<void>;
  startVideo: (videoEl: HTMLVideoElement | null, facing: 'user' | 'environment') => Promise<void>;
  pauseOrResume: () => void;
  switchCamera: () => Promise<'user' | 'environment'>;
  capturePhotoFromVideo: () => Promise<Blob | null>;
  acquirePhotoStream: (facing: 'user' | 'environment') => Promise<MediaStream>;
  stopRecording: () => Promise<FinishedRecording | null>;
  cancelRecording: () => void;
  appWasBackgrounded: boolean;
}

const DEFAULT_STATE: RecorderState = {
  isRecording: false,
  isPaused: false,
  durationSeconds: 0,
  audioLevel: 0,
  mode: 'audio',
  facingMode: 'user',
  error: null,
};

const RecordingContext = createContext<RecordingContextValue | null>(null);

export const RecordingProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const managerRef = useRef<MediaRecordingManager | null>(null);
  const wakeLockRef = useRef<{ release: () => Promise<void> } | null>(null);

  const [recorderState, setRecorderState] = useState<RecorderState>(DEFAULT_STATE);
  const [captureMethod, setCaptureMethod] = useState<'mic' | 'video' | 'import'>('mic');
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('user');
  const [isRecordingModalOpen, setIsRecordingModalOpen] = useState(false);
  const [finishedRecording, setFinishedRecording] = useState<FinishedRecording | null>(null);
  const [appWasBackgrounded, setAppWasBackgrounded] = useState(false);

  useEffect(() => {
    managerRef.current = new MediaRecordingManager((state) => {
      setRecorderState(state);
    });
    return () => {
      managerRef.current?.cancel();
      wakeLockRef.current?.release().catch(() => {});
    };
  }, []);

  // Track app background/foreground transitions & register MediaSession while recording
  useEffect(() => {
    const handleVisibility = () => {
      if (recorderState.isRecording && document.visibilityState === 'hidden') {
        setAppWasBackgrounded(true);
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);
    return () => document.removeEventListener('visibilitychange', handleVisibility);
  }, [recorderState.isRecording]);

  useEffect(() => {
    if (!recorderState.isRecording) {
      setAppWasBackgrounded(false);
      if (wakeLockRef.current) {
        wakeLockRef.current.release().catch(() => {});
        wakeLockRef.current = null;
      }
      return;
    }

    // Request WakeLock silently when recording so mobile devices don't kill capture abruptly
    const nav = navigator as Navigator & {
      wakeLock?: { request: (type: 'screen') => Promise<{ release: () => Promise<void> }> };
    };
    if (nav.wakeLock?.request && !wakeLockRef.current) {
      nav.wakeLock
        .request('screen')
        .then((sentinel) => {
          wakeLockRef.current = sentinel;
        })
        .catch(() => {});
    }

    // Register MediaSession metadata so Android notification tray displays SHALOM recording status
    if ('mediaSession' in navigator && typeof MediaMetadata !== 'undefined') {
      try {
        navigator.mediaSession.metadata = new MediaMetadata({
          title:
            recorderState.mode === 'video'
              ? 'Enregistrement vidéo en cours'
              : 'Enregistrement audio en cours',
          artist: 'SHALOM · Parole Divine',
          album: 'Capture active',
        });
        navigator.mediaSession.playbackState = recorderState.isPaused ? 'paused' : 'playing';
      } catch {
        // ignore if unsupported
      }
    }
  }, [recorderState.isRecording, recorderState.isPaused, recorderState.mode]);

  const startAudio = useCallback(async () => {
    if (!managerRef.current) return;
    setCaptureMethod('mic');
    await managerRef.current.startAudioRecording();
  }, []);

  const startVideo = useCallback(
    async (videoEl: HTMLVideoElement | null, facing: 'user' | 'environment') => {
      if (!managerRef.current) return;
      setCaptureMethod('video');
      setFacingMode(facing);
      await managerRef.current.startVideoRecording(videoEl, facing);
    },
    []
  );

  const pauseOrResume = useCallback(() => {
    if (!managerRef.current) return;
    if (recorderState.isPaused) {
      managerRef.current.resume();
    } else {
      managerRef.current.pause();
    }
  }, [recorderState.isPaused]);

  const switchCamera = useCallback(async () => {
    if (!managerRef.current) return facingMode;
    const next = await managerRef.current.switchCamera();
    setFacingMode(next);
    return next;
  }, [facingMode]);

  const capturePhotoFromVideo = useCallback(async () => {
    if (!managerRef.current) return null;
    return managerRef.current.capturePhotoFromActiveVideo();
  }, []);

  const acquirePhotoStream = useCallback(async (facing: 'user' | 'environment') => {
    if (!managerRef.current) {
      return navigator.mediaDevices.getUserMedia({ video: { facingMode: facing } });
    }
    return managerRef.current.acquireVideoCameraStream(facing);
  }, []);

  const stopRecording = useCallback(async (): Promise<FinishedRecording | null> => {
    if (!managerRef.current) return null;
    const result = await managerRef.current.stop();
    if (!result.blob || result.blob.size === 0) return null;
    const previewUrl = URL.createObjectURL(result.blob);
    const finished: FinishedRecording = {
      blob: result.blob,
      mimeType: result.mimeType,
      duration: result.duration,
      mediaType: recorderState.mode === 'video' ? 'video' : 'audio',
      previewUrl,
    };
    setFinishedRecording(finished);
    return finished;
  }, [recorderState.mode]);

  const cancelRecording = useCallback(() => {
    managerRef.current?.cancel();
  }, []);

  return (
    <RecordingContext.Provider
      value={{
        recorderState,
        captureMethod,
        setCaptureMethod,
        facingMode,
        setFacingMode,
        isRecordingModalOpen,
        setIsRecordingModalOpen,
        finishedRecording,
        setFinishedRecording,
        startAudio,
        startVideo,
        pauseOrResume,
        switchCamera,
        capturePhotoFromVideo,
        acquirePhotoStream,
        stopRecording,
        cancelRecording,
        appWasBackgrounded,
      }}
    >
      {children}
    </RecordingContext.Provider>
  );
};

export function useGlobalRecording(): RecordingContextValue {
  const ctx = useContext(RecordingContext);
  if (!ctx) {
    throw new Error('useGlobalRecording must be used within RecordingProvider');
  }
  return ctx;
}
