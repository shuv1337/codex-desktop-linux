#!/usr/bin/env bash
# shared-local-app-server doctor: prints every input to the Desktop attach
# gate and the CLI auto-attach wrapper, plus the transport each should pick.
# Read-only; safe to run any time.
set -u

ok()   { printf '  [ ok ] %s\n' "$*"; }
bad()  { printf '  [FAIL] %s\n' "$*"; }
warn() { printf '  [warn] %s\n' "$*"; }
info() { printf '  [    ] %s\n' "$*"; }

truthy() {
    case "${1:-}" in
        1|true|TRUE|yes|YES|on|ON) return 0 ;;
        *) return 1 ;;
    esac
}

codex_home="${CODEX_HOME:-${HOME:-}/.codex}"
app_dir="${CODEX_LINUX_APP_DIR:-/opt/codex-desktop}"
sock="$codex_home/app-server-control/app-server-control.sock"
wrapper_dest="${HOME:-}/.local/bin/codex"
desktop_attach_expected=1

echo "shared-local-app-server doctor"
echo "  codex_home: $codex_home"
echo "  app_dir:    $app_dir"
echo

echo "Feature staging (applies on next Desktop launch):"
env_file="$app_dir/.codex-linux/env.d/shared-local-app-server-env"
hook_file="$app_dir/.codex-linux/prelaunch.d/shared-local-app-server-ensure-daemon.sh"
if [ -f "$env_file" ]; then
    ok "env hook staged: $env_file"
else
    bad "env hook not staged at $env_file (feature not built into the installed app)"
    desktop_attach_expected=0
fi
if [ -x "$hook_file" ]; then
    ok "prelaunch ensure-daemon staged: $hook_file"
else
    bad "prelaunch hook not staged at $hook_file"
    desktop_attach_expected=0
fi
echo

echo "Upstream gate preconditions (in this shell's environment):"
if [ "${CODEX_APP_SERVER_USE_LOCAL_DAEMON:-}" = "1" ]; then
    ok "CODEX_APP_SERVER_USE_LOCAL_DAEMON=1"
else
    info "CODEX_APP_SERVER_USE_LOCAL_DAEMON unset here (the launcher env hook sets it for Desktop)"
fi
if [ "${CODEX_APP_SERVER_FORCE_CLI:-}" = "1" ]; then
    bad "CODEX_APP_SERVER_FORCE_CLI=1 forces Desktop back to stdio"
    desktop_attach_expected=0
else
    ok "CODEX_APP_SERVER_FORCE_CLI not set"
fi
if [ -n "${CODEX_CLI_PATH:-}" ]; then
    bad "CODEX_CLI_PATH=${CODEX_CLI_PATH} closes the upstream daemon gate"
    desktop_attach_expected=0
else
    ok "CODEX_CLI_PATH not set"
fi
echo

echo "Shared daemon:"
if [ -S "$sock" ]; then
    ok "control socket present: $sock"
else
    bad "control socket missing: $sock"
    desktop_attach_expected=0
fi
codex_bin="$(command -v codex 2>/dev/null || true)"
if [ -z "$codex_bin" ] && [ -x "$codex_home/packages/standalone/current/codex" ]; then
    codex_bin="$codex_home/packages/standalone/current/codex"
fi
if [ -z "$codex_bin" ]; then
    bad "no codex CLI found on PATH or in the managed standalone runtime"
    desktop_attach_expected=0
else
    version_json="$(timeout 5 "$codex_bin" app-server daemon version 2>/dev/null || true)"
    status="$(printf '%s' "$version_json" | sed -n 's/.*"status":"\([^"]*\)".*/\1/p')"
    cli_version="$(printf '%s' "$version_json" | sed -n 's/.*"cliVersion":"\([^"]*\)".*/\1/p')"
    app_server_version="$(printf '%s' "$version_json" | sed -n 's/.*"appServerVersion":"\([^"]*\)".*/\1/p')"
    if [ "$status" = "running" ]; then
        ok "daemon running (appServerVersion=${app_server_version:-?}, cliVersion=${cli_version:-?})"
    else
        bad "daemon status: ${status:-no response} (start with: codex app-server daemon start --enable code_mode_host)"
        desktop_attach_expected=0
    fi
    if [ -n "$cli_version" ] && [ -n "$app_server_version" ] && [ "$cli_version" != "$app_server_version" ]; then
        newest="$(printf '%s\n%s\n' "$cli_version" "$app_server_version" | sort -V | tail -1)"
        if [ "$newest" = "$cli_version" ]; then
            warn "daemon ($app_server_version) is older than the CLI ($cli_version); Desktop's minimum-version check may reject it"
            warn "fix: $codex_home/packages/standalone/current/codex update && codex app-server daemon restart --enable code_mode_host"
        fi
    fi
fi
echo

echo "CLI auto-attach wrapper:"
if [ -z "${HOME:-}" ]; then
    warn "HOME unset; cannot check $wrapper_dest"
elif [ -f "$wrapper_dest" ] && grep -q "codex-shared-local-app-server-wrapper" "$wrapper_dest" 2>/dev/null; then
    ok "wrapper installed at $wrapper_dest"
elif [ -L "$wrapper_dest" ]; then
    warn "$wrapper_dest is a symlink to $(readlink -f "$wrapper_dest" 2>/dev/null || echo '?'); auto-attach wrapper not installed"
elif [ -e "$wrapper_dest" ]; then
    warn "$wrapper_dest exists but is not the shared-attach wrapper; auto-attach disabled"
else
    warn "no wrapper at $wrapper_dest (installed by the prelaunch hook on next Desktop launch)"
fi
if truthy "${CODEX_SHARED_ATTACH_DISABLE:-}"; then
    warn "CODEX_SHARED_ATTACH_DISABLE is set; wrapper passes everything through"
fi
echo

echo "Desktop processes:"
private_child="$(pgrep -af 'app-server' 2>/dev/null | grep -F -- '--analytics-default-enabled' | grep -Fv -- '--listen' || true)"
if [ -n "$private_child" ]; then
    warn "private stdio app-server child running (Desktop is NOT in shared mode):"
    printf '    %s\n' "$private_child"
else
    ok "no private stdio app-server child"
fi
echo

echo "Verdict:"
if [ "$desktop_attach_expected" = "1" ]; then
    ok "Desktop should attach to the shared daemon (websocket over unix) on next cold start"
else
    bad "Desktop will fall back to a private stdio app-server; fix the [FAIL] lines above"
fi
info "CLI: bare 'codex', 'codex \"prompt\"', and 'codex resume' auto-attach when the wrapper is installed and the daemon is healthy; 'codex exec' cannot attach (upstream has no --remote there)"
