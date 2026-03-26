import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

export const websocketTransportHelper = "function __codexDesktopWsTransportOptions(";
export const websocketTransportOldSnippet = 'async connect(){const e=await Fv(this.options.hostConfig),t=new a.WebSocket(this.options.websocketUrl,{headers:e,agent:new a.distExports.SocksProxyAgent("socks5h://127.0.0.1:1080"),perMessageDeflate:!1});return new Yu(t)}}function Cv(r){';
export const websocketTransportNewSnippet = 'async connect(){const e=await Fv(this.options.hostConfig),t=new a.WebSocket(this.options.websocketUrl,{headers:e,...__codexDesktopWsTransportOptions(this.options.websocketUrl),perMessageDeflate:!1});return new Yu(t)}}function __codexDesktopWsTransportOptions(r){const e=process.env.CODEX_APP_SERVER_WS_SOCKS_PROXY,t=e===void 0?"socks5h://127.0.0.1:1080":e;if(!t)return{};try{const e=new URL(r),i=(e.hostname??"").toLowerCase(),n=i==="0.0.0.0"||i==="localhost"||i==="127.0.0.1"||i==="::1"||i.startsWith("10.")||i.startsWith("192.168.")||/^172\\.(1[6-9]|2\\d|3[0-1])\\./.test(i);return n?{}:{agent:new a.distExports.SocksProxyAgent(t)}}catch{return{agent:new a.distExports.SocksProxyAgent(t)}}}function Cv(r){';
export const websocketTransportDeeplinksOldSnippet = 'async connect(){let e=await Wte(this.options.hostConfig);return new wx(new iS(this.options.websocketUrl,{headers:e,agent:new Vte.SocksProxyAgent(`socks5h://127.0.0.1:1080`),perMessageDeflate:!1}))}};function Ute(e){';
export const websocketTransportDeeplinksNewSnippet = 'async connect(){let e=await Wte(this.options.hostConfig);return new wx(new iS(this.options.websocketUrl,{headers:e,...__codexDesktopWsTransportOptions(this.options.websocketUrl,Vte.SocksProxyAgent),perMessageDeflate:!1}))}};function __codexDesktopWsTransportOptions(e,t){const n=process.env.CODEX_APP_SERVER_WS_SOCKS_PROXY,r=n===void 0?"socks5h://127.0.0.1:1080":n;if(!r)return{};try{const n=new URL(e),i=(n.hostname??"").toLowerCase(),a=i==="0.0.0.0"||i==="localhost"||i==="127.0.0.1"||i==="::1"||i.startsWith("10.")||i.startsWith("192.168.")||/^172\\.(1[6-9]|2\\d|3[0-1])\\./.test(i);return a?{}:{agent:new t(r)}}catch{return{agent:new t(r)}}};function Ute(e){';

export const proxyAuthPatchMarker = "e.requiresOpenaiAuth===!1?`apikey`:null";
export const proxyAuthOldSnippet = "function S(e,t){let n=_(e.account),r=t.useCopilotAuthIfAvailable&&t.isCopilotApiAvailable?`copilot`:n;return{openAIAuth:n,authMethod:r,requiresAuth:r===`copilot`||(e.requiresOpenaiAuth??!0),email:e.account?.type===`chatgpt`?e.account.email:null,planAtLogin:e.account?.type===`chatgpt`?e.account.planType:null}}";
export const proxyAuthNewSnippet = "function S(e,t){let n=_(e.account),r=t.useCopilotAuthIfAvailable&&t.isCopilotApiAvailable?`copilot`:n!=null?n:e.requiresOpenaiAuth===!1?`apikey`:null;return{openAIAuth:n,authMethod:r,requiresAuth:r===`copilot`||(e.requiresOpenaiAuth??!0),email:e.account?.type===`chatgpt`?e.account.email:null,planAtLogin:e.account?.type===`chatgpt`?e.account.planType:null}}";

export function patchLocalWebsocketTransportSource(source) {
  if (source.includes(websocketTransportHelper)) {
    return { changed: false, code: source };
  }

  if (source.includes(websocketTransportOldSnippet)) {
    return {
      changed: true,
      code: source.replace(websocketTransportOldSnippet, websocketTransportNewSnippet)
    };
  }

  if (source.includes(websocketTransportDeeplinksOldSnippet)) {
    return {
      changed: true,
      code: source.replace(websocketTransportDeeplinksOldSnippet, websocketTransportDeeplinksNewSnippet)
    };
  }

  if (
    !source.includes("127.0.0.1:1080") &&
    !source.includes("socks5h://127.0.0.1:1080") &&
    !source.includes("SocksProxyAgent")
  ) {
    return { changed: false, code: source };
  }

  throw new Error("websocket transport patch anchor not found");
}

export function patchProxyAuthUiModeSource(source) {
  if (source.includes(proxyAuthPatchMarker)) {
    return { changed: false, code: source };
  }

  if (!source.includes(proxyAuthOldSnippet)) {
    throw new Error("proxy auth UI patch anchor not found");
  }

  return {
    changed: true,
    code: source.replace(proxyAuthOldSnippet, proxyAuthNewSnippet)
  };
}

export async function patchExtractedAppBundles(extractedRoot) {
  const buildBundlePaths = await findBuildBundles(extractedRoot);
  const authBundlePaths = await findAuthBundles(extractedRoot);

  if (buildBundlePaths.length === 0) {
    throw new Error("Could not locate build bundles for websocket transport patch");
  }

  if (authBundlePaths.length === 0) {
    throw new Error("Could not locate auth bundle for proxy auth UI patch");
  }

  const websocket = await patchFirstMatchingFile(buildBundlePaths, patchLocalWebsocketTransportSource);
  const auth = [];

  for (const authBundlePath of authBundlePaths) {
    auth.push(await patchFile(authBundlePath, patchProxyAuthUiModeSource));
  }

  return { websocket, auth };
}

async function patchFile(filePath, patcher) {
  const source = await fs.readFile(filePath, "utf8");
  const result = patcher(source);
  if (result.changed) {
    await fs.writeFile(filePath, result.code);
  }
  return { path: filePath, changed: result.changed };
}

async function patchFirstMatchingFile(filePaths, patcher) {
  let sawTransportMarkers = false;

  for (const filePath of filePaths) {
    const source = await fs.readFile(filePath, "utf8");
    const hasTransportMarkers =
      source.includes(websocketTransportHelper) ||
      source.includes(websocketTransportOldSnippet) ||
      source.includes(websocketTransportDeeplinksOldSnippet) ||
      source.includes("127.0.0.1:1080") ||
      source.includes("socks5h://127.0.0.1:1080") ||
      source.includes("SocksProxyAgent");

    if (!hasTransportMarkers) {
      continue;
    }

    sawTransportMarkers = true;
    const result = patcher(source);
    if (result.changed) {
      await fs.writeFile(filePath, result.code);
    }
    return { path: filePath, changed: result.changed };
  }

  if (!sawTransportMarkers) {
    return { path: filePaths[0], changed: false };
  }

  throw new Error("websocket transport patch anchor not found");
}

async function findBuildBundles(extractedRoot) {
  const buildDir = path.join(extractedRoot, ".vite", "build");
  const entries = await readDirSafe(buildDir);
  return entries
    .filter(entry => entry.isFile() && entry.name.endsWith(".js"))
    .map(entry => path.join(buildDir, entry.name))
    .sort((left, right) => {
      const leftMain = path.basename(left).startsWith("main-") ? 0 : 1;
      const rightMain = path.basename(right).startsWith("main-") ? 0 : 1;
      return leftMain - rightMain || left.localeCompare(right);
    });
}

async function findAuthBundles(extractedRoot) {
  const assetsDir = path.join(extractedRoot, "webview", "assets");
  const entries = await readDirSafe(assetsDir);
  return entries
    .filter(entry => entry.isFile() && entry.name.startsWith("use-auth-") && entry.name.endsWith(".js"))
    .map(entry => path.join(assetsDir, entry.name))
    .sort();
}

async function readDirSafe(dirPath) {
  try {
    return await fs.readdir(dirPath, { withFileTypes: true });
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
      return [];
    }
    throw error;
  }
}

async function main(argv) {
  const [extractedRoot] = argv;
  if (!extractedRoot) {
    throw new Error("Usage: node scripts/release/bundle-patches.mjs <extracted-root>");
  }

  const result = await patchExtractedAppBundles(path.resolve(extractedRoot));
  logPatchResult("websocket transport", result.websocket);
  for (const authPatch of result.auth) {
    logPatchResult("proxy auth UI", authPatch);
  }
}

function logPatchResult(label, result) {
  console.log(`${label}: ${result.changed ? "patched" : "already patched"} ${result.path}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2)).catch(error => {
    console.error(error.message);
    process.exit(1);
  });
}
