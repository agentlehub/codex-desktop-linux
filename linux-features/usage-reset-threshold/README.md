# Usage reset threshold

Choose the local remaining-quota threshold for explicitly requested agent usage resets in Usage settings. This feature is disabled by default. It permits a local attempt when eligible; service acceptance, including above the standard 10% threshold, is not guaranteed.

## Enable

Add `usage-reset-threshold` to the `enabled` array in your local `linux-features/features.json`, preserving other enabled features and settings. The committed `features.example.json` remains empty. You can also select the feature through `make setup-native`.

Rebuild with `./install.sh` or the repository's existing native packaging workflow. This is a build-time feature: editing the feature selection does not change an already running or installed app. See the [top-level build instructions](../../README.md).

## Usage settings

The existing **Allow Codex to use resets** switch remains authoritative. Two controls follow it: **Use custom reset threshold** and **Reset threshold (% remaining)**.

| Master permission | Custom mode | Custom switch | Percentage field | Effective behavior |
| --- | --- | --- | --- | --- |
| Off | Either | Disabled | Disabled | Agent resets are disabled. |
| On | Off | Enabled | Disabled | Standard threshold: 10% remaining. |
| On | On | Enabled | Enabled | Custom threshold: the saved percentage remaining. |

The percentage is a whole number from 1 through 99, default 10. Either available core Codex window may qualify. The comparison is inclusive and uses unrounded usage. Missing usage never qualifies. A 99% threshold still requires at least 1% used in a valid core window.

Enter or blur applies an edit. Trimmed decimal digits are accepted; leading zeros normalize. Empty text, signs, fractions, exponent notation, nonfinite values and out-of-range values remain visible with an inline error and are not applied. Escape restores the latest accepted value. Invalid draft text does not change the accepted runtime policy.

Turning either switch off discards unsent draft text and retains the accepted percentage. Both custom controls are disabled while a write is pending; the master switch stays available. A submitted preference write can finish after the master is turned off, but cannot authorize a reset. Cross-window subscriptions update the accepted value; a focused dirty draft remains until committed or discarded.

## Permission and reset behavior

Each reset still requires explicit user authorization. Neither changing the percentage nor either switch spends or schedules a reset. There is no automatic reset, retry, credit selection, new tool argument, or HTTP fallback. The tool retains its original idempotency key, outcomes, task-host transport and independent main-process master-permission gate.

Each invocation reads fresh core usage and the controlling desktop's current policy, then rechecks policy, master permission and cancellation before dispatch. The final policy read defines that invocation's snapshot. A later preference edit applies to later attempts; this is not an atomic transaction across the renderer, main process and service.

Existing tasks may retain earlier stock 10% tool instructions until their normal catalog refresh or a new task. A fresh catalog describes standard and custom mode. Tool instructions do not override runtime enforcement.

## Native settings and persistence

The policy belongs to the controlling desktop's native profile, alongside the master switch. It is not per task, project, quota pool, or account. Existing profile sharing and the optional `community-profile-isolation` feature remain authoritative. Task-host authentication, usage and redemption retain their existing host scope.

Native settings own `desktop.codex-linux-agent-usage-reset-policy`, a strict object with `enabled` and `remainingPercent`. Missing configuration defaults to custom mode off and 10. Invalid persisted values are dropped by the native loader and receive that default; a runtime settings-read failure instead blocks the attempt. Tools and agents cannot write this read-only native setting.

A settings acknowledgment means accepted in current memory. Disk persistence is queued and can fail while the accepted value and pending write remain in memory. The controls do not claim a durable disk save. A failed preference bridge write shows an error, restores the accepted draft and does not issue a rollback write or automatic retry.

## Disable or remove

Remove only `usage-reset-threshold` from your enabled feature list, preserving other choices, and rebuild through the same workflow. The rebuilt app restores stock controls and the stock 10% threshold. The saved custom policy remains inert so a later re-enable can reuse it. Disabling the feature does not delete settings or change the master permission.

## Validation

Current compatibility checks use signed stable OpenAI Linux package **26.1016.61520** on **amd64 and arm64**. Feature-only disposable app builds passed, including extraction, patching, ASAR repacking, and layout verification. Checks on fresh source and the built ASARs passed for emitted JavaScript syntax, four-registry discovery, preservation of manual-reset and permission-gate code, and byte-identical reapplication. The newer Usage help wording is covered by a bounded signed-source fixture; older behavioral fixtures retain their original provenance. Feature, framework, packaging, and patch-engine tests passed without skips. The upstream update-builder filter omits this feature's tests and fixtures while retaining its production inputs.

These current checks did not produce native package archives, install or launch the app, or repeat hosted Nix validation. Earlier feature-enabled and feature-disabled build comparisons used signed stable OpenAI Linux package **26.1007.21434** on **amd64 and arm64**:

- Feature, feature-framework, and packaging tests passed without skips. Runtime tests use bounded source snippets with inert settings, authentication, usage and transport fakes.
- Official-bundle feature audits passed on each architecture.
- Feature-enabled and feature-disabled disposable builds passed on both architectures. Complete file-manifest comparisons confirmed that disabled outputs contain only the required `quit-confirmation-focus` core repair, while enabled outputs differ from that core-only baseline in exactly the eight planned feature assets.
- Built-output syntax/import checks, four-registry inventory, preserved manual/master paths, and byte-identical reapplication passed. Fault tests verify zero writes on failed preflight and restoration of partially written files, including explicit rejection when restoration fails.
- Update-builder staging retains the feature and its policy module. Disabled-feature tests verify zero module loads, asset probes, and writes.

Run the feature suite with `node --test linux-features/usage-reset-threshold/test.js`. Existing GitHub CI discovers the feature in both Nix maximal profiles on both architectures; no local Nix installation or build was performed. Actual CI results are reported with the pull request.

Inert tests and signed-package static checks do not establish service eligibility or successful redemption. No real reset was requested or consumed; no live profile, application UI or app-server socket was used. The generated disposable launchers were never run.
