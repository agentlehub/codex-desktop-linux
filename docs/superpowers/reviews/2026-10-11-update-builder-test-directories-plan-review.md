# Update-builder test directories plan review trace

## Review surface

Reviewed: [fresh implementation plan](../plans/2026-10-11-update-builder-test-directories.md), [approved spec](../specs/2026-10-11-update-builder-test-directories-design.md), and targeted repository sources.
Review type: plan.
Reviewer: one independent gpt-6.1-sol/high agent combining contract, execution readiness and verification review.
Saved because: material safety findings and their resolution govern plan readiness.

## Material outcomes

- MAJOR: repository test pruning can traverse a copied feature-directory symlink and delete source/referent data.
  - Disposition: fixed.
  - Evidence pointer: initial plan Task 3; feature discovery uses `fs.statSync` in `scripts/lib/linux-features.js:266-286`, and staging uses `cp -a` before the proposed deletion. The initial regression covers a leaf symlink only.
  - Next action: none. Task 3 now rejects a symlinked repository destination before pruning; Task 2 covers parent-symlink source/referent preservation and includes the case in the red phase.
- MINOR: paired archive-count assertions use AND lists, allowing the first failed assertion to bypass `set -e`.
  - Disposition: fixed.
  - Evidence pointer: initial plan Task 8 archive selection.
  - Next action: none. Task 8 now uses four standalone assertions before archive selection.

## Decisions

- The interrupted draft was archived outside the active approval path during fresh authoring, then discarded at the operator's explicit request after comparison. A fresh Astra/high author completed the current plan and self-check without interruption. Author and reviewer did not receive the interrupted draft.
- Initial reviewer verdict: `BLOCKED`; one major and one minor finding.
- Parent verified both findings against the cited source and shell semantics. Corrections are confined to existing source-preservation and unique-artifact requirements; no broader symlink policy or code changes are authorized.
- The fresh author revised only the plan and completed the self-check. No tests, builds, runtime actions, source edits, staging or commits occurred.

## First review rerun

The same independent reviewer returned `PASS`. Both findings are closed, and no new findings were reported. Static review verified guard placement before pruning, parent-symlink non-mutation coverage/red selection, retained leaf-symlink and private-feature behavior, and standalone archive assertions. Branch/base, tracked/index state and whitespace were checked; runtime tests and physical validation remain unperformed.

## Focused simplicity review

The operator requested a fresh gpt-6-astra/high review focused on overcomplication and overengineering after authorizing two corrections: remove the unsupported Rust-test-coverage claim and use passive AppImage extraction. Both corrections were applied, and the interrupted draft was discarded. The focused reviewer completed without interruption and returned `BLOCKED`: one major and three minor findings. The production design remains proportionate.

- MAJOR: every real-feature case copies all repository feature trees, including ignored native build outputs, and repeatedly snapshots their bytes as hex. Use the existing lightweight feature-staging setup with only the selected feature and required dependencies; exclude generated targets during fixture construction and seed small target markers where needed. Preserve every feature's isolated staging coverage, retained bytes/modes, exact omissions and source non-mutation. Keep full fixtures for full-bundle and generation-two coverage. This correction is within the approved spec.
- MINOR: six native missing-artifact cases repeat full builder staging. Exercise the existing native-artifact staging entrypoint in separate named cases, retaining successful native graft assertions in both full-bundle generations and disabled cases. This correction is within the approved spec; existing tests do not already cover every missing/disabled mapping.
- MINOR: deliberate broken-import migration runs and overlapping final suite commands add no distinct coverage. Move files and repair imports together, keep focused green checks and the meaningful omission/symlink red phase, then use canonical comprehensive runners without redundant standalone subsets on unchanged source. Retain entrypoint-set comparison and discovery proof. This correction is within the approved spec.
- MINOR: the physical-output profile/format cross-product exceeds representative coverage without identifying distinct risks for every cell. Agree on a smaller explicit coverage table before implementation. Preserve supported formats/applicable architectures, retained resource variants, updater-disabled output, hosted Nix installed-output inspection and one packaged-builder rebuild. The concrete replacement matrix requires operator agreement; no current lane has been silently dropped.

The reviewer retained the symlink guard and regressions, private-feature ownership across generation two, independent inventories, native/plugin preservation, unchanged historical acceptance hashes, final review requirements and passive AppImage extraction. Performance costs were identified structurally, not measured. Static review only; no tests, builds, runtime actions or repository source edits were performed by the reviewer. Full report: `/tmp/update-builder-test-directories-simplicity-review.md`.

## Final state

The operator authorized all four focused corrections, including the representative matrix, and reaffirmed no local Nix. The plan now uses selected-feature/dependency fixtures with generated targets excluded, independent missing-native-artifact cases at the existing native staging boundary, focused green migration checks and canonical final runners, and an explicit reduced matrix. Directory-profile outputs cover deb/RPM/pacman/AppImage on both architectures; baseline and alternate profiles use deb, the alternate also uses AppImage, and updater-disabled directory output uses deb. Hosted Nix retains baseline and both maximal watcher variants on both architectures; one packaged-builder rebuild remains. The same focused reviewer returned `PASS_WITH_ISSUES`: all four original findings resolved, with one minor introduced ambiguity. The build loop ended before the separate extraction block, allowing sequential snippet execution to inspect only the last format. The parent corrected this by making build/extraction/evidence explicitly one lane at a time, with no enclosing build loop. Revised Bash snippets passed parse-only verification; links, fences and whitespace also passed. No independent pass after that minor correction is claimed. Correction report: `/tmp/update-builder-test-directories-simplicity-rereview.md`. Spec remains approved; plan remains `in-review`. Implementation, commits and publication remain unauthorized.

## Operator approval and implementation handoff

After the focused corrections and static verification, the operator approved the revised plan, requested committing all six existing task documents, and authorized a Sol/high implementation agent. The plan is now approved. Earlier unauthorized/in-review statements record historical stages. Physical validation resource gates and hosted-only Nix remain unchanged; no publication or subsequent implementation commit is authorized by this handoff.
