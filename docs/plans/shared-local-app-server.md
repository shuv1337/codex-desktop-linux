# Plan: Shared local app-server (Desktop + CLI)

Status: **implemented and verified end-to-end** (rev 3) —
`linux-features/shared-local-app-server/` landed; Desktop attaches as a
websocket client of the shared daemon (socket-pair verified), bare `codex`
and `codex resume` auto-attach via the wrapper, 19/19 feature tests pass.
Date: 2026-07-09 (rev 2 after plan review; rev 3 after implementation)

Rev 3 correction — "zero asar patch" did not survive contact with the
launcher: this repo's launcher **always exports `CODEX_CLI_PATH`** ("Using
CODEX_CLI_PATH=..." in `start.sh`), and upstream's gate refuses daemon
attach when it is set. The feature therefore carries one surgical patch
descriptor that removes only the `!process.env.CODEX_CLI_PATH?.trim()`
term from the gate (`patch.js`, main-bundle + extracted-app sweep,
graceful skip, needle verified unique in the installed asar).
`CODEX_APP_SERVER_FORCE_CLI=1` and the `codex_cli_command` host guard
remain as escape hatches. Everything else below held as designed.

Implementation-time discoveries also worth keeping:

- `codex app-server daemon start` prefers the **managed standalone
  runtime** (`~/.codex/packages/standalone/current/codex`) over the
  invoking CLI. On this machine it was stale at 0.131.0 — below Desktop's
  0.141.0 floor — which would have been a silent stdio fallback. Fixed via
  the runtime's self-update; the hook and doctor now warn on this skew.
- The standalone self-updater has side effects: it (re)creates
  `~/.local/bin/codex` as a symlink and appends a PATH block to
  `~/.bashrc`. The ensure-daemon hook reclaims the symlink for the
  wrapper; the PATH block was reverted manually.
- Two leaked `/tmp/codex-remote-mobile-cold-start-*` daemons were reaped
  (their pid files had already been cleaned, so `daemon stop` reported
  notRunning while the processes lived on).
Related: current Desktop local host uses private stdio `codex app-server`; CLI interactive
sessions are separate processes; users do not see a shared live websocket/runtime between them.

Rev 2 changes: incorporates the plan-review findings
(`~/.agent/diagrams/plan-review-shared-local-app-server.html`), the new hard requirement
(idiot-proof, always-on, auto-attach), and answers to all open questions.

## Hard requirements (rev 2)

1. **Idiot proof.** No manual flags in the steady state.
2. **All remote-capable `codex` CLI commands automatically attach** to the shared
   server (root TUI and `codex resume`; see the `codex exec` gap below).
3. **The Desktop launcher respects shared mode on every launch** once the feature
   is staged — no per-session opt-in.

## Problem

On Linux today (live-verified 2026-07-09):

1. Codex Desktop spawns a private local app-server over **stdio**
   (observed child argv, pid 793305):
   ```text
   codex -c features.code_mode_host=true app-server --analytics-default-enabled
   ```
2. Normal CLI (`codex`, `codex resume`) runs as its **own** runtime process.
3. `~/.codex/app-server-control/app-server-control.sock` does not exist;
   no shared live app-server between Desktop and CLI. Only disk under
   `~/.codex` is shared.

This is by architecture, not a transient bug.

## Headline discovery (rev 2): the Desktop client already ships

The installed `codex-app/resources/app.asar` contains a complete
attach-or-fallback transport factory for the **local** host, gated on one
environment variable. Reformatted from the minified bundle:

```js
process.platform !== `win32`
  && hostConfig.kind === `local`
  && process.env.CODEX_APP_SERVER_USE_LOCAL_DAEMON === `1`
  && process.env.CODEX_APP_SERVER_FORCE_CLI !== `1`
  && !process.env.CODEX_CLI_PATH?.trim()
  && hostConfig.codex_cli_command == null
  && await healthCheck()       // `codex app-server daemon version`, 2500ms timeout,
                               // parses appServerVersion + compat predicate
  ? // kind = `websocket`, supportsReconnect() === true:
    // ws://localhost/rpc over net.createConnection(
    //   $CODEX_HOME/app-server-control/app-server-control.sock)
    connectWebSocket()
  : // kind = `stdio` — today's behavior, silent fallback
    spawnStdioChild()
```

Consequences:

- The original Phase 1 ("patch the connection manager") is **already
  implemented upstream**. No asar patch is needed for the attach path.
- The upstream gate does **not** start the daemon. If the socket is
  unhealthy at connect time it silently falls back to a private stdio
  child. Ensuring the daemon exists **before** Desktop connects is the
  entire Desktop-side deliverable.
- The Desktop process currently has **no `CODEX_*` variables** in its
  environment (verified via `/proc/<pid>/environ`), so the gate inputs are
  clean and can be supplied by a launcher `env.d` hook.

## Smoke-test results (2026-07-09, unchanged from rev 1)

Isolated `CODEX_HOME` under `/tmp/codex-app-server-smoke-PzU7A0`.

| Check | Result |
|---|---|
| `codex app-server --listen unix://` | PASS — creates `$CODEX_HOME/app-server-control/app-server-control.sock` |
| `codex app-server daemon version` against that home | PASS — `status=running`, cli/app-server `0.144.0` |
| `codex --remote unix://` (TTY via `script`) | PASS — TUI attached and rendered |
| Second concurrent `codex --remote unix://` | PASS — second TUI also attached |
| `codex app-server --listen ws://127.0.0.1:18080` + `/readyz` `/healthz` + raw WS init | PASS |
| Two concurrent `codex --remote ws://...` | PASS |
| `codex app-server proxy` naive one-shot | WEAK — not required for TUI attach path |
| Current real Desktop local app-server | stdio-only; no control sock |

## Existing building blocks

### CLI (upstream, verified on 0.144.0)

- Server: `codex app-server --listen unix://|unix://PATH|ws://IP:PORT|stdio://|off`
- Client: `codex --remote unix://|unix://PATH|ws://|wss://` — **root TUI and
  `codex resume` only**; `codex exec` has **no** `--remote` flag.
- No env var or config key defaults `--remote` (binary strings sweep found
  only `CODEX_HOME`, `CODEX_API_KEY`, internal remote-control toggles) —
  auto-attach requires a wrapper.
- Daemon: `codex app-server daemon
  bootstrap|start|restart|stop|version|enable-remote-control|disable-remote-control`.
  `daemon start` accepts `-c key=value` and `--enable <FEATURE>`.
  Daemon state: `$CODEX_HOME/app-server-daemon/` (pid/locks +
  `settings.json` with `remoteControlEnabled`).
- `codex features list`: **`code_mode_host` is `stable` and default `true`**
  on 0.144.0 — a plainly started daemon already has it.
- `--analytics-default-enabled` only flips the analytics *default* for
  first-party clients; users can still opt in/out via `config.toml`.
- Control socket: `$CODEX_HOME/app-server-control/app-server-control.sock`.

### Desktop (upstream + this repo)

- Dormant local-daemon websocket client behind
  `CODEX_APP_SERVER_USE_LOCAL_DAEMON=1` (see headline discovery).
- Local stdio launch args needle (also used by remote-mobile-control):
  `` [`-c`,`features.code_mode_host=true`,`app-server`,`--analytics-default-enabled`] ``
- SSH/remote hosts already use the multi-client pattern
  (`app-server --listen unix://` + control socket + ws/proxy client).
- On this machine Desktop resolves the CLI to the **same npm-global
  `codex`** the terminal uses (observed child argv `node
  ~/.npm-global/bin/codex ...`), so Desktop and CLI daemon are
  version-locked by construction here.

### Launcher feature framework (this repo)

- `runtimeHooks.env` → `.codex-linux/env.d/`: literal `KEY=VALUE` exports on
  **every** launch (this is how "the launcher respects it always" is met).
- `runtimeHooks.prelaunch` → `.codex-linux/prelaunch.d/`: **synchronous,
  before Electron** — the correct phase for ensure-daemon. `coldStart` runs
  in the background *after* launch and would race the connect: do not use it
  for ensure-daemon.
- `defaultEnabled: true` is rejected by the framework; enabling happens via
  the git-ignored `linux-features/features.json`.

## Answered open questions (rev 2)

1. **Does the shared daemon need `features.code_mode_host=true` /
   `--analytics-default-enabled` parity?**
   `code_mode_host` is stable + default-true on CLI 0.144.0, so a plainly
   started daemon already has it. The ensure-daemon hook still passes
   `--enable code_mode_host` as cheap insurance for older CLIs. We do **not**
   pass an analytics-default flag to the user-owned daemon: it only changes
   the analytics *default*, functional behavior is unaffected, and a shared
   user daemon is not the first-party bundled context. Documented as a known
   delta. No `~/.codex/config.toml` change required.
2. **What does the upstream version-compat predicate accept?**
   A semver **minimum-version (floor) check**, not an exact match: this
   Desktop build bakes `MIN_APP_SERVER_VERSION = 0.141.0` (asar constants
   `Vh`/`Mf`, alongside `codex-app-server-version-unsupported:` /
   `codex-app-server-version-restart-available:` UX markers and a full
   semver parser). The npm CLI daemon at 0.144.0 passes today. Skew only
   bites when a Desktop update raises the floor above an older daemon —
   `codex app-server daemon restart` recovers, and the baked-in
   version-mismatch UX strings confirm upstream already surfaces this case.
   Dogfood step 0 double-checks acceptance on this machine.
3. **Always-on delivery: core patch or feature?**
   Feature: `linux-features/shared-local-app-server/`, default-off (the
   framework forbids `defaultEnabled:true`), enabled once in this machine's
   `features.json`. Once staged, `env.d` + `prelaunch.d` apply on **every**
   launch, satisfying "the launcher respects it always" per-install without
   violating the repo's opt-in design rule. Promote to core
   `scripts/patches/` only if it should apply to all users of this repo.
4. **Who owns the CLI wrapper?**
   The feature. `~/.local/bin` is PATH position 1 on this machine
   (npm-global is 9), so a wrapper **script** at `~/.local/bin/codex` wins
   PATH. remote-mobile-control's interactive-symlink cleanup only removes
   *symlinks* resolving into `$CODEX_HOME/packages/standalone/`
   (`cold-start-hook.sh` checks `[ -L ]` + prefix), so a regular script is
   never touched by it. Install/refresh from staged resources in the
   feature's prelaunch hook; document manual uninstall (`rm
   ~/.local/bin/codex`) in the README until staged-manifest cleanup covers
   user-home files.
5. **Is same-thread live sharing a goal?**
   No. The deliverable is **same server process + cross-visible threads**:
   any conversation started in Desktop is resumable from CLI (and vice
   versa) against the same live server. Simultaneous co-driving of one
   thread from two clients is not a TUI capability and is out of scope;
   multi-client testing is scoped to crash-safety and approval routing, not
   co-editing UX.

## Goals (rev 2)

1. Desktop local host and CLI share **one** multi-client app-server under
   the real `CODEX_HOME` (`~/.codex`).
2. **Auto-attach**: once the feature is staged, plain `codex` and
   `codex resume` attach to the shared server with no flags, via a PATH
   wrapper that injects `--remote unix://` when the socket is healthy.
3. **Always-on per install**: the launcher stages env + prelaunch hooks that
   apply on every Desktop launch.
4. Fail-soft with **visibility**: any fallback to private stdio must be
   observable (log line + status surface), never silent-only.
5. No regression for Desktop-only or CLI-only usage; wrapper passthrough
   must be bit-exact for non-attaching invocations.

## Non-goals (rev 2)

- Attaching `codex exec` (upstream CLI has no `--remote` there — accepted,
  documented gap; consider an upstream feature request).
- Simultaneous co-driving of a single thread from two clients (see Q5).
- Replacing remote-mobile-control / phone remote-control flows (compose with
  them instead — see Conflict handling).
- Custom protocol bridge into the stdio child (unsupported single-owner pipe).
- Patching the vendored CLI binary.

## Design (rev 2): Option A via the upstream gate

Option A (Desktop as client of a shared unix daemon) stands, but the
mechanism changes from "patch the connection manager" to "open the shipped
gate and guarantee its preconditions":

```text
                ~/.codex/app-server-control/app-server-control.sock
                                  ▲
                                  │ websocket JSON-RPC (ws://localhost/rpc over unix)
             ┌────────────────────┼──────────────────────┐
             │                    │                      │
     Desktop local host      codex (TUI) / codex resume   future clients
     (upstream ws client,    via ~/.local/bin/codex        (IDE, etc.)
      gate opened by env.d)  wrapper → --remote unix://
             ▲
             │ prelaunch.d (synchronous, before Electron)
        ensure-daemon: codex app-server daemon start --enable code_mode_host
                                  │
                                  ▼
              shared app-server daemon, one per CODEX_HOME,
              outlives Desktop, pid/locks in ~/.codex/app-server-daemon/
```

### Desktop side (no asar patch)

- `runtimeHooks.env`: `CODEX_APP_SERVER_USE_LOCAL_DAEMON=1`.
- `runtimeHooks.prelaunch`: idempotent ensure-daemon —
  `codex app-server daemon start --enable code_mode_host` (fast no-op when
  already running), plus a short wait-until-healthy
  (`daemon version` → `status=running`) bounded well under the gate's 2.5s
  health-check timeout budget.
- Gate preconditions asserted by the hook (warn loudly if violated):
  `CODEX_APP_SERVER_FORCE_CLI` unset, `CODEX_CLI_PATH` unset,
  no `codex_cli_command` host override.

### CLI side (wrapper)

`~/.local/bin/codex`, a small script owned by the feature:

- Attach only when **all** hold: subcommand is bare TUI or `resume`; argv
  does not already contain `--remote`; `CODEX_HOME` is unset or the default;
  stdin/stdout are a TTY; socket exists and `daemon version` reports
  running; `CODEX_SHARED_ATTACH_DISABLE` is not truthy.
- Then: exec real codex with `--remote unix://` appended.
- Otherwise: exec real codex with argv untouched (bit-exact passthrough) —
  scripts, `exec`, `mcp`, `app-server`, CI, and the Chrome native-host
  resolution all keep working.
- Prints one stderr line when attaching (`codex: attached to shared
  app-server via unix socket`) so the mode is always observable.

### Status surface (moved into Phase 1)

Minimum: ensure-daemon and wrapper both log the chosen transport; a
`shared-app-server-doctor` helper (script in the feature dir) prints every
gate input (env vars, socket health, daemon/CLI versions, marker states) and
the resulting expected transport. Desktop-UI surfacing can follow later; the
doctor script is the idiot-proof debugging story from day one.

## Health checks

- Socket exists and is a unix socket.
- `codex app-server daemon version` → `status=running`, versions parseable.
- Desktop-side acceptance is the upstream health check + compat predicate;
  a rejection is detected by the doctor script (daemon healthy but Desktop
  spawned a stdio child ⇒ predicate refused or a gate precondition failed).

Prefer **unix** over **ws** locally: no TCP ports, already the upstream
default for this path, smoke-tested. The "websocket server path" is
websocket-over-unix (`ws://localhost/rpc` on the control socket) — no
loopback TCP listener is needed or wanted.

## Lifecycle policy (v1)

| Event | Behavior |
|---|---|
| Desktop launch, no healthy sock | prelaunch hook starts daemon, waits healthy, Desktop attaches |
| Desktop launch, healthy sock | attach only |
| Desktop quits | daemon keeps running (upstream daemon semantics; never kill CLI clients) |
| CLI via wrapper | attach only; passthrough when unhealthy; never kills anything |
| Health check fails / version rejected | Desktop falls back to stdio child; doctor script + logs make it visible |
| Daemon upgrade | `codex app-server daemon restart` (manual or future hook) |

Refcounted stop-on-quit stays deferred; upstream pid/lock management
(`~/.codex/app-server-daemon/`) already covers daemon lifetime.

## Conflict handling (rev 2)

1. Shared daemon uses the real user `CODEX_HOME` only. Never attach to temp
   cold-start homes. (Two leaked
   `/tmp/codex-remote-mobile-cold-start-*` daemons were found running during
   review — reap them, and treat leak prevention as part of the
   remote-mobile composition work.)
2. **remote-mobile-control composition** — the argv-injection patch
   (`codexLinuxRemoteMobileAppServerArgs`) and the
   `desktop-app-server-remote-control-enabled` marker assume Desktop
   *spawns* the server. Under shared mode Desktop spawns nothing, so:
   - remote-control enablement moves to daemon settings: ensure-daemon runs
     `codex app-server daemon enable-remote-control` when
     remote-mobile-control is enabled (settings persist in
     `~/.codex/app-server-daemon/settings.json`);
   - the marker scheme gains a third state ("shared daemon owns
     remote-control") so the cold-start hook neither starts a redundant
     standalone daemon nor assumes the argv patch is active;
   - both feature combinations get explicit tests.
3. If a stdio Desktop child is already running from a pre-feature session:
   restart Desktop after enabling the feature (documented; no live takeover).

## Implementation sketch

### Feature layout

```text
linux-features/shared-local-app-server/
  feature.json          # env + prelaunch runtimeHooks, resources for wrapper
  README.md             # behavior, gate matrix, exec gap, uninstall, doctor usage
  ensure-daemon.sh      # prelaunch hook (also installs/refreshes CLI wrapper)
  codex-wrapper.sh      # staged resource → copied to ~/.local/bin/codex
  doctor.sh             # prints gate inputs + expected transport
  test.js               # see Tests
```

No `patch.js` in v1 — the attach path is upstream. A patch descriptor is
added only if a Desktop-UI status surface is built later.

### Knobs (rev 2 — reuse upstream, add one)

| Knob | Purpose |
|---|---|
| `CODEX_APP_SERVER_USE_LOCAL_DAEMON=1` | upstream gate; set by feature env hook |
| `CODEX_APP_SERVER_FORCE_CLI=1` | upstream escape hatch back to stdio |
| `CODEX_SHARED_ATTACH_DISABLE=1` | new: wrapper kill switch (passthrough) |

The rev-1 `CODEX_DESKTOP_SHARED_APP_SERVER*` knobs are dropped — do not
shadow upstream variables with repo-specific ones.

### Tests

1. Wrapper unit tests (the riskiest deliverable): allowlist decisions,
   passthrough bit-exactness, `--remote` already present, non-default
   `CODEX_HOME`, non-TTY, unhealthy socket, kill switch.
2. Ensure-daemon: idempotency, wait-until-healthy bound, gate-precondition
   warnings, `enable-remote-control` composition when remote-mobile is on.
3. Integration smoke (scripted, no GUI): ensure-daemon → `daemon version`
   healthy → `codex --remote unix://` attaches under `script` → second
   concurrent client attaches.
4. Regression: feature off → no env hook, no wrapper, legacy stdio spawn
   unchanged; remote-mobile-control on/off matrix; no non-loopback TCP
   listener.

### Validation commands

```bash
# feature tests
node --test linux-features/shared-local-app-server/test.js

# gate + transport diagnosis
linux-features/shared-local-app-server/doctor.sh

# health
codex app-server daemon version
ss -lxnp | rg app-server-control.sock

# after Desktop launch with feature staged
pgrep -af 'app-server'       # expect one shared daemon, no private stdio child
codex                        # wrapper attaches automatically (stderr notice)
```

## Risks (rev 2)

1. **Silent split-brain (top risk).** Every gate failure quietly reverts
   Desktop to a private stdio server while the CLI attaches to the daemon.
   Mitigated by: prelaunch wait-until-healthy, doctor script, wrapper/hook
   log lines. Status surface is Phase 1, not Phase 2.
2. **Multi-client UX** (approvals, thread focus) proven at transport level
   only. Scope: crash-safety + approval routing (Q5); dogfood before
   promoting beyond this machine.
3. **Wrapper on PATH** touches every codex consumer. Mitigated by
   allowlist + passthrough default + kill switch + dedicated tests.
4. **`codex exec` gap** — documented; upstream feature request candidate.
5. **Version-skew rejection** — low on this install (same binary both
   sides); visible via doctor when it happens; `daemon restart` recovers.
6. **remote-mobile ownership churn** — marker semantics changed as recently
   as commit 34a74fe; land composition changes in one coordinated series.

## Rollout plan (rev 2)

0. **Zero-code dogfood (do first):**
   ```bash
   codex app-server daemon start --enable code_mode_host
   codex app-server daemon version   # status=running
   CODEX_APP_SERVER_USE_LOCAL_DAEMON=1 <launch Desktop>
   pgrep -af app-server              # expect NO private stdio child
   codex --remote unix://            # shared TUI
   ```
   This validates the gate, the compat predicate (Q2), and code_mode_host
   parity (Q1) before any file is written. Also reap the leaked
   `/tmp/codex-remote-mobile-cold-start-*` daemons.
1. **PR 1:** feature dir with env hook + ensure-daemon + wrapper + doctor +
   tests + README; enable in this machine's `features.json`; rebuild.
2. **PR 2:** remote-mobile-control composition (daemon
   `enable-remote-control`, marker third state, combination tests).
3. Dogfood daily-driver; only then consider Desktop-UI status surface and
   promotion to core.

## Immediate workaround (unchanged)

```bash
codex app-server daemon start   # or: codex app-server --listen unix://
codex --remote unix://
```

## Success criteria (rev 2)

- [ ] With feature staged, Desktop attaches to the shared daemon on every
      launch (websocket transport; no private stdio child in steady state).
- [ ] `~/.codex/app-server-control/app-server-control.sock` healthy while
      Desktop is connected; daemon survives Desktop quit.
- [ ] Plain `codex` and `codex resume` auto-attach via the wrapper with no
      flags; non-attaching invocations pass through bit-exact.
- [ ] Threads started in Desktop are resumable from CLI against the same
      live server (and vice versa).
- [ ] Any fallback to stdio is visible (log + doctor), never silent-only.
- [ ] Feature off → current behavior byte-identical; remote-mobile-control
      combinations covered by tests.
- [ ] Known gap documented: `codex exec` does not attach.
