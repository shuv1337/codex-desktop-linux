import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

export const websocketTransportHelper = "function __codexDesktopWsTransportOptions(";
// Regex that matches the current shape across recent beta builds (26.320+, 26.415+):
//   async connect(){let e=await <F1>(this.options.hostConfig),t=new <WS>(this.options.websocketUrl,{headers:e,agent:new <AGENT>.SocksProxyAgent(`socks5h://127.0.0.1:1080`),perMessageDeflate:!1})[;]
//   return [<F2>(t,{onPongTimeout:()=>{t.terminate()}}),] new <TRANSPORT>(t)}};function <NEXT>(e){
// The optional onPongTimeout wrapper appeared in 26.415+.
export const websocketTransportRegex = /async connect\(\)\{let e=await (?<f1>\w+)\(this\.options\.hostConfig\),t=new (?<ws>\w+)\(this\.options\.websocketUrl,\{headers:e,agent:new (?<agent>\w+)\.SocksProxyAgent\(`socks5h:\/\/127\.0\.0\.1:1080`\),perMessageDeflate:!1\}\);(?<wrap>return (?<f2>\w+)\(t,\{onPongTimeout:\(\)=>\{t\.terminate\(\)\}\}\),)?(?<newOrReturn>(?:new|return new) (?<transport>\w+)\(t\)\}\};)function (?<next>\w+)\(e\)\{/;
export const websocketTransportOldSnippet = 'async connect(){const e=await Fv(this.options.hostConfig),t=new a.WebSocket(this.options.websocketUrl,{headers:e,agent:new a.distExports.SocksProxyAgent("socks5h://127.0.0.1:1080"),perMessageDeflate:!1});return new Yu(t)}}function Cv(r){';
export const websocketTransportNewSnippet = 'async connect(){const e=await Fv(this.options.hostConfig),t=new a.WebSocket(this.options.websocketUrl,{headers:e,...__codexDesktopWsTransportOptions(this.options.websocketUrl),perMessageDeflate:!1});return new Yu(t)}}function __codexDesktopWsTransportOptions(r){const e=process.env.CODEX_APP_SERVER_WS_SOCKS_PROXY,t=e===void 0?"socks5h://127.0.0.1:1080":e;if(!t)return{};try{const e=new URL(r),i=(e.hostname??"").toLowerCase(),n=i==="0.0.0.0"||i==="localhost"||i==="127.0.0.1"||i==="::1"||i.startsWith("10.")||i.startsWith("192.168.")||/^172\\.(1[6-9]|2\\d|3[0-1])\\./.test(i);return n?{}:{agent:new a.distExports.SocksProxyAgent(t)}}catch{return{agent:new a.distExports.SocksProxyAgent(t)}}}function Cv(r){';
export const websocketTransportDeeplinksOldSnippet = 'async connect(){let e=await Wte(this.options.hostConfig);return new wx(new iS(this.options.websocketUrl,{headers:e,agent:new Vte.SocksProxyAgent(`socks5h://127.0.0.1:1080`),perMessageDeflate:!1}))}};function Ute(e){';
// 26.320+ (product-name bundle): uses backtick template literals and different variable names
export const websocketTransportProductNameOldSnippet = 'async connect(){let e=await WT(this.options.hostConfig);return new Kw(new BT(this.options.websocketUrl,{headers:e,agent:new VT.SocksProxyAgent(`socks5h://127.0.0.1:1080`),perMessageDeflate:!1}))}};function UT(e){';
export const websocketTransportProductNameNewSnippet = 'async connect(){let e=await WT(this.options.hostConfig);return new Kw(new BT(this.options.websocketUrl,{headers:e,...__codexDesktopWsTransportOptions(this.options.websocketUrl,VT.SocksProxyAgent),perMessageDeflate:!1}))}};function __codexDesktopWsTransportOptions(e,t){const n=process.env.CODEX_APP_SERVER_WS_SOCKS_PROXY,r=n===void 0?`socks5h://127.0.0.1:1080`:n;if(!r)return{};try{const n=new URL(e),i=(n.hostname??``).toLowerCase(),a=i===`0.0.0.0`||i===`localhost`||i===`127.0.0.1`||i===`::1`||i.startsWith(`10.`)||i.startsWith(`192.168.`)||/^172\\.(1[6-9]|2\\d|3[0-1])\\./.test(i);return a?{}:{agent:new t(r)}}catch{return{agent:new t(r)}}};function UT(e){';
export const websocketTransportDeeplinksNewSnippet = 'async connect(){let e=await Wte(this.options.hostConfig);return new wx(new iS(this.options.websocketUrl,{headers:e,...__codexDesktopWsTransportOptions(this.options.websocketUrl,Vte.SocksProxyAgent),perMessageDeflate:!1}))}};function __codexDesktopWsTransportOptions(e,t){const n=process.env.CODEX_APP_SERVER_WS_SOCKS_PROXY,r=n===void 0?"socks5h://127.0.0.1:1080":n;if(!r)return{};try{const n=new URL(e),i=(n.hostname??"").toLowerCase(),a=i==="0.0.0.0"||i==="localhost"||i==="127.0.0.1"||i==="::1"||i.startsWith("10.")||i.startsWith("192.168.")||/^172\\.(1[6-9]|2\\d|3[0-1])\\./.test(i);return a?{}:{agent:new t(r)}}catch{return{agent:new t(r)}}};function Ute(e){';

export const proxyAuthPatchMarker = "e.requiresOpenaiAuth===!1?`apikey`:null";
export const proxyAuthOldSnippet = "function S(e,t){let n=_(e.account),r=t.useCopilotAuthIfAvailable&&t.isCopilotApiAvailable?`copilot`:n;return{openAIAuth:n,authMethod:r,requiresAuth:r===`copilot`||(e.requiresOpenaiAuth??!0),email:e.account?.type===`chatgpt`?e.account.email:null,planAtLogin:e.account?.type===`chatgpt`?e.account.planType:null}}";
// 26.320+: different minification variable names (w instead of S, v instead of _)
export const proxyAuthOldSnippetV2 = "function w(e,t){let n=v(e.account),r=t.useCopilotAuthIfAvailable&&t.isCopilotApiAvailable?`copilot`:n;return{openAIAuth:n,authMethod:r,requiresAuth:r===`copilot`||(e.requiresOpenaiAuth??!0),email:e.account?.type===`chatgpt`?e.account.email:null,planAtLogin:e.account?.type===`chatgpt`?e.account.planType:null}}";
export const proxyAuthNewSnippet = "function S(e,t){let n=_(e.account),r=t.useCopilotAuthIfAvailable&&t.isCopilotApiAvailable?`copilot`:n!=null?n:e.requiresOpenaiAuth===!1?`apikey`:null;return{openAIAuth:n,authMethod:r,requiresAuth:r===`copilot`||(e.requiresOpenaiAuth??!0),email:e.account?.type===`chatgpt`?e.account.email:null,planAtLogin:e.account?.type===`chatgpt`?e.account.planType:null}}";
export const proxyAuthNewSnippetV2 = "function w(e,t){let n=v(e.account),r=t.useCopilotAuthIfAvailable&&t.isCopilotApiAvailable?`copilot`:n!=null?n:e.requiresOpenaiAuth===!1?`apikey`:null;return{openAIAuth:n,authMethod:r,requiresAuth:r===`copilot`||(e.requiresOpenaiAuth??!0),email:e.account?.type===`chatgpt`?e.account.email:null,planAtLogin:e.account?.type===`chatgpt`?e.account.planType:null}}";
// 26.415+: shape with arbitrary minified identifiers. Match structurally and
// synthesize the patched function from captured identifiers. The older
// SnippetV1/V2 paths above are kept for backwards compatibility with older
// bundles that already produce the exact string.
export const proxyAuthRegex = /function (?<fn>\w+)\(e,t\)\{let n=(?<resolve>\w+)\(e\.account\),r=t\.useCopilotAuthIfAvailable&&t\.isCopilotApiAvailable\?`copilot`:n;return\{openAIAuth:n,authMethod:r,requiresAuth:r===`copilot`\|\|\(e\.requiresOpenaiAuth\?\?!0\),email:e\.account\?\.type===`chatgpt`\?e\.account\.email:null,planAtLogin:e\.account\?\.type===`chatgpt`\?e\.account\.planType:null\}\}/;

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

  // 26.320+: product-name bundle variant
  if (source.includes(websocketTransportProductNameOldSnippet)) {
    return {
      changed: true,
      code: source.replace(websocketTransportProductNameOldSnippet, websocketTransportProductNameNewSnippet)
    };
  }

  // 26.415+: arbitrary minified identifier variant, matched by regex.
  const regexMatch = websocketTransportRegex.exec(source);
  if (regexMatch && regexMatch.groups) {
    const { agent, next, wrap } = regexMatch.groups;
    const wrapPrefix = wrap == null ? "" : wrap;
    const replacement =
      `async connect(){let e=await ${regexMatch.groups.f1}(this.options.hostConfig),` +
      `t=new ${regexMatch.groups.ws}(this.options.websocketUrl,{headers:e,` +
      `...__codexDesktopWsTransportOptions(this.options.websocketUrl,${agent}.SocksProxyAgent),` +
      `perMessageDeflate:!1});` +
      `${wrapPrefix}` +
      `${regexMatch.groups.newOrReturn}` +
      `function __codexDesktopWsTransportOptions(e,t){` +
      `const n=process.env.CODEX_APP_SERVER_WS_SOCKS_PROXY,` +
      "r=n===void 0?`socks5h://127.0.0.1:1080`:n;" +
      "if(!r)return{};" +
      "try{" +
      "const n=new URL(e)," +
      "i=(n.hostname??``).toLowerCase()," +
      "a=i===`0.0.0.0`||i===`localhost`||i===`127.0.0.1`||i===`::1`||" +
      "i.startsWith(`10.`)||i.startsWith(`192.168.`)||" +
      "/^172\\.(1[6-9]|2\\d|3[0-1])\\./.test(i);" +
      "return a?{}:{agent:new t(r)}" +
      "}catch{return{agent:new t(r)}}" +
      `};function ${next}(e){`;
    return {
      changed: true,
      code: source.replace(websocketTransportRegex, replacement)
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

  // Try original (26.311) pattern
  if (source.includes(proxyAuthOldSnippet)) {
    return {
      changed: true,
      code: source.replace(proxyAuthOldSnippet, proxyAuthNewSnippet)
    };
  }

  // Try 26.320+ pattern (different minification variable names)
  if (source.includes(proxyAuthOldSnippetV2)) {
    return {
      changed: true,
      code: source.replace(proxyAuthOldSnippetV2, proxyAuthNewSnippetV2)
    };
  }

  // 26.415+: arbitrary minified names. Match structurally and synthesize
  // the patched function body using the captured identifiers.
  const match = proxyAuthRegex.exec(source);
  if (match && match.groups) {
    const { fn, resolve } = match.groups;
    const replacement =
      `function ${fn}(e,t){let n=${resolve}(e.account),` +
      "r=t.useCopilotAuthIfAvailable&&t.isCopilotApiAvailable?`copilot`:n!=null?n:e.requiresOpenaiAuth===!1?`apikey`:null;" +
      "return{openAIAuth:n,authMethod:r,requiresAuth:r===`copilot`||(e.requiresOpenaiAuth??!0)," +
      "email:e.account?.type===`chatgpt`?e.account.email:null," +
      "planAtLogin:e.account?.type===`chatgpt`?e.account.planType:null}}";
    return {
      changed: true,
      code: source.replace(proxyAuthRegex, replacement)
    };
  }

  throw new Error("proxy auth UI patch anchor not found");
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
    const hasKnownAnchor =
      source.includes(websocketTransportHelper) ||
      source.includes(websocketTransportOldSnippet) ||
      source.includes(websocketTransportDeeplinksOldSnippet) ||
      source.includes(websocketTransportProductNameOldSnippet) ||
      websocketTransportRegex.test(source);

    if (!hasKnownAnchor) {
      // File may contain generic SocksProxyAgent references (e.g. remote control)
      // but not the app-server transport snippet we need to patch — skip it.
      continue;
    }

    sawTransportMarkers = true;
    const result = patcher(source);
    if (result.changed) {
      await fs.writeFile(filePath, result.code);
    }
    return { path: filePath, changed: result.changed };
  }

  // Fallback: check if any file has generic SOCKS markers we couldn't match
  for (const filePath of filePaths) {
    const source = await fs.readFile(filePath, "utf8");
    if (
      source.includes("127.0.0.1:1080") ||
      source.includes("socks5h://127.0.0.1:1080")
    ) {
      sawTransportMarkers = true;
      break;
    }
  }

  if (!sawTransportMarkers) {
    return { path: filePaths[0], changed: false };
  }

  throw new Error("websocket transport patch anchor not found — SOCKS references exist but no known snippet matched");
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
