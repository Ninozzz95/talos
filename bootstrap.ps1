param(
  [string]$Project = '',
  [switch]$PrepareOnly
)
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version 3.0
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

$Snapshot = '9a0918a3d85895a854a0666cdfbf6132bf2fe8a8'
$NodeVersion = '24.18.0'
$NodeArchiveName = 'node-v24.18.0-win-x64.zip'
$NodeUrl = "https://nodejs.org/dist/v$NodeVersion/$NodeArchiveName"
$NodeSha256 = '0ae68406b42d7725661da979b1403ec9926da205c6770827f33aac9d8f26e821'
$script:FinalExitCode = 0
$script:TranscriptStarted = $false
$script:TranscriptPath = $null

function Ensure-Directory([string]$Path) {
  if (-not (Test-Path -LiteralPath $Path)) {
    New-Item -ItemType Directory -Force -Path $Path | Out-Null
  }
}
function Normalize-ComparePath([string]$Path) {
  $Full = [System.IO.Path]::GetFullPath($Path)
  $PathRoot = [System.IO.Path]::GetPathRoot($Full)
  if ([string]::Equals($Full,$PathRoot,[System.StringComparison]::OrdinalIgnoreCase)) { return $Full }
  return $Full.TrimEnd([char[]]@('\','/'))
}
function Normalize-ExistingDirectory([string]$Path) {
  if (-not (Test-Path -LiteralPath $Path -PathType Container)) { throw "Directory not found: $Path" }
  $Resolved = (Resolve-Path -LiteralPath $Path).Path
  return Normalize-ComparePath $Resolved
}
function Test-PathContains([string]$Parent,[string]$Child) {
  $P = Normalize-ComparePath $Parent
  $C = Normalize-ComparePath $Child
  if ([string]::Equals($P,$C,[System.StringComparison]::OrdinalIgnoreCase)) { return $true }
  $Prefix = $P
  if (-not $Prefix.EndsWith([string][System.IO.Path]::DirectorySeparatorChar)) { $Prefix += [System.IO.Path]::DirectorySeparatorChar }
  return $C.StartsWith($Prefix,[System.StringComparison]::OrdinalIgnoreCase)
}
function Assert-NoInspectionOverlap([string]$Candidate,[string]$InspectionRoot,[string]$ApplicationRoot,[string]$Phase) {
  $ProjectPath = Normalize-ExistingDirectory $Candidate
  $RootPath = Normalize-ExistingDirectory $InspectionRoot
  $AppPath = Normalize-ExistingDirectory $ApplicationRoot
  $Overlap = (Test-PathContains $RootPath $ProjectPath) -or (Test-PathContains $ProjectPath $RootPath) -or (Test-PathContains $AppPath $ProjectPath) -or (Test-PathContains $ProjectPath $AppPath)
  if ($Overlap) {
    throw "INSPECTION_PROJECT_OVERLAP [$Phase]: project '$ProjectPath' overlaps inspection package '$RootPath'. Choose a separate disposable project folder outside the extracted TALOS inspection package."
  }
  return $ProjectPath
}
function Assert-Sha256([string]$Path, [string]$Expected) {
  $Actual = (Get-FileHash -LiteralPath $Path -Algorithm SHA256).Hash.ToLowerInvariant()
  if ($Actual -ne $Expected.ToLowerInvariant()) { throw "SHA256 mismatch for $Path. Expected $Expected, got $Actual." }
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
  if ($Requested.Trim()) { return Normalize-ExistingDirectory $Requested }
  try {
    Add-Type -AssemblyName System.Windows.Forms
    $Dialog = New-Object System.Windows.Forms.FolderBrowserDialog
    $Dialog.Description = 'Choose a SEPARATE disposable/test project folder (not this TALOS inspection package)'
    $Dialog.ShowNewFolderButton = $true
    if ($Dialog.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) { return Normalize-ExistingDirectory $Dialog.SelectedPath }
  } catch { Write-Warning "Folder picker unavailable: $($_.Exception.Message)" }
  throw 'No project folder selected. Drag a separate project folder onto START-TALOS-CLI.cmd or run talos.cmd from a terminal inside that separate project.'
}
function Invoke-Checked([string]$File,[string[]]$Arguments,[string]$WorkingDirectory,[string]$Label) {
  Write-Host ""
  Write-Host ">>> $Label"
  Write-Host "cwd=$WorkingDirectory"
  Write-Host "file=$File"
  Write-Host "args=$($Arguments -join ' ')"
  Push-Location $WorkingDirectory
  try {
    & $File @Arguments
    $Code = $LASTEXITCODE
  } finally { Pop-Location }
  Write-Host "exit=$Code"
  if ($Code -ne 0) {
    $Failure = New-Object System.Exception("$Label failed with exit code $Code")
    $Failure.Data['ExitCode'] = $Code
    throw $Failure
  }
}
function Ensure-NpmTree([string]$Dir,[bool]$ProductionOnly) {
  $Lock = Join-Path $Dir 'package-lock.json'
  $Package = Join-Path $Dir 'package.json'
  if (-not (Test-Path -LiteralPath $Lock) -or -not (Test-Path -LiteralPath $Package)) { throw "Missing npm manifest/lockfile in $Dir" }
  $Hash = (Get-FileHash -LiteralPath $Lock -Algorithm SHA256).Hash.ToLowerInvariant()
  $Mode = if ($ProductionOnly) { 'runtime' } else { 'builder' }
  $Marker = Join-Path $Dir ".talos-inspection-npm-$Hash-$Mode"
  $Modules = Join-Path $Dir 'node_modules'
  if ((Test-Path -LiteralPath $Marker) -and (Test-Path -LiteralPath $Modules)) { Write-Host "Pinned dependency cache valid ($Mode): $Dir"; return }
  Get-ChildItem -LiteralPath $Dir -Filter '.talos-inspection-npm-*' -Force -ErrorAction SilentlyContinue | Remove-Item -Force -ErrorAction SilentlyContinue
  $Args = @('ci')
  if ($ProductionOnly) { $Args += '--omit=dev' } else { $Args += '--include=dev' }
  $Args += @('--no-audit','--no-fund')
  Invoke-Checked $script:NpmCmd $Args $Dir "npm ci (${Mode}: $Dir)"
  Set-Content -LiteralPath $Marker -Value "$Hash $Mode" -Encoding Ascii
}
function Get-NodeRealPath([string]$NodeExe,[string]$Path) {
  $Script = "console.log(require('node:fs').realpathSync.native(process.argv[1]))"
  $Result = & $NodeExe -e $Script $Path
  if ($LASTEXITCODE -ne 0) { throw "Node realpath failed for $Path with exit code $LASTEXITCODE" }
  return Normalize-ExistingDirectory ($Result | Select-Object -Last 1)
}

if ($env:OS -ne 'Windows_NT' -or -not [Environment]::Is64BitOperatingSystem) { throw 'This owner-inspection package requires 64-bit Windows.' }

$Root = Normalize-ExistingDirectory $PSScriptRoot
$AppRoot = Join-Path $Root 'app'
$HarnessRoot = Join-Path $AppRoot 'vendor\harness-ui'
$ContextRoot = Join-Path $AppRoot 'vendor\context-engine'
$LogRoot = Join-Path $Root 'DEVELOPMENT-LOGS'
Ensure-Directory $LogRoot
$Stamp = Get-Date -Format 'yyyyMMdd-HHmmss-fff'
$script:TranscriptPath = Join-Path $LogRoot "bootstrap-$Stamp-$PID.log"
Start-Transcript -LiteralPath $script:TranscriptPath -Force -IncludeInvocationHeader | Out-Null
$script:TranscriptStarted = $true

try {
  Write-Host 'TALOS CLI OWNER INSPECTION BOOTSTRAP'
  Write-Host "Source HEAD     : $Snapshot"
  Write-Host "Inspection root : $Root"
  Write-Host "Requested project: $Project"
  Write-Host "PowerShell      : $($PSVersionTable.PSVersion) ($($PSVersionTable.PSEdition))"
  Write-Host "OS              : $([Environment]::OSVersion.VersionString)"
  Write-Host "64-bit process  : $([Environment]::Is64BitProcess)"
  Write-Host "64-bit OS       : $([Environment]::Is64BitOperatingSystem)"
  Write-Host "Transcript      : $script:TranscriptPath"

  foreach ($Required in @((Join-Path $AppRoot 'src\main.ts'),(Join-Path $HarnessRoot 'src\kernel\talosHarness.mjs'),(Join-Path $ContextRoot 'src\engine.mjs'))) {
    if (-not (Test-Path -LiteralPath $Required)) { throw "Inspection payload incomplete: $Required" }
  }

  $Project = Resolve-InspectionProject $Project
  $Project = Assert-NoInspectionOverlap $Project $Root $AppRoot 'resolved-path'

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
  if (-not (Test-Path -LiteralPath $NodeExe) -or -not (Test-Path -LiteralPath $script:NpmCmd)) { throw 'Verified Node archive did not contain node.exe/npm.cmd.' }
  Write-Host "Node            : $(& $NodeExe --version)"
  Write-Host "npm             : $(& $script:NpmCmd --version)"

  $RealRoot = Get-NodeRealPath $NodeExe $Root
  $RealApp = Get-NodeRealPath $NodeExe $AppRoot
  $RealProject = Get-NodeRealPath $NodeExe $Project
  $Project = Assert-NoInspectionOverlap $RealProject $RealRoot $RealApp 'native-realpath'
  Write-Host "Canonical project: $Project"

  $env:TALOS_CLI_RUNTIME_ROOT = Join-Path $AppRoot 'vendor'
  $env:TALOS_CLI_INSPECTION_SNAPSHOT = $Snapshot
  $env:TALOS_CLI_DEV_LOG_DIR = $LogRoot
  Remove-Item Env:NODE_ENV -ErrorAction SilentlyContinue

  Ensure-NpmTree $AppRoot $false
  Ensure-NpmTree $HarnessRoot $true
  Ensure-NpmTree $ContextRoot $true

  $BuildMarker = Join-Path $AppRoot ".talos-inspection-build-$Snapshot"
  $Entry = Join-Path $AppRoot 'dist\main.js'
  if (-not (Test-Path -LiteralPath $BuildMarker) -or -not (Test-Path -LiteralPath $Entry)) {
    Write-Host "Building TALOS CLI inspection snapshot $Snapshot with mandatory zero-error gates..."
    Remove-Item -LiteralPath (Join-Path $AppRoot 'dist') -Recurse -Force -ErrorAction SilentlyContinue
    Invoke-Checked $script:NpmCmd @('run','typecheck') $AppRoot 'TALOS CLI typecheck'
    Invoke-Checked $script:NpmCmd @('run','build') $AppRoot 'TALOS CLI build'
    if (-not (Test-Path -LiteralPath $Entry)) { throw "Build exited zero but did not emit $Entry" }
    Set-Content -LiteralPath $BuildMarker -Value $Snapshot -Encoding Ascii
  } else { Write-Host "Build cache valid for snapshot $Snapshot" }

  $env:NODE_ENV = 'production'
  Write-Host "Runtime NODE_ENV: $env:NODE_ENV"

  Write-Host ''
  Write-Host 'TALOS CLI OWNER INSPECTION'
  Write-Host "Source HEAD : $Snapshot"
  Write-Host "Workspace   : $Project"
  Write-Host "Logs        : $LogRoot"
  Write-Host 'This is an inspection build, not a signed release.'
  Write-Host ''

  if ($PrepareOnly) {
    Write-Host 'Prepare-only validation: launching CLI entrypoint from the separate project cwd...'
    Invoke-Checked $NodeExe @($Entry,'--version') $Project 'TALOS CLI --version smoke'
    Write-Host 'Prepare-only validation completed successfully.'
    $script:FinalExitCode = 0
  } else {
    Write-Host 'Launching TALOS CLI. Any development incident logs will be written beside this launcher.'
    Push-Location $Project
    try { & $NodeExe $Entry --project $Project; $script:FinalExitCode = $LASTEXITCODE } finally { Pop-Location }
    Write-Host "TALOS CLI exit code: $script:FinalExitCode"
  }
} catch {
  if ($script:FinalExitCode -eq 0) {
    try {
      if ($_.Exception.Data.Contains('ExitCode')) { $script:FinalExitCode = [int]$_.Exception.Data['ExitCode'] }
      else { $script:FinalExitCode = 1 }
    } catch { $script:FinalExitCode = 1 }
  }
  Write-Error "TALOS INSPECTION FAILURE: $($_.Exception.Message)"
  Write-Host '--- exception type ---'
  Write-Host $_.Exception.GetType().FullName
  Write-Host '--- exception stack ---'
  Write-Host $_.ScriptStackTrace
  Write-Host '--- exception object ---'
  Write-Host ($_ | Format-List * -Force | Out-String)
} finally {
  Write-Host ''
  Write-Host "DEVELOPMENT LOG DIRECTORY: $LogRoot"
  Write-Host 'On any FAIL, send the entire DEVELOPMENT-LOGS folder.'
  if ($script:TranscriptStarted) { try { Stop-Transcript | Out-Null } catch { Write-Warning "Stop-Transcript failed: $($_.Exception.Message)" } }
}
exit $script:FinalExitCode
