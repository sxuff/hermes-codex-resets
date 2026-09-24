---
message: "Codex Resets tells you the moment OpenAI resets your Codex limits, right inside Hermes."
mode: autonomous
duration: 19s
canvas: 1920x1080
---

# Design

- Palette: Hermes window in warm dark (#0f0c0b / #171210, text #e9e4df, accent #e07a3f); plugin surfaces in its own brand:
  blue #0000f2, off-white #f2f2f2, yellow #f2f200, cyan #00f2f2.
- Type: Antonio 200 (display, the plugin's "RESET"), Barlow Condensed 500 (tracked labels, captions), IBM Plex Mono
  (quotes, data rows); Inter for the recreated app chrome only.
- Concept: the product explains itself. A real UI element (the chip) is the hero; the camera goes to it, and captions in
  the plugin's own label style carry the story for sound-off feed viewing.
- Focal: the card at the chip. Edge anchors: caption block top-left, status bar bottom. Background: the Hermes window.
- World UI is a 1.5× recreation of the real plugin (card 540×285, chip 19px) so it reads in-feed after the camera zoom.

# Structure

One file, one paused timeline. The window is a `.world` driven by a single camera (`viewport-change`, anchored to the
bottom-right corner so the frame never shows past the window edge). Yellow and blue full-frame wipes between scenes echo
the flood.

## Frame 1 — Working in Hermes (0–2.9s)
status: built · src: index.html#scene-world
Rules: viewport-change (push 1.0 → 1.6×). Caption "Working in Hermes", then "The chip keeps time".

## Frame 2 — A reset lands (3.9–7.2s)
status: built · src: index.html#scene-world
Rules: spring-pop-entrance (card rises from the chip, bottom-right origin), anchored-layout-expand mask (flood clip-path),
waterfall-entry (RESET letters). Wing crossfades idle → flare. Chip turns yellow.

## Frame 3 — Banked (7.4–10.0s)
status: built · src: index.html#scene-world
Same shape, cyan, "BANKED / +1 RESET STORED".

## Frame 4 — Typing (10.0–12.9s)
status: built · src: index.html#scene-world
Rules: viewport-change (pull to 1.25×), discrete-text-sequence (composer typing), control-target-sync (chip sweep).

## Frame 5 — History (13.1–16.1s)
status: built · src: index.html#scene-history
Rules: counting-dynamic-scale (0 → 54), waterfall-entry (rows).

## Frame 6 — End card (16.0–19.0s)
status: built · src: index.html#scene-end
Rules: waterfall-entry (title letters), flood mask. Install line and data credit.
