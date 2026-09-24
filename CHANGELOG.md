# Changelog

## [0.1.0](https://github.com/sxuff/hermes-codex-resets/releases/tag/v0.1.0) (2026-09-24)

First release.

- Status-bar chip with the time since the last Codex reset, a watch or schedule when there is one, and how far past the average interval the current cycle is.
- Status card that grows out of the chip: last reset type and time, the reset sentence from the announcement, next expected reset, a link to the history page, and the Codex Resets attribution.
- Reset moment on the same card: yellow flood for regular resets, cyan for banked. Chip-only while you type, with the card deferred until you pause. System notification while Hermes is in the background, replayed on return.
- History page with every reset, its interval from the previous one, and a link to the post.
- Works on Hermes 0.21, whose plugin context has no `setTimeout`, `setInterval`, or `addEventListener` helpers.
- Only announces resets newer than the last one seen, so first installs and upstream corrections never replay an old reset.
