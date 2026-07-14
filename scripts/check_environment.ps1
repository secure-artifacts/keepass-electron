$ErrorActionPreference = 'Continue'
$Root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
Set-Location $Root

Write-Host '=== KeePass Studio build diagnostics ===' -ForegroundColor Cyan
Write-Host "Project: $Root"
Write-Host "icon.ico: $(Test-Path "$Root\build\icon.ico")"
Write-Host "icon.png: $(Test-Path "$Root\build\icon.png")"
Write-Host "backend source: $(Test-Path "$Root\backend\backend_server.py")"
Write-Host "backend helper: $(Test-Path "$Root\backend-dist\keepass_backend.exe")"
Write-Host "React output: $(Test-Path "$Root\dist\index.html")"
Write-Host "release folder: $(Test-Path "$Root\release")"

if (Get-Command node -ErrorAction SilentlyContinue) {
  Write-Host "Node.js: $((& node --version).Trim())" -ForegroundColor Green
} else {
  Write-Host 'Node.js: NOT FOUND' -ForegroundColor Red
}
if (Get-Command npm -ErrorAction SilentlyContinue) {
  Write-Host "npm: $((& npm --version).Trim())" -ForegroundColor Green
} else {
  Write-Host 'npm: NOT FOUND' -ForegroundColor Red
}
if (Get-Command py -ErrorAction SilentlyContinue) {
  Write-Host "Python launcher: $((& py --version).Trim())" -ForegroundColor Green
} elseif (Get-Command python -ErrorAction SilentlyContinue) {
  Write-Host "Python: $((& python --version).Trim())" -ForegroundColor Green
} else {
  Write-Host 'Python: NOT FOUND' -ForegroundColor Red
}

if (Test-Path "$Root\release") {
  Write-Host 'Release files:' -ForegroundColor Cyan
  Get-ChildItem "$Root\release" -File | Select-Object Name, Length, LastWriteTime | Format-Table -AutoSize
}
Write-Host ''
Write-Host 'NOTE: backend-dist\keepass_backend.exe is only a helper. It is not the desktop application.' -ForegroundColor Yellow
Write-Host 'The final desktop EXE must be under release\.' -ForegroundColor Yellow
