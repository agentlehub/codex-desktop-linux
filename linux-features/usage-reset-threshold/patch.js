"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { PatchIntegrityError } = require("../../scripts/patches/integrity-error.js");
const { policySource } = require("./policy.js");

const IDENT = "[A-Za-z_$][\\w$]*";
const MEMBER = `${IDENT}(?:\\.${IDENT})?`;
const CALLABLE = `(?:${MEMBER}|\\(0,${IDENT}\\.${IDENT}\\))`;
const MARKER = "codex-linux-usage-reset-threshold";
const escape = value => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
function fail(message) { throw new Error(`Usage reset threshold: ${message}`); }
function matches(source, expression) { return [...source.matchAll(new RegExp(expression, "g"))]; }
function one(source, expression, label) {
  const found = matches(source, expression);
  if (found.length !== 1) fail(`${label}: expected exactly one match, found ${found.length}`);
  return found[0];
}
function identifier(value) {
  if (typeof value !== "string" || !new RegExp(`^${CALLABLE}$`).test(value)) fail("invalid generated binding");
  return value;
}
function noCollisions(source, names) {
  const namesInSource = new Set(source.match(new RegExp(IDENT, "g")));
  for (const name of names) if (namesInSource.has(name)) fail(`generated binding collision: ${name}`);
}

function registrySource({ factory, boolean, object, number }) {
  [factory, boolean, object, number].forEach(identifier);
  return `codexLinuxAgentUsageResetPolicy:${factory}({agentAccess:"read-only",default:{enabled:false,remainingPercent:10},description:"Custom eligibility threshold for explicitly authorized agent usage resets; enabled selects custom mode and does not grant reset permission",key:"codex-linux-agent-usage-reset-policy",schema:${object}({enabled:${boolean},remainingPercent:${number}().int().min(1).max(99)}).strict()})`;
}

// These are source transforms, never executable application imports. Capture
// identifiers from narrow stock contracts and reject a changed contract.
function executionSources(handler, wrapper) {
  const names = ["codexLinuxResetNoAttempt", "codexLinuxResetCurrent", "codexLinuxResetThreshold", "codexLinuxResetResult", "codexLinuxResetInitialMaster", "codexLinuxResetAuth", "codexLinuxResetReadSetting"];
  noCollisions(handler + wrapper, [...names, "codexLinuxResetPolicy"]);
  const head = one(handler, `^async function (${IDENT})\\(\\{argumentsValue:(${IDENT}),readAuthMethod:(${IDENT}),isUsageResetEnabled:(${IDENT}),getSendRequest:(${IDENT}),invalidateUsage:(${IDENT}),logger:(${IDENT}),signal:(${IDENT})\\}\\)\\{`, "handler dependency bindings");
  const [, handlerName, args, auth, master, client, , , signal] = head;
  const parse = one(handler, `let (${IDENT})=(${IDENT})\\.safeParse\\(${escape(args)}\\);if\\(!\\1\\.success\\)return (${IDENT})\\(\x60\\$\\{(${IDENT})\\} requires a nonempty idempotencyKey and no other arguments\\.\x60\\);let\\{idempotencyKey:(${IDENT})\\}=\\1\\.data;`, "strict argument parser");
  const [, , , failure, , key] = parse;
  const cancelled = `${failure}(\`Usage reset was cancelled before redemption.\`)`;
  const cancel = `if(${signal}?.aborted)return ${cancelled};`;
  const initialMaster = matches(handler, `if\\(!await ${escape(master)}\\(\\)\\)return ${escape(failure)}\\((${IDENT})\\);`);
  if (initialMaster.length !== 2 || initialMaster[0][1] !== initialMaster[1][1]) fail("stock master gate pair changed");
  const disabled = `${failure}(${initialMaster[0][1]})`;
  const stockMaster = `if(!await ${master}())return ${disabled};`;
  const stockAuth = `if(await ${auth}()!==\`chatgpt\`)return ${failure}(\`Usage resets require a ChatGPT account on this task's host.\`);`;
  const fresh = one(handler, `let (${IDENT})=${escape(client)}\\(\\),(${IDENT})=await \\1\\(\x60account/rateLimits/read\x60,void 0\\)\\.catch\\(\\(\\)=>null\\);`, "fresh task-host usage read");
  const [, transport, usage] = fresh;
  const region = one(handler, `let (${IDENT})=${escape(usage)}\\?\\.rateLimitsByLimitId\\?\\.codex[\\s\\S]*?(?=let\\{outcome:${IDENT}\\}=await ${escape(transport)}\\(\x60account/rateLimitResetCredit/consume\x60,)`, "stock eligibility region");
  const selection = one(region[0], `,(${IDENT})=\\[${escape(region[1])}\\?\\.primary,${escape(region[1])}\\?\\.secondary\\]\\.flatMap\\((${IDENT})=>`, "stock usage window aliases");
  const [bucket, windows, item] = [region[1], selection[1], selection[2]];
  const some = one(region[0], `if\\(!${escape(windows)}\\.some\\((${IDENT})=>\\1>=90\\)\\)`, "stock eligibility comparison")[1];
  const expected = `let ${bucket}=${usage}?.rateLimitsByLimitId?.codex??(${usage}?.rateLimits.limitId===\`codex\`||${usage}?.rateLimits.limitId==null&&(${usage}?.rateLimits.limitName==null||${usage}.rateLimits.limitName===\`codex\`)?${usage}?.rateLimits:null),${windows}=[${bucket}?.primary,${bucket}?.secondary].flatMap(${item}=>${item}!=null&&Number.isFinite(${item}.usedPercent)?[${item}.usedPercent]:[]);if(!${windows}.some(${some}=>${some}>=90))return ${failure}(JSON.stringify({idempotencyKey:${key},error:\`\$\{${windows}.length===0?\`Current core Codex usage is unavailable.\`:\`More than 10% remains in every available core Codex usage window.\`\} This call did not attempt a reset. If an earlier attempt was uncertain, it may already have succeeded; keep the same idempotencyKey for any retry.\`}));${stockMaster}${cancel}`;
  if (region[0] !== expected) fail("stock eligibility contract changed");
  if (!handler.includes(`${cancel}${stockMaster}${stockAuth}${cancel}${fresh[0]}${cancel}`)) fail("initial permission/auth/cancellation order changed");
  const generated = `const codexLinuxResetNoAttempt=error=>${failure}(JSON.stringify({idempotencyKey:${key},error:\`\$\{error\} This call did not attempt a reset. If an earlier attempt was uncertain, it may already have succeeded; keep the same idempotencyKey for any retry.\`}));const codexLinuxResetCurrent=await codexLinuxResetReadSetting().then(value=>({value}),()=>({error:"Usage reset settings are unavailable."}));${cancel}if(codexLinuxResetCurrent.error)return codexLinuxResetNoAttempt(codexLinuxResetCurrent.error);if(!codexLinuxResetPolicy.isPolicy(codexLinuxResetCurrent.value))return codexLinuxResetNoAttempt("Usage reset settings are invalid.");const codexLinuxResetThreshold=codexLinuxResetPolicy.effectiveThreshold(codexLinuxResetCurrent.value),codexLinuxResetResult=codexLinuxResetPolicy.evaluateUsage(${usage},codexLinuxResetThreshold);if(codexLinuxResetResult!=="eligible")return codexLinuxResetNoAttempt(codexLinuxResetResult==="unavailable"?"Current core Codex usage is unavailable.":\`More than \$\{codexLinuxResetThreshold\}% remains in every available core Codex usage window.\`);${stockMaster}${cancel}`;
  const output = handler.replace(head[0], head[0].replace("}){", ",readUsageResetPolicy:codexLinuxResetReadSetting}){"))
    .replace(region[0], generated)
    .replace(`${stockMaster}${stockAuth}`, `const codexLinuxResetInitialMaster=await ${master}();${cancel}if(!codexLinuxResetInitialMaster)return ${disabled};const codexLinuxResetAuth=await ${auth}();${cancel}if(codexLinuxResetAuth!==\`chatgpt\`)return ${failure}(\`Usage resets require a ChatGPT account on this task's host.\`);`);
  const wrapperRead = one(wrapper, `isUsageResetEnabled:\\(\\)=>(${IDENT})\\((${IDENT})\\.agentUsageResetEnabled\\)`, "wrapper controlling-desktop read");
  one(wrapper, `^async function ${IDENT}\\(\\{scope:${IDENT},argumentsValue:${IDENT},hostId:${IDENT},queryClient:${IDENT},signal:${IDENT}\\}\\)\\{return ${escape(handlerName)}\\(\\{`, "task-host wrapper");
  return { handler: output, wrapper: wrapper.replace(wrapperRead[0], `${wrapperRead[0]},readUsageResetPolicy:()=>${wrapperRead[1]}(${wrapperRead[2]}.codexLinuxAgentUsageResetPolicy)`) };

}

const categories = [
  ["main", /^\.vite\/build\/early-bootstrap\.js$/],
  ["worker", /^\.vite\/build\/worker\.js$/],
  ["renderer", /^webview\/assets\/app-shared-[^/]+\.js$/],
  ["display-worker", /^webview\/assets\/page-bootstrap-display\.worker-[^/]+\.js$/],
];

// Native main/worker registries use rspack module factories. Resolve only the
// current strict factory header, numeric import and named export contracts;
// this is static source inspection, never a module loader or initializer.
function nativeModules(source) {
  const headers = matches(source, `(?:^|[,{])([0-9]+)\\((${IDENT})(?:,(${IDENT}))?(?:,(${IDENT}))?\\)\\{\"use strict\";`);
  return headers.map((header, index) => ({
    id: header[1], exports: header[3], loader: header[4],
    start: header.index, end: headers[index + 1]?.index ?? source.length,
    source: source.slice(header.index + header[0].length, headers[index + 1]?.index ?? source.length),
  }));
}
function nativeScope(source, offset) {
  const scopes = nativeModules(source).filter(scope => scope.start <= offset && offset < scope.end);
  if (scopes.length !== 1) fail("native registry module is missing or ambiguous");
  return scopes[0];
}
function nativeExport(scope, member, label) {
  const head = `${escape(scope.loader)}\\.d\\(${escape(scope.exports)},`;
  const table = one(scope.source, `${head}\\{([^{}]*)\\}`, `${label} export table`);
  const constants = scope.source.slice(table.index + table[0].length).match(/^,\{([^{}]*)\}\)/)?.[1] ?? "";
  const found = [];
  for (const [entries, getter] of [[table[1], true], [constants, false]]) {
    for (const entry of entries.split(",")) {
      const match = entry.match(new RegExp(`^${escape(member)}:${getter ? "\\(\\)=>" : ""}(${MEMBER})$`));
      if (match) found.push(match[1]);
    }
  }
  if (found.length !== 1) fail(`${label} export ${member}: expected one binding, found ${found.length}`);
  return found[0];
}
function nativeResolve(source, scope, binding, label, seen = new Set()) {
  const edge = `${scope.id}:${binding}`;
  if (seen.has(edge)) fail(`${label} module alias cycle`);
  seen.add(edge);
  if (!binding.includes(".")) return { source: scope.source, name: binding, scope };
  const [namespace, member] = binding.split(".");
  const imported = one(scope.source, `(?:^|[;,])(?:var |let |const )?${escape(namespace)}=${escape(scope.loader)}\\(([0-9]+)\\)(?=[,;])`, `${label} module import`);
  const targets = nativeModules(source).filter(item => item.id === imported[1]);
  if (targets.length !== 1) fail(`${label} module ${imported[1]}: expected one factory, found ${targets.length}`);
  const target = targets[0], local = nativeExport(target, member, label);
  return nativeResolve(source, target, local, label, seen);
}
function resolveSchema(_files, file, source, binding) {
  if (binding.includes(".")) fail("unexpected renderer schema namespace");
  return { source, name: binding, path: file };
}
function schemaConstructor(source, name, label) {
  return one(source, `function ${escape(name)}\\((${IDENT})\\)\\{return (${IDENT})\\((${IDENT}),\\1\\)\\}`, `${label} constructor`)[3];
}
function verifySchema(files, file, source, aliases) {
  // Current display worker retains tree-shaking annotations inside schema calls.
  source = source.replace(/return(?=\/\*\s*@__PURE__)/g, "return ")
    .replace(/\/\*\s*@__PURE__\s*\*\/\s*/g, "");
  const booleanBinding = one(source, `(?:^|[^\\w$])${escape(aliases.boolean)}=(${MEMBER})\\(\\)`, "native boolean binding")[1];
  const boolean = resolveSchema(files, file, source, booleanBinding);
  const number = resolveSchema(files, file, source, aliases.number);
  const object = resolveSchema(files, file, source, aliases.object);
  const booleanType = schemaConstructor(boolean.source, boolean.name, "boolean");
  one(boolean.source, `(?:^|[^\\w$])${escape(booleanType)}=${IDENT}\\(\x60ZodBoolean\x60,`, "native boolean type");
  const numberType = schemaConstructor(number.source, number.name, "number");
  const numberBase = one(number.source, `(?:^|[^\\w$])${escape(numberType)}=${IDENT}\\(\x60ZodNumber\x60,\\((${IDENT}),(${IDENT})\\)=>\\{(${IDENT})\\.init\\(\\1,\\2\\),`, "native number type")[3];
  one(number.source, `(?:^|[^\\w$])${escape(numberBase)}=${IDENT}\\(\x60\\$ZodNumber\x60,[\\s\\S]{0,350}?if\\(typeof (${IDENT})==\x60number\x60&&!Number\\.isNaN\\(\\1\\)&&Number\\.isFinite\\(\\1\\)\\)return ${IDENT};`, "native finite number parser");
  const methodSurface = one(number.source, `(?:^|[^\\w$])${escape(numberType)}=${IDENT}\\(\x60ZodNumber\x60,\\((${IDENT}),(${IDENT})\\)=>\\{[\\s\\S]{0,250}?\\1\\.isFinite=!0\\},${IDENT}\\(\\{[\\s\\S]{0,700}?\\},\\{([\\s\\S]{0,1500}?)\\}\\)\\)`, "native number methods");
  const methods = methodSurface[3];
  for (const method of ["min", "max"])
    one(methods, `(?:^|,)${method}\\((${IDENT}),(${IDENT})\\)\\{return this\\.check\\((${IDENT})\\(\\1,\\2\\)\\)\\}`, `native number ${method} bound`);
  one(methods, `(?:^|,)int\\((${IDENT})\\)\\{return this\\.check\\((${IDENT})\\(\\1\\)\\)\\}`, "native integer method");
  const objectFunction = one(object.source, `function ${escape(object.name)}\\((${IDENT}),(${IDENT})\\)\\{(?:return new (${IDENT})\\(\\{type:\x60object\x60,shape:\\1\\?\\?\\{\\},\\.\\.\\.${IDENT}\\(\\2\\)\\}\\)|let (${IDENT})=\\{type:\x60object\x60,shape:\\1\\?\\?\\{\\},\\.\\.\\.${IDENT}\\(\\2\\)\\};return new (${IDENT})\\(\\4\\))\\}`, "native object constructor");
  const objectType = objectFunction[3] || objectFunction[5];
  const strict = one(object.source, `(?:^|[^\\w$])${escape(objectType)}=${IDENT}\\(\x60ZodObject\x60,[\\s\\S]{0,700}?(?:\\{|,)strict\\(\\)\\{return this\\.clone\\((${IDENT})\\(this\\._zod\\.def,\\{catchall:(${IDENT})\\(\\)\\}\\)\\)\\}`, "native strict object method");
  one(object.source, `function ${escape(strict[1])}\\(\\.\\.\\.(${IDENT})\\)\\{let (${IDENT})=\\{\\};for\\(let (${IDENT}) of \\1\\)\\{let (${IDENT})=Object\\.getOwnPropertyDescriptors\\(\\3\\);Object\\.assign\\(\\2,\\4\\)\\}return Object\\.defineProperties\\(\\{\\},\\2\\)\\}`, "native strict descriptor merge");
  const neverType = schemaConstructor(object.source, strict[2], "strict never");
  one(object.source, `(?:^|[^\\w$])${escape(neverType)}=${IDENT}\\(\x60ZodNever\x60,`, "native strict never type");
  return { boolean: boolean.name, number: number.name, object: object.name, schemaPath: object.path };
}

function verifyNativeSchema(source, scope, aliases, file) {
  const booleanValue = nativeResolve(source, scope, aliases.boolean, "native boolean");
  const booleanCall = one(booleanValue.source, `(?:^|[^\\w$])${escape(booleanValue.name)}=(${MEMBER})\\(\\)`, "native boolean binding");
  const boolean = nativeResolve(source, booleanValue.scope, booleanCall[1], "native boolean constructor");
  const number = nativeResolve(source, scope, aliases.number, "native number constructor");
  const object = nativeResolve(source, scope, aliases.object, "native object constructor");
  const constructor = (resolved, label) => one(resolved.source, `function ${escape(resolved.name)}\\((${IDENT})\\)\\{return (${MEMBER})\\((${IDENT}),\\1\\)\\}`, `${label} constructor`)[3];
  const booleanType = constructor(boolean, "native boolean");
  one(boolean.source, `(?:^|[^\\w$])${escape(booleanType)}=${MEMBER}\\("ZodBoolean",`, "native boolean type");
  const numberType = constructor(number, "native number");
  const numberHead = one(number.source, `(?:^|[^\\w$])${escape(numberType)}=${MEMBER}\\("ZodNumber",\\((${IDENT}),(${IDENT})\\)=>\\{(${MEMBER})\\.init\\(\\1,\\2\\),`, "native number type");
  const base = nativeResolve(source, number.scope, numberHead[3], "native finite number");
  one(base.source, `(?:^|[^\\w$])${escape(base.name)}=${MEMBER}\\("\\$ZodNumber",[\\s\\S]{0,350}?if\\("number"==typeof (${IDENT})&&!Number\\.isNaN\\(\\1\\)&&Number\\.isFinite\\(\\1\\)\\)return ${IDENT};`, "native finite number parser");
  const methods = one(number.source, `(?:^|[^\\w$])${escape(numberType)}=${MEMBER}\\("ZodNumber",[\\s\\S]{0,250}?isFinite=!0\\},${MEMBER}\\(\\{[\\s\\S]{0,700}?\\},\\{([\\s\\S]{0,1500}?)\\}\\)\\)`, "native number methods")[1];
  for (const method of ["min", "max"])
    one(methods, `(?:^|,)${method}\\((${IDENT}),(${IDENT})\\)\\{return this\\.check\\((${MEMBER})\\(\\1,\\2\\)\\)\\}`, `native number ${method} bound`);
  if (file.endsWith("worker.js")) {
    const integer = one(methods, `(?:^|,)int\\((${IDENT})\\)\\{var (${IDENT});return this\\.check\\(\\(\\2=\\1,(${MEMBER})\\((${IDENT}),\\2\\)\\)\\)\\}`, "native integer method");
    one(number.source, `(?:^|[^\\w$])${escape(integer[4])}=${MEMBER}\\("ZodNumberFormat",`, "native integer format");
  } else {
    const integer = one(methods, `(?:^|,)int\\((${IDENT})\\)\\{return this\\.check\\((${IDENT})\\(\\1\\)\\)\\}`, "native integer method");
    const format = one(number.source, `function ${escape(integer[2])}\\((${IDENT})\\)\\{return ${MEMBER}\\((${IDENT}),\\1\\)\\}`, "native integer constructor")[2];
    one(number.source, `(?:^|[^\\w$])${escape(format)}=${MEMBER}\\("ZodNumberFormat",`, "native integer format");
  }
  const objectType = one(object.source, `function ${escape(object.name)}\\((${IDENT}),(${IDENT})\\)\\{return new (${IDENT})\\(\\{type:"object",shape:\\1\\?\\?\\{\\},\\.\\.\\.${MEMBER}\\(\\2\\)\\}\\)\\}`, "native object constructor")[3];
  const strict = one(object.source, `(?:^|[^\\w$])${escape(objectType)}=${MEMBER}\\("ZodObject",[\\s\\S]{0,700}?(?:\\{|,)strict\\(\\)\\{return this\\.clone\\((${MEMBER})\\(this\\._zod\\.def,\\{catchall:([^{}]{1,100})\\}\\)\\)\\}`, "native strict object method");
  const merge = nativeResolve(source, object.scope, strict[1], "native strict merge");
  one(merge.source, `function ${escape(merge.name)}\\(\\.\\.\\.(${IDENT})\\)\\{let (${IDENT})=\\{\\};for\\(let (${IDENT}) of \\1\\)Object\\.assign\\(\\2,Object\\.getOwnPropertyDescriptors\\(\\3\\)\\);return Object\\.defineProperties\\(\\{\\},\\2\\)\\}`, "native strict descriptor merge");
  let neverType;
  if (file.endsWith("worker.js")) neverType = one(strict[2], `^${MEMBER}\\((${IDENT}),void 0\\)$`, "native strict never constructor")[1];
  else neverType = constructor({ ...object, name: one(strict[2], `^(${IDENT})\\(\\)$`, "native strict never call")[1] }, "native strict never");
  one(object.source, `(?:^|[^\\w$])${escape(neverType)}=${MEMBER}\\("ZodNever",`, "native strict never type");
  return { boolean: boolean.name, number: number.name, object: object.name, schemaPath: file };
}

function exportedLocal(source, exported, label) {
  const found = [];
  for (const statement of matches(source, "export\\{([^}]+)\\}")) {
    for (const raw of statement[1].split(",")) {
      const [local, alias = local] = raw.trim().split(/\s+as\s+/);
      if (alias === exported) found.push(local);
    }
  }
  if (found.length !== 1) fail(`${label}: expected one named export, found ${found.length}`);
  return found[0];
}
function importedBinding(files, file, local) {
  const found = [];
  for (const statement of matches(files.get(file), 'import\\{([^}]+)\\}from"([^"\\n]+)"')) {
    for (const raw of statement[1].split(",")) {
      const [exported, alias = exported] = raw.trim().split(/\s+as\s+/);
      if (alias === local) found.push({ exported, target: path.posix.normalize(path.posix.join(path.posix.dirname(file), statement[2])) });
    }
  }
  if (found.length !== 1) fail(`execution import ${local}: expected one binding, found ${found.length}`);
  const { target, exported } = found[0];
  const source = files.get(target);
  if (!source) fail(`missing execution import target: ${target}`);
  return { path: target, source, local: exportedLocal(source, exported, `execution import ${local}`) };
}

// Registry aggregates include inline default arrays. Bound the owning array
// before looking for the registry spread so a later unrelated array cannot
// satisfy the link. This contract accepts plain arrays and quoted literals;
// regexes, comments and template interpolation require a fresh review.
function registryAggregate(source, registryName, category) {
  const candidates = [];
  for (const start of matches(source, `(?:^|[^\\w$])(${IDENT})=\\[(?=\\.\\.\\.Object\\.values\\()`)) {
    const open = start.index + start[0].length - 1;
    const spread = `...Object.values(${registryName})`;
    let depth = 0, parens = 0, braces = 0, direct = 0, quote = null, complete = false;
    for (let index = open; index < Math.min(source.length, open + 6000); index++) {
      const char = source[index];
      if (quote) {
        if (char === "\\") { index++; continue; }
        if (quote === "`" && char === "$" && source[index + 1] === "{") break;
        if (char === quote) quote = null;
        continue;
      }
      if (["\"", "'", "`"].includes(char)) { quote = char; continue; }
      if (char === "/") break;
      if (depth === 1 && parens === 0 && braces === 0 && ["[", ","].includes(source[index - 1])
        && source.startsWith(spread, index) && [",", "]"].includes(source[index + spread.length])) direct++;
      if (char === "(") parens++;
      if (char === ")" && --parens < 0) break;
      if (char === "{") braces++;
      if (char === "}" && --braces < 0) break;
      if (char === "[") depth++;
      if (char === "]" && --depth === 0) { complete = parens === 0 && braces === 0; break; }
    }
    if (complete && direct === 1) candidates.push(start[1]);
  }
  if (candidates.length !== 1) fail(`${category} derived definitions: expected one connected aggregate, found ${candidates.length}`);
  return candidates[0];
}

function discoverRegistries(files) {
  const inventory = [];
  for (const [file, fullSource] of files) {
    const keys = matches(fullSource, `(?:\\bagentUsageResetEnabled|["\'\x60]agentUsageResetEnabled["\'\x60])\\s*:\\s*${CALLABLE}\\(\\{`);
    if (!keys.length) continue;
    const category = categories.find(([, pattern]) => pattern.test(file))?.[0];
    if (!category) fail(`unexpected registry definition in ${file}`);
    if (keys.length !== 1) fail(`duplicate ${category} registry definition`);
    const native = category === "main" || category === "worker";
    const scope = native ? nativeScope(fullSource, keys[0].index) : null;
    const source = scope?.source ?? fullSource, q = native ? '"' : "\x60";
    const property = one(source, `agentUsageResetEnabled:(${CALLABLE})\\(\\{agentAccess:${q}read-only${q},default:!1,description:${q}Whether Codex can use usage resets after explicit user authorization${q},key:${q}agent-usage-reset-enabled${q},schema:(${MEMBER})\\}\\)`, `${category} master definition`);
    const factory = property[1], boolean = property[2];
    const factoryBinding = native ? nativeResolve(fullSource, scope, factory.replace(/^\(0,|\)$/g, ""), `${category} persisted factory`) : { source, name: factory };
    one(factoryBinding.source, `function ${escape(factoryBinding.name)}\\(\\{agentAccess:(${IDENT}),default:(${IDENT}),description:(${IDENT}),key:(${IDENT}),schema:(${IDENT})\\}\\)\\{return\\{agentAccess:\\1,default:\\2,description:\\3,key:\\4,hostStorage:\\{kind:${q}persisted-atom${q},key:\\4\\},schema:\\5\\}\\}`, `${category} persisted factory`);
    let appearanceSource = source, appearanceScope = scope;
    if (category === "main") {
      const resolved = nativeResolve(fullSource, scope, boolean, "main boolean definition");
      appearanceSource = resolved.source; appearanceScope = resolved.scope;
    }
    const font = one(appearanceSource, `(${MEMBER})\\(\\{family:(${MEMBER})\\(\\),fullName:\\2\\(\\),postscriptName:\\2\\(\\)\\}\\)`, `${category} appearance font schema`);
    const contrast = one(appearanceSource, `contrast:(${MEMBER})\\(\\)\\.int\\(\\)\\.min\\(0\\)\\.max\\(100\\)`, `${category} appearance contrast schema`);
    const aliases = { factory, boolean, object: font[1], number: contrast[1] };
    if (category === "main") {
      const namespace = one(source, `schema:(${IDENT})\\.number\\(\\)\\.int\\(\\)\\.nonnegative\\(\\)`, "main registry schema namespace")[1];
      aliases.object = `${namespace}.object`; aliases.number = `${namespace}.number`;
      for (const [role, binding] of [["object", font[1]], ["number", contrast[1]]]) {
        const appearance = nativeResolve(fullSource, appearanceScope, binding, `main appearance ${role}`);
        const registry = nativeResolve(fullSource, scope, aliases[role], `main registry ${role}`);
        if (appearance.name !== registry.name || appearance.scope.id !== registry.scope.id) fail(`main ${role} schema linkage changed`);
      }
    }
    const schemas = native ? verifyNativeSchema(fullSource, scope, aliases, file) : verifySchema(files, file, source, aliases);
    const prefix = source.slice(Math.max(0, property.index - 6000), property.index);
    const registryName = one(prefix, `(?:^|[^\\w$])(${IDENT})=\\{confirmBeforeClose:[^;{}]*(?:\\([^;]*?)?$`, `${category} definition object binding`)[1];
    const aggregate = registryAggregate(source, registryName, category);
    const list = one(source, `(?:^|[^\\w$])(${IDENT})=\\[\\.\\.\\.${escape(aggregate)}\\]`, `${category} derived list`)[1];
    one(source, `new Map\\(${escape(list)}\\.map\\((${IDENT})=>\\[\\1\\.key,\\1\\]\\)\\)`, `${category} derived key map`);
    if (category === "main") {
      const keyMap = one(source, `(?:^|[^\\w$])(${IDENT})=new Map\\(${escape(list)}\\.map\\((${IDENT})=>\\[\\2\\.key,\\2\\]\\)\\)`, "main key map binding")[1];
      const lookup = one(source, `function (${IDENT})\\((${IDENT})\\)\\{return ${escape(keyMap)}\\.get\\(\\2\\)\\}`, "main definition lookup")[1];
      const schema = one(source, `function (${IDENT})\\((${IDENT})\\)\\{return ${escape(lookup)}\\(\\2\\)\\.schema\\}`, "main schema lookup")[1];
      const validator = one(source, `function (${IDENT})\\((${IDENT}),(${IDENT})\\)\\{return ${escape(schema)}\\(\\2\\)\\.parse\\(\\3\\)\\}`, "main schema validator")[1];
      for (const [local, role] of [[list, "list"], [lookup, "definition lookup"], [schema, "schema lookup"], [validator, "validator"]]) {
        const table = one(source, `${escape(scope.loader)}\\.d\\(${escape(scope.exports)},\\{([\\s\\S]{0,15000}?)\\}\\);var ${IDENT}=${escape(scope.loader)}\\([0-9]+\\)`, "main settings export table")[1];
        one(table, `(?:^|,)${IDENT}:\\(\\)=>${escape(local)}(?=,|$)`, `main ${role} export`);
      }
    }
    noCollisions(source, ["codexLinuxAgentUsageResetPolicy"]);
    inventory.push({ category, path: file, property: property[0], offset: fullSource.indexOf(property[0]), registryName, aliases, schemas, aggregate, list });
  }
  for (const [category] of categories) {
    const count = inventory.filter(item => item.category === category).length;
    if (count !== 1) fail(`${category} registry: expected exactly one definition, found ${count}`);
  }
  if (inventory.length !== 4) fail("expected exactly four registry definitions");
  return inventory;
}

// Native request disposal must preserve the read result and propagate failure.
function nativeSettingReader(source, name) {
  const reader = one(source, `async function (${name ? escape(name) : IDENT})\\((${IDENT})\\)\\{if\\((${IDENT})\\?\\.settings!=null\\)return\\(await (${IDENT})\\(\\3\\.settings\\.read\\(\\2\\.key\\)\\)\\)\\.effective;throw Error\\(\x60Settings are unavailable on this host\x60\\)\\}`, "authoritative desktop setting reader");
  one(source, `async function ${escape(reader[4])}\\((${IDENT}),(${IDENT})\\)\\{let (${IDENT})=!1,(${IDENT})=\\(\\)=>\\{\\3\\|\\|\\(\\3=!0,\\1\\[Symbol\\.dispose\\]\\?\\.\\(\\)\\)\\};\\2\\?\\.addEventListener\\(\x60abort\x60,\\4,\\{once:!0\\}\\);try\\{\\2\\?\\.throwIfAborted\\(\\);let (${IDENT})=await \\1;return \\2\\?\\.throwIfAborted\\(\\),\\5\\}finally\\{\\2\\?\\.removeEventListener\\(\x60abort\x60,\\4\\),\\4\\(\\)\\}\\}`, "native setting request wrapper");
  return reader[1];
}

function discoverExecution(files, registries = discoverRegistries(files)) {
  const candidates = [...files].filter(([, source]) => source.includes("requires a nonempty idempotencyKey and no other arguments."));
  if (candidates.length !== 1) fail(`execution asset: expected exactly one, found ${candidates.length}`);
  const [file, source] = candidates[0];
  const handler = one(source, `async function (${IDENT})\\(\\{argumentsValue:${IDENT},readAuthMethod:${IDENT},isUsageResetEnabled:${IDENT},getSendRequest:${IDENT},invalidateUsage:${IDENT},logger:${IDENT},signal:${IDENT}\\}\\)\\{[\\s\\S]*?Usage reset could not be confirmed\\. Retry this attempt only with the same idempotencyKey\\.\x60\\}\\)\\)\\}\\}`, "execution handler declaration");
  const wrapper = one(source, `async function ${IDENT}\\(\\{scope:${IDENT},argumentsValue:${IDENT},hostId:${IDENT},queryClient:${IDENT},signal:${IDENT}\\}\\)\\{return ${escape(handler[1])}\\(\\{[\\s\\S]{0,1200}?signal:${IDENT}\\}\\)\\}`, "execution wrapper declaration");
  noCollisions(source, ["codexLinuxResetPolicy"]);
  const setting = one(wrapper[0], `isUsageResetEnabled:\\(\\)=>(${IDENT})\\((${IDENT})\\.agentUsageResetEnabled\\)`, "execution native setting bindings");
  const reader = importedBinding(files, file, setting[1]);
  const definitions = importedBinding(files, file, setting[2]);
  const renderer = registries.find(entry => entry.category === "renderer");
  if (definitions.path !== renderer.path || definitions.local !== renderer.registryName) fail("execution definition import does not resolve to native registry");
  nativeSettingReader(reader.source, reader.local);
  return { path: file, handler: handler[0], wrapper: wrapper[0], generated: executionSources(handler[0], wrapper[0]), policySource: policySource() };
}

// This component-local state machine is serialized verbatim for the renderer.
// Only its caller owns native I/O and the render notification lifetime.
function createUsageResetController({ read, write, changed }, policy) {
  const invalidDraftError = "Enter a whole percentage from 1 to 99. This value has not been applied.";
  let master = false, accepted = { enabled: false, remainingPercent: 10 };
  let draft = "10", focused = false, dirty = false, pending = false, available = true, error = null;
  let nativeValue, nativeRevision = 0;
  const notify = () => changed();
  const discard = () => { draft = String(accepted.remainingPercent); dirty = false; error = null; };
  function snapshot() {
    return {
      master, accepted: { ...accepted }, draft, focused, dirty, pending, available, error,
      switchDisabled: !master || pending || !available,
      fieldDisabled: !master || !accepted.enabled || pending || !available,
      effective: master ? policy.effectiveThreshold(accepted) : null,
    };
  }
  function sync(nextMaster, next) {
    if (next !== nativeValue) { nativeValue = next; nativeRevision++; }
    master = nextMaster === true;
    available = policy.isPolicy(next);
    if (available) accepted = { enabled: next.enabled, remainingPercent: next.remainingPercent };
    if (!master || !accepted.enabled) discard();
    else if (!(focused && dirty)) {
      draft = String(accepted.remainingPercent);
      dirty = false;
      if (error === invalidDraftError) error = null;
    }
    if (!available) error = "Usage reset settings are unavailable or invalid.";
    else if (error === "Usage reset settings are unavailable or invalid.") error = null;
    notify();
  }
  async function submit(next) {
    pending = true;
    notify();
    try {
      await write(next);
      const revisionBeforeRead = nativeRevision;
      let current;
      try { current = await read(); }
      catch { current = null; }
      // A later native subscription supersedes the snapshot of an in-flight
      // read, including failed reads. A master-only sync with the same native
      // object is not a policy edit.
      if (nativeRevision === revisionBeforeRead) {
        if (!policy.isPolicy(current)) {
          available = false;
          throw new TypeError("Invalid usage reset policy read");
        }
        sync(master, current);
      }
      else if (!available) throw new TypeError("Invalid later usage reset policy");
      discard();
    } catch {
      discard();
      error = "Couldn't apply reset threshold setting.";
    } finally {
      pending = false;
      notify();
    }
  }
  function commitDraft() {
    if (snapshot().fieldDisabled || !dirty) return;
    const value = policy.parseRemainingText(draft);
    if (value === null) {
      error = invalidDraftError;
      notify();
      return;
    }
    if (value === accepted.remainingPercent) { discard(); notify(); return; }
    return submit({ ...accepted, remainingPercent: value });
  }
  return {
    snapshot, sync,
    focus() { focused = true; },
    edit(text) {
      if (snapshot().fieldDisabled) return;
      draft = text; dirty = true; error = null; notify();
    },
    escape() { discard(); notify(); },
    blur() { focused = false; return commitDraft(); },
    enter: commitDraft,
    toggle(enabled) {
      if (snapshot().switchDisabled) return;
      discard();
      if (enabled === accepted.enabled) { notify(); return; }
      return submit({ ...accepted, enabled });
    },
  };
}
const usageControllerSource = () => `(${createUsageResetController.toString()})`;

function discoverUsage(files, registries = discoverRegistries(files)) {
  const candidates = [];
  for (const [file, source] of files) {
    for (const match of matches(source, `function (${IDENT})\\(\\)\\{let (${IDENT})=\\(0,(${IDENT})\\.c\\)\\(6\\),(${IDENT})=(${IDENT})\\((${IDENT})\\),(${IDENT})=(${IDENT})\\(\\),(${IDENT})=(${IDENT})\\((${IDENT})\\.agentUsageResetEnabled\\),[\\s\\S]{0,2200}?\\2\\[5\\],${IDENT}\\}`)) {
      if (match[0].includes("settings.usage.resets.agentEnabled.label")) candidates.push({ file, source, match });
    }
  }
  if (candidates.length !== 1) fail(`Usage row: expected exactly one, found ${candidates.length}`);
  const { file, source, match } = candidates[0];
  const original = match[0];
  const [, componentName, , compiler, store, storeHook, storeAtom, formatter, formatterHook, master, subscription, definitions] = match;
  const label = one(original, `\\(0,(${IDENT})\\.jsx\\)\\((${IDENT}),\\{id:\x60settings\\.usage\\.resets\\.agentEnabled\\.label\x60,defaultMessage:\x60[^\x60]+\x60,description:\x60[^\x60]+\x60\\}\\)`, "Usage master label");
  const [, jsx, message] = label;
  const structure = one(original, `\\(0,${escape(jsx)}\\.jsx\\)\\((${IDENT}),\\{children:\\(0,${escape(jsx)}\\.jsx\\)\\(\\1\\.Content,\\{children:\\(0,${escape(jsx)}\\.jsx\\)\\((${IDENT}),\\{children:\\(0,${escape(jsx)}\\.jsx\\)\\((${IDENT}),\\{label:${IDENT},description:${IDENT},control:(${IDENT})=>\\(0,${escape(jsx)}\\.jsx\\)\\((${IDENT}),\\{\\.\\.\\.\\4,checked:${escape(master)},onChange:`, "Usage row/group/switch bindings");
  const [, group, content, row, controlParameter, switchComponent] = structure;
  const masterHandler = one(original, `onChange:(${IDENT})=>\\{(${IDENT})\\(${escape(store)},${escape(definitions)}\\.agentUsageResetEnabled,\\1\\)\\.catch\\(\\(\\)=>\\{${escape(store)}\\.get\\((${IDENT})\\)\\.danger\\(${escape(formatter)}\\.formatMessage\\(\\{id:\x60settings\\.usage\\.resets\\.agentEnabled\\.error\x60,defaultMessage:\x60[^\x60]+\x60,description:\x60[^\x60]+\x60\\}\\),\\{errorAnalytics:\\{toastId:\x60settings\\.usage\\.resets\\.agentEnabled\\.error\x60\\}\\}\\)\\}\\)\\}`, "Usage original master handler");
  const writer = masterHandler[2], toast = masterHandler[3];
  const native = importedBinding(files, file, definitions);
  const renderer = registries.find(entry => entry.category === "renderer");
  if (native.path !== renderer.path || native.local !== renderer.registryName) fail("Usage definitions do not resolve to native renderer registry");
  for (const local of [storeHook, storeAtom, formatterHook, subscription, group, content, row, switchComponent, message, writer, toast]) importedBinding(files, file, local);

  // Resolve the namespace through the existing lazy initialization chain. Only
  // inspect initializer text; never run it or borrow an uninitialized namespace.
  const initializers = matches(source, `function (${IDENT})\\(\\)\\{return\\(\\1=${IDENT}\\(\\(\\(\\)=>\\{([\\s\\S]{0,1500}?)\\}\\)\\)\\)\\(\\)\\}`);
  const rowInitializers = initializers.filter(item => new RegExp(`${escape(compiler)}=${IDENT}\\(\\)`).test(item[2]) && new RegExp(`${escape(jsx)}=(${IDENT})\\(\\)`).test(item[2]));
  if (rowInitializers.length !== 1) fail("Usage JSX initializer linkage is missing or ambiguous");
  const rowInitializer = rowInitializers[0];
  const jsxFactory = one(rowInitializer[2], `${escape(jsx)}=(${IDENT})\\(\\)`, "Usage JSX factory")[1];
  importedBinding(files, file, jsxFactory);
  const reactBindings = [];
  for (const initializer of initializers) {
    if (!new RegExp(`(?:^|[^\\w$])${escape(initializer[1])}\\(\\)`).test(rowInitializer[2])) continue;
    for (const assignment of matches(initializer[2], `(${IDENT})=(${IDENT})\\(\\)`)) {
      if (["useRef", "useId", "useState"].every(hook => new RegExp(`\\(0,${escape(assignment[1])}\\.${hook}\\)\\(`).test(source))) {
        importedBinding(files, file, assignment[2]);
        reactBindings.push(assignment[1]);
      }
    }
  }
  if (reactBindings.length !== 1) fail("Usage initialized React namespace is missing or ambiguous");
  const react = reactBindings[0];

  const styleSurface = uniqueSurface(files, `(${IDENT})=\\{([^{}]*inputContainer:${IDENT}[^{}]*)\\}`, "Usage native numeric style map");
  const styleImports = matches(source, 'import\\{([^}]+)\\}from"([^"\\n]+)"').filter(statement => path.posix.normalize(path.posix.join(path.posix.dirname(file), statement[2])) === styleSurface.path);
  if (styleImports.length !== 1) fail("Usage numeric style import is missing or ambiguous");
  const styleMap = styleSurface.match;
  const styleInitializers = matches(files.get(styleSurface.path), `function (${IDENT})\\(\\)\\{return\\(\\1=${IDENT}\\(\\(\\(\\)=>\\{([\\s\\S]{0,1500}?)\\}\\)\\)\\)\\(\\)\\}`).filter(item => item[2].includes(styleMap[0]));
  if (styleInitializers.length !== 1) fail("Usage numeric style initializer is missing or ambiguous");
  const styles = {};
  for (const role of ["helper", "inputContainer", "input", "endContent"]) {
    const binding = one(styleMap[2], `(?:^|,)${role}:(${IDENT})(?=,|$)`, `Usage ${role} style binding`)[1];
    styles[role] = one(styleInitializers[0][2], `(?:^|,)${escape(binding)}=\x60([^\x60]+)\x60`, `Usage ${role} class`)[1];
  }

  const reader = nativeSettingReader(native.source);
  const readerExports = [];
  for (const statement of matches(native.source, "export\\{([^}]+)\\}")) {
    for (const raw of statement[1].split(",")) {
      const [local, exported = local] = raw.trim().split(/\s+as\s+/);
      if (local === reader) readerExports.push(exported);
    }
  }
  if (readerExports.length !== 1) fail("Usage native reader export is missing or ambiguous");
  const importCandidates = matches(source, 'import\\{([^}]+)\\}from"([^"\\n]+)";').filter(statement => path.posix.normalize(path.posix.join(path.posix.dirname(file), statement[2])) === native.path);
  if (importCandidates.length !== 1) fail("Usage native shared import is missing or ambiguous");
  const statement = importCandidates[0];
  const existingReaders = statement[1].split(",").map(raw => raw.trim().split(/\s+as\s+/)).filter(parts => parts[0] === readerExports[0]);
  if (existingReaders.length > 1) fail("Usage native reader import is ambiguous");
  const readerAlias = existingReaders.length ? existingReaders[0][1] || existingReaders[0][0] : "codexLinuxReadResetPolicy";
  const introduced = ["codexLinuxCreateResetController", "codexLinuxResetPolicy", "codexLinuxResetNotify", "codexLinuxResetController", "codexLinuxResetRevision", "codexLinuxResetSetRevision", "codexLinuxResetNative", "codexLinuxResetSnapshot", "codexLinuxResetCurrent", "codexLinuxResetId", "codexLinuxResetErrorId", "codexLinuxResetSwitchDisabled", "codexLinuxResetFieldDisabled", "codexLinuxResetDraft", "codexLinuxResetError", "codexLinuxResetLabel"];
  noCollisions(source, existingReaders.length ? introduced : [...introduced, readerAlias]);
  const bindings = { componentName, storeHook, storeAtom, formatterHook, subscription, definitions, jsx, row, group, content, switch: switchComponent, message, writer, toast, react, styles, reader: readerAlias };
  const readerImport = { original: statement[0], replacement: existingReaders.length ? statement[0] : statement[0].replace("}from", `,${readerExports[0]} as ${readerAlias}}from`), path: native.path, alias: readerAlias, exported: readerExports[0] };
  return { path: file, original, component: usageComponentSource(bindings, { store, formatter, master, controlParameter, label: label[0], masterHandler: masterHandler[0] }), bindings, controllerSource: usageControllerSource(), policySource: policySource(), readerImport };
}

function usageComponentSource(b, original) {
  const { store, formatter, master, controlParameter, label, masterHandler } = original;
  const element = (type, props) => `(0,${b.jsx}.${props.includes("children:[") ? "jsxs" : "jsx"})(${type},{${props}})`;
  const message = (id, text, description) => element(b.message, `id:${JSON.stringify(`codexLinux.usageResetThreshold.${id}`)},defaultMessage:${JSON.stringify(text)},description:${JSON.stringify(description)}`);
  const masterHelp = message("masterHelp", MASTER_HELP, "Explains explicit authorization and the active local threshold for agent resets");
  const masterRow = element(b.row, `label:${label},description:${masterHelp},control:${controlParameter}=>${element(b.switch, `...${controlParameter},checked:${master},${masterHandler}`)}`);
  const customRow = element(b.row, `label:${message("customLabel", "Use custom reset threshold", "Label for opting into a custom local agent reset threshold")},control:props=>${element(b.switch, "...props,checked:codexLinuxResetCurrent.enabled,disabled:codexLinuxResetSwitchDisabled,onChange:value=>{if(!codexLinuxResetSwitchDisabled)return codexLinuxResetController.current.toggle(value)}")}`);
  const error = element("\"div\"", `id:codexLinuxResetErrorId,className:${JSON.stringify(b.styles.helper)},role:"alert",children:codexLinuxResetError`);
  const input = element("\"input\"", `id:codexLinuxResetId,type:"text",inputMode:"numeric",min:1,max:99,step:1,value:codexLinuxResetDraft,disabled:codexLinuxResetFieldDisabled,"aria-label":codexLinuxResetLabel,"aria-describedby":codexLinuxResetError?codexLinuxResetErrorId:void 0,"aria-invalid":!!codexLinuxResetError,className:${JSON.stringify(b.styles.input)},onFocus:()=>codexLinuxResetController.current.focus(),onChange:event=>{if(!codexLinuxResetFieldDisabled)codexLinuxResetController.current.edit(event.target.value)},onBlur:()=>{if(!codexLinuxResetFieldDisabled)return codexLinuxResetController.current.blur()},onKeyDown:event=>{if(event.key==="Enter"){event.preventDefault();if(!codexLinuxResetFieldDisabled)return codexLinuxResetController.current.enter()}else if(event.key==="Escape"){event.preventDefault();codexLinuxResetController.current.escape()}}`);
  const unit = element("\"span\"", `className:${JSON.stringify(b.styles.endContent)},"aria-hidden":true,children:"%"`);
  const inputGroup = element("\"div\"", `className:${JSON.stringify(b.styles.inputContainer)},"data-disabled":codexLinuxResetFieldDisabled||void 0,"data-invalid":!!codexLinuxResetError||void 0,children:[${input},${unit}]`);
  const fieldRow = element(b.row, `label:codexLinuxResetLabel,description:codexLinuxResetError?${error}:null,control:()=>${inputGroup}`);
  const rows = element(b.content, `children:[${masterRow},${customRow},${fieldRow}]`);
  const group = element(b.group, `children:${element(`${b.group}.Content`, `children:${rows}`)}`);
  return `function ${b.componentName}(){
const ${store}=${b.storeHook}(${b.storeAtom}),${formatter}=${b.formatterHook}(),${master}=${b.subscription}(${b.definitions}.agentUsageResetEnabled),codexLinuxResetNative=${b.subscription}(${b.definitions}.codexLinuxAgentUsageResetPolicy);
const [codexLinuxResetRevision,codexLinuxResetSetRevision]=(0,${b.react}.useState)(0),codexLinuxResetNotify=(0,${b.react}.useRef)(null),codexLinuxResetController=(0,${b.react}.useRef)(null),codexLinuxResetId=(0,${b.react}.useId)(),codexLinuxResetErrorId=codexLinuxResetId+"-error";
if(codexLinuxResetController.current===null){codexLinuxResetController.current=codexLinuxCreateResetController({read:()=>${b.reader}(${b.definitions}.codexLinuxAgentUsageResetPolicy),write:value=>${b.writer}(${store},${b.definitions}.codexLinuxAgentUsageResetPolicy,value,{optimistic:false}),changed:()=>codexLinuxResetNotify.current?.()},codexLinuxResetPolicy);codexLinuxResetController.current.sync(${master},codexLinuxResetNative)}
(0,${b.react}.useEffect)(()=>{codexLinuxResetNotify.current=()=>codexLinuxResetSetRevision(value=>value+1);return()=>{codexLinuxResetNotify.current=null}},[]);
(0,${b.react}.useEffect)(()=>{codexLinuxResetController.current.sync(${master},codexLinuxResetNative)},[${master},codexLinuxResetNative]);
const codexLinuxResetSnapshot=codexLinuxResetController.current.snapshot(),codexLinuxResetCurrent=codexLinuxResetPolicy.isPolicy(codexLinuxResetNative)?codexLinuxResetNative:codexLinuxResetSnapshot.accepted,codexLinuxResetSwitchDisabled=!${master}||codexLinuxResetSnapshot.pending||!codexLinuxResetSnapshot.available||!codexLinuxResetPolicy.isPolicy(codexLinuxResetNative),codexLinuxResetFieldDisabled=codexLinuxResetSwitchDisabled||!codexLinuxResetCurrent.enabled,codexLinuxResetDraft=!${master}||!codexLinuxResetCurrent.enabled?String(codexLinuxResetPolicy.effectiveThreshold(codexLinuxResetCurrent)):codexLinuxResetSnapshot.draft;
const codexLinuxResetLabel=${formatter}.formatMessage({id:"codexLinux.usageResetThreshold.fieldLabel",defaultMessage:"Reset threshold",description:"Accessible label for the whole remaining percentage threshold"}),codexLinuxResetError=codexLinuxResetSnapshot.error?${formatter}.formatMessage({id:codexLinuxResetSnapshot.error.startsWith("Enter a whole")?"codexLinux.usageResetThreshold.invalidDraft":codexLinuxResetSnapshot.error.startsWith("Couldn't apply")?"codexLinux.usageResetThreshold.applyFailed":"codexLinux.usageResetThreshold.settingsUnavailable",defaultMessage:codexLinuxResetSnapshot.error,description:"Explains why the reset threshold setting was not applied"}):null;
return ${group}}
`;
}

const CATALOG_STOCK_THRESHOLD = "Every call checks fresh core usage: either the five-hour or weekly window must have 10% or less remaining.";
const CATALOG_CURRENT_THRESHOLD = "Each call requires the Usage setting allowing Codex to use resets, reads fresh core Codex usage, and checks the remaining-percentage threshold: 10% unless custom mode is enabled in Usage settings. Custom mode uses the saved threshold from 1% to 99%, allowing resets above the standard 10% remaining limit. Either available core window can qualify. Unavailable usage never qualifies.";
const MASTER_HELP = "Allow your assistant to use a reset only when you explicitly request it during a conversation and your remaining usage is at or below the reset threshold. Resets are never used automatically.";

function uniqueSurface(files, pattern, label, accept = () => true) {
  const found = [];
  for (const [file, source] of files) for (const match of matches(source, pattern)) {
    if (accept(match, file)) found.push({ path: file, original: match[0], match });
  }
  if (found.length !== 1) fail(`${label}: expected exactly one, found ${found.length}`);
  return found[0];
}
function discoverMetadata(files) {
  const catalog = uniqueSurface(files, `var (${IDENT}),(${IDENT}),(${IDENT});function (${IDENT})\\(\\)\\{return\\(\\4=${IDENT}\\(\\(\\(\\)=>\\{${IDENT}\\(\\),\\1=\x60consume_usage_reset\x60,\\2=[\\s\\S]{0,1800}?inputSchema:${IDENT}\\(\\)\\.parse\\(${IDENT}\\(\\2\\)\\)\\}\\}\\)\\)\\)\\(\\)\\}`, "reset catalog constructor");
  const description = one(catalog.original, "description:\x60([^\x60]+)\x60,inputSchema:", "reset catalog description")[1];
  if (description.split(CATALOG_STOCK_THRESHOLD).length !== 2) fail("reset catalog threshold sentence is missing or duplicated");
  catalog.replacement = catalog.original.replace(CATALOG_STOCK_THRESHOLD, CATALOG_CURRENT_THRESHOLD);
  const record = "\\{defaultMessage:\x60(?:[^\x60\\\\]|\\\\[\\s\\S])*\x60,id:\x60[^\x60]+\x60\\}";
  const search = uniqueSurface(files, `\\busage:\\[(?:${record})(?:,${record})*\\]`, "Usage search section", match => match[0].includes("settings.usage.resets.agentEnabled.label"));
  one(files.get(search.path), "export\\{[^}]*\\bas settingsSearchDocuments\\}", "settings search export");
  const stockHelp = one(search.original, "\\{defaultMessage:\x60Allow your assistant to use a reset only when you explicitly request it during a conversation and your current limit has 10% or less remaining\\. Resets are never used automatically\\.\x60,id:\x60settings\\.usage\\.resets\\.agentEnabled\\.description\x60\\}", "Usage stock help record")[0];
  one(search.original, "id:\x60settings\\.usage\\.resets\\.agentEnabled\\.label\x60", "Usage master search label");
  const entry = (id, text) => `{defaultMessage:${JSON.stringify(text)},id:${JSON.stringify(`codexLinux.usageResetThreshold.${id}`)}}`;
  const added = [entry("masterHelp", MASTER_HELP), entry("customLabel", "Use custom reset threshold"), entry("fieldLabel", "Reset threshold")].join(",");
  search.replacement = search.original.replace(stockHelp, added);
  // The transaction can mark just the changed records, not the entire unrelated
  // Usage search array. The whole section remains useful to inert tests.
  search.edit = { original: stockHelp, replacement: added };

  const availability = uniqueSurface(files, `function (${IDENT})\\(\\{desktop:(${IDENT}),[\\s\\S]{0,4000}?supportsDynamicToolNamespaces:!0,additionalNamespaces:${IDENT}\\}\\)\\}`, "reset catalog availability", match => match[0].includes("agentUsageResetEnabled:"));
  const auth = one(availability.original, `authMethod:(${IDENT}),agentUsageResetEnabled:(${IDENT})=!1,`, "catalog auth/master aliases");
  const loading = one(availability.original, `isAuthLoading:(${IDENT}),isTabAvailable:`, "catalog auth loading alias")[1];
  const all = one(availability.original, `let (${IDENT})=(${IDENT})===\x60all\x60,`, "catalog all-mode alias")[1];
  const availableCatalog = one(availability.original, `\\.\\.\\.${escape(availability.match[2])}&&!${escape(loading)}&&${escape(auth[1])}===\x60chatgpt\x60\\?\\[${IDENT},\\.\\.\\.${escape(all)}\\|\\|${escape(auth[2])}\\?\\[(${IDENT})\\]:\\[\\]\\]:\\[\\]`, "catalog desktop/auth/master/all availability");
  const availableCatalogBinding = importedBinding(files, availability.path, availableCatalog[1]);
  if (availableCatalogBinding.path !== catalog.path || availableCatalogBinding.local !== catalog.match[3]) fail("catalog availability import does not resolve to reset catalog");
  return { catalog, search, availability };
}

function discoverPreserved(files, availability) {
  const gate = uniqueSurface(files, `transformOutgoingMessage:(${IDENT})=>\\{if\\("method"in \\1&&"account/rateLimitResetCredit/consume"===\\1\\.method&&!0!==this\\.options\\.settingsStore\\.getEffective\\(${IDENT}\\.${IDENT}\\.agentUsageResetEnabled\\.key\\)\\)throw new ${MEMBER}\\("Usage resets are disabled in settings\\."\\);return ${IDENT}\\?\\.\\(\\1\\)\\?\\?\\1\\},`, "main-process master gate");
  const manual = uniqueSurface(files, `function (${IDENT})\\((${IDENT})\\)\\{let\\{creditId:(${IDENT}),redeemRequestId:(${IDENT})\\}=\\2;return ${IDENT}\\.safePost\\(\x60/wham/rate-limit-reset-credits/consume\x60,\\{requestBody:\\{credit_id:\\3,redeem_request_id:\\4\\}\\}\\)\\}`, "manual reset HTTP path");
  const retry = uniqueSurface(files, `function (${IDENT})\\(\\)\\{let (${IDENT})=!1,(${IDENT});return\\{async redeem\\(\\{availableCount:${IDENT},consume:${IDENT},creditId:${IDENT}\\}\\)\\{[\\s\\S]{0,1000}?finally\\{\\2=!1\\}\\}\\}\\}`, "manual reset retry controller", match => match[0].includes("redeemRequestId:crypto.randomUUID()"));
  return [["main-master-gate", gate], ["manual-http", manual], ["manual-retry", retry], ["catalog-availability", availability]].map(([kind, item]) => ({ kind, path: item.path, source: item.original }));
}

// Replacement originals are bounded to the owning declarations or changed
// records. Additions use an empty original, so reconstruction needs no heuristic.
const MARKER_LIMITS = Object.freeze({
  "registry-main": 1024, "registry-worker": 1024, "registry-renderer": 1024, "registry-display-worker": 1024,
  "execution-handler": 5000, "execution-wrapper": 1500, "execution-policy": 0,
  "usage-component": 3000, "usage-factories": 0, "usage-reader": 0,
  catalog: 2200, search: 1000,
});
function marked(slot, original, generated) {
  if (!Object.hasOwn(MARKER_LIMITS, slot) || Buffer.byteLength(original) > MARKER_LIMITS[slot]) fail(`unbounded original for ${slot}`);
  const encoded = Buffer.from(original).toString("base64");
  return `/*${MARKER}:begin:v1:${slot}:${encoded}*/${generated}/*${MARKER}:end:v1:${slot}*/`;
}
function reconstruct(files) {
  const originals = new Map(), slots = new Set();
  for (const [file, source] of files) {
    const pattern = new RegExp(`/\\*${MARKER}:begin:v1:([a-z-]+):([A-Za-z0-9+/=]*)\\*/[\\s\\S]*?/\\*${MARKER}:end:v1:\\1\\*/`, "g");
    const restored = source.replace(pattern, (whole, slot, encoded) => {
      if (!Object.hasOwn(MARKER_LIMITS, slot) || slots.has(slot)) fail(`unknown or duplicate feature marker: ${slot}`);
      if (encoded.length > Math.ceil(MARKER_LIMITS[slot] / 3) * 4) fail(`unbounded original marker: ${slot}`);
      const bytes = Buffer.from(encoded, "base64"), original = bytes.toString("utf8");
      if (bytes.toString("base64") !== encoded || !Buffer.from(original).equals(bytes) || bytes.length > MARKER_LIMITS[slot]) fail(`invalid original marker encoding: ${slot}`);
      slots.add(slot);
      return original;
    });
    if (restored.includes(MARKER)) fail(`partial or malformed feature marker in ${file}`);
    originals.set(file, restored);
  }
  if (!slots.size) fail("partial feature markers do not contain a complete replacement");
  return originals;
}
function pristinePlan(files) {
  for (const [file, source] of files) {
    if (source.includes(MARKER) || source.includes("codexLinuxAgentUsageResetPolicy") || source.includes("codexLinuxResetPolicy")) fail(`partial or unverified feature marker in ${file}`);
  }
  const registries = discoverRegistries(files);
  const execution = discoverExecution(files, registries);
  const usage = discoverUsage(files, registries);
  const metadata = discoverMetadata(files);
  const preserved = discoverPreserved(files, metadata.availability);
  const changes = new Map();
  const replace = (file, original, replacement, slot) => {
    const current = changes.get(file) ?? files.get(file);
    if (original.length === 0 || current.split(original).length !== 2) fail(`ambiguous replacement: ${slot}`);
    changes.set(file, current.replace(original, marked(slot, original, replacement)));
  };
  for (const registry of registries) replace(registry.path, registry.property, `${registry.property},${registrySource(registry.aliases)}`, `registry-${registry.category}`);
  replace(execution.path, execution.handler, execution.generated.handler, "execution-handler");
  replace(execution.path, execution.wrapper, execution.generated.wrapper, "execution-wrapper");
  changes.set(execution.path, marked("execution-policy", "", `const codexLinuxResetPolicy=${execution.policySource};\n`) + changes.get(execution.path));
  replace(usage.path, usage.original, usage.component, "usage-component");
  changes.set(usage.path, marked("usage-factories", "", `const codexLinuxCreateResetController=${usage.controllerSource};const codexLinuxResetPolicy=${usage.policySource};\n`) + changes.get(usage.path));
  if (usage.readerImport.replacement !== usage.readerImport.original) {
    const source = changes.get(usage.path), original = usage.readerImport.original;
    if (source.split(original).length !== 2) fail("ambiguous Usage reader import replacement");
    const specifier = `,${usage.readerImport.exported} as ${usage.readerImport.alias}`;
    const replacement = original.replace("}from", `${marked("usage-reader", "", specifier)}}from`);
    changes.set(usage.path, source.replace(original, replacement));
  }
  replace(metadata.catalog.path, metadata.catalog.original, metadata.catalog.replacement, "catalog");
  replace(metadata.search.path, metadata.search.edit.original, metadata.search.edit.replacement, "search");
  for (const item of preserved) {
    if ((changes.get(item.path) ?? files.get(item.path)).split(item.source).length !== 2) fail(`preserved ${item.kind} changed or became ambiguous`);
  }
  return {
    changes,
    inventory: {
      assets: [...changes.keys()],
      registries: registries.map(({ category, path, registryName }) => ({ category, path, registryName })),
      execution: { path: execution.path }, usage: { path: usage.path },
      metadata: { catalog: { path: metadata.catalog.path }, search: { path: metadata.search.path } },
      preserved,
    },
    alreadyApplied: false,
  };
}
function planPatch(files) {
  if (!(files instanceof Map)) throw new TypeError("Expected a source Map");
  for (const [file, source] of files) if (typeof source !== "string") throw new TypeError(`Expected source text: ${file}`);
  if (![...files.values()].some(source => source.includes(MARKER))) return pristinePlan(files);
  const original = reconstruct(files), expected = pristinePlan(original);
  for (const [file, source] of files) {
    if (source !== (expected.changes.get(file) ?? original.get(file))) fail(`modified or incomplete generated feature body in ${file}`);
  }
  return { changes: new Map(), inventory: expected.inventory, alreadyApplied: true };
}

function verifySyntax(changes) {
  for (const [file, source] of changes) {
    const result = spawnSync(process.execPath, ["--input-type=" + (file.startsWith(".vite/") ? "commonjs" : "module"), "--check"], { input: source, encoding: "utf8", maxBuffer: 1024 * 1024, timeout: 30000 });
    if (result.error) throw result.error;
    if (result.status !== 0) fail(`generated syntax invalid in ${file}: ${result.stderr.trim()}`);
  }
}

function readSources(root) {
  const files = new Map();
  function visit(directory) {
    const absolute = path.join(root, directory);
    if (!fs.existsSync(absolute)) fail(`missing asset directory: ${directory}`);
    for (const entry of fs.readdirSync(absolute, { withFileTypes: true })) {
      const relative = path.posix.join(directory, entry.name);
      if (entry.isSymbolicLink()) fail(`unexpected asset symlink: ${relative}`);
      if (entry.isDirectory()) visit(relative);
      else if (entry.isFile() && entry.name.endsWith(".js")) files.set(relative, fs.readFileSync(path.join(root, relative), "utf8"));
    }
  }
  visit(".vite/build");
  visit("webview/assets");
  return files;
}
function applyUsageResetThreshold(root) {
  const files = readSources(root), planned = planPatch(files);
  // Discovery has verified all imported native roles and the introduced reader
  // export. Check complete owned assets even on reapplication: valid generated
  // markers do not prove that surrounding JavaScript still parses.
  verifySyntax(planned.alreadyApplied
    ? new Map(planned.inventory.assets.map(file => [file, files.get(file)]))
    : planned.changes);
  if (planned.alreadyApplied) return { changed: false, reason: "Usage reset threshold is already fully applied and verified." };
  const ordered = [...planned.changes].sort(([left], [right]) => left.localeCompare(right));
  const backups = new Map();
  for (const [file] of ordered) {
    const bytes = fs.readFileSync(path.join(root, file));
    if (!bytes.equals(Buffer.from(files.get(file)))) fail(`asset changed or is not UTF-8 during preflight: ${file}`);
    backups.set(file, bytes);
  }
  const attempted = [];
  try {
    for (const [file, source] of ordered) {
      attempted.push(file);
      fs.writeFileSync(path.join(root, file), source, "utf8");
      if (!fs.readFileSync(path.join(root, file)).equals(Buffer.from(source))) fail(`asset write verification failed: ${file}`);
    }
  } catch (failure) {
    const unrestored = [];
    for (const file of attempted) {
      try { fs.writeFileSync(path.join(root, file), backups.get(file)); } catch { /* Verify bytes independently below. */ }
      try {
        if (!fs.readFileSync(path.join(root, file)).equals(backups.get(file))) unrestored.push(file);
      } catch { unrestored.push(file); }
    }
    if (unrestored.length) throw new PatchIntegrityError(`Usage reset threshold restoration could not be verified: ${unrestored.join(", ")}`, { cause: failure });
    throw failure;
  }
  return { changed: true, reason: `Applied Usage reset threshold across ${ordered.length} verified assets.` };
}

const descriptors = [{ id: "usage-reset-threshold", phase: "extracted-app:pre-webview", order: 21000, ciPolicy: "opt-in", apply: applyUsageResetThreshold }];
module.exports = { discoverMetadata, discoverUsage, createUsageResetController, usageControllerSource, descriptors, planPatch, applyUsageResetThreshold, registrySource, executionSources, discoverRegistries, discoverExecution, readSources };
