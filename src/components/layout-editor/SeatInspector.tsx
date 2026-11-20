import { useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowUpRight,
  Crosshair,
  Plus,
  RotateCcw,
  ScanLine,
  Trash2,
  Users,
} from 'lucide-react';
import { useAppStore } from '@/app/store/useAppStore';
import { SEAT_STATUSES, SEAT_TYPES } from '@/utils/defaults';
import type { SeatStatus, SeatType } from '@/types';

type InspectorTab = 'seat' | 'rows' | 'detect' | 'screen';

const TABS: { id: InspectorTab; label: string }[] = [
  { id: 'seat', label: 'Seat' },
  { id: 'rows', label: 'Rows' },
  { id: 'detect', label: 'Detection' },
  { id: 'screen', label: 'Screen' },
];

export function SeatInspector() {
  const [tab, setTab] = useState<InspectorTab>('seat');
  const project = useAppStore((state) => state.project);
  const selectedSeatIds = useAppStore((state) => state.selectedSeatIds);
  const setSelectedSeats = useAppStore((state) => state.setSelectedSeats);
  const updateSeat = useAppStore((state) => state.updateSeat);
  const updateSeats = useAppStore((state) => state.updateSeats);
  const deleteSeats = useAppStore((state) => state.deleteSeats);
  const moveSeatToRow = useAppStore((state) => state.moveSeatToRow);
  const setScreenPlacement = useAppStore((state) => state.setScreenPlacement);
  const regroupRows = useAppStore((state) => state.regroupRows);
  const addSection = useAppStore((state) => state.addSection);
  const removeSection = useAppStore((state) => state.removeSection);
  const renameSection = useAppStore((state) => state.renameSection);
  const assignSeatsToSection = useAppStore((state) => state.assignSeatsToSection);
  const addAisle = useAppStore((state) => state.addAisle);
  const deleteAisle = useAppStore((state) => state.deleteAisle);
  const originalImageUrl = useAppStore((state) => state.originalImageUrl);
  const setEditorTool = useAppStore((state) => state.setEditorTool);

  const layout = project?.layout;
  const selectedSeats = useMemo(
    () => layout?.seats.filter((seat) => selectedSeatIds.includes(seat.id)) ?? [],
    [layout, selectedSeatIds],
  );
  const selected = selectedSeats.length === 1 ? selectedSeats[0] : null;
  const multiple = selectedSeats.length > 1;

  if (!layout) return null;

  const screenAngle =
    (Math.atan2(
      (layout.screen.y2 - layout.screen.y1) * layout.imageHeight,
      (layout.screen.x2 - layout.screen.x1) * layout.imageWidth,
    ) *
      180) /
    Math.PI;

  const selectedRow = selected ? layout.rows.find((row) => row.id === selected.rowId) : null;

  return (
    <aside className="editor-inspector">
      <div className="inspector-tabs">
        {TABS.map((item) => (
          <button
            key={item.id}
            className={`inspector-tab ${tab === item.id ? 'is-active' : ''}`}
            onClick={() => setTab(item.id)}
          >
            {item.label}
          </button>
        ))}
      </div>
      <div className="inspector-scroll">
        {tab === 'seat' && (
          <>
            {selected && (
              <>
                <div className="selected-seat-card">
                  <div className="row row--between">
                    <h3>
                      {selected.rowLabel}
                      {selected.seatNumber ?? '—'}
                    </h3>
                    <span
                      className={`badge badge--${
                        selected.status === 'available'
                          ? 'available'
                          : selected.status === 'occupied'
                            ? 'occupied'
                            : 'unknown'
                      }`}
                    >
                      {selected.status}
                    </span>
                  </div>
                  <p>
                    {selected.source === 'manual' ? 'MANUAL' : 'DETECTED'} ·{' '}
                    {Math.round(selected.confidence * 100)}% confidence ·{' '}
                    {selected.type}
                  </p>
                  {selected.notes && (
                    <div className="notice notice--warning" style={{ marginTop: 10 }}>
                      <AlertTriangle size={13} />
                      <span>{selected.notes}</span>
                    </div>
                  )}
                </div>

                <div className="inspector-section">
                  <div className="inspector-section-title">Identity</div>
                  <div className="form-grid">
                    <label className="field">
                      <span className="field-label">Row</span>
                      <select
                        className="select"
                        value={selected.rowId}
                        onChange={(event) => moveSeatToRow(selected.id, event.target.value)}
                      >
                        {layout.rows.map((row) => (
                          <option key={row.id} value={row.id}>
                            Row {row.label} ({row.seatIds.length})
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="field">
                      <span className="field-label">Seat no.</span>
                      <input
                        className="input input--number"
                        value={selected.seatNumber ?? ''}
                        placeholder="—"
                        onChange={(event) =>
                          updateSeat(selected.id, { seatNumber: event.target.value || undefined })
                        }
                      />
                    </label>
                    <label className="field field--wide">
                      <span className="field-label">Section</span>
                      <select
                        className="select"
                        value={selected.sectionId}
                        onChange={(event) =>
                          assignSeatsToSection([selected.id], event.target.value)
                        }
                      >
                        {layout.sections.map((section) => (
                          <option key={section.id} value={section.id}>
                            {section.name}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
                </div>

                <div className="inspector-section">
                  <div className="inspector-section-title">Status & type</div>
                  <div className="form-grid">
                    <label className="field">
                      <span className="field-label">Availability</span>
                      <select
                        className="select"
                        value={selected.status}
                        onChange={(event) =>
                          updateSeat(selected.id, {
                            status: event.target.value as SeatStatus,
                          })
                        }
                      >
                        {SEAT_STATUSES.map((status) => (
                          <option key={status.id} value={status.id}>
                            {status.label}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="field">
                      <span className="field-label">Seat type</span>
                      <select
                        className="select"
                        value={selected.type}
                        onChange={(event) =>
                          updateSeat(selected.id, { type: event.target.value as SeatType })
                        }
                      >
                        {SEAT_TYPES.map((type) => (
                          <option key={type.id} value={type.id}>
                            {type.label}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
                </div>

                <div className="inspector-section">
                  <div className="inspector-section-title">Geometry</div>
                  <div className="form-grid">
                    <label className="field">
                      <span className="field-label">X position</span>
                      <div className="input-group">
                        <input
                          className="input input--number"
                          type="number"
                          step="0.1"
                          value={(selected.x * 100).toFixed(1)}
                          onChange={(event) =>
                            updateSeat(selected.id, {
                              x: Math.max(0, Math.min(1, Number(event.target.value) / 100)),
                            })
                          }
                        />
                        <span className="input-unit">%</span>
                      </div>
                    </label>
                    <label className="field">
                      <span className="field-label">Y position</span>
                      <div className="input-group">
                        <input
                          className="input input--number"
                          type="number"
                          step="0.1"
                          value={(selected.y * 100).toFixed(1)}
                          onChange={(event) =>
                            updateSeat(selected.id, {
                              y: Math.max(0, Math.min(1, Number(event.target.value) / 100)),
                            })
                          }
                        />
                        <span className="input-unit">%</span>
                      </div>
                    </label>
                    <label className="field">
                      <span className="field-label">Rotation</span>
                      <div className="input-group">
                        <input
                          className="input input--number"
                          type="number"
                          step="1"
                          value={selected.rotation.toFixed(0)}
                          onChange={(event) =>
                            updateSeat(selected.id, {
                              rotation: Number(event.target.value) || 0,
                            })
                          }
                        />
                        <span className="input-unit">°</span>
                      </div>
                    </label>
                    <label className="field">
                      <span className="field-label">Row depth</span>
                      <input
                        className="input input--number"
                        value={
                          selectedRow
                            ? `${(selectedRow.depth * 100).toFixed(1)}%`
                            : '—'
                        }
                        readOnly
                      />
                    </label>
                  </div>
                </div>

                <div className="inspector-section">
                  <button
                    className="btn btn--danger btn--block"
                    onClick={() => deleteSeats([selected.id])}
                  >
                    <Trash2 size={13} />
                    Delete seat
                  </button>
                </div>
              </>
            )}

            {multiple && (
              <>
                <div className="selected-seat-card">
                  <div className="row row--between">
                    <h3>{selectedSeats.length} seats</h3>
                    <span className="badge badge--unknown">MULTI</span>
                  </div>
                  <p>Changes apply to every selected seat.</p>
                </div>
                <div className="inspector-section">
                  <div className="inspector-section-title">Bulk edit</div>
                  <div className="form-grid">
                    <label className="field">
                      <span className="field-label">Availability</span>
                      <select
                        className="select"
                        value=""
                        onChange={(event) =>
                          updateSeats(selectedSeatIds, {
                            status: event.target.value as SeatStatus,
                          })
                        }
                      >
                        <option value="" disabled>
                          Set status…
                        </option>
                        {SEAT_STATUSES.map((status) => (
                          <option key={status.id} value={status.id}>
                            {status.label}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="field">
                      <span className="field-label">Seat type</span>
                      <select
                        className="select"
                        value=""
                        onChange={(event) =>
                          updateSeats(selectedSeatIds, {
                            type: event.target.value as SeatType,
                          })
                        }
                      >
                        <option value="" disabled>
                          Set type…
                        </option>
                        {SEAT_TYPES.map((type) => (
                          <option key={type.id} value={type.id}>
                            {type.label}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="field field--wide">
                      <span className="field-label">Section</span>
                      <select
                        className="select"
                        value=""
                        onChange={(event) =>
                          assignSeatsToSection(selectedSeatIds, event.target.value)
                        }
                      >
                        <option value="" disabled>
                          Move to section…
                        </option>
                        {layout.sections.map((section) => (
                          <option key={section.id} value={section.id}>
                            {section.name}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
                  <div className="row" style={{ marginTop: 12 }}>
                    <button
                      className="btn btn--sm"
                      onClick={() => setSelectedSeats([])}
                    >
                      Clear selection
                    </button>
                    <button
                      className="btn btn--danger btn--sm"
                      onClick={() => deleteSeats(selectedSeatIds)}
                    >
                      <Trash2 size={12} />
                      Delete selected
                    </button>
                  </div>
                </div>
              </>
            )}

            {!selected && !multiple && (
              <>
                <div className="empty-state" style={{ padding: '28px 10px' }}>
                  <Crosshair size={22} />
                  <h3>No seat selected</h3>
                  <p>
                    Click a seat marker to inspect it. Shift-click to select several. Drag a
                    seat to correct its position.
                  </p>
                </div>
                <div className="inspector-section">
                  <div className="inspector-section-title">Detection summary</div>
                  <div className="summary-metric">
                    <span>Detected seats</span>
                    <strong>{layout.stats.detectedSeats}</strong>
                  </div>
                  <div className="summary-metric">
                    <span>Rows</span>
                    <strong>{layout.rows.length}</strong>
                  </div>
                  <div className="summary-metric">
                    <span>Sections</span>
                    <strong>{layout.sections.length}</strong>
                  </div>
                  <div className="summary-metric">
                    <span>Needs review</span>
                    <strong>{layout.stats.uncertainSeats}</strong>
                  </div>
                  <div className="summary-metric">
                    <span>Labels unreadable</span>
                    <strong>{layout.stats.unreadableLabels}</strong>
                  </div>
                </div>
                {layout.stats.warnings.length > 0 && (
                  <div className="inspector-section">
                    <div className="inspector-section-title">Review notes</div>
                    <div className="stack">
                      {layout.stats.warnings.slice(0, 4).map((warning) => (
                        <div className="notice notice--warning" key={warning}>
                          <AlertTriangle size={13} />
                          <span>{warning}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}
          </>
        )}

        {tab === 'rows' && (
          <>
            <div className="inspector-section">
              <div className="inspector-section-title">
                <span>Rows · front to back</span>
                <button className="btn btn--sm btn--ghost" onClick={regroupRows}>
                  <RotateCcw size={12} />
                  Regroup
                </button>
              </div>
              <div className="row-list">
                {layout.rows.map((row) => (
                  <button
                    key={row.id}
                    className={`row-list-item ${
                      selectedRow?.id === row.id ? 'is-selected' : ''
                    }`}
                    onClick={() => setSelectedSeats(row.seatIds)}
                  >
                    <span className="row-swatch">{row.label}</span>
                    <span>Row {row.label}</span>
                    <span className="count">
                      {row.seatIds.length} seats · {Math.round(row.confidence * 100)}%
                    </span>
                  </button>
                ))}
              </div>
            </div>

            {selectedRow && (
              <div className="inspector-section">
                <div className="inspector-section-title">Selected row</div>
                <div className="form-grid">
                  <label className="field">
                    <span className="field-label">Label</span>
                    <input
                      className="input"
                      value={selectedRow.label}
                      onChange={(event) =>
                        updateSeats(selectedRow.seatIds, { rowLabel: event.target.value })
                      }
                    />
                  </label>
                  <label className="field">
                    <span className="field-label">Seats</span>
                    <input className="input input--number" value={selectedRow.seatIds.length} readOnly />
                  </label>
                </div>
                <div className="row" style={{ marginTop: 10 }}>
                  <button className="btn btn--sm" onClick={() => setSelectedSeats(selectedRow.seatIds)}>
                    <Users size={12} />
                    Select row
                  </button>
                </div>
              </div>
            )}

            <div className="inspector-section">
              <div className="inspector-section-title">
                <span>Sections</span>
                <button className="btn btn--sm btn--ghost" onClick={addSection}>
                  <Plus size={12} />
                  Add
                </button>
              </div>
              <div className="row-list">
                {layout.sections.map((section) => (
                  <div key={section.id} className="row-list-item" style={{ cursor: 'default' }}>
                    <span
                      className="row-swatch"
                      style={{ background: section.color, borderColor: section.color }}
                    />
                    <input
                      className="input"
                      style={{ height: 25, fontSize: 10, background: 'transparent', border: 0, padding: 0 }}
                      value={section.name}
                      onChange={(event) => renameSection(section.id, event.target.value)}
                    />
                    <span className="count">{section.seatIds.length}</span>
                    <button
                      className="icon-btn"
                      style={{ width: 22, height: 22 }}
                      onClick={() => {
                        if (layout.sections.length <= 1) return;
                        removeSection(section.id);
                      }}
                      title="Remove section (seats move to first section)"
                    >
                      <Trash2 size={11} />
                    </button>
                  </div>
                ))}
              </div>
              {selectedSeatIds.length > 0 && (
                <div className="field" style={{ marginTop: 10 }}>
                  <span className="field-label">Assign selected seats</span>
                  <select
                    className="select"
                    value=""
                    onChange={(event) => assignSeatsToSection(selectedSeatIds, event.target.value)}
                  >
                    <option value="" disabled>
                      Choose section…
                    </option>
                    {layout.sections.map((section) => (
                      <option key={section.id} value={section.id}>
                        {section.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>
          </>
        )}

        {tab === 'detect' && (
          <>
            <div className="inspector-section">
              <div className="inspector-section-title">Detection quality</div>
              <div className="summary-metric">
                <span>Seats</span>
                <strong>{layout.stats.totalSeats}</strong>
              </div>
              <div className="summary-metric">
                <span>Manual additions</span>
                <strong>{layout.stats.manualSeats}</strong>
              </div>
              <div className="summary-metric">
                <span>Uncertain (&lt;65%)</span>
                <strong>{layout.stats.uncertainSeats}</strong>
              </div>
              <div className="summary-metric">
                <span>OCR labels read</span>
                <strong>
                  {layout.stats.totalSeats - layout.stats.unreadableLabels}/
                  {layout.stats.totalSeats}
                </strong>
              </div>
              <div className="summary-metric">
                <span>Processing time</span>
                <strong>{layout.stats.processingMs} ms</strong>
              </div>
              <div className="summary-metric">
                <span>OpenCV.js</span>
                <strong>{layout.stats.openCvUsed ? 'used' : 'fallback'}</strong>
              </div>
              <div className="summary-metric">
                <span>OCR</span>
                <strong>{layout.stats.ocrUsed ? 'used' : 'skipped'}</strong>
              </div>
            </div>

            {layout.stats.warnings.length > 0 && (
              <div className="inspector-section">
                <div className="inspector-section-title">Warnings</div>
                <div className="stack">
                  {layout.stats.warnings.map((warning) => (
                    <div className="notice notice--warning" key={warning}>
                      <AlertTriangle size={13} />
                      <span>{warning}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {layout.colorClusters.length > 0 && (
              <div className="inspector-section">
                <div className="inspector-section-title">Colour groups</div>
                <div className="color-cluster-list">
                  {layout.colorClusters.map((cluster) => (
                    <div className="color-cluster" key={cluster.id}>
                      <span
                        className="color-cluster-swatch"
                        style={{ background: cluster.color }}
                      />
                      <span className="color-cluster-text">
                        {cluster.count} seats · {cluster.status}
                      </span>
                    </div>
                  ))}
                </div>
                <p className="field-hint" style={{ marginTop: 8 }}>
                  Availability is inferred from colour groups. Use seat status controls to
                  correct it; the screenshot remains the source of truth.
                </p>
              </div>
            )}

            <div className="inspector-section">
              <div className="inspector-section-title">Source</div>
              <div className="row">
                <button
                  className="btn btn--sm"
                  onClick={() => {
                    if (originalImageUrl) window.open(originalImageUrl, '_blank', 'noopener');
                  }}
                  disabled={!originalImageUrl}
                >
                  <ArrowUpRight size={12} />
                  Open original screenshot
                </button>
              </div>
              <p className="field-hint" style={{ marginTop: 8 }}>
                {layout.imageWidth} × {layout.imageHeight} analysis image. The project keeps
                the original upload separately.
              </p>
            </div>
          </>
        )}

        {tab === 'screen' && (
          <>
            <div className="inspector-section">
              <div className="inspector-section-title">Screen placement</div>
              <div className="form-grid">
                <label className="field">
                  <span className="field-label">X1</span>
                  <input
                    className="input input--number"
                    type="number"
                    step="0.1"
                    value={(layout.screen.x1 * 100).toFixed(1)}
                    onChange={(event) =>
                      setScreenPlacement({ x1: Number(event.target.value) / 100 })
                    }
                  />
                </label>
                <label className="field">
                  <span className="field-label">Y1</span>
                  <input
                    className="input input--number"
                    type="number"
                    step="0.1"
                    value={(layout.screen.y1 * 100).toFixed(1)}
                    onChange={(event) =>
                      setScreenPlacement({ y1: Number(event.target.value) / 100 })
                    }
                  />
                </label>
                <label className="field">
                  <span className="field-label">X2</span>
                  <input
                    className="input input--number"
                    type="number"
                    step="0.1"
                    value={(layout.screen.x2 * 100).toFixed(1)}
                    onChange={(event) =>
                      setScreenPlacement({ x2: Number(event.target.value) / 100 })
                    }
                  />
                </label>
                <label className="field">
                  <span className="field-label">Y2</span>
                  <input
                    className="input input--number"
                    type="number"
                    step="0.1"
                    value={(layout.screen.y2 * 100).toFixed(1)}
                    onChange={(event) =>
                      setScreenPlacement({ y2: Number(event.target.value) / 100 })
                    }
                  />
                </label>
              </div>
              <div className="summary-metric" style={{ marginTop: 10 }}>
                <span>Screen angle</span>
                <strong>{screenAngle.toFixed(1)}°</strong>
              </div>
              <div className="summary-metric">
                <span>Confidence</span>
                <strong>{Math.round(layout.screen.confidence * 100)}%</strong>
              </div>
              <div className="summary-metric">
                <span>Source</span>
                <strong>{layout.screen.source}</strong>
              </div>
              <div className="row" style={{ marginTop: 10 }}>
                <button
                  className="btn btn--sm"
                  onClick={() =>
                    setScreenPlacement({
                      x1: layout.screen.x2,
                      x2: layout.screen.x1,
                      y1: layout.screen.y2,
                      y2: layout.screen.y1,
                    })
                  }
                >
                  <RotateCcw size={12} />
                  Flip endpoints
                </button>
                <button className="btn btn--sm btn--ghost" onClick={() => setEditorTool('screen')}>
                  <ScanLine size={12} />
                  Drag on image
                </button>
              </div>
            </div>

            <div className="inspector-section">
              <div className="inspector-section-title">Aisles & walkways</div>
              <div className="row-list">
                {layout.aisles.map((aisle) => (
                  <div className="row-list-item" key={aisle.id} style={{ cursor: 'default' }}>
                    <span className="row-swatch" style={{ fontSize: 7 }}>↕</span>
                    <span>
                      {aisle.orientation} · {(aisle.x * 100).toFixed(1)}%,{' '}
                      {(aisle.y * 100).toFixed(1)}%
                    </span>
                    <button
                      className="icon-btn"
                      style={{ width: 22, height: 22, marginLeft: 'auto' }}
                      onClick={() => deleteAisle(aisle.id)}
                    >
                      <Trash2 size={11} />
                    </button>
                  </div>
                ))}
                {layout.aisles.length === 0 && (
                  <p className="field-hint">No aisle markers. Seat gaps are preserved regardless.</p>
                )}
              </div>
              <button
                className="btn btn--sm"
                style={{ marginTop: 9 }}
                onClick={() => {
                  setEditorTool('aisle');
                  addAisle(0.5, 0.5, 'vertical');
                }}
              >
                <Plus size={12} />
                Add aisle marker
              </button>
            </div>

            <div className="inspector-section">
              <div className="inspector-section-title">Row geometry</div>
              <p className="field-hint">
                Screen changes re-project seat depth and regroup rows. Seat numbers, status,
                type and section assignments are preserved.
              </p>
              <button className="btn btn--sm" style={{ marginTop: 9 }} onClick={regroupRows}>
                <RotateCcw size={12} />
                Regroup rows now
              </button>
            </div>
          </>
        )}
      </div>
      <div className="inspector-foot">
        <button
          className="btn btn--primary btn--block"
          onClick={() => {
            if (!project) return;
            useAppStore.getState().setStage('configure');
          }}
        >
          Auditorium settings
          <ArrowUpRight size={13} />
        </button>
      </div>
    </aside>
  );
}
