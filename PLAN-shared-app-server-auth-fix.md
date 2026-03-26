# Plan: Make Codex Desktop use the shared shuvdev app-server without API-key onboarding

## Objective

Make the Linux Codex Desktop build reliably support this architecture:

- a **single dedicated Codex app-server** runs on `shuvdev`
- it listens only on `127.0.0.1:9234`
- local Codex Desktop on `shuvdev` connects to that shared app-server
- remote Codex clients connect to the same app-server via **SSH port forwarding**
- the shared app-server uses the **API proxy exclusively**
- the desktop UI must **not** show the OpenAI/API-key onboarding prompt when the shared app-server is healthy and `requiresOpenaiAuth=false`

## Current state

### Working pieces

- [x] Dedicated shared app-server service created and enabled:
  - `/home/shuv/.config/systemd/user/codex-shared-app-server.service`
- [x] Shared app-server wrapper created:
  - `/home/shuv/.local/bin/codex-shared-app-server`
- [x] Service currently binds to:
  - `ws://127.0.0.1:9234`
- [x] Walker wrapper points the desktop app at:
  - `CODEX_APP_SERVER_WS_URL=ws://127.0.0.1:9234`
- [x] Shared app-server is loading proxy credentials from:
  - `~/.bash_exports`
  - `~/.codex/proxx.env`
  - `~/.config/codex-desktop-linux/proxy.env`
- [x] Shared app-server is exporting:
  - `OPENAI_BASE_URL=http://shuvdev:8789/v1`
  - `OPENAI_API_KEY=<proxy token>`
  - `CODEX_API_BASE_URL=http://shuvdev:8789/v1`
- [x] Direct websocket probe confirmed the app-server responds and initializes

### Broken pieces

- [ ] Desktop UI still shows the API-key onboarding prompt
- [ ] Local desktop launch still intermittently attempts websocket SOCKS routing through `127.0.0.1:1080`
- [ ] Installed runtime patching of `resources/app.asar` has been unreliable and should not be the long-term fix path

## Root cause summary

There are **two independent bugs** that must both be fixed.

### 1. Frontend auth-state bug

The app-server currently reports values like:

```json
{
  "authMethod": null,
  "authToken": null,
  "requiresOpenaiAuth": false
}
```

and:

```json
{
  "account": null,
  "requiresOpenaiAuth": false
}
```

This is actually compatible with the desired shared-proxy architecture:
- no OpenAI/ChatGPT account is required
- proxy/API mode is valid

However the desktop frontend currently interprets this as logged out.

Relevant logic observed in:
- `stage/beta/26.320.11513-beta.1119.linux.1/codex-app/content/webview/assets/use-auth-C1VbPac5.js`
- installed equivalent inside the packaged app bundle

Current logic:

```js
function S(e,t){
  let n=_(e.account),
      r=t.useCopilotAuthIfAvailable&&t.isCopilotApiAvailable?`copilot`:n;
  return {
    openAIAuth:n,
    authMethod:r,
    requiresAuth:r===`copilot`||(e.requiresOpenaiAuth??!0),
    ...
  }
}
```

Problem:
- if `e.account == null`
- and `e.requiresOpenaiAuth === false`
- then `authMethod` still becomes `null`
- UI treats that as logged out

Desired behavior:
- if `requiresOpenaiAuth === false`
- and no account exists
- UI should treat the session as valid proxy/API mode
- likely by synthesizing `authMethod = 'apikey'` or another non-null authenticated mode

### 2. Websocket SOCKS bypass regression in installed build

The packaged runtime still contains forced websocket SOCKS behavior using:

- `socks5h://127.0.0.1:1080`

Relevant logic appears in the packaged app bundle generated from `install.sh` patching logic.

Source patch hook:
- `install.sh`
- function: `patch_local_websocket_app_server()`

Intended patch behavior:
- local/private websocket targets should bypass SOCKS
- `CODEX_APP_SERVER_WS_SOCKS_PROXY=` should disable SOCKS entirely

But the installed app still produced logs like:

```text
connect ECONNREFUSED 127.0.0.1:1080
Codex app-server websocket closed (code=1006)
```

This means the final installed app bundle is not consistently honoring the intended bypass for `ws://127.0.0.1:9234`.

## Constraints and requirements

- [ ] Do **not** regress the shared app-server architecture
- [ ] Do **not** revert to per-launch app-server spawning as the main solution
- [ ] Keep the dedicated app-server bound to `127.0.0.1:9234`
- [ ] Keep remote access based on SSH tunnels, not LAN-exposed websocket listeners
- [ ] Keep proxy/API mode as the only backend auth path for the shared app-server
- [ ] Ensure the desktop UI opens directly into usable state without asking for an OpenAI key
- [ ] Fix this in the **source/build pipeline**, not by fragile ad-hoc post-install binary mutation

## Relevant files

### Runtime / local machine
- `/home/shuv/.local/bin/codex-desktop-linux-walker`
- `/home/shuv/.local/bin/codex-shared-app-server`
- `/home/shuv/.config/systemd/user/codex-shared-app-server.service`
- `/home/shuv/.local/share/applications/codex-desktop-linux.desktop`
- `/home/shuv/.config/codex-desktop-linux/app-server/app-server.log`
- `/home/shuv/.codex/auth.json`
- `/home/shuv/.codex/proxx.env`
- `/home/shuv/.bash_exports`

### Source repo
- `install.sh`
- `README.md`
- `stage/beta/26.320.11513-beta.1119.linux.1/codex-app/content/webview/assets/use-auth-C1VbPac5.js`
- `stage/beta/26.320.11513-beta.1119.linux.1/codex-app/resources/app.asar`
- `scripts/release/build-release.mjs`
- `scripts/release/stage-install.mjs`
- `scripts/release/packaged-wrapper.mjs`
- `test/packaged-wrapper.test.mjs`

## Proposed implementation strategy

### Milestone 1 — Fix frontend auth interpretation for proxy/shared-server mode

#### Goal
Make the desktop frontend treat this state as authenticated:

```json
{
  "account": null,
  "requiresOpenaiAuth": false
}
```

#### Tasks
- [ ] Identify the canonical source-stage asset or patch point for the auth hook used by the desktop webview
  - validate whether the correct patch target is the extracted `webview/assets/use-auth-*.js`
  - confirm whether the same logic also exists in another bundled asset that should be patched instead or additionally
- [ ] Add a source patch in `install.sh` that modifies the auth-state resolver logic during build
- [ ] Change logic so that when:
  - `account == null`
  - `requiresOpenaiAuth === false`
  - and Copilot override is not active
  - then `authMethod` becomes a non-null authenticated mode, likely `apikey`
- [ ] Ensure the resulting UI state does **not** require a ChatGPT/OpenAI account object
- [ ] Ensure profile dropdown / session UI renders consistently when `authMethod='apikey'` but `account=null`

#### Candidate code change
Current logic in staged asset:

```js
let n = _(e.account),
    r = t.useCopilotAuthIfAvailable && t.isCopilotApiAvailable ? `copilot` : n;
```

Target logic shape:

```js
let n = _(e.account),
    r = t.useCopilotAuthIfAvailable && t.isCopilotApiAvailable
      ? `copilot`
      : n != null
        ? n
        : e.requiresOpenaiAuth === false
          ? `apikey`
          : null;
```

#### Validation
- [ ] Launch the built app against the shared app-server
- [ ] Confirm UI does not show onboarding/API-key entry
- [ ] Confirm profile/settings UI treats session as API-key authenticated
- [ ] Confirm no ChatGPT-specific account assumptions crash the UI

---

### Milestone 2 — Fix websocket SOCKS bypass in the packaged build

#### Goal
Ensure `ws://127.0.0.1:9234` never uses the SOCKS proxy.

#### Tasks
- [ ] Revisit `install.sh` patch function:
  - `patch_local_websocket_app_server()`
- [ ] Confirm the patch anchor still matches the actual extracted app bundle in the current Codex release
- [ ] If the anchor is stale, update the patch to the current minified bundle shape
- [ ] Ensure local/private websocket targets bypass SOCKS for:
  - `127.0.0.1`
  - `localhost`
  - `::1`
  - `0.0.0.0`
  - RFC1918 private ranges
- [ ] Ensure explicit env override works:
  - `CODEX_APP_SERVER_WS_SOCKS_PROXY=` should disable SOCKS entirely
- [ ] Confirm the final repacked `app.asar` is a valid Electron ASAR archive after patching

#### Validation
- [ ] Launch desktop locally with wrapper
- [ ] Confirm no logs mention:
  - `connect ECONNREFUSED 127.0.0.1:1080`
- [ ] Confirm local websocket connection to shared app-server succeeds
- [ ] Confirm app remains able to use SOCKS for non-local remote websocket targets if explicitly configured

---

### Milestone 3 — Make build/install pipeline produce the fixed runtime cleanly

#### Goal
Move from fragile live patching to a reproducible install output.

#### Tasks
- [ ] Use `install.sh` as the source of truth for app bundle patching
- [ ] Verify extracted bundle layout assumptions used by:
  - `patch_local_websocket_app_server()`
  - any new auth patch helper
- [ ] Add a dedicated auth patch helper in `install.sh`, for example:
  - `patch_proxy_auth_ui_mode()`
- [ ] Apply both patches during `patch_asar()` before repacking
- [ ] Rebuild/reinstall the local app using the normal staging/install workflow
- [ ] Confirm installed `resources/app.asar` remains a valid ASAR archive

#### Validation
- [ ] Fresh install output launches correctly
- [ ] `file resources/app.asar` identifies it as Electron ASAR archive
- [ ] app bundle launches without Electron “failed to read header” errors

---

### Milestone 4 — Align launcher behavior with the new architecture

#### Goal
Keep wrappers simple and architecture-correct once the app bundle is fixed.

#### Tasks
- [ ] Keep `/home/shuv/.local/bin/codex-shared-app-server` as the single server owner
- [ ] Keep user service enabled and documented
- [ ] Review `/home/shuv/.local/bin/codex-desktop-linux-walker` and decide whether `codex login --with-api-key` is still needed once UI auth interpretation is fixed
- [ ] If no longer needed, simplify wrapper to only:
  - load proxy env values
  - map `PROXX_*` to `CODEX_*` / `OPENAI_*`
  - point desktop at shared websocket server
  - disable websocket SOCKS
- [ ] Ensure wrapper does **not** accidentally spawn or compete with the dedicated app-server

#### Validation
- [ ] `walker` launch is fast and deterministic
- [ ] no extra app-server listeners are started
- [ ] service remains sole listener on `127.0.0.1:9234`

---

### Milestone 5 — End-to-end validation for local and remote clients

#### Goal
Prove the intended architecture actually works.

#### Local validation
- [ ] `systemctl --user status codex-shared-app-server.service`
- [ ] `ss -ltnp '( sport = :9234 )'`
- [ ] launch local desktop from Walker
- [ ] verify no API-key onboarding prompt
- [ ] verify desktop can list models / config / threads through shared app-server

#### Remote validation
- [ ] from another machine, run:

```bash
ssh -N -L 9234:127.0.0.1:9234 shuvdev
```

- [ ] point that remote client to:

```text
ws://127.0.0.1:9234
```

- [ ] verify remote client also reaches the shared app-server successfully
- [ ] verify remote client does not need its own API key

#### Proxy validation
- [ ] verify the shared app-server is the only component using the proxy env
- [ ] verify no client requires direct OpenAI credentials outside the shared app-server contract
- [ ] confirm requests are routed through:
  - `http://shuvdev:8789/v1`

## Suggested implementation order

### Phase 1 — Source-level patching
- [ ] Add auth-state UI patch to `install.sh`
- [ ] fix/update websocket SOCKS bypass patch in `install.sh`
- [ ] verify both patches against the current extracted bundle

### Phase 2 — Rebuild and reinstall
- [ ] rebuild patched app bundle cleanly
- [ ] reinstall/update local `codex-app` runtime
- [ ] verify `app.asar` integrity

### Phase 3 — Runtime wiring verification
- [ ] confirm dedicated service owns `127.0.0.1:9234`
- [ ] verify walker wrapper still points at shared app-server
- [ ] simplify wrapper if possible after auth UI fix

### Phase 4 — Full behavioral validation
- [ ] local desktop validation
- [ ] remote SSH-tunneled client validation
- [ ] proxy-only path validation

## Risks and gotchas

- [ ] Minified bundle anchors may change across Codex upstream releases
- [ ] Patching `resources/app.asar` directly after install is error-prone and can corrupt the archive
- [ ] UI may have multiple auth-related bundle fragments, not just `use-auth-*.js`
- [ ] Fixing `authMethod` alone may reveal additional UI assumptions about account metadata
- [ ] SOCKS patch and auth patch should be validated together because either bug can independently force onboarding/failure behavior

## Validation commands to keep handy

```bash
systemctl --user status codex-shared-app-server.service
ss -ltnp '( sport = :9234 )'
tail -f ~/.config/codex-desktop-linux/app-server/app-server.log
/home/shuv/.local/bin/codex-desktop-linux-walker status
codex login status
```

Direct websocket probe for app-server auth state:

```bash
node <<'JS'
const ws = new WebSocket('ws://127.0.0.1:9234');
const pending = new Map();
let counter = 0;
function rpc(method, params) {
  const id = 'probe-' + (++counter);
  return new Promise((resolve) => {
    pending.set(id, resolve);
    ws.send(JSON.stringify({ id, method, params }));
  });
}
ws.addEventListener('message', async (ev) => {
  const data = JSON.parse(ev.data.toString());
  if (data.id && pending.has(data.id)) {
    pending.get(data.id)(data);
    pending.delete(data.id);
  }
});
ws.addEventListener('open', async () => {
  console.log(await rpc('initialize', { clientInfo: { name: 'probe', version: '1' }, capabilities: { experimentalApi: true, optOutNotificationMethods: [] } }));
  console.log(await rpc('getAuthStatus', { includeToken: false, refreshToken: false }));
  console.log(await rpc('account/read', { refreshToken: false }));
  ws.close();
});
JS
```

## Definition of done

- [ ] Local Walker-launched Codex Desktop connects to the shared app-server on `shuvdev`
- [ ] No API-key onboarding prompt appears for the local desktop app
- [ ] No local websocket attempt is made to `127.0.0.1:1080` for the shared app-server path
- [ ] Shared app-server remains bound only to `127.0.0.1:9234`
- [ ] Remote clients can connect through SSH tunnel to the same shared app-server
- [ ] The shared app-server is the only component that uses the API proxy credentials
- [ ] The fix is reproducible through the repo build/install pipeline, not a one-off manual mutation
