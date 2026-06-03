#!/bin/bash

default_rebuild_report_dir() {
    echo "${REBUILD_REPORT_DIR:-$SCRIPT_DIR/dist-next/rebuild}"
}

prepare_rebuild_report_dir() {
    local report_dir="$1"
    case "$report_dir" in
        /*) ;;
        *) report_dir="$PWD/$report_dir" ;;
    esac
    mkdir -p "$report_dir"
    echo "$report_dir"
}

write_rebuild_report_json() {
    local output_path="$1"
    local dmg_path="$2"
    local electron_version="$3"
    local patch_report_path="$4"
    local app_dir="${5:-}"
    local upstream_electron_version="${6:-$electron_version}"

    mkdir -p "$(dirname "$output_path")"
    node - "$output_path" "$dmg_path" "$electron_version" "$patch_report_path" "$app_dir" "$upstream_electron_version" <<'NODE'
const fs = require("node:fs");
const path = require("node:path");

const [outputPath, dmgPath, electronVersion, patchReportPath, appDir, upstreamElectronVersion] = process.argv.slice(2);
const patchReport = fs.existsSync(patchReportPath)
  ? JSON.parse(fs.readFileSync(patchReportPath, "utf8"))
  : { patches: [] };

const report = {
  generatedAt: new Date().toISOString(),
  dmgPath,
  electronVersion,
  upstreamElectronVersion: upstreamElectronVersion || electronVersion,
  appDir: appDir || null,
  mainBundle: patchReport.mainBundle ?? null,
  iconAsset: patchReport.iconAsset ?? null,
  desktopName: patchReport.desktopName ?? null,
  linuxTarget: patchReport.linuxTarget ?? null,
  patches: patchReport.patches ?? [],
  patchReportPath: path.resolve(patchReportPath),
};

fs.writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
NODE
}
