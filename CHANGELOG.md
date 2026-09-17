# Changelog

## 0.4.0 — Prepared for store submission

- Default to a plain-English tracking-exposure score report, with a transparent versioned model and graph explanations one click away.
- Keep single-page/deep scans and single-scan exports unlimited and free; reserve recurring monitoring, digests, and bulk reporting for Pro.
- Keep the toolbar normally blank; show unseen notable/important local activity with tab-specific tooltips and stale-navigation guards.
- Add a shared change-importance engine, cached-first/non-blocking popup, and optional off-by-default Quiet Protection with remembered onboarding dismissal.
- Coalesce important notifications, default delivery off, enforce site/day and identical-event cooldowns, and require explicit opt-in for overlapping immediate/weekly delivery.
- Add a quiet Activity inbox, local-day/site-deduplicated briefings, matched-site weekly comparisons, visit/daily/weekly Watching, and local site baselines.
- Export branded share PNGs locally, excluding page paths, query strings, titles, and evidence.
- Add off-by-default local-only usage counts and manual export; no hosting or automatic telemetry uploads.
- Protect explicitly saved scans from retention; add versioned full backups, transactional restore, and storage health controls.
- Add bounded offline billing grace and the provider payment-success content script.

- Removed the non-commercial Disconnect dataset from classification and production bundles; added a release guard against accidental reintroduction.
- Made user-created domain blocks persistent across browser restarts.
- Replaced string-only entitlement checks with behavioral Free/Pro tests at the action boundary.
- Removed bundled sample-scan fixtures from both the interface and production package.
- Scan accessible embedded frames by default and preserve frame-level dependency chains.
- Added explicit classification source and confidence throughout saved graphs and domain details.
- Keep meaningful changes in local activity for checked sites; scope immediate notifications to explicitly watched sites and new followed-domain sightings.
- Added a quiet weekly digest for watchlist changes and a monthly scan count.
- Added finite local snapshot retention for both Free and Pro plans.
- Added actionable restricted-page and injection-failure states.
- Added regression tests for classification, multi-hop graph normalization, and restricted URLs.
