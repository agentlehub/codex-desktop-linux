"use strict";

const assert = require("node:assert/strict");
const childProcess = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const repoRoot = path.resolve(__dirname, "../..");

function runPackageCommon(script, appDir, sourceRoot = repoRoot) {
  return childProcess.execFileSync("bash", ["-c", [
    "set -euo pipefail",
    `REPO_DIR=${JSON.stringify(sourceRoot)}`,
    `APP_DIR=${JSON.stringify(appDir)}`,
    `. ${JSON.stringify(path.join(repoRoot, "scripts/lib/package-common.sh"))}`,
    script,
  ].join("\n")], { encoding: "utf8" });
}

function copyFeatureHelpers(sourceRoot, targetRoot) {
  fs.mkdirSync(path.join(targetRoot, "scripts/lib"), { recursive: true });
  for (const name of ["linux-features.js", "gentoo-dependencies.js"]) {
    fs.copyFileSync(path.join(sourceRoot, "scripts/lib", name), path.join(targetRoot, "scripts/lib", name));
  }
}

for (const [fileMode, directoryMode] of [[0o644, 0o755], [0o600, 0o700], [0o755, 0o755]]) {
  test(`package permission restoration traverses directory resources with mode ${fileMode.toString(8)}`, (t) => {
    const base = path.join(os.homedir(), ".cache/codex-desktop-dev");
    fs.mkdirSync(base, { recursive: true });
    const root = fs.mkdtempSync(path.join(base, "codex-package-directory-mode-"));
    t.after(() => fs.rmSync(root, { recursive: true, force: true }));
    const app = path.join(root, "opt/codex-desktop");
    const featuresRoot = path.join(root, "linux-features");
    const featureDir = path.join(featuresRoot, "fixture");
    const target = ".codex-linux/features/fixture/extension";
    fs.mkdirSync(path.join(featureDir, "extension/nested"), { recursive: true });
    fs.writeFileSync(path.join(featureDir, "extension/extension.js"), "companion source\n");
    fs.writeFileSync(path.join(featureDir, "extension/nested/metadata.json"), "{}\n");
    fs.writeFileSync(path.join(featureDir, "README.md"), "Fixture\n");
    fs.writeFileSync(path.join(featureDir, "feature.json"), JSON.stringify({
      id: "fixture", title: "Fixture", description: "Directory mode regression", defaultEnabled: false,
      resources: [{ source: "extension", target, mode: fileMode.toString(8) }],
    }));
    const featuresConfigPath = path.join(featuresRoot, "features.json");
    fs.writeFileSync(featuresConfigPath, JSON.stringify({ enabled: ["fixture"] }));
    require("./linux-features.js").stageEnabledLinuxFeatureInstall(app, { featuresRoot, featuresConfigPath });
    runPackageCommon([
      "PACKAGE_NAME=codex-desktop",
      `normalize_package_payload_permissions ${JSON.stringify(root)}`,
      `restore_linux_feature_payload_permissions ${JSON.stringify(root)}`,
    ].join("\n"), app);
    for (const relative of ["", "nested"]) {
      assert.equal(fs.statSync(path.join(app, target, relative)).mode & 0o777, directoryMode);
    }
    for (const [relative, content] of [["extension.js", "companion source\n"], ["nested/metadata.json", "{}\n"]]) {
      const file = path.join(app, target, relative);
      assert.equal(fs.statSync(file).mode & 0o777, fileMode);
      assert.equal(fs.readFileSync(file, "utf8"), content);
    }
    const archive = path.join(root, "payload.tar");
    childProcess.execFileSync("tar", ["-cf", archive, "-C", root, "opt"]);
    const entries = childProcess.execFileSync("tar", ["-tf", archive], { encoding: "utf8" });
    assert.match(entries, /extension\/extension\.js/);
    assert.match(entries, /extension\/nested\/metadata\.json/);
  });
}

test("updater binary source recovers the Linux deleted-path marker", (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "codex-updater-deleted-path-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const sourceRoot = path.join(root, "minimal-update-builder");
  const updater = path.join(root, "codex-update-manager");
  fs.mkdirSync(sourceRoot, { recursive: true });
  fs.writeFileSync(updater, "#!/bin/sh\nexit 0\n", { mode: 0o755 });

  const output = runPackageCommon([
    `UPDATER_BINARY_SOURCE=${JSON.stringify(`${updater} (deleted)`)}`,
    "ensure_updater_binary",
    'printf "%s\\n" "$UPDATER_BINARY_SOURCE"',
  ].join("\n"), root, sourceRoot);

  assert.equal(output, `${updater}\n`);
});

test("package metadata is read from the staged official Linux control file", (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "codex-package-common-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const metadataDir = path.join(root, ".codex-linux/upstream-package");
  fs.mkdirSync(metadataDir, { recursive: true });
  fs.writeFileSync(path.join(metadataDir, "control"), [
    "Package: chatgpt",
    "Architecture: arm64",
    "Depends: first (>= 1),",
    " second | third",
    "",
  ].join("\n"));

  assert.equal(runPackageCommon("upstream_linux_control_field Depends", root), "first (>= 1), second | third");
  assert.equal(runPackageCommon("official_payload_deb_architecture", root), "arm64\n");
});

test("package metadata rejects architectures without an official package", (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "codex-package-common-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const metadataDir = path.join(root, ".codex-linux/upstream-package");
  fs.mkdirSync(metadataDir, { recursive: true });
  fs.writeFileSync(path.join(metadataDir, "control"), "Architecture: armhf\n");

  const result = childProcess.spawnSync("bash", ["-c", [
    "set -euo pipefail",
    `REPO_DIR=${JSON.stringify(repoRoot)}`,
    `APP_DIR=${JSON.stringify(root)}`,
    `. ${JSON.stringify(path.join(repoRoot, "scripts/lib/package-common.sh"))}`,
    "official_payload_deb_architecture",
  ].join("\n")], { encoding: "utf8" });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /expected amd64 or arm64/);
});

test("Debian package control inherits dependency fields from upstream", () => {
  const template = fs.readFileSync(path.join(repoRoot, "packaging/linux/control"), "utf8");
  const builder = fs.readFileSync(path.join(repoRoot, "scripts/build-deb.sh"), "utf8");
  assert.match(template, /^Depends: __UPSTREAM_DEPENDENCIES__/m);
  assert.match(template, /^Recommends: __UPSTREAM_RECOMMENDS__$/m);
  assert.match(template, /^Suggests: __UPSTREAM_SUGGESTS__$/m);
  for (const field of ["Depends", "Recommends", "Suggests"]) {
    assert.match(builder, new RegExp(`upstream_linux_control_field ${field}`));
  }
});

test("non-Debian package formats map the official runtime libraries", () => {
  const rpm = fs.readFileSync(path.join(repoRoot, "packaging/linux/codex-desktop.spec"), "utf8");
  const pacman = fs.readFileSync(path.join(repoRoot, "packaging/linux/PKGBUILD.template"), "utf8");
  const flake = fs.readFileSync(path.join(repoRoot, "flake.nix"), "utf8");

  for (const soname of [
    "libatspi.so.0",
    "libnotify.so.4",
    "libssl.so.3",
    "libtss2-esys.so.0",
    "libtss2-mu.so.0",
    "libtss2-tcti-device.so.0",
    "libusb-1.0.so.0",
    "libX11-xcb.so.1",
  ]) {
    assert.match(rpm, new RegExp(soname.replaceAll(".", "\\.")));
  }
  for (const packageName of ["libnotify", "libusb", "openssl", "systemd-libs", "tpm2-tss", "xz"]) {
    assert.match(pacman, new RegExp(`'${packageName}'`));
  }
  assert.match(rpm, /Requires:.*\bxz\b/);
  for (const packageName of ["graphite2", "libglvnd", "openssl", "tpm2-tss", "xz"]) {
    assert.match(flake, new RegExp(`\\b${packageName}\\b`));
  }
});

test("RPM updater selects the distro-specific GnuPG package", () => {
  const rpm = fs.readFileSync(path.join(repoRoot, "packaging/linux/codex-desktop.spec"), "utf8");
  assert.match(
    rpm,
    /%if __PACKAGE_WITH_UPDATER__\nRequires:\s+polkit, curl, dpkg, nodejs, xdg-utils\n%if 0%\{\?suse_version\}\nRequires:\s+gpg2\n%else\nRequires:\s+gnupg2\n%endif\n%else\nRequires:\s+xdg-utils\n%endif/,
  );
});

test("update-builder copies staged native feature artifacts without Cargo workspaces", (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "codex-update-builder-artifact-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const source = path.join(root, "source", "helper");
  const target = path.join(root, "builder", "target", "release", "helper");
  fs.mkdirSync(path.dirname(source), { recursive: true });
  fs.writeFileSync(source, "#!/bin/sh\nexit 0\n", { mode: 0o755 });

  runPackageCommon(
    `stage_update_builder_native_artifact ${JSON.stringify(source)} ${JSON.stringify(target)} test-helper`,
    root,
  );

  assert.equal(fs.readFileSync(target, "utf8"), "#!/bin/sh\nexit 0\n");
  assert.equal(fs.statSync(target).mode & 0o777, 0o755);

  const common = fs.readFileSync(path.join(repoRoot, "scripts/lib/package-common.sh"), "utf8");
  assert.doesNotMatch(common, /cp -a "\$REPO_DIR\/\$consumer"/);
  for (const artifact of [
    "codex-computer-use-linux",
    "codex-computer-use-cosmic",
    "codex-computer-use-indicator",
    "codex-global-dictation-linux",
    "codex-mcp-helper-reaper",
    "codex-read-aloud-linux",
    "codex-record-replay-linux",
  ]) {
    assert.match(common, new RegExp(artifact));
  }
});

test("Chronicle-only packaging retains the shared backend for updater rebuilds", (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "codex-update-builder-chronicle-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const config = path.join(root, "features.json");
  const backend = path.join(root, "app/resources/native/codex-record-replay-linux");
  const builder = path.join(root, "builder");
  fs.writeFileSync(config, `${JSON.stringify({ enabled: ["chronicle-skysight"] })}\n`);
  fs.mkdirSync(path.dirname(backend), { recursive: true });
  fs.writeFileSync(backend, "#!/bin/sh\nexit 0\n", { mode: 0o755 });

  runPackageCommon(
    `CODEX_LINUX_FEATURES_CONFIG=${JSON.stringify(config)} stage_enabled_native_feature_artifacts ${JSON.stringify(builder)}`,
    path.join(root, "app"),
  );

  const retainedBackend = path.join(builder, "target/release/codex-record-replay-linux");
  assert.equal(fs.readFileSync(retainedBackend, "utf8"), "#!/bin/sh\nexit 0\n");
  assert.equal(fs.statSync(retainedBackend).mode & 0o777, 0o755);
});

for (const enabled of [[], ["global-dictation"], ["wayland-global-shortcuts"], ["global-dictation", "wayland-global-shortcuts"]]) {
  test(`shortcut helper packaging and build selection: ${enabled.join(",") || "disabled"}`, (t) => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "codex-shortcuts-package-"));
    t.after(() => fs.rmSync(root, { recursive: true, force: true }));
    const config = path.join(root, "features.json"), builder = path.join(root, "builder");
    const app = path.join(root, "app"), helper = path.join(app, "resources/native/codex-global-dictation-linux");
    const binDir = path.join(root, "bin"), cargoLog = path.join(root, "cargo.log");
    fs.writeFileSync(config, JSON.stringify({enabled}));
    fs.mkdirSync(path.dirname(helper), {recursive: true});
    fs.writeFileSync(helper, "#!/bin/sh\nexit 0\n", {mode: 0o755});
    runPackageCommon(
      `CODEX_LINUX_FEATURES_CONFIG=${JSON.stringify(config)} stage_enabled_native_feature_artifacts ${JSON.stringify(builder)}\n` +
      `CODEX_LINUX_FEATURES_CONFIG=${JSON.stringify(config)} stage_update_builder_linux_features_tree ${JSON.stringify(builder)}`,
      app,
    );
    const retained = path.join(builder, "global-dictation-linux/target/release/codex-global-dictation-linux");
    assert.equal(fs.existsSync(retained), enabled.length > 0);
    if (enabled.length) assert.equal(fs.statSync(retained).mode & 0o777, 0o755);
    fs.cpSync(path.join(repoRoot, "scripts/patches"), path.join(builder, "scripts/patches"), {recursive: true});
    for (const id of ["global-dictation", "wayland-global-shortcuts"]) {
      const feature = path.join(builder, "linux-features", id);
      assert.equal(fs.existsSync(feature), enabled.includes(id));
      if (enabled.includes(id)) assert.equal(require(path.join(feature, "patch.js")).descriptors.length, 1);
    }
    fs.mkdirSync(binDir);
    fs.writeFileSync(path.join(binDir, "cargo"), '#!/bin/sh\nprintf "%s\\n" "$*" >> "$CARGO_LOG"\n', {mode: 0o755});
    const result = childProcess.spawnSync("make", ["build-native-feature-helpers"], {
      cwd: repoRoot, encoding: "utf8", env: {...process.env, CODEX_LINUX_FEATURES_CONFIG: config,
        CARGO_LOG: cargoLog, PATH: `${binDir}:${process.env.PATH}`},
    });
    assert.equal(result.status, 0, result.stderr);
    const builds = fs.existsSync(cargoLog) ? fs.readFileSync(cargoLog, "utf8").trim().split("\n") : [];
    assert.equal(builds.length, enabled.length ? 1 : 0);
    if (builds.length) assert.match(builds[0], /--manifest-path global-dictation-linux\/Cargo.toml/);
    const common = fs.readFileSync(path.join(repoRoot, "scripts/lib/package-common.sh"), "utf8");
    assert.match(common, /\n\s+stage-global-shortcuts\.sh \\/);
  });
}

test("Chronicle-only native helper setup builds the shared backend", (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "codex-native-helper-chronicle-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const config = path.join(root, "features.json");
  const binDir = path.join(root, "bin");
  const cargoLog = path.join(root, "cargo.log");
  fs.writeFileSync(config, `${JSON.stringify({ enabled: ["chronicle-skysight"] })}\n`);
  fs.mkdirSync(binDir, { recursive: true });
  fs.writeFileSync(
    path.join(binDir, "cargo"),
    "#!/bin/sh\nprintf '%s\\n' \"$*\" >> \"$CARGO_LOG\"\n",
    { mode: 0o755 },
  );

  const result = childProcess.spawnSync("make", ["build-native-feature-helpers"], {
    cwd: repoRoot,
    encoding: "utf8",
    env: {
      ...process.env,
      CARGO_LOG: cargoLog,
      CODEX_LINUX_FEATURES_CONFIG: config,
      PATH: `${binDir}:${process.env.PATH}`,
    },
  });

  assert.equal(result.status, 0, result.stderr);
  assert.equal(fs.existsSync(cargoLog), true);
  assert.match(fs.readFileSync(cargoLog, "utf8"), /build .*--release -p codex-record-replay-linux/);
});

test("update-builder carries the shared feature compatibility registry", (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "codex-update-builder-features-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const builder = path.join(root, "builder");

  runPackageCommon(
    `CODEX_LINUX_FEATURES_CONFIG=${JSON.stringify(path.join(repoRoot, "linux-features/features.example.json"))} stage_update_builder_linux_features_tree ${JSON.stringify(builder)}`,
    root,
  );

  assert.deepEqual(
    JSON.parse(fs.readFileSync(path.join(builder, "linux-features/compatibility.json"), "utf8")),
    JSON.parse(fs.readFileSync(path.join(repoRoot, "linux-features/compatibility.json"), "utf8")),
  );
  copyFeatureHelpers(repoRoot, builder);
  assert.equal(
    childProcess.execFileSync(
      process.execPath,
      [path.join(builder, "scripts/lib/linux-features.js"), "--enabled"],
      {
        encoding: "utf8",
        env: {
          ...process.env,
          CODEX_LINUX_FEATURES_CONFIG: path.join(builder, "linux-features/features.example.json"),
        },
      },
    ),
    "",
  );
});

test("update-builder preserves enabled local features for future rebuilds", (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "codex-update-builder-local-feature-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const sourceRoot = path.join(root, "source");
  const featuresRoot = path.join(sourceRoot, "linux-features");
  const builder = path.join(root, "builder");
  copyFeatureHelpers(repoRoot, sourceRoot);
  fs.mkdirSync(path.join(featuresRoot, "local/selected-feature"), { recursive: true });
  fs.mkdirSync(path.join(featuresRoot, "local/disabled-feature"), { recursive: true });
  fs.mkdirSync(path.join(featuresRoot, "selected-feature"));
  for (const name of ["features.example.json", "compatibility.json"]) {
    fs.copyFileSync(path.join(repoRoot, "linux-features", name), path.join(featuresRoot, name));
  }
  for (const id of ["selected-feature", "disabled-feature"]) {
    const featureDir = path.join(featuresRoot, "local", id);
    fs.writeFileSync(path.join(featureDir, "feature.json"), `${JSON.stringify({ id, defaultEnabled: false })}\n`);
    fs.writeFileSync(path.join(featureDir, "README.md"), `${id}\n`);
  }
  fs.writeFileSync(path.join(featuresRoot, "local/selected-feature/patch.js"), "module.exports = [];\n");
  fs.writeFileSync(path.join(featuresRoot, "features.json"), '{"enabled":["selected-feature"]}\n');

  runPackageCommon(
    `stage_update_builder_linux_features_tree ${JSON.stringify(builder)}\n` +
      `stage_update_builder_linux_features_config ${JSON.stringify(builder)}`,
    root,
    sourceRoot,
  );

  assert.equal(fs.existsSync(path.join(builder, "linux-features/local/selected-feature/feature.json")), true);
  assert.equal(fs.existsSync(path.join(builder, "linux-features/local/selected-feature/patch.js")), true);
  assert.equal(fs.existsSync(path.join(builder, "linux-features/selected-feature")), false);
  assert.equal(fs.existsSync(path.join(builder, "linux-features/local/disabled-feature")), false);
  fs.mkdirSync(path.join(builder, "scripts/lib"), { recursive: true });
  copyFeatureHelpers(sourceRoot, builder);
  assert.equal(
    childProcess.execFileSync(
      process.execPath,
      [path.join(builder, "scripts/lib/linux-features.js"), "--enabled"],
      { encoding: "utf8" },
    ),
    "selected-feature\n",
  );

  fs.writeFileSync(path.join(featuresRoot, "features.json"), '{"enabled":["missing-feature"]}\n');
  assert.throws(
    () => runPackageCommon(
      `stage_update_builder_linux_features_tree ${JSON.stringify(path.join(root, "invalid-builder"))}`,
      root,
      sourceRoot,
    ),
    /Failed to discover enabled Linux features for the update-builder/,
  );
});

test("update-builder stages the attached CLI resource", (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "codex-update-builder-attached-cli-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const config = path.join(root, "features.json");
  const builder = path.join(root, "builder");
  fs.writeFileSync(config, `${JSON.stringify({ enabled: ["shared-app-server-socket"] })}\n`);

  runPackageCommon(
    `CODEX_LINUX_FEATURES_CONFIG=${JSON.stringify(config)} stage_update_builder_linux_features_tree ${JSON.stringify(builder)}\n` +
      `CODEX_LINUX_FEATURES_CONFIG=${JSON.stringify(config)} stage_update_builder_linux_features_config ${JSON.stringify(builder)}`,
    root,
  );

  const staged = path.join(
    builder,
    "linux-features/shared-app-server-socket/attached-cli.sh",
  );
  assert.equal(fs.lstatSync(staged).isFile(), true);
  assert.equal(fs.statSync(staged).mode & 0o777, 0o755);
  assert.deepEqual(
    JSON.parse(fs.readFileSync(path.join(builder, "linux-features/features.json"), "utf8")),
    { enabled: ["shared-app-server-socket"] },
  );
});

test("update-builder omits directory-watch acceptance-only evidence", (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "codex-update-builder-watchbound-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const config = path.join(root, "features.json");
  const builder = path.join(root, "builder");
  fs.writeFileSync(
    config,
    `${JSON.stringify({ enabled: ["directory-only-working-tree-watch"] })}\n`,
  );

  runPackageCommon(
    `CODEX_LINUX_FEATURES_CONFIG=${JSON.stringify(config)} stage_update_builder_linux_features_tree ${JSON.stringify(builder)}`,
    root,
  );

  const stagedFeature = path.join(
    builder,
    "linux-features/directory-only-working-tree-watch",
  );
  for (const runtimeInput of [
    "feature.json",
    "patch.js",
    "watchbound-artifacts.json",
    "watchbound-package.js",
  ]) {
    assert.equal(fs.existsSync(path.join(stagedFeature, runtimeInput)), true);
  }
  assert.equal(fs.existsSync(path.join(stagedFeature, "acceptance")), false);
});

test("update-builder stages only plugin templates consumed by enabled feature hooks", (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "codex-update-builder-plugins-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const config = path.join(root, "features.json");
  fs.writeFileSync(config, `${JSON.stringify({ enabled: ["computer-use-linux", "read-aloud-mcp"] })}\n`);
  const builder = path.join(root, "builder");

  runPackageCommon(
    `CODEX_LINUX_FEATURES_CONFIG=${JSON.stringify(config)} stage_update_builder_enabled_plugin_templates ${JSON.stringify(builder)}`,
    root,
  );

  for (const pluginId of ["computer-use", "read-aloud"]) {
    assert.equal(
      fs.existsSync(path.join(builder, "plugins/openai-bundled/plugins", pluginId, ".codex-plugin/plugin.json")),
      true,
    );
  }
  assert.deepEqual(
    fs.readdirSync(path.join(builder, "plugins/openai-bundled/plugins")).sort(),
    ["computer-use", "read-aloud"],
  );
});

function put(root, relative, contents, mode = 0o644) {
  const file = path.join(root, relative);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, contents, { mode });
  fs.chmodSync(file, mode);
}

function treeSnapshot(root) {
  const result = {};
  function visit(dir, prefix = "") {
    for (const name of fs.readdirSync(dir).sort()) {
      const relative = prefix ? `${prefix}/${name}` : name;
      const file = path.join(dir, name);
      const stat = fs.lstatSync(file);
      if (stat.isSymbolicLink()) {
        result[relative] = { link: fs.readlinkSync(file) };
      } else if (stat.isDirectory()) {
        visit(file, relative);
      } else {
        result[relative] = { bytes: fs.readFileSync(file).toString("hex"), mode: stat.mode & 0o777 };
      }
    }
  }
  visit(root);
  return result;
}

function builderFixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "codex-builder-tests-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const source = path.join(root, "source");
  const app = path.join(root, "app");
  fs.mkdirSync(source);
  fs.mkdirSync(app);
  for (const relative of ["install.sh", "launcher", "scripts/lib", "scripts/patches",
    "scripts/build-deb.sh", "scripts/build-rpm.sh", "scripts/build-pacman.sh",
    "scripts/patch-linux-window-ui.js", "packaging/linux", "assets",
    "plugins/openai-bundled/plugins/computer-use", "plugins/openai-bundled/plugins/read-aloud"]) {
    const target = path.join(source, relative);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.cpSync(path.join(repoRoot, relative), target, { recursive: true, verbatimSymlinks: true });
  }
  for (const name of ["features.example.json", "compatibility.json"]) {
    put(source, `linux-features/${name}`, fs.readFileSync(path.join(repoRoot, "linux-features", name)));
  }
  return { root, source, app };
}

function fixtureFeature(source, directory, id, files = {}, extra = {}) {
  const relative = `linux-features/${directory}`;
  put(source, `${relative}/feature.json`, JSON.stringify({ id, defaultEnabled: false, ...extra }));
  put(source, `${relative}/README.md`, `${id}\n`);
  for (const [name, contents] of Object.entries(files)) put(source, `${relative}/${name}`, contents);
}

function stageFixture(source, app, stage, enabled, extraEnv = {}) {
  if (enabled !== null) put(source, "linux-features/features.json", JSON.stringify({ enabled }));
  const env = { ...process.env };
  for (const key of ["CODEX_LINUX_FEATURES_ROOT", "CODEX_LINUX_FEATURES_CONFIG",
    "CODEX_INTERNAL_LINUX_FEATURE_IDS", "GIT_DIR", "GIT_WORK_TREE"]) delete env[key];
  childProcess.execFileSync("bash", ["-c", [
    "set -euo pipefail",
    '. "$REPO_DIR/scripts/lib/package-common.sh"',
    'stage_optional_update_builder_bundle "$STAGE_ROOT"',
  ].join("\n")], {
    cwd: source, encoding: "utf8",
    env: { ...env, REPO_DIR: source, APP_DIR: app, STAGE_ROOT: stage,
      PACKAGE_NAME: "codex-desktop", PACKAGE_WITH_UPDATER: "1", ...extraEnv },
  });
  return path.join(stage, "opt/codex-desktop/update-builder");
}

function assertInventory(builder) {
  const manifest = ".codex-linux/update-builder-manifest.txt";
  const files = Object.entries(treeSnapshot(builder))
    .filter(([relative, entry]) => relative !== manifest && !entry.link)
    .map(([relative]) => relative).sort();
  assert.equal(fs.readFileSync(path.join(builder, manifest), "utf8"), `${files.join("\n")}\n`);
}

function copyUpdaterRoots(source, destination) {
  // updater/src/builder.rs REQUIRED_BUNDLE_ENTRIES and OPTIONAL_BUNDLE_ENTRIES.
  // This fixture checks packaging generation two; it is not a replacement updater.
  const required = ["install.sh", "launcher", "scripts/build-deb.sh", "scripts/build-rpm.sh",
    "scripts/build-pacman.sh", "scripts/patch-linux-window-ui.js", "scripts/lib",
    "scripts/patches", "packaging/linux", "assets", "linux-features"];
  const optional = ["target", "global-dictation-linux", "plugins"];
  for (const relative of [...required, ...optional]) {
    const from = path.join(source, relative);
    if (!fs.existsSync(from) && optional.includes(relative)) continue;
    assert.equal(fs.existsSync(from), true, relative);
    const to = path.join(destination, relative);
    fs.mkdirSync(path.dirname(to), { recursive: true });
    fs.cpSync(from, to, { recursive: true, verbatimSymlinks: true });
  }
}



const nativeIds = ["computer-use-linux", "global-dictation", "mcp-helper-reaper",
  "read-aloud-mcp", "chronicle-skysight"];
const nativePaths = [
  ["resources/plugins/openai-bundled/plugins/unified-computer-use/bin/codex-computer-use-linux", "target/release/codex-computer-use-linux"],
  ["resources/plugins/openai-bundled/plugins/unified-computer-use/bin/codex-computer-use-cosmic", "target/release/codex-computer-use-cosmic"],
  ["resources/plugins/openai-bundled/plugins/unified-computer-use/bin/codex-computer-use-indicator", "target/release/codex-computer-use-indicator"],
  ["resources/native/codex-global-dictation-linux", "global-dictation-linux/target/release/codex-global-dictation-linux"],
  [".codex-linux/mcp-helper-reaper/codex-mcp-helper-reaper", "linux-features/mcp-helper-reaper/reaper/target/release/codex-mcp-helper-reaper"],
  ["resources/plugins/openai-bundled/plugins/read-aloud/bin/codex-read-aloud-linux", "target/release/codex-read-aloud-linux"],
  ["resources/native/codex-record-replay-linux", "target/release/codex-record-replay-linux"],
];


test("update-builder omits only repository component test roots", (t) => {
  const { root, source, app } = builderFixture(t);
  fixtureFeature(source, "repository-directory", "different-repository-id", {
    "tests/test.js": "throw new Error('must not execute');\n",
    "test.js": "production filename\n",
    "fixtures/data.json": "{}\n",
    "resources/tests/data.json": "nested production data\n",
  });
  fixtureFeature(source, "local/private-directory", "different-private-id", {
    "tests/data.json": "private production data\n", "test.js": "private production entry\n",
    "fixtures/data.json": "private fixture-named data\n",
  });
  fixtureFeature(source, "no-test-root", "no-test-root");
  fixtureFeature(source, "disabled", "disabled", { "tests/test.js": "disabled\n" });
  put(source, "scripts/patches/tests/sentinel.txt", "omit shared root\n");
  put(source, "scripts/patches/impl/resources/tests/data.json", "retain nested shared data\n");
  put(source, "linux-features/features.json", JSON.stringify({
    enabled: ["different-repository-id", "different-private-id", "no-test-root"],
  }));
  const before = treeSnapshot(source);
  const builder = stageFixture(source, app, path.join(root, "stage"),
    ["different-repository-id", "different-private-id", "no-test-root"]);
  assert.equal(fs.existsSync(path.join(builder, "linux-features/repository-directory/tests")), false);
  assert.equal(fs.existsSync(path.join(builder, "scripts/patches/tests")), false);
  assert.equal(fs.existsSync(path.join(builder, "linux-features/disabled")), false);
  for (const relative of ["linux-features/repository-directory/test.js",
    "linux-features/repository-directory/fixtures/data.json",
    "linux-features/repository-directory/resources/tests/data.json",
    "linux-features/local/private-directory/tests/data.json",
    "linux-features/local/private-directory/test.js",
    "linux-features/local/private-directory/fixtures/data.json",
    "scripts/patches/impl/resources/tests/data.json"]) {
    assert.deepEqual(treeSnapshot(builder)[relative], before[relative], relative);
  }
  assert.deepEqual(treeSnapshot(source), before);
  assertInventory(builder);
});

test("update-builder rejects copied repository feature-directory symlinks before pruning", (t) => {
  const { root, source, app } = builderFixture(t);
  const outside = path.join(root, "outside-feature");
  put(outside, "feature.json", JSON.stringify({ id: "linked-feature", defaultEnabled: false }));
  put(outside, "README.md", "External disposable feature\n");
  put(outside, "tests/keep.txt", "external test input must survive\n", 0o640);
  fs.chmodSync(outside, 0o750);
  fs.chmodSync(path.join(outside, "tests"), 0o750);
  const sourceLink = path.join(source, "linux-features/linked-directory");
  fs.symlinkSync(outside, sourceLink);
  put(source, "linux-features/features.json", JSON.stringify({ enabled: ["linked-feature"] }));
  const sourceBefore = treeSnapshot(source);
  const outsideBefore = treeSnapshot(outside);
  const linkModeBefore = fs.lstatSync(sourceLink).mode;
  const directoryModesBefore = ["", "tests"].map((relative) =>
    fs.statSync(path.join(outside, relative)).mode & 0o777);
  assert.throws(
    () => stageFixture(source, app, path.join(root, "stage"), ["linked-feature"]),
    /Refusing to prune tests through a repository feature symlink/,
  );
  assert.deepEqual(treeSnapshot(source), sourceBefore);
  assert.deepEqual(treeSnapshot(outside), outsideBefore);
  assert.equal(fs.lstatSync(sourceLink).isSymbolicLink(), true);
  assert.equal(fs.lstatSync(sourceLink).mode, linkModeBefore);
  assert.equal(fs.readlinkSync(sourceLink), outside);
  assert.deepEqual(["", "tests"].map((relative) =>
    fs.statSync(path.join(outside, relative)).mode & 0o777), directoryModesBefore);
});

test("update-builder test-root omission unlinks copied symlinks without touching referents", (t) => {
  const { root, source, app } = builderFixture(t);
  fixtureFeature(source, "linked", "linked");
  const outside = path.join(root, "outside");
  put(outside, "keep.txt", "outside\n");
  fs.symlinkSync(outside, path.join(source, "linux-features/linked/tests"));
  fs.rmSync(path.join(source, "scripts/patches/tests"), { recursive: true, force: true });
  fs.symlinkSync(outside, path.join(source, "scripts/patches/tests"));
  const before = treeSnapshot(outside);
  const builder = stageFixture(source, app, path.join(root, "stage"), ["linked"]);
  for (const relative of ["linux-features/linked/tests", "scripts/patches/tests"]) {
    assert.equal(fs.existsSync(path.join(builder, relative)), false);
    assert.equal(fs.lstatSync(path.join(source, relative)).isSymbolicLink(), true);
  }
  assert.deepEqual(treeSnapshot(outside), before);
});

const repositoryFeatures = fs.readdirSync(path.join(repoRoot, "linux-features"), { withFileTypes: true })
  .filter((entry) => entry.isDirectory() && entry.name !== "local" &&
    fs.existsSync(path.join(repoRoot, "linux-features", entry.name, "feature.json")))
  .map((entry) => {
    const dir = path.join(repoRoot, "linux-features", entry.name);
    const manifest = JSON.parse(fs.readFileSync(path.join(dir, "feature.json"), "utf8"));
    return { dir, relativeDir: entry.name, id: manifest.id, manifest };
  }).sort((left, right) => left.id.localeCompare(right.id));
const dependencies = { "record-and-replay": ["chronicle-skysight"],
  "global-dictation-gnome": ["global-dictation"] };

for (const feature of repositoryFeatures) {
  test(`update-builder preserves production inputs for ${feature.id}`, (t) => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "codex-feature-staging-"));
    t.after(() => fs.rmSync(root, { recursive: true, force: true }));
    const source = path.join(root, "source");
    copyFeatureHelpers(repoRoot, source);
    for (const name of ["features.example.json", "compatibility.json"]) {
      put(source, `linux-features/${name}`, fs.readFileSync(path.join(repoRoot, "linux-features", name)));
    }
    const enabled = [feature.id, ...(dependencies[feature.id] || [])];
    const selected = enabled.map((id) => {
      const candidate = repositoryFeatures.find((entry) => entry.id === id);
      assert.ok(candidate, `Missing fixture dependency: ${id}`);
      return candidate;
    });
    for (const candidate of selected) {
      const destination = path.join(source, "linux-features", candidate.relativeDir);
      fs.cpSync(candidate.dir, destination, {
        recursive: true, verbatimSymlinks: true,
        filter: (file) => !(path.basename(file) === "target" && fs.lstatSync(file).isDirectory()),
      });
      put(destination, "tests/staging-sentinel", "omit\n");
      put(destination, "generated/target/staging-sentinel", "omit generated\n");
    }
    put(source, "linux-features/features.json", JSON.stringify({ enabled: [feature.id] }));
    const builder = path.join(root, "tree");
    const before = treeSnapshot(path.join(source, "linux-features"));
    const internal = selected.filter((entry) => entry.manifest.internal).map((entry) => entry.id).join(",");
    // Only tree staging: never graft or execute real native helpers here.
    runPackageCommon(
      `export CODEX_LINUX_FEATURES_ROOT=${JSON.stringify(path.join(source, "linux-features"))}\n` +
      `export CODEX_LINUX_FEATURES_CONFIG=${JSON.stringify(path.join(source, "linux-features/features.json"))}\n` +
      `export CODEX_INTERNAL_LINUX_FEATURE_IDS=${JSON.stringify(internal)}\n` +
      `stage_update_builder_linux_features_tree ${JSON.stringify(builder)}`,
      root, source,
    );
    for (const candidate of selected) {
      const staged = path.join(builder, "linux-features", candidate.relativeDir);
      const original = treeSnapshot(path.join(source, "linux-features", candidate.relativeDir));
      const expected = Object.fromEntries(Object.entries(original).filter(([relative]) => {
        const parts = relative.split("/");
        if (parts[0] === "tests" || parts.includes("target")) return false;
        if (candidate.id === "directory-only-working-tree-watch" && parts[0] === "acceptance") return false;
        if (candidate.id === "mcp-helper-reaper" &&
          (relative.startsWith("reaper/src/") || ["reaper/Cargo.toml", "reaper/Cargo.lock"].includes(relative))) return false;
        return true;
      }));
      assert.deepEqual(treeSnapshot(staged), expected, candidate.id);
      assert.equal(fs.existsSync(path.join(staged, "tests")), false);
      assert.equal(fs.existsSync(path.join(staged, "generated/target")), false);
    }
    assert.deepEqual(treeSnapshot(path.join(source, "linux-features")), before);
  });
}

test("update-builder generation two retains local inputs, consumers, plugins and native grafts", (t) => {
  const { root, source, app } = builderFixture(t);
  for (const id of nativeIds) {
    fs.cpSync(path.join(repoRoot, "linux-features", id), path.join(source, "linux-features", id),
      { recursive: true, verbatimSymlinks: true,
        filter: (file) => !(path.basename(file) === "target" && fs.lstatSync(file).isDirectory()) });
    put(source, `linux-features/${id}/tests/sentinel`, "omit\n");
    put(source, `linux-features/${id}/generated/target/debug/cache`, "omit cache\n");
  }
  for (const [from] of nativePaths) put(app, from, `#!/bin/sh\n# ${from}\nexit 97\n`, 0o755);
  for (const name of ["kokoro-stdin", "kokoro_stdin.py"]) {
    put(app, `resources/plugins/openai-bundled/plugins/read-aloud/bin/${name}`,
      `retained MCP runner: ${name}\n`, name === "kokoro-stdin" ? 0o755 : 0o644);
  }
  fixtureFeature(source, "owned-directory", "owned-id", {
    "tests/test.js": "throw new Error('not production');\n",
    "patch.js": 'const helper = require("./helper.js"); module.exports = [{id:"owned-fixture",phase:"main-bundle",apply:helper}];\n',
    "helper.js": 'const fs=require("node:fs");const path=require("node:path");module.exports=source=>source+JSON.parse(fs.readFileSync(path.join(__dirname,"labels.json"))).suffix;\n',
    "labels.json": '{"suffix":" retained"}\n',
    "skills/example/SKILL.md": "retained skill\n",
    "hook.sh": '#!/bin/sh\nset -eu\ncat "$(dirname "$0")/skills/example/SKILL.md" > "$INSTALL_DIR/hook-result"\n',
  }, { entrypoints: { patchDescriptors: "./patch.js", stageHook: "./hook.sh" } });
  fs.chmodSync(path.join(source, "linux-features/owned-directory/hook.sh"), 0o755);
  fixtureFeature(source, "local/private-directory", "private-id", {
    "tests/data.json": "private tests data\n", "fixtures/data.json": "private fixtures data\n",
    "test.js": "private production filename\n",
  });
  const enabled = [...nativeIds, "owned-id", "private-id"];
  const first = stageFixture(source, app, path.join(root, "stage-one"), enabled);
  assertInventory(first);
  for (const id of ["computer-use", "read-aloud"]) {
    const relative = `plugins/openai-bundled/plugins/${id}`;
    const expected = treeSnapshot(path.join(source, relative));
    if (id === "read-aloud") {
      const stagedPlugin = treeSnapshot(path.join(app, "resources", relative));
      for (const name of ["kokoro-stdin", "kokoro_stdin.py"]) {
        expected[`bin/${name}`] = stagedPlugin[`bin/${name}`];
      }
    }
    assert.deepEqual(treeSnapshot(path.join(first, relative)), expected);
  }
  const copied = path.join(root, "updater-copy");
  copyUpdaterRoots(first, copied);
  assert.equal(fs.existsSync(path.join(copied, ".git")), false);
  assert.equal(fs.existsSync(path.join(copied, ".codex-linux")), false);
  // Make the original fixture unavailable before invoking copied scripts/config.
  fs.renameSync(source, path.join(root, "source-unavailable"));
  const copiedConfig = fs.readFileSync(path.join(copied, "linux-features/features.json"));
  assert.deepEqual(new Set(JSON.parse(copiedConfig).enabled), new Set(enabled));
  const second = stageFixture(copied, app, path.join(root, "stage-two"), null);
  assert.deepEqual(fs.readFileSync(path.join(copied, "linux-features/features.json")), copiedConfig);
  for (const builder of [first, second]) {
    assertInventory(builder);
    assert.equal(fs.existsSync(path.join(builder, "scripts/patches/tests")), false);
    for (const directory of [...nativeIds, "owned-directory"]) {
      assert.equal(fs.existsSync(path.join(builder, "linux-features", directory, "tests")), false);
      assert.equal(fs.existsSync(path.join(builder, "linux-features", directory, "generated/target")), false);
    }
    for (const relative of ["reaper/src", "reaper/Cargo.toml", "reaper/Cargo.lock"]) {
      assert.equal(fs.existsSync(path.join(builder, "linux-features/mcp-helper-reaper", relative)), false);
    }
    for (const [from, to] of nativePaths) {
      assert.deepEqual(fs.readFileSync(path.join(builder, to)), fs.readFileSync(path.join(app, from)));
      assert.equal(fs.statSync(path.join(builder, to)).mode & 0o777, 0o755);
    }
    assert.deepEqual(treeSnapshot(path.join(builder, "plugins")), treeSnapshot(path.join(copied, "plugins")));
    const privateFiles = treeSnapshot(path.join(builder, "linux-features/local/private-directory"));
    assert.equal(Buffer.from(privateFiles["tests/data.json"].bytes, "hex").toString(), "private tests data\n");
    assert.equal(Buffer.from(privateFiles["fixtures/data.json"].bytes, "hex").toString(), "private fixtures data\n");
    assert.equal(Buffer.from(privateFiles["test.js"].bytes, "hex").toString(), "private production filename\n");
    const framework = require(path.join(builder, "scripts/lib/linux-features.js"));
    const options = { featuresRoot: path.join(builder, "linux-features"),
      featuresConfigPath: path.join(builder, "linux-features/features.json"), enabledFeatureIds: ["owned-id"] };
    assert.equal(framework.loadLinuxFeaturePatchDescriptors(options)[0].apply("inert"), "inert retained");
    const [hook] = framework.enabledLinuxFeatureStageHooks(options);
    const inertApp = path.join(root, builder === first ? "consumer-one" : "consumer-two");
    fs.mkdirSync(inertApp, { recursive: true });
    childProcess.execFileSync("bash", [hook.path], { env: { ...process.env, INSTALL_DIR: inertApp } });
    assert.equal(fs.readFileSync(path.join(inertApp, "hook-result"), "utf8"), "retained skill\n");
  }
  const withoutUpdater = stageFixture(copied, app, path.join(root, "disabled"), enabled,
    { PACKAGE_WITH_UPDATER: "0" });
  assert.equal(fs.existsSync(withoutUpdater), false);
  const disabledNative = stageFixture(copied, app, path.join(root, "no-native"), ["owned-id", "private-id"]);
  for (const [, to] of nativePaths) assert.equal(fs.existsSync(path.join(disabledNative, to)), false);
  assert.equal(fs.existsSync(path.join(disabledNative, "plugins")), false);
});

for (const [missingSource] of nativePaths) {
  test(`update-builder rejects missing native artifact ${path.basename(missingSource)}`, (t) => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "codex-native-staging-"));
    t.after(() => fs.rmSync(root, { recursive: true, force: true }));
    const source = path.join(root, "source");
    const app = path.join(root, "app");
    const builder = path.join(root, "builder");
    copyFeatureHelpers(repoRoot, source);
    for (const name of ["features.example.json", "compatibility.json"]) {
      put(source, `linux-features/${name}`, fs.readFileSync(path.join(repoRoot, "linux-features", name)));
    }
    for (const id of nativeIds) {
      for (const name of ["feature.json", "README.md"]) {
        put(source, `linux-features/${id}/${name}`,
          fs.readFileSync(path.join(repoRoot, "linux-features", id, name)));
      }
    }
    put(source, "linux-features/features.json", JSON.stringify({ enabled: nativeIds }));
    for (const [from] of nativePaths) {
      if (from !== missingSource) put(app, from, `#!/bin/sh\n# ${from}\nexit 97\n`, 0o755);
    }
    for (const name of ["kokoro-stdin", "kokoro_stdin.py"]) {
      put(app, `resources/plugins/openai-bundled/plugins/read-aloud/bin/${name}`, "inert runner\n");
    }
    assert.throws(
      () => runPackageCommon(
        `export CODEX_LINUX_FEATURES_ROOT=${JSON.stringify(path.join(source, "linux-features"))}\n` +
        `export CODEX_LINUX_FEATURES_CONFIG=${JSON.stringify(path.join(source, "linux-features/features.json"))}\n` +
        'export CODEX_INTERNAL_LINUX_FEATURE_IDS=""\n' +
        `stage_enabled_native_feature_artifacts ${JSON.stringify(builder)}`,
        app, source,
      ),
      /Missing staged native feature artifact/,
    );
  });
}

const readAloudPluginPath = "resources/plugins/openai-bundled/plugins/read-aloud";
const readAloudRunnerPaths = ["bin/kokoro-stdin", "bin/kokoro_stdin.py", "install-kokoro-runtime.sh"];
const shellQuote = (value) => `'${value.replaceAll("'", "'\\''")}'`;

function createReadAloudBuilderFixture(t, enabled, installer = true) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "read-aloud-builder-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const source = path.join(root, "source");
  for (const relative of [
    "install.sh", "launcher", "scripts/lib", "scripts/patches", "scripts/patch-linux-window-ui.js",
    "scripts/build-deb.sh", "scripts/build-rpm.sh", "scripts/build-pacman.sh", "packaging/linux", "assets",
    "linux-features/read-aloud", "linux-features/read-aloud-mcp",
    "linux-features/features.example.json", "linux-features/compatibility.json",
    "plugins/openai-bundled/plugins/read-aloud",
  ]) {
    fs.mkdirSync(path.dirname(path.join(source, relative)), { recursive: true });
    fs.cpSync(path.join(repoRoot, relative), path.join(source, relative), { recursive: true });
  }
  if (!installer) fs.unlinkSync(path.join(source, "linux-features/read-aloud/install-kokoro-runtime.sh"));
  fs.writeFileSync(path.join(source, "linux-features/features.json"), JSON.stringify({ enabled }));
  const marker = path.join(root, "executed");
  const inert = `#!/bin/sh\ntouch ${shellQuote(marker)}\nexit 99\n`;
  const backend = path.join(source, "target/release/codex-read-aloud-linux");
  fs.mkdirSync(path.dirname(backend), { recursive: true });
  fs.writeFileSync(backend, inert, { mode: 0o755 });
  const tools = path.join(root, "tools");
  fs.mkdirSync(tools);
  fs.writeFileSync(path.join(tools, "cargo"), inert, { mode: 0o755 });
  const env = {
    ...process.env,
    PATH: `${tools}:${process.env.PATH}`,
    CODEX_LINUX_FEATURES_ROOT: "",
    CODEX_LINUX_FEATURES_CONFIG: "",
    CODEX_LINUX_READ_ALOUD_MCP_SOURCE: "",
  };
  const files = new Map(readAloudRunnerPaths.filter((relative) => installer || relative.startsWith("bin/")).map((relative) => {
    const file = path.join(source, "linux-features/read-aloud", relative);
    return [path.basename(relative), { bytes: fs.readFileSync(file), mode: fs.statSync(file).mode & 0o777 }];
  }));
  files.set("codex-read-aloud-linux", { bytes: Buffer.from(inert), mode: 0o755 });
  return { root, source, env, marker, files };
}

function assertReadAloudFile(file, expected) {
  assert.deepEqual(fs.readFileSync(file), expected.bytes, file);
  assert.equal(fs.statSync(file).mode & 0o777, expected.mode, file);
}

function stageReadAloudApp(source, app, env) {
  const helper = path.join(source, "scripts/lib/linux-features.js");
  const hooks = childProcess.execFileSync(process.execPath, [helper, "--stage-hooks"], { cwd: source, env, encoding: "utf8" });
  for (const line of hooks.trim().split("\n").filter(Boolean)) {
    const [, hook] = line.split("\t");
    childProcess.execFileSync("bash", [hook], {
      cwd: source, env: { ...env, SCRIPT_DIR: source, INSTALL_DIR: app, ICON_SOURCE: "" }, stdio: "pipe",
    });
  }
}

function stageReadAloudBuilder(source, app, packageRoot, env) {
  childProcess.execFileSync("bash", ["-euc", [
    `REPO_DIR=${shellQuote(source)}`,
    `APP_DIR=${shellQuote(app)}`,
    "PACKAGE_NAME=codex-desktop",
    `. ${shellQuote(path.join(source, "scripts/lib/package-common.sh"))}`,
    `stage_update_builder_bundle ${shellQuote(packageRoot)}`,
  ].join("\n")], { cwd: source, env, stdio: "pipe" });
  return path.join(packageRoot, "opt/codex-desktop/update-builder");
}

for (const [label, enabled, alternate, rebuilds = 1] of [
  ["MCP-only", ["read-aloud-mcp"], null, 2],
  ["both features", ["read-aloud", "read-aloud-mcp"]],
  ["UI-only", ["read-aloud"]],
  ["disabled", []],
  ["MCP-only alternate feature root without sibling resources", ["read-aloud-mcp"], "missing"],
  ["MCP-only alternate feature root with different sibling resources", ["read-aloud-mcp"], "different"],
  ["both features with independently customized UI runners", ["read-aloud", "read-aloud-mcp"], "different", 2],
]) {
  test(`${label}: ${rebuilds} packaged rebuild(s) without original source or Cargo`, (t) => {
    const f = createReadAloudBuilderFixture(t, enabled);
    const alternateRoot = path.join(f.root, "alternate-features");
    if (alternate) {
      fs.mkdirSync(alternateRoot);
      for (const relative of [...enabled, "features.json", "features.example.json", "compatibility.json"]) {
        fs.cpSync(path.join(f.source, "linux-features", relative), path.join(alternateRoot, relative), { recursive: true });
      }
      if (alternate === "different") {
        for (const relative of readAloudRunnerPaths) {
          const file = path.join(alternateRoot, "read-aloud", relative);
          fs.mkdirSync(path.dirname(file), { recursive: true });
          fs.writeFileSync(file, "alternate tree does not own MCP runners\n", { mode: 0o600 });
        }
      }
      f.env.CODEX_LINUX_FEATURES_ROOT = alternateRoot;
    }
    const mcp = enabled.includes("read-aloud-mcp");
    const ui = enabled.includes("read-aloud");
    let app = path.join(f.root, "app-0");
    stageReadAloudApp(f.source, app, f.env);
    let builder = stageReadAloudBuilder(f.source, app, path.join(f.root, "package-0"), f.env);
    fs.rmSync(f.source, { recursive: true });
    fs.rmSync(alternateRoot, { recursive: true, force: true });
    f.env.CODEX_LINUX_FEATURES_ROOT = "";

    for (let generation = 1; generation <= rebuilds; generation++) {
      const featuresRoot = path.join(builder, "linux-features");
      const helper = require(path.join(builder, "scripts/lib/linux-features.js"));
      const options = { featuresRoot };
      assert.deepEqual(helper.enabledLinuxFeaturesConfig(options).enabled.sort(), [...enabled].sort());
      assert.equal(fs.existsSync(path.join(featuresRoot, "read-aloud")), ui);

      app = path.join(f.root, `app-${generation}`);
      stageReadAloudApp(builder, app, f.env);
      if (mcp) {
        for (const [name, expected] of f.files) {
          const retained = name === "codex-read-aloud-linux" ? "target/release" : "plugins/openai-bundled/plugins/read-aloud/bin";
          assertReadAloudFile(path.join(builder, retained, name), expected);
          assertReadAloudFile(path.join(app, readAloudPluginPath, "bin", name), expected);
        }
      } else {
        assert.equal(fs.existsSync(path.join(builder, "target")), false);
        assert.equal(fs.existsSync(path.join(builder, "plugins")), false);
      }

      assert.equal(fs.existsSync(path.join(app, "resources/read-aloud")), ui);
      if (ui) {
        for (const name of ["kokoro-stdin", "kokoro_stdin.py"]) {
          const expected = { ...f.files.get(name) };
          if (alternate === "different") expected.bytes = Buffer.from("alternate tree does not own MCP runners\n");
          assertReadAloudFile(path.join(app, "resources/read-aloud", name), expected);
        }
      }
      assert.equal(fs.existsSync(path.join(app, readAloudPluginPath)), mcp);
      if (generation < rebuilds) {
        builder = stageReadAloudBuilder(builder, app, path.join(f.root, `package-${generation}`), f.env);
      }
      assert.equal(fs.existsSync(f.marker), false, "staging must not execute the backend or Cargo");
    }
  });
}

for (const relative of ["bin/kokoro-stdin", "bin/kokoro_stdin.py"]) {
  test(`MCP builder rejects a missing required ${relative} during packaging`, (t) => {
    const f = createReadAloudBuilderFixture(t, ["read-aloud-mcp"]);
    const app = path.join(f.root, "app");
    stageReadAloudApp(f.source, app, f.env);
    const missing = path.join(app, readAloudPluginPath, relative);
    fs.unlinkSync(missing);
    assert.throws(() => stageReadAloudBuilder(f.source, app, path.join(f.root, "package"), f.env),
      (error) => error.status !== 0 && error.stderr.toString().includes(`Missing Read Aloud MCP runner: ${missing}`));
    assert.equal(fs.existsSync(f.marker), false);
  });
}

test("MCP preserves source installer absence and removes a stale template installer", (t) => {
  const f = createReadAloudBuilderFixture(t, ["read-aloud-mcp"], false);
  const installer = "bin/install-kokoro-runtime.sh";
  const app = path.join(f.root, "app-0");
  stageReadAloudApp(f.source, app, f.env);
  assert.equal(fs.existsSync(path.join(app, readAloudPluginPath, installer)), false);
  fs.writeFileSync(path.join(f.source, "plugins/openai-bundled/plugins/read-aloud", installer), "stale installer\n");
  const builder = stageReadAloudBuilder(f.source, app, path.join(f.root, "package-0"), f.env);
  fs.rmSync(f.source, { recursive: true });
  const rebuiltApp = path.join(f.root, "app-1");
  stageReadAloudApp(builder, rebuiltApp, f.env);
  assert.equal(fs.existsSync(path.join(builder, "plugins/openai-bundled/plugins/read-aloud", installer)), false);
  assert.equal(fs.existsSync(path.join(rebuiltApp, readAloudPluginPath, installer)), false);
  assert.equal(fs.existsSync(f.marker), false);
});
