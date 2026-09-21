# Local-first production readiness

## Data durability contract

- Keep the published Chrome Web Store extension ID and the production IndexedDB name `linkscope` stable. These are local-data continuity identifiers, not branding. Changing the Dexie name would wipe scan history on update.
- Never delete or clear user storage on install/update, billing errors, or schema failures.
- Database changes must be additive/versioned. Field transformations need transactional migrations.
- Explicitly saved scans are excluded from automatic retention. Unsaving returns them to the plan's retention limits.
- Saved scans remain local, with complete file backups for recovery. They are not guaranteed to survive uninstall or device loss.
- Archive format version 1 includes saved status; legacy archives remain accepted; unknown future formats are rejected. Complete backup `kind` remains `linkscope-complete-backup` so existing files restore.
- Every release must pass tests, type checking, packaging guards, and an installed-extension upgrade check with populated data.

## Name and billing identifiers

Product name is **OutTrace** (formerly LinkScope). Knockout search on USPTO Trademark Search (Wordmark, live+dead) on 2026-09-19:

- `OutTrace`: 0 live, 0 dead.
- `OUTRACE`: 0 live; two dead filings (sn 87126245 LED lighting, cancelled 2024; sn 79200640 fitness equipment, abandoned 2017).
- Nearby products that are not exact matches: OpenTrace (code knowledge graph), ALLOut TRACE (UK privileged-access audit software), Outrace S.r.l. (Italian fitness), OUTRACE Sp. z o.o. (Poland). This is not legal advice and is not a filed registration.

Permanent billing identifiers stay `linkscope`: the ExtensionPay product slug, IndexedDB name, and Chrome Web Store item ID. The Stripe product and price display name is **OutTrace**. Do not create a second ExtensionPay slug.

Share-card URL stays `linkscope.dev` until a new domain is registered. Domain work is deferred.

## Outstanding work before production claims

- No account backend or cloud scan sync is planned. Data belongs to the browser installation/profile.
- Complete versioned backups for settings/follows, watched sites, audits, alerts, and portable block domains are implemented in addition to legacy scan archives. Complete restore replaces records transactionally, turns watching off, cancels interrupted audits, and stages restored blocks for manual activation. Existing browser blocks and billing tokens remain unchanged.
- Never back up billing tokens or authentication secrets into user-downloadable archives.
- Restore permissions and blocking only through explicit user actions; do not silently activate scanning on a new device.
- Backup validation and failed-write rollback tests are implemented; test interrupted restore and fresh-profile recovery in a real browser before release.
- A cached paid result keeps one-time Pro access available during a temporary provider outage; a successful unpaid response still downgrades the entitlement immediately.
- Storage usage/error reporting and browser persistence request are implemented. Neither protects against uninstall or device loss; external backups remain required.
- Prepare privacy disclosures, store screenshots, listing, and review instructions. Support and refunds: `websparkgenerations@gmail.com`.

## Provider setup and manual release gates

1. Stripe product `prod_VG64un2BtS8W06` is OutTrace with the live one-time $14.99 `OutTrace Pro` price. Keep the ExtensionPay slug `linkscope` and confirm the ExtensionPay dashboard display name is OutTrace. Product support contact is `websparkgenerations@gmail.com`. In Stripe Dashboard → Settings → Public details, set the same support email and statement descriptor `OUTTRACE` (the Accounts API cannot update your own account).
2. On an unpacked sandbox build: test checkout, payment-success return to the Pro page, restore-purchase, Pro feature unlocks, and ExtensionPay’s paid/unpaid test reset.
3. Update the live Chrome Web Store listing **in place** (same extension ID `eedjncgcdepjbmpapihoigdbdfobmdmc`): new name, copy from `store/listing.md`, screenshots, and “formerly LinkScope” in the description for the first release or two.
4. Update an existing installed build (old LinkScope name, real local data) to this build without uninstalling. Confirm scans, graphs, saved status, preferences, watching, following, audits, and dynamic blocks remain intact.
5. Run one real end-to-end live purchase on the store-installed build before calling billing done. No real purchase has been performed yet.
6. Domain registration is deferred. Keep `SHARE_CARD_URL` as `linkscope.dev` until a new domain is actually registered and resolving.
7. Restore a complete backup into a fresh profile; verify cancelled/damaged restores, inactive restored scanning, manual block permission approval, and unchanged billing access.
8. Inspect the packaged payment content script: only `https://extensionpay.com/*`, at document start. Disclose this narrow billing permission in the store listing.
9. Publish releases to the same store listing and keep database migration history intact.
