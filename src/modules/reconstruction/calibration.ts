import type {
  AuditoriumConfig,
  Calibration,
  ConfigFieldKey,
  MeasurementSource,
  SeatingLayout,
} from '@/types';
import {
  clamp,
  median,
  projectToScreenAxes,
  screenBasis,
  type ScreenBasis,
} from './coordinates';
import { aspectValue } from '@/utils/defaults';

export interface LayoutMetrics {
  basis: ScreenBasis;
  seatWidthPx: number;
  seatDepthPx: number;
  seatSpanXPx: number;
  seatSpanZPx: number;
  firstRowDepthPx: number;
  lastRowDepthPx: number;
  rowSpacingPx: number;
  horizontalPitchPx: number;
  screenWidthPx: number;
  rowDepthsPx: number[];
  horizontalPositionsPx: number[];
}

export function measureLayout(layout: SeatingLayout): LayoutMetrics {
  const basis = screenBasis(
    layout.screen,
    layout.imageWidth,
    layout.imageHeight,
    layout.seats,
  );
  const projected = layout.seats.map((seat) =>
    projectToScreenAxes(
      { x: seat.x, y: seat.y },
      basis,
      layout.imageWidth,
      layout.imageHeight,
    ),
  );
  const horizontal = projected.map((item) => item.horizontalPx);
  const depths = projected.map((item) => item.depthPx);
  const rowDepths = layout.rows
    .map((row) => {
      const rowSeats = layout.seats.filter((seat) => row.seatIds.includes(seat.id));
      if (!rowSeats.length) return 0;
      return (
        rowSeats.reduce((sum, seat) => {
          return (
            sum +
            projectToScreenAxes(
              { x: seat.x, y: seat.y },
              basis,
              layout.imageWidth,
              layout.imageHeight,
            ).depthPx
          );
        }, 0) / rowSeats.length
      );
    })
    .sort((a, b) => a - b);

  const rowGaps: number[] = [];
  for (let i = 1; i < rowDepths.length; i += 1) {
    const gap = rowDepths[i] - rowDepths[i - 1];
    if (gap > 1) rowGaps.push(gap);
  }

  const pitches: number[] = [];
  layout.rows.forEach((row) => {
    const positions = row.seatIds
      .map((id) => layout.seats.find((seat) => seat.id === id))
      .filter(Boolean)
      .map((seat) => {
        if (!seat) return 0;
        return projectToScreenAxes(
          { x: seat.x, y: seat.y },
          basis,
          layout.imageWidth,
          layout.imageHeight,
        ).horizontalPx;
      })
      .sort((a, b) => a - b);
    for (let i = 1; i < positions.length; i += 1) {
      const gap = positions[i] - positions[i - 1];
      if (gap > 1) pitches.push(gap);
    }
  });

  return {
    basis,
    seatWidthPx: median(layout.seats.map((seat) => seat.width * layout.imageWidth)) || 24,
    seatDepthPx: median(layout.seats.map((seat) => seat.depth * layout.imageHeight)) || 24,
    seatSpanXPx: horizontal.length ? Math.max(...horizontal) - Math.min(...horizontal) : 0,
    seatSpanZPx: depths.length ? Math.max(...depths) - Math.min(...depths) : 0,
    firstRowDepthPx: depths.length ? Math.min(...depths) : 0,
    lastRowDepthPx: depths.length ? Math.max(...depths) : 0,
    rowSpacingPx: median(rowGaps),
    horizontalPitchPx: median(pitches),
    screenWidthPx: basis.lengthPx,
    rowDepthsPx: rowDepths,
    horizontalPositionsPx: horizontal,
  };
}

export function calibrateLayout(layout: SeatingLayout, config: AuditoriumConfig): Calibration {
  const metrics = measureLayout(layout);
  const warnings: string[] = [];
  let screenWidthPx = metrics.screenWidthPx;
  if (!Number.isFinite(screenWidthPx) || screenWidthPx < 8) {
    screenWidthPx = Math.max(40, metrics.seatSpanXPx + metrics.seatWidthPx * 2);
    warnings.push(
      'The screen line was too short to calibrate reliably. A screen-width assumption was used.',
    );
  }
  const metresPerPixel = config.screen.widthM / screenWidthPx;
  if (!Number.isFinite(metresPerPixel) || metresPerPixel <= 0) {
    warnings.push('Screen calibration is invalid. Check the screen width and placement.');
  }

  const derivedSeatWidth = metrics.seatWidthPx * metresPerPixel;
  if (derivedSeatWidth < 0.3 || derivedSeatWidth > 1.05) {
    warnings.push(
      `The screen calibration implies a ${derivedSeatWidth.toFixed(2)} m seat width. The source plan may not be drawn to scale; adjust the screen width or seating measurements.`,
    );
  }

  return {
    metresPerPixel,
    screenWidthPx,
    screenWidthM: config.screen.widthM,
    screenLineLengthNorm: metrics.basis.lengthNorm,
    source: config.sources['screen.widthM'] ?? 'default',
    screenCenter: metrics.basis.center,
    screenTangent: metrics.basis.tangent,
    screenNormal: metrics.basis.normal,
    warnings,
  };
}

export interface EstimateResult {
  config: AuditoriumConfig;
  metrics: LayoutMetrics;
  calibration: Calibration;
  assumptions: string[];
}

function sourceFor(
  config: AuditoriumConfig,
  field: ConfigFieldKey,
): MeasurementSource {
  return config.sources[field] ?? 'default';
}

function setEstimated(
  config: AuditoriumConfig,
  field: ConfigFieldKey,
  value: number,
  options: { allowDefault?: boolean; min?: number; max?: number } = {},
) {
  const current = sourceFor(config, field);
  if (current === 'user') return;
  if (current === 'default' && options.allowDefault === false) return;
  const safe = clamp(
    Number.isFinite(value) ? value : 0,
    options.min ?? Number.NEGATIVE_INFINITY,
    options.max ?? Number.POSITIVE_INFINITY,
  );
  const [group, key] = field.split('.');
  if (key) {
    const target = (config as unknown as Record<string, Record<string, number>>)[group];
    if (target) target[key] = round(safe);
  } else {
    (config as unknown as Record<string, number>)[group] = round(safe);
  }
  config.sources[field] = 'estimated';
}

function round(value: number): number {
  return Math.round(value * 1000) / 1000;
}

/**
 * Fills unknown dimensions from the detected geometry while preserving every
 * value the user has explicitly entered.
 */
export function applyEstimates(
  layout: SeatingLayout,
  input: AuditoriumConfig,
): EstimateResult {
  const config: AuditoriumConfig = structuredClone(input);
  const assumptions: string[] = [];
  const metrics = measureLayout(layout);
  const calibration = calibrateLayout(layout, config);
  const mpp = calibration.metresPerPixel;

  const seatWidth = metrics.seatWidthPx * mpp;
  const seatDepth = metrics.seatDepthPx * mpp;
  const rowSpacing = metrics.rowSpacingPx * mpp;
  const pitch = metrics.horizontalPitchPx * mpp;
  const firstRowDepth = metrics.firstRowDepthPx * mpp;
  const depthSpan = metrics.seatSpanZPx * mpp;

  const effectiveSeatWidth =
    sourceFor(config, 'seatWidthM') === 'user'
      ? config.seatWidthM
      : clamp(seatWidth || 0.56, 0.45, 0.8);

  setEstimated(config, 'seatWidthM', effectiveSeatWidth, { min: 0.4, max: 0.9 });
  setEstimated(config, 'seatDepthM', seatDepth || 0.64, { min: 0.45, max: 0.9 });
  setEstimated(config, 'rowSpacingM', rowSpacing || 1.05, { min: 0.78, max: 1.6 });
  setEstimated(
    config,
    'seating.seatGapM',
    Math.max(0.04, pitch - effectiveSeatWidth) || 0.12,
    { min: 0.02, max: 0.5 },
  );
  setEstimated(
    config,
    'frontClearanceM',
    Math.max(2.5, Math.min(9, firstRowDepth || 4)),
    { min: 2, max: 12 },
  );

  if (sourceFor(config, 'screen.widthM') !== 'user') {
    config.sources['screen.widthM'] = 'estimated';
    assumptions.push(
      'Screen width was not provided. 12 m is used as an editable calibration assumption.',
    );
  }

  const aspect = aspectValue(config.screen.aspectRatio, config.screen.customAspect);
  if (sourceFor(config, 'screen.heightM') !== 'user') {
    config.screen.heightM = round(config.screen.widthM / Math.max(1, aspect));
    config.sources['screen.heightM'] = 'estimated';
  }

  setEstimated(
    config,
    'screen.elevationM',
    Math.max(0.6, Math.min(1.8, config.screen.heightM * 0.12 + 0.45)),
    { min: 0.3, max: 2.5 },
  );
  setEstimated(
    config,
    'widthM',
    metrics.seatSpanXPx * mpp + effectiveSeatWidth + config.sideClearanceM * 2,
    { min: 5, max: 60 },
  );
  setEstimated(
    config,
    'lengthM',
    config.frontClearanceM + depthSpan + effectiveSeatWidth + config.rearClearanceM,
    { min: 7, max: 80 },
  );
  setEstimated(
    config,
    'ceilingHeightM',
    Math.max(
      5,
      config.screen.elevationM + config.screen.heightM + 1.25,
      config.frontClearanceM * 0.35 + 4,
    ),
    { min: 4, max: 24 },
  );

  const derivedSeatWidth = metrics.seatWidthPx * mpp;
  if (derivedSeatWidth < 0.3 || derivedSeatWidth > 1.05) {
    assumptions.push(
      'Detected seat proportions and screen calibration disagree. Relative seat positions are preserved, but absolute scale needs review.',
    );
  }
  if (metrics.rowSpacingPx <= 0) {
    assumptions.push('Row spacing could not be measured; a standard 1.05 m spacing is used.');
  }
  if (layout.screen.source !== 'detected') {
    assumptions.push(
      'The screen position was inferred from the seating field rather than read directly from the screenshot.',
    );
  }
  if (config.sources['floor.slopePercent'] !== 'user') {
    assumptions.push(
      `Floor slope is a ${config.floor.slopePercent}% construction assumption, not a measurement.`,
    );
  }

  return { config, metrics, calibration, assumptions };
}

export function getConfigSource(
  config: AuditoriumConfig,
  field: ConfigFieldKey,
): MeasurementSource {
  return config.sources[field] ?? 'default';
}
