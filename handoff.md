# Handoff: Shared Codex app-server architecture on shuvdev

## What we are trying to accomplish

We want **all Codex clients** to use a **single dedicated Codex app-server running on `shuvdev`**.

Target architecture:
- shared app-server runs on `shuvdev`
- it listens on `ws://127.0.0.1:9234`
- local Codex Desktop on `shuvdev` connects to that server
- remote Codex clients connect to the same server via SSH port forwarding
- the shared app-server uses our API proxy exclusively:
  - `http://shuvdev:8789/v1`
- the desktop app should **not** show the OpenAI/API-key onboarding prompt in this mode

## Important context

This is **not** a normal ChatGPT login flow.

The intended mode is:
- no direct OpenAI account login required in the desktop client
- no per-client API key entry UI
- no separate app-server per client
- one shared app-server, one proxy path, many clients

## What is already in place

### Dedicated server
A dedicated shared app-server service already exists:
- script: `/home/shuv/.local/bin/codex-shared-app-server`
- service: `/home/shuv/.config/systemd/user/codex-shared-app-server.service`

It is intended to:
- load proxy env from local files
- export proxy vars to Codex
- listen on `ws://127.0.0.1:9234`

### Desktop wrapper
Walker launches Codex through:
- `/home/shuv/.local/bin/codex-desktop-linux-walker`

That wrapper currently:
- loads proxy env from:
  - `~/.bash_exports`
  - `~/.codex/proxx.env`
  - `~/.config/codex-desktop-linux/proxy.env`
- maps `PROXX_*` envs into `CODEX_*` / `OPENAI_*`
- points the desktop app at:
  - `CODEX_APP_SERVER_WS_URL=ws://127.0.0.1:9234`

## Current blockers

There are **two real bugs**.

### 1. Frontend auth-state bug
The app-server can return:

```json
{
  "authMethod": null,
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

That should mean:
- proxy/shared-server mode is valid
- no OpenAI login is required

But the desktop frontend currently interprets this as **logged out**, so it shows the API-key onboarding screen.

Likely fix area:
- `use-auth-C1VbPac5.js` logic in the built desktop webview bundle

### 2. Websocket SOCKS bug
The local desktop client is still sometimes trying to route the local websocket connection through:
- `127.0.0.1:1080`

This causes log lines like:
- `connect ECONNREFUSED 127.0.0.1:1080`

That means the local app-server websocket path is still not consistently bypassing SOCKS for `ws://127.0.0.1:9234`.

Likely fix area:
- `install.sh`
- specifically the websocket transport patch logic used while patching/repacking the app bundle

## Most important next step

Do **not** keep doing fragile live edits to the installed `resources/app.asar`.

Instead:
1. patch the build/install pipeline in the repo
2. fix the frontend auth interpretation for `requiresOpenaiAuth=false`
3. fix websocket SOCKS bypass for localhost/private websocket targets
4. rebuild/reinstall cleanly

## Files to look at first

- `PLAN-shared-app-server-auth-fix.md` ← full detailed plan
- `install.sh`
- `stage/beta/26.320.11513-beta.1119.linux.1/codex-app/content/webview/assets/use-auth-C1VbPac5.js`
- `/home/shuv/.local/bin/codex-desktop-linux-walker`
- `/home/shuv/.local/bin/codex-shared-app-server`
- `/home/shuv/.config/systemd/user/codex-shared-app-server.service`

## Success criteria

Another agent should aim to make this true:
- local Codex Desktop on `shuvdev` launches from Walker
- it connects to the shared app-server on `127.0.0.1:9234`
- it does **not** show the API-key onboarding prompt
- it does **not** try to connect through `127.0.0.1:1080`
- remote clients can connect through SSH tunnels to the same shared app-server
- only the shared app-server uses the API proxy credentials
