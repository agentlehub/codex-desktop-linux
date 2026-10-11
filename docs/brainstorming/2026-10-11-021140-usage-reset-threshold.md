---
status: approved
---

# Brainstorming: Configurable agent usage-reset threshold

## Context

The operator requested a feasibility investigation of an optional community Linux
feature that allows agent-requested usage resets above the stock 10% remaining
threshold, preferably with a user-selected percentage in Settings.

Scope is analysis only. No implementation, installation, application restart,
setting changes, reset requests, or reset-credit consumption is authorized.
Do not invoke a reset endpoint even to test a rejection or with an invalid key.

Checkout: `/home/korty/dev/agentlehub/codex-desktop-linux`, branch
`feat/usage-reset`, commit `839dbb50fbd2ad041089981441a82f2460dac455`.
The fork's `main` remains at `7d4c437daf23b6525be1da9ea1e72aa12b9791aa`.
The existing untracked external-app-server brainstorming document is unrelated.

Installed package provenance reports official version `26.1007.21434`, built
from community source `839dbb50`, with `computer-use-linux`,
`shared-app-server-socket`, and `appshots` enabled. Source:
`/opt/codex-desktop/.codex-linux/build-info.json`.

## Current decisions

- Operator-authorized: investigate feasibility without consuming any reset.
- Operator approved the product proposal and toggle interaction on 2026-10-11;
  see the Q&A below. Implementation is not authorized by that approval.
- Percentages in this investigation mean remaining quota, not consumed quota.
- Feasibility investigation is complete. The operator subsequently requested a
  commit of this proposal and an Astra/high agent to create the specification.
  This source is approved for that specification work; a separate brainstorming
  review was not performed. The detailed spec subsequently passed an independent
  Astra/high review and was approved for commit and planning on 2026-10-11.
  Implementation remains unauthorized.
- Existing reset permission off: all agent resets remain blocked, regardless of
  the saved custom threshold or custom-mode toggle.
- Existing reset permission on, custom mode off: stock 10% remaining limit.
- Both toggles on: use the configured remaining-percentage limit.
- While the master permission is off, visually disable the custom controls but
  retain their saved values. Neither toggle triggers a reset automatically.
- Operator resolved the input contract during specification: whole percentages
  from 1 through 99 inclusive, default 10. Save on Enter or blur; invalid values
  remain unsaved; Escape restores the saved value. See Q3.

## Initial evidence

- `docs/linux-features-architecture.md:3-23` provides a disabled-by-default
  feature boundary and build/update configuration.
- `docs/linux-features-architecture.md:112-123` supports main-process and renderer
  patch descriptors.
- `linux-features/agent-workspace/patch.js:837-879` demonstrates renderer access to
  persistent global settings through existing `get-global-state` and
  `set-global-state` messages.
- Official documentation for
  [earned rate-limit resets](https://learn.chatgpt.com/docs/app-server#8-earned-rate-limit-resets-chatgpt)
  documents an idempotent redemption API with optional credit selection and
  `nothingToReset` as a server outcome. It does not document the numeric
  eligibility threshold. No API was called.

## Confirmed feasibility findings

Static inspection located the agent reset handler in the installed archive's
`webview/assets/execution-3129a8af6263.js`, function `Rd`. It reads current rate
limits and requires a finite `usedPercent >= 90` in one of the selected core
bucket's primary/secondary windows. This is the local 10%-remaining restriction.
The handler then sends `account/rateLimitResetCredit/consume` with an
`idempotencyKey`.

The selected bucket is `rateLimitsByLimitId.codex`, falling back to the legacy
bucket only when its ID/name identifies core Codex or is absent. Model-specific
buckets are not considered. Both windows do not need to qualify. The code does
not itself inspect their duration, despite the tool description naming five-hour
and weekly limits. Missing/nonfinite data does not authorize a reset. These
semantics should be preserved rather than accidentally broadening eligible pools.

The main process separately checks the existing `agentUsageResetEnabled`
permission before dispatching that consume method. Its stored key is
`agent-usage-reset-enabled`, default false, and its agent-facing setting access
is read-only. A proposed threshold feature must preserve this independent gate.

The agent tool description in
`webview/assets/app-initial-ed5807835d97.js` (byte offset 9585260) also hard-codes
10%. A correct feature must update the instructions exposed to agents together
with runtime enforcement; changing only the comparison is incomplete.
The Usage toggle's help text also embeds 10%. The packaged MCP server forwards
the renderer-provided tool catalog, so editing only the MCP server's prose would
not change the actual tool description. Already-running sessions may retain old
metadata until the catalog refreshes or a new task starts.

Manual redemption follows a different client path: the Usage page calls the
HTTP `/wham/rate-limit-reset-credits/consume` endpoint with `credit_id` and
`redeem_request_id`. Its handler does not include the same local 10% predicate.
This does not establish that either server endpoint accepts all remaining
percentages. No redemption endpoint has been called in this investigation.

## Approved product proposal

Use a standalone disabled-by-default `linux-features/` feature. Add a custom
threshold switch and a numeric remaining-percentage control beside the existing
reset permission in Usage settings. Preserve the existing permission toggle and
the requirement for user authorization for each reset.

Custom mode off retains the stock 10%; custom mode on reads
the saved threshold for each attempt, provided the master permission is on.
The percentage defaults to 10 and accepts whole numbers from 1 through 99.
For a threshold T, the equivalent consumed-percentage comparison is
`usedPercent >= 100 - T`. Continue to reject unavailable usage data. Values 0 and
100 are deliberately excluded by operator decision. A configured threshold
permits an attempt; it cannot promise a server-approved reset when there is no
eligible window. This changes eligibility, not automatic scheduling or
authorization to spend credits.

| Allow Codex to use resets | Use custom reset threshold | Behavior |
| --- | --- | --- |
| Off | Either | Agent resets blocked; custom controls disabled, saved values retained |
| On | Off | Standard 10% remaining limit |
| On | On | Configured remaining-percentage limit |

## Implementation considerations, not yet a reviewed design

The feature needs coordinated changes to the Usage controls, preference
persistence, reset handler, error text, and agent tool metadata. Reuse the native
settings system instead of creating a new settings service. The stock reset
permission is a registered `persisted-atom` setting with a boolean schema and
agent read-only access. Matching that pattern for the new user-owned controls
would require corresponding registry/schema entries. The generic global-state
bridge is another existing integration option and accepts custom keys, but then
the feature must own validation/defaults and establish persistence and access
semantics. Do not expose the threshold as an agent-provided tool argument that
lets the caller relax its own limit.

Patch descriptors must recognize the current semantic contracts and reject an
enabled candidate if any required patch fails. The existing engine already
enforces enabled-feature failures (`scripts/patches/descriptor.js:75`,
`scripts/lib/patch-report.js:58`, `scripts/patch-linux-window-ui.js:73`). Do not
disable that enforcement or ship a partially patched UI/tool pair.

### Approaches considered

- Configurable runtime threshold in the existing Usage page: recommended
  direction; matches the requested interaction and avoids rebuilds when the
  threshold changes, but touches UI, persistence, handler, and tool metadata.
- Build-time threshold only: less UI patching, but changing the threshold needs
  a rebuild and does not satisfy the requested Settings control.
- Unconditionally remove the guard or change only the tool description:
  incomplete; either discards user control or leaves actual enforcement intact.
- Route the tool through the manual HTTP endpoint: not justified by present
  evidence. It changes redemption behavior and failure handling without proof
  that the normal agent API needs replacement.

## Verification limits

The local threshold and UI extension are technically feasible. End-to-end reset
acceptance above 10% is unverified: local source and public API documentation do
not prove the service's eligibility rules. The investigation does not assume
permission to consume a reset to resolve this uncertainty.

Future offline checks can exercise threshold boundaries, both core windows,
missing/malformed usage and settings, disabled permission, idempotent retries,
tool metadata consistency, and patch drift using fake transports and synthetic
data. No real reset is necessary to test those local contracts. A live successful
redemption would require separate explicit authorization and is outside this
investigation.

## Evidence and completed checks

- [Static trace report](/var/tmp/codex-reset-enforcement.sE0k1XWs/report.md)
  contains the full agent/manual call paths and persistence findings.
- [Excerpt manifest](/var/tmp/codex-reset-enforcement.sE0k1XWs/excerpt-manifest.json)
  records original archive paths and zero-based UTF-8 byte ranges. Thirteen exact
  code-slice excerpts were checked against the selected archive assets.
- Archive SHA-256 before and after inspection:
  `cdeb8e9496a915179b7024ea8ca9af026ea47ce2639ed8b634ef629183fa74b6`.
- No reset tool, account RPC, reset HTTP request, app launch, live module
  execution, UI interaction, install, or setting change was performed.
- During the initial investigation, no production source files were changed;
  only this analysis note and the separate static evidence directory were created.
  The proposal was subsequently committed as `64ad11f1`; later specification and
  review documentation were separately authorized. No push occurred.
- Local runtime tests and successful backend redemption above 10% were not run;
  findings are based on static source and official API documentation.

## Q&A

### Q1: How do the new controls interact with the existing reset toggle?

**Recommended**

Keep "Allow Codex to use resets" as the master permission. When off, block agent
resets and visually disable the custom controls while preserving their values.
When on, custom mode off uses 10%; custom mode on uses the configured percentage.
Neither toggle automatically triggers a reset.

**Resolved**

The operator confirmed: "Ok proposal agreed." This approves the product proposal
and the toggle interaction explained immediately before that confirmation.
The operator then asked whether it was saved persistently in the checkout.

**Rationale**

The existing permission remains authoritative. The new controls only choose the
local eligibility threshold; they do not enable reset access independently or
authorize spending a reset. Backend acceptance above 10% remains unverified.

At this approval, the exact input range/precision remained open; Q3 subsequently
resolved that contract. The investigation's original 0-100 recommendation is
superseded by the operator's 1-99 decision. No implementation, installation, or
real reset was requested.

### Q2: Commit the proposal and proceed to specification

**Resolved**

The operator instructed: "Commit please and then launch astra high agent to
create a spec for this." This authorizes committing this source and creating a
specification with GPT-6 Astra at high reasoning. It does not authorize pushing,
implementing, installing, or consuming a reset. Carry any material unresolved
product decisions into specification discussion instead of inventing approval.

### Q3: What range and input behavior should the custom threshold use?

**Recommended**

Whole percentages from 0 through 100, default 10, saved on Enter or leaving the
field. Invalid values stay unsaved, and Escape restores the saved value.

**Resolved**

The operator changed the range to 1 through 99 inclusive: "make it 1% to 99% .
there is no point on resetting on 100% usage left and there needs to be at least
some usage for the agent to do the call to reset". The other proposed input
behavior remains unchanged. This correction was relayed to the Astra spec agent.

**Rationale**

Exclude resetting with completely unused quota and avoid making zero remaining
the configured trigger. The percentage is an eligibility threshold, not a
guarantee that a new agent turn can execute or the server will accept redemption.
