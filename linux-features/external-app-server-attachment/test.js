#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const { spawn, spawnSync } = require("node:child_process");
const { EventEmitter, once } = require("node:events");
const fs = require("node:fs");
const net = require("node:net");
const os = require("node:os");
const path = require("node:path");
const { PassThrough } = require("node:stream");
const test = require("node:test");
const vm = require("node:vm");

const featureDir = __dirname;
const featuresRoot = path.dirname(featureDir);
const descriptorReader = path.join(featureDir, "descriptor-reader.js");

function withTree(callback) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "external-app-server-attachment-"));
  const configRoot = path.join(root, "config");
  const appId = "codex-desktop";
  const descriptorDir = path.join(configRoot, appId);
  const descriptorPath = path.join(descriptorDir, "app-server-attachment.json");
  fs.mkdirSync(descriptorDir, { recursive: true, mode: 0o700 });
  fs.chmodSync(descriptorDir, 0o700);
  try {
    return callback({ appId, configRoot, descriptorDir, descriptorPath, root });
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

function writeDescriptor(descriptorPath, value, mode = 0o600) {
  fs.writeFileSync(descriptorPath, `${JSON.stringify(value)}\n`, { mode });
  fs.chmodSync(descriptorPath, mode);
}

function loadReader() {
  assert.equal(fs.existsSync(descriptorReader), true, "descriptor reader must exist before behavior tests");
  delete require.cache[require.resolve(descriptorReader)];
  return require(descriptorReader);
}

function descriptor(socketPath = "/tmp/external-app-server.sock") {
  return { schemaVersion: 1, socketPath, transport: "unix" };
}

function stageFeature(appDir, enabled = ["external-app-server-attachment"]) {
  const { stageEnabledLinuxFeatureInstall } = require("../../scripts/lib/linux-features.js");
  const configRoot = fs.mkdtempSync(path.join(os.tmpdir(), "attachment-feature-config-"));
  const configPath = path.join(configRoot, "features.json");
  fs.writeFileSync(configPath, `${JSON.stringify({ enabled })}\n`);
  try {
    return stageEnabledLinuxFeatureInstall(appDir, { featuresRoot, featuresConfigPath: configPath });
  } finally {
    fs.rmSync(configRoot, { recursive: true, force: true });
  }
}

function stageHook(tree) {
  const appDir = path.join(tree.root, "app");
  const nodePath = path.join(appDir, "resources", "cua_node", "bin", "node");
  fs.mkdirSync(path.dirname(nodePath), { recursive: true });
  fs.symlinkSync(process.execPath, nodePath);
  const plan = stageFeature(appDir);
  const hook = plan.runtimeHooks.find((entry) => entry.key === "launcher");
  assert.ok(hook, "feature must stage a launcher hook");
  return { appDir, hook: path.join(appDir, hook.target) };
}

function hookEnv(tree, appDir, extra = {}) {
  const env = {
    ...process.env,
    CODEX_LINUX_APP_DIR: appDir,
    CODEX_LINUX_APP_ID: tree.appId,
    HOME: tree.root,
    XDG_CONFIG_HOME: tree.configRoot,
  };
  delete env.CODEX_LINUX_APP_SERVER_BRIDGE_ATTACH_ONLY;
  delete env.CODEX_LINUX_APP_SERVER_BRIDGE_SOCKET;
  delete env.CODEX_CLI_PATH;
  return { ...env, ...extra };
}

test("descriptor reader exposes the attachment contract", () => {
  loadReader();
});

test("descriptor reader accepts only the exact owner-only descriptor contract", () => {
  const reader = loadReader();
  withTree((tree) => {
    writeDescriptor(tree.descriptorPath, descriptor());
    assert.deepEqual(reader.readAttachmentDescriptor(tree.descriptorPath), { socketPath: "/tmp/external-app-server.sock" });
    for (const value of [
      [],
      { ...descriptor(), extra: true },
      { schemaVersion: 1, socketPath: "/tmp/external-app-server.sock" },
      descriptor("relative.sock"),
      descriptor("/tmp/../tmp/socket"),
      descriptor("/tmp/socket\u0000bad"),
      { ...descriptor(), transport: "tcp" },
    ]) {
      writeDescriptor(tree.descriptorPath, value);
      assert.throws(() => reader.readAttachmentDescriptor(tree.descriptorPath), /attachment descriptor/i);
    }
    writeDescriptor(tree.descriptorPath, descriptor(), 0o644);
    assert.throws(() => reader.readAttachmentDescriptor(tree.descriptorPath), /0600|attachment descriptor/i);
  });
});

test("descriptor reader treats only absence as a no-op and rejects hostile filesystem inputs", () => {
  const reader = loadReader();
  withTree((tree) => {
    assert.equal(reader.readAttachmentDescriptor(tree.descriptorPath), null);
    fs.symlinkSync("/tmp/target", tree.descriptorPath);
    assert.throws(() => reader.readAttachmentDescriptor(tree.descriptorPath), /attachment descriptor/i);
    fs.unlinkSync(tree.descriptorPath);
    const fifo = path.join(tree.descriptorDir, "attachment.fifo");
    const mkfifo = spawnSync("mkfifo", [fifo]);
    assert.equal(mkfifo.status, 0, mkfifo.stderr.toString());
    assert.throws(() => reader.readAttachmentDescriptor(fifo), /attachment descriptor/i);
  });
});

test("descriptor reader uses O_NOFOLLOW and rejects pre-open, post-open, and same-inode mutation", () => {
  const reader = loadReader();
  withTree((tree) => {
    writeDescriptor(tree.descriptorPath, descriptor());
    const originalOpen = fs.openSync;
    let flags = 0;
    fs.openSync = (candidate, openFlags, ...rest) => {
      if (candidate === tree.descriptorPath) {
        flags = openFlags;
        fs.unlinkSync(tree.descriptorPath);
        fs.symlinkSync("/tmp/not-the-descriptor", tree.descriptorPath);
      }
      return originalOpen(candidate, openFlags, ...rest);
    };
    try {
      assert.throws(() => reader.readAttachmentDescriptor(tree.descriptorPath), /attachment descriptor/i);
      assert.notEqual(flags & fs.constants.O_NOFOLLOW, 0);
      assert.notEqual(flags & fs.constants.O_NONBLOCK, 0);
    } finally {
      fs.openSync = originalOpen;
    }
  });
  withTree((tree) => {
    writeDescriptor(tree.descriptorPath, descriptor());
    const originalFstat = fs.fstatSync;
    let changed = false;
    fs.fstatSync = (fd, ...rest) => {
      const stat = originalFstat(fd, ...rest);
      if (!changed) {
        changed = true;
        fs.writeFileSync(tree.descriptorPath, `${JSON.stringify(descriptor("/tmp/mutated.sock"))}\n`);
      }
      return stat;
    };
    try {
      assert.throws(() => reader.readAttachmentDescriptor(tree.descriptorPath), /changed|attachment descriptor/i);
    } finally {
      fs.fstatSync = originalFstat;
    }
  });
});

test("staged hook has the authoritative paths, output contract, precedence, and redacted failure", () => {
  withTree((tree) => {
    writeDescriptor(tree.descriptorPath, descriptor("/tmp/hook.sock"));
    const { appDir, hook } = stageHook(tree);
    const readerPath = path.join(appDir, ".codex-linux", "features", "external-app-server-attachment", "descriptor-reader.js");
    assert.equal(fs.statSync(readerPath).mode & 0o777, 0o644);
    assert.equal(fs.statSync(hook).mode & 0o777, 0o755);
    const result = spawnSync(hook, [], { encoding: "utf8", env: hookEnv(tree, appDir) });
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stderr, "");
    assert.equal(
      result.stdout,
      [
        "env CODEX_LINUX_EXTERNAL_APP_SERVER_ATTACHMENT_FATAL=0",
        "env CODEX_LINUX_APP_SERVER_BRIDGE_ATTACH_ONLY=1",
        "env CODEX_LINUX_APP_SERVER_BRIDGE_SOCKET=/tmp/hook.sock",
        `env CODEX_CLI_PATH=${path.join(appDir, "resources", "codex")}`,
        "",
      ].join("\n"),
    );
    const explicit = spawnSync(hook, [], {
      encoding: "utf8",
      env: hookEnv(tree, appDir, { CODEX_LINUX_APP_SERVER_BRIDGE_SOCKET: "/tmp/dev.sock", CODEX_CLI_PATH: "/custom/codex", CODEX_LINUX_EXTERNAL_APP_SERVER_ATTACHMENT_FATAL: "1" }),
    });
    assert.equal(explicit.status, 0, explicit.stderr);
    assert.equal(explicit.stdout, "env CODEX_LINUX_EXTERNAL_APP_SERVER_ATTACHMENT_FATAL=0\nenv CODEX_CLI_PATH=/custom/codex\n");
    writeDescriptor(tree.descriptorPath, { invalid: true });
    const invalid = spawnSync(hook, [], { encoding: "utf8", env: hookEnv(tree, appDir) });
    assert.equal(invalid.status, 0, invalid.stderr);
    assert.equal(invalid.stdout, "env CODEX_LINUX_EXTERNAL_APP_SERVER_ATTACHMENT_FATAL=1\n");
    assert.match(invalid.stderr, /^ERROR: app-server attachment descriptor /);
    assert.equal(invalid.stderr.includes(tree.root), false, "diagnostic must not disclose descriptor paths");
  });
});

test("staged hook fails closed for missing managed resources and clears stale fatal state for absence", () => {
  withTree((tree) => {
    const { appDir, hook } = stageHook(tree);
    const absent = spawnSync(hook, [], { encoding: "utf8", env: hookEnv(tree, appDir, { CODEX_LINUX_EXTERNAL_APP_SERVER_ATTACHMENT_FATAL: "1" }) });
    assert.equal(absent.status, 0, absent.stderr);
    assert.equal(absent.stdout, `env CODEX_LINUX_EXTERNAL_APP_SERVER_ATTACHMENT_FATAL=0\nenv CODEX_CLI_PATH=${path.join(appDir, "resources", "codex")}\n`);
    fs.unlinkSync(path.join(appDir, "resources", "cua_node", "bin", "node"));
    const missing = spawnSync(hook, [], { encoding: "utf8", env: hookEnv(tree, appDir) });
    assert.equal(missing.status, 0, missing.stderr);
    assert.equal(missing.stdout, "env CODEX_LINUX_EXTERNAL_APP_SERVER_ATTACHMENT_FATAL=1\n");
  });
});

function statOverride(stat, overrides) {
  return new Proxy(stat, {
    get(target, key, receiver) {
      if (Object.hasOwn(overrides, key)) {
        const value = overrides[key];
        return typeof value === "function" ? value(target[key]) : value;
      }
      return Reflect.get(target, key, receiver);
    },
  });
}

test("descriptor reader rejects owner, unsafe-parent, and present-unreadable inputs", async (t) => {
  const reader = loadReader();
  function withPatched(method, replacement, callback) {
    const original = fs[method];
    fs[method] = replacement(original);
    try { callback(); } finally { fs[method] = original; }
  }
  await t.test("parent owner mismatch", () => withTree((tree) => {
    writeDescriptor(tree.descriptorPath, descriptor());
    withPatched("lstatSync", (original) => (candidate, ...rest) => {
      const stat = original(candidate, ...rest);
      return candidate === tree.descriptorDir ? statOverride(stat, { uid: (uid) => uid + 1n }) : stat;
    }, () => assert.throws(() => reader.readAttachmentDescriptor(tree.descriptorPath), /parent has an unexpected owner/));
  }));
  await t.test("descriptor owner mismatch", () => withTree((tree) => {
    writeDescriptor(tree.descriptorPath, descriptor());
    withPatched("lstatSync", (original) => (candidate, ...rest) => {
      const stat = original(candidate, ...rest);
      return candidate === tree.descriptorPath ? statOverride(stat, { uid: (uid) => uid + 1n }) : stat;
    }, () => assert.throws(() => reader.readAttachmentDescriptor(tree.descriptorPath), /unexpected owner/));
  }));
  await t.test("group-writable parent", async () => withTree((tree) => {
    writeDescriptor(tree.descriptorPath, descriptor());
    fs.chmodSync(tree.descriptorDir, 0o720);
    assert.throws(() => reader.readAttachmentDescriptor(tree.descriptorPath), /writable by group or other/);
  }));
  await t.test("present unreadable descriptor", () => withTree((tree) => {
    writeDescriptor(tree.descriptorPath, descriptor());
    withPatched("openSync", (original) => (candidate, ...rest) => {
      if (candidate === tree.descriptorPath) {
        const error = new Error("permission denied");
        error.code = "EACCES";
        throw error;
      }
      return original(candidate, ...rest);
    }, () => assert.throws(() => reader.readAttachmentDescriptor(tree.descriptorPath), /could not be read safely/));
  }));
});

test("descriptor reader detects post-open replacement and during-read same-inode mutation", async (t) => {
  const reader = loadReader();
  await t.test("post-open replacement", () => withTree((tree) => {
    writeDescriptor(tree.descriptorPath, descriptor("/tmp/original.sock"));
    const replacement = path.join(tree.descriptorDir, "replacement.json");
    writeDescriptor(replacement, descriptor("/tmp/replacement.sock"));
    const originalOpen = fs.openSync;
    let replaced = false;
    fs.openSync = (candidate, ...rest) => {
      const fd = originalOpen(candidate, ...rest);
      if (candidate === tree.descriptorPath && !replaced) {
        replaced = true;
        fs.renameSync(tree.descriptorPath, `${tree.descriptorPath}.held`);
        fs.renameSync(replacement, tree.descriptorPath);
      }
      return fd;
    };
    try {
      assert.throws(() => reader.readAttachmentDescriptor(tree.descriptorPath), /changed while it was being read/);
    } finally { fs.openSync = originalOpen; }
  }));
  await t.test("during-read same-inode mutation", () => withTree((tree) => {
    writeDescriptor(tree.descriptorPath, descriptor("/tmp/original.sock"));
    const originalOpen = fs.openSync;
    const originalRead = fs.readFileSync;
    let descriptorFd = null;
    let mutated = false;
    fs.openSync = (candidate, ...rest) => {
      const fd = originalOpen(candidate, ...rest);
      if (candidate === tree.descriptorPath) descriptorFd = fd;
      return fd;
    };
    fs.readFileSync = (candidate, ...rest) => {
      const source = originalRead(candidate, ...rest);
      if (candidate === descriptorFd && !mutated) {
        mutated = true;
        fs.writeFileSync(tree.descriptorPath, `${JSON.stringify(descriptor("/tmp/mutated.sock"))}\n`);
      }
      return source;
    };
    try {
      assert.throws(() => reader.readAttachmentDescriptor(tree.descriptorPath), /changed while it was being read/);
      assert.equal(mutated, true);
    } finally {
      fs.openSync = originalOpen;
      fs.readFileSync = originalRead;
    }
  }));
});

test("staged hook discards failed reader output, handles missing reader, and honors both development routing forms", () => {
  withTree((tree) => {
    const { appDir, hook } = stageHook(tree);
    const readerPath = path.join(appDir, ".codex-linux", "features", "external-app-server-attachment", "descriptor-reader.js");
    fs.writeFileSync(readerPath, "process.stdout.write('env CODEX_LINUX_APP_SERVER_BRIDGE_SOCKET=/tmp/leaked.sock\\n');process.stderr.write('ERROR: controlled failure\\n');process.exitCode=1;\n", { mode: 0o644 });
    const failed = spawnSync(hook, [], { encoding: "utf8", env: hookEnv(tree, appDir) });
    assert.equal(failed.status, 0, failed.stderr);
    assert.equal(failed.stdout, "env CODEX_LINUX_EXTERNAL_APP_SERVER_ATTACHMENT_FATAL=1\n");
    assert.equal(failed.stdout.includes("leaked.sock"), false);
    assert.equal(failed.stderr, "ERROR: controlled failure\n");
    fs.unlinkSync(readerPath);
    const missingReader = spawnSync(hook, [], { encoding: "utf8", env: hookEnv(tree, appDir) });
    assert.equal(missingReader.status, 0, missingReader.stderr);
    assert.equal(missingReader.stdout, "env CODEX_LINUX_EXTERNAL_APP_SERVER_ATTACHMENT_FATAL=1\n");
    for (const explicit of [
      { CODEX_LINUX_APP_SERVER_BRIDGE_ATTACH_ONLY: "1" },
      { CODEX_LINUX_APP_SERVER_BRIDGE_SOCKET: "/tmp/development.sock" },
    ]) {
      const result = spawnSync(hook, [], {
        encoding: "utf8",
        env: hookEnv(tree, appDir, { ...explicit, CODEX_LINUX_EXTERNAL_APP_SERVER_ATTACHMENT_FATAL: "1" }),
      });
      assert.equal(result.status, 0, result.stderr);
      assert.equal(result.stdout, `env CODEX_LINUX_EXTERNAL_APP_SERVER_ATTACHMENT_FATAL=0\nenv CODEX_CLI_PATH=${path.join(appDir, "resources", "codex")}\n`);
    }
  });
});

function loadPatch() {
  const patchPath = path.join(featureDir, "patch.js");
  assert.equal(fs.existsSync(patchPath), true, "attachment patch must exist before transport tests");
  delete require.cache[require.resolve(patchPath)];
  return require(patchPath);
}

function makeTransportProcess(env = { CODEX_CLI_PATH: "/fake/codex" }) {
  return { env, getuid: process.getuid.bind(process), pid: process.pid };
}

function fakeProxy({ closeOnKill = true, signalOnKill = true, signalCode = null, stdio = true } = {}) {
  const child = new EventEmitter();
  child.exitCode = null;
  child.signalCode = signalCode;
  child.killSignals = [];
  if (stdio) {
    child.stdin = new PassThrough();
    child.stdout = new PassThrough();
    child.stderr = new PassThrough();
  }
  child.kill = (signal) => {
    child.killSignals.push(signal);
    if (closeOnKill) queueMicrotask(() => {
      if (signalOnKill) child.signalCode = signal;
      child.emit("close", null, signal);
    });
    return true;
  };
  return child;
}

function trackedAttachmentFs({ afterFstat = null, overrides = {} } = {}) {
  const opened = [];
  const closed = [];
  const openFds = new Set();
  const baseOpen = overrides.openSync ?? fs.openSync;
  const baseFstat = overrides.fstatSync ?? fs.fstatSync;
  const baseClose = overrides.closeSync ?? fs.closeSync;
  const fsImpl = { ...fs, ...overrides };
  fsImpl.openSync = (candidate, flags, ...args) => {
    const fd = baseOpen(candidate, flags, ...args);
    opened.push({ candidate, fd, flags });
    openFds.add(fd);
    return fd;
  };
  fsImpl.fstatSync = (fd, ...args) => {
    const stat = baseFstat(fd, ...args);
    afterFstat?.(fd, stat);
    return stat;
  };
  fsImpl.closeSync = (fd) => {
    const result = baseClose(fd);
    if (openFds.delete(fd)) closed.push(fd);
    return result;
  };
  return { closed, fsImpl, openFds, opened };
}

function loadInjectedAttachmentTransport({
  fsImpl = fs,
  processImpl = makeTransportProcess(),
  spawnImpl = () => fakeProxy(),
  WebSocketImpl = null,
  setTimeoutImpl = setTimeout,
  clearTimeoutImpl = clearTimeout,
} = {}) {
  const { attachmentTransportClassSource } = loadPatch();
  class DefaultWebSocket extends EventEmitter {
    constructor(_url, options) {
      super();
      this.stream = options.createConnection();
      queueMicrotask(() => this.emit("open"));
    }
    terminate() { this.stream?.destroy(); }
  }
  class Adapter { constructor(socket) { this.socket = socket; } }
  const source = attachmentTransportClassSource({
    namespace: "n", webSocketClass: "WS", webSocketUrl: "url", keepAlive: "keepAlive", adapterClass: "Adapter",
  });
  const context = {
    n: { WS: WebSocketImpl ?? DefaultWebSocket, Adapter, keepAlive() {} },
    url: "ws://localhost/rpc",
    process: processImpl,
    console,
    setTimeout: setTimeoutImpl,
    clearTimeout: clearTimeoutImpl,
    require(id) {
      if (id === "node:child_process") return { spawn: spawnImpl };
      if (id === "node:fs") return fsImpl;
      return require(id);
    },
  };
  vm.runInNewContext(`${source};globalThis.Transport=CodexLinuxExternalAppServerSocketTransport`, context);
  return context.Transport;
}

function pathIdentity(candidate) {
  try {
    const stat = fs.lstatSync(candidate, { bigint: true });
    return { dev: stat.dev, ino: stat.ino, mode: stat.mode, socket: stat.isSocket(), symlink: stat.isSymbolicLink() };
  } catch (error) {
    if (error?.code === "ENOENT" || error?.code === "ENOTDIR") return null;
    if (error?.code === "EACCES") return { inaccessible: error.code };
    throw error;
  }
}

async function listenUnix(socketPath) {
  const server = net.createServer();
  await new Promise((resolve, reject) => { server.once("error", reject); server.listen(socketPath, resolve); });
  return server;
}

async function closeServer(server) {
  if (server == null || !server.listening) return;
  await new Promise((resolve) => server.close(resolve));
}

async function withAttachmentSocket(callback, { parentMode = 0o700, socketMode = 0o600 } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "attachment-transport-"));
  const socketPath = path.join(root, "app-server.sock");
  const server = await listenUnix(socketPath);
  fs.chmodSync(root, parentMode);
  fs.chmodSync(socketPath, socketMode);
  try {
    return await callback({ root, socketPath });
  } finally {
    await closeServer(server);
    fs.rmSync(root, { recursive: true, force: true });
  }
}

async function assertValidationRejects({
  expectedError,
  fsImpl = fs,
  processImpl = makeTransportProcess(),
  socketPath,
}) {
  const before = pathIdentity(socketPath);
  const beforeParent = pathIdentity(path.dirname(socketPath));
  let spawnCalls = 0;
  const transport = new (loadInjectedAttachmentTransport({
    fsImpl,
    processImpl,
    spawnImpl() { spawnCalls += 1; return fakeProxy(); },
  }))(socketPath);
  try {
    await assert.rejects(transport.connect(), expectedError);
    assert.equal(spawnCalls, 0, "rejected endpoints must never spawn a proxy");
    assert.deepEqual(pathIdentity(socketPath), before, "validation must not mutate the configured endpoint");
    assert.deepEqual(pathIdentity(path.dirname(socketPath)), beforeParent, "validation must not mutate the configured parent");
    assert.equal(fs.existsSync(`${socketPath}.lock`), false, "attachment validation must not create an ownership lock");
  } finally {
    transport.dispose();
  }
}

function currentSshBundle() {
  return [
    "var Ky=class{options;kind=`websocket`;logger=r.i(`AppServerTransportSshWebsocket`);proxyStreams=new Set;supportsReconnect(){return!0}",
    "async connect(){let t={current:null},r=new n.zn(Fy,{perMessageDeflate:!1,createConnection:()=>",
    "(t.current=this.createSshProxyStream(),t.current)});return n.Ln(r,{onPongTimeout:()=>r.terminate()}),this.hasConnected=!0,new n.Rn(r)}};",
    "function n6(e){let t=Jy(e.hostConfig);if(t)return Z.info(`selected app-server transport`),new Ky(t);",
    "if(e.transportKind===`remote-control`)return new Remote(e);",
    "if(n.io(e.hostConfig))return new Wsl({hostConfig:e.hostConfig,repoRoot:e.repoRoot,resourcesPath:e.resourcesPath,defaultOriginator:e.defaultOriginator});",
    "let r=r6(e.hostConfig);if(r){e.desktopAuthAppServerClient;let t=p8(e.hostConfig,r);return new n.Fn({hostConfig:e.hostConfig,websocketUrl:r,getWebsocketProtocols:void 0,...t==null?{}:{socksProxyUrl:t}})}",
    "return new n.Nn({hostConfig:e.hostConfig,repoRoot:e.repoRoot,resourcesPath:e.resourcesPath,defaultOriginator:e.defaultOriginator})}function afterFactory(){}",
  ].join("");
}

test("attachment patch exposes the current transport contract", () => {
  const patch = loadPatch();
  assert.equal(typeof patch.applyExternalAppServerAttachmentPatch, "function");
});

test("attachment patch accepts only the current unambiguous SSH lifecycle and is idempotent", () => {
  const { applyExternalAppServerAttachmentPatch, descriptors } = loadPatch();
  const source = currentSshBundle();
  const patched = applyExternalAppServerAttachmentPatch(source);
  assert.notEqual(patched, source);
  assert.equal(applyExternalAppServerAttachmentPatch(patched), patched);
  assert.equal((patched.match(/codex-linux:external-app-server-attachment:v1/g) ?? []).length, 1);
  assert.deepEqual(descriptors.map(({ phase, ciPolicy }) => [phase, ciPolicy]), [["main-bundle", "required-upstream"]]);
  for (const incompatible of [
    source.replace("this.hasConnected=!0,", ""),
    source.replace("new n.Rn(r)}};", "new n.Rn(r)}again(){return n.Ln(r,{onPongTimeout:()=>r.terminate()}),this.hasConnected=!0,new n.Rn(r)}};"),
  ]) {
    const warnings = [];
    const originalWarn = console.warn;
    console.warn = (...parts) => warnings.push(parts.join(" "));
    try { assert.equal(applyExternalAppServerAttachmentPatch(incompatible), incompatible); }
    finally { console.warn = originalWarn; }
    assert.match(warnings.join("\n"), /SSH WebSocket transport/);
  }
});

test("attachment selector makes the fatal marker win behaviorally and rejects non-local attachment", async (t) => {
  const { applyExternalAppServerAttachmentPatch } = loadPatch();
  const patched = applyExternalAppServerAttachmentPatch(currentSshBundle());
  function makeSelector({ sshEndpoint = null, transportKind, wsl = false, remoteWebSocket = null } = {}) {
    const calls = { local: 0, remoteControl: 0, remoteWebSocket: 0, remoteWebSocketLookup: 0, sshLookup: 0, sshTransport: 0, wsl: 0, wslLookup: 0 };
    class Local { constructor() { calls.local += 1; } }
    class RemoteControl { constructor() { calls.remoteControl += 1; } }
    class RemoteWebSocket { constructor() { calls.remoteWebSocket += 1; } }
    class Wsl { constructor() { calls.wsl += 1; } }
    const context = {
      process: { env: {} },
      require,
      console,
      setTimeout,
      clearTimeout,
      r: { i() { calls.sshTransport += 1; return null; } },
      r6() { calls.remoteWebSocketLookup += 1; return remoteWebSocket; },
      p8() { return null; },
      Z: { info() {} },
      Jy() { calls.sshLookup += 1; return sshEndpoint; },
      Remote: RemoteControl,
      Wsl,
      n: {
        io() { calls.wslLookup += 1; return wsl; },
        Fn: RemoteWebSocket,
        Nn: Local,
        WS: class {},
        keepAlive() {},
        Adapter: class {},
      },
      Fy: "ws://localhost/rpc",
    };
    vm.runInNewContext(`${patched};globalThis.selectAttachmentTransport=n6`, context);
    return {
      calls,
      select(env, hostKind = "local") {
        context.process.env = env;
        return context.selectAttachmentTransport({ hostConfig: { kind: hostKind }, transportKind, repoRoot: "/repo", resourcesPath: "/resources", defaultOriginator: "test" });
      },
    };
  }

  const socketPath = "/tmp/attachment-selector.sock";
  const attached = makeSelector().select({ CODEX_LINUX_APP_SERVER_BRIDGE_ATTACH_ONLY: "1", CODEX_LINUX_APP_SERVER_BRIDGE_SOCKET: socketPath });
  assert.equal(attached.constructor.name, "CodexLinuxExternalAppServerSocketTransport");
  assert.equal(attached.socketPath, socketPath);
  for (const [name, options, constructorName] of [
    ["SSH", { sshEndpoint: "ssh://example.test" }, "Ky"],
    ["remote control", { transportKind: "remote-control" }, "RemoteControl"],
    ["WSL", { wsl: true }, "Wsl"],
    ["remote WebSocket", { remoteWebSocket: "ws://remote.test/rpc" }, "RemoteWebSocket"],
    ["ordinary local", {}, "Local"],
  ]) {
    await t.test(name, () => {
      const selector = makeSelector(options);
      assert.equal(selector.select({}).constructor.name, constructorName);
      const callsBeforeFatal = { ...selector.calls };
      assert.throws(() => selector.select({ CODEX_LINUX_EXTERNAL_APP_SERVER_ATTACHMENT_FATAL: "1" }), /attachment descriptor selection failed/);
      assert.deepEqual(selector.calls, callsBeforeFatal, "fatal selection must throw before this branch is examined or constructed");
    });
  }
  assert.throws(
    () => makeSelector().select({ CODEX_LINUX_EXTERNAL_APP_SERVER_ATTACHMENT_FATAL: "1", CODEX_LINUX_APP_SERVER_BRIDGE_ATTACH_ONLY: "1", CODEX_LINUX_APP_SERVER_BRIDGE_SOCKET: socketPath }),
    /attachment descriptor selection failed/,
  );
  assert.throws(() => makeSelector().select({ CODEX_LINUX_APP_SERVER_BRIDGE_ATTACH_ONLY: "1" }), /requires CODEX_LINUX_APP_SERVER_BRIDGE_SOCKET/);
  assert.throws(
    () => makeSelector().select({ CODEX_LINUX_APP_SERVER_BRIDGE_ATTACH_ONLY: "1", CODEX_LINUX_APP_SERVER_BRIDGE_SOCKET: socketPath }, "ssh"),
    /requires a local host/,
  );
});

test("attachment transport passes only a validated basename and leaves untrusted endpoints untouched", async (t) => {
  const { attachmentTransportClassSource } = loadPatch();
  const vm = require("node:vm");
  const { EventEmitter } = require("node:events");
  const { PassThrough } = require("node:stream");
  const root = fs.mkdtempSync("/tmp/attachment-transport-");
  t.after(async () => {
    await new Promise((resolve) => server.close(resolve));
    fs.rmSync(root, { recursive: true, force: true });
  });
  const socketPath = path.join(root, "server.sock");
  const server = require("node:net").createServer();
  await new Promise((resolve, reject) => { server.once("error", reject); server.listen(socketPath, resolve); });
  fs.chmodSync(root, 0o700);
  fs.chmodSync(socketPath, 0o600);
  const calls = [];
  class WS extends EventEmitter {
    constructor(_url, options) { super(); this.stream = options.createConnection(); queueMicrotask(() => this.emit("open")); }
    terminate() { this.stream?.destroy(); }
  }
  class Adapter { constructor(socket) { this.socket = socket; } }
  const child = new EventEmitter();
  child.stdin = new PassThrough(); child.stdout = new PassThrough(); child.stderr = new PassThrough();
  child.exitCode = null; child.signalCode = null;
  child.kill = (signal) => { queueMicrotask(() => { child.signalCode = signal; child.emit("close", null, signal); }); return true; };
  const source = attachmentTransportClassSource({ namespace: "n", webSocketClass: "WS", webSocketUrl: "url", keepAlive: "keepAlive", adapterClass: "Adapter" });
  const context = {
    n: { WS, Adapter, keepAlive() {} }, url: "ws://local/rpc", process: { ...process, env: { CODEX_CLI_PATH: "/fake/codex" }, getuid: process.getuid.bind(process) },
    console, setTimeout, clearTimeout,
    require(id) {
      if (id === "node:child_process") return { spawn(...args) { calls.push(args); return child; } };
      if (id === "node:fs") return fs;
      return require(id);
    },
  };
  vm.runInNewContext(`${source};globalThis.Transport=CodexLinuxExternalAppServerSocketTransport`, context);
  const transport = new context.Transport(socketPath);
  const adapter = await transport.connect();
  assert.ok(adapter instanceof Adapter);
  assert.deepEqual([...calls[0][1]], ["app-server", "proxy", "--sock", "server.sock"]);
  assert.match(calls[0][2].cwd, /^\/proc\/\d+\/fd\/\d+$/);
  transport.dispose();
  await new Promise((resolve) => setImmediate(resolve));
  const before = fs.lstatSync(socketPath).ino;
  const link = path.join(root, "link.sock");
  fs.symlinkSync(socketPath, link);
  const rejected = new context.Transport(link);
  await assert.rejects(rejected.connect(), /symlink|canonical|socket/i);
  rejected.dispose();
  assert.equal(fs.lstatSync(socketPath).ino, before, "rejection must not replace or mutate external socket");
});

test("attachment transport rejects hostile parent and socket states without mutation", async (t) => {
  async function withFixture(callback) {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "attachment-endpoint-"));
    const servers = [];
    const socketPath = path.join(root, "app-server.sock");
    const listen = async (candidate = socketPath, mode = 0o600) => {
      const server = await listenUnix(candidate);
      servers.push(server);
      fs.chmodSync(candidate, mode);
      return server;
    };
    fs.chmodSync(root, 0o700);
    try { return await callback({ root, socketPath, listen }); }
    finally {
      await Promise.all(servers.map(closeServer));
      fs.chmodSync(root, 0o700);
      fs.rmSync(root, { recursive: true, force: true });
    }
  }
  async function reject(name, expectedError, prepare = async () => ({})) {
    await t.test(name, async () => withFixture(async (fixture) => {
      const options = await prepare(fixture);
      await assertValidationRejects({ socketPath: fixture.socketPath, expectedError, ...options });
    }));
  }

  await reject("missing endpoint", /inspection failed|ENOENT/);
  await reject("direct parent symlink", /parent is not a real directory/, async ({ root, listen }) => {
    const real = path.join(root, "real");
    const linked = path.join(root, "linked");
    fs.mkdirSync(real, { mode: 0o700 });
    fs.symlinkSync(real, linked);
    const socketPath = path.join(linked, "app-server.sock");
    await listen(path.join(real, "app-server.sock"));
    return { socketPath };
  });
  await reject("intermediate parent symlink", /parent path contains a symlink/, async ({ root, listen }) => {
    const realRoot = path.join(root, "real");
    const nested = path.join(realRoot, "nested");
    const linked = path.join(root, "linked");
    fs.mkdirSync(nested, { recursive: true, mode: 0o700 });
    fs.symlinkSync(realRoot, linked);
    const socketPath = path.join(linked, "nested", "app-server.sock");
    await listen(path.join(nested, "app-server.sock"));
    return { socketPath };
  });
  await reject("parent that is a regular file", /parent is not a real directory/, async ({ root }) => {
    const parent = path.join(root, "not-a-directory");
    fs.writeFileSync(parent, "not a directory", { mode: 0o600 });
    return { socketPath: path.join(parent, "app-server.sock") };
  });
  await reject("endpoint that is a regular file", /endpoint is not a real Unix socket/, async ({ socketPath }) => {
    fs.writeFileSync(socketPath, "not a socket", { mode: 0o600 });
  });
  await reject("unexpected parent owner", /parent has unexpected owner/, async ({ root, listen }) => {
    await listen();
    return {
      fsImpl: {
        ...fs,
        lstatSync(candidate, ...args) {
          const stat = fs.lstatSync(candidate, ...args);
          return candidate === root ? statOverride(stat, { uid: (uid) => uid + 1n }) : stat;
        },
      },
    };
  });
  await reject("unexpected socket owner", /socket has unexpected owner/, async ({ socketPath, listen }) => {
    await listen();
    return {
      fsImpl: {
        ...fs,
        lstatSync(candidate, ...args) {
          const stat = fs.lstatSync(candidate, ...args);
          return candidate === socketPath || /^\/proc\/self\/fd\/\d+\/app-server\.sock$/.test(candidate)
            ? statOverride(stat, { uid: (uid) => uid + 1n })
            : stat;
        },
      },
    };
  });
  await reject("group writable parent", /parent has unsafe permissions/, async ({ root, listen }) => {
    await listen();
    fs.chmodSync(root, 0o720);
  });
  await reject("parent without owner execute permission", /parent owner read and execute permissions are required/, async ({ root, listen }) => {
    await listen();
    fs.chmodSync(root, 0o400);
  });
  await reject("socket without owner write permission", /socket owner read and write permissions are required/, async ({ listen }) => {
    await listen(undefined, 0o400);
  });
  await reject("socket with group write permission", /socket has unsafe group or other permissions/, async ({ listen }) => {
    await listen(undefined, 0o620);
  });
  await reject("BigInt-distinct parent identity collision", /parent changed during validation/, async ({ root, listen }) => {
    await listen();
    const first = 9_007_199_254_740_992n;
    const second = 9_007_199_254_740_993n;
    assert.equal(Number(first), Number(second), "the test must prove Number identity would be lossy");
    return {
      fsImpl: {
        ...fs,
        lstatSync(candidate, ...args) {
          const stat = fs.lstatSync(candidate, ...args);
          return candidate === root ? statOverride(stat, { dev: first, ino: first }) : stat;
        },
        fstatSync(fd, ...args) {
          return statOverride(fs.fstatSync(fd, ...args), { dev: second, ino: second });
        },
      },
    };
  });
});

test("attachment transport closes independent validation FDs on every connect branch", async (t) => {
  await withAttachmentSocket(async ({ socketPath }) => {
    async function runCase(name, { expectedError, processImpl = makeTransportProcess(), spawnImpl = () => fakeProxy(), WebSocketImpl = null, tracking = trackedAttachmentFs(), setTimeoutImpl = setTimeout, clearTimeoutImpl = clearTimeout }) {
      await t.test(name, async () => {
        const Transport = loadInjectedAttachmentTransport({ fsImpl: tracking.fsImpl, processImpl, spawnImpl, WebSocketImpl, setTimeoutImpl, clearTimeoutImpl });
        const transport = new Transport(socketPath);
        try {
          if (expectedError == null) await transport.connect();
          else await assert.rejects(transport.connect(), expectedError);
          await new Promise((resolve) => setImmediate(resolve));
          assert.equal(tracking.opened.length, 1, "each branch must bind exactly one parent FD");
          assert.equal(tracking.opened[0].flags & fs.constants.O_DIRECTORY, fs.constants.O_DIRECTORY);
          assert.equal(tracking.opened[0].flags & fs.constants.O_NOFOLLOW, fs.constants.O_NOFOLLOW);
          assert.equal(tracking.openFds.size, 0, "every opened validation FD must close");
          assert.deepEqual(tracking.closed, [tracking.opened[0].fd]);
        } finally {
          transport.dispose();
          for (const fd of tracking.openFds) fs.closeSync(fd);
        }
      });
    }

    const validationTracking = trackedAttachmentFs({
      overrides: {
        fstatSync(fd, ...args) {
          return statOverride(fs.fstatSync(fd, ...args), { ino: (ino) => ino + 1n });
        },
      },
    });
    await runCase("validation failure after opening the parent", {
      expectedError: /parent changed during validation/,
      tracking: validationTracking,
    });
    await runCase("missing CODEX_CLI_PATH", { expectedError: /requires CODEX_CLI_PATH/, processImpl: makeTransportProcess({}) });
    await runCase("synchronous proxy spawn failure", { expectedError: /synchronous spawn failure/, spawnImpl() { throw new Error("synchronous spawn failure"); } });
    let noStdioProxy;
    await runCase("missing proxy stdio", {
      expectedError: /stdio was unavailable/,
      spawnImpl() { noStdioProxy = fakeProxy({ stdio: false }); return noStdioProxy; },
    });
    assert.deepEqual(noStdioProxy.killSignals, ["SIGTERM"], "missing stdio must stop its created proxy");
    class ConstructorFailureWebSocket {
      constructor(_url, options) { options.createConnection(); throw new Error("constructor failure"); }
    }
    let constructorProxy;
    await runCase("WebSocket constructor failure after proxy creation", {
      expectedError: /constructor failure/,
      WebSocketImpl: ConstructorFailureWebSocket,
      spawnImpl() { constructorProxy = fakeProxy(); return constructorProxy; },
    });
    assert.deepEqual(constructorProxy.killSignals, ["SIGTERM"], "constructor failure must stop its created proxy");
    class TimeoutWebSocket extends EventEmitter {
      constructor(_url, options) { super(); this.stream = options.createConnection(); }
      terminate() { this.stream.destroy(); }
    }
    let timeoutProxy;
    await runCase("WebSocket open timeout", {
      expectedError: /websocket open timed out/,
      WebSocketImpl: TimeoutWebSocket,
      tracking: trackedAttachmentFs(),
      spawnImpl() { timeoutProxy = fakeProxy(); return timeoutProxy; },
      processImpl: makeTransportProcess(),
      setTimeoutImpl(callback) { queueMicrotask(callback); return { unref() {} }; },
      clearTimeoutImpl() {},
    });
    assert.equal(timeoutProxy.killSignals[0], "SIGTERM", "WebSocket open timeout must stop its proxy before any escalation");
  });
});

test("attachment transport owns concurrent validation FDs and closes them independently", async () => {
  await withAttachmentSocket(async ({ socketPath }) => {
    const tracking = trackedAttachmentFs();
    const sockets = [];
    class PendingWebSocket extends EventEmitter {
      constructor(_url, options) { super(); this.stream = options.createConnection(); sockets.push(this); }
      terminate() { this.stream.destroy(); }
    }
    const Transport = loadInjectedAttachmentTransport({ fsImpl: tracking.fsImpl, WebSocketImpl: PendingWebSocket });
    const transport = new Transport(socketPath);
    const first = transport.connect();
    const second = transport.connect();
    try {
      assert.equal(tracking.openFds.size, 2, "concurrent connects must own two FDs");
      assert.notEqual(tracking.opened[0].fd, tracking.opened[1].fd);
      sockets[0].emit("open");
      await first;
      assert.equal(tracking.openFds.size, 1, "first open must not close the second connection FD");
      sockets[1].emit("open");
      await second;
      assert.equal(tracking.openFds.size, 0);
      assert.equal(new Set(tracking.closed).size, 2);
    } finally {
      transport.dispose();
      for (const fd of tracking.openFds) fs.closeSync(fd);
    }
  });
});

test("attachment transport handles proxy diagnostics, pending disposal, and termination escalation", async (t) => {
  await withAttachmentSocket(async ({ socketPath }) => {
    await t.test("nonzero proxy exits retain only bounded stderr", async () => {
      const proxy = fakeProxy();
      const Transport = loadInjectedAttachmentTransport({ spawnImpl: () => proxy });
      const transport = new Transport(socketPath);
      try {
        const adapter = await transport.connect();
        const streamError = new Promise((resolve) => adapter.socket.stream.once("error", resolve));
        proxy.stderr.write(`discard-${"x".repeat(5000)}-tail`);
        proxy.emit("close", 7, null);
        const error = await streamError;
        assert.match(error.message, /proxy exited \(7\):/);
        assert.equal(error.message.includes("discard-"), false);
        assert.match(error.message, /x+-tail/);
        assert.ok(Buffer.byteLength(error.message) <= 4100, "proxy diagnostics must remain bounded");
      } finally { transport.dispose(); }
    });

    await t.test("disposing before WebSocket open closes the parent FD and stops its proxy", async () => {
      const tracking = trackedAttachmentFs();
      let socket;
      const proxy = fakeProxy();
      class PendingWebSocket extends EventEmitter {
        constructor(_url, options) { super(); socket = this; this.stream = options.createConnection(); }
        terminate() { this.stream.destroy(); }
      }
      const Transport = loadInjectedAttachmentTransport({ fsImpl: tracking.fsImpl, WebSocketImpl: PendingWebSocket, spawnImpl: () => proxy });
      const transport = new Transport(socketPath);
      const pending = transport.connect();
      await new Promise((resolve) => setImmediate(resolve));
      transport.dispose();
      socket.emit("close");
      await assert.rejects(pending, /closed before opening/);
      assert.equal(tracking.openFds.size, 0);
      assert.deepEqual(proxy.killSignals, ["SIGTERM"]);
    });

    await t.test("stubborn live proxy receives SIGKILL after the SIGTERM deadline", async () => {
      const proxy = fakeProxy({ closeOnKill: false, signalOnKill: false });
      const timers = [];
      const setTimeoutImpl = (callback) => {
        const timer = { cleared: false, unref() {} };
        timers.push({ callback, timer });
        return timer;
      };
      const clearTimeoutImpl = (timer) => { timer.cleared = true; };
      const Transport = loadInjectedAttachmentTransport({ spawnImpl: () => proxy, setTimeoutImpl, clearTimeoutImpl });
      const transport = new Transport(socketPath);
      try {
        const connected = transport.connect();
        await new Promise((resolve) => queueMicrotask(resolve));
        await connected;
        transport.dispose();
        assert.deepEqual(proxy.killSignals, ["SIGTERM"]);
        const escalation = timers.find(({ timer }) => !timer.cleared);
        assert.ok(escalation, "dispose must arm one SIGKILL deadline");
        escalation.callback();
        assert.deepEqual(proxy.killSignals, ["SIGTERM", "SIGKILL"], "a proxy still open after SIGTERM must be force-killed");
      } finally { transport.dispose(); }
    });

    await t.test("a signal-completed proxy receives no later SIGKILL while close is delayed", async () => {
      const proxy = fakeProxy({ closeOnKill: false, signalCode: "SIGTERM" });
      const timers = [];
      const setTimeoutImpl = (callback) => {
        const timer = { cleared: false, unref() {} };
        timers.push({ callback, timer });
        return timer;
      };
      const clearTimeoutImpl = (timer) => { timer.cleared = true; };
      const Transport = loadInjectedAttachmentTransport({ spawnImpl: () => proxy, setTimeoutImpl, clearTimeoutImpl });
      const transport = new Transport(socketPath);
      try {
        const connected = transport.connect();
        await new Promise((resolve) => queueMicrotask(resolve));
        await connected;
        transport.dispose();
        assert.deepEqual(proxy.killSignals, [], "a signal-completed child must not be signalled again before delayed close delivery");
        assert.equal(timers.some(({ timer }) => !timer.cleared), false, "a signal-completed child must not arm a SIGKILL deadline");
      } finally { transport.dispose(); }
    });
  });
});

test("Node ChildProcess keeps signalCode null while SIGTERM is ignored", { timeout: 5000 }, async () => {
  const child = spawn(process.execPath, ["-e", "process.on('SIGTERM',()=>{});process.stdout.write('ready\\n');setInterval(()=>{},1000)"] , {
    stdio: ["ignore", "pipe", "pipe"],
  });
  let closed = false;
  child.once("close", () => { closed = true; });
  try {
    await new Promise((resolve, reject) => {
      child.stdout.once("data", (chunk) => {
        if (chunk.toString("utf8") === "ready\n") resolve();
        else reject(new Error(`unexpected probe readiness: ${chunk}`));
      });
      child.once("error", reject);
    });
    assert.equal(child.kill("SIGTERM"), true);
    await new Promise((resolve) => setTimeout(resolve, 50));
    assert.equal(child.exitCode, null);
    assert.equal(child.signalCode, null);
    const close = once(child, "close");
    assert.equal(child.kill("SIGKILL"), true);
    const [, signal] = await close;
    assert.equal(signal, "SIGKILL");
    assert.equal(child.signalCode, "SIGKILL");
  } finally {
    if (!closed && child.exitCode == null && child.signalCode == null) {
      const close = once(child, "close");
      child.kill("SIGKILL");
      await close;
    }
  }
});

function captureBoundedStderr(stream, maxBytes = 4000) {
  let captured = Buffer.alloc(0);
  stream.on("data", (chunk) => {
    captured = Buffer.concat([captured, Buffer.from(chunk)]);
    if (captured.length > maxBytes) captured = captured.subarray(captured.length - maxBytes);
  });
  return () => captured.toString("utf8");
}

async function waitForSocket(socketPath, child, readStderr) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (child.exitCode != null) throw new Error(`authority exited early: ${readStderr().trim()}`);
    try {
      if (fs.statSync(socketPath).isSocket()) return;
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error("timed out waiting for real app-server socket");
}

async function stopChildWithDeadline(child, role) {
  if (child == null || child.exitCode != null) return;
  const closed = new Promise((resolve) => child.once("close", resolve));
  const escalation = setTimeout(() => {
    if (child.exitCode == null) child.kill("SIGKILL");
  }, 1000);
  try {
    if (child.signalCode == null) child.kill("SIGTERM");
    await closed;
  } finally {
    clearTimeout(escalation);
  }
  assert.ok(true, `${role} close must complete before cleanup`);
}

function trackedFsAfterParentOpen(afterParentOpen) {
  const openFds = new Set();
  const fsImpl = {
    ...fs,
    openSync(candidate, flags, ...rest) {
      const fd = fs.openSync(candidate, flags, ...rest);
      openFds.add(fd);
      return fd;
    },
    fstatSync(fd, ...rest) {
      const stat = fs.fstatSync(fd, ...rest);
      afterParentOpen(fd, stat);
      return stat;
    },
    closeSync(fd) {
      const result = fs.closeSync(fd);
      openFds.delete(fd);
      return result;
    },
  };
  return { fsImpl, openFds };
}

if (Object.prototype.hasOwnProperty.call(process.env, "CODEX_CLI_PATH")) test("real sealed bundled CLI survives configured-parent replacement without touching replacement socket", { timeout: 20000 }, async (t) => {
  const codexCli = process.env.CODEX_CLI_PATH;
  assert.ok(codexCli, "CODEX_CLI_PATH must name the verified official bundled CLI; this test never skips");
  assert.equal(fs.statSync(codexCli).mode & 0o111, 0o111, "CODEX_CLI_PATH must be executable");
  const { attachmentTransportClassSource } = loadPatch();
  const root = fs.mkdtempSync("/tmp/cas-");
  const socketBasename = "app-server.sock";
  const parentLength = 107 - Buffer.byteLength(root) - Buffer.byteLength(socketBasename) - 2;
  assert.ok(parentLength > 0, "temporary root must permit a near-limit Unix socket path");
  const parentDir = path.join(root, "p".repeat(parentLength));
  const heldParentDir = path.join(root, "h".repeat(parentLength));
  const replacementDir = path.join(root, "replacement");
  const socketPath = path.join(parentDir, socketBasename);
  const replacementSocketPath = path.join(replacementDir, socketBasename);
  const codexHome = path.join(root, "codex-home");
  fs.mkdirSync(codexHome, { mode: 0o700 });
  fs.mkdirSync(parentDir, { mode: 0o700 });
  fs.mkdirSync(replacementDir, { mode: 0o700 });
  assert.equal(Buffer.byteLength(socketPath), 107);

  let replacementConnections = 0;
  const replacement = net.createServer(() => { replacementConnections += 1; });
  await new Promise((resolve, reject) => { replacement.once("error", reject); replacement.listen(replacementSocketPath, resolve); });
  fs.chmodSync(replacementSocketPath, 0o600);
  const env = { ...process.env, CODEX_CLI_PATH: codexCli, CODEX_HOME: codexHome };
  const authority = spawn(codexCli, ["app-server", "--listen", `unix://${socketPath}`], { env, stdio: ["ignore", "ignore", "pipe"] });
  const readAuthorityStderr = captureBoundedStderr(authority.stderr);
  let proxy = null;
  let transport = null;
  try {
    await waitForSocket(socketPath, authority, readAuthorityStderr);
    assert.equal(fs.statSync(socketPath).mode & 0o077, 0);
    const originalParent = fs.statSync(parentDir);
    const originalSocket = fs.lstatSync(socketPath);
    const replacementSocket = fs.lstatSync(replacementSocketPath);
    let swapped = false;
    const tracking = trackedFsAfterParentOpen(() => {
      if (swapped) return;
      fs.renameSync(parentDir, heldParentDir);
      fs.renameSync(replacementDir, parentDir);
      swapped = true;
    });
    let proxyArgs = null;
    let proxyCwd = null;
    class UpgradeWebSocket extends EventEmitter {
      constructor(_url, options) {
        super();
        this.stream = options.createConnection();
        this.response = "";
        this.stream.on("data", (chunk) => {
          this.response += chunk.toString("utf8");
          if (!this.response.includes("\r\n\r\n")) return;
          if (/^HTTP\/1\.1 101 /.test(this.response)) this.emit("open");
          else this.emit("error", new Error(`unexpected proxy response: ${this.response}`));
        });
        this.stream.once("error", (error) => this.emit("error", error));
        queueMicrotask(() => this.stream.write([
          "GET /rpc HTTP/1.1", "Host: localhost", "Upgrade: websocket", "Connection: Upgrade",
          "Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==", "Sec-WebSocket-Version: 13", "", "",
        ].join("\r\n")));
      }
      terminate() { this.stream.destroy(); }
    }
    class Adapter { constructor(socket) { this.socket = socket; } }
    const source = attachmentTransportClassSource({ namespace: "n", webSocketClass: "WS", webSocketUrl: "url", keepAlive: "keepAlive", adapterClass: "Adapter" });
    const context = {
      n: { WS: UpgradeWebSocket, Adapter, keepAlive() {} }, url: "ws://localhost/rpc",
      process: { env, getuid: process.getuid.bind(process), pid: process.pid }, console, setTimeout, clearTimeout,
      require(id) {
        if (id === "node:fs") return tracking.fsImpl;
        if (id === "node:child_process") return { spawn(command, args, options) {
          proxyArgs = [...args]; proxyCwd = options.cwd;
          assert.equal(tracking.openFds.size, 1, "validation FD must remain open through proxy spawn");
          proxy = spawn(command, args, options);
          return proxy;
        } };
        return require(id);
      },
    };
    vm.runInNewContext(`${source};globalThis.Transport=CodexLinuxExternalAppServerSocketTransport`, context);
    transport = new context.Transport(socketPath);
    const adapter = await transport.connect();
    assert.equal(swapped, true);
    assert.deepEqual(proxyArgs, ["app-server", "proxy", "--sock", socketBasename]);
    assert.match(proxyCwd, new RegExp(`^/proc/${process.pid}/fd/\\d+$`));
    const proxyCwdIdentity = fs.statSync(`/proc/${proxy.pid}/cwd`);
    assert.deepEqual([proxyCwdIdentity.dev, proxyCwdIdentity.ino], [originalParent.dev, originalParent.ino]);
    assert.deepEqual([fs.lstatSync(path.join(heldParentDir, socketBasename)).dev, fs.lstatSync(path.join(heldParentDir, socketBasename)).ino], [originalSocket.dev, originalSocket.ino]);
    assert.deepEqual([fs.lstatSync(socketPath).dev, fs.lstatSync(socketPath).ino], [replacementSocket.dev, replacementSocket.ino]);
    assert.match(adapter.socket.response, /^HTTP\/1\.1 101 /);
    assert.equal(replacementConnections, 0);
    assert.equal(tracking.openFds.size, 0, "validation FD must close on the successful branch");
  } finally {
    transport?.dispose();
    await Promise.all([stopChildWithDeadline(proxy, "proxy"), stopChildWithDeadline(authority, "authority")]);
    await new Promise((resolve) => replacement.close(resolve));
    fs.rmSync(root, { recursive: true, force: true });
  }
});
