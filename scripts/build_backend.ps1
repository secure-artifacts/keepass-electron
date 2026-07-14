$ErrorActionPreference = 'Stop'
Set-StrictMode -Version 2.0
$Root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
Set-Location $Root
. "$Root\scripts\common.ps1"

Write-Host '[Backend 1/5] Checking application icons...'
if (-not (Test-Path "$Root\build\icon.ico")) { throw 'Missing build\icon.ico' }
if (-not (Test-Path "$Root\build\icon.png")) { throw 'Missing build\icon.png' }

Write-Host '[Backend 2/5] Preparing Python environment...'
if (-not (Test-Path "$Root\.venv_backend\Scripts\python.exe")) {
    $Py = Get-Command py.exe -ErrorAction SilentlyContinue
    if (-not $Py) { $Py = Get-Command py -ErrorAction SilentlyContinue }
    if ($Py) {
        Invoke-Checked -FilePath $Py.Source -Arguments @('-3.11', '-m', 'venv', "$Root\.venv_backend") -Description 'Creating Python 3.11 virtual environment'
    } else {
        $PythonCommand = Get-Command python.exe -ErrorAction SilentlyContinue
        if (-not $PythonCommand) { $PythonCommand = Get-Command python -ErrorAction SilentlyContinue }
        if (-not $PythonCommand) { throw 'Python 3.11 or newer was not found.' }
        Invoke-Checked -FilePath $PythonCommand.Source -Arguments @('-m', 'venv', "$Root\.venv_backend") -Description 'Creating Python virtual environment'
    }
}
$Python = "$Root\.venv_backend\Scripts\python.exe"
if (-not (Test-Path $Python)) { throw 'Python virtual environment creation failed.' }

Write-Host '[Backend 3/5] Installing Python dependencies...'
Invoke-Checked -FilePath $Python -Arguments @('-m', 'pip', 'install', '--upgrade', 'pip', 'setuptools', 'wheel') -Description 'Updating Python packaging tools'
Invoke-Checked -FilePath $Python -Arguments @('-m', 'pip', 'install', '-r', "$Root\backend\requirements.txt") -Description 'Installing Python dependencies'

Write-Host '[Backend 4/5] Running Unicode transport tests...'
Push-Location "$Root\backend"
try {
    Invoke-Checked -FilePath $Python -Arguments @('-m', 'unittest', '-v', 'test_unicode_transport.py') -Description 'Testing Unicode IPC repair'
} finally {
    Pop-Location
}

Write-Host '[Backend 5/5] Building Python backend helper...'
Remove-Item -Recurse -Force "$Root\backend-dist", "$Root\backend-build" -ErrorAction SilentlyContinue
Push-Location "$Root\backend"
try {
    Invoke-Checked -FilePath $Python -Arguments @(
        '-m', 'PyInstaller', '--noconfirm', '--clean',
        '--distpath', "$Root\backend-dist",
        '--workpath', "$Root\backend-build",
        'keepass_backend.spec'
    ) -Description 'Building the Python backend helper'
} finally {
    Pop-Location
}

$BackendExe = "$Root\backend-dist\keepass_backend.exe"
if (-not (Test-Path $BackendExe)) { throw 'Python backend build failed.' }
Write-Host "Backend helper ready: $BackendExe" -ForegroundColor Green
