import process from "node:process";

export const channels = {
  prod: {
    name: "prod",
    appcastUrl: "https://persistent.oaistatic.com/codex-app-prod/appcast.xml"
  },
  beta: {
    name: "beta",
    appcastUrl: "https://persistent.oaistatic.com/codex-app-beta/appcast.xml"
  }
};

export function getChannel(name) {
  const channel = channels[name];
  if (!channel) {
    throw new Error(`Unknown channel: ${name}`);
  }
  return channel;
}

export function parseAppcastXml(xml) {
  const itemMatch = xml.match(/<item>([\s\S]*?)<\/item>/i);
  if (!itemMatch) {
    throw new Error("No <item> found in appcast");
  }

  const item = itemMatch[1];
  const enclosureMatch = item.match(/<enclosure\s+([^>]+?)\/?>(?:<\/enclosure>)?/i);
  if (!enclosureMatch) {
    throw new Error("No <enclosure> found in appcast item");
  }

  const archiveUrl = getAttribute(enclosureMatch[1], "url");

  return {
    title: getTagValue(item, "title"),
    pubDate: getTagValue(item, "pubDate"),
    version: getTagValue(item, "sparkle:shortVersionString"),
    buildNumber: getTagValue(item, "sparkle:version"),
    archiveUrl,
    archiveLength: getAttribute(enclosureMatch[1], "length"),
    archiveFileName: decodeURIComponent(new URL(archiveUrl).pathname.split("/").at(-1) || ""),
    archiveExtension: archiveUrl.toLowerCase().endsWith(".dmg") ? "dmg" : archiveUrl.toLowerCase().endsWith(".zip") ? "zip" : "unknown"
  };
}

export async function fetchAppcastMetadata(appcastUrl, fetchImpl = fetch) {
  const response = await fetchImpl(appcastUrl);
  if (!response.ok) {
    throw new Error(`Failed to fetch appcast ${appcastUrl}: ${response.status} ${response.statusText}`);
  }

  const xml = await response.text();
  return {
    ...parseAppcastXml(xml),
    appcastUrl
  };
}

function getTagValue(xml, tagName) {
  const matcher = new RegExp(`<${escapeRegex(tagName)}>([\\s\\S]*?)<\/${escapeRegex(tagName)}>`, "i");
  const match = xml.match(matcher);
  if (!match) {
    throw new Error(`Missing <${tagName}> in appcast item`);
  }
  return decodeXml(match[1].trim());
}

function getAttribute(fragment, attributeName) {
  const matcher = new RegExp(`${escapeRegex(attributeName)}="([^"]+)"`, "i");
  const match = fragment.match(matcher);
  if (!match) {
    throw new Error(`Missing ${attributeName} attribute`);
  }
  return decodeXml(match[1]);
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function decodeXml(value) {
  return value
    .replaceAll("&quot;", '"')
    .replaceAll("&apos;", "'")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&amp;", "&");
}

function parseArgs(argv) {
  const args = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg.startsWith("--")) {
      continue;
    }

    const [key, inlineValue] = arg.slice(2).split("=", 2);
    if (inlineValue !== undefined) {
      args[key] = inlineValue;
      continue;
    }

    const next = argv[index + 1];
    if (!next || next.startsWith("--")) {
      args[key] = true;
      continue;
    }

    args[key] = next;
    index += 1;
  }
  return args;
}

function printUsage() {
  console.log(`Usage:
  node scripts/appcast-metadata.mjs --channel beta|prod [--format json|shell]
  node scripts/appcast-metadata.mjs --appcast-url URL [--format json|shell]`);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (args.help) {
    printUsage();
    return;
  }

  const format = String(args.format || "json");
  const appcastUrl = args["appcast-url"]
    ? String(args["appcast-url"])
    : getChannel(String(args.channel || "beta")).appcastUrl;

  const metadata = await fetchAppcastMetadata(appcastUrl);

  if (format === "json") {
    console.log(JSON.stringify(metadata, null, 2));
    return;
  }

  if (format === "shell") {
    for (const [key, value] of Object.entries(metadata)) {
      console.log(`${key}=${String(value)}`);
    }
    return;
  }

  throw new Error(`Unsupported format: ${format}`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(error => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
