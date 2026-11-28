import type {
  AuditoriumConfig,
  AuditoriumDimensions,
  Calibration,
  Seat,
  SeatingLayout,
  SpatialGeometry,
  SpatialRow,
  SpatialSeat,
  ValidationIssue,
  ViewMetrics,
} from '@/types';
import { calibrateLayout, measureLayout } from './calibration';
import {
  clamp,
  median,
  projectToScreenAxes,
  screenBasis,
} from './coordinates';

const DEG = Math.PI / 180;

export function rowFloorElevation(
  rowIndex: number,
  rowSpacingM: number,
  slopePercent: number,
): number {
  return Math.max(0, rowIndex) * rowSpacingM * (slopePercent / 100);
}

export function screenPoint(config: AuditoriumConfig): [number, number, number] {
  return [0, config.screen.elevationM + config.screen.heightM / 2, 0];
}

export function buildSpatialGeometry(
  layout: SeatingLayout,
  config: AuditoriumConfig,
): SpatialGeometry {
  const metrics = measureLayout(layout);
  const calibration = calibrateLayout(layout, config);
  const mpp = calibration.metresPerPixel;
  const zScale =
    metrics.rowSpacingPx > 0
      ? clamp(config.rowSpacingM / (metrics.rowSpacingPx * mpp), 0.55, 1.8)
      : 1;
  const minDepthPx = metrics.firstRowDepthPx;
  const rowIndexById = new Map(layout.rows.map((row) => [row.id, row.index]));
  const rowById = new Map(layout.rows.map((row) => [row.id, row]));
  const columnOffsets = new Map<string, number>();
  layout.rows.forEach((row) => {
    const seats = row.seatIds
      .map((id) => layout.seats.find((seat) => seat.id === id))
      .filter((seat): seat is Seat => Boolean(seat))
      .sort((a, b) => {
        const aProjection = projectToScreenAxes({ x: a.x, y: a.y }, metrics.basis, layout.imageWidth, layout.imageHeight);
        const bProjection = projectToScreenAxes({ x: b.x, y: b.y }, metrics.basis, layout.imageWidth, layout.imageHeight);
        return aProjection.horizontalPx - bProjection.horizontalPx;
      });
    const midpoint = (seats.length - 1) / 2;
    seats.forEach((seat, index) => {
      columnOffsets.set(seat.id, (index - midpoint) * (config.seating.seatGapM - 0.12));
    });
  });
  const slopePercent = config.floor.slopePercent;
  const screenCenter = screenPoint(config);
  const manualDividers = layout.aisles
    .filter((aisle) => aisle.source === 'manual' && aisle.orientation === 'vertical')
    .map((aisle) => ({
      x: projectToScreenAxes({ x: aisle.x, y: aisle.y }, metrics.basis, layout.imageWidth, layout.imageHeight).horizontalPx * mpp,
      halfWidth: Math.max(0.32, aisle.width * layout.imageWidth * mpp / 2),
    }));

  const rows: SpatialRow[] = layout.rows
    .slice()
    .sort((a, b) => a.index - b.index)
    .map((row) => {
      const elevation = rowFloorElevation(row.index, config.rowSpacingM, slopePercent);
      const rowSeats = row.seatIds
        .map((id) => layout.seats.find((seat) => seat.id === id))
        .filter((seat): seat is Seat => Boolean(seat));
      const zValues = rowSeats.map((seat) => {
        const projection = projectToScreenAxes(
          { x: seat.x, y: seat.y },
          metrics.basis,
          layout.imageWidth,
          layout.imageHeight,
        );
        return (
          config.frontClearanceM +
          (projection.depthPx - minDepthPx) * mpp * zScale
        );
      });
      return {
        id: row.id,
        label: row.label,
        index: row.index,
        z: zValues.length ? median(zValues) : config.frontClearanceM,
        elevationM: elevation,
        seatIds: row.seatIds,
      };
    });

  const spatialSeats: SpatialSeat[] = layout.seats.map((seat) => {
    const projection = projectToScreenAxes(
      { x: seat.x, y: seat.y },
      metrics.basis,
      layout.imageWidth,
      layout.imageHeight,
    );
    const baseX = projection.horizontalPx * mpp + (columnOffsets.get(seat.id) ?? 0);
    const x = manualDividers.reduce(
      (offset, divider) => offset + (baseX + offset >= divider.x ? divider.halfWidth : -divider.halfWidth),
      baseX,
    );
    const z =
      config.frontClearanceM + (projection.depthPx - minDepthPx) * mpp * zScale;
    const rowIndex = rowIndexById.get(seat.rowId) ?? 0;
    const elevation = rowFloorElevation(rowIndex, config.rowSpacingM, slopePercent);
    const eyeY = elevation + config.seating.eyeHeightM;
    const yaw = Math.atan2(x, Math.max(0.001, z)) + seat.rotation * DEG;
    const horizontalDistance = Math.hypot(x - screenCenter[0], z - screenCenter[2]);
    const distance = Math.hypot(
      x - screenCenter[0],
      eyeY - screenCenter[1],
      z - screenCenter[2],
    );
    return {
      seat,
      rowIndex,
      position: [x, elevation, z],
      eyePosition: [x, eyeY, z],
      rotationY: yaw,
      screenDistanceM: distance,
      horizontalAngleDeg: (Math.atan2(x - screenCenter[0], z - screenCenter[2]) * 180) / Math.PI,
      verticalAngleDeg:
        (Math.atan2(screenCenter[1] - eyeY, Math.max(0.01, horizontalDistance)) * 180) /
        Math.PI,
      sectionId: seat.sectionId,
    };
  });

  const minX = spatialSeats.length ? Math.min(...spatialSeats.map((seat) => seat.position[0])) : 0;
  const maxX = spatialSeats.length ? Math.max(...spatialSeats.map((seat) => seat.position[0])) : 0;
  const minZ = spatialSeats.length ? Math.min(...spatialSeats.map((seat) => seat.position[2])) : 0;
  const maxZ = spatialSeats.length ? Math.max(...spatialSeats.map((seat) => seat.position[2])) : 0;
  const dimensions: AuditoriumDimensions = {
    widthM: config.widthM,
    lengthM: config.lengthM,
    ceilingHeightM: config.ceilingHeightM,
    frontClearanceM: config.frontClearanceM,
    rearClearanceM: config.rearClearanceM,
    rowSpacingM: config.rowSpacingM,
    seatWidthM: config.seatWidthM,
    seatDepthM: config.seatDepthM,
    sideClearanceM: config.sideClearanceM,
    minX,
    maxX,
    minZ,
    maxZ,
    screenElevationM: config.screen.elevationM,
    screenHeightM: config.screen.heightM,
  };

  const validation = validateSpatial(layout, config, spatialSeats, dimensions, calibration);
  const provenance = { ...config.sources };

  return {
    calibration,
    seats: spatialSeats,
    rows,
    screen: {
      widthM: config.screen.widthM,
      heightM: config.screen.heightM,
      bottomM: config.screen.elevationM,
      centerM: screenCenter,
      tiltDeg: config.screen.tiltDeg,
      curved: config.screen.curved,
      curvatureM: config.screen.curvatureM,
    },
    dimensions,
    floorSlopeDeg: (Math.atan(slopePercent / 100) * 180) / Math.PI,
    validation,
    provenance,
  };
}

export function validateSpatial(
  layout: SeatingLayout,
  config: AuditoriumConfig,
  seats: SpatialSeat[],
  dimensions: AuditoriumDimensions,
  calibration: Calibration,
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const ids = new Set<string>();
  layout.seats.forEach((seat) => {
    if (ids.has(seat.id)) {
      issues.push({
        id: `duplicate-${seat.id}`,
        severity: 'error',
        title: 'Duplicate seat identifier',
        detail: `${seat.id} appears more than once. Delete or regenerate one of the duplicates.`,
        field: 'layout',
      });
    }
    ids.add(seat.id);
  });

  if (!layout.seats.length) {
    issues.push({
      id: 'no-seats',
      severity: 'error',
      title: 'No seats detected',
      detail: 'Add seats in the verification editor before generating the auditorium.',
      field: 'layout',
    });
  }

  const rowIds = new Set(layout.rows.map((row) => row.id));
  layout.seats.forEach((seat) => {
    if (!rowIds.has(seat.rowId)) {
      issues.push({
        id: `orphan-${seat.id}`,
        severity: 'error',
        title: 'Seat has no valid row',
        detail: `${seat.rowLabel || seat.id} references a row that no longer exists.`,
        field: 'layout',
      });
    }
  });

  for (let i = 0; i < seats.length; i += 1) {
    for (let j = i + 1; j < seats.length; j += 1) {
      const a = seats[i];
      const b = seats[j];
      const dx = a.position[0] - b.position[0];
      const dz = a.position[2] - b.position[2];
      const distance = Math.hypot(dx, dz);
      if (distance < Math.min(config.seatWidthM, config.seatDepthM) * 0.38) {
        issues.push({
          id: `overlap-${a.seat.id}-${b.seat.id}`,
          severity: 'warning',
          title: 'Seats are unusually close',
          detail: `${a.seat.rowLabel}${a.seat.seatNumber ?? ''} and ${b.seat.rowLabel}${b.seat.seatNumber ?? ''} are ${distance.toFixed(2)} m apart. Check the source layout or seat width.`,
          field: 'layout',
        });
      }
    }
  }

  if (seats.some((seat) => Math.abs(seat.position[0]) + config.seatWidthM / 2 > config.widthM / 2)) {
    issues.push({
      id: 'outside-width',
      severity: 'error',
      title: 'Seats fall outside the auditorium width',
      detail: 'Increase the auditorium width or reduce the screen-width calibration.',
      field: 'widthM',
    });
  }
  if (seats.some((seat) => seat.position[2] < 0 || seat.position[2] > config.lengthM)) {
    issues.push({
      id: 'outside-length',
      severity: 'error',
      title: 'Seats fall outside the auditorium length',
      detail: 'Increase the auditorium length or reduce the front/rear clearances.',
      field: 'lengthM',
    });
  }
  if (config.screen.heightM <= 0 || config.screen.widthM <= 0) {
    issues.push({
      id: 'screen-size',
      severity: 'error',
      title: 'Invalid screen dimensions',
      detail: 'Screen width and height must both be greater than zero.',
      field: 'screen.widthM',
    });
  }
  const screenTop = config.screen.elevationM + config.screen.heightM;
  if (screenTop > config.ceilingHeightM) {
    issues.push({
      id: 'screen-ceiling',
      severity: 'error',
      title: 'Screen is taller than the auditorium',
      detail: 'Lower the screen, reduce its height, or raise the ceiling.',
      field: 'ceilingHeightM',
    });
  }
  if (config.ceilingHeightM <= 2.4) {
    issues.push({
      id: 'ceiling-low',
      severity: 'warning',
      title: 'Low ceiling',
      detail: 'A ceiling below 2.4 m may hide the screen from rear seats.',
      field: 'ceilingHeightM',
    });
  }
  if (config.screen.widthM > config.widthM) {
    issues.push({
      id: 'screen-wider-than-room',
      severity: 'error',
      title: 'Screen is wider than the room',
      detail: 'Increase the auditorium width or reduce the screen width.',
      field: 'widthM',
    });
  }
  if (config.floor.slopePercent < 0 || config.floor.slopePercent > 45) {
    issues.push({
      id: 'slope',
      severity: 'error',
      title: 'Unusual floor slope',
      detail: 'Floor slope should be between 0% and 45%.',
      field: 'floor.slopePercent',
    });
  }
  calibration.warnings.forEach((warning, index) => {
    issues.push({
      id: `calibration-${index}`,
      severity: 'warning',
      title: 'Scale needs review',
      detail: warning,
      field: 'screen.widthM',
    });
  });
  if (layout.screen.confidence < 0.55) {
    issues.push({
      id: 'screen-confidence',
      severity: 'warning',
      title: 'Screen placement is uncertain',
      detail: 'Confirm the screen line in the verification editor. It controls the entire reconstruction orientation.',
      field: 'screen',
    });
  }
  if (layout.rows.length > 0) {
    const first = layout.rows.reduce((min, row) => (row.depth < min.depth ? row : min), layout.rows[0]);
    if (first.depth < 0) {
      issues.push({
        id: 'row-behind-screen',
        severity: 'error',
        title: 'Rows are behind the screen',
        detail: 'Check the screen line orientation in the verification editor.',
        field: 'screen',
      });
    }
  }

  return issues;
}

export function geometryBounds(geometry: SpatialGeometry): {
  center: [number, number, number];
  size: [number, number, number];
  radius: number;
} {
  const { widthM, lengthM, ceilingHeightM } = geometry.dimensions;
  return {
    center: [0, ceilingHeightM * 0.32, lengthM * 0.5],
    size: [widthM, ceilingHeightM, lengthM],
    radius: Math.hypot(widthM, lengthM, ceilingHeightM) / 2,
  };
}

export function viewMetricsForSeat(
  seat: SpatialSeat,
  geometry: SpatialGeometry,
  config: AuditoriumConfig,
): ViewMetrics {
  const screenCenter = geometry.screen.centerM;
  const [x, eyeY, z] = seat.eyePosition;
  const dx = x - screenCenter[0];
  const dy = eyeY - screenCenter[1];
  const dz = z - screenCenter[2];
  const horizontalDistance = Math.hypot(dx, dz);
  const distance = Math.hypot(dx, dy, dz);

  const halfWidth = geometry.screen.widthM / 2;
  const halfHeight = geometry.screen.heightM / 2;
  const left = [screenCenter[0] - halfWidth, screenCenter[1], screenCenter[2] + 0.01];
  const right = [screenCenter[0] + halfWidth, screenCenter[1], screenCenter[2] + 0.01];
  const bottom = [screenCenter[0], screenCenter[1] - halfHeight, screenCenter[2] + 0.01];
  const top = [screenCenter[0], screenCenter[1] + halfHeight, screenCenter[2] + 0.01];
  const angleBetween = (a: number[], b: number[]) => {
    const va = [a[0] - x, a[1] - eyeY, a[2] - z];
    const vb = [b[0] - x, b[1] - eyeY, b[2] - z];
    const dot = va[0] * vb[0] + va[1] * vb[1] + va[2] * vb[2];
    const la = Math.hypot(va[0], va[1], va[2]);
    const lb = Math.hypot(vb[0], vb[1], vb[2]);
    return (Math.acos(clamp(dot / Math.max(0.0001, la * lb), -1, 1)) * 180) / Math.PI;
  };
  const horizontalFov = angleBetween(left, right);
  const verticalFov = angleBetween(bottom, top);
  const obstruction = estimateObstruction(seat, geometry, config);
  return {
    seatId: seat.seat.id,
    distanceM: distance,
    horizontalAngleDeg: seat.horizontalAngleDeg,
    verticalAngleDeg: seat.verticalAngleDeg,
    screenHorizontalFovDeg: horizontalFov,
    screenVerticalFovDeg: verticalFov,
    screenCoveragePercent: clamp((horizontalFov / 100) * 100, 0, 100),
    centreOffsetM: dx,
    eyeHeightM: config.seating.eyeHeightM,
    obstructionPercent: obstruction.percent,
    obstructionConfidence: obstruction.confidence,
    obstructingSeatIds: obstruction.ids,
  };
}

/**
 * Approximate occlusion of the screen by preceding backrests. This is a
 * geometric estimate based on configured chair dimensions, not a survey.
 */
export function estimateObstruction(
  viewer: SpatialSeat,
  geometry: SpatialGeometry,
  config: AuditoriumConfig,
): { percent: number; confidence: 'low' | 'medium' | 'high'; ids: string[] } {
  const [ex, ey, ez] = viewer.eyePosition;
  const screenCenter = geometry.screen.centerM;
  const halfW = geometry.screen.widthM / 2;
  const halfH = geometry.screen.heightM / 2;
  const blockers = geometry.seats.filter(
    (seat) =>
      seat.seat.id !== viewer.seat.id &&
      seat.position[2] > 0.1 &&
      seat.position[2] < viewer.position[2] - 0.35 &&
      Math.abs(seat.position[0] - ex) < config.seatWidthM * 1.6,
  );
  if (!blockers.length) {
    return { percent: 0, confidence: 'medium', ids: [] };
  }

  const samplesX = 9;
  const samplesY = 7;
  let blocked = 0;
  let total = 0;
  const ids = new Set<string>();
  for (let ix = 0; ix < samplesX; ix += 1) {
    for (let iy = 0; iy < samplesY; iy += 1) {
      const tx = screenCenter[0] - halfW + ((ix + 0.5) / samplesX) * halfW * 2;
      const ty = screenCenter[1] - halfH + ((iy + 0.5) / samplesY) * halfH * 2;
      const tz = screenCenter[2] + 0.02;
      total += 1;
      const dx = tx - ex;
      const dy = ty - ey;
      const dz = tz - ez;
      for (const blocker of blockers) {
        const seat = blocker.seat;
        const seatTop = blocker.position[1] + config.seating.backrestHeightM;
        const backBottom = blocker.position[1] + 0.18;
        if (seatTop < ey && dy > 0) continue;
        const halfSeat = config.seatWidthM * 0.52;
        const backHalfDepth = Math.max(0.1, config.seatDepthM * 0.26);
        const cz = blocker.position[2] - config.seatDepthM * 0.12;
        const t = (cz - ez) / (Math.abs(dz) < 0.0001 ? 0.0001 : dz);
        if (t <= 0 || t >= 1) continue;
        const hitX = ex + dx * t;
        const hitY = ey + dy * t;
        if (
          Math.abs(hitX - blocker.position[0]) <= halfSeat &&
          hitY >= backBottom &&
          hitY <= seatTop
        ) {
          blocked += 1;
          ids.add(seat.id);
          break;
        }
      }
    }
  }
  const percent = total ? (blocked / total) * 100 : 0;
  const confidence: 'low' | 'medium' | 'high' =
    blockers.length > 3 ? 'medium' : 'low';
  return { percent, confidence, ids: [...ids] };
}

export function floorElevationAt(
  z: number,
  config: AuditoriumConfig,
): number {
  const rowSpacing = Math.max(0.1, config.rowSpacingM);
  const rowIndex = Math.max(0, (z - config.frontClearanceM) / rowSpacing);
  return rowIndex * rowSpacing * (config.floor.slopePercent / 100);
}

export function rowDepthsFromLayout(layout: SeatingLayout): number[] {
  const basis = screenBasis(layout.screen, layout.imageWidth, layout.imageHeight, layout.seats);
  return layout.rows
    .map((row) => {
      const seats = row.seatIds
        .map((id) => layout.seats.find((seat) => seat.id === id))
        .filter((seat): seat is Seat => Boolean(seat));
      return seats.length
        ? median(
            seats.map(
              (seat) =>
                projectToScreenAxes(
                  { x: seat.x, y: seat.y },
                  basis,
                  layout.imageWidth,
                  layout.imageHeight,
                ).depthPx,
            ),
          )
        : 0;
    })
    .sort((a, b) => a - b);
}
