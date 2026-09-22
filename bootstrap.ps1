param(
  [string]$Project = '',
  [switch]$PrepareOnly
)
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version 3.0
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

$Snapshot = '0e47081febc0f6c3732aa96df8c11750fe94ea7f'
$NodeVersion = '24.18.0'
$NodeArchiveName = 'node-v24.18.0-win-x64.zip'
$NodeUrl = "https://nodejs.org/dist/v$NodeVersion/$NodeArchiveName"
$NodeSha256 = '0ae68406b42d7725661da979b1403ec9926da205c6770827f33aac9d8f26e821'

function Ensure-Directory([string]$Path) {
  if (-not (Test-Path -LiteralPath $Path)) {
    New-Item -ItemType Directory -Force -Path $Path | Out-Null
  }
}
function Assert-Sha256([string]$Path, [string]$Expected) {
  $Actual = (Get-FileHash -LiteralPath $Path -Algorithm SHA256).Hash.ToLowerInvariant()
  if ($Actual -ne $Expected.ToLowerInvariant()) {
    throw "SHA256 mismatch for $Path. Expected $Expected, got $Actual."
  }
}
function Get-VerifiedArchive([string]$Url,[string]$Destination,[string]$Sha256) {
  if (Test-Path -LiteralPath $Destination) {
    try { Assert-Sha256 $Destination $Sha256; return } catch { Remove-Item -LiteralPath $Destination -Force }
  }
  $Tmp = "$Destination.part"
  Remove-Item -LiteralPath $Tmp -Force -ErrorAction SilentlyContinue
  Write-Host "Downloading verified Node $NodeVersion runtime..."
  Invoke-WebRequest -UseBasicParsing -Uri $Url -OutFile $Tmp
  Assert-Sha256 $Tmp $Sha256
  Move-Item -LiteralPath $Tmp -Destination $Destination -Force
}
function Resolve-InspectionProject([string]$Requested) {
  if ($Requested.Trim()) {
    if (-not (Test-Path -LiteralPath $Requested -PathType Container)) { throw "Project folder not found: $Requested" }
    return (Resolve-Path -LiteralPath $Requested).Path
  }
  try {
    Add-Type -AssemblyName System.Windows.Forms
    $Dialog = New-Object System.Windows.Forms.FolderBrowserDialog
    $Dialog.Description = 'Choose the project folder TALOS CLI will inspect'
    $Dialog.ShowNewFolderButton = $true
    if ($Dialog.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) {
      return (Resolve-Path -LiteralPath $Dialog.SelectedPath).Path
    }
  } catch {
    Write-Warning "Folder picker unavailable: $($_.Exception.Message)"
  }
  throw 'No project folder selected. Drag a project folder onto START-TALOS-CLI.cmd or run talos.cmd from a terminal inside a project.'
}
function Ensure-NpmTree([string]$Dir,[bool]$ProductionOnly) {
  $Lock = Join-Path $Dir 'package-lock.json'
  $Package = Join-Path $Dir 'package.json'
  if (-not (Test-Path -LiteralPath $Lock) -or -not (Test-Path -LiteralPath $Package)) { throw "Missing npm manifest/lockfile in $Dir" }
  $Hash = (Get-FileHash -LiteralPath $Lock -Algorithm SHA256).Hash.ToLowerInvariant()
  $Marker = Join-Path $Dir ".talos-inspection-npm-$Hash"
  $Modules = Join-Path $Dir 'node_modules'
  if ((Test-Path -LiteralPath $Marker) -and (Test-Path -LiteralPath $Modules)) { return }
  Get-ChildItem -LiteralPath $Dir -Filter '.talos-inspection-npm-*' -Force -ErrorAction SilentlyContinue | Remove-Item -Force -ErrorAction SilentlyContinue
  Write-Host "Installing pinned dependencies in $Dir ..."
  Push-Location $Dir
  try {
    if ($ProductionOnly) {
      & $script:NpmCmd ci --omit=dev --no-audit --no-fund
    } else {
      & $script:NpmCmd ci --no-audit --no-fund
    }
    if ($LASTEXITCODE -ne 0) { throw "npm ci failed in $Dir with exit code $LASTEXITCODE" }
  } finally { Pop-Location }
  Set-Content -LiteralPath $Marker -Value $Hash -Encoding Ascii
}

if ($env:OS -ne 'Windows_NT' -or -not [Environment]::Is64BitOperatingSystem) {
  throw 'This owner-inspection package requires 64-bit Windows.'
}

$Root = $PSScriptRoot
$AppRoot = Join-Path $Root 'app'
$HarnessRoot = Join-Path $AppRoot 'vendor\harness-ui'
$ContextRoot = Join-Path $AppRoot 'vendor\context-engine'
foreach ($Required in @(
  (Join-Path $AppRoot 'src\main.ts'),
  (Join-Path $HarnessRoot 'src\kernel\talosHarness.mjs'),
  (Join-Path $ContextRoot 'src\engine.mjs')
)) {
  if (-not (Test-Path -LiteralPath $Required)) { throw "Inspection payload incomplete: $Required" }
}

$Project = Resolve-InspectionProject $Project
$CacheRoot = Join-Path $env:LOCALAPPDATA 'TALOS-CLI\inspection-bootstrap'
$Downloads = Join-Path $CacheRoot 'downloads'
Ensure-Directory $Downloads
$NodeArchive = Join-Path $Downloads $NodeArchiveName
Get-VerifiedArchive $NodeUrl $NodeArchive $NodeSha256

$NodeExtract = Join-Path $CacheRoot "node-$NodeVersion"
$NodeMarker = Join-Path $NodeExtract '.verified'
if (-not (Test-Path -LiteralPath $NodeMarker)) {
  Remove-Item -LiteralPath $NodeExtract -Recurse -Force -ErrorAction SilentlyContinue
  Ensure-Directory $NodeExtract
  Expand-Archive -LiteralPath $NodeArchive -DestinationPath $NodeExtract -Force
  Set-Content -LiteralPath $NodeMarker -Value $NodeSha256 -Encoding Ascii
}
$NodeRoot = Join-Path $NodeExtract "node-v$NodeVersion-win-x64"
$NodeExe = Join-Path $NodeRoot 'node.exe'
$script:NpmCmd = Join-Path $NodeRoot 'npm.cmd'
if (-not (Test-Path -LiteralPath $NodeExe) -or -not (Test-Path -LiteralPath $script:NpmCmd)) {
  throw 'Verified Node archive did not contain node.exe/npm.cmd.'
}

Ensure-NpmTree $AppRoot $false
Ensure-NpmTree $HarnessRoot $true
Ensure-NpmTree $ContextRoot $true

$BuildMarker = Join-Path $AppRoot ".talos-inspection-build-$Snapshot"
$BuildDebtMarker = Join-Path $AppRoot ".talos-inspection-typescript-diagnostics-$Snapshot"
$Entry = Join-Path $AppRoot 'dist\main.js'
if (-not (Test-Path -LiteralPath $BuildMarker) -or -not (Test-Path -LiteralPath $Entry)) {
  Write-Host "Building TALOS CLI inspection snapshot $Snapshot ..."
  Push-Location $AppRoot
  try {
    & $script:NpmCmd run build
    $BuildExit = $LASTEXITCODE
  } finally { Pop-Location }
  if ($BuildExit -ne 0) {
    if (-not (Test-Path -LiteralPath $Entry)) {
      throw "TALOS CLI build reported diagnostics and did not emit $Entry (exit code $BuildExit)"
    }
    Write-Warning "TypeScript reported diagnostics (exit code $BuildExit). The compiler still emitted the inspection JS. This is owner-inspection evidence and MUST NOT be treated as a green typecheck/build gate."
    Set-Content -LiteralPath $BuildDebtMarker -Value "tsc-exit=$BuildExit" -Encoding Ascii
  } else {
    Remove-Item -LiteralPath $BuildDebtMarker -Force -ErrorAction SilentlyContinue
  }
  Set-Content -LiteralPath $BuildMarker -Value $Snapshot -Encoding Ascii
}

$env:TALOS_CLI_RUNTIME_ROOT = Join-Path $AppRoot 'vendor'
$env:TALOS_CLI_INSPECTION_SNAPSHOT = $Snapshot
$env:NODE_ENV = 'production'

Write-Host ''
Write-Host 'TALOS CLI OWNER INSPECTION'
Write-Host "Source HEAD : $Snapshot"
Write-Host "Workspace   : $Project"
Write-Host "Node        : $(& $NodeExe --version)"
Write-Host ''
Write-Host 'This is an inspection build, not a signed release.'
if (Test-Path -LiteralPath $BuildDebtMarker) {
  Write-Warning 'This snapshot has executable TypeScript diagnostics. The emitted JS is being used only so the owner can inspect runtime behavior before engineering continues.'
}
Write-Host ''

if ($PrepareOnly) {
  Write-Host 'Prepare-only validation: checking CLI version entrypoint...'
  Push-Location $Project
  try {
    & $NodeExe $Entry --version
    if ($LASTEXITCODE -ne 0) { throw "TALOS CLI --version failed with exit code $LASTEXITCODE" }
  } finally { Pop-Location }
  Write-Host 'Prepare-only validation completed successfully.'
  exit 0
}

Push-Location $Project
try {
  & $NodeExe $Entry --project $Project
  exit $LASTEXITCODE
} finally { Pop-Location }
