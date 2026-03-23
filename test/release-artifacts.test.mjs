import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { artifactPathsFor, sha256File, writeChecksums } from "../scripts/release/artifacts.mjs";

test("artifactPathsFor returns stable artifact paths", () => {
  const paths = artifactPathsFor("/tmp/out", "codex-desktop-linux-1.0.0-x64");
  assert.equal(paths.tarballPath, "/tmp/out/codex-desktop-linux-1.0.0-x64.tar.gz");
  assert.equal(paths.checksumsPath, "/tmp/out/codex-desktop-linux-1.0.0-x64.sha256");
  assert.equal(paths.metadataPath, "/tmp/out/build-metadata.json");
});

test("sha256File hashes file content and writeChecksums writes checksum file", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "codex-release-artifacts-"));
  const target = path.join(dir, "artifact.tar.gz");
  const checksumFile = path.join(dir, "artifact.sha256");

  await fs.writeFile(target, "hello world\n");
  const sha = await sha256File(target);
  await writeChecksums(checksumFile, [{ name: "artifact.tar.gz", sha256: sha }]);

  const content = await fs.readFile(checksumFile, "utf8");
  assert.match(content, new RegExp(`^${sha}  artifact\\.tar\\.gz`, "m"));
});
