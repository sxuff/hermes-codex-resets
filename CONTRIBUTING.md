# Contributing

## Develop

```bash
npm ci
npx playwright install chromium   # once, for captures
npm run demo      # http://127.0.0.1:4321/demo/ runs desktop/plugin.js against a stand-in SDK
npm run check     # parse, import allowlist, and desktop-lint checks
hermes plugins validate .
```

`desktop/plugin.js` is loaded by Hermes uncompiled: no JSX, no build step, and only `@hermes/plugin-sdk`, `react` and
`react/jsx-runtime` may be imported. Keep it working on Hermes 0.21 (`demo/index.html?legacy` removes the context helpers
0.21 lacks). If you change what the card or chip looks like, run `npm run capture` and commit the new `artifacts/`.

## Commit and PR titles

PRs are squash-merged and the PR title becomes the commit title, so titles follow
[Conventional Commits](https://www.conventionalcommits.org/): `feat: …`, `fix: …`, `perf: …`, `docs: …`, `chore: …`,
`ci: …`. A check on each PR enforces it.

| Title starts with | Next release |
|---|---|
| `feat:` | minor (0.1.0 → 0.2.0) |
| `fix:` / `perf:` | patch (0.1.0 → 0.1.1) |
| `feat!:` or a `BREAKING CHANGE:` footer | minor while below 1.0, major after |
| `docs:`, `chore:`, `ci:`, `refactor:`, `test:` | no release on their own |

## Releases

[release-please](https://github.com/googleapis/release-please) keeps a release PR open on `main`. It bumps the version
in `package.json` and `plugin.yaml` (the `# x-release-please-version` line) and writes `CHANGELOG.md`. Merging it tags
`vX.Y.Z`, publishes the GitHub release, and attaches `plugin.js`.

The Hermes plugin catalog pins an exact commit, so a new release reaches catalog users only after a pin-bump PR to
[`plugin-catalog/hermes-codex-resets.yaml`](https://github.com/NousResearch/hermes-agent/tree/main/plugin-catalog) in
hermes-agent: set `sha` to the release commit, bump `version`, and re-pin the `image` and `screenshots` URLs to that
commit.
