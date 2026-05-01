# Codex Desktop Linux Agent Notes

## Project overview

This repo converts the official macOS Codex Desktop app archive into a Linux runnable Electron bundle. The main entrypoint is `install.sh`, which resolves the upstream appcast, downloads/extracts the macOS archive, patches `app.asar`, rebuilds native modules for Linux, downloads Linux Electron, and writes launch scripts into `codex-app/` or `CODEX_INSTALL_DIR`.

## Key files

- `install.sh` — primary installer/conversion script.
- `scripts/appcast-metadata.mjs` — parses the beta/prod Sparkle appcasts and returns latest upstream archive metadata.
- `scripts/release/build-release.mjs` — release staging/dry-run metadata generator.
- `scripts/release/bundle-patches.mjs` — JS bundle patch anchors for websocket transport, proxy auth UI mode, and Linux “open in” targets.
- `test/*.test.mjs` — lightweight Node test suite for appcast parsing, release config/artifacts, wrappers, and bundle patch helpers.

## Current upstream channels

The installer defaults to `CODEX_CHANNEL=beta`, but both channels are appcast-driven:

- beta appcast: `https://persistent.oaistatic.com/codex-app-beta/appcast.xml`
- prod appcast: `https://persistent.oaistatic.com/codex-app-prod/appcast.xml`

Use these commands to inspect the latest upstream macOS source archive without installing:

```bash
node scripts/appcast-metadata.mjs --channel beta
node scripts/appcast-metadata.mjs --channel prod
node scripts/release/build-release.mjs --channel beta --dry-run
node scripts/release/build-release.mjs --channel prod --dry-run
```

## Validation

Run the lightweight test suite after changing scripts:

```bash
node --test test/*.test.mjs
```

For installer validation, avoid overwriting the user’s working `codex-app/` unless explicitly requested. Prefer staging into a throwaway directory:

```bash
CODEX_INSTALL_DIR=/tmp/codex-app-test CODEX_CHANNEL=prod ./install.sh
```

Or pass a downloaded archive path directly:

```bash
CODEX_INSTALL_DIR=/tmp/codex-app-test ./install.sh /path/to/Codex-darwin-arm64-<version>.zip
```

## Operational notes

- `codex-app/`, `stage/`, `dist/`, and downloaded `Codex*.zip`/`Codex.dmg` files can be large generated artifacts. Treat them as outputs, not source.
- Recent upstream builds use Electron `41.2.0`; do not assume Electron `40.0.0` from older README/package snapshots.
- `scripts/release/bundle-patches.mjs` should be checked against every new upstream build because bundle minification anchors can drift between Codex versions.
- `install.sh` emits structured-ish `[INFO]` / `[WARN]` / `[ERROR]` lifecycle logs; preserve that style when adding installer steps.
