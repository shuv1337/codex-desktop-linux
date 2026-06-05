# AGENTS.md

## Purpose

This repository adapts the official macOS Codex Desktop DMG into a runnable
Linux app, packages that app as native `.deb`, `.rpm`, pacman, and AppImage
artifacts, and ships a local Rust update manager that can rebuild future Linux
packages from newer upstream DMGs.

The current flow is:

1. `install.sh` downloads or extracts `Codex.dmg`.
2. The app `asar` is extracted and patched through the core patch registry plus
   any enabled `linux-features/` descriptors.
3. Native Node modules are rebuilt for Linux and a matching Linux Electron
   runtime is downloaded.
4. Bundled resources are staged: Browser Use, Chrome native messaging, Linux
   Computer Use, and opt-in feature resources such as Read Aloud when enabled.
5. Declarative Linux feature resources/runtime hooks and legacy `stage.sh`
   hooks are staged into `codex-app/`.
6. `install.sh` writes the generated Linux launcher into `codex-app/start.sh`.
7. Package builders turn `codex-app/` into `.deb`, `.rpm`, pacman, or AppImage
   artifacts.
8. Native packages include `codex-update-manager` and an update-builder bundle
   so local auto-updates rebuild future packages with the same feature config.

## Maintainer Rules

- Keep core behavior focused on the app launching and working for most Linux
  users. Experimental, workflow-specific, editor-specific, browser-specific,
  distro-specific, or minority-use integrations belong in `linux-features/` and
  must be disabled by default.
- If an optional feature needs a new core touchpoint, add the smallest generic
  extension point to core, then keep feature-specific logic inside that feature
  directory.
- Do not enable optional features in committed config. `linux-features/features.json`
  is local and gitignored; `features.example.json` stays empty.
- Each repository feature under `linux-features/<id>/` and each local feature
  under `linux-features/local/<id>/` must include a `README.md` next to
  `feature.json`.
- Do not manually patch generated output such as `codex-app/start.sh` for a
  durable fix. Change the source template, build helper, feature, or patch
  descriptor and regenerate.
- Treat updater, package builder, launcher, and feature framework changes as
  cross-format changes unless the code explicitly scopes them to one package
  format or desktop target.

## Source Of Truth

### Repo Orchestration

- `install.sh`
  Top-level installer entrypoint. It sources `scripts/lib/*.sh`, keeps the
  high-level build sequence small, and emits `codex-app/start.sh` from the
  launcher template plus an install-time identity prelude.
- `Makefile`
  Convenience targets for setup, fresh/build/install/package flows, native
  package autodetection, dev side-by-side app identities, AppImage, cleanup,
  and bootstrap workflows. Important targets include `setup-native`,
  `bootstrap-native`, `install-native`, `update-native`, `appimage`, `package`,
  and `install`.
- `scripts/bootstrap-wizard.sh`
  Guided native setup/update helper. It can discover Linux features, edit
  feature config, validate feature relationships, install native packages, and
  perform explicit feature-owned cleanup.
- `Cargo.toml`
  Workspace root. Members currently are `computer-use-linux`,
  `read-aloud-linux`, and `updater`.
- `flake.nix` / `flake.lock`
  Nix flake that pins upstream DMG, Cargo dependency, and Node dependency
  hashes. Use `scripts/ci/update-nix-hashes.sh` to refresh pins.
- `.devcontainer/devcontainer.json` / `.devcontainer/Dockerfile`
  Generic repo build/test container with Rust, Node 22/npm, packaging tools,
  `rustfmt`, and `clippy`. Prefer it before asking users to install host
  Rust/toolchain dependencies.

### Launcher

- `launcher/start.sh.template`
  Runtime launcher body. Edit this for launcher behavior: webview server
  lifecycle, warm-start handoff, CLI preflight, GUI prompts, URL-scheme
  handling, runtime Linux feature hooks, bundled plugin cache sync, and
  process/liveness behavior.
- `packaging/linux/codex-packaged-runtime.sh`
  Native-package-only runtime helper loaded optionally by the launcher. Keep
  distro/native-package specifics here so the generic launcher stays portable.
- `packaging/appimage/codex-appimage-runtime.sh`
  AppImage-only runtime helper.

### Build Pipeline (`scripts/lib/`)

- `install-helpers.sh`
  Argument parsing, dependency checks, identity validation, install-dir
  preparation, logging/color helpers, and shell quoting.
- `node-runtime.sh`
  Managed Linux Node.js runtime download and SHA256 validation. The launcher,
  Browser Use, native module rebuilds, Codex CLI install/update flow, and
  updater rebuilds use this runtime.
- `process-detection.sh`
  Running-app detection used to avoid overwriting a live install.
- `dmg.sh`
  DMG download/extraction and upstream Electron-version detection.
- `native-modules.sh`
  Linux rebuild of native modules such as `better-sqlite3` and `node-pty`, plus
  Electron runtime download/cache.
- `asar-patch.sh`
  Drives `scripts/patch-linux-window-ui.js` over the extracted upstream app.
- `webview-install.sh`
  Webview asset extraction and final `codex-app/` layout.
- `bundled-plugins.sh`
  Stages bundled Browser Use, Chrome, Linux Computer Use resources, native
  helper binaries, and marketplace metadata. Optional features can stage
  additional bundled-style resources, such as Read Aloud.
- `linux-features.sh` / `linux-features.js`
  Opt-in Linux feature framework. The JS side discovers repository and local
  features, validates manifests, dependencies, conflicts, entrypoints, resource
  modes, runtime hooks, package hooks, and exposes patch descriptors. The shell
  side runs feature staging in the install pipeline.
- `package-common.sh`
  Shared package-builder helpers: versioning, payload staging, permission
  normalization, package hook discovery/execution, update-builder staging, and
  user service helper installation.
- `linux-target-context.js`
  Build-time target detection for patch descriptors. Reads `/etc/os-release`
  and env overrides, then exposes helpers such as `matchesId()`,
  `packageFormatIs()`, `packageManagerIs()`, `desktopMatches()`, and
  `versionAtLeast()`.
- `patch-report.js` / `rebuild-report.sh`
  Structured patch and rebuild reports used by upstream drift validation and
  rebuild-candidate diagnostics.
- `patch-chrome-plugin.js` / `linux-update-bridge-patch.js`
  Focused patch helpers for Chrome plugin Linux compatibility and the in-app
  updater bridge.

### Patch Registry (`scripts/patches/`)

- `scripts/patch-linux-window-ui.js`
  ASAR patcher CLI and compatibility export surface.
- `scripts/patches/core/**/patch.js`
  Source of truth for shipped Linux compatibility patch descriptors. New core
  patches should be added as descriptors here, grouped under `all-linux/`,
  `distro/`, `package/`, or `desktop/`.
- `scripts/patches/engine.js`
  Discovers descriptors, normalizes them, checks duplicate ids, applies target
  filters, and records patch report metadata.
- `scripts/patches/registry.js`
  Orchestrates discovered core descriptors plus enabled Linux feature
  descriptors.
- `scripts/patches/*.js`
  Shared implementation helpers and compatibility modules used by descriptors.
  Do not treat these as the preferred location for new shipped patch entries.
- `scripts/patches/core/README.md`
  Descriptor contract. Read it before adding or moving core patches.
- `scripts/patch-linux-window-ui.test.js`
  Node test suite for the patcher.
- `scripts/ci/validate-patch-report.js`
  CI guard for required upstream patches. Mark a descriptor as required only
  when its absence should block upstream-build CI.

### Linux Features (`linux-features/`)

`linux-features/` is the extension boundary for optional Linux integrations.
Detailed contract: `linux-features/README.md` and
`docs/linux-features-architecture.md`.

- Repository features live under `linux-features/<feature-id>/`.
- User-local/private features live under `linux-features/local/<feature-id>/`;
  this directory is gitignored.
- `features.example.json` is the committed empty template. The active
  `features.json` is gitignored and lists enabled ids.
- `CODEX_LINUX_FEATURES_ROOT` and `CODEX_LINUX_FEATURES_CONFIG` can override
  feature discovery/config paths for setup and build flows.
- Feature ids use one namespace across repository and local features. Local
  features cannot shadow repository features.
- `defaultEnabled: true` is rejected. Optional features are always opt-in.
- Every feature must have `feature.json` and `README.md`.
- Prefer `entrypoints.patchDescriptors` for new patching. Legacy
  `mainBundlePatch` and `stageHook` remain supported for existing features.
- Manifest `requires` and `conflicts` are validated by setup, installer,
  patcher, and package builders.
- Declarative `resources`, `runtimeHooks`, and `packageHooks` are preferred
  over ad hoc staging whenever possible.
- Runtime hook types are `env`, `prelaunch`, `electronArgs`, `coldStart`, and
  `afterExit`; they are staged under `codex-app/.codex-linux/`.
- Declarative resources and runtime hooks are tracked in
  `.codex-linux/linux-features-staged.json` and removed on the next install
  when their owning feature is disabled.
- Declarative resource targets must stay inside the app directory and cannot
  target the app root. Mode values must be quoted octal strings such as
  `"0644"` or `"0755"`; numeric JSON modes are rejected. Declared modes are
  preserved through native packaging.
- Avoid writing user-home files from `stage.sh`. Stage sources with resources
  and copy them from runtime hooks, where real user paths are available.
- `packageHooks` run during native package staging with package/app root
  environment variables. They must be idempotent and narrowly scoped.
- Native package update-builder bundles preserve the enabled feature id list and
  configured feature root, including local features, so local auto-updates keep
  the same opt-in features.

Use `linux-features/` for anything useful to some users but not mandatory for
the baseline Linux app. If a feature needs more power, add a generic hook or
extension point to core rather than moving the feature itself into core.

### Native Packaging

- `scripts/build-deb.sh`
  Builds `.deb` from an already-generated `codex-app/`.
- `scripts/build-rpm.sh`
  Builds `.rpm` from `codex-app/`.
- `scripts/build-pacman.sh`
  Builds `.pkg.tar.zst` from `codex-app/`.
- `scripts/build-appimage.sh`
  Builds an AppImage using `packaging/appimage/`.
- `packaging/linux/`
  Debian control files, RPM spec, pacman template/hooks, desktop entry, icon
  policy, Polkit policy, packaged runtime helper, and shared user-service
  maintainer-script helper.
- `packaging/appimage/`
  AppImage `AppRun`, desktop file, and runtime helper.

The native package payload installs the app under `/opt/codex-desktop`, the
launcher under `/usr/bin/codex-desktop`, the updater under
`/usr/bin/codex-update-manager`, the user service under
`/usr/lib/systemd/user/`, desktop/icon metadata under `/usr/share/`, and an
update-builder bundle under `/opt/codex-desktop/update-builder`.

### Updater (`updater/`)

- `updater/src/main.rs` / `app.rs` / `cli.rs`
  Binary entrypoint, top-level dispatcher, and `clap` CLI.
- `builder.rs`
  Drives the packaged update-builder bundle to rebuild packages from newer
  upstream DMGs.
- `upstream.rs`
  Upstream DMG polling, ETag cache, download, and hash verification.
- `install.rs` / `install_rollback.rs` / `rollback.rs`
  Privileged package install, format-specific install/rollback commands, and
  manual rollback orchestration.
- `codex_cli.rs`
  Codex CLI discovery, version reads, npm-registry preflight checks, and
  install/update flow used by launcher preflight.
- `state.rs` / `config.rs`
  Persisted updater state and runtime config/path resolution.
- `liveness.rs` / `notify.rs` / `logging.rs`
  Electron liveness, desktop notifications, and service logging.
- `test_util.rs`
  Shared test helpers, including serialization of env-mutating tests.

The updater runs unprivileged and only escalates through `pkexec` for
`install-deb`, `install-rpm`, or `install-pacman`.

### Computer Use, Browser, And Read Aloud

- `computer-use-linux/`
  Rust crate for Linux Computer Use MCP, Chrome native messaging host, and the
  COSMIC helper.
- `computer-use-linux/src/windowing/`
  Window backend registry, target resolution, focus verification, and
  backend-specific implementations. Add new compositor/window-manager support
  under `windowing/backends/` and register it in `windowing/registry.rs`; avoid
  backend-specific branches in `server.rs` or `diagnostics.rs`.
- `computer-use-linux/gnome-shell-extension/`
  Bundled GNOME Shell extension used for exact GNOME activation.
- `plugins/openai-bundled/plugins/computer-use/`
  Bundled plugin manifest/resources staged into the Linux app.
- `read-aloud-linux/`
  Rust MCP backend for optional Read Aloud support.
- `linux-features/read-aloud/` and `linux-features/read-aloud-mcp/`
  Optional Linux features for Read Aloud patching/staging/integration.

### User-Local Install (`contrib/user-local-install/`)

This is an opt-in install path for users who do not want a system-wide native
package. The daily-driver flow remains `install.sh` plus a native package plus
`codex-update-manager`.

- `install-user-local.sh`
  Installs under `~/.local/opt/codex-desktop-linux`, creates wrappers under
  `~/.local/bin`, and installs a user desktop entry.
- `files/.local/lib/codex-desktop-linux/common.sh`
  Shared helpers for installed maintenance scripts.
- `files/.config/systemd/user/codex-desktop-update.{service,timer}`
  Optional weekly user timer.

### Tests And CI

- `tests/scripts_smoke.sh`
  Top-level smoke suite for shell helpers, package builders, launcher template,
  Electron-version detection, native modules, ASAR patches, and bundled plugin
  staging.
- `tests/fixtures/create-packaged-app-fixture.sh`
  Minimal fake packaged app layout for package-builder tests.
- `scripts/ci-local.sh`
  Local containerized CI runner. Targets include `pr`, `all`, `core`, `deb`,
  `rpm`, `pacman`, `install-deps[:image]`, `nix`, and `upstream`.
- `.github/workflows/`
  GitHub Actions for CI, upstream build app, install-deps, Cachix, Nix pin
  validation/update, and Computer Use sync reminders.

### Docs

- `README.md`
  Public install/usage entrypoint.
- `CONTRIBUTING.md`
  Contributor expectations.
- `CHANGELOG.md`
  Release notes.
- `docs/linux-features-architecture.md`
  Linux feature framework contract.
- `docs/github-cli-auth.md`
  GitHub CLI authentication guidance.
- `docs/webview-server-evaluation.md`
  Decision record for the future local webview server model.

## Generated Artifacts

- `codex-app/`
  Generated Linux app directory. Treat as build output.
- `codex-app-next/`
  Side-by-side rebuild candidate from `scripts/rebuild-candidate.sh`.
- `codex-*-app/`
  Alternate identity app directories, such as `codex-cua-lab-app/`.
- `dist/`
  Native package and AppImage outputs.
- `dist/appimage.AppDir/`
  Generated AppImage staging tree.
- `dist-next/rebuild/`
  Rebuild candidate reports.
- `target/`
  Rust build output for all workspace crates.
- `Codex.dmg`
  Cached upstream DMG.
- `linux-features/features.json`
  Gitignored local opt-in feature config.
- `linux-features/local/`
  Gitignored user-local feature directory.
- `codex-app/.codex-linux/linux-features-staged.json`
  Staged declarative feature ownership manifest.
- `~/.config/codex-update-manager/config.toml`
  Runtime updater config.
- `~/.local/state/codex-update-manager/state.json`
  Updater state-machine persistence.
- `~/.local/state/codex-update-manager/service.log`
  Updater service log.
- `~/.cache/codex-update-manager/`
  Downloaded DMGs, rebuild workspaces, staged package artifacts, and build logs.
- `~/.cache/codex-desktop/launcher.log`
  Launcher log for the default app identity.
- `~/.local/state/codex-desktop/app.pid` and `webview.pid`
  Launcher liveness files.
- `$XDG_RUNTIME_DIR/codex-desktop/launch-action.sock`
  Warm-start handoff socket.

## Important Behavior

- DMG extraction:
  `7z` can return a non-zero status for the `/Applications` symlink inside the DMG. This is currently treated as a warning if a `.app` bundle was still extracted successfully.
- Managed Node.js runtime:
  `install.sh` always provisions a managed Linux Node.js runtime under `codex-app/resources/node-runtime/` (default `v22.22.2`). The launcher, native module rebuild, Browser Use, the Codex CLI install/update flow, and the local auto-update rebuilds all use this runtime. Override with `CODEX_MANAGED_NODE_VERSION` / `CODEX_MANAGED_NODE_URL` / `CODEX_MANAGED_NODE_SHA256` (the SHA must be set when overriding the version or URL).
- Launcher and `nvm`:
  GUI launchers often do not inherit the user's shell `PATH`. The generated `start.sh` explicitly searches for `codex`, including common `nvm` locations.
- CLI preflight:
  Before Electron launches, the generated launcher asks `codex-update-manager` to verify the installed Codex CLI, prompt to install it when it is missing, and update it if the npm package is newer. Terminal launches prompt inline; GUI launches prefer `kdialog` on KDE/Plasma, otherwise `zenity`, before falling back to an actionable desktop notification. Missing-CLI automatic installation is launcher-scoped: the daemon and `codex-update-manager status` report `cli_status: NotInstalled` and may notify, but they do not attempt installation on their own. The check is best-effort: it uses a 1-hour cooldown for npm registry lookups, caches local CLI version reads to keep startup light, falls back to `npm install -g --prefix ~/.local` if a global install fails, and warns instead of blocking app launch when the refresh attempt does not succeed.
- ASAR patches are independent and fail-soft:
  `scripts/patches/core/**/patch.js` descriptors are the source of truth for shipped patch order, phase, target filter, and CI policy; `scripts/patches/registry.js` discovers and orchestrates them. Each patch function has its own regex-driven needles, an idempotency check, and a `console.warn` fall-back when the upstream bundle drifts. Current groups: main-process shell/window patches, webview asset patches, keybinds settings, launch actions, Computer Use gates, package metadata, and any opt-in `linux-features/` patches that have been enabled. The wrapper `scripts/patch-linux-window-ui.js` keeps the old CLI and test export surface. When adding a new needle, mirror this pattern — never `throw` unless the existing patch is intentionally required.
- Patch reporting and CI gate:
  `scripts/lib/patch-report.js` produces `patch-report.json` for each install (and `rebuild-report.sh` rolls it into `rebuild-report.json` under `dist-next/rebuild/`). `scripts/ci/validate-patch-report.js` reads that report and fails upstream-build CI when a `required-upstream` patch is missing or skipped. Mark new patches with `ciPolicy: REQUIRED_UPSTREAM` only when their absence should block CI.
- Linux features framework:
  `linux-features/` is opt-in. By default no extras are loaded. Per-developer choices live in the gitignored `linux-features/features.json`; CI sees only the empty `features.example.json` template. Features can contribute a main-bundle patch (registered as `feature:<id>` with `ciPolicy: optional`) and/or a `stage.sh` hook executed during install staging. Keep core Linux fixes in `scripts/patches/`; reserve `linux-features/` for additions that should not ship to every Linux build.
- Linux file manager integration:
  `applyLinuxFileManagerPatch` injects a Linux implementation for `Open in File Manager`. If the upstream minified bundle no longer matches, the install continues and emits exactly `Failed to apply Linux File Manager Patch`.
- Linux Computer Use plugin gate:
  Upstream excludes Linux from four allow-list gates; we patch them with two different default postures.
  - **Default-on:** `applyLinuxComputerUsePluginGatePatch` flips the bundled-plugin manifest from `darwin`-only to `darwin || linux` and adds `installWhenMissing: true` so the MCP plugin auto-registers. Pure platform-port glue — no Statsig involvement, no behavioural override; it has shipped on by default since the project's first release.
  - **Opt-in:** `applyLinuxComputerUseFeaturePatch`, `applyLinuxComputerUseRendererAvailabilityPatch`, and `applyLinuxComputerUseInstallFlowPatch` together unlock the Codex Desktop UI controls. The install-flow patch in particular falls back to `navigator.userAgent.includes("Linux")` as an OR-clause against the `computer_use` Statsig flag, which is why it is deliberately not on by default. The orchestrator (`patchMainBundleSource` / `patchExtractedApp`) calls `isComputerUseUiEnabled()` once per build; the helper returns `true` when `process.env.CODEX_LINUX_ENABLE_COMPUTER_USE_UI === "1"` OR `~/.config/codex-desktop/settings.json` contains `"codex-linux-computer-use-ui-enabled": true`. The settings-flag fallback exists so the auto-updater (a `systemd --user` service that does not inherit interactive shell env) can keep applying the UI patches across rebuilds without the user re-exporting an env var on every login.
  - **Out of scope:** OpenAI per-account Statsig rollouts that gate other features (`gpt-5.5` model rollout is the recurring example). Those are decided server-side per account and there is nothing in the local install that controls them.
- Linux Chrome plugin and native messaging:
  `install_bundled_plugin_resources` stages the upstream `chrome` plugin alongside `browser-use`, patches the Chrome plugin scripts for Linux, builds `codex-chrome-extension-host` from Rust, and installs that ELF as `extension-host/linux/<arch>/extension-host`. The host mirrors the macOS native host's browser socket bridge and rollout/session watcher: it observes browser requests carrying `session_id` / `turn_id`, tails the matching rollout JSONL under `~/.codex/sessions`, and emits `turnEnded` back to the extension after `task_complete`. It keeps one active Browser Use client per extension host: a newer Codex browser client evicts stale client sockets and clears their pending requests so old Node REPL kernels cannot keep issuing CDP setup calls. The launcher mirrors the staged plugin into `~/.codex/plugins/cache/openai-bundled/chrome/<version>`, maintains `latest`, writes bundled marketplace metadata, symlinks `plugins/chrome` under the temporary marketplace root, derives extension id/native-host name from the staged plugin metadata, and installs native-host manifests for Google Chrome, Brave, and Chromium. `applyLinuxChromePluginAutoInstallPatch` adds `installWhenMissing` to the upstream Chrome plugin descriptor so the plugin page does not depend on a manually persisted marketplace install state after restart. The staged diagnostics also recognize Brave and Chromium installs, running processes, profiles, and extension-aware profile selection before telling the user Chrome setup is missing. `applyLinuxChromeExtensionStatusPatch` fixes the Electron settings page's `chrome-extension-installed-read` handler so the visible Connected/Not connected badge scans Linux Chrome, Brave, and Chromium profile roots instead of returning false on Linux. Chrome's bundled `browser-client.mjs` must receive the same Linux `/aura/site_status` allowlist fallback as Browser Use so `Always allow` is not defeated by a missing `nodeRepl.fetch` allowlist. This is the durable source-of-truth fix for Linux browser extension availability; do not hand-edit only the user cache.
- Linux Computer Use window backends:
  Add new desktop/window-manager support under `computer-use-linux/src/windowing/backends/` and register it in `windowing/registry.rs`; avoid adding backend-specific branches to `server.rs` or `diagnostics.rs`. GNOME uses `org.gnome.Shell.Introspect` for listing plus the bundled `codex-window-control@openai.com` GNOME Shell extension for exact activation. COSMIC Wayland uses the bundled `codex-computer-use-cosmic` helper, which talks directly to the compositor's COSMIC toplevel Wayland protocols. KWin uses a generated KWin scripting bridge; Hyprland uses `hyprctl`; i3/Sway uses the i3 IPC tree plus `xprop` for PIDs. When no compositor backend is available, Computer Use still supports screenshots, AT-SPI, and global `ydotool` input, but not verified window-targeted keyboard input.
- Linux settings persistence:
  `applyLinuxSettingsPersistencePatch` inserts `codexLinuxPersistSettingsState(...)` so the keybinds-settings page toggles (system tray, warm start, compact prompt window) are mirrored to `~/.config/codex-desktop/settings.json`, where `linux_setting_enabled` in `install.sh` reads them. The patch is fail-soft: if the upstream `Yb` state-file marker or `set-global-state` IPC handler isn't present, the patch logs a warning and skips, leaving keybinds toggles in-memory only.
- Linux integrated terminal shell override:
  Upstream Codex Desktop has no Linux/macOS UI for picking the shell used by the in-app integrated terminal (`General Settings → Integrated terminal shell` is hidden when `platform !== "windows"`, and the option list is hard-coded to `powershell|commandPrompt|gitBash|wsl`). On Linux the terminal manager (`jz.resolveTerminalCommand` in the main bundle) falls through to `JT(globalState.get(INTEGRATED_TERMINAL_SHELL))`; upstream's non-Windows path ignores that setting and can still resolve to the login shell even when the launcher exports a different `SHELL`. The supported fix is two-part: `configure_integrated_terminal_shell` in `launcher/start.sh.template` reads `CODEX_LINUX_INTEGRATED_TERMINAL_SHELL` (per-launch) or the `codex-linux-integrated-terminal-shell` string in `$XDG_CONFIG_HOME/$CODEX_LINUX_APP_ID/settings.json`, validates that it is executable, and exports `SHELL`; `applyLinuxIntegratedTerminalShellPatch` then patches the main-bundle `JT()` resolver so Linux/macOS prefer `process.env.CODEX_LINUX_INTEGRATED_TERMINAL_SHELL || process.env.SHELL` before the upstream Unix fallback. Keep both pieces aligned in the generated/live `start.sh` and ASAR when testing user-local installs.
- Linux warm-start handoff:
  `applyLinuxLaunchActionArgsPatch` + `applyLinuxHotkeyWindowPrewarmPatch` add a Unix-domain-socket launch-action listener (`launch-action.sock` under `$XDG_RUNTIME_DIR/codex-desktop/`). When `start.sh` detects an existing Electron PID, it sends `--new-chat` / `--quick-chat` / `--prompt-chat` / `--hotkey-window` over the socket and exits, so a second launch never spawns a fresh Electron.
- Electron executable basename and single-instance handoff:
  Do not launch the downloaded runtime as a file literally named `electron`. Electron reports `app.isPackaged=false` for `electron`/`electron.exe` basenames, and upstream bootstrap gates single-instance forwarding on `app.isPackaged`, so browser/OAuth `codex://` redirects can open duplicate windows instead of exiting after forwarding args. `download_electron` stages `${CODEX_APP_ID}-electron` as a hardlink/copy of `electron`, and `launcher/start.sh.template` runs `$CODEX_LINUX_APP_ID-electron` with a runtime fallback for old user-local installs. Keep PID detection aligned with both the app-specific executable and the legacy `electron` path.
- Linux translucent sidebar default:
  During the same ASAR patch step, Linux defaults `Translucent sidebar` to `false` by applying `opaqueWindows: true` only when the app has no saved explicit value yet. This keeps existing user preferences intact while avoiding the sidebar disappearing bug on first run.
- Linux pet overlay mouse passthrough:
  `applyLinuxAvatarOverlayMousePassthroughPatch` keeps the floating pet's transparent-area click-through behavior by preferring `BrowserWindow.setShape()` on Linux. Electron only documents forwarded mouse events for macOS and Windows, so Linux can miss the renderer mousemove that should turn `setIgnoreMouseEvents(true)` back off after pet/workspace changes or when the Codex window is not focused. The Linux patch shapes the overlay input region to the current pet mascot/tray rectangles, expands it to the full overlay while dragging, leaves transparent regions click-through at the window-manager level, and falls back to the main-process pointer sync loop only if `setShape()` is unavailable or fails.
- In-app updater bridge:
  `linux-update-bridge-patch.js` (registered as `linux-app-updater-bridge` and `linux-app-updater-menu`) injects an Electron-side bridge so the in-app menu can read the local updater state file, kick off `codex-update-manager install-ready`, and trigger `codexLinuxQuitForUpdate` when an update is staged. The bridge is fail-soft: when the upstream bundle bindings cannot be located it emits a warning and leaves the macOS Sparkle code path intact.
- Launcher logging:
  The generated launcher logs to `~/.cache/codex-desktop/launcher.log` (or `$XDG_CACHE_HOME/<app id>/launcher.log` for non-default identities).
- App liveness:
  The launcher writes a PID file to `~/.local/state/codex-desktop/app.pid`. The updater uses that plus `/proc` fallback to know whether Electron is still running.
- Desktop icon association:
  The launcher runs Electron with `--class=codex-desktop`, and the desktop file sets `StartupWMClass=codex-desktop` so the taskbar/dock can associate the correct icon.
- Webview server:
  The launcher starts a local `python3 -m http.server` on port `5175` (default identity) or `5176` (alternate identity) from `content/webview/`, waits for the port to become reachable, verifies that `http://127.0.0.1:<port>/index.html` serves the expected Codex startup markers, and only then launches Electron because the extracted app expects local webview assets there. Opt-in multi-instance launches (`--new-instance` / `CODEX_MULTI_LAUNCH=1`) allocate the first free port from `CODEX_MULTI_LAUNCH_PORT_RANGE` and isolate pid files, launch sockets, logs, and Electron user-data dirs under the selected `port-<n>` instance id.
- Wayland/GPU compatibility:
  The generated launcher enables `--ozone-platform-hint=auto`, `--disable-gpu-sandbox`, and `--enable-features=WaylandWindowDecorations` by default. Keep these in mind when debugging Pop!_OS, Wayland, or Nvidia-specific rendering issues.
- Webview server roadmap:
  Review `docs/webview-server-evaluation.md` before changing the local server model; that document captures the current recommendation, risks, and acceptance criteria.
- Closing behavior:
  If future work touches shutdown behavior, assume the confirmation dialog may be implemented inside the app bundle rather than the Linux launcher.
- Update manager:
  The native packages include `/usr/bin/codex-update-manager`, `/usr/lib/systemd/user/codex-update-manager.service`, and a minimal rebuild bundle under `/opt/codex-desktop/update-builder`.
- Privilege boundary:
  The updater runs unprivileged. It only escalates at install time via `pkexec /usr/bin/codex-update-manager install-deb --path <deb>`, `install-rpm --path <rpm>`, or `install-pacman --path <pkg.tar.zst>`.
- Manual rollback:
  `codex-update-manager rollback` reinstalls the last-known-good package recorded in `state.json`. The same `install_rollback.rs` command shells (`apt`/`dpkg`, `dnf`/`rpm`/`zypper`, `pacman`) drive both the rollback and the ordinary post-install path; do not duplicate format detection elsewhere.
- Failed privileged installs:
  A failed or cancelled `pkexec` install stays in `Failed` and does not auto-retry every reconcile cycle. Check `service.log`, fix the root cause, and retry by waiting for the next rebuild or rebuilding a newer package.
- Interrupted installs:
  If updater state is left in `Installing` after a crash, restart, or interrupted privileged flow, the daemon recovers that state automatically instead of staying stuck and skipping future upstream checks.
- Package install/removal hooks:
  All three formats start the user service on install (DEB `postinst`, RPM `%post`, pacman `post_install`/`post_upgrade`) and best-effort stop/disable it on removal. If a user manager is unavailable, manual cleanup is still `systemctl --user disable --now codex-update-manager.service`.

## Crate Versioning

- Current updater crate version: `0.8.2` (`updater/Cargo.toml`).
- Current `codex-computer-use-linux` crate version: `0.2.3-linux-alpha1` (`computer-use-linux/Cargo.toml`). The enumeration tracks the standalone `agent-sh/computer-use-linux` crate (currently `0.2.3`); a mismatch means a sync between the two is pending.
- Bump `patch` for fixes, docs, and maintenance-only updates.
- Bump `minor` for compatible feature additions.
- Bump `major` for incompatible CLI, persisted-state, or install-flow changes.
- If the updater crate version changes, update `README.md` and `AGENTS.md` in the same change so the maintenance docs do not drift.

## How To Rebuild

Regenerate the Linux app:

```bash
./install.sh ./Codex.dmg
./install.sh
```

Guided native setup/install/update:

```bash
make setup-native
make bootstrap-native
make install-native
make update-native
```

Build native packages:

```bash
./scripts/build-deb.sh
./scripts/build-rpm.sh
./scripts/build-pacman.sh
./scripts/build-appimage.sh
```

Common package version override:

```bash
PACKAGE_VERSION=2026.03.24.120000+deadbeef ./scripts/build-deb.sh
```

Side-by-side rebuild candidate:

```bash
./scripts/rebuild-candidate.sh
./scripts/rebuild-candidate.sh --install
```

## Runtime Expectations

- `python3`, `7z`, `curl`, `unzip`, `tar`, `make`, and `g++` are required for
  `install.sh`.
- Native package builders require their format-specific tools (`dpkg-deb`,
  `rpmbuild`, `makepkg`/pacman tooling, or `appimagetool`).
- `scripts/install-deps.sh` bootstraps common host dependencies. On apt-based
  systems, `NODEJS_MAJOR=24 bash scripts/install-deps.sh` selects Node.js 24
  instead of the default NodeSource major.
- The packaged app still needs the Codex CLI at runtime, but launcher preflight
  attempts a best-effort install/update when possible.

## Preferred Validation After Changes

For shell/launcher/package changes:

```bash
bash -n install.sh
bash -n scripts/lib/*.sh
bash -n launcher/start.sh.template
bash -n scripts/build-deb.sh
bash -n scripts/build-rpm.sh
bash -n scripts/build-pacman.sh
bash -n scripts/build-appimage.sh
```

For patch and Linux feature changes:

```bash
node --test scripts/patch-linux-window-ui.test.js
node --test linux-features/*/test.js
bash tests/scripts_smoke.sh
```

For Rust changes:

```bash
cargo check -p codex-update-manager
cargo test -p codex-update-manager
cargo check -p codex-computer-use-linux
cargo test -p codex-computer-use-linux
cargo check -p codex-read-aloud-linux
cargo test -p codex-read-aloud-linux
```

For package payload changes, build the relevant formats and inspect metadata:

```bash
./scripts/build-deb.sh
dpkg-deb -I dist/codex-desktop_*.deb
dpkg-deb -c dist/codex-desktop_*.deb | sed -n '1,80p'
```

Also run RPM, pacman, AppImage, or containerized CI when the touched code
affects those paths:

```bash
./scripts/build-rpm.sh
./scripts/build-pacman.sh
./scripts/build-appimage.sh
./scripts/ci-local.sh pr
./scripts/ci-local.sh all
```

If launcher behavior changed, inspect the generated launcher after rebuild:

```bash
sed -n '1,160p' codex-app/start.sh
```

If updater behavior changed, inspect:

```bash
systemctl --user status codex-update-manager.service
codex-update-manager status --json
sed -n '1,120p' ~/.local/state/codex-update-manager/state.json
sed -n '1,160p' ~/.local/state/codex-update-manager/service.log
```

## Editing Guidance

- Prefer source files over generated artifacts: `launcher/start.sh.template`
  for launcher behavior, `scripts/lib/*.sh` for build pipeline behavior,
  `scripts/patches/core/**/patch.js` for shipped patches, and
  `linux-features/<id>/` for optional integrations.
- Keep native-package-only behavior in `packaging/linux/` helpers and
  AppImage-only behavior in `packaging/appimage/` helpers.
- Keep all package builders aligned through `scripts/lib/package-common.sh`
  when adding or removing shared payload files.
- Keep new core patch descriptors fail-soft and idempotent unless there is a
  deliberate required-upstream CI policy.
- Keep optional feature patches optional in CI and disabled by default.
- Add tests near the behavior being changed: patcher tests for ASAR needles,
  feature tests for Linux features, Rust tests for updater/MCP backends, and
  package smoke checks for payload/layout changes.
- When refreshing Nix hashes, use `scripts/ci/update-nix-hashes.sh`; do not
  hand-edit SRI hashes in `flake.nix`.
