import { z } from 'zod';

const configFieldKeys = [
  'screen.widthM',
  'screen.heightM',
  'screen.aspectRatio',
  'screen.customAspect',
  'screen.elevationM',
  'screen.tiltDeg',
  'screen.curvatureM',
  'widthM',
  'lengthM',
  'ceilingHeightM',
  'frontClearanceM',
  'rearClearanceM',
  'rowSpacingM',
  'seatWidthM',
  'seatDepthM',
  'sideClearanceM',
  'seating.seatWidthM',
  'seating.seatDepthM',
  'seating.seatHeightM',
  'seating.backrestHeightM',
  'seating.eyeHeightM',
  'seating.seatGapM',
  'floor.slopePercent',
  'stage.heightM',
  'stage.depthM',
] as const;

const measurementSourceSchema = z.enum(['user', 'estimated', 'default']);
const boundedNumber = (min: number, max: number) => z.number().finite().min(min).max(max);
const normalized = boundedNumber(0, 1);
const id = z.string().min(1).max(128);
const shortLabel = z.string().min(1).max(64);

export const seatSchema = z
  .object({
    id,
    rowId: id,
    rowLabel: shortLabel,
    seatNumber: z.string().max(32).optional(),
    sectionId: id,
    x: normalized,
    y: normalized,
    rotation: boundedNumber(-360, 360),
    width: boundedNumber(0.0001, 1),
    depth: boundedNumber(0.0001, 1),
    status: z.enum(['available', 'occupied', 'unknown']),
    type: z.enum(['standard', 'recliner', 'premium', 'accessible', 'unknown']),
    confidence: normalized,
    source: z.enum(['detected', 'manual']),
    notes: z.string().max(1000).optional(),
  })
  .strict();

const rowSchema = z
  .object({
    id,
    label: shortLabel,
    index: z.number().int().min(0).max(500),
    depth: normalized,
    seatIds: z.array(id).max(2000),
    confidence: normalized,
  })
  .strict();

const sectionSchema = z
  .object({
    id,
    name: shortLabel,
    seatIds: z.array(id).max(2000),
    color: z.string().regex(/^#[0-9a-f]{6}$/i),
  })
  .strict();

const aisleSchema = z
  .object({
    id,
    x: normalized,
    y: normalized,
    width: boundedNumber(0, 1),
    orientation: z.enum(['vertical', 'horizontal']),
    source: z.enum(['detected', 'manual']),
  })
  .strict();

const screenPlacementSchema = z
  .object({
    x1: normalized,
    y1: normalized,
    x2: normalized,
    y2: normalized,
    confidence: normalized,
    source: z.enum(['detected', 'inferred', 'manual']),
  })
  .strict();

const colorClusterSchema = z
  .object({
    id,
    color: z.string().regex(/^#[0-9a-f]{6}$/i),
    count: z.number().int().min(0).max(2000),
    status: z.enum(['available', 'occupied', 'unknown']),
    confidence: normalized,
  })
  .strict();

const detectionStatsSchema = z
  .object({
    totalSeats: z.number().int().min(0).max(2000),
    totalRows: z.number().int().min(0).max(500),
    totalSections: z.number().int().min(0).max(100),
    uncertainSeats: z.number().int().min(0).max(2000),
    unreadableLabels: z.number().int().min(0).max(2000),
    detectedSeats: z.number().int().min(0).max(2000),
    manualSeats: z.number().int().min(0).max(2000),
    processingMs: z.number().int().min(0).max(3_600_000),
    openCvUsed: z.boolean(),
    ocrUsed: z.boolean(),
    warnings: z.array(z.string().max(1000)).max(100),
  })
  .strict();

export const layoutSchema = z
  .object({
    version: z.literal(1),
    imageWidth: z.number().int().min(1).max(100_000),
    imageHeight: z.number().int().min(1).max(100_000),
    seats: z.array(seatSchema).max(2000),
    rows: z.array(rowSchema).max(500),
    sections: z.array(sectionSchema).max(100),
    aisles: z.array(aisleSchema).max(200),
    screen: screenPlacementSchema,
    colorClusters: z.array(colorClusterSchema).max(20),
    stats: detectionStatsSchema,
  })
  .strict();

const screenConfigSchema = z
  .object({
    widthM: boundedNumber(0.1, 100),
    heightM: boundedNumber(0.1, 100),
    aspectRatio: z.enum(['1.85', '2.39', '16:9', '16:10', 'custom']),
    customAspect: boundedNumber(0.1, 20),
    preset: z.string().min(1).max(32),
    elevationM: boundedNumber(0, 50),
    tiltDeg: boundedNumber(-90, 90),
    curved: z.boolean(),
    curvatureM: boundedNumber(0, 50),
  })
  .strict();

export const auditoriumConfigSchema = z
  .object({
    screen: screenConfigSchema,
    widthM: boundedNumber(1, 300),
    lengthM: boundedNumber(1, 500),
    ceilingHeightM: boundedNumber(1, 100),
    frontClearanceM: boundedNumber(0, 100),
    rearClearanceM: boundedNumber(0, 100),
    rowSpacingM: boundedNumber(0.1, 10),
    seatWidthM: boundedNumber(0.1, 4),
    seatDepthM: boundedNumber(0.1, 5),
    sideClearanceM: boundedNumber(0, 100),
    floor: z
      .object({
        preset: z.enum(['flat', 'slight', 'standard', 'steep', 'custom']),
        slopePercent: boundedNumber(0, 80),
      })
      .strict(),
    seating: z
      .object({
        seatWidthM: boundedNumber(0.1, 4),
        seatDepthM: boundedNumber(0.1, 5),
        seatHeightM: boundedNumber(0.1, 3),
        backrestHeightM: boundedNumber(0.1, 4),
        eyeHeightM: boundedNumber(0.1, 4),
        seatGapM: boundedNumber(0, 2),
      })
      .strict(),
    stage: z
      .object({
        enabled: z.boolean(),
        heightM: boundedNumber(0, 10),
        depthM: boundedNumber(0, 50),
      })
      .strict(),
    materialPreset: z.enum([
      'dark-red',
      'burgundy',
      'black-leather',
      'charcoal',
      'navy',
      'custom',
    ]),
    customSeatColor: z.string().regex(/^#[0-9a-f]{6}$/i),
    screenImageDataUrl: z.string().max(1_500_000).optional(),
    sources: z
      .record(z.string().max(80), measurementSourceSchema)
      .superRefine((sources, context) => {
        const allowed = new Set<string>(configFieldKeys);
        for (const key of Object.keys(sources)) {
          if (!allowed.has(key)) {
            context.addIssue({
              code: 'custom',
              path: [key],
              message: 'Unknown measurement source.',
            });
          }
        }
      }),
  })
  .strict();

export const geometryRequestSchema = z
  .object({
    layout: layoutSchema,
    config: auditoriumConfigSchema,
    seatIds: z.array(id).max(20).optional(),
  })
  .strict();

export const cropSchema = z
  .object({
    x: normalized,
    y: normalized,
    width: boundedNumber(0.02, 1),
    height: boundedNumber(0.02, 1),
  })
  .strict()
  .refine((crop) => crop.x + crop.width <= 1 && crop.y + crop.height <= 1, {
    message: 'Crop must fit inside the image.',
  });

export type GeometryRequest = z.infer<typeof geometryRequestSchema>;
export type ApiConfig = z.infer<typeof auditoriumConfigSchema>;
