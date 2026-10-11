---
status: in-progress
supersedes: 2026-10-11-150920-update-builder-test-exclusion.md
next: ../superpowers/specs/2026-10-11-update-builder-test-directories-design.md
---

# Brainstorming: general update-builder payload minimization

## Context

This is a **proposed design, not approved implementation**. The operator requested a general solution in a separate upstream-based branch after an audit showed that shipping feature tests was widespread. It is separate from the usage-reset feature and its draft PR. The operator has since approved the linked spec after one combined review and removal of unrelated plugin cleanup, and authorized implementation-plan drafting. No implementation, tests, builds, installation, dependency setup, commits, publication, CI dispatch or live application interaction was authorized or performed.

Provenance: worktree `/home/korty/dev/codex-desktop-linux-update-builder-design`, branch `design/update-builder-payload`, upstream `main` commit `839dbb50fbd2ad041089981441a82f2460dac455`. The parent verified this against a fresh upstream fetch on 2026-10-11. The filename uses Europe/Warsaw creation time. This worktree does not contain the usage-reset feature or its approved feature spec/plan.

The [earlier feature-only proposal](2026-10-11-150920-update-builder-test-exclusion.md) is preserved as history. Its shared special-case and feature-local package-hook alternatives were never approved. The broader proposal below supersedes those recommendations; it does not authorize changes to the other PR. Historical usage-reset evidence belongs to `/home/korty/dev/agentlehub/codex-desktop-linux` at `0664036998c4f2fcec0b65d74dde0bed9dd513c3`, not this upstream worktree.

### Diagnosis and consumer inventory

The cause is coarse selection at staging time. [`stage_update_builder_bundle`](../../scripts/lib/package-common.sh) copies a curated set of top-level build files but recursively copies some source trees, whose test inputs have no consistently excluded directory boundary. The inventory lists whatever survived; it does not decide what belongs. This is a payload-minimality problem, not evidence of a broken signature boundary or reset-safety defect.

| Surface | Current selection and consumers | Proposed treatment |
| --- | --- | --- |
| `install.sh`, three native builder scripts, launcher template, explicit `scripts/lib` list, icons and pinned signing key | Explicit copies in `package-common.sh:960-992`; required by extraction, patching, native packaging and builder regeneration | Retain current explicit selection. Any new policy helper must be added here and survive regeneration. Do not replace this with copying all scripts. |
| Enabled `linux-features/<id>` and `linux-features/local/<id>` | Whole directories copied at `package-common.sh:151-188`; feature discovery needs `feature.json` and `README.md`, and descriptors/hooks need transitive code/data | Keep copy-by-component; omit the exact feature-root `tests/` directory for repository-owned features only. Preserve private local-feature copying. Disabled features remain absent. |
| `scripts/patches` | Whole tree copied at line 966; patch engine recursively discovers `patch.js`, imports helpers and supports optional feature imports | Retain code and dynamic discovery layout. Move the six audited tests under `scripts/patches/tests/` and omit that exact root, preserving production code and discovery layout. |
| `packaging/linux` | Whole tree copied at line 988; deb/RPM/pacman builders render package templates, maintainer/service/runtime helpers and policy files | Retain this small cross-format template set. No unconsumed test subtree identified. Do not drop other native formats merely because the current host uses one. |
| Enabled plugin templates | `stage_update_builder_enabled_plugin_templates:190-206` copies `computer-use` and/or `read-aloud` template trees; stage hooks consume hidden metadata, icons and directories | Preserve template contents and existing staging unchanged, including hidden `.codex-plugin/plugin.json`, `.mcp.json`, icons, `.gitkeep` files and layout. No plugin cleanup. |
| Enabled native executables | `stage_enabled_native_feature_artifacts:1012-1054` grafts prebuilt executables from the staged app into known rebuild paths | Keep executable checks, architecture, modes and fail-closed missing-artifact behavior. Exclude source/build caches before grafting, never remove the grafted `target/release` payload afterward. |
| Feature config and provenance | Enabled settings snapshot, compatibility registry, example config and generated `.codex-linux` source metadata | Retain current validation and production data; apply exclusions before the existing staging inventory is written. |

The prior audit's `/tmp/usage-reset-preexisting-test-payload.json` records **42 upstream features, 52 top-level `test.js`/`*.test.js` files, 1,643,737 uncompressed bytes**, excluding fixtures, at the exact base above. Those are aggregate source totals, **not per-package overhead or compressed savings**. Only enabled features are copied, and updater-disabled packages omit the builder entirely. All 42 currently have tests. CI collects feature tests in [`run-node-checks.sh:39-41`](../../scripts/ci/run-node-checks.sh); the preceding consumer audit found no production consumers or later cleanup of those files.

Additional inspected candidates:

- Six shared patch tests total **32,992 uncompressed bytes**: `scripts/patches/{descriptor,runner}.test.js`, `scripts/patches/lib/{asar-layout,minified-js}.test.js`, and `scripts/patches/core/{quit-confirmation-focus,shell-env-startup}/test.js`. They are copied even without enabled features. The core discovery loop selects `patch.js`, not `test.js` (`scripts/patches/engine.js:105-132`). No production references to these test modules were found in targeted searches.
- `linux-features/ui-tweaks/fixtures/official-font-picker.js` is read by `custom-font-input.test.js:16`. Audit the current fixture subtree and its consumers, then move test-only fixtures beneath the feature test root.
- The earlier proposal to omit four plugin `.gitkeep` files is withdrawn as unrelated cleanup. Preserve templates and existing staging behavior unchanged.
- Preserve `scripts/patches/core/README.md`. Removing this documentation is unrelated cleanup outside the selected test-directory omissions; defer it. Preserve feature READMEs and skill Markdown as production inputs.

Required counterexamples rule out pruning by broad filename classes: `automation-extensions/patch.js` imports `eager-update.js`; `start-minimized-to-tray/patch.js` imports `labels.json` and `descriptions.json`; `agent-workspace/feature.json` installs `skills/agent-workspace-linux/SKILL.md`; shell stage hooks read files at runtime. `patch.js` or a manifest entrypoint is not the complete dependency closure.

The Rust updater recursively copies its required/optional bundle directories and rejects symlinks ([`updater/src/builder.rs:29-43,155-190`](../../updater/src/builder.rs)). It does **not** use `.codex-linux/update-builder-manifest.txt` as an allowlist. That metadata directory is not itself among the copied roots. A proposed policy must therefore travel inside existing copied directories, not rely on a new uncopied root or the manifest as its input.

### Scope and non-goals

Scope is source selection for native packaged update-builders, including enabled features, shared patches, plugin templates, native artifact preservation and regenerated builders. Existing component owners retain responsibility for their rebuild inputs. The intended improvement is omission of **known development-only material**, not a proof of globally minimal bytes. Exclusions precede the existing staging inventory write; changing post-hook inventory behavior is outside scope.

Non-goals: import tracing, bundling/minification, a new package manager or dependency graph, runtime feature changes, relocating unrelated tests outside copied roots, rewriting the Rust updater, changing trust/promotion/rollback, source-derivation minimization, universal compatibility with obsolete source versions, or cleanup of the separate usage-reset PR. No dependency or file globbing language is needed.

All work must preserve the hard boundaries: no real usage-reset tool/RPC/HTTP/UI call, including expected rejections; no live Codex modules, profile, authentication, socket, settings, installation or restart. Validation designs below use inert synthetic data/fake executables only, or inspect authorized package archives without launching the app. No local Nix installation/build. Unknown-cause CI failure means stop/report, not speculative fixes, retries or workflow edits.

## Current decisions

**Settled operator constraints:** design only; separate branch/worktree based on fresh upstream `main`; keep the usage-reset PR separate; preserve the historical alternatives and the safety boundaries above.

**Selected approach:** reserve `linux-features/<id>/tests/` for repository-owned test inputs and omit that exact directory during builder staging. Move the shared patch tests under `scripts/patches/tests/` and omit that exact root. The operator agreed: "Agreed. Repository owned only" ([Q3](#q3-should-tests-move-under-a-reserved-tests-directory-instead)). This supersedes the manifest-field choice in Q1.

**Compatibility:** private features under `linux-features/local/<id>/` retain existing copying, including any `tests/` directory. Do not add `updateBuilder.exclude`, an opt-in mechanism, a manifest-schema extension or the proposed source classification check. Preserve existing non-test exclusions and native artifact grafting.

**Scope corrections from discussion:** post-hook finalization was withdrawn because inventory refresh does not enforce exclusions and is unnecessary for staging-time pruning ([Q2](#q2-how-should-finalization-and-compatibility-work)). The independent read-aloud finding remains a recorded baseline limitation, not a prerequisite or operator decision for this change ([separate finding](#separate-finding-and-limits)).

The approach and repository-only boundary are settled. The operator subsequently authorized an Astra/high agent to draft a concise spec: "We will go the tests dir route." The operator approved the [spec](../superpowers/specs/2026-10-11-update-builder-test-directories-design.md), including removal of unrelated plugin-marker cleanup, and authorized implementation-plan drafting. This historical brainstorming artifact is supporting context; the approved spec is the planning source of truth. Implementation remains unauthorized. The operator resolved the acceptance-material migration issue: keep the already-excluded directory in place, as recorded below. The operator authorized one combined Astra/high spec review. Implementation and publication remain unauthorized.

## Q&A

### Q1: Which general selection contract is worth maintaining?

Historical proposal and rationale, superseded by [Q3](#q3-should-tests-move-under-a-reserved-tests-directory-instead).

**Recommended**

Add one optional feature manifest field, `updateBuilder`, with a single `exclude` array of exact feature-relative paths. For example, `"updateBuilder": {"exclude": ["test.js", "fixtures"]}` declares those paths development-only for that feature. Use explicit additional test names where needed. Absence or an empty list preserves existing copying. This is an exclusion declaration, not a complete build-input list.

The feature framework validates and exposes this metadata; the shared package stager owns applying it to the copied destination before native artifact grafting. All current repository features receive audited exclusions in one coherent migration. Local features may opt in but receive **no new filename-based default**. Move the existing directory-watch `acceptance` and reaper `src`/Cargo-file exclusions into their owning manifests, removing those two ID-specific branches once equivalent behavior is covered. Preserve the existing generated `target/` pruning and subsequent native graft lifecycle.

For the few shared recursive roots, put explicit relative exclusions beside their copy operations in `package-common.sh`: the six patch tests and audited plugin markers above. These are shared component policy, not feature-ID switches. Reuse the same small path-validation/removal operation where practical. Do not create a global file-permission manifest or an independent policy DSL just to share a handful of entries.

**Resolved**

On 2026-10-11, the operator initially selected exclusions: "I'd rather have exclusions." The subsequent Q3 decision supersedes this choice: use reserved test directories for repository-owned features, without a manifest field or classification checker. No implementation was authorized.

**Rationale**

The material benefit is maintainable ownership across 42 existing feature trees and several shared roots, with no special-case patch for each future feature. Unknown transitive helpers continue to ship, so adding a helper does not silently break the updater. The cost is manifest churn and a small validation/staging contract. That cost is defensible for a general solution; it would be excessive for a single 193 KB finding. Exact exclusions do not automatically catch new test files, so a focused source-only classification check is part of the migration/ongoing validation below.

A complete positive input contract would fail closed on unlisted files, but it would also require authors to enumerate deferred filesystem reads, shell commands, directory enumeration, cross-feature dependencies and generated outputs. A passing `require(patch.js)` would not establish that contract. The exclusion recommendation deliberately does not pretend to solve this harder problem.

### Q2: How should finalization and compatibility work?

**Recommended**

The original recommendation below is preserved as history. Finalization was withdrawn, and Q3 supersedes the field-based compatibility proposal.

Keep package-level ownership of final payload/inventory. The bare stager can retain its current accurate intermediate manifest for existing callers. After feature package resources/hooks and final payload operations, each native package builder calls one common finalizer immediately before archiving. The finalizer refreshes the existing sorted regular-file inventory with `write_update_builder_manifest`. It is a no-op when updater inclusion is disabled and reports a missing expected builder instead of silently producing an invalid inventory. No new feature hook is needed for minimization. Generic post-hook policing of every required input, symlink or reintroduced development path is not necessary to remove the audited files and is deferred; final-package validation still checks the intended payload.

Retain local features with no declaration unchanged. New builders understand the field; builder scripts, framework and feature manifests are packaged together. Old installed bundles are not rewritten in place and keep their old payload behavior until replaced by an authorized newly built package. No state migration or updater schema change is required. Copying only new feature manifests into an old builder is not a supported migration.

**Resolved**

The operator challenged how post-hook inventory refresh relates to enforcing exclusions. The agent acknowledged that it is a separate inventory-accuracy improvement and withdrew it from this change. No native post-hook finalizer or caller changes are proposed. Current compatibility follows Q3: preserve all private local-feature copying and introduce no manifest field. This discussion does not authorize updating an installed bundle.

**Rationale**

Current native hooks run after `stage_optional_update_builder_bundle` and its manifest (`build-deb.sh:82-85`, `build-rpm.sh:102-110`, `build-pacman.sh:131-134`). There are no current repository feature `packageHooks` declarations, but the extension point exists for local/future features. A later mutation can make the inventory stale. That is an independent limitation: refreshing the inventory neither removes development files nor prevents hooks from reintroducing them. Staging-time exclusions already precede the existing inventory write, so this task does not require a new finalizer.

Historical schema finding: architecture prose claims unknown manifest keys fail validation, but the inspected `normalizeLinuxFeatureManifest` spreads top-level fields without a general allowlist. Q3 removes the proposed new field, so no new field validator or old/new field-compatibility tests are needed. Broad unrelated manifest-schema tightening remains outside scope.

### Q3: Should tests move under a reserved tests directory instead?

**Recommended**

Prefer a fixed directory convention over the new manifest field and source classification check. Keep ownership local: `linux-features/<id>/tests/` contains test entrypoints, fixtures and test helpers; equivalent shared patch tests can live under `scripts/patches/tests/`. Reserve only these exact roots for development inputs, not every nested directory named `tests`. Production code must not depend on their contents. Package staging omits the known test roots and retains its existing inventory lifecycle.

This requires a one-time migration of imports, fixture and repository-root paths, CI/test discovery and documented commands. Static inspection found 52 top-level JS tests across 42 feature trees, plus shared patch tests. Existing CI and smoke scripts contain explicit old paths, so updating only file locations would lose coverage or break execution. Keep ordinary behavioral packaging tests proving test-root omission and production-input preservation; drop the proposed file-classification checker, not regression coverage.

Moving tests does not replace non-test exclusions for native build caches or reaper source. Keep those existing rules rather than moving production source into `tests/`. The original recommendation included relocating directory-watch acceptance material; the later accepted exception below supersedes that part. Private local features have an existing contract and may use `tests/` as production data: recommend applying the new automatic omission to repository-owned features only, preserving local copying for this change. Universal application to local features would be an explicit compatibility change requiring operator agreement.

**Resolved**

On 2026-10-11, after the directory proposal and local-feature distinction were explained, the operator agreed: "Agreed. Repository owned only." Adopt the directory convention for repository-owned features; preserve private local-feature copying. Drop the proposed manifest field and source classification check. The shared patch test root follows the same repository-owned convention. This resolves the design direction and compatibility boundary, not full-artifact approval or implementation authorization. The agent corrected its earlier dismissal of directory migration as disproportionate: that comparison over-weighted one-time path churn and under-weighted permanent schema, validation and classification machinery.

**Rationale**

A dedicated test root makes adding test files an ordinary layout choice instead of repeated packaging metadata maintenance. It is easier to understand and keeps unknown production helpers included. Without a classification check, a future test placed outside the reserved root can still ship; this is a documented authoring convention, not automatic proof that all development inputs are excluded. The narrower convention does not promise to eliminate every category of development material.

## Approaches considered

| Approach | Correctness, maintenance and complexity | Disposition |
| --- | --- | --- |
| Explicit negative declaration per owning feature, exact shared-owner exclusions | Keeps unknown transitive inputs, local compatibility and source layout; modest validator/stager work and manifest migration; new test files need classification | Initially selected in Q1, superseded by the directory convention in Q3 |
| Reserved top-level `test.js`/`*.test.js` and `fixtures/` convention for repository features, local opt-in | Small implementation and less metadata; automatic omission of future tests. Makes names a new production-input prohibition, needs a thorough audit and escape/migration rules, and does not cover native source exclusions uniformly | Not selected; Q3 reserves exact test directories instead of filename classes |
| Move component tests/fixtures under reserved `tests/` roots | Simple future exclusion without manifest/schema/classification maintenance; one-time import/path and discovery migration; production consumers must stay outside these roots | Selected in Q3 for repository-owned components; local features retain existing behavior |
| Complete declarative positive rebuild-input list | Strongest explicit selection; can reject unexpected input growth. Every transitive/dynamic dependency needs maintenance, including shell and plugin resources; larger migration and failure surface | Defer unless complete input accounting becomes an explicit product requirement |
| Infer input closure from entrypoints/imports | Tempting automation but incomplete for dynamic filesystem reads, shell, generated/native resources and plugins; requires tooling and a policy for unresolved edges | Not recommended |
| Feature package hooks for every omission | Reuses supported hooks; proliferates executable cleanup, three-format lifecycle concerns and manifest repair; doesn't solve shared patch-tree leakage | Historical feature-only option, superseded for general scope |
| Add more feature-ID branches in package-common | Very small per change; central owner must know every feature's dev tree and future test names | Not recommended as general policy |
| Use inventory as updater copy allowlist | Would change updater semantics and still needs a trustworthy selection source; omitted manifest lines alone leave package overhead unchanged | Outside scope and does not fix staging by itself |
| Keep current contents | Lowest complexity; no demonstrated runtime fault and bounded aggregate uncompressed test size | Valid if operator decides savings do not justify a general contract; does not meet the requested minimization outcome |

## Current contract details

1. **Owned test roots.** Repository features use `linux-features/<id>/tests/` for test entrypoints, test-only fixtures and helpers. Shared patch tests use `scripts/patches/tests/`. Stage enabled repository features as before, then omit only their exact test root; omit the shared patch test root from its staged copy. Do not recursively delete every directory named `tests`, or prune individual files by test-like names. No new manifest field, policy language or classification checker is introduced.
2. **Repository versus local identity.** Use the existing feature discovery result's relative source location to distinguish repository features from `local/<id>` features. Do not infer ownership from a feature ID alone or from whether a `tests/` directory exists. Preserve this distinction in packaged builders and generation-two rebuilds, which have no Git checkout. Private local features keep their existing contents, including `tests/`, `test.js` and `fixtures/`; this task adds no local opt-in mechanism.
3. **Production inputs.** Production entrypoints, transitive helpers, JSON, skill Markdown, runtime/package resources and hooks must stay outside the reserved test roots. Audit all moved files and consumers. Keep feature-root `feature.json` and `README.md`. The directory convention is not proof of a complete dependency closure; retain unknown production inputs through existing conservative copying.
4. **Staged-only omission.** During packaging, remove only the fixed test roots inside disposable staged component copies; never delete source files or traverse a symlink into another tree. Already-absent test roots succeed, which is required for generation two. Preserve existing updater symlink behavior; general bundle-wide symlink hardening remains outside scope.
5. **Existing non-test exclusions and native artifacts.** Preserve current generated `target/` pruning and reaper source/Cargo-file omissions. Keep directory-watch `acceptance/` and its existing pruning branch unchanged under the operator-approved exception. Preserve runner/helper bytes, fixtures, documentation, historical evidence and hash assertions; move only the ordinary feature test and correct its references. Graft native artifacts after pruning, preserving bytes, modes, architecture and missing-artifact failures. Never prune `target/` after grafting release binaries.
6. **Inventory and hooks.** Keep the existing sorted regular-file inventory and write timing, after staging omissions and native grafting. It remains an inventory, not an allowlist or integrity guarantee. No native post-hook finalizer or hook restrictions are introduced. Final archive inspection checks omissions; later hook-driven inventory drift remains a separate baseline limitation.
7. **Generation two and compatibility.** Test actual updater-style root copying followed by re-staging with the copied builder's own configuration and scripts, without access to the original checkout. Repository test roots remain absent, private local resources remain present, production bytes/modes survive and the staging inventory is accurate. Old installed bundles remain untouched until normal replacement by an authorized newly built package. No updater state migration is needed.
8. **Authoring convention.** New repository tests belong under the reserved component test roots. A test mistakenly added elsewhere may still ship; there is deliberately no new classification checker. Existing test discovery must run relocated entrypoints without treating fixture files as tests or pulling opt-in acceptance runners into the normal suite.

## Proposed file ownership and migration

| File or area | Responsibility if implementation is approved |
| --- | --- |
| `scripts/lib/package-common.sh` and adjacent tests | Omit exact repository-owned test roots using existing discovery, preserve local features and non-test exclusions, keep native graft and inventory order |
| `linux-features/<id>/tests/` and `scripts/patches/tests/` | Move existing tests, test-only fixtures and helpers without changing their behavioral assertions; correct imports and filesystem paths |
| `linux-features/directory-only-working-tree-watch/acceptance/` | Preserve in place with unchanged contents and existing staging exclusion; update only references from the relocated ordinary test |
| `scripts/ci/run-node-checks.sh`, other CI scripts, smoke tests and workflow test commands | Update discovery and exact test paths so the same intended tests run after relocation; no workflow redesign or disabling |
| Feature READMEs, repository instructions and architecture/packaging docs | Update affected test commands/links and describe reserved roots, local compatibility and existing staging inventory semantics |
| `scripts/lib/linux-features.js`, feature manifests, three native builders, Rust updater and Nix implementation | No schema, feature default, finalization or runtime behavior changes proposed; verify existing discovery supports the repository/local distinction |
| `packaging/linux`, plugin templates and production patch/feature code | Preserve production content, plugin templates and existing staging behavior unchanged; no marker cleanup |
| Usage-reset implementation/worktree/PR | Outside scope; no changes |

Use one coherent migration of tests in copied repository-owned roots. Preserve all existing test assertions and fixture contents, executable modes and test coverage. Update relative imports, filesystem roots and callers together; relocating tests must not silently reduce execution or accidentally enable acceptance suites. Keep source tests in version control at their new locations. Do not move unrelated tests solely for uniformity, and do not move production source into test directories to obtain an exclusion. Documentation should describe stable categories and commands, not volatile test/byte totals.

## Separate finding and limits

Static inspection suggests a pre-existing rebuild-input gap for **`read-aloud-mcp` alone**: its `stage.sh:5-6,61-70` requires `linux-features/read-aloud/bin/{kokoro-stdin,kokoro_stdin.py}`, but its manifest has no `requires` declaration, its README advertises enabling it alone, and the builder stager copies only enabled feature directories. Its backend graft does not supply those runners. This was not reproduced by executing a build. It is independent of test pruning and must not be mislabeled a new regression or silently repaired here.

The recommendation does not depend on resolving that gap. The operator questioned its relevance, and the agent corrected its earlier treatment as a required decision. Record it as an unreproduced baseline limitation, outside this change. Validate that pruning preserves existing production inputs without claiming every baseline configuration already rebuilds successfully. Any later investigation or fix needs its own scope; blindly adding `requires: ["read-aloud"]` could enable unrelated application behavior and is not an approved answer.

Semble was attempted as required before semantic exploration; `uvx` failed acquiring its read-only cache lock. No tool installation/cache setup was attempted. Research used exact source searches, targeted reads and Git inventories instead. No memory-derived historical fact is needed for this design. The prior feature audit is supporting evidence, and its aggregate inventory is summarized above so the design does not depend on retaining `/tmp` forever.

## Prerequisites for implementation

- **[MANUAL] Operator:** approve the implementation plan and authorize implementation separately. The spec is approved; Q3's approach and repository-only boundary are selected; post-hook finalization and the independent read-aloud limitation are not outstanding decisions for this task.
- Revalidate current upstream/branch, applicable instructions and source consumers before editing. Preserve other worktrees and the usage-reset PR. Only one upstream PR at a time is the repository default; any future additional simultaneous PR needs the documented maintainer exception.
- Confirm Bash/Node and existing test tools are available. No new dependency is proposed. Audit relocation candidates and all consumers at the implementation base, including fixtures, acceptance runners, CI/test discovery, filesystem-root calculations and documented commands. Verify source-location ownership survives updater root copying; do not introduce filename-based deletion.
- Have disposable, disk-backed build/inspection space with `TMPDIR` under `${XDG_CACHE_HOME:-$HOME/.cache}/codex-desktop-dev/`. Never put extracted apps, packages or Cargo/build output in RAM-backed `/tmp`.
- Obtain authorized signed current upstream input, native package tools and `amd64`/`arm64` build/CI capacity for physical validation. Use inert native substitutes only for unit staging checks, not as evidence of real binary correctness.
- **[MANUAL] Operator where required:** authorize CI dispatch/capacity and explicitly accept any unavailable validation lane. Nix remains CI-only; no local fallback, installation or app launch.

## Measurable acceptance criteria and validation

1. **Correct selection.** Stage every repository feature in isolated representative configurations, including required dependencies/internal enablement where applicable. Repository feature test roots and the shared patch test root are absent, disabled features remain absent, and every retained production file's bytes/modes survive. Plugin templates and their existing staging behavior, including marker files, remain unchanged. Relocated source tests/fixtures retain their assertions and contents apart from required path changes. Measure savings per exact configuration and architecture; no aggregate-byte target or compression promise.
2. **Exact omission boundary.** Focused staging tests prove that only repository component test roots are omitted: production files with test-like names or a nested `tests/` outside that exact root survive. Missing test roots succeed. No source/outside-root deletion or symlink-target traversal occurs. Verify through observable staging behavior, not private helpers or shell source text; do not add a classification checker.
3. **Compatibility and dynamic resources.** A private local feature retains production inputs under `tests/` and `fixtures/` and a production `test.js`, in both initial staging and generation two. No manifest opt-in is available or required. An inert descriptor imports a transitive helper and reads JSON lazily, and a fake hook uses a nested resource. Execute those repository transforms/hooks only against disposable synthetic inputs, showing that entrypoint-only selection would fail while this design works.
4. **Native/plugin preservation.** Tests cover enabled prebuilt artifact byte/mode preservation, absent native artifact failure, disabled artifact omission, and hidden plugin manifests/resources. Existing helper coverage should be extended only for distinct risks introduced by exclusions, not duplicated. Retain required feature READMEs and skill Markdown.
5. **Second generation and manifest.** Exercise full staging, actual updater-style directory copying, inert rebuild inputs and re-staging without access to the original checkout. Verify identical retained production inputs, omitted development inputs and independently enumerated staging-manifest equality in both generations. Final payload assertions detect accidental reintroduction of excluded files. Preserve the existing hook/archiving behavior; post-hook inventory accuracy and a new generic hook sandbox or required-input/symlink validator are outside scope. Updater-disabled packaging does not create a builder.
6. **Focused regression checks.** After implementation, verify that discovery includes every relocated entrypoint and excludes fixtures/opt-in acceptance runners, then run shell syntax for changed scripts, framework/package-common tests, affected feature tests, shared patch tests, scripts smoke and the relevant existing PR suite. Use explicit commands rather than local `ci-local.sh all`, which includes the prohibited local Nix lane. Do not run tests/builds merely to validate this design-only artifact.
7. **Supported final packages.** On both applicable architectures, inspect updater-enabled, feature-enabled **final deb, RPM and pacman archives**, as well as an updater-disabled output. Cover ordinary descriptors, data/resources, plugins, native helpers and local-feature compatibility using documented compatible profiles; report which profiles/formats were physically inspected. Check actual retained/excluded paths, config, modes and architecture, not just a staging directory. Check that the packaged inventory reflects the pruned staging output; record any later hook-driven divergence as the existing lifecycle limitation, not a guarantee this change fixes. At least one authorized complete rebuild from a packaged builder is needed to substantiate end-to-end update-build claims, without installing or running the app.
8. **Unaffected outputs.** Inspect applicable feature-enabled final AppImage outputs for preserved application resources and no introduced native builder. Validate Nix through hosted architecture/profile checks and installed-output inspection. Nix source derivation inputs can retain tests; this is distinct from installed `$out` or a native update-builder. Gentoo remains on its existing no-updater path; preserve feature/package resource parsing there and report applicability. Do not equate AppDir staging or green Nix evaluation with an unperformed final artifact inspection.
9. **Boundary preservation.** No runtime behavior, enabled defaults, signature/hash checks, upstream byte-identity guarantees, updater state/promotion behavior, installed state or usage-reset PR change. Required checks pass or their exact gaps are explicitly reported/accepted. Final diff is limited to the approved implementation scope and passes `git diff --check`.

Existing `.github/workflows/upstream-build-app.yml:334-344` uses the empty example feature config and **`PACKAGE_WITH_UPDATER=0`**; pacman/AppImage are stage-only there. It cannot establish this proposal's builder correctness. A green run is regression evidence only. Use authorized one-time package builds or separately approved validation-lane changes to close the gap; do not casually expand this change into CI redesign.

## Numbered implementation outline, only after approval

1. Re-audit test roots, production consumers, test discovery and repository/local source-location handling at the approved base. Record the relocation map and baseline limitations; resolve any new consequential scope decision before coding.
2. Add focused staging regression cases for exact repository-root omission, private local-feature preservation, absent test roots and relevant source/outside-root safety. Do not add a manifest field or classification checker.
3. Move repository feature/shared patch tests and their test-only resources into the reserved roots, updating imports, filesystem paths, discovery, CI commands and documentation together. Integrate exact staged test-root omissions and preserve existing non-test exclusions/native artifact order.
4. Verify omissions precede the existing inventory write, updater-disabled behavior is preserved, and repository/local ownership works after actual updater root copying. Keep native caller and post-hook behavior unchanged.
5. Update author/packaging documentation, exercise staged consumer behavior and generation two with inert inputs, then run the relevant regression checks.
6. Perform authorized supported-package validation, record exact configuration/architecture/output evidence and unresolved baseline limits. Stop/report unknown CI failures.
7. Present the resulting diff and verification against the approved criteria. Publication, an additional PR, installation or live runtime operations require their own authorization; they are not implicit in this outline.

## Remaining approval boundary

The operator selected the test-directory convention for repository-owned features only (Q3) and authorized drafting a concise spec. Private local features retain existing copying. The manifest field and classification checker are dropped; post-hook finalization and the unrelated read-aloud finding remain outside scope. The acceptance-material exception below is resolved: preserve that tree and its existing exclusion. One combined Astra/high spec review is complete. The operator approved the linked spec after removing plugin cleanup and authorized Astra/high plan drafting. Implementation, commits and publication remain unauthorized. This remains historical brainstorming context, not the implementation plan.

## Return from spec writing: evidence-bound acceptance runner

The [draft spec](../superpowers/specs/2026-10-11-update-builder-test-directories-design.md#accepted-exception-historical-acceptance-material) identified a material conflict in the originally requested acceptance relocation. `directory-only-working-tree-watch/test.js:6040-6075` checks current runner/helper bytes against historical signed-runtime evidence. Moving `acceptance/run-signed-runtime.mjs` beneath `tests/` requires changing its imports/repository-root calculation, invalidating that historical hash. No tests or live acceptance runs were executed to investigate this; the finding comes from static source inspection.

**Resolved:** the operator explicitly agreed: "Agreed, do not move it." Leave the already-excluded `acceptance/` tree and its existing staging exclusion unchanged. Move only the ordinary feature test into `tests/` and correct its references, preserving acceptance files and evidence checks. Do not rewrite evidence hashes, weaken assertions or introduce archival machinery. Current contract item 5, the migration table and the draft spec now include this accepted exception. This resolved the design issue. The operator subsequently approved the complete spec and authorized plan drafting; implementation remains unauthorized.
