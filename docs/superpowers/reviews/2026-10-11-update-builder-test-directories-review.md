# Update-builder test directories review trace

## Review surface

Reviewed: [spec](../specs/2026-10-11-update-builder-test-directories-design.md) and its [supporting design](../../brainstorming/2026-10-11-154818-update-builder-payload.md).
Review type: spec.
Reviewer: one operator-authorized gpt-6-astra agent with high reasoning, combining contract, feasibility and workflow review.
Saved because: the result and resolved scope correction inform spec approval and later implementation.

## Material outcomes

- MINOR: supporting design permitted optional removal of `scripts/patches/core/README.md`, beyond the spec's bounded omissions.
  - Disposition: fixed.
  - Evidence pointer: supporting design, "Additional inspected candidates"; now explicitly preserves that README and defers unrelated cleanup.
  - Next action: none.

## Decisions

- Reviewer verdict: `PASS_WITH_ISSUES`, with no blocker or major findings.
- Parent accepted and corrected the sole minor finding. No further reviewer pass was run for this minor-only correction.
- Static review confirmed existing relative source locations support repository/private ownership across updater copying, native graft/inventory order fits the proposal, and the acceptance-directory exception preserves historical evidence checks.
- No tests, builds, CI dispatch or runtime actions were performed; implementation and package behavior remain unverified.

## Subsequent operator-approved scope correction

The parent's scope audit identified four proposed plugin `.gitkeep` omissions as unrelated to test-directory exclusion. The operator explicitly requested their removal and approved the resulting spec. The spec and supporting design now preserve plugin templates and existing staging unchanged. This narrows scope; no additional reviewer pass was run. Implementation-plan drafting with Astra/high is authorized.

## Final state

Review complete; the sole reviewer finding is fixed, and the later operator-approved scope correction is applied. Spec is `approved`. Planning is authorized; implementation, commits and publication remain unauthorized.
