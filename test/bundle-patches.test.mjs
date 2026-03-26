import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import {
  patchExtractedAppBundles,
  patchLocalWebsocketTransportSource,
  patchProxyAuthUiModeSource,
  websocketTransportDeeplinksOldSnippet,
  websocketTransportHelper,
  websocketTransportOldSnippet,
  proxyAuthPatchMarker
} from "../scripts/release/bundle-patches.mjs";

const stagedAuthBundle = path.resolve(
  "stage/beta/26.320.11513-beta.1119.linux.1/codex-app/content/webview/assets/use-auth-C1VbPac5.js"
);

test("patchProxyAuthUiModeSource synthesizes apikey auth for shared proxy mode", async () => {
  const source = await fs.readFile(stagedAuthBundle, "utf8");

  const first = patchProxyAuthUiModeSource(source);
  assert.equal(first.changed, true);
  assert.match(first.code, /e\.requiresOpenaiAuth===!1\?`apikey`:null/);
  assert.match(first.code, /authMethod:r/);

  const second = patchProxyAuthUiModeSource(first.code);
  assert.equal(second.changed, false);
  assert.equal(second.code, first.code);
});

test("patchLocalWebsocketTransportSource adds local/private SOCKS bypass helper", () => {
  const source = `prefix ${websocketTransportOldSnippet} suffix`;

  const first = patchLocalWebsocketTransportSource(source);
  assert.equal(first.changed, true);
  assert.match(first.code, /__codexDesktopWsTransportOptions\(this\.options\.websocketUrl\)/);
  assert.match(first.code, /CODEX_APP_SERVER_WS_SOCKS_PROXY/);
  assert.match(first.code, /i==="127\.0\.0\.1"/);

  const second = patchLocalWebsocketTransportSource(first.code);
  assert.equal(second.changed, false);
  assert.equal(second.code, first.code);
});

test("patchLocalWebsocketTransportSource patches the current deeplinks websocket transport", () => {
  const first = patchLocalWebsocketTransportSource(websocketTransportDeeplinksOldSnippet);
  assert.equal(first.changed, true);
  assert.match(first.code, /__codexDesktopWsTransportOptions\(this\.options\.websocketUrl,Vte\.SocksProxyAgent\)/);
  assert.match(first.code, /CODEX_APP_SERVER_WS_SOCKS_PROXY/);

  const second = patchLocalWebsocketTransportSource(first.code);
  assert.equal(second.changed, false);
  assert.equal(second.code, first.code);
});

test("patchLocalWebsocketTransportSource is a no-op when the bundle has no SOCKS transport code", () => {
  const source = "function noSocksHere(){return true}";
  const result = patchLocalWebsocketTransportSource(source);
  assert.equal(result.changed, false);
  assert.equal(result.code, source);
});

test("patchExtractedAppBundles patches extracted main and auth bundles", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "codex-bundle-patches-"));
  const buildDir = path.join(root, ".vite", "build");
  const assetsDir = path.join(root, "webview", "assets");
  const mainBundlePath = path.join(buildDir, "main-fixture.js");
  const authBundlePath = path.join(assetsDir, "use-auth-fixture.js");
  const authSource = await fs.readFile(stagedAuthBundle, "utf8");

  await fs.mkdir(buildDir, { recursive: true });
  await fs.mkdir(assetsDir, { recursive: true });
  await fs.writeFile(mainBundlePath, websocketTransportOldSnippet);
  await fs.writeFile(authBundlePath, authSource);

  const first = await patchExtractedAppBundles(root);
  assert.equal(first.websocket.changed, true);
  assert.equal(first.auth.length, 1);
  assert.equal(first.auth[0].changed, true);

  const patchedMain = await fs.readFile(mainBundlePath, "utf8");
  const patchedAuth = await fs.readFile(authBundlePath, "utf8");
  assert.ok(patchedMain.includes(websocketTransportHelper));
  assert.ok(patchedAuth.includes(proxyAuthPatchMarker));

  const second = await patchExtractedAppBundles(root);
  assert.equal(second.websocket.changed, false);
  assert.equal(second.auth[0].changed, false);
});
