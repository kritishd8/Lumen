import { createHash, timingSafeEqual } from 'node:crypto';
import { Worker } from 'node:worker_threads';
import Fastify, { type FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import multipart from '@fastify/multipart';
import rateLimit from '@fastify/rate-limit';
import sharp, { type Metadata, type OutputInfo } from 'sharp';
import type { AuditoriumConfig, DetectionResult } from '@/types';
import { applyEstimates } from '@/modules/reconstruction/calibration';
import { buildSpatialGeometry, viewMetricsForSeat } from '@/modules/reconstruction/geometry';
import { detectionResultToLayout } from '@/modules/image-processing/detection';
import { createDefaultConfig } from '@/utils/defaults';
import {
  auditoriumConfigSchema,
  auditoriumRenderRequestSchema,
  geometryRequestSchema,
} from './schema';

const MAX_IMAGE_BYTES = 20 * 1024 * 1024;
const MAX_IMAGE_PIXELS = 40_000_000;
const MAX_ANALYSIS_DIMENSION = 1800;
const MAX_CONCURRENT_ANALYSES = 2;
const ANALYSIS_TIMEOUT_MS = 30_000;

interface ApiError extends Error {
  statusCode: number;
  code: string;
}

interface ApiServerOptions {
  apiKeys: string[];
  corsOrigins?: string[];
}

function apiError(statusCode: number, code: string, message: string): ApiError {
  return Object.assign(new Error(message), { statusCode, code });
}

function digestKey(key: string): Buffer {
  return createHash('sha256').update(key).digest();
}

function isAuthorized(authorization: string | undefined, keyDigests: Buffer[]): boolean {
  const match = authorization?.match(/^Bearer ([A-Za-z0-9_-]{32,128})$/);
  if (!match) return false;
  const supplied = digestKey(match[1]);
  let valid = false;
  for (const expected of keyDigests) {
    valid = timingSafeEqual(supplied, expected) || valid;
  }
  return valid;
}

function parseConfig(value: unknown): AuditoriumConfig {
  const parsed = auditoriumConfigSchema.safeParse(value);
  if (!parsed.success) {
    throw apiError(400, 'invalid_config', 'The supplied auditorium configuration is invalid.');
  }
  return parsed.data;
}

function parseZodError(
  issues: Array<{ path: PropertyKey[]; message: string }>,
): { path: string; message: string }[] {
  return issues.slice(0, 20).map((issue) => ({
    path: issue.path.map(String).join('.'),
    message: issue.message,
  }));
}

function runDetectionInWorker(
  data: Uint8Array,
  width: number,
  height: number,
  originalWidth: number,
  originalHeight: number,
): Promise<DetectionResult> {
  const worker = new Worker(new URL('./analysis-worker.js', import.meta.url));
  const transferable = Uint8Array.from(data);

  return new Promise((resolve, reject) => {
    let settled = false;
    const timeout = setTimeout(() => {
      finish(() => reject(apiError(504, 'analysis_timeout', 'Image analysis timed out.')));
    }, ANALYSIS_TIMEOUT_MS);
    timeout.unref();

    const finish = (complete: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      void worker.terminate();
      complete();
    };

    worker.on('message', (message: { type: string; result?: DetectionResult; message?: string }) => {
      if (message.type === 'result' && message.result) {
        finish(() => resolve(message.result as DetectionResult));
      } else if (message.type === 'error') {
        finish(() =>
          reject(apiError(422, 'analysis_failed', message.message ?? 'Image analysis failed.')),
        );
      }
    });
    worker.once('error', () => {
      finish(() => reject(apiError(500, 'analysis_worker_failed', 'Image analysis failed.')));
    });
    worker.once('exit', (code) => {
      if (!settled && code !== 0) {
        finish(() =>
          reject(apiError(500, 'analysis_worker_failed', 'Image analysis worker stopped.')),
        );
      }
    });

    try {
      worker.postMessage(
        {
          data: transferable.buffer,
          width,
          height,
          originalWidth,
          originalHeight,
        },
        [transferable.buffer],
      );
    } catch {
      finish(() => reject(apiError(500, 'analysis_worker_failed', 'Image analysis failed.')));
    }
  });
}

export function createApiServer(options: ApiServerOptions): FastifyInstance {
  const configuredKeys = options.apiKeys.filter(Boolean);
  if (
    !configuredKeys.length ||
    configuredKeys.length > 100 ||
    configuredKeys.some((key) => key.length < 32 || key.length > 128) ||
    new Set(configuredKeys).size !== configuredKeys.length
  ) {
    throw new Error('Provide unique API keys between 32 and 128 characters.');
  }
  const keyDigests = configuredKeys.map(digestKey);
  let activeAnalyses = 0;

  const server = Fastify({
    bodyLimit: 2 * 1024 * 1024,
    trustProxy: false,
    logger: {
      level: process.env.LOG_LEVEL ?? 'info',
      redact: {
        paths: ['req.headers.authorization', 'req.headers.cookie'],
        censor: '[redacted]',
      },
    },
  });

  server.setErrorHandler((error, request, reply) => {
    const knownError = error instanceof Error ? (error as Partial<ApiError>) : undefined;
    const statusCode =
      typeof knownError?.statusCode === 'number' &&
      knownError.statusCode >= 400 &&
      knownError.statusCode < 600
        ? knownError.statusCode
        : 500;
    const code =
      knownError?.code ??
      (statusCode === 429
        ? 'rate_limit_exceeded'
        : statusCode === 413
          ? 'request_too_large'
          : 'internal_error');
    const message =
      statusCode >= 500
        ? 'An unexpected server error occurred.'
        : knownError?.message || 'The request could not be processed.';
    if (statusCode >= 500) {
      request.log.error({ err: error, requestId: request.id }, 'API request failed');
    }
    return reply.status(statusCode).send({
      error: { code, message, requestId: request.id },
    });
  });

  server.register(cors, {
    origin: options.corsOrigins?.length ? options.corsOrigins : false,
    credentials: false,
  });
  server.register(rateLimit, {
    global: true,
    max: 60,
    timeWindow: '1 minute',
  });
  server.register(multipart, {
    limits: {
      fileSize: MAX_IMAGE_BYTES,
      files: 1,
      fields: 1,
      parts: 2,
    },
  });

  server.addHook('preHandler', async (request, reply) => {
    if (
      request.method === 'OPTIONS' ||
      request.url.split('?')[0] === '/v1/health'
    ) {
      return;
    }
    if (!isAuthorized(request.headers.authorization, keyDigests)) {
      return reply
        .header('WWW-Authenticate', 'Bearer')
        .code(401)
        .send({ error: { code: 'unauthorized', message: 'A valid API key is required.' } });
    }
  });

  server.get('/v1/health', async () => ({ status: 'ok', apiVersion: 'v1' }));

  server.post(
    '/v1/reconstructions/geometry',
    {
      config: { rateLimit: { max: 30, timeWindow: '1 minute' } },
    },
    async (request, reply) => {
      const parsed = geometryRequestSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({
          error: {
            code: 'invalid_request',
            message: 'The layout or configuration is invalid.',
            details: parseZodError(parsed.error.issues),
            requestId: request.id,
          },
        });
      }
      const { layout, config, seatIds = [] } = parsed.data;
      const geometry = buildSpatialGeometry(layout, config);
      const metrics = seatIds.map((seatId) => {
        const seat = geometry.seats.find((item) => item.seat.id === seatId);
        if (!seat) {
          throw apiError(400, 'unknown_seat', `Seat "${seatId}" is not present in the layout.`);
        }
        return viewMetricsForSeat(seat, geometry, config);
      });
      return { geometry, metrics };
    },
  );

  server.post(
    '/v1/auditoriums/render',
    {
      config: { rateLimit: { max: 30, timeWindow: '1 minute' } },
    },
    async (request, reply) => {
      const parsed = auditoriumRenderRequestSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({
          error: {
            code: 'invalid_manifest',
            message: 'The auditorium manifest is invalid.',
            details: parseZodError(parsed.error.issues),
            requestId: request.id,
          },
        });
      }
      const { manifest, seatIds = [] } = parsed.data;
      const { layout, config } = manifest.auditorium;
      const geometry = buildSpatialGeometry(layout, config);
      const metrics = seatIds.map((seatId) => {
        const seat = geometry.seats.find((item) => item.seat.id === seatId);
        if (!seat) {
          throw apiError(400, 'unknown_seat', `Seat "${seatId}" is not present in the layout.`);
        }
        return viewMetricsForSeat(seat, geometry, config);
      });
      return {
        apiVersion: 'v1',
        auditorium: {
          id: manifest.auditorium.id ?? null,
          name: manifest.auditorium.name ?? null,
          layout,
          config,
          geometry,
        },
        metrics,
      };
    },
  );

  server.post(
    '/v1/reconstructions/analyze',
    {
      config: { rateLimit: { max: 6, timeWindow: '1 minute' } },
    },
    async (request, reply) => {
      if (activeAnalyses >= MAX_CONCURRENT_ANALYSES) {
        return reply
          .header('Retry-After', '15')
          .code(503)
          .send({
            error: {
              code: 'analysis_busy',
              message: 'Image analysis is busy. Retry the request shortly.',
              requestId: request.id,
            },
          });
      }

      activeAnalyses += 1;
      try {
      let imageBuffer: Buffer | null = null;
      let suppliedConfig: AuditoriumConfig | undefined;

      for await (const part of request.parts()) {
        if (part.type === 'file') {
          if (part.fieldname !== 'image' || imageBuffer) {
            throw apiError(400, 'invalid_upload', 'Upload one image using the "image" field.');
          }
          imageBuffer = await part.toBuffer();
        } else if (part.fieldname === 'config' && typeof part.value === 'string') {
          let value: unknown;
          try {
            value = JSON.parse(part.value);
          } catch {
            throw apiError(400, 'invalid_config', 'The config field must contain valid JSON.');
          }
          suppliedConfig = parseConfig(value);
        } else {
          throw apiError(400, 'invalid_upload', 'Only the image and optional config fields are accepted.');
        }
      }

      if (!imageBuffer?.length) {
        throw apiError(400, 'missing_image', 'Upload an image using the "image" field.');
      }

      let metadata: Metadata;
      try {
        metadata = await sharp(imageBuffer, { limitInputPixels: MAX_IMAGE_PIXELS }).metadata();
      } catch {
        throw apiError(400, 'invalid_image', 'The uploaded file is not a readable image.');
      }
      if (!['png', 'jpeg', 'webp'].includes(metadata.format ?? '')) {
        throw apiError(415, 'unsupported_image', 'Use a PNG, JPEG, or WebP image.');
      }
      if (!metadata.width || !metadata.height) {
        throw apiError(400, 'invalid_image', 'The uploaded image has no readable dimensions.');
      }
      if (metadata.width * metadata.height > MAX_IMAGE_PIXELS) {
        throw apiError(413, 'image_too_large', 'The image dimensions exceed the processing limit.');
      }

      let raw: { data: Buffer; info: OutputInfo };
      try {
        raw = await sharp(imageBuffer, { limitInputPixels: MAX_IMAGE_PIXELS })
          .rotate()
          .resize({
            width: MAX_ANALYSIS_DIMENSION,
            height: MAX_ANALYSIS_DIMENSION,
            fit: 'inside',
            withoutEnlargement: true,
          })
          .ensureAlpha()
          .raw()
          .toBuffer({ resolveWithObject: true });
      } catch {
        throw apiError(400, 'invalid_image', 'The uploaded image could not be decoded.');
      }

      const result = await runDetectionInWorker(
        raw.data,
        raw.info.width,
        raw.info.height,
        metadata.width,
        metadata.height,
      );

      const layout = detectionResultToLayout(result);
      const config = suppliedConfig
        ? applyEstimates(layout, suppliedConfig).config
        : applyEstimates(layout, createDefaultConfig()).config;
      const geometry = buildSpatialGeometry(layout, config);
      return {
        layout,
        config,
        geometry,
        stats: layout.stats,
      };
      } finally {
        activeAnalyses -= 1;
      }
    },
  );

  return server;
}
