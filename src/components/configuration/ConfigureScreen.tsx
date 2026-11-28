import { useMemo, useRef } from 'react';
import {
  AlertTriangle,
  Armchair,
  ArrowLeft,
  ArrowRight,
  Building2,
  CheckCircle2,
  ImagePlus,
  Layers3,
  Monitor,
  Palette,
  RotateCcw,
  Rows3,
  Trash2,
  Upload,
} from 'lucide-react';
import { useAppStore } from '@/app/store/useAppStore';
import { buildSpatialGeometry } from '@/modules/reconstruction/geometry';
import {
  ASPECT_RATIOS,
  aspectValue,
  FLOOR_PRESETS,
  MATERIAL_PRESETS,
  SCREEN_PRESETS,
} from '@/utils/defaults';
import type { ConfigFieldKey, FloorPreset, MaterialPreset } from '@/types';
import { ConfigNumberField, SectionCard, SourceBadge } from './ConfigFields';

const FLOOR_ORDER: FloorPreset[] = ['flat', 'slight', 'standard', 'steep', 'custom'];

export function ConfigureScreen() {
  const project = useAppStore((state) => state.project);
  const setStage = useAppStore((state) => state.setStage);
  const updateConfigField = useAppStore((state) => state.updateConfigField);
  const setScreenPreset = useAppStore((state) => state.setScreenPreset);
  const setAspectPreset = useAppStore((state) => state.setAspectPreset);
  const setFloorPreset = useAppStore((state) => state.setFloorPreset);
  const setMaterialPreset = useAppStore((state) => state.setMaterialPreset);
  const setScreenImage = useAppStore((state) => state.setScreenImage);
  const setConfigFlag = useAppStore((state) => state.setConfigFlag);
  const resetConfig = useAppStore((state) => state.resetConfig);
  const screenImageInput = useRef<HTMLInputElement>(null);

  const geometry = useMemo(
    () => (project ? buildSpatialGeometry(project.layout, project.config) : null),
    [project],
  );

  if (!project || !geometry) return null;
  const config = project.config;
  const errors = geometry.validation.filter((issue) => issue.severity === 'error');
  const warnings = geometry.validation.filter((issue) => issue.severity === 'warning');
  const aspect = aspectValue(config.screen.aspectRatio, config.screen.customAspect);
  const sourceFor = (field: ConfigFieldKey) => config.sources[field] ?? 'default';
  const userCount = Object.values(config.sources).filter((source) => source === 'user').length;
  const estimatedCount = Object.values(config.sources).filter(
    (source) => source === 'estimated',
  ).length;
  const sourcePreview = config.screenImageDataUrl;

  const handleScreenImage = (file: File | undefined) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) return;
    const reader = new FileReader();
    reader.onload = () => setScreenImage(String(reader.result));
    reader.readAsDataURL(file);
  };

  return (
    <div className="configure-screen">
      <div className="page-heading">
        <div>
          <div className="section-kicker">Reel 03 / build the room</div>
          <h1>Build the room around the seat map.</h1>
          <p>
            Screen width is the primary scale reference. Every other dimension is estimated
            from the detected plan unless you override it. Estimated values are always
            labelled.
          </p>
        </div>
        <div className="row">
          <button className="btn" onClick={() => setStage('verify')}>
            <ArrowLeft size={14} />
            Back to editor
          </button>
          <button className="btn btn--ghost" onClick={resetConfig}>
            <RotateCcw size={14} />
            Reset estimates
          </button>
        </div>
      </div>

      <div className="configure-grid">
        <div className="configure-column">
          <SectionCard
            icon={<Monitor size={15} />}
            title="Screen"
            description="The primary calibration reference and projection surface."
          >
            <div className="preset-grid" style={{ marginBottom: 15 }}>
              {SCREEN_PRESETS.map((preset) => (
                <button
                  key={preset.id}
                  className={`preset-button ${config.screen.preset === preset.id ? 'is-active' : ''}`}
                  onClick={() => setScreenPreset(preset.id, preset.widthM)}
                >
                  <strong>{preset.label}</strong>
                  <span>{preset.id === 'custom' ? 'your width' : `${preset.widthM} m`}</span>
                </button>
              ))}
            </div>
            <div className="config-fields">
              <ConfigNumberField
                label="Screen width"
                field="screen.widthM"
                value={config.screen.widthM}
                unit="m"
                min={2}
                max={50}
                step={0.1}
                source={sourceFor('screen.widthM')}
                hint="Used to calibrate every horizontal and depth measurement."
              />
              <ConfigNumberField
                label="Screen height"
                field="screen.heightM"
                value={config.screen.heightM}
                unit="m"
                min={1}
                max={30}
                step={0.1}
                source={sourceFor('screen.heightM')}
              />
              <label className="field">
                <span className="field-label">
                  Aspect ratio
                  <SourceBadge source={sourceFor('screen.aspectRatio')} />
                </span>
                <select
                  className="select"
                  value={config.screen.aspectRatio}
                  onChange={(event) =>
                    setAspectPreset(event.target.value as typeof config.screen.aspectRatio)
                  }
                >
                  {ASPECT_RATIOS.map((ratio) => (
                    <option key={ratio.id} value={ratio.id}>
                      {ratio.label}
                    </option>
                  ))}
                </select>
              </label>
              <ConfigNumberField
                label="Custom ratio"
                field="screen.customAspect"
                value={config.screen.customAspect}
                unit=":1"
                min={1}
                max={4}
                step={0.01}
                source={sourceFor('screen.customAspect')}
                hint={config.screen.aspectRatio === 'custom' ? 'Active custom ratio.' : 'Used when Custom is selected.'}
              />
              <ConfigNumberField
                label="Screen elevation"
                field="screen.elevationM"
                value={config.screen.elevationM}
                unit="m"
                min={0}
                max={5}
                step={0.05}
                source={sourceFor('screen.elevationM')}
                hint="Height of the bottom edge above the front floor."
              />
              <ConfigNumberField
                label="Screen tilt"
                field="screen.tiltDeg"
                value={config.screen.tiltDeg}
                unit="°"
                min={-15}
                max={20}
                step={0.5}
                source={sourceFor('screen.tiltDeg')}
              />
              <ConfigNumberField
                label="Screen curvature"
                field="screen.curvatureM"
                value={config.screen.curvatureM}
                unit="m"
                min={0}
                max={5}
                step={0.05}
                source={sourceFor('screen.curvatureM')}
              />
              <div className="field">
                <span className="field-label">Screen surface</span>
                <label className="row" style={{ height: 34, fontSize: 11, color: 'var(--text-2)' }}>
                  <input
                    type="checkbox"
                    checked={config.screen.curved}
                    onChange={(event) => setConfigFlag('screen.curved', event.target.checked)}
                  />
                  Curved screen geometry
                </label>
              </div>
              <div className="field wide">
                <span className="field-label">Screen reference image</span>
                <div className="screen-image-upload">
                  {sourcePreview ? (
                    <img className="screen-image-preview" src={sourcePreview} alt="Screen reference" />
                  ) : (
                    <div className="screen-image-preview" />
                  )}
                  <button className="btn btn--sm" onClick={() => screenImageInput.current?.click()}>
                    <Upload size={12} />
                    {sourcePreview ? 'Replace image' : 'Upload image'}
                  </button>
                  {sourcePreview && (
                    <button className="btn btn--sm btn--ghost" onClick={() => setScreenImage(undefined)}>
                      <Trash2 size={12} />
                      Remove
                    </button>
                  )}
                  <input
                    ref={screenImageInput}
                    type="file"
                    accept="image/*"
                    hidden
                    onChange={(event) => handleScreenImage(event.target.files?.[0])}
                  />
                </div>
                <span className="field-hint">
                  Optional. Without an upload, a neutral calibrated test image is used.
                </span>
              </div>
            </div>
            <div className="notice notice--info" style={{ marginTop: 14 }}>
              <ImagePlus size={14} />
              <span>
                {config.screen.widthM.toFixed(1)} m × {config.screen.heightM.toFixed(2)} m ·{' '}
                {aspect.toFixed(2)}:1. Changing the width re-scales the auditorium; seat
                relative positions are preserved.
              </span>
            </div>
          </SectionCard>

          <SectionCard
            icon={<Building2 size={15} />}
            title="Auditorium dimensions"
            description="Optional physical measurements. Unknown values are estimated from the plan."
          >
            <div className="config-fields">
              <ConfigNumberField
                label="Auditorium width"
                field="widthM"
                value={config.widthM}
                unit="m"
                min={4}
                max={60}
                step={0.1}
                source={sourceFor('widthM')}
              />
              <ConfigNumberField
                label="Auditorium length"
                field="lengthM"
                value={config.lengthM}
                unit="m"
                min={5}
                max={80}
                step={0.1}
                source={sourceFor('lengthM')}
              />
              <ConfigNumberField
                label="Ceiling height"
                field="ceilingHeightM"
                value={config.ceilingHeightM}
                unit="m"
                min={3}
                max={24}
                step={0.1}
                source={sourceFor('ceilingHeightM')}
              />
              <ConfigNumberField
                label="Front clearance"
                field="frontClearanceM"
                value={config.frontClearanceM}
                unit="m"
                min={1}
                max={15}
                step={0.1}
                source={sourceFor('frontClearanceM')}
                hint="Screen to first row."
              />
              <ConfigNumberField
                label="Rear clearance"
                field="rearClearanceM"
                value={config.rearClearanceM}
                unit="m"
                min={0.3}
                max={8}
                step={0.1}
                source={sourceFor('rearClearanceM')}
              />
              <ConfigNumberField
                label="Side clearance"
                field="sideClearanceM"
                value={config.sideClearanceM}
                unit="m"
                min={0.3}
                max={8}
                step={0.1}
                source={sourceFor('sideClearanceM')}
              />
              <ConfigNumberField
                label="Row spacing"
                field="rowSpacingM"
                value={config.rowSpacingM}
                unit="m"
                min={0.6}
                max={2.2}
                step={0.01}
                source={sourceFor('rowSpacingM')}
                hint="Relative row variation is preserved."
              />
              <ConfigNumberField
                label="Seat footprint width"
                field="seatWidthM"
                value={config.seatWidthM}
                unit="m"
                min={0.35}
                max={1.2}
                step={0.01}
                source={sourceFor('seatWidthM')}
              />
              <ConfigNumberField
                label="Seat footprint depth"
                field="seatDepthM"
                value={config.seatDepthM}
                unit="m"
                min={0.35}
                max={1.2}
                step={0.01}
                source={sourceFor('seatDepthM')}
              />
            </div>
          </SectionCard>

          <SectionCard
            icon={<Rows3 size={15} />}
            title="Floor & rake"
            description="Cinema rake affects elevation and the first-person sightline."
          >
            <div className="segmented" style={{ marginBottom: 15 }}>
              {FLOOR_ORDER.map((preset) => (
                <button
                  key={preset}
                  className={config.floor.preset === preset ? 'is-active' : ''}
                  onClick={() => setFloorPreset(preset)}
                >
                  {FLOOR_PRESETS[preset].label.replace(' floor', '')}
                </button>
              ))}
            </div>
            <div className="config-fields">
              <ConfigNumberField
                label="Floor slope"
                field="floor.slopePercent"
                value={config.floor.slopePercent}
                unit="%"
                min={0}
                max={45}
                step={0.1}
                source={sourceFor('floor.slopePercent')}
                hint={`≈ ${geometry.floorSlopeDeg.toFixed(1)}° continuous rake.`}
              />
              <div className="field">
                <span className="field-label">Elevation at last row</span>
                <input
                  className="input input--number"
                  readOnly
                  value={`${(
                    Math.max(0, project.layout.rows.length - 1) *
                    config.rowSpacingM *
                    (config.floor.slopePercent / 100)
                  ).toFixed(2)} m`}
                />
              </div>
            </div>
            <div className="notice notice--warning" style={{ marginTop: 14 }}>
              <AlertTriangle size={14} />
              <span>
                Floor rake is a construction assumption unless you measured it. It is never
                presented as the real theatre's slope.
              </span>
            </div>
          </SectionCard>

          <SectionCard
            icon={<Armchair size={15} />}
            title="Seating dimensions"
            description="Chair geometry and eye height used by the 3D view and perspective calculations."
          >
            <div className="config-fields">
              <ConfigNumberField
                label="Seat width"
                field="seating.seatWidthM"
                value={config.seating.seatWidthM}
                unit="m"
                min={0.35}
                max={1.2}
                step={0.01}
                source={sourceFor('seating.seatWidthM')}
              />
              <ConfigNumberField
                label="Seat depth"
                field="seating.seatDepthM"
                value={config.seating.seatDepthM}
                unit="m"
                min={0.35}
                max={1.2}
                step={0.01}
                source={sourceFor('seating.seatDepthM')}
              />
              <ConfigNumberField
                label="Seat cushion height"
                field="seating.seatHeightM"
                value={config.seating.seatHeightM}
                unit="m"
                min={0.3}
                max={0.7}
                step={0.01}
                source={sourceFor('seating.seatHeightM')}
              />
              <ConfigNumberField
                label="Backrest height"
                field="seating.backrestHeightM"
                value={config.seating.backrestHeightM}
                unit="m"
                min={0.6}
                max={1.5}
                step={0.01}
                source={sourceFor('seating.backrestHeightM')}
                hint="Above the row floor."
              />
              <ConfigNumberField
                label="Seated eye height"
                field="seating.eyeHeightM"
                value={config.seating.eyeHeightM}
                unit="m"
                min={0.8}
                max={1.6}
                step={0.01}
                source={sourceFor('seating.eyeHeightM')}
              />
              <ConfigNumberField
                label="Gap between seats"
                field="seating.seatGapM"
                value={config.seating.seatGapM}
                unit="m"
                min={0}
                max={0.5}
                step={0.01}
                source={sourceFor('seating.seatGapM')}
              />
            </div>
          </SectionCard>

          <SectionCard
            icon={<Palette size={15} />}
            title="Material & stage"
            description="Chair finish and optional front stage platform."
          >
            <div className="material-row" style={{ marginBottom: 15 }}>
              {(Object.keys(MATERIAL_PRESETS) as MaterialPreset[])
                .filter((preset) => preset !== 'custom')
                .map((preset) => (
                  <button
                    key={preset}
                    className={`material-swatch ${
                      config.materialPreset === preset ? 'is-active' : ''
                    }`}
                    style={{ background: MATERIAL_PRESETS[preset].base }}
                    onClick={() => setMaterialPreset(preset)}
                    title={MATERIAL_PRESETS[preset].label}
                  />
                ))}
              <label className="material-swatch" style={{ background: config.customSeatColor, position: 'relative', overflow: 'hidden' }}>
                <input
                  type="color"
                  value={config.customSeatColor}
                  onChange={(event) => setMaterialPreset('custom', event.target.value)}
                  style={{ position: 'absolute', inset: -8, opacity: 0, cursor: 'pointer' }}
                />
              </label>
            </div>
            <div className="config-fields">
              <div className="field">
                <span className="field-label">Stage platform</span>
                <label className="row" style={{ height: 34, fontSize: 11, color: 'var(--text-2)' }}>
                  <input
                    type="checkbox"
                    checked={config.stage.enabled}
                    onChange={(event) => setConfigFlag('stage.enabled', event.target.checked)}
                  />
                  Add a stage at the screen wall
                </label>
              </div>
              <ConfigNumberField
                label="Stage height"
                field="stage.heightM"
                value={config.stage.heightM}
                unit="m"
                min={0}
                max={2}
                step={0.05}
                source={sourceFor('stage.heightM')}
              />
              <ConfigNumberField
                label="Stage depth"
                field="stage.depthM"
                value={config.stage.depthM}
                unit="m"
                min={0.4}
                max={5}
                step={0.1}
                source={sourceFor('stage.depthM')}
              />
              <div className="field">
                <span className="field-label">Aisles</span>
                <span className="field-hint">
                  Aisle gaps and markers come from the verification editor. They are
                  preserved in 3D as walkways and floor lighting.
                </span>
              </div>
            </div>
          </SectionCard>
        </div>

        <aside className="summary-card">
          <div className="summary-head">
            <div className="section-kicker">Reconstruction summary</div>
            <h2>
              {config.screen.widthM.toFixed(1)} m screen
              <br />
              {project.layout.seats.length} seats
            </h2>
            <p>
              {errors.length
                ? `${errors.length} blocking issue${errors.length === 1 ? '' : 's'} must be resolved.`
                : 'Geometry passes validation. Measurements marked estimated remain assumptions.'}
            </p>
          </div>
          <div className="summary-body">
            <div className="summary-screen-preview">
              <div
                className="summary-screen-rect"
                style={{
                  width: '88%',
                  aspectRatio: String(aspect),
                  maxHeight: 120,
                }}
              />
            </div>
            <div className="summary-metric">
              <span>Screen</span>
              <strong>
                {config.screen.widthM.toFixed(1)} × {config.screen.heightM.toFixed(1)} m
              </strong>
            </div>
            <div className="summary-metric">
              <span>Aspect</span>
              <strong>{aspect.toFixed(2)}:1</strong>
            </div>
            <div className="summary-metric">
              <span>Auditorium</span>
              <strong>
                {config.widthM.toFixed(1)} × {config.lengthM.toFixed(1)} m
              </strong>
            </div>
            <div className="summary-metric">
              <span>Ceiling</span>
              <strong>{config.ceilingHeightM.toFixed(1)} m</strong>
            </div>
            <div className="summary-metric">
              <span>Seat span</span>
              <strong>
                {(geometry.dimensions.maxX - geometry.dimensions.minX + config.seatWidthM).toFixed(1)} m
              </strong>
            </div>
            <div className="summary-metric">
              <span>Last row distance</span>
              <strong>{geometry.dimensions.maxZ.toFixed(1)} m</strong>
            </div>
            <div className="summary-metric">
              <span>Rake</span>
              <strong>{config.floor.slopePercent.toFixed(1)}%</strong>
            </div>
            <div className="summary-metric">
              <span>User measurements</span>
              <strong>{userCount}</strong>
            </div>
            <div className="summary-metric">
              <span>Estimated values</span>
              <strong>{estimatedCount}</strong>
            </div>

            {(errors.length > 0 || warnings.length > 0) && (
              <div className="summary-issues">
                {[...errors, ...warnings].slice(0, 5).map((issue) => (
                  <div
                    key={issue.id}
                    className={`issue-row ${issue.severity === 'error' ? 'is-error' : 'is-warning'}`}
                  >
                    <AlertTriangle size={12} />
                    <span>
                      <strong style={{ display: 'block', color: 'inherit' }}>{issue.title}</strong>
                      {issue.detail}
                    </span>
                  </div>
                ))}
              </div>
            )}
            {!errors.length && !warnings.length && (
              <div className="notice notice--success" style={{ marginTop: 12 }}>
                <CheckCircle2 size={14} />
                <span>No geometry issues detected.</span>
              </div>
            )}
          </div>
          <div className="summary-foot">
            <button
              className="btn btn--primary btn--block"
              disabled={errors.length > 0 || project.layout.seats.length === 0}
              onClick={() => setStage('viewer')}
            >
              <Layers3 size={14} />
              Generate 3D auditorium
              <ArrowRight size={14} />
            </button>
            {errors.length > 0 && (
              <p className="field-hint" style={{ marginTop: 8, textAlign: 'center' }}>
                Resolve the blocking measurements above to continue.
              </p>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}
