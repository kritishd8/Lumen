---
name: Lumen
description: A calm local-first cinema seating reconstruction tool.
colors:
  canvas: "#f4f4f1"
  paper: "#fbfbfa"
  ink: "#232329"
  muted: "#68696f"
  line: "rgba(35, 35, 41, 0.1)"
  charcoal: "#292930"
  cinema-gold: "#aa7c34"
typography:
  display:
    fontFamily: "Inter Variable, Inter, sans-serif"
    fontSize: "clamp(48px, 5.5vw, 80px)"
    fontWeight: 570
    lineHeight: 0.94
    letterSpacing: "-0.065em"
  body:
    fontFamily: "Inter Variable, Inter, sans-serif"
    fontSize: "17px"
    fontWeight: 400
    lineHeight: 1.45
rounded:
  control: "999px"
  surface: "20px"
  canvas: "24px"
spacing:
  compact: "12px"
  standard: "24px"
  spacious: "clamp(24px, 4vw, 60px)"
components:
  button-primary:
    backgroundColor: "{colors.charcoal}"
    textColor: "#ffffff"
    rounded: "{rounded.control}"
    height: "38px"
  surface:
    backgroundColor: "{colors.paper}"
    rounded: "{rounded.surface}"
---

# Design System: Lumen

## Overview

**Creative North Star: "The Quiet Cinema"**

Lumen treats a technical reconstruction workflow like a calm, physical viewing room: abundant warm-white space, carefully lifted working surfaces, and a single charcoal action voice. Screens should feel clear before they feel clever.

Key characteristics: spacious operating layouts, human editorial type, tactile but restrained controls, and cinema cues used as quiet supporting material rather than decoration.

## Colors

Warm off-white surfaces carry the work; charcoal is reserved for primary commitment and clear ink.

- **Canvas** (`#f4f4f1`): application backdrop and low-emphasis workspace ground.
- **Paper** (`#fbfbfa`): elevated cards, dialogs, and navigation surfaces.
- **Ink** (`#232329`): primary text and controls.
- **Muted** (`#68696f`): supporting information.
- **Cinema Gold** (`#aa7c34`): sparing status and calibration emphasis.

**The One Voice Rule.** Use charcoal for the current primary action. Do not introduce competing bright accent colors into an operating screen.

## Typography

**Display Font:** Inter Variable, Inter, sans-serif

**Body Font:** Inter Variable, Inter, sans-serif

Display headings are compact, slightly tight, and quiet rather than theatrical. Body copy stays short and explanatory.

- **Display:** 570 weight, `clamp(48px, 5.5vw, 80px)`, 0.94 line-height, `-0.065em` tracking.
- **Headline:** 600 weight, `clamp(28px, 3.4vw, 48px)`, tight tracking.
- **Body:** 17px, 1.45 line-height.
- **Label:** 11–14px, normal case; use only for actual controls or measurements.

## Layout

The landing hero is centered independently of the top bar. Workspace pages use a spacious outer padding of `clamp(24px, 4vw, 60px)`, leaving dense detail only inside the task surface. Editors retain their functional rails and canvases; configuration and comparison use generous vertical separation between groups.

## Elevation & Depth

Depth is soft and ambient: white surfaces use a low-opacity, broad shadow plus a subtle inset highlight. Primary buttons use restrained charcoal gradients and a low, diffuse shadow. Never use hard offset shadows or noisy textures.

## Shapes

Actions are pills. Working surfaces use 20–24px rounded corners. Inputs and presets use 12–14px corners. Fine `rgba(35, 35, 41, 0.1)` borders create separation without making the interface feel boxed in.

## Components

### Buttons

- **Primary:** charcoal pill with white text and soft physical depth.
- **Secondary:** white or translucent pill with a fine border.
- **Hover:** a minimal increase in shadow; never a jumpy lift.

### Cards / Containers

- **Background:** translucent warm paper.
- **Corner Style:** 20–22px.
- **Depth:** broad, low-opacity shadow with a soft internal highlight.

### Inputs / Fields

- **Style:** white field, 12px radius, quiet gray border.
- **Focus:** preserve visible browser focus; do not rely on color alone.

### Navigation

Navigation is a thin warm-paper strip with the brand at left, contextual controls only, and no dense application chrome.

## Do's and Don'ts

- **Do** keep operating screens airy around the essential task surface.
- **Do** use physical depth to clarify interactive layers.
- **Do** preserve dark 3D canvases where they communicate the auditorium itself.
- **Don't** add grain, scanline noise, or decorative motion to a working surface.
- **Don't** turn every status into a colored badge.
- **Don't** use all-caps technical labels as decorative structure.
