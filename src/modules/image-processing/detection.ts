import type { DetectionResult, ScreenPlacement, Seat } from '@/types';
import {
  findBackgroundColor,
  makeColorMask,
  makeOtsuMask,
  makeSaturationMask,
  connectedComponents,
  scoreCandidates,
  median,
  colorDistance,
  type CandidateSet,
  type ImageDataLike,
} from './preprocessing';
import {
  buildSeats,
  classifyCandidateColors,
  detectAislesAndSections,
  groupCandidatesIntoRows,
} from './segmentation';
import { loadOpenCv, morphologicalOpen } from './opencv';
import { screenBasis } from '@/modules/reconstruction/coordinates';

export interface DetectionProgress {
  (percent: number, step: string): void;
}

interface AnalyzeOptions {
  onProgress?: DetectionProgress;
  signal?: AbortSignal;
  useOpenCv?: boolean;
}

function inferScreenLine(
  image: ImageDataLike,
  best: CandidateSet,
  background: { r: number; g: number; b: number },
): ScreenPlacement {
  const { width, height, data } = image;
  const candidates = best.candidates;
  if (!candidates.length) {
    return {
      x1: 0.1,
      y1: 0.08,
      x2: 0.9,
      y2: 0.08,
      confidence: 0.2,
      source: 'inferred',
    };
  }
  const minX = Math.min(...candidates.map((candidate) => candidate.x));
  const maxX = Math.max(...candidates.map((candidate) => candidate.x + candidate.w));
  const minY = Math.min(...candidates.map((candidate) => candidate.y));
  const medianH = median(candidates.map((candidate) => candidate.h));
  const startY = Math.max(0, Math.round(minY - medianH * 3.4));
  const endY = Math.max(0, Math.round(minY - 1));
  let bestRow = -1;
  let bestScore = 0;
  let bestRun = 0;
  const span = Math.max(1, maxX - minX);

  for (let y = startY; y <= endY; y += 1) {
    let count = 0;
    let run = 0;
    let bestRunAtRow = 0;
    for (let x = Math.round(minX); x <= Math.round(maxX); x += 1) {
      const index = (y * width + x) * 4;
      const distance = colorDistance(
        { r: data[index], g: data[index + 1], b: data[index + 2] },
        background,
      );
      if (distance > 42) {
        count += 1;
        run += 1;
        bestRunAtRow = Math.max(bestRunAtRow, run);
      } else {
        run = 0;
      }
    }
    const score = count / span + bestRunAtRow / span;
    if (score > bestScore) {
      bestScore = score;
      bestRow = y;
      bestRun = bestRunAtRow;
    }
  }

  if (bestRow >= 0 && (bestRun > span * 0.32 || bestScore > 0.55)) {
    return {
      x1: Math.max(0.01, (minX - medianH * 0.3) / width),
      x2: Math.min(0.99, (maxX + medianH * 0.3) / width),
      y1: bestRow / height,
      y2: bestRow / height,
      confidence: Math.min(0.86, 0.55 + bestScore * 0.25),
      source: 'detected',
    };
  }

  const y = Math.max(0.02, (minY - medianH * 2.3) / height);
  return {
    x1: Math.max(0.01, (minX - medianH * 0.5) / width),
    x2: Math.min(0.99, (maxX + medianH * 0.5) / width),
    y1: y,
    y2: y,
    confidence: 0.38,
    source: 'inferred',
  };
}

function mergeCrossMaskCandidates(
  best: CandidateSet,
  others: CandidateSet[],
): CandidateSet {
  if (!best.candidates.length) return best;
  const medianW = median(best.candidates.map((candidate) => candidate.w));
  const medianH = median(best.candidates.map((candidate) => candidate.h));
  const merged = [...best.candidates];
  others.forEach((set) => {
    set.candidates.forEach((candidate) => {
      const sameSize =
        Math.abs(candidate.w - medianW) / medianW < 0.35 &&
        Math.abs(candidate.h - medianH) / medianH < 0.35;
      if (!sameSize) return;
      const near = merged.some(
        (existing) =>
          Math.hypot(existing.cx - candidate.cx, existing.cy - candidate.cy) <
          Math.min(medianW, medianH) * 0.55,
      );
      if (near) return;
      const rowAligned = merged.some(
        (existing) =>
          Math.abs(existing.cy - candidate.cy) <= Math.max(3, medianH * 0.65) &&
          Math.abs(existing.cx - candidate.cx) <= medianW * 6,
      );
      if (rowAligned && candidate.support > 0.1) {
        merged.push(candidate);
      }
    });
  });
  return { ...best, candidates: merged };
}

export async function detectSeating(
  image: ImageDataLike,
  originalWidth: number,
  originalHeight: number,
  options: AnalyzeOptions = {},
): Promise<DetectionResult> {
  const start = performance.now();
  const { width, height } = image;
  const progress = (percent: number, step: string) => options.onProgress?.(percent, step);
  progress(4, 'Reading screenshot');
  const background = findBackgroundColor(image);
  progress(10, 'Segmenting seat icons');

  const cv = options.useOpenCv === false ? null : await loadOpenCv();
  if (options.signal?.aborted) throw new Error('Analysis cancelled');

  const masks = [
    { name: 'colour-distance', mask: makeColorMask(image, background, 38) },
    { name: 'luminance', mask: makeOtsuMask(image) },
    { name: 'saturation', mask: makeSaturationMask(image, 34) },
    { name: 'high-contrast', mask: makeColorMask(image, background, 62) },
  ];

  const sets: CandidateSet[] = [];
  for (let index = 0; index < masks.length; index += 1) {
    if (options.signal?.aborted) throw new Error('Analysis cancelled');
    const item = masks[index];
    let mask = item.mask;
    if (cv) {
      mask = morphologicalOpen(mask, width, height, cv, index === 2 ? 2 : 3);
    }
    const components = connectedComponents(mask, image, 12);
    const scored = scoreCandidates(components, item.name, width, height);
    sets.push(scored);
    progress(15 + (index + 1) * 7, `Testing ${item.name} segmentation`);
  }

  const bestBase = sets
    .slice()
    .sort((a, b) => b.quality - a.quality)
    .at(0) ?? { candidates: [], quality: 0, maskName: 'none' };
  const best = mergeCrossMaskCandidates(bestBase, sets);
  progress(48, `Found ${best.candidates.length} seat-like shapes`);

  const screen = inferScreenLine(image, best, background);
  const basis = screenBasis(screen, width, height, best.candidates.map((candidate) => ({
    x: candidate.cx / width,
    y: candidate.cy / height,
  })));

  progress(58, 'Grouping rows and aisles');
  const rows = groupCandidatesIntoRows(best.candidates, basis, width, height);
  const aisleResult = detectAislesAndSections(
    best.candidates,
    rows,
    basis,
    width,
    height,
  );
  progress(72, 'Classifying availability');
  const colorResult = classifyCandidateColors(best.candidates);
  progress(82, 'Building seat map');
  const { seats, seatRows, sections } = buildSeats(
    best.candidates,
    rows,
    aisleResult,
    colorResult,
    width,
    height,
    basis,
    basis.center.x,
  );

  const warnings: string[] = [];
  if (!seats.length) {
    warnings.push(
      'No seats were detected. The screenshot may be too blurry, too cropped, or use seat icons unlike those this detector recognises. Use the editor to add seats manually.',
    );
  }
  if (screen.source === 'inferred') {
    warnings.push(
      'The screen position was inferred from the top of the seating field. Confirm it in the verification editor.',
    );
  }
  if (colorResult.clusters.length > 1) {
    warnings.push(
      'Seat availability was inferred from colour groups. Verify the status legend in the editor.',
    );
  }
  if (rows.rowCount > 0) {
    warnings.push(
      `Rows were grouped geometrically. Row labels are provisional${
        seats.some((seat) => seat.notes?.includes('Low-confidence')) ? ' and some seats need review' : ''
      }.`,
    );
  }

  const uncertainSeats = seats.filter((seat) => seat.confidence < 0.65).length;
  progress(88, 'Seat map ready');

  return {
    seats,
    rows: seatRows,
    sections,
    aisles: aisleResult.aisles,
    screen,
    colorClusters: colorResult.clusters,
    stats: {
      totalSeats: seats.length,
      totalRows: seatRows.length,
      totalSections: sections.length,
      uncertainSeats,
      unreadableLabels: seats.length,
      detectedSeats: seats.length,
      manualSeats: 0,
      processingMs: Math.round(performance.now() - start),
      openCvUsed: Boolean(cv),
      ocrUsed: false,
      warnings,
    },
    analysedWidth: width,
    analysedHeight: height,
    originalWidth,
    originalHeight,
  };
}

export function detectionResultToLayout(result: DetectionResult) {
  return {
    version: 1 as const,
    imageWidth: result.analysedWidth,
    imageHeight: result.analysedHeight,
    seats: result.seats as Seat[],
    rows: result.rows,
    sections: result.sections,
    aisles: result.aisles,
    screen: result.screen,
    colorClusters: result.colorClusters,
    stats: result.stats,
  };
}
