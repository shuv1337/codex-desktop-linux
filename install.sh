#!/bin/bash
set -Eeuo pipefail

# ============================================================================
# Codex Desktop for Linux — Installer
# Converts the official macOS Codex Desktop app to run on Linux
# ============================================================================

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
INSTALL_DIR="${CODEX_INSTALL_DIR:-$SCRIPT_DIR/codex-app}"
ELECTRON_VERSION="40.0.0"
WORK_DIR="$(mktemp -d)"
ARCH="$(uname -m)"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

info()  { echo -e "${GREEN}[INFO]${NC} $*" >&2; }
warn()  { echo -e "${YELLOW}[WARN]${NC} $*" >&2; }
error() { echo -e "${RED}[ERROR]${NC} $*" >&2; exit 1; }

cleanup() {
    rm -rf "$WORK_DIR"
}
trap cleanup EXIT
trap 'error "Failed at line $LINENO (exit code $?)"' ERR

# ---- Check dependencies ----
check_deps() {
    local missing=()
    for cmd in node npm npx python3 7z curl unzip; do
        command -v "$cmd" &>/dev/null || missing+=("$cmd")
    done
    if [ ${#missing[@]} -ne 0 ]; then
        error "Missing dependencies: ${missing[*]}
Install them first:
  sudo apt install nodejs npm python3 p7zip-full curl unzip build-essential  # Debian/Ubuntu
  sudo dnf install nodejs npm python3 p7zip curl unzip && sudo dnf groupinstall 'Development Tools'  # Fedora
  sudo pacman -S nodejs npm python p7zip curl unzip base-devel  # Arch"
    fi

    NODE_MAJOR=$(node -v | cut -d. -f1 | tr -d v)
    if [ "$NODE_MAJOR" -lt 20 ]; then
        error "Node.js 20+ required (found $(node -v))"
    fi

    if ! command -v make &>/dev/null || ! command -v g++ &>/dev/null; then
        error "Build tools (make, g++) required:
  sudo apt install build-essential   # Debian/Ubuntu
  sudo dnf groupinstall 'Development Tools'  # Fedora
  sudo pacman -S base-devel          # Arch"
    fi

    info "All dependencies found"
}

# ---- Download or find Codex DMG ----
get_dmg() {
    local dmg_dest="$SCRIPT_DIR/Codex.dmg"

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

    7z x -y "$dmg_path" -o"$WORK_DIR/dmg-extract" >&2 || \
        error "Failed to extract DMG"

    local app_dir
    app_dir=$(find "$WORK_DIR/dmg-extract" -maxdepth 3 -name "*.app" -type d | head -1)
    [ -n "$app_dir" ] || error "Could not find .app bundle in DMG"

    info "Found: $(basename "$app_dir")"
    echo "$app_dir"
}

# ---- Build native modules in a clean directory ----
build_native_modules() {
    local app_extracted="$1"

    # Read versions from extracted app
    local bs3_ver npty_ver
    bs3_ver=$(node -p "require('$app_extracted/node_modules/better-sqlite3/package.json').version" 2>/dev/null || echo "")
    npty_ver=$(node -p "require('$app_extracted/node_modules/node-pty/package.json').version" 2>/dev/null || echo "")

    [ -n "$bs3_ver" ] || error "Could not detect better-sqlite3 version"
    [ -n "$npty_ver" ] || error "Could not detect node-pty version"

    info "Native modules: better-sqlite3@$bs3_ver, node-pty@$npty_ver"

    # Build in a CLEAN directory (asar doesn't have full source)
    local build_dir="$WORK_DIR/native-build"
    mkdir -p "$build_dir"
    cd "$build_dir"

    echo '{"private":true}' > package.json

    info "Installing fresh sources from npm..."
    npm install "electron@$ELECTRON_VERSION" --save-dev --ignore-scripts 2>&1 >&2
    npm install "better-sqlite3@$bs3_ver" "node-pty@$npty_ver" --ignore-scripts 2>&1 >&2

    info "Compiling for Electron v$ELECTRON_VERSION (this takes ~1 min)..."
    npx --yes @electron/rebuild -v "$ELECTRON_VERSION" --force 2>&1 >&2

    info "Native modules built successfully"

    # Copy compiled modules back into extracted app
    rm -rf "$app_extracted/node_modules/better-sqlite3"
    rm -rf "$app_extracted/node_modules/node-pty"
    cp -r "$build_dir/node_modules/better-sqlite3" "$app_extracted/node_modules/"
    cp -r "$build_dir/node_modules/node-pty" "$app_extracted/node_modules/"
}

# ---- Patch zoom shortcuts for Linux keyboard layouts ----
patch_zoom_shortcuts() {
    local extracted_root="$1"
    local main_bundle
    main_bundle=$(find "$extracted_root/.vite/build" -maxdepth 1 -type f -name "main-*.js" | head -1)

    if [ -z "${main_bundle:-}" ] || [ ! -f "$main_bundle" ]; then
        warn "Could not locate main bundle for zoom shortcut patch"
        return
    fi

    if python3 - "$main_bundle" <<'PY'
from pathlib import Path
import sys

p = Path(sys.argv[1])
s = p.read_text(errors='ignore')
anchor = 'this.installWebContentsDiagnostics(v),this.registerWindow(v,c,p);'
inject = (
    'v.webContents.on("before-input-event",(C,L)=>{const j=process.platform==="darwin"?L.meta:L.control;if(!j||L.alt)return;'
    'const N=(L.key??"").toLowerCase(),H=(L.code??"").toLowerCase(),O=()=>{try{return v.webContents.getZoomLevel()}catch{return 0}},M=Q=>{try{v.webContents.setZoomLevel(Q)}catch{}};'
    'if(N==="+"||N==="="||N==="add"||H==="numpadadd"){C.preventDefault(),M(O()+1);return}'
    'if(N==="-"||N==="_"||N==="subtract"||H==="numpadsubtract"){C.preventDefault(),M(O()-1);return}'
    '(N==="0"||H==="digit0"||H==="numpad0")&&(C.preventDefault(),M(0))}),'
)

if inject in s:
    print('zoom shortcut patch already applied')
    raise SystemExit(0)

if anchor not in s:
    raise SystemExit('zoom shortcut patch anchor not found')

s = s.replace(anchor, inject + anchor, 1)
p.write_text(s)
print('zoom shortcut patch applied')
PY
    then
        info "Zoom shortcut patch applied"
    else
        warn "Zoom shortcut patch could not be applied (continuing)"
    fi
}

# ---- Patch Open In targets for Linux ----
patch_open_in_targets_linux() {
    local extracted_root="$1"
    local main_bundle
    main_bundle=$(find "$extracted_root/.vite/build" -maxdepth 1 -type f -name "main-*.js" | head -1)

    if [ -z "${main_bundle:-}" ] || [ ! -f "$main_bundle" ]; then
        warn "Could not locate main bundle for Open In patch"
        return
    fi

    if python3 - "$main_bundle" <<'PY'
from pathlib import Path
import sys

p = Path(sys.argv[1])
s = p.read_text(errors='ignore')
start = s.find('let mh=null;const kue=Wp.map')
if start == -1:
    raise SystemExit('open-in patch start anchor not found')
end = s.find('function Rr(', start)
if end == -1:
    raise SystemExit('open-in patch end anchor not found')

if 'const WpLinux=[' in s[start:end + 4000]:
    print('open-in linux patch already applied')
    raise SystemExit(0)

new_block = '''let mh=null;const WpLinux=[{id:"vscode",label:"VS Code",icon:"apps/vscode.png",detect:()=>Hp("code"),args:(t,e)=>qa(t,e)},{id:"vscodeInsiders",label:"VS Code Insiders",icon:"apps/vscode-insiders.png",detect:()=>Hp("code-insiders"),args:(t,e)=>qa(t,e)},{id:"cursor",label:"Cursor",icon:"apps/cursor.png",detect:()=>Hp("cursor"),args:(t,e)=>qa(t,e)},{id:"windsurf",label:"Windsurf",icon:"apps/windsurf.png",detect:()=>Hp("windsurf"),args:(t,e)=>qa(t,e)},{id:"zed",label:"Zed",icon:"apps/zed.png",detect:()=>Hp("zed"),args:(t,e)=>O_(t,e)},{id:"fileManager",label:"File Manager",icon:"apps/finder.png",detect:()=>Hp("xdg-open"),args:t=>[$u(t)]}];function WOL(){return gr?Wp:process.platform==="linux"?WpLinux:[]}const kue=WOL().map(({id:t,label:e,icon:n})=>({id:t,label:e,icon:n}));async function LO(){const t=WOL();if(t.length===0)return[];if(mh)return mh;const e=[];for(const n of t)try{n.detect()&&e.push(n.id)}catch(r){kr().error("Failed to detect open target",{safe:{},sensitive:{id:n.id,error:r}})}return mh=e,e}function eb(t){const e=t.get(Ne.OPEN_IN_TARGET_PREFERENCES)??{},n=UO(e.global)??void 0,r=Object.fromEntries(Object.entries(e.perPath??{}).flatMap(([i,s])=>{const o=UO(s);return o?[[i,o]]:[]}));return{global:n,perPath:Object.keys(r).length>0?r:void 0}}function UO(t){const e=WOL();return t==="finder"?"fileManager":typeof t!="string"?null:e.some(n=>n.id===t)?t:null}function FO(t,e,n){const r=eb(t),i=(e&&r.perPath?.[e])??r.global??null;return i&&n.has(i)?i:n.values().next().value??null}function Pue(t,e){const n=eb(t);return!!((e&&n.perPath?.[e])??n.global??null)}function $O(t,e,n){const r=eb(t);r.global=n,e&&(r.perPath=r.perPath??{},r.perPath[e]=n),t.set(Ne.OPEN_IN_TARGET_PREFERENCES,r)}async function Mue(t,e,n){const r=WOL().find(a=>a.id===t);if(!r)throw new Error(`Unknown open target "${t}"`);const i=r.detect();if(!i)throw new Error(`Open target "${t}" is not available`);if(gr){if(!(xue(t)&&await Nue(t,e))){if(t==="xcode"){await Tue(e,n);return}if(t==="zed"){await Uue(i,e,n);return}await Rr(i,r.args(e,n),{env:r.env?.()})}return}if(process.platform==="linux"){await Rr(i,r.args(e,n),{env:r.env?.()});return}throw new Error("Opening external editors is only supported on macOS and Linux")}'''

s = s[:start] + new_block + s[end:]
p.write_text(s)
print('open-in linux patch applied')
PY
    then
        info "Open In Linux patch applied"
    else
        warn "Open In Linux patch could not be applied (continuing)"
    fi
}

# ---- Extract and patch app.asar ----
patch_asar() {
    local app_dir="$1"
    local resources_dir="$app_dir/Contents/Resources"

    [ -f "$resources_dir/app.asar" ] || error "app.asar not found in $resources_dir"

    info "Extracting app.asar..."
    cd "$WORK_DIR"
    npx --yes asar extract "$resources_dir/app.asar" app-extracted

    # Copy unpacked native modules if they exist
    if [ -d "$resources_dir/app.asar.unpacked" ]; then
        cp -r "$resources_dir/app.asar.unpacked/"* app-extracted/ 2>/dev/null || true
    fi

    # Remove macOS-only modules
    rm -rf "$WORK_DIR/app-extracted/node_modules/sparkle-darwin" 2>/dev/null || true
    find "$WORK_DIR/app-extracted" -name "sparkle.node" -delete 2>/dev/null || true

    # Fix zoom shortcuts (Ctrl +/-/0) across Linux keyboard layouts.
    patch_zoom_shortcuts "$WORK_DIR/app-extracted"

    # Enable Open In targets on Linux (VS Code, Cursor, Windsurf, etc.).
    patch_open_in_targets_linux "$WORK_DIR/app-extracted"

    # Build native modules in clean environment and copy back
    build_native_modules "$WORK_DIR/app-extracted"

    # Repack
    info "Repacking app.asar..."
    cd "$WORK_DIR"
    npx asar pack app-extracted app.asar --unpack "{*.node,*.so,*.dylib}" 2>/dev/null

    info "app.asar patched"
}

# ---- Download Linux Electron ----
download_electron() {
    info "Downloading Electron v${ELECTRON_VERSION} for Linux..."

    local electron_arch
    case "$ARCH" in
        x86_64)  electron_arch="x64" ;;
        aarch64) electron_arch="arm64" ;;
        armv7l)  electron_arch="armv7l" ;;
        *)       error "Unsupported architecture: $ARCH" ;;
    esac

    local url="https://github.com/electron/electron/releases/download/v${ELECTRON_VERSION}/electron-v${ELECTRON_VERSION}-linux-${electron_arch}.zip"

    curl -L --progress-bar -o "$WORK_DIR/electron.zip" "$url"
    mkdir -p "$INSTALL_DIR"
    cd "$INSTALL_DIR"
    unzip -qo "$WORK_DIR/electron.zip"

    info "Electron ready"
}

# ---- Extract webview files ----
extract_webview() {
    local app_dir="$1"
    mkdir -p "$INSTALL_DIR/content/webview"

    # Webview files are inside the extracted asar at webview/
    local asar_extracted="$WORK_DIR/app-extracted"
    if [ -d "$asar_extracted/webview" ]; then
        cp -r "$asar_extracted/webview/"* "$INSTALL_DIR/content/webview/"
        info "Webview files copied"
    else
        warn "Webview directory not found in asar — app may not work"
    fi
}

# ---- Install app.asar ----
install_app() {
    cp "$WORK_DIR/app.asar" "$INSTALL_DIR/resources/"
    if [ -d "$WORK_DIR/app.asar.unpacked" ]; then
        cp -r "$WORK_DIR/app.asar.unpacked" "$INSTALL_DIR/resources/"
    fi
    info "app.asar installed"
}

# ---- Create start script ----
create_start_script() {
    cat > "$INSTALL_DIR/start.sh" << 'SCRIPT'
#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
WEBVIEW_DIR="$SCRIPT_DIR/content/webview"
PORT=5175

resolve_codex_cli() {
    local candidates=()
    local candidate

    if [ -n "${CODEX_CLI_PATH:-}" ]; then
        candidates+=("$CODEX_CLI_PATH")
    fi
    if [ -n "${CUSTOM_CLI_PATH:-}" ]; then
        candidates+=("$CUSTOM_CLI_PATH")
    fi

    # Prefer native codex binary when the shell command is a JS wrapper.
    if command -v codex >/dev/null 2>&1; then
        local codex_cmd real_cmd openai_dir native
        codex_cmd="$(command -v codex)"
        real_cmd="$(readlink -f "$codex_cmd" 2>/dev/null || true)"
        [ -n "$real_cmd" ] || real_cmd="$codex_cmd"

        # Typical layout: .../@openai/codex/bin/codex.js
        openai_dir="$(dirname "$(dirname "$real_cmd")")"
        openai_dir="$(dirname "$openai_dir")"
        if [ -d "$openai_dir" ]; then
            while IFS= read -r native; do
                [ -n "$native" ] && candidates+=("$native")
            done < <(find "$openai_dir" -maxdepth 6 -type f -path "*/codex-linux-*/vendor/*/codex/codex" 2>/dev/null | sort)
        fi

        candidates+=("$codex_cmd")
    fi

    # Common Bun global install fallback.
    local arch pkg triple
    case "$(uname -m)" in
        x86_64)
            pkg="codex-linux-x64"
            triple="x86_64-unknown-linux-musl"
            ;;
        aarch64|arm64)
            pkg="codex-linux-arm64"
            triple="aarch64-unknown-linux-musl"
            ;;
        *)
            pkg=""
            triple=""
            ;;
    esac
    if [ -n "$pkg" ]; then
        candidates+=("$HOME/.bun/install/global/node_modules/@openai/$pkg/vendor/$triple/codex/codex")
    fi

    for candidate in "${candidates[@]}"; do
        [ -n "$candidate" ] || continue
        if [ -d "$candidate" ] && [ -f "$candidate/codex" ]; then
            candidate="$candidate/codex"
        fi
        if [ -f "$candidate" ] && [ -x "$candidate" ]; then
            printf '%s\n' "$candidate"
            return 0
        fi
    done

    return 1
}

is_webview_ready() {
    python3 - "$PORT" <<'PY' >/dev/null 2>&1
import socket
import sys

port = int(sys.argv[1])
for host in ("127.0.0.1", "localhost"):
    try:
        with socket.create_connection((host, port), timeout=0.25):
            sys.exit(0)
    except OSError:
        pass

sys.exit(1)
PY
}

start_webview_server() {
    python3 - "$WEBVIEW_DIR" "$PORT" >"$SCRIPT_DIR/http-server.log" 2>&1 <<'PY' &
import http.server
import os
import socketserver
import sys

webview_dir = sys.argv[1]
port = int(sys.argv[2])
os.chdir(webview_dir)

class Handler(http.server.SimpleHTTPRequestHandler):
    def log_message(self, format, *args):
        return

class ReuseTCPServer(socketserver.TCPServer):
    allow_reuse_address = True

with ReuseTCPServer(("127.0.0.1", port), Handler) as server:
    server.serve_forever()
PY
    HTTP_PID=$!
}

HTTP_PID=""
if [ -d "$WEBVIEW_DIR" ] && [ "$(ls -A "$WEBVIEW_DIR" 2>/dev/null)" ]; then
    cd "$WEBVIEW_DIR"

    # Reuse an already-running server if present (avoid TIME_WAIT bind failures).
    if ! is_webview_ready; then
        start_webview_server
        trap 'if [ -n "${HTTP_PID:-}" ]; then kill "$HTTP_PID" 2>/dev/null || true; fi' EXIT
    fi

    # Wait briefly for server readiness.
    for _ in $(seq 1 40); do
        if is_webview_ready; then
            break
        fi
        sleep 0.1
    done

    if ! is_webview_ready; then
        echo "Warning: webview server on localhost:$PORT did not become ready"
    fi
fi

if ! CODEX_BIN="$(resolve_codex_cli)"; then
    echo "Error: Codex CLI binary not found. Install with: npm i -g @openai/codex"
    echo "Or run with: CODEX_CLI_PATH=/absolute/path/to/codex $0"
    exit 1
fi

export CODEX_CLI_PATH="$CODEX_BIN"

# Help codex find sibling helper binaries (e.g. rg in ../path).
CODEX_BIN_DIR="$(dirname "$CODEX_CLI_PATH")"
if [ -d "$CODEX_BIN_DIR/../path" ]; then
    export PATH="${PATH}:$CODEX_BIN_DIR:$CODEX_BIN_DIR/../path"
else
    export PATH="${PATH}:$CODEX_BIN_DIR"
fi

cd "$SCRIPT_DIR"

ELECTRON_ARGS=(--no-sandbox)
HAS_OZONE_ARG=0
HAS_DISABLE_GPU_ARG=0
HAS_DISABLE_GPU_COMP_ARG=0
for arg in "$@"; do
    if [[ "$arg" == --ozone-platform=* ]]; then
        HAS_OZONE_ARG=1
    fi
    if [[ "$arg" == "--disable-gpu" ]]; then
        HAS_DISABLE_GPU_ARG=1
    fi
    if [[ "$arg" == "--disable-gpu-compositing" ]]; then
        HAS_DISABLE_GPU_COMP_ARG=1
    fi
done

# Wayland can cause oversized/whitespace window issues in this extracted build.
# Default to X11 backend on Wayland sessions, but allow override.
if [ "$HAS_OZONE_ARG" -eq 0 ]; then
    if [ -n "${CODEX_OZONE_PLATFORM:-}" ]; then
        ELECTRON_ARGS+=("--ozone-platform=${CODEX_OZONE_PLATFORM}")
        export ELECTRON_OZONE_PLATFORM_HINT="${CODEX_OZONE_PLATFORM}"
    elif [ -n "${WAYLAND_DISPLAY:-}" ]; then
        ELECTRON_ARGS+=("--ozone-platform=x11")
        export ELECTRON_OZONE_PLATFORM_HINT="x11"
    fi
fi

# Work around X11/XWayland repaint ghosting seen during zoom changes.
# Keep GPU available (full --disable-gpu can break Codex renderer on this build).
# Opt out with: CODEX_DISABLE_GPU_COMPOSITING=0 ./start.sh
if [ "$HAS_DISABLE_GPU_COMP_ARG" -eq 0 ] && [ "${CODEX_DISABLE_GPU_COMPOSITING:-1}" != "0" ]; then
    ELECTRON_ARGS+=("--disable-gpu-compositing")
fi

# Optional hard fallback (off by default): CODEX_DISABLE_GPU=1 ./start.sh
if [ "$HAS_DISABLE_GPU_ARG" -eq 0 ] && [ "${CODEX_DISABLE_GPU:-0}" = "1" ]; then
    ELECTRON_ARGS+=("--disable-gpu")
fi

"$SCRIPT_DIR/electron" "${ELECTRON_ARGS[@]}" "$@"
SCRIPT

    chmod +x "$INSTALL_DIR/start.sh"
    info "Start script created"
}

# ---- Main ----
main() {
    echo "============================================" >&2
    echo "  Codex Desktop for Linux — Installer"       >&2
    echo "============================================" >&2
    echo ""                                             >&2

    check_deps

    local dmg_path=""
    if [ $# -ge 1 ] && [ -f "$1" ]; then
        dmg_path="$(realpath "$1")"
        info "Using provided DMG: $dmg_path"
    else
        dmg_path=$(get_dmg)
    fi

    local app_dir
    app_dir=$(extract_dmg "$dmg_path")

    patch_asar "$app_dir"
    download_electron
    extract_webview "$app_dir"
    install_app
    create_start_script

    if ! command -v codex &>/dev/null; then
        warn "Codex CLI not found. Install it: npm i -g @openai/codex"
    fi

    echo ""                                             >&2
    echo "============================================" >&2
    info "Installation complete!"
    echo "  Run:  $INSTALL_DIR/start.sh"                >&2
    echo "============================================" >&2
}

main "$@"
