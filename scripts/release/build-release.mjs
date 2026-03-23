import fs from "node:fs/promises";
import path from "node:path";

import { fetchAppcastMetadata } from "../appcast-metadata.mjs";
import {
  assetBaseName,
  channelPaths,
  defaultPackageName,
  getChannel,
  releaseTagFor,
  releaseVersionFor
} from "./config.mjs";
import { artifactPathsFor, packDirectory, sha256File, writeChecksums } from "./artifacts.mjs";
import { installPackagedWrapper } from "./packaged-wrapper.mjs";
import { stageInstall } from "./stage-install.mjs";

const args = parseArgs(process.argv.slice(2));
const channel = getChannel(String(args.channel || "beta"));
const packageName = String(args["package-name"] || defaultPackageName);
const dryRun = Boolean(args["dry-run"]);
const jsonOutputPath = args["json-output"] ? path.resolve(String(args["json-output"])) : null;

const upstream = await fetchAppcastMetadata(channel.appcastUrl);
const version = releaseVersionFor(channel.name, upstream);
const releaseTag = releaseTagFor(version);
const assetPrefix = assetBaseName(packageName, version);
const paths = channelPaths(channel.name, version);

const artifacts = artifactPathsFor(paths.outputDir, assetPrefix);

const summary = {
  channel: channel.name,
  packageName,
  upstreamVersion: upstream.version,
  upstreamBuildNumber: upstream.buildNumber,
  archiveUrl: upstream.archiveUrl,
  archiveFileName: upstream.archiveFileName,
  version,
  releaseTag,
  assetPrefix,
  prerelease: channel.prerelease,
  installDir: paths.stageAppDir,
  outputDir: paths.outputDir,
  tarballPath: artifacts.tarballPath,
  checksumsPath: artifacts.checksumsPath,
  metadataPath: artifacts.metadataPath,
  dryRun
};

if (!dryRun) {
  await stageInstall({
    channel,
    installDir: paths.stageAppDir,
    archiveUrl: upstream.archiveUrl
  });

  const wrapperInfo = await installPackagedWrapper({
    appDir: paths.stageAppDir,
    executableName: packageName,
    targetScript: "start.sh"
  });

  summary.packagedWrapper = wrapperInfo;

  await fs.mkdir(paths.outputDir, { recursive: true });
  await packDirectory(paths.stageAppDir, artifacts.tarballPath);
  const tarballSha256 = await sha256File(artifacts.tarballPath);

  summary.tarballSha256 = tarballSha256;

  await writeChecksums(artifacts.checksumsPath, [
    {
      name: path.basename(artifacts.tarballPath),
      sha256: tarballSha256
    }
  ]);

  await fs.writeFile(
    artifacts.metadataPath,
    `${JSON.stringify(summary, null, 2)}\n`
  );
}

if (jsonOutputPath) {
  await fs.mkdir(path.dirname(jsonOutputPath), { recursive: true });
  await fs.writeFile(jsonOutputPath, `${JSON.stringify(summary, null, 2)}\n`);
}

console.log(JSON.stringify(summary, null, 2));

function parseArgs(argv) {
  const parsed = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg.startsWith("--")) {
      continue;
    }

    const [key, inlineValue] = arg.slice(2).split("=", 2);
    if (inlineValue !== undefined) {
      parsed[key] = inlineValue;
      continue;
    }

    const next = argv[index + 1];
    if (!next || next.startsWith("--")) {
      parsed[key] = true;
      continue;
    }

    parsed[key] = next;
    index += 1;
  }
  return parsed;
}
