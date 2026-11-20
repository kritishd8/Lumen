/**
 * Shared domain types.
 *
 * Image-space coordinates are always normalised to the analysed image:
 * x / imageWidth and y / imageHeight. This keeps detections resolution
 * independent while retaining the original image proportions.
 */

export type SeatStatus = 'available' | 'occupied' | 'unknown';
export type SeatType = 'standard' | 'recliner' | 'premium' | 'accessible' | 'unknown';
export type MeasurementSource = 'user' | 'estimated' | 'default';
export type AppStage = 'home' | 'analyzing' | 'verify' | 'configure' | 'viewer' | 'compare';
export type CameraMode = 'overview' | 'seat';
export type EditorTool = 'select' | 'add-seat' | 'screen' | 'aisle' | 'pan';
export type MaterialPreset =
  | 'dark-red'
  | 'burgundy'
  | 'black-leather'
  | 'charcoal'
  | 'navy'
  | 'custom';
export type FloorPreset = 'flat' | 'slight' | 'standard' | 'steep' | 'custom';
export type AspectPreset = '1.85' | '2.39' | '16:9' | '16:10' | 'custom';

export interface Point2 {
  x: number;
  y: number;
}

export interface ScreenPlacement {
  /** Normalised endpoints of the screen line in the source image. */
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  confidence: number;
  source: 'detected' | 'inferred' | 'manual';
}

export interface Seat {
  id: string;
  rowId: string;
  rowLabel: string;
  seatNumber?: string;
  sectionId: string;
  /** Normalised image-space centre. */
  x: number;
  y: number;
  /** Manual rotation offset in degrees. 0 faces the screen. */
  rotation: number;
  /** Normalised seat footprint width and depth. */
  width: number;
  depth: number;
  status: SeatStatus;
  type: SeatType;
  confidence: number;
  source: 'detected' | 'manual';
  notes?: string;
}

export interface SeatRow {
  id: string;
  label: string;
  index: number;
  /** Mean normalised depth from the screen line. */
  depth: number;
  seatIds: string[];
  confidence: number;
}

export interface SeatSection {
  id: string;
  name: string;
  seatIds: string[];
  color: string;
}

export interface Aisle {
  id: string;
  /** Normalised marker position in the source seating image. */
  x: number;
  y: number;
  /** Normalised aisle width: image width for vertical aisles, image height for cross-aisles. */
  width: number;
  orientation: 'vertical' | 'horizontal';
  source: 'detected' | 'manual';
}

export interface ColorCluster {
  id: string;
  color: string;
  count: number;
  status: SeatStatus;
  confidence: number;
}

export interface DetectionStats {
  totalSeats: number;
  totalRows: number;
  totalSections: number;
  uncertainSeats: number;
  unreadableLabels: number;
  detectedSeats: number;
  manualSeats: number;
  processingMs: number;
  openCvUsed: boolean;
  ocrUsed: boolean;
  warnings: string[];
}

export interface DetectionResult {
  seats: Seat[];
  rows: SeatRow[];
  sections: SeatSection[];
  aisles: Aisle[];
  screen: ScreenPlacement;
  colorClusters: ColorCluster[];
  stats: DetectionStats;
  analysedWidth: number;
  analysedHeight: number;
  originalWidth: number;
  originalHeight: number;
}

export interface SeatingLayout {
  version: 1;
  imageWidth: number;
  imageHeight: number;
  seats: Seat[];
  rows: SeatRow[];
  sections: SeatSection[];
  aisles: Aisle[];
  screen: ScreenPlacement;
  colorClusters: ColorCluster[];
  stats: DetectionStats;
}

export type ConfigFieldKey =
  | 'screen.widthM'
  | 'screen.heightM'
  | 'screen.aspectRatio'
  | 'screen.customAspect'
  | 'screen.elevationM'
  | 'screen.tiltDeg'
  | 'screen.curvatureM'
  | 'widthM'
  | 'lengthM'
  | 'ceilingHeightM'
  | 'frontClearanceM'
  | 'rearClearanceM'
  | 'rowSpacingM'
  | 'seatWidthM'
  | 'seatDepthM'
  | 'sideClearanceM'
  | 'seating.seatWidthM'
  | 'seating.seatDepthM'
  | 'seating.seatHeightM'
  | 'seating.backrestHeightM'
  | 'seating.eyeHeightM'
  | 'seating.seatGapM'
  | 'floor.slopePercent'
  | 'stage.heightM'
  | 'stage.depthM';

export interface ScreenConfig {
  widthM: number;
  heightM: number;
  aspectRatio: AspectPreset;
  customAspect: number;
  preset: string;
  elevationM: number;
  tiltDeg: number;
  curved: boolean;
  curvatureM: number;
}

export interface FloorConfig {
  preset: FloorPreset;
  slopePercent: number;
}

export interface SeatingConfig {
  seatWidthM: number;
  seatDepthM: number;
  seatHeightM: number;
  backrestHeightM: number;
  eyeHeightM: number;
  seatGapM: number;
}

export interface StageConfig {
  enabled: boolean;
  heightM: number;
  depthM: number;
}

export interface AuditoriumConfig {
  screen: ScreenConfig;
  widthM: number;
  lengthM: number;
  ceilingHeightM: number;
  frontClearanceM: number;
  rearClearanceM: number;
  rowSpacingM: number;
  seatWidthM: number;
  seatDepthM: number;
  sideClearanceM: number;
  floor: FloorConfig;
  seating: SeatingConfig;
  stage: StageConfig;
  materialPreset: MaterialPreset;
  customSeatColor: string;
  screenImageDataUrl?: string;
  sources: Partial<Record<ConfigFieldKey, MeasurementSource>>;
}

export interface CropRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ProjectImageMeta {
  key: string;
  originalKey?: string;
  crop?: CropRect;
  name: string;
  mimeType: string;
  size: number;
  width: number;
  height: number;
  originalWidth: number;
  originalHeight: number;
}

export interface ProjectRecord {
  id: string;
  version: 1;
  name: string;
  createdAt: number;
  updatedAt: number;
  stage: AppStage;
  image: ProjectImageMeta;
  layout: SeatingLayout;
  config: AuditoriumConfig;
  analysisNotes: string[];
}

export interface ProjectSummary {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  stage: AppStage;
  seatCount: number;
  rowCount: number;
  imageUrl?: string;
}

export interface ProjectExport {
  format: 'lumen-cinema-project';
  version: 1;
  exportedAt: number;
  project: ProjectRecord;
  imageDataUrl: string;
}

export interface Calibration {
  metresPerPixel: number;
  screenWidthPx: number;
  screenWidthM: number;
  screenLineLengthNorm: number;
  source: MeasurementSource;
  screenCenter: Point2;
  screenTangent: Point2;
  screenNormal: Point2;
  warnings: string[];
}

export interface SpatialSeat {
  seat: Seat;
  rowIndex: number;
  position: [number, number, number];
  eyePosition: [number, number, number];
  rotationY: number;
  screenDistanceM: number;
  horizontalAngleDeg: number;
  verticalAngleDeg: number;
  sectionId: string;
}

export interface SpatialScreen {
  widthM: number;
  heightM: number;
  bottomM: number;
  centerM: [number, number, number];
  tiltDeg: number;
  curved: boolean;
  curvatureM: number;
}

export interface SpatialRow {
  id: string;
  label: string;
  index: number;
  z: number;
  elevationM: number;
  seatIds: string[];
}

export interface AuditoriumDimensions {
  widthM: number;
  lengthM: number;
  ceilingHeightM: number;
  frontClearanceM: number;
  rearClearanceM: number;
  rowSpacingM: number;
  seatWidthM: number;
  seatDepthM: number;
  sideClearanceM: number;
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  screenElevationM: number;
  screenHeightM: number;
}

export interface ValidationIssue {
  id: string;
  severity: 'error' | 'warning' | 'info';
  title: string;
  detail: string;
  field?: ConfigFieldKey | 'layout' | 'screen';
}

export interface SpatialGeometry {
  calibration: Calibration;
  seats: SpatialSeat[];
  rows: SpatialRow[];
  screen: SpatialScreen;
  dimensions: AuditoriumDimensions;
  floorSlopeDeg: number;
  validation: ValidationIssue[];
  provenance: Record<string, MeasurementSource>;
}

export interface ViewMetrics {
  seatId: string;
  distanceM: number;
  horizontalAngleDeg: number;
  verticalAngleDeg: number;
  screenHorizontalFovDeg: number;
  screenVerticalFovDeg: number;
  screenCoveragePercent: number;
  centreOffsetM: number;
  eyeHeightM: number;
  obstructionPercent: number;
  obstructionConfidence: 'low' | 'medium' | 'high';
  obstructingSeatIds: string[];
}

export interface LookRequest {
  yawDeg: number;
  pitchDeg: number;
  nonce: number;
}

export interface CameraCommand {
  type: 'fit' | 'reset' | 'overview';
  nonce: number;
}

export interface ToastMessage {
  id: string;
  tone: 'info' | 'success' | 'warning' | 'error';
  title: string;
  detail?: string;
}

export interface AnalysisProgress {
  status: 'idle' | 'preparing' | 'detecting' | 'ocr' | 'complete' | 'error';
  percent: number;
  step: string;
  logs: string[];
  error?: string;
}
