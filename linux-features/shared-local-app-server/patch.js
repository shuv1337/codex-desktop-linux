"use strict";

const fs = require("node:fs");
const path = require("node:path");

// Upstream's local-daemon websocket gate refuses to attach when
// CODEX_CLI_PATH is set (a pinned CLI implies "use exactly that binary as
// the spawned server" upstream). This repo's launcher always exports
// CODEX_CLI_PATH for CLI resolution (chrome native host, preflight, spawn
// fallback), which would keep the gate permanently closed. Remove only that
// one term; CODEX_APP_SERVER_FORCE_CLI stays as the escape hatch and the
// hostConfig.codex_cli_command==null guard still protects explicit per-host
// CLI overrides.
const MARKER = "codexLinuxSharedLocalAppServerCliPathGate";
const GATE_NEEDLE =
  "process.env.CODEX_APP_SERVER_USE_LOCAL_DAEMON===`1`&&process.env.CODEX_APP_SERVER_FORCE_CLI!==`1`&&!process.env.CODEX_CLI_PATH?.trim()&&";
const GATE_REPLACEMENT =
  "process.env.CODEX_APP_SERVER_USE_LOCAL_DAEMON===`1`&&process.env.CODEX_APP_SERVER_FORCE_CLI!==`1`&&/*codexLinuxSharedLocalAppServerCliPathGate*/";

function applySharedLocalAppServerCliPathGatePatch(source) {
  if (source.includes(MARKER)) {
    return source;
  }
  if (!source.includes(GATE_NEEDLE)) {
    return source;
  }
  return source.split(GATE_NEEDLE).join(GATE_REPLACEMENT);
}

function applySharedLocalAppServerMainBundlePatch(source) {
  const patched = applySharedLocalAppServerCliPathGatePatch(source);
  if (patched === source && !source.includes(MARKER)) {
    console.warn(
      "WARN: Could not find local-daemon CLI-path gate needle - skipping shared local app-server gate patch",
    );
  }
  return patched;
}

function applySharedLocalAppServerExtractedAppPatch(extractedDir) {
  const buildDir = path.join(extractedDir, ".vite", "build");
  if (!fs.existsSync(buildDir)) {
    const reason = `missing build directory ${buildDir}`;
    console.warn(
      "WARN: Could not find app bundle directory - skipping shared local app-server gate patch",
    );
    return { matched: 0, changed: 0, reason };
  }

  const candidates = fs
    .readdirSync(buildDir)
    .filter((name) => /\.m?js$/u.test(name))
    .sort();

  let matched = 0;
  let changed = 0;
  for (const candidate of candidates) {
    const filePath = path.join(buildDir, candidate);
    const source = fs.readFileSync(filePath, "utf8");
    if (!source.includes(GATE_NEEDLE) && !source.includes(MARKER)) {
      continue;
    }
    matched += 1;
    const patched = applySharedLocalAppServerCliPathGatePatch(source);
    if (patched !== source) {
      fs.writeFileSync(filePath, patched, "utf8");
      changed += 1;
    }
  }

  if (matched === 0) {
    const reason = "no local-daemon CLI-path gate needle found";
    console.warn(
      "WARN: Could not find local-daemon CLI-path gate needle - skipping shared local app-server gate patch",
    );
    return { matched, changed, reason };
  }
  return { matched, changed };
}

module.exports = {
  GATE_NEEDLE,
  GATE_REPLACEMENT,
  MARKER,
  applySharedLocalAppServerCliPathGatePatch,
  applySharedLocalAppServerMainBundlePatch,
  applySharedLocalAppServerExtractedAppPatch,
  descriptors: [
    {
      id: "shared-local-app-server-cli-path-gate",
      phase: "main-bundle",
      order: 20_200,
      ciPolicy: "optional",
      apply: applySharedLocalAppServerMainBundlePatch,
    },
    {
      id: "shared-local-app-server-cli-path-gate-extracted-app",
      phase: "extracted-app:post-webview",
      order: 20_201,
      ciPolicy: "optional",
      apply: applySharedLocalAppServerExtractedAppPatch,
    },
  ],
};
