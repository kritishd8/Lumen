import type {
  Aisle,
  DetectionStats,
  SeatingLayout,
  Seat,
  SeatRow,
  SeatSection,
} from '@/types';
import { screenBasis, projectToScreenAxes, makeSeatId } from './coordinates';
import { SECTION_COLORS } from '@/utils/defaults';

export function recalculateStats(layout: SeatingLayout): DetectionStats {
  const uncertainSeats = layout.seats.filter((seat) => seat.confidence < 0.65).length;
  return {
    ...layout.stats,
    totalSeats: layout.seats.length,
    totalRows: layout.rows.length,
    totalSections: layout.sections.length,
    uncertainSeats,
    manualSeats: layout.seats.filter((seat) => seat.source === 'manual').length,
    unreadableLabels: layout.seats.filter((seat) => !seat.seatNumber).length,
  };
}

export function normaliseLayout(layout: SeatingLayout): SeatingLayout {
  const seats = layout.seats.map((seat) => ({ ...seat }));
  const seatById = new Map(seats.map((seat) => [seat.id, seat]));

  const rows: SeatRow[] = layout.rows.map((row) => {
    const rowSeats = seats.filter((seat) => seat.rowId === row.id);
    const label = rowSeats[0]?.rowLabel ?? row.label;
    rowSeats.forEach((seat) => {
      seat.rowLabel = label;
    });
    return {
      ...row,
      label,
      seatIds: rowSeats.map((seat) => seat.id),
      confidence: rowSeats.length
        ? rowSeats.reduce((sum, seat) => sum + seat.confidence, 0) / rowSeats.length
        : row.confidence,
    };
  });
  rows.sort((a, b) => a.index - b.index);
  rows.forEach((row, index) => {
    row.index = index;
    row.seatIds.forEach((id) => {
      const seat = seatById.get(id);
      if (seat) {
        seat.rowId = row.id;
        seat.rowLabel = row.label;
      }
    });
  });

  const sections: SeatSection[] = layout.sections.map((section) => ({
    ...section,
    seatIds: seats.filter((seat) => seat.sectionId === section.id).map((seat) => seat.id),
  }));
  const sectionIds = new Set(sections.map((section) => section.id));
  seats.forEach((seat) => {
    if (!sectionIds.has(seat.sectionId)) {
      seat.sectionId = sections[0]?.id ?? 'section-1';
    }
  });
  if (!sections.length) {
    sections.push({
      id: 'section-1',
      name: 'Main',
      seatIds: seats.map((seat) => seat.id),
      color: SECTION_COLORS[0],
    });
    seats.forEach((seat) => {
      seat.sectionId = 'section-1';
    });
  }

  const next = {
    ...layout,
    seats,
    rows,
    sections,
  };
  next.stats = recalculateStats(next);
  return next;
}

export function nextSeatId(layout: SeatingLayout): string {
  return makeSeatId('seat', new Set(layout.seats.map((seat) => seat.id)));
}

export function nextSeatNumber(layout: SeatingLayout, rowId: string): string {
  const numbers = layout.seats
    .filter((seat) => seat.rowId === rowId)
    .map((seat) => Number.parseInt(seat.seatNumber ?? '', 10))
    .filter((value) => Number.isFinite(value));
  return String((numbers.length ? Math.max(...numbers) : 0) + 1);
}

export function findNearestRowId(
  layout: SeatingLayout,
  x: number,
  y: number,
): string | null {
  if (!layout.rows.length) return null;
  let bestRow = layout.rows[0];
  let bestDistance = Number.POSITIVE_INFINITY;
  layout.rows.forEach((row) => {
    const rowSeats = row.seatIds
      .map((id) => layout.seats.find((seat) => seat.id === id))
      .filter((seat): seat is Seat => Boolean(seat));
    if (!rowSeats.length) return;
    const minDistance = Math.min(
      ...rowSeats.map((seat) => Math.hypot((seat.x - x) * 1.2, seat.y - y)),
    );
    if (minDistance < bestDistance) {
      bestDistance = minDistance;
      bestRow = row;
    }
  });
  return bestRow.id;
}

export function createSeatAt(
  layout: SeatingLayout,
  x: number,
  y: number,
  rowId?: string,
): Seat {
  const targetRowId = rowId ?? findNearestRowId(layout, x, y) ?? layout.rows[0]?.id;
  const row = layout.rows.find((item) => item.id === targetRowId) ?? layout.rows[0];
  const section = layout.sections[0];
  const medianWidth =
    layout.seats.length > 0
      ? layout.seats
          .map((seat) => seat.width)
          .sort((a, b) => a - b)[Math.floor(layout.seats.length / 2)]
      : 0.025;
  const medianDepth =
    layout.seats.length > 0
      ? layout.seats
          .map((seat) => seat.depth)
          .sort((a, b) => a - b)[Math.floor(layout.seats.length / 2)]
      : 0.035;
  return {
    id: nextSeatId(layout),
    rowId: row?.id ?? 'row-1',
    rowLabel: row?.label ?? 'A',
    seatNumber: row ? nextSeatNumber(layout, row.id) : '1',
    sectionId: section?.id ?? 'section-1',
    x: Math.max(0, Math.min(1, x)),
    y: Math.max(0, Math.min(1, y)),
    rotation: 0,
    width: medianWidth,
    depth: medianDepth,
    status: 'available',
    type: 'standard',
    confidence: 1,
    source: 'manual',
    notes: 'Manually added.',
  };
}

export function moveSeatToRow(
  layout: SeatingLayout,
  seatId: string,
  rowId: string,
): SeatingLayout {
  const seat = layout.seats.find((item) => item.id === seatId);
  const row = layout.rows.find((item) => item.id === rowId);
  if (!seat || !row) return layout;
  seat.rowId = row.id;
  seat.rowLabel = row.label;
  if (!seat.seatNumber) seat.seatNumber = nextSeatNumber(layout, row.id);
  return normaliseLayout(layout);
}

export function screenSeatDepths(layout: SeatingLayout): Map<string, number> {
  const basis = screenBasis(layout.screen, layout.imageWidth, layout.imageHeight, layout.seats);
  const depths = new Map<string, number>();
  layout.seats.forEach((seat) => {
    depths.set(
      seat.id,
      projectToScreenAxes(
        { x: seat.x, y: seat.y },
        basis,
        layout.imageWidth,
        layout.imageHeight,
      ).depthPx,
    );
  });
  return depths;
}

export function addAisleToLayout(
  layout: SeatingLayout,
  x: number,
  y: number,
  orientation: Aisle['orientation'] = 'vertical',
): SeatingLayout {
  const id = `aisle-${Date.now().toString(36)}`;
  return {
    ...layout,
    aisles: [
      ...layout.aisles,
      {
        id,
        x,
        y,
        width: 0.035,
        orientation,
        source: 'manual',
      },
    ],
  };
}

export function addSectionToLayout(layout: SeatingLayout): SeatingLayout {
  const id = `section-${Date.now().toString(36)}`;
  return normaliseLayout({
    ...layout,
    sections: [
      ...layout.sections,
      {
        id,
        name: `Section ${layout.sections.length + 1}`,
        seatIds: [],
        color: SECTION_COLORS[layout.sections.length % SECTION_COLORS.length],
      },
    ],
  });
}

export function removeSectionFromLayout(
  layout: SeatingLayout,
  sectionId: string,
): SeatingLayout {
  if (layout.sections.length <= 1) return layout;
  const remaining = layout.sections.filter((section) => section.id !== sectionId);
  const fallback = remaining[0];
  return normaliseLayout({
    ...layout,
    sections: remaining,
    seats: layout.seats.map((seat) =>
      seat.sectionId === sectionId ? { ...seat, sectionId: fallback.id } : seat,
    ),
  });
}
