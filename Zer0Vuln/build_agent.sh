#!/usr/bin/env bash
# Zer0Vuln Agent — PyInstaller build script (Linux)
#
# Builds Zer0Vuln/main.py into a single 'main' binary that can be shipped via
# /api/agent/download/linux and consumed by the token-based installer.
#
# Usage:
#   ./build_agent.sh
#
# Output:
#   Zer0Vuln/main  (one-file bundle)

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

echo "[*] Zer0Vuln Agent Builder (Linux / PyInstaller)"
echo "[*] Working dir: $SCRIPT_DIR"

if ! command -v python3 >/dev/null 2>&1; then
    echo "[!] python3 not found. Install Python 3.10+ first."
    exit 1
fi

echo "[*] Ensuring pip dependencies..."
python3 -m pip install --upgrade pip >/dev/null
python3 -m pip install -r requirements.txt
python3 -m pip install pyinstaller

echo "[*] Cleaning previous build artifacts..."
rm -rf "$SCRIPT_DIR/build" "$SCRIPT_DIR/dist" "$SCRIPT_DIR/main.spec"

echo "[*] Running PyInstaller..."
# NOTE: absolute paths for --add-data so PyInstaller resolves them against
# the CWD (not the specpath). Linux separator is `:`.
python3 -m PyInstaller \
    --onefile \
    --name main \
    --console \
    --distpath "$SCRIPT_DIR" \
    --workpath "$SCRIPT_DIR/build" \
    --specpath "$SCRIPT_DIR" \
    --noconfirm \
    --add-data "$SCRIPT_DIR/conf:conf" \
    --add-data "$SCRIPT_DIR/modules:modules" \
    --collect-all sanic \
    --collect-all sanic_cors \
    --collect-all sanic_routing \
    --collect-all tracerite \
    --collect-all html5tagger \
    --hidden-import cryptography \
    --hidden-import requests \
    --hidden-import psutil \
    --hidden-import watchdog \
    --hidden-import docker \
    --hidden-import yaml \
    "$SCRIPT_DIR/main.py"

if [ -f "main" ]; then
    size=$(du -h main | cut -f1)
    echo "[+] Built main ($size)"
    echo "    Ship it via /api/agent/download/linux (restart the server container to pick it up)."
else
    echo "[!] Build failed: 'main' not produced."
    exit 1
fi
