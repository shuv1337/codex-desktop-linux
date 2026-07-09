#!/usr/bin/env bash
# codex-shared-local-app-server-wrapper
#
# PATH wrapper installed at ~/.local/bin/codex by the shared-local-app-server
# Linux feature. Interactive TUI invocations (`codex`, `codex "prompt"`,
# `codex resume ...`) automatically attach to the shared app-server daemon by
# appending `--remote unix://` when the daemon is healthy. Every other
# invocation is passed through to the real codex CLI with argv untouched.
#
# Passthrough is sacred: scripts, `codex exec`, subcommands, flags-first
# invocations, non-TTY use, and explicit `--remote` must behave exactly as if
# this wrapper did not exist.
#
# Kill switch: CODEX_SHARED_ATTACH_DISABLE=1
set -u

wrapper_note() {
    echo "codex: $*" >&2
}

truthy() {
    case "${1:-}" in
        1|true|TRUE|yes|YES|on|ON) return 0 ;;
        *) return 1 ;;
    esac
}

codex_home="${CODEX_HOME:-${HOME:-}/.codex}"

# --- resolve the real codex CLI ----------------------------------------------
# First executable `codex` on PATH that is not this wrapper; fall back to the
# managed standalone runtime.
self_path="$(readlink -f "$0" 2>/dev/null || echo "$0")"
real_codex=""
IFS_SAVE="$IFS"
IFS=':'
for dir in $PATH; do
    IFS="$IFS_SAVE"
    [ -n "$dir" ] || continue
    candidate="$dir/codex"
    [ -x "$candidate" ] && [ -f "$candidate" ] || continue
    resolved="$(readlink -f "$candidate" 2>/dev/null || echo "$candidate")"
    if [ "$resolved" = "$self_path" ]; then
        continue
    fi
    real_codex="$candidate"
    break
done
IFS="$IFS_SAVE"
if [ -z "$real_codex" ] && [ -x "$codex_home/packages/standalone/current/codex" ]; then
    real_codex="$codex_home/packages/standalone/current/codex"
fi
if [ -z "$real_codex" ]; then
    echo "codex: shared-attach wrapper could not find a real codex CLI on PATH" >&2
    exit 127
fi

passthrough() {
    exec "$real_codex" "$@"
}

# --- attach decision -----------------------------------------------------------
if truthy "${CODEX_SHARED_ATTACH_DISABLE:-}"; then
    passthrough "$@"
fi

# Interactive terminals only, unless a test asserts otherwise.
if ! truthy "${CODEX_SHARED_ATTACH_ASSUME_TTY:-}"; then
    if [ ! -t 0 ] || [ ! -t 1 ]; then
        passthrough "$@"
    fi
fi

# Never second-guess an explicit --remote.
for arg in "$@"; do
    case "$arg" in
        --remote|--remote=*) passthrough "$@" ;;
    esac
done

# Known root subcommands of codex CLI 0.144.0. Only the bare TUI, a prompt
# positional, and `resume` support and deserve auto-attach; everything else
# (and any unknown-looking flags-first invocation) passes through untouched.
is_subcommand() {
    case "$1" in
        exec|review|login|logout|mcp|plugin|mcp-server|app-server|remote-control|\
        completion|update|doctor|sandbox|debug|apply|resume|archive|delete|\
        unarchive|fork|cloud|exec-server|features|help)
            return 0 ;;
        *)
            return 1 ;;
    esac
}

attach=""
if [ "$#" -eq 0 ]; then
    attach=1
else
    first="$1"
    case "$first" in
        -*)
            # Flags-first (e.g. `codex -m model "prompt"`): locating the real
            # subcommand would require tracking every value-taking flag, and a
            # wrong guess breaks the command. Pass through.
            attach=""
            ;;
        resume)
            attach=1
            ;;
        *)
            if is_subcommand "$first"; then
                attach=""
            else
                # Positional prompt -> interactive TUI.
                attach=1
            fi
            ;;
    esac
fi
[ -n "$attach" ] || passthrough "$@"

# --- daemon health ---------------------------------------------------------------
sock="$codex_home/app-server-control/app-server-control.sock"
if [ ! -S "$sock" ]; then
    passthrough "$@"
fi
health_timeout="${CODEX_SHARED_ATTACH_HEALTH_TIMEOUT_SECONDS:-2}"
if command -v timeout >/dev/null 2>&1; then
    health_json="$(timeout "$health_timeout" "$real_codex" app-server daemon version 2>/dev/null || true)"
else
    health_json="$("$real_codex" app-server daemon version 2>/dev/null || true)"
fi
case "$health_json" in
    *'"status":"running"'*) ;;
    *) passthrough "$@" ;;
esac

wrapper_note "attached to shared app-server via unix socket (CODEX_SHARED_ATTACH_DISABLE=1 to opt out)"
exec "$real_codex" "$@" --remote unix://
