Set-StrictMode -Version 2.0

function Invoke-Checked {
    param(
        [Parameter(Mandatory = $true)][string]$FilePath,
        [Parameter(Mandatory = $false)][string[]]$Arguments = @(),
        [Parameter(Mandatory = $true)][string]$Description
    )

    Write-Host "--> $Description" -ForegroundColor DarkCyan
    & $FilePath @Arguments
    $Code = $LASTEXITCODE
    if ($Code -ne 0) {
        throw "$Description failed with exit code $Code."
    }
}

function Get-NpmCommand {
    $Npm = Get-Command npm.cmd -ErrorAction SilentlyContinue
    if (-not $Npm) { $Npm = Get-Command npm -ErrorAction SilentlyContinue }
    if (-not $Npm) { throw 'npm was not found. Reinstall Node.js.' }
    return $Npm.Source
}

function Assert-NodeEnvironment {
    param([Parameter(Mandatory = $true)][string]$Root)

    $Node = Get-Command node.exe -ErrorAction SilentlyContinue
    if (-not $Node) { $Node = Get-Command node -ErrorAction SilentlyContinue }
    if (-not $Node) { throw 'Node.js was not found. Install a current Node.js LTS release.' }

    $NodeVersionText = (& $Node.Source -p "process.versions.node").Trim()
    if ($LASTEXITCODE -ne 0) { throw 'Unable to read the Node.js version.' }
    try { $NodeVersion = [version]$NodeVersionText } catch { throw "Invalid Node.js version: $NodeVersionText" }
    if ($NodeVersion -lt [version]'20.19.0') {
        throw "Node.js $NodeVersionText is too old. Install Node.js 22 LTS or newer."
    }

    $NpmCommand = Get-NpmCommand
    $NpmVersionText = (& $NpmCommand --version).Trim()
    if ($LASTEXITCODE -ne 0) { throw 'Unable to read the npm version.' }

    Write-Host "Node.js: $NodeVersionText" -ForegroundColor Green
    Write-Host "npm: $NpmVersionText" -ForegroundColor Green

    $LockPath = Join-Path $Root 'package-lock.json'
    if (Test-Path $LockPath) {
        $LockText = Get-Content $LockPath -Raw
        if ($LockText -match 'applied-caas-gateway|internal\.api\.openai\.org') {
            throw 'package-lock.json contains a private registry URL. Replace it with the fixed package-lock.json from this release.'
        }
    }

    return @{
        Node = $Node.Source
        Npm = $NpmCommand
        NodeVersion = $NodeVersionText
        NpmVersion = $NpmVersionText
    }
}

function Install-NodeDependencies {
    param(
        [Parameter(Mandatory = $true)][string]$Root,
        [Parameter(Mandatory = $true)][string]$NpmCommand
    )

    $env:npm_config_registry = 'https://registry.npmjs.org/'
    $env:npm_config_cache = Join-Path $Root '.npm-cache'
    $env:npm_config_audit = 'false'
    $env:npm_config_fund = 'false'
    $env:npm_config_progress = 'false'
    $env:npm_config_update_notifier = 'false'

    Remove-Item -Recurse -Force (Join-Path $Root 'node_modules') -ErrorAction SilentlyContinue
    Remove-Item -Recurse -Force $env:npm_config_cache -ErrorAction SilentlyContinue
    New-Item -ItemType Directory -Force -Path $env:npm_config_cache | Out-Null

    $InstallArgs = @(
        'install',
        '--include=dev',
        '--no-audit',
        '--no-fund',
        '--registry=https://registry.npmjs.org/'
    )

    Write-Host '--> Installing Node dependencies' -ForegroundColor DarkCyan
    & $NpmCommand @InstallArgs
    $InstallCode = $LASTEXITCODE

    if ($InstallCode -ne 0) {
        Write-Host ''
        Write-Warning "The first npm install attempt failed with exit code $InstallCode. Retrying without package-lock and with a fresh project cache."
        Remove-Item -Recurse -Force (Join-Path $Root 'node_modules') -ErrorAction SilentlyContinue
        Remove-Item -Recurse -Force $env:npm_config_cache -ErrorAction SilentlyContinue
        New-Item -ItemType Directory -Force -Path $env:npm_config_cache | Out-Null

        & $NpmCommand install --include=dev --no-audit --no-fund --package-lock=false --registry=https://registry.npmjs.org/
        $RetryCode = $LASTEXITCODE
        if ($RetryCode -ne 0) {
            throw "Installing Node dependencies failed twice. Last exit code: $RetryCode."
        }
    }

    $Vite = Join-Path $Root 'node_modules\.bin\vite.cmd'
    $Builder = Join-Path $Root 'node_modules\.bin\electron-builder.cmd'
    if (-not (Test-Path $Vite)) { throw 'Vite was not installed. node_modules\.bin\vite.cmd is missing.' }
    if (-not (Test-Path $Builder)) { throw 'electron-builder was not installed. node_modules\.bin\electron-builder.cmd is missing.' }
}

function Build-ReactFrontend {
    param([Parameter(Mandatory = $true)][string]$Root)

    $Vite = Join-Path $Root 'node_modules\.bin\vite.cmd'
    Remove-Item -Recurse -Force (Join-Path $Root 'dist') -ErrorAction SilentlyContinue
    Invoke-Checked -FilePath $Vite -Arguments @('build') -Description 'Building the React frontend'

    $Index = Join-Path $Root 'dist\index.html'
    if (-not (Test-Path $Index)) { throw 'React build failed: dist\index.html was not created.' }
}

function Build-ElectronTargets {
    param(
        [Parameter(Mandatory = $true)][string]$Root,
        [Parameter(Mandatory = $true)][string[]]$Targets
    )

    $Builder = Join-Path $Root 'node_modules\.bin\electron-builder.cmd'
    $Arguments = @('--win') + $Targets + @('--x64', '--publish', 'never')
    Invoke-Checked -FilePath $Builder -Arguments $Arguments -Description "Building Electron target(s): $($Targets -join ', ')"
}
