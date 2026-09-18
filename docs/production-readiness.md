# Local-first production readiness

## Data durability contract

- Keep the published extension ID and the production IndexedDB name `linkscope` stable.
- Never delete or clear user storage on install/update, billing errors, or schema failures.
- Database changes must be additive/versioned. Field transformations need transactional migrations.
- Explicitly saved scans are excluded from automatic retention. Unsaving returns them to the plan's retention limits.
- Saved scans remain local, with complete file backups for recovery. They are not guaranteed to survive uninstall or device loss.
- Archive format version 1 includes saved status; legacy archives remain accepted; unknown future formats are rejected.
- Every release must pass tests, type checking, packaging guards, and an installed-extension upgrade check with populated data.

## Outstanding work before production claims

- No account backend or cloud scan sync is planned. Data belongs to the browser installation/profile.
- Complete versioned backups for settings/follows, watched sites, audits, alerts, and portable block domains are implemented in addition to legacy scan archives. Complete restore replaces records transactionally, turns watching off, cancels interrupted audits, and stages restored blocks for manual activation. Existing browser blocks and billing tokens remain unchanged.
- Never back up billing tokens or authentication secrets into user-downloadable archives.
- Restore permissions and blocking only through explicit user actions; do not silently activate scanning on a new device.
- Backup validation and failed-write rollback tests are implemented; test interrupted restore and fresh-profile recovery in a real browser before release.
- A cached paid result keeps one-time Pro access available during a temporary provider outage; a successful unpaid response still downgrades the entitlement immediately.
- Configure the ExtensionPay product as a one-time $14.99 plan and connect the intended Stripe account; verify live checkout, restore purchase, refunds, and support flows.
- The payment-success content script and purchase restoration flow are implemented according to ExtensionPay documentation; verify them against the actual provider account.
- Storage usage/error reporting and browser persistence request are implemented. Neither protects against uninstall or device loss; external backups remain required.
- Prepare privacy disclosures, support contact, refund policy, store screenshots, listing, and review instructions.
- Publish only after real-browser upgrade, permission, purchase, and recovery checks pass.

## Provider setup and manual release gates

1. Confirm the `linkscope` ExtensionPay product and connect the intended Stripe account.
2. Configure a single one-time $14.99 plan in the provider dashboard. Confirm the product is configured as a single purchase, then configure support and refund details.
3. On an unpacked sandbox build, verify test checkout, payment-success refresh, purchase restoration, Pro feature unlocks, the ExtensionPay test reset between paid/unpaid, and refund handling.
4. On the actual store-installed build, verify live mode and prices before authorizing any real transaction. No real purchase was performed by this implementation.
5. Update an old populated installation in place, without uninstalling. Confirm scans, graphs, saved status, preferences, watching, following, audits, and dynamic blocks remain intact.
6. Restore a complete backup into a fresh profile; verify cancelled/damaged restores, inactive restored scanning, manual block permission approval, and unchanged billing access.
7. Inspect the packaged payment content script: only `https://extensionpay.com/*`, at document start. Disclose this narrow billing permission in the store listing.
8. Publish releases to the same store listing and keep database migration history intact.
