import { createApiServer } from './index';

const apiKeys = (process.env.API_KEYS ?? '')
  .split(',')
  .map((key) => key.trim())
  .filter(Boolean);

const corsOrigins = (process.env.API_CORS_ORIGINS ?? '')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

const server = createApiServer({ apiKeys, corsOrigins });
const port = Number(process.env.API_PORT ?? 3000);
const host = process.env.API_HOST ?? '0.0.0.0';

if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error('API_PORT must be a valid TCP port.');
}

await server.listen({ port, host });

const shutdown = async () => {
  await server.close();
  process.exit(0);
};

process.once('SIGINT', () => void shutdown());
process.once('SIGTERM', () => void shutdown());
