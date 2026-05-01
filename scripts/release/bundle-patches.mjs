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

// -----------------------------------------------------------------------------
// Open-in Linux targets patch (26.415+)
//
// The main bundle declares every "Open in ..." / "Open with" target (editors,
// terminals, file manager) with per-platform branches (darwin / win32 / linux).
// In 26.415 only the generic `systemDefault` target has a `linux` branch, so on
// Linux the submenu is effectively empty -- the context menu falls back to the
// default `shell.openPath` route (which on GNOME sends directories to
// Nautilus). This patch injects a Linux-native target list into the bundle at
// runtime so the IDEs / file manager / terminals show up correctly.
//
// It works by matching the canonical `Jc/Yc/Xc` initializer:
//   var Jc=qc(process.platform),Yc=il(Jc),
//       Xc=new Set(Jc.filter(e=>e.kind===`editor`).map(e=>e.id)),
//       Zc=null,Qc=null;
// and appending a Linux-only block that mutates those arrays / sets in place
// with `which`-detected editors, a generic `xdg-open` file manager, and a few
// common terminals. The identifiers are captured from the regex so this is
// resilient to future minification churn.
export const openInLinuxMarker = "__codexDesktopLinuxOpenInTargets";
const minifiedIdentifier = String.raw`[$A-Za-z_][$\w]*`;
export const openInLinuxRegex = new RegExp(
  String.raw`var (?<jc>${minifiedIdentifier})=(?<qc>${minifiedIdentifier})\(process\.platform\),` +
    String.raw`(?<yc>${minifiedIdentifier})=(?<il>${minifiedIdentifier})\(\k<jc>\),` +
    String.raw`(?<xc>${minifiedIdentifier})=new Set\(\k<jc>\.filter\(e=>e\.kind===\`editor\`\)\.map\(e=>e\.id\)\),` +
    String.raw`(?<zc>${minifiedIdentifier})=null,(?<qc2>${minifiedIdentifier})=null;`
);

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

function buildOpenInLinuxInjection({ jc, yc, xc, il }) {
  // Pure ES5/ES2019; intentionally self-contained -- does NOT depend on any
  // minified helpers from the bundle. Runs at module load, mutates Jc/Xc/Yc so
  // the existing `ll`/`el`/`al`/`nl` helpers pick up the new targets via the
  // Linux branch of each target's `platforms.linux` descriptor.
  //
  // Target shape (from the bundle's `Qo`):
  //   { label, icon, kind, hidden, detect, iconPath, args, env, open }
  // Plus `id` (added by `qc`) and optional `supportsSsh` / `supportsRemote`.
  //
  // `nl(id, path, appPath, location, hostConfig, remoteWorkspaceRoot, remotePath)`
  // invokes `open(...)` if defined, otherwise spawns `detect()` with `args(path, location, hostConfig, ...)`.
  return (
    ";(function __codexDesktopLinuxOpenInTargets(){" +
    "if(process.platform!=='linux')return;" +
    "var cp=require('child_process');" +
    "var fs=require('fs');" +
    "function which(bin){" +
    "try{var r=cp.spawnSync('/usr/bin/env',['which',bin],{encoding:'utf8'});" +
    "var p=(r.stdout||'').trim();if(p&&fs.existsSync(p))return p;}catch(e){}" +
    "return null;}" +
    "function codeArgs(p,loc){return loc?['--goto',p+':'+loc.line+':'+loc.column]:['--goto',p];}" +
    "function plainArgs(p){return [p];}" +
    "function xdgArgs(p){return [p];}" +
    "var editors=[" +
    "{id:'vscode',label:'VS Code',icon:'apps/vscode.png',bin:'code',args:codeArgs}," +
    "{id:'vscodeInsiders',label:'VS Code Insiders',icon:'apps/vscode-insiders.png',bin:'code-insiders',args:codeArgs}," +
    "{id:'cursor',label:'Cursor',icon:'apps/cursor.png',bin:'cursor',args:codeArgs}," +
    "{id:'windsurf',label:'Windsurf',icon:'apps/windsurf.png',bin:'windsurf',args:codeArgs}," +
    "{id:'zed',label:'Zed',icon:'apps/zed.png',bin:'zed',args:plainArgs}," +
    "{id:'sublimeText',label:'Sublime Text',icon:'apps/sublime-text.png',bin:'subl',args:plainArgs}," +
    "{id:'intellij',label:'IntelliJ IDEA',icon:'apps/intellij.png',bin:'idea',args:plainArgs}," +
    "{id:'webstorm',label:'WebStorm',icon:'apps/webstorm.svg',bin:'webstorm',args:plainArgs}," +
    "{id:'pycharm',label:'PyCharm',icon:'apps/pycharm.png',bin:'pycharm',args:plainArgs}," +
    "{id:'goland',label:'GoLand',icon:'apps/goland.png',bin:'goland',args:plainArgs}," +
    "{id:'rider',label:'Rider',icon:'apps/rider.png',bin:'rider',args:plainArgs}," +
    "{id:'rustrover',label:'RustRover',icon:'apps/rustrover.png',bin:'rustrover',args:plainArgs}," +
    "{id:'phpstorm',label:'PhpStorm',icon:'apps/phpstorm.png',bin:'phpstorm',args:plainArgs}," +
    "{id:'androidStudio',label:'Android Studio',icon:'apps/android-studio.png',bin:'studio',args:plainArgs}" +
    "];" +
    "var terminals=[" +
    "{id:'gnomeTerminal',label:'GNOME Terminal',icon:'apps/terminal.png',bin:'gnome-terminal',args:function(p){return ['--working-directory='+p];}}," +
    "{id:'konsole',label:'Konsole',icon:'apps/terminal.png',bin:'konsole',args:function(p){return ['--workdir',p];}}," +
    "{id:'alacritty',label:'Alacritty',icon:'apps/terminal.png',bin:'alacritty',args:function(p){return ['--working-directory',p];}}," +
    "{id:'kitty',label:'Kitty',icon:'apps/terminal.png',bin:'kitty',args:function(p){return ['-d',p];}}," +
    "{id:'wezterm',label:'WezTerm',icon:'apps/terminal.png',bin:'wezterm',args:function(p){return ['start','--cwd',p];}}," +
    "{id:'ghostty',label:'Ghostty',icon:'apps/ghostty.png',bin:'ghostty',args:function(p){return ['--working-directory='+p];}}," +
    "{id:'xterm',label:'xterm',icon:'apps/terminal.png',bin:'xterm',args:function(p){return ['-e','cd '+JSON.stringify(p)+' && $SHELL'];}}" +
    "];" +
    "function makeLinuxTarget(def,kind){" +
    "var cached;" +
    "function detect(){if(cached!==undefined)return cached;cached=which(def.bin);return cached;}" +
    "function wrappedArgs(path,location){" +
    "if(kind==='editor')return def.args(path,location);" +
    "return def.args(path);}" +
    "return {id:def.id,label:def.label,icon:def.icon,kind:kind,detect:detect,args:wrappedArgs,supportsSsh:false};" +
    "}" +
    "var linuxTargets=[];" +
    "for(var i=0;i<editors.length;i++)linuxTargets.push(makeLinuxTarget(editors[i],'editor'));" +
    // File manager via xdg-open -- directories route to the user's default (Nautilus/Dolphin/etc).
    "linuxTargets.push({id:'fileManager',label:'File Manager',icon:'apps/file-explorer.png',kind:'fileManager',detect:function(){return which('xdg-open');},args:xdgArgs,supportsSsh:false});" +
    "for(var j=0;j<terminals.length;j++)linuxTargets.push(makeLinuxTarget(terminals[j],'terminal'));" +
    // Append (don't replace) so the upstream systemDefault / remote-control targets remain.
    "var existingIds=new Set();for(var k=0;k<__JC__.length;k++)existingIds.add(__JC__[k].id);" +
    "for(var m=0;m<linuxTargets.length;m++){var t=linuxTargets[m];if(existingIds.has(t.id))continue;__JC__.push(t);if(t.kind==='editor')__XC__.add(t.id);}" +
    // Reset the memoized summary list (__YC__) so Linux entries surface in listing APIs.
    "while(__YC__.length)__YC__.pop();" +
    "var fresh=__IL__(__JC__);for(var n=0;n<fresh.length;n++)__YC__.push(fresh[n]);" +
    "})();"
  )
    .replaceAll("__JC__", jc)
    .replaceAll("__XC__", xc)
    .replaceAll("__YC__", yc)
    .replaceAll("__IL__", il);
}

export function patchOpenInLinuxTargetsSource(source) {
  if (source.includes(openInLinuxMarker)) {
    return { changed: false, code: source };
  }

  const match = openInLinuxRegex.exec(source);
  if (!match || !match.groups) {
    return { changed: false, code: source };
  }

  const injection = buildOpenInLinuxInjection({
    jc: match.groups.jc,
    yc: match.groups.yc,
    xc: match.groups.xc,
    il: match.groups.il
  });

  const matched = match[0];
  return {
    changed: true,
    code: source.replace(matched, matched + injection)
  };
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

  // Open-in Linux targets lives in whichever build bundle defines the
  // `var Jc=qc(process.platform)...` initializer -- normally `main-*.js`.
  const openInLinux = await patchFirstOpenInLinuxBundle(buildBundlePaths);

  return { websocket, auth, openInLinux };
}

async function patchFirstOpenInLinuxBundle(filePaths) {
  for (const filePath of filePaths) {
    const source = await fs.readFile(filePath, "utf8");
    if (!openInLinuxRegex.test(source) && !source.includes(openInLinuxMarker)) {
      continue;
    }
    const result = patchOpenInLinuxTargetsSource(source);
    if (result.changed) {
      await fs.writeFile(filePath, result.code);
    }
    return { path: filePath, changed: result.changed };
  }
  return { path: filePaths[0], changed: false, skipped: true };
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
  if (result.openInLinux) {
    logPatchResult("open-in linux targets", result.openInLinux);
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
