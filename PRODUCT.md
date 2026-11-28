# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

People comparing seats before booking a cinema visit. The primary user uploads a seating-plan image and wants to understand the room and likely view from candidate seats before making a choice. The role of cinema staff or other professional users is undecided.

## Product Purpose

Lumen converts a theatre seating-plan screenshot into an editable seat map and an estimated 3D auditorium. It helps a person review the detected layout, adjust assumptions, and inspect or compare the view from seats.

## Positioning

Lumen starts with the seating plan a visitor already has and turns it into an explorable 3D room; it is not a cinema’s booking system or a static seat picker.

## Operating Context

The product is used in a browser during seat selection or planning. Users upload PNG, JPG/JPEG, or WebP seating-plan screenshots, correct the reconstructed layout, configure auditorium assumptions, and use first-person seat views and comparisons.

## Capabilities and Constraints

- Browser-local image analysis and project storage use IndexedDB.
- The experience supports upload, crop, automated seat detection, visual correction, auditorium configuration, 3D exploration, seat comparison, import, and export.
- 3D room geometry, measurements, sightlines, and perspectives are estimates based on a plan and adjustable default assumptions; they are not a guarantee of a real auditorium.
- An optional REST API supports integrations but the browser product does not require it.

## Brand Commitments

Lumen is in beta. The interface should be calm, minimal, spacious, and tactically useful, with soft physical depth rather than a dense technical-dashboard feel.

## Evidence on Hand

- Real test seating plans: `public/test-seating-plan.png` and `public/test-seating-plan-2.png`.
- Product preview video: `public/cinema-preview.mp4`.
- No verified customer proof, pricing, or performance claims are available; future UI must not fabricate them.

## Product Principles

- Start with the plan the user already has.
- Keep the user in control of approximate reconstruction assumptions.
- Make seat choice more intelligible through spatial exploration.
- Prefer local-first, low-friction workflows.

## Accessibility & Inclusion

The product should preserve keyboard-operable controls, visible focus indicators, semantic labels, readable contrast, and responsive layouts.
