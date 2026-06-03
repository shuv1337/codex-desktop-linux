#!/bin/bash
# Codex.dmg download, extraction, and Electron-version detection from app metadata.
#
# Sourced by install.sh. Do not run directly.
# shellcheck shell=bash

# ---- Download or find Codex DMG ----
get_dmg() {
    local dmg_dest="$CACHED_DMG_PATH"

    # Reuse existing DMG
    if [ -s "$dmg_dest" ]; then
        info "Using cached DMG: $dmg_dest ($(du -h "$dmg_dest" | cut -f1))"
        echo "$dmg_dest"
        return
    fi

    info "Downloading Codex Desktop DMG..."
    local dmg_url="https://persistent.oaistatic.com/codex-app-prod/Codex.dmg"
    info "URL: $dmg_url"

    if ! curl -L --progress-bar --max-time 600 --connect-timeout 30 \
            -o "$dmg_dest" "$dmg_url"; then
        rm -f "$dmg_dest"
        error "Download failed. Download manually and place as: $dmg_dest"
    fi

    if [ ! -s "$dmg_dest" ]; then
        rm -f "$dmg_dest"
        error "Download produced empty file. Download manually and place as: $dmg_dest"
    fi

    info "Saved: $dmg_dest ($(du -h "$dmg_dest" | cut -f1))"
    echo "$dmg_dest"
}

# ---- Extract app from DMG ----
extract_dmg() {
    local dmg_path="$1"
    info "Extracting DMG with 7z..."

    local extract_dir="$WORK_DIR/dmg-extract"
    local seven_log="$WORK_DIR/7z.log"
    local seven_zip_status=0

    mkdir -p "$extract_dir"
    if "$SEVEN_ZIP_CMD" x -y -snl "$dmg_path" -o"$extract_dir" >"$seven_log" 2>&1; then
        :
    else
        seven_zip_status=$?
    fi

    local app_dir
    app_dir=$(find "$extract_dir" -maxdepth 3 -name "*.app" -type d | head -1)

    if [ "$seven_zip_status" -ne 0 ]; then
        if [ -n "$app_dir" ]; then
            warn "7z exited with code $seven_zip_status but app bundle was found; continuing"
            warn "$(tail -n 5 "$seven_log" | tr '\n' ' ' | sed 's/[[:space:]]\+/ /g')"
        else
            cat "$seven_log" >&2
            error "Failed to extract DMG"
        fi
    fi

    [ -n "$app_dir" ] || error "Could not find .app bundle in DMG"

    info "Found: $(basename "$app_dir")"
    echo "$app_dir"
}

# ---- Detect Electron version from DMG ----
sanitize_electron_version() {
    local value="$1"
    value="${value#v}"
    value="${value#^}"
    value="${value#~}"

    if [[ "$value" =~ ^[0-9]+(\.[0-9]+){2}([.-][0-9A-Za-z]+)*$ ]]; then
        echo "$value"
        return 0
    fi

    return 1
}

detect_electron_version() {
    local app_dir="$1"
    local detected=""
    local detected_version=""
    local plist_file="$app_dir/Contents/Frameworks/Electron Framework.framework/Versions/A/Resources/Info.plist"

    if [ -f "$plist_file" ]; then
        detected=$(python3 - "$plist_file" <<'PY' 2>/dev/null || true
import plistlib
import sys

with open(sys.argv[1], "rb") as handle:
    print(plistlib.load(handle).get("CFBundleVersion", ""))
PY
)
        if detected_version=$(sanitize_electron_version "$detected"); then
            ELECTRON_VERSION="$detected_version"
            info "Detected Electron version from DMG: $ELECTRON_VERSION"
            return 0
        elif [ -n "$detected" ]; then
            warn "Ignoring invalid Electron version from DMG: $detected"
        fi
    fi

    local resources_dir="$app_dir/Contents/Resources"
    if [ -f "$resources_dir/app.asar" ]; then
        # Read package.json directly out of the asar archive with Python. The
        # asar header is a pickled JSON blob (uint32 length-prefixed) followed by
        # the concatenated file contents, so we can locate package.json without
        # depending on `npx asar`, which can be unavailable or choke on the
        # symlink-bearing DMG extraction. `devDependencies.electron` is the
        # authoritative Electron version (upstream renamed the bundled framework
        # from "Electron Framework" to "Codex Framework", and its plist now
        # carries the Chromium version rather than the Electron version).
        detected=$(python3 - "$resources_dir/app.asar" <<'PY' 2>/dev/null || true
import json
import struct
import sys

try:
    with open(sys.argv[1], "rb") as handle:
        header = handle.read(16)
        if len(header) < 16:
            raise SystemExit(0)
        header_size = struct.unpack("<4I", header)[3]
        header_json = handle.read(header_size).decode("utf-8", "ignore")
        tree = json.loads(header_json)
        entry = tree.get("files", {}).get("package.json")
        if not entry or "offset" not in entry or "size" not in entry:
            raise SystemExit(0)
        content_start = 16 + header_size
        if content_start % 4:
            content_start += 4 - (content_start % 4)
        handle.seek(content_start + int(entry["offset"]))
        pkg = json.loads(handle.read(int(entry["size"])).decode("utf-8", "ignore"))
        electron = (pkg.get("devDependencies") or {}).get("electron") \
            or (pkg.get("dependencies") or {}).get("electron") or ""
        print(electron)
except Exception:
    raise SystemExit(0)
PY
)
        if detected_version=$(sanitize_electron_version "$detected"); then
            ELECTRON_VERSION="$detected_version"
            info "Detected Electron version from package.json: $ELECTRON_VERSION"
            return 0
        elif [ -n "$detected" ]; then
            warn "Ignoring invalid Electron version from package.json: $detected"
        fi
    fi

    warn "Could not auto-detect Electron version; using fallback $ELECTRON_VERSION"
    return 0
}

electron_version_major() {
    local version="$1"
    local major="${version%%.*}"

    case "$major" in
        ''|*[!0-9]*) return 1 ;;
    esac

    echo "$major"
}

validate_electron_cap_config() {
    case "$MAX_SUPPORTED_ELECTRON_MAJOR" in
        ''|*[!0-9]*) error "Invalid CODEX_MAX_ELECTRON_MAJOR: $MAX_SUPPORTED_ELECTRON_MAJOR" ;;
    esac

    local cap_version_major
    if ! sanitize_electron_version "$MAX_SUPPORTED_ELECTRON_VERSION" >/dev/null; then
        error "Invalid CODEX_MAX_ELECTRON_VERSION: $MAX_SUPPORTED_ELECTRON_VERSION"
    fi
    cap_version_major="$(electron_version_major "$MAX_SUPPORTED_ELECTRON_VERSION")"

    if [ "$cap_version_major" -gt "$MAX_SUPPORTED_ELECTRON_MAJOR" ]; then
        error "CODEX_MAX_ELECTRON_VERSION major ($cap_version_major) exceeds CODEX_MAX_ELECTRON_MAJOR ($MAX_SUPPORTED_ELECTRON_MAJOR)"
    fi
}

# Cap ELECTRON_VERSION to the newest buildable Electron when upstream ships a
# major we cannot build native modules for yet. Detection remains raw; this
# helper records the upstream-declared version separately for reporting.
cap_electron_version() {
    CODEX_UPSTREAM_ELECTRON_VERSION="$ELECTRON_VERSION"
    validate_electron_cap_config

    if [ -n "${CODEX_FORCE_ELECTRON_VERSION:-}" ]; then
        if ! ELECTRON_VERSION="$(sanitize_electron_version "$CODEX_FORCE_ELECTRON_VERSION")"; then
            error "Invalid CODEX_FORCE_ELECTRON_VERSION: $CODEX_FORCE_ELECTRON_VERSION"
        fi
        warn "Forcing Electron v$ELECTRON_VERSION (CODEX_FORCE_ELECTRON_VERSION)"
        return 0
    fi

    local detected_major
    detected_major="$(electron_version_major "$ELECTRON_VERSION")" || return 0

    if [ "$detected_major" -gt "$MAX_SUPPORTED_ELECTRON_MAJOR" ]; then
        warn "Electron v$ELECTRON_VERSION (major $detected_major) exceeds the max buildable major $MAX_SUPPORTED_ELECTRON_MAJOR; native modules (better-sqlite3) cannot build against it yet."
        warn "Capping build to Electron v$MAX_SUPPORTED_ELECTRON_VERSION (upstream declares v$CODEX_UPSTREAM_ELECTRON_VERSION)."
        ELECTRON_VERSION="$MAX_SUPPORTED_ELECTRON_VERSION"
    fi
}
