"use strict";

// This factory is serialized into the renderer. Keep it self-contained and
// free of settings, transport, and presentation dependencies.
function createPolicy() {
  const isPercent = value => typeof value === "number" && Number.isInteger(value) && value >= 1 && value <= 99;
  function isPolicy(value) {
    return value !== null && typeof value === "object" && !Array.isArray(value)
      && Object.keys(value).length === 2
      && Object.hasOwn(value, "enabled") && Object.hasOwn(value, "remainingPercent")
      && typeof value.enabled === "boolean" && isPercent(value.remainingPercent);
  }
  function parseRemainingText(text) {
    if (typeof text !== "string" || !/^\d+$/.test(text.trim())) return null;
    const value = Number(text.trim());
    return isPercent(value) ? value : null;
  }
  function effectiveThreshold(value) {
    if (!isPolicy(value)) throw new TypeError("Invalid usage reset policy");
    return value.enabled ? value.remainingPercent : 10;
  }
  function evaluateUsage(response, threshold) {
    if (!isPercent(threshold)) throw new TypeError("Invalid reset threshold");
    const legacy = response?.rateLimits;
    const core = response?.rateLimitsByLimitId?.codex ??
      (legacy?.limitId === "codex" || (legacy?.limitId == null &&
       (legacy?.limitName == null || legacy.limitName === "codex")) ? legacy : null);
    const values = [core?.primary, core?.secondary]
      .flatMap(window => typeof window?.usedPercent === "number" &&
        Number.isFinite(window.usedPercent) ? [window.usedPercent] : []);
    return values.length === 0 ? "unavailable" :
      values.some(value => value >= 100 - threshold) ? "eligible" : "above-threshold";
  }
  return { isPolicy, parseRemainingText, effectiveThreshold, evaluateUsage };
}

const policy = createPolicy();
const policySource = () => `(${createPolicy.toString()})()`;
module.exports = { createPolicy, policySource, ...policy };
