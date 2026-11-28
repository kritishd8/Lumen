# Integrating Lumen into a booking app

This guide shows the intended production flow for a theatre that has configured a
room in Lumen and wants to show it inside its own booking experience.

## 1. Configure and export the auditorium

In Lumen, finish the seating-plan review and room settings. In **Advanced**, select
**Download API JSON**. Save the downloaded `lumen-auditorium` JSON file with that
theatre's server-side configuration. It contains the seat layout and auditorium
settings, but no image, API key, customer information, or booking state.

## 2. Keep the API key on the theatre server

Create a private Lumen API key in the environment where the theatre's backend runs.
Never include that key in browser JavaScript, mobile application bundles, a JSON
manifest, or Git.

```sh
LUMEN_API_URL=https://api.example.com
LUMEN_API_KEY=store-this-in-your-secret-manager
```

The booking app's browser should call the theatre's backend. The theatre backend
then calls Lumen. This protects the key and lets the theatre decide which rooms and
seats are available to a customer.

## 3. Request the 3D-ready model

The endpoint accepts the exported manifest and, optionally, the seats whose view
metrics are needed. The example below uses a Node server route.

```ts
import type { Request, Response } from 'express';
import auditoriumManifest from './screen-4-lumen.json' with { type: 'json' };

export async function getAuditorium(_request: Request, response: Response) {
  const lumenResponse = await fetch(`${process.env.LUMEN_API_URL}/v1/auditoriums/render`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${process.env.LUMEN_API_KEY}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      manifest: auditoriumManifest,
      seatIds: ['seat-a1'],
    }),
  });

  if (!lumenResponse.ok) {
    return response.status(502).json({ error: 'Lumen auditorium is unavailable.' });
  }

  return response.json(await lumenResponse.json());
}
```

The response includes `auditorium.layout`, `auditorium.config`, and
`auditorium.geometry`. It also includes `metrics` for requested seat IDs.

## 4. Render it in the booking client

The endpoint deliberately returns data rather than executable code or a remote
canvas. Render the received geometry with a Lumen-compatible Three.js/React Three
Fiber viewer, or map it into the theatre's existing 3D renderer.

When a visitor chooses a seat, update the booking system's own availability state.
Lumen's layout describes the physical room; it does not own ticket inventory,
payments, customer identity, or seat reservations.

## Security checklist

- Store `LUMEN_API_KEY` only in a server-side secret manager.
- Allow browsers to call the theatre backend, not the Lumen API directly.
- Keep the exported manifest under the theatre's configuration control.
- Use HTTPS for both the theatre backend and Lumen API.
- Restrict CORS and rotate keys if a server secret may have been exposed.
