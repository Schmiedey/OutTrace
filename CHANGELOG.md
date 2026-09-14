# Changelog

## Unreleased

- Removed the non-commercial Disconnect dataset from classification and production bundles; added a release guard against accidental reintroduction.
- Made user-created domain blocks persistent across browser restarts.
- Replaced string-only entitlement checks with behavioral Free/Pro tests at the action boundary.
- Removed bundled sample-scan fixtures from both the interface and production package.
- Scan accessible embedded frames by default and preserve frame-level dependency chains.
- Added explicit classification source and confidence throughout saved graphs and domain details.
- Scoped automatic change diffs and alerts to sites users explicitly watch.
- Added a quiet weekly digest for watchlist changes and a monthly scan count.
- Added finite local snapshot retention for both Free and Pro plans.
- Added actionable restricted-page and injection-failure states.
- Added regression tests for classification, multi-hop graph normalization, and restricted URLs.
