// Audio & Video MediaRecorder Service for SHALOM
// Reliable capture with live audio level metering, native codec fallback,
// and seamless live front/back camera switching during video recording

export interface RecorderState {
  isRecording: boolean;
  isPaused: boolean;
  durationSeconds: number;
  audioLevel: number; // 0 to 100
  mode: 'audio' | 'video';
  facingMode: 'user' | 'environment';
  error: string | null;
}

export class MediaRecordingManager {
  private mediaRecorder: MediaRecorder | null = null;
  private recordedChunks: Blob[] = [];
  private mediaStream: MediaStream | null = null;
  private videoSourceStream: MediaStream | null = null;
  private audioSourceStream: MediaStream | null = null;
  private previewVideoElement: HTMLVideoElement | null = null;
  private hiddenSourceVideo: HTMLVideoElement | null = null;
  private compositeCanvas: HTMLCanvasElement | null = null;
  private compositeAnimFrame: number | null = null;
  private timerInterval: number | null = null;
  private audioContext: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private levelAnimFrame: number | null = null;
  private onStateChangeCallback: ((state: RecorderState) => void) | null = null;

  public state: RecorderState = {
    isRecording: false,
    isPaused: false,
    durationSeconds: 0,
    audioLevel: 0,
    mode: 'audio',
    facingMode: 'user',
    error: null,
  };

  constructor(onStateChange?: (state: RecorderState) => void) {
    if (onStateChange) this.onStateChangeCallback = onStateChange;
  }

  private notify() {
    if (this.onStateChangeCallback) {
      this.onStateChangeCallback({ ...this.state });
    }
  }

  public static isSupported(): { audio: boolean; video: boolean } {
    const hasMediaDevices = !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
    const hasMediaRecorder = typeof window !== 'undefined' && 'MediaRecorder' in window;
    return {
      audio: hasMediaDevices && hasMediaRecorder,
      video: hasMediaDevices && hasMediaRecorder,
    };
  }

  public static getBestMimeType(mode: 'audio' | 'video'): string | undefined {
    if (typeof MediaRecorder === 'undefined' || !MediaRecorder.isTypeSupported) {
      return undefined;
    }

    if (mode === 'audio') {
      const audioTypes = [
        'audio/webm;codecs=opus',
        'audio/webm',
        'audio/mp4',
        'audio/ogg;codecs=opus',
        'audio/ogg',
      ];
      for (const t of audioTypes) {
        if (MediaRecorder.isTypeSupported(t)) {
          return t;
        }
      }
      return undefined;
    } else {
      const videoTypes = [
        'video/webm;codecs=vp8,opus',
        'video/webm;codecs=vp9,opus',
        'video/webm',
        'video/mp4',
      ];
      for (const t of videoTypes) {
        if (MediaRecorder.isTypeSupported(t)) {
          return t;
        }
      }
      return undefined;
    }
  }

  private startAudioLevelMeter(stream: MediaStream) {
    try {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtx) return;

      const ctx = new AudioCtx();
      if (ctx.state === 'suspended') {
        ctx.resume().catch(() => {});
      }
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);

      this.audioContext = ctx;
      this.analyser = analyser;

      const dataArray = new Uint8Array(analyser.frequencyBinCount);
      const updateLevel = () => {
        if (!this.analyser || !this.state.isRecording) return;
        if (this.state.isPaused) {
          this.state.audioLevel = 0;
          this.notify();
          this.levelAnimFrame = requestAnimationFrame(updateLevel);
          return;
        }

        this.analyser.getByteFrequencyData(dataArray);
        let sum = 0;
        for (let i = 0; i < dataArray.length; i++) {
          sum += dataArray[i];
        }
        const average = sum / dataArray.length;
        const normalized = Math.min(100, Math.round((average / 128) * 100));
        this.state.audioLevel = normalized;
        this.notify();
        this.levelAnimFrame = requestAnimationFrame(updateLevel);
      };

      this.levelAnimFrame = requestAnimationFrame(updateLevel);
    } catch {
      // Non-critical if AudioContext unavailable
    }
  }

  private createRecorder(stream: MediaStream, mode: 'audio' | 'video'): MediaRecorder {
    const preferredMime = MediaRecordingManager.getBestMimeType(mode);
    if (preferredMime) {
      try {
        return new MediaRecorder(stream, { mimeType: preferredMime });
      } catch {
        // Fallback to browser default
      }
    }
    return new MediaRecorder(stream);
  }

  public async startAudioRecording(): Promise<MediaStream> {
    this.cleanup();
    this.state = {
      isRecording: false,
      isPaused: false,
      durationSeconds: 0,
      audioLevel: 0,
      mode: 'audio',
      facingMode: 'user',
      error: null,
    };

    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error("L'API microphone n'est pas prise en charge sur cet appareil.");
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });

      const audioTracks = stream.getAudioTracks();
      if (audioTracks.length === 0) {
        throw new Error('Aucun microphone détecté sur cet appareil.');
      }
      audioTracks.forEach((t) => {
        t.enabled = true;
      });

      this.mediaStream = stream;
      this.audioSourceStream = stream;
      this.recordedChunks = [];
      this.mediaRecorder = this.createRecorder(stream, 'audio');

      this.mediaRecorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) {
          this.recordedChunks.push(e.data);
        }
      };

      this.mediaRecorder.onerror = () => {
        this.state.error = "Erreur pendant l'enregistrement audio.";
        this.notify();
      };

      this.mediaRecorder.start(250);
      this.startTimer();

      this.state.isRecording = true;
      this.state.isPaused = false;
      this.notify();
      this.startAudioLevelMeter(stream);

      return stream;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Erreur d'accès au microphone";
      this.state.error = msg;
      this.notify();
      throw err;
    }
  }

  public async acquireVideoCameraStream(facingMode: 'user' | 'environment'): Promise<MediaStream> {
    const isPortrait =
      typeof window !== 'undefined' && window.innerHeight >= window.innerWidth;
    const idealW = isPortrait ? 720 : 1280;
    const idealH = isPortrait ? 1280 : 720;
    const idealRatio = idealW / idealH;

    try {
      return await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { exact: facingMode },
          width: { ideal: idealW },
          height: { ideal: idealH },
          aspectRatio: { ideal: idealRatio },
        },
      });
    } catch {
      return await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: facingMode },
          width: { ideal: idealW },
          height: { ideal: idealH },
          aspectRatio: { ideal: idealRatio },
        },
      });
    }
  }

  public static async capturePhotoFromVideoElement(
    videoEl: HTMLVideoElement | null
  ): Promise<Blob | null> {
    if (!videoEl || videoEl.readyState < 2 || videoEl.videoWidth === 0 || videoEl.videoHeight === 0) {
      return null;
    }
    const canvas = document.createElement('canvas');
    canvas.width = videoEl.videoWidth;
    canvas.height = videoEl.videoHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.drawImage(videoEl, 0, 0, canvas.width, canvas.height);
    return new Promise((resolve) => {
      canvas.toBlob((blob) => resolve(blob), 'image/jpeg', 0.92);
    });
  }

  public async capturePhotoFromActiveVideo(): Promise<Blob | null> {
    const targetVideo =
      this.hiddenSourceVideo && this.hiddenSourceVideo.videoWidth > 0
        ? this.hiddenSourceVideo
        : this.previewVideoElement;
    return MediaRecordingManager.capturePhotoFromVideoElement(targetVideo);
  }

  private startCanvasCompositor() {
    if (!this.compositeCanvas || !this.hiddenSourceVideo) return;
    const canvas = this.compositeCanvas;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const drawLoop = () => {
      if (!this.state.isRecording && !this.compositeCanvas) return;
      const vid = this.hiddenSourceVideo;
      if (vid && vid.readyState >= 2 && vid.videoWidth > 0 && vid.videoHeight > 0) {
        if (canvas.width !== vid.videoWidth || canvas.height !== vid.videoHeight) {
          canvas.width = vid.videoWidth;
          canvas.height = vid.videoHeight;
        }
        ctx.drawImage(vid, 0, 0, canvas.width, canvas.height);
      }
      this.compositeAnimFrame = requestAnimationFrame(drawLoop);
    };

    this.compositeAnimFrame = requestAnimationFrame(drawLoop);
  }

  public async startVideoRecording(
    videoElement?: HTMLVideoElement | null,
    facingMode: 'user' | 'environment' = 'user'
  ): Promise<MediaStream> {
    this.cleanup();
    this.state = {
      isRecording: false,
      isPaused: false,
      durationSeconds: 0,
      audioLevel: 0,
      mode: 'video',
      facingMode,
      error: null,
    };

    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error("L'accès à la caméra n'est pas disponible sur cet appareil.");
      }

      this.previewVideoElement = videoElement || null;

      // Keep audio stream separate so switching cameras never interrupts the mic
      const audioStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      audioStream.getAudioTracks().forEach((t) => {
        t.enabled = true;
      });
      this.audioSourceStream = audioStream;

      const videoStream = await this.acquireVideoCameraStream(facingMode);
      this.videoSourceStream = videoStream;

      // Setup preview
      if (this.previewVideoElement) {
        this.previewVideoElement.srcObject = videoStream;
        this.previewVideoElement.muted = true;
        await this.previewVideoElement.play().catch(() => {});
      }

      // Setup offscreen canvas pipeline so camera tracks can swap live seamlessly
      const isPortrait =
        typeof window !== 'undefined' && window.innerHeight >= window.innerWidth;
      const trackSettings = videoStream.getVideoTracks()[0]?.getSettings?.();

      const srcVideo = document.createElement('video');
      srcVideo.muted = true;
      srcVideo.playsInline = true;
      srcVideo.autoplay = true;
      srcVideo.srcObject = videoStream;
      await srcVideo.play().catch(() => {});

      if (srcVideo.videoWidth === 0 || srcVideo.videoHeight === 0) {
        await new Promise<void>((resolve) => {
          const timer = window.setTimeout(resolve, 800);
          srcVideo.onloadedmetadata = () => {
            clearTimeout(timer);
            resolve();
          };
        });
      }
      this.hiddenSourceVideo = srcVideo;

      const canvas = document.createElement('canvas');
      canvas.width =
        srcVideo.videoWidth ||
        trackSettings?.width ||
        (isPortrait ? 720 : 1280);
      canvas.height =
        srcVideo.videoHeight ||
        trackSettings?.height ||
        (isPortrait ? 1280 : 720);
      this.compositeCanvas = canvas;

      let recordingStream: MediaStream;
      if (typeof canvas.captureStream === 'function') {
        const canvasStream = canvas.captureStream(30);
        recordingStream = new MediaStream([
          ...canvasStream.getVideoTracks(),
          ...audioStream.getAudioTracks(),
        ]);
      } else {
        recordingStream = new MediaStream([
          ...videoStream.getVideoTracks(),
          ...audioStream.getAudioTracks(),
        ]);
      }

      this.mediaStream = recordingStream;
      this.recordedChunks = [];
      this.mediaRecorder = this.createRecorder(recordingStream, 'video');

      this.mediaRecorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) {
          this.recordedChunks.push(e.data);
        }
      };

      this.mediaRecorder.start(500);
      this.startTimer();

      this.state.isRecording = true;
      this.state.isPaused = false;
      this.notify();

      this.startCanvasCompositor();
      this.startAudioLevelMeter(audioStream);

      return videoStream;
    } catch (err: unknown) {
      this.cleanup();
      const msg = err instanceof Error ? err.message : "Erreur d'accès à la caméra";
      this.state.error = msg;
      this.notify();
      throw err;
    }
  }

  public async switchCamera(): Promise<'user' | 'environment'> {
    if (this.state.mode !== 'video' || !this.state.isRecording) {
      const next = this.state.facingMode === 'user' ? 'environment' : 'user';
      this.state.facingMode = next;
      this.notify();
      return next;
    }

    const nextFacing: 'user' | 'environment' =
      this.state.facingMode === 'user' ? 'environment' : 'user';

    // Stop previous camera hardware tracks first (mobile devices often allow only 1 camera open at once)
    if (this.videoSourceStream) {
      this.videoSourceStream.getVideoTracks().forEach((t) => t.stop());
      this.videoSourceStream = null;
    }

    try {
      const newVideoStream = await this.acquireVideoCameraStream(nextFacing);
      this.videoSourceStream = newVideoStream;

      if (this.hiddenSourceVideo) {
        this.hiddenSourceVideo.srcObject = newVideoStream;
        await this.hiddenSourceVideo.play().catch(() => {});
      }

      if (this.previewVideoElement) {
        this.previewVideoElement.srcObject = newVideoStream;
        this.previewVideoElement.muted = true;
        await this.previewVideoElement.play().catch(() => {});
      }

      // If browser didn't support canvas.captureStream, update direct MediaStream tracks
      if (this.mediaStream && (!this.compositeCanvas || typeof this.compositeCanvas.captureStream !== 'function')) {
        this.mediaStream.getVideoTracks().forEach((t) => {
          this.mediaStream?.removeTrack(t);
          t.stop();
        });
        newVideoStream.getVideoTracks().forEach((t) => this.mediaStream?.addTrack(t));
      }

      this.state.facingMode = nextFacing;
      this.state.error = null;
      this.notify();
      return nextFacing;
    } catch {
      // Restore previous facing mode if device only has one camera
      try {
        const fallbackStream = await this.acquireVideoCameraStream(this.state.facingMode);
        this.videoSourceStream = fallbackStream;
        if (this.hiddenSourceVideo) {
          this.hiddenSourceVideo.srcObject = fallbackStream;
          await this.hiddenSourceVideo.play().catch(() => {});
        }
        if (this.previewVideoElement) {
          this.previewVideoElement.srcObject = fallbackStream;
          await this.previewVideoElement.play().catch(() => {});
        }
      } catch {
        // ignore
      }
      throw new Error("Impossible de basculer vers l'autre caméra sur cet appareil.");
    }
  }

  public pause(): void {
    if (this.mediaRecorder && this.state.isRecording && !this.state.isPaused) {
      if (this.mediaRecorder.state === 'recording') {
        this.mediaRecorder.pause();
      }
      this.pauseTimer();
      this.state.isPaused = true;
      this.notify();
    }
  }

  public resume(): void {
    if (this.mediaRecorder && this.state.isRecording && this.state.isPaused) {
      if (this.mediaRecorder.state === 'paused') {
        this.mediaRecorder.resume();
      }
      this.startTimer();
      this.state.isPaused = false;
      this.notify();
    }
  }

  public async stop(): Promise<{ blob: Blob; mimeType: string; duration: number }> {
    return new Promise((resolve, reject) => {
      if (!this.mediaRecorder) {
        reject(new Error('Aucun enregistrement en cours'));
        return;
      }

      const recorder = this.mediaRecorder;
      const fallbackMime = this.state.mode === 'audio' ? 'audio/webm' : 'video/webm';
      const mimeType = recorder.mimeType || this.recordedChunks[0]?.type || fallbackMime;
      const duration = Math.max(1, this.state.durationSeconds);

      if (recorder.state === 'inactive') {
        const finalBlob = new Blob(this.recordedChunks, { type: mimeType });
        this.cleanup();
        this.state.isRecording = false;
        this.state.isPaused = false;
        this.state.audioLevel = 0;
        this.notify();
        resolve({ blob: finalBlob, mimeType, duration });
        return;
      }

      recorder.onstop = () => {
        const finalBlob = new Blob(this.recordedChunks, { type: mimeType });
        this.cleanup();
        this.state.isRecording = false;
        this.state.isPaused = false;
        this.state.audioLevel = 0;
        this.notify();
        resolve({ blob: finalBlob, mimeType, duration });
      };

      try {
        recorder.requestData();
      } catch {
        // Ignore if not supported
      }
      recorder.stop();
    });
  }

  public cancel(): void {
    try {
      if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
        this.mediaRecorder.onstop = null;
        this.mediaRecorder.stop();
      }
    } catch {
      // ignore
    }
    this.cleanup();
    this.state = {
      isRecording: false,
      isPaused: false,
      durationSeconds: 0,
      audioLevel: 0,
      mode: 'audio',
      facingMode: 'user',
      error: null,
    };
    this.notify();
  }

  private startTimer() {
    if (this.timerInterval) clearInterval(this.timerInterval);
    this.timerInterval = window.setInterval(() => {
      this.state.durationSeconds += 1;
      this.notify();
    }, 1000);
  }

  private pauseTimer() {
    if (this.timerInterval) {
      clearInterval(this.timerInterval);
      this.timerInterval = null;
    }
  }

  private cleanup() {
    this.pauseTimer();
    if (this.levelAnimFrame) {
      cancelAnimationFrame(this.levelAnimFrame);
      this.levelAnimFrame = null;
    }
    if (this.compositeAnimFrame) {
      cancelAnimationFrame(this.compositeAnimFrame);
      this.compositeAnimFrame = null;
    }
    if (this.audioContext) {
      this.audioContext.close().catch(() => {});
      this.audioContext = null;
      this.analyser = null;
    }
    if (this.hiddenSourceVideo) {
      this.hiddenSourceVideo.srcObject = null;
      this.hiddenSourceVideo = null;
    }
    if (this.previewVideoElement) {
      this.previewVideoElement.srcObject = null;
      this.previewVideoElement = null;
    }
    this.compositeCanvas = null;

    [this.videoSourceStream, this.audioSourceStream, this.mediaStream].forEach((s) => {
      if (s) s.getTracks().forEach((track) => track.stop());
    });
    this.videoSourceStream = null;
    this.audioSourceStream = null;
    this.mediaStream = null;
  }
}
