import { useEffect, useId, useState } from 'react';
import { Maximize2, X } from 'lucide-react';
import type { Seat, SeatingLayout } from '@/types';

interface SeatMapPickerProps {
  layout: SeatingLayout;
  imageUrl: string | null;
  selectedSeatId: string | null;
  onSelect: (seatId: string) => void;
  title?: string;
  size?: 'default' | 'large' | 'compact';
  allowExpand?: boolean;
  className?: string;
}

function seatLabel(seat: Seat): string {
  return `${seat.rowLabel}${seat.seatNumber ?? '—'}`;
}

function statusLabel(status: Seat['status']): string {
  if (status === 'occupied') return 'Booked';
  if (status === 'unknown') return 'Not sure';
  return 'Available';
}

export function SeatMapPicker({
  layout,
  imageUrl,
  selectedSeatId,
  onSelect,
  title,
  size = 'default',
  allowExpand = false,
  className = '',
}: SeatMapPickerProps) {
  const [expanded, setExpanded] = useState(false);
  const dialogTitleId = useId();
  const currentSeat = layout.seats.find((seat) => seat.id === selectedSeatId);
  const maxMapHeight = size === 'large' ? 680 : 240;
  const aspectRatio = layout.imageWidth / Math.max(1, layout.imageHeight);

  useEffect(() => {
    if (!expanded) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setExpanded(false);
    };
    document.addEventListener('keydown', closeOnEscape);
    return () => document.removeEventListener('keydown', closeOnEscape);
  }, [expanded]);

  const selectExpandedSeat = (seatId: string) => {
    setExpanded(false);
    onSelect(seatId);
  };

  return (
    <div
      className={`seat-map-picker${size === 'default' ? '' : ` seat-map-picker--${size}`} ${className}`}
    >
      {title && <h3 className="seat-map-title">{title}</h3>}
      {allowExpand && (
        <button
          className="btn btn--sm seat-map-expand"
          type="button"
          onClick={() => setExpanded(true)}
        >
          <Maximize2 size={12} />
          Open full seat map
        </button>
      )}
      <div
        className="seat-map-viewport"
        style={{
          aspectRatio: `${layout.imageWidth} / ${layout.imageHeight}`,
          width: size === 'compact' ? '100%' : `min(100%, ${Math.round(aspectRatio * maxMapHeight)}px)`,
        }}
      >
        {imageUrl ? (
          <img className="seat-map-image" src={imageUrl} alt="" aria-hidden="true" />
        ) : (
          <div className="seat-map-placeholder" aria-hidden="true" />
        )}
        {layout.seats.map((seat) => {
          const selected = seat.id === selectedSeatId;
          const label = seatLabel(seat);
          const status = statusLabel(seat.status);
          return (
            <button
              key={seat.id}
              type="button"
              className={`seat-map-seat seat-map-seat--${seat.status} ${
                selected ? 'is-selected' : ''
              }`}
              style={{
                left: `${seat.x * 100}%`,
                top: `${seat.y * 100}%`,
              }}
              title={`Row ${seat.rowLabel}, seat ${seat.seatNumber ?? 'unknown'} · ${status}`}
              aria-label={`Row ${seat.rowLabel}, seat ${seat.seatNumber ?? 'unknown'}, ${status}. View this seat.`}
              aria-pressed={selected}
              onClick={() => onSelect(seat.id)}
            >
              <span className="seat-map-seat-label">{label}</span>
            </button>
          );
        })}
      </div>
      <div className="seat-map-legend" role="group" aria-label="Seat availability legend">
        <span><i className="is-available" />Available</span>
        <span><i className="is-occupied" />Booked</span>
        <span><i className="is-unknown" />Not sure</span>
        <span><i className="is-current" />Viewing</span>
      </div>
      <p className="seat-map-current">
        {currentSeat
          ? `Current view · ${seatLabel(currentSeat)}`
          : allowExpand
            ? `${layout.seats.length} seats · open the full map to choose by label`
            : `${layout.seats.length} seats detected · click any seat to see its view`}
      </p>
      {expanded && (
        <div
          className="seat-map-modal-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setExpanded(false);
          }}
        >
          <section
            className="seat-map-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby={dialogTitleId}
          >
            <header className="seat-map-modal-header">
              <div>
                <h2 id={dialogTitleId}>{title ?? 'Choose a seat'}</h2>
                <p>Select a labeled seat to open its view. Booked seats are still viewable.</p>
              </div>
              <button
                className="icon-btn"
                type="button"
                aria-label="Close full seat map"
                onClick={() => setExpanded(false)}
              >
                <X size={16} />
              </button>
            </header>
            <SeatMapPicker
              layout={layout}
              imageUrl={imageUrl}
              selectedSeatId={selectedSeatId}
              onSelect={selectExpandedSeat}
              size="large"
            />
          </section>
        </div>
      )}
    </div>
  );
}
