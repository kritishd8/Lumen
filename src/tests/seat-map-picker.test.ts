// @vitest-environment jsdom
import { createElement } from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { describe, expect, it, vi } from 'vitest';
import { SeatMapPicker } from '@/components/viewer/SeatMapPicker';
import type { SeatingLayout } from '@/types';

const layout: SeatingLayout = {
  version: 1,
  imageWidth: 100,
  imageHeight: 100,
  seats: [
    {
      id: 'available',
      rowId: 'row-a',
      rowLabel: 'A',
      seatNumber: '1',
      sectionId: 'main',
      x: 0.3,
      y: 0.5,
      rotation: 0,
      width: 0.04,
      depth: 0.04,
      status: 'available',
      type: 'standard',
      confidence: 1,
      source: 'detected',
    },
    {
      id: 'booked',
      rowId: 'row-a',
      rowLabel: 'A',
      seatNumber: '2',
      sectionId: 'main',
      x: 0.5,
      y: 0.5,
      rotation: 0,
      width: 0.04,
      depth: 0.04,
      status: 'occupied',
      type: 'standard',
      confidence: 1,
      source: 'detected',
    },
    {
      id: 'uncertain',
      rowId: 'row-a',
      rowLabel: 'A',
      seatNumber: '3',
      sectionId: 'main',
      x: 0.7,
      y: 0.5,
      rotation: 0,
      width: 0.04,
      depth: 0.04,
      status: 'unknown',
      type: 'standard',
      confidence: 0.4,
      source: 'detected',
    },
  ],
  rows: [
    {
      id: 'row-a',
      label: 'A',
      index: 0,
      depth: 0.5,
      seatIds: ['available', 'booked', 'uncertain'],
      confidence: 1,
    },
  ],
  sections: [],
  aisles: [],
  screen: { x1: 0.2, y1: 0.1, x2: 0.8, y2: 0.1, confidence: 1, source: 'detected' },
  colorClusters: [],
  stats: {
    totalSeats: 3,
    totalRows: 1,
    totalSections: 0,
    uncertainSeats: 1,
    unreadableLabels: 0,
    detectedSeats: 3,
    manualSeats: 0,
    processingMs: 1,
    openCvUsed: false,
    ocrUsed: false,
    warnings: [],
  },
};

describe('SeatMapPicker', () => {
  it('colors seat availability and keeps booked seats selectable', () => {
    const onSelect = vi.fn();
    render(
      createElement(SeatMapPicker, {
        layout,
        imageUrl: null,
        selectedSeatId: 'booked',
        onSelect,
      }),
    );

    const available = screen.getByRole('button', { name: /seat 1, available/i });
    const booked = screen.getByRole('button', { name: /seat 2, booked/i });
    const uncertain = screen.getByRole('button', { name: /seat 3, not sure/i });

    expect(available).toHaveClass('seat-map-seat--available');
    expect(booked).toHaveClass('seat-map-seat--occupied', 'is-selected');
    expect(booked).toHaveTextContent('A2');
    expect(uncertain).toHaveClass('seat-map-seat--unknown');
    expect(booked).not.toBeDisabled();

    fireEvent.click(booked);
    expect(onSelect).toHaveBeenCalledWith('booked');
  });

  it('opens a full labeled map for precise seat selection from a compact picker', () => {
    const onSelect = vi.fn();
    render(
      createElement(SeatMapPicker, {
        layout,
        imageUrl: null,
        selectedSeatId: 'booked',
        onSelect,
        size: 'compact',
        allowExpand: true,
        title: 'Choose a seat',
      }),
    );

    fireEvent.click(screen.getByRole('button', { name: /open full seat map/i }));
    const dialog = screen.getByRole('dialog', { name: 'Choose a seat' });
    fireEvent.click(within(dialog).getByRole('button', { name: /seat 3, not sure/i }));

    expect(onSelect).toHaveBeenCalledWith('uncertain');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('keeps the source image and seat markers in the same uncropped coordinates', () => {
    const { container } = render(
      createElement(SeatMapPicker, {
        layout,
        imageUrl: '/source-plan.png',
        selectedSeatId: null,
        onSelect: vi.fn(),
      }),
    );

    expect(container.querySelector('.seat-map-image')).toHaveAttribute(
      'src',
      '/source-plan.png',
    );
    expect(container.querySelector('.seat-map-seat--available')).toHaveStyle({
      left: '30%',
      top: '50%',
    });
  });
});
