# Zer0Vuln Agent - PyInstaller build script (Windows)
#
# Builds Zer0Vuln/main.py into a single main.exe that can be shipped via
# /api/agent/download/windows and consumed by the token-based installer.
#
# Usage:
#   .\build_agent.ps1
#
# Output:
#   Zer0Vuln\main.exe   (one-file bundle)
#
param(
    [switch]$NoClean
)

$ErrorActionPreference = "Stop"
$ScriptDir = Split-Path -Parent $PSCommandPath
Set-Location $ScriptDir

Write-Host "[*] Zer0Vuln Agent Builder (Windows / PyInstaller)" -ForegroundColor Cyan
Write-Host "[*] Working dir: $ScriptDir"

if (-not (Get-Command python -ErrorAction SilentlyContinue)) {
    Write-Host "[!] Python not found on PATH. Install Python 3.10+ first." -ForegroundColor Red
    exit 1
}

Write-Host "[*] Ensuring pip dependencies..." -ForegroundColor Yellow
python -m pip install --upgrade pip | Out-Null
python -m pip install -r requirements.txt
python -m pip install pyinstaller

if (-not $NoClean) {
    Write-Host "[*] Cleaning previous build artifacts..." -ForegroundColor Yellow
    Remove-Item -Recurse -Force build -ErrorAction SilentlyContinue
    Remove-Item -Recurse -Force dist -ErrorAction SilentlyContinue
    Remove-Item -Force main.spec -ErrorAction SilentlyContinue
}

Write-Host "[*] Running PyInstaller..." -ForegroundColor Yellow
# NOTE: absolute paths for --add-data so PyInstaller resolves them against
# the CWD (not the specpath). The `dest;src` separator on Windows is `;`.
$confPath    = Join-Path $ScriptDir "conf"
$modulesPath = Join-Path $ScriptDir "modules"

$addData = @(
    "${confPath};conf",
    "${modulesPath};modules"
)
$hiddenImports = @(
    # third-party
    "cryptography",
    "requests",
    "psutil",
    "watchdog",
    "docker",
    "yaml",
    "psycopg2",
    "pandas",
    # screen-streaming stack
    "mss",
    "mss.windows",
    "PIL",
    "PIL.Image",
    "PIL.JpegImagePlugin",
    # win32 service helpers
    "win32serviceutil",
    "win32service",
    "win32event",
    "servicemanager",
    # in-tree agent modules — PyInstaller's static analyser usually catches
    # these from top-level imports in main.py, but listing them explicitly
    # makes the bundle robust against late/conditional imports.
    "modules.find_vulns.info_collector",
    "modules.find_vulns.find_vuln",
    "modules.alert.alert",
    "modules.portscanner.portscanner",
    "modules.edr_enforcer",
    "modules.docker_monitor.docker_monitor",
    "modules.fim",
    "modules.inventory",
    "modules.lateral_movement",
    "modules.log_extractor.log_extractor",
    "modules.check_permissions.check_permissions",
    "modules.resource_checker.resource_checker",
    "modules.resource_checker.disks",
    "modules.soar.soar",
    "modules.soar.vnc_manager",
    "modules.enc_db",
    "modules.db"
)

# --collect-all pulls data files + hidden submodules + binaries. Required for
# sanic because tracerite ships style.css as package data that PyInstaller's
# default module scan skips (results in FileNotFoundError on startup). Pillow
# and mss bundle native libs the static scanner doesn't reach.
$collectAll = @(
    "sanic",
    "sanic_cors",
    "sanic_routing",
    "tracerite",
    "html5tagger",
    "PIL",
    "mss"
)

$piArgs = @(
    "--onefile",
    "--name","main",
    "--console",
    "--distpath",$ScriptDir,
    "--workpath",(Join-Path $ScriptDir "build"),
    "--specpath",$ScriptDir,
    "--noconfirm"
)
foreach ($d in $addData)    { $piArgs += @("--add-data", $d) }
foreach ($h in $hiddenImports) { $piArgs += @("--hidden-import", $h) }
foreach ($c in $collectAll)    { $piArgs += @("--collect-all", $c) }
$piArgs += (Join-Path $ScriptDir "main.py")

python -m PyInstaller @piArgs

if (Test-Path "main.exe") {
    $size = (Get-Item "main.exe").Length / 1MB
    Write-Host ("[+] Built main.exe  ({0:N1} MB)" -f $size) -ForegroundColor Green
    Write-Host "    Ship it via /api/agent/download/windows (restart the server container to pick it up)."
} else {
    Write-Host "[!] Build failed: main.exe not produced. Check PyInstaller output above." -ForegroundColor Red
    exit 1
}
