---
status: superseded
---

# Brainstorming: exclude usage-reset test inputs from the update-builder

## Context

**Superseded by the [general update-builder payload proposal](2026-10-11-154818-update-builder-payload.md).** This document was moved from the usage-reset checkout into the separate upstream-based design worktree for historical preservation. Its Q1/Q2 recommendations were never approved and are not active implementation instructions. Shared-source relative links now resolve to upstream base `839dbb50fbd2ad041089981441a82f2460dac455`; usage-reset-only links explicitly point to historical primary-checkout evidence, which is absent from this worktree.

This is a proposed design, not an approved implementation plan. The operator requested design of contribution-audit finding 1 after authorizing a separate README correction. No packaging, feature implementation, existing approved spec/plan, or configuration changes are authorized by this artifact.

The historically inspected checkout was `/home/korty/dev/agentlehub/codex-desktop-linux` on `feat/usage-reset` at `0664036998c4f2fcec0b65d74dde0bed9dd513c3`. The audit at `/tmp/usage-reset-contribution-compliance-audit.md` reviewed `994ea44d`; the newer commit removes volatile README test/audit totals. This proposal preserves that correction. Exact validation results belong in execution/PR evidence, not maintained README counts.

### Problem and cause

[`stage_update_builder_linux_features_tree`](../../scripts/lib/package-common.sh) (lines 151-188) discovers enabled feature directories, copies each entire directory with `cp -a`, then excludes Cargo `target` directories and two feature-specific sets of unnecessary inputs. It has no exclusion for the usage-reset test inputs. Nothing later identifies those files as unused. This is a staging-selection omission, not a runtime-reset, trust, or updater-execution defect.

Static inventory at the inspected commit:

| Feature-relative path | Consumer | Builder disposition |
| --- | --- | --- |
| `feature.json` | Feature discovery and descriptor selection | Retain |
| `README.md` | Required by feature discovery, even during rebuilds | Retain |
| `patch.js` | `entrypoints.patchDescriptors` | Retain |
| `policy.js` | Imported by `patch.js`; serializes pure policy into patched assets | Retain |
| `test.js` | Node test runner only | Omit |
| `fixtures/harness.js` | `test.js` only | Omit |
| `fixtures/source-contracts.json` | Test harness and tests only | Omit |

The three omitted files total **193,322 uncompressed bytes** at this snapshot. This is evidence of the current finding, not a permanent size requirement or compressed-package savings claim. The feature's `fixtures/` currently contains only those two test inputs.

[`patch.js`](/home/korty/dev/agentlehub/codex-desktop-linux/linux-features/usage-reset-threshold/patch.js) lines 3-8 import Node built-ins, `../../scripts/patches/integrity-error.js`, and `./policy.js`. Its filesystem reads operate on the supplied extracted-app tree, not the feature's fixture directory. [`policy.js`](/home/korty/dev/agentlehub/codex-desktop-linux/linux-features/usage-reset-threshold/policy.js) has no external imports or runtime resource reads. The shared integrity helper is already carried by `stage_update_builder_bundle`'s `scripts/patches` copy. Feature discovery additionally needs the existing staged `scripts/lib/linux-features.js`, `gentoo-dependencies.js`, feature configuration, and compatibility registry.

The adjacent [packaging test](/home/korty/dev/agentlehub/codex-desktop-linux/linux-features/usage-reset-threshold/test.js) at lines 784-813 checks required inputs and loads the staged descriptor, but does not check omitted evidence or apply that staged descriptor. The [shared package tests](../../scripts/lib/package-common.test.js) at lines 358-386 already test exclusion of directory-watch acceptance evidence.

### Constraints and non-goals

- [AGENTS.md](../../AGENTS.md) lines 58-62 requires feature-local changes where possible and a minimal, consumer-driven builder. [CONTRIBUTING.md](../../CONTRIBUTING.md) requires self-contained features and treats shared packaging as cross-format.
- The [existing approved plan](/home/korty/dev/agentlehub/codex-desktop-linux/docs/superpowers/plans/2026-10-11-usage-reset-threshold.md) A8 and task 7 explicitly preserve production staging and no new hooks/resources. This proposal requires a narrow scope amendment before implementation; it does not silently supersede that decision.
- Preserve default-off configuration, authoritative master permission, integer threshold range 1 through 99, all reset behavior, and existing feature tests/fixtures in the source checkout.
- No feature descriptor schema extension, package hook, `stage.sh`, runtime resource, dependency, updater change, feature relocation, or repository-wide packaging cleanup.
- No real reset tool/RPC/HTTP/UI call, including an expected rejection; no live app module, profile, or socket access; no app install/restart or user configuration writes. Use only disposable inert fixtures and fake transports.
- No local Nix installation or build. Nix validation is CI-only. An unknown-cause CI failure is a stop-and-report condition, not permission for fixes or rerun loops.
- This design session performs static inspection only. Future builds, CI dispatch, publication, and integration need their corresponding authorization.

## Current decisions

**Settled constraints:** design only; preserve source feature self-containment and the existing reset contract; keep public README validation statements free of volatile totals; preserve the no-live-reset boundary.

**Proposed, awaiting operator approval:** After the operator asked whether shared-code edits can be avoided, Q2 below reopens the feature-local package-hook alternative. This is now the recommended direction for that constraint. Q1 and its detailed implementation/validation sections preserve the original shared-stager proposal for comparison, not approved instructions. No implementation decision is recorded as approved.

## Q&A

### Q1: Which boundary should own the exclusion?

**Recommended**

Use the existing packaging owner, `stage_update_builder_linux_features_tree`, to omit this feature's top-level `test.js` and entire `fixtures/` subtree when `feature_id` is exactly `usage-reset-threshold`. Place the rule alongside the existing feature-specific exclusions, after the copy and before this function returns. Use fixed, quoted destination paths, without wildcard or recursive filename matching across features.

A bounded implementation can use the current copy-then-prune convention: `rm -f "$destination/test.js"` and `rm -rf "$destination/fixtures"` under that exact feature-ID branch. These are staging operations on the disposable copied destination; never apply them to `$source` or the checkout. The absent paths are valid on subsequent rebuilds, so removal must remain idempotent.

Declare `test.js` and `fixtures/` test-only for this feature in its README. Future production dependencies for this feature must live outside those two paths; its other files/directories continue to copy automatically. No such convention is imposed on another feature, including local features. A redefined module using the same feature ID inherits this feature-specific packaging contract; feature IDs identify the module, not merely its display name.

**Resolved**

Unresolved. The operator has requested this design, not approved shared-staging implementation or the proposed test-only path contract. Parent agent to request approval or correction after presenting this artifact.

**Rationale**

This fixes selection where the builder tree is assembled and matches an existing ownership boundary. Copy-then-prune within that assembler is its existing selection mechanism; a later package hook would instead add another owner and mutate an already inventoried payload. Replacing the copy mechanism solely to avoid temporary copying of this small subtree adds metadata/error-handling risks without improving the delivered contract.

The current manifest does not declare the complete runtime dependency closure: it names `patch.js`, but not `policy.js`. Other features also import local helpers or JSON data and use hooks with transitive resource needs. Examples include `automation-extensions/eager-update.js` and `start-minimized-to-tray/{labels,descriptions}.json`. Selecting only manifest entrypoints/resources is therefore incorrect. Automatic import tracing would still miss filesystem-driven and shell dependencies and would create a new packaging framework.

The recommendation's real cost is another feature-specific rule in shared packaging. It is deliberately bounded, not a general promise that every enabled feature becomes minimal. If repeated independently justified cases make this policy unmanageable, design a separate declarative build-input contract with its own migration and dependency-completeness requirements. That redesign is not required to remove the identified evidence now.

**Approaches considered**

| Approach | Correctness and maintenance tradeoff | Disposition |
| --- | --- | --- |
| Feature-scoped `test.js` and `fixtures/` exclusion in the existing stager | Removes all current evidence and future fixture additions; retains future production helpers outside these two test-only paths; one small shared rule and clear ownership. Requires the feature to keep production inputs out of its reserved test paths. | Recommended; awaiting approval |
| Exact three-file exclusion in the same stager | Avoids reserving the full `fixtures/` subtree, but new test fixtures would silently ship until each path is added. An empty directory is harmless, yet future unused evidence is not prevented. | Viable if the operator rejects the test-only subtree contract; not recommended for a currently dedicated fixture tree |
| Explicit four-file include list for this feature | Precisely minimal today, with no new schema. Every new transitive helper/data input requires a coordinated package-common update; a successfully imported module can still fail later when a deferred resource was omitted. Risks failing future updater rebuilds for otherwise working checkout builds. | Viable, but higher ongoing dependency-maintenance risk than excluding known test-only roots |
| Generic declarative rebuild-input list | Can express consumer ownership explicitly, but needs validation, nested directories/permissions semantics, transitive-input ownership, local-feature compatibility, and migration. An opt-in field would still need per-feature authors to maintain complete closures. | Disproportionate to this finding; requires separately approved framework scope |
| Global `test.js`, `*.test.js`, `fixtures/`, or `tests/` pruning | Filenames are not a dependency contract; valid local or future features may intentionally consume those paths. | Excluded as unsafe |
| Package hook deleting evidence and rewriting the manifest | Supported for native packages, but runs after builder staging and inventory; requires an inventory refresh and changes the no-package-hooks design. | Originally excluded; reopened in Q2 to keep implementation feature-local |
| Move tests/fixtures out of the feature or into `target/` | External relocation breaks the established self-contained source/test layout; `target/` disguises tracked inputs as generated state. | Excluded |
| New tar/rsync filtering pipeline solely for this feature | Can filter during copying, but introduces another copy/error/metadata path for no delivered-payload benefit over existing staging exclusions. | Excluded from this bounded fix |

## Proposed behavior and ownership

The call sequence remains:

`stage_update_builder_bundle` -> enabled feature tree with the new exclusion -> enabled plugin templates -> validated feature config snapshot -> enabled prebuilt native artifacts -> source provenance -> `write_update_builder_manifest`.

The inventory at `.codex-linux/update-builder-manifest.txt` is generated once from the completed tree, sorted under `LC_ALL=C`, listing regular files and excluding itself. No manifest rewrite hook or manifest-format change is needed. It must retain the four required feature files and omit the test entrypoint and every fixture entry. It is a file inventory, not a cryptographic integrity manifest; no stronger guarantee is claimed.

[`updater/src/builder.rs`](../../updater/src/builder.rs) lines 29-43 and 155-190 recursively copy the bundle's required directories, including `linux-features`, and reject symlinks. The updater does not use the inventory as a copy allowlist. Omitting inventory entries alone cannot fix the payload. The proposed change leaves updater copy and trust behavior untouched, and the copied packaging script applies the same exclusion when a rebuilt package creates its next builder.

| File or consumer | Proposed responsibility |
| --- | --- |
| `scripts/lib/package-common.sh` | Only production edit: narrow feature exclusion inside the existing tree stager. Preserve all other exclusions, native artifact handling, metadata, configuration, and manifest order. |
| `scripts/lib/package-common.test.js` | Verify actual bundle contents/inventory, preserved runtime inputs, second-generation staging, and unrelated/local resource names. |
| `linux-features/usage-reset-threshold/test.js` | Strengthen the existing staged-dependency test to apply the staged descriptor on an inert synthetic extracted tree; avoid adding a duplicate source-patcher behavior suite. |
| `linux-features/usage-reset-threshold/README.md` | Document test-only paths and that test evidence stays in source, with stable test categories/commands and existing limitations. No volatile totals. |
| `scripts/build-deb.sh:82`, `build-rpm.sh:102`, `build-pacman.sh:131` | Existing callers of `stage_optional_update_builder_bundle`; no caller implementation edits expected. |
| `scripts/build-appimage.sh:73-100` | Packages the built application without assembling a native builder. Preserve this behavior. |
| `flake.nix:517-568` | Installs the application from its source derivation, without the native builder stager. Source derivation may retain test inputs; it is not the installed update-builder. Preserve Nix output behavior. |
| Existing approved design/plan, descriptor, patch/policy, fixtures, workflows, updater, Nix implementation | No edits in the proposed implementation boundary. Record the approved amendment and evidence in new focused documentation if implementation is authorized. |

Expected implementation boundary: one production shell function, two existing test files, and the feature README. This design artifact remains separate. Do not expand into removing other features' tests or unrelated shared patch-engine tests.

## Prerequisites for implementation

- **[MANUAL] Operator:** approve Q1 and explicitly authorize the bounded shared-staging/test/documentation amendment to the prior feature-local plan. Design approval alone does not authorize publication or installation.
- Recheck checkout, applicable instructions, concurrent changes, and the final diff. Preserve the parent's README commit and all unrelated work.
- Have existing Bash/Node test tools available. No new library, system tool, or dependency should be needed for the proposed fix.
- Before physical validation, provision authorized disk-backed disposable workspaces under `${XDG_CACHE_HOME:-$HOME/.cache}/codex-desktop-dev/`, with `TMPDIR` there. Do not put package extracts, app trees, or build output in RAM-backed `/tmp`; never invoke destructive package targets against the shared checkout's generated app/dist trees.
- Have approved build/CI resources for both `amd64` and `arm64`, signed current upstream input, native package tools/prebuilt updater inputs, and archived output inspection. Missing capacity is an explicit validation gap, not permission to claim a complete matrix.
- **[MANUAL] Operator, if necessary:** authorize any additional CI dispatch or runner capacity needed to close the validation matrix. No local Nix fallback.

## Acceptance criteria and proposed validation

1. **Correct delivered selection.** Run the real `stage_update_builder_bundle` in an isolated staging root with only usage-reset enabled. Assert the test entrypoint and fixture directory are absent; manifest/README/patch/policy bytes match source; the shared integrity helper and feature-discovery dependencies remain available. Verify the builder inventory equals the sorted regular-file inventory excluding itself. Do not use a hardcoded byte-saving or file-count gate.
2. **Self-contained rebuild inputs.** Stage a second-generation bundle from the first staged builder as `REPO_DIR`, using its own configuration snapshot and helper paths. Confirm the same retained/omitted feature paths and truthful manifest. This covers absent test directories on future rebuilds and prevents accidental dependence on the original checkout's test inputs.
3. **Behavior from the staged descriptor.** Extend the adjacent packaging test to load the descriptor through the staged framework in a fresh Node process with staged paths. Prepare its synthetic extracted-app tree from source test fixtures outside the builder. Apply the repository patcher to this inert tree and reapply to confirm the staged input set supports the actual transform and idempotence. Do not import or run upstream app modules; Node syntax checks and repository transforms of inert text are allowed. Reuse existing expected fixture semantics rather than duplicating the complete behavior suite.
4. **No filename-based collateral loss.** Extend the existing local-feature staging test with a different feature whose declared runtime resource is named `test.js` and another under `fixtures/`. Check retained bytes/modes and ordinary staging of those resources. Keep disabled-feature omission coverage. This tests the actual regression risk of broadening the exclusion, not shell source shape.
5. **Focused checks.** Run shell syntax, the shared packaging tests, adjacent usage-reset tests, feature framework tests, and scripts smoke checks. Then the relevant existing PR suite for the shared packaging change. Log exact commands, results, and limits. Do not run `ci-local.sh all` locally: it invokes the prohibited local Nix lane. Use isolated workspaces for package-producing checks.
6. **Native payload evidence.** Inspect feature-enabled, updater-enabled deb, RPM, and pacman outputs on both applicable architectures. Verify `opt/codex-desktop/update-builder` retained/omitted paths, complete manifest, configuration snapshot, and staged descriptor availability. Inspect the final archives, not only temporary staging. No package install or app launch is needed. Verify updater-disabled output still omits the builder.
7. **Unaffected formats.** Inspect feature-enabled AppImage payloads for preserved application output and absence of an introduced native builder; distinguish AppDir-only checks from final AppImage inspection. Use the existing hosted Nix architecture/maximal-profile checks to validate enabled-feature installation and unchanged no-builder output. Record exactly which final artifacts were inspected; stage-only or CI-success evidence must not be relabeled as an unperformed archive check.
8. **Preservation.** No change to `feature.json`, patch/policy bytes, fixture bytes, committed enabled settings, real-reset behavior, trust checks, hooks, or installation state. Source test inputs remain available. Final diff is limited to the approved amendment, and `git diff --check` passes.

The inherited `.github/workflows/upstream-build-app.yml` package matrix (lines 334-344) uses the empty example feature config and **`PACKAGE_WITH_UPDATER=0`**. It therefore cannot validate the changed builder branch. It also stages pacman and AppImage rather than necessarily producing their final archives. Existing green CI is useful regression evidence, not a substitute for criteria 1, 2, and 6. No workflow modification is proposed merely to disguise this gap; authorized one-time artifact builds or a separately approved validation-lane change can supply the missing evidence.

## Open decision and limits

The choice between Q1 and Q2, and implementation authorization, remain unresolved. Validation follows the repository's cross-format requirements; any unavailable lane must remain visibly incomplete unless the operator explicitly accepts the limitation. Approving a test-only subtree contract means a future production dependency inside this feature's `fixtures/` is an intentional design change requiring the packaging contract to be revisited.

Research used the audit, exact source reads/searches, installed Semble semantic search, and static file inventory. No tests, builds, live app interactions, resets, installation, CI changes, or Git/remote writes were performed by this design task. At the original design boundary this artifact was uncommitted and `in-progress`; it is now `superseded` by the general proposal linked above. No independent design review or operator approval is claimed.

### Q2: Can the fix stay entirely inside the feature directory?

**Recommended**

Yes. Use the existing `packageHooks` manifest field to register a feature-local `package.sh` for deb, RPM, and pacman. Restrict implementation edits to this feature's `feature.json`, new hook, adjacent tests, and README. Shared packaging files stay unchanged. This is a revised recommendation in response to the operator's scope question, not an approved change.

The hook receives `PACKAGE_APP_DIR` and `REPO_DIR` from the existing runner. If no update-builder is present, it does nothing. Otherwise, remove only this feature's staged `test.js` and `fixtures/`, retain the hook itself for later rebuilds, and refresh the builder inventory through the existing `write_update_builder_manifest` helper sourced from `scripts/lib/package-common.sh`. That file currently defines functions without running packaging at source time. Do not duplicate the inventory algorithm or remove anything from the source checkout.

**Resolved**

Unresolved. The operator asked whether avoiding shared-code changes is possible; no hook implementation or amendment to the earlier no-package-hooks design has been authorized.

**Rationale**

All three native builders already invoke feature package hooks after `stage_optional_update_builder_bundle` and before archive creation. The framework describes package hooks as narrow native-package staging operations. This fits the existing feature-local extension point and the repository's preference for keeping feature changes inside their directory. The earlier rejection overweighted avoiding a second inventory write and underweighted that explicit ownership rule.

The tradeoff is concrete: intermediate builder staging still contains the tests, and its first inventory is superseded by the hook. Final package contents and the refreshed inventory must both be checked. A direct call to the bare staging helper is no longer expected to produce the pruned tree. Tests must exercise the real staging-plus-hook lifecycle, including a second generation, absent updater, repeat invocation, preservation of other feature files, and failure propagation. The hook must remain in the builder because future updater rebuilds invoke it again. Reusing the existing helper avoids duplicated manifest semantics but still couples the hook to the existing builder layout/helper contract.

The prior no-package-hooks decision requires an explicit scope amendment. The shared-stager-specific four-file boundary and pre-manifest exclusion criteria above would be replaced if Q2 is selected. No real reset, installation, local Nix, or workflow changes are implied. The existing CI coverage gap and native final-payload validation requirements remain applicable.

## Follow-up evidence: pre-existing scope of the issue

The operator requested an audit of other features. Direct `git ls-tree -rl` inventory of upstream base `839dbb50fbd2ad041089981441a82f2460dac455` found 42 feature manifests and 52 top-level `test.js`/`*.test.js` files across all 42 features, totaling 1,643,737 uncompressed bytes. None of those feature trees or the shared stager was changed by this branch. This is an aggregate source inventory, not measured package overhead: only enabled features are copied and updater-disabled packages omit the whole builder. Example totals: directory-only-working-tree-watch 212,604 bytes; remote-mobile-control 178,412; ui-tweaks 161,967; shared-app-server-socket 117,635.

An independent Astra/high read-only consumer audit found no production consumers or later removal of those tests. `scripts/ci/run-node-checks.sh:39-41` explicitly collects them for CI; the feature loader uses manifest entrypoints (`scripts/lib/linux-features.js:531-556`). No repository feature manifest declares package hooks. The inventory function only lists remaining files; the updater recursively copies them (`updater/src/builder.rs:155-189`). An additional test-only fixture exists at `ui-tweaks/fixtures/official-font-picker.js`, consumed by its font-input test. Runtime resources and skill Markdown elsewhere are legitimately needed and are not candidates for blanket deletion.

Corrected characterization: this branch adds another instance of a widespread pre-existing packaging-minimality issue. Describing it simply as our newly introduced mistake overstated the distinction from upstream. The additional bytes from our feature are new, but this is not a newly broken staging mechanism or a reset-safety failure. This broader evidence should inform whether a one-feature exclusion is worth adding; it does not authorize repository-wide cleanup or implementation of either proposal above. Neither proposed fix is approved.
