import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  Type,
  Shapes,
  Image as ImageIcon,
  Pencil,
  Trash2,
  ArrowUp,
  ArrowDown,
  Copy,
  Download,
  Share2,
  Save,
  RotateCcw,
  Eraser,
  CheckCircle2,
  CheckSquare,
  Square,
  ZoomIn,
  ZoomOut,
  ArrowLeft,
  Undo2,
  Redo2,
  Globe,
  Layers,
  AlignLeft,
  AlignCenter,
  AlignRight,
  AlignVerticalJustifyStart,
  AlignVerticalJustifyCenter,
  AlignVerticalJustifyEnd,
  Palette,
} from 'lucide-react';
import { useShalomDB } from '../../hooks/useShalomDB';
import { dbService, STORES } from '../../services/db';
import { useLanguage } from '../../contexts/LanguageContext';
import {
  CreativeDesignItem,
  DownloadedStudioAsset,
  StudioAssetCategory,
  StudioProjectRecord,
} from '../../types';
import { ConfirmDialog } from '../common/ConfirmDialog';
import { SocialShareModal } from '../common/SocialShareModal';
import { SharePayload } from '../../services/socialShare';
import { StudioHomePanel, StudioTemplateCard } from './StudioHomePanel';
import { OnlineResourceModal } from './OnlineResourceModal';

type FormatRatio = 'square' | 'portrait' | 'story' | 'landscape';
type ShapeKind =
  | 'rect'
  | 'roundRect'
  | 'circle'
  | 'triangle'
  | 'star'
  | 'cross'
  | 'heart'
  | 'diamond'
  | 'line';

interface BaseLayer {
  id: string;
  x: number;
  y: number;
  rotation: number;
  opacity: number;
}

interface TextLayer extends BaseLayer {
  kind: 'text';
  text: string;
  fontFamily: string;
  fontSize: number;
  color: string;
  bold: boolean;
  italic: boolean;
  align: 'left' | 'center' | 'right';
  bgColor: string;
  bgEnabled: boolean;
  shadow: boolean;
}

interface ShapeLayer extends BaseLayer {
  kind: 'shape';
  shape: ShapeKind;
  width: number;
  height: number;
  fillColor: string;
  strokeColor: string;
  strokeWidth: number;
}

interface ImageLayer extends BaseLayer {
  kind: 'image';
  imageEl: HTMLImageElement;
  label: string;
  width: number;
  height: number;
  circular: boolean;
  blobKey?: string;
  sourceBlob?: Blob;
  attribution?: string;
}

interface DrawStroke {
  id: string;
  color: string;
  size: number;
  points: Array<{ x: number; y: number }>;
}

type StudioLayer = TextLayer | ShapeLayer | ImageLayer;

interface SerializedGraphicProject {
  version: 1;
  formatRatio: FormatRatio;
  bgType: 'solid' | 'gradient' | 'image';
  bgColor1: string;
  bgColor2: string;
  bgAngle: number;
  bgImageBlobKey?: string;
  bgImageOverlay: number;
  layers: Array<
    | TextLayer
    | ShapeLayer
    | {
        id: string;
        kind: 'image';
        x: number;
        y: number;
        rotation: number;
        opacity: number;
        label: string;
        width: number;
        height: number;
        circular: boolean;
        blobKey?: string;
        attribution?: string;
      }
  >;
  strokes: DrawStroke[];
}

interface HistorySnapshot {
  formatRatio: FormatRatio;
  bgType: 'solid' | 'gradient' | 'image';
  bgColor1: string;
  bgColor2: string;
  bgAngle: number;
  bgImageOverlay: number;
  layers: StudioLayer[];
  strokes: DrawStroke[];
}

const FORMAT_DIMS: Record<FormatRatio, { w: number; h: number; label: string }> = {
  square: { w: 1080, h: 1080, label: '1:1 (1080×1080)' },
  portrait: { w: 1080, h: 1350, label: '4:5 (1080×1350)' },
  story: { w: 1080, h: 1920, label: '9:16 (1080×1920)' },
  landscape: { w: 1280, h: 720, label: '16:9 (1280×720)' },
};

const FONT_CHOICES = [
  { label: 'Sans Moderne', value: '"Plus Jakarta Sans", sans-serif' },
  { label: 'Classique Serif', value: 'Georgia, "Times New Roman", serif' },
  { label: 'Titre Display', value: '"Outfit", sans-serif' },
  { label: 'Manuscrite', value: 'cursive' },
  { label: 'Machine à écrire', value: '"Courier New", monospace' },
];

const GRAPHIC_TEMPLATES: StudioTemplateCard[] = [
  {
    id: 'verset_lumiere',
    title: 'Verset du Jour · Lumière d’or',
    subtitle: 'Carré 1:1 · Élégant & lumineux',
    formatLabel: '1:1',
    previewBg: 'linear-gradient(135deg, #0b1f42 0%, #1d4ed8 100%)',
    previewAccent: '#fbbf24',
    sampleHeading: '« L’Éternel est mon berger »',
    sampleSub: 'Psaume 23:1',
  },
  {
    id: 'invitation_culte',
    title: 'Invitation Culte & Louange',
    subtitle: 'Portrait 4:5 · Affiche événement',
    formatLabel: '4:5',
    previewBg: 'linear-gradient(150deg, #311042 0%, #831843 100%)',
    previewAccent: '#fde68a',
    sampleHeading: 'CULTE DE LOUANGE & PRIÈRE',
    sampleSub: 'Dimanche 09h30 · Bienvenue',
  },
  {
    id: 'story_priere',
    title: 'Story Prière du Matin',
    subtitle: 'Vertical 9:16 · Statut / Story',
    formatLabel: '9:16',
    previewBg: 'linear-gradient(180deg, #0f172a 0%, #0e7490 100%)',
    previewAccent: '#38bdf8',
    sampleHeading: 'Un cœur en paix chaque matin',
    sampleSub: 'Méditation quotidienne',
  },
  {
    id: 'banniere_predication',
    title: 'Bannière Prédication 16:9',
    subtitle: 'Paysage 16:9 · Écran & Vidéo',
    formatLabel: '16:9',
    previewBg: 'linear-gradient(135deg, #064e3b 0%, #047857 100%)',
    previewAccent: '#fcd34d',
    sampleHeading: 'Marcher par la Foi',
    sampleSub: '2 Corinthiens 5:7',
  },
  {
    id: 'temoignage_grace',
    title: 'Témoignage & Action de grâces',
    subtitle: 'Carré 1:1 · Style éditorial clair',
    formatLabel: '1:1',
    previewBg: 'linear-gradient(135deg, #fffbeb 0%, #fef3c7 100%)',
    previewTextColor: '#0f172a',
    previewAccent: '#d97706',
    sampleHeading: 'À Dieu soit toute la gloire !',
    sampleSub: 'Témoignage de gratitude',
  },
  {
    id: 'carte_voeux',
    title: 'Carte de Bénédiction & Vœux',
    subtitle: 'Portrait 4:5 · Envoi WhatsApp / Gmail',
    formatLabel: '4:5',
    previewBg: 'linear-gradient(135deg, #1e1b4b 0%, #4338ca 100%)',
    previewAccent: '#f59e0b',
    sampleHeading: 'Que la paix de Dieu vous garde',
    sampleSub: 'Philippiens 4:7',
  },
];

function loadImageFromBlob(blob: Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = (err) => {
      URL.revokeObjectURL(url);
      reject(err);
    };
    img.src = url;
  });
}

export const CreativeStudioModule: React.FC = () => {
  const { lang } = useLanguage();
  const { creations, studioProjects, reloadData } = useShalomDB();
  const isEn = lang === 'en';

  const [viewMode, setViewMode] = useState<'home' | 'editor'>('home');
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const [designTitle, setDesignTitle] = useState(isEn ? 'My Creation' : 'Ma création');
  const [formatRatio, setFormatRatio] = useState<FormatRatio>('square');
  const [bgType, setBgType] = useState<'solid' | 'gradient' | 'image'>('solid');
  const [bgColor1, setBgColor1] = useState('#ffffff');
  const [bgColor2, setBgColor2] = useState('#173c7a');
  const [bgAngle, setBgAngle] = useState(135);
  const [bgImageEl, setBgImageEl] = useState<HTMLImageElement | null>(null);
  const [bgImageBlobKey, setBgImageBlobKey] = useState<string | undefined>(undefined);
  const [bgImageSourceBlob, setBgImageSourceBlob] = useState<Blob | undefined>(undefined);
  const [bgImageOverlay, setBgImageOverlay] = useState(0.2);

  const [layers, setLayers] = useState<StudioLayer[]>([]);
  const [selectedLayerId, setSelectedLayerId] = useState<string | null>(null);
  const [showShapesBar, setShowShapesBar] = useState(false);
  const [showLayersList, setShowLayersList] = useState(false);

  // Freehand drawing
  const [isDrawMode, setIsDrawMode] = useState(false);
  const [brushColor, setBrushColor] = useState('#0b1f42');
  const [brushSize, setBrushSize] = useState(10);
  const [strokes, setStrokes] = useState<DrawStroke[]>([]);
  const activeStrokeRef = useRef<DrawStroke | null>(null);

  // Undo / Redo stacks
  const [undoStack, setUndoStack] = useState<HistorySnapshot[]>([]);
  const [redoStack, setRedoStack] = useState<HistorySnapshot[]>([]);

  // Online Resource Modal
  const [resourceModalOpen, setResourceModalOpen] = useState(false);
  const [resourceDefaultCat, setResourceDefaultCat] = useState<StudioAssetCategory>('photo');
  const [resourceTargetMode, setResourceTargetMode] = useState<'layer' | 'background'>('layer');

  const dragStateRef = useRef<{
    layerId: string;
    offsetX: number;
    offsetY: number;
  } | null>(null);

  const pinchStateRef = useRef<{
    startDist: number;
    layerId: string;
    startFontSize?: number;
    startWidth?: number;
    startHeight?: number;
  } | null>(null);

  const [notice, setNotice] = useState<string | null>(null);
  const [sharePayload, setSharePayload] = useState<SharePayload | null>(null);
  const [savedPreviews, setSavedPreviews] = useState<Record<string, string>>({});
  const [selectedCreationIds, setSelectedCreationIds] = useState<string[]>([]);
  const [confirmDeleteCreations, setConfirmDeleteCreations] = useState<CreativeDesignItem[] | null>(
    null
  );

  const dims = FORMAT_DIMS[formatRatio];

  const recentGraphicProjects = useMemo(
    () => studioProjects.filter((p) => p.studio === 'design'),
    [studioProjects]
  );

  const pushUndoSnapshot = useCallback(() => {
    const snap: HistorySnapshot = {
      formatRatio,
      bgType,
      bgColor1,
      bgColor2,
      bgAngle,
      bgImageOverlay,
      layers: layers.map((l) => ({ ...l })),
      strokes: strokes.map((s) => ({ ...s, points: [...s.points] })),
    };
    setUndoStack((prev) => [...prev.slice(-19), snap]);
    setRedoStack([]);
  }, [formatRatio, bgType, bgColor1, bgColor2, bgAngle, bgImageOverlay, layers, strokes]);

  const handleUndo = useCallback(() => {
    setUndoStack((prev) => {
      if (prev.length === 0) return prev;
      const last = prev[prev.length - 1];
      const currentSnap: HistorySnapshot = {
        formatRatio,
        bgType,
        bgColor1,
        bgColor2,
        bgAngle,
        bgImageOverlay,
        layers: layers.map((l) => ({ ...l })),
        strokes: strokes.map((s) => ({ ...s, points: [...s.points] })),
      };
      setRedoStack((r) => [...r, currentSnap]);
      setFormatRatio(last.formatRatio);
      setBgType(last.bgType);
      setBgColor1(last.bgColor1);
      setBgColor2(last.bgColor2);
      setBgAngle(last.bgAngle);
      setBgImageOverlay(last.bgImageOverlay);
      setLayers(last.layers);
      setStrokes(last.strokes);
      return prev.slice(0, -1);
    });
  }, [formatRatio, bgType, bgColor1, bgColor2, bgAngle, bgImageOverlay, layers, strokes]);

  const handleRedo = useCallback(() => {
    setRedoStack((prev) => {
      if (prev.length === 0) return prev;
      const next = prev[prev.length - 1];
      const currentSnap: HistorySnapshot = {
        formatRatio,
        bgType,
        bgColor1,
        bgColor2,
        bgAngle,
        bgImageOverlay,
        layers: layers.map((l) => ({ ...l })),
        strokes: strokes.map((s) => ({ ...s, points: [...s.points] })),
      };
      setUndoStack((u) => [...u, currentSnap]);
      setFormatRatio(next.formatRatio);
      setBgType(next.bgType);
      setBgColor1(next.bgColor1);
      setBgColor2(next.bgColor2);
      setBgAngle(next.bgAngle);
      setBgImageOverlay(next.bgImageOverlay);
      setLayers(next.layers);
      setStrokes(next.strokes);
      return prev.slice(0, -1);
    });
  }, [formatRatio, bgType, bgColor1, bgColor2, bgAngle, bgImageOverlay, layers, strokes]);

  useEffect(() => {
    let cancelled = false;
    const urls: string[] = [];
    (async () => {
      const next: Record<string, string> = {};
      for (const item of creations) {
        const blob = await dbService.getMediaBlob(item.mediaBlobKey);
        if (blob && !cancelled) {
          const url = URL.createObjectURL(blob);
          urls.push(url);
          next[item.id] = url;
        }
      }
      if (!cancelled) setSavedPreviews(next);
    })();
    return () => {
      cancelled = true;
      urls.forEach((u) => URL.revokeObjectURL(u));
    };
  }, [creations]);

  const selectedLayer = layers.find((l) => l.id === selectedLayerId) || null;

  const drawShape = (ctx: CanvasRenderingContext2D, l: ShapeLayer) => {
    const hw = l.width / 2;
    const hh = l.height / 2;
    ctx.beginPath();

    switch (l.shape) {
      case 'rect':
        ctx.rect(-hw, -hh, l.width, l.height);
        break;
      case 'roundRect': {
        const r = Math.min(36, hw, hh);
        ctx.moveTo(-hw + r, -hh);
        ctx.lineTo(hw - r, -hh);
        ctx.quadraticCurveTo(hw, -hh, hw, -hh + r);
        ctx.lineTo(hw, hh - r);
        ctx.quadraticCurveTo(hw, hh, hw - r, hh);
        ctx.lineTo(-hw + r, hh);
        ctx.quadraticCurveTo(-hw, hh, -hw, hh - r);
        ctx.lineTo(-hw, -hh + r);
        ctx.quadraticCurveTo(-hw, -hh, -hw + r, -hh);
        break;
      }
      case 'circle':
        ctx.ellipse(0, 0, hw, hh, 0, 0, Math.PI * 2);
        break;
      case 'triangle':
        ctx.moveTo(0, -hh);
        ctx.lineTo(hw, hh);
        ctx.lineTo(-hw, hh);
        ctx.closePath();
        break;
      case 'diamond':
        ctx.moveTo(0, -hh);
        ctx.lineTo(hw, 0);
        ctx.lineTo(0, hh);
        ctx.lineTo(-hw, 0);
        ctx.closePath();
        break;
      case 'star': {
        const spikes = 5;
        const outerR = Math.min(hw, hh);
        const innerR = outerR * 0.45;
        for (let i = 0; i < spikes * 2; i++) {
          const rad = i % 2 === 0 ? outerR : innerR;
          const angle = (i * Math.PI) / spikes - Math.PI / 2;
          const px = Math.cos(angle) * rad;
          const py = Math.sin(angle) * rad;
          if (i === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        }
        ctx.closePath();
        break;
      }
      case 'cross': {
        const armW = l.width * 0.28;
        const barY = -l.height * 0.14;
        const barH = l.height * 0.24;
        ctx.moveTo(-armW / 2, -hh);
        ctx.lineTo(armW / 2, -hh);
        ctx.lineTo(armW / 2, barY);
        ctx.lineTo(hw, barY);
        ctx.lineTo(hw, barY + barH);
        ctx.lineTo(armW / 2, barY + barH);
        ctx.lineTo(armW / 2, hh);
        ctx.lineTo(-armW / 2, hh);
        ctx.lineTo(-armW / 2, barY + barH);
        ctx.lineTo(-hw, barY + barH);
        ctx.lineTo(-hw, barY);
        ctx.lineTo(-armW / 2, barY);
        ctx.closePath();
        break;
      }
      case 'heart': {
        const topCurveH = l.height * 0.3;
        ctx.moveTo(0, hh * 0.85);
        ctx.bezierCurveTo(-hw * 1.2, hh * 0.1, -hw, -hh * 0.7, 0, -hh + topCurveH);
        ctx.bezierCurveTo(hw, -hh * 0.7, hw * 1.2, hh * 0.1, 0, hh * 0.85);
        ctx.closePath();
        break;
      }
      case 'line':
        ctx.moveTo(-hw, 0);
        ctx.lineTo(hw, 0);
        break;
    }

    if (l.shape !== 'line' && l.fillColor !== 'transparent') {
      ctx.fillStyle = l.fillColor;
      ctx.fill();
    }
    if (l.strokeWidth > 0) {
      ctx.strokeStyle = l.strokeColor;
      ctx.lineWidth = l.strokeWidth;
      ctx.stroke();
    }
  };

  const renderCanvas = useCallback(
    (showSelectionBox = true) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      canvas.width = dims.w;
      canvas.height = dims.h;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      if (bgType === 'solid') {
        ctx.fillStyle = bgColor1;
        ctx.fillRect(0, 0, dims.w, dims.h);
      } else if (bgType === 'gradient') {
        const rad = (bgAngle * Math.PI) / 180;
        const cx = dims.w / 2;
        const cy = dims.h / 2;
        const r = Math.max(dims.w, dims.h) / 2;
        const grad = ctx.createLinearGradient(
          cx - Math.cos(rad) * r,
          cy - Math.sin(rad) * r,
          cx + Math.cos(rad) * r,
          cy + Math.sin(rad) * r
        );
        grad.addColorStop(0, bgColor1);
        grad.addColorStop(1, bgColor2);
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, dims.w, dims.h);
      } else if (bgType === 'image' && bgImageEl) {
        ctx.fillStyle = bgColor1;
        ctx.fillRect(0, 0, dims.w, dims.h);
        const iRatio = bgImageEl.width / Math.max(1, bgImageEl.height);
        const cRatio = dims.w / dims.h;
        let dw = dims.w;
        let dh = dims.h;
        let dx = 0;
        let dy = 0;
        if (iRatio > cRatio) {
          dh = dims.h;
          dw = dims.h * iRatio;
          dx = (dims.w - dw) / 2;
        } else {
          dw = dims.w;
          dh = dims.w / iRatio;
          dy = (dims.h - dh) / 2;
        }
        ctx.drawImage(bgImageEl, dx, dy, dw, dh);
        if (bgImageOverlay > 0) {
          ctx.fillStyle = `rgba(0,0,0,${bgImageOverlay})`;
          ctx.fillRect(0, 0, dims.w, dims.h);
        }
      } else {
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, dims.w, dims.h);
      }

      for (const layer of layers) {
        ctx.save();
        ctx.globalAlpha = layer.opacity;
        ctx.translate(layer.x, layer.y);
        ctx.rotate((layer.rotation * Math.PI) / 180);

        if (layer.kind === 'shape') {
          drawShape(ctx, layer);
        } else if (layer.kind === 'image') {
          const hw = layer.width / 2;
          const hh = layer.height / 2;
          if (layer.circular) {
            ctx.beginPath();
            ctx.ellipse(0, 0, hw, hh, 0, 0, Math.PI * 2);
            ctx.closePath();
            ctx.clip();
          }
          ctx.drawImage(layer.imageEl, -hw, -hh, layer.width, layer.height);
        } else if (layer.kind === 'text') {
          ctx.font = `${layer.italic ? 'italic ' : ''}${layer.bold ? '700 ' : '400 '}${layer.fontSize}px ${layer.fontFamily}`;
          ctx.textAlign = layer.align;
          ctx.textBaseline = 'middle';
          const lines = layer.text.split('\n');
          const lineH = layer.fontSize * 1.28;
          const maxLineW = Math.max(40, ...lines.map((ln) => ctx.measureText(ln).width));
          const totalH = lines.length * lineH;

          if (layer.bgEnabled) {
            ctx.fillStyle = layer.bgColor;
            ctx.fillRect(-maxLineW / 2 - 24, -totalH / 2 - 14, maxLineW + 48, totalH + 28);
          }

          if (layer.shadow) {
            ctx.shadowColor = 'rgba(0,0,0,0.45)';
            ctx.shadowBlur = 14;
            ctx.shadowOffsetY = 4;
          }

          ctx.fillStyle = layer.color;
          const startY = -((lines.length - 1) * lineH) / 2;
          lines.forEach((ln, idx) => {
            const tx =
              layer.align === 'left' ? -maxLineW / 2 : layer.align === 'right' ? maxLineW / 2 : 0;
            ctx.fillText(ln, tx, startY + idx * lineH);
          });
        }

        if (showSelectionBox && layer.id === selectedLayerId) {
          ctx.shadowColor = 'transparent';
          ctx.strokeStyle = '#2563eb';
          ctx.lineWidth = 3;
          ctx.setLineDash([10, 6]);
          if (layer.kind === 'text') {
            ctx.strokeRect(-220, -60, 440, 120);
          } else {
            ctx.strokeRect(
              -layer.width / 2 - 8,
              -layer.height / 2 - 8,
              layer.width + 16,
              layer.height + 16
            );
          }
        }

        ctx.restore();
      }

      const allStrokes = activeStrokeRef.current ? [...strokes, activeStrokeRef.current] : strokes;
      for (const s of allStrokes) {
        if (s.points.length < 2) continue;
        ctx.save();
        ctx.strokeStyle = s.color;
        ctx.lineWidth = s.size;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.beginPath();
        ctx.moveTo(s.points[0].x, s.points[0].y);
        for (let i = 1; i < s.points.length; i++) {
          ctx.lineTo(s.points[i].x, s.points[i].y);
        }
        ctx.stroke();
        ctx.restore();
      }
    },
    [
      dims,
      bgType,
      bgColor1,
      bgColor2,
      bgAngle,
      bgImageEl,
      bgImageOverlay,
      layers,
      selectedLayerId,
      strokes,
    ]
  );

  useEffect(() => {
    if (viewMode === 'editor') {
      renderCanvas(true);
    }
  }, [renderCanvas, viewMode]);

  const startBlankProject = (formatId?: string) => {
    const ratio: FormatRatio =
      formatId === 'portrait' || formatId === 'story' || formatId === 'landscape'
        ? formatId
        : 'square';
    setActiveProjectId(null);
    setDesignTitle(isEn ? 'Untitled Design' : 'Nouveau design');
    setFormatRatio(ratio);
    setBgType('solid');
    setBgColor1('#ffffff');
    setBgColor2('#173c7a');
    setBgAngle(135);
    setBgImageEl(null);
    setBgImageBlobKey(undefined);
    setBgImageSourceBlob(undefined);
    setBgImageOverlay(0.2);
    setLayers([]);
    setStrokes([]);
    setSelectedLayerId(null);
    setUndoStack([]);
    setRedoStack([]);
    setNotice(null);
    setViewMode('editor');
  };

  const applyGraphicTemplate = (templateId: string) => {
    setActiveProjectId(null);
    setBgImageEl(null);
    setBgImageBlobKey(undefined);
    setBgImageSourceBlob(undefined);
    setStrokes([]);
    setUndoStack([]);
    setRedoStack([]);
    setNotice(null);

    if (templateId === 'verset_lumiere') {
      setDesignTitle('Verset du jour · Lumière d’or');
      setFormatRatio('square');
      setBgType('gradient');
      setBgColor1('#0b1f42');
      setBgColor2('#1d4ed8');
      setBgAngle(135);
      setLayers([
        {
          id: 'tpl_frame',
          kind: 'shape',
          shape: 'roundRect',
          x: 540,
          y: 540,
          width: 920,
          height: 920,
          fillColor: 'transparent',
          strokeColor: '#fbbf24',
          strokeWidth: 6,
          rotation: 0,
          opacity: 0.55,
        },
        {
          id: 'tpl_cross',
          kind: 'shape',
          shape: 'cross',
          x: 540,
          y: 230,
          width: 90,
          height: 120,
          fillColor: '#fbbf24',
          strokeColor: '#fbbf24',
          strokeWidth: 0,
          rotation: 0,
          opacity: 0.95,
        },
        {
          id: 'tpl_verse',
          kind: 'text',
          text: '« L’Éternel est mon berger :\nje ne manquerai de rien. »',
          fontFamily: 'Georgia, "Times New Roman", serif',
          fontSize: 64,
          color: '#ffffff',
          bold: true,
          italic: false,
          align: 'center',
          bgColor: '#0b1f42',
          bgEnabled: false,
          shadow: true,
          x: 540,
          y: 520,
          rotation: 0,
          opacity: 1,
        },
        {
          id: 'tpl_ref',
          kind: 'text',
          text: 'PSAUME 23 : 1',
          fontFamily: '"Outfit", sans-serif',
          fontSize: 38,
          color: '#fbbf24',
          bold: true,
          italic: false,
          align: 'center',
          bgColor: '#0b1f42',
          bgEnabled: false,
          shadow: false,
          x: 540,
          y: 780,
          rotation: 0,
          opacity: 1,
        },
      ]);
    } else if (templateId === 'invitation_culte') {
      setDesignTitle('Invitation Culte & Louange');
      setFormatRatio('portrait');
      setBgType('gradient');
      setBgColor1('#311042');
      setBgColor2('#831843');
      setBgAngle(150);
      setLayers([
        {
          id: 'tpl_badge',
          kind: 'shape',
          shape: 'roundRect',
          x: 540,
          y: 260,
          width: 480,
          height: 84,
          fillColor: '#fde68a',
          strokeColor: '#fde68a',
          strokeWidth: 0,
          rotation: 0,
          opacity: 0.95,
        },
        {
          id: 'tpl_tag',
          kind: 'text',
          text: 'INVITATION SPÉCIALE',
          fontFamily: '"Outfit", sans-serif',
          fontSize: 34,
          color: '#311042',
          bold: true,
          italic: false,
          align: 'center',
          bgColor: '#ffffff',
          bgEnabled: false,
          shadow: false,
          x: 540,
          y: 260,
          rotation: 0,
          opacity: 1,
        },
        {
          id: 'tpl_title',
          kind: 'text',
          text: 'CULTE DE\nLOUANGE & PRIÈRE',
          fontFamily: '"Outfit", sans-serif',
          fontSize: 82,
          color: '#ffffff',
          bold: true,
          italic: false,
          align: 'center',
          bgColor: '#000000',
          bgEnabled: false,
          shadow: true,
          x: 540,
          y: 590,
          rotation: 0,
          opacity: 1,
        },
        {
          id: 'tpl_line',
          kind: 'shape',
          shape: 'line',
          x: 540,
          y: 820,
          width: 460,
          height: 8,
          fillColor: 'transparent',
          strokeColor: '#fde68a',
          strokeWidth: 8,
          rotation: 0,
          opacity: 0.9,
        },
        {
          id: 'tpl_info',
          kind: 'text',
          text: 'Ce Dimanche · 09h30\nVenez bénir le nom du Seigneur',
          fontFamily: '"Plus Jakarta Sans", sans-serif',
          fontSize: 42,
          color: '#fef3c7',
          bold: false,
          italic: false,
          align: 'center',
          bgColor: '#000000',
          bgEnabled: false,
          shadow: false,
          x: 540,
          y: 980,
          rotation: 0,
          opacity: 1,
        },
      ]);
    } else if (templateId === 'story_priere') {
      setDesignTitle('Story Prière du Matin');
      setFormatRatio('story');
      setBgType('gradient');
      setBgColor1('#0f172a');
      setBgColor2('#0e7490');
      setBgAngle(180);
      setLayers([
        {
          id: 'tpl_orb',
          kind: 'shape',
          shape: 'circle',
          x: 540,
          y: 480,
          width: 340,
          height: 340,
          fillColor: '#38bdf8',
          strokeColor: '#e0f2fe',
          strokeWidth: 4,
          rotation: 0,
          opacity: 0.25,
        },
        {
          id: 'tpl_title',
          kind: 'text',
          text: 'Prière du Matin',
          fontFamily: '"Outfit", sans-serif',
          fontSize: 78,
          color: '#ffffff',
          bold: true,
          italic: false,
          align: 'center',
          bgColor: '#0f172a',
          bgEnabled: false,
          shadow: true,
          x: 540,
          y: 780,
          rotation: 0,
          opacity: 1,
        },
        {
          id: 'tpl_body',
          kind: 'text',
          text: 'Seigneur, guide mes pas\net remplis mon cœur de Ta paix\ntout au long de cette journée.',
          fontFamily: 'Georgia, "Times New Roman", serif',
          fontSize: 48,
          color: '#e0f2fe',
          bold: false,
          italic: true,
          align: 'center',
          bgColor: '#0f172a',
          bgEnabled: false,
          shadow: false,
          x: 540,
          y: 1120,
          rotation: 0,
          opacity: 1,
        },
      ]);
    } else if (templateId === 'banniere_predication') {
      setDesignTitle('Bannière Prédication');
      setFormatRatio('landscape');
      setBgType('gradient');
      setBgColor1('#064e3b');
      setBgColor2('#047857');
      setBgAngle(135);
      setLayers([
        {
          id: 'tpl_rect',
          kind: 'shape',
          shape: 'roundRect',
          x: 640,
          y: 360,
          width: 1120,
          height: 580,
          fillColor: 'transparent',
          strokeColor: '#fcd34d',
          strokeWidth: 5,
          rotation: 0,
          opacity: 0.45,
        },
        {
          id: 'tpl_head',
          kind: 'text',
          text: 'MARCHER PAR LA FOI',
          fontFamily: '"Outfit", sans-serif',
          fontSize: 74,
          color: '#ffffff',
          bold: true,
          italic: false,
          align: 'center',
          bgColor: '#000000',
          bgEnabled: false,
          shadow: true,
          x: 640,
          y: 310,
          rotation: 0,
          opacity: 1,
        },
        {
          id: 'tpl_sub',
          kind: 'text',
          text: '2 Corinthiens 5 : 7 · Série d’enseignement',
          fontFamily: '"Plus Jakarta Sans", sans-serif',
          fontSize: 36,
          color: '#fde68a',
          bold: true,
          italic: false,
          align: 'center',
          bgColor: '#000000',
          bgEnabled: false,
          shadow: false,
          x: 640,
          y: 440,
          rotation: 0,
          opacity: 1,
        },
      ]);
    } else if (templateId === 'temoignage_grace') {
      setDesignTitle('Témoignage & Reconnaissance');
      setFormatRatio('square');
      setBgType('gradient');
      setBgColor1('#fffbeb');
      setBgColor2('#fef3c7');
      setBgAngle(135);
      setLayers([
        {
          id: 'tpl_border',
          kind: 'shape',
          shape: 'roundRect',
          x: 540,
          y: 540,
          width: 940,
          height: 940,
          fillColor: '#ffffff',
          strokeColor: '#d97706',
          strokeWidth: 6,
          rotation: 0,
          opacity: 0.9,
        },
        {
          id: 'tpl_heart',
          kind: 'shape',
          shape: 'heart',
          x: 540,
          y: 250,
          width: 110,
          height: 110,
          fillColor: '#d97706',
          strokeColor: '#d97706',
          strokeWidth: 0,
          rotation: 0,
          opacity: 1,
        },
        {
          id: 'tpl_text',
          kind: 'text',
          text: 'À Dieu soit toute la gloire !\nMerci pour Sa fidélité.',
          fontFamily: 'Georgia, "Times New Roman", serif',
          fontSize: 60,
          color: '#0f172a',
          bold: true,
          italic: false,
          align: 'center',
          bgColor: '#ffffff',
          bgEnabled: false,
          shadow: false,
          x: 540,
          y: 560,
          rotation: 0,
          opacity: 1,
        },
      ]);
    } else {
      setDesignTitle('Carte de Bénédiction');
      setFormatRatio('portrait');
      setBgType('gradient');
      setBgColor1('#1e1b4b');
      setBgColor2('#4338ca');
      setBgAngle(140);
      setLayers([
        {
          id: 'tpl_star',
          kind: 'shape',
          shape: 'star',
          x: 540,
          y: 270,
          width: 120,
          height: 120,
          fillColor: '#fbbf24',
          strokeColor: '#fbbf24',
          strokeWidth: 0,
          rotation: 0,
          opacity: 1,
        },
        {
          id: 'tpl_quote',
          kind: 'text',
          text: '« Que la paix de Dieu,\nqui surpasse toute intelligence,\ngarde vos cœurs. »',
          fontFamily: 'Georgia, "Times New Roman", serif',
          fontSize: 56,
          color: '#ffffff',
          bold: true,
          italic: false,
          align: 'center',
          bgColor: '#1e1b4b',
          bgEnabled: false,
          shadow: true,
          x: 540,
          y: 675,
          rotation: 0,
          opacity: 1,
        },
        {
          id: 'tpl_ref2',
          kind: 'text',
          text: 'Philippiens 4 : 7',
          fontFamily: '"Outfit", sans-serif',
          fontSize: 38,
          color: '#fcd34d',
          bold: true,
          italic: false,
          align: 'center',
          bgColor: '#1e1b4b',
          bgEnabled: false,
          shadow: false,
          x: 540,
          y: 1020,
          rotation: 0,
          opacity: 1,
        },
      ]);
    }

    setSelectedLayerId(null);
    setViewMode('editor');
  };

  const openSavedProject = async (project: StudioProjectRecord) => {
    try {
      const parsed = JSON.parse(project.dataJson) as SerializedGraphicProject;
      setActiveProjectId(project.id);
      setDesignTitle(project.title);
      setFormatRatio(parsed.formatRatio || 'square');
      setBgType(parsed.bgType || 'solid');
      setBgColor1(parsed.bgColor1 || '#ffffff');
      setBgColor2(parsed.bgColor2 || '#173c7a');
      setBgAngle(parsed.bgAngle ?? 135);
      setBgImageOverlay(parsed.bgImageOverlay ?? 0.2);
      setBgImageBlobKey(parsed.bgImageBlobKey);
      setBgImageSourceBlob(undefined);
      setStrokes(Array.isArray(parsed.strokes) ? parsed.strokes : []);

      if (parsed.bgImageBlobKey) {
        const bgBlob = await dbService.getMediaBlob(parsed.bgImageBlobKey);
        if (bgBlob) {
          const img = await loadImageFromBlob(bgBlob);
          setBgImageEl(img);
        } else {
          setBgImageEl(null);
        }
      } else {
        setBgImageEl(null);
      }

      const hydratedLayers: StudioLayer[] = [];
      for (const item of parsed.layers || []) {
        if (item.kind === 'image') {
          if (item.blobKey) {
            const imgBlob = await dbService.getMediaBlob(item.blobKey);
            if (imgBlob) {
              const imgEl = await loadImageFromBlob(imgBlob);
              hydratedLayers.push({
                id: item.id,
                kind: 'image',
                x: item.x,
                y: item.y,
                rotation: item.rotation,
                opacity: item.opacity,
                label: item.label,
                width: item.width,
                height: item.height,
                circular: item.circular,
                blobKey: item.blobKey,
                attribution: item.attribution,
                imageEl: imgEl,
              });
            }
          }
        } else {
          hydratedLayers.push(item as StudioLayer);
        }
      }

      setLayers(hydratedLayers);
      setSelectedLayerId(null);
      setUndoStack([]);
      setRedoStack([]);
      setNotice(null);
      setViewMode('editor');
    } catch {
      setNotice(
        isEn
          ? 'Unable to open this saved graphic project.'
          : 'Impossible d’ouvrir ce projet graphique.'
      );
    }
  };

  const handleDuplicateProject = async (project: StudioProjectRecord) => {
    const now = new Date().toISOString();
    const copy: StudioProjectRecord = {
      ...project,
      id: `proj_des_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`,
      title: `${project.title} (${isEn ? 'Copy' : 'Copie'})`,
      createdAt: now,
      updatedAt: now,
    };
    await dbService.put(STORES.STUDIO_PROJECTS, copy);
    await reloadData();
  };

  const handleDeleteProject = async (project: StudioProjectRecord) => {
    await dbService.deleteItem(STORES.STUDIO_PROJECTS, project.id);
    await reloadData();
  };

  const handleSaveEditableProject = async () => {
    const uid = `${Date.now()}_${Math.random().toString(36).slice(2, 5)}`;
    let nextBgBlobKey = bgImageBlobKey;
    if (bgType === 'image' && !nextBgBlobKey && bgImageSourceBlob) {
      nextBgBlobKey = `blob_studio_bg_${uid}`;
      await dbService.saveMediaBlob(
        nextBgBlobKey,
        bgImageSourceBlob,
        bgImageSourceBlob.type || 'image/png'
      );
      setBgImageBlobKey(nextBgBlobKey);
    }

    const serializedLayers: SerializedGraphicProject['layers'] = [];
    const updatedRuntimeLayers: StudioLayer[] = [];

    for (let i = 0; i < layers.length; i++) {
      const l = layers[i];
      if (l.kind === 'image') {
        let key = l.blobKey;
        if (!key && l.sourceBlob) {
          key = `blob_studio_img_${uid}_${i}`;
          await dbService.saveMediaBlob(key, l.sourceBlob, l.sourceBlob.type || 'image/png');
        }
        updatedRuntimeLayers.push({ ...l, blobKey: key });
        serializedLayers.push({
          id: l.id,
          kind: 'image',
          x: l.x,
          y: l.y,
          rotation: l.rotation,
          opacity: l.opacity,
          label: l.label,
          width: l.width,
          height: l.height,
          circular: l.circular,
          blobKey: key,
          attribution: l.attribution,
        });
      } else {
        updatedRuntimeLayers.push(l);
        serializedLayers.push(l);
      }
    }
    setLayers(updatedRuntimeLayers);

    const payload: SerializedGraphicProject = {
      version: 1,
      formatRatio,
      bgType,
      bgColor1,
      bgColor2,
      bgAngle,
      bgImageBlobKey: nextBgBlobKey,
      bgImageOverlay,
      layers: serializedLayers,
      strokes,
    };

    const now = new Date().toISOString();
    const projectId = activeProjectId || `proj_des_${uid}`;
    const existing = activeProjectId
      ? recentGraphicProjects.find((p) => p.id === activeProjectId)
      : undefined;

    let thumbnailBlobKey = existing?.thumbnailBlobKey;
    const canvas = canvasRef.current;
    if (canvas) {
      renderCanvas(false);
      const maxThumbW = 360;
      const scale = Math.min(1, maxThumbW / Math.max(1, canvas.width));
      const thumbCanvas = document.createElement('canvas');
      thumbCanvas.width = Math.max(1, Math.round(canvas.width * scale));
      thumbCanvas.height = Math.max(1, Math.round(canvas.height * scale));
      const tctx = thumbCanvas.getContext('2d');
      if (tctx) {
        tctx.drawImage(canvas, 0, 0, thumbCanvas.width, thumbCanvas.height);
        const thumbBlob = await new Promise<Blob | null>((resolve) =>
          thumbCanvas.toBlob((b) => resolve(b), 'image/jpeg', 0.78)
        );
        if (thumbBlob) {
          thumbnailBlobKey = `blob_thumb_${projectId}`;
          await dbService.saveMediaBlob(thumbnailBlobKey, thumbBlob, 'image/jpeg');
        }
      }
      renderCanvas(true);
    }

    const record: StudioProjectRecord = {
      id: projectId,
      studio: 'design',
      title: designTitle.trim() || (isEn ? 'Untitled Design' : 'Design sans titre'),
      formatLabel: FORMAT_DIMS[formatRatio].label,
      thumbnailBlobKey,
      dataJson: JSON.stringify(payload),
      createdAt: existing?.createdAt || now,
      updatedAt: now,
    };

    await dbService.put(STORES.STUDIO_PROJECTS, record);
    setActiveProjectId(projectId);
    await reloadData();
    setNotice(
      isEn
        ? 'Editable project saved locally!'
        : 'Projet modifiable enregistré dans le Studio Graphique !'
    );
  };

  const getCanvasPoint = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    return {
      x: ((e.clientX - rect.left) / rect.width) * dims.w,
      y: ((e.clientY - rect.top) / rect.height) * dims.h,
    };
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (pinchStateRef.current) return;
    const pt = getCanvasPoint(e);
    if (isDrawMode) {
      pushUndoSnapshot();
      const stroke: DrawStroke = {
        id: `stk_${Date.now()}`,
        color: brushColor,
        size: brushSize,
        points: [pt],
      };
      activeStrokeRef.current = stroke;
      renderCanvas(true);
      return;
    }

    for (let i = layers.length - 1; i >= 0; i--) {
      const l = layers[i];
      const hw =
        l.kind === 'text' ? Math.max(240, l.text.length * l.fontSize * 0.35) : l.width / 2 + 16;
      const hh = l.kind === 'text' ? Math.max(90, l.fontSize * 1.4) : l.height / 2 + 16;
      if (Math.abs(pt.x - l.x) <= hw && Math.abs(pt.y - l.y) <= hh) {
        pushUndoSnapshot();
        setSelectedLayerId(l.id);
        dragStateRef.current = {
          layerId: l.id,
          offsetX: pt.x - l.x,
          offsetY: pt.y - l.y,
        };
        return;
      }
    }
    setSelectedLayerId(null);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (pinchStateRef.current) return;
    const pt = getCanvasPoint(e);
    if (isDrawMode && activeStrokeRef.current) {
      activeStrokeRef.current.points.push(pt);
      renderCanvas(true);
      return;
    }
    if (dragStateRef.current) {
      const { layerId, offsetX, offsetY } = dragStateRef.current;
      setLayers((prev) =>
        prev.map((l) => (l.id === layerId ? { ...l, x: pt.x - offsetX, y: pt.y - offsetY } : l))
      );
    }
  };

  const handlePointerUp = () => {
    if (isDrawMode && activeStrokeRef.current) {
      const finished = activeStrokeRef.current;
      activeStrokeRef.current = null;
      setStrokes((prev) => [...prev, finished]);
    }
    dragStateRef.current = null;
  };

  const handleTouchStart = (e: React.TouchEvent<HTMLCanvasElement>) => {
    if (e.touches.length !== 2) return;
    dragStateRef.current = null;
    activeStrokeRef.current = null;

    const t1 = e.touches[0];
    const t2 = e.touches[1];
    const dist = Math.hypot(t1.clientX - t2.clientX, t1.clientY - t2.clientY);
    if (dist <= 0) return;

    let targetLayer = selectedLayer;
    if (!targetLayer && canvasRef.current && layers.length > 0) {
      const rect = canvasRef.current.getBoundingClientRect();
      const midX = (((t1.clientX + t2.clientX) / 2 - rect.left) / rect.width) * dims.w;
      const midY = (((t1.clientY + t2.clientY) / 2 - rect.top) / rect.height) * dims.h;
      for (let i = layers.length - 1; i >= 0; i--) {
        const l = layers[i];
        const hw = l.kind === 'text' ? 280 : l.width / 2 + 40;
        const hh = l.kind === 'text' ? 120 : l.height / 2 + 40;
        if (Math.abs(midX - l.x) <= hw && Math.abs(midY - l.y) <= hh) {
          targetLayer = l;
          setSelectedLayerId(l.id);
          break;
        }
      }
    }

    if (!targetLayer) return;
    pushUndoSnapshot();
    pinchStateRef.current = {
      startDist: dist,
      layerId: targetLayer.id,
      startFontSize: targetLayer.kind === 'text' ? targetLayer.fontSize : undefined,
      startWidth: targetLayer.kind !== 'text' ? targetLayer.width : undefined,
      startHeight: targetLayer.kind !== 'text' ? targetLayer.height : undefined,
    };
  };

  const handleTouchMove = (e: React.TouchEvent<HTMLCanvasElement>) => {
    if (!pinchStateRef.current || e.touches.length < 2) return;
    const t1 = e.touches[0];
    const t2 = e.touches[1];
    const dist = Math.hypot(t1.clientX - t2.clientX, t1.clientY - t2.clientY);
    const { startDist, layerId, startFontSize, startWidth, startHeight } = pinchStateRef.current;
    if (startDist <= 0) return;

    const scale = dist / startDist;
    setLayers((prev) =>
      prev.map((l) => {
        if (l.id !== layerId) return l;
        if (l.kind === 'text' && startFontSize) {
          const nextSize = Math.max(14, Math.min(280, Math.round(startFontSize * scale)));
          return { ...l, fontSize: nextSize };
        }
        if (l.kind !== 'text' && startWidth && startHeight) {
          const nextW = Math.max(20, Math.min(1600, Math.round(startWidth * scale)));
          const nextH = Math.max(10, Math.min(1600, Math.round(startHeight * scale)));
          return { ...l, width: nextW, height: nextH };
        }
        return l;
      })
    );
  };

  const handleTouchEnd = (e: React.TouchEvent<HTMLCanvasElement>) => {
    if (e.touches.length < 2) {
      pinchStateRef.current = null;
    }
  };

  const addTextLayer = () => {
    pushUndoSnapshot();
    const id = `txt_${Date.now()}`;
    const next: TextLayer = {
      id,
      kind: 'text',
      text: isEn ? 'Your text here' : 'Votre texte ici',
      fontFamily: FONT_CHOICES[0].value,
      fontSize: 56,
      color: bgColor1 === '#ffffff' && bgType === 'solid' ? '#0f172a' : '#ffffff',
      bold: true,
      italic: false,
      align: 'center',
      bgColor: '#0b1f42',
      bgEnabled: false,
      shadow: false,
      x: dims.w / 2,
      y: dims.h / 2,
      rotation: 0,
      opacity: 1,
    };
    setLayers((prev) => [...prev, next]);
    setSelectedLayerId(id);
    setIsDrawMode(false);
  };

  const addShapeLayer = (shape: ShapeKind) => {
    pushUndoSnapshot();
    const id = `shp_${Date.now()}`;
    const next: ShapeLayer = {
      id,
      kind: 'shape',
      shape,
      width: shape === 'line' ? 420 : 240,
      height: shape === 'line' ? 12 : 240,
      fillColor: '#1d4ed8',
      strokeColor: '#fbbf24',
      strokeWidth: shape === 'line' ? 10 : 0,
      x: dims.w / 2,
      y: dims.h / 2,
      rotation: 0,
      opacity: 1,
    };
    setLayers((prev) => [...prev, next]);
    setSelectedLayerId(id);
    setIsDrawMode(false);
    setShowShapesBar(false);
  };

  const insertImageFromBlob = async (
    blob: Blob,
    label: string,
    asBackground = false,
    blobKey?: string,
    attribution?: string
  ) => {
    const img = await loadImageFromBlob(blob);
    pushUndoSnapshot();
    if (asBackground) {
      setBgImageEl(img);
      setBgImageBlobKey(blobKey);
      setBgImageSourceBlob(blobKey ? undefined : blob);
      setBgType('image');
      setNotice(
        attribution
          ? `${isEn ? 'Background applied' : 'Arrière-plan appliqué'} (${attribution})`
          : isEn
            ? 'Background image applied!'
            : 'Image appliquée en arrière-plan !'
      );
      return;
    }

    const ratio = img.width / Math.max(1, img.height);
    const w = 380;
    const h = Math.max(40, Math.round(w / ratio));
    const id = `img_${Date.now()}`;
    const next: ImageLayer = {
      id,
      kind: 'image',
      imageEl: img,
      label,
      width: w,
      height: h,
      circular: false,
      blobKey,
      sourceBlob: blobKey ? undefined : blob,
      attribution,
      x: dims.w / 2,
      y: dims.h / 2,
      rotation: 0,
      opacity: 1,
    };
    setLayers((prev) => [...prev, next]);
    setSelectedLayerId(id);
    setIsDrawMode(false);
  };

  const handleAddImageFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    await insertImageFromBlob(file, file.name, false);
    e.target.value = '';
  };

  const handleAddBgImage = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    await insertImageFromBlob(file, file.name, true);
    e.target.value = '';
  };

  const handleSelectOnlineAsset = async (asset: DownloadedStudioAsset, blob: Blob) => {
    const useAsBg = resourceTargetMode === 'background' || asset.category === 'background';
    const attribution = `${asset.author || asset.sourceName} · ${asset.license || ''}`.trim();
    await insertImageFromBlob(blob, asset.title, useAsBg, asset.blobKey, attribution);
  };

  const updateSelectedLayer = (patch: Partial<StudioLayer>) => {
    if (!selectedLayerId) return;
    setLayers((prev) =>
      prev.map((l) => (l.id === selectedLayerId ? ({ ...l, ...patch } as StudioLayer) : l))
    );
  };

  const alignSelectedLayer = (
    alignment: 'left' | 'centerH' | 'right' | 'top' | 'centerV' | 'bottom'
  ) => {
    if (!selectedLayer) return;
    pushUndoSnapshot();
    const hw = selectedLayer.kind === 'text' ? 180 : selectedLayer.width / 2;
    const hh = selectedLayer.kind === 'text' ? 60 : selectedLayer.height / 2;
    const margin = 48;
    if (alignment === 'left') updateSelectedLayer({ x: Math.max(margin, hw + margin) });
    if (alignment === 'centerH') updateSelectedLayer({ x: dims.w / 2 });
    if (alignment === 'right') updateSelectedLayer({ x: Math.min(dims.w - margin, dims.w - hw - margin) });
    if (alignment === 'top') updateSelectedLayer({ y: Math.max(margin, hh + margin) });
    if (alignment === 'centerV') updateSelectedLayer({ y: dims.h / 2 });
    if (alignment === 'bottom') updateSelectedLayer({ y: Math.min(dims.h - margin, dims.h - hh - margin) });
  };

  const moveSelectedLayer = (dir: -1 | 1) => {
    if (!selectedLayerId) return;
    const idx = layers.findIndex((l) => l.id === selectedLayerId);
    const target = idx + dir;
    if (idx < 0 || target < 0 || target >= layers.length) return;
    pushUndoSnapshot();
    setLayers((prev) => {
      const next = [...prev];
      const tmp = next[idx];
      next[idx] = next[target];
      next[target] = tmp;
      return next;
    });
  };

  const duplicateSelectedLayer = () => {
    if (!selectedLayer) return;
    pushUndoSnapshot();
    const id = `${selectedLayer.kind}_${Date.now()}`;
    const copy = { ...selectedLayer, id, x: selectedLayer.x + 36, y: selectedLayer.y + 36 };
    setLayers((prev) => [...prev, copy as StudioLayer]);
    setSelectedLayerId(id);
  };

  const deleteSelectedLayer = () => {
    if (!selectedLayerId) return;
    pushUndoSnapshot();
    setLayers((prev) => prev.filter((l) => l.id !== selectedLayerId));
    setSelectedLayerId(null);
  };

  const clearAllBlank = () => {
    pushUndoSnapshot();
    setLayers([]);
    setStrokes([]);
    setSelectedLayerId(null);
    setBgType('solid');
    setBgColor1('#ffffff');
    setBgImageEl(null);
    setBgImageBlobKey(undefined);
    setBgImageSourceBlob(undefined);
  };

  const exportCleanBlob = (mimeType: 'image/png' | 'image/jpeg'): Promise<Blob | null> => {
    return new Promise((resolve) => {
      renderCanvas(false);
      const canvas = canvasRef.current;
      if (!canvas) {
        resolve(null);
        return;
      }
      canvas.toBlob(
        (blob) => {
          renderCanvas(true);
          resolve(blob);
        },
        mimeType,
        0.95
      );
    });
  };

  const handleDownload = async (ext: 'png' | 'jpg') => {
    const blob = await exportCleanBlob(ext === 'png' ? 'image/png' : 'image/jpeg');
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${designTitle.toLowerCase().replace(/[^a-z0-9]+/g, '_') || 'creation'}.${ext}`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    setNotice(isEn ? 'Image downloaded!' : 'Création téléchargée sur votre appareil !');
  };

  const handleSaveToGallery = async () => {
    const blob = await exportCleanBlob('image/png');
    if (!blob) return;
    const blobKey = `creation_blob_${Date.now()}`;
    await dbService.saveMediaBlob(blobKey, blob, 'image/png');
    const item: CreativeDesignItem = {
      id: `cr_${Date.now()}`,
      title: designTitle.trim() || 'Création libre',
      templateType: 'verset',
      mediaBlobKey: blobKey,
      mimeType: 'image/png',
      createdAt: new Date().toISOString(),
    };
    await dbService.put(STORES.CREATIONS, item);
    await handleSaveEditableProject();
    setNotice(
      isEn
        ? 'Saved to Gallery & Editable Projects!'
        : 'Image ajoutée à votre galerie & projet enregistré !'
    );
    reloadData();
  };

  const handleShare = async () => {
    const blob = await exportCleanBlob('image/png');
    if (!blob) return;
    const file = new File([blob], `shalom_creation_${Date.now()}.png`, { type: 'image/png' });
    setSharePayload({
      title: designTitle,
      text: `${designTitle}\n\nCréé librement dans SHALOM`,
      file,
    });
  };

  const handleShareSavedItem = async (item: CreativeDesignItem) => {
    const blob = await dbService.getMediaBlob(item.mediaBlobKey);
    if (!blob) return;
    const file = new File([blob], `${item.id}.png`, { type: item.mimeType || 'image/png' });
    setSharePayload({
      title: item.title,
      text: `${item.title}\n\nPartagé depuis SHALOM Studio`,
      file,
    });
  };

  const handleConfirmDeleteCreations = async () => {
    if (!confirmDeleteCreations || confirmDeleteCreations.length === 0) return;
    const blobs = confirmDeleteCreations.map((c) => c.mediaBlobKey).filter(Boolean);
    const ids = confirmDeleteCreations.map((c) => c.id);
    if (blobs.length > 0) {
      await dbService.deleteItems(STORES.MEDIA_BLOBS, blobs);
    }
    await dbService.deleteItems(STORES.CREATIONS, ids);
    setSelectedCreationIds((prev) => prev.filter((id) => !ids.includes(id)));
    setConfirmDeleteCreations(null);
    reloadData();
  };

  const toggleCreationId = (id: string) => {
    setSelectedCreationIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const toggleAllCreations = () => {
    const allIds = creations.map((c) => c.id);
    const allSel = allIds.length > 0 && allIds.every((id) => selectedCreationIds.includes(id));
    setSelectedCreationIds(allSel ? [] : allIds);
  };

  const resizeSelectedByFactor = (factor: number) => {
    if (!selectedLayer) return;
    pushUndoSnapshot();
    if (selectedLayer.kind === 'text') {
      updateSelectedLayer({
        fontSize: Math.max(14, Math.min(280, Math.round(selectedLayer.fontSize * factor))),
      });
    } else {
      updateSelectedLayer({
        width: Math.max(20, Math.min(1600, Math.round(selectedLayer.width * factor))),
        height: Math.max(10, Math.min(1600, Math.round(selectedLayer.height * factor))),
      });
    }
  };

  const savedGallerySection =
    creations.length > 0 ? (
      <div className="space-y-3 pt-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-bold text-slate-900 dark:text-white">
            {isEn ? 'Exported PNG Gallery' : 'Mes images exportées (Galerie)'}
          </h3>

          <div className="flex items-center gap-2 text-xs">
            <button
              type="button"
              onClick={toggleAllCreations}
              className="min-h-[40px] px-2 font-semibold text-slate-600 dark:text-slate-300 flex items-center gap-1.5 hover:text-blue-700"
            >
              {creations.every((c) => selectedCreationIds.includes(c.id)) ? (
                <CheckSquare className="w-4 h-4 text-blue-600" />
              ) : (
                <Square className="w-4 h-4 text-slate-400" />
              )}
              <span>Tout sélectionner ({selectedCreationIds.length})</span>
            </button>

            {selectedCreationIds.length > 0 && (
              <button
                type="button"
                onClick={() =>
                  setConfirmDeleteCreations(
                    creations.filter((c) => selectedCreationIds.includes(c.id))
                  )
                }
                className="min-h-[40px] px-3 py-1 rounded-xl bg-red-600 hover:bg-red-700 text-white font-bold flex items-center gap-1"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Supprimer ({selectedCreationIds.length})</span>
              </button>
            )}
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3.5">
          {creations.map((item) => {
            const isSel = selectedCreationIds.includes(item.id);
            return (
              <div
                key={item.id}
                className={`p-2.5 rounded-2xl bg-white dark:bg-[#0c1631] border space-y-2 transition ${
                  isSel
                    ? 'border-blue-600 ring-2 ring-blue-600/20'
                    : 'border-slate-200/80 dark:border-slate-800/80'
                }`}
              >
                <div className="relative">
                  {savedPreviews[item.id] && (
                    <img
                      src={savedPreviews[item.id]}
                      alt={item.title}
                      className="w-full h-36 object-cover rounded-xl bg-slate-100 dark:bg-slate-900"
                    />
                  )}
                  <button
                    type="button"
                    onClick={() => toggleCreationId(item.id)}
                    aria-label="Sélectionner cette création"
                    className="absolute top-2 left-2 w-8 h-8 flex items-center justify-center rounded-lg bg-white/90 dark:bg-slate-900/90 shadow-xs"
                  >
                    {isSel ? (
                      <CheckSquare className="w-4 h-4 text-blue-600" />
                    ) : (
                      <Square className="w-4 h-4 text-slate-500" />
                    )}
                  </button>
                </div>
                <div className="text-xs font-bold truncate text-slate-900 dark:text-white">
                  {item.title}
                </div>
                <div className="flex items-center justify-between gap-1">
                  <button
                    type="button"
                    onClick={() => handleShareSavedItem(item)}
                    className="min-h-[38px] px-2.5 py-1 rounded-lg bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-300 text-[11px] font-bold flex items-center gap-1"
                  >
                    <Share2 className="w-3 h-3" />
                    <span>{isEn ? 'Share' : 'Partager'}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmDeleteCreations([item])}
                    className="min-w-[38px] min-h-[38px] flex items-center justify-center rounded-lg text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    ) : null;

  return (
    <div className="space-y-6">
      {viewMode === 'home' ? (
        <StudioHomePanel
          studio="design"
          studioTitle={isEn ? 'Graphic Design Studio' : 'Studio Graphique'}
          studioDescription={
            isEn
              ? 'Design posters, verse cards, banners & invitations with layers, templates, online photos & icons.'
              : 'Créez vos affiches, cartes de versets, bannières et invitations avec calques, alignements, modèles et ressources en ligne.'
          }
          headerIcon={<Palette className="w-5 h-5 text-amber-300" />}
          blankLabel={isEn ? 'New Blank Design' : 'Nouveau design vierge'}
          blankFormats={[
            { id: 'square', label: isEn ? 'Square 1:1' : 'Post Carré 1:1', dimensions: '1080×1080' },
            { id: 'portrait', label: 'Portrait 4:5', dimensions: '1080×1350' },
            { id: 'story', label: 'Story 9:16', dimensions: '1080×1920' },
            { id: 'landscape', label: isEn ? 'Banner 16:9' : 'Bannière 16:9', dimensions: '1280×720' },
          ]}
          templates={GRAPHIC_TEMPLATES}
          recentProjects={recentGraphicProjects}
          onCreateBlank={startBlankProject}
          onSelectTemplate={applyGraphicTemplate}
          onOpenProject={openSavedProject}
          onDuplicateProject={handleDuplicateProject}
          onDeleteProject={handleDeleteProject}
          extraContent={savedGallerySection}
        />
      ) : (
        <div className="space-y-4">
          {/* Editor Top Navigation & Project Actions */}
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
                value={designTitle}
                onChange={(e) => setDesignTitle(e.target.value)}
                className="min-h-[44px] px-3 py-1.5 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 font-bold flex-1 min-w-[140px]"
              />
            </div>

            <div className="studio-scroll-x flex items-center gap-1.5">
              <button
                type="button"
                onClick={handleUndo}
                disabled={undoStack.length === 0}
                title={isEn ? 'Undo' : 'Annuler'}
                className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-xl bg-slate-100 dark:bg-slate-800 disabled:opacity-40"
              >
                <Undo2 className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={handleRedo}
                disabled={redoStack.length === 0}
                title={isEn ? 'Redo' : 'Rétablir'}
                className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-xl bg-slate-100 dark:bg-slate-800 disabled:opacity-40"
              >
                <Redo2 className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={handleSaveEditableProject}
                className="min-h-[44px] px-3.5 py-2 rounded-xl bg-[#0b1f42] dark:bg-blue-700 text-white font-bold flex items-center gap-1.5 shrink-0"
              >
                <Save className="w-4 h-4" />
                <span>{isEn ? 'Save Project' : 'Sauver projet'}</span>
              </button>
              <button
                type="button"
                onClick={clearAllBlank}
                title={isEn ? 'Clear Canvas' : 'Réinitialiser vierge'}
                className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 shrink-0"
              >
                <RotateCcw className="w-4 h-4" />
              </button>
            </div>
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

          {/* Creation & Online Library Toolbar (Touch-friendly horizontal scroll on mobile) */}
          <div className="p-3 rounded-2xl bg-white dark:bg-[#0c1631] border border-slate-200/80 dark:border-slate-800/80 space-y-2 text-xs">
            <div className="studio-scroll-x flex items-center gap-2 pb-1">
              <button
                type="button"
                onClick={addTextLayer}
                className="min-h-[44px] px-3.5 py-2 rounded-xl bg-blue-700 hover:bg-blue-800 text-white font-bold flex items-center gap-1.5 shrink-0"
              >
                <Type className="w-4 h-4" />
                <span>+ {isEn ? 'Text' : 'Texte'}</span>
              </button>

              <button
                type="button"
                onClick={() => setShowShapesBar((s) => !s)}
                className={`min-h-[44px] px-3.5 py-2 rounded-xl font-bold flex items-center gap-1.5 shrink-0 ${
                  showShapesBar
                    ? 'bg-amber-500 text-slate-950'
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-100'
                }`}
              >
                <Shapes className="w-4 h-4" />
                <span>+ {isEn ? 'Shapes' : 'Formes'}</span>
              </button>

              <label className="min-h-[44px] px-3.5 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 font-bold flex items-center gap-1.5 cursor-pointer shrink-0">
                <ImageIcon className="w-4 h-4" />
                <span>+ {isEn ? 'Local Photo' : 'Photo locale'}</span>
                <input type="file" accept="image/*" onChange={handleAddImageFile} className="hidden" />
              </label>

              <button
                type="button"
                onClick={() => {
                  setResourceDefaultCat('photo');
                  setResourceTargetMode('layer');
                  setResourceModalOpen(true);
                }}
                className="min-h-[44px] px-3.5 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-extrabold flex items-center gap-1.5 shrink-0"
              >
                <Globe className="w-4 h-4" />
                <span>{isEn ? 'Resources & Icons' : 'Ressources & Icônes'}</span>
              </button>

              <button
                type="button"
                onClick={() => setIsDrawMode((d) => !d)}
                className={`min-h-[44px] px-3.5 py-2 rounded-xl font-bold flex items-center gap-1.5 transition shrink-0 ${
                  isDrawMode
                    ? 'bg-blue-900 text-white'
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200'
                }`}
              >
                <Pencil className="w-4 h-4" />
                <span>
                  {isDrawMode ? (isEn ? 'Brush ON' : 'Pinceau ACTIF') : isEn ? 'Draw' : 'Dessiner'}
                </span>
              </button>

              <button
                type="button"
                onClick={() => setShowLayersList((v) => !v)}
                className={`min-h-[44px] px-3.5 py-2 rounded-xl font-bold flex items-center gap-1.5 shrink-0 ${
                  showLayersList
                    ? 'bg-blue-100 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300'
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200'
                }`}
              >
                <Layers className="w-4 h-4" />
                <span>
                  {isEn ? 'Layers' : 'Calques'} ({layers.length})
                </span>
              </button>

              {strokes.length > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    pushUndoSnapshot();
                    setStrokes((prev) => prev.slice(0, -1));
                  }}
                  className="min-h-[44px] px-3 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 font-semibold flex items-center gap-1 shrink-0"
                >
                  <Eraser className="w-4 h-4" />
                  <span>{isEn ? 'Undo Stroke' : 'Annuler trait'}</span>
                </button>
              )}
            </div>

            {showShapesBar && (
              <div className="studio-scroll-x flex items-center gap-1.5 pt-2 border-t border-slate-100 dark:border-slate-800">
                {[
                  { id: 'rect', label: '▭ Rectangle' },
                  { id: 'roundRect', label: '▢ Arrondi' },
                  { id: 'circle', label: '● Cercle' },
                  { id: 'triangle', label: '▲ Triangle' },
                  { id: 'star', label: '★ Étoile' },
                  { id: 'cross', label: '✝ Croix' },
                  { id: 'heart', label: '♥ Cœur' },
                  { id: 'diamond', label: '◆ Losange' },
                  { id: 'line', label: '― Ligne' },
                ].map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => addShapeLayer(s.id as ShapeKind)}
                    className="min-h-[44px] px-3 py-2 rounded-xl bg-slate-100 hover:bg-blue-50 dark:bg-slate-800 font-bold shrink-0"
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            )}

            {showLayersList && (
              <div className="pt-2 border-t border-slate-100 dark:border-slate-800 space-y-1.5">
                {layers.length === 0 ? (
                  <p className="text-slate-500 text-center py-2">
                    {isEn ? 'No layers yet.' : 'Aucun calque pour le moment.'}
                  </p>
                ) : (
                  <div className="studio-scroll-x flex gap-2 pb-1">
                    {[...layers].reverse().map((l) => (
                      <button
                        key={l.id}
                        type="button"
                        onClick={() => setSelectedLayerId(l.id)}
                        className={`min-h-[40px] px-3 py-1.5 rounded-xl font-semibold border shrink-0 transition ${
                          selectedLayerId === l.id
                            ? 'bg-blue-700 text-white border-blue-700'
                            : 'bg-slate-50 dark:bg-slate-900 border-slate-200 dark:border-slate-800'
                        }`}
                      >
                        {l.kind === 'text'
                          ? `T: ${l.text.slice(0, 14)}`
                          : l.kind === 'shape'
                            ? `Forme (${l.shape})`
                            : l.label.slice(0, 16)}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
            {/* Left: Interactive Canvas + Quick Contextual Controls */}
            <div className="space-y-3">
              <div className="p-4 rounded-2xl bg-slate-100 dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 flex items-center justify-center">
                <canvas
                  ref={canvasRef}
                  onPointerDown={handlePointerDown}
                  onPointerMove={handlePointerMove}
                  onPointerUp={handlePointerUp}
                  onPointerLeave={handlePointerUp}
                  onTouchStart={handleTouchStart}
                  onTouchMove={handleTouchMove}
                  onTouchEnd={handleTouchEnd}
                  className="max-w-full max-h-[480px] w-auto h-auto rounded-xl shadow-xl touch-none cursor-crosshair bg-white"
                />
              </div>

              {selectedLayer && (
                <div className="p-3.5 rounded-2xl bg-blue-50/90 dark:bg-[#0f2347] border border-blue-200 dark:border-blue-800 space-y-2.5 text-xs">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-extrabold text-blue-800 dark:text-blue-200 uppercase tracking-wider text-[11px]">
                      {selectedLayer.kind === 'text'
                        ? 'Texte sélectionné'
                        : selectedLayer.kind === 'shape'
                          ? 'Forme sélectionnée'
                          : 'Image sélectionnée'}
                    </span>

                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => resizeSelectedByFactor(0.85)}
                        className="min-w-[40px] min-h-[40px] flex items-center justify-center rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700"
                        title="Réduire"
                      >
                        <ZoomOut className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => resizeSelectedByFactor(1.15)}
                        className="min-w-[40px] min-h-[40px] flex items-center justify-center rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700"
                        title="Agrandir"
                      >
                        <ZoomIn className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        onClick={deleteSelectedLayer}
                        className="min-h-[40px] px-2.5 py-1.5 rounded-lg bg-red-600 hover:bg-red-700 text-white font-bold flex items-center gap-1"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        <span>Supprimer</span>
                      </button>
                    </div>
                  </div>

                  {/* Quick Alignments Bar */}
                  <div className="studio-scroll-x flex items-center gap-1.5 pb-1">
                    <button
                      type="button"
                      onClick={() => alignSelectedLayer('left')}
                      title="Aligner à gauche"
                      className="min-w-[40px] min-h-[40px] flex items-center justify-center rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 shrink-0"
                    >
                      <AlignLeft className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => alignSelectedLayer('centerH')}
                      title="Centrer horizontalement"
                      className="min-w-[40px] min-h-[40px] flex items-center justify-center rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 shrink-0"
                    >
                      <AlignCenter className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => alignSelectedLayer('right')}
                      title="Aligner à droite"
                      className="min-w-[40px] min-h-[40px] flex items-center justify-center rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 shrink-0"
                    >
                      <AlignRight className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => alignSelectedLayer('top')}
                      title="Aligner en haut"
                      className="min-w-[40px] min-h-[40px] flex items-center justify-center rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 shrink-0"
                    >
                      <AlignVerticalJustifyStart className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => alignSelectedLayer('centerV')}
                      title="Centrer verticalement"
                      className="min-w-[40px] min-h-[40px] flex items-center justify-center rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 shrink-0"
                    >
                      <AlignVerticalJustifyCenter className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => alignSelectedLayer('bottom')}
                      title="Aligner en bas"
                      className="min-w-[40px] min-h-[40px] flex items-center justify-center rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 shrink-0"
                    >
                      <AlignVerticalJustifyEnd className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              )}

              {/* Export Actions */}
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={handleSaveToGallery}
                  className="min-h-[44px] px-4 py-2.5 rounded-xl bg-blue-700 hover:bg-blue-800 text-white text-xs font-bold flex items-center gap-1.5"
                >
                  <Save className="w-4 h-4" />
                  <span>{isEn ? 'Save PNG to Gallery' : 'Sauver PNG & Galerie'}</span>
                </button>
                <button
                  type="button"
                  onClick={handleShare}
                  className="min-h-[44px] px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold flex items-center gap-1.5"
                >
                  <Share2 className="w-4 h-4" />
                  <span>{isEn ? 'Share' : 'Partager'}</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleDownload('png')}
                  className="min-h-[44px] px-3.5 py-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 text-xs font-bold flex items-center gap-1.5"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>PNG</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleDownload('jpg')}
                  className="min-h-[44px] px-3.5 py-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 text-xs font-bold flex items-center gap-1.5"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>JPG</span>
                </button>
              </div>
            </div>

            {/* Right: Background & Inspector */}
            <div className="space-y-4 text-xs">
              <div className="p-4 rounded-2xl bg-white dark:bg-[#0c1631] border border-slate-200/80 dark:border-slate-800/80 space-y-3">
                <h3 className="font-bold uppercase tracking-wider text-slate-500">
                  {isEn ? 'Format & Background' : 'Format & Arrière-plan'}
                </h3>

                <select
                  value={formatRatio}
                  onChange={(e) => setFormatRatio(e.target.value as FormatRatio)}
                  className="w-full min-h-[44px] px-3 py-1.5 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 font-semibold"
                >
                  {Object.entries(FORMAT_DIMS).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v.label}
                    </option>
                  ))}
                </select>

                <div className="flex flex-wrap gap-2">
                  {[
                    { id: 'solid', label: isEn ? 'Solid Color' : 'Couleur unie' },
                    { id: 'gradient', label: isEn ? 'Gradient' : 'Dégradé' },
                    { id: 'image', label: isEn ? 'Photo' : 'Photo de fond' },
                  ].map((b) => (
                    <button
                      key={b.id}
                      type="button"
                      onClick={() => setBgType(b.id as typeof bgType)}
                      className={`min-h-[40px] px-3 py-1.5 rounded-xl font-semibold ${
                        bgType === b.id
                          ? 'bg-blue-700 text-white'
                          : 'bg-slate-100 dark:bg-slate-800'
                      }`}
                    >
                      {b.label}
                    </button>
                  ))}
                </div>

                <div className="flex flex-wrap items-center gap-4">
                  <label className="flex items-center gap-2 font-semibold">
                    <span>{isEn ? 'Color 1' : 'Couleur 1'}</span>
                    <input
                      type="color"
                      value={bgColor1}
                      onChange={(e) => setBgColor1(e.target.value)}
                      className="w-9 h-8 rounded cursor-pointer"
                    />
                  </label>

                  {bgType === 'gradient' && (
                    <>
                      <label className="flex items-center gap-2 font-semibold">
                        <span>{isEn ? 'Color 2' : 'Couleur 2'}</span>
                        <input
                          type="color"
                          value={bgColor2}
                          onChange={(e) => setBgColor2(e.target.value)}
                          className="w-9 h-8 rounded cursor-pointer"
                        />
                      </label>
                      <label className="flex items-center gap-2 font-semibold">
                        <span>Angle</span>
                        <input
                          type="range"
                          min={0}
                          max={360}
                          value={bgAngle}
                          onChange={(e) => setBgAngle(parseInt(e.target.value, 10))}
                          className="w-20"
                        />
                      </label>
                    </>
                  )}

                  {bgType === 'image' && (
                    <div className="flex flex-wrap items-center gap-2">
                      <label className="min-h-[40px] px-3 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 cursor-pointer font-semibold flex items-center">
                        <span>{isEn ? 'Local Photo' : 'Photo locale'}</span>
                        <input
                          type="file"
                          accept="image/*"
                          onChange={handleAddBgImage}
                          className="hidden"
                        />
                      </label>
                      <button
                        type="button"
                        onClick={() => {
                          setResourceDefaultCat('background');
                          setResourceTargetMode('background');
                          setResourceModalOpen(true);
                        }}
                        className="min-h-[40px] px-3 py-1.5 rounded-xl bg-amber-500 text-slate-950 font-bold flex items-center gap-1"
                      >
                        <Globe className="w-3.5 h-3.5" />
                        <span>{isEn ? 'Online Fonds' : 'Fonds en ligne'}</span>
                      </button>
                      <input
                        type="range"
                        min={0}
                        max={0.85}
                        step={0.05}
                        value={bgImageOverlay}
                        onChange={(e) => setBgImageOverlay(parseFloat(e.target.value))}
                        title={isEn ? 'Darkness overlay' : 'Voile sombre'}
                        className="w-24"
                      />
                    </div>
                  )}
                </div>

                {isDrawMode && (
                  <div className="pt-2 border-t border-slate-100 dark:border-slate-800 flex flex-wrap items-center gap-4">
                    <label className="flex items-center gap-2 font-semibold">
                      <span>{isEn ? 'Brush Color' : 'Couleur pinceau'}</span>
                      <input
                        type="color"
                        value={brushColor}
                        onChange={(e) => setBrushColor(e.target.value)}
                        className="w-8 h-7 rounded"
                      />
                    </label>
                    <label className="flex items-center gap-2 font-semibold">
                      <span>{isEn ? 'Size' : 'Épaisseur'}</span>
                      <input
                        type="range"
                        min={2}
                        max={48}
                        value={brushSize}
                        onChange={(e) => setBrushSize(parseInt(e.target.value, 10))}
                        className="w-24"
                      />
                      <span>{brushSize}px</span>
                    </label>
                  </div>
                )}
              </div>

              {/* Selected Layer Properties */}
              {selectedLayer ? (
                <div className="p-4 rounded-2xl bg-white dark:bg-[#0c1631] border border-blue-300 dark:border-blue-800 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="font-bold uppercase tracking-wider text-blue-700 dark:text-blue-400">
                      {selectedLayer.kind === 'text'
                        ? isEn
                          ? 'Edit Text Layer'
                          : 'Propriétés du texte'
                        : selectedLayer.kind === 'shape'
                          ? isEn
                            ? 'Edit Shape Layer'
                            : 'Propriétés de la forme'
                          : isEn
                            ? 'Edit Image Layer'
                            : 'Propriétés de l’image'}
                    </span>

                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => moveSelectedLayer(-1)}
                        className="min-w-[38px] min-h-[38px] flex items-center justify-center rounded-lg bg-slate-100 dark:bg-slate-800"
                        title="Reculer d'un plan"
                      >
                        <ArrowDown className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => moveSelectedLayer(1)}
                        className="min-w-[38px] min-h-[38px] flex items-center justify-center rounded-lg bg-slate-100 dark:bg-slate-800"
                        title="Avancer d'un plan"
                      >
                        <ArrowUp className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        onClick={duplicateSelectedLayer}
                        className="min-w-[38px] min-h-[38px] flex items-center justify-center rounded-lg bg-slate-100 dark:bg-slate-800"
                        title="Dupliquer"
                      >
                        <Copy className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        onClick={deleteSelectedLayer}
                        className="min-w-[38px] min-h-[38px] flex items-center justify-center rounded-lg text-red-600 hover:bg-red-50"
                        title="Supprimer"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  {selectedLayer.kind === 'text' && (
                    <div className="space-y-3">
                      <textarea
                        rows={3}
                        value={selectedLayer.text}
                        onChange={(e) => updateSelectedLayer({ text: e.target.value })}
                        className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800"
                      />
                      <div className="grid grid-cols-2 gap-2">
                        <select
                          value={selectedLayer.fontFamily}
                          onChange={(e) => updateSelectedLayer({ fontFamily: e.target.value })}
                          className="min-h-[40px] px-2.5 py-1.5 rounded-lg bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800"
                        >
                          {FONT_CHOICES.map((f) => (
                            <option key={f.label} value={f.value}>
                              {f.label}
                            </option>
                          ))}
                        </select>
                        <div className="flex items-center gap-2">
                          <span>{isEn ? 'Size' : 'Taille'}</span>
                          <input
                            type="number"
                            min={16}
                            max={220}
                            value={selectedLayer.fontSize}
                            onChange={(e) =>
                              updateSelectedLayer({ fontSize: parseInt(e.target.value, 10) || 40 })
                            }
                            className="w-full min-h-[40px] px-2 py-1 rounded-lg bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800"
                          />
                        </div>
                      </div>
                      <div className="flex flex-wrap items-center gap-3">
                        <label className="flex items-center gap-1.5 font-semibold">
                          <span>{isEn ? 'Color' : 'Couleur'}</span>
                          <input
                            type="color"
                            value={selectedLayer.color}
                            onChange={(e) => updateSelectedLayer({ color: e.target.value })}
                            className="w-8 h-7 rounded"
                          />
                        </label>
                        <button
                          type="button"
                          onClick={() => updateSelectedLayer({ bold: !selectedLayer.bold })}
                          className={`min-w-[38px] min-h-[38px] px-2.5 py-1 rounded-lg font-bold border ${
                            selectedLayer.bold
                              ? 'bg-blue-700 text-white'
                              : 'bg-slate-100 dark:bg-slate-800'
                          }`}
                        >
                          G
                        </button>
                        <button
                          type="button"
                          onClick={() => updateSelectedLayer({ italic: !selectedLayer.italic })}
                          className={`min-w-[38px] min-h-[38px] px-2.5 py-1 rounded-lg italic border ${
                            selectedLayer.italic
                              ? 'bg-blue-700 text-white'
                              : 'bg-slate-100 dark:bg-slate-800'
                          }`}
                        >
                          I
                        </button>
                        <label className="flex items-center gap-1.5 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={selectedLayer.bgEnabled}
                            onChange={(e) => updateSelectedLayer({ bgEnabled: e.target.checked })}
                          />
                          <span>{isEn ? 'Box' : 'Fond'}</span>
                        </label>
                        {selectedLayer.bgEnabled && (
                          <input
                            type="color"
                            value={selectedLayer.bgColor}
                            onChange={(e) => updateSelectedLayer({ bgColor: e.target.value })}
                            className="w-7 h-7 rounded"
                          />
                        )}
                      </div>
                    </div>
                  )}

                  {selectedLayer.kind === 'shape' && (
                    <div className="grid grid-cols-2 gap-3">
                      <label className="flex items-center justify-between font-semibold">
                        <span>{isEn ? 'Fill' : 'Remplissage'}</span>
                        <input
                          type="color"
                          value={
                            selectedLayer.fillColor === 'transparent'
                              ? '#ffffff'
                              : selectedLayer.fillColor
                          }
                          onChange={(e) => updateSelectedLayer({ fillColor: e.target.value })}
                          className="w-9 h-7 rounded"
                        />
                      </label>
                      <label className="flex items-center justify-between font-semibold">
                        <span>{isEn ? 'Border' : 'Bordure'}</span>
                        <input
                          type="color"
                          value={selectedLayer.strokeColor}
                          onChange={(e) => updateSelectedLayer({ strokeColor: e.target.value })}
                          className="w-9 h-7 rounded"
                        />
                      </label>
                      <div>
                        <span className="block mb-1">{isEn ? 'Width' : 'Largeur'}</span>
                        <input
                          type="range"
                          min={20}
                          max={950}
                          value={selectedLayer.width}
                          onChange={(e) =>
                            updateSelectedLayer({ width: parseInt(e.target.value, 10) })
                          }
                          className="w-full"
                        />
                      </div>
                      <div>
                        <span className="block mb-1">{isEn ? 'Height' : 'Hauteur'}</span>
                        <input
                          type="range"
                          min={10}
                          max={950}
                          value={selectedLayer.height}
                          onChange={(e) =>
                            updateSelectedLayer({ height: parseInt(e.target.value, 10) })
                          }
                          className="w-full"
                        />
                      </div>
                      <div>
                        <span className="block mb-1">{isEn ? 'Border px' : 'Épaisseur bordure'}</span>
                        <input
                          type="range"
                          min={0}
                          max={40}
                          value={selectedLayer.strokeWidth}
                          onChange={(e) =>
                            updateSelectedLayer({ strokeWidth: parseInt(e.target.value, 10) })
                          }
                          className="w-full"
                        />
                      </div>
                    </div>
                  )}

                  {selectedLayer.kind === 'image' && (
                    <div className="space-y-2">
                      {selectedLayer.attribution && (
                        <p className="text-[11px] text-slate-500">
                          {isEn ? 'Source:' : 'Provenance :'} {selectedLayer.attribution}
                        </p>
                      )}
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <span className="block mb-1">{isEn ? 'Width' : 'Largeur'}</span>
                          <input
                            type="range"
                            min={40}
                            max={1080}
                            value={selectedLayer.width}
                            onChange={(e) =>
                              updateSelectedLayer({ width: parseInt(e.target.value, 10) })
                            }
                            className="w-full"
                          />
                        </div>
                        <div>
                          <span className="block mb-1">{isEn ? 'Height' : 'Hauteur'}</span>
                          <input
                            type="range"
                            min={40}
                            max={1080}
                            value={selectedLayer.height}
                            onChange={(e) =>
                              updateSelectedLayer({ height: parseInt(e.target.value, 10) })
                            }
                            className="w-full"
                          />
                        </div>
                      </div>
                      <label className="flex items-center gap-2 cursor-pointer font-semibold">
                        <input
                          type="checkbox"
                          checked={selectedLayer.circular}
                          onChange={(e) => updateSelectedLayer({ circular: e.target.checked })}
                        />
                        <span>{isEn ? 'Circular Crop' : 'Découpe en cercle'}</span>
                      </label>
                    </div>
                  )}

                  <div className="grid grid-cols-2 gap-3 pt-2 border-t border-slate-100 dark:border-slate-800">
                    <div>
                      <span className="block mb-1">
                        {isEn ? 'Rotation' : 'Rotation'} ({selectedLayer.rotation}°)
                      </span>
                      <input
                        type="range"
                        min={-180}
                        max={180}
                        value={selectedLayer.rotation}
                        onChange={(e) =>
                          updateSelectedLayer({ rotation: parseInt(e.target.value, 10) })
                        }
                        className="w-full"
                      />
                    </div>
                    <div>
                      <span className="block mb-1">
                        {isEn ? 'Opacity' : 'Opacité'} ({Math.round(selectedLayer.opacity * 100)}%)
                      </span>
                      <input
                        type="range"
                        min={0.1}
                        max={1}
                        step={0.05}
                        value={selectedLayer.opacity}
                        onChange={(e) =>
                          updateSelectedLayer({ opacity: parseFloat(e.target.value) })
                        }
                        className="w-full"
                      />
                    </div>
                  </div>
                </div>
              ) : (
                <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-900/60 border border-dashed border-slate-300 dark:border-slate-800 text-slate-500 text-center">
                  {isEn
                    ? 'Add texts, shapes, icons or photos above, then tap any element on the canvas to move, align, resize or customize it.'
                    : 'Ajoutez un texte, une forme, une icône ou une photo ci-dessus, puis touchez l’élément sur le canevas pour le déplacer, l’aligner ou le modifier.'}
                </div>
              )}
            </div>
          </div>

          {savedGallerySection}
        </div>
      )}

      <OnlineResourceModal
        isOpen={resourceModalOpen}
        onClose={() => setResourceModalOpen(false)}
        allowedCategories={['photo', 'illustration', 'icon', 'background']}
        defaultCategory={resourceDefaultCat}
        onSelectAsset={handleSelectOnlineAsset}
        title={isEn ? 'Graphic Resources & Icons' : 'Ressources Graphiques & Icônes'}
      />

      <ConfirmDialog
        isOpen={!!confirmDeleteCreations && confirmDeleteCreations.length > 0}
        title={isEn ? 'Delete creation(s)?' : 'Supprimer la sélection ?'}
        message={
          confirmDeleteCreations && confirmDeleteCreations.length === 1
            ? `${isEn ? 'Delete' : 'Supprimer'} « ${confirmDeleteCreations[0].title} » ?`
            : `${isEn ? 'Delete' : 'Supprimer'} ${confirmDeleteCreations?.length || 0} création(s) ?`
        }
        confirmLabel={isEn ? 'Delete' : 'Supprimer'}
        cancelLabel={isEn ? 'Cancel' : 'Annuler'}
        isDestructive
        onConfirm={handleConfirmDeleteCreations}
        onCancel={() => setConfirmDeleteCreations(null)}
      />

      <SocialShareModal
        isOpen={!!sharePayload}
        onClose={() => setSharePayload(null)}
        payload={sharePayload}
      />
    </div>
  );
};
