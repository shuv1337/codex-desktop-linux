import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";

import { installPackagedWrapper, wrapperScript } from "../scripts/release/packaged-wrapper.mjs";

test("wrapperScript resolves symlinked entrypoint to sibling binary", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "codex-packaged-wrapper-"));
  const appDir = path.join(root, "opt", "codex-desktop-linux");
  const binDir = path.join(root, "usr", "bin");
  const launcherPath = path.join(appDir, "codex-desktop-linux");
  const binaryPath = path.join(appDir, "codex-desktop-linux-bin");
  const symlinkPath = path.join(binDir, "codex-desktop-linux");
  const markerPath = path.join(root, "ran-from-bin");

  await fs.mkdir(appDir, { recursive: true });
  await fs.mkdir(binDir, { recursive: true });
  await fs.writeFile(launcherPath, wrapperScript("codex-desktop-linux-bin"), { mode: 0o755 });
  await fs.writeFile(binaryPath, `#!/bin/sh\nset -eu\nprintf '%s\\n' "$0" > ${JSON.stringify(markerPath)}\n`, { mode: 0o755 });
  await fs.symlink(launcherPath, symlinkPath);

  await new Promise((resolve, reject) => {
    const child = spawn(symlinkPath, [], { stdio: "ignore" });
    child.on("error", reject);
    child.on("exit", code => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`wrapper exited with ${code}`));
    });
  });

  const marker = await fs.readFile(markerPath, "utf8");
  assert.equal(marker.trim(), binaryPath);
});

test("installPackagedWrapper creates launcher and binary scripts", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "codex-packaged-wrapper-install-"));
  const appDir = path.join(root, "codex-app");
  const startPath = path.join(appDir, "start.sh");

  await fs.mkdir(appDir, { recursive: true });
  await fs.writeFile(startPath, "#!/bin/sh\nexit 0\n", { mode: 0o755 });

  const result = await installPackagedWrapper({
    appDir,
    executableName: "codex-desktop-linux",
    targetScript: "start.sh"
  });

  const launcher = await fs.readFile(result.launcherPath, "utf8");
  const binary = await fs.readFile(result.binaryPath, "utf8");

  assert.match(launcher, /codex-desktop-linux-bin/);
  assert.match(binary, /start\.sh/);
});
