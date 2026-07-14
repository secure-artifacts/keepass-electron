$ErrorActionPreference = 'Stop'
Set-StrictMode -Version 2.0
$Root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
Set-Location $Root
. "$Root\scripts\common.ps1"

$Tools = Assert-NodeEnvironment -Root $Root
if (-not (Test-Path "$Root\node_modules\.bin\vite.cmd")) {
    Install-NodeDependencies -Root $Root -NpmCommand $Tools.Npm
}
if (-not (Test-Path "$Root\.venv_backend\Scripts\python.exe")) {
    & "$Root\scripts\build_backend.ps1"
}
$env:KEEPASS_PYTHON = (Resolve-Path "$Root\.venv_backend\Scripts\python.exe").Path
Invoke-Checked -FilePath $Tools.Npm -Arguments @('run', 'dev') -Description 'Starting development mode'
