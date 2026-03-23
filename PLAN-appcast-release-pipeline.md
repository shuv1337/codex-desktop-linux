## Goal

Bring the useful parts of `better-slop/codex-app-linux@v26.320.11513-beta.1119.launcher.2` into this repo **without losing** our existing Linux runtime patches and launcher features.

## Non-goals

- Do **not** replace our current `install.sh` + `codex-app/start.sh` workflow with a thin npm-only launcher.
- Do **not** regress auth-mode switching, websocket app-server management, SOCKS bypass behavior, or our richer Codex CLI discovery.
- Do **not** do a literal repo merge. This is selective adaptation.

## Key decisions already made

- Keep our installer/repacker and runtime launcher as the primary product.
- Selectively adopt upstream ideas for:
  - appcast-driven archive/version discovery
  - release packaging/publishing automation
  - packaged wrapper/test patterns for distributed artifacts
- Implement in phases so we can validate each piece independently.

## Relevant files

### Current repo

- `install.sh`
- `codex-app/start.sh`
- `codex-app/start-api.sh`
- `codex-app/start-oauth.sh`
- `README.md`
- `package.json`

### Reference repo/tag

- `https://github.com/better-slop/codex-app-linux/blob/v26.320.11513-beta.1119.launcher.2/scripts/lib/appcast.mjs`
- `https://github.com/better-slop/codex-app-linux/blob/v26.320.11513-beta.1119.launcher.2/scripts/lib/config.mjs`
- `https://github.com/better-slop/codex-app-linux/blob/v26.320.11513-beta.1119.launcher.2/scripts/lib/build.mjs`
- `https://github.com/better-slop/codex-app-linux/blob/v26.320.11513-beta.1119.launcher.2/electron-builder.config.mjs`
- `https://github.com/better-slop/codex-app-linux/blob/v26.320.11513-beta.1119.launcher.2/scripts/electron-builder-after-pack.cjs`
- `https://github.com/better-slop/codex-app-linux/blob/v26.320.11513-beta.1119.launcher.2/test/launcher-wrapper.test.mjs`
- `https://github.com/better-slop/codex-app-linux/blob/v26.320.11513-beta.1119.launcher.2/.github/workflows/release.yml`

## Phase 1 — Appcast-driven archive discovery

### Objective

Remove the brittle hardcoded upstream archive version from `install.sh` and resolve the latest beta/prod archive from the official appcasts by default.

### Tasks

- [x] Add a standalone helper script to fetch and parse the official prod/beta appcasts.
- [x] Keep `CODEX_APP_URL` override support for explicit/manual archives.
- [x] Add `CODEX_CHANNEL=beta|prod` support for selecting the default channel when `CODEX_APP_URL` is not set.
- [x] Update `install.sh` to resolve archive URL/version/build via appcast before download.
- [x] Make ZIP download naming channel/archive-aware instead of always writing `Codex-Beta.zip`.
- [x] Preserve existing manual `.zip`, `.dmg`, and `.app` path input behavior.
- [x] Add parser tests using `node:test` with fixture XML strings.
- [x] Update README install docs to mention automatic appcast resolution and `CODEX_CHANNEL`.

### Validation

- [x] `node scripts/appcast-metadata.mjs --channel beta`
- [x] `node scripts/appcast-metadata.mjs --channel prod`
- [x] `node --test test/appcast-metadata.test.mjs`
- [x] `bash -n install.sh`
- [ ] Manual smoke check: installer resolves a current beta archive URL without editing the script.

## Phase 2 — Release packaging foundation

### Objective

Create a build pipeline that produces distributable Linux artifacts from **our patched app**, not from a separate thinner product model.

### Tasks

- [x] Create a `scripts/release/` area for staged build logic.
- [x] Define prod/beta channel metadata and version/tag generation.
- [~] Add a staging flow that:
  - [x] resolves upstream archive metadata
  - [x] extracts/stages the app
  - [x] applies our existing patch logic
  - [x] rebuilds native modules
  - [x] assembles a Linux artifact directory
- [ ] Evaluate whether to factor reusable pieces out of `install.sh` into shared helpers rather than duplicating logic.
- [x] Add artifact metadata output (version, build number, archive URL, checksums, release tag).

### Validation

- [x] Local dry-run build for beta.
- [x] Local dry-run build for prod.
- [x] Verify produced artifact still includes our runtime launcher behaviors.
- [x] Run a full non-dry beta release build end-to-end and inspect the staged artifact contents.

## Phase 3 — Packaged wrapper for distributable artifacts

### Objective

Use the reference repo’s wrapper idea only where it helps packaged outputs.

### Tasks

- [x] Add an after-pack wrapper that renames the packaged executable to `-bin` and leaves a shell wrapper in place.
- [x] Keep our richer local launcher untouched.
- [~] Extend wrapper logic to preserve or improve current Codex CLI resolution behavior.
- [x] Add a symlink execution test similar to the reference repo’s wrapper test.

### Validation

- [x] Wrapper executes packaged binary correctly via symlink.
- [ ] `CODEX_CLI_PATH` override still works.
- [ ] Plain `codex` on `PATH` still works.

## Phase 4 — CI/CD release automation

### Objective

Automate artifact publication once the local build pipeline is stable.

### Tasks

- [ ] Add a GitHub Actions preflight job to detect whether prod/beta releases are outdated.
- [ ] Add channel-specific build jobs.
- [ ] Upload release artifacts and checksums to GitHub Releases.
- [ ] Publish npm package(s) only if we decide to expose a package distribution path.
- [ ] Optionally add AUR publishing support behind repository secrets/vars.
- [ ] Generate release notes from build metadata.

### Validation

- Workflow dry-run on a branch.
- Verify idempotent behavior when the target version already exists.
- Verify release assets are named consistently and reproducibly.

## Phase 5 — Documentation and rollout

### Tasks

- [ ] Update README with:
  - [x] channel selection
  - [x] manual override behavior
  - [ ] release artifact expectations
  - [ ] packaging/distribution workflow if added
- [ ] Add a short maintainer doc for release operations.
- [ ] Record any migration notes if local operator behavior changes.

## Risks and mitigations

### Risk: replacing our richer launcher with a thinner wrapper

Mitigation:
- Treat wrapper logic as distribution-only.
- Keep `codex-app/start.sh` as the feature-complete launcher.

### Risk: duplicated logic between installer and release scripts

Mitigation:
- Prefer extracting shared helpers once Phase 1 is stable.
- Avoid large refactors before behavior is covered by validation.

### Risk: appcast format drift

Mitigation:
- Keep parser small and tested.
- Fail clearly with actionable errors.
- Preserve `CODEX_APP_URL` manual override escape hatch.

## Implementation order

1. Phase 1 appcast discovery
2. Phase 2 release packaging foundation
3. Phase 3 packaged wrapper/tests
4. Phase 4 CI/CD automation
5. Phase 5 docs/rollout

## Immediate next implementation target

Start with **Phase 1**:

- add `scripts/appcast-metadata.mjs`
- add `test/appcast-metadata.test.mjs`
- integrate `install.sh` with appcast-driven channel/archive resolution
- validate with live appcasts and shell syntax check
