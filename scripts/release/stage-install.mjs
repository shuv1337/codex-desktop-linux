import fs from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";

export async function stageInstall({ channel, installDir, archiveUrl }) {
  await fs.rm(installDir, { recursive: true, force: true });
  await fs.mkdir(path.dirname(installDir), { recursive: true });

  const env = {
    ...process.env,
    CODEX_CHANNEL: channel.installerChannel,
    CODEX_INSTALL_DIR: installDir
  };

  if (archiveUrl) {
    env.CODEX_APP_URL = archiveUrl;
  }

  await run(["bash", "./install.sh"], { env });
}

async function run(command, options = {}) {
  const { env = process.env, cwd = process.cwd() } = options;

  await new Promise((resolve, reject) => {
    const child = spawn(command[0], command.slice(1), {
      cwd,
      env,
      stdio: "inherit"
    });

    child.on("error", reject);
    child.on("exit", code => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`Command failed (${command.join(" ")}): ${code}`));
    });
  });
}
