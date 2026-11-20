import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { createApiServer } from '../../server/index';

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

  it('refuses weak or duplicate API keys at startup', () => {
    expect(() => createApiServer({ apiKeys: ['short'] })).toThrow(
      'Provide unique API keys between 32 and 128 characters.',
    );
    expect(() => createApiServer({ apiKeys: [API_KEY, API_KEY] })).toThrow(
      'Provide unique API keys between 32 and 128 characters.',
    );
  });
});
