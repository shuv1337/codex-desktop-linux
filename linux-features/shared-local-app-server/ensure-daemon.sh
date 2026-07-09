#!/usr/bin/env bash
# shared-local-app-server prelaunch hook.
#
# Runs synchronously before Electron on cold start. The launcher has no
# hook timeout, so this script must bound itself and must always exit 0:
# a broken hook may cost shared mode, never the Desktop launch.
#
# Responsibilities:
#   1. Warn when an upstream gate precondition is violated (the Desktop
#      bundle refuses the daemon path when CODEX_APP_SERVER_FORCE_CLI=1 or
#      CODEX_CLI_PATH is set).
#   2. Ensure the shared app-server daemon is running under CODEX_HOME
#      before Desktop's transport factory health-checks it.
#   3. Compose with remote-mobile-control via daemon settings
#      (enable-remote-control), not argv injection.
#   4. Install/refresh the CLI auto-attach wrapper at ~/.local/bin/codex.
set -Eeuo pipefail

warn() {
    echo "WARN: shared-local-app-server: $*" >&2
}

note() {
    echo "shared-local-app-server: $*" >&2
}

truthy_env_value() {
    case "${1:-}" in
        1|true|TRUE|yes|YES|on|ON) return 0 ;;
        *) return 1 ;;
    esac
}

# --- self-timeout wrapper -------------------------------------------------
# Re-exec under `timeout` so a wedged codex invocation cannot block launch.
if [ "${1:-}" != "--run-main" ]; then
    timeout_seconds="${CODEX_SHARED_APP_SERVER_TIMEOUT_SECONDS:-20}"
    if command -v timeout >/dev/null 2>&1; then
        timeout "$timeout_seconds" "$0" --run-main || \
            warn "hook timed out or failed after ${timeout_seconds}s; Desktop may fall back to stdio"
    else
        "$0" --run-main || warn "hook failed; Desktop may fall back to stdio"
    fi
    exit 0
fi

if truthy_env_value "${CODEX_SHARED_APP_SERVER_DISABLE:-}"; then
    note "disabled by CODEX_SHARED_APP_SERVER_DISABLE"
    exit 0
fi

codex_home="${CODEX_HOME:-${HOME:-}/.codex}"
if [ -z "${HOME:-}" ] && [ -z "${CODEX_HOME:-}" ]; then
    warn "neither CODEX_HOME nor HOME is set; skipping"
    exit 0
fi

# --- gate precondition checks ----------------------------------------------
# These do not stop the daemon from being useful to the CLI, but they do stop
# Desktop from attaching, so make the split-brain loud.
if [ "${CODEX_APP_SERVER_FORCE_CLI:-}" = "1" ]; then
    warn "CODEX_APP_SERVER_FORCE_CLI=1 is set; Desktop will use a private stdio app-server"
fi
if [ -n "${CODEX_CLI_PATH:-}" ]; then
    warn "CODEX_CLI_PATH is set (${CODEX_CLI_PATH}); the upstream gate disables daemon attach"
fi

# --- resolve the codex CLI ---------------------------------------------------
resolve_codex() {
    if [ -n "${CODEX_SHARED_APP_SERVER_CODEX_PATH:-}" ]; then
        if [ -x "$CODEX_SHARED_APP_SERVER_CODEX_PATH" ]; then
            echo "$CODEX_SHARED_APP_SERVER_CODEX_PATH"
            return 0
        fi
        warn "CODEX_SHARED_APP_SERVER_CODEX_PATH is not executable: $CODEX_SHARED_APP_SERVER_CODEX_PATH"
        return 1
    fi
    local candidate
    if candidate="$(command -v codex 2>/dev/null)" && [ -n "$candidate" ]; then
        echo "$candidate"
        return 0
    fi
    candidate="$codex_home/packages/standalone/current/codex"
    if [ -x "$candidate" ]; then
        echo "$candidate"
        return 0
    fi
    return 1
}

codex_bin=""
if ! codex_bin="$(resolve_codex)"; then
    warn "no codex CLI found (PATH or $codex_home/packages/standalone/current/codex); skipping"
    exit 0
fi

daemon_version_json() {
    CODEX_HOME="$codex_home" "$codex_bin" app-server daemon version 2>/dev/null || true
}

json_field() {
    # json_field <json> <key> -> value or empty
    printf '%s' "$1" | python3 -c '
import json, sys
try:
    doc = json.load(sys.stdin)
except Exception:
    sys.exit(0)
value = doc.get(sys.argv[1])
if value is not None:
    print(value)
' "$2" 2>/dev/null || true
}

daemon_status() {
    json_field "$(daemon_version_json)" status
}

sock_path="$codex_home/app-server-control/app-server-control.sock"

# --- ensure the daemon -------------------------------------------------------
status="$(daemon_status)"
if [ "$status" != "running" ]; then
    if [ -S "$sock_path" ]; then
        # A listener exists but the daemon manager does not own it (for
        # example a manual `codex app-server --listen unix://`). Desktop's
        # health check will fail against it; do not fight over the socket.
        warn "socket exists at $sock_path but daemon status is '${status:-unknown}'; not starting a second server"
        exit 0
    fi
    note "starting shared app-server daemon under $codex_home"
    if ! CODEX_HOME="$codex_home" "$codex_bin" app-server daemon start --enable code_mode_host >/dev/null 2>&1; then
        warn "daemon start failed; Desktop will fall back to stdio"
        exit 0
    fi
    for _ in 1 2 3 4 5 6 7 8 9 10 11 12 13 14 15 16 17 18 19 20; do
        status="$(daemon_status)"
        [ "$status" = "running" ] && break
        sleep 0.3
    done
    if [ "$status" != "running" ]; then
        warn "daemon did not become healthy in time; Desktop will fall back to stdio"
        exit 0
    fi
fi

version_json="$(daemon_version_json)"
cli_version="$(json_field "$version_json" cliVersion)"
app_server_version="$(json_field "$version_json" appServerVersion)"
note "shared daemon running (appServerVersion=${app_server_version:-unknown}, cliVersion=${cli_version:-unknown})"

# The daemon prefers the managed standalone runtime under
# $CODEX_HOME/packages/standalone when one exists. If that runtime is stale,
# Desktop's minimum-version check can reject the daemon and silently fall
# back to stdio. Detect the skew here so it is loud instead of silent.
if [ -n "$cli_version" ] && [ -n "$app_server_version" ] && [ "$cli_version" != "$app_server_version" ]; then
    newest="$(printf '%s\n%s\n' "$cli_version" "$app_server_version" | sort -V | tail -1)"
    if [ "$newest" = "$cli_version" ]; then
        warn "daemon app-server $app_server_version is older than CLI $cli_version;" \
            "if Desktop stays on stdio, update the managed runtime" \
            "($codex_home/packages/standalone/current/codex update) and run" \
            "'codex app-server daemon restart --enable code_mode_host'"
    fi
fi

# --- remote-mobile-control composition --------------------------------------
# When the remote-mobile-control feature is staged, remote control must come
# from daemon settings; Desktop no longer spawns an app-server whose argv the
# feature could patch.
remote_mobile_marker="${CODEX_LINUX_APP_DIR:-}/.codex-linux/remote-mobile-control-enabled"
if [ -n "${CODEX_LINUX_APP_DIR:-}" ] && [ -f "$remote_mobile_marker" ]; then
    if CODEX_HOME="$codex_home" "$codex_bin" app-server daemon enable-remote-control >/dev/null 2>&1; then
        note "remote-mobile-control staged; enabled remote control on the shared daemon"
    else
        warn "could not enable remote control on the shared daemon"
    fi
fi

# --- CLI auto-attach wrapper -------------------------------------------------
install_wrapper() {
    if truthy_env_value "${CODEX_SHARED_APP_SERVER_SKIP_WRAPPER:-}"; then
        note "wrapper install skipped by CODEX_SHARED_APP_SERVER_SKIP_WRAPPER"
        return 0
    fi
    if [ -z "${CODEX_LINUX_FEATURES_DIR:-}" ]; then
        warn "CODEX_LINUX_FEATURES_DIR is not set; skipping wrapper install"
        return 0
    fi
    local src="$CODEX_LINUX_FEATURES_DIR/shared-local-app-server/codex-wrapper.sh"
    if [ ! -f "$src" ]; then
        warn "wrapper source not found at $src; skipping wrapper install"
        return 0
    fi
    if [ -z "${HOME:-}" ]; then
        warn "HOME is not set; skipping wrapper install"
        return 0
    fi
    local dest_dir="$HOME/.local/bin"
    local dest="$dest_dir/codex"

    if [ -L "$dest" ]; then
        local resolved standalone_root
        resolved="$(readlink -f "$dest" 2>/dev/null || true)"
        standalone_root="$(readlink -f "$codex_home/packages/standalone" 2>/dev/null || true)"
        [ -n "$standalone_root" ] || standalone_root="$codex_home/packages/standalone"
        case "$resolved" in
            "$standalone_root"/*)
                # The standalone installer claims this path with a symlink on
                # every self-update; the wrapper owns it instead.
                note "replacing standalone runtime symlink at $dest"
                ;;
            *)
                warn "$dest is a symlink to $resolved (not ours); leaving it alone"
                return 0
                ;;
        esac
    elif [ -e "$dest" ] && ! grep -q "codex-shared-local-app-server-wrapper" "$dest" 2>/dev/null; then
        warn "$dest exists and is not the shared-attach wrapper; leaving it alone"
        return 0
    fi

    if [ -f "$dest" ] && [ ! -L "$dest" ] && cmp -s "$src" "$dest"; then
        return 0
    fi
    if ! mkdir -p "$dest_dir"; then
        warn "could not create $dest_dir; skipping wrapper install"
        return 0
    fi
    local tmp="$dest_dir/.codex-wrapper.$$"
    if install -m 0755 "$src" "$tmp" && mv -f "$tmp" "$dest"; then
        note "installed CLI auto-attach wrapper at $dest"
    else
        rm -f "$tmp" 2>/dev/null || true
        warn "could not install wrapper at $dest"
    fi
}

install_wrapper

note "ready: Desktop should attach via websocket over $sock_path"
exit 0
