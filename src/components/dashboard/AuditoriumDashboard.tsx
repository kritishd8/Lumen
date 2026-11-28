import { useMemo, useState } from 'react';
import { Armchair, ChevronRight, Layers3, Lightbulb, Maximize2, Monitor, RotateCcw, Settings2, SlidersHorizontal } from 'lucide-react';
import { useAppStore } from '@/app/store/useAppStore';
import { Modal } from '@/components/common/Modal';
import { SeatMapPicker } from '@/components/viewer/SeatMapPicker';
import { buildSpatialGeometry, viewMetricsForSeat } from '@/modules/reconstruction/geometry';
import { CinemaScene, supportsWebGL } from '@/modules/three/CinemaScene';
import type { ConfigFieldKey, FloorPreset } from '@/types';

type Tab = 'room' | 'basic' | 'advanced';

function NumberSetting({ label, field, value, min, max, step = 0.1 }: { label: string; field: ConfigFieldKey; value: number; min: number; max: number; step?: number }) {
  const update = useAppStore((state) => state.updateConfigField);
  return <label className="lumen-setting"><span>{label}</span><div><input type="number" value={Number.isFinite(value) ? value : ''} min={min} max={max} step={step} onChange={(event) => update(field, Number(event.target.value))}/><small>m</small></div></label>;
}

export function AuditoriumDashboard() {
  const project = useAppStore((state) => state.project);
  const imageUrl = useAppStore((state) => state.imageUrl);
  const selectedSeatIds = useAppStore((state) => state.selectedSeatIds);
  const selectSeat = useAppStore((state) => state.selectSeat);
  const cameraMode = useAppStore((state) => state.cameraMode);
  const enterSeatView = useAppStore((state) => state.enterSeatView);
  const exitSeatView = useAppStore((state) => state.exitSeatView);
  const requestCamera = useAppStore((state) => state.requestCamera);
  const cameraCommand = useAppStore((state) => state.cameraCommand);
  const lookRequest = useAppStore((state) => state.lookRequest);
  const setStage = useAppStore((state) => state.setStage);
  const setFloorPreset = useAppStore((state) => state.setFloorPreset);
  const setMaterialPreset = useAppStore((state) => state.setMaterialPreset);
  const setConfigFlag = useAppStore((state) => state.setConfigFlag);
  const goHome = useAppStore((state) => state.goHome);
  const [tab, setTab] = useState<Tab>('room');
  const [seatPlanOpen, setSeatPlanOpen] = useState(false);
  const [lightsOn, setLightsOn] = useState(false);
  const webgl = useMemo(() => supportsWebGL(), []);
  const geometry = useMemo(() => project ? buildSpatialGeometry(project.layout, project.config) : null, [project]);
  if (!project || !geometry) return null;

  const seatId = selectedSeatIds[0] ?? project.layout.seats[0]?.id ?? null;
  const spatialSeat = geometry.seats.find((entry) => entry.seat.id === seatId);
  const metrics = spatialSeat ? viewMetricsForSeat(spatialSeat, geometry, project.config) : null;
  const chooseSeat = (id: string) => { selectSeat(id); enterSeatView(id); setSeatPlanOpen(false); };
  const openOverview = () => { exitSeatView(); requestCamera('fit'); };

  return <div className="lumen-workspace">
    <header className="lumen-workspace-header">
      <button className="lumen-wordmark" onClick={goHome} aria-label="Back to Lumen home"><i /><strong>Lumen</strong></button>
      <div className="lumen-project-name"><span>{project.name}</span><em>Auto-saved</em></div>
      <div className="lumen-header-actions"><button className="lumen-header-button" onClick={() => setStage('verify')}>Edit plan</button><button className="lumen-header-button lumen-header-button--dark" onClick={() => setSeatPlanOpen(true)}>Choose a seat</button></div>
    </header>
    <main className="lumen-workspace-main">
      <section className="lumen-stage" aria-label="Live 3D auditorium preview">
        {webgl ? <CinemaScene className="lumen-cinema-canvas" geometry={geometry} config={project.config} layout={project.layout} mode={cameraMode} seatId={seatId} lightsOn={lightsOn} command={cameraCommand} lookRequest={lookRequest} onSelectSeat={selectSeat} onDoubleClickSeat={chooseSeat} /> : <div className="lumen-canvas-fallback"><Layers3 size={26}/><strong>3D preview unavailable</strong><span>Enable hardware acceleration to see this room.</span></div>}
        <div className="lumen-stage-top"><div className="lumen-view-switch"><button className={cameraMode === 'overview' ? 'is-active' : ''} onClick={openOverview}><Layers3 size={14}/>Room</button><button className={cameraMode === 'seat' ? 'is-active' : ''} onClick={() => seatId && enterSeatView(seatId)}><Armchair size={14}/>Seat view</button></div><div className="lumen-stage-actions"><button title="Toggle lights" className={lightsOn ? 'is-active' : ''} onClick={() => setLightsOn((value) => !value)}><Lightbulb size={15}/></button><button title="Fit room" onClick={() => requestCamera('fit')}><Maximize2 size={15}/></button><button title="Reset camera" onClick={() => requestCamera('reset')}><RotateCcw size={15}/></button></div></div>
        {cameraMode === 'seat' && spatialSeat && <div className="lumen-seat-card"><span>Viewing</span><strong>Row {spatialSeat.seat.rowLabel} · Seat {spatialSeat.seat.seatNumber ?? '—'}</strong><small>{metrics ? `${metrics.distanceM.toFixed(1)} m from screen` : 'Perspective preview'}</small></div>}
        <p className="lumen-stage-hint">Drag to {cameraMode === 'seat' ? 'look around' : 'orbit'} · scroll to zoom</p>
      </section>
      <aside className="lumen-control-panel">
        <nav className="lumen-tabs"><button className={tab === 'room' ? 'is-active' : ''} onClick={() => setTab('room')}><Monitor size={15}/>Auditorium</button><button className={tab === 'basic' ? 'is-active' : ''} onClick={() => setTab('basic')}><SlidersHorizontal size={15}/>Basic</button><button className={tab === 'advanced' ? 'is-active' : ''} onClick={() => setTab('advanced')}><Settings2 size={15}/>Advanced</button></nav>
        <div className="lumen-panel-content">
          {tab === 'room' && <><p className="lumen-panel-kicker">Live reconstruction</p><h1>Your auditorium, ready to explore.</h1><p className="lumen-panel-lede">Every control updates the room immediately. Start by choosing a seat, or refine the scale on the next tab.</p><div className="lumen-stat-grid"><div><strong>{geometry.seats.length}</strong><span>seats</span></div><div><strong>{project.layout.rows.length}</strong><span>rows</span></div><div><strong>{project.config.screen.widthM.toFixed(1)}m</strong><span>screen</span></div><div><strong>{project.config.floor.slopePercent}%</strong><span>rake</span></div></div><button className="lumen-seat-picker-button" onClick={() => setSeatPlanOpen(true)}><Armchair size={16}/><span><b>Choose another seat</b><small>Switch the perspective instantly</small></span><ChevronRight size={16}/></button><div className="lumen-note">This is a spatial estimate from your uploaded plan. Edit the plan whenever a row, screen edge, or seat needs correction.</div></>}
          {tab === 'basic' && <><p className="lumen-panel-kicker">Scale the room</p><h1>Set the few things that matter most.</h1><p className="lumen-panel-lede">Lumen estimates these values from the seating plan. Override them when you know the real dimensions.</p><div className="lumen-settings"><NumberSetting label="Screen width" field="screen.widthM" value={project.config.screen.widthM} min={2} max={50}/><NumberSetting label="Room width" field="widthM" value={project.config.widthM} min={4} max={60}/><NumberSetting label="Room depth" field="lengthM" value={project.config.lengthM} min={5} max={100}/><NumberSetting label="Row spacing" field="rowSpacingM" value={project.config.rowSpacingM} min={0.5} max={3}/></div><div className="lumen-choice"><span>Floor rake</span><div>{(['flat','slight','standard','steep'] as FloorPreset[]).map((preset) => <button key={preset} className={project.config.floor.preset === preset ? 'is-active' : ''} onClick={() => setFloorPreset(preset)}>{preset}</button>)}</div></div></>}
          {tab === 'advanced' && <><p className="lumen-panel-kicker">Fine tune</p><h1>Make the model feel closer to the real room.</h1><p className="lumen-panel-lede">These controls change the rendered auditorium without changing the detected plan.</p><div className="lumen-settings"><NumberSetting label="Ceiling height" field="ceilingHeightM" value={project.config.ceilingHeightM} min={2} max={30}/><NumberSetting label="Screen elevation" field="screen.elevationM" value={project.config.screen.elevationM} min={0} max={5}/><NumberSetting label="Seat width" field="seating.seatWidthM" value={project.config.seating.seatWidthM} min={0.3} max={2}/><NumberSetting label="Seat depth" field="seating.seatDepthM" value={project.config.seating.seatDepthM} min={0.3} max={2}/></div><div className="lumen-toggle"><span><b>Curved screen</b><small>Use when the real screen wraps slightly</small></span><button className={project.config.screen.curved ? 'is-active' : ''} onClick={() => setConfigFlag('screen.curved', !project.config.screen.curved)}><i /></button></div><div className="lumen-choice"><span>Seat finish</span><div>{['charcoal','burgundy','navy'].map((preset) => <button key={preset} className={project.config.materialPreset === preset ? 'is-active' : ''} onClick={() => setMaterialPreset(preset as 'charcoal' | 'burgundy' | 'navy')}>{preset.replace('-', ' ')}</button>)}</div></div></>}
        </div>
      </aside>
    </main>
    <Modal open={seatPlanOpen} title="Choose a seat" description="Pick any point on the plan. The rendered view updates immediately." onClose={() => setSeatPlanOpen(false)} width={850} footer={<button className="btn btn--primary" onClick={() => setSeatPlanOpen(false)}>Done</button>}><SeatMapPicker layout={project.layout} imageUrl={imageUrl} selectedSeatId={seatId} onSelect={chooseSeat} size="large" /></Modal>
  </div>;
}
