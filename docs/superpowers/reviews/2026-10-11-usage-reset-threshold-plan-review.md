# Usage-reset threshold plan review trace

## Review surface

Reviewed: [implementation plan](../plans/2026-10-11-usage-reset-threshold.md).

Review type: combined plan readiness, 2026-10-11.

Reviewer: a fresh GPT-6 Astra/high agent, separate from the Astra/high plan writer,
explicitly requested by the operator. Combines Plan Contract and Decision-Closure,
Plan Execution Readiness and Optimization, and Plan TDD and Verification Readiness.

Saved because: the findings and no-real-reset audit constrain future execution.

## Material outcomes

Initial verdict: BLOCKED. Reviewed plan SHA-256:
`525adffa7a58ed6a29acea6b39a0e9ef49b1f6bbe3f007358e663b6c76fd609b`.

- MAJOR: unconditional pristine-ASAR comparison rejects valid required core patches.
  - Disposition: fixed and independently verified on corrective rerun.
  - Evidence: initial plan A7 and Task 8; `install.sh:101-113`; approved spec's
    conditional no-enabled-feature/no-core-patch invariant.
  - Resolution: A7 and Task 8 now require a core-only baseline, a zero-effect
    disabled-feature proof, and the exact planned enabled-feature delta.
- MAJOR: Task 3's rollback tests cannot reach writes while preflight is incomplete.
  - Disposition: fixed and independently verified on corrective rerun.
  - Evidence: initial plan Tasks 3, 7 and milestone M1.
  - Resolution: early zero-write tests remain; integrated write/rollback cases
    follow complete positive preflight and cover partial failing-file restoration.
- MINOR: prerequisites omit required build/test tools.
  - Disposition: fixed and independently verified on corrective rerun.
  - Evidence: initial prerequisites versus install helpers and package-common tests.
  - Resolution: lane prerequisites include curl, sha256sum, flock, tar, make,
    gpgv and the supplied ASAR executable. Delivery uses vetted `/usr/bin/gh`.

## No-real-reset audit

The operator explicitly required checking that the plan does not use any real
resets. Reviewer verdict for this requirement: PASS for the prescribed workflow.
No real reset request or consumption is required by any acceptance item.

The reviewer inspected direct commands and their transitive validation paths:
bounded extracted snippets with inert dependencies, fake config/auth/usage/consume
clients without a live fallback, deferred UI fakes, static feature audits,
installer build steps and existing test imports. The generated launcher is not
run. No authenticated profile, live Codex socket, reset RPC/HTTP/tool/UI action,
or successful live redemption is needed. Public package acquisition and static
build tooling do not imply account access or redemption.

This verdict applies to the prescribed plan and inspected current framework.
Implementation must preserve the fake-only bindings, and future upstream drift
still needs revalidation. The review does not certify code not yet written.

The corrective rerun also audited delivery-triggered CI. Existing Nix VM CI can
launch the app in a disposable unauthenticated VM/home; it does not use the
operator's profile/socket or perform reset UI/RPC/HTTP actions. Remote CI is not
all static, but its inspected paths request and consume no real resets.

## Decisions

- All three findings are accepted routine execution corrections. The approved
  product design and 1-99 input contract are unchanged.
- The existing spec already contains the correct conditional ASAR invariant;
  no spec repair is needed.
- Parent requested plan-writer corrections, followed by one corrective rerun of
  the same independent review. No implementation is authorized.
- Review verification was static: 16 embedded code blocks parsed and 13 source
  excerpts matched evidence. No future tests/builds, reset requests, live app
  execution, settings changes, or Git mutation were performed by the reviewer.

## Corrective rerun and final delivery constraints

Final verdict: PASS, no findings. Same independent GPT-6 Astra/high reviewer.
Reviewed plan SHA-256:
`2c9fd345b568b3a69ac5f49209286ad646d8802150647fd3e1b9470aec021476`.
Subsequent parent edits only record review status and link this trace.

All six final-plan checklist items passed: complete prerequisites, measurable
acceptance, numbered actionable tasks, decision closure, safety/security/
performance, and self-contained coding-agent instructions.

- Verified exact `kortylokai` API identity and PR author, never `kamilbeda`;
  API writes and HTTPS pushes share the task-selected credential, without
  global account switching, credential output or fallback. Wrong identity or
  wrong-author reuse blocks dependent writes for operator resolution.
- Verified fork-only draft delivery with the create-only pinned upstream base,
  preserved main, official template headings, omitted contributor reminder and
  comments, honest Astra/xhigh exception, and exact PR attachment/postconditions.
- The active inherited contributor-limit workflow can close this or unrelated
  PRs. The operator explicitly accepted that risk and chose no disabling or
  fork count gate. Report actual state; no automatic reopen or automation edits.
- Nix is CI-only, with no local installation or build. Manifest discovery feeds
  both maximal profiles on x86_64 and ARM64 (`nix/linux-features.nix:3-23`,
  `flake.nix:632-651`, `.github/workflows/ci.yml:71-100`). Report actual CI state;
  unavailable/pending/skipped is not passing. Feature behavior uses inert tests.
- Any unknown-cause CI failure pauses implementation for operator direction.
  Only bounded read-only evidence capture is allowed, with no speculative fix,
  rerun loop, workflow edit or scope expansion.

Final verification: full plan/source review, targeted framework/native/package/
workflow/Nix checks, 28 inert syntax checks, installed GitHub CLI help checks,
and clean whitespace. No implementation tests/builds, live app execution,
account/config changes, Git mutations, PR creation or reset actions were run by
the reviewer. The original source-excerpt/hash evidence remains applicable.

## Final state

Independent review passed; no unresolved findings. The operator subsequently
approved the plan and authorized Astra/high implementation on 2026-10-11, after
the fresh safety audit below. Approval/status edits do not change its technical
steps or no-real-reset constraints.

## Fresh independent no-real-reset audit

On 2026-10-11 the operator requested an additional fresh Astra/high audit solely
to double-check that execution of this plan invokes no real reset. A new
`gpt-6-astra`/`high` reviewer independently traced the plan and current source
without relying on earlier verdicts. Verdict: PASS, no blocking findings.

Exact plan SHA-256, unchanged before/after this audit:
`d53af6465be6fd0601594bd8b81bee241f1af8fdccc6f5ae3deb964b92c58f0a`.

The reviewer checked direct and transitive test/fixture, installer, all-feature
audit, package staging, Git delivery, inherited CI and recovery paths. No
prescribed step invokes a real reset or reaches the operator's authenticated
Codex account. Expected-to-fail calls are prohibited as well as consumption.

- Plan lines 263, 368-399, 414-450 require bounded declarations, explicit inert
  dependencies and in-memory transport with no live fallback. These obligations
  must be verified against the actual implementation before tests run.
- `install.sh:38-83,114-139` builds/promotes only to the plan's disposable target
  and never runs its generated launcher. The all-feature audit requires repo
  patchers, not extracted app modules. Its Watchbound package acquisition uses
  `npm pack --ignore-scripts`; that audit is not universally network-free.
- Local support/staging tests use synthetic artifacts. Current checkout has no
  configured `core.hooksPath` or active non-sample Git hooks. GitHub credentials
  are used only for GitHub/Git delivery, not Codex authentication.
- Inherited Nix CI is not wholly inert: `flake.nix:1086-1119,1255-1306` launches
  the default app in a fresh unauthenticated VM/home. No account injection,
  operator profile mount or reset call exists in the inspected path. Maximal
  feature-enabled profiles use packaging/helper checks; launcher `--diagnose`
  returns before app execution (`launcher/start.sh.template:369-372`).
- Unknown CI failures still require pause/report, with no reset diagnostic or
  speculative fix. No inspected recovery path introduces a real reset.

Limitations: this certifies the prescribed plan against current static evidence,
not absent implementation or future upstream/CI changes. A Node VM is not a
general security sandbox; safety depends on bounded reviewed snippets and inert
bindings. No claim is made that all inherited unrelated helpers were formally
verified. Recheck changed execution paths before running them.

The reviewer performed static reads only. No tests, builds, app launches,
authentication/configuration changes, repository mutations or reset calls were
performed. Full working report: `/tmp/usage-reset-fresh-safety-review.md`;
this section preserves its material findings and limitations durably.
