import { useMemo, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from 'react';
import { ArrowUpRight, ChevronRight, Eye, Layers3, Lightbulb, Maximize2, Upload, X } from 'lucide-react';
import { useAppStore } from '@/app/store/useAppStore';
import { buildSpatialGeometry, viewMetricsForSeat } from '@/modules/reconstruction/geometry';
import { CinemaScene, supportsWebGL } from '@/modules/three/CinemaScene';
import { FLOOR_PRESETS, SCREEN_PRESETS } from '@/utils/defaults';
import type { ConfigFieldKey } from '@/types';

const SAMPLE_PATH = '/test-seating-plan.png';

function Brand() { return <button className="lf-brand" onClick={() => useAppStore.getState().goHome()}><i /><span>Lumen</span></button>; }

function UploadTrigger({ compact = false }: { compact?: boolean }) {
  const input = useRef<HTMLInputElement>(null);
  const upload = useAppStore((state) => state.uploadAndAnalyze);
  return <><button className={compact ? 'lf-button lf-button--quiet' : 'lf-button lf-button--primary'} onClick={() => input.current?.click()}>{compact ? 'New plan' : <><Upload size={17}/>Upload a seat plan <ArrowUpRight size={17}/></>}</button><input ref={input} hidden type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => { const file = event.target.files?.[0]; if (file) void upload(file); event.target.value = ''; }} /></>;
}

function Landing() {
  const upload = useAppStore((state) => state.uploadAndAnalyze);
  const [loadingSample, setLoadingSample] = useState(false);
  const useSample = async () => { setLoadingSample(true); try { const response = await fetch(SAMPLE_PATH); const blob = await response.blob(); await upload(new File([blob], 'sample-cinema-plan.png', { type: blob.type || 'image/png' })); } finally { setLoadingSample(false); } };
  return <section className="lf-landing"><header className="lf-landing-header"><Brand/><UploadTrigger compact/></header><div className="lf-landing-center"><h1>Turn seat plans<br/>into <em>3D rooms.</em></h1><p>Upload a cinema seating plan. Lumen reads the room, lets you check the result, then opens a view from every seat.</p><div className="lf-landing-actions"><UploadTrigger/><button className="lf-sample" disabled={loadingSample} onClick={() => void useSample()}>{loadingSample ? 'Opening sample…' : 'Try a sample seating plan'} <ArrowUpRight size={14}/></button></div></div><div className="lf-landing-foot"><span>Local analysis</span><i/><span>Nothing is uploaded to a server</span></div></section>;
}

function Analyzing() {
  const analysis = useAppStore((state) => state.analysis);
  const cancel = useAppStore((state) => state.cancelAnalysis);
  return <section className="lf-analysis"><Brand/><div className="lf-analysis-card"><div className="lf-orbit"><i/><i/><i/></div><h1>Reading the room.</h1><p>{analysis.step || 'Preparing your seating plan'}</p><div className="lf-progress"><span style={{ '--progress': Math.max(.04, analysis.percent / 100) } as CSSProperties & Record<string, number>}/></div><small>{Math.round(analysis.percent)}% complete</small><button onClick={cancel}>Cancel</button></div></section>;
}

function PlanReview() {
  const project = useAppStore((state) => state.project)!;
  const imageUrl = useAppStore((state) => state.imageUrl);
  const selectedSeatIds = useAppStore((state) => state.selectedSeatIds);
  const selectSeat = useAppStore((state) => state.selectSeat);
  const setScreenPlacement = useAppStore((state) => state.setScreenPlacement);
  const setStage = useAppStore((state) => state.setStage);
  const [draggingScreen, setDraggingScreen] = useState(false);
  const selected = project.layout.seats.find((seat) => seat.id === selectedSeatIds[0]) ?? project.layout.seats[0] ?? null;
  const screenY = ((project.layout.screen.y1 + project.layout.screen.y2) / 2) * 100;
  const moveScreen = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!draggingScreen) return;
    const bounds = event.currentTarget.parentElement?.getBoundingClientRect();
    if (!bounds) return;
    const y = Math.max(.03, Math.min(.97, (event.clientY - bounds.top) / bounds.height));
    setScreenPlacement({ y1: y, y2: y, source: 'manual', confidence: 1 });
  };
  return <section className="lf-review-shell"><header className="lf-review-header"><Brand/><div><strong>{project.layout.seats.length} seats found</strong></div><button className="lf-button lf-button--primary" onClick={() => setStage('viewer')}>Open auditorium <ArrowUpRight size={16}/></button></header><article className="lf-review-dialog"><div className="lf-review-intro"><div><h1>Choose the seat you want to see from.</h1><p>Select any seat. Drag the screen line on the plan if it needs correcting.</p></div></div><div className="lf-review-layout"><div className="lf-plan-frame"><div className="lf-picker-map lf-review-map" style={{ aspectRatio: `${project.layout.imageWidth}/${project.layout.imageHeight}` }}>{imageUrl && <img src={imageUrl} alt="Uploaded seating plan"/>}<div className={`lf-screen-guide ${draggingScreen ? 'is-dragging' : ''}`} style={{ top: `${screenY}%` }} onPointerDown={(event) => { event.currentTarget.setPointerCapture(event.pointerId); setDraggingScreen(true); }} onPointerMove={moveScreen} onPointerUp={() => setDraggingScreen(false)} onPointerCancel={() => setDraggingScreen(false)} role="slider" aria-label="Screen position" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(screenY)} tabIndex={0}><span>Drag to position screen</span></div>{project.layout.seats.map((seat) => <button key={seat.id} className={`lf-seat-dot ${selected?.id === seat.id ? 'is-selected' : ''}`} style={{ left: `${seat.x*100}%`, top: `${seat.y*100}%` }} onClick={() => selectSeat(seat.id)} aria-label={`Row ${seat.rowLabel}, seat ${seat.seatNumber ?? 'unknown'}`}/>)}</div></div><aside className="lf-seat-editor"><span>Selected seat</span><h2>{selected ? `Row ${selected.rowLabel} · ${selected.seatNumber ?? '—'}` : 'Choose a seat'}</h2><p>This is the camera position used in the auditorium.</p><div className="lf-screen-tip">Drag the line over the plan to correct the screen position.</div><button className="lf-button lf-button--primary" onClick={() => setStage('viewer')}>Open auditorium <ArrowUpRight size={15}/></button></aside></div></article></section>;
}

function NumberInput({ label, field, value, min, max, step = .1 }: { label: string; field: ConfigFieldKey; value: number; min: number; max: number; step?: number }) { const update = useAppStore((state) => state.updateConfigField); return <label className="lf-number"><span>{label}</span><input type="number" min={min} max={max} step={step} value={value} onChange={(event) => update(field, Number(event.target.value))}/><small>m</small></label>; }

function Studio() {
  const project = useAppStore((state) => state.project)!;
  const imageUrl = useAppStore((state) => state.imageUrl);
  const selectedSeatIds = useAppStore((state) => state.selectedSeatIds);
  const selectSeat = useAppStore((state) => state.selectSeat);
  const setStage = useAppStore((state) => state.setStage);
  const cameraMode = useAppStore((state) => state.cameraMode);
  const enterSeatView = useAppStore((state) => state.enterSeatView);
  const exitSeatView = useAppStore((state) => state.exitSeatView);
  const requestCamera = useAppStore((state) => state.requestCamera);
  const cameraCommand = useAppStore((state) => state.cameraCommand);
  const lookRequest = useAppStore((state) => state.lookRequest);
  const setFloorPreset = useAppStore((state) => state.setFloorPreset);
  const setScreenPreset = useAppStore((state) => state.setScreenPreset);
  const updateConfigField = useAppStore((state) => state.updateConfigField);
  const setConfigFlag = useAppStore((state) => state.setConfigFlag);
  const geometry = useMemo(() => buildSpatialGeometry(project.layout, project.config), [project]);
  const webgl = useMemo(() => supportsWebGL(), []);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [lightsOn, setLightsOn] = useState(false);
  const cinemaRef = useRef<HTMLElement>(null);
  const seat = project.layout.seats.find((item) => item.id === selectedSeatIds[0]) ?? project.layout.seats[0] ?? null;
  const spatialSeat = geometry.seats.find((item) => item.seat.id === seat?.id);
  const metrics = spatialSeat ? viewMetricsForSeat(spatialSeat, geometry, project.config) : null;
  const selectView = (id: string) => { selectSeat(id); enterSeatView(id); setPickerOpen(false); };
  const fullscreen = () => { void cinemaRef.current?.requestFullscreen?.(); };
  return <section className="lf-studio">
    <header className="lf-studio-header"><Brand/><div className="lf-project"><span>{project.name}</span><i/> Saved locally</div></header>
    <div className="lf-studio-body">
      <section ref={cinemaRef} className="lf-cinema">
        <div className="lf-cinema-toolbar"><div><button className={cameraMode === 'overview' ? 'is-active' : ''} onClick={() => { exitSeatView(); requestCamera('fit'); }}><Layers3 size={14}/>Room</button><button className={cameraMode === 'seat' ? 'is-active' : ''} onClick={() => seat && enterSeatView(seat.id)}><Eye size={14}/>Seat view</button></div><div><button onClick={fullscreen} aria-label="Enter fullscreen"><Maximize2 size={15}/></button><button className={lightsOn ? 'is-active' : ''} onClick={() => setLightsOn((value) => !value)} aria-label={lightsOn ? 'Turn auditorium lights off' : 'Turn auditorium lights on'}><Lightbulb size={15}/></button></div></div>
        {webgl ? <CinemaScene className="lf-cinema-canvas" geometry={geometry} config={project.config} layout={project.layout} mode={cameraMode} seatId={seat?.id ?? null} lightsOn={lightsOn} command={cameraCommand} lookRequest={lookRequest} onSelectSeat={selectSeat} onDoubleClickSeat={selectView}/> : <div className="lf-webgl-fallback">3D preview needs WebGL</div>}
        {cameraMode === 'seat' && seat && <div className="lf-viewing"><span>Viewing from</span><strong>Row {seat.rowLabel}, seat {seat.seatNumber ?? '—'}</strong><small>{metrics ? `${metrics.distanceM.toFixed(1)} m from screen` : 'Perspective estimate'}</small></div>}
        <button className="lf-seat-switch" onClick={() => setPickerOpen(true)}><span>Seat plan</span><strong>{seat ? `Row ${seat.rowLabel} · ${seat.seatNumber ?? '—'}` : 'Choose a seat'}</strong><ChevronRight size={16}/></button>
      </section>
      <aside className="lf-side"><div className="lf-side-content lf-side-content--all">
        <section className="lf-panel-group"><h2>Auditorium</h2>{seat && <div className="lf-seat-summary"><span>Viewing from</span><strong>Row {seat.rowLabel} · {seat.seatNumber ?? '—'}</strong></div>}<dl className="lf-real-facts"><div><dt>Distance</dt><dd>{metrics ? `${metrics.distanceM.toFixed(1)} m` : '—'}</dd></div><div><dt>Screen angle</dt><dd>{metrics ? `${Math.abs(metrics.horizontalAngleDeg).toFixed(1)}°` : '—'}</dd></div><div><dt>Room</dt><dd>{project.config.widthM.toFixed(1)} × {project.config.lengthM.toFixed(1)} m</dd></div><div><dt>Layout</dt><dd>{geometry.seats.length} seats · {project.layout.rows.length} rows</dd></div></dl></section>
        <section className="lf-panel-group"><h2>Screen size</h2><select className="lf-compact-select" value={project.config.screen.preset} onChange={(event) => { const preset = SCREEN_PRESETS.find((item) => item.id === event.target.value); if (preset) setScreenPreset(preset.id, preset.id === 'custom' ? project.config.screen.widthM : preset.widthM); }} aria-label="Screen size preset">{SCREEN_PRESETS.map((preset) => <option key={preset.id} value={preset.id}>{preset.id === 'custom' ? 'Custom size' : `${preset.label} · ${preset.widthM} m`}</option>)}</select>{project.config.screen.preset === 'custom' && <div className="lf-fields"><NumberInput label="Custom width" field="screen.widthM" value={project.config.screen.widthM} min={2} max={50}/></div>}</section>
        <section className="lf-panel-group"><h2>Room elevation</h2><select className="lf-compact-select" value={project.config.floor.preset} onChange={(event) => setFloorPreset(event.target.value as keyof typeof FLOOR_PRESETS)} aria-label="Room elevation preset">{Object.entries(FLOOR_PRESETS).map(([id, preset]) => <option key={id} value={id}>{id === 'custom' ? 'Custom incline' : `${preset.label} · ${preset.slopePercent}%`}</option>)}</select>{project.config.floor.preset === 'custom' && <div className="lf-fields"><NumberInput label="Custom incline" field="floor.slopePercent" value={project.config.floor.slopePercent} min={0} max={45} step={1}/></div>}</section>
        <section className="lf-panel-group"><h2>Details</h2><div className="lf-fields"><NumberInput label="Ceiling" field="ceilingHeightM" value={project.config.ceilingHeightM} min={2} max={30}/><NumberInput label="Screen elevation" field="screen.elevationM" value={project.config.screen.elevationM} min={0} max={5}/><NumberInput label="Seat width" field="seating.seatWidthM" value={project.config.seating.seatWidthM} min={.3} max={2}/></div><label className="lf-switch"><span><b>Curved screen</b></span><input type="checkbox" checked={project.config.screen.curved} onChange={(event) => setConfigFlag('screen.curved', event.target.checked)}/><i/></label></section>
      </div></aside>
    </div>
    {pickerOpen && <div className="lf-picker-backdrop" onMouseDown={(event) => event.target === event.currentTarget && setPickerOpen(false)}><div className="lf-picker" role="dialog" aria-modal="true" aria-label="Choose a seat"><header><div><h2>Choose a seat</h2><p>Your perspective updates immediately.</p></div><button onClick={() => setPickerOpen(false)} aria-label="Close seat plan"><X size={17}/></button></header><div className="lf-picker-map" style={{ aspectRatio: `${project.layout.imageWidth}/${project.layout.imageHeight}` }}>{imageUrl && <img src={imageUrl} alt="Seating plan"/>}{project.layout.seats.map((item) => <button key={item.id} className={`lf-seat-dot ${item.id === seat?.id ? 'is-selected':''}`} style={{left:`${item.x*100}%`,top:`${item.y*100}%`}} onClick={() => selectView(item.id)} aria-label={`Choose row ${item.rowLabel}, seat ${item.seatNumber ?? ''}`}/>)}</div></div></div>}
  </section>;
}

export function LumenFlow() { const stage = useAppStore((state) => state.stage); if (stage === 'home') return <Landing/>; if (stage === 'analyzing') return <Analyzing/>; if (stage === 'verify') return <PlanReview/>; return <Studio/>; }
