# Changelog

## 0.5.4 — 2026-09-20

- Removed the New Tab page override so Chrome no longer warns that OutTrace replaces the page you see when opening a new tab.
- Dropped the install-time `tabs` permission; current-tab scans use `activeTab`, and watched or blocked sites still ask for host access only when needed.
- Moved notifications to an optional permission requested only when change alerts are turned on.
- Switched domain blocking to `declarativeNetRequestWithHostAccess` so Chrome does not show “Block content on any page” at install.

## 0.5.3 — 2026-09-20

- Added Product Hunt badges to the README, Welcome page, Settings, store listing copy, and promo images.

## 0.5.2 — 2026-09-20

- Added a Manage billing button for Pro users that opens ExtensionPay for receipts, restore, and billing help.

## 0.5.1 — 2026-09-20

- Fixed the global graph empty state when no sites have been checked yet.

## Unreleased

- Added Chrome Web Store screenshots and promo tiles for OutTrace, showing check-this-page, unread portfolio changes, after-update diffs, and client reports.
- Pointed Settings, Pro, checkout, and the store listing at support email `websparkgenerations@gmail.com` for questions and refunds. Live Stripe remains one-time $14.99 OutTrace Pro; keys stay out of the extension.
- Renamed the product to OutTrace (formerly LinkScope) across the store listing, manifest, and UI. IndexedDB, ExtensionPay slug, and Chrome Web Store item ID remain `linkscope`. The live Stripe product is now named OutTrace ($14.99 once). Share cards still print `linkscope.dev`.
- Added restrained Pro paths to the popup, change comparison, and audit report; share cards now include `linkscope.dev`.
- Clarified that free Quiet Protection works while browsing while Pro adds scheduled watching, and made deep mode explicit in the free daily audit.
- Increased Free Watching from one visit-only site to two and removed the obsolete extended-history entitlement.
- Added a first-install welcome page and an optional count-only telemetry sender/receiver with no user or install identifier.
- Made manual scans, local scan history, graphs, scores, and single-scan exports equally available on Free and Pro; retention is now a shared device-storage safety boundary rather than a paywall.
- Limited Free users to one site audit per local calendar day; Pro now unlocks unlimited site audits, with a clear in-place upgrade prompt at the limit.
- Locked audit-limit, bulk-export, and watched-site-limit actions now open the checkout dialog without losing the user’s current work.
- Added consent-only local measurement for paywall touches and checkout start/completion; it never records URLs, domains, or scan data.
- Pro confirmation is now a short-lived payment animation; the persistent state is simply `Pro active`, and the popup no longer repeats a thank-you message.
- Hardened the ExtensionPay return flow so checkout and Stripe billing navigation bring the user back to OutTrace even when the hosted tab changes or the original tab closes.

## Unreleased

- Reworked Pro billing around a one-time $14.99 ExtensionPay unlock, with cached paid entitlements, a 20-scan/30-day Free history wall, and unlimited Pro history.
- Return the successful ExtensionPay/Stripe checkout tab to OutTrace's Pro page and show a reduced-motion-safe unlock confirmation; paid surfaces now replace upgrade actions with a Pro-active badge.
- Added near-limit popup and Settings purchase entry points, one-time payment disclosure, purchase restoration, and “Pro unlocked — thanks!” confirmation.
- Kept context-menu scans, visit badges, and one free visit-only watched site available without Pro; recurring checks and additional watched sites remain Pro features.
- Added an “Audit this site” action to every saved-site row and report, and restored the persistent sidebar upgrade control while billing status loads.
- Prevented site audits from hanging in sitemap discovery when a website leaves `robots.txt` or sitemap requests open.
- Added opt-in right-click scanning, per-hostname watchlist consent, visit-time new-domain badges, and one-time shortcut guidance.
- Made the popup’s monthly tracker/site summary use saved local scan data only; no sample or placeholder counts.
- Scheduled the off-by-default weekly digest with an alarm and made its copy informational.
- Kept denied watched sites manual-only and revoke their hostname access when removed.
- Added an off-by-default new-tab widget with local last-scan, watched-alert, and dashboard summaries. Removed in 0.5.4 because the override still appeared as an install-time warning.

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
- Add cached one-time billing status and the provider payment-success content script.

- Removed the non-commercial Disconnect dataset from classification and production bundles; added a release guard against accidental reintroduction.
- Made user-created domain blocks persistent across browser restarts.
- Replaced string-only entitlement checks with behavioral Free/Pro tests at the action boundary.
- Removed bundled sample-scan fixtures from both the interface and production package.
- Scan accessible embedded frames by default and preserve frame-level dependency chains.
- Added explicit classification source and confidence throughout saved graphs and domain details.
- Keep meaningful changes in local activity for checked sites; scope immediate notifications to explicitly watched sites and new followed-domain sightings.
- Added a quiet weekly digest for watchlist changes and a monthly scan count.
- Added plan-aware local snapshot retention controls.
- Added actionable restricted-page and injection-failure states.
- Added regression tests for classification, multi-hop graph normalization, and restricted URLs.

## Client website workflow

- Reposition onboarding around checking, monitoring, and reporting on websites you maintain.
- Add a searchable portfolio with unread-change priority, watch coverage, and links to monitoring and reports.
- Add printable and text client reports with resource-only evidence and private URL/title omission.
- Preserve unread activity when Overview opens.
- Surface monitoring after popup scans, and clarify browser-running requirements for scheduled checks.
- Preserve lifetime Pro pricing and existing entitlements.
