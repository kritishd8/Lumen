# Lumen

> Turn a cinema seating plan into an editable 3D auditorium.

[Live demo](https://kritishdhakal.com.np/Lumen) · [API reference](docs/api.md) · [Integration guide](docs/integrating-lumen.md)

Lumen is a local-first tool for turning a seating-plan image into a configurable 3D
auditorium. Upload a plan, correct the detected room, configure the physical space,
and inspect the perspective from any seat.

> [!WARNING]
> Lumen is currently in beta. The reconstructed room and viewing measurements are
> estimates based on the supplied plan and configuration; they are not a guarantee of
> real-world dimensions, sightlines, or ticket availability.

## Why Lumen?

Cinema plans are designed for booking, not for helping someone understand what a
seat will feel like. Lumen bridges that gap by making the plan editable and spatial.
It keeps the source plan in view while giving people a practical way to refine the
room and explore it in 3D.

## Features

- Analyze PNG, JPEG, and WebP seating-plan images directly in the browser.
- Crop the source image, review detection results, and add, remove, or drag seat
  markers to correct the plan.
- Move the screen line, add manual left/centre/right walkways, and adjust their
  placement and width.
- Configure room size, screen size, elevation, row and column spacing, lighting, and
  other auditorium assumptions.
- Explore the room in 3D, view from any seat, select multiple seats, and make
  seat-specific width adjustments.
- Save projects locally in IndexedDB and export portable project or API-manifest JSON.
- Use a protected REST API for server-side analysis, geometry, and theatre
  integrations.

## Live demo

Try Lumen in the browser: **[kritishdhakal.com.np/Lumen](https://kritishdhakal.com.np/Lumen)**

The demo runs locally in your browser. Project data stays in that browser profile
unless you explicitly export it.

## Quick start

### Prerequisites

- Node.js 22+
- npm
- A modern browser with WebGL enabled

### Run locally

```sh
git clone https://github.com/kritishd8/Lumen.git
cd Lumen
npm ci
npm run dev
```

Open the Vite URL printed in the terminal, upload a seating plan, review the detected
layout, then open the auditorium.

### Build and test

```sh
npm run build
npm test
```

`npm run build` type-checks the application and builds both the browser app and API.

## How it works

1. **Upload** a seating-plan image or open the sample plan.
2. **Correct** the detected seats, screen placement, and room structure on the plan.
3. **Configure** the auditorium using room, screen, seating, walkway, and lighting
   controls.
4. **Explore** the rendered room or choose a seat to inspect its perspective.
5. **Export** a project backup or a theatre-specific API manifest when integrating
   with another app.

## API and booking-app integrations

Lumen includes a stateless Fastify API for server-side analysis and geometry
calculation. Theatre operators can configure a room in Lumen, download its
`lumen-auditorium` manifest, and keep that JSON in their booking system's backend.

The booking backend sends the manifest to Lumen's API and receives validated layout,
configuration, 3D geometry, and optional seat-view metrics. The booking client then
renders the result using a compatible viewer or its own Three.js renderer.

```sh
npm ci
npm run build:api
export API_KEYS="$(openssl rand -hex 32)"
npm run start:api
```

Available routes:

| Method | Route | Purpose |
| --- | --- | --- |
| `GET` | `/v1/health` | Public liveness check |
| `POST` | `/v1/reconstructions/analyze` | Analyze a seating-plan image |
| `POST` | `/v1/reconstructions/geometry` | Calculate geometry and seat metrics |
| `POST` | `/v1/auditoriums/render` | Build a 3D-ready response from an exported theatre manifest |

Read the [API reference](docs/api.md) for request formats and deployment settings,
or follow [the booking-app integration guide](docs/integrating-lumen.md) for a
server-side example.

> [!IMPORTANT]
> API keys belong only in a server-side secret manager. Never commit them, include
> them in a manifest, or expose them in browser/mobile application code.

## Architecture

```text
Browser app
  ├─ image preparation + local analysis
  ├─ IndexedDB project storage
  ├─ editable seating layout
  └─ React Three Fiber auditorium viewer

Optional API
  ├─ authenticated image analysis
  ├─ validated geometry calculation
  └─ theatre-manifest rendering contract
```

## Technology

- React, TypeScript, Vite, Zustand
- Three.js and React Three Fiber
- OpenCV.js and Tesseract.js
- Fastify, Zod, Sharp
- Vitest and Testing Library

## Documentation

- [REST API reference](docs/api.md)
- [Integrating Lumen into a booking app](docs/integrating-lumen.md)

## Security

- Browser projects are stored locally by default.
- The optional API is authenticated with bearer keys supplied through environment
  variables.
- API keys are hashed in memory and compared in constant time.
- The API does not persist uploaded images, manifests, or returned layouts.

When deploying the API, terminate TLS at your hosting provider or reverse proxy,
restrict CORS to trusted origins, and use a shared rate-limit store before scaling to
multiple instances.

## Project status

Lumen is an active beta project. Feedback and contributions are welcome; please open
an issue with a clear reproduction or proposed improvement.
