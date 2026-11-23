param(
  [Parameter(Mandatory=$true)][string]$Project
)
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version 3.0
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

$NodeVersion = '24.18.0'
$NodeArchiveName = 'node-v24.18.0-win-x64.zip'
$NodeUrl = "https://nodejs.org/dist/v$NodeVersion/$NodeArchiveName"
$NodeSha256 = '0ae68406b42d7725661da979b1403ec9926da205c6770827f33aac9d8f26e821'
$DesktopVersion = '0.1.7'
$DesktopArchiveName = 'TALOS-0.1.7-win.zip'
$DesktopUrl = 'https://github.com/Ninozzz95/talos/releases/download/desktop-v0.1.7/TALOS-0.1.7-win.zip'
$DesktopSha256 = 'bd36634309205f6c7e1e1f6effe283c337651aa24e3609c2c9b189ad1de89a35'
$InkVersion = '7.1.1'
$ReactVersion = '19.3.0'

function Assert-WindowsX64 {
  if(-not [Environment]::Is64BitOperatingSystem){ throw 'TALOS CLI requires 64-bit Windows.' }
  if($env:OS -ne 'Windows_NT'){ throw 'This one-click launcher targets Windows.' }
}
function Ensure-Directory([string]$Path){ if(-not (Test-Path -LiteralPath $Path)){ New-Item -ItemType Directory -Force -Path $Path | Out-Null } }
function Assert-Sha256([string]$Path,[string]$Expected){
  $Actual=(Get-FileHash -LiteralPath $Path -Algorithm SHA256).Hash.ToLowerInvariant()
  if($Actual -ne $Expected.ToLowerInvariant()){ throw "SHA256 mismatch for $Path. Expected $Expected, got $Actual." }
}
function Get-VerifiedArchive([string]$Url,[string]$Destination,[string]$Sha256){
  if(Test-Path -LiteralPath $Destination){
    try { Assert-Sha256 $Destination $Sha256; return } catch { Remove-Item -LiteralPath $Destination -Force }
  }
  $Tmp="$Destination.part"
  Remove-Item -LiteralPath $Tmp -Force -ErrorAction SilentlyContinue
  Write-Host "Downloading $([IO.Path]::GetFileName($Destination)) ..."
  Invoke-WebRequest -UseBasicParsing -Uri $Url -OutFile $Tmp
  Assert-Sha256 $Tmp $Sha256
  Move-Item -LiteralPath $Tmp -Destination $Destination -Force
}
function Expand-VerifiedArchive([string]$Archive,[string]$Destination,[string]$Marker){
  if(Test-Path -LiteralPath $Marker){ return }
  Remove-Item -LiteralPath $Destination -Recurse -Force -ErrorAction SilentlyContinue
  Ensure-Directory $Destination
  Expand-Archive -LiteralPath $Archive -DestinationPath $Destination -Force
  Set-Content -LiteralPath $Marker -Value 'verified' -Encoding Ascii
}
function Read-PackageVersion([string]$PackageJson){
  if(-not (Test-Path -LiteralPath $PackageJson)){ return $null }
  return (Get-Content -LiteralPath $PackageJson -Raw | ConvertFrom-Json).version
}

Assert-WindowsX64
$Project=(Resolve-Path -LiteralPath $Project).Path
$LauncherRoot=$PSScriptRoot
$AppRoot=Join-Path $LauncherRoot 'app'
$Entry=Join-Path $AppRoot 'dist\main.js'
if(-not (Test-Path -LiteralPath $Entry)){ throw "CLI payload missing: $Entry" }

$CacheRoot=Join-Path $env:LOCALAPPDATA 'TALOS-CLI\bootstrap'
$Downloads=Join-Path $CacheRoot 'downloads'
Ensure-Directory $Downloads

$NodeArchive=Join-Path $Downloads $NodeArchiveName
Get-VerifiedArchive $NodeUrl $NodeArchive $NodeSha256
$NodeExtract=Join-Path $CacheRoot "node-$NodeVersion"
$NodeMarker=Join-Path $NodeExtract '.verified'
Expand-VerifiedArchive $NodeArchive $NodeExtract $NodeMarker
$NodeRoot=Join-Path $NodeExtract "node-v$NodeVersion-win-x64"
$NodeExe=Join-Path $NodeRoot 'node.exe'
$NpmCmd=Join-Path $NodeRoot 'npm.cmd'
if(-not (Test-Path -LiteralPath $NodeExe) -or -not (Test-Path -LiteralPath $NpmCmd)){ throw 'Verified Node archive did not contain node.exe/npm.cmd.' }

$DesktopArchive=Join-Path $Downloads $DesktopArchiveName
Get-VerifiedArchive $DesktopUrl $DesktopArchive $DesktopSha256
$DesktopExtract=Join-Path $CacheRoot "desktop-$DesktopVersion"
$DesktopMarker=Join-Path $DesktopExtract '.verified'
Expand-VerifiedArchive $DesktopArchive $DesktopExtract $DesktopMarker
$DesktopExe=Get-ChildItem -LiteralPath $DesktopExtract -Filter 'TALOS.exe' -File -Recurse | Select-Object -First 1
if($null -eq $DesktopExe){ throw 'Verified TALOS Desktop archive did not contain TALOS.exe.' }
$RuntimeRoot=Join-Path $DesktopExe.Directory.FullName 'resources'
$RuntimeMarker=Join-Path $RuntimeRoot 'harness-ui\src\session-registry.mjs'
if(-not (Test-Path -LiteralPath $RuntimeMarker)){ throw "TALOS runtime marker missing: $RuntimeMarker" }

$InkPackage=Join-Path $AppRoot 'node_modules\ink\package.json'
$ReactPackage=Join-Path $AppRoot 'node_modules\react\package.json'
$NeedInstall=(Read-PackageVersion $InkPackage) -ne $InkVersion -or (Read-PackageVersion $ReactPackage) -ne $ReactVersion
if($NeedInstall){
  Write-Host 'Installing pinned CLI UI dependencies ...'
  Push-Location $AppRoot
  try {
    & $NpmCmd install --ignore-scripts --omit=dev --no-audit --no-fund --save-exact "ink@$InkVersion" "react@$ReactVersion"
    if($LASTEXITCODE -ne 0){ throw "npm install failed with exit code $LASTEXITCODE" }
  } finally { Pop-Location }
}
if((Read-PackageVersion $InkPackage) -ne $InkVersion){ throw 'Ink version verification failed.' }
if((Read-PackageVersion $ReactPackage) -ne $ReactVersion){ throw 'React version verification failed.' }

$env:TALOS_CLI_RUNTIME_ROOT=$RuntimeRoot
$env:NODE_ENV='production'
Write-Host "Starting TALOS CLI in $Project"
Push-Location $Project
try {
  & $NodeExe $Entry --project $Project
  exit $LASTEXITCODE
} finally { Pop-Location }
