$ErrorActionPreference = 'Stop'
Set-StrictMode -Version 2.0
$Root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
Set-Location $Root

Write-Host 'Cleaning incomplete Node/Electron build files...' -ForegroundColor Cyan
Remove-Item -Recurse -Force "$Root\node_modules" -ErrorAction SilentlyContinue
Remove-Item -Recurse -Force "$Root\.npm-cache" -ErrorAction SilentlyContinue
Remove-Item -Recurse -Force "$Root\release" -ErrorAction SilentlyContinue
Remove-Item -Recurse -Force "$Root\dist" -ErrorAction SilentlyContinue

Write-Host 'Starting a clean full build...' -ForegroundColor Cyan
& "$Root\scripts\build_all.ps1"
