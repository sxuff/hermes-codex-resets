# Security

Report a vulnerability privately through [GitHub security advisories](https://github.com/sxuff/hermes-codex-resets/security/advisories/new), not in a public issue.

## What the plugin can reach

`desktop/plugin.js` runs inside the Hermes desktop app with the app's authority. It is kept small on purpose:

- It imports only `@hermes/plugin-sdk`, `react`, and `react/jsx-runtime`, and passes the `desktop surface` and `security scan` checks of `hermes plugins validate`.
- Its only network requests are `GET` calls to `https://codex-resets.com/api/v1/` and the Google Fonts stylesheet. It sends nothing about you or your sessions.
- It stores two values in its own plugin storage and reads no other Hermes state: no sessions, messages, config, or gateway calls.
- It never downloads or replaces its own code. Updates come only through a new release (and, for catalog installs, a reviewed pin update).

Reset text comes from a third-party API. It is set as plain text or HTML-escaped before it reaches the page.
