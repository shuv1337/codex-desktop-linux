# Shared Local App-Server

Optional Linux feature: Desktop and CLI share **one** multi-client app-server
daemon under the real `CODEX_HOME` (`~/.codex`), instead of Desktop parenting
a private stdio child while every CLI run spins up its own runtime.

Plan and investigation: `docs/plans/shared-local-app-server.md`.

Enable by adding the feature id to the git-ignored
`linux-features/features.json` before building:

```json
{
  "enabled": [
    "shared-local-app-server"
  ]
}
```

## How it works

The upstream Desktop bundle already ships a local-daemon websocket client
behind an environment gate; this feature opens the gate and guarantees its
preconditions:

- `shared-local-app-server.env` (staged to `.codex-linux/env.d/`) exports
  `CODEX_APP_SERVER_USE_LOCAL_DAEMON=1` on every launch. With that set,
  Desktop health-checks the daemon (`codex app-server daemon version`,
  2.5s budget, minimum app-server version enforced) and attaches as a
  websocket client (`ws://localhost/rpc` over
  `$CODEX_HOME/app-server-control/app-server-control.sock`). If the daemon
  is unhealthy, Desktop falls back to today's private stdio child.
- `ensure-daemon.sh` (staged to `.codex-linux/prelaunch.d/`, cold start,
  synchronous, self-bounded by `timeout`) starts the shared daemon when it
  is not running (`codex app-server daemon start --enable code_mode_host`),
  waits until healthy, warns loudly about anything that would push Desktop
  back to stdio, and installs the CLI wrapper.
- `codex-wrapper.sh` is installed at `~/.local/bin/codex` (first on PATH).
  Interactive TUI invocations — bare `codex`, `codex "prompt"`, and
  `codex resume ...` — automatically attach to the shared daemon by
  appending `--remote unix://` when the daemon is healthy. Everything else
  passes through to the real CLI with argv untouched.
- `patch.js` applies one surgical ASAR patch: upstream's gate also refuses
  to attach when `CODEX_CLI_PATH` is set (upstream reads a pinned CLI as
  "spawn exactly that binary"), but **this repo's launcher always exports
  `CODEX_CLI_PATH`** for CLI resolution, which would keep the gate closed
  forever. The patch removes only that one term;
  `CODEX_APP_SERVER_FORCE_CLI=1` and the per-host `codex_cli_command`
  guard survive as escape hatches.

## Transport / gate matrix

Desktop attaches only when **all** hold (upstream bundle logic):

| Condition | Notes |
|---|---|
| `CODEX_APP_SERVER_USE_LOCAL_DAEMON=1` | set by this feature's env hook |
| `CODEX_APP_SERVER_FORCE_CLI` ≠ `1` | upstream escape hatch back to stdio |
| `CODEX_CLI_PATH` unset **or** this feature's gate patch applied | the launcher always sets it, hence the patch |
| host is local, no `codex_cli_command` override | |
| `codex app-server daemon version` → `running` | within 2.5s |
| daemon `appServerVersion` ≥ Desktop's minimum | e.g. 0.141.0 for current builds |

Any failure means a **silent** fallback to a private stdio child. Run the
doctor whenever shared mode is in doubt:

```bash
linux-features/shared-local-app-server/doctor.sh
# staged copy: /opt/codex-desktop/.codex-linux/features/shared-local-app-server/doctor.sh
```

The wrapper attaches only when **all** hold: interactive TTY, no explicit
`--remote` in argv, argv is bare / a prompt positional / `resume`,
`CODEX_SHARED_ATTACH_DISABLE` unset, socket present, and
`daemon version` reports `running`. It prints one stderr line when it
attaches; passthrough is byte-exact `exec` of the real CLI.

## Knobs

| Variable | Effect |
|---|---|
| `CODEX_SHARED_ATTACH_DISABLE=1` | wrapper kill switch: always passthrough |
| `CODEX_SHARED_APP_SERVER_DISABLE=1` | prelaunch hook no-op |
| `CODEX_SHARED_APP_SERVER_SKIP_WRAPPER=1` | hook manages the daemon but never touches `~/.local/bin/codex` |
| `CODEX_SHARED_APP_SERVER_CODEX_PATH` | CLI binary override for the hook |
| `CODEX_SHARED_APP_SERVER_TIMEOUT_SECONDS` | hook self-timeout (default 20) |
| `CODEX_APP_SERVER_FORCE_CLI=1` | upstream: force Desktop back to stdio |

## Known limitations

- **`codex exec` cannot attach** — upstream has no `--remote` on `exec`.
  Headless runs share `~/.codex` on disk only.
- **Flags-first TUI invocations pass through** (`codex -m model "prompt"`).
  Locating the subcommand behind arbitrary flags would require tracking
  every value-taking flag; a wrong guess breaks the command, so the wrapper
  refuses to guess.
- **Version skew**: the daemon prefers the managed standalone runtime at
  `~/.codex/packages/standalone/current` when present. If it is older than
  Desktop's minimum app-server version, Desktop silently falls back to
  stdio. The hook and doctor both warn; fix with:
  ```bash
  ~/.codex/packages/standalone/current/codex update
  codex app-server daemon restart --enable code_mode_host
  ```
  Note the standalone self-updater may (re)create `~/.local/bin/codex` as a
  symlink and append a PATH block to `~/.bashrc`; the hook reclaims the
  symlink on the next launch.
- **Lifecycle**: the daemon outlives Desktop by design (never kill CLI
  clients on quit). Stop manually with `codex app-server daemon stop`.
- A manually started `codex app-server --listen unix://` (not
  daemon-managed) occupies the socket but fails Desktop's health check;
  the hook detects this and refuses to fight over the socket.

## remote-mobile-control composition

When `remote-mobile-control` is also staged, Desktop no longer spawns an
app-server whose argv that feature could patch. The hook instead runs
`codex app-server daemon enable-remote-control` (persisted in
`~/.codex/app-server-daemon/settings.json`) whenever the
`remote-mobile-control-enabled` marker is present in the installed app.

## Uninstall

Disable the feature and rebuild; then remove the wrapper by hand if
desired (`rm ~/.local/bin/codex` when it contains
`codex-shared-local-app-server-wrapper`). The daemon can be stopped with
`codex app-server daemon stop`.

## Testing

```bash
node --test linux-features/shared-local-app-server/test.js
```

Manual smoke:

```bash
codex app-server daemon start --enable code_mode_host
codex app-server daemon version          # status=running
codex                                    # wrapper prints the attach notice
linux-features/shared-local-app-server/doctor.sh
pgrep -af app-server                     # no private stdio child after a Desktop cold start
```
