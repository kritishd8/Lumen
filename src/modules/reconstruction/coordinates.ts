import type { Point2, ScreenPlacement, Seat } from '@/types';

export const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));

export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

export const normalisePoint = (
  x: number,
  y: number,
  width: number,
  height: number,
): Point2 => ({
  x: width > 0 ? clamp(x / width, -1, 2) : 0,
  y: height > 0 ? clamp(y / height, -1, 2) : 0,
});

export const denormalisePoint = (
  point: Point2,
  width: number,
  height: number,
): Point2 => ({
  x: point.x * width,
  y: point.y * height,
});

export const distance2 = (a: Point2, b: Point2): number =>
  Math.hypot(a.x - b.x, a.y - b.y);

export const median = (values: number[]): number => {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[middle - 1] + sorted[middle]) / 2
    : sorted[middle];
};

export const mean = (values: number[]): number =>
  values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;

export const percentile = (values: number[], fraction: number): number => {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = clamp(fraction, 0, 1) * (sorted.length - 1);
  const low = Math.floor(index);
  const high = Math.ceil(index);
  return lerp(sorted[low], sorted[high], index - low);
};

export interface ScreenBasis {
  center: Point2;
  tangent: Point2;
  normal: Point2;
  lengthNorm: number;
  lengthPx: number;
  orientationDeg: number;
}

/**
 * Builds a coordinate basis from the detected screen line. The normal always
 * points from the screen into the seating area, so the reconstruction can
 * never be mirrored because of endpoint ordering.
 */
export function screenBasis(
  screen: ScreenPlacement,
  imageWidth: number,
  imageHeight: number,
  seats: Pick<Seat, 'x' | 'y'>[],
): ScreenBasis {
  const ax = screen.x1 * imageWidth;
  const ay = screen.y1 * imageHeight;
  const bx = screen.x2 * imageWidth;
  const by = screen.y2 * imageHeight;
  let dx = bx - ax;
  let dy = by - ay;
  let lengthPx = Math.hypot(dx, dy);
  let lengthNorm = Math.hypot(screen.x2 - screen.x1, screen.y2 - screen.y1);

  if (lengthPx < 2) {
    // Degenerate line: infer a horizontal line above the seats.
    const minX = seats.length ? Math.min(...seats.map((seat) => seat.x)) : 0.15;
    const maxX = seats.length ? Math.max(...seats.map((seat) => seat.x)) : 0.85;
    const minY = seats.length ? Math.min(...seats.map((seat) => seat.y)) : 0.2;
    dx = (maxX - minX + 0.1) * imageWidth;
    dy = 0;
    lengthPx = Math.max(2, Math.abs(dx));
    lengthNorm = Math.max(0.05, Math.abs(maxX - minX + 0.1));
    screen.x1 = minX - 0.05;
    screen.x2 = maxX + 0.05;
    screen.y1 = screen.y2 = Math.max(0.01, minY - 0.08);
  }

  const tangent = { x: dx / lengthPx, y: dy / lengthPx };
  let normal = { x: -tangent.y, y: tangent.x };
  const center = {
    x: (screen.x1 + screen.x2) / 2,
    y: (screen.y1 + screen.y2) / 2,
  };
  const meanSeat = {
    x: mean(seats.map((seat) => seat.x)),
    y: mean(seats.map((seat) => seat.y)),
  };
  const towardsSeats = {
    x: (meanSeat.x - center.x) * imageWidth,
    y: (meanSeat.y - center.y) * imageHeight,
  };
  if (normal.x * towardsSeats.x + normal.y * towardsSeats.y < 0) {
    normal = { x: -normal.x, y: -normal.y };
  }

  return {
    center,
    tangent,
    normal,
    lengthNorm,
    lengthPx,
    orientationDeg: (Math.atan2(dy, dx) * 180) / Math.PI,
  };
}

/** Projects a normalised point onto screen-tangent / screen-normal axes. */
export function projectToScreenAxes(
  point: Point2,
  basis: Pick<ScreenBasis, 'center' | 'tangent' | 'normal'>,
  imageWidth: number,
  imageHeight: number,
): { horizontalPx: number; depthPx: number } {
  const px = (point.x - basis.center.x) * imageWidth;
  const py = (point.y - basis.center.y) * imageHeight;
  return {
    horizontalPx: px * basis.tangent.x + py * basis.tangent.y,
    depthPx: px * basis.normal.x + py * basis.normal.y,
  };
}

export function rotatePoint(point: Point2, radians: number): Point2 {
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  return {
    x: point.x * cos - point.y * sin,
    y: point.x * sin + point.y * cos,
  };
}

export function makeSeatId(prefix: string, existing: Set<string>): string {
  let index = 1;
  while (existing.has(`${prefix}-${index}`)) index += 1;
  return `${prefix}-${index}`;
}

export function rowLabelForIndex(index: number): string {
  let value = index;
  let label = '';
  do {
    label = String.fromCharCode(65 + (value % 26)) + label;
    value = Math.floor(value / 26) - 1;
  } while (value >= 0);
  return label;
}
