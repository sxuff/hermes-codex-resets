---
workflow: general-video
flow: automation
storyboard: no
message: "Codex Resets tells you the moment OpenAI resets your Codex limits, right inside Hermes."
destination: x-feed
aspect: 1920x1080
language: en
length: 18s
angle: product-demo
---

## Intent

Launch clip for the X/Twitter announcement of Codex Resets, a Hermes Desktop plugin. The user asked for "a clip for
the tweet/announcement post". It shows the plugin doing its job inside a Hermes window: the quiet status-bar chip,
a reset landing (card rises out of the chip and floods yellow), the banked variant (cyan), the typing case (only the
chip sweeps), the history of 54 resets, and an end card with the install command. 16:9 was chosen over 1:1 by the user.

## Assets

- ../artifacts/*.png — real screenshots of the plugin (card, reset, banked, watch, typing, history, banner); reference for fidelity.
- ../desktop/plugin.js — the plugin's real CSS and copy; the clip recreates this UI, not a mock-up of something else.

## Notes

- Visual identity is the plugin's own: electric blue #0000f2, off-white #f2f2f2, yellow #f2f200, cyan #00f2f2,
  thin compressed uppercase display (Antonio 200), Barlow Condensed 500 tracked labels, IBM Plex Mono, Bayer-dithered white wing.
- No voiceover. Music optional, not required.
- Credit the data source on the end card: "Data from codex-resets.com". Not affiliated with OpenAI or Nous Research.
- Install line: `hermes plugins install sxuff/hermes-codex-resets` (repo not yet public at build time).
