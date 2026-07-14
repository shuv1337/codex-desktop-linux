#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const net = require("node:net");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const {
  enabledLinuxFeatureIds,
  enabledLinuxFeatureInstallPlan,
  loadLinuxFeaturePatchDescriptors,
} = require("../../scripts/lib/linux-features.js");
const {
  GATE_NEEDLE,
  MARKER,
  applySharedLocalAppServerCliPathGatePatch,
  applySharedLocalAppServerExtractedAppPatch,
} = require("./patch.js");

const FEATURE_ID = "shared-local-app-server";
const FEATURE_DIR = __dirname;
const WRAPPER = path.join(FEATURE_DIR, "codex-wrapper.sh");
const ENSURE_DAEMON = path.join(FEATURE_DIR, "ensure-daemon.sh");
const DOCTOR = path.join(FEATURE_DIR, "doctor.sh");

const RUNNING_JSON =
  '{"status":"running","backend":"pid","managedCodexVersion":"0.144.0","cliVersion":"0.144.0","appServerVersion":"0.144.0"}';
const NOT_RUNNING_JSON = '{"status":"notRunning","cliVersion":"0.144.0"}';
const SKEWED_JSON =
  '{"status":"running","backend":"pid","managedCodexVersion":"0.131.0","cliVersion":"0.144.0","appServerVersion":"0.131.0"}';

function withTempFeatureConfig(enabled, fn) {
  const originalConfig = process.env.CODEX_LINUX_FEATURES_CONFIG;
  const root = path.resolve(__dirname, "..");
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "codex-shared-local-app-server-"));
  process.env.CODEX_LINUX_FEATURES_CONFIG = path.join(tempDir, "features.json");
  try {
    fs.writeFileSync(process.env.CODEX_LINUX_FEATURES_CONFIG, JSON.stringify({ enabled }, null, 2));
    return fn(root);
  } finally {
    if (originalConfig == null) {
      delete process.env.CODEX_LINUX_FEATURES_CONFIG;
    } else {
      process.env.CODEX_LINUX_FEATURES_CONFIG = originalConfig;
    }
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

function makeSandbox() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "codex-shared-attach-"));
  const home = path.join(root, "home");
  const codexHome = path.join(home, ".codex");
  const realBin = path.join(root, "real-bin");
  const wrapperBin = path.join(root, "wrapper-bin");
  const stateDir = path.join(root, "state");
  const argsLog = path.join(stateDir, "args.log");
  for (const dir of [home, codexHome, realBin, wrapperBin, stateDir]) {
    fs.mkdirSync(dir, { recursive: true });
  }
  // Fake real codex: records argv; answers `app-server daemon version` from
  // $FAKE_DAEMON_JSON (or "running" after `daemon start` marked the state).
  const fakeCodex = path.join(realBin, "codex");
  fs.writeFileSync(
    fakeCodex,
    `#!/usr/bin/env bash
set -u
printf 'ARGS:%s\\n' "$*" >> "${argsLog}"
if [ "\${1:-}" = "app-server" ] && [ "\${2:-}" = "daemon" ]; then
  case "\${3:-}" in
    version)
      if [ -f "${stateDir}/started" ]; then
        printf '%s\\n' '${RUNNING_JSON}'
      elif [ -n "\${FAKE_DAEMON_JSON:-}" ]; then
        printf '%s\\n' "\$FAKE_DAEMON_JSON"
      else
        printf '%s\\n' '${NOT_RUNNING_JSON}'
      fi
      exit 0
      ;;
    start)
      touch "${stateDir}/started"
      exit "\${FAKE_DAEMON_START_EXIT:-0}"
      ;;
    enable-remote-control)
      touch "${stateDir}/remote-control-enabled"
      exit 0
      ;;
  esac
fi
exit 0
`,
    { mode: 0o755 },
  );
  fs.copyFileSync(WRAPPER, path.join(wrapperBin, "codex"));
  fs.chmodSync(path.join(wrapperBin, "codex"), 0o755);
  return {
    root,
    home,
    codexHome,
    realBin,
    wrapperBin,
    stateDir,
    argsLog,
    fakeCodex,
    cleanup() {
      fs.rmSync(root, { recursive: true, force: true });
    },
  };
}

function recordedCalls(sandbox) {
  if (!fs.existsSync(sandbox.argsLog)) {
    return [];
  }
  return fs
    .readFileSync(sandbox.argsLog, "utf8")
    .split("\n")
    .filter((line) => line.startsWith("ARGS:"))
    .map((line) => line.slice("ARGS:".length));
}

function lastCall(sandbox) {
  const calls = recordedCalls(sandbox);
  return calls.length > 0 ? calls[calls.length - 1] : null;
}

function runWrapper(sandbox, args, envOverrides = {}, options = {}) {
  return spawnSync(path.join(sandbox.wrapperBin, "codex"), args, {
    encoding: "utf8",
    cwd: options.cwd,
    env: {
      PATH: `${sandbox.wrapperBin}:${sandbox.realBin}:/usr/bin:/bin`,
      HOME: sandbox.home,
      CODEX_HOME: sandbox.codexHome,
      CODEX_SHARED_ATTACH_ASSUME_TTY: "1",
      ...envOverrides,
    },
  });
}

function withControlSocket(sandbox, fn) {
  const sockDir = path.join(sandbox.codexHome, "app-server-control");
  fs.mkdirSync(sockDir, { recursive: true });
  const sockPath = path.join(sockDir, "app-server-control.sock");
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.listen(sockPath, async () => {
      try {
        resolve(await fn(sockPath));
      } catch (error) {
        reject(error);
      } finally {
        server.close();
      }
    });
    server.on("error", reject);
  });
}

function runEnsureDaemon(sandbox, envOverrides = {}) {
  const featuresDir = path.join(sandbox.root, "features-staged");
  const featureResources = path.join(featuresDir, FEATURE_ID);
  fs.mkdirSync(featureResources, { recursive: true });
  fs.copyFileSync(WRAPPER, path.join(featureResources, "codex-wrapper.sh"));
  const appDir = path.join(sandbox.root, "app-dir");
  fs.mkdirSync(path.join(appDir, ".codex-linux"), { recursive: true });
  return spawnSync("bash", [ENSURE_DAEMON], {
    encoding: "utf8",
    env: {
      PATH: "/usr/bin:/bin",
      HOME: sandbox.home,
      CODEX_HOME: sandbox.codexHome,
      CODEX_SHARED_APP_SERVER_CODEX_PATH: sandbox.fakeCodex,
      CODEX_LINUX_FEATURES_DIR: featuresDir,
      CODEX_LINUX_APP_DIR: appDir,
      ...envOverrides,
    },
  });
}

test("feature manifest loads and is disabled by default", () => {
  withTempFeatureConfig([], () => {
    assert.ok(!enabledLinuxFeatureIds().includes(FEATURE_ID));
  });
  withTempFeatureConfig([FEATURE_ID], () => {
    assert.ok(enabledLinuxFeatureIds().includes(FEATURE_ID));
  });
});

test("install plan stages wrapper + doctor resources and env + prelaunch hooks", () => {
  withTempFeatureConfig([FEATURE_ID], () => {
    const plan = enabledLinuxFeatureInstallPlan();
    const resources = plan.resources.filter((entry) => entry.id === FEATURE_ID);
    assert.deepEqual(
      resources.map((entry) => entry.target).sort(),
      [
        ".codex-linux/features/shared-local-app-server/codex-wrapper.sh",
        ".codex-linux/features/shared-local-app-server/doctor.sh",
      ],
    );
    const hooks = plan.runtimeHooks.filter((entry) => entry.id === FEATURE_ID);
    assert.deepEqual(
      hooks.map((entry) => entry.target).sort(),
      [
        ".codex-linux/env.d/shared-local-app-server-env",
        ".codex-linux/prelaunch.d/shared-local-app-server-ensure-daemon.sh",
      ],
    );
    const prelaunch = hooks.find((entry) => entry.key === "prelaunch");
    assert.equal(prelaunch.mode & 0o111, 0o111 & prelaunch.mode);
    assert.ok(prelaunch.mode & 0o100, "prelaunch hook must be executable");
  });
});

test("gate patch removes only the CODEX_CLI_PATH term and is idempotent", () => {
  const gate =
    "return process.platform!==`win32`&&this.options.hostConfig.kind===`local`&&" +
    GATE_NEEDLE +
    "this.options.hostConfig.codex_cli_command==null&&await sB(e)?connectWs():spawnStdio()";
  const patched = applySharedLocalAppServerCliPathGatePatch(gate);
  assert.ok(patched.includes(MARKER), "marker comment must be present");
  assert.ok(!patched.includes("CODEX_CLI_PATH"), "CLI-path term must be removed");
  assert.ok(
    patched.includes("CODEX_APP_SERVER_FORCE_CLI!==`1`"),
    "FORCE_CLI escape hatch must survive",
  );
  assert.ok(
    patched.includes("codex_cli_command==null"),
    "per-host codex_cli_command guard must survive",
  );
  assert.equal(applySharedLocalAppServerCliPathGatePatch(patched), patched, "must be idempotent");

  const unrelated = "function noop(){return 1}";
  assert.equal(applySharedLocalAppServerCliPathGatePatch(unrelated), unrelated);
});

test("extracted-app patch sweeps .vite/build and reports matches", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "codex-shared-gate-"));
  try {
    const buildDir = path.join(root, ".vite", "build");
    fs.mkdirSync(buildDir, { recursive: true });
    fs.writeFileSync(path.join(buildDir, "other.js"), "console.log(1)");
    fs.writeFileSync(path.join(buildDir, "main.js"), `let x=1;${GATE_NEEDLE}rest()`);
    const result = applySharedLocalAppServerExtractedAppPatch(root);
    assert.deepEqual(result, { matched: 1, changed: 1 });
    const patched = fs.readFileSync(path.join(buildDir, "main.js"), "utf8");
    assert.ok(patched.includes(MARKER));
    assert.ok(!patched.includes("CODEX_CLI_PATH"));
    // Second run: idempotent, still counts the marker file as matched.
    assert.deepEqual(applySharedLocalAppServerExtractedAppPatch(root), {
      matched: 1,
      changed: 0,
    });
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("patch descriptors load through the feature framework", () => {
  withTempFeatureConfig([FEATURE_ID], () => {
    const descriptors = loadLinuxFeaturePatchDescriptors().filter((entry) =>
      entry.id.includes(FEATURE_ID),
    );
    assert.equal(descriptors.length, 2);
    assert.deepEqual(descriptors.map((entry) => entry.phase).sort(), [
      "extracted-app:post-webview",
      "main-bundle",
    ]);
  });
});

test("env hook exports exactly the upstream gate variable", () => {
  const content = fs.readFileSync(path.join(FEATURE_DIR, "shared-local-app-server.env"), "utf8");
  const assignments = content
    .split("\n")
    .filter((line) => line.trim() !== "" && !line.trim().startsWith("#"));
  assert.deepEqual(assignments, ["CODEX_APP_SERVER_USE_LOCAL_DAEMON=1"]);
});

test("shell scripts parse (bash -n)", () => {
  for (const script of [WRAPPER, ENSURE_DAEMON, DOCTOR]) {
    const result = spawnSync("bash", ["-n", script], { encoding: "utf8" });
    assert.equal(result.status, 0, `bash -n ${script}: ${result.stderr}`);
  }
});

test("wrapper passes through when stdin is not a TTY", async () => {
  const sandbox = makeSandbox();
  try {
    await withControlSocket(sandbox, async () => {
      const result = runWrapper(sandbox, [], { CODEX_SHARED_ATTACH_ASSUME_TTY: "" });
      assert.equal(result.status, 0);
      assert.equal(lastCall(sandbox), "");
      assert.ok(!recordedCalls(sandbox).some((call) => call.includes("--remote")));
    });
  } finally {
    sandbox.cleanup();
  }
});

test("wrapper attaches bare TUI when daemon is healthy", async () => {
  const sandbox = makeSandbox();
  try {
    await withControlSocket(sandbox, async () => {
      const result = runWrapper(sandbox, [], { FAKE_DAEMON_JSON: RUNNING_JSON });
      assert.equal(result.status, 0);
      assert.equal(lastCall(sandbox), `-C ${process.cwd()} --remote unix://`);
      assert.match(result.stderr, /attached to shared app-server/);
    });
  } finally {
    sandbox.cleanup();
  }
});

test("wrapper attaches resume and prompt positional", async () => {
  const sandbox = makeSandbox();
  try {
    await withControlSocket(sandbox, async () => {
      let result = runWrapper(sandbox, ["resume", "some-session"], {
        FAKE_DAEMON_JSON: RUNNING_JSON,
      });
      assert.equal(result.status, 0);
      assert.equal(lastCall(sandbox), `-C ${process.cwd()} resume some-session --remote unix://`);

      result = runWrapper(sandbox, ["fix the failing test"], { FAKE_DAEMON_JSON: RUNNING_JSON });
      assert.equal(result.status, 0);
      assert.equal(lastCall(sandbox), `-C ${process.cwd()} fix the failing test --remote unix://`);
    });
  } finally {
    sandbox.cleanup();
  }
});

test("wrapper sends the invoking directory to the shared app-server", async () => {
  const sandbox = makeSandbox();
  const projectDir = path.join(sandbox.root, "project with spaces");
  fs.mkdirSync(projectDir);
  try {
    await withControlSocket(sandbox, async () => {
      const result = runWrapper(
        sandbox,
        [],
        { FAKE_DAEMON_JSON: RUNNING_JSON },
        { cwd: projectDir },
      );
      assert.equal(result.status, 0, result.stderr);
      assert.equal(lastCall(sandbox), `-C ${projectDir} --remote unix://`);
    });
  } finally {
    sandbox.cleanup();
  }
});

test("wrapper passes through subcommands, flags-first, explicit --remote, kill switch", async () => {
  const sandbox = makeSandbox();
  try {
    await withControlSocket(sandbox, async () => {
      const cases = [
        { args: ["exec", "do things"], env: {} },
        { args: ["app-server", "daemon", "version"], env: {} },
        { args: ["-m", "gpt-5-codex", "prompt"], env: {} },
        { args: ["--remote", "unix:///tmp/x.sock"], env: {} },
        { args: [], env: { CODEX_SHARED_ATTACH_DISABLE: "1" } },
      ];
      for (const { args, env } of cases) {
        fs.rmSync(sandbox.argsLog, { force: true });
        const result = runWrapper(sandbox, args, { FAKE_DAEMON_JSON: RUNNING_JSON, ...env });
        assert.equal(result.status, 0, result.stderr);
        const calls = recordedCalls(sandbox);
        assert.equal(calls.length >= 1, true, `no call recorded for ${JSON.stringify(args)}`);
        assert.equal(
          calls[calls.length - 1],
          args.join(" "),
          `argv must pass through untouched for ${JSON.stringify(args)}`,
        );
      }
    });
  } finally {
    sandbox.cleanup();
  }
});

test("wrapper passes through when socket is missing or daemon unhealthy", async () => {
  const sandbox = makeSandbox();
  try {
    // No socket at all.
    let result = runWrapper(sandbox, []);
    assert.equal(result.status, 0);
    assert.equal(lastCall(sandbox), "");

    // Socket present but daemon reports notRunning.
    await withControlSocket(sandbox, async () => {
      fs.rmSync(sandbox.argsLog, { force: true });
      result = runWrapper(sandbox, [], { FAKE_DAEMON_JSON: NOT_RUNNING_JSON });
      assert.equal(result.status, 0);
      assert.equal(lastCall(sandbox), "");
      assert.ok(!recordedCalls(sandbox).some((call) => call.includes("--remote")));
    });
  } finally {
    sandbox.cleanup();
  }
});

test("ensure-daemon starts the daemon with code_mode_host and installs the wrapper", () => {
  const sandbox = makeSandbox();
  try {
    const result = runEnsureDaemon(sandbox);
    assert.equal(result.status, 0, result.stderr);
    const calls = recordedCalls(sandbox);
    assert.ok(
      calls.includes("app-server daemon start --enable code_mode_host"),
      `daemon start missing from: ${calls.join(" | ")}`,
    );
    assert.match(result.stderr, /shared daemon running/);
    const wrapperDest = path.join(sandbox.home, ".local", "bin", "codex");
    assert.ok(fs.existsSync(wrapperDest), "wrapper must be installed");
    assert.match(fs.readFileSync(wrapperDest, "utf8"), /codex-shared-local-app-server-wrapper/);
    assert.ok(fs.statSync(wrapperDest).mode & 0o100, "wrapper must be executable");
  } finally {
    sandbox.cleanup();
  }
});

test("ensure-daemon does not start when already running and warns on version skew", () => {
  const sandbox = makeSandbox();
  try {
    const result = runEnsureDaemon(sandbox, { FAKE_DAEMON_JSON: SKEWED_JSON });
    assert.equal(result.status, 0, result.stderr);
    const calls = recordedCalls(sandbox);
    assert.ok(!calls.some((call) => call.includes("daemon start")), "must not start a running daemon");
    assert.match(result.stderr, /older than CLI/);
  } finally {
    sandbox.cleanup();
  }
});

test("ensure-daemon refuses to fight a foreign socket", async () => {
  const sandbox = makeSandbox();
  try {
    await withControlSocket(sandbox, async () => {
      const result = runEnsureDaemon(sandbox, { FAKE_DAEMON_JSON: NOT_RUNNING_JSON });
      assert.equal(result.status, 0, result.stderr);
      const calls = recordedCalls(sandbox);
      assert.ok(!calls.some((call) => call.includes("daemon start")));
      assert.match(result.stderr, /not starting a second server/);
    });
  } finally {
    sandbox.cleanup();
  }
});

test("ensure-daemon enables remote control when remote-mobile-control is staged", () => {
  const sandbox = makeSandbox();
  try {
    const appDir = path.join(sandbox.root, "app-dir");
    fs.mkdirSync(path.join(appDir, ".codex-linux"), { recursive: true });
    fs.writeFileSync(
      path.join(appDir, ".codex-linux", "remote-mobile-control-enabled"),
      "remote-mobile-control\n",
    );
    const result = runEnsureDaemon(sandbox);
    assert.equal(result.status, 0, result.stderr);
    assert.ok(fs.existsSync(path.join(sandbox.stateDir, "remote-control-enabled")));
    assert.match(result.stderr, /enabled remote control/);
  } finally {
    sandbox.cleanup();
  }
});

test("ensure-daemon never clobbers a foreign ~/.local/bin/codex but reclaims standalone symlinks", () => {
  const sandbox = makeSandbox();
  try {
    const binDir = path.join(sandbox.home, ".local", "bin");
    fs.mkdirSync(binDir, { recursive: true });
    const dest = path.join(binDir, "codex");

    // Foreign script: preserved.
    fs.writeFileSync(dest, "#!/bin/sh\necho custom\n", { mode: 0o755 });
    let result = runEnsureDaemon(sandbox);
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stderr, /not the shared-attach wrapper; leaving it alone/);
    assert.equal(fs.readFileSync(dest, "utf8"), "#!/bin/sh\necho custom\n");

    // Standalone-runtime symlink (created by the standalone self-updater): reclaimed.
    fs.rmSync(dest);
    const standaloneBin = path.join(sandbox.codexHome, "packages", "standalone", "current", "bin");
    fs.mkdirSync(standaloneBin, { recursive: true });
    fs.writeFileSync(path.join(standaloneBin, "codex"), "#!/bin/sh\nexit 0\n", { mode: 0o755 });
    fs.symlinkSync(path.join(standaloneBin, "codex"), dest);
    fs.rmSync(path.join(sandbox.stateDir, "started"), { force: true });
    result = runEnsureDaemon(sandbox);
    assert.equal(result.status, 0, result.stderr);
    assert.ok(!fs.lstatSync(dest).isSymbolicLink(), "symlink must be replaced by the wrapper");
    assert.match(fs.readFileSync(dest, "utf8"), /codex-shared-local-app-server-wrapper/);
  } finally {
    sandbox.cleanup();
  }
});

test("ensure-daemon is a no-op when disabled", () => {
  const sandbox = makeSandbox();
  try {
    const result = runEnsureDaemon(sandbox, { CODEX_SHARED_APP_SERVER_DISABLE: "1" });
    assert.equal(result.status, 0, result.stderr);
    assert.equal(recordedCalls(sandbox).length, 0);
    assert.match(result.stderr, /disabled by CODEX_SHARED_APP_SERVER_DISABLE/);
  } finally {
    sandbox.cleanup();
  }
});

test("doctor runs read-only and prints a verdict", () => {
  const sandbox = makeSandbox();
  try {
    const result = spawnSync("bash", [DOCTOR], {
      encoding: "utf8",
      env: {
        PATH: `${sandbox.realBin}:/usr/bin:/bin`,
        HOME: sandbox.home,
        CODEX_HOME: sandbox.codexHome,
        CODEX_LINUX_APP_DIR: path.join(sandbox.root, "app-dir"),
      },
    });
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /Verdict:/);
    assert.match(result.stdout, /codex exec/);
  } finally {
    sandbox.cleanup();
  }
});
