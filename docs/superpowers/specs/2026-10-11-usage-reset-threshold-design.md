---
status: approved
source: docs/brainstorming/2026-10-11-021140-usage-reset-threshold.md
---

# Configurable agent usage-reset threshold

Status: approved; self-review and independent combined review passed. The operator approved committing the spec and proceeding to plan writing and independent plan review on 2026-10-11. Implementation remains unauthorized.

Review: [combined Astra/high review](../reviews/2026-10-11-usage-reset-threshold-spec-review.md).

Source: [approved proposal](../../brainstorming/2026-10-11-021140-usage-reset-threshold.md), initially committed in `64ad11f1` on `feat/usage-reset`, with the operator-approved input-contract addendum dated 2026-10-11 now recorded in the source.

## Objective

Add a disabled-by-default `usage-reset-threshold` Linux feature that lets the user choose the remaining-quota threshold for an explicitly requested agent usage reset in Usage settings. Keep the existing reset permission authoritative. Changing settings never spends a reset, schedules one, or authorizes a future reset.

This changes the desktop client's permission to **attempt** redemption. Whether the app-server or service accepts a redemption above the stock 10% threshold remains unverified. A successful live redemption is not an acceptance criterion for this feature.

## Prerequisites

- The operator approved the product proposal and the master/custom toggle interaction. They authorized committing the proposal and drafting this specification, but not implementation, installation, restarts, configuration changes, or reset requests. A separate brainstorming review was not performed; the explicit operator instruction establishes the source boundary.
- Specification approval is complete: the operator instructed committing this spec and launching a new Astra/high planning agent followed by another Astra/high review agent. The single combined Astra/high spec review passed with no findings; see the linked review trace.
- Before implementation, validate the approved spec, actual branch/worktree, applicable `AGENTS.md`, and latest signed stable official Linux package. The observed package is a discovery baseline, not permission to support obsolete upstream versions.
- Implementation requires existing repository Node test/patch tooling and an isolated copy of the signed official ASAR for static patch acceptance. Use disk-backed scratch under `${XDG_CACHE_HOME:-$HOME/.cache}/codex-desktop-dev/`, never a full extracted app under `/tmp`.
- Keep the implementation checkout separate from generated output and preserve unrelated dirty/untracked files. No migration of the user's real profile is required.
- **Absolute prohibition:** do not invoke a reset tool, app-server consume method, HTTP redemption endpoint, reset UI action, or live app module, including attempts intended to fail. All verification uses synthetic values and fake transports. No real reset may be requested or consumed.
- Future implementation/build validation needs its own authorized implementation scope. The present specification task runs only static inspection and document checks.

## Approved input contract

The operator resolved the remaining input decision during specification writing: use 1-99% remaining. The earlier 0-100 recommendation is superseded. The approved contract is:

- Whole-number remaining percentage, 1 through 99 inclusive; default 10.
- Input accepts trimmed decimal digits only; leading zeros normalize on commit. Reject empty input, fractional notation, signs, exponent notation, nonfinite values, and values outside the range. Do not coerce an empty string to zero, clamp, or round.
- Commit on Enter or blur. Escape restores the last accepted native setting. Invalid input stays visible with an inline error and never writes a setting. A field with invalid text does not change the previously accepted runtime policy.
- Use the same integer/range contract for the native numeric schema and runtime validation. A persisted numeric `10.0` is the number 10 and is valid; textual input `10.0` is rejected by the text-entry grammar.

The endpoints 0 and 100 are invalid. Backend acceptance uncertainty is a documented limit, not an additional product decision or reason to block local implementation.

## Scope and non-goals

In scope: feature packaging, native setting registration, Usage controls, renderer eligibility enforcement, accurate tool/help/search text, offline tests, official-bundle drift checks, and English/Chinese top-level feature documentation.

Out of scope: changing the existing master permission's semantics, automatic reset use, schedules or monitors, new reset-tool arguments, selecting credits, changing account authentication, making remote tools newly available, replacing the consume transport, modifying manual reset behavior, editing the app-server/service, purchasing resets, and guaranteeing service acceptance at any percentage. Do not add a core patch, launcher hook, custom settings file, background process, or package dependency for this feature.

## Evidence baseline

Static evidence comes from official version `26.1007.21434` in `/opt/codex-desktop/resources/app.asar`, community source `839dbb50`, archive SHA-256 `cdeb8e9496a915179b7024ea8ca9af026ea47ce2639ed8b634ef629183fa74b6`. This installed archive includes other community features; implementation acceptance must also use a pristine signed official bundle.

The investigation's [report](/var/tmp/codex-reset-enforcement.sE0k1XWs/report.md), [excerpt manifest](/var/tmp/codex-reset-enforcement.sE0k1XWs/excerpt-manifest.json), and [verification record](/var/tmp/codex-reset-enforcement.sE0k1XWs/verification.json) preserve static evidence. These machine-local evidence files are not runtime dependencies. Required conclusions are reproduced here so future work does not depend on their survival.

| Surface | Current semantic contract and discovery location |
| --- | --- |
| Agent execution | `Rd` in `webview/assets/execution-3129a8af6263.js`, excerpt 01: validates only a nonempty idempotency key, checks permission/auth/cancellation, reads fresh core usage, applies `usedPercent >= 90`, rechecks permission/cancellation, dispatches consume. |
| Host wrapper | `Vd`, excerpt 02: auth and app-server transport use the task host; the native master-setting read has no task-host parameter. Preserve that distinction. |
| Main permission gate | `transformOutgoingMessage` in `.vite/build/main-39FdJ_vp.js`, excerpt 13: rejects consume unless `settingsStore.getEffective(agentUsageResetEnabled.key) === true`. |
| Settings definition | Excerpts 07-08: `agent-usage-reset-enabled` defaults false, has boolean schema, is agent read-only, and uses a definition constructor with `hostStorage.kind: persisted-atom`. |
| Settings writes | Excerpts 09/12: native renderer settings bridge with `get-setting`/`set-setting` fallback; native schema validation; renderer writer supports `{optimistic:false}`. |
| Native storage implementation | `.vite/build/startup-requirements-C6B1x9gL.js`, source SHA-256 `d7d255bcb9b08406b420e814030a116fd5711938500abcc91a32d956074704ad`; UTF-8 byte offsets 93606 (store declarations), 95505 (`getEffective`), 96073 (queued persistence), 97564 (load validation). |
| UI | `tl` in `webview/assets/page-32d319709fb9.js`, excerpt 04: Usage permission row and stock 10% help. |
| Tool metadata | `nac` in `webview/assets/app-initial-ed5807835d97.js`, excerpt 03: real description/schema source. The packaged MCP server forwards the host catalog. |
| Search | `webview/assets/_virtual_settings-search-documents-ea4141d234e9.js`: generated Usage search document contains stock threshold wording. |
| Manual redemption | Excerpts 05-06: separate HTTP path and helper; leave them unchanged. |

Important correction to the discovery shorthand: **`persisted-atom` is the registered legacy-storage/migration kind, not proof that current settings are stored in an atom file.** The current native store loads `config.toml`, validates registered `desktop` values, updates in-memory state, and queues `batchWriteConfigValues` edits to `desktop.<setting-key>`. Persistence errors are logged and pending writes retained. An acknowledged native write is not a durable-disk acknowledgment. Invalid configured values are dropped before `getEffective` applies defaults.

Static inspection found the stock registry definition in four shipped copies: main shared `src-*.js`, `.vite/build/worker.js`, renderer `app-shared-*.js`, and renderer `page-bootstrap-display.worker-*.js`. A new setting must be registered consistently in all four. Hash-suffixed filenames and minified symbols are evidence pointers, never hard-coded discovery contracts.

## Design choice and responsibilities

Use one registered native object setting for the custom policy, alongside the unchanged master boolean. This keeps custom mode and its saved threshold in one native value and avoids mixed reads of two independently changing fields.

| Approach | Correctness, maintenance, and complexity |
| --- | --- |
| **Chosen: native object setting** | Reuses schema validation, persistence, subscriptions, and agent access controls. One custom-policy value is read/written atomically in the store. Requires coordinated registry-copy patching and a small object schema. Native queued persistence limits remain explicit. |
| Two native scalar settings | Familiar primitive schemas, but an attempt can observe custom mode from one point in time and threshold from another. Fixing coherent snapshots adds coordination for no user benefit. |
| Generic global-state bridge | Existing precedent in `agent-workspace/patch.js`, but this feature would own validation, defaults, access policy, and consistency with native settings. Less registry patching does not make it a simpler contract. |
| Build-time percentage | Cannot satisfy editable Usage settings without rebuilds. |
| Remove the guard or switch to manual HTTP | Discards the requested policy or changes redemption/failure semantics without evidence of necessity. |

Responsibilities:

- Feature patcher discovers and verifies current semantic contracts, applies the complete integration to a disposable candidate, and reports drift.
- Native settings registry/store owns the custom policy's schema, accepted value, notification, serialization, and profile lifetime. No parallel persistence authority.
- Usage component owns draft text, validation messages, and native setting writes; it never calls redemption.
- Execution adapter reads current accepted native policy for each attempt. The eligibility evaluator owns core-bucket selection and threshold comparison. Neither owns user authorization or a new retry engine.
- Existing main-process gate retains independent enforcement of the master permission. This feature does not move or weaken that gate.
- Existing app-server transport owns redemption and idempotency outcomes; existing query invalidation owns refresh. Tool metadata describes the policy accurately without becoming its authority.

## Preference schema, ownership, and consistency

Register the following definition next to the existing master definition in every shipped registry copy:

| Property | Contract |
| --- | --- |
| Definition name | `codexLinuxAgentUsageResetPolicy` |
| Key | `codex-linux-agent-usage-reset-policy` |
| Default | `{ enabled: false, remainingPercent: 10 }` |
| Schema | Strict object with exactly `enabled: boolean` and `remainingPercent: number`; finite integer 1-99. No coercion or unknown fields. |
| Agent access | `read-only`, including the generic native settings-write API. |
| Native storage metadata | Same definition constructor/storage kind as `agentUsageResetEnabled`; current persistence is native `desktop.codex-linux-agent-usage-reset-policy`. |

`enabled` means custom threshold mode, not permission to consume a reset. Name this distinction explicitly in the setting description. Missing configuration receives the native default without a startup write. There is no preexisting feature value to migrate.

The setting belongs to the same desktop settings/profile authority as the master permission. It is not per task, project, quota bucket, or account. Preserve the application's existing profile sharing/isolation behavior. Account changes do not reset it or authorize a reset. For a remote task already supported by the stock tool, read the controlling desktop's policy through the same native settings authority as its master; continue reading authentication/usage and sending consume on that task's host. Do not copy the percentage to a remote profile or introduce remote tool availability. Any main gate on the dispatch path must still allow the operation.

Read the whole object using the existing authoritative native settings-read bridge, not a UI atom snapshot, optimistic cache, captured catalog value, feature build configuration, or user-supplied tool argument. Native configured state is schema validated. The following cases are distinct:

- Missing configuration: native default, custom mode off, stock 10.
- Invalid persisted object dropped by the native loader: native default, custom mode off, stock 10. Do not claim this represents the user's previously configured restrictive value. Document the native behavior; no recovery or silent expansion to a custom threshold.
- Read failure or malformed value reaching the execution adapter: stop with a settings-unavailable/invalid error and do not dispatch consume. Do not invent a fallback threshold for a failed read.
- Valid custom mode off: use 10 even if a different valid percentage remains saved.

Use non-optimistic native writes for the custom setting. The UI adopts the accepted value after native acknowledgment; reject/rollback and report bridge/schema errors. Disable both custom controls while their write is pending, and serialize writes from that component. Cross-window writes retain native last-accepted-write behavior; subscriptions update inactive controls. Do not add a distributed locking protocol. A focused dirty input is draft state: a later explicit commit is a new user write; update its last-accepted baseline when another window changes the setting.

Native acknowledgment means accepted into current native state. Persistence to disk is queued and can fail without rejection reaching the UI. Do not show “saved to disk,” claim a flush guarantees persistence, or change the shared settings subsystem to manufacture such a guarantee. Verify normal restart persistence using an isolated fake configuration client/store; separately test the inherited write-failure behavior and document it.

Disabling/removing the feature in a later rebuild restores stock UI and enforcement. Leave its native saved value in place, inert, so re-enabling preserves user preference. Never delete the user's settings or reset the master permission.

## Usage settings and state transitions

Place the controls immediately after the existing “Allow Codex to use resets” row in the Usage reset group:

1. “Use custom reset threshold” switch.
2. “Reset threshold (% remaining)” numeric field with percent unit, accessible name, visible validation feedback, and `min=1`, `max=99`, `step=1` constraints.

Keep the existing master label. Its help should explain that Codex can use a reset only after an explicit request, subject to the active local threshold, and that resets are never automatic. Show adjacent effective-policy text:

| Master | Custom mode | Custom switch | Percentage field | Effective text/behavior |
| --- | --- | --- | --- | --- |
| Off | Either | Disabled; saved state visible | Disabled; saved value visible | “Agent resets are disabled.” No agent reset permitted. |
| On | Off | Enabled | Disabled; saved value visible | “Standard threshold: 10% remaining.” |
| On | On | Enabled | Enabled unless saving | “Custom threshold: T% remaining.” |

Add short explanatory text: either available core Codex window can qualify; service eligibility still applies; changing the threshold does not spend or schedule a reset. At high thresholds, say it permits an earlier local attempt when qualifying core usage exists, not that a credit is guaranteed to reset an account. Do not identify windows solely by duration because the stock selector does not inspect duration.

Use the approved input grammar/commit behavior above. A successful Enter commit must not be duplicated by blur. Switching custom mode off or master off discards unsent draft text and displays the accepted value; it preserves the saved percentage. A blur commit already submitted before the toggle action may finish and is retained. Turning the master off still blocks every agent reset immediately through its existing gate; it does not cancel or authorize a preference write. Disabling the master remains immediately available even while a custom write is pending. A pending custom write never changes the master. If native master state changes externally to off, disable the controls and discard the draft. Re-enabling either switch applies its saved counterpart without an additional reset authorization or reset action.

Invalid draft text does not invalidate the already accepted runtime policy. Show that the field has not been applied. To block all agent resets, the user turns off the master. Do not imply that typing an invalid value changes enforcement.

Use feature-specific message IDs for changed/new threshold descriptions so existing upstream translations cannot silently retain a hard-coded 10% rule. English fallback text must be accurate for every locale. Preserve unmodified upstream translations for unmodified labels. Update the Usage search document to expose the custom controls and describe the standard/custom policy; remove contradictory stock-only help from this setting's search surface, without blanket-replacing unrelated “10%” strings.

## Runtime eligibility and request contract

Keep `consume_usage_reset`'s input schema unchanged: one nonempty `idempotencyKey`, no other arguments. The user-owned threshold is not writable through the tool or generic agent settings writes. Retain per-reset explicit user authorization in the metadata and existing approval path. The numerical setting is neither evidence of authorization nor a way to bypass the approval path.

Define a small, feature-local pure evaluator with structured input/output for synthetic tests. It takes a core rate-limit response and a validated effective threshold, returning `eligible`, `unavailable`, or `above-threshold`. It must not perform I/O or infer permission. Reuse the same canonical policy validation/threshold selection code when generating execution integration and UI effective-policy text; do not duplicate divergent comparison rules across several generated strings.

For a validated custom policy `P`:

```text
T = P.enabled ? P.remainingPercent : 10
core = response.rateLimitsByLimitId.codex when non-null;
       otherwise legacy rateLimits only when:
         limitId is "codex", OR
         limitId is null/missing AND limitName is null/missing/"codex"
values = finite numeric usedPercent values in core.primary and core.secondary
eligible = values contains at least one U with U >= 100 - T
```

Preserve the exact map precedence and core identity rules. Do not fall back to legacy when a non-null `codex` bucket exists but lacks usable windows. Ignore other map entries. Numeric strings, booleans, nulls, NaN, and infinities are not finite numeric usage. Do not clamp finite usage values: stock accepts over-100 overspend; negative finite values keep their mathematical meaning. Missing/malformed buckets or windows must yield unavailable when no finite core value remains, not an accidental property-access exception. A malformed response is never evidence of eligibility.

The threshold comparison is inclusive and uses unrounded usage. At T=1, U>=99 qualifies. At T=99, U>=1 qualifies; a completely unused U=0 window, missing data, and negative-only values do not. No change to quota-pool interpretation or window-duration filtering.

Execution sequence:

1. Validate arguments; retain key unchanged. Check cancellation, existing master permission, ChatGPT authentication on the task host, and cancellation again.
2. Read fresh `account/rateLimits/read` through the existing task-host client. Preserve unavailable handling for failed usage reads and cancellation after the await.
3. Read and validate the authoritative native custom-policy object. Recheck the master and cancellation after asynchronous reads. Evaluate fresh usage against this policy.
4. If unavailable, above threshold, settings unavailable, master disabled, or cancelled, return the appropriate no-dispatch result. A threshold error names the actual T used and preserves the stock warning that an earlier uncertain attempt might already have succeeded.
5. Immediately before calling the existing transport, re-read current custom policy, recheck master/cancellation, and reevaluate against the same fresh usage response. This catches changes during earlier asynchronous work. Do not start a polling loop or repeat the usage request solely because the policy changed.
6. Dispatch exactly the existing app-server method with `{idempotencyKey}`. Preserve the independent main-process master gate. Do not add `threshold`, `creditId`, or other arguments; do not use HTTP as a fallback.
7. Preserve original outcome and post-attempt usage/reset-credit query invalidation. Refresh failure does not erase a confirmed outcome.

The final successful native-policy read defines the threshold snapshot for this attempt. A later policy edit applies to subsequent attempts; this feature does not claim an atomic transaction spanning renderer, IPC, main process, and service. The independent main master check remains authoritative at dispatch. Do not add a second main-process usage read or weaken that gate to address this normal boundary.

## Idempotency, concurrency, and errors

- Never generate a replacement key in the handler. Preserve the caller's key in results and uncertain-attempt instructions.
- Each invocation dispatches at most one consume request. Do not add automatic retry, replay after a settings change, or replay after refresh failure.
- `reset` and `alreadyRedeemed` remain completed outcomes; `noCredit` and `nothingToReset` remain server outcomes with no invented success or fallback. Preserve the upstream response structure and outcome spelling.
- A transport failure after dispatch remains uncertain; the user/agent must retain the same key for any authorized retry. A preflight rejection does not prove that an earlier attempt with that key failed.
- Same-key concurrent calls retain server idempotency. Different keys represent different attempts and each requires explicit user authorization. Do not create a local queue, global single-flight service, or credit counter.
- Cancellation before dispatch must suppress consume. Cancellation or refresh failure after dispatch cannot undo it and must not encourage a new key.
- Settings read/validation failures are distinguishable from unavailable usage and above-threshold errors. Include no secrets or account details in new diagnostics. Log only feature/key/reason as needed by existing conventions.

## Tool metadata and staleness

Patch the actual renderer catalog descriptor, not the packaged MCP forwarding server. Keep its name, argument schema, account/host scope, per-reset explicit confirmation, idempotency, outcome descriptions, and usage-follow-up guidance.

Use policy-aware, configuration-independent wording, for example:

> Requires the Usage setting allowing Codex to use resets and explicit user confirmation for each use. Each call reads fresh core Codex usage and checks the current local remaining-percentage threshold: 10% unless custom mode is enabled in Usage settings. Either available core window can qualify. Unavailable usage never qualifies. Custom settings permit a local attempt; service eligibility still applies.

Keep the rest of the stock retry/outcome instructions. A static policy-aware description stays correct when T changes and does not require rebuilding catalogs on each setting edit. Runtime enforcement always reads current native state. Preserve existing tool-availability gates, including stock behavior for disabled tools and the `all` catalog; the feature does not make the tool available on unsupported hosts/accounts.

Existing tasks may retain the old stock “10%” instructions until the normal catalog refresh/new task. Document this installation limitation in the feature README and settings help where useful. Do not claim a settings change retroactively edits already-delivered instructions, force-restart conversations, inject user messages, or change the MCP server to bypass catalog ownership. A freshly constructed catalog after feature activation must contain the accurate policy-aware descriptor.

## Patch integration and exact source targets

Create the following feature-owned files:

| Source path | Responsibility |
| --- | --- |
| `linux-features/usage-reset-threshold/feature.json` | ID/title/description, `defaultEnabled:false`, `entrypoints.patchDescriptors:"./patch.js"`; no new dependencies, hooks, or resources unless the implementation establishes a concrete need within this design. |
| `linux-features/usage-reset-threshold/README.md` | Activation/rebuild/removal through existing commands, control behavior, profile scope, native persistence limit, metadata staleness, service uncertainty, no-redemption verification, and current tested architectures/version. |
| `linux-features/usage-reset-threshold/patch.js` | Feature-local discovery, registry/schema generation, UI/handler/catalog/search patches, semantic checks, and descriptor exports. |
| `linux-features/usage-reset-threshold/policy.js` | Small pure validation/effective-threshold/core-usage evaluation functions used by generated integration and offline tests. No transport or profile I/O. |
| `linux-features/usage-reset-threshold/test.js` | Node behavioral, patch, drift, default-off, fake-transport, and persistence-adapter tests; discovered by existing CI glob. |
| `linux-features/usage-reset-threshold/fixtures/` | Only minimal synthetic/verified source excerpts required for behavioral and semantic-contract tests; record provenance of any official excerpts. No bundled full app or user data. |

Modify `README.md` and `README.zh-CN.md` to add the feature to the existing feature tables and link its README. The common `linux-features/README.md` and architecture docs need changes only if a genuinely generic contract changes; none is designed here. Keep `linux-features/features.example.json` default empty and do not touch the user's ignored `features.json`.

Use feature descriptors to cover these required candidate surfaces:

1. All four native registry copies and their exported definition maps/derived schema consumers.
2. Agent execution handler and wrapper's new authoritative policy-reader dependency.
3. Usage controls and all changed help/message IDs.
4. Renderer tool metadata at its owning descriptor.
5. Usage search document.
6. Existing main master gate and manual redemption path as preservation assertions, not changed behavior.

Registry descriptors must inspect both `.vite/build` and `webview/assets`; do not assume the main bundle owns all setting definitions. Prefer a feature-local extracted-app phase for cross-file discovery/preflight where it simplifies complete validation. Use semantic unique anchors, derive minified aliases from the same source contract, and validate exact expected occurrence counts. Do not match all bare numeric `90` or textual `10%` occurrences. Inventory all current copies; an unexpected/missing/ambiguous copy is drift, not permission to ignore it.

Preflight all required surfaces before mutating candidate files. Detect complete already-applied state across the entire feature; partial markers or inconsistent copies are failures. Applying twice must produce identical bytes on the second application. A sentinel comment alone is not proof of completeness. Parse changed JavaScript and verify imports/exports and generated call contracts in offline fixtures.

Use the existing descriptor/report framework, retaining enabled-feature enforcement in `scripts/patches/descriptor.js`, `scripts/lib/patch-report.js`, and `scripts/patch-linux-window-ui.js`. Do not set `enforceWhenEnabled:false`, misreport a missing required surface as not-applicable, or promote a partially patched candidate. Disabled features must not be probed or rewrite ASAR; no-enabled-feature/no-core-patch builds remain byte-identical.

No framework or CI workflow change is currently required: `.github/workflows/ci.yml` already runs `linux-features/*/test.js`; `scripts/ci/verify-official-linux-features.js` discovers each feature and audits it alone against extracted official bundles. Add framework changes only if implementation proves a generic missing capability, then request renewed scope approval before changing it. Do not add this feature to the core patch registry.

## Offline verification and acceptance criteria

All acceptance uses inert fixtures, pure functions, fake settings/config clients, fake auth/usage/consume transports, or static patching of an isolated official bundle. Test transports record invocations in memory and cannot reach the user's app-server/socket/network/profile. Do not import the live application or run extracted app entrypoints. Extracted handler/component snippets may run only in an isolated offline harness with every I/O dependency replaced by inert fakes; parse the complete patched assets without executing their module initializers. Tests must not use the real home directory or reuse active settings files.

Required behavioral cases, each covering a distinct contract:

| Area | Measurable acceptance |
| --- | --- |
| State matrix | Every master/custom combination has the specified disabled state and effective threshold; neither switch nor editing causes any fake consume invocation. Saved percentage/custom state survives master-off/on and custom-off/on. |
| Input | 1, 10, and 99 accepted; 0, 100, empty/fractional/exponent/signed/out-of-range values rejected without writes; Enter then blur writes once; Escape/master-off restores accepted value; write rejection preserves accepted state and presents error. |
| Native ownership | All four registry copies yield identical key/default/schema/access. Generic agent settings-write rejects the custom policy. UI writes only that key; no master write occurs as a side effect. |
| Storage | Missing policy defaults off/10; valid policy survives fake store reconstruction after successful queued persistence; invalid persisted object follows native drop/default behavior; simulated persistence failure retains the accepted in-memory value/pending write and is not represented as durable success. |
| Scope | Execution reads the controlling desktop setting but uses supplied task-host auth/usage/transport. No new remote availability or account-scoped storage appears. |
| Threshold boundaries | For T=10 and a distinct custom T, just-below/exact/just-above consumed thresholds behave inclusively without rounding. T=1 and T=99 endpoint semantics match the formula. |
| Core selection | Map codex wins; malformed map codex does not fall back; allowed legacy ID/name cases work; unrelated model buckets and explicitly non-core legacy buckets cannot authorize a reset. Either primary or secondary suffices. |
| Unknown usage | Missing/failed reads, malformed response, missing windows, numeric strings, null, NaN, and infinities cannot authorize; a single valid qualifying window with an invalid other window can. Finite overspend remains accepted; zero/negative-only usage does not qualify at T=99. |
| Freshness | A new call reads native policy rather than UI/cache/catalog state. A policy tightening while usage/policy reads are pending is caught by final reevaluation. Master-off or cancellation at each pre-dispatch await suppresses fake consume. |
| Transport/idempotency | Eligible authorized fixture dispatches once with the exact original key and no extra payload fields. Ineligible/error cases dispatch zero times. Unknown outcome retries retain the key; refresh failure preserves a returned outcome; no automatic retry or HTTP fallback. |
| Metadata | Fresh catalog contains policy-aware text and unchanged schema/authorization/idempotency instructions. Usage/search messages are accurate with custom off/on, without stale translated stock-only descriptions. |
| Drift | Removing or duplicating any required anchor, leaving a partial patch, or adding an unhandled registry copy fails the enabled candidate. Complete second application is byte-identical; disabled feature leaves ASAR untouched. |
| Packaging | Discovery includes the new feature; default config remains empty; minimal update-builder retains its enabled descriptor and helper dependency; no install-time profile write or runtime hook is introduced. |

Verification commands for the future authorized implementation:

```bash
node --check linux-features/usage-reset-threshold/patch.js
node --check linux-features/usage-reset-threshold/policy.js
node --test linux-features/usage-reset-threshold/test.js
node --test scripts/patch-linux-window-ui.test.js scripts/lib/linux-features.test.js
git diff --check
```

Run the existing official-bundle feature audit against a disposable extracted signed stable bundle with disk-backed `TMPDIR`; its current command is `node scripts/ci/verify-official-linux-features.js <extracted-official-app-asar>`. It audits all discovered features; report unrelated failures distinctly. Also perform the repository-required official-bundle build with this feature alone in the future authorized build scope, inspect the feature report and generated JavaScript without launching the app, and verify the disabled-build ASAR hash invariant. Validate both supported upstream architectures through their existing CI acquisition/build lanes; do not infer arm64 compatibility solely from amd64 text matching. Inspect update-builder inclusion of `policy.js`; it is a patch-time dependency even though it is not a separately installed runtime resource.

If bundle acquisition/build or one architecture is unavailable, report that acceptance item as unverified; synthetic tests alone are not full patch-compatibility evidence. The no-reset boundary remains absolute in all lanes. A real profile restart, live UI test, or successful backend redemption is neither necessary nor authorized to validate the local feature contracts.

## Self-review and next boundary

Requirements review: the approved master/custom state matrix, default 10, feature default-off behavior, explicit per-reset authorization, idempotency, core-only fresh usage, no automatic redemption, accurate metadata, and unknown backend acceptance are represented. The operator-approved 1-99 integer range and commit behavior are represented; no unresolved product decisions remain.

Design/API review: the native object value avoids split-policy reads; native queued persistence and invalid-load fallback are stated accurately; all four registry copies are covered; renderer and task-host responsibilities are distinct; manual HTTP is preserved; stale catalogs cannot become runtime authority. The alternative designs and failure boundaries are documented. No implementation or live reset path was executed during spec creation.

Document checks verify source/evidence links, current framework paths and CI discovery, metadata coherence, no unresolved placeholders, the complete approved range contract, and whitespace. These are specification checks, not execution of the future acceptance suite. The operator-authorized single combined GPT-6 Astra/high reviewer returned PASS with no findings on 2026-10-11; the linked trace preserves its scope and verification. Only review/approval-status documentation changed after that verdict. The operator subsequently directed committing the spec, then launching a new Astra/high plan writer followed by a separate Astra/high plan reviewer. This spec is approved for that planning work. Plan approval and implementation remain separate boundaries; do not start implementation.
