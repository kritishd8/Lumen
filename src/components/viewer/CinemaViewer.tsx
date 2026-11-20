import { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  Armchair,
  ArrowLeft,
  Camera,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Download,
  Eye,
  Focus,
  GitCompareArrows,
  Info,
  Layers3,
  Lightbulb,
  Maximize2,
  Monitor,
  Move3d,
  RotateCcw,
  Save,
  Settings2,
  Users,
} from 'lucide-react';
import { useAppStore } from '@/app/store/useAppStore';
import { Modal } from '@/components/common/Modal';
import {
  buildSpatialGeometry,
  viewMetricsForSeat,
} from '@/modules/reconstruction/geometry';
import { CinemaScene, supportsWebGL } from '@/modules/three/CinemaScene';
import { SeatMapPicker } from './SeatMapPicker';
import type { Seat } from '@/types';

function seatLabel(seat: Seat): string {
  return `${seat.rowLabel}${seat.seatNumber ?? '—'}`;
}

function statusClass(status: Seat['status']): string {
  return status === 'available'
    ? 'badge--available'
    : status === 'occupied'
      ? 'badge--occupied'
      : 'badge--unknown';
}

export function CinemaViewer() {
  const project = useAppStore((state) => state.project);
  const imageUrl = useAppStore((state) => state.imageUrl);
  const selectedSeatIds = useAppStore((state) => state.selectedSeatIds);
  const selectSeat = useAppStore((state) => state.selectSeat);
  const cameraMode = useAppStore((state) => state.cameraMode);
  const enterSeatView = useAppStore((state) => state.enterSeatView);
  const exitSeatView = useAppStore((state) => state.exitSeatView);
  const requestCamera = useAppStore((state) => state.requestCamera);
  const requestLook = useAppStore((state) => state.requestLook);
  const cameraCommand = useAppStore((state) => state.cameraCommand);
  const lookRequest = useAppStore((state) => state.lookRequest);
  const enterComparison = useAppStore((state) => state.enterComparison);
  const setStage = useAppStore((state) => state.setStage);
  const setEditorTool = useAppStore((state) => state.setEditorTool);
  const saveCurrentProject = useAppStore((state) => state.saveCurrentProject);
  const exportCurrentProject = useAppStore((state) => state.exportCurrentProject);
  const addToast = useAppStore((state) => state.addToast);
  const viewerMainRef = useRef<HTMLDivElement>(null);
  const [look, setLook] = useState({ yaw: 0, pitch: 0 });
  const [lightsOn, setLightsOn] = useState(false);
  const [showAdvancedInfo, setShowAdvancedInfo] = useState(false);
  const [immersiveView, setImmersiveView] = useState(false);
  const webgl = useMemo(() => supportsWebGL(), []);

  const geometry = useMemo(
    () => (project ? buildSpatialGeometry(project.layout, project.config) : null),
    [project],
  );

  const selectedSeatId = selectedSeatIds[0] ?? null;
  const selectedSeat = useMemo(
    () => geometry?.seats.find((seat) => seat.seat.id === selectedSeatId) ?? null,
    [geometry, selectedSeatId],
  );

  const metrics = useMemo(
    () =>
      selectedSeat && geometry && project
        ? viewMetricsForSeat(selectedSeat, geometry, project.config)
        : null,
    [selectedSeat, geometry, project],
  );

  useEffect(() => {
    setLook({ yaw: lookRequest.yawDeg, pitch: lookRequest.pitchDeg });
  }, [lookRequest.nonce, lookRequest.yawDeg, lookRequest.pitchDeg]);

  useEffect(() => {
    const syncFullscreen = () => {
      setImmersiveView(document.fullscreenElement === viewerMainRef.current);
    };
    document.addEventListener('fullscreenchange', syncFullscreen);
    return () => document.removeEventListener('fullscreenchange', syncFullscreen);
  }, []);

  if (!project || !geometry) return null;

  const seat = selectedSeat?.seat ?? null;
  const seatCount = geometry.seats.length;
  const errors = geometry.validation.filter((issue) => issue.severity === 'error');
  const warnings = geometry.validation.filter((issue) => issue.severity === 'warning');
  const firstSeatId = project.layout.seats[0]?.id ?? null;
  const showingSeatChooser = cameraMode === 'overview' && !selectedSeatId;

  const applyLook = (yaw: number, pitch: number) => {
    const next = {
      yaw: Math.max(-110, Math.min(110, yaw)),
      pitch: Math.max(-65, Math.min(65, pitch)),
    };
    setLook(next);
    requestLook(next.yaw, next.pitch);
  };

  const openSeatView = (seatId: string) => {
    selectSeat(seatId);
    enterSeatView(seatId);
    requestLook(0, 0);
    setLook({ yaw: 0, pitch: 0 });
  };

  const switchToOverview = () => {
    if (cameraMode === 'seat') exitSeatView();
    requestCamera('fit');
  };

  const switchToSeat = () => {
    const seatId = selectedSeatId ?? firstSeatId;
    if (seatId) openSeatView(seatId);
  };

  const alignScreen = () => {
    setEditorTool('screen');
    setStage('verify');
  };

  const enterImmersiveView = () => {
    const viewer = viewerMainRef.current;
    if (!viewer?.requestFullscreen) {
      addToast({
        tone: 'error',
        title: 'Full-screen view unavailable',
        detail: 'This browser does not support full-screen viewing.',
      });
      return;
    }

    void viewer.requestFullscreen().catch((error: unknown) => {
      addToast({
        tone: 'error',
        title: 'Could not enter full screen',
        detail: error instanceof Error ? error.message : 'The browser denied the request.',
      });
    });
  };

  return (
    <div className={`viewer-screen${showingSeatChooser ? ' viewer-screen--chooser' : ''}`}>
      <div
        ref={viewerMainRef}
        className={`viewer-main${immersiveView ? ' viewer-main--immersive' : ''}`}
      >
        {showingSeatChooser ? (
          <div className="viewer-seat-chooser">
            <div className="viewer-chooser-heading">
              <span className="eyebrow">YOUR SEAT, YOUR VIEW</span>
              <h1>Choose a seat to see the screen</h1>
              <p>Pick any seat on your seating plan. Booked seats are still viewable.</p>
              <button className="btn btn--sm btn--ghost viewer-screen-align" onClick={alignScreen}>
                <Monitor size={13} />
                Adjust screen position
              </button>
            </div>
            {seatCount ? (
              <SeatMapPicker
                size="large"
                layout={project.layout}
                imageUrl={imageUrl}
                selectedSeatId={selectedSeatId}
                onSelect={openSeatView}
              />
            ) : (
              <div className="empty-state">
                <Focus size={22} />
                <h3>No seats were detected</h3>
                <p>Open the seat editor to add seats, then choose one to preview.</p>
                <button className="btn btn--primary" onClick={() => setStage('verify')}>
                  Open seat editor
                </button>
              </div>
            )}
          </div>
        ) : webgl ? (
          <CinemaScene
            className="viewer-canvas"
            geometry={geometry}
            config={project.config}
            layout={project.layout}
            mode={cameraMode}
            seatId={selectedSeatId}
            lightsOn={lightsOn}
            command={cameraCommand}
            lookRequest={lookRequest}
            onSelectSeat={(seatId) => {
              selectSeat(seatId);
              if (cameraMode === 'seat') {
                enterSeatView(seatId);
              }
            }}
            onDoubleClickSeat={(seatId) => openSeatView(seatId)}
          />
        ) : (
          <div className="webgl-fallback">
            <Layers3 size={26} />
            <h2>3D preview is unavailable</h2>
            <p>
              This browser could not create a WebGL context. Your reconstructed seat map
              and settings are still saved locally. You can continue editing in 2D, or
              enable hardware acceleration and reload.
            </p>
            <div className="row">
              <button className="btn" onClick={() => setStage('verify')}>
                <ArrowLeft size={13} />
                Back to editor
              </button>
              <button className="btn btn--primary" onClick={() => setStage('compare')}>
                <GitCompareArrows size={13} />
                Compare seats
              </button>
            </div>
          </div>
        )}

        {!showingSeatChooser && (
          <div className="viewer-overlay-top">
            <div className="viewer-mode-switch">
              <button
                className={cameraMode === 'overview' ? 'is-active' : ''}
                onClick={switchToOverview}
              >
                <Layers3 size={12} />
                Overview
              </button>
              <button
                className={cameraMode === 'seat' ? 'is-active' : ''}
                onClick={switchToSeat}
                disabled={!seatCount}
              >
                <Armchair size={12} />
                Seat view
              </button>
            </div>

            <div className="viewer-overlay-tools">
              <button
                className={`viewer-light-toggle ${lightsOn ? 'is-on' : ''}`}
                title={lightsOn ? 'Turn theater lights off' : 'Turn theater lights on'}
                aria-pressed={lightsOn}
                onClick={() => setLightsOn((on) => !on)}
              >
                <Lightbulb size={13} />
                <span>Lights {lightsOn ? 'on' : 'off'}</span>
              </button>
              <button
                className="icon-btn"
                title="Reset view"
                onClick={() => {
                  requestCamera('reset');
                  applyLook(0, 0);
                }}
              >
                <RotateCcw size={14} />
              </button>
              <button
                className="icon-btn"
                title="Compare two seats"
                onClick={enterComparison}
              >
                <GitCompareArrows size={14} />
              </button>
              {webgl && cameraMode === 'seat' && (
                <button
                  className="icon-btn"
                  title="Full-screen seat view (press Esc to exit)"
                  aria-label="Enter full-screen seat view"
                  onClick={enterImmersiveView}
                >
                  <Maximize2 size={14} />
                </button>
              )}
            </div>

            <div className="viewer-top-right">
              <span className="viewer-chip">
                <Users size={11} />
                <strong>{seatCount}</strong> seats
              </span>
              <span className="viewer-chip">
                <Monitor size={11} />
                <strong>{project.config.screen.widthM.toFixed(1)} m</strong> screen
              </span>
              <button
                className="icon-btn viewer-action-icon"
                title="Save project"
                aria-label="Save project"
                onClick={() => void saveCurrentProject()}
              >
                <Save size={14} />
              </button>
              <button
                className="icon-btn viewer-action-icon"
                title="Export project JSON"
                aria-label="Export project JSON"
                onClick={() => void exportCurrentProject()}
              >
                <Download size={14} />
              </button>
            </div>
          </div>
        )}

        {cameraMode === 'seat' && seat && (
          <div className="perspective-hud">
            <div className="perspective-title">
              <Eye size={13} />
              <div>
                <strong>
                  {seatLabel(seat)} · row {seat.rowLabel}
                </strong>
                <br />
                <span>
                  {metrics ? `${metrics.distanceM.toFixed(1)} m to screen` : 'Seat view'} ·
                  drag to look
                </span>
              </div>
            </div>
            <div className="look-pad">
              <button
                className="icon-btn"
                title="Look left"
                onClick={() => applyLook(look.yaw - 8, look.pitch)}
              >
                <ChevronLeft size={14} />
              </button>
              <button
                className="icon-btn"
                title="Look up"
                onClick={() => applyLook(look.yaw, look.pitch + 6)}
              >
                <ChevronUp size={14} />
              </button>
              <button
                className="icon-btn"
                title="Look down"
                onClick={() => applyLook(look.yaw, look.pitch - 6)}
              >
                <ChevronDown size={14} />
              </button>
              <button
                className="icon-btn"
                title="Look right"
                onClick={() => applyLook(look.yaw + 8, look.pitch)}
              >
                <ChevronRight size={14} />
              </button>
              <div className="look-pad-divider" />
              <button className="icon-btn" title="Face the screen" onClick={() => applyLook(0, 0)}>
                <Focus size={14} />
              </button>
            </div>
          </div>
        )}

        {!showingSeatChooser && (
          <div className="viewer-help">
            <span>
              <Move3d size={11} />
              {cameraMode === 'seat' ? 'Drag to look' : 'Drag to orbit'}
            </span>
            <span>
              <Maximize2 size={11} />
              Scroll to zoom
            </span>
            <span>
              <Camera size={11} />
              Double-click a seat
            </span>
          </div>
        )}
      </div>

      {!showingSeatChooser && (
        <aside className="viewer-sidebar">
          <div className="viewer-sidebar-scroll">
            {selectedSeat && metrics && seat ? (
              <>
                <div className="seat-info-hero">
                  <div className="seat-info-title">
                    <div>
                      <h3>{seatLabel(seat)}</h3>
                    </div>
                    <div className="row viewer-seat-heading-actions">
                      <span className={`badge ${statusClass(seat.status)}`}>{seat.status}</span>
                      <button
                        className="icon-btn"
                        type="button"
                        title="Advanced auditorium information"
                        aria-label="Show advanced auditorium information"
                        aria-expanded={showAdvancedInfo}
                        aria-haspopup="dialog"
                        onClick={() => setShowAdvancedInfo(true)}
                      >
                        <Info size={15} />
                      </button>
                    </div>
                  </div>
                  {cameraMode !== 'seat' && (
                    <div className="row" style={{ marginTop: 13 }}>
                      <button
                        className="btn btn--primary btn--sm btn--block"
                        onClick={() => openSeatView(seat.id)}
                      >
                        <Eye size={12} />
                        Enter seat view
                      </button>
                    </div>
                  )}
                </div>

                <div className="seat-info-grid">
                  <div className="metric-cell">
                    <span>Distance to screen</span>
                    <strong>
                      {metrics.distanceM.toFixed(1)}
                      <small>m</small>
                    </strong>
                  </div>
                  <div className="metric-cell">
                    <span>Horizontal angle</span>
                    <strong>
                      {Math.abs(metrics.horizontalAngleDeg).toFixed(1)}
                      <small>°</small>
                    </strong>
                  </div>
                  <div className="metric-cell">
                    <span>Screen width in view</span>
                    <strong>
                      {metrics.screenHorizontalFovDeg.toFixed(1)}
                      <small>°</small>
                    </strong>
                  </div>
                  <div className="metric-cell">
                    <span>Vertical sightline</span>
                    <strong>
                      {metrics.verticalAngleDeg.toFixed(1)}
                      <small>°</small>
                    </strong>
                  </div>
                  <div className="metric-cell">
                    <span>Estimated obstruction</span>
                    <strong>
                      {metrics.obstructionPercent.toFixed(0)}
                      <small>%</small>
                    </strong>
                  </div>
                  <div className="metric-cell">
                    <span>Eye height</span>
                    <strong>
                      {metrics.eyeHeightM.toFixed(2)}
                      <small>m</small>
                    </strong>
                  </div>
                </div>

                <div className="inspector-section" style={{ padding: '13px 16px' }}>
                  <div className="notice notice--info">
                    <Info size={13} />
                    <span>
                      Sightline and obstruction are geometric estimates from the configured
                      seat dimensions, not measurements of the real auditorium.
                    </span>
                  </div>
                  {metrics.obstructingSeatIds.length > 0 && (
                    <p className="field-hint" style={{ marginTop: 8 }}>
                      {metrics.obstructingSeatIds.length} seat
                      {metrics.obstructingSeatIds.length === 1 ? '' : 's'} may partially
                      intersect the sightline.
                    </p>
                  )}
                </div>
              </>
            ) : (
              <div className="empty-state" style={{ padding: '30px 20px' }}>
                <Focus size={22} />
                <h3>Select a seat</h3>
                <p>Choose a seat from the visual seat plan to inspect its perspective.</p>
                {firstSeatId && (
                  <button className="btn btn--primary btn--sm" onClick={() => openSeatView(firstSeatId)}>
                    <Eye size={12} />
                    Try the first seat
                  </button>
                )}
              </div>
            )}

          </div>

          <div className="viewer-sidebar-seat-plan">
            <SeatMapPicker
              size="compact"
              allowExpand
              title="Choose a seat"
              layout={project.layout}
              imageUrl={imageUrl}
              selectedSeatId={selectedSeatId}
              onSelect={openSeatView}
            />
            <button className="btn btn--sm btn--ghost btn--block" onClick={alignScreen}>
              <Monitor size={12} />
              Adjust screen position on image
            </button>
          </div>
        </aside>
      )}

      <Modal
        open={showAdvancedInfo}
        title="Advanced auditorium information"
        description="Reconstruction dimensions, analysis provenance, and geometry checks."
        onClose={() => setShowAdvancedInfo(false)}
        width={720}
        footer={
          <div className="row viewer-advanced-actions">
            <button className="btn btn--ghost" onClick={() => setStage('verify')}>
              <ArrowLeft size={13} />
              Editor
            </button>
            <button className="btn btn--primary" onClick={() => setStage('configure')}>
              <Settings2 size={13} />
              Advanced auditorium settings
            </button>
          </div>
        }
      >
        <div className="viewer-advanced-info">
          <div className="seat-info-hero">
            <div className="seat-info-title">
              <div>
                <h3>{project.config.screen.widthM.toFixed(1)} m</h3>
                <p>
                  screen · {project.config.screen.heightM.toFixed(2)} m high ·{' '}
                  {project.config.screen.curved ? 'curved' : 'flat'}
                </p>
              </div>
              <span className="badge badge--estimated">reconstruction</span>
            </div>
          </div>

          <div className="seat-info-grid">
            <div className="metric-cell">
              <span>Auditorium</span>
              <strong>
                {project.config.widthM.toFixed(1)} × {project.config.lengthM.toFixed(1)}
                <small>m</small>
              </strong>
            </div>
            <div className="metric-cell">
              <span>Ceiling</span>
              <strong>
                {project.config.ceilingHeightM.toFixed(1)}
                <small>m</small>
              </strong>
            </div>
            <div className="metric-cell">
              <span>Rows</span>
              <strong>{project.layout.rows.length}</strong>
            </div>
            <div className="metric-cell">
              <span>Sections</span>
              <strong>{project.layout.sections.length}</strong>
            </div>
            <div className="metric-cell">
              <span>Floor rake</span>
              <strong>
                {project.config.floor.slopePercent.toFixed(1)}
                <small>%</small>
              </strong>
            </div>
            <div className="metric-cell">
              <span>Last row</span>
              <strong>
                {geometry.dimensions.maxZ.toFixed(1)}
                <small>m</small>
              </strong>
            </div>
          </div>

          <div className="inspector-section viewer-advanced-provenance">
            <div className="inspector-section-title">Provenance</div>
            <div className="summary-metric">
              <span>Detected seats</span>
              <strong>{project.layout.stats.detectedSeats}</strong>
            </div>
            <div className="summary-metric">
              <span>Manual seats</span>
              <strong>{project.layout.stats.manualSeats}</strong>
            </div>
            <div className="summary-metric">
              <span>Uncertain (&lt;65%)</span>
              <strong>{project.layout.stats.uncertainSeats}</strong>
            </div>
            <div className="summary-metric">
              <span>OpenCV.js</span>
              <strong>{project.layout.stats.openCvUsed ? 'used' : 'fallback'}</strong>
            </div>
            <div className="summary-metric">
              <span>OCR</span>
              <strong>{project.layout.stats.ocrUsed ? 'used' : 'skipped'}</strong>
            </div>
          </div>

          {(errors.length > 0 || warnings.length > 0) && (
            <div className="inspector-section viewer-advanced-checks">
              <div className="inspector-section-title">Geometry checks</div>
              <div className="stack">
                {[...errors, ...warnings].slice(0, 4).map((issue) => (
                  <div
                    key={issue.id}
                    className={`issue-row ${
                      issue.severity === 'error' ? 'is-error' : 'is-warning'
                    }`}
                  >
                    <AlertTriangle size={12} />
                    <span>
                      <strong style={{ display: 'block', color: 'inherit' }}>
                        {issue.title}
                      </strong>
                      {issue.detail}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </Modal>
    </div>
  );
}
