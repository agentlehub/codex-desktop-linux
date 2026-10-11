# Update-builder test directories implementation evidence

Status: source implementation and declared reviews complete; required validation incomplete.

Execution checkout: `/home/korty/dev/codex-desktop-linux-update-builder-design`, branch
`design/update-builder-payload`. Planning commit:
`afcb0f8c70b2e7737b56bd1d3e009c92403e94ca`; original source baseline:
`839dbb50fbd2ad041089981441a82f2460dac455`.

The operator authorized implementation and subsequently requested a PR in
`agentlehub/codex-desktop-linux`, targeting a separate exact copy of upstream main.
Implementation commit and publication to that fork are now authorized. Installation,
app launch and restart remain unauthorized. The primary checkout and usage-reset PR
remain outside scope.

## Evidence and prerequisites

Disk-backed scratch and logs:
`/home/korty/.cache/codex-desktop-dev/update-builder-tests.DBHW6m`.
The filesystem is btrfs with approximately 303 GiB available at allocation.
Node is v24.19.0. Bash, Git, Python 3, ripgrep, tar, timeout and the required
basic tools are available. Initial index/worktree were clean; their binary patches,
tracked runner list, tracked modes, path consumers, immutable acceptance/plugin hashes
and moved helper/fixture hashes were captured there before editing.

Build/extraction scratch and logs use the allocated cache; small bounded unit
fixtures use the operator-approved short physical `/tmp` root. Tests use two
build workers and cleared feature/CLI/native integration overrides.
Real runtime, acceptance, usage-reset,
profile/authentication/socket/settings and local Nix actions are prohibited.

## Progress

- Prerequisites and approved source boundary audited. Historical drafting restrictions
  are superseded only by the plan's implementation authorization.
- Source search confirms the proposed helper and fixture have test-only consumers.
- Tasks 2-3 complete: the original production stager produced 46 intended red
  assertion failures; the exact omission/guard change passed 100/100 staging and
  framework tests. Logs: `logs/staging-red.log` and `logs/staging-green.log`.
  Shell syntax and whitespace passed. Existing tests/helper callers are preserved.
- Tasks 4-5 complete: exactly 60 moves and connected consumers/docs updated.
  Discovery is the original 75 entries transformed by exact moves plus two core
  tests (77 total); ten supplemental feature tests remain covered. All 297
  tracked modes and acceptance/plugin/helper/fixture hashes match.
- M1 passed: source requirements and quality pass, no outstanding findings.
  One minor evidence wording contradiction was corrected; whitespace passed.
  Canonical checks then caught three missed escaped workflow-test path
  expectations; these were corrected in the connected workflow test and passed
  8/8 affected tests. M1 performed a focused material re-review and restored PASS.
  Detailed review: scratch `milestone-review.md`. Physical outcomes are recorded below; final
  reviews passed as recorded below.

## Required validation gates

Final dedicated source-compliance review passed with no material or minor findings.
It independently confirmed all 60 moves, 77-entry discovery, 297 modes, protected
hashes and production/test identity with the physical snapshot. Detailed review:
`final-compliance-review.md` in the evidence cache. Dedicated code-quality review
also passed with no findings (`final-quality-review.md`). It traced callers,
symlinks, generation two, inventories, isolation and regression value, and
recommended retaining the two literal omissions rather than adding indirection.
Overall A7/A8 acceptance remains incomplete.

The operator authorized available native amd64 signed-input builds and one
packaged-builder rebuild. Their outcomes are recorded below.
Existing CI defines native arm64 runners, but usable capacity and dispatch authority
are unestablished. No suitable authorized hosted output-only Nix lane is established.
The PR suite is available with cached exact Docker
images and verified btrfs-backed overlay storage. AppImage tools
`appimagetool` and `unsquashfs` are unavailable on this host. No unavailable lane has
been accepted; available physical outcomes are recorded below.

The parent requested precise CI/tool/capacity evidence and explicit disposition.
The unavailable lanes remain outstanding; no required gap has been accepted.

## Source-test environment limitation

The first relocation suite had 1,297 tests: 1,278 passed, four failed and 15
optional integrations skipped. Three failures are the pre-existing service socket
pathname limit with long TMPDIR; one fake launcher assertion inherits Wayland
mode. Clearing task-shell display variables is allowed. Even the bare prescribed
cache root produces 109- and 108-byte launcher sockets, exceeding the service
limit of 100 bytes (`host-service.mjs:67`). A short symlink avoids socket length
but causes canonical-path namespace assertions elsewhere, so it is not suitable.
The parent requested an operator decision for short physical test-only scratch;
no test assertions or production code were changed to accommodate the host.
The operator approved small bounded physical `/tmp` unit fixtures. The same
relocated suite passed: exit 0, 1,297 tests, 1,282 passed, zero failures and
15 optional integrations skipped (`logs/relocated-green.log`). Tests used
`/tmp/u.QvMQYo` with Wayland display variables cleared; leftovers measured
80 KiB after the relocation suite (240 KiB after final source checks). The exact
unit directory and failed short symlink alias were removed after checks finished.
No code/assertions changed; failure logs remain outside the repo.

## Final source verification

The final canonical Node runner completed with 1,560 tests: 1,543 passed, one
failed and 16 optional integrations skipped (`logs/node-final.log`). The only
failure is `scripts/workspace-root-open-targets-patch.test.js` importing absent
`patches/core/all-linux/extracted-app/workspace-root-open-targets/patch.js`.
The original source baseline was archived into disposable scratch and reproduced
the identical `MODULE_NOT_FOUND` before test definitions. Evidence:
`source-checks/baseline-diagnosis.md`, baseline test blob
`922824fadd7da28ab8e52aa837e77c48c81d874a`. No unrelated repair is authorized.

Changed-shell syntax, host smoke (99 passed, two skipped), Python (18 tests),
Rust updater tests (118), clippy and both whitespace checks passed. Exact commands,
statuses, source-copy provenance and logs are in
`source-checks/source-verification-report.md`; its initial Node results were
superseded only by the corrected final canonical run above.

The existing cached-image PR suite stopped at Ubuntu core smoke: four existing
`tests/deb-prerm.test.js:135` fixtures fail because `/run/user` is absent in the
container. No deb/RPM/pacman job was reached and the lane was not rerun or fixed.
The host smoke passed. Log: `source-checks/logs/pr.log`. Neither baseline failure
has been accepted; A7 is not fully satisfied and source verification is not green.

Finished disposable Cargo, PR and baseline source copies were removed after
confirming no active process references. Their logs, source manifests, binary
patches and statuses remain; exact cleanup identities are in
`source-checks/cleanup.json`.

## Physical validation outcome

The pinned-key verifier fetched signed `chatgpt` 26.1007.21434 amd64,
497,075,610 bytes, SHA-256
`276b5341c3d74b261d3ad52106f7fa7edde06841e4767fe2a40cb54099b1f3ed`.
Control fields and hash match retained verifier metadata in `upstream/metadata.json`.
All builds used disk-cache scratch, two workers and disposable tracked source.

| amd64 final archive | Inspection |
| --- | --- |
| Directory deb, updater enabled | PASS |
| Directory RPM, updater enabled | FAIL: payload stripping |
| Directory pacman, updater enabled | PASS |
| Empty deb, updater enabled | PASS |
| Shallow deb, updater enabled | PASS |
| Directory deb, updater disabled | PASS: no updater/builder |
| Directory deb rebuilt from packaged builder | PASS |

Every updater-enabled inventory matches independently enumerated regular files.
Passing lanes preserve app, production/shared/plugin inputs, private markers,
native grafts, modes and required architecture. The empty profile applies its
one required core descriptor, so the conditional clean-ASAR exception applies.

RPM's existing post-processing changed 39 distinct files: 32 app/runtime files,
six builder native grafts and the updater. Read-only ELF inspection confirms
ChatGPT's `.comment` section was removed. Inventory and modes otherwise passed.
The RPM source is unchanged by this implementation. No fix or rerun occurred;
this required lane is failed and unaccepted.

The packaged-builder rebuild copied only the updater's permitted roots, with
`.codex-linux` excluded. Bubblewrap made both source checkouts unreadable to UID
1000 during the real build. Final generation-two private markers, native grafts,
updater bytes and inventory passed; ASAR, ChatGPT and `resources/codex` hashes
match generation one. No updater execution, promotion or rollback was exercised.
The first attempt stopped before packaging because npm's default cache was on
the read-only host. The parent authorized the diagnosed environment correction
and retry with npm cache in owned writable scratch; both source masks remained.
The original failure evidence is retained. Existing source-info version loss
(0.11.1 to null) from permitted-root copying is recorded without a source fix.

The initial deb inspector wrongly required every upstream ELF to be amd64.
Nine optional upstream ARM prebuilds match the signed input exactly. The inspector
was corrected to check ChatGPT, updater and introduced helpers, then reinspected
the same archive successfully. No package rerun or source workaround occurred.

Before preparation, the worker corrected the plan's missing existing
`CODEX_INSTALL_TRANSACTION_ACTIVE=1` flag, avoiding the default promotion and
acceptance wrapper. No forbidden action occurred. A final core README wording
correction identifies `scripts/patches/tests/core/` instead of "adjacent" tests.
The parent approved that documentation-only delta from the physical snapshot;
production code/tests match and no package rerun was needed for prose.

Full evidence: `physical-amd64/physical-validation-report.md`,
`physical-amd64/physical-evidence-table.json`, per-lane logs/hash/mode/ELF records,
source snapshot/diff and integrity records. Task-owned bulky physical copies
and archives are removed after evidence preservation and reference checks;
cleanup identities remain in `physical-amd64/cleanup-evidence.json`.

Exact unperformed required lanes, none accepted:

- amd64 directory and shallow final AppImages: `appimagetool` and `unsquashfs`
  unavailable locally.
- arm64 directory deb/RPM/pacman with updater; empty and shallow deb with updater;
  directory deb without updater; directory and shallow AppImages. Existing CI
  defines native arm64 runners, but usable capacity/dispatch is unestablished.
- Hosted output-only Nix baseline, maximal-directory-watch and maximal-shallow-watch
  on both x86_64-linux and aarch64-linux: suitable authorized lane unestablished;
  existing runtime/VM workflows are outside the no-runtime boundary.

Connected Gentoo assertions passed; host Portage parsing skipped because Portage
is not installed. No Gentoo installation or package-runtime validation is claimed.
A7 and A8 are incomplete. At verification completion, no implementation commit,
push or publication had occurred; the later fork-PR authorization does not waive
these validation gaps.

Final status/index, whitespace and protected-tree hash evidence is retained in
`final-status.txt`, `final-scope.txt`, `logs/final-boundary-checks.log` and
`final-source-integrity.json` under the evidence cache. Production/test inputs
match the physical snapshot; only the approved plan/core README documentation
differs, with the new implementation report outside that tracked snapshot.
