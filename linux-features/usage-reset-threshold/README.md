# Usage reset threshold

Choose the remaining-quota threshold for explicitly requested agent usage resets in Usage settings. Custom mode lets Codex use a reset above the standard 10% remaining limit, up to your saved threshold. This feature is disabled by default.

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

Turning either switch off discards unsent draft text and retains the accepted percentage. Both custom controls are disabled while a write is pending; the master switch stays available. A submitted preference write can finish after the master is turned off, but cannot authorize a reset. Cross-window subscriptions update the accepted value; a focused dirty draft remains until committed or discarded. Replacing an unfocused draft clears its validation error, but a previous write-failure message remains visible.

## Permission and reset behavior

Each reset still requires explicit user authorization. Neither changing the percentage nor either switch spends or schedules a reset. There is no automatic reset, retry, credit selection, new tool argument, or HTTP fallback. The tool retains its original idempotency key, outcomes, task-host transport and independent main-process master-permission gate.

Each invocation reads fresh core usage, then reads the controlling desktop's native policy once and checks eligibility once. It retains the stock initial and final master-permission checks and checks cancellation after pre-dispatch awaits. The native policy read defines that invocation's threshold snapshot: edits while usage is pending are included, and later preference edits apply to later invocations. This is not an atomic transaction across the renderer, main process and service.

Existing tasks may retain earlier stock 10% tool instructions until their normal catalog refresh or a new task. A fresh catalog describes standard and custom mode. Tool instructions do not override runtime enforcement.

## Native settings and persistence

The policy belongs to the controlling desktop's native profile, alongside the master switch. It is not per task, project, quota pool, or account. Existing profile sharing and the optional `community-profile-isolation` feature remain authoritative. Task-host authentication, usage and redemption retain their existing host scope.

Native settings own `desktop.codex-linux-agent-usage-reset-policy`, a strict object with `enabled` and `remainingPercent`. Missing configuration defaults to custom mode off and 10. Invalid persisted values are dropped by the native loader and receive that default; a runtime settings-read failure instead blocks the attempt. Tools and agents cannot write this read-only native setting.

A settings acknowledgment waits for the native persistence operation to complete. If that operation fails, native settings restore the prior accepted value and reject the write. The controls show an error, reconcile with native state and do not issue a rollback write or automatic retry.

## Disable or remove

Remove only `usage-reset-threshold` from your enabled feature list, preserving other choices, and rebuild through the same workflow. The rebuilt app restores stock controls and the stock 10% threshold. The saved custom policy remains inert so a later re-enable can reuse it. Disabling the feature does not delete settings or change the master permission.

## Validation

Validation uses signed stable OpenAI Linux package **26.1021.22027** on **amd64 and arm64**. Feature-only disposable builds check extraction, patching, ASAR repacking, layout, emitted JavaScript syntax, four-registry discovery, preservation of manual-reset and permission-gate code, and byte-identical reapplication. Built JavaScript must differ from the required-core baseline in exactly the eight planned feature assets.

The bounded source fixtures use one signed **26.1021.22027 amd64** baseline with exact source hashes and byte offsets. They retain the current native settings writer, bridge, persistence store and subscription declarations. Runtime tests execute only selected bounded declarations with inert settings, authentication, usage, query and transport fakes; the assembled cross-chunk fixture is syntax-checked but never executed. Tests cover rejection before writes, partial and silently incorrect writes, verified restoration, and fatal rejection of failed restoration. Disabled-feature tests check zero module loads, asset probes and writes. Update-builder staging omits tests and fixtures while retaining production inputs.

Run the feature suite with `node --test linux-features/usage-reset-threshold/test.js`. Existing GitHub CI discovers the feature in both Nix maximal profiles on both architectures; no local Nix installation or build was performed. Actual CI results are reported with the pull request.
