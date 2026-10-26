"use strict";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const vm = require("node:vm");
const path = require("node:path");
const fs = require("node:fs");

// Test-only loader. This is not a security sandbox: callers must review each
// bounded declaration and bind every external dependency to an inert fake.
// Never pass a complete upstream module, runtime client, or live setting store.
function loadSnippet(source, bindings, returnExpression) {
  for (const key of ["require", "process", "fetch", "window", "document", "global", "setTimeout", "setInterval"])
    assert.equal(Object.hasOwn(bindings, key), false, `Forbidden fixture binding: ${key}`);
  return vm.runInNewContext(`"use strict";\n${source}\n;(${returnExpression})`, { ...bindings }, {
    timeout: 1000,
    contextCodeGeneration: { strings: false, wasm: false },
  });
}

function verifyRecord(record) {
  const bytes = Buffer.from(record.source, "utf8");
  const hash = crypto.createHash("sha256").update(bytes).digest("hex");
  assert.equal(bytes.length, record.byteEnd - record.byteStart, `${record.id}: provenance length`);
  assert.equal(hash, record.sha256, `${record.id}: provenance hash`);
  assert.match(record.sourceSha256, /^[a-f0-9]{64}$/, `${record.id}: provenance source hash`);
  assert.ok(record.byteStart >= 0, `${record.id}: provenance offset`);
  return true;
}

// Shared provenance is resolved for consumers; source hashes are recorded
// evidence, not authentication of the original package or source files.
function loadRecords(manifest = require("./source-contracts.json")) {
  assert.equal(typeof manifest.version, "string", "provenance version");
  assert.ok(manifest.version.length > 0, "provenance version");
  assert.ok(["amd64", "arm64"].includes(manifest.architecture), "provenance architecture");
  return manifest.records.map(record => {
    assert.ok(Object.hasOwn(manifest.sources, record.sourcePath), `${record.id}: provenance source path`);
    const resolved = { ...record, version: manifest.version, architecture: manifest.architecture, sourceSha256: manifest.sources[record.sourcePath] };
    verifyRecord(resolved);
    return resolved;
  });
}

function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

// Free dependencies of the bounded signed handler are exactly fs/Z/rl/zd;
// the generated handler additionally closes over the pure policy factory.
// None of these bindings loads an application module or has external I/O.
function executionHarness(source, policy, options = {}) {
  const calls = [], settingsReads = [], authReads = [], invalidations = [];
  const controls = { master: [], auth: [], usage: [], policy: [], consume: [], abort: new AbortController() };
  const take = async (name, fallback) => controls[name].length ? await controls[name].shift() : fallback;
  const failure = text => ({ contentItems: [{ type: "inputText", text }], success: false });
  const parser = {
    safeParse(value) {
      const valid = value && typeof value === "object" && !Array.isArray(value)
        && Object.keys(value).length === 1 && typeof value.idempotencyKey === "string"
        && value.idempotencyKey.trim().length > 0;
      return valid ? { success: true, data: { idempotencyKey: value.idempotencyKey.trim() } } : { success: false };
    },
  };
  const handlerName = source.match(/^async function ([\w$]+)\(/)[1];
  const handler = loadSnippet(source, {
    fs: parser, Z: failure, rl: "consume_usage_reset", zd: "Master disabled",
    codexLinuxResetPolicy: policy,
  }, handlerName);
  const send = async (method, payload) => {
    calls.push({ method, payload });
    if (method === "account/rateLimits/read")
      return take("usage", options.usage ?? { rateLimits: { primary: { usedPercent: 90 } } });
    if (method === "account/rateLimitResetCredit/consume")
      return take("consume", { outcome: options.outcome ?? "reset" });
    throw new Error(`Unexpected fake method: ${method}`);
  };
  return {
    controls, calls, settingsReads, authReads, invalidations,
    invoke: (argumentsValue = { idempotencyKey: "attempt-fixture-1" }) => handler({
      argumentsValue,
      signal: controls.abort.signal,
      isUsageResetEnabled: async () => { settingsReads.push("master"); return take("master", options.master ?? true); },
      readAuthMethod: async () => { authReads.push("auth"); return take("auth", options.auth ?? "chatgpt"); },
      readUsageResetPolicy: async () => {
        settingsReads.push("policy");
        return take("policy", options.policy ?? { enabled: false, remainingPercent: 10 });
      },
      getSendRequest: () => send,
      invalidateUsage: async key => { invalidations.push(key); if (options.invalidationError) throw Error("fake refresh failure"); },
      logger: { warning() {} },
    }),
  };
}

// Deliberately narrow schema adapter. Signed source evidence establishes native
// constructor identity; this fake tests the requested contract, not all of Zod.
function schemaAdapter() {
  function schema(check) {
    return {
      parse(value) { if (!check(value)) throw Error("Invalid fixture schema value"); return JSON.parse(JSON.stringify(value)); },
      safeParse(value) { try { return { success: true, data: this.parse(value) }; } catch { return { success: false }; } },
    };
  }
  function number() {
    let integer = false, minimum = -Infinity, maximum = Infinity;
    return Object.assign(schema(value => typeof value === "number" && Number.isFinite(value)
      && (!integer || Number.isInteger(value)) && value >= minimum && value <= maximum), {
      int() { integer = true; return this; },
      min(value) { minimum = value; return this; },
      max(value) { maximum = value; return this; },
    });
  }
  function object(shape) {
    let strict = false;
    return Object.assign(schema(value => value !== null && typeof value === "object" && !Array.isArray(value)
      && (!strict || Object.keys(value).every(key => Object.hasOwn(shape, key)))
      && Object.entries(shape).every(([key, validator]) => Object.hasOwn(value, key) && validator.safeParse(value[key]).success)), {
      strict() { strict = true; return this; },
    });
  }
  return { boolean: schema(value => typeof value === "boolean"), number, object };
}

const registryFixtureBindings = {
  main: { factory: "Z", boolean: "J", object: "t.O", number: "t.D" },
  worker: { factory: "MF", boolean: "CF", object: "G", number: "V" },
  renderer: { factory: "MN", boolean: "TN", object: "H", number: "xu" },
  "display-worker": { factory: "$", boolean: "X", object: "R", number: "P" },
};

function registryFixture(category, registrySource) {
  const records = loadRecords();
  const aliases = registryFixtureBindings[category], adapter = schemaAdapter();
  const bindings = {};
  for (const [role, value] of Object.entries(adapter)) {
    const parts = aliases[role].split(".");
    if (parts.length === 1) bindings[parts[0]] = value;
    else (bindings[parts[0]] ??= {})[parts[1]] = value;
  }
  const factory = records.find(record => record.id === `registry-${category}-factory`).source;
  return loadSnippet(factory, bindings, `({${registrySource(aliases)}}).codexLinuxAgentUsageResetPolicy`);
}

async function nativeStoreHarness(definition, options = {}) {
  const records = loadRecords();
  const source = id => records.find(record => record.id === id).source;
  const clone = value => JSON.parse(JSON.stringify(value));
  const queue = { key: "fixture-followup", default: "steer", schema: {
    parse: value => { if (value !== "steer" && value !== "queue") throw Error("Invalid queue"); return value; },
    safeParse(value) { try { return { success: true, data: this.parse(value) }; } catch { return { success: false }; } },
  } };
  const definitions = new Map([definition, queue].map(item => [item.key, item]));
  const durable = clone({ [queue.key]: "steer", ...options.desktop });
  const facade = {
    M: key => definitions.get(key), N: key => definitions.get(key).schema,
    I: [...definitions.values()], H: { followUpQueueMode: queue }, gs: { LOCAL_PROJECTS: "fixture-projects" },
  };
  const warnings = [], writes = [], controls = { persistenceError: options.persistenceError ?? false };
  // Explicit free-dependency allowlist for ki/Ni: the loader never reads files;
  // the codecs only clone synthetic plain values; migrations are inert.
  const Store = loadSnippet(`${source("native-load")}\nconst ${source("native-store")};`, {
    n: facade, ji: () => clone(durable), Ai() {}, Fi() {},
    te: (_schema, value) => clone(value), _: (_schema, value) => clone(value),
    X: () => ({ warning: (...args) => warnings.push(args) }),
    tr: "fixture-queue-default", K: "fixture-layout", Ei: "fixture-queue-flag",
  }, "ki");
  const globalState = { getStored: key => key === "fixture-queue-default" ? "steer" : undefined, set() {}, async flush() {} };
  const store = new Store("fixture://config", globalState);
  const client = {
    config: { desktop: clone(durable) },
    async batchWriteConfigValues({ edits }) {
      writes.push(clone(edits));
      if (controls.persistenceError) throw Error("inert persistence failure");
      for (const edit of edits) {
        assert.equal(edit.mergeStrategy, "replace");
        assert.ok(edit.keyPath.startsWith("desktop."));
        durable[edit.keyPath.slice("desktop.".length)] = clone(edit.value);
      }
    },
  };
  await store.initialize(client);
  const writeUi = loadSnippet(source("native-write-raw"), {
    e6: { settings: { write: async (key, value) => store.set(key, value) } },
    $G: () => { throw Error("Unexpected fallback in native bridge fixture"); },
  }, "oAn");
  let agentWrites = 0;
  const agentRoute = loadSnippet("", {
    r: { M: facade.M, F: (key, value) => facade.N(key).parse(value) },
  }, `({${source("agent-write")}}).writeForAgent`);
  const agentOwner = {
    write: async (key, value) => { agentWrites++; store.set(key, value); },
    store,
    readForAgent: async () => ({ settings: {}, effectiveSettings: {} }),
  };
  return {
    store, durable, warnings, writes, controls,
    writeUi: value => writeUi(definition, value),
    writeAgent: value => agentRoute.call(agentOwner, { [definition.key]: value }, {}),
    agentWriteCount: () => agentWrites,
  };
}

// Text-only synthetic assets: real bounded contracts plus explicit scaffolding.
// No assembled asset is ever executed; runtime tests load declarations above.
// Historical contracts retain their original provenance. Current signed
// contracts are rebound only in this explicitly synthetic, never-executed tree.
function syntheticFiles() {
  const records = loadRecords();
  const get = id => {
    const value = records.find(record => record.id === id);
    assert.ok(value, `Missing source fixture ${id}`);
    return value;
  };
  const files = new Map(), exports = new Map();
  const append = (file, source) => files.set(file, `${files.get(file) ?? ""}\n${source}\n`);
  const add = (id, prefix = "", suffix = "") => {
    const record = get(id); append(record.sourcePath, `${prefix}${record.source}${suffix}`);
  };
  const exportValue = (file, name, local) => {
    if (!exports.has(file)) exports.set(file, new Map());
    exports.get(file).set(name, local);
  };
  const mapNames = { main: "kp", worker: "xB", renderer: "rMt", "display-worker": "Ej" };
  for (const category of Object.keys(mapNames)) {
    add(`registry-${category}-factory`);
    if (category === "main") add("registry-main-schema-import", "var ", ";");
    add(`registry-${category}-boolean-binding`, "var ", ";");
    add(`registry-${category}-appearance-font`, "var ", ";");
    add(`registry-${category}-appearance`, "const fixtureAppearance=", ";");
    add(`registry-${category}-map`, `var ${mapNames[category]}=`, ";");
    for (const record of records.filter(record => record.id.startsWith(`registry-${category}-derived-`)))
      append(record.sourcePath, `var ${record.source};`);
    if (category === "worker" || category === "display-worker") add(`registry-${category}-key-map`, "const fixtureKeyMap=", ";");
    for (const record of records.filter(record => record.id.startsWith(`schema-${category}-`)))
      append(record.sourcePath, /^(?:function |Object\.)/.test(record.source) ? `${record.source};` : `var ${record.source};`);
  }
  for (const record of records.filter(record => /^registry-main-(lookup|export)-/.test(record.id)))
    append(record.sourcePath, `${record.source};`);
  for (const id of ["native-read", "native-write", "native-write-raw", "native-load", "handler", "wrapper", "manual-http", "manual-retry", "usage-row", "catalog", "catalog-availability", "ui-row-initializer", "ui-react-initializer", "ui-numeric-style"])
    add(id);
  add("native-store", "const ", ";");
  add("agent-write", "const fixtureAgentRoute={", "};");
  add("master-gate", "const fixtureMainGate={", "};");
  const search = get("search");
  const [currentHelp] = loadRecords(require("./current-usage-help.json"));
  const previousHelp = search.source.match(/\{defaultMessage:`[^`]*`,id:`settings\.usage\.resets\.agentEnabled\.description`\}/g);
  assert.equal(previousHelp?.length, 1, "Exactly one historical Usage help record");
  append(search.sourcePath, `var t={${search.source.replace(previousHelp[0], currentHelp.source)}};export{t as settingsSearchDocuments};`);
  for (const id of ["ui-react-ref", "ui-react-id", "ui-react-state"])
    add(id, `const fixture_${id.replaceAll("-", "_")}=`, ";");
  append(get("usage-row").sourcePath, "var nl,rl,Xc,Zc,Qc;");
  for (const record of records.filter(record => record.id.startsWith("ui-shared-export-"))) {
    const [local, name] = record.source.split(" as ");
    exportValue(record.sourcePath, name, local);
  }
  for (const id of ["native-registry-export", "ui-group-export"]) {
    const record = records.find(record => record.id === id);
    if (record) {
      const [local, name] = record.source.split(" as ");
      exportValue(record.sourcePath, name, local);
    }
  }
  for (const id of ["ui-bindings", "ui-group-import", "ui-lazy-import"]) add(id);
  const shared = path.posix.basename(get("registry-renderer").sourcePath);
  append(get("handler").sourcePath, `import{Sjt as yt,K4t as je}from"./${shared}";`);
  // Supply unrelated imports with inert declarations solely to make the text
  // parseable. Feature-owned aliases above retain their exact source exports.
  for (const [file, source] of [...files]) {
    for (const match of source.matchAll(/import\{([^}]+)\}from["'`]([^"'`]+)["'`]/g)) {
      const provider = path.posix.normalize(path.posix.join(path.posix.dirname(file), match[2]));
      for (const specifier of match[1].split(",")) {
        const name = specifier.trim().split(/\s+as\s+/)[0];
        if (!exports.get(provider)?.has(name)) exportValue(provider, name, `fixtureExport${exports.get(provider)?.size ?? 0}`);
      }
    }
  }
  for (const [file, entries] of exports) {
    const source = files.get(file) ?? "";
    for (const local of new Set(entries.values())) {
      const escaped = local.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      if (!new RegExp(`(?:function |(?:var|let|const) )${escaped}(?:[=;(,{]|\\b)`).test(source))
        append(file, `const ${local}=()=>{};`);
    }
    append(file, `export{${[...entries].map(([name, local]) => `${local} as ${name}`).join(",")}};`);
  }
  return refreshSyntheticContracts(files, records);
}

function refreshSyntheticContracts(files, historical) {
  const current = loadRecords(require("./current-source-contracts.json"));
  const get = id => current.find(record => record.id === id).source;
  const old = id => historical.find(record => record.id === id);
  const rename = (source, bindings) => source.replace(/[A-Za-z_$][\w$]*/g, name => bindings[name] ?? name);
  const number = get("number-type"), numberHead = number.match(/^([\w$]+)=([\w$]+)\(`ZodNumber`,\(e,t\)=>\{([\w$]+)\.init/);
  const numberHelper = get("number-properties").match(/^function ([\w$]+)/)[1];
  const mergeHelper = get("descriptor-merge").match(/^function ([\w$]+)/)[1];
  const strictNever = get("strict-method").match(/catchall:([\w$]+)\(\)/)[1];
  for (const category of Object.keys(registryFixtureBindings)) {
    const prior = old(`schema-${category}-number-type`), head = prior.source.match(/^([\w$]+)=([\w$]+)\(`ZodNumber`,\(e,t\)=>\{([\w$]+)\.init/);
    const bindings = { [numberHead[1]]: head[1], [numberHead[2]]: head[2], [numberHead[3]]: head[3], [numberHelper]: "fixtureNumberProperties" };
    files.set(prior.sourcePath, files.get(prior.sourcePath).replace(prior.source, rename(number, bindings)));
    const object = old(`schema-${category}-object-type`), never = object.source.match(/strict\(\)\{return this\.clone\(\{\.\.\.this\._zod\.def,catchall:([\w$]+)\(\)/)[1];
    files.set(object.sourcePath, files.get(object.sourcePath).replace(/strict\(\)\{return this\.clone\(\{\.\.\.this\._zod\.def,catchall:[\w$]+\(\)\}\)\}/,
      rename(get("strict-method"), { [mergeHelper]: "fixtureDescriptorMerge", [strictNever]: never })));
    files.set(prior.sourcePath, files.get(prior.sourcePath) + "\n" + rename(get("number-properties"), { [numberHelper]: "fixtureNumberProperties" }) + "\n" + rename(get("descriptor-merge"), { [mergeHelper]: "fixtureDescriptorMerge" }));
  }
  const reader = get("native-read"), readerName = reader.match(/^async function ([\w$]+)/)[1];
  const native = reader.match(/if\(([\w$]+)\?\.settings/)[1], request = get("request-wrapper").match(/^async function ([\w$]+)/)[1];
  const previous = old("native-read"), oldName = previous.source.match(/^async function ([\w$]+)/)[1];
  files.set(previous.sourcePath, files.get(previous.sourcePath).replace(previous.source, rename(reader, { [readerName]: oldName, [native]: "e6", [request]: "fixtureAwaitRequest" })) + "\n" + rename(get("request-wrapper"), { [request]: "fixtureAwaitRequest" }));

  const style = old("ui-numeric-style"), stylePath = "webview/assets/settings-form-fixture.js";
  files.set(style.sourcePath, files.get(style.sourcePath).replace(style.source, `import{fixtureStyle}from"./settings-form-fixture.js";`));
  files.set(stylePath, get("numeric-style") + "\nconst fixtureStyle=0;export{fixtureStyle};");

  const catalog = old("catalog"), catalogPath = "webview/assets/reset-catalog-fixture.js";
  const catalogName = catalog.source.match(/^var [\w$]+,[\w$]+,([\w$]+);/)[1];
  files.set(catalog.sourcePath, files.get(catalog.sourcePath).replace(catalog.source, `import{fixtureCatalog as ${catalogName}}from"./reset-catalog-fixture.js";`));
  files.set(catalogPath, catalog.source + `\nexport{${catalogName} as fixtureCatalog};`);
  return files;
}

function writeFixtureTree(root, files = syntheticFiles()) {
  for (const [relative, source] of files) {
    const file = path.join(root, relative);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, source);
  }
  return root;
}

function hookRunner() {
  const slots = [], pending = [];
  let cursor = 0, dirty = false, updates = 0;
  const changedDeps = (a, b) => !a || !b || a.length !== b.length || a.some((value, index) => !Object.is(value, b[index]));
  const hooks = {
    useRef(initial) { const index = cursor++; return (slots[index] ??= { current: initial }); },
    useState(initial) {
      const index = cursor++;
      slots[index] ??= { value: typeof initial === "function" ? initial() : initial };
      return [slots[index].value, value => {
        slots[index].value = typeof value === "function" ? value(slots[index].value) : value;
        dirty = true; updates++;
      }];
    },
    useEffect(effect, dependencies) {
      const index = cursor++, old = slots[index];
      if (changedDeps(old?.dependencies, dependencies)) {
        slots[index] = { dependencies, cleanup: old?.cleanup };
        pending.push(() => { slots[index].cleanup?.(); slots[index].cleanup = effect(); });
      }
    },
    useId() { const index = cursor++; return `fixture-control-${index}`; },
  };
  return {
    hooks,
    render(component) { cursor = 0; dirty = false; return component(); },
    flush() { while (pending.length) pending.shift()(); },
    settle(component) {
      for (let count = 0; count < 10; count++) {
        const tree = this.render(component); this.flush();
        if (!dirty) return tree;
      }
      throw Error("Fixture component did not stabilize");
    },
    unmount() { for (const slot of slots) slot?.cleanup?.(); },
    updates: () => updates,
  };
}

function elements(tree) {
  const found = [];
  function visit(value) {
    if (Array.isArray(value)) value.forEach(visit);
    else if (value && typeof value === "object") {
      if (Object.hasOwn(value, "type")) found.push(value);
      if (value.props) for (const nested of Object.values(value.props)) visit(nested);
    }
  }
  visit(tree); return found;
}

function usageComponentHarness(generated, options = {}) {
  const runner = hookRunner(), writes = [], reads = [], toasts = [];
  const state = {
    master: options.master ?? true,
    policy: options.policy ?? { enabled: true, remainingPercent: 10 },
  };
  const definitions = {
    agentUsageResetEnabled: { key: "fixture-master" },
    codexLinuxAgentUsageResetPolicy: { key: "codex-linux-agent-usage-reset-policy" },
  };
  const formatter = {
    formatMessage({ id, defaultMessage }, values = {}) {
      const template = id === "settings.usage.resets.agentEnabled.description" ? "STALE TEN PERCENT" : defaultMessage;
      return template.replace(/\{(\w+)\}/g, (_, key) => String(values[key] ?? `{${key}}`));
    },
  };
  const message = props => ({ type: "message", props: { ...props, text: formatter.formatMessage(props, props.values) } });
  const labelText = label => typeof label === "string" ? label : label?.props?.text ?? "fixture-label";
  const row = props => ({ type: "row", props: {
    ...props,
    control: typeof props.control === "function" ? props.control({ "aria-label": labelText(props.label) }) : props.control,
  } });
  const group = props => ({ type: "group", props });
  group.Content = props => ({ type: "group-content", props });
  const jsx = (type, props) => typeof type === "function" ? type(props) : ({ type, props: props ?? {} });
  const scope = { get: () => ({ danger: (...args) => toasts.push(args) }) };
  const roleValues = {
    storeHook: () => scope, storeAtom: {}, formatterHook: () => formatter,
    subscription: definition => definition === definitions.agentUsageResetEnabled ? state.master : state.policy,
    definitions, jsx: { jsx, jsxs: jsx }, row, group,
    content: props => ({ type: "content", props }), switch: props => ({ type: "switch", props }),
    message, toast: {}, react: runner.hooks,
    writer: async (store, definition, value, writeOptions) => {
      assert.equal(store, scope);
      writes.push({ key: definition.key, value, options: writeOptions });
      if (definition === definitions.agentUsageResetEnabled) state.master = value;
      else {
        if (options.write) await options.write(value);
        else state.policy = value;
      }
    },
  };
  const bindings = {};
  for (const [role, value] of Object.entries(roleValues)) {
    const name = generated.bindings[role];
    assert.equal(typeof name, "string", `Missing emitted Usage binding ${role}`);
    bindings[name] = value;
  }
  bindings.codexLinuxCreateResetController = loadSnippet("", {}, `(${generated.controllerSource})`);
  bindings.codexLinuxResetPolicy = loadSnippet("", {}, generated.policySource);
  bindings.codexLinuxReadResetPolicy = async (...args) => {
    reads.push(args);
    assert.deepEqual(args, [definitions.codexLinuxAgentUsageResetPolicy]);
    return options.read ? options.read() : state.policy;
  };
  const component = loadSnippet(generated.component, bindings, generated.bindings.componentName);
  return {
    state, writes, reads, toasts, runner,
    render: (flush = true) => flush ? runner.settle(component) : runner.render(component),
    unmount: () => runner.unmount(),
  };
}

module.exports = { loadSnippet, verifyRecord, loadRecords, deferred, executionHarness, schemaAdapter, registryFixture, nativeStoreHarness, syntheticFiles, writeFixtureTree, hookRunner, elements, usageComponentHarness };
