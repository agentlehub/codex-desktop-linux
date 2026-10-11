# Usage-reset threshold implementation plan

**Status:** approved
**Source:** [approved specification](../specs/2026-10-11-usage-reset-threshold-design.md)
**Review:** [independent Astra/high PASS](../reviews/2026-10-11-usage-reset-threshold-plan-review.md), including all subsequent operator constraints.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the default-off `usage-reset-threshold` feature, allowing a user-owned 1-99% remaining threshold for explicitly authorized agent reset attempts while preserving every existing permission and redemption boundary.

**Architecture:** One feature-local extracted-app descriptor preflights and patches the four native setting registries, renderer handler/wrapper, Usage component, tool descriptor, and Usage search document. A pure policy factory supplies validation and eligibility code to both tests and generated renderer integration. Native settings remain the only persistence authority; the stock task-host transport and independent main-process master gate remain unchanged.

**Tech stack:** CommonJS patch/test tooling, Node 24 built-ins and `node:test`, generated upstream JavaScript/React, existing native schema/settings bridges, existing signed-package and ASAR tooling. No added package dependencies, services, core patches, or launcher hooks.

---

The operator approved this plan on 2026-10-11 and explicitly authorized Astra/high implementation after committing the task documents. Independent plan review and a fresh no-real-reset audit passed. The operator has explicitly authorized future scoped implementation delivery as a draft PR in `agentlehub/codex-desktop-linux`, using the dedicated pinned base below; perform that delivery only after implementation authorization and the plan's verification/review gates. Installation, launching, restarting, profile edits, and live reset requests remain unauthorized. The [proposal](../../brainstorming/2026-10-11-021140-usage-reset-threshold.md) and [passed spec review](../reviews/2026-10-11-usage-reset-threshold-spec-review.md) record the decisions. No product decision remains open.

## Prerequisites

1. **[MANUAL - COMPLETE] Operator:** Approved the reviewed plan and authorized implementation and its prescribed isolated build validation on 2026-10-11. Keep the absolute no-reset prohibition below. The operator separately authorized Task 10's exact scoped implementation commit, fork branch publication, and draft PR. This authorizes no installation, runtime deployment, live UI/profile operations, merge, labels, or unrelated Git changes.
2. Validate the approved source and plan status, applicable `AGENTS.md`, branch/worktree, and dirty state. Planning baseline: `/home/korty/dev/agentlehub/codex-desktop-linux`, `feat/usage-reset`, `6be880eb`. Capture the actual implementation base SHA in the implementation evidence log. Preserve unrelated `docs/superpowers/brainstorming/` and all preexisting modifications. Use an isolated worktree when execution requires it, following the worktree skill; do not reset the shared checkout.
3. **Do not install Nix on this machine or require the operator to install it. Nix verification is CI-only; local Nix absence is not a prerequisite failure.** Node 24, Bash, `rg`, `ast-grep`, and Python 3 are required for source/fixture work. Signed acquisition/build lanes also require `curl`, `dpkg-deb`, `gpg`, `gpgv`, `sha256sum`, `flock`, standard coreutils, and an already available executable `@electron/asar` CLI. The required package-common test lane additionally needs `tar` and `make` (its Cargo executable is a fixture). Set `CODEX_ASAR_BIN` to that executable. Do not let build tooling silently install it via `npx`. **[MANUAL] Operator/environment owner:** supply unavailable tools or signed-network/build access when requested; mark the affected lane unverified until available.
4. Latest signed stable official packages for **both amd64 and arm64**, acquired through `scripts/lib/upstream-linux-package.js` and its pinned repository key. The observed `26.1007.21434` is discovery evidence, not a compatibility pin. Verify signed metadata before extracting data with `dpkg-deb -x`; never run maintainer scripts. If latest upstream has changed, refresh narrow fixtures/anchors and rerun the relevant tests. Stop for a spec repair only if its behavioral assumptions have changed.
5. Disk-backed scratch: `${XDG_CACHE_HOME:-$HOME/.cache}/codex-desktop-dev/`. Before any build, create/export its `tmp` subdirectory as `TMPDIR`. Never extract/copy packages or apps under `/tmp`. Tests use synthetic config objects and unique temporary fixture directories, never real home/profile files. Small planning scratch is unrelated to future build scratch.
6. Read-only baseline evidence: `/var/tmp/codex-reset-enforcement.sE0k1XWs/{report.md,excerpt-manifest.json,verification.json,excerpts/}`. The approved spec reproduces its relevant conclusions. Task 1 defines acquisition when this evidence is unavailable; no tests may depend on that absolute path.
7. Git and an authenticated, explicitly vetted installed GitHub CLI (`/usr/bin/gh` on the reviewed machine) with access to `agentlehub/codex-desktop-linux` are required only for final delivery. Use `RESET_GH_BIN=/usr/bin/gh` in every delivery command, not bare `gh`: the local bare-command shim attempted an implicit tool installation during review. Verify the installed executable/version; if missing, request the environment owner supply a vetted binary rather than auto-installing or substituting a shim. The authenticated API identity for every delivery write must be exactly `kortylokai-web`, never `kamilbeda`; select its credential only for this task, verify `/user` under the same environment, and block dependent writes if missing/mismatched. Do not infer account identity from repository owner, SSH alias, or Git commit author. Verify `origin` points to that fork; do not use `upstream` (`ilysenko/codex-desktop-linux`) or `personal`. The operator approved PR base `base/usage-reset-upstream` at exact SHA `839dbb50fbd2ad041089981441a82f2460dac455` and head `feat/usage-reset`. Create the remote base only if absent using a create-only lease; reuse only at that SHA, otherwise stop. Never mutate fork `main`. Read [CONTRIBUTING.md](../../../CONTRIBUTING.md) and the [PR template](../../../.github/pull_request_template.md); the template's maximum-reasoning checkbox has an explicit operator exception: final coding-agent review uses `gpt-6-astra` / `xhigh`, not `max`, and the PR must disclose that honestly.
8. **Absolute no-reset boundary:** Never invoke `consume_usage_reset`, the live app-server consume RPC, any HTTP redemption endpoint, a reset UI action, or live bundled modules, even with invalid input or an expected rejection. No live app launch/restart/settings write. Tests may run only bounded extracted function/component snippets with every I/O dependency replaced by inert fakes. Never evaluate complete extracted asset initializers. Reading/parsing signed assets and building disposable artifacts are allowed only within the authorized implementation/build scope.

## Acceptance criteria

The following IDs map directly to the spec's offline acceptance table and named contracts. Completion requires recorded evidence, not only implementation assertions.

| ID | Spec contract | Measurable result | Tasks |
| --- | --- | --- | --- |
| A1 | State matrix/input | Master off disables both custom controls and blocks every fake dispatch; custom off uses 10; custom on uses saved integer 1-99. Enter/blur commit once, Escape restores, invalid text stays unsaved, toggles preserve accepted preferences. | 2, 6 |
| A2 | Native ownership/storage | Exactly four registries agree on strict object/default/read-only key. Generic agent writes reject it. Missing/invalid configured values use native defaults. Fake reconstruction preserves successful queued writes; failed persistence retains accepted memory/pending state without a durable-success claim. | 3 |
| A3 | Threshold/core selection | Inclusive unrounded comparison `U >= 100-T`; correct map precedence/legacy identity/either-window handling, nonfinite rejection, finite overspend preserved, zero/negative-only usage ineligible at T=99. | 2, 4 |
| A4 | Freshness/scope | Every invocation reads controlling-desktop native policy; auth/usage/transport retain task host. Final read catches tightening. Master-off/cancellation after every pre-dispatch await means zero fake consume calls. | 4 |
| A5 | Authorization/transport | Unchanged single-key schema, explicit per-use authorization, independent main gate, at most one fake dispatch with unchanged key/payload, no retries/HTTP fallback; all stock outcomes and refresh semantics preserved. Manual HTTP bytes unchanged. | 4, 7 |
| A6 | Metadata/localization | Fresh catalog, Usage help, and search say standard 10/custom threshold and service uncertainty accurately. New description IDs avoid stale upstream translations. Availability gates and unmodified label translations are preserved. | 6, 7 |
| A7 | Drift/default-off | Missing, duplicate, extra registry, partial patch, import mismatch, or malformed emitted JS rejects enabled candidate before promotion. Full second application changes no bytes. Disabled feature loads no descriptor, probes no feature surfaces, and makes no writes. With no required core changes, default ASAR equals pristine upstream; otherwise it contains exactly the expected required core repairs. Enabled output differs from this core-only baseline solely by this feature. | 3, 7, 8 |
| A8 | Packaging | Feature discovery works, committed enabled config remains empty, update-builder retains `patch.js` and `policy.js`, no runtime resources/hooks/dependencies/profile writes. Both architectures pass feature-only build/static audit; unavailable lanes remain explicit incomplete acceptance. | 7, 8 |
| A9 | Documentation/removal | English/Chinese feature tables link README. README explains activation/removal, profile ownership, queued persistence, stale catalogs, unknown backend eligibility, and actual validated versions/architectures. Disabling leaves saved custom policy inert. | 7, 8 |
| A10 | Review/boundaries | Intermediate and final reviews pass; final coding-agent review uses Astra/xhigh under the operator exception; final scope/whitespace checks pass; no live reset or unauthorized state mutation occurred. | 5, 9 |
| A11 | Fork draft-PR delivery | Scoped implementation committed/pushed to `origin/feat/usage-reset`; draft PR targets `agentlehub/codex-desktop-linux:base/usage-reset-upstream` pinned to `839dbb50fbd2ad041089981441a82f2460dac455`. Template/guide followed with Summary/Validation/Checklist, no contributor-limit reminder or instructional comments in the published body, no false max/CI/ready claims, same-work PR deduplicated without blocking on unrelated fork PRs, PR attached, exact repository/base/head/draft and PR author `kortylokai-web` verified at observation time; existing Nix CI results inspected/reported without inventing pass status. Existing fork automation stays unchanged under the operator-accepted closure risk; an auto-closed PR is reported as failed retention, not durable delivery success. | 9, 10 |

Service acceptance above 10%, a successful live redemption, a real-profile restart, and live UI interaction are deliberately not acceptance requirements.

## File responsibility map

All production code belongs inside `linux-features/usage-reset-threshold/`. Do not change generic framework files merely to make this patch easier.

| File | Change and ownership |
| --- | --- |
| `linux-features/usage-reset-threshold/feature.json` | New disabled manifest; one patch entrypoint. |
| `linux-features/usage-reset-threshold/policy.js` | Pure policy factory and source serializer only; no filesystem, transport, React, or persistence code. |
| `linux-features/usage-reset-threshold/patch.js` | Cross-file discovery/preflight/emission/verification and one descriptor; emitted Usage controller/component; runtime integration. |
| `linux-features/usage-reset-threshold/test.js` | Behavioral, native adapter, patch transaction, and packaging tests using Node built-ins. |
| `linux-features/usage-reset-threshold/fixtures/source-contracts.json` | Minimal raw source slices, original ASAR paths, UTF-8 byte ranges, upstream version/architecture/source and slice hashes, and purpose. No full app assets or account data. |
| `linux-features/usage-reset-threshold/fixtures/harness.js` | Test-only fixture assembly, bounded function loading, deferred promises, native schema/settings fakes, and a bounded hook runner for the emitted component. Never a production dependency. |
| `linux-features/usage-reset-threshold/README.md` | User behavior, activation/removal, limits, and verified evidence. |
| `README.md`, `README.zh-CN.md` | One feature-table row each. |

Generated candidate assets are outputs, not tracked edit targets. `features.example.json` stays `{"enabled":[]}`; ignored `features.json` is untouched. Do not edit `scripts/patches/`, `scripts/lib/`, workflows, updater, Nix pins, existing feature files, spec, or proposal without renewed scope approval. If a generic missing capability is proven, stop dependent work and report the exact missing API before expanding scope.

Keep an execution log under the task's disk-backed scratch root with base SHA, fixture provenance, task/test/review outcomes, commands, artifact paths, architecture/version hashes, and unresolved acceptance. This is durable across context compaction during execution; copy its final concise results into the completion report. Do not add generic tracking documents to the repository.

## Integration contracts and exact transformations

This section is normative implementation input for Tasks 1-7. Names shown from the observed bundle are evidence only. Discover actual identifiers from the same semantic contracts and resolve their imports/exports; do not match hash filenames or globally replace `90`/`10%`.

### Shared code and patch transaction

`policy.js` exports `createPolicy`, the methods returned by one `createPolicy()` instance, and `policySource`. `policySource()` returns `(${createPolicy.toString()})()` so emitted execution and UI code use the same function bodies as behavioral tests. The factory must be self-contained, using only standard built-ins. Inject one collision-checked local `codexLinuxResetPolicy` constant into each of the execution and Usage assets; no new runtime asset/import is necessary.

`patch.js` exports `descriptors`, `planPatch(files)`, `applyUsageResetThreshold(extractedDir)`, and source-generation functions used by tests. `files` is a `Map<relativePath,string>` containing JavaScript from `.vite/build` and `webview/assets`. `planPatch` is pure and returns `Map<relativePath,string>` containing only changed assets plus a verified inventory. More precisely use `{changes, inventory, alreadyApplied}` so callers never infer completeness from an empty map. It throws on ambiguity/drift. `applyUsageResetThreshold` inventories files, calls `planPatch`, parses every changed asset, verifies cross-file links, then writes. It returns `{changed:boolean, reason:string}` for the existing engine. An already complete patch returns `changed:false`, without warnings.

Use one descriptor:

```js
const descriptors = [{
  id: "usage-reset-threshold",
  phase: "extracted-app:pre-webview",
  order: 21000,
  ciPolicy: "opt-in",
  apply: applyUsageResetThreshold,
}];
```

No `appliesTo` narrowing and no `enforceWhenEnabled:false`. The engine's enabled-feature failure gate remains authoritative. Preflight every required surface and construct every replacement before filesystem writes. Syntax-check emitted CJS and ESM as text with `process.execPath`, `--input-type=commonjs` or `--input-type=module`, `--check`, source on stdin, and no shell. Checking source never executes it. Fail on nonzero exit. Resolve named imports against corresponding export lists and ensure all introduced names are bound; syntax alone cannot prove that.

For complete-state detection, use feature-specific begin/end comments around generated additions/replacements, but validate the enclosed bodies against freshly generated expected code and all inventories/contracts. Keep a bounded, encoded original slice in each replacement marker where reverse reconstruction is needed. Decode only as text; reconstruct the original sources in memory, regenerate the expected patch, and compare every changed asset byte-for-byte. Missing, extra, duplicate, mixed, or modified markers are drift. This gives one source of truth for already-applied verification without maintaining a second loose set of probes. Do not include unrelated asset bytes in marker payloads.

On write failure, restore every file whose write was attempted, including a partially written failing file and preceding successful writes, from the preflight byte map and verify their hashes. Register a path for restoration before attempting its write. Throw the original error after successful restoration; if restoration cannot be proved, throw existing `PatchIntegrityError` from `scripts/patches/integrity-error.js`. The outer candidate is never promoted after either failure. No fallback patch strategy should report partial success.

### Native registry binding map

Inventory all JavaScript files for the definition property `agentUsageResetEnabled` whose record includes key `agent-usage-reset-enabled`, `agentAccess:read-only`, default false, boolean schema, and the factory returning `hostStorage:{kind:persisted-atom,key:...}`. Require exactly one in each of these categories and exactly four overall:

- `.vite/build/src-*.js` (observed `src-CP7XXlpZ.js`, factory `Z`, boolean `J`);
- `.vite/build/worker.js` (factory `MF`, boolean `CF`);
- `webview/assets/app-shared-*.js` (factory `MN`, boolean `TN`);
- `webview/assets/page-bootstrap-display.worker-*.js` (factory `$`, boolean `X`).

Inspect definitions, not every string occurrence of the key. An unexpected fifth definition in any scanned file fails. Derive object/number schema builders from the same registry's existing appearance schema: its `{family,fullName,postscriptName}` object and `contrast:NUMBER().int().min(0).max(100)` member. Baseline main expressions are `t.O(...)` and `t.D()`. Verify their export/import definitions resolve to the upstream object/number constructors, and verify `.strict()` is the object's supported strict API in the current schema source. Add immediately after the master property:

```js
codexLinuxAgentUsageResetPolicy:FACTORY({
  agentAccess: "read-only",
  default: {enabled:false, remainingPercent:10},
  description: "Custom eligibility threshold for explicitly authorized agent usage resets; enabled selects custom mode and does not grant reset permission",
  key: "codex-linux-agent-usage-reset-policy",
  schema: OBJECT({enabled:BOOLEAN, remainingPercent:NUMBER().int().min(1).max(99)}).strict()
}),
```

`FACTORY`, `OBJECT`, `BOOLEAN`, and `NUMBER` above are exact substitution slots populated by the discovered binding map, not unresolved design choices. Upstream number/integer schema must reject nonfinite input; test that contract. Insert into the existing definitions object, preserving derived `Object.values`, key-to-definition/schema maps, and its exports. Verify consumers include the new key automatically; do not append a disconnected second registry.

Native read-only enforcement already lives in the generic settings-write route. Preserve it and exercise the actual bounded route snippet with the new definition, rejecting writes from agent context. UI native settings writes remain permitted. Do not bypass read-only enforcement with global-state messages.

### Execution binding map and edit recipe

Locate the single function owning both the stock error `requires a nonempty idempotencyKey and no other arguments.` and consume method, plus its unique wrapper. Baseline is `Rd`/`Vd` in `execution-*.js`, not a filename contract. Preserve argument parsing/result formatting/error logger and the entire consume/outcome/refresh tail. Required edits:

1. Add `readUsageResetPolicy` to the handler's dependency destructuring.
2. Add wrapper property `readUsageResetPolicy:()=>READ_SETTING(DEFINITIONS.codexLinuxAgentUsageResetPolicy)`. Derive `READ_SETTING` and `DEFINITIONS` from its existing `isUsageResetEnabled:()=>READ_SETTING(DEFINITIONS.agentUsageResetEnabled)` property (`yt`/`je` in baseline). No host argument goes to either setting read. Preserve `readAuthMethod:()=>pa(scope,hostId)` and task-host transport factory byte-for-byte.
3. Replace only the core-bucket/window selection plus fixed `>=90` decision and its fixed-threshold error, and insert the final re-read. Use the following flow, substituting the existing aliases for stock dependencies/results:

```js
// After the unchanged fresh rate-limit request and cancellation check:
const readPolicy = async () => {
  let value;
  try { value = await readUsageResetPolicy(); }
  catch { return {error:"Usage reset settings are unavailable."}; }
  return codexLinuxResetPolicy.isPolicy(value)
    ? {value}
    : {error:"Usage reset settings are invalid."};
};
const noAttempt = (error) => FAIL(JSON.stringify({
  idempotencyKey: key,
  error: `${error} This call did not attempt a reset. If an earlier attempt was uncertain, it may already have succeeded; keep the same idempotencyKey for any retry.`,
}));
const checkPolicy = (p) => {
  const threshold = codexLinuxResetPolicy.effectiveThreshold(p);
  const result = codexLinuxResetPolicy.evaluateUsage(freshUsage, threshold);
  return result === "eligible" ? null : noAttempt(result === "unavailable"
    ? "Current core Codex usage is unavailable."
    : `More than ${threshold}% remains in every available core Codex usage window.`);
};
let current = await readPolicy();
if (signal?.aborted) return CANCELLED();
if (!await isUsageResetEnabled()) return MASTER_DISABLED();
if (signal?.aborted) return CANCELLED();
if (current.error) return noAttempt(current.error);
let rejection = checkPolicy(current.value);
if (rejection) return rejection;
current = await readPolicy();
if (signal?.aborted) return CANCELLED();
if (!await isUsageResetEnabled()) return MASTER_DISABLED();
if (signal?.aborted) return CANCELLED();
if (current.error) return noAttempt(current.error);
rejection = checkPolicy(current.value);
if (rejection) return rejection;
// Continue directly into the unchanged stock consume/outcome/refresh tail.
```

`FAIL`, `CANCELLED`, and `MASTER_DISABLED` denote the captured stock failure constructor and existing expressions, not new APIs. `key`, `freshUsage`, `signal`, and `isUsageResetEnabled` are captured local/dependency identifiers. Emit expressions directly or give collision-free generated local aliases; verify bindings in fixtures. Remove the old final master/cancellation pair when replacing that region, since the recipe supplies it. Preserve the original initial permission/auth sequence, adding cancellation checks immediately after its awaited permission and auth reads so no further preflight work is necessary once cancelled.

Do not repeat usage reads when policy changes. Final successful native policy read defines this attempt's snapshot; a later edit applies to subsequent attempts. Preserve the main-process `transformOutgoingMessage` master check unchanged. A master toggle can still be caught there at dispatch. Do not invent an atomic renderer/main/service transaction.

### Usage controller and component contract

Replace the whole stock master-row function body with a non-compiler-memoized component using the existing JSX factory, settings row/group/toggle components, store hook, formatter, native setting hook/writer, and React hooks. Derive these aliases from the function containing `settings.usage.resets.agentEnabled.label` and neighboring hook users in the same asset. The existing `tl` uses `ee(le)`, `Ve(k.agentUsageResetEnabled)`, writer `dt`, JSX `rl`, row `U`, group `q`/`q.Content`/`Ue`, switch `r`, messages `G`, formatter `Ge`. Preserve its original master handler/toast behavior verbatim. Do not adjust React compiler memo-cache slot counts manually.

Derive the authoritative read export from renderer shared function with both `get-setting` and `.settings.read(...).effective` branches (baseline `aAn`, exported as `Sjt`). Resolve its existing export and add a collision-free import alias to the Usage asset if absent. Subscription comes from the same `Ve` hook as the master; custom writes call the same writer as the master with `{optimistic:false}`.

Define an emitted `createUsageResetController({read,write,changed})` in `patch.js`. The policy API is passed or closed over explicitly. It is a component-local controller, not a global service. Public methods: `snapshot()`, `sync(master,accepted)`, `focus()`, `edit(text)`, `escape()`, `blur()`, `enter()`, `toggle(enabled)`. `write(value)` writes only the custom key non-optimistically, `read()` authoritatively reads that same key, and `changed()` schedules a render. `sync` receives accepted native subscription values and master state. It never writes.

Use this precise state/transition implementation contract (one synchronous `pending` flag protects all event paths):

```text
State: master=false; accepted={enabled:false,remainingPercent:10};
       draft="10"; focused=false; dirty=false; pending=false; available=true; error=null.
Display snapshot: switchDisabled=!master||pending||!available;
 fieldDisabled=!master||!accepted.enabled||pending||!available;
 effective=master ? (accepted.enabled ? custom T : standard 10) : disabled.

sync(master,next): validate next; valid => available=true and update accepted baseline.
 Invalid/read failure => available=false and retain last accepted baseline.
 If master becomes false, or accepted.enabled becomes false, discard draft/error.
 Otherwise update draft from accepted when not (focused && dirty).
 A malformed/read-failed setting disables custom writes and shows settings error;
 do not invent an accepted custom value from a failed read.
focus(): focused=true.
edit(text): if field enabled, draft=text; dirty=true; error=null; changed().
escape(): draft=String(accepted.remainingPercent); dirty=false; error=null; changed().
blur(): focused=false; commitDraft().
enter(): commitDraft(); preventDefault in the component's key handler.
commitDraft(): if disabled or pending or !dirty, return.
 Parse draft; invalid => error="Enter a whole percentage from 1 to 99. This value has not been applied.";
 no write and keep draft. Valid equal to accepted => normalize draft; dirty=false; no write.
 Otherwise submit({...accepted,remainingPercent:parsed}).
toggle(enabled): if switch disabled, return. Discard draft/error synchronously.
 If enabled differs from accepted.enabled, submit({...accepted,enabled}).
submit(next): set pending=true BEFORE first await; changed().
 await write(next), then await read() to reconcile actual native accepted state.
 On success sync the validated read result, clear dirty, normalize draft, clear error.
 On rejection retain/update latest accepted subscription baseline, restore accepted
 draft, report "Couldn't apply reset threshold setting."; do not write a rollback value.
 Finally pending=false; changed(). No replay or automatic retry.
```

A successful Enter then blur cannot write twice: pending becomes true synchronously and dirty becomes false after acceptance. External master-off discards draft even while pending, but never cancels/replays the submitted write. Master remains enabled as a UI control during custom pending state. A subscription after an accepted write can update the baseline; a focused dirty draft is retained until an explicit commit/discard. Read reconciliation after write prevents a late acknowledgement from overwriting newer accepted native state.

Bind one controller via `useRef`; call `sync` from an effect keyed by native master/custom values. Derive disabled/effective display directly from current master/native values as well, so a master-off render disables immediately before the effect runs. Dispose the controller's notification callback on unmount to avoid setting state on an unmounted component; in-flight writes still resolve without a replay. Use a small revision state for `changed`, not a second persisted policy.

Render master row followed immediately by custom switch and percentage row. Preserve the original master message ID/label. New IDs use `codexLinux.usageResetThreshold.*`. Field uses a text input with `inputMode:"numeric"`, `min:1,max:99,step:1`, visible `%`, and label “Reset threshold (% remaining)”; validation enforces those bounds. Text storage is deliberate: a browser `type=number` control can erase invalid lexical drafts before the required inline feedback. Associate inline error via `aria-describedby`/`aria-invalid`, and keep draft text visible. Enter commits, Escape calls `escape()` and prevents default, blur commits. Reuse existing input styling from the adjacent numeric settings input; do not add CSS assets or a new component framework.

Effective text is exactly one of “Agent resets are disabled.”, “Standard threshold: 10% remaining.”, or “Custom threshold: T% remaining.” Compute T through the canonical policy API. Add help: “Either available core Codex window can qualify. Custom thresholds permit an earlier local attempt; service eligibility still applies. Changing this setting does not spend or schedule a reset. Existing tasks may retain earlier tool instructions until their catalog refreshes.” Do not show “saved to disk”.

## Review milestones

- **M1 - Tasks 1-4 -> Task 5:** One combined review of incremental policy, native settings, patch preflight, and runtime work since the recorded implementation base. Check spec compliance first, then code/design/test quality. Task 6 waits for PASS.
- **Final - Tasks 1-8 -> Task 9:** One combined review checking spec/requirements/safety first, then code quality/design/API contracts and alternatives, over the entire implementation against the recorded implementation base, including final worktree changes, plus the entire proposed PR diff against pinned `839dbb50fbd2ad041089981441a82f2460dac455` (including related workflow documents). Use `gpt-6-astra` / `xhigh` for this final review under the operator's explicit template exception. Both review stages must pass before Task 10 publishes the draft PR. These are execution gates, not routine operator approval pauses.
- Material findings require fixes, relevant verification, and rerun of the affected review. Fix valid minor findings and rerun affected checks; minor-only changes do not require another review. A material design/scope decision returns to the operator before dependent work proceeds.

## Tasks

### Task 1: Establish the inert fixture and evidence boundary

**Depends on:** prerequisites and explicit implementation authorization.
**Files:** create `fixtures/source-contracts.json`, `fixtures/harness.js`, and the test scaffold in `test.js` only.

- [ ] Record base/status/tools in the execution log:

```bash
git rev-parse HEAD
git status --short
node --version
command -v bash rg ast-grep python3 curl dpkg-deb gpg gpgv sha256sum flock tar make
: "${CODEX_ASAR_BIN:?Provide the existing ASAR executable for the build lane}"
test -x "$CODEX_ASAR_BIN"
printf 'ASAR executable: %s\n' "$CODEX_ASAR_BIN"
```

Expected: known implementation base, all dirt classified, Node 24, tool paths. No commands here mutate Git or installed state.

- [ ] Obtain the latest signed package and static extraction using Task 8's acquisition commands, authorized for acquisition only at this stage. If unavailable, seed narrow fixtures from the recorded baseline excerpts and mark latest-bundle acceptance pending. Copy no full app asset into the repository.
- [ ] Build `source-contracts.json` with each record `{id,version,architecture,sourcePath,sourceSha256,byteStart,byteEnd,sha256,source,purpose}`. Use UTF-8 byte slices, not JS character offsets. Acquire these bounded slices by semantic search followed by balanced function/object boundaries:

| Fixture ID | Required exact slice |
| --- | --- |
| `handler`, `wrapper`, `catalog`, `usage-row`, `manual-http`, `manual-retry`, `master-gate` | Correspond to recorded excerpts 01-06 and 13. Include complete enclosing functions/objects, not a truncated tail. |
| `registry-main`, `registry-worker`, `registry-renderer`, `registry-display-worker` | Master definition, constructor, appearance object/number/boolean schema bindings, complete containing definition map edges and downstream derived map/export statements. |
| `native-read`, `native-write`, `agent-write` | Renderer `get-setting`/native read function, non-optimistic writer and raw writer; main generic route's agent-access rejection and validation. |
| `native-store`, `native-load` | The isolated settings store class and loader validating `desktop` registered values; baseline `ki`/`Ni` in `startup-requirements-*.js`. Include referenced native serialize/deserialize calls as explicit harness dependencies. |
| `search`, `catalog-availability`, `ui-bindings` | Usage search record including stock description, catalog availability and `all` inclusion branch, relevant import/export and React/settings component bindings. |

Read-only discovery baseline hashes/offsets are in the approved spec and manifest; re-record latest architecture/version provenance. For the native store, baseline source SHA is `d7d255bcb9b08406b420e814030a116fd5711938500abcc91a32d956074704ad`, with store/loader starting near UTF-8 offsets 93606/97564. Do not treat that offset as a match rule.

- [ ] Use `ast-grep --lang javascript --pattern 'agentUsageResetEnabled: $VALUE' <extracted-file>` for structural candidates, followed by exact semantic validation. Do not grow a general JavaScript parser. The existing `findMatchingBrace` helper is acceptable only on verified bounded shapes; if syntax such as regex/template interpolation defeats it, use the installed structural tool or a narrowly checked slice contract. Fail drift instead of silently guessing boundaries.
- [ ] Implement test-only `loadSnippet(source,bindings,returnExpression)` using `vm.runInNewContext` on a bounded extracted declaration plus the explicit return expression. Bind only supplied fakes and standard intrinsics, use a timeout, disable string/wasm code generation, and provide no `require`, `process`, fetch, socket, timers, browser globals, or app imports. For async functions, every promise comes from the harness; a code-review allowlist must show all free dependencies are bound. Never execute full source assets.
- [ ] Create a synthetic extracted-app tree from the fixture slices plus minimal import/export scaffolding. Keep the real bounded handler, wrapper, definitions, component, and preservation slices unchanged inside it. Provide a text file map and temporary directory assembly methods; cleanup in test `after`/`finally`.
- [ ] Add fixture-integrity tests comparing every stored source's UTF-8 byte length and SHA to its manifest, rejecting a deliberately truncated slice. This protects the evidence used by patch tests, not arbitrary source formatting. Run:

```bash
node --test --test-name-pattern='fixture provenance' linux-features/usage-reset-threshold/test.js
```

Expected: intentional malformed fixture fails first; valid slices pass after acquisition fixes. No upstream module initializer or transport is executed.

### Task 2: Implement the canonical pure policy with boundary tests

**Depends on:** Task 1.
**Files:** create `policy.js`; extend `test.js`.

- [ ] Write the following behavior tests before the factory. Use `node:assert/strict` and `node:test`; `core(u)` below creates a response with `rateLimitsByLimitId.codex.primary.usedPercent=u`:

```js
const core = (usedPercent) => ({rateLimitsByLimitId:{codex:{primary:{usedPercent}}}});
test("policy: inclusive remaining thresholds", () => {
  for (const t of [1, 10, 37, 99]) {
    const boundary = 100 - t;
    assert.equal(p.evaluateUsage(core(boundary - 0.01), t), "above-threshold");
    assert.equal(p.evaluateUsage(core(boundary), t), "eligible");
    assert.equal(p.evaluateUsage(core(boundary + 0.01), t), "eligible");
  }
  assert.equal(p.effectiveThreshold({enabled:false,remainingPercent:37}), 10);
  assert.equal(p.effectiveThreshold({enabled:true,remainingPercent:37}), 37);
});
test("policy: strict text and object values", () => {
  for (const [text,expected] of [["1",1],[" 010 ",10],["99",99]])
    assert.equal(p.parseRemainingText(text), expected);
  for (const text of ["", " ", "0", "100", "-1", "+10", "10.0", "1e1", "NaN", "Infinity"])
    assert.equal(p.parseRemainingText(text), null);
  for (const value of [null, [], {}, {enabled:1,remainingPercent:10},
    {enabled:true,remainingPercent:"10"}, {enabled:true,remainingPercent:1.1},
    {enabled:true,remainingPercent:NaN}, {enabled:true,remainingPercent:Infinity},
    {enabled:true,remainingPercent:0}, {enabled:true,remainingPercent:100},
    {enabled:true,remainingPercent:10,extra:true}]) assert.equal(p.isPolicy(value), false);
  assert.equal(p.isPolicy({enabled:true,remainingPercent:10.0}), true);
});
```

Add table cases with explicit expected results for map `{codex:{}}` plus eligible legacy (unavailable); map codex null plus eligible legacy (eligible); unrelated model-only map (unavailable); legacy ID `codex` with any name (eligible); absent/null ID with absent/null/`codex` name (eligible); non-core ID or non-core name without ID (unavailable); secondary-only qualifying (eligible); primary invalid plus secondary qualifying (eligible); absent/malformed response/buckets/windows (unavailable); numeric string/boolean/null/NaN/infinite usage (unavailable); `101` usage (eligible); `0` and `-1` at T=99 (above-threshold). Use representative distinct cases, not a cross-product.

- [ ] Run `node --test --test-name-pattern='policy:' linux-features/usage-reset-threshold/test.js`; expect failure because the new module/API is absent. Then implement this complete factory body:

```js
function createPolicy() {
  const isPercent = (v) => typeof v === "number" && Number.isInteger(v) && v >= 1 && v <= 99;
  function isPolicy(v) {
    return v !== null && typeof v === "object" && !Array.isArray(v)
      && Object.keys(v).length === 2
      && Object.hasOwn(v,"enabled") && Object.hasOwn(v,"remainingPercent")
      && typeof v.enabled === "boolean" && isPercent(v.remainingPercent);
  }
  function parseRemainingText(text) {
    if (typeof text !== "string" || !/^\d+$/.test(text.trim())) return null;
    const value = Number(text.trim());
    return isPercent(value) ? value : null;
  }
  function effectiveThreshold(value) {
    if (!isPolicy(value)) throw new TypeError("Invalid usage reset policy");
    return value.enabled ? value.remainingPercent : 10;
  }
  function evaluateUsage(response, threshold) {
    if (!isPercent(threshold)) throw new TypeError("Invalid reset threshold");
    const legacy = response?.rateLimits;
    const core = response?.rateLimitsByLimitId?.codex ??
      (legacy?.limitId === "codex" || (legacy?.limitId == null &&
       (legacy?.limitName == null || legacy.limitName === "codex")) ? legacy : null);
    const values = [core?.primary,core?.secondary]
      .flatMap(window => typeof window?.usedPercent === "number" &&
        Number.isFinite(window.usedPercent) ? [window.usedPercent] : []);
    return values.length === 0 ? "unavailable" :
      values.some(value => value >= 100-threshold) ? "eligible" : "above-threshold";
  }
  return {isPolicy,parseRemainingText,effectiveThreshold,evaluateUsage};
}
const policy = createPolicy();
const policySource = () => `(${createPolicy.toString()})()`;
module.exports = {createPolicy,policySource,...policy};
```

- [ ] Execute the same policy vectors against `vm.runInNewContext(policySource())`, using the inert harness. This catches closure-dependent generation. Rerun the focused command and `node --check linux-features/usage-reset-threshold/policy.js`; expect all pass.

### Task 3: Register native policy and build fail-closed patch preflight

**Depends on:** Task 2.
**Files:** create `feature.json` and `patch.js`; extend fixtures/harness/test.

- [ ] Create the feature manifest and minimum README introduction together so discovery never sees an invalid feature directory:

```json
{
  "id": "usage-reset-threshold",
  "title": "Usage reset threshold",
  "description": "User-configurable local remaining-quota threshold for explicitly authorized agent reset attempts.",
  "defaultEnabled": false,
  "entrypoints": {"patchDescriptors": "./patch.js"}
}
```

README introduction: “Choose the local remaining-quota threshold for explicitly requested agent usage resets in Usage settings. Disabled by default. Service eligibility still applies; this feature never spends a reset automatically.” Task 7 completes it.

- [ ] Add tests named `registry:` that load the patched definition expression for each of the four copies in an inert schema-adapter harness. The adapter implements only the used object/boolean/number/int/min/max/strict constructor contracts and tracks definition values; do not load upstream schema module initializers. Assert all four accept `{enabled:true,remainingPercent:37}` and numeric 10.0, reject every malformed object from Task 2, expose default off/10, use the exact key and persisted-atom metadata, and have read-only agent access. Check derived definition/key maps by evaluating their actual bounded upstream expressions with those definitions.

- [ ] Add `native storage:` tests using the actual bounded store class and loader functions, bound to the generated definition/schema, fake `globalState` with no legacy entries, fake serialization that JSON-clones validated plain values, and an in-memory config client. Fake `batchWriteConfigValues` records `{keyPath,mergeStrategy,value}` and either updates its `desktop` object or rejects. File reads always return a synthetic config; filesystem writes are unavailable. Invoke the store's existing `set`, `getEffective`, `persistPendingSettings`/`flush` methods, not a rewritten feature-specific store. Assert:
  1. Missing/invalid objects result in the registered default; no new policy startup write.
  2. Valid set becomes effective and emits a settings notification; the queued successful edit uses `desktop.codex-linux-agent-usage-reset-policy`, `replace`, and the whole object. A new fake store built from persisted config returns that object.
  3. Rejected queued persistence logs its native warning, keeps effective in-memory value and pending entry, and a resolved flush is not interpreted as durable success.
  4. Actual bounded generic agent-write route rejects the read-only key before store mutation; UI bridge path accepts valid values and rejects invalid ones.

The fake schema adapter proves that generated registration requests the strict native contract; it is not a replacement schema shipped with the feature. Static alias/export verification against the signed bundle proves those constructors are the native ones. Record this distinction rather than claiming execution of the complete native app.

- [ ] Run `node --test --test-name-pattern='registry:|native storage:' linux-features/usage-reset-threshold/test.js`; expect missing patch API/registration failures. Implement the registry transformation and file inventory exactly as specified above. Use narrow full-shape matches with exact counts; mutation order is irrelevant because all output is computed before writes.
- [ ] Implement the pure `planPatch` and file adapter initially with required unresolved surfaces rejected. During this task, test the registry transformation through its generator directly; do not make the descriptor return success until Tasks 4, 6, and 7 complete every surface. This preserves a fail-closed intermediate implementation.
- [ ] Add `preflight:` tests: remove each required fixture anchor in turn, duplicate each owning function/definition, add a fifth registry, corrupt a schema alias/export, or supply a partial feature marker. The full descriptor must reject before writes; assert zero write attempts and unchanged fixture directory hashes. Exercise a specific missing/duplicate diagnostic only for surfaces already implemented; other unresolved surfaces retain their explicit failure until integration completes. Integrated write-failure/rollback cases belong to Task 7, where a positive complete fixture can reach writes. Run the focused registry/storage/preflight tests green; do not suppress expected incomplete-surface failure in the full success test, which is introduced in Task 7.

### Task 4: Wire current policy into the stock handler with fake-transport tests

**Depends on:** Task 3.
**Files:** `patch.js`, `test.js`, `fixtures/harness.js`.

- [ ] Add an `execution:` harness that loads only patched handler/wrapper declarations. Resolve their real argument parser as an inert strict single-key schema: nonempty string key and no extras, retaining upstream trim behavior. Bind stock failure constructor/logger/query invalidation and all host/settings calls to explicit fakes. Fake transport records calls in memory and supports only the two literal stock RPC method names; all other methods throw. It is never attached to a socket/client/network object.

Use deferred promises so tests can stop at each await:

```js
const deferred = () => {
  let resolve, reject;
  const promise = new Promise((yes,no) => {resolve=yes; reject=no;});
  return {promise,resolve,reject};
};
```

The harness returns `{invoke,calls,settingsReads,authReads,invalidations,controls}`; `controls` supplies queued policy/master/auth/usage/consume promises and an `AbortController`. Host wrapper tests bind `READ_SETTING`, auth, and client factory separately, then call the actual wrapper with synthetic host `remote-fixture`. Check reads use only definition objects while auth/client receive `remote-fixture`.

- [ ] Write these behavioral cases before patching the handler. Each rejection asserts zero calls to the fake consume method:

| Case | Expected assertion |
| --- | --- |
| Master off or auth not ChatGPT | Stock rejection; no consume. |
| Invalid arguments, threshold/credit argument | Rejected by unchanged schema; zero consume. |
| Stock 10/custom 37 at boundary | One consume only when canonical evaluator qualifies. |
| Malformed/read-rejected policy | Distinct settings invalid/unavailable error, never stock fallback. |
| Failed usage read and non-core buckets | Usage unavailable; zero consume. |
| First policy 80, final policy 10, usage 30 | Final check blocks and names 10; no second usage read. |
| First policy 37, final policy read rejection | Settings unavailable; zero consume. |
| Cancellation/master off during each pre-dispatch awaited read | No fake consume; no automatic retry. Use deferred resolution for initial master/auth/usage/policy/final master boundaries. |
| Sequential invocations with changed native value | Each reads current policy, never a captured UI/catalog threshold. |
| Eligible key `attempt-fixture-1` | Consume payload exactly `{idempotencyKey:"attempt-fixture-1"}` once. |
| `reset`, `alreadyRedeemed`, `noCredit`, `nothingToReset` | Original outcome spelling/response preserved. |
| Consume rejects, then separately authorized same-key fixture call | First response uncertain; second uses the same key; no internal retry/new-key generator. |
| Post-consume usage read or invalidation rejects | Returned outcome remains present; at most one consume. |
| Same-key concurrent invocations | Two allowed invocations retain identical keys; no new local counter/queue. Backend idempotency is not simulated as a feature guarantee. |
| Manual HTTP/main master gate | Original fixture slices remain byte-identical after patch. |

- [ ] Run `node --test --test-name-pattern='execution:' linux-features/usage-reset-threshold/test.js`; expect custom/freshness cases to fail against stock. Implement the exact execution binding/flow recipe; leave the stock consume tail, wrapper host selection, and main/manual logic intact.
- [ ] Rerun focused tests green. Inspect error output for exact actual threshold, same-key uncertain-attempt warning, and absence of settings values/account details in diagnostics. Run `node --check` on `patch.js` and parse the generated execution asset without executing it.

### Task 5: Review milestone M1

**Depends on:** Tasks 1-4.
**Covers:** implementation base through current policy/registry/runtime changes.

- [ ] Confirm red/green evidence for policy, registry, native adapter, genuine preflight zero-write failures, and execution tests. Integrated write/rollback evidence is deferred to Task 7 and is not an M1 prerequisite. Expected incomplete full integration must remain fail-closed; document that Task 6/7 supplies the remaining surfaces.
- [ ] Dispatch one combined reviewer with the approved spec, this plan, base SHA, exact changed-file list, and evidence log. Announce model/reasoning according to the operator's live routing instructions. Require spec compliance first, then API/ownership/failure-mode/test-quality review. Compare the chosen one-object setting against two scalar reads and explain why the latter introduces mixed-policy snapshots; do not reopen the approved product decision.
- [ ] Fix valid material findings, rerun affected checks, and repeat review until PASS. A material spec/scope change requires operator resolution. Fix valid minor findings and their checks. Mark M1 complete, then continue directly.

### Task 6: Implement Usage editing, subscriptions, and accessibility

**Depends on:** Task 5.
**Files:** `patch.js`, `test.js`, `fixtures/harness.js`.

- [ ] Write `usage:` tests against the emitted controller before implementing it. The `write` fake is deferred and records only custom-setting writes; `read` returns synthetic accepted state. Assert all four master/custom combinations, accepted 1/10/99 and normalized `010`, every rejected text grammar family, successful Enter+blur once, unchanged normalized value no write, Escape, invalid draft stays visible, master/custom off discards draft, saved percentage survives toggles, pending disables both custom controls, master action remains callable, failed write restores accepted value with error, and no fake consume calls from any edit/toggle.
- [ ] Include race cases: external accepted update while inactive refreshes draft; while focused/dirty it updates baseline but retains draft; Escape restores that newer baseline; blur submission before master-off can finish and is retained; external master-off while pending blocks controls without writing master; a later subscription wins over an earlier write acknowledgement because reconciliation reads current native state. Read failure after acknowledgement shows an error and never fabricates disk durability.
- [ ] Run `node --test --test-name-pattern='usage:' linux-features/usage-reset-threshold/test.js`; expect absent controller/component failure. Implement controller transitions and component wiring as specified in the integration contract, including non-optimistic writer options and subscription baseline handling.
- [ ] Add bounded rendered-component tests using an inert hook runner: per-render hook cursor with persistent slots for state/ref, dependency comparison for effects, explicit effect flushing, and JSX returning element records. Resolve stock row/group/switch/message components to inert identities. Render the actual emitted component, find controls by accessible label, invoke its real event props, and rerender. Test the state matrix, `aria-invalid`/error association, min/max/step/inputMode, pending master availability, and actual writes of only the policy key. This tests the emitted React adapter separately from the controller without introducing React/browser dependencies or running the live app.
- [ ] Verify changed message IDs are feature-specific; stock master label/toast IDs remain. Assert help/effective text accurately tracks custom off/on and service uncertainty in a fake formatter that contains the old upstream stock translation, so changing locale cannot resurrect that stock-only description.
- [ ] Run usage and existing execution tests green. Syntax-check generated Usage source and validate its added read import against actual shared exports. Do not perform a live UI test.

### Task 7: Complete metadata, patch closure, packaging tests, and documentation

**Depends on:** Task 6.
**Files:** `patch.js`, `test.js`, feature README, top-level English/Chinese READMEs.

- [ ] Add `metadata:` tests loading only the bounded catalog constructor with inert schema/conversion dependencies and fresh local lazy state. Preserve schema and availability/`all` behavior. Replace precisely the stock sentence “Every call checks fresh core usage: either the five-hour or weekly window must have 10% or less remaining.” with:

> Each call requires the Usage setting allowing Codex to use resets, reads fresh core Codex usage, and checks the current local remaining-percentage threshold: 10% unless custom mode is enabled in Usage settings. Either available core window can qualify. Unavailable usage never qualifies. Custom settings permit a local attempt; service eligibility still applies.

Keep every other descriptor sentence, including explicit confirmation, one existing reset, host scope, same-key retries, outcome meanings, and `get_usage_limits`. Do not add tool arguments or patch the MCP forwarding server.

- [ ] Patch the one Usage search record with ID `settings.usage.resets.agentEnabled.description` to the feature-specific help ID/text and insert entries for custom switch, percentage label, and standard/custom policy help inside the Usage section. Use exact record ownership/counts; leave unrelated 10% messages and manual reset entries unchanged. Tests construct that search section and assert new controls are discoverable and old contradictory help is absent from this setting only.
- [ ] Run metadata tests red; implement the exact descriptor/search replacements and complete the descriptor's success path now that all surfaces exist. Add `patch closure:` tests applying the full descriptor to the synthetic tree, executing its patched handler/component/catalog snippets, verifying four registries, parsing every changed asset, validating imports/exports, and comparing preserved main/manual slices. Second full application must produce an identical file-byte map.
- [ ] After that positive complete fixture reaches the descriptor's write phase, add `patch closure: write rollback` tests using scoped test mocks of `fs.writeFileSync` on only the fixture tree. Do not add a production transaction helper solely for tests. First capture the actual ordered write targets from a successful application to a fresh fixture and verify at least two files changed. On a second fresh fixture, let the first write complete, partially write the second target using the captured original `writeFileSync`, then throw a unique `injected-write-failure` error. Assert the first write occurred, the second target was modified before the throw, the propagated error is that injected failure (not a preflight rejection), and every attempted target, including the second, is restored byte-for-byte. Also verify all untouched files retain their original bytes. Restore test mocks in `finally` and disable concurrency for these cases.
- [ ] Add the distinct restoration-failure case using another complete fresh fixture: inject the same partial second-write failure, then make restoration of that target throw or leave mismatched bytes. Assert the fault was reached after an actual write attempt, `PatchIntegrityError` is raised because recovery cannot be verified, the engine reports `failed-integrity`, and the candidate is rejected. Every preflight-negative case still requires zero writes; no bypass of preflight is permitted to reach these tests.

- [ ] Add drift mutations for every required inventory slot, corrupt an already-applied generated body while retaining its marker, remove one patched registry, and add a fifth. Expected enabled-feature report has a failure and no candidate promotion. A disabled config must load zero descriptors for this feature and never call its preflight; malformed fixture content then remains untouched.
- [ ] Add `packaging:` test using real feature discovery and an explicit temporary `{"enabled":["usage-reset-threshold"]}` config. Invoke the real feature-tree stage in a Bash subprocess. The following test code assumes `repo` is the checkout root, `tmp` is the test-owned directory, and `config` is that synthetic config path; all are created by the harness. The extra framework copy reproduces the documented `stage_update_builder_bundle` dependency layout without invoking packaging/provenance/updater operations:

```js
const staged = path.join(tmp,"update-builder");
execFileSync("bash", ["-c", `
  set -euo pipefail
  REPO_DIR="$1"
  reset_stage="$2"
  reset_node="$3"
  . "$REPO_DIR/scripts/lib/package-common.sh"
  package_node_binary() { printf '%s\\n' "$reset_node"; }
  stage_update_builder_linux_features_tree "$reset_stage"
  mkdir -p "$reset_stage/scripts/patches"
  cp -a "$REPO_DIR/scripts/patches/." "$reset_stage/scripts/patches/"
`, "stage-reset-feature", repo, staged, process.execPath], {
  env:{...process.env, CODEX_LINUX_FEATURES_ROOT:path.join(repo,"linux-features"),
    CODEX_LINUX_FEATURES_CONFIG:config},
});
for (const name of ["feature.json","patch.js","policy.js","README.md"])
  assert.ok(fs.existsSync(path.join(staged,"linux-features/usage-reset-threshold",name)));
const stagedPatch = require(path.join(staged,"linux-features/usage-reset-threshold/patch.js"));
assert.equal(stagedPatch.descriptors.length, 1);
```

Require only the feature patcher, which contains no app execution. Use `node:child_process`/`node:fs`/`node:path` imports in the test. Assert discovered defaults do not enable the new feature and its manifest has no resources/runtime hooks. Do not alter production staging code or the user's feature config.

- [ ] Run:

```bash
node --test --test-name-pattern='metadata:|patch closure:|packaging:' linux-features/usage-reset-threshold/test.js
node --test linux-features/usage-reset-threshold/test.js
node --test scripts/patch-linux-window-ui.test.js scripts/lib/linux-features.test.js
```

Expected: all pass, including the full descriptor success/idempotency cases; no skipped feature acceptance disguised as success.

- [ ] Complete feature README with these concrete sections: Enable (add ID to local `enabled`, preserve other choices, rebuild using existing `./install.sh`/native packaging workflow); state matrix and input grammar; explicit authorization/no automation; controlling-desktop profile ownership and existing isolation; standard default and invalid-load fallback; accepted-memory versus queued-disk persistence; no tools/agents may edit policy; stale catalogs refresh normally/new task; service acceptance unknown; disable ID/rebuild restores stock but keeps saved object inert; Validation with actual versions/architectures/check results, no reset performed. Do not advertise unrun builds as verified or tell users to test by consuming a credit.

Add table rows next to other alphabetic features:

```markdown
| `usage-reset-threshold` | Set the local remaining-quota threshold for explicitly requested agent usage resets | [Docs](linux-features/usage-reset-threshold/README.md) |
```

Chinese row:

```markdown
| `usage-reset-threshold` | 为明确请求的智能体用量重置设置本地剩余额度阈值 | [文档](linux-features/usage-reset-threshold/README.md) |
```

- [ ] Check relative links/commands, feature IDs, unchanged committed default configuration, and scoped whitespace. Do not edit common feature/architecture docs because no generic contract changes.

### Task 8: Validate signed official bundles on both architectures

**Depends on:** Task 7; acquisition-only portions may run during Task 1 after authorization.
**Files:** disposable outputs/evidence only; feature README may receive verified results.

All shell blocks below run from the implementation checkout in the same shell. They never launch an app or contact a reset service. Use native architecture lanes if the environment cannot build the other architecture; both results are required. Network failures are not permission to replace signed acquisition with an unverified download.

- [ ] Create the disk-backed run root and verify the preprovided ASAR CLI. This changes task-owned scratch only:

```bash
export TMPDIR="${XDG_CACHE_HOME:-$HOME/.cache}/codex-desktop-dev/tmp"
mkdir -p "$TMPDIR"
RESET_VALIDATION_ROOT="$(mktemp -d "${TMPDIR}/usage-reset-threshold.XXXXXX")"
export RESET_VALIDATION_ROOT
export GNUPGHOME="$RESET_VALIDATION_ROOT/gnupg"
mkdir -m 700 "$GNUPGHOME"
: "${CODEX_ASAR_BIN:?Set CODEX_ASAR_BIN to the existing ASAR executable}"
test -x "$CODEX_ASAR_BIN"
printf '%s\n' '{"enabled":[]}' > "$RESET_VALIDATION_ROOT/disabled.json"
printf '%s\n' '{"enabled":["usage-reset-threshold"]}' > "$RESET_VALIDATION_ROOT/enabled.json"
```

Record the exact root for bounded cleanup and attach/copy small logs before removing output. Do not repurpose `HOME` or `CODEX_HOME`.

- [ ] Acquire and extract signed packages; each acquisition verifies `InRelease`, package index hashes, and package hash through existing tooling:

```bash
for reset_arch in amd64 arm64; do
  mkdir -p "$RESET_VALIDATION_ROOT/$reset_arch"
  node scripts/lib/upstream-linux-package.js \
    --output-dir "$RESET_VALIDATION_ROOT/$reset_arch/download" \
    --metadata "$RESET_VALIDATION_ROOT/$reset_arch/signed-metadata.json" \
    --key-base64 assets/openai-codex-linux-repository-key.gpg.base64 \
    --arch "$reset_arch" \
    --repository https://persistent.oaistatic.com/codex-app-prod/linux/deb \
    > "$RESET_VALIDATION_ROOT/$reset_arch/package-path.txt"
  reset_deb="$(cat "$RESET_VALIDATION_ROOT/$reset_arch/package-path.txt")"
  dpkg-deb -x "$reset_deb" "$RESET_VALIDATION_ROOT/$reset_arch/pristine"
  "$CODEX_ASAR_BIN" extract \
    "$RESET_VALIDATION_ROOT/$reset_arch/pristine/usr/lib/chatgpt/resources/app.asar" \
    "$RESET_VALIDATION_ROOT/$reset_arch/official-asar"
done
```

Expected: signed metadata/version/architecture and package hashes match extracted packages; no maintainer scripts executed. Record any bundled unpacked directory and copy it only when patch/build tooling requires it; patch surfaces here are packed JavaScript.

- [ ] Run the existing all-feature static audit once per architecture, retaining logs and separating unrelated feature failures:

```bash
for reset_arch in amd64 arm64; do
  node scripts/ci/verify-official-linux-features.js \
    "$RESET_VALIDATION_ROOT/$reset_arch/official-asar" \
    > "$RESET_VALIDATION_ROOT/$reset_arch/all-feature-audit.log" 2>&1
done
```

Expected: audit passes, or each unrelated failure is reported distinctly while this feature's isolated build/report still passes. An error for this feature blocks completion.

- [ ] Build feature-only and disabled disposable apps. Supplying the previously verified local package preserves a separate signed-metadata evidence file; `install.sh`'s local-package metadata alone is not a trust proof. Environment explicitly prevents use of a caller's `UPSTREAM_DEB`/feature defaults:

```bash
for reset_arch in amd64 arm64; do
  reset_deb="$(cat "$RESET_VALIDATION_ROOT/$reset_arch/package-path.txt")"
  for reset_mode in disabled enabled; do
    env -u UPSTREAM_DEB -u CODEX_INSTALL_TRANSACTION_ACTIVE \
      -u CODEX_PATCH_REPORT_JSON -u CODEX_UPSTREAM_LINUX_METADATA_JSON \
      -u CODEX_ACCEPTANCE_OVERRIDE \
      CODEX_APP_ID=codex-desktop CODEX_APP_DISPLAY_NAME="ChatGPT Community" \
      CODEX_LINUX_FEATURES_ROOT="$PWD/linux-features" \
      CODEX_TARGET_ARCH="$reset_arch" \
      CODEX_INSTALL_DIR="$RESET_VALIDATION_ROOT/$reset_arch/$reset_mode-app" \
      CODEX_LINUX_FEATURES_CONFIG="$RESET_VALIDATION_ROOT/$reset_mode.json" \
      REBUILD_REPORT_DIR="$RESET_VALIDATION_ROOT/$reset_arch/$reset_mode-report" \
      CODEX_ASAR_BIN="$CODEX_ASAR_BIN" \
      ./install.sh "$reset_deb" \
      > "$RESET_VALIDATION_ROOT/$reset_arch/$reset_mode-build.log" 2>&1
  done
  "$CODEX_ASAR_BIN" extract \
      "$RESET_VALIDATION_ROOT/$reset_arch/disabled-app/resources/app.asar" \
      "$RESET_VALIDATION_ROOT/$reset_arch/disabled-asar"
  "$CODEX_ASAR_BIN" extract \
      "$RESET_VALIDATION_ROOT/$reset_arch/enabled-app/resources/app.asar" \
      "$RESET_VALIDATION_ROOT/$reset_arch/enabled-asar"
done
```

Expected: both candidate builds succeed in scratch. The current required `quit-confirmation-focus` core descriptor remains enabled and may change the disabled build; its current repair also covers shell-environment startup. Preserve `install.sh`'s required-core-only acceptance rule. The enabled report contains this feature as `applied`, no enabled failures, and expected ASAR change relative to the core-only baseline. Generated launcher is never run. No package installation, `make install-native`, promotion into real app paths, or `CODEX_ACCEPTANCE_OVERRIDE` is allowed.

- [ ] Run this static baseline validation for each architecture. It records the required core inventory, validates both build reports, constructs the expected core-only tree, and compares complete extracted file manifests. It loads repository patch tooling only; no upstream module is executed. The current expected core inventory is `quit-confirmation-focus`; an inventory change must be inspected and recorded before updating this expectation, never ignored or disabled.

```bash
for reset_arch in amd64 arm64; do
  node - "$RESET_VALIDATION_ROOT/$reset_arch" "$RESET_VALIDATION_ROOT/disabled.json" <<'NODE'
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const {corePatchDescriptors,patchExtractedApp} = require("./scripts/patches/runner.js");
const {loadLinuxFeaturePatchDescriptors} = require("./scripts/lib/linux-features.js");
const {createPatchReport,criticalFailuresFromReport,enabledFeatureFailuresFromReport} =
  require("./scripts/lib/patch-report.js");
const [root,disabledConfig] = process.argv.slice(2);
const featureId = "usage-reset-threshold";
const options = {featuresRoot:path.resolve("linux-features"),featuresConfigPath:disabledConfig};
const inventory = corePatchDescriptors().map(({id,phase,ciPolicy}) => ({id,phase,ciPolicy}));
assert.deepEqual(inventory.map(p => p.id).sort(), ["quit-confirmation-focus"]);
assert.ok(inventory.every(p => p.ciPolicy === "required-upstream"));
fs.writeFileSync(path.join(root,"core-inventory.json"), JSON.stringify(inventory,null,2)+"\n");
assert.deepEqual(loadLinuxFeaturePatchDescriptors(options), []);
const featureModule = require.resolve("./linux-features/usage-reset-threshold/patch.js");
assert.equal(require.cache[featureModule], undefined);
function hash(file) {
  const digest = crypto.createHash("sha256"), buffer = Buffer.alloc(1024*1024);
  const fd = fs.openSync(file,"r");
  try {
    let count;
    while ((count=fs.readSync(fd,buffer,0,buffer.length,null)) > 0)
      digest.update(buffer.subarray(0,count));
  } finally { fs.closeSync(fd); }
  return digest.digest("hex");
}
function tree(dir) {
  const entries=[];
  function visit(relative) {
    for (const name of fs.readdirSync(path.join(dir,relative)).sort()) {
      const rel=path.posix.join(relative,name), file=path.join(dir,rel), stat=fs.lstatSync(file);
      if (stat.isSymbolicLink()) entries.push([rel,"link",fs.readlinkSync(file)]);
      else if (stat.isDirectory()) visit(rel);
      else if (stat.isFile()) entries.push([rel,"file",hash(file)]);
      else throw new Error(`Unexpected artifact type: ${rel}`);
    }
  }
  visit(""); return entries.sort((a,b)=>a[0].localeCompare(b[0]));
}
function validateReport(report,featureEnabled) {
  assert.deepEqual(criticalFailuresFromReport(report), []);
  assert.deepEqual(enabledFeatureFailuresFromReport(report), []);
  assert.deepEqual(report.enabledFeatures, featureEnabled ? [featureId] : []);
  const core=report.patches.filter(p=>p.sourceKind==="core");
  assert.deepEqual(core.map(p=>p.name).sort(), inventory.map(p=>p.id).sort());
  assert.ok(core.every(p=>p.ciPolicy==="required-upstream" &&
    ["applied","already-applied"].includes(p.status)));
  const feature=report.patches.filter(p=>p.sourceKind!=="core");
  assert.deepEqual(feature.map(p=>p.featureId), featureEnabled ? [featureId] : []);
  if (featureEnabled) assert.equal(feature[0].status,"applied");
  return core;
}
const disabledReport=JSON.parse(fs.readFileSync(path.join(root,"disabled-app/.codex-linux/patch-report.json")));
const enabledReport=JSON.parse(fs.readFileSync(path.join(root,"enabled-app/.codex-linux/patch-report.json")));
const changedCore=validateReport(disabledReport,false).filter(p=>p.status==="applied");
validateReport(enabledReport,true);
const expectedCore=path.join(root,"expected-core-asar");
fs.cpSync(path.join(root,"official-asar"),expectedCore,{recursive:true,verbatimSymlinks:true});
const coreReport=createPatchReport();
patchExtractedApp(expectedCore,{...options,report:coreReport});
validateReport(coreReport,false);
fs.writeFileSync(path.join(root,"expected-core-report.json"),JSON.stringify(coreReport,null,2)+"\n");
const disabledDir=path.join(root,"disabled-asar");
assert.deepEqual(tree(disabledDir),tree(expectedCore));
const pristineHash=hash(path.join(root,"pristine/usr/lib/chatgpt/resources/app.asar"));
const disabledHash=hash(path.join(root,"disabled-app/resources/app.asar"));
if (changedCore.length===0) assert.equal(disabledHash,pristineHash);
else assert.notEqual(disabledHash,pristineHash);
// Core is now complete. Disabled discovery must still load no feature module,
// make no feature probes/writes, and a repeat core-only pass changes no bytes.
const beforeDisabled=tree(disabledDir), repeatedReport=createPatchReport();
patchExtractedApp(disabledDir,{...options,report:repeatedReport});
validateReport(repeatedReport,false);
assert.deepEqual(tree(disabledDir),beforeDisabled);
assert.equal(require.cache[featureModule],undefined);
// Only now load our repository patcher to derive the enabled-vs-core delta.
const {planPatch,applyUsageResetThreshold}=require(featureModule);
const expectedEnabled=path.join(root,"expected-enabled-asar");
fs.cpSync(expectedCore,expectedEnabled,{recursive:true,verbatimSymlinks:true});
const sources=new Map(tree(expectedEnabled)
  .filter(([rel,kind])=>kind==="file" && rel.endsWith(".js") &&
    (rel.startsWith(".vite/build/") || rel.startsWith("webview/assets/")))
  .map(([rel])=>[rel,fs.readFileSync(path.join(expectedEnabled,rel),"utf8")]));
const planned=planPatch(sources);
assert.equal(planned.alreadyApplied,false);
assert.equal(applyUsageResetThreshold(expectedEnabled).changed,true);
const enabledTree=tree(path.join(root,"enabled-asar"));
assert.deepEqual(enabledTree,tree(expectedEnabled));
const baseline=new Map(beforeDisabled.map(([rel,...value])=>[rel,JSON.stringify(value)]));
const actualDelta=enabledTree.filter(([rel,...value])=>baseline.get(rel)!==JSON.stringify(value))
  .map(([rel])=>rel).sort();
assert.deepEqual(actualDelta,[...planned.changes.keys()].sort());
assert.ok(actualDelta.length>0);
fs.writeFileSync(path.join(root,"baseline-evidence.json"),JSON.stringify({
  pristineHash,disabledHash,changedCore:changedCore.map(p=>p.name),
  disabledFeatureDescriptorCount:0,disabledFeatureModuleLoaded:false,featureDelta:actualDelta,
},null,2)+"\n");
console.log("Required-core baseline and isolated feature delta verified");
NODE
done
```

Expected: zero feature descriptors/module loads in disabled passes, identical disabled tree versus expected required-core tree, and enabled tree differing only at the feature's planned paths. Pristine ASAR byte identity is required only when no core entry changed it. With today's mandatory repair, record its applied entry and the exact core-only difference instead. These checks complement Task 7's disabled-config sentinel/zero-probe/zero-write tests; the ASAR difference alone never proves a disabled feature ran. Do not set an empty core registry or weaken the installer to make a pristine comparison pass.

- [ ] Statically audit each extracted enabled output with the same `planPatch` complete-state checker and syntax/import checks; expect `alreadyApplied:true` and no changes. Verify registry inventory and original manual/main-gate slices against its pristine sibling. Record ASAR hashes/version/report paths. Repeat the feature-only patch application on a disposable extracted copy and assert bytes unchanged.
- [ ] Run final local verification commands in the next section. Update README validation statements from actual evidence. If package acquisition/tooling/one architecture fails, state exactly which A7/A8 acceptance remains unverified and stop completion claims; do not substitute live testing.
- [ ] Keep only small provenance/log/report evidence needed by the operator; remove precisely the task-owned extracted/apps/download scratch after results are captured, following repository cleanup rules. Never sweep unrelated caches or generated directories. A failed candidate needs no runtime rollback because it was never installed. Feature removal in an actual user build is a future authorized rebuild with ID disabled; do not delete its saved native value.

### Task 9: Final whole-implementation review

**Depends on:** Task 8 and all prior tasks.
**Covers:** every implementation change from recorded base through final worktree state.

- [ ] Verify A1-A10 against the spec. Record each as passed or explicitly incomplete; do not call the implementation complete with a required architecture/build lane unavailable.
- [ ] Dispatch one combined `gpt-6-astra` / `xhigh` reviewer over the whole change, complete proposed PR diff against the pinned base, and evidence. Require spec/requirements/safety review first, then code quality/design/API contracts and alternatives in the same review. Fix findings and rerun affected review until both stages PASS. This is the operator-authorized substitute for the template's maximum-reasoning instruction; do not substitute `max` or claim it ran. Review API caller fit, alias discovery, failure closure, I/O isolation, race semantics, no-replay/idempotency, minimal tests, and maintenance cost.
- [ ] Require the combined reviewer during its quality stage to challenge the cross-file transaction against independent descriptors: the alternative must still preflight all registries/UI/runtime/catalog before mutation and prove complete reapplication. If it adds duplicated discovery/state without clearer ownership, retain the feature-local transaction. Inspect encoded-original markers for boundedness and exact regeneration, rather than trusting marker presence. Do not replace the approved native setting architecture without operator resolution.
- [ ] Fix material findings, rerun affected checks, and repeat the affected review. Fix valid minor findings and relevant verification. If changes affect spec compliance, rerun the combined review with requirements first before concluding code quality.
- [ ] Run final scope/whitespace/status checks and report feature behavior, test/build evidence per architecture, backend uncertainty, native persistence limitation, no live reset performed, and all remaining limitations. Save the exact validation summary as plain paragraphs/bullets without second-level headings (commands/results, signed version and architecture provenance, required-core baseline evidence, omitted live tests, service/persistence limits, accepted fork-automation closure risk, and final reviewer model/effort and both stage verdicts) to `$RESET_VALIDATION_ROOT/delivery-validation.md`. Continue to Task 10 for the explicitly authorized scoped commit/push/draft PR. Never stage unrelated artifacts.

### Task 10: Publish the reviewed change as a draft PR in the fork

**Depends on:** Task 9 PASS, A1-A10 evidence, and prior explicit implementation authorization. The operator has already authorized the exact delivery actions below; do not ask again merely to commit/push/create this draft PR. These are future implementation actions, never planning/review actions.
**Git/API write scope:** `origin` repository `agentlehub/codex-desktop-linux`; base `base/usage-reset-upstream` only at `839dbb50fbd2ad041089981441a82f2460dac455`; head `feat/usage-reset`; one draft PR for that exact pair authored by `kortylokai-web`, never `kamilbeda`. Never change fork `main`, upstream/personal refs, labels, or unrelated PRs; never mark the PR ready. No merge, install, profile operation, or live reset.

- [ ] Establish delivery variables and verify the checked-out branch, remote destination, tools, and pinned ancestor. Re-read `CONTRIBUTING.md` and `.github/pull_request_template.md`; the guide's normal current-main branching advice is superseded for this task by the operator's dedicated pinned-base decision. If Astra/xhigh was unavailable or either stage of the combined final review did not pass, stop instead of claiming an equivalent maximum review.

```bash
set -euo pipefail
set +x
command -v git
RESET_GH_BIN=/usr/bin/gh
test -x "$RESET_GH_BIN"
"$RESET_GH_BIN" --version
# Select the named stored credential without changing the globally active account.
# Never print this value or enable shell/HTTP credential tracing.
RESET_GH_TOKEN="$(env -u GH_TOKEN -u GITHUB_TOKEN -u GH_DEBUG "$RESET_GH_BIN" auth token \
  --hostname github.com --user kortylokai-web)"
test -n "$RESET_GH_TOKEN"
reset_gh() {
  GH_TOKEN="$RESET_GH_TOKEN" GITHUB_TOKEN= GH_HOST=github.com GH_DEBUG= \
    "$RESET_GH_BIN" "$@"
}
reset_require_identity() {
  local reset_login
  reset_login="$(reset_gh api --hostname github.com user --jq .login)"
  if [ "$reset_login" != kortylokai-web ]; then
    printf 'Delivery requires kortylokai-web; authenticated login is %s\n' "$reset_login" >&2
    return 1
  fi
}
reset_gh_write() {
  reset_require_identity || return 1
  reset_gh "$@"
}
reset_git() {
  reset_require_identity || return 1
  GH_TOKEN="$RESET_GH_TOKEN" GITHUB_TOKEN= GH_HOST=github.com \
    GIT_TERMINAL_PROMPT=0 GIT_ASKPASS=/bin/false \
    env -u GIT_TRACE -u GIT_TRACE_CURL -u GIT_CURL_VERBOSE -u GIT_TRACE_PACKET -u GH_DEBUG \
    git -c credential.helper= \
      -c 'credential.helper=!/usr/bin/gh auth git-credential' \
      -c http.extraHeader= "$@"
}
reset_require_identity
RESET_GIT_URL=https://github.com/agentlehub/codex-desktop-linux.git
RESET_PR_REPO=agentlehub/codex-desktop-linux
RESET_PR_BASE=base/usage-reset-upstream
RESET_PR_HEAD=feat/usage-reset
RESET_PR_BASE_SHA=839dbb50fbd2ad041089981441a82f2460dac455
RESET_DELIVERY_ROOT="$RESET_VALIDATION_ROOT/delivery"
mkdir -p "$RESET_DELIVERY_ROOT"
test "$(git branch --show-current)" = "$RESET_PR_HEAD"
git cat-file -e "$RESET_PR_BASE_SHA^{commit}"
git merge-base --is-ancestor "$RESET_PR_BASE_SHA" HEAD
reset_origin="$(git remote get-url --push origin)"
case "$reset_origin" in
  git@github-agent:agentlehub/codex-desktop-linux.git|git@github.com:agentlehub/codex-desktop-linux.git|https://github.com/agentlehub/codex-desktop-linux.git) ;;
  *) printf 'Unexpected origin push destination: %s\n' "$reset_origin" >&2; exit 1 ;;
esac
reset_gh api --paginate --slurp \
  'repos/agentlehub/codex-desktop-linux/pulls?state=open&per_page=100' \
  > "$RESET_DELIVERY_ROOT/open-prs.json"
```

The named-token command is supported by the vetted installed CLI. If `kortylokai-web` has no usable stored credential, or `/user` returns another login, stop dependent GitHub writes and ask the operator to authenticate that account; do not fall back, run global `auth switch`, or expose credentials. `reset_gh_write` rechecks the selected identity before each GitHub write. `reset_git` uses the same verified credential through a command-scoped HTTPS helper against the validated origin repository, bypassing ambiguous SSH identity without editing the stored remote or global Git/auth config. Local commit author metadata is a separate concern and is not proof of API/push identity. Keep tracing disabled and unset `RESET_GH_TOKEN` when delivery ends.

- [ ] Deduplicate only this same work. Inspect the complete fork open-PR list for the same head repository/branch and approved base. Reuse an exact same-work PR only if its API `user.login` is `kortylokai-web`. A same-work PR authored by any other account, including `kamilbeda`, requires operator resolution; do not create a duplicate, close it, or try to reassign authorship. If the same feature head has a conflicting base or multiple matching PRs make reuse ambiguous, stop for operator resolution without closing anything. Unrelated open PRs in the user fork do not block delivery and must remain untouched. The one-PR-per-contributor cap applies only to submissions to official/upstream `ilysenko/codex-desktop-linux`; no upstream submission is authorized here, so that cap is not an execution gate. Record the verified existing PR number or absence, then repeat the same-work check immediately before creation to avoid a concurrent duplicate.
- [ ] Preserve the operator's informed delivery-policy decision: do not disable the inherited contributor-limit workflow, change repository Actions/settings/workflow files, impose a fork PR-count gate, or stop before creating the draft merely because that workflow is active. Read-only discovery recorded workflow ID `326078947` as active with zero historical runs; a repository Actions-permissions read returned 403, so absence of observed enforcement does not establish that the workflow is inert. The operator explicitly chose to proceed unchanged after this risk was explained. Automation may close this PR or unrelated fork PRs. Proceed with the already-authorized draft creation, then verify/report the actual resulting state. Never promise lasting draft retention, auto-reopen in a loop, close unrelated PRs, or change automation to compensate.

- [ ] Commit only reviewed implementation files. First inspect `git status --short` and `git diff --cached --name-only`; any preexisting staged content requires classification before staging. Stage only these owned paths, inspect the staged diff and whitespace, and commit if it is nonempty:

```bash
git add -- linux-features/usage-reset-threshold/feature.json \
  linux-features/usage-reset-threshold/policy.js \
  linux-features/usage-reset-threshold/patch.js \
  linux-features/usage-reset-threshold/test.js \
  linux-features/usage-reset-threshold/fixtures/source-contracts.json \
  linux-features/usage-reset-threshold/fixtures/harness.js \
  linux-features/usage-reset-threshold/README.md README.md README.zh-CN.md \
  docs/superpowers/plans/2026-10-11-usage-reset-threshold.md \
  docs/superpowers/specs/2026-10-11-usage-reset-threshold-design.md \
  docs/brainstorming/2026-10-11-021140-usage-reset-threshold.md
git diff --cached --check
git diff --cached --stat
git diff --cached
if ! git diff --cached --quiet; then
  git commit -m "feat(usage): add configurable agent reset threshold"
fi
git diff --check "$RESET_PR_BASE_SHA" HEAD
git diff --name-status "$RESET_PR_BASE_SHA" HEAD
git diff --stat "$RESET_PR_BASE_SHA" HEAD
```

Expected staged paths are exactly a subset of the nine implementation paths above plus the operator-authorized plan/spec review-schedule amendment and plan/spec/proposal identity correction; never sweep unrelated staged or untracked files. Expected complete PR diff contains only those paths plus the already reviewed related proposal, spec, plan, and their review traces: `docs/brainstorming/2026-10-11-021140-usage-reset-threshold.md`, `docs/superpowers/specs/2026-10-11-usage-reset-threshold-design.md`, `docs/superpowers/plans/2026-10-11-usage-reset-threshold.md`, `docs/superpowers/reviews/2026-10-11-usage-reset-threshold-spec-review.md`, and `docs/superpowers/reviews/2026-10-11-usage-reset-threshold-plan-review.md`. No unrelated upstream-sync or attachment removal may appear. A new path or changed implementation after final review requires scope reconciliation and affected checks/review before publication. Preserve unrelated dirty worktree state.

- [ ] Publish the pinned base with a create-only lease, then the reviewed feature head. The lease's empty expected value protects against concurrent branch creation; it never authorizes overwriting an existing branch. If the remote base already differs, stop. If creation loses a race, re-read and reuse only the exact pinned SHA; otherwise stop without forcing. A non-fast-forward head push also stops without force/rebase/reset.

```bash
reset_base_ref="refs/heads/$RESET_PR_BASE"
reset_base_remote="$(reset_git ls-remote "$RESET_GIT_URL" "$reset_base_ref")"
if [ -z "$reset_base_remote" ]; then
  reset_git push --force-with-lease="$reset_base_ref:" "$RESET_GIT_URL" \
    "$RESET_PR_BASE_SHA:$reset_base_ref"
else
  test "$(printf '%s\n' "$reset_base_remote" | awk '{print $1}')" = "$RESET_PR_BASE_SHA"
fi
reset_base_remote="$(reset_git ls-remote "$RESET_GIT_URL" "$reset_base_ref")"
test "$(printf '%s\n' "$reset_base_remote" | awk '{print $1}')" = "$RESET_PR_BASE_SHA"
RESET_PR_HEAD_SHA="$(git rev-parse HEAD)"
reset_git push "$RESET_GIT_URL" "HEAD:refs/heads/$RESET_PR_HEAD"
reset_head_remote="$(reset_git ls-remote "$RESET_GIT_URL" "refs/heads/$RESET_PR_HEAD")"
test "$(printf '%s\n' "$reset_head_remote" | awk '{print $1}')" = "$RESET_PR_HEAD_SHA"
```

- [ ] Build the actual PR description from the checked-out upstream template, retaining its exact `## Summary`, `## Validation`, and `## Checklist` headings and factual checklist. Omit the opening contributor-limit reminder and all instructional HTML comments as the operator requested; treat the contributor cap as official/upstream-only guidance, not a fork delivery gate or PR prose. Use the real Task 9 validation summary. Leave the no-longer-draft checkbox unchecked. Leave the combined validation/required-CI checkbox unchecked until every claimed check actually passed; local checks alone do not prove required CI. Leave the maximum-reasoning checkbox unchecked and explain the completed Astra/xhigh exception. Do not assign labels.

```bash
python3 - "$RESET_VALIDATION_ROOT/delivery-validation.md" "$RESET_DELIVERY_ROOT/pr-body.md" <<'PY'
from pathlib import Path
import re,sys
validation=Path(sys.argv[1]).read_text().strip()
assert validation, "Missing actual validation evidence"
template=Path('.github/pull_request_template.md').read_text()
body=template[template.index('## Summary'):]
body=re.sub(r'<!--[\s\S]*?-->','',body)
summary='''Adds the disabled-by-default usage-reset-threshold feature. Usage settings can select a whole remaining-quota threshold from 1 to 99 while preserving the master permission, explicit authorization for each reset, fresh core-usage checks, cancellation, and idempotency. Settings changes never spend or schedule a reset. Manual redemption and the independent main-process permission gate remain unchanged.

The feature patches the shared official amd64/arm64 ASAR path without changing package-format implementation or required core repairs. The PR includes its related design, plan, and review documents and targets the dedicated pinned base in this fork.

Service acceptance above the stock threshold remains unverified. No real reset was requested or consumed. Native settings acknowledge accepted memory state before queued persistence. Inherited fork automation remains unchanged by operator decision and may close this draft; delivery verifies observed status without guaranteeing continued retention.

Operator-approved review exception: one combined final whole-implementation review used gpt-6-astra at xhigh instead of maximum reasoning. Findings were addressed and affected checks rerun. The maximum-reasoning checkbox remains unchecked because max was not used.'''
body=re.sub(r'(?ms)^## Summary\n.*?(?=^## Validation\n)',
            '## Summary\n\n'+summary+'\n\n',body,count=1)
body=re.sub(r'(?ms)^## Validation\n.*?(?=^## Checklist\n)',
            lambda _: '## Validation\n\n'+validation+'\n\n',body,count=1)
assert re.findall(r'^## (.+)$',body,re.M)==['Summary','Validation','Checklist']
assert '<!--' not in body and '-->' not in body
assert 'one pull request open' not in body.lower()
assert 'per-contributor' not in body.lower()
assert '- [ ] This pull request is ready for review and is no longer a draft.' in body
assert '- [ ] I reviewed the final diff with my coding agent using maximum reasoning effort' in body
Path(sys.argv[2]).write_text(body.strip()+'\n')
PY
```

Read the resulting body before publication. The assertions deliberately fail on a changed template requiring reconciliation. Check factual contribution/test checklist items only when the actual evidence supports their full text; no claim of max review, completed CI, live validation, or ready status may be manufactured. The actual body must contain neither the contributor-limit reminder nor template scaffold comments.

- [ ] After the repeated same-work deduplication check, create the new draft using the explicit fork destination and body file, or update the already verified same-work PR. Do not use an implicit default repository:

```bash
RESET_PR_URL="$(reset_gh_write pr create --repo agentlehub/codex-desktop-linux \
  --base base/usage-reset-upstream --head feat/usage-reset --draft \
  --title "Add configurable agent usage reset threshold" \
  --body-file "$RESET_DELIVERY_ROOT/pr-body.md")"
```

For reuse, set `RESET_PR_NUMBER` from the verified API result (never guess a number), then:

```bash
reset_gh_write pr edit "$RESET_PR_NUMBER" --repo agentlehub/codex-desktop-linux \
  --title "Add configurable agent usage reset threshold" \
  --body-file "$RESET_DELIVERY_ROOT/pr-body.md"
```

If the reused PR is not already draft, convert it with `reset_gh_write pr ready "$RESET_PR_NUMBER" --repo agentlehub/codex-desktop-linux --undo`; never mark it ready. Assign its URL with `RESET_PR_URL="$(reset_gh pr view "$RESET_PR_NUMBER" --repo agentlehub/codex-desktop-linux --json url --jq .url)"`. On an uncertain create result, inspect the exact fork/head/base before retrying; do not create a duplicate.

- [ ] Immediately attach every created PR, or the reused requested PR, with `mcp__codex_app__attach_artifact({artifact_type:"pull_request",url:RESET_PR_URL})`. Attachment does not replace verification.
- [ ] Inspect a current snapshot of the existing CI results. Nix coverage is CI-only: `nix/linux-features.nix` discovers noninternal feature manifests; the maximal profiles in `flake.nix` automatically include this new feature, and `.github/workflows/ci.yml` runs both maximal profiles on `x86_64-linux` and `aarch64-linux`. This verifies Nix packaging/integration; inert tests verify reset behavior. Add no Nix jobs or configuration, run no local Nix builds, and never install Nix or ask the operator to install it. Inspect the actual `nix-build` matrix results and `nix` aggregate, recording pass/fail/pending/skipped/unavailable honestly. Missing or unavailable CI is unverified coverage, not permission for a local-install fallback or a passing-CI claim. It does not block creation of the requested draft.

```bash
reset_ci_status=0
if reset_gh pr checks "$RESET_PR_URL" --repo agentlehub/codex-desktop-linux \
  --json name,state,bucket,workflow,link \
  > "$RESET_DELIVERY_ROOT/ci-checks.json" 2> "$RESET_DELIVERY_ROOT/ci-checks.stderr"; then
  reset_ci_status=0
else
  reset_ci_status=$?
fi
printf '%s\n' "$reset_ci_status" > "$RESET_DELIVERY_ROOT/ci-checks.exit-status"
```

Interpret the exit status together with JSON/stderr (pending and failed checks can return nonzero). Report a single current snapshot; do not start an unattended monitoring loop. Keep the template's combined tests/required-CI checkbox unchecked unless its full claim is supported.

**Operator stop rule for all CI:** If any CI check fails for an unknown reason, pause implementation and report back with the check/run URL, current status, and available log evidence. A bounded read-only capture of the existing check/run details and failed-log excerpt is allowed; open-ended troubleshooting, speculative fixes, CI rerun/retry loops, workflow edits, and scope expansion are not. Do not guess a cause or keep executing dependent delivery steps. Wait for explicit operator direction before dependent execution resumes. This applies to every CI check, not only Nix. Pending, skipped, or unavailable checks remain honestly unverified; they are not automatically an unknown-cause failed check. An evidence-confirmed defect in this feature follows the existing narrow fix, relevant verification, and review process within approved scope; this exception requires established evidence, not a hypothesis. Read-only PR-state verification may still be captured for the pause report, but do not claim completed delivery while this stop condition is unresolved.
- [ ] Query the PR's current API state and verify exact repository/base/head SHA/draft, author, and published body:

```bash
RESET_PR_NUMBER="$(reset_gh pr view "$RESET_PR_URL" --repo agentlehub/codex-desktop-linux --json number --jq .number)"
reset_gh api "repos/agentlehub/codex-desktop-linux/pulls/$RESET_PR_NUMBER" \
  > "$RESET_DELIVERY_ROOT/published-pr.json"
python3 - "$RESET_DELIVERY_ROOT/published-pr.json" "$RESET_PR_HEAD_SHA" "$RESET_DELIVERY_ROOT/pr-body.md" <<'PY'
import json,sys
from pathlib import Path
p=json.loads(Path(sys.argv[1]).read_text())
assert p['user']['login']=='kortylokai-web'
assert p['base']['repo']['full_name']=='agentlehub/codex-desktop-linux'
assert p['head']['repo']['full_name']=='agentlehub/codex-desktop-linux'
assert p['base']['ref']=='base/usage-reset-upstream'
assert p['base']['sha']=='839dbb50fbd2ad041089981441a82f2460dac455'
assert p['head']['ref']=='feat/usage-reset' and p['head']['sha']==sys.argv[2]
assert p['body'].strip()==Path(sys.argv[3]).read_text().strip()
if p['state']!='open':
    print(f"Created PR is no longer open; draft retention failed: {p['html_url']} (state={p['state']})")
    raise SystemExit(1)
assert p['draft'] is True
print(p['html_url'])
PY
```

If a postcondition fails, report the actual state and stop compensating actions; do not force-change refs or silently retarget the PR. If automation closes the created PR, report its URL and failed draft retention without an automatic reopen/recreate loop, changes to automation, or closing unrelated PRs. Record PR URL, base/head SHAs, observed state/draft flag, observation time, checks, and attachment result. A11 delivery succeeds only if the observed open-draft postconditions match; this is not a guarantee that automation will leave it open later. Deliver the link with the actual state and concise validation/limitations, explicitly stating no real reset was requested or consumed. The operator's no-stop instruction concerns active automation and fork PR counts, not wrong-account writes: missing/mismatched `kortylokai-web` authentication or a wrong-author same-work PR still blocks dependent writes. Unset `RESET_GH_TOKEN` when these reads/writes finish, including error cleanup, without printing it. No routine approval request is needed for correctly authenticated, already-authorized delivery steps.

## Verification commands and expected evidence

These commands are for authorized implementation, not the plan-writing session. Run focused red/green commands in tasks first; use this final set once on the finished changes. Repeat only when later edits/failures invalidate it.

```bash
node --check linux-features/usage-reset-threshold/patch.js
node --check linux-features/usage-reset-threshold/policy.js
node --check linux-features/usage-reset-threshold/fixtures/harness.js
node --test linux-features/usage-reset-threshold/test.js
node --test scripts/patch-linux-window-ui.test.js scripts/lib/linux-features.test.js
node --test scripts/lib/package-common.test.js
git diff --check
git status --short
```

Expected: syntax/tests exit 0, scoped diff has no whitespace errors, status shows only the named feature files/README rows plus previously recorded unrelated dirt. This feature does not change Rust, shell/framework implementation, dependencies, or package formats, so unrelated Rust/full-package builds are not added to the focused local gate. No local Nix build or installation is required or allowed by this plan. Existing Nix CI automatically packages the feature in both maximal profiles on both supported architectures; Task 10 observes/reports the real CI results. Nix CI unavailability remains explicitly unverified, with no local-install fallback. The official-bundle audit/build lanes in Task 8 and update-builder staging test remain required; synthetic tests do not replace them. If the scope expands into framework/package payload implementation, stop for approval and apply the broader repository checks instead.

For untracked new files, supplement Git's tracked-only whitespace check with `git diff --no-index --check /dev/null <new-file>` for every task-owned new text file. Exit 1 solely for a clean nonempty diff is normal; whitespace diagnostics are failures. Validate Markdown links by resolving relative targets from each document directory; verify `./install.sh`, manifest ID, and all documented test paths exist.

## Stop and recovery boundaries

- **Unknown-cause CI failure:** pause implementation immediately after bounded read-only evidence capture. Report the check/run URL, status, and available failure logs; do not attempt speculative fixes, rerun loops, workflow changes, or broader debugging. Wait for operator direction before dependent work resumes. Applies to all CI, including non-Nix checks. Existing evidence-confirmed feature regressions retain the approved targeted fix/test/review path; an unproven suspected cause does not qualify.
- Spec contradiction, new product/authorization decision, unknown settings authority, registry count/contract drift, unbound import, incompatible native schema API, or need for a generic framework extension: stop dependent edits and return exact evidence to the operator. Do not silently broaden scope, add compatibility branches for old official versions, or disable enforcement.
- Failed preflight: zero writes. Failed patch writes: restore and hash-check every attempted candidate target, including a partially written failing target, or raise integrity failure; reject candidate. Failed build: preserve live install unchanged and retain only bounded diagnostic evidence until reported.
- No live reset is ever a diagnostic fallback. Server eligibility remains unknown. No remote-host support expansion, automatic reset, scheduling, credit selection, new tool argument, or profile migration is authorized.
- Task 10 alone authorizes the scoped implementation commit, create-only pinned-base publication, feature-head push, and fork draft PR. No merge, fork-main mutation, upstream/personal push or PR, labels, workflow/Actions configuration changes, local Nix installation, app install/restart, live reset, or cleanup outside exact task-owned scratch is authorized. Preserve shared edits; never force-update an existing divergent remote base or head.

## Plan self-review

Spec coverage: all approved control/input, native ownership/persistence, four registries, controlling desktop versus task-host scope, fresh/final policy reads, explicit authorization, cancellation, transport/idempotency, manual preservation, localization/catalog, fail-closed patching, packaging/default-off, architecture, removal, and no-reset contracts map to A1-A10 and numbered tasks. The operator-added fork draft-PR delivery and Astra/xhigh review exception map to A11 and Tasks 9-10.

Execution/design review: dependencies and M1/final review gates are explicit; fixture acquisition and inert execution boundaries are specified; source aliases are semantically derived with concrete baseline anchors; each mutation has a target and transformation contract; tests distinguish behavior, integration binding, and static upstream compatibility. Shared code generation avoids independent policy rules. The narrow schema and hook adapters are test scaffolding only, with their proof limits stated. No unresolved product decision remains. The later operator-authorized delivery scope is recorded explicitly, including its dedicated pinned base.

Independent review corrections: restored the spec's conditional pristine-ASAR invariant and explicit required-core baseline evidence; moved integrated write/rollback tests after complete patch preflight and included partial failing-file restoration; completed lane tool prerequisites. These repair execution details without changing product decisions or the absolute no-reset boundary.

Source update: the operator added future fork draft-PR delivery after the initial plan review and resolved the dedicated pinned base. The approved addition is recorded in the proposal Q4 and spec delivery amendment, which were reread during this update. This plan incorporates it; the corrective review covered the addition and passed. Operator plan approval and implementation authorization were subsequently granted on 2026-10-11. The operator subsequently accepted inherited fork-automation closure risk and directed creation without disabling automation or imposing a fork-count/active-workflow gate; the plan records actual-state verification and no automatic recovery loop. Delivery now uses the vetted installed GitHub CLI path to avoid implicit shim installation, with a task-selected kortylokai-web credential shared by API writes and HTTPS pushes and an exact PR-author postcondition. Nix verification is explicitly existing-CI-only, with no local installation/build or missing-CI fallback.

Document checks: source/review/proposal links, existing command targets, exact planned file responsibilities, metadata status, whitespace, and unresolved-marker scans were checked during writing. Future implementation tests/builds were not run. The separate Astra/high corrective review passed with no findings, including the identity, automation, CI-only Nix and unknown-CI-failure constraints. The operator approved the plan and authorized implementation on 2026-10-11; all no-reset, identity, CI-only Nix and CI-failure constraints remain binding.

## Operator execution amendment - 2026-10-11

During implementation the operator required Astra/high for every supporting and intermediate-review subagent, with no Sol agents. The operator also replaced the two separate final reviewers with one combined Astra/xhigh reviewer. It must check the entire change for spec/requirements/safety first, then code quality/design/API contracts and concrete alternatives. All coverage, no-real-reset boundaries, finding fixes, affected re-review, and completion gates remain mandatory. The narrow plan/spec wording amendment is authorized for the scoped delivery commit. Historical review traces remain unchanged.

## Operator identity correction - 2026-10-11

During implementation the operator explicitly corrected the required GitHub account from `kortylokai` to `kortylokai-web`. Current delivery instructions and executable checks above use `kortylokai-web`; exact named-credential `/user` verification and final PR-author verification remain mandatory. Historical review records retain their original account wording and are not rewritten. No other delivery scope or safety gate changed.
