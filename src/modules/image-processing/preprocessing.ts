export interface ImageDataLike {
  data: Uint8ClampedArray | Uint8Array;
  width: number;
  height: number;
}

export interface Rgb {
  r: number;
  g: number;
  b: number;
}

export interface RawComponent {
  x: number;
  y: number;
  w: number;
  h: number;
  area: number;
  cx: number;
  cy: number;
  fill: number;
  color: Rgb;
  saturation: number;
  luminance: number;
}

export interface SeatCandidate {
  x: number;
  y: number;
  w: number;
  h: number;
  cx: number;
  cy: number;
  area: number;
  fill: number;
  color: Rgb;
  saturation: number;
  luminance: number;
  support: number;
  score: number;
  maskName: string;
}

export interface CandidateSet {
  candidates: SeatCandidate[];
  quality: number;
  maskName: string;
}

export function rgbToHex({ r, g, b }: Rgb): string {
  const toHex = (value: number) =>
    Math.max(0, Math.min(255, Math.round(value))).toString(16).padStart(2, '0');
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

export function colorDistance(a: Rgb, b: Rgb): number {
  return Math.hypot(a.r - b.r, a.g - b.g, a.b - b.b);
}

export function saturationOf({ r, g, b }: Rgb): number {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  return max === 0 ? 0 : (max - min) / max;
}

export function luminanceOf({ r, g, b }: Rgb): number {
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
}

export function median(values: number[]): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/**
 * Estimates the dominant background colour from the image border. Booking
 * screenshots generally have a consistent page or panel colour at the edges.
 */
export function findBackgroundColor(image: ImageDataLike): Rgb {
  const { data, width, height } = image;
  const buckets = new Map<number, { count: number; r: number; g: number; b: number }>();
  const band = Math.max(2, Math.round(Math.min(width, height) * 0.018));
  const step = Math.max(1, Math.round(Math.min(width, height) / 420));

  const addSample = (x: number, y: number) => {
    const index = (y * width + x) * 4;
    const r = data[index];
    const g = data[index + 1];
    const b = data[index + 2];
    const alpha = data[index + 3];
    if (alpha < 20) return;
    const key = ((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4);
    const bucket = buckets.get(key) ?? { count: 0, r: 0, g: 0, b: 0 };
    bucket.count += 1;
    bucket.r += r;
    bucket.g += g;
    bucket.b += b;
    buckets.set(key, bucket);
  };

  for (let y = 0; y < height; y += step) {
    for (let x = 0; x < band; x += 1) {
      addSample(x, y);
      addSample(width - 1 - x, y);
    }
  }
  for (let x = 0; x < width; x += step) {
    for (let y = 0; y < band; y += 1) {
      addSample(x, y);
      addSample(x, height - 1 - y);
    }
  }

  let best = { count: 0, r: 255, g: 255, b: 255 };
  buckets.forEach((bucket) => {
    if (bucket.count > best.count) best = bucket;
  });
  if (!best.count) return { r: 255, g: 255, b: 255 };
  return {
    r: best.r / best.count,
    g: best.g / best.count,
    b: best.b / best.count,
  };
}

export function makeColorMask(
  image: ImageDataLike,
  background: Rgb,
  threshold: number,
): Uint8Array {
  const { data, width, height } = image;
  const mask = new Uint8Array(width * height);
  for (let i = 0, p = 0; i < data.length; i += 4, p += 1) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const distance = Math.hypot(r - background.r, g - background.g, b - background.b);
    if (distance > threshold) mask[p] = 255;
  }
  return mask;
}

export function otsuThreshold(image: ImageDataLike): number {
  const { data, width, height } = image;
  const histogram = new Array<number>(256).fill(0);
  const step = Math.max(1, Math.floor((width * height) / 350000));
  for (let p = 0; p < width * height; p += step) {
    const i = p * 4;
    const gray = Math.round(
      0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2],
    );
    histogram[gray] += 1;
  }
  const total = histogram.reduce((sum, value) => sum + value, 0);
  let sum = 0;
  for (let i = 0; i < 256; i += 1) sum += i * histogram[i];
  let sumB = 0;
  let wB = 0;
  let bestVariance = 0;
  let threshold = 128;
  for (let t = 0; t < 256; t += 1) {
    wB += histogram[t];
    if (!wB) continue;
    const wF = total - wB;
    if (!wF) break;
    sumB += t * histogram[t];
    const mB = sumB / wB;
    const mF = (sum - sumB) / wF;
    const between = wB * wF * (mB - mF) * (mB - mF);
    if (between > bestVariance) {
      bestVariance = between;
      threshold = t;
    }
  }
  return threshold;
}

export function makeOtsuMask(image: ImageDataLike): Uint8Array {
  const { data, width, height } = image;
  const threshold = otsuThreshold(image);
  const background = findBackgroundColor(image);
  const backgroundIsLight = luminanceOf(background) > 0.55;
  const mask = new Uint8Array(width * height);
  for (let p = 0, i = 0; p < width * height; p += 1, i += 4) {
    const gray = 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2];
    if ((backgroundIsLight && gray < threshold) || (!backgroundIsLight && gray > threshold)) {
      mask[p] = 255;
    }
  }
  return mask;
}

export function makeSaturationMask(image: ImageDataLike, threshold = 36): Uint8Array {
  const { data, width, height } = image;
  const mask = new Uint8Array(width * height);
  for (let p = 0, i = 0; p < width * height; p += 1, i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    if (max > 28 && max - min > threshold) mask[p] = 255;
  }
  return mask;
}

/**
 * 4-connected component extraction. Kept dependency-free so image analysis
 * still works when OpenCV.js is unavailable.
 */
export function connectedComponents(
  mask: Uint8Array,
  image: ImageDataLike,
  minArea = 12,
): RawComponent[] {
  const { width, height, data } = image;
  const visited = new Uint8Array(width * height);
  const stack = new Int32Array(width * height);
  const components: RawComponent[] = [];

  for (let start = 0; start < mask.length; start += 1) {
    if (!mask[start] || visited[start]) continue;
    let stackSize = 0;
    stack[stackSize++] = start;
    visited[start] = 1;
    let area = 0;
    let minX = width;
    let minY = height;
    let maxX = 0;
    let maxY = 0;
    let sumR = 0;
    let sumG = 0;
    let sumB = 0;

    while (stackSize > 0) {
      const index = stack[--stackSize];
      const x = index % width;
      const y = (index - x) / width;
      area += 1;
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
      const pixel = index * 4;
      sumR += data[pixel];
      sumG += data[pixel + 1];
      sumB += data[pixel + 2];

      if (x > 0) {
        const next = index - 1;
        if (mask[next] && !visited[next]) {
          visited[next] = 1;
          stack[stackSize++] = next;
        }
      }
      if (x < width - 1) {
        const next = index + 1;
        if (mask[next] && !visited[next]) {
          visited[next] = 1;
          stack[stackSize++] = next;
        }
      }
      if (y > 0) {
        const next = index - width;
        if (mask[next] && !visited[next]) {
          visited[next] = 1;
          stack[stackSize++] = next;
        }
      }
      if (y < height - 1) {
        const next = index + width;
        if (mask[next] && !visited[next]) {
          visited[next] = 1;
          stack[stackSize++] = next;
        }
      }
    }

    if (area < minArea) continue;
    const w = maxX - minX + 1;
    const h = maxY - minY + 1;
    const color = { r: sumR / area, g: sumG / area, b: sumB / area };
    components.push({
      x: minX,
      y: minY,
      w,
      h,
      area,
      cx: minX + w / 2,
      cy: minY + h / 2,
      fill: area / Math.max(1, w * h),
      color,
      saturation: saturationOf(color),
      luminance: luminanceOf(color),
    });
  }
  return components;
}

export function isPlausibleSeatComponent(
  component: RawComponent,
  imageWidth: number,
  imageHeight: number,
): boolean {
  const { w, h, area, fill } = component;
  if (w < 7 || h < 7) return false;
  if (w > imageWidth * 0.16 || h > imageHeight * 0.14) return false;
  if (area < 26) return false;
  if (area > imageWidth * imageHeight * 0.015) return false;
  const aspect = w / h;
  if (aspect < 0.34 || aspect > 2.9) return false;
  if (fill < 0.1) return false;
  return true;
}

function sizeSimilar(a: RawComponent, b: RawComponent, tolerance = 0.24): boolean {
  const widthDelta = Math.abs(a.w - b.w) / Math.max(a.w, b.w);
  const heightDelta = Math.abs(a.h - b.h) / Math.max(a.h, b.h);
  return widthDelta <= tolerance && heightDelta <= tolerance;
}

function sizeSimilarCandidate(a: SeatCandidate, b: SeatCandidate, tolerance = 0.28): boolean {
  const widthDelta = Math.abs(a.w - b.w) / Math.max(a.w, b.w);
  const heightDelta = Math.abs(a.h - b.h) / Math.max(a.h, b.h);
  return widthDelta <= tolerance && heightDelta <= tolerance;
}

export function scoreCandidates(
  components: RawComponent[],
  maskName: string,
  imageWidth: number,
  imageHeight: number,
): CandidateSet {
  const plausible = components.filter((component) =>
    isPlausibleSeatComponent(component, imageWidth, imageHeight),
  );
  if (!plausible.length) {
    return { candidates: [], quality: 0, maskName };
  }

  const scored = plausible.map((component) => {
    const sameSize = plausible.filter(
      (other) => other !== component && sizeSimilar(component, other, 0.2),
    );
    const rowPeers = sameSize.filter((other) => {
      const dy = Math.abs(other.cy - component.cy);
      const dx = Math.abs(other.cx - component.cx);
      return dy <= Math.max(2.5, component.h * 0.62) && dx >= component.w * 0.65 && dx <= component.w * 5.5;
    });
    const columnPeers = sameSize.filter((other) => {
      const dx = Math.abs(other.cx - component.cx);
      const dy = Math.abs(other.cy - component.cy);
      return dx <= Math.max(2.5, component.w * 0.62) && dy >= component.h * 0.65 && dy <= component.h * 6;
    });
    const aspect = component.w / component.h;
    const shapeScore = Math.max(0, 1 - Math.abs(aspect - 1) * 0.5);
    const fillScore = component.fill > 0.45 && component.fill < 0.98 ? 1 : 0.55;
    const support = Math.min(
      1,
      Math.min(1, sameSize.length / 9) * 0.25 +
        Math.min(1, rowPeers.length / 3) * 0.36 +
        Math.min(1, columnPeers.length / 2) * 0.3 +
        shapeScore * fillScore * 0.09,
    );
    const score = support * 0.76 + Math.min(1, component.area / 700) * 0.14 + shapeScore * 0.1;
    return {
      ...component,
      support,
      score,
      maskName,
    } satisfies SeatCandidate;
  });

  scored.sort((a, b) => b.support - a.support);
  const pool = scored.filter((candidate) => candidate.support > 0.12);
  const anchorPool = pool.length ? pool : scored;
  const topCount = Math.max(4, Math.ceil(anchorPool.length * 0.45));
  const top = anchorPool.slice(0, topCount);
  const dominantW = median(top.map((candidate) => candidate.w));
  const dominantH = median(top.map((candidate) => candidate.h));

  let candidates = scored.filter((candidate) => {
    const widthDelta = Math.abs(candidate.w - dominantW) / Math.max(1, dominantW);
    const heightDelta = Math.abs(candidate.h - dominantH) / Math.max(1, dominantH);
    return widthDelta < 0.4 && heightDelta < 0.4 && candidate.support > 0.06;
  });

  if (candidates.length > 2) {
    const medianArea = median(candidates.map((candidate) => candidate.area));
    candidates = candidates.filter(
      (candidate) =>
        candidate.area > medianArea * 0.22 && candidate.area < medianArea * 4.5,
    );
  }

  // Remove near-duplicates and keep the strongest member.
  candidates.sort((a, b) => b.score - a.score);
  const deduped: SeatCandidate[] = [];
  candidates.forEach((candidate) => {
    const duplicate = deduped.some((existing) => {
      const distance = Math.hypot(existing.cx - candidate.cx, existing.cy - candidate.cy);
      return distance < Math.min(existing.w, existing.h) * 0.55;
    });
    if (!duplicate) deduped.push(candidate);
  });

  if (deduped.length > 8) {
    const widths = deduped.map((candidate) => candidate.w);
    const heights = deduped.map((candidate) => candidate.h);
    const madW = median(widths.map((value) => Math.abs(value - median(widths))));
    const madH = median(heights.map((value) => Math.abs(value - median(heights))));
    const widthLimit = Math.max(3, madW * 3.5);
    const heightLimit = Math.max(3, madH * 3.5);
    const filtered = deduped.filter(
      (candidate) =>
        Math.abs(candidate.w - median(widths)) <= widthLimit &&
        Math.abs(candidate.h - median(heights)) <= heightLimit,
    );
    if (filtered.length >= Math.min(6, deduped.length * 0.6)) {
      candidates = filtered;
    } else {
      candidates = deduped;
    }
  } else {
    candidates = deduped;
  }

  const rowClusters = clusterCentres(
    candidates.map((candidate) => candidate.cy),
    Math.max(4, median(candidates.map((candidate) => candidate.h)) * 0.75),
  );
  const columnClusters = clusterCentres(
    candidates.map((candidate) => candidate.cx),
    Math.max(4, median(candidates.map((candidate) => candidate.w)) * 0.75),
  );
  const avgSupport = candidates.length
    ? candidates.reduce((sum, candidate) => sum + candidate.support, 0) / candidates.length
    : 0;
  const rowBonus = Math.min(1, rowClusters / Math.max(2, candidates.length / 8));
  const columnBonus = Math.min(1, columnClusters / Math.max(2, candidates.length / 8));
  const quality =
    candidates.length *
    (0.35 + avgSupport) *
    (0.55 + rowBonus * 0.25 + columnBonus * 0.2);

  return { candidates, quality, maskName };
}

export function clusterCentres(values: number[], tolerance: number): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  let count = 1;
  let clusterStart = sorted[0];
  let clusterItems = 1;
  for (let i = 1; i < sorted.length; i += 1) {
    if (sorted[i] - sorted[i - 1] <= tolerance) {
      clusterItems += 1;
    } else {
      clusterStart = sorted[i];
      clusterItems = 1;
      count += 1;
    }
  }
  return count;
}

export function candidateToSeatData(candidate: SeatCandidate, imageWidth: number, imageHeight: number) {
  return {
    x: candidate.cx / imageWidth,
    y: candidate.cy / imageHeight,
    width: candidate.w / imageWidth,
    depth: candidate.h / imageHeight,
    confidence: Math.min(0.98, 0.5 + candidate.support * 0.48),
  };
}
