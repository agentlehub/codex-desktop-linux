# Update-builder test directories

Status: approved
Source: [Current decisions, Q3 and current contract](../../brainstorming/2026-10-11-154818-update-builder-payload.md)
Review: [Combined Astra/high review; minor finding resolved](../reviews/2026-10-11-update-builder-test-directories-review.md)
Next: [Fresh implementation plan awaiting review and approval](../plans/2026-10-11-update-builder-test-directories.md)

The operator approved this spec after removing unrelated plugin-marker cleanup and
authorized an Astra/high agent to write the implementation plan. Implementation, commits
and publication remain unauthorized.
The operator approved preserving directory-watch acceptance material in place, as specified below.

## Objective

Omit repository-owned test inputs from native update-builders through fixed directory
boundaries, preserving rebuild inputs and private local-feature compatibility.
The current recursive component copies include tests; the inventory merely records them.

## Prerequisites

- **[MANUAL] Operator:** approve the implementation plan and authorize implementation separately.
- Revalidate branch `design/update-builder-payload` in
  `/home/korty/dev/codex-desktop-linux-update-builder-design`, based on
  `839dbb50fbd2ad041089981441a82f2460dac455`; preserve unrelated work and the usage-reset PR.
- Audit moved files, production consumers, discovery and documented commands at the
  implementation base. Use existing Bash/Node tooling; no new dependency is required.
- Later package validation needs verified signed upstream inputs, native package tools,
  and applicable `amd64`/`arm64` capacity. **[MANUAL] Operator:** authorize CI dispatch
  where required and explicitly accept any unavailable validation lane.
- Use disk-backed `${XDG_CACHE_HOME:-$HOME/.cache}/codex-desktop-dev/` scratch and `TMPDIR`;
  never place builds, extracted packages or validation output in `/tmp`.

## Scope and non-goals

Scope covers repository feature/shared patch test relocation, disposable builder staging,
connected test discovery, documentation and behavioral packaging regressions.
Private `linux-features/local/<id>/` contents retain existing copying rules.

No `updateBuilder.exclude`, schema extension, opt-in mechanism, classification checker,
global recursive test pruning, import tracing, runtime change or updater rewrite.
No post-hook finalizer, native caller lifecycle change, unrelated test migration or
incidental documentation cleanup. Old installed builders remain untouched until normal
authorized replacement; no state migration is needed.

## Directory and ownership contract

- Move repository feature `test.js` and `*.test.js` entrypoints to
  `linux-features/<id>/tests/`, preserving filenames. Move test-only fixtures/helpers
  beneath that root, including `ui-tweaks/fixtures/official-font-picker.js`.
- Move the six shared patch tests into `scripts/patches/tests/`, retaining their relative
  structure: `{descriptor,runner}.test.js`, `lib/{asar-layout,minified-js}.test.js`, and
  `core/{quit-confirmation-focus,shell-env-startup}/test.js`.
- Production code/data must remain outside those roots. Preserve feature `feature.json`,
  `README.md`, transitive helpers, JSON, skill Markdown, hooks and runtime resources.
  Do not move production source containing embedded tests merely to exclude it.
- Ownership comes from `--enabled-feature-dirs0`'s existing `relativeDir` value:
  direct feature directories are repository-owned; `local/<directory>` is private.
  Do not use feature IDs, Git metadata or the presence of a `tests` directory.
- Private features retain `tests/`, `test.js` and `fixtures/`. Nested production directories
  named `tests` outside the exact reserved roots also survive.

## Staging behavior

In `scripts/lib/package-common.sh`, keep current component discovery and copying.
After copying an enabled repository feature, omit only its staged root `tests/`.
After copying `scripts/patches`, omit only its staged root `tests/`.
Missing roots succeed, including when regenerating an already-pruned builder.
Operate only within disposable copies; never remove source files or follow a symlink
into another tree. Preserve the updater's existing symlink rejection behavior.

Keep generated `target/` pruning and reaper source/Cargo-file exclusions unchanged.
Native grafting follows pruning, retaining executable bytes, modes, architecture and
missing-artifact errors. Never prune grafted release binaries afterward.
Preserve plugin templates and their existing staging behavior unchanged, including hidden
manifests, resources, layout and `.gitkeep` files. No plugin cleanup belongs in this change.

Keep configuration/provenance staging and the existing sorted regular-file inventory
write after omissions and native grafts. The inventory is not an updater allowlist.
Native hooks keep their current order; later hook-driven inventory drift remains an
existing limitation. Updater-disabled packages still contain no builder.

## Migration targets

| Files | Required change |
| --- | --- |
| `scripts/lib/package-common.sh`, `scripts/lib/package-common.test.js` | Exact staged omissions and behavioral regression coverage |
| `linux-features/<id>/{test.js,*.test.js}`, test-only resources | Move under `tests/`; correct imports, fixture and repository-root paths |
| Six `scripts/patches` tests listed above | Move under shared `tests/`; preserve production discovery layout |
| `scripts/ci/run-node-checks.sh`, `scripts/ci/container-entrypoint.sh`, `tests/scripts_smoke.sh` | Update discovery/exact paths without losing entrypoints |
| `.github/workflows/{ci,upstream-build-app}.yml` | Update existing test commands only; no workflow redesign |
| `AGENTS.md`, `CONTRIBUTING.md`, `linux-features/README.md`, affected feature READMEs | Update test commands, links and authoring convention |
| `docs/linux-features-architecture.md`, `docs/build-and-packaging.md` | Explain reserved roots, local compatibility and unchanged inventory semantics |

Search all additional consumers before relocation. Preserve assertions, fixture bytes and
executable modes except necessary path changes. Explicitly select test entrypoints;
fixtures/helpers must not become tests, and acceptance runners remain opt-in.
No production edits to `linux-features.js`, manifests, native builders, Rust updater or
Nix implementation are expected for this convention.

## Accepted exception: historical acceptance material

Keep `linux-features/directory-only-working-tree-watch/acceptance/` and its existing
staging exclusion unchanged. The operator explicitly agreed: "Agreed, do not move it."
This tree is already absent from packaged builders; moving it provides no further saving.

The feature test verifies acceptance runner/helper bytes against historical signed-runtime
evidence (`test.js:6040-6075` at the implementation base). Moving the runner would require
path changes and invalidate its recorded hash. Preserve the runner, helpers, fixtures,
documentation, evidence and hash assertions; do not rewrite evidence or add archival machinery.
Move only the ordinary feature test into `tests/` and correct its references to the unchanged
production and acceptance files. Acceptance execution remains opt-in and is not authorized.

## Acceptance criteria and focused verification

1. Every relocated entrypoint remains discoverable and passes with unchanged behavioral
   coverage; fixtures and opt-in acceptance runners are excluded from normal execution.
2. Behavioral staging tests cover every repository feature in valid isolated configurations,
   dependencies/internal enablement where required, shared patch omission, absent roots,
   disabled components, exact-root boundaries and source/outside-target non-mutation.
3. Retained production bytes/modes survive, including test-like names, nested resources,
   transitive imports, lazy JSON reads, skill Markdown and hidden plugin metadata.
   Synthetic descriptors/hooks execute only against inert disposable inputs.
4. Local-feature `tests/`, `test.js` and `fixtures/` survive initial staging and generation
   two. Exercise updater-style root copying and re-staging with the copied builder's own
   scripts/configuration, without the checkout. Independently enumerate each inventory.
5. Preserve native artifact bytes/modes and existing missing/disabled-artifact coverage.
   Preserve directory-watch acceptance evidence checks after correcting the moved test's paths.
6. After implementation, run changed-shell syntax checks, package-common/framework tests,
   relocated feature/shared patch tests, scripts smoke and the relevant existing PR suite.
   Do not use local `ci-local.sh all`, which includes prohibited local Nix validation.
7. Inspect final updater-enabled deb/RPM/pacman archives on applicable architectures with
   representative compatible feature profiles, plus updater-disabled output. Record exact
   configurations, omissions, retained resources/modes and architecture. One authorized
   complete rebuild from a packaged builder is needed for an end-to-end update claim.
8. Inspect final AppImage resources and absence of an introduced native builder. Validate
   Nix installed outputs in hosted CI only; Nix source inputs may retain tests. Preserve
   Gentoo's existing no-updater path. Stage-only output or Nix evaluation is insufficient.
9. Preserve runtime behavior, disabled defaults, trust checks, upstream byte-identity and
   updater promotion/state contracts. Verify links, commands, final scope and whitespace;
   report exact unperformed lanes instead of claiming complete validation.

Existing upstream-build CI disables the updater and uses stage-only pacman/AppImage
outputs; a green run cannot establish builder correctness. Use authorized validation,
not speculative workflow changes. Unknown CI failures require stopping and reporting
logs/check URLs, without speculative fixes or reruns.

Never call real usage-reset tools/RPC/HTTP/UI, including expected rejections; use no live
Codex modules, authenticated profiles, sockets or settings. Do not launch/install/restart
the app or install/build Nix locally. Spec approval authorizes no tests, builds or CI dispatch.
The unreproduced `read-aloud-mcp`-alone rebuild gap remains an independent baseline
limitation, not a blocker or approved fix. No savings target or universal rebuild claim
is implied by removing test directories.
