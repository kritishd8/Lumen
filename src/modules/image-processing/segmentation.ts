import type {
  Aisle,
  ColorCluster,
  Seat,
  SeatRow,
  SeatSection,
  SeatStatus,
  SeatType,
} from '@/types';
import { SECTION_COLORS } from '@/utils/defaults';
import type { ScreenBasis } from '@/modules/reconstruction/coordinates';
import { projectToScreenAxes, rowLabelForIndex } from '@/modules/reconstruction/coordinates';
import type { SeatCandidate } from './preprocessing';
import { median, rgbToHex } from './preprocessing';

export interface CandidateAssignment {
  candidateIndex: number;
  rowIndex: number;
  rowLabel: string;
  depth: number;
  horizontal: number;
  rowConfidence: number;
}

export interface GroupedRows {
  assignments: CandidateAssignment[];
  rowCount: number;
  rowDepths: number[];
}

class UnionFind {
  private parent: number[];
  private rank: number[];

  constructor(size: number) {
    this.parent = Array.from({ length: size }, (_, index) => index);
    this.rank = new Array(size).fill(0);
  }

  find(value: number): number {
    if (this.parent[value] !== value) {
      this.parent[value] = this.find(this.parent[value]);
    }
    return this.parent[value];
  }

  union(a: number, b: number) {
    const rootA = this.find(a);
    const rootB = this.find(b);
    if (rootA === rootB) return;
    if (this.rank[rootA] < this.rank[rootB]) {
      this.parent[rootA] = rootB;
    } else if (this.rank[rootA] > this.rank[rootB]) {
      this.parent[rootB] = rootA;
    } else {
      this.parent[rootB] = rootA;
      this.rank[rootA] += 1;
    }
  }
}

export function groupCandidatesIntoRows(
  candidates: SeatCandidate[],
  basis: ScreenBasis,
  imageWidth: number,
  imageHeight: number,
): GroupedRows {
  if (!candidates.length) return { assignments: [], rowCount: 0, rowDepths: [] };
  const projections = candidates.map((candidate) =>
    projectToScreenAxes(
      { x: candidate.cx / imageWidth, y: candidate.cy / imageHeight },
      basis,
      imageWidth,
      imageHeight,
    ),
  );
  const medianW = median(candidates.map((candidate) => candidate.w));
  const medianH = median(candidates.map((candidate) => candidate.h));
  const depthTolerance = Math.max(4, medianH * 0.82);
  const horizontalReach = Math.max(10, medianW * 3.1);
  const uf = new UnionFind(candidates.length);

  for (let i = 0; i < candidates.length; i += 1) {
    for (let j = i + 1; j < candidates.length; j += 1) {
      const a = projections[i];
      const b = projections[j];
      const depthDelta = Math.abs(a.depthPx - b.depthPx);
      const horizontalDelta = Math.abs(a.horizontalPx - b.horizontalPx);
      if (depthDelta <= depthTolerance && horizontalDelta <= horizontalReach) {
        uf.union(i, j);
      }
    }
  }

  const groups = new Map<number, number[]>();
  for (let i = 0; i < candidates.length; i += 1) {
    const root = uf.find(i);
    const group = groups.get(root) ?? [];
    group.push(i);
    groups.set(root, group);
  }

  let groupList = [...groups.values()].map((indices) => {
    const depths = indices.map((index) => projections[index].depthPx);
    const horizontal = indices.map((index) => projections[index].horizontalPx);
    return {
      indices,
      depth: median(depths),
      minDepth: Math.min(...depths),
      maxDepth: Math.max(...depths),
      minHorizontal: Math.min(...horizontal),
      maxHorizontal: Math.max(...horizontal),
    };
  });

  // Tiny fragments are usually one missed seat or a seat at the end of a
  // curved row. Merge only when their depth and horizontal range align.
  const mainGroups = groupList.filter((group) => group.indices.length >= 3);
  if (mainGroups.length) {
    const merged: typeof groupList = [];
    groupList.forEach((group) => {
      if (group.indices.length >= 3) {
        merged.push(group);
        return;
      }
      const nearest = mainGroups
        .map((main) => ({
          main,
          depthGap: Math.abs(main.depth - group.depth),
          horizontalOverlap:
            Math.min(main.maxHorizontal, group.maxHorizontal) -
            Math.max(main.minHorizontal, group.minHorizontal),
        }))
        .filter(
          (entry) =>
            entry.depthGap <= Math.max(depthTolerance * 1.8, medianH * 1.25) &&
            entry.horizontalOverlap >= -medianW * 3,
        )
        .sort((a, b) => a.depthGap - b.depthGap)[0];
      if (nearest) {
        nearest.main.indices.push(...group.indices);
        nearest.main.depth = median(
          nearest.main.indices.map((index) => projections[index].depthPx),
        );
      } else {
        merged.push(group);
      }
    });
    groupList = merged;
  }

  groupList.sort((a, b) => a.depth - b.depth);
  const assignments: CandidateAssignment[] = [];
  const rowDepths: number[] = [];
  groupList.forEach((group, rowIndex) => {
    const rowLabel = rowLabelForIndex(rowIndex);
    rowDepths.push(group.depth);
    group.indices.forEach((candidateIndex) => {
      const depth = projections[candidateIndex].depthPx;
      const deviation = Math.abs(depth - group.depth);
      const rowConfidence = Math.max(0.35, 1 - deviation / Math.max(1, medianH * 1.5));
      assignments.push({
        candidateIndex,
        rowIndex,
        rowLabel,
        depth,
        horizontal: projections[candidateIndex].horizontalPx,
        rowConfidence,
      });
    });
  });

  return { assignments, rowCount: groupList.length, rowDepths };
}

export function axesToNormalised(
  horizontalPx: number,
  depthPx: number,
  basis: ScreenBasis,
  imageWidth: number,
  imageHeight: number,
) {
  const px = horizontalPx * basis.tangent.x + depthPx * basis.normal.x;
  const py = horizontalPx * basis.tangent.y + depthPx * basis.normal.y;
  return {
    x: basis.center.x + px / imageWidth,
    y: basis.center.y + py / imageHeight,
  };
}

export interface AisleAndSectionResult {
  aisles: Aisle[];
  sections: SeatSection[];
  seatSectionIds: Map<number, string>;
}

export function detectAislesAndSections(
  candidates: SeatCandidate[],
  rows: GroupedRows,
  basis: ScreenBasis,
  imageWidth: number,
  imageHeight: number,
): AisleAndSectionResult {
  const byRow = new Map<number, CandidateAssignment[]>();
  rows.assignments.forEach((assignment) => {
    const row = byRow.get(assignment.rowIndex) ?? [];
    row.push(assignment);
    byRow.set(assignment.rowIndex, row);
  });

  const pitches: number[] = [];
  byRow.forEach((assignments) => {
    const sorted = [...assignments].sort((a, b) => a.horizontal - b.horizontal);
    for (let i = 1; i < sorted.length; i += 1) {
      const gap = sorted[i].horizontal - sorted[i - 1].horizontal;
      if (gap > 1) pitches.push(gap);
    }
  });
  const medianW = median(candidates.map((candidate) => candidate.w));
  const medianPitch = median(pitches);
  const gapThreshold = Math.max(medianW * 1.7, medianPitch * 1.95);
  const segments: { h: number; depth: number; width: number }[] = [];

  byRow.forEach((assignments) => {
    const sorted = [...assignments].sort((a, b) => a.horizontal - b.horizontal);
    for (let i = 1; i < sorted.length; i += 1) {
      const gap = sorted[i].horizontal - sorted[i - 1].horizontal;
      if (gap > gapThreshold) {
        segments.push({
          h: (sorted[i].horizontal + sorted[i - 1].horizontal) / 2,
          depth: (sorted[i].depth + sorted[i - 1].depth) / 2,
          width: gap,
        });
      }
    }
  });

  // Merge aisle segments that line up across rows.
  const clusters: { h: number; depths: number[]; widths: number[] }[] = [];
  const tolerance = Math.max(medianW * 1.25, 8);
  segments
    .sort((a, b) => a.h - b.h)
    .forEach((segment) => {
      const cluster = clusters.find(
        (entry) => Math.abs(entry.h / entry.depths.length - segment.h) <= tolerance,
      );
      if (cluster) {
        cluster.depths.push(segment.depth);
        cluster.widths.push(segment.width);
        cluster.h += segment.h;
      } else {
        clusters.push({
          h: segment.h,
          depths: [segment.depth],
          widths: [segment.width],
        });
      }
    });

  const aislePositions = clusters
    .filter((cluster) => cluster.depths.length >= 1)
    .map((cluster) => ({
      h: cluster.h / cluster.depths.length,
      depth: median(cluster.depths),
      width: median(cluster.widths),
    }))
    .sort((a, b) => a.h - b.h);

  const aisles: Aisle[] = aislePositions.map((aisle, index) => {
    const point = axesToNormalised(
      aisle.h,
      aisle.depth,
      basis,
      imageWidth,
      imageHeight,
    );
    return {
      id: `aisle-${index + 1}`,
      x: point.x,
      y: point.y,
      width: aisle.width / imageWidth,
      orientation: 'vertical',
      source: 'detected',
    };
  });

  // Large gaps between row depths can indicate cross-aisles.
  const rowDepths = [...byRow.keys()]
    .map((rowIndex) => {
      const assignments = byRow.get(rowIndex) ?? [];
      return assignments.length
        ? median(assignments.map((assignment) => assignment.depth))
        : 0;
    })
    .sort((a, b) => a - b);
  const rowGaps: number[] = [];
  for (let i = 1; i < rowDepths.length; i += 1) {
    rowGaps.push(rowDepths[i] - rowDepths[i - 1]);
  }
  const medianRowGap = median(rowGaps);
  if (medianRowGap > 0) {
    for (let i = 1; i < rowDepths.length; i += 1) {
      if (rowDepths[i] - rowDepths[i - 1] > medianRowGap * 1.75) {
        const hValues = byRow.get(i)?.map((assignment) => assignment.horizontal) ?? [];
        const h = hValues.length ? median(hValues) : 0;
        const point = axesToNormalised(
          h,
          (rowDepths[i] + rowDepths[i - 1]) / 2,
          basis,
          imageWidth,
          imageHeight,
        );
        aisles.push({
          id: `aisle-${aisles.length + 1}`,
          x: point.x,
          y: point.y,
          width: Math.max(medianW, rowDepths[i] - rowDepths[i - 1] - medianRowGap) / imageHeight,
          orientation: 'horizontal',
          source: 'detected',
        });
      }
    }
  }

  const sectionCount = aislePositions.length + 1;
  const sections: SeatSection[] = Array.from({ length: sectionCount }, (_, index) => {
    let name = `Section ${index + 1}`;
    if (sectionCount === 2) name = index === 0 ? 'Left' : 'Right';
    if (sectionCount === 3) name = ['Left', 'Centre', 'Right'][index];
    return {
      id: `section-${index + 1}`,
      name,
      seatIds: [],
      color: SECTION_COLORS[index % SECTION_COLORS.length],
    };
  });

  const seatSectionIds = new Map<number, string>();
  rows.assignments.forEach((assignment) => {
    const sectionIndex = aislePositions.filter(
      (aisle) => assignment.horizontal > aisle.h,
    ).length;
    seatSectionIds.set(
      assignment.candidateIndex,
      sections[Math.min(sectionIndex, sections.length - 1)].id,
    );
  });

  return { aisles, sections, seatSectionIds };
}

interface ColorClusterInternal {
  center: { r: number; g: number; b: number };
  indices: number[];
}

export interface ColorClassification {
  clusters: ColorCluster[];
  seatStatuses: Map<number, { status: SeatStatus; confidence: number }>;
}

export function classifyCandidateColors(candidates: SeatCandidate[]): ColorClassification {
  if (!candidates.length) {
    return { clusters: [], seatStatuses: new Map() };
  }
  const colors = candidates.map((candidate) => candidate.color);
  let k = colors.length >= 18 ? 3 : colors.length >= 8 ? 2 : 1;
  const sorted = colors
    .map((color, index) => ({ color, index, lum: 0.2126 * color.r + 0.7152 * color.g + 0.0722 * color.b }))
    .sort((a, b) => a.lum - b.lum);
  let centers: { r: number; g: number; b: number }[] = [];
  for (let i = 0; i < k; i += 1) {
    const index = Math.min(
      sorted.length - 1,
      Math.round(((i + 0.5) / k) * (sorted.length - 1)),
    );
    centers.push({ ...sorted[index].color });
  }

  let clusters: ColorClusterInternal[] = [];
  for (let iteration = 0; iteration < 10; iteration += 1) {
    clusters = centers.map((center) => ({ center: { ...center }, indices: [] }));
    colors.forEach((color, index) => {
      let best = 0;
      let bestDistance = Number.POSITIVE_INFINITY;
      clusters.forEach((cluster, clusterIndex) => {
        const distance = Math.hypot(
          color.r - cluster.center.r,
          color.g - cluster.center.g,
          color.b - cluster.center.b,
        );
        if (distance < bestDistance) {
          bestDistance = distance;
          best = clusterIndex;
        }
      });
      clusters[best].indices.push(index);
    });
    centers = clusters.map((cluster) => {
      if (!cluster.indices.length) return cluster.center;
      const sum = cluster.indices.reduce(
        (accumulator, index) => {
          accumulator.r += colors[index].r;
          accumulator.g += colors[index].g;
          accumulator.b += colors[index].b;
          return accumulator;
        },
        { r: 0, g: 0, b: 0 },
      );
      return {
        r: sum.r / cluster.indices.length,
        g: sum.g / cluster.indices.length,
        b: sum.b / cluster.indices.length,
      };
    });
  }

  clusters = clusters.filter((cluster) => cluster.indices.length > 0);
  clusters.sort((a, b) => b.indices.length - a.indices.length);
  const largest = clusters[0];
  const resultClusters: ColorCluster[] = clusters.map((cluster, index) => {
    let status: SeatStatus = 'available';
    let confidence = 0.55;
    if (index > 0) {
      const saturation =
        Math.max(cluster.center.r, cluster.center.g, cluster.center.b) === 0
          ? 0
          : (Math.max(cluster.center.r, cluster.center.g, cluster.center.b) -
              Math.min(cluster.center.r, cluster.center.g, cluster.center.b)) /
            Math.max(cluster.center.r, cluster.center.g, cluster.center.b);
      const luminance =
        (0.2126 * cluster.center.r +
          0.7152 * cluster.center.g +
          0.0722 * cluster.center.b) /
        255;
      const largestLum =
        (0.2126 * largest.center.r +
          0.7152 * largest.center.g +
          0.0722 * largest.center.b) /
        255;
      if (saturation < 0.2 || luminance < largestLum - 0.24) {
        status = 'occupied';
        confidence = 0.48;
      } else {
        status = 'unknown';
        confidence = 0.35;
      }
    }
    return {
      id: `colour-${index + 1}`,
      color: rgbToHex(cluster.center),
      count: cluster.indices.length,
      status,
      confidence,
    };
  });

  const seatStatuses = new Map<number, { status: SeatStatus; confidence: number }>();
  clusters.forEach((cluster, clusterIndex) => {
    cluster.indices.forEach((candidateIndex) => {
      seatStatuses.set(candidateIndex, {
        status: resultClusters[clusterIndex].status,
        confidence: resultClusters[clusterIndex].confidence,
      });
    });
  });

  return { clusters: resultClusters, seatStatuses };
}

export function inferSeatType(
  candidate: SeatCandidate,
  medianWidth: number,
  medianHeight: number,
): { type: SeatType; confidence: number } {
  if (candidate.w > medianWidth * 1.32 && candidate.h > medianHeight * 1.08) {
    return { type: 'recliner', confidence: 0.44 };
  }
  if (candidate.w > medianWidth * 1.16) {
    return { type: 'premium', confidence: 0.38 };
  }
  return { type: 'standard', confidence: 0.72 };
}

export function buildSeats(
  candidates: SeatCandidate[],
  rows: GroupedRows,
  aisleResult: AisleAndSectionResult,
  colorResult: ColorClassification,
  imageWidth: number,
  imageHeight: number,
  basis: ScreenBasis,
  screenCenterX: number,
): {
  seats: Seat[];
  seatRows: SeatRow[];
  sections: SeatSection[];
} {
  const medianW = median(candidates.map((candidate) => candidate.w));
  const medianH = median(candidates.map((candidate) => candidate.h));
  const assignmentsByCandidate = new Map(
    rows.assignments.map((assignment) => [assignment.candidateIndex, assignment]),
  );
  const seats: Seat[] = candidates.map((candidate, index) => {
    const assignment = assignmentsByCandidate.get(index);
    const rowIndex = assignment?.rowIndex ?? 0;
    const rowLabel = assignment?.rowLabel ?? rowLabelForIndex(rowIndex);
    const sectionId = aisleResult.seatSectionIds.get(index) ?? 'section-1';
    const statusInfo = colorResult.seatStatuses.get(index) ?? {
      status: 'available' as SeatStatus,
      confidence: 0.5,
    };
    const typeInfo = inferSeatType(candidate, medianW, medianH);
    const projected = projectToScreenAxes(
      { x: candidate.cx / imageWidth, y: candidate.cy / imageHeight },
      basis,
      imageWidth,
      imageHeight,
    );
    const normalised = axesToNormalised(
      projected.horizontalPx,
      projected.depthPx,
      basis,
      imageWidth,
      imageHeight,
    );
    const rotation =
      (Math.atan2(normalised.x - screenCenterX, Math.max(0.001, normalised.y - basis.center.y)) *
        180) /
      Math.PI;
    const confidence = Math.min(
      0.99,
      Math.max(0.25, candidate.support * 0.55 + (assignment?.rowConfidence ?? 0.5) * 0.45),
    );
    return {
      id: `seat-${index + 1}`,
      rowId: `row-${rowIndex + 1}`,
      rowLabel,
      sectionId,
      x: normalised.x,
      y: normalised.y,
      rotation: 0,
      width: candidate.w / imageWidth,
      depth: candidate.h / imageHeight,
      status: statusInfo.status,
      type: typeInfo.type,
      confidence,
      source: 'detected',
      notes:
        confidence < 0.6
          ? 'Low-confidence detection. Review this seat.'
          : typeInfo.type === 'recliner'
            ? 'Seat appears wider than its neighbours.'
            : undefined,
    };
  });

  // Seat numbers are filled by OCR later. Sequential fallbacks make the UI
  // readable while preserving uncertainty.
  const rowSeatOrder = new Map<string, Seat[]>();
  seats.forEach((seat) => {
    const list = rowSeatOrder.get(seat.rowId) ?? [];
    list.push(seat);
    rowSeatOrder.set(seat.rowId, list);
  });
  rowSeatOrder.forEach((rowSeats) => {
    rowSeats
      .sort((a, b) => {
        const aProjection = projectToScreenAxes(
          { x: a.x, y: a.y },
          basis,
          imageWidth,
          imageHeight,
        );
        const bProjection = projectToScreenAxes(
          { x: b.x, y: b.y },
          basis,
          imageWidth,
          imageHeight,
        );
        return aProjection.horizontalPx - bProjection.horizontalPx;
      })
      .forEach((seat, index) => {
        seat.seatNumber = String(index + 1);
      });
  });

  const seatRows: SeatRow[] = Array.from({ length: rows.rowCount }, (_, index) => {
    const rowSeats = seats.filter((seat) => seat.rowId === `row-${index + 1}`);
    const confidence = rowSeats.length
      ? rowSeats.reduce((sum, seat) => sum + seat.confidence, 0) / rowSeats.length
      : 0.3;
    return {
      id: `row-${index + 1}`,
      label: rowLabelForIndex(index),
      index,
      depth: rows.rowDepths[index] / imageHeight,
      seatIds: rowSeats.map((seat) => seat.id),
      confidence,
    };
  });

  const sections = aisleResult.sections.map((section) => ({
    ...section,
    seatIds: seats.filter((seat) => seat.sectionId === section.id).map((seat) => seat.id),
  }));

  return { seats, seatRows, sections };
}
