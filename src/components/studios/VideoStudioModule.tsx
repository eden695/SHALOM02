import React, { useState, useRef, useEffect, useMemo } from 'react';
import {
  Film,
  Upload,
  Music,
  ArrowUp,
  ArrowDown,
  Trash2,
  Download,
  Share2,
  Save,
  Loader2,
  CheckCircle2,
  Play,
  Square,
  Image as ImageIcon,
  Video as VideoIcon,
  Plus,
  Type,
  Shapes,
  Mic,
  Copy,
  Archive,
  Palette,
  ArrowLeft,
  Scissors,
  Globe,
  Sparkles,
} from 'lucide-react';
import { useShalomDB } from '../../hooks/useShalomDB';
import { dbService, STORES } from '../../services/db';
import { useLanguage } from '../../contexts/LanguageContext';
import {
  DownloadedStudioAsset,
  RecordedParole,
  StudioProjectRecord,
  VaultDocument,
} from '../../types';
import { SocialShareModal } from '../common/SocialShareModal';
import { SharePayload } from '../../services/socialShare';
import { StudioHomePanel, StudioTemplateCard } from './StudioHomePanel';
import { OnlineResourceModal } from './OnlineResourceModal';

type AspectMode = '9:16' | '16:9' | '1:1' | '4:5';
type CustomShapeKind = 'none' | 'rect' | 'circle' | 'star' | 'cross' | 'heart';
type VideoFilterKind = 'none' | 'warm' | 'bw' | 'sepia' | 'bright' | 'contrast';
type SceneTransitionKind = 'cut' | 'fade';

interface VideoScene {
  id: string;
  kind: 'custom' | 'image' | 'video';
  name: string;
  durationSec: number;
  objectUrl?: string;
  blobKey?: string;
  sourceBlob?: Blob;
  imageEl?: HTMLImageElement;
  videoEl?: HTMLVideoElement;
  trimStartSec: number;
  trimEndSec: number;
  fitMode: 'contain' | 'cover';
  kenBurns: boolean;
  volume: number;
  playbackRate: number;
  filter: VideoFilterKind;
  transition: SceneTransitionKind;
  bgType: 'solid' | 'gradient';
  bgColor: string;
  bgColor2: string;
  shape: CustomShapeKind;
  shapeColor: string;
  text: string;
  textColor: string;
  fontSize: number;
  fontFamily: string;
}

interface OverlayLayer {
  id: string;
  kind: 'text' | 'shape' | 'image';
  label: string;
  startSec: number;
  endSec: number;
  xPct: number;
  yPct: number;
  size: number;
  color: string;
  bgBadge: boolean;
  opacity: number;
  text?: string;
  fontFamily?: string;
  shape?: Exclude<CustomShapeKind, 'none'>;
  imageEl?: HTMLImageElement;
  objectUrl?: string;
  blobKey?: string;
  sourceBlob?: Blob;
}

interface VideoAudioTrack {
  id: string;
  name: string;
  objectUrl: string;
  blobKey?: string;
  sourceBlob?: Blob;
  startSec: number;
  volume: number;
}

interface SerializedVideoProject {
  version: 1;
  aspectMode: AspectMode;
  canvasBgColor: string;
  scenes: Array<
    Omit<VideoScene, 'objectUrl' | 'imageEl' | 'videoEl' | 'sourceBlob'> & { blobKey?: string }
  >;
  overlays: Array<Omit<OverlayLayer, 'objectUrl' | 'imageEl' | 'sourceBlob'> & { blobKey?: string }>;
  audioTracks: Array<Omit<VideoAudioTrack, 'objectUrl' | 'sourceBlob'> & { blobKey?: string }>;
}

const VIDEO_TEMPLATES: StudioTemplateCard[] = [
  {
    id: 'verset_anime',
    title: 'Verset animé 9:16',
    subtitle: '2 scènes · Accroche & Verset biblique',
    formatLabel: '9:16',
    previewBg: 'linear-gradient(160deg, #0b1f42 0%, #1d4ed8 100%)',
    previewAccent: '#fbbf24',
    sampleHeading: 'Parole de Vie · Psaume 23',
    sampleSub: 'Format Story / Reel prêt à exporter',
  },
  {
    id: 'invitation_video',
    title: 'Invitation Culte 16:9',
    subtitle: '2 scènes · Annonce & Horaires',
    formatLabel: '16:9',
    previewBg: 'linear-gradient(135deg, #4c1d95 0%, #be185d 100%)',
    previewAccent: '#fde68a',
    sampleHeading: 'Invitation Spéciale',
    sampleSub: 'Vidéo d’annonce 16:9',
  },
  {
    id: 'temoignage_video',
    title: 'Témoignage illustré',
    subtitle: '3 scènes · Ouverture, Message, Gloire à Dieu',
    formatLabel: '1:1',
    previewBg: 'linear-gradient(135deg, #064e3b 0%, #059669 100%)',
    previewAccent: '#fcd34d',
    sampleHeading: 'Témoignage de Reconnaissance',
    sampleSub: 'Prêt pour voix-off & musique',
  },
];

function getDims(mode: AspectMode): { w: number; h: number } {
  switch (mode) {
    case '16:9':
      return { w: 1280, h: 720 };
    case '1:1':
      return { w: 960, h: 960 };
    case '4:5':
      return { w: 864, h: 1080 };
    case '9:16':
    default:
      return { w: 720, h: 1280 };
  }
}

function getCssFilter(f: VideoFilterKind): string {
  switch (f) {
    case 'warm':
      return 'sepia(0.28) saturate(1.25) contrast(1.04)';
    case 'bw':
      return 'grayscale(1) contrast(1.12)';
    case 'sepia':
      return 'sepia(0.85)';
    case 'bright':
      return 'brightness(1.18) saturate(1.08)';
    case 'contrast':
      return 'contrast(1.32) saturate(1.1)';
    default:
      return 'none';
  }
}

function drawVectorShape(
  ctx: CanvasRenderingContext2D,
  shape: Exclude<CustomShapeKind, 'none'>,
  cx: number,
  cy: number,
  size: number,
  color: string,
  opacity = 1
) {
  ctx.save();
  ctx.globalAlpha = opacity;
  ctx.fillStyle = color;
  const r = size / 2;

  if (shape === 'rect') {
    ctx.fillRect(cx - r, cy - r, size, size);
  } else if (shape === 'circle') {
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();
  } else if (shape === 'cross') {
    const thick = size * 0.24;
    ctx.fillRect(cx - thick / 2, cy - r, thick, size);
    ctx.fillRect(cx - r * 0.72, cy - r * 0.35, r * 1.44, thick);
  } else if (shape === 'star') {
    ctx.beginPath();
    for (let i = 0; i < 10; i++) {
      const rad = i % 2 === 0 ? r : r * 0.44;
      const angle = (Math.PI / 5) * i - Math.PI / 2;
      const x = cx + Math.cos(angle) * rad;
      const y = cy + Math.sin(angle) * rad;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.fill();
  } else if (shape === 'heart') {
    ctx.beginPath();
    const topCurve = r * 0.3;
    ctx.moveTo(cx, cy + r * 0.85);
    ctx.bezierCurveTo(cx - r * 1.2, cy + r * 0.1, cx - r * 0.9, cy - r * 0.9, cx, cy - topCurve);
    ctx.bezierCurveTo(cx + r * 0.9, cy - r * 0.9, cx + r * 1.2, cy + r * 0.1, cx, cy + r * 0.85);
    ctx.fill();
  }
  ctx.restore();
}

function wrapLines(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const paragraphs = text.split('\n');
  const lines: string[] = [];
  for (const para of paragraphs) {
    const words = para.split(' ');
    let current = '';
    for (const w of words) {
      const test = current ? `${current} ${w}` : w;
      if (ctx.measureText(test).width > maxWidth && current) {
        lines.push(current);
        current = w;
      } else {
        current = test;
      }
    }
    lines.push(current);
  }
  return lines;
}

export const VideoStudioModule: React.FC = () => {
  const { lang } = useLanguage();
  const { userProfile, recordings, studioProjects, reloadData } = useShalomDB();
  const isEn = lang === 'en';

  const [viewMode, setViewMode] = useState<'home' | 'editor'>('home');
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null);

  const [aspectMode, setAspectMode] = useState<AspectMode>('9:16');
  const [canvasBgColor, setCanvasBgColor] = useState('#090d1a');
  const [projectTitle, setProjectTitle] = useState(
    isEn ? 'Untitled Video Project' : 'Nouvelle vidéo libre'
  );

  const [scenes, setScenes] = useState<VideoScene[]>([]);
  const [overlays, setOverlays] = useState<OverlayLayer[]>([]);
  const [audioTracks, setAudioTracks] = useState<VideoAudioTrack[]>([]);

  const [resourceModalOpen, setResourceModalOpen] = useState(false);

  const [isRecordingVoiceover, setIsRecordingVoiceover] = useState(false);
  const [voSeconds, setVoSeconds] = useState(0);
  const voRecorderRef = useRef<MediaRecorder | null>(null);
  const voStreamRef = useRef<MediaStream | null>(null);
  const voChunksRef = useRef<Blob[]>([]);
  const voTimerRef = useRef<number | null>(null);

  const [previewTimeSec, setPreviewTimeSec] = useState(0);
  const [previewFrameTick, setPreviewFrameTick] = useState(0);
  const [isPlayingPreview, setIsPlayingPreview] = useState(false);
  const previewRafRef = useRef<number | null>(null);

  const [isExporting, setIsExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState(0);
  const [exportedVideoUrl, setExportedVideoUrl] = useState<string | null>(null);
  const [exportedVideoBlob, setExportedVideoBlob] = useState<Blob | null>(null);
  const [exportedMimeType, setExportedMimeType] = useState('video/webm');
  const [notice, setNotice] = useState<string | null>(null);
  const [sharePayload, setSharePayload] = useState<SharePayload | null>(null);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const cancelExportRef = useRef(false);

  const dims = getDims(aspectMode);

  const recentVideoProjects = useMemo(
    () => studioProjects.filter((p) => p.studio === 'video'),
    [studioProjects]
  );

  const sceneTimingMap = useMemo(() => {
    let cursor = 0;
    return scenes.map((s) => {
      const dur =
        s.kind === 'video'
          ? Math.max(0.5, (s.trimEndSec - s.trimStartSec) / s.playbackRate)
          : Math.max(0.5, s.durationSec);
      const entry = { scene: s, start: cursor, end: cursor + dur, dur };
      cursor += dur;
      return entry;
    });
  }, [scenes]);

  const totalDurationSec = useMemo(
    () => (sceneTimingMap.length > 0 ? sceneTimingMap[sceneTimingMap.length - 1].end : 0),
    [sceneTimingMap]
  );

  useEffect(() => {
    return () => {
      if (voTimerRef.current) clearInterval(voTimerRef.current);
      if (previewRafRef.current) cancelAnimationFrame(previewRafRef.current);
      voStreamRef.current?.getTracks().forEach((t) => t.stop());
      if (exportedVideoUrl) URL.revokeObjectURL(exportedVideoUrl);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const drawSceneFrame = (
    ctx: CanvasRenderingContext2D,
    scene: VideoScene,
    localElapsed: number,
    segDur: number,
    w: number,
    h: number
  ) => {
    ctx.fillStyle = canvasBgColor;
    ctx.fillRect(0, 0, w, h);

    ctx.save();
    if (scene.transition === 'fade' && localElapsed < 0.45) {
      ctx.globalAlpha = Math.max(0.05, localElapsed / 0.45);
    }
    ctx.filter = getCssFilter(scene.filter || 'none');

    if (scene.kind === 'custom') {
      if (scene.bgType === 'gradient') {
        const g = ctx.createLinearGradient(0, 0, w, h);
        g.addColorStop(0, scene.bgColor);
        g.addColorStop(1, scene.bgColor2);
        ctx.fillStyle = g;
      } else {
        ctx.fillStyle = scene.bgColor;
      }
      ctx.fillRect(0, 0, w, h);

      if (scene.shape !== 'none') {
        drawVectorShape(
          ctx,
          scene.shape,
          w / 2,
          h * 0.34,
          Math.min(w, h) * 0.24,
          scene.shapeColor,
          0.92
        );
      }

      if (scene.text.trim()) {
        ctx.save();
        ctx.fillStyle = scene.textColor;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.font = `700 ${scene.fontSize}px ${scene.fontFamily}`;
        const lines = wrapLines(ctx, scene.text, w - 100);
        const lineHeight = scene.fontSize * 1.25;
        const baseY = scene.shape === 'none' ? h * 0.5 : h * 0.64;
        const startY = baseY - ((lines.length - 1) * lineHeight) / 2;
        lines.forEach((line, idx) => {
          ctx.fillText(line, w / 2, startY + idx * lineHeight);
        });
        ctx.restore();
      }
      ctx.restore();
      return;
    }

    const mediaEl = scene.kind === 'image' ? scene.imageEl : scene.videoEl;
    if (!mediaEl) {
      ctx.restore();
      return;
    }
    const srcW =
      scene.kind === 'image'
        ? (mediaEl as HTMLImageElement).width
        : (mediaEl as HTMLVideoElement).videoWidth || w;
    const srcH =
      scene.kind === 'image'
        ? (mediaEl as HTMLImageElement).height
        : (mediaEl as HTMLVideoElement).videoHeight || h;
    const sRatio = srcW / Math.max(1, srcH);
    const cRatio = w / h;

    let dw = w;
    let dh = h;
    if (scene.fitMode === 'contain') {
      if (sRatio > cRatio) {
        dw = w;
        dh = w / sRatio;
      } else {
        dh = h;
        dw = h * sRatio;
      }
    } else {
      if (sRatio > cRatio) {
        dh = h;
        dw = h * sRatio;
      } else {
        dw = w;
        dh = w / sRatio;
      }
    }

    const zoom = scene.kenBurns ? 1 + (localElapsed / Math.max(0.5, segDur)) * 0.08 : 1;
    dw *= zoom;
    dh *= zoom;
    const dx = (w - dw) / 2;
    const dy = (h - dh) / 2;
    ctx.drawImage(mediaEl, dx, dy, dw, dh);
    ctx.restore();
  };

  const drawOverlaysAtTime = (
    ctx: CanvasRenderingContext2D,
    timeSec: number,
    w: number,
    h: number
  ) => {
    for (const ov of overlays) {
      if (timeSec < ov.startSec || timeSec > ov.endSec) continue;
      const cx = (ov.xPct / 100) * w;
      const cy = (ov.yPct / 100) * h;

      ctx.save();
      ctx.globalAlpha = ov.opacity;

      if (ov.kind === 'text' && ov.text) {
        ctx.font = `700 ${ov.size}px ${ov.fontFamily || '"Outfit", sans-serif'}`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        const lines = wrapLines(ctx, ov.text, w - 80);
        const lh = ov.size * 1.25;
        if (ov.bgBadge) {
          const maxLineW = Math.max(...lines.map((l) => ctx.measureText(l).width), 40);
          const padX = 24;
          const padY = 14;
          const boxW = Math.min(w - 40, maxLineW + padX * 2);
          const boxH = lines.length * lh + padY * 2;
          ctx.fillStyle = 'rgba(8, 16, 36, 0.72)';
          ctx.beginPath();
          ctx.roundRect(cx - boxW / 2, cy - boxH / 2, boxW, boxH, 16);
          ctx.fill();
        }
        ctx.fillStyle = ov.color;
        const startY = cy - ((lines.length - 1) * lh) / 2;
        lines.forEach((line, i) => ctx.fillText(line, cx, startY + i * lh));
      } else if (ov.kind === 'shape' && ov.shape) {
        drawVectorShape(ctx, ov.shape, cx, cy, ov.size, ov.color, ov.opacity);
      } else if (ov.kind === 'image' && ov.imageEl) {
        const ratio = ov.imageEl.width / Math.max(1, ov.imageEl.height);
        const drawW = ov.size;
        const drawH = ov.size / ratio;
        ctx.drawImage(ov.imageEl, cx - drawW / 2, cy - drawH / 2, drawW, drawH);
      }

      ctx.restore();
    }
  };

  useEffect(() => {
    if (viewMode !== 'editor') return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.width = dims.w;
    canvas.height = dims.h;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.fillStyle = canvasBgColor;
    ctx.fillRect(0, 0, dims.w, dims.h);

    if (sceneTimingMap.length === 0) {
      drawOverlaysAtTime(ctx, previewTimeSec, dims.w, dims.h);
      return;
    }

    const match =
      sceneTimingMap.find((m) => previewTimeSec >= m.start && previewTimeSec <= m.end) ||
      sceneTimingMap[sceneTimingMap.length - 1];

    if (match) {
      const localElapsed = Math.max(0, previewTimeSec - match.start);
      if (match.scene.kind === 'video' && match.scene.videoEl && !isPlayingPreview) {
        const vid = match.scene.videoEl;
        const targetT = Math.min(
          match.scene.trimEndSec,
          match.scene.trimStartSec + localElapsed * match.scene.playbackRate
        );
        if (Math.abs(vid.currentTime - targetT) > 0.15) {
          vid.onseeked = () => setPreviewFrameTick((t) => t + 1);
          try {
            vid.currentTime = targetT;
          } catch {
            // ignore seek error before decode
          }
        }
      }
      drawSceneFrame(ctx, match.scene, localElapsed, match.dur, dims.w, dims.h);
    }

    drawOverlaysAtTime(ctx, previewTimeSec, dims.w, dims.h);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewMode, previewTimeSec, previewFrameTick, scenes, overlays, aspectMode, canvasBgColor, isPlayingPreview]);

  const startBlankVideoProject = (formatId?: string) => {
    const mode: AspectMode =
      formatId === '16:9' || formatId === '1:1' || formatId === '4:5' ? formatId : '9:16';
    setActiveProjectId(null);
    setAspectMode(mode);
    setCanvasBgColor('#090d1a');
    setProjectTitle(isEn ? 'Untitled Video' : 'Nouvelle vidéo');
    setScenes([]);
    setOverlays([]);
    setAudioTracks([]);
    setPreviewTimeSec(0);
    setExportedVideoUrl(null);
    setExportedVideoBlob(null);
    setNotice(null);
    setViewMode('editor');
  };

  const applyVideoTemplate = (templateId: string) => {
    setActiveProjectId(null);
    setOverlays([]);
    setAudioTracks([]);
    setPreviewTimeSec(0);
    setExportedVideoUrl(null);
    setExportedVideoBlob(null);
    setNotice(null);

    if (templateId === 'verset_anime') {
      setProjectTitle('Verset animé · Psaume 23');
      setAspectMode('9:16');
      setScenes([
        {
          id: `sc_${Date.now()}_1`,
          kind: 'custom',
          name: 'Accroche',
          durationSec: 3,
          trimStartSec: 0,
          trimEndSec: 3,
          fitMode: 'cover',
          kenBurns: false,
          volume: 1,
          playbackRate: 1,
          filter: 'none',
          transition: 'fade',
          bgType: 'gradient',
          bgColor: '#0b1f42',
          bgColor2: '#1d4ed8',
          shape: 'cross',
          shapeColor: '#fbbf24',
          text: 'PAROLE DE VIE\nPour ta journée',
          textColor: '#ffffff',
          fontSize: 48,
          fontFamily: '"Outfit", sans-serif',
        },
        {
          id: `sc_${Date.now()}_2`,
          kind: 'custom',
          name: 'Verset clé',
          durationSec: 5,
          trimStartSec: 0,
          trimEndSec: 5,
          fitMode: 'cover',
          kenBurns: false,
          volume: 1,
          playbackRate: 1,
          filter: 'none',
          transition: 'fade',
          bgType: 'gradient',
          bgColor: '#1e3a8a',
          bgColor2: '#0f172a',
          shape: 'star',
          shapeColor: '#fde68a',
          text: '« L’Éternel est mon berger :\nje ne manquerai de rien. »\nPsaume 23 : 1',
          textColor: '#ffffff',
          fontSize: 40,
          fontFamily: 'Georgia, "Times New Roman", serif',
        },
      ]);
    } else if (templateId === 'invitation_video') {
      setProjectTitle('Invitation Culte 16:9');
      setAspectMode('16:9');
      setScenes([
        {
          id: `sc_${Date.now()}_1`,
          kind: 'custom',
          name: 'Invitation',
          durationSec: 4,
          trimStartSec: 0,
          trimEndSec: 4,
          fitMode: 'cover',
          kenBurns: false,
          volume: 1,
          playbackRate: 1,
          filter: 'none',
          transition: 'fade',
          bgType: 'gradient',
          bgColor: '#4c1d95',
          bgColor2: '#be185d',
          shape: 'cross',
          shapeColor: '#fde68a',
          text: 'CULTE DE LOUANGE & ADORATION',
          textColor: '#ffffff',
          fontSize: 52,
          fontFamily: '"Outfit", sans-serif',
        },
        {
          id: `sc_${Date.now()}_2`,
          kind: 'custom',
          name: 'Détails',
          durationSec: 4,
          trimStartSec: 0,
          trimEndSec: 4,
          fitMode: 'cover',
          kenBurns: false,
          volume: 1,
          playbackRate: 1,
          filter: 'none',
          transition: 'fade',
          bgType: 'gradient',
          bgColor: '#1e1b4b',
          bgColor2: '#312e81',
          shape: 'none',
          shapeColor: '#fbbf24',
          text: 'Ce Dimanche à 09h30\nSoyez les bienvenus !',
          textColor: '#fef3c7',
          fontSize: 48,
          fontFamily: '"Plus Jakarta Sans", sans-serif',
        },
      ]);
    } else {
      setProjectTitle('Témoignage illustré');
      setAspectMode('1:1');
      setScenes([
        {
          id: `sc_${Date.now()}_1`,
          kind: 'custom',
          name: 'Introduction',
          durationSec: 3.5,
          trimStartSec: 0,
          trimEndSec: 3.5,
          fitMode: 'cover',
          kenBurns: false,
          volume: 1,
          playbackRate: 1,
          filter: 'none',
          transition: 'fade',
          bgType: 'gradient',
          bgColor: '#064e3b',
          bgColor2: '#059669',
          shape: 'heart',
          shapeColor: '#fcd34d',
          text: 'TÉMOIGNAGE\nLa fidélité de Dieu',
          textColor: '#ffffff',
          fontSize: 46,
          fontFamily: '"Outfit", sans-serif',
        },
        {
          id: `sc_${Date.now()}_2`,
          kind: 'custom',
          name: 'Cœur du message',
          durationSec: 4.5,
          trimStartSec: 0,
          trimEndSec: 4.5,
          fitMode: 'cover',
          kenBurns: false,
          volume: 1,
          playbackRate: 1,
          filter: 'none',
          transition: 'fade',
          bgType: 'gradient',
          bgColor: '#0f172a',
          bgColor2: '#065f46',
          shape: 'none',
          shapeColor: '#fbbf24',
          text: 'Merci Seigneur pour Ta grâce\ndans chaque saison.',
          textColor: '#ffffff',
          fontSize: 42,
          fontFamily: 'Georgia, "Times New Roman", serif',
        },
      ]);
    }
    setViewMode('editor');
  };

  const openSavedVideoProject = async (project: StudioProjectRecord) => {
    try {
      const parsed = JSON.parse(project.dataJson) as SerializedVideoProject;
      setActiveProjectId(project.id);
      setProjectTitle(project.title);
      setAspectMode(parsed.aspectMode || '9:16');
      setCanvasBgColor(parsed.canvasBgColor || '#090d1a');

      const hydratedScenes: VideoScene[] = [];
      for (const s of parsed.scenes || []) {
        if (s.kind === 'image' && s.blobKey) {
          const b = await dbService.getMediaBlob(s.blobKey);
          if (b) {
            const url = URL.createObjectURL(b);
            const img = await new Promise<HTMLImageElement>((resolve, reject) => {
              const el = new Image();
              el.onload = () => resolve(el);
              el.onerror = reject;
              el.src = url;
            });
            hydratedScenes.push({ ...s, objectUrl: url, imageEl: img });
          }
        } else if (s.kind === 'video' && s.blobKey) {
          const b = await dbService.getMediaBlob(s.blobKey);
          if (b) {
            const url = URL.createObjectURL(b);
            const vid = await new Promise<HTMLVideoElement>((resolve, reject) => {
              const el = document.createElement('video');
              el.playsInline = true;
              el.muted = true;
              el.preload = 'auto';
              el.onloadedmetadata = () => resolve(el);
              el.onerror = reject;
              el.src = url;
            });
            hydratedScenes.push({ ...s, objectUrl: url, videoEl: vid });
          }
        } else {
          hydratedScenes.push({ ...s });
        }
      }

      const hydratedOverlays: OverlayLayer[] = [];
      for (const o of parsed.overlays || []) {
        if (o.kind === 'image' && o.blobKey) {
          const b = await dbService.getMediaBlob(o.blobKey);
          if (b) {
            const url = URL.createObjectURL(b);
            const img = await new Promise<HTMLImageElement>((resolve, reject) => {
              const el = new Image();
              el.onload = () => resolve(el);
              el.onerror = reject;
              el.src = url;
            });
            hydratedOverlays.push({ ...o, objectUrl: url, imageEl: img });
          }
        } else {
          hydratedOverlays.push({ ...o });
        }
      }

      const hydratedAudio: VideoAudioTrack[] = [];
      for (const a of parsed.audioTracks || []) {
        if (a.blobKey) {
          const b = await dbService.getMediaBlob(a.blobKey);
          if (b) {
            hydratedAudio.push({ ...a, objectUrl: URL.createObjectURL(b) });
          }
        }
      }

      setScenes(hydratedScenes);
      setOverlays(hydratedOverlays);
      setAudioTracks(hydratedAudio);
      setPreviewTimeSec(0);
      setExportedVideoUrl(null);
      setExportedVideoBlob(null);
      setNotice(null);
      setViewMode('editor');
    } catch {
      setNotice(
        isEn ? 'Unable to open this video project.' : 'Impossible d’ouvrir ce projet vidéo.'
      );
    }
  };

  const handleDuplicateVideoProject = async (project: StudioProjectRecord) => {
    const now = new Date().toISOString();
    await dbService.put(STORES.STUDIO_PROJECTS, {
      ...project,
      id: `proj_vid_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`,
      title: `${project.title} (${isEn ? 'Copy' : 'Copie'})`,
      createdAt: now,
      updatedAt: now,
    });
    await reloadData();
  };

  const handleDeleteVideoProject = async (project: StudioProjectRecord) => {
    await dbService.deleteItem(STORES.STUDIO_PROJECTS, project.id);
    await reloadData();
  };

  const handleSaveEditableVideoProject = async () => {
    const uid = `${Date.now()}_${Math.random().toString(36).slice(2, 5)}`;

    const serScenes: SerializedVideoProject['scenes'] = [];
    const nextScenes: VideoScene[] = [];
    for (let i = 0; i < scenes.length; i++) {
      const s = scenes[i];
      let bKey = s.blobKey;
      if (!bKey && s.sourceBlob) {
        bKey = `blob_video_scene_${uid}_${i}`;
        await dbService.saveMediaBlob(bKey, s.sourceBlob, s.sourceBlob.type || 'application/octet-stream');
      }
      nextScenes.push({ ...s, blobKey: bKey });
      const { objectUrl: _ou, imageEl: _ie, videoEl: _ve, sourceBlob: _sb, ...rest } = s;
      serScenes.push({ ...rest, blobKey: bKey });
    }

    const serOverlays: SerializedVideoProject['overlays'] = [];
    const nextOverlays: OverlayLayer[] = [];
    for (let i = 0; i < overlays.length; i++) {
      const o = overlays[i];
      let bKey = o.blobKey;
      if (!bKey && o.sourceBlob) {
        bKey = `blob_video_ov_${uid}_${i}`;
        await dbService.saveMediaBlob(bKey, o.sourceBlob, o.sourceBlob.type || 'image/png');
      }
      nextOverlays.push({ ...o, blobKey: bKey });
      const { objectUrl: _ou, imageEl: _ie, sourceBlob: _sb, ...rest } = o;
      serOverlays.push({ ...rest, blobKey: bKey });
    }

    const serAudio: SerializedVideoProject['audioTracks'] = [];
    const nextAudio: VideoAudioTrack[] = [];
    for (let i = 0; i < audioTracks.length; i++) {
      const a = audioTracks[i];
      let bKey = a.blobKey;
      if (!bKey && a.sourceBlob) {
        bKey = `blob_video_aud_${uid}_${i}`;
        await dbService.saveMediaBlob(bKey, a.sourceBlob, a.sourceBlob.type || 'audio/webm');
      }
      nextAudio.push({ ...a, blobKey: bKey });
      const { objectUrl: _ou, sourceBlob: _sb, ...rest } = a;
      serAudio.push({ ...rest, blobKey: bKey });
    }

    setScenes(nextScenes);
    setOverlays(nextOverlays);
    setAudioTracks(nextAudio);

    const now = new Date().toISOString();
    const projectId = activeProjectId || `proj_vid_${uid}`;
    const existing = activeProjectId
      ? recentVideoProjects.find((p) => p.id === activeProjectId)
      : undefined;

    const record: StudioProjectRecord = {
      id: projectId,
      studio: 'video',
      title: projectTitle.trim() || (isEn ? 'Untitled Video' : 'Vidéo sans titre'),
      formatLabel: `${aspectMode} · ${scenes.length} scène(s)`,
      dataJson: JSON.stringify({
        version: 1,
        aspectMode,
        canvasBgColor,
        scenes: serScenes,
        overlays: serOverlays,
        audioTracks: serAudio,
      } satisfies SerializedVideoProject),
      createdAt: existing?.createdAt || now,
      updatedAt: now,
    };

    await dbService.put(STORES.STUDIO_PROJECTS, record);
    setActiveProjectId(projectId);
    await reloadData();
    setNotice(isEn ? 'Video project saved locally!' : 'Projet vidéo enregistré avec succès !');
  };

  const handleTogglePreviewPlay = () => {
    if (isPlayingPreview) {
      if (previewRafRef.current) cancelAnimationFrame(previewRafRef.current);
      setIsPlayingPreview(false);
      return;
    }
    if (totalDurationSec <= 0) return;
    const startOffset = previewTimeSec >= totalDurationSec - 0.1 ? 0 : previewTimeSec;
    const wallStart = performance.now();
    setIsPlayingPreview(true);

    const step = () => {
      const t = startOffset + (performance.now() - wallStart) / 1000;
      if (t >= totalDurationSec) {
        setPreviewTimeSec(0);
        setIsPlayingPreview(false);
        return;
      }
      setPreviewTimeSec(t);
      previewRafRef.current = requestAnimationFrame(step);
    };
    previewRafRef.current = requestAnimationFrame(step);
  };

  const addBlankCustomScene = () => {
    setScenes((prev) => [
      ...prev,
      {
        id: `scene_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`,
        kind: 'custom',
        name: `${isEn ? 'Custom Scene' : 'Scène libre'} #${prev.length + 1}`,
        durationSec: 4,
        trimStartSec: 0,
        trimEndSec: 4,
        fitMode: 'cover',
        kenBurns: false,
        volume: 1,
        playbackRate: 1,
        filter: 'none',
        transition: 'fade',
        bgType: 'gradient',
        bgColor: '#0f172a',
        bgColor2: '#1e3a8a',
        shape: 'none',
        shapeColor: '#fbbf24',
        text: isEn ? 'Your custom text here' : 'Votre texte ici',
        textColor: '#ffffff',
        fontSize: 42,
        fontFamily: '"Outfit", sans-serif',
      },
    ]);
  };

  const addMediaBlob = async (
    blob: Blob,
    name: string,
    kindHint?: 'image' | 'video',
    existingBlobKey?: string
  ) => {
    const kind: 'image' | 'video' =
      kindHint || (blob.type.startsWith('video/') ? 'video' : 'image');
    const url = URL.createObjectURL(blob);

    if (kind === 'image') {
      const img = await new Promise<HTMLImageElement>((resolve, reject) => {
        const el = new Image();
        el.onload = () => resolve(el);
        el.onerror = () => {
          URL.revokeObjectURL(url);
          reject(
            new Error(
              isEn ? 'Unable to load this image file.' : 'Impossible de charger ce fichier image.'
            )
          );
        };
        el.src = url;
      });
      const startAt = totalDurationSec;
      setScenes((prev) => [
        ...prev,
        {
          id: `scene_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`,
          kind: 'image',
          name,
          objectUrl: url,
          blobKey: existingBlobKey,
          sourceBlob: existingBlobKey ? undefined : blob,
          imageEl: img,
          durationSec: 4,
          trimStartSec: 0,
          trimEndSec: 4,
          fitMode: 'contain',
          kenBurns: true,
          volume: 1,
          playbackRate: 1,
          filter: 'none',
          transition: 'fade',
          bgType: 'solid',
          bgColor: '#000000',
          bgColor2: '#000000',
          shape: 'none',
          shapeColor: '#ffffff',
          text: '',
          textColor: '#ffffff',
          fontSize: 36,
          fontFamily: '"Outfit", sans-serif',
        },
      ]);
      setPreviewTimeSec(startAt);
    } else {
      const video = await new Promise<HTMLVideoElement>((resolve, reject) => {
        const el = document.createElement('video');
        el.playsInline = true;
        el.muted = true;
        el.preload = 'auto';

        let settled = false;
        const cleanup = () => {
          window.clearTimeout(timer);
          el.onloadeddata = null;
          el.onloadedmetadata = null;
          el.oncanplay = null;
          el.onerror = null;
        };

        const finishSuccess = () => {
          if (settled) return;
          if (!el.videoWidth && !el.videoHeight) {
            settled = true;
            cleanup();
            URL.revokeObjectURL(url);
            reject(
              new Error(
                isEn
                  ? 'This video codec is not supported by your browser (try WebM VP8/VP9 or MP4 H.264).'
                  : 'Ce codec vidéo n’est pas décodable par cet appareil (utilisez WebM VP8/VP9 ou MP4).'
              )
            );
            return;
          }
          settled = true;
          cleanup();
          resolve(el);
        };

        const timer = window.setTimeout(() => {
          if (settled) return;
          settled = true;
          cleanup();
          if (el.videoWidth > 0 || el.videoHeight > 0) {
            resolve(el);
          } else {
            URL.revokeObjectURL(url);
            reject(
              new Error(
                isEn
                  ? 'Video loading timed out or codec is unsupported.'
                  : 'Délai dépassé ou codec vidéo incompatible avec ce navigateur.'
              )
            );
          }
        }, 8000);

        el.onloadeddata = finishSuccess;
        el.oncanplay = finishSuccess;
        el.onloadedmetadata = () => {
          if (el.videoWidth > 0 && el.readyState >= 2) {
            finishSuccess();
          } else {
            try {
              el.currentTime = 0.05;
            } catch {
              // wait for loadeddata/canplay
            }
          }
        };
        el.onerror = () => {
          if (settled) return;
          settled = true;
          cleanup();
          URL.revokeObjectURL(url);
          reject(
            new Error(
              isEn
                ? 'Unable to decode this video file on this device.'
                : 'Impossible de lire cette vidéo sur cet appareil (codec non pris en charge).'
            )
          );
        };

        el.src = url;
        el.load();
      });

      const dur = Number.isFinite(video.duration) && video.duration > 0 ? video.duration : 5;
      const startAt = totalDurationSec;
      setScenes((prev) => [
        ...prev,
        {
          id: `scene_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`,
          kind: 'video',
          name,
          objectUrl: url,
          blobKey: existingBlobKey,
          sourceBlob: existingBlobKey ? undefined : blob,
          videoEl: video,
          durationSec: Number(dur.toFixed(1)),
          trimStartSec: 0,
          trimEndSec: Number(dur.toFixed(1)),
          fitMode: 'contain',
          kenBurns: false,
          volume: 1,
          playbackRate: 1,
          filter: 'none',
          transition: 'cut',
          bgType: 'solid',
          bgColor: '#000000',
          bgColor2: '#000000',
          shape: 'none',
          shapeColor: '#ffffff',
          text: '',
          textColor: '#ffffff',
          fontSize: 36,
          fontFamily: '"Outfit", sans-serif',
        },
      ]);
      setPreviewTimeSec(startAt);
      setPreviewFrameTick((t) => t + 1);
    }
  };

  const handleImportMediaFiles = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;
    for (let i = 0; i < files.length; i++) {
      try {
        await addMediaBlob(files[i], files[i].name);
      } catch {
        setNotice(isEn ? `Unable to load ${files[i].name}` : `Impossible de charger ${files[i].name}`);
      }
    }
    e.target.value = '';
  };

  const handleImportFromParole = async (recId: string) => {
    const rec = recordings.find((r) => r.id === recId);
    if (!rec?.blobKey) return;
    const blob = await dbService.getMediaBlob(rec.blobKey);
    if (!blob) return;
    await addMediaBlob(blob, rec.title, rec.mediaType === 'video' ? 'video' : undefined, rec.blobKey);
  };

  const handleSelectOnlineResource = async (asset: DownloadedStudioAsset, blob: Blob) => {
    if (asset.category === 'audio') {
      setAudioTracks((prev) => [
        ...prev,
        {
          id: `vaud_${Date.now()}`,
          name: asset.title,
          objectUrl: URL.createObjectURL(blob),
          blobKey: asset.blobKey,
          startSec: 0,
          volume: 0.55,
        },
      ]);
      setNotice(isEn ? 'Audio added to timeline!' : 'Musique / son ajouté à la piste audio !');
      return;
    }
    await addMediaBlob(
      blob,
      asset.title,
      asset.category === 'video' ? 'video' : 'image',
      asset.blobKey
    );
    setNotice(
      isEn
        ? `"${asset.title}" added to your video timeline!`
        : `« ${asset.title} » inséré dans les scènes du montage !`
    );
  };

  const handleSplitAtPlayhead = () => {
    if (sceneTimingMap.length === 0) return;
    const idx = sceneTimingMap.findIndex(
      (m) => previewTimeSec >= m.start && previewTimeSec <= m.end
    );
    const targetIdx = idx >= 0 ? idx : sceneTimingMap.length - 1;
    const match = sceneTimingMap[targetIdx];
    const s = match.scene;
    if (match.dur < 1.0) {
      setNotice(isEn ? 'Scene too short to split.' : 'Scène trop courte pour être scindée (< 1s).');
      return;
    }

    const localOffset =
      previewTimeSec > match.start + 0.4 && previewTimeSec < match.end - 0.4
        ? previewTimeSec - match.start
        : match.dur / 2;

    if (s.kind === 'video') {
      const splitVideoTime = Number(
        (s.trimStartSec + localOffset * s.playbackRate).toFixed(1)
      );
      if (splitVideoTime <= s.trimStartSec + 0.3 || splitVideoTime >= s.trimEndSec - 0.3) return;
      const partA: VideoScene = { ...s, trimEndSec: splitVideoTime, name: `${s.name} (1)` };
      const partB: VideoScene = {
        ...s,
        id: `scene_${Date.now()}_split`,
        trimStartSec: splitVideoTime,
        name: `${s.name} (2)`,
      };
      setScenes((prev) => [...prev.slice(0, targetIdx), partA, partB, ...prev.slice(targetIdx + 1)]);
    } else {
      const durA = Number(localOffset.toFixed(1));
      const durB = Number((s.durationSec - durA).toFixed(1));
      if (durA < 0.5 || durB < 0.5) return;
      const partA: VideoScene = { ...s, durationSec: durA, name: `${s.name} (1)` };
      const partB: VideoScene = {
        ...s,
        id: `scene_${Date.now()}_split`,
        durationSec: durB,
        name: `${s.name} (2)`,
      };
      setScenes((prev) => [...prev.slice(0, targetIdx), partA, partB, ...prev.slice(targetIdx + 1)]);
    }
    setNotice(isEn ? 'Scene split cleanly!' : 'Scène scindée en deux séquences !');
  };

  const addTextOverlay = () => {
    const dur = Math.max(4, totalDurationSec || 4);
    setOverlays((prev) => [
      ...prev,
      {
        id: `ov_${Date.now()}`,
        kind: 'text',
        label: `${isEn ? 'Text' : 'Texte'} #${prev.length + 1}`,
        startSec: 0,
        endSec: Number(dur.toFixed(1)),
        xPct: 50,
        yPct: 82,
        size: 34,
        color: '#ffffff',
        bgBadge: true,
        opacity: 1,
        text: isEn ? 'Your overlay text' : 'Votre texte superposé',
        fontFamily: '"Outfit", sans-serif',
      },
    ]);
  };

  const addShapeOverlay = () => {
    const dur = Math.max(4, totalDurationSec || 4);
    setOverlays((prev) => [
      ...prev,
      {
        id: `ov_${Date.now()}`,
        kind: 'shape',
        label: `${isEn ? 'Shape' : 'Forme'} #${prev.length + 1}`,
        startSec: 0,
        endSec: Number(dur.toFixed(1)),
        xPct: 50,
        yPct: 20,
        size: 90,
        color: '#fbbf24',
        bgBadge: false,
        opacity: 0.9,
        shape: 'star',
      },
    ]);
  };

  const handleUploadImageOverlay = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const dur = Math.max(4, totalDurationSec || 4);
      setOverlays((prev) => [
        ...prev,
        {
          id: `ov_${Date.now()}`,
          kind: 'image',
          label: file.name,
          startSec: 0,
          endSec: Number(dur.toFixed(1)),
          xPct: 85,
          yPct: 12,
          size: 110,
          color: '#ffffff',
          bgBadge: false,
          opacity: 1,
          imageEl: img,
          objectUrl: url,
          sourceBlob: file,
        },
      ]);
    };
    img.src = url;
    e.target.value = '';
  };

  const handleImportAudioTrack = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;
    for (let i = 0; i < files.length; i++) {
      const f = files[i];
      setAudioTracks((prev) => [
        ...prev,
        {
          id: `vaud_${Date.now()}_${i}`,
          name: f.name,
          objectUrl: URL.createObjectURL(f),
          sourceBlob: f,
          startSec: 0,
          volume: 0.55,
        },
      ]);
    }
    e.target.value = '';
  };

  const handleToggleVoiceoverRecord = async () => {
    if (isRecordingVoiceover) {
      voRecorderRef.current?.stop();
      setIsRecordingVoiceover(false);
      if (voTimerRef.current) clearInterval(voTimerRef.current);
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      voStreamRef.current = stream;
      voChunksRef.current = [];
      const recorder = new MediaRecorder(stream);
      voRecorderRef.current = recorder;

      recorder.ondataavailable = (ev) => {
        if (ev.data.size > 0) voChunksRef.current.push(ev.data);
      };

      recorder.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(voChunksRef.current, { type: recorder.mimeType || 'audio/webm' });
        const url = URL.createObjectURL(blob);
        setAudioTracks((prev) => [
          ...prev,
          {
            id: `vaud_vo_${Date.now()}`,
            name: `${isEn ? 'Voiceover' : 'Voix-off'} #${prev.length + 1}`,
            objectUrl: url,
            sourceBlob: blob,
            startSec: Number(previewTimeSec.toFixed(1)),
            volume: 1.0,
          },
        ]);
      };

      recorder.start(250);
      setIsRecordingVoiceover(true);
      setVoSeconds(0);
      voTimerRef.current = window.setInterval(() => setVoSeconds((s) => s + 1), 1000);
    } catch {
      setNotice(
        isEn ? 'Microphone unavailable.' : 'Accès au microphone refusé ou indisponible.'
      );
    }
  };

  const moveScene = (idx: number, dir: -1 | 1) => {
    const target = idx + dir;
    if (target < 0 || target >= scenes.length) return;
    setScenes((prev) => {
      const next = [...prev];
      const temp = next[idx];
      next[idx] = next[target];
      next[target] = temp;
      return next;
    });
  };

  const updateScene = (id: string, patch: Partial<VideoScene>) => {
    setScenes((prev) => prev.map((s) => (s.id === id ? { ...s, ...patch } : s)));
  };

  const duplicateScene = (scene: VideoScene) => {
    setScenes((prev) => [
      ...prev,
      {
        ...scene,
        id: `scene_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`,
        name: `${scene.name} (copie)`,
      },
    ]);
  };

  const removeScene = (id: string) => {
    setScenes((prev) => prev.filter((s) => s.id !== id));
  };

  const updateOverlay = (id: string, patch: Partial<OverlayLayer>) => {
    setOverlays((prev) => prev.map((o) => (o.id === id ? { ...o, ...patch } : o)));
  };

  const removeOverlay = (id: string) => {
    setOverlays((prev) => prev.filter((o) => o.id !== id));
  };

  const updateAudioTrack = (id: string, patch: Partial<VideoAudioTrack>) => {
    setAudioTracks((prev) => prev.map((a) => (a.id === id ? { ...a, ...patch } : a)));
  };

  const removeAudioTrack = (id: string) => {
    setAudioTracks((prev) => prev.filter((a) => a.id !== id));
  };

  const handleExportVideo = async () => {
    if (scenes.length === 0) {
      setNotice(
        isEn
          ? 'Add at least one scene (blank custom scene, photo, or video) first.'
          : 'Ajoutez d’abord au moins une scène (scène libre, photo ou vidéo).'
      );
      return;
    }

    if (isPlayingPreview) handleTogglePreviewPlay();

    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.width = dims.w;
    canvas.height = dims.h;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    cancelExportRef.current = false;
    setIsExporting(true);
    setExportProgress(0);
    setNotice(null);

    try {
      const videoStream = canvas.captureStream(30);
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const audioCtx = new AudioCtx();
      const destNode = audioCtx.createMediaStreamDestination();

      const scheduledAudioNodes: AudioBufferSourceNode[] = [];
      for (const track of audioTracks) {
        try {
          const resp = await fetch(track.objectUrl);
          const buf = await audioCtx.decodeAudioData(await resp.arrayBuffer());
          const src = audioCtx.createBufferSource();
          src.buffer = buf;
          const gain = audioCtx.createGain();
          gain.gain.value = track.volume;
          src.connect(gain);
          gain.connect(destNode);
          src.start(audioCtx.currentTime + track.startSec);
          scheduledAudioNodes.push(src);
        } catch {
          // skip undecodable audio track
        }
      }

      const combinedStream = new MediaStream([
        ...videoStream.getVideoTracks(),
        ...destNode.stream.getAudioTracks(),
      ]);

      const preferredMime =
        ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm'].find((m) =>
          MediaRecorder.isTypeSupported(m)
        ) || 'video/webm';

      const recorder = new MediaRecorder(combinedStream, {
        mimeType: preferredMime,
        videoBitsPerSecond: 2_800_000,
      });
      const chunks: BlobPart[] = [];
      recorder.ondataavailable = (ev) => {
        if (ev.data.size > 0) chunks.push(ev.data);
      };

      const recordingDone = new Promise<Blob>((resolve) => {
        recorder.onstop = () => resolve(new Blob(chunks, { type: preferredMime }));
      });

      recorder.start(250);

      const waitFrame = () => new Promise<void>((r) => requestAnimationFrame(() => r()));
      let elapsedGlobal = 0;

      for (const item of sceneTimingMap) {
        if (cancelExportRef.current) break;
        const { scene, dur } = item;

        let vidSourceNode: MediaElementAudioSourceNode | null = null;
        let vidGainNode: GainNode | null = null;

        if (scene.kind === 'video' && scene.videoEl) {
          const vid = scene.videoEl;
          vid.currentTime = scene.trimStartSec;
          vid.playbackRate = scene.playbackRate;
          vid.muted = false;
          try {
            vidSourceNode = audioCtx.createMediaElementSource(vid);
            vidGainNode = audioCtx.createGain();
            vidGainNode.gain.value = scene.volume;
            vidSourceNode.connect(vidGainNode);
            vidGainNode.connect(destNode);
          } catch {
            vid.muted = true;
          }
          await vid.play().catch(() => {});
        }

        const segStart = performance.now();
        while (!cancelExportRef.current) {
          const localElapsed = (performance.now() - segStart) / 1000;
          if (localElapsed >= dur) break;
          const globalTime = elapsedGlobal + localElapsed;
          drawSceneFrame(ctx, scene, localElapsed, dur, dims.w, dims.h);
          drawOverlaysAtTime(ctx, globalTime, dims.w, dims.h);
          setExportProgress(
            Math.min(99, Math.round((globalTime / Math.max(0.5, totalDurationSec)) * 100))
          );
          await waitFrame();
        }

        if (scene.kind === 'video' && scene.videoEl) {
          scene.videoEl.pause();
          vidSourceNode?.disconnect();
          vidGainNode?.disconnect();
        }

        elapsedGlobal += dur;
      }

      scheduledAudioNodes.forEach((n) => {
        try {
          n.stop();
        } catch {
          // noop
        }
      });

      recorder.stop();
      const finalBlob = await recordingDone;
      await audioCtx.close().catch(() => {});

      if (!cancelExportRef.current && finalBlob.size > 0) {
        if (exportedVideoUrl) URL.revokeObjectURL(exportedVideoUrl);
        setExportedVideoUrl(URL.createObjectURL(finalBlob));
        setExportedVideoBlob(finalBlob);
        setExportedMimeType(preferredMime);
        setExportProgress(100);
        setNotice(
          isEn
            ? 'Video rendered cleanly! Save to phone, library, or share.'
            : 'Vidéo exportée avec succès ! Enregistrez-la ou partagez-la.'
        );
      }
    } catch (err: unknown) {
      setNotice(err instanceof Error ? err.message : 'Erreur export vidéo');
    } finally {
      setIsExporting(false);
    }
  };

  const handleSaveToParole = async () => {
    if (!exportedVideoBlob) return;
    const blobKey = `parole_video_studio_${Date.now()}`;
    await dbService.saveMediaBlob(blobKey, exportedVideoBlob, exportedMimeType);
    const rec: RecordedParole = {
      id: `rec_vid_${Date.now()}`,
      title: projectTitle.trim() || 'Vidéo Studio',
      type: 'exhortation',
      speaker: userProfile?.fullName || 'Moi',
      activityGenre: 'autre',
      date: new Date().toISOString().split('T')[0],
      durationSeconds: Math.max(1, Math.round(totalDurationSec)),
      mediaType: 'video',
      mimeType: exportedMimeType,
      blobKey,
      fileSizeFormatted: `${(exportedVideoBlob.size / (1024 * 1024)).toFixed(2)} Mo`,
      createdAt: new Date().toISOString(),
    };
    await dbService.put(STORES.RECORDINGS, rec);
    setNotice(isEn ? 'Saved to Parole Divine!' : 'Vidéo enregistrée dans Parole Divine !');
    reloadData();
  };

  const handleSaveToVault = async () => {
    if (!exportedVideoBlob) return;
    const safeSlug = projectTitle.toLowerCase().replace(/[^a-z0-9]+/g, '_') || 'shalom_video';
    const blobKey = `vault_video_${Date.now()}`;
    await dbService.saveMediaBlob(blobKey, exportedVideoBlob, exportedMimeType);
    const doc: VaultDocument = {
      id: `vault_${Date.now()}`,
      title: projectTitle.trim() || 'Création Vidéo',
      category: 'autre',
      author: userProfile?.fullName || 'Moi',
      description: 'Création vidéo réalisée dans SHALOM Studio Vidéo',
      fileName: `${safeSlug}.webm`,
      mimeType: exportedMimeType,
      sizeBytes: exportedVideoBlob.size,
      blobKey,
      createdAt: new Date().toISOString(),
    };
    await dbService.put(STORES.VAULT_DOCUMENTS, doc);
    setNotice(isEn ? 'Saved to Spiritual Vault!' : 'Vidéo ajoutée dans Mon Coffre Spirituel !');
    reloadData();
  };

  const handleDownloadVideo = () => {
    if (!exportedVideoUrl) return;
    const link = document.createElement('a');
    link.href = exportedVideoUrl;
    link.download = `${projectTitle.toLowerCase().replace(/[^a-z0-9]+/g, '_') || 'shalom_video'}.webm`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleShareVideo = () => {
    if (!exportedVideoBlob) return;
    const file = new File(
      [exportedVideoBlob],
      `${projectTitle.toLowerCase().replace(/[^a-z0-9]+/g, '_') || 'shalom_video'}.webm`,
      { type: exportedMimeType }
    );
    setSharePayload({
      title: projectTitle,
      text: `🎬 ${projectTitle}\n\nPartagé depuis SHALOM Studio Vidéo`,
      file,
    });
  };

  const timelineMax = Math.max(4, totalDurationSec);

  return (
    <div className="space-y-6 w-full min-w-0 overflow-x-clip">
      {viewMode === 'home' ? (
        <StudioHomePanel
          studio="video"
          studioTitle={isEn ? 'Video Editing Studio' : 'Studio Vidéo'}
          studioDescription={
            isEn
              ? 'Assemble scenes, trim & split clips, apply filters, timed text overlays, voiceovers & online stock media.'
              : 'Montez vos vidéos avec timeline multipiste, découpe & scission de scènes, filtres visuels, calques animés, voix-off et ressources en ligne.'
          }
          headerIcon={<Film className="w-5 h-5 text-amber-300" />}
          blankLabel={isEn ? 'New Blank Video' : 'Nouvelle vidéo vierge'}
          blankFormats={[
            { id: '9:16', label: 'Story / Reel 9:16', dimensions: '720×1280' },
            { id: '16:9', label: 'Paysage 16:9', dimensions: '1280×720' },
            { id: '1:1', label: 'Carré 1:1', dimensions: '960×960' },
            { id: '4:5', label: 'Portrait 4:5', dimensions: '864×1080' },
          ]}
          templates={VIDEO_TEMPLATES}
          recentProjects={recentVideoProjects}
          onCreateBlank={startBlankVideoProject}
          onSelectTemplate={applyVideoTemplate}
          onOpenProject={openSavedVideoProject}
          onDuplicateProject={handleDuplicateVideoProject}
          onDeleteProject={handleDeleteVideoProject}
        />
      ) : (
        <div className="space-y-5">
          {/* Header Bar */}
          <div className="p-3.5 rounded-2xl bg-white dark:bg-[#0c1631] border border-slate-200/80 dark:border-slate-800/80 flex flex-wrap items-center justify-between gap-2.5 text-xs">
            <div className="flex items-center gap-2 min-w-0 flex-1">
              <button
                type="button"
                onClick={() => setViewMode('home')}
                className="min-h-[44px] px-3 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 font-bold flex items-center gap-1.5 shrink-0"
              >
                <ArrowLeft className="w-4 h-4" />
                <span className="hidden sm:inline">{isEn ? 'Studio Home' : 'Accueil Studio'}</span>
              </button>
              <input
                type="text"
                value={projectTitle}
                onChange={(e) => setProjectTitle(e.target.value)}
                className="min-h-[44px] px-3 py-1.5 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 font-bold flex-1 min-w-[140px]"
              />
            </div>

            <button
              type="button"
              onClick={handleSaveEditableVideoProject}
              className="min-h-[44px] px-4 py-2 rounded-xl bg-[#0b1f42] dark:bg-blue-700 text-white font-bold flex items-center gap-1.5"
            >
              <Save className="w-4 h-4" />
              <span>{isEn ? 'Save Project' : 'Sauver projet'}</span>
            </button>
          </div>

          {notice && (
            <div className="p-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900/50 text-xs font-semibold text-emerald-700 dark:text-emerald-300 flex items-center justify-between">
              <span className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                <span>{notice}</span>
              </span>
              <button type="button" onClick={() => setNotice(null)} className="underline ml-2">
                OK
              </button>
            </div>
          )}

          {/* Action Toolbar */}
          <div className="p-3 rounded-2xl bg-white dark:bg-[#0c1631] border border-slate-200/80 dark:border-slate-800/80 text-xs">
            <div className="studio-scroll-x flex items-center gap-2 pb-1">
              <button
                type="button"
                onClick={addBlankCustomScene}
                className="min-h-[44px] px-3.5 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-bold flex items-center gap-1.5 shrink-0"
              >
                <Palette className="w-4 h-4" />
                <span>+ {isEn ? 'Scene' : 'Scène texte'}</span>
              </button>

              <label className="min-h-[44px] px-3.5 py-2 rounded-xl bg-blue-700 hover:bg-blue-800 text-white font-bold flex items-center gap-1.5 cursor-pointer shrink-0">
                <Upload className="w-4 h-4" />
                <span>+ {isEn ? 'Local Media' : 'Vidéos / Photos'}</span>
                <input
                  type="file"
                  accept="video/*,image/*"
                  multiple
                  onChange={handleImportMediaFiles}
                  className="hidden"
                />
              </label>

              <button
                type="button"
                onClick={() => setResourceModalOpen(true)}
                className="min-h-[44px] px-3.5 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-extrabold flex items-center gap-1.5 shrink-0"
              >
                <Globe className="w-4 h-4" />
                <span>{isEn ? 'Online Assets' : 'Médias & Audio en ligne'}</span>
              </button>

              <button
                type="button"
                onClick={handleSplitAtPlayhead}
                disabled={scenes.length === 0}
                className="min-h-[44px] px-3.5 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 disabled:opacity-40 font-bold flex items-center gap-1.5 shrink-0"
              >
                <Scissors className="w-4 h-4" />
                <span>{isEn ? 'Split at Cursor' : 'Scinder au curseur'}</span>
              </button>

              {recordings.filter((r) => r.mediaType === 'video').length > 0 && (
                <select
                  defaultValue=""
                  onChange={(e) => {
                    if (e.target.value) handleImportFromParole(e.target.value);
                    e.target.value = '';
                  }}
                  className="min-h-[44px] px-3 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 font-semibold shrink-0"
                >
                  <option value="">
                    {isEn ? '+ Parole Divine' : '+ Depuis Parole Divine'}
                  </option>
                  {recordings
                    .filter((r) => r.mediaType === 'video')
                    .map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.title}
                      </option>
                    ))}
                </select>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            {/* Left Controls */}
            <div className="lg:col-span-7 space-y-5 text-xs">
              {/* Format & Canvas */}
              <div className="p-4 sm:p-5 rounded-2xl bg-white dark:bg-[#0c1631] border border-slate-200/80 dark:border-slate-800/80 space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 flex-1">
                    {([
                      { id: '9:16', label: '9:16 Story' },
                      { id: '16:9', label: '16:9 Paysage' },
                      { id: '1:1', label: '1:1 Carré' },
                      { id: '4:5', label: '4:5 Portrait' },
                    ] as const).map((m) => (
                      <button
                        key={m.id}
                        type="button"
                        onClick={() => setAspectMode(m.id)}
                        className={`min-h-[42px] py-2 px-2 rounded-xl font-bold border transition ${
                          aspectMode === m.id
                            ? 'bg-[#0b1f42] text-white border-[#0b1f42] dark:bg-blue-700'
                            : 'bg-slate-50 dark:bg-slate-900 border-slate-200 dark:border-slate-800'
                        }`}
                      >
                        {m.label}
                      </button>
                    ))}
                  </div>
                  <label className="flex items-center gap-2 font-semibold">
                    <span>Fond</span>
                    <input
                      type="color"
                      value={canvasBgColor}
                      onChange={(e) => setCanvasBgColor(e.target.value)}
                      className="w-9 h-9 rounded-lg cursor-pointer border border-slate-200 dark:border-slate-700"
                    />
                  </label>
                </div>

                {/* Multi-Track Visual Timeline */}
                <div className="p-3 rounded-xl bg-slate-950 text-white space-y-2 border border-slate-800">
                  <div className="flex items-center justify-between text-[11px] text-slate-400 font-semibold">
                    <span>Timeline Multipiste</span>
                    <span className="tabular-nums">
                      {previewTimeSec.toFixed(1)}s / {totalDurationSec.toFixed(1)}s
                    </span>
                  </div>

                  {/* Scenes Track */}
                  <div className="relative h-8 rounded-lg bg-slate-900 overflow-hidden flex">
                    {sceneTimingMap.map((m, idx) => (
                      <button
                        key={m.scene.id}
                        type="button"
                        onClick={() => setPreviewTimeSec(m.start)}
                        style={{ width: `${(m.dur / timelineMax) * 100}%` }}
                        className={`h-full px-1.5 text-[10px] font-bold truncate border-r border-slate-950 ${
                          idx % 2 === 0 ? 'bg-blue-700' : 'bg-indigo-600'
                        }`}
                        title={`${m.scene.name} (${m.dur.toFixed(1)}s)`}
                      >
                        {m.scene.name}
                      </button>
                    ))}
                    <div
                      style={{ left: `${Math.min(99, (previewTimeSec / timelineMax) * 100)}%` }}
                      className="absolute top-0 bottom-0 w-0.5 bg-amber-400 pointer-events-none"
                    />
                  </div>

                  {/* Overlays Track */}
                  {overlays.length > 0 && (
                    <div className="relative h-5 rounded-md bg-slate-900 overflow-hidden">
                      {overlays.map((o) => {
                        const left = Math.min(98, (o.startSec / timelineMax) * 100);
                        const wPct = Math.max(
                          4,
                          Math.min(100 - left, ((o.endSec - o.startSec) / timelineMax) * 100)
                        );
                        return (
                          <div
                            key={o.id}
                            style={{ left: `${left}%`, width: `${wPct}%` }}
                            className="absolute top-0.5 bottom-0.5 rounded bg-emerald-600/90 px-1 text-[9px] font-bold truncate flex items-center"
                          >
                            {o.label}
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* Audio Track */}
                  {audioTracks.length > 0 && (
                    <div className="relative h-5 rounded-md bg-slate-900 overflow-hidden">
                      {audioTracks.map((a) => {
                        const left = Math.min(96, (a.startSec / timelineMax) * 100);
                        return (
                          <div
                            key={a.id}
                            style={{ left: `${left}%`, width: `${Math.max(12, 100 - left)}%` }}
                            className="absolute top-0.5 bottom-0.5 rounded bg-amber-600/90 px-1 text-[9px] font-bold truncate flex items-center"
                          >
                            {a.name}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>

              {/* Overlays Manager */}
              <div className="p-4 sm:p-5 rounded-2xl bg-white dark:bg-[#0c1631] border border-slate-200/80 dark:border-slate-800/80 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                    {isEn
                      ? `Timed Overlays (${overlays.length})`
                      : `Calques superposés (${overlays.length})`}
                  </h3>
                  <div className="flex flex-wrap gap-1.5">
                    <button
                      type="button"
                      onClick={addTextOverlay}
                      className="min-h-[40px] px-2.5 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 font-bold flex items-center gap-1"
                    >
                      <Type className="w-3.5 h-3.5" />
                      <span>+ {isEn ? 'Text' : 'Texte'}</span>
                    </button>
                    <button
                      type="button"
                      onClick={addShapeOverlay}
                      className="min-h-[40px] px-2.5 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 font-bold flex items-center gap-1"
                    >
                      <Shapes className="w-3.5 h-3.5" />
                      <span>+ {isEn ? 'Shape' : 'Forme'}</span>
                    </button>
                    <label className="min-h-[40px] px-2.5 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 font-bold flex items-center gap-1 cursor-pointer">
                      <ImageIcon className="w-3.5 h-3.5" />
                      <span>+ {isEn ? 'Logo' : 'Logo'}</span>
                      <input
                        type="file"
                        accept="image/*"
                        onChange={handleUploadImageOverlay}
                        className="hidden"
                      />
                    </label>
                  </div>
                </div>

                {overlays.map((ov) => (
                  <div
                    key={ov.id}
                    className="p-3 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-2.5"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-bold text-slate-900 dark:text-white truncate">
                        {ov.label}
                      </span>
                      <button
                        type="button"
                        onClick={() => removeOverlay(ov.id)}
                        className="p-1.5 text-red-600 hover:bg-red-50 rounded"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    {ov.kind === 'text' && (
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                        <input
                          type="text"
                          value={ov.text || ''}
                          onChange={(e) => updateOverlay(ov.id, { text: e.target.value })}
                          className="sm:col-span-2 px-2.5 py-1.5 rounded-lg bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800"
                        />
                        <label className="flex items-center gap-1.5 font-semibold cursor-pointer">
                          <input
                            type="checkbox"
                            checked={ov.bgBadge}
                            onChange={(e) => updateOverlay(ov.id, { bgBadge: e.target.checked })}
                            className="accent-blue-700"
                          />
                          <span>{isEn ? 'Backdrop' : 'Fond texte'}</span>
                        </label>
                      </div>
                    )}

                    {ov.kind === 'shape' && (
                      <select
                        value={ov.shape || 'star'}
                        onChange={(e) =>
                          updateOverlay(ov.id, { shape: e.target.value as OverlayLayer['shape'] })
                        }
                        className="px-2.5 py-1.5 rounded-lg bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 font-semibold"
                      >
                        <option value="rect">Rectangle / Carré</option>
                        <option value="circle">Cercle</option>
                        <option value="star">Étoile</option>
                        <option value="cross">Croix chrétienne</option>
                        <option value="heart">Cœur</option>
                      </select>
                    )}

                    <div className="grid grid-cols-2 sm:grid-cols-6 gap-2 items-center">
                      <div>
                        <label className="block text-[10px] font-semibold text-slate-500">
                          Début (s)
                        </label>
                        <input
                          type="number"
                          step={0.5}
                          min={0}
                          value={ov.startSec}
                          onChange={(e) =>
                            updateOverlay(ov.id, {
                              startSec: Math.max(0, parseFloat(e.target.value) || 0),
                            })
                          }
                          className="w-full px-2 py-1 rounded bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 tabular-nums"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] font-semibold text-slate-500">
                          Fin (s)
                        </label>
                        <input
                          type="number"
                          step={0.5}
                          min={ov.startSec + 0.5}
                          value={ov.endSec}
                          onChange={(e) =>
                            updateOverlay(ov.id, {
                              endSec: Math.max(ov.startSec + 0.5, parseFloat(e.target.value) || 4),
                            })
                          }
                          className="w-full px-2 py-1 rounded bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 tabular-nums"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] font-semibold text-slate-500">
                          X ({ov.xPct}%)
                        </label>
                        <input
                          type="range"
                          min={5}
                          max={95}
                          value={ov.xPct}
                          onChange={(e) =>
                            updateOverlay(ov.id, { xPct: parseInt(e.target.value, 10) })
                          }
                          className="w-full"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] font-semibold text-slate-500">
                          Y ({ov.yPct}%)
                        </label>
                        <input
                          type="range"
                          min={5}
                          max={95}
                          value={ov.yPct}
                          onChange={(e) =>
                            updateOverlay(ov.id, { yPct: parseInt(e.target.value, 10) })
                          }
                          className="w-full"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] font-semibold text-slate-500">
                          Taille ({ov.size})
                        </label>
                        <input
                          type="range"
                          min={18}
                          max={280}
                          value={ov.size}
                          onChange={(e) =>
                            updateOverlay(ov.id, { size: parseInt(e.target.value, 10) })
                          }
                          className="w-full"
                        />
                      </div>
                      {ov.kind !== 'image' && (
                        <div className="flex items-center gap-2 pt-3">
                          <input
                            type="color"
                            value={ov.color}
                            onChange={(e) => updateOverlay(ov.id, { color: e.target.value })}
                            className="w-7 h-7 rounded cursor-pointer border border-slate-200 dark:border-slate-700"
                          />
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              {/* Multi-Audio Tracks */}
              <div className="p-4 sm:p-5 rounded-2xl bg-white dark:bg-[#0c1631] border border-slate-200/80 dark:border-slate-800/80 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                    {isEn
                      ? `Audio Tracks (${audioTracks.length})`
                      : `Pistes audio & Voix-off (${audioTracks.length})`}
                  </h3>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={handleToggleVoiceoverRecord}
                      className={`min-h-[40px] px-3 py-1.5 rounded-lg font-bold flex items-center gap-1.5 ${
                        isRecordingVoiceover
                          ? 'bg-red-600 text-white'
                          : 'bg-blue-700 hover:bg-blue-800 text-white'
                      }`}
                    >
                      {isRecordingVoiceover ? (
                        <>
                          <Square className="w-3.5 h-3.5 fill-current" />
                          <span>{isEn ? `Stop (${voSeconds}s)` : `Arrêter (${voSeconds}s)`}</span>
                        </>
                      ) : (
                        <>
                          <Mic className="w-3.5 h-3.5" />
                          <span>{isEn ? 'Record Voiceover' : 'Enregistrer voix-off'}</span>
                        </>
                      )}
                    </button>

                    <label className="min-h-[40px] px-3 py-1.5 rounded-lg bg-amber-50 dark:bg-amber-950/30 text-amber-800 dark:text-amber-300 border border-amber-200 dark:border-amber-900/50 font-bold flex items-center gap-1.5 cursor-pointer">
                      <Music className="w-3.5 h-3.5" />
                      <span>{isEn ? '+ Audio' : '+ Audio local'}</span>
                      <input
                        type="file"
                        accept="audio/*"
                        multiple
                        onChange={handleImportAudioTrack}
                        className="hidden"
                      />
                    </label>
                  </div>
                </div>

                {audioTracks.map((tr) => (
                  <div
                    key={tr.id}
                    className="p-3 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3"
                  >
                    <span className="font-bold truncate flex-1 min-w-[140px]">{tr.name}</span>
                    <div className="flex flex-wrap items-center gap-3">
                      <label className="flex items-center gap-1 text-[11px]">
                        <span>{isEn ? 'Start (s):' : 'Début (s) :'}</span>
                        <input
                          type="number"
                          min={0}
                          step={0.5}
                          value={tr.startSec}
                          onChange={(e) =>
                            updateAudioTrack(tr.id, {
                              startSec: Math.max(0, parseFloat(e.target.value) || 0),
                            })
                          }
                          className="w-16 px-2 py-1 rounded bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 tabular-nums"
                        />
                      </label>
                      <label className="flex items-center gap-1.5 text-[11px]">
                        <span>Vol {Math.round(tr.volume * 100)}%</span>
                        <input
                          type="range"
                          min={0}
                          max={1.5}
                          step={0.05}
                          value={tr.volume}
                          onChange={(e) =>
                            updateAudioTrack(tr.id, { volume: parseFloat(e.target.value) })
                          }
                          className="w-20"
                        />
                      </label>
                      <button
                        type="button"
                        onClick={() => removeAudioTrack(tr.id)}
                        className="p-1 text-red-600 hover:bg-red-50 rounded"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Right Live Preview & Render Panel */}
            <div className="lg:col-span-5 space-y-3 lg:sticky lg:top-4">
              <div className="p-3 rounded-2xl bg-slate-950 border border-slate-800 flex flex-col items-center gap-3">
                <canvas
                  ref={canvasRef}
                  width={dims.w}
                  height={dims.h}
                  className="rounded-xl bg-black max-h-[380px] w-auto max-w-full"
                />

                <div className="w-full flex items-center gap-2 text-xs text-white px-1">
                  <button
                    type="button"
                    onClick={handleTogglePreviewPlay}
                    disabled={totalDurationSec <= 0}
                    className="min-h-[40px] px-3 py-1.5 rounded-lg bg-blue-700 hover:bg-blue-600 disabled:opacity-40 font-bold flex items-center gap-1 shrink-0"
                  >
                    {isPlayingPreview ? (
                      <>
                        <Square className="w-3.5 h-3.5 fill-current" />
                        <span>Stop</span>
                      </>
                    ) : (
                      <>
                        <Play className="w-3.5 h-3.5 fill-current" />
                        <span>{isEn ? 'Preview' : 'Aperçu'}</span>
                      </>
                    )}
                  </button>
                  <input
                    type="range"
                    min={0}
                    max={Math.max(1, totalDurationSec)}
                    step={0.1}
                    value={Math.min(previewTimeSec, Math.max(1, totalDurationSec))}
                    onChange={(e) => {
                      if (isPlayingPreview) handleTogglePreviewPlay();
                      setPreviewTimeSec(parseFloat(e.target.value));
                    }}
                    className="flex-1 accent-amber-400"
                  />
                  <span className="tabular-nums text-[11px] shrink-0">
                    {previewTimeSec.toFixed(1)}s / {totalDurationSec.toFixed(1)}s
                  </span>
                </div>
              </div>

              {!isExporting ? (
                <button
                  type="button"
                  onClick={handleExportVideo}
                  className="w-full min-h-[48px] py-3 rounded-xl bg-blue-700 hover:bg-blue-800 text-white text-xs font-bold flex items-center justify-center gap-2 shadow-sm"
                >
                  <Play className="w-4 h-4 fill-current" />
                  <span>{isEn ? 'Render & Export Video' : 'Assembler & Exporter la Vidéo'}</span>
                </button>
              ) : (
                <div className="p-4 rounded-xl bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-900 space-y-2 text-xs">
                  <div className="flex items-center justify-between font-bold text-blue-800 dark:text-blue-200">
                    <span className="flex items-center gap-1.5">
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>{isEn ? 'Rendering video...' : 'Exportation en cours...'}</span>
                    </span>
                    <span className="tabular-nums">{exportProgress}%</span>
                  </div>
                  <div className="w-full h-2 rounded-full bg-blue-200 dark:bg-blue-900 overflow-hidden">
                    <div
                      style={{ width: `${exportProgress}%` }}
                      className="h-full bg-blue-700 transition-all"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      cancelExportRef.current = true;
                    }}
                    className="text-red-600 font-semibold underline"
                  >
                    {isEn ? 'Cancel' : 'Annuler'}
                  </button>
                </div>
              )}

              {exportedVideoUrl && (
                <div className="p-4 rounded-2xl bg-white dark:bg-[#0c1631] border border-slate-200/80 dark:border-slate-800/80 space-y-3">
                  <video
                    src={exportedVideoUrl}
                    controls
                    playsInline
                    className="w-full max-h-60 rounded-xl bg-black"
                  />
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={handleDownloadVideo}
                      className="min-h-[40px] px-3 py-2 rounded-xl bg-slate-900 dark:bg-slate-700 text-white text-xs font-bold flex items-center gap-1"
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span>{isEn ? 'Save to Phone' : 'Téléphone'}</span>
                    </button>
                    <button
                      type="button"
                      onClick={handleSaveToParole}
                      className="min-h-[40px] px-3 py-2 rounded-xl bg-blue-700 text-white text-xs font-bold flex items-center gap-1"
                    >
                      <Save className="w-3.5 h-3.5" />
                      <span>Parole Divine</span>
                    </button>
                    <button
                      type="button"
                      onClick={handleSaveToVault}
                      className="min-h-[40px] px-3 py-2 rounded-xl bg-amber-600 text-white text-xs font-bold flex items-center gap-1"
                    >
                      <Archive className="w-3.5 h-3.5" />
                      <span>{isEn ? 'Vault' : 'Mon Coffre'}</span>
                    </button>
                    <button
                      type="button"
                      onClick={handleShareVideo}
                      className="min-h-[40px] px-3 py-2 rounded-xl bg-emerald-600 text-white text-xs font-bold flex items-center gap-1"
                    >
                      <Share2 className="w-3.5 h-3.5" />
                      <span>{isEn ? 'Share' : 'Partager'}</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Scenes Detailed Controls */}
          <div className="space-y-3">
            <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <Film className="w-4 h-4 text-blue-700 dark:text-blue-400" />
              <span>
                {isEn
                  ? `Video Scenes (${scenes.length} · ${totalDurationSec.toFixed(1)}s)`
                  : `Séquences du montage (${scenes.length} scène(s) · ${totalDurationSec.toFixed(1)}s)`}
              </span>
            </h3>

            <div className="space-y-3">
              {scenes.map((scene, idx) => (
                <div
                  key={scene.id}
                  className="p-4 rounded-2xl bg-white dark:bg-[#0c1631] border border-slate-200/80 dark:border-slate-800/80 space-y-3 text-xs"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2 font-bold text-slate-900 dark:text-white">
                      {scene.kind === 'custom' ? (
                        <Palette className="w-4 h-4 text-amber-600 shrink-0" />
                      ) : scene.kind === 'image' ? (
                        <ImageIcon className="w-4 h-4 text-emerald-600 shrink-0" />
                      ) : (
                        <VideoIcon className="w-4 h-4 text-blue-600 shrink-0" />
                      )}
                      <input
                        type="text"
                        value={scene.name}
                        onChange={(e) => updateScene(scene.id, { name: e.target.value })}
                        className="bg-transparent border-b border-transparent focus:border-blue-500 outline-none"
                      />
                    </div>

                    <div className="flex flex-wrap items-center gap-1.5">
                      <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800 px-2 py-1 rounded-lg">
                        <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                        <select
                          value={scene.filter}
                          onChange={(e) =>
                            updateScene(scene.id, { filter: e.target.value as VideoFilterKind })
                          }
                          className="bg-transparent font-semibold"
                        >
                          <option value="none">Filtre: Normal</option>
                          <option value="warm">Chaud</option>
                          <option value="bw">Noir & Blanc</option>
                          <option value="sepia">Sépia</option>
                          <option value="bright">Lumineux</option>
                          <option value="contrast">Contraste +</option>
                        </select>
                      </div>

                      <select
                        value={scene.transition}
                        onChange={(e) =>
                          updateScene(scene.id, {
                            transition: e.target.value as SceneTransitionKind,
                          })
                        }
                        className="bg-slate-100 dark:bg-slate-800 px-2 py-1.5 rounded-lg font-semibold"
                      >
                        <option value="fade">Transition: Fondu</option>
                        <option value="cut">Coupe directe</option>
                      </select>

                      <button
                        type="button"
                        onClick={() => moveScene(idx, -1)}
                        disabled={idx === 0}
                        className="p-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 disabled:opacity-40"
                      >
                        <ArrowUp className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => moveScene(idx, 1)}
                        disabled={idx === scenes.length - 1}
                        className="p-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 disabled:opacity-40"
                      >
                        <ArrowDown className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => duplicateScene(scene)}
                        className="p-1.5 rounded-lg bg-slate-100 dark:bg-slate-800"
                      >
                        <Copy className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => removeScene(scene.id)}
                        className="p-1.5 rounded-lg text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  {scene.kind === 'custom' && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 pt-1">
                      <div>
                        <label className="block text-[11px] font-semibold text-slate-500 mb-1">
                          {isEn ? 'Background & Colors' : 'Fond & Couleurs'}
                        </label>
                        <div className="flex items-center gap-2">
                          <select
                            value={scene.bgType}
                            onChange={(e) =>
                              updateScene(scene.id, {
                                bgType: e.target.value as 'solid' | 'gradient',
                              })
                            }
                            className="px-2 py-1.5 rounded-lg bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800"
                          >
                            <option value="solid">{isEn ? 'Solid' : 'Uni'}</option>
                            <option value="gradient">{isEn ? 'Gradient' : 'Dégradé'}</option>
                          </select>
                          <input
                            type="color"
                            value={scene.bgColor}
                            onChange={(e) => updateScene(scene.id, { bgColor: e.target.value })}
                            className="w-8 h-8 rounded cursor-pointer"
                          />
                          {scene.bgType === 'gradient' && (
                            <input
                              type="color"
                              value={scene.bgColor2}
                              onChange={(e) => updateScene(scene.id, { bgColor2: e.target.value })}
                              className="w-8 h-8 rounded cursor-pointer"
                            />
                          )}
                        </div>
                      </div>

                      <div>
                        <label className="block text-[11px] font-semibold text-slate-500 mb-1">
                          {isEn ? 'Shape & Color' : 'Forme & Couleur'}
                        </label>
                        <div className="flex items-center gap-2">
                          <select
                            value={scene.shape}
                            onChange={(e) =>
                              updateScene(scene.id, { shape: e.target.value as CustomShapeKind })
                            }
                            className="flex-1 px-2 py-1.5 rounded-lg bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800"
                          >
                            <option value="none">{isEn ? 'None' : 'Aucune'}</option>
                            <option value="cross">Croix</option>
                            <option value="circle">Cercle</option>
                            <option value="rect">Carré</option>
                            <option value="star">Étoile</option>
                            <option value="heart">Cœur</option>
                          </select>
                          {scene.shape !== 'none' && (
                            <input
                              type="color"
                              value={scene.shapeColor}
                              onChange={(e) =>
                                updateScene(scene.id, { shapeColor: e.target.value })
                              }
                              className="w-8 h-8 rounded cursor-pointer"
                            />
                          )}
                        </div>
                      </div>

                      <div>
                        <label className="block text-[11px] font-semibold text-slate-500 mb-1">
                          {isEn ? 'Slide Text' : 'Texte de la scène'}
                        </label>
                        <div className="flex items-center gap-2">
                          <input
                            type="text"
                            value={scene.text}
                            onChange={(e) => updateScene(scene.id, { text: e.target.value })}
                            className="flex-1 px-2.5 py-1.5 rounded-lg bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800"
                          />
                          <input
                            type="color"
                            value={scene.textColor}
                            onChange={(e) => updateScene(scene.id, { textColor: e.target.value })}
                            className="w-8 h-8 rounded cursor-pointer shrink-0"
                          />
                        </div>
                      </div>

                      <div>
                        <label className="block text-[11px] font-semibold text-slate-500 mb-1">
                          {isEn ? 'Duration (s) / Font Size' : 'Durée (s) & Taille texte'}
                        </label>
                        <div className="grid grid-cols-2 gap-2">
                          <input
                            type="number"
                            step={0.5}
                            min={0.5}
                            max={60}
                            value={scene.durationSec}
                            onChange={(e) =>
                              updateScene(scene.id, {
                                durationSec: Math.max(0.5, parseFloat(e.target.value) || 2),
                              })
                            }
                            className="w-full px-2.5 py-1.5 rounded-lg bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 tabular-nums"
                          />
                          <input
                            type="number"
                            step={2}
                            min={16}
                            max={120}
                            value={scene.fontSize}
                            onChange={(e) =>
                              updateScene(scene.id, {
                                fontSize: Math.max(16, parseInt(e.target.value, 10) || 40),
                              })
                            }
                            className="w-full px-2.5 py-1.5 rounded-lg bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 tabular-nums"
                          />
                        </div>
                      </div>
                    </div>
                  )}

                  {scene.kind === 'image' && (
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-center">
                      <div>
                        <label className="block text-[11px] font-semibold text-slate-500 mb-1">
                          {isEn ? 'Duration (s)' : 'Durée d’affichage (s)'}
                        </label>
                        <input
                          type="number"
                          step={0.5}
                          min={0.5}
                          max={60}
                          value={scene.durationSec}
                          onChange={(e) =>
                            updateScene(scene.id, {
                              durationSec: Math.max(0.5, parseFloat(e.target.value) || 3),
                            })
                          }
                          className="w-full px-3 py-1.5 rounded-lg bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 tabular-nums"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-semibold text-slate-500 mb-1">
                          {isEn ? 'Framing' : 'Cadrage'}
                        </label>
                        <select
                          value={scene.fitMode}
                          onChange={(e) =>
                            updateScene(scene.id, {
                              fitMode: e.target.value as 'contain' | 'cover',
                            })
                          }
                          className="w-full px-3 py-1.5 rounded-lg bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800"
                        >
                          <option value="contain">
                            {isEn ? 'Fit (entire image)' : 'Adapter (image entière)'}
                          </option>
                          <option value="cover">
                            {isEn ? 'Fill frame' : 'Remplir le cadre'}
                          </option>
                        </select>
                      </div>
                      <label className="flex items-center gap-2 pt-4 cursor-pointer font-semibold">
                        <input
                          type="checkbox"
                          checked={scene.kenBurns}
                          onChange={(e) => updateScene(scene.id, { kenBurns: e.target.checked })}
                          className="accent-blue-700"
                        />
                        <span>{isEn ? 'Smooth Zoom Animation' : 'Mouvement Zoom doux'}</span>
                      </label>
                    </div>
                  )}

                  {scene.kind === 'video' && (
                    <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 items-center">
                      <div>
                        <label className="block text-[11px] font-semibold text-slate-500 mb-1">
                          {isEn ? 'Trim Start (s)' : 'Début coupe (s)'}
                        </label>
                        <input
                          type="number"
                          step={0.5}
                          min={0}
                          max={Math.max(0, scene.trimEndSec - 0.5)}
                          value={scene.trimStartSec}
                          onChange={(e) =>
                            updateScene(scene.id, {
                              trimStartSec: Math.max(0, parseFloat(e.target.value) || 0),
                            })
                          }
                          className="w-full px-2.5 py-1.5 rounded-lg bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 tabular-nums"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-semibold text-slate-500 mb-1">
                          {isEn ? 'Trim End (s)' : 'Fin coupe (s)'}
                        </label>
                        <input
                          type="number"
                          step={0.5}
                          min={scene.trimStartSec + 0.5}
                          max={scene.durationSec}
                          value={scene.trimEndSec}
                          onChange={(e) =>
                            updateScene(scene.id, {
                              trimEndSec: Math.min(
                                scene.durationSec,
                                Math.max(scene.trimStartSec + 0.5, parseFloat(e.target.value) || 3)
                              ),
                            })
                          }
                          className="w-full px-2.5 py-1.5 rounded-lg bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 tabular-nums"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-semibold text-slate-500 mb-1">
                          {isEn ? 'Framing' : 'Cadrage'}
                        </label>
                        <select
                          value={scene.fitMode}
                          onChange={(e) =>
                            updateScene(scene.id, {
                              fitMode: e.target.value as 'contain' | 'cover',
                            })
                          }
                          className="w-full px-2.5 py-1.5 rounded-lg bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800"
                        >
                          <option value="contain">{isEn ? 'Fit' : 'Adapter'}</option>
                          <option value="cover">{isEn ? 'Fill' : 'Remplir'}</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-[11px] font-semibold text-slate-500 mb-1">
                          {isEn ? 'Speed' : 'Vitesse'} ({scene.playbackRate}x)
                        </label>
                        <select
                          value={scene.playbackRate}
                          onChange={(e) =>
                            updateScene(scene.id, { playbackRate: parseFloat(e.target.value) })
                          }
                          className="w-full px-2.5 py-1.5 rounded-lg bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800"
                        >
                          {[0.75, 1, 1.25, 1.5].map((r) => (
                            <option key={r} value={r}>
                              {r}x
                            </option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="block text-[11px] font-semibold text-slate-500 mb-1">
                          Volume ({Math.round(scene.volume * 100)}%)
                        </label>
                        <input
                          type="range"
                          min={0}
                          max={1.5}
                          step={0.05}
                          value={scene.volume}
                          onChange={(e) =>
                            updateScene(scene.id, { volume: parseFloat(e.target.value) })
                          }
                          className="w-full mt-1.5"
                        />
                      </div>
                    </div>
                  )}
                </div>
              ))}

              {scenes.length === 0 && (
                <div className="p-8 text-center rounded-2xl bg-white dark:bg-[#0c1631] border border-dashed border-slate-300 dark:border-slate-800 text-xs text-slate-500 space-y-2">
                  <p>
                    {isEn
                      ? 'Blank Video Studio ready — build from scratch with custom scenes, local media, or online resources.'
                      : 'Studio Vidéo vierge — ajoutez une scène texte, vos photos/vidéos locales ou recherchez des ressources en ligne.'}
                  </p>
                  <button
                    type="button"
                    onClick={addBlankCustomScene}
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-bold"
                  >
                    <Plus className="w-4 h-4" />
                    <span>
                      {isEn ? 'Start with a Custom Scene' : 'Commencer avec une scène vierge'}
                    </span>
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      <OnlineResourceModal
        isOpen={resourceModalOpen}
        onClose={() => setResourceModalOpen(false)}
        allowedCategories={['video', 'photo', 'illustration', 'background', 'audio']}
        defaultCategory="video"
        onSelectAsset={handleSelectOnlineResource}
        title={isEn ? 'Video & Audio Assets' : 'Ressources Vidéo, Photos & Musiques'}
      />

      <SocialShareModal
        isOpen={!!sharePayload}
        onClose={() => setSharePayload(null)}
        payload={sharePayload}
      />
    </div>
  );
};
