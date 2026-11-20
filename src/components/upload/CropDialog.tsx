import { useEffect, useRef, useState } from 'react';
import { Crop, Maximize2, Scan } from 'lucide-react';
import type { CropRect } from '@/types';
import { Modal } from '@/components/common/Modal';

interface CropDialogProps {
  open: boolean;
  imageUrl: string | null;
  fileName?: string;
  onClose: () => void;
  onConfirm: (crop: CropRect) => void;
}

type DragMode = 'move' | 'nw' | 'ne' | 'sw' | 'se';

interface DragState {
  mode: DragMode;
  startX: number;
  startY: number;
  initial: CropRect;
  rect: DOMRect;
}

const FULL: CropRect = { x: 0, y: 0, width: 1, height: 1 };

function clampCrop(crop: CropRect): CropRect {
  const width = Math.max(0.05, Math.min(1, crop.width));
  const height = Math.max(0.05, Math.min(1, crop.height));
  return {
    x: Math.max(0, Math.min(1 - width, crop.x)),
    y: Math.max(0, Math.min(1 - height, crop.y)),
    width,
    height,
  };
}

export function CropDialog({ open, imageUrl, fileName, onClose, onConfirm }: CropDialogProps) {
  const [crop, setCrop] = useState<CropRect>(FULL);
  const [drag, setDrag] = useState<DragState | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) setCrop(FULL);
  }, [open, imageUrl]);

  useEffect(() => {
    if (!drag) return;
    const handleMove = (event: PointerEvent) => {
      const dx = (event.clientX - drag.startX) / drag.rect.width;
      const dy = (event.clientY - drag.startY) / drag.rect.height;
      const initial = drag.initial;
      let next = { ...initial };
      if (drag.mode === 'move') {
        next.x = initial.x + dx;
        next.y = initial.y + dy;
      } else {
        if (drag.mode.includes('w')) {
          next.x = initial.x + dx;
          next.width = initial.width - dx;
        }
        if (drag.mode.includes('e')) next.width = initial.width + dx;
        if (drag.mode.includes('n')) {
          next.y = initial.y + dy;
          next.height = initial.height - dy;
        }
        if (drag.mode.includes('s')) next.height = initial.height + dy;
        if (next.width < 0.05) {
          next.width = 0.05;
          if (drag.mode.includes('w')) next.x = initial.x + initial.width - 0.05;
        }
        if (next.height < 0.05) {
          next.height = 0.05;
          if (drag.mode.includes('n')) next.y = initial.y + initial.height - 0.05;
        }
      }
      setCrop(clampCrop(next));
    };
    const handleUp = () => setDrag(null);
    window.addEventListener('pointermove', handleMove);
    window.addEventListener('pointerup', handleUp);
    return () => {
      window.removeEventListener('pointermove', handleMove);
      window.removeEventListener('pointerup', handleUp);
    };
  }, [drag]);

  const startDrag = (mode: DragMode) => (event: React.PointerEvent) => {
    if (!wrapRef.current) return;
    event.preventDefault();
    event.stopPropagation();
    setDrag({
      mode,
      startX: event.clientX,
      startY: event.clientY,
      initial: crop,
      rect: wrapRef.current.getBoundingClientRect(),
    });
  };

  const isCropped = crop.x > 0.001 || crop.y > 0.001 || crop.width < 0.999 || crop.height < 0.999;

  return (
    <Modal
      open={open}
      title="Frame the seating plan"
      description="Crop away booking UI, navigation or unrelated content before analysis. The original screenshot is kept in the project."
      onClose={onClose}
      width={820}
      footer={
        <>
          <button className="btn btn--ghost" onClick={onClose}>
            Cancel
          </button>
          <button className="btn btn--primary" onClick={() => onConfirm(crop)}>
            <Scan size={14} />
            Analyse {isCropped ? 'selection' : 'full image'}
          </button>
        </>
      }
    >
      <div className="crop-stage">
        {imageUrl && (
          <div className="crop-image-wrap" ref={wrapRef}>
            <img src={imageUrl} alt={fileName ?? 'Seating plan screenshot'} draggable={false} />
            <div
              className="crop-box"
              style={{
                left: `${crop.x * 100}%`,
                top: `${crop.y * 100}%`,
                width: `${crop.width * 100}%`,
                height: `${crop.height * 100}%`,
              }}
              onPointerDown={startDrag('move')}
            >
              <span className="crop-handle nw" onPointerDown={startDrag('nw')} />
              <span className="crop-handle ne" onPointerDown={startDrag('ne')} />
              <span className="crop-handle sw" onPointerDown={startDrag('sw')} />
              <span className="crop-handle se" onPointerDown={startDrag('se')} />
            </div>
          </div>
        )}
      </div>
      <div className="crop-toolbar">
        <Crop size={13} />
        <span>
          {Math.round(crop.width * 100)}% × {Math.round(crop.height * 100)}% of the image
        </span>
        <div className="crop-presets">
          <button className="btn btn--sm btn--ghost" onClick={() => setCrop(FULL)}>
            <Maximize2 size={12} />
            Full image
          </button>
          <button
            className="btn btn--sm btn--ghost"
            onClick={() => setCrop({ x: 0.08, y: 0.06, width: 0.84, height: 0.86 })}
          >
            Central 84%
          </button>
        </div>
      </div>
    </Modal>
  );
}
