import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { createApiServer } from '../../server/index';
import { createDefaultConfig } from '@/utils/defaults';

const manifest = {
  format: 'lumen-auditorium' as const,
  version: 1 as const,
  auditorium: {
    id: 'auditorium-demo',
    name: 'Demo auditorium',
    layout: {
      version: 1 as const,
      imageWidth: 100,
      imageHeight: 100,
      seats: [{ id: 'seat-a1', rowId: 'row-a', rowLabel: 'A', seatNumber: '1', sectionId: 'main', x: .5, y: .5, rotation: 0, width: .05, depth: .05, status: 'available' as const, type: 'standard' as const, confidence: 1, source: 'manual' as const }],
      rows: [{ id: 'row-a', label: 'A', index: 0, depth: .5, seatIds: ['seat-a1'], confidence: 1 }],
      sections: [],
      aisles: [],
      screen: { x1: .2, y1: .1, x2: .8, y2: .1, confidence: 1, source: 'manual' as const },
      colorClusters: [],
      stats: { totalSeats: 1, totalRows: 1, totalSections: 0, uncertainSeats: 0, unreadableLabels: 0, detectedSeats: 0, manualSeats: 1, processingMs: 0, openCvUsed: false, ocrUsed: false, warnings: [] },
    },
    config: createDefaultConfig(),
  },
};

const API_KEY = 'test-key-'.padEnd(43, 'x');
let server: FastifyInstance;

beforeEach(async () => {
  server = createApiServer({ apiKeys: [API_KEY] });
  await server.ready();
});

afterEach(async () => {
  await server.close();
});

describe('REST API access controls', () => {
  it('keeps the health endpoint public', async () => {
    const response = await server.inject({ method: 'GET', url: '/v1/health' });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: 'ok', apiVersion: 'v1' });
  });

  it('rejects protected requests without a valid bearer key', async () => {
    const response = await server.inject({
      method: 'POST',
      url: '/v1/reconstructions/geometry',
      payload: {},
    });

    expect(response.statusCode).toBe(401);
    expect(response.json().error.code).toBe('unauthorized');
  });

  it('authenticates before validating protected request bodies', async () => {
    const response = await server.inject({
      method: 'POST',
      url: '/v1/reconstructions/geometry',
      headers: { authorization: `Bearer ${API_KEY}` },
      payload: {},
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().error.code).toBe('invalid_request');
  });

  it('returns a 3D-ready auditorium response from a theatre manifest', async () => {
    const response = await server.inject({
      method: 'POST',
      url: '/v1/auditoriums/render',
      headers: { authorization: `Bearer ${API_KEY}` },
      payload: { manifest, seatIds: ['seat-a1'] },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.apiVersion).toBe('v1');
    expect(body.auditorium.id).toBe('auditorium-demo');
    expect(body.auditorium.geometry.seats).toHaveLength(1);
    expect(body.metrics).toHaveLength(1);
  });

  it('refuses weak or duplicate API keys at startup', () => {
    expect(() => createApiServer({ apiKeys: ['short'] })).toThrow(
      'Provide unique API keys between 32 and 128 characters.',
    );
    expect(() => createApiServer({ apiKeys: [API_KEY, API_KEY] })).toThrow(
      'Provide unique API keys between 32 and 128 characters.',
    );
  });
});
