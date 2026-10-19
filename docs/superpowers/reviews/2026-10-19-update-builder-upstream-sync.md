# Update-builder upstream synchronization

Status: integration implemented and source verification passed; requested reviews pending.

## Prerequisites

- Clean published branch `design/update-builder-payload` at `6b99357b917d3bcf6db50c14df99736aea558a69` verified before merge.
- Current upstream pinned to `8c2eb74e`; original feature baseline `839dbb50`. Existing fork PR #2 and its exact-upstream base branch remain the publication targets. Fork main and PR #1 are out of scope.
- Operator authorized branch update, conflict resolution, compatibility edits, Sol/high review of new changes with in-scope fixes, then Sol/xhigh review of the full diff.
- Preserve repository-only exact exclusions, private copying, source/symlink safety and unchanged directory-watch acceptance evidence. No local Nix, live app/profile/reset/probe actions or unrelated packaging fixes.
- Small bounded unit fixtures may use a short unique physical `/tmp`; bulky build/extraction output remains disk-backed cache.

## Acceptance criteria

1. Updated branch contains current pinned upstream, with no unresolved conflicts or lost upstream changes.
2. All incoming repository feature/shared patch test inputs and test-only resources use reserved roots; production dependencies stay outside those roots.
3. Discovery and existing CI/docs commands reach the relocated entrypoints, fixtures and shared helpers.
4. Tests demonstrate exact omissions, private and retained production inputs, new native requirements and packaged generations. Relevant source checks pass or exact failures are diagnosed and reported.
5. Sol/high review of integration changes and subsequent Sol/xhigh review of the complete diff finish; valid in-scope issues are fixed and affected checks rerun.
6. Fork PR head and upstream-copy base are updated, with accurate current validation and no one-PR reminder in the description. Existing archive gaps are not silently waived or treated as current validation.

## Steps

1. Inspect all 24 incoming commits and trace their consumers against the reserved-root contract.
2. Merge upstream preserving published history; resolve conflicts and adapt new test/helper/fixture paths and staging fixtures.
3. Verify entrypoint coverage, source preservation, syntax, canonical Node and applicable smoke/Python checks.
4. Run Sol/high focused review, fix in-scope findings and rerun affected checks.
5. Run Sol/xhigh review of the full PR diff, address in-scope findings and record verification limits.
6. Commit and publish the updated PR branch and fast-forward its separate upstream-copy base.

## Analysis and integration notes

- Merge reports 13 conflicting paths, including rename/modify conflicts in moved tests, active CI command changes, appended package-common tests, and a new UI fixture under the relocated fixture root.
- Incoming additions include two features, five feature test entrypoints, a UI fixture, and a shared portal test plus test-only helper. Their production patch/syntax helpers remain outside reserved test roots.
- Existing staging fixtures need the newly required Computer Use indicator and retained MCP runners. Upstream's new standalone Read Aloud production behavior and dedicated regressions are retained.
- Large native crate changes do not become builder source inputs: existing callers stage prebuilt helpers. Their crate-local tests/fixtures remain at upstream paths.
- Upstream removes the prior missing-module Node failure and prepares `/run/user` in the container smoke fixture. Earlier failed baseline records remain historical evidence, not current test outcomes.

## Source verification before focused review

Evidence root: `/home/korty/.cache/codex-desktop-dev/test-directory-sync-4xp_i14p`.

- Canonical Node syntax/test runner passed: 1,676 tests, 1,655 passed, 21 optional skips, zero failures (`node-final.log`).
- Smoke passed: primary group 138 tests, 136 passed and two skips; additional group 36 tests, 35 passed and one skip (`smoke.log`). Python passed all 20 tests (`python.log`).
- Exact entrypoint mapping finds all 82 current upstream entrypoints at their intended paths. New helper and fixture are outside test-entrypoint patterns. There are 44 repository features; the existing dynamic preservation matrix covers both new features.
- New fixture bytes match upstream; protected acceptance/plugin source trees and all native/updater/Cargo/Make/Nix files match upstream exactly. The production packaging diff is the original nine lines.
- First Node run found one incorrect expected-plugin fixture overlay: it included the backend executable although upstream grafts that separately. The expectation now overlays only the two actual retained runners. Initial failure is preserved in `node.log`; no production change was needed.
- No local Nix, real app/profile/reset access, new archive builds or hosted dispatch performed. Prior archive evidence is historical and does not establish validation on this new upstream revision.
