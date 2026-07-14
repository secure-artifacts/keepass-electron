$ErrorActionPreference = 'Stop'
Set-StrictMode -Version 2.0
$Root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
Set-Location $Root
. "$Root\scripts\common.ps1"

Write-Host '[1/6] Checking Node.js, npm and registry settings...'
$Tools = Assert-NodeEnvironment -Root $Root
Write-Host '[2/6] Installing Node dependencies...'
Install-NodeDependencies -Root $Root -NpmCommand $Tools.Npm
Write-Host '[3/6] Building React frontend...'
Build-ReactFrontend -Root $Root
Write-Host '[4/6] Building Python backend helper...'
& "$Root\scripts\build_backend.ps1"
if ($LASTEXITCODE -ne 0) { throw "Python backend build failed with exit code $LASTEXITCODE." }
Write-Host '[5/6] Building portable Electron EXE...'
Remove-Item -Recurse -Force "$Root\release" -ErrorAction SilentlyContinue
Build-ElectronTargets -Root $Root -Targets @('portable')
Write-Host '[6/6] Verifying output...'
$Portable = Get-ChildItem "$Root\release\KeePassStudio-Portable-*-x64.exe" -ErrorAction SilentlyContinue | Select-Object -First 1
if (-not $Portable) { throw 'Portable Electron EXE was not created.' }
Write-Host ''
Write-Host 'BUILD SUCCESS' -ForegroundColor Green
Write-Host "Portable EXE: $($Portable.FullName)" -ForegroundColor Green
Start-Process explorer.exe -ArgumentList "/select,`"$($Portable.FullName)`""
