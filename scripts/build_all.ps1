$ErrorActionPreference = 'Stop'
Set-StrictMode -Version 2.0
$Root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
Set-Location $Root
. "$Root\scripts\common.ps1"

Write-Host '[1/7] Checking Node.js, npm and registry settings...'
$Tools = Assert-NodeEnvironment -Root $Root

Write-Host '[2/7] Installing Node dependencies with a project-local cache...'
Install-NodeDependencies -Root $Root -NpmCommand $Tools.Npm

Write-Host '[3/7] Building React frontend...'
Build-ReactFrontend -Root $Root

Write-Host '[4/7] Building Python backend helper...'
& "$Root\scripts\build_backend.ps1"
if ($LASTEXITCODE -ne 0) { throw "Python backend build failed with exit code $LASTEXITCODE." }

Write-Host '[5/7] Cleaning previous Electron release...'
Remove-Item -Recurse -Force "$Root\release" -ErrorAction SilentlyContinue

Write-Host '[6/7] Building portable and installer EXE files...'
Build-ElectronTargets -Root $Root -Targets @('portable', 'nsis')

Write-Host '[7/7] Verifying generated files...'
$Portable = Get-ChildItem "$Root\release\KeePassStudio-Portable-*-x64.exe" -ErrorAction SilentlyContinue | Select-Object -First 1
$Installer = Get-ChildItem "$Root\release\KeePassStudio-Setup-*-x64.exe" -ErrorAction SilentlyContinue | Select-Object -First 1
if (-not $Portable) { throw 'Portable Electron EXE was not created.' }
if (-not $Installer) { throw 'Installer Electron EXE was not created.' }

Write-Host ''
Write-Host 'BUILD SUCCESS' -ForegroundColor Green
Write-Host "Portable: $($Portable.FullName)" -ForegroundColor Green
Write-Host "Installer: $($Installer.FullName)" -ForegroundColor Green
Start-Process explorer.exe -ArgumentList "`"$Root\release`""
