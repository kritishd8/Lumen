import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import {
  Eye,
  EyeOff,
  Maximize,
  Minus,
  Plus,
  ScanSearch,
} from 'lucide-react';
import { useAppStore } from '@/app/store/useAppStore';
import { SEAT_COLORS, SECTION_COLORS } from '@/utils/defaults';
import { clamp } from '@/modules/reconstruction/coordinates';
import type { Seat } from '@/types';

type SeatDrag = {
  seatId: string;
  startX: number;
  startY: number;
  originalX: number;
  originalY: number;
};

type ScreenDrag = {
  mode: 'p1' | 'p2' | 'line';
  startX: number;
  startY: number;
  original: { x1: number; y1: number; x2: number; y2: number };
};

type PanDrag = {
  startX: number;
  startY: number;
  originalX: number;
  originalY: number;
};

export function LayoutCanvas() {
  const project = useAppStore((state) => state.project);
  const imageUrl = useAppStore((state) => state.imageUrl);
  const tool = useAppStore((state) => state.editorTool);
  const overlayVisible = useAppStore((state) => state.overlayVisible);
  const setOverlayVisible = useAppStore((state) => state.setOverlayVisible);
  const selectedSeatIds = useAppStore((state) => state.selectedSeatIds);
  const selectSeat = useAppStore((state) => state.selectSeat);
  const updateSeat = useAppStore((state) => state.updateSeat);
  const addSeat = useAppStore((state) => state.addSeat);
  const addAisle = useAppStore((state) => state.addAisle);
  const setScreenPlacement = useAppStore((state) => state.setScreenPlacement);

  const containerRef = useRef<HTMLDivElement>(null);
  const surfaceRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 900, height: 640 });
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [seatDrag, setSeatDrag] = useState<SeatDrag | null>(null);
  const [seatPreview, setSeatPreview] = useState<{ x: number; y: number } | null>(null);
  const [screenDrag, setScreenDrag] = useState<ScreenDrag | null>(null);
  const [screenDraft, setScreenDraft] = useState<ScreenDrag['original'] | null>(null);
  const [panDrag, setPanDrag] = useState<PanDrag | null>(null);

  const layout = project?.layout;
  const imageWidth = layout?.imageWidth ?? 1200;
  const imageHeight = layout?.imageHeight ?? 800;
  const fitScale = useMemo(() => {
    const padding = 54;
    return Math.max(
      0.03,
      Math.min(
        (size.width - padding * 2) / imageWidth,
        (size.height - padding * 2) / imageHeight,
      ),
    );
  }, [size, imageWidth, imageHeight]);

  useEffect(() => {
    const element = containerRef.current;
    if (!element) return;
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) setSize({ width: entry.contentRect.width, height: entry.contentRect.height });
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  }, [layout?.imageWidth, layout?.imageHeight, project?.id]);

  useEffect(() => {
    const element = containerRef.current;
    if (!element) return;
    const handleWheel = (event: WheelEvent) => {
      event.preventDefault();
      const factor = Math.exp(-event.deltaY * 0.0012);
      setZoom((current) => clamp(current * factor, 0.35, 9));
    };
    element.addEventListener('wheel', handleWheel, { passive: false });
    return () => element.removeEventListener('wheel', handleWheel);
  }, []);

  const fit = useCallback(() => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  }, []);

  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => {
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLSelectElement) return;
      if (event.key === 'f') fit();
      if (event.key === '+' || event.key === '=') setZoom((value) => clamp(value * 1.18, 0.35, 9));
      if (event.key === '-') setZoom((value) => clamp(value / 1.18, 0.35, 9));
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [fit]);

  const pointerToNormalised = (clientX: number, clientY: number) => {
    const rect = surfaceRef.current?.getBoundingClientRect();
    if (!rect) return { x: 0, y: 0 };
    return {
      x: clamp((clientX - rect.left) / rect.width, 0, 1),
      y: clamp((clientY - rect.top) / rect.height, 0, 1),
    };
  };

  useEffect(() => {
    if (!seatDrag && !screenDrag && !panDrag) return;
    const handleMove = (event: PointerEvent) => {
      if (seatDrag) {
        const point = pointerToNormalised(event.clientX, event.clientY);
        setSeatPreview({
          x: clamp(seatDrag.originalX + point.x - seatDrag.startX, 0, 1),
          y: clamp(seatDrag.originalY + point.y - seatDrag.startY, 0, 1),
        });
      }
      if (screenDrag) {
        const rect = surfaceRef.current?.getBoundingClientRect();
        if (!rect) return;
        const dx = (event.clientX - screenDrag.startX) / rect.width;
        const dy = (event.clientY - screenDrag.startY) / rect.height;
        const next = { ...screenDrag.original };
        if (screenDrag.mode === 'line') {
          next.x1 = clamp(screenDrag.original.x1 + dx, 0, 1);
          next.x2 = clamp(screenDrag.original.x2 + dx, 0, 1);
          next.y1 = clamp(screenDrag.original.y1 + dy, 0, 1);
          next.y2 = clamp(screenDrag.original.y2 + dy, 0, 1);
        } else if (screenDrag.mode === 'p1') {
          next.x1 = clamp(screenDrag.original.x1 + dx, 0, 1);
          next.y1 = clamp(screenDrag.original.y1 + dy, 0, 1);
        } else {
          next.x2 = clamp(screenDrag.original.x2 + dx, 0, 1);
          next.y2 = clamp(screenDrag.original.y2 + dy, 0, 1);
        }
        setScreenDraft(next);
      }
      if (panDrag) {
        setPan({
          x: panDrag.originalX + event.clientX - panDrag.startX,
          y: panDrag.originalY + event.clientY - panDrag.startY,
        });
      }
    };
    const handleUp = () => {
      if (seatDrag && seatPreview) {
        updateSeat(seatDrag.seatId, { x: seatPreview.x, y: seatPreview.y, source: 'manual' });
      }
      if (screenDrag && screenDraft) {
        setScreenPlacement(screenDraft);
      }
      setSeatDrag(null);
      setSeatPreview(null);
      setScreenDrag(null);
      setScreenDraft(null);
      setPanDrag(null);
    };
    window.addEventListener('pointermove', handleMove);
    window.addEventListener('pointerup', handleUp);
    return () => {
      window.removeEventListener('pointermove', handleMove);
      window.removeEventListener('pointerup', handleUp);
    };
  }, [seatDrag, screenDrag, panDrag, seatPreview, screenDraft, updateSeat, setScreenPlacement]);

  const beginSeatDrag = (event: ReactPointerEvent, seat: Seat) => {
    if (tool !== 'select') return;
    event.stopPropagation();
    const point = pointerToNormalised(event.clientX, event.clientY);
    setSeatDrag({
      seatId: seat.id,
      startX: point.x,
      startY: point.y,
      originalX: seat.x,
      originalY: seat.y,
    });
  };

  const handleSurfacePointerDown = (event: ReactPointerEvent) => {
    if (event.button === 1 || tool === 'pan' || event.altKey) {
      event.preventDefault();
      setPanDrag({
        startX: event.clientX,
        startY: event.clientY,
        originalX: pan.x,
        originalY: pan.y,
      });
      return;
    }
    const point = pointerToNormalised(event.clientX, event.clientY);
    if (tool === 'add-seat') {
      addSeat(point.x, point.y);
    } else if (tool === 'aisle') {
      addAisle(point.x, point.y, 'vertical');
    } else if (tool === 'select') {
      selectSeat(null);
    }
  };

  if (!layout) return null;

  const screen = screenDraft ?? layout.screen;
  const scale = fitScale * zoom;
  const selectedSet = new Set(selectedSeatIds);

  return (
    <div className="editor-stage-wrap">
      <div className="editor-stage-toolbar">
        <div className="editor-zoom">
          <button
            className="icon-btn"
            onClick={() => setZoom((value) => clamp(value / 1.18, 0.35, 9))}
            title="Zoom out"
          >
            <Minus size={13} />
          </button>
          <span>{Math.round(scale * 100)}%</span>
          <button
            className="icon-btn"
            onClick={() => setZoom((value) => clamp(value * 1.18, 0.35, 9))}
            title="Zoom in"
          >
            <Plus size={13} />
          </button>
          <button className="icon-btn" onClick={fit} title="Fit image">
            <Maximize size={13} />
          </button>
        </div>
        <button
          className={`btn btn--sm ${overlayVisible ? '' : 'btn--ghost'}`}
          onClick={() => setOverlayVisible(!overlayVisible)}
        >
          {overlayVisible ? <Eye size={13} /> : <EyeOff size={13} />}
          Overlay
        </button>
        <span className="row dim" style={{ fontSize: 9, marginLeft: 2 }}>
          <ScanSearch size={12} />
          {tool === 'add-seat'
            ? 'Click to add a seat'
            : tool === 'aisle'
              ? 'Click to place an aisle marker'
              : tool === 'screen'
                ? 'Drag the screen line or its handles'
                : 'Drag seats · Alt-drag to pan'}
        </span>
      </div>

      <div
        className="editor-canvas-viewport"
        ref={containerRef}
        style={{ cursor: tool === 'pan' ? 'grab' : tool === 'add-seat' ? 'crosshair' : 'default' }}
        onPointerDown={(event) => {
          if (event.target === event.currentTarget) {
            if (tool === 'pan' || event.button === 1) {
              setPanDrag({
                startX: event.clientX,
                startY: event.clientY,
                originalX: pan.x,
                originalY: pan.y,
              });
            }
          }
        }}
      >
        <div
          className="editor-canvas-transform"
          style={{
            transform: `translate(calc(-50% + ${pan.x}px), calc(-50% + ${pan.y}px)) scale(${scale})`,
          }}
        >
          <div
            className="editor-canvas-surface"
            ref={surfaceRef}
            style={{ width: imageWidth, height: imageHeight }}
            onPointerDown={handleSurfacePointerDown}
          >
            {imageUrl && <img src={imageUrl} alt="Original seating plan" draggable={false} />}
            {overlayVisible && (
              <svg
                className="editor-overlay"
                viewBox={`0 0 ${imageWidth} ${imageHeight}`}
                preserveAspectRatio="none"
              >
                {layout.aisles.map((aisle) => {
                  const x = aisle.x * imageWidth;
                  const y = aisle.y * imageHeight;
                  const half = (aisle.orientation === 'vertical' ? imageHeight * 0.035 : imageWidth * 0.035);
                  return (
                    <g key={aisle.id}>
                      {aisle.orientation === 'vertical' ? (
                        <rect
                          className="aisle-marker"
                          x={x - 2}
                          y={y - half}
                          width={4}
                          height={half * 2}
                          rx={2}
                        />
                      ) : (
                        <rect
                          className="aisle-marker"
                          x={x - half}
                          y={y - 2}
                          width={half * 2}
                          height={4}
                          rx={2}
                        />
                      )}
                    </g>
                  );
                })}

                <g>
                  <line
                    x1={screen.x1 * imageWidth}
                    y1={screen.y1 * imageHeight}
                    x2={screen.x2 * imageWidth}
                    y2={screen.y2 * imageHeight}
                    className="screen-line-hit"
                    onPointerDown={(event) => {
                      event.stopPropagation();
                      setScreenDrag({
                        mode: 'line',
                        startX: event.clientX,
                        startY: event.clientY,
                        original: {
                          x1: screen.x1,
                          y1: screen.y1,
                          x2: screen.x2,
                          y2: screen.y2,
                        },
                      });
                    }}
                  />
                  <line
                    x1={screen.x1 * imageWidth}
                    y1={screen.y1 * imageHeight}
                    x2={screen.x2 * imageWidth}
                    y2={screen.y2 * imageHeight}
                    className="screen-line"
                  />
                  <circle
                    cx={screen.x1 * imageWidth}
                    cy={screen.y1 * imageHeight}
                    r={tool === 'screen' ? 7 : 5}
                    className="screen-handle"
                    onPointerDown={(event) => {
                      event.stopPropagation();
                      setScreenDrag({
                        mode: 'p1',
                        startX: event.clientX,
                        startY: event.clientY,
                        original: {
                          x1: screen.x1,
                          y1: screen.y1,
                          x2: screen.x2,
                          y2: screen.y2,
                        },
                      });
                    }}
                  />
                  <circle
                    cx={screen.x2 * imageWidth}
                    cy={screen.y2 * imageHeight}
                    r={tool === 'screen' ? 7 : 5}
                    className="screen-handle"
                    onPointerDown={(event) => {
                      event.stopPropagation();
                      setScreenDrag({
                        mode: 'p2',
                        startX: event.clientX,
                        startY: event.clientY,
                        original: {
                          x1: screen.x1,
                          y1: screen.y1,
                          x2: screen.x2,
                          y2: screen.y2,
                        },
                      });
                    }}
                  />
                  <text
                    className="screen-label"
                    x={((screen.x1 + screen.x2) / 2) * imageWidth}
                    y={((screen.y1 + screen.y2) / 2) * imageHeight - 9}
                  >
                    SCREEN
                  </text>
                </g>

                {layout.seats.map((seat) => {
                  const preview = seatDrag?.seatId === seat.id ? seatPreview : null;
                  const x = (preview?.x ?? seat.x) * imageWidth;
                  const y = (preview?.y ?? seat.y) * imageHeight;
                  const width = Math.max(3, seat.width * imageWidth);
                  const height = Math.max(3, seat.depth * imageHeight);
                  const selected = selectedSet.has(seat.id);
                  const section = layout.sections.find((item) => item.id === seat.sectionId);
                  const sectionColor =
                    section?.color ?? SECTION_COLORS[0];
                  const fill = SEAT_COLORS[seat.status];
                  const fontSize = Math.max(4, Math.min(height * 0.42, width * 0.5));
                  return (
                    <g
                      key={seat.id}
                      className={`seat-marker ${selected ? 'is-selected' : ''} ${
                        seat.confidence < 0.65 ? 'is-uncertain' : ''
                      }`}
                      transform={`translate(${x}, ${y}) rotate(${seat.rotation})`}
                      onPointerDown={(event) => beginSeatDrag(event, seat)}
                      onClick={(event) => {
                        event.stopPropagation();
                        if (tool === 'select') selectSeat(seat.id, event.shiftKey);
                      }}
                    >
                      <rect
                        x={-width / 2}
                        y={-height / 2}
                        width={width}
                        height={height}
                        rx={Math.min(width, height) * 0.22}
                        fill={fill}
                        stroke={selected ? '#ffffff' : sectionColor}
                        strokeWidth={selected ? 2 : Math.max(0.7, width * 0.045)}
                        fillOpacity={seat.status === 'occupied' ? 0.78 : 0.94}
                      />
                      {seat.seatNumber && fontSize >= 4.5 && (
                        <text
                          x={0}
                          y={fontSize * 0.34}
                          textAnchor="middle"
                          fontSize={fontSize}
                        >
                          {seat.seatNumber}
                        </text>
                      )}
                    </g>
                  );
                })}
              </svg>
            )}
          </div>
        </div>

        {layout.seats.length === 0 && (
          <div className="editor-empty-hint">
            <strong>No seats detected</strong>
            <span>
              Use the add-seat tool and click over each chair in the screenshot, or go back
              and try a tighter crop.
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
