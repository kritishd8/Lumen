import type {
  AuditoriumConfig,
  ConfigFieldKey,
  FloorPreset,
  MaterialPreset,
  MeasurementSource,
  SeatSection,
  SeatType,
  SeatStatus,
} from '@/types';

export const APP_VERSION = '1.0.0';

export const SEAT_COLORS: Record<SeatStatus, string> = {
  available: '#16A34A',
  occupied: '#737985',
  unknown: '#EAB308',
};

export const SECTION_COLORS = ['#6E8E9E', '#9E7A6E', '#7B8F6E', '#8A7E9E', '#A08B5E', '#6E9E94'];

export const MATERIAL_PRESETS: Record<
  MaterialPreset,
  { label: string; base: string; accent: string; sheen: number }
> = {
  'dark-red': { label: 'Dark red fabric', base: '#5A1C21', accent: '#7A2A30', sheen: 0.18 },
  burgundy: { label: 'Burgundy', base: '#42161F', accent: '#61202B', sheen: 0.2 },
  'black-leather': { label: 'Black leather', base: '#181A1D', accent: '#2C2E33', sheen: 0.42 },
  charcoal: { label: 'Dark charcoal', base: '#2C3035', accent: '#3A3F45', sheen: 0.15 },
  navy: { label: 'Navy blue', base: '#18243A', accent: '#263A58', sheen: 0.16 },
  custom: { label: 'Custom colour', base: '#5A1C21', accent: '#7A2A30', sheen: 0.18 },
};

export const FLOOR_PRESETS: Record<FloorPreset, { label: string; slopePercent: number }> = {
  flat: { label: 'Flat floor', slopePercent: 0 },
  slight: { label: 'Slight incline', slopePercent: 4 },
  standard: { label: 'Standard cinema rake', slopePercent: 8 },
  steep: { label: 'Steep incline', slopePercent: 14 },
  custom: { label: 'Custom slope', slopePercent: 10 },
};

export const SCREEN_PRESETS = [
  { id: 'small', label: 'Small', widthM: 8 },
  { id: 'standard', label: 'Standard', widthM: 12 },
  { id: 'large', label: 'Large', widthM: 16 },
  { id: 'premium', label: 'Premium', widthM: 20 },
  { id: 'imax', label: 'IMAX-sized', widthM: 24 },
  { id: 'custom', label: 'Custom', widthM: 12 },
] as const;

export const ASPECT_RATIOS = [
  { id: '1.85', label: '1.85:1 Flat', value: 1.85 },
  { id: '2.39', label: '2.39:1 Scope', value: 2.39 },
  { id: '16:9', label: '16:9', value: 16 / 9 },
  { id: '16:10', label: '16:10', value: 1.6 },
  { id: 'custom', label: 'Custom ratio', value: 0 },
] as const;

export const SEAT_TYPES: { id: SeatType; label: string }[] = [
  { id: 'standard', label: 'Standard' },
  { id: 'premium', label: 'Premium' },
  { id: 'recliner', label: 'Recliner' },
  { id: 'accessible', label: 'Accessible' },
  { id: 'unknown', label: 'Unknown' },
];

export const SEAT_STATUSES: { id: SeatStatus; label: string }[] = [
  { id: 'available', label: 'Available' },
  { id: 'occupied', label: 'Occupied / unavailable' },
  { id: 'unknown', label: 'Unknown' },
];

export const DEFAULT_SECTION: SeatSection = {
  id: 'section-1',
  name: 'Main',
  seatIds: [],
  color: SECTION_COLORS[0],
};

export function aspectValue(preset: string, customAspect: number): number {
  const match = ASPECT_RATIOS.find((item) => item.id === preset);
  if (!match) return customAspect || 1.85;
  if (match.id === 'custom') return customAspect || 1.85;
  return match.value;
}

export function createDefaultConfig(): AuditoriumConfig {
  const defaultSources: Partial<Record<ConfigFieldKey, MeasurementSource>> = {
    'screen.widthM': 'default',
    'screen.heightM': 'estimated',
    'screen.aspectRatio': 'default',
    'screen.customAspect': 'default',
    'screen.elevationM': 'estimated',
    'screen.tiltDeg': 'default',
    'screen.curvatureM': 'default',
    widthM: 'estimated',
    lengthM: 'estimated',
    ceilingHeightM: 'estimated',
    frontClearanceM: 'estimated',
    rearClearanceM: 'default',
    rowSpacingM: 'estimated',
    seatWidthM: 'estimated',
    seatDepthM: 'default',
    sideClearanceM: 'default',
    'seating.seatHeightM': 'default',
    'seating.backrestHeightM': 'default',
    'seating.eyeHeightM': 'default',
    'seating.seatGapM': 'estimated',
    'floor.slopePercent': 'default',
    'stage.heightM': 'default',
    'stage.depthM': 'default',
  };

  return {
    screen: {
      widthM: 12,
      heightM: 12 / 1.85,
      aspectRatio: '1.85',
      customAspect: 1.85,
      preset: 'standard',
      elevationM: 0.9,
      tiltDeg: 0,
      curved: false,
      curvatureM: 0.8,
    },
    widthM: 14,
    lengthM: 16,
    ceilingHeightM: 6.2,
    frontClearanceM: 4,
    rearClearanceM: 1.6,
    rowSpacingM: 1.05,
    seatWidthM: 0.56,
    seatDepthM: 0.64,
    sideClearanceM: 1.4,
    floor: {
      preset: 'standard',
      slopePercent: FLOOR_PRESETS.standard.slopePercent,
    },
    seating: {
      seatWidthM: 0.56,
      seatDepthM: 0.64,
      seatHeightM: 0.46,
      backrestHeightM: 1.02,
      eyeHeightM: 1.12,
      seatGapM: 0.12,
    },
    stage: {
      enabled: false,
      heightM: 0.6,
      depthM: 1.8,
    },
    materialPreset: 'dark-red',
    customSeatColor: '#5A1C21',
    sources: defaultSources,
  };
}

export function seatColorFor(
  status: SeatStatus,
  preset: MaterialPreset,
  customColor: string,
): string {
  const base =
    preset === 'custom'
      ? customColor
      : MATERIAL_PRESETS[preset]?.base ?? MATERIAL_PRESETS['dark-red'].base;
  if (status === 'available') return base;
  if (status === 'occupied') return '#303238';
  return '#5A4938';
}
