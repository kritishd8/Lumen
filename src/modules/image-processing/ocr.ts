import type { SeatingLayout } from '@/types';
import { clamp } from '@/modules/reconstruction/coordinates';

export interface OcrWord {
  text: string;
  confidence: number;
  bbox: { x0: number; y0: number; x1: number; y1: number };
}

export interface OcrApplyResult {
  layout: SeatingLayout;
  words: OcrWord[];
  screenFound: boolean;
  seatNumbersRead: number;
  rowLabelsRead: number;
}

/**
 * Pure mapping from OCR words to seats, rows and the screen marker. Kept
 * separate from Tesseract so it can be unit tested without downloading models.
 */
export function applyOcrWords(
  layout: SeatingLayout,
  words: OcrWord[],
  imageWidth: number,
  imageHeight: number,
): OcrApplyResult {
  const next: SeatingLayout = structuredClone(layout);
  let screenFound = false;
  let seatNumbersRead = 0;
  let rowLabelsRead = 0;

  const seatPxWidth =
    next.seats.reduce((sum, seat) => sum + seat.width * imageWidth, 0) /
    Math.max(1, next.seats.length);
  const seatPxHeight =
    next.seats.reduce((sum, seat) => sum + seat.depth * imageHeight, 0) /
    Math.max(1, next.seats.length);

  const screenWord = words.find(
    (word) =>
      word.confidence > 35 &&
      /^(screen|silver screen|screen this way)$/i.test(word.text.trim()),
  );
  if (screenWord) {
    const seatMinX = next.seats.length
      ? Math.min(...next.seats.map((seat) => seat.x))
      : 0.12;
    const seatMaxX = next.seats.length
      ? Math.max(...next.seats.map((seat) => seat.x))
      : 0.88;
    const y = (screenWord.bbox.y0 + screenWord.bbox.y1) / 2 / imageHeight;
    next.screen = {
      x1: Math.max(0.01, seatMinX - 0.03),
      x2: Math.min(0.99, seatMaxX + 0.03),
      y1: y,
      y2: y,
      confidence: Math.min(0.97, screenWord.confidence / 100),
      source: 'detected',
    };
    screenFound = true;
  }

  const numericWords = words.filter(
    (word) =>
      word.confidence > 28 &&
      /^\d{1,3}$/.test(word.text.trim()) &&
      word.text.trim().length > 0,
  );
  numericWords.forEach((word) => {
    const cx = (word.bbox.x0 + word.bbox.x1) / 2;
    const cy = (word.bbox.y0 + word.bbox.y1) / 2;
    let nearestSeat: SeatingLayout['seats'][number] | null = null;
    let nearestDistance = Number.POSITIVE_INFINITY;
    for (const seat of next.seats) {
      const dx = (seat.x * imageWidth - cx) / Math.max(1, seatPxWidth);
      const dy = (seat.y * imageHeight - cy) / Math.max(1, seatPxHeight);
      const distance = Math.hypot(dx, dy);
      if (distance < nearestDistance) {
        nearestDistance = distance;
        nearestSeat = seat;
      }
    }
    if (nearestSeat && nearestDistance < 0.72) {
      nearestSeat.seatNumber = word.text.trim();
      nearestSeat.notes = undefined;
      seatNumbersRead += 1;
    }
  });

  const rowLabelWords = words.filter(
    (word) =>
      word.confidence > 30 &&
      /^[A-Z]{1,2}$/.test(word.text.trim()) &&
      !/^screen$/i.test(word.text.trim()),
  );
  const rowCentres = next.rows.map((row) => {
    const seats = row.seatIds
      .map((id) => next.seats.find((seat) => seat.id === id))
      .filter(Boolean);
    return {
      row,
      y: seats.length
        ? seats.reduce((sum, seat) => sum + (seat?.y ?? 0), 0) / seats.length
        : 0.5,
      minX: seats.length ? Math.min(...seats.map((seat) => seat?.x ?? 1)) : 0,
      maxX: seats.length ? Math.max(...seats.map((seat) => seat?.x ?? 0)) : 1,
    };
  });

  rowLabelWords.forEach((word) => {
    const cx = (word.bbox.x0 + word.bbox.x1) / 2 / imageWidth;
    const cy = (word.bbox.y0 + word.bbox.y1) / 2 / imageHeight;
    let bestRow: SeatingLayout['rows'][number] | null = null;
    let bestDistance = Number.POSITIVE_INFINITY;
    for (const entry of rowCentres) {
      const nearEdge = cx < entry.minX - 0.005 || cx > entry.maxX + 0.005;
      if (!nearEdge) continue;
      const distance = Math.abs(cy - entry.y);
      if (distance < bestDistance) {
        bestDistance = distance;
        bestRow = entry.row;
      }
    }
    if (bestRow && bestDistance < (seatPxHeight / imageHeight) * 1.4) {
      const label = word.text.trim();
      const row = bestRow;
      row.label = label;
      next.seats.forEach((seat) => {
        if (seat.rowId === row.id) seat.rowLabel = label;
      });
      rowLabelsRead += 1;
    }
  });

  next.stats = {
    ...next.stats,
    ocrUsed: true,
    unreadableLabels: next.seats.filter((seat) => !seat.seatNumber).length,
  };
  next.screen.confidence = clamp(next.screen.confidence, 0, 1);

  return { layout: next, words, screenFound, seatNumbersRead, rowLabelsRead };
}

interface TesseractWordLike {
  text: string;
  confidence: number;
  bbox: { x0: number; y0: number; x1: number; y1: number };
}

function extractWords(data: any): OcrWord[] {
  const words: OcrWord[] = [];
  const blocks = data?.blocks;
  if (Array.isArray(blocks)) {
    blocks.forEach((block: any) => {
      block?.paragraphs?.forEach((paragraph: any) => {
        paragraph?.lines?.forEach((line: any) => {
          line?.words?.forEach((word: TesseractWordLike) => {
            if (word.text?.trim()) {
              words.push({
                text: word.text.trim(),
                confidence: word.confidence,
                bbox: word.bbox,
              });
            }
          });
        });
      });
    });
  }
  if (!words.length && Array.isArray(data?.words)) {
    data.words.forEach((word: TesseractWordLike) => {
      if (word.text?.trim()) {
        words.push({
          text: word.text.trim(),
          confidence: word.confidence,
          bbox: word.bbox,
        });
      }
    });
  }
  return words;
}

export async function runOcr(
  imageDataUrl: string,
  layout: SeatingLayout,
  onProgress?: (percent: number, step: string) => void,
): Promise<OcrApplyResult> {
  onProgress?.(2, 'Loading OCR engine');
  const Tesseract = await import('tesseract.js');
  let worker: Awaited<ReturnType<typeof Tesseract.createWorker>> | null = null;
  try {
    worker = await Tesseract.createWorker('eng', 1, {
      logger: (message) => {
        if (message.status === 'recognizing text') {
          onProgress?.(10 + Math.round(message.progress * 80), 'Reading seat labels');
        } else if (message.progress > 0) {
          onProgress?.(
            5 + Math.round(message.progress * 8),
            message.status.replace(/_/g, ' '),
          );
        }
      },
    });
    await worker.setParameters({
      tessedit_pageseg_mode: Tesseract.PSM.SPARSE_TEXT,
      preserve_interword_spaces: '1',
    });
    const result = await worker.recognize(imageDataUrl, {}, { blocks: true });
    const words = extractWords(result.data);
    const applied = applyOcrWords(layout, words, layout.imageWidth, layout.imageHeight);
    onProgress?.(100, 'Labels read');
    return applied;
  } finally {
    if (worker) await worker.terminate();
  }
}
