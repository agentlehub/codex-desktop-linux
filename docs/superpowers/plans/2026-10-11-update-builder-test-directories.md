# Update-builder test directories implementation plan

**Status:** approved
**Source:** [Approved spec](../specs/2026-10-11-update-builder-test-directories-design.md)
**Review:** [Combined and focused simplicity review trace](../reviews/2026-10-11-update-builder-test-directories-plan-review.md)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove repository-owned feature and shared patch test inputs from native update-builders without changing production inputs, private local-feature copying, or rebuild behavior.

**Architecture:** Move development inputs to the two reserved component roots, then remove those exact roots from disposable staging copies. The existing feature discovery `relativeDir` distinguishes repository features from `local/` features, including in a packaged builder without Git. Existing configuration, native grafting, plugin copying, inventory timing and native package callers remain unchanged.

**Tech stack:** Bash, Node.js built-in test runner and filesystem APIs, existing feature framework, native package tools; hosted Nix validation only.

---

## Prerequisites

- **Satisfied:** the operator approved this revised plan and authorized implementation with “Good. Commit all please and launch sol high to do the implementation”. This includes routine path-scoped moves/staging and source verification. The existing planning documents may be committed before launch; subsequent implementation commits, publication, another PR, app installation/launch/restart and live runtime actions remain unauthorized. Explicit environment/resource gates below remain applicable.
- Work only in `/home/korty/dev/codex-desktop-linux-update-builder-design`, branch `design/update-builder-payload`, implementation base `839dbb50fbd2ad041089981441a82f2460dac455`. Revalidate before edits. Do not change `/home/korty/dev/agentlehub/codex-desktop-linux`, the usage-reset PR, other worktrees or unrelated changes.
- Read `AGENTS.md`, `CONTRIBUTING.md`, the source spec, its [review trace](../reviews/2026-10-11-update-builder-test-directories-review.md), and the supporting [current decisions and contract](../../brainstorming/2026-10-11-154818-update-builder-payload.md). Q1 manifest exclusions and Q2 finalization are superseded. The later acceptance exception and plugin-preservation correction govern.
- Bash, Node.js 20+ (24 matches CI), Git, Python 3, ripgrep, GNU find/sort/timeout, tar and existing test dependencies must be available. No dependency addition is needed. Do not install tools implicitly. Semble was already attempted for this task and failed on the read-only uv cache lock; targeted `rg` and source reads are the established fallback.
- Before executing tests/builds, allocate a unique disk-backed directory beneath `${XDG_CACHE_HOME:-$HOME/.cache}/codex-desktop-dev/`, export `TMPDIR` beneath it, and confirm its filesystem and free space. The operator later authorized short physical `/tmp` for small bounded unit fixtures only, as recorded below; extracted packages, app copies, build targets and bulky validation output remain disk-backed cache. Keep Cargo output in the disposable source copy's `target/` and feature-specific existing target locations. Run large builds serially with `MAX_BUILD_THREADS=2` and `CARGO_BUILD_JOBS=2`, increasing only with measured capacity.
- **[MANUAL] Operator where required:** authorize network/build resources, native `amd64` and `arm64` capacity, and CI dispatch. Signed current stable upstream inputs and native package tools (`dpkg-deb`, `rpmbuild`, `rpm2cpio`, `cpio`, `makepkg`, `bsdtar`, `appimagetool`, `unsquashfs`, `readelf`) must be available in suitable disposable environments. Do not spoof architecture or use fake helpers for physical package validation.
- **[MANUAL] Operator:** provide an authorized hosted Nix output-build lane, or explicitly accept it as unavailable. Existing `ci.yml` Nix runtime/VM checks execute application/runtime probes and must not be dispatched under this task's no-app-launch boundary. Task 8 supplies output-only hosted commands; it does not authorize workflow changes or local Nix installation/builds.
- Never call real usage-reset tools/RPC/HTTP/UI, even to test rejection. Never load live Codex modules or use live profiles/authentication/sockets/settings. Keep optional native/CLI/official-bundle tests disabled in normal unit runs. No acceptance runner execution, evidence regeneration, install, launch or restart.
- Future verification gaps are resource gates, not excuses to claim success. Obtain explicit acceptance of each unavailable architecture/format/profile/hosted lane. An unknown-cause CI failure stops that lane: report logs and check URL, without speculative fixes or reruns.

## Acceptance criteria

| ID | Measurable result | Spec criteria / tasks |
| --- | --- | --- |
| A1 | All 52 repository feature JS entrypoints across 42 features and six shared patch tests move once, retaining filenames and assertions. Two audited test-only resources move. Entrypoint discovery includes every former entrypoint and excludes fixtures, `native-probe.js` and acceptance runners. | 1, 5, 6 / 1, 4, 5, 7 |
| A2 | Staging every repository feature in a valid isolated configuration excludes its exact `tests/`; shared `scripts/patches/tests/` is excluded. Missing roots succeed; disabled components stay absent. | 2 / 2, 3 |
| A3 | Repository root `test.js`, `fixtures/` and nested production `resources/tests/` counterexamples survive. Private `local/<directory>` preserves `tests/`, `test.js`, `fixtures/`, with manifest IDs deliberately different from directory names. A copied repository feature-directory symlink is rejected before pruning; a symlink at the test-root leaf is unlinked successfully. Source trees and symlink referents are unchanged. | 2, 3 / 2, 3 |
| A4 | Actual production bytes/modes and plugin templates, including hidden files and `.gitkeep`, survive. Synthetic descriptors consume transitive code/lazy JSON and a synthetic hook reads retained data; no live modules run. | 3 / 2, 3, 8 |
| A5 | Updater-style copying of the existing required/optional roots, followed by generation-two staging with only copied scripts/config, preserves repository/private ownership. Each inventory independently matches sorted regular files at its existing write point. | 4 / 2, 3 |
| A6 | Existing `target/`, reaper source/Cargo exclusions and directory-watch acceptance exclusion remain unchanged. Native graft bytes and modes, missing-artifact errors, disabled artifacts and updater-disabled behavior pass. Acceptance tree and historical hashes remain unchanged. | 5 / 2, 3, 4, 7 |
| A7 | Changed-shell syntax, package-common/framework tests, relocated tests, smoke and relevant existing PR suite pass with exact logs, or the operator explicitly accepts named unavailable lanes. | 6 / 7, 8 |
| A8 | Inspect final updater-enabled deb/RPM/pacman archives for both applicable architectures using the explicit Task 8 representative matrix; inspect updater-disabled outputs, final AppImage resources and hosted Nix installed outputs. One complete packaged-builder rebuild is inspected before any end-to-end rebuild claim. | 7, 8 / 8 |
| A9 | No manifest/schema/checker/finalizer, production discovery change, native caller rewrite, plugin cleanup, defaults/runtime/trust/updater-state change or unrelated cleanup. Final scope, commands, links and whitespace pass both final reviews. | 9 / 6, 9 |

No aggregate savings target exists. The suspected `read-aloud-mcp`-alone runner gap is an unreproduced baseline limitation, outside this change. Use `read-aloud` with `read-aloud-mcp` in the representative rebuild profile, record that choice, and do not add a dependency or claim the standalone baseline was repaired.

## File structure and ownership

Paths below are relative to the implementation worktree. Assign one owner to package tests/staging, one to all relocations and path consumers, and one to documentation if parallel execution is used. Do not have two workers modify the same file; tell every worker that other edits must be preserved. Task 4 and Task 5 share an integration owner because intermediate tracked discovery would otherwise reference missing files.

### Exact feature relocation map

For each row, move each listed source basename from `linux-features/<directory>/` into `linux-features/<directory>/tests/`. These are the 42 existing repository directories, not a runtime ID allowlist.

| Directory | Basenames |
| --- | --- |
| account-switcher | `test.js`, `native-probe.js` (helper, never a test entrypoint) |
| agent-workspace | `test.js` |
| api-key-model-visibility | `test.js` |
| api-key-service-tier | `test.js` |
| appshots | `test.js` |
| authenticated-proxy | `test.js` |
| authored-message-visibility | `test.js` |
| automation-extensions | `test.js` |
| browser-proxy | `test.js` |
| chronicle-skysight | `test.js` |
| codex-micro | `test.js` |
| community-profile-isolation | `test.js` |
| computer-use-linux | `test.js`, `host-service.test.js`, `native.test.js`, `settings.test.js`, `unified.test.js` |
| copilot-reasoning-effort | `test.js` |
| directory-only-working-tree-watch | `test.js` only; all `acceptance/` stays byte-identical |
| filesystem-root-follow-ups | `test.js` |
| flatpak-chrome-native-messaging | `test.js` |
| frameless-titlebar | `test.js` |
| global-dictation | `test.js` |
| global-dictation-gnome | `test.js` |
| linux-performance-workarounds | `test.js` |
| mcp-helper-reaper | `test.js` |
| model-picker-default-presets | `test.js` |
| nix-store-bundled-marketplace-permissions | `test.js` |
| node-repl-reaper | `test.js` |
| omarchy-theme | `test.js` |
| persistent-status-panel | `test.js` |
| pet-overlay | `test.js` |
| preferred-editor-file-links | `test.js` |
| project-group-last-updated-sort | `test.js` |
| project-task-sort | `test.js` |
| read-aloud | `test.js` |
| read-aloud-mcp | `test.js` |
| record-and-replay | `test.js` |
| remote-control-ui | `test.js` |
| remote-mobile-control | `test.js` |
| shallow-repository-watches | `test.js` |
| shared-app-server-socket | `test.js` |
| start-minimized-to-tray | `test.js` |
| thorium-chrome-plugin | `test.js` |
| tray-usage | `test.js` |
| ui-tweaks | `test.js`, `custom-font-input.test.js`, `dock-icon.test.js`, `gentoo-support.test.js`, `selected-text-more-details.test.js`, `selected-text-more-details-trace.test.js`, `suggested-prompts.test.js` |

Also move `linux-features/ui-tweaks/fixtures/official-font-picker.js` to `linux-features/ui-tweaks/tests/fixtures/official-font-picker.js`. Remove the old empty fixture directory naturally through the move. Keep its bytes unchanged. `account-switcher/native-probe.js` is referenced only by the opt-in test; its bytes stay unchanged, and its environment-provided runtime path continues to point to production `account-switcher/runtime.js`.

### Shared patch relocations

| Old path | New path |
| --- | --- |
| `scripts/patches/descriptor.test.js` | `scripts/patches/tests/descriptor.test.js` |
| `scripts/patches/runner.test.js` | `scripts/patches/tests/runner.test.js` |
| `scripts/patches/lib/asar-layout.test.js` | `scripts/patches/tests/lib/asar-layout.test.js` |
| `scripts/patches/lib/minified-js.test.js` | `scripts/patches/tests/lib/minified-js.test.js` |
| `scripts/patches/core/quit-confirmation-focus/test.js` | `scripts/patches/tests/core/quit-confirmation-focus/test.js` |
| `scripts/patches/core/shell-env-startup/test.js` | `scripts/patches/tests/core/shell-env-startup/test.js` |

Production `patch.js`, `shell-env.js`, `descriptor.js`, `runner.js`, `engine.js`, `lib/`, `impl/` and `core/README.md` remain in their current places. Do not move embedded production tests in Rust/source modules.

### Other edits

- `scripts/lib/package-common.sh`: only the two exact-root omissions in existing stagers.
- `scripts/lib/package-common.test.js`: behavioral staging regressions and test-local fixture helpers. Keep existing tests.
- `scripts/ci/run-node-checks.sh`: tracked relocation discovery only.
- `scripts/ci/github-actions-workflows.test.js`: existing workflow path expectations matching the relocated core and community-profile test commands.
- `scripts/ci/container-entrypoint.sh`, `tests/scripts_smoke.sh`, `.github/workflows/ci.yml`: existing exact paths/globs only.
- `.github/workflows/upstream-build-app.yml`: two community-profile-isolation commands and the required-core-test path derived from descriptor `sourcePath`.
- `AGENTS.md`, `CONTRIBUTING.md`, `linux-features/README.md`, `scripts/patches/core/README.md`, `docs/linux-features-architecture.md`, `docs/build-and-packaging.md`, `docs/agents/validation-playbook.md`, `docs/linux-chronicle-skysight.md`, `docs/record-and-replay-linux.md`: connected commands/convention only.
- Feature `README.md` files for `account-switcher`, `agent-workspace`, `api-key-model-visibility`, `api-key-service-tier`, `appshots`, `authenticated-proxy`, `authored-message-visibility`, `automation-extensions`, `browser-proxy`, `codex-micro`, `community-profile-isolation`, `computer-use-linux`, `copilot-reasoning-effort`, `directory-only-working-tree-watch`, `filesystem-root-follow-ups`, `frameless-titlebar`, `global-dictation`, `global-dictation-gnome`, `linux-performance-workarounds`, `mcp-helper-reaper`, `model-picker-default-presets`, `nix-store-bundled-marketplace-permissions`, `node-repl-reaper`, `omarchy-theme`, `persistent-status-panel`, `pet-overlay`, `preferred-editor-file-links`, `project-group-last-updated-sort`, `project-task-sort`, `read-aloud`, `read-aloud-mcp`, `record-and-replay`, `remote-control-ui`, `remote-mobile-control`, `shallow-repository-watches`, `shared-app-server-socket`, `start-minimized-to-tray`, `thorium-chrome-plugin`, `tray-usage`, `ui-tweaks`, plus `linux-features/browser-proxy/README.zh-CN.md`. `computer-use-linux/README.md` also has a `*.test.js` command; `copilot-reasoning-effort/README.md` has the all-feature glob. Preserve existing environment setup and opt-in warnings.
- No expected production edit to `scripts/lib/linux-features.js`, manifests, plugin trees, native builders, Rust updater, Nix or Gentoo implementation. Discovery, descriptor APIs and source-location metadata already support the contract.

## Review milestones

- **M1: Task 6**, after Tasks 1-5: one combined review, requirements first then code quality, over all incremental implementation changes since the verified base. It checks staging boundary, migration, discovery, test quality and docs together. No operator pause is required after a pass.
- **Final: Task 9**, after verification and package evidence: dedicated spec-compliance review followed by dedicated code-quality review over the entire implementation from the verified base, including staged and unstaged changes. No commit is required to define the review surface.
- Material findings block dependent work. Fix, run affected checks, and repeat the affected review. Fix valid minor findings and run affected checks without an automatic full re-review. If a fix changes approved scope or needs a design decision, stop and obtain the operator's resolution.

## Tasks

### Task 1: Freeze the implementation boundary and relocation inventory

**Files:** read the file map above; write evidence only to the unique scratch directory. No production edits.

- [x] Confirm authorization and source status, then inspect current state:

```bash
cd /home/korty/dev/codex-desktop-linux-update-builder-design
git branch --show-current
git rev-parse HEAD
git status --short
git diff --name-status
git diff --cached --name-status
```

Expected branch/base above. If HEAD changed, audit the delta and reconcile the plan before coding; do not reset it. Record unrelated dirty paths, index entries and hashes. The drafting-time state had untracked `docs/brainstorming/` and `docs/superpowers/`; do not stage either directory wholesale. After allocating scratch, save `git diff --binary` and `git diff --cached --binary` there so original index/worktree state remains recoverable without resetting it.

- [x] Create disk-backed evidence and a sanitized test environment. Run future unit commands in this shell:

```bash
work_cache="${XDG_CACHE_HOME:-$HOME/.cache}/codex-desktop-dev"
mkdir -p "$work_cache"
validation_root="$(mktemp -d "$work_cache/update-builder-tests.XXXXXX")"
mkdir -p "$validation_root/tmp" "$validation_root/logs"
export TMPDIR="$validation_root/tmp"
export MAX_BUILD_THREADS=2 CARGO_BUILD_JOBS=2
unset CODEX_CLI_PATH CODEX_SIGNED_EXTRACTED_APP
unset CODEX_ACCOUNT_SWITCHER_CLI CODEX_ACCOUNT_SWITCHER_OFFICIAL_DIR
unset CODEX_ACCOUNT_SWITCHER_NATIVE_APP CODEX_ACCOUNT_SWITCHER_ASAR_CLI
unset CODEX_ACCOUNT_SWITCHER_PROBE_RUNTIME
unset CODEX_LINUX_FEATURES_ROOT CODEX_LINUX_FEATURES_CONFIG CODEX_INTERNAL_LINUX_FEATURE_IDS
findmnt -T "$validation_root"
df -h "$validation_root"
```

Stop on tmpfs or insufficient capacity. Environment changes are task-shell-only. Record the resulting absolute scratch path in implementation progress notes; no live profile/settings are changed.

- [x] Capture tracked entrypoint paths, fixture/helper hashes, executable modes and acceptance/plugin snapshots before moving. Use `git ls-files -s` and `sha256sum` on the explicit map; retain all acceptance and plugin file hashes, including hidden files. Save the original tracked runner list:

```bash
git ls-files '*.test.js' 'linux-features/*/test.js' > "$validation_root/node-entrypoints.before"
git ls-files -s -- linux-features scripts/patches > "$validation_root/source-modes.before"
rg -n 'test\.js|\.test\.js|native-probe|official-font-picker' \
  AGENTS.md CONTRIBUTING.md .github scripts tests linux-features docs \
  --glob '!docs/brainstorming/**' --glob '!docs/superpowers/**' \
  > "$validation_root/path-consumers.before"
```

Also capture immutable trees and resource bytes before edits:

```bash
find linux-features/directory-only-working-tree-watch/acceptance \
  plugins/openai-bundled/plugins/computer-use plugins/openai-bundled/plugins/read-aloud \
  -type f -print0 | sort -z | xargs -0 sha256sum > "$validation_root/preserved-trees.sha256"
sha256sum linux-features/account-switcher/native-probe.js \
  linux-features/ui-tweaks/fixtures/official-font-picker.js > "$validation_root/moved-resources.sha256"
```

`sha256sum -c "$validation_root/preserved-trees.sha256"` must pass after the migration; compare the two relocated resources' destination hashes to their old hashes. Do not derive the actual move set from unrestricted recursion: the approved map has 52 feature entrypoints, six shared entrypoints, one fixture and one helper. Preserve synthetic source strings whose names merely end in `test.js`.

- [x] Audit actual imports, dynamic `import()`, `__dirname`, fixture copies and embedded subprocess programs in each moved entrypoint. Recheck helper/fixture production consumers with exact `rg`; a newly found production dependency on a proposed test root is a stop condition, not grounds to delete the consumer.

### Task 2: Add behavioral staging regressions before production changes

**Modify/test:** `scripts/lib/package-common.test.js`. Keep its current `runPackageCommon()` and `copyFeatureHelpers()` callers intact. Do not make every old test require a complete builder source.

- [x] Add the following test-local helpers. They use existing stagers through the fixture's own shell file, not a source-text assertion or an alternate implementation. Copies contain no checkout Git metadata or private local source.

```js
function put(root, relative, contents, mode = 0o644) {
  const file = path.join(root, relative);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, contents, { mode });
  fs.chmodSync(file, mode);
}

function treeSnapshot(root) {
  const result = {};
  function visit(dir, prefix = "") {
    for (const name of fs.readdirSync(dir).sort()) {
      const relative = prefix ? `${prefix}/${name}` : name;
      const file = path.join(dir, name);
      const stat = fs.lstatSync(file);
      if (stat.isSymbolicLink()) {
        result[relative] = { link: fs.readlinkSync(file) };
      } else if (stat.isDirectory()) {
        visit(file, relative);
      } else {
        result[relative] = { bytes: fs.readFileSync(file).toString("hex"), mode: stat.mode & 0o777 };
      }
    }
  }
  visit(root);
  return result;
}

function builderFixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "codex-builder-tests-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const source = path.join(root, "source");
  const app = path.join(root, "app");
  fs.mkdirSync(source);
  fs.mkdirSync(app);
  for (const relative of ["install.sh", "launcher", "scripts/lib", "scripts/patches",
    "scripts/build-deb.sh", "scripts/build-rpm.sh", "scripts/build-pacman.sh",
    "scripts/patch-linux-window-ui.js", "packaging/linux", "assets",
    "plugins/openai-bundled/plugins/computer-use", "plugins/openai-bundled/plugins/read-aloud"]) {
    const target = path.join(source, relative);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.cpSync(path.join(repoRoot, relative), target, { recursive: true, verbatimSymlinks: true });
  }
  for (const name of ["features.example.json", "compatibility.json"]) {
    put(source, `linux-features/${name}`, fs.readFileSync(path.join(repoRoot, "linux-features", name)));
  }
  return { root, source, app };
}

function fixtureFeature(source, directory, id, files = {}, extra = {}) {
  const relative = `linux-features/${directory}`;
  put(source, `${relative}/feature.json`, JSON.stringify({ id, defaultEnabled: false, ...extra }));
  put(source, `${relative}/README.md`, `${id}\n`);
  for (const [name, contents] of Object.entries(files)) put(source, `${relative}/${name}`, contents);
}

function stageFixture(source, app, stage, enabled, extraEnv = {}) {
  if (enabled !== null) put(source, "linux-features/features.json", JSON.stringify({ enabled }));
  const env = { ...process.env };
  for (const key of ["CODEX_LINUX_FEATURES_ROOT", "CODEX_LINUX_FEATURES_CONFIG",
    "CODEX_INTERNAL_LINUX_FEATURE_IDS", "GIT_DIR", "GIT_WORK_TREE"]) delete env[key];
  childProcess.execFileSync("bash", ["-c", [
    "set -euo pipefail",
    '. "$REPO_DIR/scripts/lib/package-common.sh"',
    'stage_optional_update_builder_bundle "$STAGE_ROOT"',
  ].join("\n")], {
    cwd: source, encoding: "utf8",
    env: { ...env, REPO_DIR: source, APP_DIR: app, STAGE_ROOT: stage,
      PACKAGE_NAME: "codex-desktop", PACKAGE_WITH_UPDATER: "1", ...extraEnv },
  });
  return path.join(stage, "opt/codex-desktop/update-builder");
}

function assertInventory(builder) {
  const manifest = ".codex-linux/update-builder-manifest.txt";
  const files = Object.entries(treeSnapshot(builder))
    .filter(([relative, entry]) => relative !== manifest && !entry.link)
    .map(([relative]) => relative).sort();
  assert.equal(fs.readFileSync(path.join(builder, manifest), "utf8"), `${files.join("\n")}\n`);
}

function copyUpdaterRoots(source, destination) {
  // updater/src/builder.rs REQUIRED_BUNDLE_ENTRIES and OPTIONAL_BUNDLE_ENTRIES.
  // This fixture checks packaging generation two; it is not a replacement updater.
  const required = ["install.sh", "launcher", "scripts/build-deb.sh", "scripts/build-rpm.sh",
    "scripts/build-pacman.sh", "scripts/patch-linux-window-ui.js", "scripts/lib",
    "scripts/patches", "packaging/linux", "assets", "linux-features"];
  const optional = ["target", "global-dictation-linux", "plugins"];
  for (const relative of [...required, ...optional]) {
    const from = path.join(source, relative);
    if (!fs.existsSync(from) && optional.includes(relative)) continue;
    assert.equal(fs.existsSync(from), true, relative);
    const to = path.join(destination, relative);
    fs.mkdirSync(path.dirname(to), { recursive: true });
    fs.cpSync(from, to, { recursive: true, verbatimSymlinks: true });
  }
}
```

`treeSnapshot()` is a test fixture assertion, not a production classifier. It records regular-file bytes/modes and symlink identities; generation-two inputs below contain no symlinks. Existing updater bundle-copy symlink rejection is verified from source and remains unchanged; neither this copy helper nor the existing Rust tests establish rejection coverage for bundle copying. No Rust changes are required by this plan.

- [x] Add the exact-boundary and source-safety regression. It must fail before the two omission lines exist:

```js
test("update-builder omits only repository component test roots", (t) => {
  const { root, source, app } = builderFixture(t);
  fixtureFeature(source, "repository-directory", "different-repository-id", {
    "tests/test.js": "throw new Error('must not execute');\n",
    "test.js": "production filename\n",
    "fixtures/data.json": "{}\n",
    "resources/tests/data.json": "nested production data\n",
  });
  fixtureFeature(source, "local/private-directory", "different-private-id", {
    "tests/data.json": "private production data\n", "test.js": "private production entry\n",
    "fixtures/data.json": "private fixture-named data\n",
  });
  fixtureFeature(source, "no-test-root", "no-test-root");
  fixtureFeature(source, "disabled", "disabled", { "tests/test.js": "disabled\n" });
  put(source, "scripts/patches/tests/sentinel.txt", "omit shared root\n");
  put(source, "scripts/patches/impl/resources/tests/data.json", "retain nested shared data\n");
  put(source, "linux-features/features.json", JSON.stringify({
    enabled: ["different-repository-id", "different-private-id", "no-test-root"],
  }));
  const before = treeSnapshot(source);
  const builder = stageFixture(source, app, path.join(root, "stage"),
    ["different-repository-id", "different-private-id", "no-test-root"]);
  assert.equal(fs.existsSync(path.join(builder, "linux-features/repository-directory/tests")), false);
  assert.equal(fs.existsSync(path.join(builder, "scripts/patches/tests")), false);
  assert.equal(fs.existsSync(path.join(builder, "linux-features/disabled")), false);
  for (const relative of ["linux-features/repository-directory/test.js",
    "linux-features/repository-directory/fixtures/data.json",
    "linux-features/repository-directory/resources/tests/data.json",
    "linux-features/local/private-directory/tests/data.json",
    "linux-features/local/private-directory/test.js",
    "linux-features/local/private-directory/fixtures/data.json",
    "scripts/patches/impl/resources/tests/data.json"]) {
    assert.deepEqual(treeSnapshot(builder)[relative], before[relative], relative);
  }
  assert.deepEqual(treeSnapshot(source), before);
  assertInventory(builder);
});

test("update-builder rejects copied repository feature-directory symlinks before pruning", (t) => {
  const { root, source, app } = builderFixture(t);
  const outside = path.join(root, "outside-feature");
  put(outside, "feature.json", JSON.stringify({ id: "linked-feature", defaultEnabled: false }));
  put(outside, "README.md", "External disposable feature\n");
  put(outside, "tests/keep.txt", "external test input must survive\n", 0o640);
  fs.chmodSync(outside, 0o750);
  fs.chmodSync(path.join(outside, "tests"), 0o750);
  const sourceLink = path.join(source, "linux-features/linked-directory");
  fs.symlinkSync(outside, sourceLink);
  put(source, "linux-features/features.json", JSON.stringify({ enabled: ["linked-feature"] }));
  const sourceBefore = treeSnapshot(source);
  const outsideBefore = treeSnapshot(outside);
  const linkModeBefore = fs.lstatSync(sourceLink).mode;
  const directoryModesBefore = ["", "tests"].map((relative) =>
    fs.statSync(path.join(outside, relative)).mode & 0o777);
  assert.throws(
    () => stageFixture(source, app, path.join(root, "stage"), ["linked-feature"]),
    /Refusing to prune tests through a repository feature symlink/,
  );
  assert.deepEqual(treeSnapshot(source), sourceBefore);
  assert.deepEqual(treeSnapshot(outside), outsideBefore);
  assert.equal(fs.lstatSync(sourceLink).isSymbolicLink(), true);
  assert.equal(fs.lstatSync(sourceLink).mode, linkModeBefore);
  assert.equal(fs.readlinkSync(sourceLink), outside);
  assert.deepEqual(["", "tests"].map((relative) =>
    fs.statSync(path.join(outside, relative)).mode & 0o777), directoryModesBefore);
});

test("update-builder test-root omission unlinks copied symlinks without touching referents", (t) => {
  const { root, source, app } = builderFixture(t);
  fixtureFeature(source, "linked", "linked");
  const outside = path.join(root, "outside");
  put(outside, "keep.txt", "outside\n");
  fs.symlinkSync(outside, path.join(source, "linux-features/linked/tests"));
  fs.rmSync(path.join(source, "scripts/patches/tests"), { recursive: true, force: true });
  fs.symlinkSync(outside, path.join(source, "scripts/patches/tests"));
  const before = treeSnapshot(outside);
  const builder = stageFixture(source, app, path.join(root, "stage"), ["linked"]);
  for (const relative of ["linux-features/linked/tests", "scripts/patches/tests"]) {
    assert.equal(fs.existsSync(path.join(builder, relative)), false);
    assert.equal(fs.lstatSync(path.join(source, relative)).isSymbolicLink(), true);
  }
  assert.deepEqual(treeSnapshot(outside), before);
});
```

- [x] Add real-feature coverage as a table-driven staging test at the existing feature-tree staging boundary. Enumerate direct repository feature directories only, excluding `local` before reading manifests. Each case copies only its selected feature and explicit dependencies, plus the existing feature helpers and real compatibility/example configuration. Exclude generated `target` directories during fixture copying and seed a tiny marker to exercise existing pruning. Keep disabled-selection assertions in the synthetic boundary case above. Do not copy all features or use the full builder fixture for these cases.

```js
const repositoryFeatures = fs.readdirSync(path.join(repoRoot, "linux-features"), { withFileTypes: true })
  .filter((entry) => entry.isDirectory() && entry.name !== "local" &&
    fs.existsSync(path.join(repoRoot, "linux-features", entry.name, "feature.json")))
  .map((entry) => {
    const dir = path.join(repoRoot, "linux-features", entry.name);
    const manifest = JSON.parse(fs.readFileSync(path.join(dir, "feature.json"), "utf8"));
    return { dir, relativeDir: entry.name, id: manifest.id, manifest };
  }).sort((left, right) => left.id.localeCompare(right.id));
const dependencies = { "record-and-replay": ["chronicle-skysight"],
  "global-dictation-gnome": ["global-dictation"] };

for (const feature of repositoryFeatures) {
  test(`update-builder preserves production inputs for ${feature.id}`, (t) => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "codex-feature-staging-"));
    t.after(() => fs.rmSync(root, { recursive: true, force: true }));
    const source = path.join(root, "source");
    copyFeatureHelpers(repoRoot, source);
    for (const name of ["features.example.json", "compatibility.json"]) {
      put(source, `linux-features/${name}`, fs.readFileSync(path.join(repoRoot, "linux-features", name)));
    }
    const enabled = [feature.id, ...(dependencies[feature.id] || [])];
    const selected = enabled.map((id) => {
      const candidate = repositoryFeatures.find((entry) => entry.id === id);
      assert.ok(candidate, `Missing fixture dependency: ${id}`);
      return candidate;
    });
    for (const candidate of selected) {
      const destination = path.join(source, "linux-features", candidate.relativeDir);
      fs.cpSync(candidate.dir, destination, {
        recursive: true, verbatimSymlinks: true,
        filter: (file) => !(path.basename(file) === "target" && fs.lstatSync(file).isDirectory()),
      });
      put(destination, "tests/staging-sentinel", "omit\n");
      put(destination, "generated/target/staging-sentinel", "omit generated\n");
    }
    put(source, "linux-features/features.json", JSON.stringify({ enabled: [feature.id] }));
    const builder = path.join(root, "tree");
    const before = treeSnapshot(path.join(source, "linux-features"));
    const internal = selected.filter((entry) => entry.manifest.internal).map((entry) => entry.id).join(",");
    // Only tree staging: never graft or execute real native helpers here.
    runPackageCommon(
      `export CODEX_LINUX_FEATURES_ROOT=${JSON.stringify(path.join(source, "linux-features"))}\n` +
      `export CODEX_LINUX_FEATURES_CONFIG=${JSON.stringify(path.join(source, "linux-features/features.json"))}\n` +
      `export CODEX_INTERNAL_LINUX_FEATURE_IDS=${JSON.stringify(internal)}\n` +
      `stage_update_builder_linux_features_tree ${JSON.stringify(builder)}`,
      root, source,
    );
    for (const candidate of selected) {
      const staged = path.join(builder, "linux-features", candidate.relativeDir);
      const original = treeSnapshot(path.join(source, "linux-features", candidate.relativeDir));
      const expected = Object.fromEntries(Object.entries(original).filter(([relative]) => {
        const parts = relative.split("/");
        if (parts[0] === "tests" || parts.includes("target")) return false;
        if (candidate.id === "directory-only-working-tree-watch" && parts[0] === "acceptance") return false;
        if (candidate.id === "mcp-helper-reaper" &&
          (relative.startsWith("reaper/src/") || ["reaper/Cargo.toml", "reaper/Cargo.lock"].includes(relative))) return false;
        return true;
      }));
      assert.deepEqual(treeSnapshot(staged), expected, candidate.id);
      assert.equal(fs.existsSync(path.join(staged, "tests")), false);
      assert.equal(fs.existsSync(path.join(staged, "generated/target")), false);
    }
    assert.deepEqual(treeSnapshot(path.join(source, "linux-features")), before);
  });
}
```

- [x] Add one generation-two integration regression. Reuse the helpers above and the following complete fixture, retaining real native source-exclusion, plugin-copy and inventory behavior without executing the fake helpers:

```js
test("update-builder generation two retains local inputs, consumers, plugins and native grafts", (t) => {
  const { root, source, app } = builderFixture(t);
  const nativeIds = ["computer-use-linux", "global-dictation", "mcp-helper-reaper",
    "read-aloud-mcp", "chronicle-skysight"];
  for (const id of nativeIds) {
    fs.cpSync(path.join(repoRoot, "linux-features", id), path.join(source, "linux-features", id),
      { recursive: true, verbatimSymlinks: true,
        filter: (file) => !(path.basename(file) === "target" && fs.lstatSync(file).isDirectory()) });
    put(source, `linux-features/${id}/tests/sentinel`, "omit\n");
    put(source, `linux-features/${id}/generated/target/debug/cache`, "omit cache\n");
  }
  const nativePaths = [
    ["resources/plugins/openai-bundled/plugins/unified-computer-use/bin/codex-computer-use-linux", "target/release/codex-computer-use-linux"],
    ["resources/plugins/openai-bundled/plugins/unified-computer-use/bin/codex-computer-use-cosmic", "target/release/codex-computer-use-cosmic"],
    ["resources/native/codex-global-dictation-linux", "global-dictation-linux/target/release/codex-global-dictation-linux"],
    [".codex-linux/mcp-helper-reaper/codex-mcp-helper-reaper", "linux-features/mcp-helper-reaper/reaper/target/release/codex-mcp-helper-reaper"],
    ["resources/plugins/openai-bundled/plugins/read-aloud/bin/codex-read-aloud-linux", "target/release/codex-read-aloud-linux"],
    ["resources/native/codex-record-replay-linux", "target/release/codex-record-replay-linux"],
  ];
  for (const [from] of nativePaths) put(app, from, `#!/bin/sh\n# ${from}\nexit 97\n`, 0o755);
  fixtureFeature(source, "owned-directory", "owned-id", {
    "tests/test.js": "throw new Error('not production');\n",
    "patch.js": 'const helper = require("./helper.js"); module.exports = [{id:"owned-fixture",phase:"main-bundle",apply:helper}];\n',
    "helper.js": 'const fs=require("node:fs");const path=require("node:path");module.exports=source=>source+JSON.parse(fs.readFileSync(path.join(__dirname,"labels.json"))).suffix;\n',
    "labels.json": '{"suffix":" retained"}\n',
    "skills/example/SKILL.md": "retained skill\n",
    "hook.sh": '#!/bin/sh\nset -eu\ncat "$(dirname "$0")/skills/example/SKILL.md" > "$INSTALL_DIR/hook-result"\n',
  }, { entrypoints: { patchDescriptors: "./patch.js", stageHook: "./hook.sh" } });
  fs.chmodSync(path.join(source, "linux-features/owned-directory/hook.sh"), 0o755);
  fixtureFeature(source, "local/private-directory", "private-id", {
    "tests/data.json": "private tests data\n", "fixtures/data.json": "private fixtures data\n",
    "test.js": "private production filename\n",
  });
  const enabled = [...nativeIds, "owned-id", "private-id"];
  const first = stageFixture(source, app, path.join(root, "stage-one"), enabled);
  assertInventory(first);
  for (const id of ["computer-use", "read-aloud"]) {
    const relative = `plugins/openai-bundled/plugins/${id}`;
    assert.deepEqual(treeSnapshot(path.join(first, relative)), treeSnapshot(path.join(source, relative)));
  }
  const copied = path.join(root, "updater-copy");
  copyUpdaterRoots(first, copied);
  assert.equal(fs.existsSync(path.join(copied, ".git")), false);
  assert.equal(fs.existsSync(path.join(copied, ".codex-linux")), false);
  // Make the original fixture unavailable before invoking copied scripts/config.
  fs.renameSync(source, path.join(root, "source-unavailable"));
  const copiedConfig = fs.readFileSync(path.join(copied, "linux-features/features.json"));
  assert.deepEqual(new Set(JSON.parse(copiedConfig).enabled), new Set(enabled));
  const second = stageFixture(copied, app, path.join(root, "stage-two"), null);
  assert.deepEqual(fs.readFileSync(path.join(copied, "linux-features/features.json")), copiedConfig);
  for (const builder of [first, second]) {
    assertInventory(builder);
    assert.equal(fs.existsSync(path.join(builder, "scripts/patches/tests")), false);
    for (const directory of [...nativeIds, "owned-directory"]) {
      assert.equal(fs.existsSync(path.join(builder, "linux-features", directory, "tests")), false);
      assert.equal(fs.existsSync(path.join(builder, "linux-features", directory, "generated/target")), false);
    }
    for (const relative of ["reaper/src", "reaper/Cargo.toml", "reaper/Cargo.lock"]) {
      assert.equal(fs.existsSync(path.join(builder, "linux-features/mcp-helper-reaper", relative)), false);
    }
    for (const [from, to] of nativePaths) {
      assert.deepEqual(fs.readFileSync(path.join(builder, to)), fs.readFileSync(path.join(app, from)));
      assert.equal(fs.statSync(path.join(builder, to)).mode & 0o777, 0o755);
    }
    assert.deepEqual(treeSnapshot(path.join(builder, "plugins")), treeSnapshot(path.join(copied, "plugins")));
    const privateFiles = treeSnapshot(path.join(builder, "linux-features/local/private-directory"));
    assert.equal(Buffer.from(privateFiles["tests/data.json"].bytes, "hex").toString(), "private tests data\n");
    assert.equal(Buffer.from(privateFiles["fixtures/data.json"].bytes, "hex").toString(), "private fixtures data\n");
    assert.equal(Buffer.from(privateFiles["test.js"].bytes, "hex").toString(), "private production filename\n");
    const framework = require(path.join(builder, "scripts/lib/linux-features.js"));
    const options = { featuresRoot: path.join(builder, "linux-features"),
      featuresConfigPath: path.join(builder, "linux-features/features.json"), enabledFeatureIds: ["owned-id"] };
    assert.equal(framework.loadLinuxFeaturePatchDescriptors(options)[0].apply("inert"), "inert retained");
    const [hook] = framework.enabledLinuxFeatureStageHooks(options);
    const inertApp = path.join(root, builder === first ? "consumer-one" : "consumer-two");
    fs.mkdirSync(inertApp, { recursive: true });
    childProcess.execFileSync("bash", [hook.path], { env: { ...process.env, INSTALL_DIR: inertApp } });
    assert.equal(fs.readFileSync(path.join(inertApp, "hook-result"), "utf8"), "retained skill\n");
  }
  const withoutUpdater = stageFixture(copied, app, path.join(root, "disabled"), enabled,
    { PACKAGE_WITH_UPDATER: "0" });
  assert.equal(fs.existsSync(withoutUpdater), false);
  const disabledNative = stageFixture(copied, app, path.join(root, "no-native"), ["owned-id", "private-id"]);
  for (const [, to] of nativePaths) assert.equal(fs.existsSync(path.join(disabledNative, to)), false);
  assert.equal(fs.existsSync(path.join(disabledNative, "plugins")), false);
});
```

- [x] Add six separately named missing-native-artifact cases against the existing `stage_enabled_native_feature_artifacts` entrypoint, one for each source/destination mapping in `nativePaths` above. Hoist that mapping and `nativeIds` into shared test constants so successful graft and failure cases use the same fixtures. Each case uses a fresh lightweight temporary source with `copyFeatureHelpers()`, real compatibility/example files, and only the real `feature.json`/`README.md` for those five native IDs. Write `features.json` with those IDs enabled and create the six tiny inert executable source artifacts in its app fixture. Omit exactly the case's source artifact, invoke the native stager via `runPackageCommon()` with explicit fixture feature-root/config and cleared internal enablement, and assert `Missing staged native feature artifact`. Never call `stageFixture()` or copy full feature/plugin trees for this table. Cases run independently of generation-two assertions. Keep successful byte/mode graft checks in both generations and the full updater-disabled and no-native/plugin-disabled cases above.

The first-generation plugin/source comparison includes hidden files and `.gitkeep`; comparing generations only would miss an omission repeated by both. The second call leaves the copied config untouched (`enabled === null`) and verifies its bytes. Ownership does not consult Git in either generation; provenance may still probe Git as before.

- [x] Run red with the original production stager, keeping the failure log:

```bash
node --test --test-name-pattern='update-builder (omits only|rejects copied|test-root omission|preserves production inputs|generation two)' \
  scripts/lib/package-common.test.js > "$validation_root/logs/staging-red.log" 2>&1
```

Expected failures: copied repository/shared `tests/` still exists, and the copied repository feature-directory symlink is not rejected (the new `assert.throws` reports a missing expected exception). The unmodified stager does not perform the new test-root deletion; the directory-symlink regression must also reject any incomplete fix that deletes through that symlink. A parse/import/config/native-fixture error is not the intended red; repair test setup without changing production behavior, then rerun. Existing missing-native tests and disabled paths may already pass, which is acceptable. Do not add count-based or private-helper/source-shape assertions.

### Task 3: Add exact staged omissions and turn the regressions green

**Modify:** `scripts/lib/package-common.sh` only.

- [x] Immediately after `cp -a "$source" "$destination"` in `stage_update_builder_linux_features_tree()`, insert:

```bash
        case "$relative_dir" in
            local/*) ;;
            *)
                [ ! -L "$destination" ] || \
                    error "Refusing to prune tests through a repository feature symlink: $feature_id ($destination)"
                rm -rf -- "$destination/tests"
                ;;
        esac
```

Discovery already emits only direct repository directories or `local/<directory>`; do not infer ownership from `feature_id`, a Git query, a manifest flag or directory existence. It accepts directory symlinks through `fs.statSync`, and `cp -a` preserves them. Consequently, reject a symlink at the copied repository feature destination before the new deletion and before proceeding to the existing exclusion operations. This narrow repository-branch guard protects the deletion's feature-directory ancestor; omitting a trailing slash alone would not. With that ancestor verified, the no-trailing-slash deletion unlinks a symlink at the `tests` leaf without traversing its referent. Keep fresh disposable staging parents and the existing target/acceptance/reaper exclusions in their current order after this block. Leave the `local/*` branch and its existing copying/exclusion behavior unchanged; do not add a discovery change or global validator.

- [x] Immediately after the recursive `scripts/patches` copy in `stage_update_builder_bundle()`, insert:

```bash
    rm -rf -- "$update_builder_root/scripts/patches/tests"
```

Do not introduce a shared deletion API for two literal roots. Keep plugin copies, config/provenance, native graft order and `write_update_builder_manifest()` unchanged. `rm -rf` missing-root success is required for generation two.

- [x] Run focused green and framework regression checks:

```bash
bash -n scripts/lib/package-common.sh
node --test scripts/lib/package-common.test.js scripts/lib/linux-features.test.js \
  > "$validation_root/logs/staging-green.log" 2>&1
```

Expected: all assertions pass, including all isolated features, retained plugin bytes/modes, rejection of repository feature-directory symlinks with source/external bytes, modes and link unchanged, successful test-leaf-symlink omission, native missing/disabled cases and generation two. Tests are not proof of physical package architecture; Task 8 supplies that evidence.

### Task 4: Move tests and repair only relocation-sensitive paths

**Files:** exact relocation map; ordinary test code only. No acceptance or production resource changes.

- [x] Move the 52 feature entrypoints and six shared entrypoints with path-scoped `git mv`; create destination parent directories first. Move the UI fixture and account-switcher helper too. Do not move `linux-features/local/`, production files, shared test files outside `scripts/patches/`, or acceptance material.
```bash
for file in linux-features/*/test.js linux-features/*/*.test.js; do
  feature_dir="${file%/*}"
  mkdir -p "$feature_dir/tests"
  git mv -- "$file" "$feature_dir/tests/${file##*/}"
done
for relative in descriptor.test.js runner.test.js lib/asar-layout.test.js \
  lib/minified-js.test.js core/quit-confirmation-focus/test.js core/shell-env-startup/test.js; do
  destination="scripts/patches/tests/$relative"
  mkdir -p "${destination%/*}"
  git mv -- "scripts/patches/$relative" "$destination"
done
mkdir -p linux-features/ui-tweaks/tests/fixtures
git mv -- linux-features/ui-tweaks/fixtures/official-font-picker.js \
  linux-features/ui-tweaks/tests/fixtures/official-font-picker.js
git mv -- linux-features/account-switcher/native-probe.js \
  linux-features/account-switcher/tests/native-probe.js
```

- [x] Perform each mechanical move and its path repairs together, then run the focused green command below. Do not run a deliberately broken intermediate import state; Task 2 retains the meaningful omission/symlink red phase.
- [x] Repair feature paths according to their semantic base. Apply these exact transformations to actual module imports/path expressions, not arbitrary strings. Use a local `featureDir`/`FEATURE_DIR` where already present; otherwise direct `path.resolve(__dirname, "..")` is enough. Do not add a shared path abstraction.

```js
// Feature test imports, including require calls inside callbacks:
require("./patch.js")                       // before
require("../patch.js")                      // after
require("../../scripts/lib/linux-features.js")
require("../../../scripts/lib/linux-features.js")
import("./native-client.mjs")
import("../native-client.mjs")
require("../chronicle-skysight/patch.js")
require("../../chronicle-skysight/patch.js")

// Feature, all-features, and repository roots respectively:
const featureDir = path.resolve(__dirname, "..");
const featuresRoot = path.resolve(__dirname, "../..");
const repoRoot = path.resolve(__dirname, "../../..");
// The UI fixture and moved helper remain test-relative:
const fixture = fs.readFileSync(path.join(__dirname, "fixtures/official-font-picker.js"), "utf8");
const probe = path.join(__dirname, "native-probe.js");
// Sibling test imports remain unchanged:
require("./suggested-prompts.test.js");
require("./selected-text-more-details-trace.test.js");
```

All current `__dirname` uses pointing to production `feature.json`, hooks, `patches/`, scripts, native adapters and resource trees must gain the feature-parent segment. Retain `__dirname` when reading the moved `test.js`, moved fixture/helper or sibling test. `record-and-replay/tests/test.js`'s self-file assertion stays `path.join(__dirname, "test.js")`, while its whole-feature copy becomes `fs.cpSync(path.resolve(__dirname, ".."), ...)`. Whole sibling-feature copies gain one parent segment.

Specific traps:

- `shared-app-server-socket` VM adapters compare the simulated module request `id === "./socket-path.js"`; keep that request string and change only the real `require("../socket-path.js")` on the right.
- Embedded fixture `__dirname`, synthetic `runtime-test.js` imports and minified bundle strings describe the application under test, not the moved test. Preserve their bytes unless an actual host path is interpolated into a subprocess program.
- `computer-use-linux/{native,host-service}.test.js` uses dynamic imports and path-built imports; repair both. Keep all fake service connections; do not substitute real native services.
- `account-switcher/tests/test.js` still copies `tests/native-probe.js`, and the opt-in runtime override fallback becomes `path.join(__dirname, "../runtime.js")`. Never enable the probe.
- Directory-watch test uses `path.join(__dirname, "../acceptance")`, `path.resolve(__dirname, "../../..")`, and `../watchbound-artifacts.json`. Preserve all historical path keys, hash literals and assertions at old lines 6040-6075. All acceptance files remain unchanged.

- [x] Repair shared patch test imports with these exact destination-relative mappings:

| New test | Required module paths |
| --- | --- |
| `scripts/patches/tests/descriptor.test.js` | `../../lib/patch-report.js`, `../descriptor.js`, `../engine.js` |
| `scripts/patches/tests/runner.test.js` | `../../lib/linux-target-context.js`, `../../lib/patch-report.js`, `../runner.js`; empty config resolves `../../../linux-features/features.example.json` |
| `scripts/patches/tests/lib/asar-layout.test.js` | `../../lib/asar-layout.js` |
| `scripts/patches/tests/lib/minified-js.test.js` | `../../lib/minified-js.js` |
| `scripts/patches/tests/core/quit-confirmation-focus/test.js` | `../../../core/quit-confirmation-focus/patch.js` |
| `scripts/patches/tests/core/shell-env-startup/test.js` | `../../../core/shell-env-startup/shell-env.js` |

For example, the moved runner's configuration path is:

```js
const emptyConfig = path.resolve(__dirname, "../../../linux-features/features.example.json");
```

- [x] Run all moved entrypoints explicitly; fixture/helper are absent from the arguments:

```bash
node --test linux-features/*/tests/test.js linux-features/*/tests/*.test.js \
  scripts/patches/tests/*.test.js scripts/patches/tests/lib/*.test.js \
  scripts/patches/tests/core/*/test.js > "$validation_root/logs/relocated-green.log" 2>&1
```

Expected green with pre-existing optional integrations skipped. UI test imports already cause some subtests to run through both aggregate and direct entrypoints; preserve that behavior rather than folding unrelated deduplication into the migration. Recheck acceptance/helper/fixture hashes and executable modes against Task 1.

### Task 5: Update discovery, exact consumers and connected documentation

**Files:** the other-edits map above; same migration owner as Task 4.

- [x] Update the tracked discovery selector in `scripts/ci/run-node-checks.sh`. Preserve `git ls-files` semantics and the existing global `*.test.js` behavior. Add exact reserved-root patterns for `test.js`:

```bash
    done < <(git ls-files '*.test.js' \
        ':(glob)linux-features/*/tests/test.js' \
        ':(glob)scripts/patches/tests/core/*/test.js')
```

Do not switch to `find`, include untracked files, recurse over private inputs, invoke `node --test` on a directory, or select every `.js` under tests. Existing syntax discovery remains `git ls-files '*.js'`. New/moved tracked paths must be in the index before this runner is used; future implementation authorization covers narrow staging, not a commit.

- [x] Update command operands while preserving each command's existing coverage:

```text
linux-features/*/test.js                 -> linux-features/*/tests/test.js
scripts/patches/descriptor.test.js       -> scripts/patches/tests/descriptor.test.js
scripts/patches/runner.test.js           -> scripts/patches/tests/runner.test.js
scripts/patches/lib/asar-layout.test.js   -> scripts/patches/tests/lib/asar-layout.test.js
scripts/patches/core/*/test.js            -> scripts/patches/tests/core/*/test.js
linux-features/community-profile-isolation/test.js
                                        -> linux-features/community-profile-isolation/tests/test.js
```

Apply in `tests/scripts_smoke.sh`, `scripts/ci/container-entrypoint.sh`, `.github/workflows/ci.yml` and the two exact community-profile-isolation commands in `.github/workflows/upstream-build-app.yml`. Preserve all unrelated workflow steps, matrix, environment, permissions and timeout settings.

- [x] Repair the required-core-test derivation in `.github/workflows/upstream-build-app.yml`, retaining descriptor-driven selection and the existing missing-test failure:

```js
const patchRoot = path.resolve("scripts/patches");
const tests = corePatchDescriptors()
  .filter(({ ciPolicy }) => ciPolicy === "required-upstream")
  .map(({ sourcePath }) => path.join(
    patchRoot, "tests", path.relative(patchRoot, path.dirname(sourcePath)), "test.js",
  ));
```

The current descriptor `sourcePath` is the production `scripts/patches/core/<id>/patch.js`; this maps to the preserved relative test structure. Do not change production `corePatchDescriptors()` or patch discovery to accommodate test placement.

- [x] Update each connected README/document command by inserting `/tests/` after the repository feature directory. For `computer-use-linux/README.md`, update both `test.js` and `*.test.js`. Keep private authoring examples (`linux-features/local/my-feature/test.js`) unchanged. Keep historical design/review records, acceptance files and evidence immutable. Do not bulk-rewrite all prose `test.js` tokens.
- [x] Add this convention to `linux-features/README.md`'s module layout/testing sections, and concise matching packaging paragraphs in `docs/linux-features-architecture.md` and `docs/build-and-packaging.md`:

```text
Repository feature test entrypoints belong in tests/test.js or tests/*.test.js;
put their test-only helpers and fixtures beneath the same tests/ root. Production
code and resources must remain outside that root. Native update-builder staging
omits only linux-features/<repository-directory>/tests/ and scripts/patches/tests/.
Private linux-features/local/<directory>/ contents keep their existing copying
rules, including tests/, fixtures/ and test.js. Nested production directories
named tests are not globally excluded. The existing directory-watch acceptance
exclusion is unchanged.

The sorted regular-file inventory is written after staging omissions and native
helper grafts. It records that staging result; it is not an updater allowlist and
is not refreshed after package hooks. Plugin templates, including hidden metadata
and .gitkeep files, retain their existing staging behavior.
```

Use the normal all-feature command `node --test linux-features/*/tests/test.js` wherever that command already existed. The focused full relocation verification above explicitly includes supplemental entrypoints; do not silently expand existing lightweight commands to execute acceptance/helpers.

- [x] Compare old and new discovery before running it. Transform only the moved source paths in `node-entrypoints.before` to their destination paths and compare with the new `git ls-files` selector. Stage only this task's exact newly moved paths/test changes if required; inspect `git diff --cached --name-status` immediately afterward. If the original index contained unrelated edits, retain them and exclude them from review/commit claims. Account explicitly for the two core `test.js` files, previously invoked by CI/smoke but omitted by this runner; they now belong in the reserved-root selector. The ten `*.test.js` feature entrypoints remain covered by the unchanged global selector. No fixture/helper/acceptance entry may appear.
- [x] Search active consumers again using Task 1's command, inspect every old-path hit, run `git diff --check`, and read the changed Markdown links relative to their actual file locations. No production path or test fixture byte change is permitted as a shortcut for a failed import.

### Task 6: Review milestone M1

**Covers:** Tasks 1-5; incremental surface from the verified implementation base, including renames, index and working tree.

- [x] Confirm red/green evidence, exact relocation coverage, acceptance/helper/fixture hash preservation and tracked discovery comparison.
- [x] Dispatch one combined reviewer under the operator's current routing policy: requirements first, then code quality. Include the approved spec and current contract, not superseded Q1/Q2 recommendations. Ask the reviewer to trace every staging caller and compare the two literal omissions against a proposed shared helper; keep the simpler literal operations unless concrete evidence requires more.
- [x] Fix material findings, rerun affected checks, and repeat this milestone review. Fix minor findings and verify them without unnecessary full repeats. Stop for new scope/design decisions. Continue directly after a pass; do not ask for routine re-approval.

### Task 7: Run final source-level verification

**Files:** no new implementation changes unless a diagnosed failure requires an in-scope correction.

- [x] Revalidate the sanitized Task 1 environment and run the exact commands in `Verification` below. Keep logs and exit statuses, including skips. `run-node-checks.sh` requires moved/new entrypoints narrowly staged; never sweep unrelated untracked docs/private files into the index.
- [x] Run the standard PR suite in a disposable **source copy**, not the shared worktree with existing `codex-app/` or `dist/`: it recreates generated output. `./scripts/ci-local.sh pr` is the existing entrypoint and covers core/deb/rpm/pacman; `all` additionally invokes prohibited local Nix and upstream runtime diagnostics, so never use `all` here.
- [x] Resource gate for the existing PR runner: `scripts/ci-local.sh` does not forward host `TMPDIR` into its containers, and `container-entrypoint.sh` has `/tmp` paths. Do not assume a host export fixes this. Run this suite only on an authorized environment satisfying the scratch boundary, or report the lane unavailable for explicit acceptance. Do not modify this runner's lifecycle or invent a wrapper/tool solely to bypass the gate. The direct source checks plus Task 8 native builds remain independently executable.
- [x] Diagnose any failure from exact output and compare the relevant baseline in a disposable copy if necessary; never weaken assertions, edit acceptance hashes, or fix unrelated code. A changed-path error is in scope. The unreproduced standalone read-aloud gap is not.

### Task 8: Validate physical outputs and one packaged-builder rebuild

**Files:** generated artifacts and evidence only, beneath disk-backed scratch or authorized hosted storage. No source/workflow changes. This is future execution, not a claim that these lanes are available now.

- [ ] Prepare a disposable copy of the final source snapshot, including all narrowly staged new files and excluding private local inputs/unrelated work. Record the source commit plus binary diff and input hashes so an uncommitted implementation is reproducible. Build each architecture natively on its approved machine/container; record `uname -m`, package tool versions and input package metadata. Do not build from or mutate the primary checkout.
- [x] Use two representative profiles plus baseline and no-updater variants. Write these exact JSON files under the disposable validation source's `linux-features/`; use environment-selected config files, not the user's feature configuration:

```json
{"enabled":[]}
```

```json
{"enabled":["automation-extensions","start-minimized-to-tray","agent-workspace","ui-tweaks","computer-use-linux","global-dictation","mcp-helper-reaper","read-aloud","read-aloud-mcp","chronicle-skysight","record-and-replay","directory-only-working-tree-watch","packaging-local-fixture"]}
```

```json
{"enabled":["shallow-repository-watches","global-dictation-gnome"]}
```

Name them `validation-empty.json`, `validation-directory.json`, `validation-shallow.json`. The second selects both read-aloud components to avoid making claims about the known standalone gap; the third covers the conflicting watcher separately and exercises the GNOME dependency. Validate configurations with the existing `--enabled` command before builds. Do not add account/profile conflicting selections.

Create only in that disposable source `linux-features/local/packaging-local-fixture/{feature.json,README.md,tests/data.json,fixtures/data.json,test.js}` with disabled manifest ID `packaging-local-fixture`, inert marker contents, and no hooks/descriptors. This is a private-copy compatibility marker, never executed.

- [ ] Obtain the latest signed stable package using the existing verifier CLI into retained scratch. Do not rely on `install.sh`'s temporary download surviving its cleanup. From each architecture's disposable source:

```bash
case "$(uname -m)" in
  x86_64) validation_arch=amd64 ;;
  aarch64|arm64) validation_arch=arm64 ;;
  *) exit 1 ;;
esac
mkdir -p "$validation_root/upstream"
verified_upstream_deb="$(node scripts/lib/upstream-linux-package.js \
  --output-dir "$validation_root/upstream" \
  --metadata "$validation_root/upstream/metadata.json" \
  --key-base64 assets/openai-codex-linux-repository-key.gpg.base64 \
  --arch "$validation_arch" \
  --repository https://persistent.oaistatic.com/codex-app-prod/linux/deb)"
sha256sum "$verified_upstream_deb"
dpkg-deb -f "$verified_upstream_deb" Package Version Architecture
```

Retain signed metadata, verifier output and package hash; compare subsequent explicit inputs to that record. Structural local-package validation is not the trust root. `CODEX_INSTALL_DIR` must point to a fresh scratch location. Do not run an installed updater or `start.sh`.

Use this explicit representative matrix on **both amd64 and arm64**. Each row detects a distinct risk; do not expand it into every profile-format combination.

| Profile | Final outputs | Updater | Distinct coverage |
| --- | --- | --- | --- |
| `directory` | deb, RPM, pacman | Enabled | Each native packaging path with broad production/native/plugin resources and private-copy markers |
| `empty` | deb | Enabled | Empty selection and shared patch omission; conditional clean-ASAR contract |
| `shallow` | deb | Enabled | Incompatible alternate watcher and GNOME dependency selection |
| `directory` | deb | Disabled | Complete native packaging without the updater/builder |
| `directory` | AppImage | No introduced updater/builder | Separate AppImage copy/permission path with broad resources |
| `shallow` | AppImage | No introduced updater/builder | Alternate watcher/GNOME resources through the separate AppImage path |

Hosted Nix has its separate three-profile table below. One packaged-builder rebuild is additional, on one supported native architecture. A matrix cell intentionally not selected is not an unavailable lane; report a gap only when a selected cell cannot run. Additional cells require a named distinct risk, not a blanket cross-product.

For each selected profile on each native architecture, prepare the app once from the disposable source. Set `validation_profile` to `directory`, `empty` or `shallow`, then run:

```bash
export CODEX_LINUX_FEATURES_CONFIG="$PWD/linux-features/validation-$validation_profile.json"
export CODEX_INSTALL_DIR="$validation_root/app-$validation_profile"
export MAX_BUILD_THREADS=2 CARGO_BUILD_JOBS=2
unset PACMAN_STAGE_ONLY APPIMAGE_STAGE_ONLY UPSTREAM_DEB
make build-native-feature-helpers
CODEX_INSTALL_TRANSACTION_ACTIVE=1 ./install.sh "$verified_upstream_deb"
export APP_DIR_OVERRIDE="$CODEX_INSTALL_DIR"
```

Build the updater once per architecture with `cargo build --release -p codex-update-manager --jobs 2` and set `UPDATER_BINARY_SOURCE` to that disposable source's `target/release/codex-update-manager`. Execute **one format lane at a time**: set `format` and `validation_updater`, run the block below, then immediately run its extraction and evidence checks before changing either variable. For the directory native row, repeat that sequence separately with `format=deb`, `format=rpm` and `format=pacman`, each with `validation_updater=1`. Empty/shallow native rows use `format=deb` / `1`; directory no-updater uses `format=deb` / `0`; each AppImage row uses `format=appimage` / `0`. The AppImage flag does not add updater support; inspection must confirm absence of an introduced builder.

```bash
export PACKAGE_NAME=codex-desktop PACKAGE_WITH_UPDATER="$validation_updater"
export PACKAGE_VERSION=2026.10.11.000000+testdirectories
lane_root="$validation_root/$validation_profile-$format-updater-$validation_updater"
export DIST_DIR_OVERRIDE="$lane_root/packages"
export PKG_ROOT_OVERRIDE="$lane_root/package-root"
export APPIMAGE_APPDIR_OVERRIDE="$lane_root/appimage.AppDir"
mkdir -p "$DIST_DIR_OVERRIDE"
"./scripts/build-$format.sh"
```

Use an architecture-specific `validation_root`. Each row must select the matching profile config and `APP_DIR_OVERRIDE` snapshot; the no-updater directory row reuses the directory app without repeating helper/app preparation. Tools/environment unsupported in a selected cell are named unavailable lanes, not architecture overrides. Unset `PACMAN_STAGE_ONLY` and `APPIMAGE_STAGE_ONLY` for physical outputs.

These commands build helpers and extract/patch packages; they do not authorize native runtime probes or app launch. Use the existing transaction-active inner build path for every disposable app preparation, avoiding the default candidate promotion/acceptance wrapper. Feature drift must fail closed. Do not add a new baseline compatibility patch to make validation green.

- [ ] Inspect **final archives**, not only staging roots. Resolve each actual artifact path from its dedicated output directory, require exactly one matching artifact per format, then extract data only:

```bash
extract_root="$(mktemp -d "$lane_root/extracted.XXXXXX")"
case "$format" in
  deb)
    mapfile -t artifacts < <(find "$DIST_DIR_OVERRIDE" -maxdepth 1 -type f -name '*.deb')
    [ "${#artifacts[@]}" = 1 ]
    artifact="${artifacts[0]}"
    dpkg-deb -f "$artifact" Package Version Architecture
    dpkg-deb --fsys-tarfile "$artifact" | tar -tf - > "$lane_root/files.txt"
    dpkg-deb -x "$artifact" "$extract_root"
    ;;
  rpm)
    mapfile -t artifacts < <(find "$DIST_DIR_OVERRIDE" -maxdepth 1 -type f -name '*.rpm')
    [ "${#artifacts[@]}" = 1 ]
    artifact="${artifacts[0]}"
    rpm -qp --qf '%{NAME} %{VERSION}-%{RELEASE} %{ARCH}\n' "$artifact"
    rpm2cpio "$artifact" | (cd "$extract_root" && cpio -idm --no-absolute-filenames)
    ;;
  pacman)
    mapfile -t artifacts < <(find "$DIST_DIR_OVERRIDE" -maxdepth 1 -type f -name '*.pkg.tar.zst')
    [ "${#artifacts[@]}" = 1 ]
    artifact="${artifacts[0]}"
    bsdtar -xOf "$artifact" .PKGINFO
    bsdtar -xf "$artifact" -C "$extract_root"
    ;;
  appimage)
    mapfile -t artifacts < <(find "$DIST_DIR_OVERRIDE" -maxdepth 1 -type f -name '*.AppImage')
    [ "${#artifacts[@]}" = 1 ]
    artifact="${artifacts[0]}"
    # Locate and validate embedded SquashFS without executing the artifact.
    appimage_offset=""
    while IFS=: read -r candidate_offset _; do
        if unsquashfs -s -o "$candidate_offset" "$artifact" >/dev/null 2>&1; then
            appimage_offset="$candidate_offset"
            break
        fi
    done < <(LC_ALL=C grep -aob hsqs "$artifact")
    [ -n "$appimage_offset" ] || { printf 'No valid AppImage SquashFS offset found\n' >&2; exit 1; }
    printf '%s\n' "$appimage_offset" > "$lane_root/appimage-offset.txt"
    unsquashfs -o "$appimage_offset" -d "$extract_root/AppDir" "$artifact"
    ;;
  *) printf 'Unknown validation format: %s\n' "$format" >&2; exit 1 ;;
esac
```

Run the build/extraction snippets in `set -euo pipefail` mode. Each selected lane executes only its format branch, with a standalone exactly-one-artifact assertion before selection. All paths must be absolute and beneath its dedicated scratch lane; extraction destinations start empty. Never extract control/maintainer scripts for execution. AppImage inspection reads data only; do not execute the AppImage, `AppRun`, `ChatGPT` or `start.sh`.

For each extracted **updater-enabled** native package, set `inspected_builder` to its absolute `opt/codex-desktop/update-builder` path and independently enumerate the regular files:

```bash
(cd "$inspected_builder" && find . -mindepth 1 -type f \
  ! -path './.codex-linux/update-builder-manifest.txt' -printf '%P\n' | LC_ALL=C sort) \
  > "$validation_root/logs/inspected-builder-files.txt"
cmp "$validation_root/logs/inspected-builder-files.txt" \
  "$inspected_builder/.codex-linux/update-builder-manifest.txt"
```

Save the comparison result under a format/profile/architecture-specific evidence name before inspecting the next artifact. Inspect exact root omissions/private markers. Compare every retained enabled feature production file, shared patch file, plugin hidden/marker file and graft against its expected staged source using hashes/modes. Account only for the existing exclusions and native graft additions. Do not remove arbitrary nested `tests/`. Record `.codex-linux` config/provenance, `readelf -h` machine values for ChatGPT and all grafted real ELF helpers, executable modes, output package architecture and updater inclusion.

Extract the verified upstream data payload into a separate scratch directory with `dpkg-deb -x`; compare native/AppImage `ChatGPT` and `resources/codex` bytes against `usr/lib/chatgpt/ChatGPT` and `usr/lib/chatgpt/resources/codex`, without executing them. For the no-feature profile, require `resources/app.asar` byte identity only when the patch report confirms no required core patch; this base has a required core descriptor, so retain and inspect its report rather than assert a false unconditional clean-ASAR invariant. Enabled feature reports must contain no unaccepted failure/drift. Nix's existing ELF relocation behavior is a separate installed-output contract, not native upstream-byte identity.

For the no-updater packages and AppImages, assert no introduced `opt/codex-desktop/update-builder`, and compare installed feature/plugin/app resources and modes against the corresponding app snapshot. Do not demand tests be absent from Nix source derivations. Preserve existing hook order; a later hook-created inventory difference is reported as the existing limitation, not fixed with a new finalizer.

- [x] Complete one rebuild from an extracted updater-enabled directory-profile builder on a supported native architecture. Use the existing updater root list from Task 2, exclude `.codex-linux` as the updater does, and copy only those roots into a fresh scratch `rebuild/builder`. Use the packaged updater executable from `usr/bin/codex-update-manager` as `UPDATER_BINARY_SOURCE`; do not execute it. Require the original checkout/disposable source to be inaccessible to this subprocess, use the copied config, and match the verified upstream `.deb` hash before rebuilding:

```bash
cd "$rebuild_builder"
unset CODEX_LINUX_FEATURES_ROOT CODEX_LINUX_FEATURES_CONFIG
CODEX_INSTALL_TRANSACTION_ACTIVE=1 CODEX_INSTALL_DIR="$rebuild_app" \
  CODEX_PATCH_REPORT_JSON="$validation_root/rebuild/patch-report.json" \
  ./install.sh "$verified_upstream_deb"
PACKAGE_WITH_UPDATER=1 APP_DIR_OVERRIDE="$rebuild_app" \
  DIST_DIR_OVERRIDE="$validation_root/rebuild/packages" \
  PKG_ROOT_OVERRIDE="$validation_root/rebuild/deb-root" \
  UPDATER_BINARY_SOURCE="$packaged_updater" \
  UPDATER_SERVICE_SOURCE="$rebuild_builder/packaging/linux/codex-update-manager.service" \
  ./scripts/build-deb.sh
```

Use `build-rpm.sh` or `build-pacman.sh` instead when that is the approved native lane; preserve the same environment contract. Inspect this final rebuilt archive with the same checks, including its second-generation builder, copied local markers, resources, modes, architecture and inventory. Do not claim updater promotion/rollback was exercised; no updater state action occurs.

- [ ] **[MANUAL] Authorized hosted lane only:** on `x86_64-linux` and `aarch64-linux`, build final Nix package outputs from the implementation revision, without running runtime/VM checks. Use this representative hosted matrix on both architectures: baseline for default/disabled behavior, maximal-directory-watch for broad resources, and maximal-shallow-watch for the incompatible watcher variant. Computer-use resources are included in the maximal profiles; no additional computer-use-only build is required. In the hosted checkout, record these output paths and inspect their installed resources:

```bash
nix build .#codex-desktop --no-link --print-out-paths
nix build .#codex-desktop-maximal-directory-watch --no-link --print-out-paths
nix build .#codex-desktop-maximal-shallow-watch --no-link --print-out-paths
```

Inspect each returned store path's `opt/codex-desktop` tree, installed hooks/resources/plugins, symlink targets, modes and ELF architecture. Use the installed-output assertions in `flake.nix`'s `mkRuntimeCheck` as a read-only checklist, excluding every execution/probe assertion. A successful evaluation, a source derivation retaining tests, or an uninspected build is insufficient. No Nix source changes or local fallback. If no suitable hosted lane is available without a new workflow, report that exact gap for acceptance; do not dispatch the broader existing runtime jobs.

- [x] Preserve Gentoo's current no-updater path. The unchanged `scripts/gentoo-native.test.js`, `scripts/gentoo-install.test.js`, `scripts/lib/gentoo-feature-support.test.js` and moved `ui-tweaks/tests/gentoo-support.test.js` cover connected feature/resource parsing. Record if host Portage parsing is skipped. Do not imply this is a performed Gentoo installation/package-runtime validation.
- [x] Produce an evidence table with architecture, profile JSON/hash, signed upstream version/hash, format, artifact hash/path, inspected builder/resources/modes, stage inventory comparison, rebuilt output result and exact unavailable/skipped lane. Retain small logs/metadata; delete only this task's bulky disposable outputs after evidence is saved and no rebuild still references them. Never broad-clean caches.

### Task 9: Final whole-implementation review and delivery

**Covers:** complete implementation from the verified base through the current working tree/index, plus verification evidence.

- [x] Dispatch a dedicated spec-compliance reviewer first. Require A1-A9 mapping, accepted exception and plugin preservation, no added permanent classifier/policy API, exact ownership behavior across both generations, no test loss and accurate package-validation limitations. Resolve material findings and re-review until passed.
- [x] Dispatch a separate code-quality reviewer after compliance passes. Trace API callers, fixture setup/isolation, new regression value, path semantics, staging safety and maintenance cost. Challenge unnecessary test helpers/duplication and compare any suggested alternative concretely. Resolve material findings and re-review; run affected checks after every fix. Minor-only corrections need relevant checks but no automatic whole-review repeat.
- [x] Reinspect final status/index, `git diff --check` and exact boundary against Task 1. Confirm acceptance/plugin source bytes and unrelated work unchanged. Do not commit, push, publish or modify the other PR.
- [x] Report implementation result, exact test/package evidence and any accepted unavailable lanes. If unaccepted required validation remains, report incomplete validation rather than completion. Keep the plan checklist and a concise durable implementation report current; preserve logs outside the repository unless the operator requests checked-in evidence.

## Verification

All commands below are **future execution commands**, not verification performed during drafting. Use Task 1's disk-backed `TMPDIR` for Cargo/build output and cleared opt-in environment. Small bounded unit fixtures use a short physical `/tmp` directory under the operator's recorded exception, with exact cleanup afterward. Do not run acceptance/native/real-CLI integrations.

```bash
bash -n scripts/lib/package-common.sh scripts/ci/run-node-checks.sh \
  scripts/ci/container-entrypoint.sh tests/scripts_smoke.sh
bash scripts/ci/run-node-checks.sh all
bash tests/scripts_smoke.sh
python3 scripts/feature-picker.test.py
cargo test -p codex-update-manager --jobs 2
cargo clippy -p codex-update-manager --all-targets --jobs 2 -- -D warnings
git diff --check
git diff --cached --check
```

The corrected tracked Node runner is the canonical comprehensive Node execution, including the relocated feature/shared entrypoints. Retain the Task 5 entrypoint-set comparison and proof that both core `test.js` entries are discovered. Earlier focused green checks are feedback during edits; do not repeat their standalone commands on the same final revision. Keep the required smoke/PR suite and separate shell/Python/Rust checks; do not redesign their existing internal overlap.

`run-node-checks.sh all` means Node syntax/tests only and is allowed after authorization. `scripts/ci-local.sh all` is a different command and remains prohibited. The standard PR command is `./scripts/ci-local.sh pr`, gated as Task 7 explains; it does not establish updater-enabled correctness because its package job sets `PACKAGE_WITH_UPDATER=0`. Existing upstream-build CI also uses updater-disabled and stage-only pacman/AppImage paths; green checks there are not substitutes for Task 8.

Expected evidence: zero relevant failures, all relocated entrypoints represented, optional integrations explicitly skipped, no acceptance runner execution, source/fixture hash preservation, exact staged omissions and private retention, native error/disabled coverage, independent inventories and inspected final archives. Command exit statuses and artifact paths belong in the report. Do not rerun passing suites absent a new edit, failure or unresolved concern.

## Stop conditions and recovery

- Stop dependent work on a material source/spec contradiction, production consumer of a moved test input, unexpected dirty overlap, invalid configuration, unavailable required capacity, unexpected live-service access, signed-source failure, architecture mismatch or new runtime behavior requirement.
- Preserve evidence on a failure. For an unknown CI failure, provide its URL/log and stop that lane. Do not redesign workflows, install Nix, rerun speculatively or repair unrelated baseline defects.
- Do not reset/clean the shared worktree. Reverse only this task's exact moves/edits if explicitly requested and safe against the recorded snapshot. Do not erase untracked planning files or private feature contents. Existing installed builders and updater state are untouched; no migration/rollback machinery is added.
- Scope checkpoints and reviews are not repeated permission gates for routine path corrections. A materially different design or risk needs operator resolution. Commits/publication remain separate authorization boundaries.

## Author self-check

Completed by the author before marking this draft `in-review`:

- Source spec is approved; its linked review has no unresolved blocker/major outcome. Current decisions, the acceptance exception and plugin-preservation correction are represented without reopening superseded proposals.
- A1-A9 map every spec acceptance criterion to implementation and verification tasks. Nine sequential tasks include an intermediate combined review and the final two-stage whole-implementation review.
- Static comparison against the checkout confirmed all 42 feature directories and all 52 feature entrypoints, the six shared tests, the UI fixture and the account-switcher test-only helper. Existing shared import paths, feature framework APIs, updater root list, package environment variables, verifier CLI and installed updater path were checked against source.
- Lightweight checks passed for the complete relocation map/source-path existence, all three relative document links, balanced code fences, sequential task numbering, absence of trailing whitespace and unresolved placeholder markers. `git diff --no-index --check /dev/null <this-plan>` emitted no whitespace diagnostics; its difference exit status reflects this new untracked file.
- Reviewed test fixtures statically for intended red/green failures, isolated configurations/dependencies/internal enablement, hidden plugin comparison, unchanged copied configuration and generation-two use of its own scripts. Independent review subsequently identified the missing feature-directory-symlink guard: Task 2 now covers rejection before pruning and preservation of source/external bytes, file/directory modes and link, alongside the unchanged leaf-symlink success case; Task 3 now contains the narrow repository-only guard in the required order. The red selector includes the new regression. These snippets have not been executed.
- Applied the independent review's archive-selection correction: Task 8 now has four standalone exactly-one-artifact assertions, so no earlier count failure is exempted by an AND list under `set -e`. Rechecked document structure, links, whitespace and the revised guard/test/error-name correspondence statically. At author return the independent rerun was pending. It subsequently passed with no findings, as recorded in the linked review trace. The plan remains `in-review` pending operator approval.
- No tests, builds, native probes, runtime scripts, app actions, tool installation, local Nix or CI dispatch were performed. No source, acceptance, plugin or other document was modified, and nothing was staged or committed.
- No material spec contradiction or missing design decision remains. Execution prerequisites remain unverified: implementation authority, native tools/capacity on both architectures, signed inputs, the standard PR runner's scratch-compatible environment, an authorized hosted output-only Nix lane, and AppImage extraction capability. Required unavailable lanes need explicit operator acceptance as described above.

## Operator-authorized simplicity corrections

The operator authorized these plan edits after the focused Astra/high review: bounded selected-feature/dependency fixtures, independent native missing-artifact cases at the existing staging boundary, removal of deliberate migration breakage/redundant standalone verification, and the explicit representative physical-output matrix in Task 8. Local Nix installation/build/validation remains prohibited; Nix installed-output checks are hosted only. The production scope and approved spec are unchanged. These are planning edits, not implementation or execution approval. The focused findings are addressed in the text; no independent re-review result is claimed.

## Implementation authorization

The operator approved the revised plan and authorized Sol/high implementation after the simplicity corrections. The parent will first commit the six existing planning/review documents. Historical drafting/review statements above describe their earlier state; implementation authority is now satisfied. No local Nix, runtime access, publication or waiver of unavailable validation is authorized. Use the planning commit as the clean execution starting point and retain `839dbb50fbd2ad041089981441a82f2460dac455` as the original source baseline.

## Execution environment clarification

The operator subsequently authorized `/tmp` for small bounded temporary unit-test
fixtures, cleaned afterward. Use a short physical per-run root to avoid the
existing service socket pathname limit; do not use a symlink alias. Builds, Cargo
targets, extracted apps/packages and logs remain disk-backed in the allocated
cache. Verified Docker container `/tmp` is btrfs-backed overlay with no host
`/tmp` bind or tmpfs; the existing cached-image PR suite satisfies the physical
scratch boundary. These bounded corrections supersede historical blanket wording
only for those test/container environments.

## Verification disposition during execution

Task 7 commands were executed, with unresolved baseline failures recorded in the
implementation evidence report. A checked execution step is not a passing A7
claim. The parent authorized independent available amd64 physical validation;
missing-module and container fixture repairs remain outside scope and unaccepted.

Task 8 executed every available authorized amd64 native lane and one complete
packaged-builder rebuild: six final archives passed inspection; RPM failed its
byte-preservation checks because unchanged native RPM post-processing stripped
payloads. All inventories matched. The diagnosed isolated-rebuild npm cache
correction/retry preserved source masks and produced the passing final rebuild.
The signed input and small evidence remain; exact owned bulky roots were removed.
Source preparations and signed inputs for arm64, both amd64 AppImages, all eight
selected arm64 cells, and the six hosted output-only Nix cells remain unperformed.
The unchecked broad Task 8 steps are partial, not forgotten. No failed or
unavailable required lane has been accepted; A7/A8 and whole-plan validation
remain incomplete. See the implementation evidence report for exact outcomes.

Final dedicated implementation-source compliance and code-quality reviews passed
with no material or minor findings. A1-A6 and source scope under A9 pass; the
completed review/delivery steps do not waive the remaining A7/A8 gates. No
implementation commit or publication was made.

## Fork PR authorization

After implementation and final source reviews, the operator authorized committing
and publishing this change as a PR in `agentlehub/codex-desktop-linux`, targeting
a separate branch that exactly copies upstream `main`. The fork main branch and
existing usage-reset PR must remain untouched. This supersedes earlier commit/PR
restrictions for this change only; it does not accept the recorded validation gaps.
