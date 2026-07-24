# Pegged renderer CPU on long automation sessions — root-cause investigation

Date: 2026-07-24
Investigated live on: shuvdev (Hyprland, Wayland session, Electron 42.3.0,
Codex app release 26.721.30844), against a production instance that had been
driven by `pi-codex-runtime` automation for ~22 h (app instance up ~2 h 50 m).

## Symptom

One `electron --type=renderer` process (the main "ChatGPT" window,
`webContentsId=1`) pinned at ~104% CPU continuously for hours, RSS growing
2.1 GiB → 3.0 GiB, 30 threads. User observation that cracked the case:
**the CPU pegs whenever the big automation session is focused in the UI, and
calms when it is not.**

## Root cause (high confidence)

Viewing a long, continuously-streamed conversation mounts that conversation's
view; the 1 Hz elapsed-time ticker plus streamed turn events (`item/started`,
`item/completed`, reasoning summaries, `turn/completed`) each trigger state
lookups over the *entire accumulated renderer state*. Native PC sampling shows
the time goes to V8 property-lookup machinery — linear scans over large,
shape-polymorphic collections with no effective memoization or virtualization:

| Samples (of 25) | Symbol | Meaning |
|---|---|---|
| 8 (~32%) | `Builtins_LoadIC` | slow-path `obj.prop` loads (megamorphic/dictionary objects) |
| 1 | `Builtins_KeyedLoadIC_Megamorphic` | `obj[key]` on shape-varying objects |
| 1 | `Builtins_ArrayPrototypeFind` | `array.find(...)` scans |
| 1 | `Builtins_Divide_Baseline` | arithmetic |
| ~8 | scattered JIT PCs (`[anon:v8]`) | varied app JS (the scan callbacks) |
| rest | `SkRasterPipeline*`, Dawn `APIWriteBuffer` | software raster / WebGPU (secondary) |

As the session accumulates (a 9.5 h task plus dozens of automation-driven
conversations, turns, and items), per-update cost grows until one core is
saturated full-time. This is an **upstream Codex app state-scaling bug**, not
a Linux-port patch: no repository code participates in the hot loop; all
implicated code lives in the upstream `app.asar`.

## How it was diagnosed (empirical, not guesswork)

### Finding 1 — it is the renderer main thread, executing JS
`top -H`: TID == PID at ~99%, all 29 other threads idle. `gdb` backtraces
(sudo; yama `ptrace_scope=1` blocks non-root attaches) land in
`[anon:v8]` RWX JIT code and electron `.text`, never blocked in a syscall.
So: userspace JS compute, not I/O, not the kernel.

### Finding 2 — not a syscall/IPC spin
`strace -c` on the main thread: no `recvmsg`/`read`/`poll` storm; ~400
`futex`/s (task-queue wake churn) plus a few `madvise` (V8 page release).
The loop is internal to the renderer, not driven 1:1 by incoming messages.

### Finding 3 — not a paint/rAF loop
Moving the window to a hidden Hyprland workspace (surface unmapped → rAF and
vsync stop) changed nothing: 107% → 107% → 105%. The GPU process only dipped
12% → 8%. The work is timer/event-driven state processing, which (per
Chromium rules) is not throttled for a visible-then-hidden page with active
connections.

### Finding 4 — not GC thrash
`/proc/<pid>/smaps`: 1.9 GiB committed `[anon:v8-sandbox]` (the JS heap), and
RSS is *stable* over minutes. A GC death spiral shows a heap pinned at its
limit with churn; here the memory is live, retained state. The heap is big
*because the app retains everything*, not because garbage is accumulating.

### Finding 5 — symbolized hot code = property-load machinery
PC histogram (25 `gdb` samples), symbolized with the official
`electron-v42.3.0-linux-x64-symbols.zip` breakpad symbols (cached in
`~/.cache/codex-desktop/electron/`; map `RIP - exec_mapping_start +
mapping_file_offset` onto `PUBLIC`/`FUNC` records). Result: the table above —
`LoadIC` dominates. JIT-side samples are scattered (the varied callback code),
so the *loop content* changes but the *dominant cost* is megamorphic property
lookup — the classic signature of `collection.find(x => x.id === target)`-style
selectors running over ever-growing arrays on every tick and every streamed
event.

### Finding 6 — the workload is automation-driven session accumulation
`~/.cache/codex-desktop/launcher.log` had reached 287 MB, including 22k
`[electron-message-handler] No turns for conversation` hydration retries plus
continuous `Queueing item/started … for hydrating conversation`,
`Skipping hydration for ambiguous turn/started`, browser-use IAB lifecycle, and
`AppServerConnection` routing lines. `~/.codex/sessions` shows new rollout
files every few minutes. The visible window showed a task with a **9 h 36 m
elapsed timer ticking 1 Hz** and content like "8 review tasks running, split
4 Grok + 4 Opus". `pi-codex-runtime` (sidecar) drives all of this through the
app.

### Finding 7 — focus correlation confirmed by a kill/reload experiment
Killing *only* the pegged renderer (SIGKILL) left the app-server, the pi
sidecar, and every running task intact (see topology below). The app spawned a
fresh renderer which re-attached to the same busy session and immediately began
churning again (instant CPU oscillating 13–116% while rehydrating ~1.2 GiB).
The peg is therefore reproducible **on demand**: focus the busy session.

## Process topology (why a CDP relaunch interrupts sessions)

```
start.sh
 ├─ webview-server.py                (UI asset server)
 └─ electron browser                 (owns the DevTools port; set at launch only)
     ├─ renderer  ← THE PEGGED PROCESS (sibling of app-server!)
     ├─ gpu / network / audio
     ├─ codex app-server             (child OF ELECTRON; stdio lifecycle owned by app)
     │   ├─ pi-codex-runtime sidecar (the automation session)
     │   └─ ~200-process MCP forest (node_repl, bun, …)
     └─ ssh …
```

- The app-server is a **direct child of the Electron browser process**, and the
  pi sidecar is its child. A full app relaunch (the only way to open a DevTools
  port, since Chromium binds it at startup) kills/replaces both. Conversations
  persist as rollout files in `~/.codex/sessions`, so they are resumable, but
  not seamlessly.
- Killing just the renderer is session-safe: the app-server and all tasks keep
  running; the window reloads itself (`render-process-gone` handlers are
  registered). Only unsent composer drafts and scroll positions are lost.
- This instance's CDP never came up because a **stale, orphaned
  `pi-codex-runtime` from a previous run was squatting port 9228**, so the
  browser's `--remote-debugging-port=9228` silently failed to bind. (Squatter
  killed during this investigation; port free. Use a free port next time.)

## Remediation

Immediate workarounds:

- **Do not keep the long automation session focused.** Switch to any other
  conversation/home view; the task keeps running server-side regardless.
- If the renderer is already pegged, killing it is safe for all sessions
  (see above). It re-pegs only if the busy session is focused again.

Profiling runbook (for the upstream report / a future fix):

```bash
# 1. Relaunch with a FREE debug port when automation can pause:
./codex-app/start.sh -- --remote-debugging-port=9228 --remote-allow-origins=*
# 2. Focus the busy session → pegs within ~a minute.
# 3. Over CDP on the page target:
#    Profiler.start / Profiler.stop            → exact JS functions (expect
#                                                conversation/turn selectors)
#    HeapProfiler.takeHeapSnapshot             → retained object graph (expect
#                                                full conversation/turn/item state)
```

Port-level note: `--disable-gpu-compositing` adds a secondary raster cost
(Skia `SkRasterPipeline` in-renderer plus `VizCompositor` in the GPU process,
~8–12% CPU here). Worth revisiting GPU compositing separately, but it is not
the peg's cause.

## Upstream bug report (draft)

**Title:** Renderer main thread saturated by O(n) state lookups per update in
long-running/streamed conversations

**Summary:** In the desktop app, keeping a long-lived, continuously streamed
conversation visible eventually pins one CPU core permanently. V8 sampling of
the renderer main thread shows time dominated by `Builtins_LoadIC`,
`Builtins_KeyedLoadIC_Megamorphic`, and `Array.prototype.find` — i.e., linear,
megamorphic property lookups over the full accumulated conversation state,
re-run on every 1 Hz UI tick and every streamed turn event. Retained JS heap
grows without bound (observed 1.9 GiB committed after ~3 h of automation; RSS
approaching 3 GiB at kill time). Hiding the window does not help (not
rAF-driven); GC is not the cause (heap is live state).

**Repro:** drive many turns/conversations through the app for hours (agent
automation makes this fast), keep a big session focused, watch the renderer's
main thread.

**Expected:** per-update cost independent of history size (indexed lookups,
eviction, virtualization). **Actual:** cost grows with history until one core
saturates.
