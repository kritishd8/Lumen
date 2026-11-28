# Lumen — Cinema Seating Reconstruction

Lumen turns a screenshot of a cinema seating plan into an editable seat map and an
interactive 3D auditorium. Select a seat to preview its perspective of the screen,
inspect approximate sightlines, and compare seats before booking.

The browser app is local-first: image analysis runs in the browser, and projects are
stored in that browser's IndexedDB. A separate, optional REST API is available for
integrations that need server-side image analysis or geometry calculations.

> **Important:** The 3D room and seat measurements are estimates derived from the
> seating plan and default assumptions. Review the seat map and adjust auditorium
> settings for a more representative view; this is not a guarantee of the real
> auditorium's dimensions or sightlines.

## Features

- Upload PNG, JPG/JPEG, or WebP seating-plan screenshots (up to 45 MB) and crop the
  image before analysis.
- Detect seats, rows, labels, sections, and availability indicators, then review and
  correct the detected layout in a visual editor.
- Add, move, edit, or remove seats and aisles; adjust the screen position on the plan.
- Configure screen dimensions, room geometry, seating, floor slope, materials, and
  other auditorium settings.
- Explore the auditorium in 3D, choose seats from the labeled visual seat map, look
  around from a seat, toggle the theater lights, and compare two seats.
- Inspect estimated seat-to-screen distance, viewing angles, and possible obstructions.
- Save projects in the browser, duplicate or delete them, and import/export project
  JSON files.
- Use the optional authenticated REST API for image analysis and geometry/view-metric
  calculations.
- Download a theatre-specific API manifest after configuring a room, then use it from
  a booking system's server to request a 3D-ready auditorium payload.

## Getting started

### Requirements

- Node.js 22 or newer
- npm
- A modern browser with WebGL enabled for the 3D viewer

### Run the browser app

```sh
npm ci
npm run dev
```

Open the local URL printed by Vite. Choose **Upload a seat plan**, select an image,
and confirm its crop to start analysis. Review the detected seats in the editor,
correct anything that needs attention, and continue to the auditorium view. Select
seats from the visual seat map to see their perspectives.

Use the auditorium settings to refine the room and screen estimates. Saved projects
remain in the current browser profile; use **Export** to keep a portable JSON backup
or move a project to another browser.

The production browser bundle can be built and previewed with:

```sh
npm run build
npm run preview
```

## Optional REST API

The API is a separate Node.js service. Running the browser app does not require the
API. It provides:

- `GET /v1/health` — public liveness check.
- `POST /v1/reconstructions/analyze` — analyze a seating-plan image.
- `POST /v1/reconstructions/geometry` — calculate auditorium geometry and optional
  view metrics for selected seats.
- `POST /v1/auditoriums/render` — validate a saved theatre manifest and return its
  layout, configuration, 3D geometry, and optional seat-view metrics.

Build and run the service with a private API key:

```sh
npm ci
npm run build:api
export API_KEYS="$(openssl rand -hex 32)"
npm run start:api
```

The server listens on `0.0.0.0:3000` by default. Configure `API_KEYS` through your
deployment platform's secret/environment-variable settings in production. Optional
settings include `API_PORT`, `API_HOST`, `API_CORS_ORIGINS`, and `LOG_LEVEL`.

**Never put API keys in frontend code, commit them, or send them to browsers.** Local
`.env` files are ignored by Git, but production secrets should be stored in the
hosting provider's secret manager. For request formats, limits, authentication,
Docker deployment, and error responses, see [the API guide](docs/api.md).

## Development checks

```sh
npm test
npm run build
```

Tests use Vitest. The build checks TypeScript and creates both the browser bundle and
API bundle.

## Technology

React, TypeScript, Vite, Zustand, Three.js with React Three Fiber, SCSS, OpenCV.js,
Tesseract.js, and Fastify.
