# Lumen REST API

The API is a separate, stateless Node service. The existing browser app remains local-first and does not require the API. The service does not save uploaded images or customer layouts.

## Run and host

Use Node.js 22 or newer. Generate a private key with at least 32 random bytes, then configure it as `API_KEYS`. Multiple keys can be supplied as a comma-separated environment variable. Keep these keys on your server; never put them in a public browser app.

```sh
npm ci
npm run build
API_KEYS="replace-with-a-private-random-key-of-at-least-32-characters" npm run start:api
```

The API listens on `0.0.0.0:3000` by default. Set `API_PORT`, `API_HOST`, and `LOG_LEVEL` to change this. `API_CORS_ORIGINS` is an optional comma-separated allowlist; browser use is disabled when it is unset. CORS is not a substitute for keeping API keys out of browsers.

For a container deployment:

```sh
docker build -f Dockerfile.api -t lumen-cinema-api .
docker run --rm -p 3000:3000 \
  -e API_KEYS="replace-with-a-private-random-key-of-at-least-32-characters" \
  lumen-cinema-api
```

Terminate TLS at the hosting provider or a reverse proxy. Rotate a key by replacing `API_KEYS` and restarting the service. Do not commit keys or expose them in logs. The included rate limiter is process-local; use a shared rate-limit store before running multiple API replicas. This first API release does not provide customer accounts, key issuance, usage billing, or persistent project storage.

## Authentication and limits

All routes except `GET /v1/health` require:

```http
Authorization: Bearer YOUR_API_KEY
```

Requests are rate-limited to 60 per minute per client IP; image analysis is limited to 6 per minute per client IP. Image uploads are limited to 20 MiB and 40 million decoded pixels, analysis images are reduced to at most 1800 pixels on either side, and JSON requests are limited to 2 MiB. Layout requests are capped at 2,000 seats and geometry responses calculate optional view metrics for at most 20 seats.

Image analysis runs in a bounded worker thread. Only PNG, JPEG, and WebP files are accepted. API keys are held in memory as hashes and are compared in constant time. The service does not persist the request image or returned layout.

## Routes

### `GET /v1/health`

Public liveness check. Returns `{ "status": "ok", "apiVersion": "v1" }`.

### `POST /v1/reconstructions/analyze`

Send `multipart/form-data` with:

| Field | Required | Value |
| --- | --- | --- |
| `image` | Yes | One PNG, JPEG, or WebP seating-plan image |
| `config` | No | A JSON string containing an `AuditoriumConfig` |

Example:

```sh
curl https://api.example.com/v1/reconstructions/analyze \
  -H "Authorization: Bearer $LUMEN_API_KEY" \
  -F "image=@seating-plan.png"
```

Returns the detected `layout`, estimated or supplied `config`, calculated `geometry`, and detection `stats`. Detection is local to the API host; optional OpenCV and OCR are not required by this endpoint. Detected labels and availability remain estimates and should be reviewed.

### `POST /v1/reconstructions/geometry`

Send a JSON body containing an existing `layout`, a full `config`, and optional seat IDs for which to calculate view metrics. The input layout and config use the app's version-1 domain types. Use the `layout` and `config` returned by the analyze endpoint as a starting point, then change screen dimensions, room dimensions, seat properties, rows, sections, and aisles before requesting geometry.

```json
{
  "layout": { "...": "version-1 SeatingLayout" },
  "config": { "...": "AuditoriumConfig" },
  "seatIds": ["seat-1", "seat-2"]
}
```

Returns `{ "geometry": SpatialGeometry, "metrics": ViewMetrics[] }`. Omit `seatIds` to skip view-metric calculations. Layout and configuration fields are validated, bounded, and unknown fields are rejected.

## Errors

Errors use a stable shape:

```json
{
  "error": {
    "code": "invalid_request",
    "message": "The layout or configuration is invalid.",
    "requestId": "..."
  }
}
```

Validation errors may include up to 20 field paths and messages. Common status codes are `400` for invalid input, `401` for missing or invalid credentials, `413` for oversized input, `415` for unsupported image formats, `422` for images that cannot be analyzed, `429` for rate limits, `503` when both analysis workers are busy, and `504` when analysis times out.
