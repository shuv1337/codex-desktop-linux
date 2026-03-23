import path from "node:path";
import process from "node:process";

export const projectRoot = process.cwd();
export const stageRoot = path.join(projectRoot, "stage");
export const distRoot = path.join(projectRoot, "dist");

export const defaultPackageName = process.env.CODEX_RELEASE_PACKAGE_NAME || "codex-desktop-linux";
export const defaultPackageRevision = Number(process.env.CODEX_PACKAGE_REVISION || "1");

export const channels = {
  beta: {
    name: "beta",
    appcastUrl: "https://persistent.oaistatic.com/codex-app-beta/appcast.xml",
    installerChannel: "beta",
    prerelease: true
  },
  prod: {
    name: "prod",
    appcastUrl: "https://persistent.oaistatic.com/codex-app-prod/appcast.xml",
    installerChannel: "prod",
    prerelease: false
  }
};

export function getChannel(name) {
  const channel = channels[name];
  if (!channel) {
    throw new Error(`Unknown release channel: ${name}`);
  }
  return channel;
}

export function releaseVersionFor(channelName, upstream, packageRevision = defaultPackageRevision) {
  if (!Number.isInteger(packageRevision) || packageRevision < 0) {
    throw new Error(`Invalid CODEX_PACKAGE_REVISION: ${packageRevision}`);
  }

  const baseVersion =
    channelName === "prod"
      ? upstream.version
      : `${upstream.version}-beta.${upstream.buildNumber}`;

  if (packageRevision === 0) {
    return baseVersion;
  }

  return `${baseVersion}.linux.${packageRevision}`;
}

export function releaseTagFor(version) {
  return `v${version}`;
}

export function assetBaseName(packageName, version) {
  return `${packageName}-${version}-x64`;
}

export function channelPaths(channelName, version) {
  return {
    channelRoot: path.join(stageRoot, channelName),
    versionRoot: path.join(stageRoot, channelName, version),
    stageAppDir: path.join(stageRoot, channelName, version, "codex-app"),
    outputDir: path.join(distRoot, channelName, version)
  };
}
