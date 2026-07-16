[CmdletBinding()]
param(
    [string] $WorkspaceRoot = (Split-Path -Parent $PSScriptRoot),
    [switch] $Repair,
    [switch] $VerifyOnly
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'

$WorkspaceRoot = [IO.Path]::GetFullPath($WorkspaceRoot)
$ToolsRoot = Join-Path $WorkspaceRoot '.tools'
$DownloadsRoot = Join-Path $ToolsRoot 'downloads'
$StagingRoot = Join-Path $ToolsRoot '.s'
$ManifestPath = Join-Path $PSScriptRoot 'toolchain\manifest.json'
$AllowedDownloadHosts = @('downloads.php.net', 'nodejs.org', 'getcomposer.org', 'curl.se')

function Write-Utf8File([string] $Path, [string] $Contents) {
    $parent = Split-Path -Parent $Path
    if ($parent) {
        New-Item -ItemType Directory -Force -Path $parent | Out-Null
    }
    [IO.File]::WriteAllText($Path, $Contents, (New-Object Text.UTF8Encoding($false)))
}

function Get-LowerSha256([string] $Path) {
    return (Get-FileHash -LiteralPath $Path -Algorithm SHA256).Hash.ToLowerInvariant()
}

function Assert-ArtifactEntry($Entry, [string] $Name) {
    if (-not $Entry.version -or -not $Entry.url -or -not $Entry.sha256 -or -not $Entry.archive) {
        throw "Toolchain manifest entry '$Name' is incomplete."
    }
    if ([string]$Entry.sha256 -notmatch '^[a-f0-9]{64}$') {
        throw "Toolchain manifest entry '$Name' has an invalid SHA-256 digest."
    }
    $archiveName = [string]$Entry.archive
    if ([IO.Path]::IsPathRooted($archiveName) -or
        [IO.Path]::GetFileName($archiveName) -ne $archiveName -or
        $archiveName -in @('.', '..')) {
        throw "Toolchain manifest entry '$Name' must use a local archive filename."
    }
    $uri = [Uri]$Entry.url
    if ($uri.Scheme -ne 'https' -or $AllowedDownloadHosts -notcontains $uri.DnsSafeHost) {
        throw "Toolchain manifest entry '$Name' uses an untrusted download origin."
    }
}

function Get-VerifiedArtifact($Entry, [string] $Name) {
    Assert-ArtifactEntry $Entry $Name
    New-Item -ItemType Directory -Force -Path $DownloadsRoot | Out-Null
    $normalizedDownloadsRoot = [IO.Path]::GetFullPath($DownloadsRoot).TrimEnd([IO.Path]::DirectorySeparatorChar) + [IO.Path]::DirectorySeparatorChar
    $destination = [IO.Path]::GetFullPath((Join-Path $DownloadsRoot ([string]$Entry.archive)))
    if (-not $destination.StartsWith($normalizedDownloadsRoot, [StringComparison]::OrdinalIgnoreCase)) {
        throw "Toolchain artifact destination escapes the downloads directory."
    }

    if (Test-Path -LiteralPath $destination) {
        if ((Get-LowerSha256 $destination) -eq [string]$Entry.sha256) {
            return $destination
        }
        Remove-Item -LiteralPath $destination -Force
    }

    $partial = $destination + '.partial-' + $PID
    try {
        Write-Host "Downloading pinned $Name $($Entry.version)..."
        Invoke-WebRequest -UseBasicParsing -MaximumRedirection 0 -Uri ([string]$Entry.url) -OutFile $partial
        if ($Entry.bytes -and (Get-Item -LiteralPath $partial).Length -ne [int64]$Entry.bytes) {
            throw "Downloaded $Name size does not match the pinned manifest."
        }
        $actualHash = Get-LowerSha256 $partial
        if ($actualHash -ne [string]$Entry.sha256) {
            throw "Downloaded $Name failed SHA-256 verification."
        }
        Move-Item -LiteralPath $partial -Destination $destination -Force
        return $destination
    } finally {
        if (Test-Path -LiteralPath $partial) {
            Remove-Item -LiteralPath $partial -Force
        }
    }
}

function Assert-SafeZip([string] $ArchivePath) {
    Add-Type -AssemblyName System.IO.Compression.FileSystem
    $archive = [IO.Compression.ZipFile]::OpenRead($ArchivePath)
    try {
        $totalBytes = [int64]0
        $entryCount = 0
        foreach ($entry in $archive.Entries) {
            $entryCount++
            $totalBytes += [int64]$entry.Length
            $name = $entry.FullName.Replace('\', '/')
            if ($name.StartsWith('/') -or $name -match '^[A-Za-z]:' -or $name.Split('/') -contains '..') {
                throw "Archive contains an unsafe path: $name"
            }
            if ($entryCount -gt 20000 -or $totalBytes -gt 1073741824) {
                throw 'Archive exceeds the bootstrap extraction safety limits.'
            }
        }
    } finally {
        $archive.Dispose()
    }
}

function Replace-DirectoryAtomically([string] $Source, [string] $Destination) {
    $backup = $Destination + '.backup-' + $PID
    if (Test-Path -LiteralPath $backup) {
        Remove-Item -LiteralPath $backup -Recurse -Force
    }
    if (Test-Path -LiteralPath $Destination) {
        Move-Item -LiteralPath $Destination -Destination $backup
    }
    try {
        Move-Item -LiteralPath $Source -Destination $Destination
    } catch {
        if (Test-Path -LiteralPath $Destination) {
            Remove-Item -LiteralPath $Destination -Recurse -Force
        }
        if (Test-Path -LiteralPath $backup) {
            Move-Item -LiteralPath $backup -Destination $Destination
        }
        throw
    }

    if (Test-Path -LiteralPath $backup) {
        $removed = $false
        for ($attempt = 1; $attempt -le 5; $attempt++) {
            try {
                Remove-Item -LiteralPath $backup -Recurse -Force
                $removed = $true
                break
            } catch {
                Start-Sleep -Milliseconds (150 * $attempt)
            }
        }
        if (-not $removed) {
            Write-Warning "Installed runtime is healthy, but Windows kept the previous runtime locked at $backup. It will be retried on the next repair."
        }
    }
}

function Remove-StaleRuntimeBackups {
    foreach ($backup in Get-ChildItem -LiteralPath $ToolsRoot -Directory -ErrorAction SilentlyContinue | Where-Object { $_.Name -match '^(php|node)\.backup-' }) {
        try {
            Remove-Item -LiteralPath $backup.FullName -Recurse -Force -ErrorAction Stop
        } catch {
            # A running PHP/Node process may legitimately keep its old runtime locked.
        }
    }
}

function Install-ZipRuntime($Entry, [string] $Name, [string] $Destination, [string] $ArchiveRoot, [string] $RequiredBinary) {
    $archivePath = Get-VerifiedArtifact $Entry $Name
    Assert-SafeZip $archivePath
    New-Item -ItemType Directory -Force -Path $StagingRoot | Out-Null
    $staging = Join-Path $StagingRoot ($Name.Substring(0, 1).ToLowerInvariant() + '-' + $PID)
    if (Test-Path -LiteralPath $staging) {
        Remove-Item -LiteralPath $staging -Recurse -Force
    }
    New-Item -ItemType Directory -Path $staging | Out-Null
    try {
        [IO.Compression.ZipFile]::ExtractToDirectory($archivePath, $staging)
        $source = if ($ArchiveRoot) { Join-Path $staging $ArchiveRoot } else { $staging }
        if (-not (Test-Path -LiteralPath (Join-Path $source $RequiredBinary))) {
            throw "$Name archive does not contain the expected $RequiredBinary."
        }
        Replace-DirectoryAtomically $source $Destination
    } finally {
        if (Test-Path -LiteralPath $staging) {
            Remove-Item -LiteralPath $staging -Recurse -Force
        }
    }
}

function Invoke-NativeCapture([string] $Executable, [string[]] $Arguments) {
    $previousPreference = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    try {
        $lines = @(& $Executable @Arguments 2>&1 | ForEach-Object { $_.ToString() })
        $exitCode = $LASTEXITCODE
    } finally {
        $ErrorActionPreference = $previousPreference
    }
    return [pscustomobject]@{
        ExitCode = $exitCode
        Output = ($lines -join [Environment]::NewLine)
    }
}

function Test-ExecutableVersion([string] $Executable, [string] $Expected, [string[]] $Arguments) {
    if (-not (Test-Path -LiteralPath $Executable)) {
        return $false
    }
    $result = Invoke-NativeCapture $Executable $Arguments
    return $result.ExitCode -eq 0 -and $result.Output.Contains($Expected)
}

function Write-PortablePhpIni($Profile) {
    $template = Join-Path $ToolsRoot 'php\php.ini-development'
    if (-not (Test-Path -LiteralPath $template)) {
        throw 'PHP configuration template is missing.'
    }
    $opcacheDirectory = Join-Path $ToolsRoot 'php\var\opcache'
    New-Item -ItemType Directory -Force -Path $opcacheDirectory | Out-Null
    $ini = Get-Content -LiteralPath $template -Raw
    $ini = $ini -replace '(?m)^;extension_dir = "ext"\s*$', 'extension_dir = "ext"'
    $ini = [regex]::Replace(
        $ini,
        '(?m)^;?curl\.cainfo\s*=.*$',
        'curl.cainfo = "${TALOS_PHP_ROOT}/extras/ssl/cacert.pem"'
    )
    $ini = [regex]::Replace(
        $ini,
        '(?m)^;?openssl\.cafile\s*=.*$',
        'openssl.cafile = "${TALOS_PHP_ROOT}/extras/ssl/cacert.pem"'
    )
    $opcacheFileCache = 'opcache.file_cache = "${TALOS_PHP_ROOT}/var/opcache"'
    if ($ini -match '(?m)^;?opcache\.file_cache\s*=.*$') {
        $ini = [regex]::Replace($ini, '(?m)^;?opcache\.file_cache\s*=.*$', $opcacheFileCache)
    } else {
        $ini += "`r`n$opcacheFileCache`r`n"
    }
    if ($ini -match '(?m)^;?opcache\.file_cache_fallback\s*=.*$') {
        $ini = [regex]::Replace($ini, '(?m)^;?opcache\.file_cache_fallback\s*=.*$', 'opcache.file_cache_fallback = 1')
    } else {
        $ini += "opcache.file_cache_fallback = 1`r`n"
    }
    foreach ($extension in $Profile.required_php_extensions) {
        $escaped = [regex]::Escape([string]$extension)
        $ini = [regex]::Replace($ini, "(?m)^;extension=$escaped\s*$", "extension=$extension")
    }
    Write-Utf8File (Join-Path $ToolsRoot 'php\php.ini') $ini
}

function Write-PortableWrappers {
    $bin = Join-Path $ToolsRoot 'bin'
    New-Item -ItemType Directory -Force -Path $bin | Out-Null

    Write-Utf8File (Join-Path $bin 'php.cmd') @'
@echo off
setlocal
for %%I in ("%~dp0..\php") do set "TALOS_PHP_ROOT=%%~fI"
set "CURL_CA_BUNDLE=%TALOS_PHP_ROOT%\extras\ssl\cacert.pem"
set "SSL_CERT_FILE=%TALOS_PHP_ROOT%\extras\ssl\cacert.pem"
set "OPENSSL_CONF=%TALOS_PHP_ROOT%\extras\ssl\openssl.cnf"
"%TALOS_PHP_ROOT%\php.exe" %*
exit /b %ERRORLEVEL%
'@
    Write-Utf8File (Join-Path $bin 'composer.cmd') @'
@echo off
setlocal
for %%I in ("%~dp0..") do set "TOOLS_ROOT=%%~fI"
set "TALOS_PHP_ROOT=%TOOLS_ROOT%\php"
set "COMPOSER_HOME=%TOOLS_ROOT%\composer\home"
set "COMPOSER_CAFILE=%TOOLS_ROOT%\php\extras\ssl\cacert.pem"
set "CURL_CA_BUNDLE=%COMPOSER_CAFILE%"
set "SSL_CERT_FILE=%COMPOSER_CAFILE%"
set "OPENSSL_CONF=%TOOLS_ROOT%\php\extras\ssl\openssl.cnf"
set "PATH=%TOOLS_ROOT%\node;%TOOLS_ROOT%\bin;%PATH%"
"%TOOLS_ROOT%\php\php.exe" "%TOOLS_ROOT%\composer\composer.phar" %*
exit /b %ERRORLEVEL%
'@
    Write-Utf8File (Join-Path $bin 'node.cmd') @'
@echo off
setlocal
for %%I in ("%~dp0..") do set "TOOLS_ROOT=%%~fI"
"%TOOLS_ROOT%\node\node.exe" %*
exit /b %ERRORLEVEL%
'@
    Write-Utf8File (Join-Path $bin 'npm.cmd') @'
@echo off
setlocal
for %%I in ("%~dp0..") do set "TOOLS_ROOT=%%~fI"
set "PATH=%TOOLS_ROOT%\node;%TOOLS_ROOT%\bin;%PATH%"
call "%TOOLS_ROOT%\node\npm.cmd" %*
exit /b %ERRORLEVEL%
'@
    Write-Utf8File (Join-Path $bin 'npx.cmd') @'
@echo off
setlocal
for %%I in ("%~dp0..") do set "TOOLS_ROOT=%%~fI"
set "PATH=%TOOLS_ROOT%\node;%TOOLS_ROOT%\bin;%PATH%"
call "%TOOLS_ROOT%\node\npx.cmd" %*
exit /b %ERRORLEVEL%
'@
    Write-Utf8File (Join-Path $ToolsRoot 'env.ps1') @'
$ToolsRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$env:TALOS_PHP_ROOT = "$ToolsRoot\php"
$env:COMPOSER_HOME = "$ToolsRoot\composer\home"
$env:CURL_CA_BUNDLE = "$ToolsRoot\php\extras\ssl\cacert.pem"
$env:SSL_CERT_FILE = "$ToolsRoot\php\extras\ssl\cacert.pem"
$env:OPENSSL_CONF = "$ToolsRoot\php\extras\ssl\openssl.cnf"
$env:PATH = "$ToolsRoot\bin;$ToolsRoot\php;$ToolsRoot\node;$env:PATH"
Write-Host "TALOS local tools enabled from $ToolsRoot"
'@
}

function Install-FlatArtifact($Entry, [string] $Name, [string] $Destination) {
    $source = Get-VerifiedArtifact $Entry $Name
    New-Item -ItemType Directory -Force -Path (Split-Path -Parent $Destination) | Out-Null
    Copy-Item -LiteralPath $source -Destination $Destination -Force
    if ((Get-LowerSha256 $Destination) -ne [string]$Entry.sha256) {
        throw "Installed $Name failed post-copy verification."
    }
}

function Assert-ToolchainHealthy($Profile) {
    $php = Join-Path $ToolsRoot 'bin\php.cmd'
    $node = Join-Path $ToolsRoot 'bin\node.cmd'
    $composer = Join-Path $ToolsRoot 'bin\composer.cmd'
    foreach ($path in @($php, $node, $composer)) {
        if (-not (Test-Path -LiteralPath $path)) {
            throw "Missing tool wrapper: $path"
        }
    }
    $ini = Get-Content -LiteralPath (Join-Path $ToolsRoot 'php\php.ini') -Raw
    if ($ini -notmatch '(?m)^extension_dir\s*=\s*"ext"\s*$' -or $ini -match '[A-Za-z]:[\\/]Users[\\/]') {
        throw 'PHP configuration is not relocatable. Run scripts/bootstrap-tools.sh --repair.'
    }
    foreach ($directive in @('curl.cainfo', 'openssl.cafile')) {
        $expected = $directive + ' = "${TALOS_PHP_ROOT}/extras/ssl/cacert.pem"'
        if (-not $ini.Contains($expected)) {
            throw "PHP configuration does not bind $directive to the pinned CA bundle."
        }
    }
    $opcachePath = Join-Path $ToolsRoot 'php\var\opcache'
    if (-not (Test-Path -LiteralPath $opcachePath -PathType Container)) {
        throw 'Writable PHP OPcache file-cache directory is missing.'
    }
    foreach ($directive in @(
        'opcache.file_cache = "${TALOS_PHP_ROOT}/var/opcache"',
        'opcache.file_cache_fallback = 1'
    )) {
        if (-not $ini.Contains($directive)) {
            throw "PHP configuration is missing required Windows ASLR fallback: $directive"
        }
    }
    $caPath = Join-Path $ToolsRoot 'php\extras\ssl\cacert.pem'
    if (-not (Test-Path -LiteralPath $caPath)) {
        throw 'Pinned PHP CA bundle is missing.'
    }
    $opensslConfigPath = Join-Path $ToolsRoot 'php\extras\ssl\openssl.cnf'
    if (-not (Test-Path -LiteralPath $opensslConfigPath)) {
        throw 'Bundled PHP OpenSSL configuration is missing.'
    }
    $iniProbe = Invoke-NativeCapture $php @('-i')
    if ($iniProbe.ExitCode -ne 0 -or -not $iniProbe.Output.Contains($caPath)) {
        throw 'PHP did not resolve the relocatable CA bundle path.'
    }
    $moduleProbe = Invoke-NativeCapture $php @('-m')
    $modules = $moduleProbe.Output
    if ($moduleProbe.ExitCode -ne 0 -or $modules.Contains('PHP Warning')) {
        throw "PHP module probe failed.`n$modules"
    }
    $loadedModules = @($modules -split "`r?`n" | ForEach-Object { $_.Trim() } | Where-Object { $_ -ne '' })
    foreach ($extension in $Profile.required_php_extensions) {
        if ($loadedModules -notcontains [string]$extension) {
            throw "Required PHP extension '$extension' is not loaded."
        }
    }
    $ecProbe = Invoke-NativeCapture $php @(
        '-r',
        '$key = openssl_pkey_new([''private_key_type'' => OPENSSL_KEYTYPE_EC, ''curve_name'' => ''prime256v1'']); exit($key === false ? 1 : 0);'
    )
    if ($ecProbe.ExitCode -ne 0) {
        throw "PHP OpenSSL cannot generate a P-256 key with the bundled configuration.`n$($ecProbe.Output)"
    }
    $nodeProbe = Invoke-NativeCapture $node @('--version')
    if ($nodeProbe.ExitCode -ne 0 -or -not $nodeProbe.Output.Contains([string]$Profile.node.version)) {
        throw 'Node version probe failed.'
    }
    $composerProbe = Invoke-NativeCapture $composer @('--version')
    if ($composerProbe.ExitCode -ne 0 -or -not $composerProbe.Output.Contains([string]$Profile.composer.version)) {
        throw 'Composer version probe failed.'
    }
}

if (-not (Test-Path -LiteralPath $ManifestPath)) {
    throw "Toolchain manifest is missing: $ManifestPath"
}
$manifest = Get-Content -LiteralPath $ManifestPath -Raw | ConvertFrom-Json
if ($manifest.schema_version -ne 1) {
    throw 'Unsupported toolchain manifest schema.'
}
if (-not [Environment]::Is64BitOperatingSystem) {
    throw 'The native bootstrap requires 64-bit Windows. Use ./talos up on unsupported platforms.'
}
$profile = $manifest.windows_x64

if ($VerifyOnly) {
    if (-not (Test-Path -LiteralPath $ToolsRoot)) {
        throw 'The repository-local toolchain is not installed.'
    }
    Assert-ToolchainHealthy $profile
    Write-Host 'TALOS native toolchain verification passed.'
    exit 0
}

New-Item -ItemType Directory -Force -Path $ToolsRoot | Out-Null
$lockPath = Join-Path $ToolsRoot '.bootstrap.lock'
try {
    $lock = [IO.File]::Open($lockPath, [IO.FileMode]::OpenOrCreate, [IO.FileAccess]::ReadWrite, [IO.FileShare]::None)
} catch {
    throw 'Another TALOS toolchain bootstrap is already running.'
}

try {
    Remove-StaleRuntimeBackups
    $phpExe = Join-Path $ToolsRoot 'php\php.exe'
    if (-not (Test-ExecutableVersion $phpExe ([string]$profile.php.version) @('-n', '-v'))) {
        Install-ZipRuntime $profile.php 'PHP' (Join-Path $ToolsRoot 'php') '' 'php.exe'
    }
    $nodeExe = Join-Path $ToolsRoot 'node\node.exe'
    if (-not (Test-ExecutableVersion $nodeExe ([string]$profile.node.version) @('--version'))) {
        Install-ZipRuntime $profile.node 'Node' (Join-Path $ToolsRoot 'node') ([string]$profile.node.archive_root) 'node.exe'
    }

    Install-FlatArtifact $profile.composer 'Composer' (Join-Path $ToolsRoot 'composer\composer.phar')
    Install-FlatArtifact $profile.cacert 'CA bundle' (Join-Path $ToolsRoot 'php\extras\ssl\cacert.pem')
    Write-PortablePhpIni $profile
    Write-PortableWrappers
    try {
        Assert-ToolchainHealthy $profile
    } catch {
        if (-not $Repair) {
            throw
        }
        Write-Warning 'Toolchain health failed after configuration repair; reinstalling pinned runtimes.'
        Install-ZipRuntime $profile.php 'PHP' (Join-Path $ToolsRoot 'php') '' 'php.exe'
        Install-ZipRuntime $profile.node 'Node' (Join-Path $ToolsRoot 'node') ([string]$profile.node.archive_root) 'node.exe'
        Install-FlatArtifact $profile.composer 'Composer' (Join-Path $ToolsRoot 'composer\composer.phar')
        Install-FlatArtifact $profile.cacert 'CA bundle' (Join-Path $ToolsRoot 'php\extras\ssl\cacert.pem')
        Write-PortablePhpIni $profile
        Write-PortableWrappers
        Assert-ToolchainHealthy $profile
    }

    $state = [ordered]@{
        schema_version = 1
        installed_at = [DateTime]::UtcNow.ToString('o')
        workspace_root = $WorkspaceRoot
        php = [string]$profile.php.version
        node = [string]$profile.node.version
        composer = [string]$profile.composer.version
        manifest_sha256 = Get-LowerSha256 $ManifestPath
    } | ConvertTo-Json
    Write-Utf8File (Join-Path $ToolsRoot 'state.json') $state
    Write-Host 'TALOS native toolchain is ready.'
} finally {
    if ($null -ne $lock) {
        $lock.Dispose()
    }
    if (Test-Path -LiteralPath $lockPath) {
        Remove-Item -LiteralPath $lockPath -Force
    }
}
