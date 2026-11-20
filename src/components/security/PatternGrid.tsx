import React, { useState, useRef, useEffect, useCallback } from 'react';
import { RotateCcw } from 'lucide-react';

interface PatternGridProps {
  onPatternComplete: (patternString: string) => void;
  error?: boolean;
  label?: string;
}

// Compute intermediate skipped dot between two dots on a 3x3 grid (Android lock behavior)
function getMiddleNode(a: number, b: number): number | null {
  const r1 = Math.floor(a / 3);
  const c1 = a % 3;
  const r2 = Math.floor(b / 3);
  const c2 = b % 3;
  if ((r1 + r2) % 2 === 0 && (c1 + c2) % 2 === 0) {
    const mr = (r1 + r2) / 2;
    const mc = (c1 + c2) / 2;
    const mid = mr * 3 + mc;
    if (mid !== a && mid !== b) return mid;
  }
  return null;
}

export const PatternGrid: React.FC<PatternGridProps> = ({
  onPatternComplete,
  error = false,
  label = 'Glissez votre doigt ou souris sur au moins 4 points',
}) => {
  const [selectedNodes, setSelectedNodes] = useState<number[]>([]);
  const [pointerPos, setPointerPos] = useState<{ x: number; y: number } | null>(null);
  const [isDrawing, setIsDrawing] = useState(false);

  const gridRef = useRef<HTMLDivElement | null>(null);
  const nodesRef = useRef<number[]>([]);
  const isDrawingRef = useRef(false);
  const onCompleteRef = useRef(onPatternComplete);
  onCompleteRef.current = onPatternComplete;

  const getNodeCenter = (index: number) => {
    const row = Math.floor(index / 3);
    const col = index % 3;
    return {
      x: col * 100 + 50,
      y: row * 100 + 50,
    };
  };

  const getRelativeSvgPoint = (clientX: number, clientY: number) => {
    if (!gridRef.current) return null;
    const rect = gridRef.current.getBoundingClientRect();
    const x = Math.max(0, Math.min(300, ((clientX - rect.left) / rect.width) * 300));
    const y = Math.max(0, Math.min(300, ((clientY - rect.top) / rect.height) * 300));
    return { x, y };
  };

  const detectNodeFromPoint = (clientX: number, clientY: number): number | null => {
    if (!gridRef.current) return null;
    const rect = gridRef.current.getBoundingClientRect();
    const relX = clientX - rect.left;
    const relY = clientY - rect.top;
    if (relX < -10 || relY < -10 || relX > rect.width + 10 || relY > rect.height + 10) {
      return null;
    }

    const cellW = rect.width / 3;
    const cellH = rect.height / 3;
    const hitRadius = Math.min(cellW, cellH) * 0.42;

    let closestIdx: number | null = null;
    let closestDist = Infinity;

    for (let i = 0; i < 9; i++) {
      const row = Math.floor(i / 3);
      const col = i % 3;
      const cx = col * cellW + cellW / 2;
      const cy = row * cellH + cellH / 2;
      const dist = Math.hypot(relX - cx, relY - cy);
      if (dist <= hitRadius && dist < closestDist) {
        closestDist = dist;
        closestIdx = i;
      }
    }

    return closestIdx;
  };

  const appendNode = useCallback((node: number) => {
    const current = nodesRef.current;
    if (current.includes(node)) return;

    const next = [...current];
    if (next.length > 0) {
      const mid = getMiddleNode(next[next.length - 1], node);
      if (mid !== null && !next.includes(mid)) {
        next.push(mid);
      }
    }
    next.push(node);
    nodesRef.current = next;
    setSelectedNodes(next);
  }, []);

  const finishDrawing = useCallback(() => {
    if (!isDrawingRef.current) return;
    isDrawingRef.current = false;
    setIsDrawing(false);
    setPointerPos(null);

    const traced = nodesRef.current;
    if (traced.length >= 4) {
      const patternStr = traced.join('-');
      onCompleteRef.current(patternStr);
      setTimeout(() => {
        nodesRef.current = [];
        setSelectedNodes([]);
      }, 350);
    } else if (traced.length > 0) {
      setTimeout(() => {
        nodesRef.current = [];
        setSelectedNodes([]);
      }, 450);
    }
  }, []);

  // Global mouse/touch listeners while drawing so dragging slightly outside or quickly never drops
  useEffect(() => {
    if (!isDrawing) return;

    const handleMove = (clientX: number, clientY: number) => {
      if (!isDrawingRef.current) return;
      const svgPt = getRelativeSvgPoint(clientX, clientY);
      if (svgPt) setPointerPos(svgPt);
      const node = detectNodeFromPoint(clientX, clientY);
      if (node !== null) {
        appendNode(node);
      }
    };

    const onPointerMoveWin = (e: PointerEvent) => {
      e.preventDefault();
      handleMove(e.clientX, e.clientY);
    };

    const onTouchMoveWin = (e: TouchEvent) => {
      if (e.touches.length > 0) {
        e.preventDefault();
        handleMove(e.touches[0].clientX, e.touches[0].clientY);
      }
    };

    const onEndWin = () => {
      finishDrawing();
    };

    window.addEventListener('pointermove', onPointerMoveWin, { passive: false });
    window.addEventListener('pointerup', onEndWin);
    window.addEventListener('pointercancel', onEndWin);
    window.addEventListener('touchmove', onTouchMoveWin, { passive: false });
    window.addEventListener('touchend', onEndWin);
    window.addEventListener('touchcancel', onEndWin);

    return () => {
      window.removeEventListener('pointermove', onPointerMoveWin);
      window.removeEventListener('pointerup', onEndWin);
      window.removeEventListener('pointercancel', onEndWin);
      window.removeEventListener('touchmove', onTouchMoveWin);
      window.removeEventListener('touchend', onEndWin);
      window.removeEventListener('touchcancel', onEndWin);
    };
  }, [isDrawing, appendNode, finishDrawing]);

  const startDrawingAt = (clientX: number, clientY: number) => {
    isDrawingRef.current = true;
    setIsDrawing(true);
    nodesRef.current = [];
    setSelectedNodes([]);

    const svgPt = getRelativeSvgPoint(clientX, clientY);
    if (svgPt) setPointerPos(svgPt);

    const node = detectNodeFromPoint(clientX, clientY);
    if (node !== null) {
      appendNode(node);
    }
  };

  const lastNodeCenter =
    selectedNodes.length > 0 ? getNodeCenter(selectedNodes[selectedNodes.length - 1]) : null;

  return (
    <div className="flex flex-col items-center space-y-3 select-none">
      <p className="text-xs text-slate-600 dark:text-slate-300 font-medium text-center">{label}</p>

      <div
        ref={gridRef}
        onPointerDown={(e) => {
          e.preventDefault();
          startDrawingAt(e.clientX, e.clientY);
        }}
        onTouchStart={(e) => {
          if (e.touches.length > 0 && !isDrawingRef.current) {
            e.preventDefault();
            startDrawingAt(e.touches[0].clientX, e.touches[0].clientY);
          }
        }}
        style={{ touchAction: 'none' }}
        className="relative w-60 h-60 touch-none bg-slate-50 dark:bg-slate-900/80 rounded-2xl border-2 border-slate-200 dark:border-slate-700 p-2 cursor-crosshair shadow-inner"
      >
        {/* SVG Lines + Active Rubber-Band Line */}
        <svg viewBox="0 0 300 300" className="absolute inset-0 w-full h-full pointer-events-none">
          {selectedNodes.length > 1 &&
            selectedNodes.slice(0, -1).map((nodeIdx, i) => {
              const p1 = getNodeCenter(nodeIdx);
              const p2 = getNodeCenter(selectedNodes[i + 1]);
              return (
                <line
                  key={`${nodeIdx}-${selectedNodes[i + 1]}`}
                  x1={p1.x}
                  y1={p1.y}
                  x2={p2.x}
                  y2={p2.y}
                  stroke={error ? '#ef4444' : '#2563eb'}
                  strokeWidth="8"
                  strokeLinecap="round"
                  strokeOpacity="0.8"
                />
              );
            })}

          {isDrawing && lastNodeCenter && pointerPos && (
            <line
              x1={lastNodeCenter.x}
              y1={lastNodeCenter.y}
              x2={pointerPos.x}
              y2={pointerPos.y}
              stroke={error ? '#ef4444' : '#3b82f6'}
              strokeWidth="6"
              strokeLinecap="round"
              strokeDasharray="6 6"
              strokeOpacity="0.65"
            />
          )}
        </svg>

        {/* 9 Dots */}
        <div className="grid grid-cols-3 grid-rows-3 w-full h-full relative z-10 pointer-events-none">
          {[0, 1, 2, 3, 4, 5, 6, 7, 8].map((index) => {
            const isActive = selectedNodes.includes(index);
            const order = selectedNodes.indexOf(index) + 1;
            return (
              <div key={index} className="flex items-center justify-center">
                <div
                  className={`w-8 h-8 rounded-full flex items-center justify-center transition-transform ${
                    isActive
                      ? error
                        ? 'bg-red-500 scale-125 text-white ring-4 ring-red-500/25'
                        : 'bg-blue-600 scale-125 text-white ring-4 ring-blue-600/25'
                      : 'bg-slate-300 dark:bg-slate-700'
                  }`}
                >
                  {isActive ? (
                    <span className="text-[11px] font-bold">{order}</span>
                  ) : (
                    <span className="w-2.5 h-2.5 rounded-full bg-slate-500/50 dark:bg-slate-400/50" />
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {selectedNodes.length > 0 && selectedNodes.length < 4 && (
        <span className="text-[11px] text-amber-600 dark:text-amber-400 font-semibold">
          Reliez au moins 4 points sans lever le doigt ({selectedNodes.length}/4)
        </span>
      )}

      <button
        type="button"
        onClick={() => {
          nodesRef.current = [];
          setSelectedNodes([]);
          setPointerPos(null);
          isDrawingRef.current = false;
          setIsDrawing(false);
        }}
        className="text-[11px] text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 flex items-center gap-1"
      >
        <RotateCcw className="w-3 h-3" />
        <span>Effacer le tracé</span>
      </button>
    </div>
  );
};
