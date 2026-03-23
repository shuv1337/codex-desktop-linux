import crypto from "node:crypto";
import fs from "node:fs/promises";
import { spawn } from "node:child_process";
import path from "node:path";

export function artifactPathsFor(outputDir, assetPrefix) {
  return {
    tarballPath: path.join(outputDir, `${assetPrefix}.tar.gz`),
    checksumsPath: path.join(outputDir, `${assetPrefix}.sha256`),
    metadataPath: path.join(outputDir, "build-metadata.json")
  };
}

export async function packDirectory(sourceDir, archivePath) {
  await fs.mkdir(path.dirname(archivePath), { recursive: true });
  await run(["tar", "-C", path.dirname(sourceDir), "-czf", archivePath, path.basename(sourceDir)]);
}

export async function sha256File(filePath) {
  const hash = crypto.createHash("sha256");
  const content = await fs.readFile(filePath);
  hash.update(content);
  return hash.digest("hex");
}

export async function writeChecksums(checksumsPath, entries) {
  const lines = entries.map(entry => `${entry.sha256}  ${entry.name}`);
  await fs.writeFile(checksumsPath, `${lines.join("\n")}\n`);
}

async function run(command, options = {}) {
  const { cwd = process.cwd(), env = process.env } = options;
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
