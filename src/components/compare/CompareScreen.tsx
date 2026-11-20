import { useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Eye,
  Focus,
  GitCompareArrows,
  Layers3,
  Lightbulb,
  RefreshCw,
  ScanEye,
} from 'lucide-react';
import { useAppStore } from '@/app/store/useAppStore';
import {
  buildSpatialGeometry,
  viewMetricsForSeat,
} from '@/modules/reconstruction/geometry';
import { CinemaScene, supportsWebGL } from '@/modules/three/CinemaScene';
import { SeatMapPicker } from '@/components/viewer/SeatMapPicker';
import type {
  AuditoriumConfig,
  Seat,
  SpatialGeometry,
  SpatialSeat,
  ViewMetrics,
} from '@/types';

function seatLabel(seat: Seat): string {
  return `${seat.rowLabel}${seat.seatNumber ?? '—'}`;
}

function metricsFor(
  seatId: string | null,
  geometry: SpatialGeometry,
  config: AuditoriumConfig,
): ViewMetrics | null {
  if (!seatId) return null;
  const spatial = geometry.seats.find((seat) => seat.seat.id === seatId);
  if (!spatial) return null;
  return viewMetricsForSeat(spatial, geometry, config);
}

export function CompareScreen() {
  const project = useAppStore((state) => state.project);
  const imageUrl = useAppStore((state) => state.imageUrl);
  const compareSeatIds = useAppStore((state) => state.compareSeatIds);
  const setCompareSeat = useAppStore((state) => state.setCompareSeat);
  const setStage = useAppStore((state) => state.setStage);
  const enterSeatView = useAppStore((state) => state.enterSeatView);
  const selectSeat = useAppStore((state) => state.selectSeat);
  const [look, setLook] = useState({ yaw: 0, pitch: 0 });
  const [lightsOn, setLightsOn] = useState(false);
  const webgl = useMemo(() => supportsWebGL(), []);

  const geometry = useMemo(
    () => (project ? buildSpatialGeometry(project.layout, project.config) : null),
    [project],
  );

  useEffect(() => {
    if (!project) return;
    const first = project.layout.seats[0]?.id ?? null;
    const second = project.layout.seats[1]?.id ?? first;
    if (!compareSeatIds[0] && first) setCompareSeat(0, first);
    if (!compareSeatIds[1] && second) setCompareSeat(1, second);
  }, [project, compareSeatIds, setCompareSeat]);

  if (!project || !geometry) return null;

  const seats = geometry.seats;
  const paneSeats: [SpatialSeat | null, SpatialSeat | null] = [
    seats.find((seat) => seat.seat.id === compareSeatIds[0]) ?? null,
    seats.find((seat) => seat.seat.id === compareSeatIds[1]) ?? null,
  ];
  const metrics: [ViewMetrics | null, ViewMetrics | null] = [
    metricsFor(compareSeatIds[0], geometry, project.config),
    metricsFor(compareSeatIds[1], geometry, project.config),
  ];
  const lookRequest = { yawDeg: look.yaw, pitchDeg: look.pitch, nonce: 0 };

  if (!project.layout.seats.length) {
    return (
      <div className="compare-screen">
        <div className="compare-head">
          <button className="btn btn--sm" onClick={() => setStage('verify')}>
            <ArrowLeft size={13} />
            Back to editor
          </button>
          <div>
            <h1>Seat comparison</h1>
            <p>No seats are available to compare.</p>
          </div>
        </div>
        <div className="empty-state" style={{ flex: 1 }}>
          <ScanEye size={24} />
          <h3>The layout has no seats</h3>
          <p>Add seats in the verification editor, then return here to compare perspectives.</p>
          <button className="btn btn--primary" onClick={() => setStage('verify')}>
            Open 2D editor
            <ArrowRight size={13} />
          </button>
        </div>
      </div>
    );
  }

  const openInViewer = (seatId: string | null) => {
    if (!seatId) return;
    selectSeat(seatId);
    enterSeatView(seatId);
    setStage('viewer');
  };

  const swap = () => {
    setCompareSeat(0, compareSeatIds[1]);
    setCompareSeat(1, compareSeatIds[0]);
  };

  const nudge = (yaw: number, pitch: number) => {
    setLook({
      yaw: Math.max(-110, Math.min(110, yaw)),
      pitch: Math.max(-65, Math.min(65, pitch)),
    });
  };

  return (
    <div className="compare-screen">
      <div className="compare-head">
        <button className="btn btn--sm" onClick={() => setStage('viewer')}>
          <ArrowLeft size={13} />
          Auditorium
        </button>
        <div>
          <h1>Seat-to-seat comparison</h1>
          <p>
            Same auditorium, same screen, two real seat positions · look direction is
            synchronised
          </p>
        </div>
        <div className="compare-tools">
          <button
            className={`btn btn--sm ${lightsOn ? 'btn--primary' : ''}`}
            aria-pressed={lightsOn}
            onClick={() => setLightsOn((on) => !on)}
          >
            <Lightbulb size={12} />
            Lights {lightsOn ? 'on' : 'off'}
          </button>
          <button
            className="icon-btn"
            title="Swap comparison seats"
            aria-label="Swap comparison seats"
            onClick={swap}
          >
            <RefreshCw size={14} />
          </button>
        </div>
      </div>

      <div className="compare-grid">
        {([0, 1] as const).map((index) => {
          const spatial = paneSeats[index];
          const paneMetrics = metrics[index];
          return (
            <div className="compare-pane" key={index}>
              <div className="compare-seat-plan">
                <SeatMapPicker
                  size="compact"
                  allowExpand
                  title={`Choose seat ${index === 0 ? 'A' : 'B'}`}
                  layout={project.layout}
                  imageUrl={imageUrl}
                  selectedSeatId={compareSeatIds[index]}
                  onSelect={(seatId) => setCompareSeat(index, seatId)}
                />
              </div>
              <div className="compare-canvas">
                {webgl && spatial ? (
                  <CinemaScene
                    geometry={geometry}
                    config={project.config}
                    layout={project.layout}
                    mode="seat"
                    seatId={spatial.seat.id}
                    lightsOn={lightsOn}
                    command={{ type: 'fit', nonce: 0 }}
                    lookRequest={lookRequest}
                    interactive={false}
                  />
                ) : (
                  <div className="webgl-fallback">
                    <Layers3 size={22} />
                    <h2>{webgl ? 'Seat unavailable' : 'WebGL unavailable'}</h2>
                    <p>
                      {webgl
                        ? 'This seat is no longer part of the layout.'
                        : 'The browser could not create a 3D context. The numeric comparison below is still available.'}
                    </p>
                  </div>
                )}
                <div className="compare-label">
                  <span className="badge badge--user">{index === 0 ? 'A' : 'B'}</span>
                  {spatial ? (
                    <>
                      <strong>{seatLabel(spatial.seat)}</strong>
                      <span>
                        row {spatial.seat.rowLabel} · {spatial.seat.type}
                      </span>
                    </>
                  ) : (
                    <strong>No seat selected</strong>
                  )}
                </div>
              </div>

              <div className="compare-metrics">
                <div className="compare-metric">
                  <span>Distance</span>
                  <strong>{paneMetrics ? `${paneMetrics.distanceM.toFixed(1)} m` : '—'}</strong>
                </div>
                <div className="compare-metric">
                  <span>Horiz. angle</span>
                  <strong>
                    {paneMetrics ? `${Math.abs(paneMetrics.horizontalAngleDeg).toFixed(1)}°` : '—'}
                  </strong>
                </div>
                <div className="compare-metric">
                  <span>Screen width</span>
                  <strong>
                    {paneMetrics ? `${paneMetrics.screenHorizontalFovDeg.toFixed(1)}°` : '—'}
                  </strong>
                </div>
                <div className="compare-metric">
                  <span>Vert. angle</span>
                  <strong>
                    {paneMetrics ? `${paneMetrics.verticalAngleDeg.toFixed(1)}°` : '—'}
                  </strong>
                </div>
                <div className="compare-metric">
                  <span>Obstruction</span>
                  <strong>
                    {paneMetrics ? `${paneMetrics.obstructionPercent.toFixed(0)}%` : '—'}
                  </strong>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="compare-foot">
        <div className="look-pad">
          <button className="icon-btn" title="Look left" onClick={() => nudge(look.yaw - 8, look.pitch)}>
            <ChevronLeft size={14} />
          </button>
          <button className="icon-btn" title="Look up" onClick={() => nudge(look.yaw, look.pitch + 6)}>
            <ChevronUp size={14} />
          </button>
          <button className="icon-btn" title="Look down" onClick={() => nudge(look.yaw, look.pitch - 6)}>
            <ChevronDown size={14} />
          </button>
          <button className="icon-btn" title="Look right" onClick={() => nudge(look.yaw + 8, look.pitch)}>
            <ChevronRight size={14} />
          </button>
          <div className="look-pad-divider" />
          <button className="icon-btn" title="Face the screen in both views" onClick={() => nudge(0, 0)}>
            <Focus size={14} />
          </button>
        </div>

        <p className="compare-note">
          Both panes use the detected seat coordinates and the same screen geometry.
          Differences come from real position, row elevation and horizontal offset — not
          from duplicated generic camera presets. Obstruction is a geometric estimate.
        </p>

        <div className="row" style={{ marginLeft: 'auto' }}>
          <button
            className="btn btn--sm"
            onClick={() => openInViewer(compareSeatIds[0])}
            disabled={!compareSeatIds[0]}
          >
            <Eye size={12} />
            Open A in 3D
          </button>
          <button
            className="btn btn--sm btn--primary"
            onClick={() => openInViewer(compareSeatIds[1])}
            disabled={!compareSeatIds[1]}
          >
            <GitCompareArrows size={12} />
            Open B in 3D
          </button>
        </div>
      </div>
    </div>
  );
}
