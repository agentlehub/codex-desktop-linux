"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { loadRecords } = require("./fixtures/harness.js");
const records = loadRecords();

test("fixture provenance: exact bounded source slices reject truncation", () => {
  const { verifyRecord } = require("./fixtures/harness.js");
  for (const record of records) {
    assert.equal(verifyRecord(record), true);
    assert.throws(() => verifyRecord({ ...record, source: record.source.slice(0, -1) }), /provenance/);
  }
});

test("preflight: current signed schema and split-chunk contracts patch and reapply", () => {
  const { planPatch } = require("./patch.js"), { syntheticFiles } = require("./fixtures/harness.js");
  const files = syntheticFiles(), plan = planPatch(files);
  assert.equal(plan.changes.size, 8);
  assert.equal(plan.inventory.registries.length, 4);
  for (const [file, source] of plan.changes) files.set(file, source);
  const again = planPatch(files);
  assert.equal(again.alreadyApplied, true);
  assert.equal(again.changes.size, 0);
});

test("fixture provenance: optional signed source matches all bounded evidence and patches statically", {
  skip: !process.env.CODEX_SIGNED_EXTRACTED_APP,
}, () => {
  const { readSources, planPatch } = require("./patch.js");
  const crypto = require("node:crypto"), manifest = require("./fixtures/source-contracts.json");
  const root = process.env.CODEX_SIGNED_EXTRACTED_APP;
  for (const [relative, expected] of Object.entries(manifest.sources)) {
    const bytes = fs.readFileSync(path.join(root, relative));
    assert.equal(crypto.createHash("sha256").update(bytes).digest("hex"), expected, relative);
    for (const record of records.filter(record => record.sourcePath === relative))
      assert.equal(bytes.subarray(record.byteStart, record.byteEnd).toString("utf8"), record.source, record.id);
  }
  const files = readSources(root), plan = planPatch(files);
  assert.equal(plan.changes.size, 8);
  for (const [file, source] of plan.changes) files.set(file, source);
  assert.equal(planPatch(files).changes.size, 0);
});

test("preflight: native module aliases require unique imports, exports, and factories", () => {
  const { planPatch } = require("./patch.js"), { syntheticFiles } = require("./fixtures/harness.js");
  const main = records.find(record => record.id === "registry-main").sourcePath;
  const header = records.find(record => record.id === "native-header-early-bootstrap.js-35553").source;
  const mutations = [
    source => source.replace("o=n(35553)", "o=fixtureMissing(35553)"),
    source => source.replace("o=n(35553)", "o=n(35553),o=n(35553)"),
    source => source.replace("number:()=>ej", "fixtureNumber:()=>ej"),
    source => source.replace("number:()=>ej", "number:()=>fixtureMissing"),
    source => source.replace("number:()=>ej", "number:()=>ej,number:()=>ej"),
    source => source + `\nconst fixtureDuplicate={${header.slice(1)}}};`,
    source => source.replace("number:()=>ej", "number:()=>o.number").replace("o=n(43578)", "o=n(35553)"),
  ];
  for (const mutate of mutations) {
    const files = syntheticFiles(), source = files.get(main), changed = mutate(source);
    assert.notEqual(changed, source);
    files.set(main, changed);
    assert.throws(() => planPatch(files), /module|import|export|factory|constructor|cycle/i);
  }
});

test("preflight: native schema semantics and generated names reject drift", () => {
  const { planPatch } = require("./patch.js"), { syntheticFiles } = require("./fixtures/harness.js");
  const mutations = [
    ["schema-main-number-finite", source => source.replace("Number.isFinite(i)", "Number.isNaN(i)")],
    ["schema-worker-number-finite", source => source.replace("Number.isFinite(i)", "Number.isNaN(i)")],
    ["schema-main-strict-merge", source => source.replace("Object.assign(t,Object.getOwnPropertyDescriptors(n))", "Object.assign(Object.getOwnPropertyDescriptors(n),t)")],
    ["schema-worker-strict-merge", source => source.replace("Object.assign(t,Object.getOwnPropertyDescriptors(r))", "Object.assign(Object.getOwnPropertyDescriptors(r),t)")],
    ["handler", source => source.replace("{let s=Oc", "{let codexLinuxResetCurrent;let s=Oc")],
  ];
  for (const [id, mutate] of mutations) {
    const record = records.find(record => record.id === id), files = syntheticFiles();
    const changed = mutate(record.source);
    assert.notEqual(changed, record.source, id);
    files.set(record.sourcePath, files.get(record.sourcePath).replace(record.source, changed));
    assert.throws(() => planPatch(files), /finite|merge|collision|binding/i);
  }
});

test("preflight: only direct registry spreads in the actual aggregate establish linkage", () => {
  const { planPatch } = require("./patch.js"), { syntheticFiles } = require("./fixtures/harness.js");
  const names = { main: "r6", worker: "le", renderer: "Wht", "display-worker": "jD" };
  for (const [category, registry] of Object.entries(names)) {
    const record = records.find(record => record.id === `registry-${category}-derived-0`);
    const list = records.find(record => record.id === `registry-${category}-derived-1`);
    const spread = `...Object.values(${registry})`;
    const replacements = category === "renderer" || category === "display-worker" ? ["...[]"] : ["...[]", `[${spread}]`, `{fixture:[${spread}]}`, `${spread}.filter(()=>false)`, `${spread}&&[]`, JSON.stringify(spread)];
    for (const replacement of replacements) {
      const files = syntheticFiles(), original = files.get(record.sourcePath);
      let changed = original.replace(record.source, record.source.replace(spread, replacement));
      if (replacement === "...[]")
        changed = changed.replace(`var ${list.source};`, `var fixtureUnused=[${spread}];var ${list.source};`);
      assert.notEqual(changed, original, category);
      files.set(record.sourcePath, changed);
      assert.throws(() => planPatch(files), /aggregate|derived|registry|linkage/i, `${category}: ${replacement}`);
    }
  }
});

test("fixture provenance: shared metadata resolves each source and rejects broken references", () => {
  const manifest = require("./fixtures/source-contracts.json");
  for (const record of records) {
    assert.equal(record.version, manifest.version);
    assert.equal(record.architecture, manifest.architecture);
    assert.equal(record.sourceSha256, manifest.sources[record.sourcePath]);
  }
  const sourcePath = manifest.records[0].sourcePath;
  const missing = { ...manifest.sources }; delete missing[sourcePath];
  assert.throws(() => loadRecords({ ...manifest, sources: missing }), /provenance source path/);
  assert.throws(() => loadRecords({ ...manifest, sources: { ...manifest.sources, [sourcePath]: "invalid" } }), /provenance source hash/);
  assert.throws(() => loadRecords({ ...manifest, version: "" }), /provenance version/);
  assert.throws(() => loadRecords({ ...manifest, architecture: "unknown" }), /provenance architecture/);
});

test("fixture provenance: synthetic assets parse without executing initializers", () => {
  const { syntheticFiles } = require("./fixtures/harness.js");
  for (const [name, source] of syntheticFiles()) {
    const result = spawnSync(process.execPath, ["--input-type=" + (name.startsWith(".vite/") ? "commonjs" : "module"), "--check"], { input: source, encoding: "utf8" });
    assert.ifError(result.error);
    assert.equal(result.status, 0, `${name}: ${result.stderr}`);
  }
});

function policyCases(p) {
  const core = usedPercent => ({ rateLimitsByLimitId: { codex: { primary: { usedPercent } } } });
  for (const threshold of [1, 10, 37, 99]) {
    const boundary = 100 - threshold;
    assert.equal(p.evaluateUsage(core(boundary - 0.01), threshold), "above-threshold");
    assert.equal(p.evaluateUsage(core(boundary), threshold), "eligible");
    assert.equal(p.evaluateUsage(core(boundary + 0.01), threshold), "eligible");
  }
  assert.equal(p.effectiveThreshold({ enabled: false, remainingPercent: 37 }), 10);
  assert.equal(p.effectiveThreshold({ enabled: true, remainingPercent: 37 }), 37);
  for (const [text, expected] of [["1", 1], [" 010 ", 10], ["99", 99]])
    assert.equal(p.parseRemainingText(text), expected);
  for (const text of ["", " ", "0", "100", "-1", "+10", "10.0", "1e1", "NaN", "Infinity", null])
    assert.equal(p.parseRemainingText(text), null);
  for (const value of invalidPolicies()) assert.equal(p.isPolicy(value), false);
  assert.equal(p.isPolicy({ enabled: true, remainingPercent: 10.0 }), true);
  const eligible = { primary: { usedPercent: 90 } };
  const cases = [
    [{ rateLimitsByLimitId: { codex: {} }, rateLimits: eligible }, "unavailable"],
    [{ rateLimitsByLimitId: { codex: null }, rateLimits: eligible }, "eligible"],
    [{ rateLimitsByLimitId: { model: eligible } }, "unavailable"],
    [{ rateLimits: { ...eligible, limitId: "codex", limitName: "other" } }, "eligible"],
    ...[undefined, null, "codex"].map(limitName => [{ rateLimits: { ...eligible, limitId: null, limitName } }, "eligible"]),
    [{ rateLimits: { ...eligible, limitId: "model" } }, "unavailable"],
    [{ rateLimits: { ...eligible, limitName: "model" } }, "unavailable"],
    [{ rateLimits: { secondary: { usedPercent: 90 } } }, "eligible"],
    [{ rateLimits: { primary: { usedPercent: "90" }, secondary: { usedPercent: 90 } } }, "eligible"],
    ...[undefined, null, {}, true, { rateLimits: 7 }, { rateLimits: { primary: [] } }].map(response => [response, "unavailable"]),
    ...["90", true, null, NaN, Infinity, -Infinity].map(value => [core(value), "unavailable"]),
    [core(101), "eligible"],
  ];
  for (const [response, expected] of cases) assert.equal(p.evaluateUsage(response, 10), expected);
  for (const usage of [0, -1]) assert.equal(p.evaluateUsage(core(usage), 99), "above-threshold");
  assert.throws(() => p.effectiveThreshold(null), /Invalid usage reset policy/);
  assert.throws(() => p.evaluateUsage(core(100), 100), /Invalid reset threshold/);
}

function invalidPolicies() {
  return [null, [], {}, { enabled: 1, remainingPercent: 10 },
    ...["10", 1.1, NaN, Infinity, 0, 100].map(remainingPercent => ({ enabled: true, remainingPercent })),
    { enabled: true, remainingPercent: 10, extra: true }];
}

test("policy: inclusive thresholds, strict values, core identity, and unavailable windows", () => {
  policyCases(require("./policy.js"));
});

test("policy: serialized factory has the same contract without outside bindings", () => {
  const { policySource } = require("./policy.js");
  const { loadSnippet } = require("./fixtures/harness.js");
  policyCases(loadSnippet("", {}, policySource()));
});

function execution(options) {
  const { executionSources } = require("./patch.js");
  const { executionHarness } = require("./fixtures/harness.js");
  const handler = records.find(record => record.id === "handler").source;
  const wrapper = records.find(record => record.id === "wrapper").source;
  return executionHarness(executionSources(handler, wrapper).handler, require("./policy.js"), options);
}

test("registry: all native copies register a strict read-only object with native storage", () => {
  const { registrySource } = require("./patch.js");
  const { registryFixture } = require("./fixtures/harness.js");
  for (const category of ["main", "worker", "renderer", "display-worker"]) {
    const definition = registryFixture(category, registrySource);
    assert.equal(definition.key, "codex-linux-agent-usage-reset-policy");
    assert.equal(definition.agentAccess, "read-only");
    assert.deepEqual(JSON.parse(JSON.stringify(definition.default)), { enabled: false, remainingPercent: 10 });
    assert.deepEqual(JSON.parse(JSON.stringify(definition.hostStorage)), { kind: "persisted-atom", key: definition.key });
    for (const remainingPercent of [1, 10.0, 37, 99])
      assert.equal(definition.schema.safeParse({ enabled: true, remainingPercent }).success, true);
    for (const value of invalidPolicies()) assert.equal(definition.schema.safeParse(value).success, false);
  }
});

test("registry: discovery links all four native definitions and rejects a fifth", () => {
  const { discoverRegistries } = require("./patch.js");
  const { syntheticFiles } = require("./fixtures/harness.js");
  const files = syntheticFiles();
  const found = discoverRegistries(files);
  assert.deepEqual(found.map(entry => entry.category).sort(), ["display-worker", "main", "renderer", "worker"]);
  files.set("webview/assets/unexpected.js", files.get(found.find(entry => entry.category === "renderer").path));
  assert.throws(() => discoverRegistries(files), /registry|registries|four|4|unexpected/i);
});

test("registry: actual derived native maps include the new registered key", () => {
  const { registrySource } = require("./patch.js");
  const { registryFixture, loadSnippet } = require("./fixtures/harness.js");
  const mapNames = { main: "r6", worker: "le", renderer: "Wht", "display-worker": "jD" };
  for (const [category, registryName] of Object.entries(mapNames)) {
    const definition = registryFixture(category, registrySource);
    const first = records.find(r => r.id === `registry-${category}-derived-0`).source;
    const second = records.find(r => r.id === `registry-${category}-derived-1`).source;
    const map = records.find(r => r.id === `registry-${category}-derived-2`)?.source
      ?? records.find(r => r.id === `registry-${category}-key-map`).source;
    const bindings = Object.fromEntries([...first.matchAll(/Object\.values\(([\w$]+)\)/g)].map(match => [match[1], {}]));
    for (const match of first.matchAll(/([\w$]+)\(\)/g))
      bindings[match[1]] = () => ({ key: "fixture-other", fontSize: { key: "fixture-font" }, fullWidth: { key: "fixture-width" }, smartPunctuationEnabled: { key: "fixture-punctuation" } });
    // Native arrays contain an inlined lazy settings group and namespace
    // references. Bind those free values to inert definitions, never modules.
    for (const match of first.matchAll(/Object\.values\(([\w$]+)=\1\?\?/g)) bindings[match[1]] = {};
    for (const match of first.matchAll(/Object\.values\(([\w$]+)\.([\w$]+)\)/g))
      (bindings[match[1]] ??= {})[match[2]] = {};
    for (const match of first.matchAll(/\(0,([\w$]+)\.([\w$]+)\)\(/g))
      (bindings[match[1]] ??= {})[match[2]] = value => value ?? {};
    for (const match of first.matchAll(/schema:([\w$]+)\.([\w$]+)/g))
      (bindings[match[1]] ??= {})[match[2]] ??= {};
    const nativeFactory = records.find(r => r.id === `registry-${category}-factory`).source;
    bindings[nativeFactory.match(/^function ([\w$]+)\(/)[1]] = value => value;
    const nativeBoolean = records.find(r => r.id === `registry-${category}`).source.match(/schema:([\w$]+(?:\.[\w$]+)?)/)[1];
    if (!nativeBoolean.includes(".")) bindings[nativeBoolean] = {};
    bindings[registryName] = { codexLinuxAgentUsageResetPolicy: definition };
    const expression = map.startsWith("new Map") ? map : map.slice(map.indexOf("=") + 1);
    const nativeMap = loadSnippet(`const ${first};const ${second};`, bindings, expression);
    assert.equal(nativeMap.get(definition.key), definition);
  }
});

test("preflight: malformed schema links and partial markers fail closed", () => {
  const { planPatch } = require("./patch.js");
  const { syntheticFiles } = require("./fixtures/harness.js");
  const mutations = [
    ["schema-main-object", record => record.source.replace('new e8', 'new fixtureMissing')],
    ["registry-renderer-appearance", record => record.source.replace('contrast:cm()', 'contrast:fixtureMissing()')],
    ["handler", record => `/*codex-linux-usage-reset-threshold:partial*/${record.source}`],
  ];
  for (const [id, transform] of mutations) {
    const files = syntheticFiles(), record = records.find(r => r.id === id);
    files.set(record.sourcePath, files.get(record.sourcePath).replace(record.source, transform(record)));
    assert.throws(() => planPatch(files), /schema|constructor|strict|marker|partial/i);
  }
});

// Synchronous feature-local guard; callers keep their rejection/report checks
// visible, and every guarded operation observes this exact fixture tree.
function assertNoFixtureWrites(root, files, operation) {
  const original = fs.writeFileSync; let writes = 0;
  fs.writeFileSync = () => { writes++; throw Error("Unexpected fixture write"); };
  try {
    operation();
    assert.equal(writes, 0);
  } finally { fs.writeFileSync = original; }
  assert.deepEqual(require("./patch.js").readSources(root), files);
}

test("preflight: unused native getters, aliases, and style entries can drift", () => {
  const { planPatch } = require("./patch.js");
  const { syntheticFiles } = require("./fixtures/harness.js");
  const schema = records.find(record => record.id === "schema-main-number-type").sourcePath;
  const mutations = [
    [schema, source => source.replace("format:e=>p.Fs(e).format??null", "format:e=>p.Fs(e).format??`unknown`")],
    [schema, source => source.replace("safe(e)", "fixtureUnusedSafe(e)").replace("gte(e,t)", "fixtureUnusedGte(e,t)").replace("lte(e,t)", "fixtureUnusedLte(e,t)")],
    [records.find(record => record.id === "ui-numeric-style").sourcePath, source => source.replace(/fields:wt,actions:Tt,primaryActions:Et,field:Dt,label:Ot,/, "")],
  ];
  for (const [file, mutate] of mutations) {
    const files = syntheticFiles(), source = files.get(file), changed = mutate(source);
    assert.notEqual(changed, source, "Mutation reaches an unused native surface");
    files.set(file, changed);
    assert.equal(planPatch(files).changes.size, 8);
  }
});

test("preflight: current helper semantics and chunk imports reject drift before writes", { concurrency: false }, t => {
  const { applyUsageResetThreshold } = require("./patch.js");
  const { syntheticFiles, writeFixtureTree } = require("./fixtures/harness.js");
  const root = fixtureDirectory(t, "current-contract-drift");
  const schema = records.find(record => record.id === "schema-main-number-type").sourcePath;
  const shared = records.find(record => record.id === "native-read").sourcePath;
  const usage = records.find(record => record.id === "usage-row").sourcePath;
  const catalog = records.find(record => record.id === "catalog-availability").sourcePath;
  const mutations = [
    ...["min", "max", "int"].map(method => [schema, source => source.replace(new RegExp(`\\b${method}\\(([^)]*)\\)\\{return this\\.check`), `fixtureUnused_${method}($1){return this.check`)]),
    [schema, source => source.replace("Object.assign(t,Object.getOwnPropertyDescriptors(n))", "Object.assign(Object.getOwnPropertyDescriptors(n),t)")],
    [schema, source => { const record = records.find(record => record.id === "schema-main-object-type"); return source.replace(record.source, record.source.replace("strict(){return this.clone", "fixtureUnused_strict(){return this.clone")); }],
    [shared, source => source.replace(".effective;throw Error(`Settings are unavailable on this host`)", ".stored;throw Error(`Settings are unavailable on this host`)")],
    [shared, source => source.replace("return t?.throwIfAborted(),n", "return t?.throwIfAborted(),null")],
    [usage, source => source.replace('from"./settings-form-30f8a3176e42.js"', 'from"./missing-settings-form-fixture.js"')],
    [records.find(record => record.id === "ui-numeric-style").sourcePath, source => source.replace("input:At", "fixtureMissingInput:At")],
    [catalog, source => source.replace("a as Ih", "fixtureMissingCatalog as Ih")],
  ];
  for (const [index, [file, mutate]] of mutations.entries()) {
    const files = syntheticFiles(), source = files.get(file), changed = mutate(source);
    assert.notEqual(changed, source, "Mutation reaches its contract");
    files.set(file, changed);
    assert.throws(() => require("./patch.js").planPatch(files), /number|integer|merge|strict|reader|request|style|catalog|export|import/i, `Mutation ${index}`);
    writeFixtureTree(root, files);
    assertNoFixtureWrites(root, files, () => assert.throws(() => applyUsageResetThreshold(root), /number|integer|merge|strict|reader|request|style|catalog|export|import/i));
  }
});

test("preflight: missing and duplicate native definitions reject before any writes", { concurrency: false }, t => {
  const { applyUsageResetThreshold } = require("./patch.js");
  const { syntheticFiles, writeFixtureTree } = require("./fixtures/harness.js");
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "usage-reset-preflight-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  for (const category of ["main", "worker", "renderer", "display-worker"]) {
    const record = records.find(record => record.id === `registry-${category}`);
    for (const duplicate of [false, true]) {
      const files = syntheticFiles();
      files.set(record.sourcePath, files.get(record.sourcePath).replace(record.source, duplicate ? `${record.source},${record.source}` : "fixtureRemoved:true"));
      writeFixtureTree(root, files);
      assertNoFixtureWrites(root, files, () => {
        assert.throws(() => applyUsageResetThreshold(root), /registry|registries|definition|four|4|ambiguous|missing|duplicate/i);
      });
    }
  }
});

test("preflight: missing, duplicate, and disconnected runtime bindings reject before writes", { concurrency: false }, t => {
  const { applyUsageResetThreshold } = require("./patch.js");
  const { syntheticFiles, writeFixtureTree } = require("./fixtures/harness.js");
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "usage-reset-runtime-preflight-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const handler = records.find(r => r.id === "handler"), wrapper = records.find(r => r.id === "wrapper");
  const shared = records.find(r => r.id === "native-read").sourcePath;
  const mutations = [
    ...[handler, wrapper].flatMap(record => [
      [record.sourcePath, source => source.replace(record.source, "")],
      [record.sourcePath, source => source.replace(record.source, `${record.source}${record.source}`)],
    ]),
    [handler.sourcePath, source => source.replace("wot as Ie", "qdt as Ie")],
    [handler.sourcePath, source => source.replace("qdt as ke", "wot as ke")],
    [shared, source => source.replace("skt as wot", "skt as fixtureRemovedReader")],
    [shared, source => source.replace("Wht as qdt", "Wht as fixtureRemovedRegistry")],
  ];
  for (const [relative, mutate] of mutations) {
    const files = syntheticFiles(), source = files.get(relative), mutated = mutate(source);
    assert.notEqual(mutated, source, "Mutation must reach its intended runtime surface");
    files.set(relative, mutated);
    writeFixtureTree(root, files);
    assertNoFixtureWrites(root, files, () => {
      assert.throws(() => applyUsageResetThreshold(root), error =>
        /execution|wrapper|authoritative|registry|export|import|read/i.test(error.message)
        && !error.message.includes("unresolved required surfaces"));
    });
  }
});

async function nativeStore(options) {
  const { registrySource } = require("./patch.js");
  const { registryFixture, nativeStoreHarness } = require("./fixtures/harness.js");
  return nativeStoreHarness(registryFixture("main", registrySource), options);
}

test("native storage: missing and invalid configured values default without policy writes", async () => {
  const key = "codex-linux-agent-usage-reset-policy";
  for (const desktop of [{}, { [key]: { enabled: true, remainingPercent: 100 } }]) {
    const h = await nativeStore({ desktop });
    assert.deepEqual(JSON.parse(JSON.stringify(h.store.getEffective(key))), { enabled: false, remainingPercent: 10 });
    assert.equal(h.writes.length, 0);
  }
});

test("native storage: accepted persisted object survives successful fake reconstruction", async () => {
  const key = "codex-linux-agent-usage-reset-policy", value = { enabled: true, remainingPercent: 37 };
  const h = await nativeStore();
  let notifications = 0;
  h.store.onDidChange(key, () => notifications++);
  await h.writeUi(value);
  assert.equal(notifications, 1);
  assert.deepEqual(JSON.parse(JSON.stringify(h.store.getEffective(key))), value);
  await h.store.flush();
  assert.deepEqual(h.writes, [[{ keyPath: `desktop.${key}`, mergeStrategy: "replace", value }]]);
  const rebuilt = await nativeStore({ desktop: h.durable });
  assert.deepEqual(JSON.parse(JSON.stringify(rebuilt.store.getEffective(key))), value);
});

test("native storage: failed persistence rejects UI write and restores the accepted value", async () => {
  const key = "codex-linux-agent-usage-reset-policy", prior = { enabled: true, remainingPercent: 10 };
  const value = { enabled: true, remainingPercent: 37 };
  const h = await nativeStore({ desktop: { [key]: prior }, persistenceError: true });
  await assert.rejects(h.writeUi(value), /inert persistence failure/);
  assert.deepEqual(JSON.parse(JSON.stringify(h.store.getEffective(key))), prior);
  assert.deepEqual(h.durable[key], prior);
  assert.ok(h.warnings.some(([message]) => message === "Failed to persist desktop settings"));
  h.controls.persistenceError = false;
  await h.writeUi(value);
  assert.deepEqual(h.durable[key], value);
});

test("native storage: UI acknowledgment waits for persistence completion", async () => {
  const { deferred } = require("./fixtures/harness.js"), gate = deferred();
  const key = "codex-linux-agent-usage-reset-policy", value = { enabled: true, remainingPercent: 37 };
  const h = await nativeStore({ persistence: gate.promise });
  let acknowledged = false;
  const pending = h.writeUi(value).then(() => { acknowledged = true; });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(acknowledged, false);
  assert.deepEqual(JSON.parse(JSON.stringify(h.store.getEffective(key))), value);
  assert.equal(h.durable[key], undefined);
  gate.resolve();
  await pending;
  assert.equal(acknowledged, true);
  assert.deepEqual(h.durable[key], value);
});

test("native storage: generic agent writes reject policy before mutation, UI validates it", async () => {
  const h = await nativeStore(), value = { enabled: true, remainingPercent: 37 };
  await assert.rejects(h.writeAgent(value), /Setting cannot be written by Codex/);
  assert.equal(h.agentWriteCount(), 0);
  assert.equal(h.writes.length, 0);
  await assert.rejects(h.writeUi({ ...value, remainingPercent: 100 }), /Invalid fixture schema/);
  assert.equal(h.writes.length, 0);
  await h.writeUi(value);
  await h.store.flush();
  assert.equal(h.writes.length, 1);
});
const consumes = harness => harness.calls.filter(call => call.method === "account/rateLimitResetCredit/consume");
const responseText = result => result.contentItems[0].text;

test("execution: stock and custom boundaries preserve the sole consume payload", async () => {
  for (const [enabled, threshold, used, permitted] of [[false, 37, 89.99, false], [false, 37, 90, true], [true, 37, 62.99, false], [true, 37, 63, true]]) {
    const h = execution({ policy: { enabled, remainingPercent: threshold }, usage: { rateLimits: { primary: { usedPercent: used } } } });
    const result = await h.invoke();
    assert.equal(result.success, permitted);
    assert.equal(consumes(h).length, permitted ? 1 : 0);
    if (permitted) assert.deepEqual(JSON.parse(JSON.stringify(consumes(h)[0].payload)), { idempotencyKey: "attempt-fixture-1" });
  }
});

test("execution: permission, auth, strict arguments, and unknown policy block dispatch", async () => {
  for (const options of [{ master: false }, { auth: "apikey" }, { policy: {} }, { usage: { rateLimitsByLimitId: { model: { primary: { usedPercent: 100 } } } } }]) {
    const h = execution(options);
    assert.equal((await h.invoke()).success, false);
    assert.equal(consumes(h).length, 0);
  }
  for (const args of [{}, { idempotencyKey: " " }, { idempotencyKey: "fixture", threshold: 99 }, { idempotencyKey: "fixture", creditId: "fake" }]) {
    const h = execution();
    assert.match(responseText(await h.invoke(args)), /nonempty idempotencyKey and no other arguments/);
    assert.equal(h.calls.length, 0);
  }
});

test("execution: a successful invocation reads one policy snapshot and the stock master pair", async () => {
  const h = execution();
  assert.equal((await h.invoke()).success, true);
  assert.deepEqual(h.settingsReads, ["master", "policy", "master"]);
  assert.equal(consumes(h).length, 1);
});

test("execution: policy edits while fresh usage is pending apply to this invocation", async () => {
  const { deferred } = require("./fixtures/harness.js"), gate = deferred();
  const options = { policy: { enabled: true, remainingPercent: 80 } }, h = execution(options);
  h.controls.usage.push(gate.promise);
  const pending = h.invoke();
  for (let turns = 0; h.controls.usage.length > 0 && turns < 100; turns++) await Promise.resolve();
  assert.equal(h.controls.usage.length, 0);
  assert.deepEqual(h.settingsReads, ["master"]);
  options.policy = { enabled: true, remainingPercent: 10 };
  gate.resolve({ rateLimits: { primary: { usedPercent: 30 } } });
  const result = await pending;
  assert.match(responseText(result), /More than 10%/);
  assert.match(responseText(result), /earlier attempt was uncertain/);
  assert.equal(h.calls.length, 1);
  assert.equal(consumes(h).length, 0);
});

test("execution: original outcomes survive refresh failures without retries", async () => {
  for (const outcome of ["reset", "alreadyRedeemed", "noCredit", "nothingToReset"]) {
    const h = execution({ outcome, invalidationError: true });
    const result = await h.invoke();
    assert.equal(JSON.parse(responseText(result)).outcome, outcome);
    assert.equal(consumes(h).length, 1);
  }
});

test("execution: cancellation after every pre-dispatch await prevents consume", async () => {
  const { deferred } = require("./fixtures/harness.js");
  for (const [kind, index] of [["master", 0], ["auth", 0], ["usage", 0], ["policy", 0], ["master", 1]]) {
    const h = execution(), gate = deferred();
    const value = kind === "master" ? true : kind === "auth" ? "chatgpt" : kind === "policy"
      ? { enabled: false, remainingPercent: 10 } : { rateLimits: { primary: { usedPercent: 90 } } };
    h.controls[kind].push(...Array(index).fill(value), gate.promise);
    const result = h.invoke();
    for (let turns = 0; h.controls[kind].length > 0 && turns < 100; turns++) await Promise.resolve();
    assert.equal(h.controls[kind].length, 0, `Reached ${kind} await ${index}`);
    h.controls.abort.abort();
    gate.resolve(value);
    assert.match(responseText(await result), /cancelled/);
    assert.equal(consumes(h).length, 0);
  }
});

test("execution: settings read rejection prevents dispatch", async () => {
  const { deferred } = require("./fixtures/harness.js"), gate = deferred(), h = execution();
  h.controls.policy.push(gate.promise);
  const result = h.invoke();
  gate.reject(Error("inert settings read failure"));
  assert.match(responseText(await result), /settings are unavailable/);
  assert.equal(consumes(h).length, 0);
});

test("execution: uncertain and concurrent calls retain keys without internal replay", async () => {
  const { deferred } = require("./fixtures/harness.js");
  const h = execution(), gate = deferred();
  h.controls.consume.push(gate.promise);
  const first = h.invoke();
  for (let turns = 0; consumes(h).length === 0 && turns < 100; turns++) await Promise.resolve();
  assert.equal(consumes(h).length, 1);
  gate.reject(Error("inert transport failure"));
  assert.match(responseText(await first), /same idempotencyKey/);
  await h.invoke();
  assert.equal(consumes(h).length, 2);
  assert.deepEqual(consumes(h).map(call => call.payload.idempotencyKey), ["attempt-fixture-1", "attempt-fixture-1"]);
  const concurrent = execution();
  await Promise.all([concurrent.invoke(), concurrent.invoke()]);
  assert.equal(consumes(concurrent).length, 2);
  assert.ok(consumes(concurrent).every(call => call.payload.idempotencyKey === "attempt-fixture-1"));
});

test("execution: wrapper reads desktop policy while auth and transport keep the task host", async () => {
  const { executionSources } = require("./patch.js");
  const { loadSnippet } = require("./fixtures/harness.js");
  const generated = executionSources(records.find(r => r.id === "handler").source, records.find(r => r.id === "wrapper").source);
  const reads = [], auth = [], clients = [], transport = [];
  const definitions = { agentUsageResetEnabled: { key: "master-fixture" }, codexLinuxAgentUsageResetPolicy: { key: "policy-fixture" } };
  const invoke = loadSnippet(generated.wrapper, {
    Qd: async dependencies => {
      await dependencies.isUsageResetEnabled();
      await dependencies.readUsageResetPolicy();
      await dependencies.readAuthMethod();
      return dependencies.getSendRequest()("fixture-method", { fixture: true });
    },
    Ie: async (...args) => { reads.push(args); return true; }, ke: definitions,
    en: async (...args) => { auth.push(args); return "chatgpt"; },
    J: (...args) => { clients.push(args); return { sendRequest: (...call) => transport.push(call) }; },
    Aa: () => {}, j: { warning() {} },
  }, "tf");
  const scope = {}, queryClient = {};
  await invoke({ scope, hostId: "remote-fixture", argumentsValue: { idempotencyKey: "fixture" }, queryClient });
  assert.equal(reads.length, 2);
  assert.ok(reads.every(args => args.length === 1));
  assert.deepEqual(reads.map(args => args[0]), [definitions.agentUsageResetEnabled, definitions.codexLinuxAgentUsageResetPolicy]);
  assert.deepEqual(auth, [[scope, "remote-fixture"]]);
  assert.deepEqual(clients, [[scope, "remote-fixture"]]);
  assert.equal(transport.length, 1);
});

test("execution: each call reads current policy and unavailable usage never qualifies", async () => {
  const h = execution({ usage: { rateLimits: { primary: { usedPercent: 63 } } } });
  h.controls.policy.push({ enabled: true, remainingPercent: 37 }, { enabled: false, remainingPercent: 37 });
  assert.equal((await h.invoke()).success, true);
  assert.match(responseText(await h.invoke()), /More than 10%/);
  assert.equal(consumes(h).length, 1);
  const unavailable = execution(), { deferred } = require("./fixtures/harness.js"), gate = deferred();
  unavailable.controls.usage.push(gate.promise);
  const result = unavailable.invoke();
  gate.reject(Error("inert unavailable usage"));
  assert.match(responseText(await result), /Current core Codex usage is unavailable/);
  assert.equal(consumes(unavailable).length, 0);
});

test("execution: bounded edits preserve the stock consume/outcome/refresh tail", () => {
  const { executionSources } = require("./patch.js");
  const original = records.find(r => r.id === "handler").source;
  const generated = executionSources(original, records.find(r => r.id === "wrapper").source);
  const tail = original.slice(original.indexOf("let{outcome:"));
  assert.ok(generated.handler.endsWith(tail));
});

test("execution: master-off during each pre-dispatch await prevents consume", async () => {
  const { deferred } = require("./fixtures/harness.js");
  for (const [kind, index] of [["master", 0], ["auth", 0], ["usage", 0], ["policy", 0], ["master", 1]]) {
    const options = { master: true }, h = execution(options), gate = deferred();
    const value = kind === "master" ? true : kind === "auth" ? "chatgpt" : kind === "policy"
      ? { enabled: false, remainingPercent: 10 } : { rateLimits: { primary: { usedPercent: 90 } } };
    h.controls[kind].push(...Array(index).fill(value), gate.promise);
    const result = h.invoke();
    for (let turns = 0; h.controls[kind].length > 0 && turns < 100; turns++) await Promise.resolve();
    assert.equal(h.controls[kind].length, 0);
    options.master = false;
    gate.resolve(kind === "master" ? false : value);
    assert.match(responseText(await result), /Master disabled/);
    assert.equal(consumes(h).length, 0);
  }
});

test("execution: post-consume usage failure preserves the returned outcome", async () => {
  const h = execution(), { deferred } = require("./fixtures/harness.js"), gate = deferred();
  h.controls.usage.push({ rateLimits: { primary: { usedPercent: 90 } } }, gate.promise);
  const result = h.invoke();
  for (let turns = 0; consumes(h).length === 0 && turns < 100; turns++) await Promise.resolve();
  assert.equal(consumes(h).length, 1);
  gate.reject(Error("inert post-consume usage failure"));
  const parsed = JSON.parse(responseText(await result));
  assert.equal(parsed.outcome, "reset");
  assert.equal(parsed.usage, null);
  assert.equal(consumes(h).length, 1);
});

function usageController({ master = true, accepted = { enabled: true, remainingPercent: 10 }, write, read } = {}) {
  const { createUsageResetController } = require("./patch.js");
  const writes = [], state = { accepted }, notifications = [];
  const controller = createUsageResetController({
    read: read ?? (async () => state.accepted),
    write: async value => { writes.push(value); if (write) await write(value); else state.accepted = value; },
    changed: () => notifications.push(true),
  }, require("./policy.js"));
  controller.sync(master, accepted);
  return { controller, writes, state, notifications };
}

test("usage: master/custom state matrix and valid input bounds", async () => {
  for (const master of [false, true]) for (const enabled of [false, true]) {
    const h = usageController({ master, accepted: { enabled, remainingPercent: 37 } }), snapshot = h.controller.snapshot();
    assert.equal(snapshot.switchDisabled, !master);
    assert.equal(snapshot.fieldDisabled, !master || !enabled);
    assert.equal(snapshot.effective, master ? enabled ? 37 : 10 : null);
    assert.equal(snapshot.draft, "37");
  }
  for (const [text, expected] of [["1", 1], [" 010 ", 10], ["99", 99]]) {
    const h = usageController({ accepted: { enabled: true, remainingPercent: 37 } });
    h.controller.edit(text);
    await h.controller.enter();
    assert.deepEqual(h.writes, [{ enabled: true, remainingPercent: expected }]);
    assert.equal(h.controller.snapshot().draft, String(expected));
  }
});

test("usage: invalid lexical drafts stay visible and Escape restores accepted baseline", async () => {
  for (const text of ["", "0", "100", "-1", "+10", "10.0", "1e1", "NaN", "Infinity"]) {
    const h = usageController();
    h.controller.focus(); h.controller.edit(text); await h.controller.blur();
    assert.equal(h.writes.length, 0);
    assert.equal(h.controller.snapshot().draft, text);
    assert.match(h.controller.snapshot().error, /whole percentage from 1 to 99.*not been applied/);
    h.controller.escape();
    assert.equal(h.controller.snapshot().draft, "10");
    assert.equal(h.controller.snapshot().error, null);
  }
});

test("usage: Enter then blur submits once and pending custom writes block other edits", async () => {
  const { deferred } = require("./fixtures/harness.js"), gate = deferred();
  const h = usageController({ write: async value => { await gate.promise; h.state.accepted = value; } });
  h.controller.edit("37");
  const entering = h.controller.enter(), blurring = h.controller.blur();
  assert.equal(h.controller.snapshot().pending, true);
  assert.equal(h.controller.snapshot().switchDisabled, true);
  assert.equal(h.controller.snapshot().fieldDisabled, true);
  h.controller.edit("99"); await h.controller.toggle(false);
  assert.equal(h.writes.length, 1);
  gate.resolve(); await Promise.all([entering, blurring]);
  assert.equal(h.controller.snapshot().draft, "37");
  assert.equal(h.controller.snapshot().pending, false);
  h.controller.edit("037"); await h.controller.enter();
  assert.equal(h.writes.length, 1);
  assert.equal(h.controller.snapshot().draft, "37");
});

test("usage: native updates preserve dirty text but Escape and disabling discard it", async () => {
  const h = usageController();
  h.controller.sync(true, { enabled: true, remainingPercent: 37 });
  assert.equal(h.controller.snapshot().draft, "37");
  h.controller.focus(); h.controller.edit("55");
  h.controller.sync(true, { enabled: true, remainingPercent: 20 });
  assert.equal(h.controller.snapshot().draft, "55");
  h.controller.escape();
  assert.equal(h.controller.snapshot().draft, "20");
  h.controller.edit("invalid"); h.controller.sync(false, { enabled: true, remainingPercent: 20 });
  assert.equal(h.controller.snapshot().draft, "20");
  assert.equal(h.controller.snapshot().error, null);
  h.controller.sync(true, { enabled: true, remainingPercent: 20 });
  h.controller.edit("55"); await h.controller.toggle(false);
  assert.deepEqual(h.writes, [{ enabled: false, remainingPercent: 20 }]);
  await h.controller.toggle(true);
  assert.deepEqual(h.writes[1], { enabled: true, remainingPercent: 20 });
});

test("usage: write failures and malformed reads never create rollback writes or fake acceptance", async () => {
  const h = usageController({ write: async () => { throw Error("inert rejected write"); } });
  h.controller.edit("37"); await h.controller.enter();
  assert.equal(h.writes.length, 1);
  assert.equal(h.controller.snapshot().draft, "10");
  assert.match(h.controller.snapshot().error, /Couldn't apply reset threshold setting/);
  h.controller.sync(true, { enabled: true, remainingPercent: 25 });
  assert.equal(h.controller.snapshot().draft, "25");
  assert.match(h.controller.snapshot().error, /Couldn't apply reset threshold setting/);
  h.controller.sync(true, null);
  assert.equal(h.controller.snapshot().fieldDisabled, true);
  assert.equal(h.controller.snapshot().switchDisabled, true);
  await h.controller.toggle(true);
  assert.equal(h.writes.length, 1);
  const badRead = usageController({ read: async () => { throw Error("inert read failure"); } });
  badRead.controller.edit("37"); await badRead.controller.enter();
  assert.equal(badRead.controller.snapshot().draft, "10");
  assert.match(badRead.controller.snapshot().error, /Couldn't apply reset threshold setting/);
});

test("usage: an accepted write can finish after master-off and reconciliation reads latest state", async () => {
  const { deferred } = require("./fixtures/harness.js"), gate = deferred();
  const h = usageController({ write: () => gate.promise });
  h.controller.edit("37"); const pending = h.controller.blur();
  h.state.accepted = { enabled: true, remainingPercent: 20 };
  h.controller.sync(false, h.state.accepted);
  gate.resolve(); await pending;
  assert.equal(h.controller.snapshot().draft, "20");
  assert.equal(h.controller.snapshot().fieldDisabled, true);
  assert.equal(h.writes.length, 1);
});

function usageComponent(options) {
  const { discoverUsage } = require("./patch.js");
  const { syntheticFiles, usageComponentHarness } = require("./fixtures/harness.js");
  return usageComponentHarness(discoverUsage(syntheticFiles()), options);
}
function controls(tree) {
  const { elements } = require("./fixtures/harness.js");
  return elements(tree).filter(element => element.type === "switch" || element.type === "input");
}
const treeText = tree => JSON.stringify(tree);

test("usage: emitted component exposes accessible controls and immediate master gating", () => {
  for (const master of [false, true]) for (const enabled of [false, true]) {
    const h = usageComponent({ master, policy: { enabled, remainingPercent: 37 } });
    const tree = h.render(), [masterSwitch, custom, input] = controls(tree);
    assert.equal(masterSwitch.props.disabled ?? false, false);
    assert.equal(custom.props.disabled, !master);
    assert.equal(input.props.disabled, !master || !enabled);
    assert.equal(input.props.value, enabled ? "37" : "10");
    assert.equal(input.props["aria-label"], "Reset threshold");
    assert.equal(input.props.type, "text");
    assert.equal(input.props.inputMode, "numeric");
    assert.deepEqual([input.props.min, input.props.max, input.props.step], [1, 99, 1]);
    const { elements } = require("./fixtures/harness.js");
    const rows = elements(tree).filter(element => element.type === "row");
    assert.equal(rows[0].props.description.props.text, "Allow your assistant to use a reset only when you explicitly request it during a conversation and your remaining usage is at or below the reset threshold. Resets are never used automatically.");
    assert.equal(rows[1].props.description ?? null, null);
    assert.ok(!treeText(tree).includes("STALE TEN PERCENT"));
    assert.doesNotMatch(treeText(tree), /Either available core Codex window can qualify/);
    h.state.master = false;
    const [, immediateCustom, immediateInput] = controls(h.render(false));
    assert.equal(immediateCustom.props.disabled, true);
    assert.equal(immediateInput.props.disabled, true);
    assert.equal(h.writes.length, 0);
  }
});

test("usage: custom mode shows the saved percentage and standard mode shows 10 without overwriting it", async () => {
  const h = usageComponent({ policy: { enabled: false, remainingPercent: 37 } });
  for (const enabled of [true, false, true]) {
    await controls(h.render())[1].props.onChange(enabled);
    const tree = h.render(), [, custom, input] = controls(tree);
    assert.equal(custom.props.checked, enabled);
    assert.equal(input.props.disabled, !enabled);
    assert.equal(input.props.value, enabled ? "37" : "10");
  }
  assert.deepEqual(JSON.parse(JSON.stringify(h.writes.map(({ key, value }) => ({ key, value })))), [
    { key: "codex-linux-agent-usage-reset-policy", value: { enabled: true, remainingPercent: 37 } },
    { key: "codex-linux-agent-usage-reset-policy", value: { enabled: false, remainingPercent: 37 } },
    { key: "codex-linux-agent-usage-reset-policy", value: { enabled: true, remainingPercent: 37 } },
  ]);
  assert.equal(h.state.master, true);
});

test("usage: emitted input commits and normalizes an edit on blur without Enter", async () => {
  const h = usageComponent();
  const input = controls(h.render())[2];
  input.props.onFocus();
  input.props.onChange({ target: { value: "037" } });
  await controls(h.render())[2].props.onBlur();
  assert.deepEqual(JSON.parse(JSON.stringify(h.writes.map(({ key, value }) => ({ key, value })))), [
    { key: "codex-linux-agent-usage-reset-policy", value: { enabled: true, remainingPercent: 37 } },
  ]);
  assert.equal(controls(h.render())[2].props.value, "37");
  assert.equal(h.state.master, true);
});

test("usage: emitted input keeps invalid drafts and connects the inline error", async () => {
  const h = usageComponent();
  let input = controls(h.render())[2];
  input.props.onFocus(); input.props.onChange({ target: { value: "1e1" } });
  let prevented = false;
  await input.props.onKeyDown({ key: "Enter", preventDefault() { prevented = true; } });
  const tree = h.render(); input = controls(tree)[2];
  assert.equal(prevented, true);
  assert.equal(input.props.value, "1e1");
  assert.equal(input.props["aria-invalid"], true);
  const errorId = input.props["aria-describedby"];
  assert.equal(typeof errorId, "string");
  const { elements } = require("./fixtures/harness.js");
  assert.ok(elements(tree).some(element => element.props.id === errorId));
  assert.equal(h.writes.length, 0);
  await input.props.onKeyDown({ key: "Escape", preventDefault() {} });
  assert.equal(controls(h.render())[2].props.value, "10");
});

test("usage: native updates clear errors for discarded drafts but preserve focused edits", async () => {
  const h = usageComponent();
  let input = controls(h.render())[2];
  input.props.onFocus();
  input.props.onChange({ target: { value: "invalid" } });
  await input.props.onKeyDown({ key: "Enter", preventDefault() {} });
  h.state.policy = { enabled: true, remainingPercent: 25 };
  input = controls(h.render())[2];
  assert.equal(input.props.value, "invalid");
  assert.equal(input.props["aria-invalid"], true);
  await input.props.onBlur();
  h.state.policy = { enabled: true, remainingPercent: 30 };
  const tree = h.render(); input = controls(tree)[2];
  assert.equal(input.props.value, "30");
  assert.equal(input.props["aria-invalid"], false);
  assert.equal(input.props["aria-describedby"], undefined);
  const { elements } = require("./fixtures/harness.js");
  assert.ok(!elements(tree).some(element => element.props.role === "alert"));
  assert.equal(h.writes.length, 0);
});

test("usage: emitted writes are nonoptimistic, master stays available, unmount stops notifications", async () => {
  const { deferred } = require("./fixtures/harness.js"), gate = deferred();
  const h = usageComponent({ write: async value => { await gate.promise; h.state.policy = value; } });
  let [master, , input] = controls(h.render());
  input.props.onChange({ target: { value: "37" } });
  input.props.onKeyDown({ key: "Enter", preventDefault() {} });
  input.props.onBlur();
  [master, , input] = controls(h.render());
  assert.equal(input.props.disabled, true);
  assert.equal(master.props.disabled ?? false, false);
  assert.equal(h.writes.length, 1);
  assert.equal(h.writes[0].key, "codex-linux-agent-usage-reset-policy");
  assert.deepEqual(JSON.parse(JSON.stringify(h.writes[0].options)), { optimistic: false });
  master.props.onChange(false);
  assert.equal(h.writes[1].key, "fixture-master");
  h.unmount(); const updates = h.runner.updates();
  gate.resolve();
  for (let count = 0; count < 20; count++) await Promise.resolve();
  assert.equal(h.runner.updates(), updates);
  assert.equal(h.writes.length, 2);
  assert.equal(h.state.policy.remainingPercent, 37);
});

test("usage: master disabling before effects prevents a blur commit", async () => {
  const h = usageComponent();
  const input = controls(h.render())[2];
  input.props.onFocus(); input.props.onChange({ target: { value: "37" } });
  h.state.master = false;
  const disabled = controls(h.render(false))[2];
  assert.equal(disabled.props.disabled, true);
  await disabled.props.onBlur();
  assert.equal(h.writes.length, 0);
  assert.equal(controls(h.render())[2].props.value, "10");
});

test("metadata: catalog preserves authorization/schema and changes only eligibility sentence", () => {
  const { discoverMetadata } = require("./patch.js"), { syntheticFiles } = require("./fixtures/harness.js");
  const metadata = discoverMetadata(syntheticFiles());
  const stock = records.find(record => record.id === "catalog").source;
  const before = "Every call checks fresh core usage: either the five-hour or weekly window must have 10% or less remaining.";
  const after = "Each call requires the Usage setting allowing Codex to use resets, reads fresh core Codex usage, and checks the remaining-percentage threshold: 10% unless custom mode is enabled in Usage settings. Custom mode uses the saved threshold from 1% to 99%, allowing resets above the standard 10% remaining limit. Either available core window can qualify. Unavailable usage never qualifies.";
  assert.equal(metadata.catalog.original, stock, "Replacement owns the complete bounded catalog declaration");
  assert.equal(stock.split(before).length - 1, 1, "Exactly one stock eligibility sentence");
  // Full declaration equality preserves name, authorization, schema, and all
  // other bytes without pretending a schema fake proves upstream semantics.
  assert.equal(metadata.catalog.replacement, stock.replace(before, after));
});

test("metadata: Usage search exposes controls without changing unrelated or manual messages", () => {
  const { discoverMetadata } = require("./patch.js"), { syntheticFiles, loadSnippet } = require("./fixtures/harness.js");
  const result = discoverMetadata(syntheticFiles()).search;
  assert.ok(result.original.includes("id:`settings.usage.resets.agentEnabled.description`"));
  const before = loadSnippet("", {}, `({${result.original}}).usage`);
  const after = loadSnippet("", {}, `({${result.replacement}}).usage`);
  const stockId = "settings.usage.resets.agentEnabled.description";
  assert.equal(after.filter(entry => entry.id === stockId).length, 0);
  const untouched = before.filter(entry => entry.id !== stockId);
  assert.deepEqual(JSON.parse(JSON.stringify(after.filter(entry => untouched.some(original => original.id === entry.id)))), JSON.parse(JSON.stringify(untouched)));
  const added = after.filter(entry => !untouched.some(original => original.id === entry.id));
  assert.equal(added.length, 3);
  for (const text of ["Use custom reset threshold", "Reset threshold", "your remaining usage is at or below the reset threshold"])
    assert.ok(added.some(entry => entry.defaultMessage.includes(text)), text);
  assert.ok(added.every(entry => entry.id.startsWith("codexLinux.usageResetThreshold.")));
});

test("metadata: stock catalog availability retains desktop/auth/master and all-mode contracts", () => {
  const { discoverMetadata } = require("./patch.js"), { syntheticFiles, loadSnippet } = require("./fixtures/harness.js");
  const files = syntheticFiles(), metadata = discoverMetadata(files);
  const availability = records.find(record => record.id === "catalog-availability").source;
  assert.ok(files.get(metadata.availability.path).includes(availability));
  const clause = availability.match(/\.\.\.(e&&!E&&u===`chatgpt`\?\[Kh,\.\.\.z\|\|d\?\[Ih\]:\[\]\]:\[\])/);
  assert.ok(clause, "bounded stock availability clause");
  for (const desktop of [false, true]) for (const loading of [false, true])
    for (const auth of ["chatgpt", "api-key"]) for (const master of [false, true]) for (const all of [false, true]) {
      const actual = loadSnippet("", { e: desktop, E: loading, u: auth, d: master, z: all, Kh: "usage", Ih: "reset" }, clause[1]);
      assert.equal(actual.includes("reset"), desktop && !loading && auth === "chatgpt" && (master || all));
    }
});

function fixtureDirectory(t, suffix = "closure") {
  const { writeFixtureTree } = require("./fixtures/harness.js");
  const root = fs.mkdtempSync(path.join(os.tmpdir(), `usage-reset-${suffix}-`));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  writeFixtureTree(root);
  return root;
}
function featureDescriptors(root, enabled = true) {
  const config = path.join(root, "features.json");
  fs.writeFileSync(config, JSON.stringify({ enabled: enabled ? ["usage-reset-threshold"] : [] }));
  return require("../../scripts/lib/linux-features.js").loadLinuxFeaturePatchDescriptors({ featuresRoot: path.resolve(__dirname, ".."), featuresConfigPath: config });
}

test("patch closure: complete transaction preserves manual paths and reapplies byte-identically", async t => {
  const patch = require("./patch.js");
  const { syntheticFiles, executionHarness, usageComponentHarness } = require("./fixtures/harness.js");
  const original = syntheticFiles(), root = fixtureDirectory(t);
  const execution = patch.discoverExecution(original), usage = patch.discoverUsage(original), metadata = patch.discoverMetadata(original);
  const planned = patch.planPatch(original);
  assert.equal(planned.alreadyApplied, false);
  assert.ok(planned.changes.size >= 6);
  assert.equal(patch.applyUsageResetThreshold(root).changed, true);
  const actual = patch.readSources(root);
  for (const [file, source] of original) assert.equal(actual.get(file), planned.changes.get(file) ?? source);
  for (const [file, source] of planned.changes) {
    const result = spawnSync(process.execPath, ["--input-type=" + (file.startsWith(".vite/") ? "commonjs" : "module"), "--check"], { input: source, encoding: "utf8" });
    assert.ifError(result.error); assert.equal(result.status, 0, `${file}: ${result.stderr}`);
  }
  for (const id of ["manual-http", "manual-retry", "master-gate", "catalog-availability"]) {
    const record = records.find(entry => entry.id === id);
    assert.ok(actual.get(record.sourcePath).includes(record.source), id);
  }
  for (const registry of patch.discoverRegistries(original))
    assert.ok(actual.get(registry.path).includes(patch.registrySource(registry.aliases)));
  assert.ok(actual.get(execution.path).includes(execution.generated.handler));
  const h = executionHarness(execution.generated.handler, require("./policy.js"), { policy: { enabled: true, remainingPercent: 37 }, usage: { rateLimits: { primary: { usedPercent: 63 } } } });
  assert.equal((await h.invoke()).success, true);
  assert.equal(consumes(h).length, 1);
  assert.ok(actual.get(usage.path).includes(usage.component));
  assert.equal(controls(usageComponentHarness(usage).render())[2].props.value, "10");
  assert.ok(actual.get(metadata.catalog.path).includes(metadata.catalog.replacement));
  const second = patch.planPatch(actual);
  assert.equal(second.alreadyApplied, true); assert.equal(second.changes.size, 0);
  assert.equal(patch.applyUsageResetThreshold(root).changed, false);
  assert.deepEqual(patch.readSources(root), actual);
});

test("patch closure: partial failing write restores every attempted file", { concurrency: false }, t => {
  const patch = require("./patch.js"), root = fixtureDirectory(t, "write-probe");
  const write = fs.writeFileSync, targets = [];
  fs.writeFileSync = function(file, ...args) { if (String(file).startsWith(root + path.sep)) targets.push(String(file)); return write.call(this, file, ...args); };
  try { assert.equal(patch.applyUsageResetThreshold(root).changed, true); } finally { fs.writeFileSync = write; }
  assert.ok(targets.length >= 2);
  const failingRoot = fixtureDirectory(t, "write-failure"), before = patch.readSources(failingRoot);
  const failingTarget = path.join(failingRoot, path.relative(root, targets[1]));
  const injected = Error("injected-write-failure");
  let attempts = 0, partial = false;
  fs.writeFileSync = function(file, ...args) {
    if (String(file).startsWith(failingRoot + path.sep) && ++attempts === 2) {
      assert.equal(String(file), failingTarget); write(file, "partial injected bytes"); partial = true; throw injected;
    }
    return write.call(this, file, ...args);
  };
  try { assert.throws(() => patch.applyUsageResetThreshold(failingRoot), error => error === injected); }
  finally { fs.writeFileSync = write; }
  assert.equal(partial, true); assert.ok(attempts >= 4);
  assert.deepEqual(patch.readSources(failingRoot), before);
});

test("patch closure: a silently wrong write is detected and every attempted file is restored", { concurrency: false }, t => {
  const patch = require("./patch.js"), root = fixtureDirectory(t, "silent-write");
  const before = patch.readSources(root), write = fs.writeFileSync;
  let attempts = 0;
  fs.writeFileSync = function(file, ...args) {
    if (String(file).startsWith(root + path.sep) && ++attempts === 2)
      return write(file, "silently wrong bytes");
    return write.call(this, file, ...args);
  };
  try { assert.throws(() => patch.applyUsageResetThreshold(root), /asset write verification failed/); }
  finally { fs.writeFileSync = write; }
  assert.deepEqual(patch.readSources(root), before);
});

test("patch closure: a silently wrong restoration rejects the candidate", { concurrency: false }, t => {
  const root = fixtureDirectory(t, "silent-restore"), descriptors = featureDescriptors(root);
  const { applyExtractedAppPatchDescriptors } = require("../../scripts/patches/engine.js");
  const { createPatchReport, criticalFailuresFromReport } = require("../../scripts/lib/patch-report.js");
  const report = createPatchReport(), write = fs.writeFileSync;
  let attempts = 0, failedTarget;
  fs.writeFileSync = function(file, ...args) {
    if (String(file).startsWith(root + path.sep)) {
      if (String(file) === failedTarget) return write(file, "silently wrong restored bytes");
      if (++attempts === 2) {
        failedTarget = String(file);
        write(file, "partial bytes");
        throw Error("injected-write-failure");
      }
    }
    return write.call(this, file, ...args);
  };
  try {
    assert.throws(() => applyExtractedAppPatchDescriptors(root, descriptors, {}, report, "extracted-app:pre-webview"), { name: "PatchIntegrityError" });
  } finally { fs.writeFileSync = write; }
  assert.equal(report.patches[0].status, "failed-integrity");
  assert.equal(criticalFailuresFromReport(report).length, 1);
});

test("patch closure: failed restoration raises integrity error and rejects the candidate", { concurrency: false }, t => {
  const patch = require("./patch.js"), root = fixtureDirectory(t, "integrity"), descriptors = featureDescriptors(root);
  const { applyExtractedAppPatchDescriptors } = require("../../scripts/patches/engine.js");
  const { createPatchReport, criticalFailuresFromReport } = require("../../scripts/lib/patch-report.js");
  const report = createPatchReport(), write = fs.writeFileSync;
  let attempts = 0, failedTarget, partial = false;
  fs.writeFileSync = function(file, ...args) {
    if (String(file).startsWith(root + path.sep)) {
      if (String(file) === failedTarget) throw Error("injected-restoration-failure");
      if (++attempts === 2) {
        failedTarget = String(file); write(file, "partial injected bytes"); partial = true;
        throw Error("injected-write-failure");
      }
    }
    return write.call(this, file, ...args);
  };
  try {
    assert.throws(() => applyExtractedAppPatchDescriptors(root, descriptors, {}, report, "extracted-app:pre-webview"), { name: "PatchIntegrityError" });
  } finally { fs.writeFileSync = write; }
  assert.equal(partial, true); assert.ok(attempts >= 2);
  assert.equal(report.patches[0].status, "failed-integrity");
  assert.equal(criticalFailuresFromReport(report).length, 1);
});

test("packaging: explicit feature discovery is opt-in and staged builder has complete dependencies", t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "usage-reset-stage-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const repo = path.resolve(__dirname, "../.."), config = path.join(root, "features.json"), staged = path.join(root, "update-builder");
  const manifest = JSON.parse(fs.readFileSync(path.join(__dirname, "feature.json")));
  assert.equal(manifest.defaultEnabled, false);
  assert.deepEqual(manifest.entrypoints, { patchDescriptors: "./patch.js" });
  assert.equal(manifest.resources, undefined);
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(repo, "linux-features/features.example.json"))), { enabled: [] });
  assert.equal(featureDescriptors(root).length, 1);
  const result = spawnSync("bash", ["-c", `
    set -euo pipefail
    REPO_DIR="$1"
    reset_stage="$2"
    reset_node="$3"
    . "$REPO_DIR/scripts/lib/package-common.sh"
    package_node_binary() { printf '%s\\n' "$reset_node"; }
    stage_update_builder_linux_features_tree "$reset_stage"
    mkdir -p "$reset_stage/scripts/patches"
    cp -a "$REPO_DIR/scripts/patches/." "$reset_stage/scripts/patches/"
  `, "stage-reset-feature", repo, staged, process.execPath], {
    encoding: "utf8", env: { ...process.env, CODEX_LINUX_FEATURES_ROOT: path.join(repo, "linux-features"), CODEX_LINUX_FEATURES_CONFIG: config },
  });
  assert.ifError(result.error); assert.equal(result.status, 0, result.stderr);
  for (const name of ["feature.json", "patch.js", "policy.js", "README.md"])
    assert.ok(fs.existsSync(path.join(staged, "linux-features/usage-reset-threshold", name)), name);
  const modulePath = path.join(staged, "linux-features/usage-reset-threshold/patch.js");
  try { assert.equal(require(modulePath).descriptors.length, 1); }
  finally { delete require.cache[require.resolve(modulePath)]; }
});

test("packaging: disabled config loads no patch module and never probes malformed assets", { concurrency: false }, t => {
  const root = fixtureDirectory(t, "disabled"), file = path.join(root, "webview/assets/malformed.js");
  fs.writeFileSync(file, "codexLinuxAgentUsageResetPolicy INVALID SOURCE");
  const patchPath = require.resolve("./patch.js"), cached = require.cache[patchPath];
  delete require.cache[patchPath];
  const descriptors = featureDescriptors(root, false);
  const { applyExtractedAppPatchDescriptors } = require("../../scripts/patches/engine.js");
  const { createPatchReport } = require("../../scripts/lib/patch-report.js");
  const read = fs.readFileSync, write = fs.writeFileSync;
  let probes = 0, writes = 0;
  fs.readFileSync = function(target, ...args) { if (String(target).startsWith(root + path.sep)) { probes++; throw Error("Disabled feature probed assets"); } return read.call(this, target, ...args); };
  fs.writeFileSync = function(target, ...args) { if (String(target).startsWith(root + path.sep)) { writes++; throw Error("Disabled feature wrote assets"); } return write.call(this, target, ...args); };
  try {
    assert.deepEqual(descriptors, []);
    applyExtractedAppPatchDescriptors(root, descriptors, {}, createPatchReport(), "extracted-app:pre-webview");
    assert.equal(require.cache[patchPath], undefined); assert.equal(probes, 0); assert.equal(writes, 0);
  } finally { fs.readFileSync = read; fs.writeFileSync = write; if (cached) require.cache[patchPath] = cached; }
  assert.equal(fs.readFileSync(file, "utf8"), "codexLinuxAgentUsageResetPolicy INVALID SOURCE");
});

test("patch closure: missing or duplicate UI/catalog/search contracts reject before writes", { concurrency: false }, t => {
  const patch = require("./patch.js"), { syntheticFiles, writeFixtureTree } = require("./fixtures/harness.js");
  const original = syntheticFiles(), usage = patch.discoverUsage(original), metadata = patch.discoverMetadata(original);
  const surfaces = [[usage.path, usage.original], [metadata.catalog.path, metadata.catalog.original], [metadata.search.path, metadata.search.original]];
  for (const [file, source] of surfaces) for (const duplicate of [false, true]) {
    const root = fixtureDirectory(t, "surface-drift"), files = new Map(original);
    files.set(file, files.get(file).replace(source, duplicate ? source + source : ""));
    writeFixtureTree(root, files);
    assertNoFixtureWrites(root, files, () => assert.throws(() => patch.applyUsageResetThreshold(root)));
  }
});

test("patch closure: complete markers cannot hide edited bodies or a changed registry inventory", { concurrency: false }, t => {
  const patch = require("./patch.js"), { syntheticFiles, writeFixtureTree } = require("./fixtures/harness.js");
  const original = syntheticFiles(), registry = patch.discoverRegistries(original).find(entry => entry.category === "renderer");
  const planned = patch.planPatch(original), complete = new Map([...original, ...planned.changes]);
  const generated = patch.registrySource(registry.aliases);
  const mutations = [
    files => files.set(registry.path, files.get(registry.path).replace(generated, generated.replace("remainingPercent:10", "remainingPercent:99"))),
    files => files.set(registry.path, files.get(registry.path).replace(generated, "fixtureRemoved:true")),
    files => files.set("webview/assets/unexpected-registry.js", files.get(registry.path)),
  ];
  const { applyExtractedAppPatchDescriptors } = require("../../scripts/patches/engine.js");
  const { createPatchReport, enabledFeatureFailuresFromReport } = require("../../scripts/lib/patch-report.js");
  for (const mutate of mutations) {
    const root = fixtureDirectory(t, "marker-drift"), files = new Map(complete); mutate(files);
    assert.notDeepEqual(files, complete); writeFixtureTree(root, files);
    const descriptors = featureDescriptors(root), report = createPatchReport(); report.enabledFeatures = ["usage-reset-threshold"];
    assertNoFixtureWrites(root, files, () => {
      applyExtractedAppPatchDescriptors(root, descriptors, {}, report, "extracted-app:pre-webview");
    });
    assert.equal(enabledFeatureFailuresFromReport(report).length, 1);
  }
});

test("usage: a later valid subscription wins over every pending reconciliation outcome", async t => {
  const { deferred, elements } = require("./fixtures/harness.js");
  for (const outcome of ["success", "rejection", "malformed"]) await t.test(outcome, async () => {
    const gate = deferred();
    const h = usageComponent({ read: () => h.reads.length === 1 ? gate.promise : h.state.policy });
    const input = controls(h.render())[2];
    input.props.onFocus(); input.props.onChange({ target: { value: "37" } });
    const pending = input.props.onKeyDown({ key: "Enter", preventDefault() {} });
    for (let count = 0; count < 10 && !h.reads.length; count++) await Promise.resolve();
    assert.equal(h.reads.length, 1);
    h.state.policy = { enabled: true, remainingPercent: 20 };
    h.render();
    if (outcome === "rejection") gate.reject(Error("inert read failure"));
    else gate.resolve(outcome === "malformed" ? null : { enabled: true, remainingPercent: 37 });
    await pending;
    for (let count = 0; count < 2; count++) {
      const tree = h.render(), [, custom, percentage] = controls(tree);
      assert.equal(percentage.props.value, "20");
      assert.equal(custom.props.disabled, false);
      assert.equal(percentage.props.disabled, false);
      assert.equal(elements(tree).some(element => element.props.role === "alert"), false);
    }
    const percentage = controls(h.render())[2];
    percentage.props.onChange({ target: { value: "45" } });
    assert.equal(controls(h.render())[2].props.value, "45");
    percentage.props.onKeyDown({ key: "Escape", preventDefault() {} });
    await percentage.props.onBlur();
    assert.equal(controls(h.render())[2].props.value, "20");
    assert.equal(h.writes.length, 1, "No automatic rollback or retry write");
    assert.equal(h.reads.length, 1, "No reconciliation retry");
    await controls(h.render())[1].props.onChange(false);
    assert.equal(h.writes.length, 2, "Only the explicit subsequent toggle writes again");
    assert.deepEqual(JSON.parse(JSON.stringify(h.writes[1].value)), { enabled: false, remainingPercent: 20 });
    assert.equal(controls(h.render())[1].props.checked, false);
    assert.equal(h.reads.length, 2);
  });
});

test("usage: reconciliation stays blocked without a newer valid subscription", async t => {
  const { deferred } = require("./fixtures/harness.js");
  for (const newer of [false, true]) for (const outcome of ["success", "rejection", "malformed"]) {
    if (!newer && outcome === "success") continue;
    await t.test(`${newer ? "invalid newer subscription" : "no newer subscription"}, ${outcome}`, async () => {
      const gate = deferred();
      let reads = 0;
      const h = usageController({ read: () => { reads++; return gate.promise; } });
      h.controller.edit("37"); const pending = h.controller.enter();
      for (let count = 0; count < 10 && !reads; count++) await Promise.resolve();
      assert.equal(reads, 1);
      if (newer) h.controller.sync(true, null);
      if (outcome === "rejection") gate.reject(Error("inert read failure"));
      else gate.resolve(outcome === "malformed" ? null : { enabled: true, remainingPercent: 37 });
      await pending;
      const snapshot = h.controller.snapshot();
      assert.equal(snapshot.switchDisabled, true);
      assert.equal(snapshot.fieldDisabled, true);
      assert.equal(snapshot.pending, false);
      assert.match(snapshot.error, /Couldn't apply reset threshold setting/);
      h.controller.edit("45"); await h.controller.enter(); await h.controller.toggle(false);
      assert.equal(h.writes.length, 1);
      assert.equal(reads, 1);
    });
  }
});

test("patch closure: malformed changed asset rejects at syntax gate before any writes", { concurrency: false }, t => {
  const patch = require("./patch.js"), { syntheticFiles, writeFixtureTree } = require("./fixtures/harness.js");
  const root = fixtureDirectory(t, "syntax-drift"), files = syntheticFiles();
  const execution = patch.discoverExecution(files);
  files.set(execution.path, files.get(execution.path) + "\nfunction incompleteSyntax(\n");
  // All semantic surfaces still resolve. The production parser must reject this
  // otherwise complete candidate before the first transactional write.
  assert.ok(patch.planPatch(files).changes.size > 0);
  writeFixtureTree(root, files);
  assertNoFixtureWrites(root, files, () => {
    assert.throws(() => patch.applyUsageResetThreshold(root), /generated syntax invalid/);
  });
});

test("patch closure: reapplication rejects malformed surrounding JavaScript without writes", { concurrency: false }, t => {
  const patch = require("./patch.js"), root = fixtureDirectory(t, "reapply-syntax");
  const initial = patch.planPatch(patch.readSources(root));
  assert.equal(patch.applyUsageResetThreshold(root).changed, true);
  const target = path.join(root, initial.inventory.execution.path);
  fs.appendFileSync(target, "\nfunction incompleteSyntax(\n");
  const before = patch.readSources(root);
  assert.equal(patch.planPatch(before).alreadyApplied, true, "Generated bodies and markers remain intact");
  assertNoFixtureWrites(root, before, () => {
    assert.throws(() => patch.applyUsageResetThreshold(root), /generated syntax invalid/);
  });
});
