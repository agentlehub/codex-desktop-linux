#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const path = require("node:path");

const DESCRIPTOR_KEYS = ["schemaVersion", "socketPath", "transport"];
const BIGINT_STATS = { bigint: true };

function descriptorError(reason) {
  return new Error(`app-server attachment descriptor ${reason}`);
}

function sameMetadata(left, right) {
  return left.dev === right.dev && left.ino === right.ino && left.uid === right.uid &&
    (left.mode & 0o7777n) === (right.mode & 0o7777n) && left.size === right.size &&
    left.mtimeNs === right.mtimeNs && left.ctimeNs === right.ctimeNs;
}

function expectedOwner(uid) {
  if (typeof uid === "bigint") return uid;
  if (Number.isInteger(uid) && uid >= 0) return BigInt(uid);
  throw descriptorError("requires a valid expected owner");
}

function assertSafeParent(stat, uid) {
  if (!stat.isDirectory()) throw descriptorError("parent is not a real directory");
  if (stat.uid !== uid) throw descriptorError("parent has an unexpected owner");
  if ((stat.mode & 0o022n) !== 0n) throw descriptorError("parent is writable by group or other");
}

function assertSafeDescriptor(stat, uid) {
  if (!stat.isFile()) throw descriptorError("is not a regular file");
  if (stat.uid !== uid) throw descriptorError("has an unexpected owner");
  if ((stat.mode & 0o7777n) !== 0o600n) throw descriptorError("must have mode 0600");
}

function assertSameMetadata(before, after, label) {
  if (!sameMetadata(before, after)) throw descriptorError(`${label} changed while it was being read`);
}

function parseDescriptor(source) {
  let value;
  try { value = JSON.parse(source); } catch { throw descriptorError("contains invalid JSON"); }
  if (value == null || typeof value !== "object" || Array.isArray(value)) throw descriptorError("must be an object");
  const keys = Object.keys(value).sort();
  if (keys.length !== DESCRIPTOR_KEYS.length || keys.some((key, index) => key !== DESCRIPTOR_KEYS[index])) {
    throw descriptorError("has an unsupported schema");
  }
  if (value.schemaVersion !== 1 || !Number.isInteger(value.schemaVersion)) throw descriptorError("has an unsupported schema version");
  if (value.transport !== "unix") throw descriptorError("has an unsupported transport");
  if (typeof value.socketPath !== "string" || value.socketPath.length === 0 || !path.isAbsolute(value.socketPath) ||
    path.normalize(value.socketPath) !== value.socketPath || /[\0-\x1f]/.test(value.socketPath)) {
    throw descriptorError("has an invalid socket path");
  }
  return { socketPath: value.socketPath };
}

function readAttachmentDescriptor(descriptorPath, uid = process.getuid()) {
  let parentFd = null;
  let descriptorFd = null;
  try {
    let descriptorBefore;
    try { descriptorBefore = fs.lstatSync(descriptorPath, BIGINT_STATS); }
    catch (error) {
      if (error?.code === "ENOENT") return null;
      throw descriptorError("could not be inspected safely");
    }
    const owner = expectedOwner(uid);
    const parentPath = path.dirname(descriptorPath);
    const parentBefore = fs.lstatSync(parentPath, BIGINT_STATS);
    assertSafeParent(parentBefore, owner);
    assertSafeDescriptor(descriptorBefore, owner);
    parentFd = fs.openSync(parentPath, fs.constants.O_RDONLY | fs.constants.O_DIRECTORY | fs.constants.O_NOFOLLOW);
    const parentOpened = fs.fstatSync(parentFd, BIGINT_STATS);
    assertSameMetadata(parentBefore, parentOpened, "parent");
    assertSafeParent(parentOpened, owner);
    descriptorFd = fs.openSync(descriptorPath, fs.constants.O_RDONLY | fs.constants.O_NONBLOCK | fs.constants.O_NOFOLLOW);
    const descriptorOpened = fs.fstatSync(descriptorFd, BIGINT_STATS);
    assertSameMetadata(descriptorBefore, descriptorOpened, "file");
    assertSafeDescriptor(descriptorOpened, owner);
    const source = fs.readFileSync(descriptorFd, "utf8");
    const descriptorRead = fs.fstatSync(descriptorFd, BIGINT_STATS);
    const descriptorAfter = fs.lstatSync(descriptorPath, BIGINT_STATS);
    const parentAfter = fs.lstatSync(parentPath, BIGINT_STATS);
    assertSameMetadata(descriptorOpened, descriptorRead, "file");
    assertSameMetadata(descriptorRead, descriptorAfter, "file");
    assertSameMetadata(descriptorBefore, descriptorAfter, "file");
    assertSameMetadata(parentBefore, parentAfter, "parent");
    assertSafeParent(parentAfter, owner);
    assertSafeDescriptor(descriptorRead, owner);
    assertSafeDescriptor(descriptorAfter, owner);
    return parseDescriptor(source);
  } catch (error) {
    if (error?.message?.startsWith("app-server attachment descriptor ")) throw error;
    throw descriptorError("could not be read safely");
  } finally {
    if (descriptorFd != null) try { fs.closeSync(descriptorFd); } catch {}
    if (parentFd != null) try { fs.closeSync(parentFd); } catch {}
  }
}

function routingRecords(value) {
  return [
    "env CODEX_LINUX_APP_SERVER_BRIDGE_ATTACH_ONLY=1",
    `env CODEX_LINUX_APP_SERVER_BRIDGE_SOCKET=${value.socketPath}`,
  ];
}

function main() {
  try {
    if (process.argv.length !== 3) throw descriptorError("path is required");
    const value = readAttachmentDescriptor(process.argv[2]);
    if (value != null) process.stdout.write(`${routingRecords(value).join("\n")}\n`);
  } catch (error) {
    const detail = error?.message?.startsWith("app-server attachment descriptor ") ? error.message : "app-server attachment descriptor could not be read safely";
    process.stderr.write(`ERROR: ${detail}.\n`);
    process.exitCode = 1;
  }
}

if (require.main === module) main();

module.exports = { readAttachmentDescriptor, routingRecords };
