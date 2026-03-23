import fs from "node:fs/promises";
import path from "node:path";

export function wrapperScript(binaryName) {
  return `#!/bin/sh
set -eu

script_path="$0"

if command -v readlink >/dev/null 2>&1; then
  resolved_script="$(readlink -f -- "$script_path" 2>/dev/null || true)"
  if [ -n "$resolved_script" ]; then
    script_path="$resolved_script"
  fi
fi

script_dir="$(CDPATH= cd -- "$(dirname -- "$script_path")" && pwd)"
exec "$script_dir/${binaryName}" "$@"
`;
}

export function binScript(targetScript = "start.sh") {
  return `#!/bin/sh
set -eu

SCRIPT_PATH="$0"
if command -v readlink >/dev/null 2>&1; then
  RESOLVED_SCRIPT="$(readlink -f -- "$SCRIPT_PATH" 2>/dev/null || true)"
  if [ -n "$RESOLVED_SCRIPT" ]; then
    SCRIPT_PATH="$RESOLVED_SCRIPT"
  fi
fi
SCRIPT_DIR="$(CDPATH= cd -- "$(dirname -- "$SCRIPT_PATH")" && pwd)"
exec "$SCRIPT_DIR/${targetScript}" "$@"
`;
}

export async function installPackagedWrapper({ appDir, executableName, targetScript = "start.sh" }) {
  const launcherPath = path.join(appDir, executableName);
  const binaryPath = path.join(appDir, `${executableName}-bin`);

  await fs.writeFile(binaryPath, binScript(targetScript), { mode: 0o755 });
  await fs.writeFile(launcherPath, wrapperScript(path.basename(binaryPath)), { mode: 0o755 });

  return {
    launcherPath,
    binaryPath,
    targetScript: path.join(appDir, targetScript)
  };
}
