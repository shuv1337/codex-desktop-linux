"use strict";

const fs = require("node:fs");
const path = require("node:path");

const {
  applyLinuxAppServerWebSocketProxyPatch,
} = require("../../../../main-process.js");

function patchAppServerWebSocketProxyBundles(extractedDir) {
  const buildDir = path.join(extractedDir, ".vite", "build");
  if (!fs.existsSync(buildDir)) {
    return { matched: 0, changed: 0, reason: "missing .vite/build directory" };
  }

  const candidates = fs
    .readdirSync(buildDir)
    .filter((name) => name.endsWith(".js"))
    .sort();
  let matched = 0;
  let changed = 0;

  for (const candidate of candidates) {
    const filePath = path.join(buildDir, candidate);
    const currentSource = fs.readFileSync(filePath, "utf8");
    if (
      !currentSource.includes("CODEX_APP_SERVER_WS_SOCKS_PROXY") &&
      !(
        currentSource.includes("SocksProxyAgent") &&
        currentSource.includes("socks5h://127.0.0.1:1080")
      )
    ) {
      continue;
    }

    matched += 1;
    const patchedSource = applyLinuxAppServerWebSocketProxyPatch(currentSource);
    if (patchedSource !== currentSource) {
      fs.writeFileSync(filePath, patchedSource, "utf8");
      changed += 1;
    }
  }

  return { matched, changed };
}

module.exports = [
  {
    id: "linux-app-server-websocket-proxy",
    phase: "extracted-app",
    order: 1990,
    ciPolicy: "optional",
    apply: (extractedDir) => patchAppServerWebSocketProxyBundles(extractedDir),
    status: (result, warnings) => {
      if (result?.matched === 0) {
        return {
          status: "skipped-optional",
          reason: result?.reason ?? warnings[0] ?? "no app-server websocket proxy bundle found",
        };
      }
      return {
        status: result?.changed ? "applied" : "already-applied",
        reason: warnings[0] ?? null,
      };
    },
  },
];
