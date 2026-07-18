Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$script:ManifestSchema = 'talos.container-runtime.manifest.v1'
$script:StateSchema = 'talos.container-runtime.state.v1'
$script:AllowedInitialHosts = @('desktop.docker.com', 'github.com')
$script:AllowedRedirectHosts = @('release-assets.githubusercontent.com')

function Get-TalosLowerSha256 {
    param([Parameter(Mandatory = $true)][string] $Path)

    return (Get-FileHash -LiteralPath $Path -Algorithm SHA256).Hash.ToLowerInvariant()
}

function Get-TalosWindowsSystemExecutablePath {
    param([Parameter(Mandatory = $true)][string] $RelativePath)

    if ([string]::IsNullOrWhiteSpace($RelativePath) -or
        [IO.Path]::IsPathRooted($RelativePath) -or
        $RelativePath -match '^[A-Za-z]:' -or
        $RelativePath.Replace('\', '/').Split('/') -contains '..') {
        throw 'Windows system executable path must be a safe relative path.'
    }
    $systemRoot = [IO.Path]::GetFullPath([Environment]::SystemDirectory).TrimEnd([IO.Path]::DirectorySeparatorChar) + [IO.Path]::DirectorySeparatorChar
    $candidate = [IO.Path]::GetFullPath((Join-Path $systemRoot $RelativePath))
    if (-not $candidate.StartsWith($systemRoot, [StringComparison]::OrdinalIgnoreCase) -or
        -not (Test-Path -LiteralPath $candidate -PathType Leaf)) {
        throw "Required Windows system executable is unavailable: $RelativePath"
    }
    return $candidate
}

function Write-TalosUtf8File {
    param(
        [Parameter(Mandatory = $true)][string] $Path,
        [Parameter(Mandatory = $true)][string] $Contents
    )

    $parent = Split-Path -Parent $Path
    if ($parent) {
        New-Item -ItemType Directory -Force -Path $parent | Out-Null
    }
    [IO.File]::WriteAllText($Path, $Contents, (New-Object Text.UTF8Encoding($false)))
}

function Test-TalosSafeLeafName {
    param([Parameter(Mandatory = $true)][string] $Name)

    return -not [IO.Path]::IsPathRooted($Name) -and
        [IO.Path]::GetFileName($Name) -eq $Name -and
        $Name -notin @('.', '..') -and
        $Name -notmatch '[\\/]'
}

function Test-TalosSafeRelativePath {
    param([Parameter(Mandatory = $true)][string] $Path)

    if ([IO.Path]::IsPathRooted($Path) -or $Path -match '^[A-Za-z]:' -or $Path.StartsWith('/') -or $Path.StartsWith('\')) {
        return $false
    }
    $segments = $Path.Replace('\', '/').Split('/')
    return $segments -notcontains '..'
}

function Assert-TalosArtifactEntry {
    param(
        [Parameter(Mandatory = $true)] $Entry,
        [Parameter(Mandatory = $true)][string] $Name
    )

    foreach ($property in @('version', 'url', 'sha256', 'bytes', 'archive')) {
        if ($null -eq $Entry.PSObject.Properties[$property] -or [string]::IsNullOrWhiteSpace([string]$Entry.$property)) {
            throw "Container runtime manifest entry '$Name' is missing '$property'."
        }
    }
    if ([string]$Entry.sha256 -notmatch '^[a-f0-9]{64}$') {
        throw "Container runtime manifest entry '$Name' has an invalid SHA-256 digest."
    }
    $bytes = [int64]$Entry.bytes
    if ($bytes -le 0 -or $bytes -gt 1610612736) {
        throw "Container runtime manifest entry '$Name' has an invalid byte length."
    }
    if (-not (Test-TalosSafeLeafName -Name ([string]$Entry.archive))) {
        throw "Container runtime manifest entry '$Name' must use a local archive filename."
    }
    if ($null -ne $Entry.PSObject.Properties['archive_root'] -and
        -not [string]::IsNullOrWhiteSpace([string]$Entry.archive_root) -and
        -not (Test-TalosSafeRelativePath -Path ([string]$Entry.archive_root))) {
        throw "Container runtime manifest entry '$Name' has an unsafe archive root."
    }
    try {
        $uri = [Uri]([string]$Entry.url)
    } catch {
        throw "Container runtime manifest entry '$Name' has an invalid URL."
    }
    if ($uri.Scheme -ne 'https' -or $script:AllowedInitialHosts -notcontains $uri.DnsSafeHost.ToLowerInvariant()) {
        throw "Container runtime manifest entry '$Name' uses an untrusted download origin."
    }
}

function Test-TalosRuntimeManifest {
    [CmdletBinding()]
    param([Parameter(Mandatory = $true)][string] $ManifestPath)

    if (-not (Test-Path -LiteralPath $ManifestPath -PathType Leaf)) {
        throw "Container runtime manifest is missing: $ManifestPath"
    }
    try {
        $manifest = Get-Content -LiteralPath $ManifestPath -Raw | ConvertFrom-Json
    } catch {
        throw "Container runtime manifest is not valid JSON: $($_.Exception.Message)"
    }
    if ([string]$manifest.schema_version -ne $script:ManifestSchema) {
        throw 'Unsupported container runtime manifest schema.'
    }
    if ($null -eq $manifest.windows_x64) {
        throw 'Container runtime manifest has no windows_x64 profile.'
    }
    foreach ($name in @('docker_desktop', 'podman', 'compose')) {
        $entry = $manifest.windows_x64.$name
        if ($null -eq $entry) {
            throw "Container runtime manifest is missing windows_x64.$name."
        }
        Assert-TalosArtifactEntry -Entry $entry -Name "windows_x64.$name"
    }
    $podmanEntry = $manifest.windows_x64.podman
    foreach ($property in @('binary_sha256', 'binary_bytes')) {
        if ($null -eq $podmanEntry.PSObject.Properties[$property] -or [string]::IsNullOrWhiteSpace([string]$podmanEntry.$property)) {
            throw "Container runtime manifest entry 'windows_x64.podman' is missing '$property'."
        }
    }
    if ([string]$podmanEntry.binary_sha256 -notmatch '^[a-f0-9]{64}$') {
        throw 'Podman executable SHA-256 pin is invalid.'
    }
    if ([int64]$podmanEntry.binary_bytes -le 0 -or [int64]$podmanEntry.binary_bytes -gt 536870912) {
        throw 'Podman executable byte-length pin is invalid.'
    }
    if ([string]$manifest.windows_x64.docker_desktop.authenticode_subject -ne 'Docker Inc') {
        throw 'Docker Desktop Authenticode subject pin is invalid.'
    }
    if ([string]$manifest.windows_x64.docker_desktop.license_url -notmatch '^https://www\.docker\.com/') {
        throw 'Docker Desktop license URL pin is invalid.'
    }
    return $manifest
}

function Resolve-TalosHyperVStoragePlan {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory = $true)][string] $VirtualMachinePath,
        [Parameter(Mandatory = $true)][string] $VirtualHardDiskPath,
        [scriptblock] $PathTypeProbe = {
            param([string] $Path)
            if (Test-Path -LiteralPath $Path -PathType Container) {
                return 'directory'
            }
            if (Test-Path -LiteralPath $Path -PathType Leaf) {
                return 'file'
            }
            return 'missing'
        },
        [scriptblock] $DriveProbe = {
            param([string] $DriveRoot)
            return Test-Path -LiteralPath $DriveRoot -PathType Container
        }
    )

    $resolved = [ordered]@{}
    $missing = New-Object Collections.Generic.List[string]
    $seen = New-Object 'Collections.Generic.HashSet[string]' ([StringComparer]::OrdinalIgnoreCase)
    foreach ($entry in @(
        [pscustomobject]@{ name = 'virtual_machine_path'; value = $VirtualMachinePath },
        [pscustomobject]@{ name = 'virtual_hard_disk_path'; value = $VirtualHardDiskPath }
    )) {
        $value = [string]$entry.value
        if ([string]::IsNullOrWhiteSpace($value) -or
            $value.StartsWith('\\') -or
            $value -notmatch '^[A-Za-z]:[\\/]') {
            throw "Hyper-V $($entry.name) must be an absolute local-drive path; UNC and relative paths are not allowed."
        }
        try {
            $fullPath = [IO.Path]::GetFullPath($value)
        } catch {
            throw "Hyper-V $($entry.name) is not a valid absolute local-drive path."
        }
        $driveRoot = [IO.Path]::GetPathRoot($fullPath)
        if ($driveRoot -notmatch '^[A-Za-z]:\\$' -or -not [bool](& $DriveProbe $driveRoot)) {
            throw "Hyper-V $($entry.name) references a local drive that does not exist."
        }
        $pathType = [string](& $PathTypeProbe $fullPath)
        switch ($pathType) {
            'directory' { }
            'missing' {
                if ($seen.Add($fullPath)) {
                    $missing.Add($fullPath)
                }
            }
            'file' { throw "Hyper-V $($entry.name) must identify a directory, but a file exists at that path." }
            default { throw "Hyper-V $($entry.name) path type could not be verified safely." }
        }
        $resolved[[string]$entry.name] = $fullPath
    }

    return [pscustomobject]@{
        ready = $missing.Count -eq 0
        virtual_machine_path = [string]$resolved.virtual_machine_path
        virtual_hard_disk_path = [string]$resolved.virtual_hard_disk_path
        missing_paths = @($missing)
    }
}

function Get-TalosHyperVStorageFacts {
    param([Parameter(Mandatory = $true)][bool] $HyperVInstalled)

    if (-not $HyperVInstalled) {
        return [pscustomobject]@{
            ready = $false
            virtual_machine_path = ''
            virtual_hard_disk_path = ''
            error = 'Hyper-V is not installed.'
        }
    }
    try {
        Import-Module Hyper-V -ErrorAction Stop
        $hostSettings = Get-VMHost -ErrorAction Stop
        $plan = Resolve-TalosHyperVStoragePlan `
            -VirtualMachinePath ([string]$hostSettings.VirtualMachinePath) `
            -VirtualHardDiskPath ([string]$hostSettings.VirtualHardDiskPath)
        return [pscustomobject]@{
            ready = [bool]$plan.ready
            virtual_machine_path = [string]$plan.virtual_machine_path
            virtual_hard_disk_path = [string]$plan.virtual_hard_disk_path
            error = ''
        }
    } catch {
        return [pscustomobject]@{
            ready = $false
            virtual_machine_path = ''
            virtual_hard_disk_path = ''
            error = $_.Exception.Message
        }
    }
}

function Ensure-TalosHyperVStoragePaths {
    param([Parameter(Mandatory = $true)] $StoragePlan)

    $validatedPlan = Resolve-TalosHyperVStoragePlan `
        -VirtualMachinePath ([string]$StoragePlan.virtual_machine_path) `
        -VirtualHardDiskPath ([string]$StoragePlan.virtual_hard_disk_path)
    $created = New-Object Collections.Generic.List[string]
    foreach ($path in @($validatedPlan.missing_paths)) {
        New-Item -ItemType Directory -Path $path -Force -ErrorAction Stop | Out-Null
        if (-not (Test-Path -LiteralPath $path -PathType Container)) {
            throw "Hyper-V storage directory could not be created: $path"
        }
        $created.Add([string]$path)
    }
    return @($created)
}

function Test-TalosHyperVRestartRequired {
    param(
        [Parameter(Mandatory = $true)][bool] $FeatureChanged,
        [Parameter(Mandatory = $true)][bool] $AccessChanged,
        [Parameter(Mandatory = $true)][bool] $HypervisorPresent
    )

    return $FeatureChanged -or $AccessChanged -or -not $HypervisorPresent
}

function Get-TalosHostFacts {
    [CmdletBinding()]
    param()

    if ($env:OS -ne 'Windows_NT') {
        return [pscustomobject]@{
            is_windows = $false
            product_type = 0
            build = 0
            architecture = [string]$env:PROCESSOR_ARCHITECTURE
            hyper_v_installed = $false
            hypervisor_present = $false
            hyper_v_storage_ready = $false
            hyper_v_storage_error = 'Hyper-V storage is unavailable on this host.'
            wsl_ready = $false
            logical_processors = [Environment]::ProcessorCount
            total_memory_mb = 0
        }
    }

    $os = Get-CimInstance Win32_OperatingSystem
    $computer = Get-CimInstance Win32_ComputerSystem
    $hyperVInstalled = $false
    if ([int]$os.ProductType -ne 1 -and (Get-Command Get-WindowsFeature -ErrorAction SilentlyContinue)) {
        try {
            $feature = Get-WindowsFeature -Name Hyper-V -ErrorAction Stop
            $hyperVInstalled = [bool]$feature.Installed
        } catch {
            $hyperVInstalled = $false
        }
    } elseif (Get-Command Get-WindowsOptionalFeature -ErrorAction SilentlyContinue) {
        try {
            $feature = Get-WindowsOptionalFeature -Online -FeatureName Microsoft-Hyper-V-All -ErrorAction Stop
            $hyperVInstalled = [string]$feature.State -eq 'Enabled'
        } catch {
            $hyperVInstalled = $false
        }
    }

    $wslReady = $false
    try {
        $wsl = Get-TalosWindowsSystemExecutablePath -RelativePath 'wsl.exe'
    } catch {
        $wsl = $null
    }
    if ($null -ne $wsl) {
        $result = Invoke-TalosNativeCapture -Executable $wsl -Arguments @('--version')
        if ($result.ExitCode -eq 0 -and $result.Output -match 'WSL version:\s*([0-9]+)\.([0-9]+)\.([0-9]+)') {
            $major = [int]$Matches[1]
            $minor = [int]$Matches[2]
            $patch = [int]$Matches[3]
            $wslReady = $major -gt 2 -or
                ($major -eq 2 -and $minor -gt 1) -or
                ($major -eq 2 -and $minor -eq 1 -and $patch -ge 5)
        }
    }

    $hyperVStorage = Get-TalosHyperVStorageFacts -HyperVInstalled $hyperVInstalled

    return [pscustomobject]@{
        is_windows = $true
        product_type = [int]$os.ProductType
        build = [int]$os.BuildNumber
        architecture = [string]$env:PROCESSOR_ARCHITECTURE
        hyper_v_installed = $hyperVInstalled
        hypervisor_present = [bool]$computer.HypervisorPresent
        hyper_v_storage_ready = [bool]$hyperVStorage.ready
        hyper_v_storage_error = [string]$hyperVStorage.error
        wsl_ready = $wslReady
        logical_processors = [Environment]::ProcessorCount
        total_memory_mb = [int][Math]::Floor([double]$computer.TotalPhysicalMemory / 1MB)
    }
}

function Test-TalosSupportedWindowsWorkstation {
    param($HostFacts)

    if ([int]$HostFacts.product_type -ne 1) {
        return $false
    }
    $build = [int]$HostFacts.build
    return $build -eq 19045 -or $build -ge 22631
}

function Resolve-TalosRuntimePlan {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory = $true)] $HostFacts,
        [Parameter(Mandatory = $true)] $RuntimeFacts,
        [Parameter(Mandatory = $true)][string] $Preference
    )

    $normalized = $Preference.Trim().ToLowerInvariant()
    if ($normalized -notin @('auto', 'docker', 'podman')) {
        throw "TALOS_CONTAINER_RUNTIME must be one of: auto, docker, podman. Received '$Preference'."
    }

    $unsupported = {
        param([string] $Kind, [string] $Reason)
        return [pscustomobject]@{
            kind = $Kind
            action = 'unsupported'
            reason = $Reason
            machine_provider = ''
            requires_license = $false
            requires_elevation = $false
            requires_restart = $false
        }
    }

    if (-not [bool]$HostFacts.is_windows) {
        return & $unsupported '' 'The unattended runtime bootstrap currently supports Windows only.'
    }
    if ([string]$HostFacts.architecture -notin @('AMD64', 'x86_64')) {
        return & $unsupported '' 'The pinned container runtime manifest currently supports Windows x64 only.'
    }

    if ($normalized -eq 'auto') {
        if ([bool]$RuntimeFacts.docker_healthy) {
            return [pscustomobject]@{
                kind = 'docker'; action = 'use'; reason = 'Existing Docker is healthy.'; machine_provider = ''
                requires_license = $false; requires_elevation = $false; requires_restart = $false
            }
        }
        if ([bool]$RuntimeFacts.podman_healthy) {
            $provider = if ([int]$HostFacts.product_type -eq 1) { 'wsl' } else { 'hyperv' }
            return [pscustomobject]@{
                kind = 'podman'; action = 'use'; reason = 'Existing Podman is healthy.'; machine_provider = $provider
                requires_license = $false; requires_elevation = $false; requires_restart = $false
            }
        }
        $normalized = if ([int]$HostFacts.product_type -eq 1) { 'docker' } else { 'podman' }
    }

    if ($normalized -eq 'docker') {
        if ([bool]$RuntimeFacts.docker_healthy) {
            return [pscustomobject]@{
                kind = 'docker'; action = 'use'; reason = 'Requested Docker is healthy.'; machine_provider = ''
                requires_license = $false; requires_elevation = $false; requires_restart = $false
            }
        }
        if ([bool]$RuntimeFacts.docker_installed) {
            return [pscustomobject]@{
                kind = 'docker'; action = 'start'; reason = 'Docker is installed but not ready.'; machine_provider = ''
                requires_license = $false; requires_elevation = $false; requires_restart = $false
            }
        }
        if (-not (Test-TalosSupportedWindowsWorkstation -HostFacts $HostFacts)) {
            return & $unsupported 'docker' 'Docker Desktop cannot be installed on this Windows edition or build.'
        }
        return [pscustomobject]@{
            kind = 'docker'
            action = 'install'
            reason = 'Install pinned Docker Desktop in per-user WSL 2 mode.'
            machine_provider = 'wsl'
            requires_license = $true
            requires_elevation = -not [bool]$HostFacts.wsl_ready
            requires_restart = -not [bool]$HostFacts.wsl_ready
        }
    }

    $machineProvider = if ([int]$HostFacts.product_type -eq 1) { 'wsl' } else { 'hyperv' }
    if ([bool]$RuntimeFacts.podman_healthy) {
        return [pscustomobject]@{
            kind = 'podman'; action = 'use'; reason = 'Requested Podman is healthy.'; machine_provider = $machineProvider
            requires_license = $false; requires_elevation = $false; requires_restart = $false
        }
    }
    $requiresElevation = $false
    $requiresRestart = $false
    if ($machineProvider -eq 'hyperv') {
        $storageReady = $null -eq $HostFacts.PSObject.Properties['hyper_v_storage_ready'] -or
            [bool]$HostFacts.hyper_v_storage_ready
        $requiresElevation = -not [bool]$HostFacts.hyper_v_installed -or
            -not [bool]$RuntimeFacts.podman_hyperv_prepared -or
            -not $storageReady
        $requiresRestart = -not [bool]$HostFacts.hyper_v_installed -or
            -not [bool]$HostFacts.hypervisor_present -or
            -not [bool]$RuntimeFacts.podman_hyperv_prepared
    } else {
        $requiresElevation = -not [bool]$HostFacts.wsl_ready
        $requiresRestart = -not [bool]$HostFacts.wsl_ready
    }
    return [pscustomobject]@{
        kind = 'podman'
        action = if ([bool]$RuntimeFacts.podman_installed) { 'start' } else { 'install' }
        reason = if ([bool]$RuntimeFacts.podman_installed) { 'Podman is installed but not ready.' } else { 'Install pinned Podman and its Compose provider.' }
        machine_provider = $machineProvider
        requires_license = $false
        requires_elevation = $requiresElevation
        requires_restart = $requiresRestart
    }
}

function Test-TalosPodmanHostPreparationRequired {
    param(
        [Parameter(Mandatory = $true)][ValidateSet('wsl', 'hyperv')][string] $Provider,
        [Parameter(Mandatory = $true)] $HostFacts,
        [Parameter(Mandatory = $true)] $RuntimeFacts
    )

    if ($Provider -eq 'hyperv') {
        $storageReady = $null -eq $HostFacts.PSObject.Properties['hyper_v_storage_ready'] -or
            [bool]$HostFacts.hyper_v_storage_ready
        return -not [bool]$HostFacts.hyper_v_installed -or
            -not [bool]$RuntimeFacts.podman_hyperv_prepared -or
            -not $storageReady
    }
    return -not [bool]$HostFacts.wsl_ready
}

function Test-TalosArtifactFile {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory = $true)][string] $Path,
        [Parameter(Mandatory = $true)] $Entry
    )

    if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) {
        return $false
    }
    $file = Get-Item -LiteralPath $Path
    if ($file.Length -ne [int64]$Entry.bytes) {
        return $false
    }
    return (Get-TalosLowerSha256 -Path $Path) -eq [string]$Entry.sha256
}

function Assert-TalosPinnedPodmanExecutable {
    param(
        [Parameter(Mandatory = $true)][string] $Path,
        [Parameter(Mandatory = $true)] $Entry
    )

    if ($null -eq $Entry.PSObject.Properties['binary_bytes'] -or
        $null -eq $Entry.PSObject.Properties['binary_sha256'] -or
        [string]$Entry.binary_sha256 -notmatch '^[a-f0-9]{64}$') {
        throw 'Pinned Podman executable metadata is invalid.'
    }
    if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) {
        throw 'The pinned Podman executable is missing.'
    }
    $file = Get-Item -LiteralPath $Path
    if ([int64]$file.Length -ne [int64]$Entry.binary_bytes) {
        throw 'The pinned Podman executable byte length does not match the manifest.'
    }
    if ((Get-TalosLowerSha256 -Path $Path) -ne [string]$Entry.binary_sha256) {
        throw 'The pinned Podman executable digest does not match the manifest.'
    }
}

function Assert-TalosDownloadUri {
    param(
        [Parameter(Mandatory = $true)][Uri] $Uri,
        [Parameter(Mandatory = $true)][bool] $IsRedirect
    )

    $allowedHosts = if ($IsRedirect) {
        $script:AllowedInitialHosts + $script:AllowedRedirectHosts
    } else {
        $script:AllowedInitialHosts
    }
    if ($Uri.Scheme -ne 'https' -or $allowedHosts -notcontains $Uri.DnsSafeHost.ToLowerInvariant()) {
        throw "Container runtime download uses an untrusted download origin: $($Uri.GetLeftPart([UriPartial]::Authority))"
    }
}

function Copy-TalosBoundedStream {
    param(
        [Parameter(Mandatory = $true)][IO.Stream] $Source,
        [Parameter(Mandatory = $true)][IO.Stream] $Destination,
        [Parameter(Mandatory = $true)][int64] $ExpectedBytes,
        [ValidateRange(1, 3600)][int] $TimeoutSeconds = 1800
    )

    if ($ExpectedBytes -le 0) {
        throw 'Container runtime stream size must be positive.'
    }
    $buffer = New-Object byte[] 131072
    $total = [int64]0
    $cancellation = New-Object Threading.CancellationTokenSource
    $cancellation.CancelAfter([TimeSpan]::FromSeconds($TimeoutSeconds))
    try {
        while ($true) {
            $remainingWithSentinel = ($ExpectedBytes - $total) + 1
            $readLength = [int][Math]::Min([int64]$buffer.Length, $remainingWithSentinel)
            $read = $Source.ReadAsync($buffer, 0, $readLength, $cancellation.Token).GetAwaiter().GetResult()
            if ($read -eq 0) {
                break
            }
            $total += [int64]$read
            if ($total -gt $ExpectedBytes) {
                throw 'Container runtime download exceeded the pinned manifest size.'
            }
            $Destination.Write($buffer, 0, $read)
        }
    } catch [OperationCanceledException] {
        throw "Container runtime response body exceeded the $TimeoutSeconds second deadline."
    } finally {
        $cancellation.Dispose()
    }
    if ($total -lt $ExpectedBytes) {
        throw 'Container runtime download ended before the pinned manifest size.'
    }
}

function Invoke-TalosHttpsDownload {
    param(
        [Parameter(Mandatory = $true)][Uri] $Uri,
        [Parameter(Mandatory = $true)][string] $Destination,
        [Parameter(Mandatory = $true)][int64] $ExpectedBytes
    )

    Add-Type -AssemblyName System.Net.Http
    $handler = New-Object Net.Http.HttpClientHandler
    $handler.AllowAutoRedirect = $false
    $client = New-Object Net.Http.HttpClient($handler)
    $client.Timeout = [TimeSpan]::FromMinutes(30)
    try {
        $current = $Uri
        for ($redirect = 0; $redirect -le 5; $redirect++) {
            Assert-TalosDownloadUri -Uri $current -IsRedirect ($redirect -gt 0)
            $response = $client.GetAsync($current, [Net.Http.HttpCompletionOption]::ResponseHeadersRead).GetAwaiter().GetResult()
            try {
                if ([int]$response.StatusCode -in @(301, 302, 303, 307, 308)) {
                    if ($redirect -eq 5 -or $null -eq $response.Headers.Location) {
                        throw 'Container runtime download exceeded the redirect limit.'
                    }
                    $current = if ($response.Headers.Location.IsAbsoluteUri) {
                        $response.Headers.Location
                    } else {
                        [Uri]::new($current, $response.Headers.Location)
                    }
                    continue
                }
                if (-not $response.IsSuccessStatusCode) {
                    throw "Container runtime download failed with HTTP $([int]$response.StatusCode)."
                }
                $declaredLength = $response.Content.Headers.ContentLength
                if ($null -ne $declaredLength -and [int64]$declaredLength -ne $ExpectedBytes) {
                    throw 'Container runtime response Content-Length does not match the pinned manifest.'
                }
                $source = $response.Content.ReadAsStreamAsync().GetAwaiter().GetResult()
                try {
                    $destinationStream = [IO.File]::Open($Destination, [IO.FileMode]::CreateNew, [IO.FileAccess]::Write, [IO.FileShare]::None)
                    try {
                        Copy-TalosBoundedStream -Source $source -Destination $destinationStream -ExpectedBytes $ExpectedBytes
                    } finally {
                        $destinationStream.Dispose()
                    }
                } finally {
                    $source.Dispose()
                }
                return
            } finally {
                $response.Dispose()
            }
        }
    } finally {
        $client.Dispose()
        $handler.Dispose()
    }
}

function Get-TalosVerifiedArtifact {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory = $true)] $Entry,
        [Parameter(Mandatory = $true)][string] $Name,
        [Parameter(Mandatory = $true)][string] $DownloadsRoot,
        [scriptblock] $DownloadAction
    )

    Assert-TalosArtifactEntry -Entry $Entry -Name $Name
    New-Item -ItemType Directory -Force -Path $DownloadsRoot | Out-Null
    $normalizedRoot = [IO.Path]::GetFullPath($DownloadsRoot).TrimEnd([IO.Path]::DirectorySeparatorChar) + [IO.Path]::DirectorySeparatorChar
    $destination = [IO.Path]::GetFullPath((Join-Path $DownloadsRoot ([string]$Entry.archive)))
    if (-not $destination.StartsWith($normalizedRoot, [StringComparison]::OrdinalIgnoreCase)) {
        throw "Container runtime artifact '$Name' escapes the downloads directory."
    }
    if (Test-Path -LiteralPath $destination) {
        if (Test-TalosArtifactFile -Path $destination -Entry $Entry) {
            return $destination
        }
        Remove-Item -LiteralPath $destination -Force
    }

    $partial = $destination + '.partial-' + $PID + '-' + [Guid]::NewGuid().ToString('N')
    try {
        Write-Host "Downloading pinned $Name $($Entry.version)..."
        if ($null -ne $DownloadAction) {
            $null = & $DownloadAction ([Uri]([string]$Entry.url)) $partial
        } else {
            $null = Invoke-TalosHttpsDownload `
                -Uri ([Uri]([string]$Entry.url)) `
                -Destination $partial `
                -ExpectedBytes ([int64]$Entry.bytes)
        }
        if (-not (Test-Path -LiteralPath $partial -PathType Leaf)) {
            throw "Downloaded $Name was not written to the staging path."
        }
        if ((Get-Item -LiteralPath $partial).Length -ne [int64]$Entry.bytes) {
            throw "Downloaded $Name size does not match the pinned manifest."
        }
        if ((Get-TalosLowerSha256 -Path $partial) -ne [string]$Entry.sha256) {
            throw "Downloaded $Name failed SHA-256 verification."
        }
        Move-Item -LiteralPath $partial -Destination $destination
        return $destination
    } finally {
        if (Test-Path -LiteralPath $partial) {
            Remove-Item -LiteralPath $partial -Force
        }
    }
}

function Assert-TalosSafeZip {
    param([Parameter(Mandatory = $true)][string] $ArchivePath)

    Add-Type -AssemblyName System.IO.Compression
    Add-Type -AssemblyName System.IO.Compression.FileSystem
    $archive = [IO.Compression.ZipFile]::OpenRead($ArchivePath)
    try {
        $entryCount = 0
        $expandedBytes = [int64]0
        foreach ($entry in $archive.Entries) {
            $entryCount++
            $expandedBytes += [int64]$entry.Length
            $name = $entry.FullName.Replace('\', '/')
            if (-not (Test-TalosSafeRelativePath -Path $name)) {
                throw "Archive contains an unsafe path: $name"
            }
            $unixType = (($entry.ExternalAttributes -shr 16) -band 0xF000)
            if ($unixType -eq 0xA000) {
                throw "Archive contains an unsupported symbolic link: $name"
            }
            if ($entryCount -gt 20000 -or $expandedBytes -gt 2147483648) {
                throw 'Archive exceeds the container runtime extraction safety limits.'
            }
        }
    } finally {
        $archive.Dispose()
    }
}

function Replace-TalosDirectoryAtomically {
    param(
        [Parameter(Mandatory = $true)][string] $Source,
        [Parameter(Mandatory = $true)][string] $Destination
    )

    $backup = $Destination + '.backup-' + $PID + '-' + [Guid]::NewGuid().ToString('N')
    $hadDestination = Test-Path -LiteralPath $Destination
    if ($hadDestination) {
        Move-Item -LiteralPath $Destination -Destination $backup
    }
    try {
        Move-Item -LiteralPath $Source -Destination $Destination
    } catch {
        if (Test-Path -LiteralPath $Destination) {
            Remove-Item -LiteralPath $Destination -Recurse -Force
        }
        if ($hadDestination -and (Test-Path -LiteralPath $backup)) {
            Move-Item -LiteralPath $backup -Destination $Destination
        }
        throw
    }
    if (Test-Path -LiteralPath $backup) {
        Remove-Item -LiteralPath $backup -Recurse -Force
    }
}

function Install-TalosZipRuntime {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory = $true)] $Entry,
        [Parameter(Mandatory = $true)][string] $Name,
        [Parameter(Mandatory = $true)][string] $DownloadsRoot,
        [Parameter(Mandatory = $true)][string] $Destination,
        [Parameter(Mandatory = $true)][string] $ArchiveRoot,
        [Parameter(Mandatory = $true)][string] $RequiredBinary,
        [scriptblock] $DownloadAction
    )

    $archivePath = Get-TalosVerifiedArtifact -Entry $Entry -Name $Name -DownloadsRoot $DownloadsRoot -DownloadAction $DownloadAction
    Assert-TalosSafeZip -ArchivePath $archivePath
    $destinationParent = Split-Path -Parent ([IO.Path]::GetFullPath($Destination))
    New-Item -ItemType Directory -Force -Path $destinationParent | Out-Null
    $staging = Join-Path $destinationParent ('.talos-runtime-staging-' + [Guid]::NewGuid().ToString('N'))
    New-Item -ItemType Directory -Path $staging | Out-Null
    try {
        [IO.Compression.ZipFile]::ExtractToDirectory($archivePath, $staging)
        $source = if ([string]::IsNullOrWhiteSpace($ArchiveRoot)) { $staging } else { Join-Path $staging $ArchiveRoot }
        $requiredPath = Join-Path $source $RequiredBinary
        if (-not (Test-Path -LiteralPath $requiredPath -PathType Leaf)) {
            throw "$Name archive does not contain the expected $RequiredBinary."
        }
        Replace-TalosDirectoryAtomically -Source $source -Destination $Destination
    } finally {
        if (Test-Path -LiteralPath $staging) {
            Remove-Item -LiteralPath $staging -Recurse -Force
        }
    }
}

function Install-TalosFlatRuntime {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory = $true)] $Entry,
        [Parameter(Mandatory = $true)][string] $Name,
        [Parameter(Mandatory = $true)][string] $DownloadsRoot,
        [Parameter(Mandatory = $true)][string] $Destination,
        [scriptblock] $DownloadAction
    )

    $source = Get-TalosVerifiedArtifact -Entry $Entry -Name $Name -DownloadsRoot $DownloadsRoot -DownloadAction $DownloadAction
    $parent = Split-Path -Parent ([IO.Path]::GetFullPath($Destination))
    New-Item -ItemType Directory -Force -Path $parent | Out-Null
    $staging = $Destination + '.staging-' + [Guid]::NewGuid().ToString('N')
    try {
        Copy-Item -LiteralPath $source -Destination $staging
        if (-not (Test-TalosArtifactFile -Path $staging -Entry $Entry)) {
            throw "Installed $Name failed post-copy verification."
        }
        Move-Item -LiteralPath $staging -Destination $Destination -Force
    } finally {
        if (Test-Path -LiteralPath $staging) {
            Remove-Item -LiteralPath $staging -Force
        }
    }
}

function Enter-TalosRuntimeLock {
    [CmdletBinding()]
    param([Parameter(Mandatory = $true)][string] $LockPath)

    $parent = Split-Path -Parent $LockPath
    if ($parent) {
        New-Item -ItemType Directory -Force -Path $parent | Out-Null
    }
    try {
        return [IO.File]::Open($LockPath, [IO.FileMode]::OpenOrCreate, [IO.FileAccess]::ReadWrite, [IO.FileShare]::None)
    } catch [IO.IOException] {
        throw 'Another TALOS container runtime bootstrap is already running.'
    }
}

function Enter-TalosFileReadFences {
    param([Parameter(Mandatory = $true)][string[]] $Paths)

    if ($Paths.Count -eq 0) {
        throw 'At least one elevation input is required.'
    }
    $fences = New-Object 'Collections.Generic.List[IO.FileStream]'
    try {
        foreach ($path in $Paths) {
            $normalized = [IO.Path]::GetFullPath($path)
            if (-not (Test-Path -LiteralPath $normalized -PathType Leaf)) {
                throw "Elevation input is missing: $normalized"
            }
            $fence = [IO.File]::Open($normalized, [IO.FileMode]::Open, [IO.FileAccess]::Read, [IO.FileShare]::Read)
            $fences.Add($fence)
        }
        return ,$fences
    } catch {
        foreach ($fence in $fences) {
            $fence.Dispose()
        }
        throw
    }
}

function Get-TalosElevationIntegritySnapshot {
    param(
        [Parameter(Mandatory = $true)][string] $BootstrapPath,
        [Parameter(Mandatory = $true)][string] $ModulePath,
        [Parameter(Mandatory = $true)][string] $ManifestPath,
        [string] $PodmanPath = ''
    )

    foreach ($path in @($BootstrapPath, $ModulePath, $ManifestPath)) {
        if (-not (Test-Path -LiteralPath $path -PathType Leaf)) {
            throw "Elevation input is missing: $path"
        }
    }
    $podmanSha256 = ''
    if (-not [string]::IsNullOrWhiteSpace($PodmanPath)) {
        if (-not (Test-Path -LiteralPath $PodmanPath -PathType Leaf)) {
            throw "Elevation input is missing: $PodmanPath"
        }
        $podmanSha256 = Get-TalosLowerSha256 -Path $PodmanPath
    }
    return [pscustomobject]@{
        bootstrap_sha256 = Get-TalosLowerSha256 -Path $BootstrapPath
        module_sha256 = Get-TalosLowerSha256 -Path $ModulePath
        manifest_sha256 = Get-TalosLowerSha256 -Path $ManifestPath
        podman_sha256 = $podmanSha256
    }
}

function Write-TalosRuntimeState {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory = $true)][string] $Path,
        [Parameter(Mandatory = $true)][ValidateSet('detecting', 'downloading', 'installing', 'host_preparation_required', 'restart_required', 'machine_initializing', 'starting', 'ready', 'failed')][string] $Status,
        [Parameter(Mandatory = $true)][hashtable] $Data
    )

    if ($Status -eq 'ready') {
        if (-not $Data.ContainsKey('engine_healthy') -or -not [bool]$Data.engine_healthy -or
            -not $Data.ContainsKey('compose_healthy') -or -not [bool]$Data.compose_healthy) {
            throw 'Container runtime cannot be marked ready without healthy engine and Compose evidence.'
        }
    }
    $state = [ordered]@{
        schema_version = $script:StateSchema
        status = $Status
        updated_at = [DateTime]::UtcNow.ToString('o')
    }
    foreach ($key in $Data.Keys) {
        if ([string]$key -match '(?i)(secret|token|password|api[_-]?key)') {
            continue
        }
        $state[[string]$key] = $Data[$key]
    }
    $json = $state | ConvertTo-Json -Depth 8
    $parent = Split-Path -Parent $Path
    New-Item -ItemType Directory -Force -Path $parent | Out-Null
    $temporary = $Path + '.partial-' + $PID
    try {
        Write-TalosUtf8File -Path $temporary -Contents $json
        Move-Item -LiteralPath $temporary -Destination $Path -Force
    } finally {
        if (Test-Path -LiteralPath $temporary) {
            Remove-Item -LiteralPath $temporary -Force
        }
    }
}

function Invoke-TalosNativeCapture {
    param(
        [Parameter(Mandatory = $true)][string] $Executable,
        [string[]] $Arguments = @()
    )

    $previousPreference = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    try {
        $lines = @(& $Executable @Arguments 2>&1 | ForEach-Object { $_.ToString() })
        $exitCode = $LASTEXITCODE
    } catch {
        $lines = @($_.Exception.Message)
        $exitCode = 1
    } finally {
        $ErrorActionPreference = $previousPreference
    }
    return [pscustomobject]@{
        ExitCode = $exitCode
        Output = ($lines -join [Environment]::NewLine)
    }
}

function Get-TalosSuccessfulOutputLine {
    param([Parameter(Mandatory = $true)] $Capture)

    if ([int]$Capture.ExitCode -ne 0 -or [string]::IsNullOrWhiteSpace([string]$Capture.Output)) {
        return ''
    }
    $line = @([string]$Capture.Output -split '\r?\n' | Where-Object { -not [string]::IsNullOrWhiteSpace($_) } | Select-Object -First 1)
    if ($line.Count -eq 0) {
        return ''
    }
    return ([string]$line[0]).Trim()
}

function Get-TalosComposeProviderFacts {
    param([Parameter(Mandatory = $true)][string] $Executable)

    $capture = Invoke-TalosNativeCapture -Executable $Executable -Arguments @('version')
    return [pscustomobject]@{
        healthy = $capture.ExitCode -eq 0
        version = Get-TalosSuccessfulOutputLine -Capture $capture
    }
}

function Get-TalosRuntimePaths {
    param([Parameter(Mandatory = $true)][string] $WorkspaceRoot)

    $workspace = [IO.Path]::GetFullPath($WorkspaceRoot)
    $runtimeRoot = Join-Path $workspace '.tools\container-runtime'
    return [pscustomobject]@{
        workspace = $workspace
        root = $runtimeRoot
        downloads = Join-Path $runtimeRoot 'downloads'
        manifest = Join-Path $workspace 'scripts\container-runtime\manifest.json'
        podman_root = Join-Path $runtimeRoot 'podman'
        podman_exe = Join-Path $runtimeRoot 'podman\usr\bin\podman.exe'
        compose_exe = Join-Path $runtimeRoot 'compose\docker-compose.exe'
        state = Join-Path $runtimeRoot 'state.json'
        lock = Join-Path $runtimeRoot '.bootstrap.lock'
    }
}

function Find-TalosDockerExecutable {
    $candidates = New-Object Collections.Generic.List[string]
    foreach ($name in @('docker.exe', 'docker')) {
        $command = Get-Command $name -ErrorAction SilentlyContinue | Select-Object -First 1
        if ($null -ne $command -and -not [string]::IsNullOrWhiteSpace([string]$command.Source)) {
            $candidates.Add([string]$command.Source)
        }
    }
    if (-not [string]::IsNullOrWhiteSpace($env:LOCALAPPDATA)) {
        $candidates.Add((Join-Path $env:LOCALAPPDATA 'Programs\DockerDesktop\resources\bin\docker.exe'))
    }
    if (-not [string]::IsNullOrWhiteSpace($env:ProgramFiles)) {
        $candidates.Add((Join-Path $env:ProgramFiles 'Docker\Docker\resources\bin\docker.exe'))
    }
    foreach ($candidate in $candidates | Select-Object -Unique) {
        if (Test-Path -LiteralPath $candidate -PathType Leaf) {
            return [IO.Path]::GetFullPath($candidate)
        }
    }
    return $null
}

function Find-TalosDockerDesktopExecutable {
    $candidates = @()
    if (-not [string]::IsNullOrWhiteSpace($env:LOCALAPPDATA)) {
        $candidates += Join-Path $env:LOCALAPPDATA 'Programs\DockerDesktop\Docker Desktop.exe'
    }
    if (-not [string]::IsNullOrWhiteSpace($env:ProgramFiles)) {
        $candidates += Join-Path $env:ProgramFiles 'Docker\Docker\Docker Desktop.exe'
    }
    foreach ($candidate in $candidates) {
        if (Test-Path -LiteralPath $candidate -PathType Leaf) {
            return [IO.Path]::GetFullPath($candidate)
        }
    }
    return $null
}

function Find-TalosPodmanExecutable {
    param([Parameter(Mandatory = $true)] $Paths)

    if (Test-Path -LiteralPath $Paths.podman_exe -PathType Leaf) {
        return [string]$Paths.podman_exe
    }
    foreach ($name in @('podman.exe', 'podman')) {
        $command = Get-Command $name -ErrorAction SilentlyContinue | Select-Object -First 1
        if ($null -ne $command -and -not [string]::IsNullOrWhiteSpace([string]$command.Source)) {
            return [string]$command.Source
        }
    }
    return $null
}

function Get-TalosPodmanMachineName {
    $machineName = if ([string]::IsNullOrWhiteSpace($env:TALOS_PODMAN_MACHINE)) {
        'talos-machine'
    } else {
        $env:TALOS_PODMAN_MACHINE.Trim()
    }
    if ($machineName -notmatch '^[A-Za-z0-9][A-Za-z0-9_.-]{0,63}$') {
        throw 'TALOS_PODMAN_MACHINE must use 1-64 letters, digits, dots, underscores, or hyphens.'
    }
    return $machineName
}

function Invoke-TalosPodmanConnectionCapture {
    param(
        [Parameter(Mandatory = $true)][string] $Executable,
        [Parameter(Mandatory = $true)][string] $MachineName,
        [Parameter(Mandatory = $true)][string[]] $Arguments
    )

    return Invoke-TalosNativeCapture `
        -Executable $Executable `
        -Arguments (@('--connection', $MachineName) + $Arguments)
}

function Get-TalosPodmanMachineState {
    param(
        [Parameter(Mandatory = $true)][string] $Executable,
        [Parameter(Mandatory = $true)][string] $MachineName
    )

    $capture = Invoke-TalosNativeCapture `
        -Executable $Executable `
        -Arguments @('machine', 'inspect', '--format', '{{.State}}', $MachineName)
    $state = Get-TalosSuccessfulOutputLine -Capture $capture
    if ([string]::IsNullOrWhiteSpace($state)) {
        return 'not_initialized'
    }
    return $state
}

function Invoke-TalosWithComposeProvider {
    param(
        [Parameter(Mandatory = $true)][string] $PodmanExecutable,
        [Parameter(Mandatory = $true)][string] $ComposeProvider,
        [Parameter(Mandatory = $true)][string] $MachineName,
        [Parameter(Mandatory = $true)][string[]] $Arguments
    )

    $previousProvider = $env:PODMAN_COMPOSE_PROVIDER
    $previousWarning = $env:PODMAN_COMPOSE_WARNING_LOGS
    try {
        $env:PODMAN_COMPOSE_PROVIDER = $ComposeProvider
        $env:PODMAN_COMPOSE_WARNING_LOGS = 'false'
        return Invoke-TalosPodmanConnectionCapture `
            -Executable $PodmanExecutable `
            -MachineName $MachineName `
            -Arguments (@('compose') + $Arguments)
    } finally {
        if ($null -eq $previousProvider) {
            Remove-Item Env:PODMAN_COMPOSE_PROVIDER -ErrorAction SilentlyContinue
        } else {
            $env:PODMAN_COMPOSE_PROVIDER = $previousProvider
        }
        if ($null -eq $previousWarning) {
            Remove-Item Env:PODMAN_COMPOSE_WARNING_LOGS -ErrorAction SilentlyContinue
        } else {
            $env:PODMAN_COMPOSE_WARNING_LOGS = $previousWarning
        }
    }
}

function Get-TalosRuntimeFacts {
    param([Parameter(Mandatory = $true)] $Paths)

    $docker = Find-TalosDockerExecutable
    $dockerInstalled = $null -ne $docker
    $dockerHealthy = $false
    $dockerVersion = ''
    $dockerComposeVersion = ''
    $dockerComposeHealthy = $false
    if ($dockerInstalled) {
        $dockerVersionCapture = Invoke-TalosNativeCapture -Executable $docker -Arguments @('--version')
        $dockerInfo = Invoke-TalosNativeCapture -Executable $docker -Arguments @('info')
        $dockerCompose = Invoke-TalosNativeCapture -Executable $docker -Arguments @('compose', 'version')
        $dockerVersion = Get-TalosSuccessfulOutputLine -Capture $dockerVersionCapture
        $dockerComposeVersion = Get-TalosSuccessfulOutputLine -Capture $dockerCompose
        $dockerComposeHealthy = $dockerCompose.ExitCode -eq 0
        $dockerHealthy = $dockerInfo.ExitCode -eq 0 -and $dockerComposeHealthy
    }

    $podman = Find-TalosPodmanExecutable -Paths $Paths
    $podmanInstalled = $null -ne $podman
    $podmanHealthy = $false
    $podmanPrepared = $false
    $podmanVersion = ''
    $podmanComposeVersion = ''
    $podmanComposeHealthy = $false
    $podmanMachineState = 'unavailable'
    if ($podmanInstalled) {
        $podmanMachineName = Get-TalosPodmanMachineName
        $podmanVersionCapture = Invoke-TalosNativeCapture -Executable $podman -Arguments @('--version')
        $podmanVersion = Get-TalosSuccessfulOutputLine -Capture $podmanVersionCapture
        $podmanMachineState = Get-TalosPodmanMachineState -Executable $podman -MachineName $podmanMachineName
        $prep = Invoke-TalosNativeCapture -Executable $podman -Arguments @('system', 'hyperv-prep', '--status')
        $persistedMembership = $false
        try {
            $requestingUser = [Security.Principal.WindowsIdentity]::GetCurrent().User
            if ($null -ne $requestingUser) {
                $persistedMembership = Test-TalosPersistedHyperVRequestingUserAccess -RequestingUserSid $requestingUser.Value
            }
        } catch {
            $persistedMembership = $false
        }
        $podmanPrepared = Test-TalosPodmanHyperVPrepared `
            -StatusCapture $prep `
            -PersistedMembership $persistedMembership
        if (Test-Path -LiteralPath $Paths.compose_exe -PathType Leaf) {
            $composeProvider = Get-TalosComposeProviderFacts -Executable $Paths.compose_exe
            $podmanInfo = Invoke-TalosPodmanConnectionCapture -Executable $podman -MachineName $podmanMachineName -Arguments @('info')
            $podmanCompose = Invoke-TalosWithComposeProvider `
                -PodmanExecutable $podman `
                -ComposeProvider $Paths.compose_exe `
                -MachineName $podmanMachineName `
                -Arguments @('version')
            $podmanComposeVersion = [string]$composeProvider.version
            $podmanComposeHealthy = [bool]$composeProvider.healthy
            $podmanHealthy = $podmanMachineState -eq 'running' -and
                $podmanInfo.ExitCode -eq 0 -and
                $podmanCompose.ExitCode -eq 0
        }
    }

    return [pscustomobject]@{
        docker_installed = $dockerInstalled
        docker_healthy = $dockerHealthy
        docker_executable = $docker
        docker_version = $dockerVersion
        docker_compose_version = $dockerComposeVersion
        docker_compose_healthy = $dockerComposeHealthy
        podman_installed = $podmanInstalled
        podman_healthy = $podmanHealthy
        podman_executable = $podman
        podman_version = $podmanVersion
        podman_compose_version = $podmanComposeVersion
        podman_compose_healthy = $podmanComposeHealthy
        podman_hyperv_prepared = $podmanPrepared
        podman_machine_state = $podmanMachineState
        compose_installed = Test-Path -LiteralPath $Paths.compose_exe -PathType Leaf
    }
}

function Test-TalosSelectedRuntimeHealthy {
    param(
        [Parameter(Mandatory = $true)][string] $Kind,
        [Parameter(Mandatory = $true)] $RuntimeFacts
    )

    switch ($Kind) {
        'docker' { return [bool]$RuntimeFacts.docker_healthy }
        'podman' { return [bool]$RuntimeFacts.podman_healthy }
        default { return $false }
    }
}

function Test-TalosTruthy {
    param([string] $Value)
    return $Value -in @('1', 'true', 'TRUE', 'yes', 'YES', 'on', 'ON')
}

function Get-TalosBoundedEnvironmentInteger {
    param(
        [Parameter(Mandatory = $true)][string] $Name,
        [Parameter(Mandatory = $true)][int] $Default,
        [Parameter(Mandatory = $true)][int] $Minimum,
        [Parameter(Mandatory = $true)][int] $Maximum
    )

    $raw = [Environment]::GetEnvironmentVariable($Name)
    if ([string]::IsNullOrWhiteSpace($raw)) {
        return $Default
    }
    $parsed = 0
    if (-not [int]::TryParse($raw, [ref]$parsed) -or $parsed -lt $Minimum -or $parsed -gt $Maximum) {
        throw "$Name must be an integer between $Minimum and $Maximum."
    }
    return $parsed
}

function Wait-TalosNativeHealth {
    param(
        [Parameter(Mandatory = $true)][scriptblock] $Probe,
        [Parameter(Mandatory = $true)][int] $TimeoutSeconds,
        [Parameter(Mandatory = $true)][string] $FailureMessage
    )

    $deadline = [DateTime]::UtcNow.AddSeconds($TimeoutSeconds)
    do {
        if (& $Probe) {
            return
        }
        Start-Sleep -Seconds 2
    } while ([DateTime]::UtcNow -lt $deadline)
    throw $FailureMessage
}

function Test-TalosAdministrator {
    $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
    $principal = New-Object Security.Principal.WindowsPrincipal($identity)
    return $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

function Get-TalosHyperVAccessGrant {
    param([Parameter(Mandatory = $true)][string] $RequestingUserSid)

    try {
        $userSid = [Security.Principal.SecurityIdentifier]::new($RequestingUserSid)
    } catch {
        throw 'The requesting Windows user SID is not a valid security identifier.'
    }
    return [pscustomobject]@{
        group_sid = [Security.Principal.SecurityIdentifier]::new('S-1-5-32-578')
        user_sid = $userSid
    }
}

function Get-TalosMemberSidValue {
    param($Member)

    if ($Member -is [Security.Principal.SecurityIdentifier]) {
        return $Member.Value
    }
    if ($null -ne $Member -and $null -ne $Member.PSObject.Properties['SID'] -and $null -ne $Member.SID) {
        return [string]$Member.SID.Value
    }
    return ''
}

function Test-TalosPersistedHyperVRequestingUserAccess {
    param(
        [Parameter(Mandatory = $true)][string] $RequestingUserSid,
        [scriptblock] $MemberLookup
    )

    $grant = Get-TalosHyperVAccessGrant -RequestingUserSid $RequestingUserSid
    if ($null -eq $MemberLookup) {
        $MemberLookup = {
            param($GroupSid)
            return @(Get-LocalGroupMember -SID $GroupSid -ErrorAction Stop)
        }
    }
    try {
        $members = @(& $MemberLookup $grant.group_sid)
    } catch {
        return $false
    }
    foreach ($member in $members) {
        if ((Get-TalosMemberSidValue -Member $member) -eq $grant.user_sid.Value) {
            return $true
        }
    }
    return $false
}

function Test-TalosPodmanHyperVPrepared {
    param(
        [Parameter(Mandatory = $true)] $StatusCapture,
        [Parameter(Mandatory = $true)][bool] $PersistedMembership
    )

    $vsockPrepared = [int]$StatusCapture.ExitCode -eq 0 -and
        [string]$StatusCapture.Output -match '(?i)vsock' -and
        [string]$StatusCapture.Output -notmatch '(?i)No vsock'
    if (-not $vsockPrepared) {
        return $false
    }
    $tokenReportsMembership = [string]$StatusCapture.Output -notmatch '(?i)NOT a member'
    return $tokenReportsMembership -or $PersistedMembership
}

function Ensure-TalosHyperVRequestingUserAccess {
    param(
        [Parameter(Mandatory = $true)][string] $RequestingUserSid,
        [scriptblock] $MemberLookup,
        [scriptblock] $MemberAdd
    )

    $grant = Get-TalosHyperVAccessGrant -RequestingUserSid $RequestingUserSid
    if ($null -eq $MemberLookup) {
        $MemberLookup = {
            param($GroupSid)
            return @(Get-LocalGroupMember -SID $GroupSid -ErrorAction Stop)
        }
    }
    if ($null -eq $MemberAdd) {
        $MemberAdd = {
            param($GroupSid, $UserSidText)
            Add-LocalGroupMember -SID $GroupSid -Member $UserSidText -ErrorAction Stop
        }
    }
    if (Test-TalosPersistedHyperVRequestingUserAccess -RequestingUserSid $RequestingUserSid -MemberLookup $MemberLookup) {
        return $false
    }
    $null = & $MemberAdd $grant.group_sid $grant.user_sid.Value
    return $true
}

function Write-TalosElevatedResult {
    param(
        [Parameter(Mandatory = $true)][string] $WorkspaceRoot,
        [Parameter(Mandatory = $true)][string] $ResultPath,
        [Parameter(Mandatory = $true)] $Result
    )

    $paths = Get-TalosRuntimePaths -WorkspaceRoot $WorkspaceRoot
    $normalizedRoot = [IO.Path]::GetFullPath($paths.root).TrimEnd([IO.Path]::DirectorySeparatorChar) + [IO.Path]::DirectorySeparatorChar
    $normalizedResult = [IO.Path]::GetFullPath($ResultPath)
    if (-not $normalizedResult.StartsWith($normalizedRoot, [StringComparison]::OrdinalIgnoreCase)) {
        throw 'Elevated preparation result path escapes the TALOS runtime directory.'
    }
    Write-TalosUtf8File -Path $normalizedResult -Contents ($Result | ConvertTo-Json -Depth 6)
}

function Invoke-TalosElevatedPreparation {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory = $true)][string] $WorkspaceRoot,
        [Parameter(Mandatory = $true)][ValidateSet('docker-wsl', 'podman-wsl', 'podman-hyperv')][string] $Mode,
        [Parameter(Mandatory = $true)][string] $ResultPath,
        [string] $RequestingUserSid = ''
    )

    if (-not (Test-TalosAdministrator)) {
        throw 'TALOS elevated host preparation requires an administrator token.'
    }
    $paths = Get-TalosRuntimePaths -WorkspaceRoot $WorkspaceRoot
    $manifest = Test-TalosRuntimeManifest -ManifestPath $paths.manifest
    $restartRequired = $false
    $featureChanged = $false
    $changes = New-Object Collections.Generic.List[string]
    try {
        if ($Mode -in @('docker-wsl', 'podman-wsl')) {
            $wsl = Get-TalosWindowsSystemExecutablePath -RelativePath 'wsl.exe'
            $install = Invoke-TalosNativeCapture -Executable $wsl -Arguments @('--install', '--no-distribution')
            if ($install.ExitCode -ne 0) {
                throw "WSL installation failed: $($install.Output)"
            }
            $update = Invoke-TalosNativeCapture -Executable $wsl -Arguments @('--update')
            if ($update.ExitCode -ne 0) {
                throw "WSL update failed: $($update.Output)"
            }
            $changes.Add('wsl')
            $restartRequired = $true
        }

        if ($Mode -eq 'podman-hyperv') {
            if ([string]::IsNullOrWhiteSpace($RequestingUserSid)) {
                throw 'Podman Hyper-V preparation requires the requesting Windows user SID.'
            }
            $os = Get-CimInstance Win32_OperatingSystem
            if ([int]$os.ProductType -eq 1) {
                $feature = Get-WindowsOptionalFeature -Online -FeatureName Microsoft-Hyper-V-All -ErrorAction Stop
                if ([string]$feature.State -ne 'Enabled') {
                    $featureResult = Enable-WindowsOptionalFeature -Online -FeatureName Microsoft-Hyper-V-All -All -NoRestart -ErrorAction Stop
                    $restartRequired = $restartRequired -or [bool]$featureResult.RestartNeeded
                    $featureChanged = $true
                    $changes.Add('hyper-v')
                }
            } else {
                Import-Module ServerManager -ErrorAction Stop
                $feature = Get-WindowsFeature -Name Hyper-V -ErrorAction Stop
                if (-not [bool]$feature.Installed) {
                    $featureResult = Install-WindowsFeature -Name Hyper-V -IncludeManagementTools -Restart:$false -ErrorAction Stop
                    if (-not [bool]$featureResult.Success) {
                        throw 'Windows Server failed to install the Hyper-V feature.'
                    }
                    $restartRequired = $restartRequired -or [string]$featureResult.RestartNeeded -ne 'No'
                    $featureChanged = $true
                    $changes.Add('hyper-v')
                }
            }
            $storageFacts = Get-TalosHyperVStorageFacts -HyperVInstalled $true
            if (-not [string]::IsNullOrWhiteSpace([string]$storageFacts.error)) {
                throw "Hyper-V storage configuration could not be inspected safely: $($storageFacts.error)"
            }
            $storagePlan = Resolve-TalosHyperVStoragePlan `
                -VirtualMachinePath ([string]$storageFacts.virtual_machine_path) `
                -VirtualHardDiskPath ([string]$storageFacts.virtual_hard_disk_path)
            foreach ($createdPath in @(Ensure-TalosHyperVStoragePaths -StoragePlan $storagePlan)) {
                $changes.Add('hyper-v-storage-directory')
            }
            $bcdedit = Get-TalosWindowsSystemExecutablePath -RelativePath 'bcdedit.exe'
            $bcd = Invoke-TalosNativeCapture -Executable $bcdedit -Arguments @('/set', 'hypervisorlaunchtype', 'auto')
            if ($bcd.ExitCode -ne 0) {
                throw "Unable to enable the Windows hypervisor launch type: $($bcd.Output)"
            }
            $podman = [string]$paths.podman_exe
            Assert-TalosPinnedPodmanExecutable -Path $podman -Entry $manifest.windows_x64.podman
            $prep = Invoke-TalosNativeCapture -Executable $podman -Arguments @('system', 'hyperv-prep')
            if ($prep.ExitCode -ne 0) {
                throw "Podman Hyper-V preparation failed: $($prep.Output)"
            }
            $changes.Add('podman-hyperv-prep')
            $accessChanged = Ensure-TalosHyperVRequestingUserAccess -RequestingUserSid $RequestingUserSid
            if ($accessChanged) {
                $changes.Add('requesting-user-hyper-v-access')
            }
            $computer = Get-CimInstance Win32_ComputerSystem
            $restartRequired = $restartRequired -or (Test-TalosHyperVRestartRequired `
                -FeatureChanged $featureChanged `
                -AccessChanged $accessChanged `
                -HypervisorPresent ([bool]$computer.HypervisorPresent))
        }

        $result = [ordered]@{
            schema_version = 'talos.container-runtime.elevated-result.v1'
            exit_code = 0
            status = 'prepared'
            mode = $Mode
            restart_required = $restartRequired
            changes = @($changes)
        }
        Write-TalosElevatedResult -WorkspaceRoot $WorkspaceRoot -ResultPath $ResultPath -Result $result
        return [pscustomobject]$result
    } catch {
        $result = [ordered]@{
            schema_version = 'talos.container-runtime.elevated-result.v1'
            exit_code = 1
            status = 'failed'
            mode = $Mode
            restart_required = $false
            error = $_.Exception.Message
        }
        Write-TalosElevatedResult -WorkspaceRoot $WorkspaceRoot -ResultPath $ResultPath -Result $result
        return [pscustomobject]$result
    }
}

function Quote-TalosWindowsArgument {
    param([Parameter(Mandatory = $true)][string] $Value)
    if ($Value.Contains('"')) {
        throw 'A Windows bootstrap argument contains an unsupported quote character.'
    }
    return '"' + $Value + '"'
}

function Invoke-TalosElevatedChild {
    param(
        [Parameter(Mandatory = $true)][string] $WorkspaceRoot,
        [Parameter(Mandatory = $true)][string] $BootstrapScriptPath,
        [Parameter(Mandatory = $true)][string] $Mode,
        [Parameter(Mandatory = $true)] $Paths
    )

    $bootstrapPath = [IO.Path]::GetFullPath($BootstrapScriptPath)
    $modulePath = Join-Path (Split-Path -Parent $bootstrapPath) 'Talos.ContainerRuntime.psm1'
    $manifest = Test-TalosRuntimeManifest -ManifestPath $Paths.manifest
    $podmanPath = if ($Mode -eq 'podman-hyperv') { [string]$Paths.podman_exe } else { '' }
    if ($Mode -eq 'podman-hyperv') {
        Assert-TalosPinnedPodmanExecutable -Path $podmanPath -Entry $manifest.windows_x64.podman
    }
    $integrity = Get-TalosElevationIntegritySnapshot `
        -BootstrapPath $bootstrapPath `
        -ModulePath $modulePath `
        -ManifestPath $Paths.manifest `
        -PodmanPath $podmanPath
    $fencePaths = @($bootstrapPath, $modulePath, [string]$Paths.manifest)
    if (-not [string]::IsNullOrWhiteSpace($podmanPath)) {
        $fencePaths += $podmanPath
    }
    $fences = Enter-TalosFileReadFences -Paths $fencePaths
    $powerShell = Get-TalosWindowsSystemExecutablePath -RelativePath 'WindowsPowerShell\v1.0\powershell.exe'
    $requestingUser = [Security.Principal.WindowsIdentity]::GetCurrent().User
    if ($null -eq $requestingUser) {
        throw 'TALOS could not determine the requesting Windows user SID.'
    }
    $requestingUserSid = $requestingUser.Value
    $resultPath = Join-Path $Paths.root ('elevated-result-' + [Guid]::NewGuid().ToString('N') + '.json')
    $argumentList = @(
        '-NoLogo',
        '-NoProfile',
        '-ExecutionPolicy',
        'Bypass',
        '-File',
        (Quote-TalosWindowsArgument -Value $bootstrapPath),
        '-WorkspaceRoot',
        (Quote-TalosWindowsArgument -Value ([IO.Path]::GetFullPath($WorkspaceRoot))),
        '-Action',
        'PrepareElevated',
        '-ElevatedMode',
        $Mode,
        '-ResultPath',
        (Quote-TalosWindowsArgument -Value $resultPath),
        '-ExpectedBootstrapSha256',
        [string]$integrity.bootstrap_sha256,
        '-ExpectedModuleSha256',
        [string]$integrity.module_sha256,
        '-ExpectedManifestSha256',
        [string]$integrity.manifest_sha256,
        '-RequestingUserSid',
        $requestingUserSid
    )
    if (-not [string]::IsNullOrWhiteSpace([string]$integrity.podman_sha256)) {
        $argumentList += @('-ExpectedPodmanSha256', [string]$integrity.podman_sha256)
    }
    try {
        try {
            $process = Start-Process -FilePath $powerShell -ArgumentList $argumentList -Verb RunAs -WindowStyle Hidden -Wait -PassThru
        } catch {
            throw "TALOS host preparation was cancelled or could not elevate: $($_.Exception.Message)"
        }
        if (-not (Test-Path -LiteralPath $resultPath -PathType Leaf)) {
            throw "Elevated TALOS host preparation returned no result (exit $($process.ExitCode))."
        }
        $result = Get-Content -LiteralPath $resultPath -Raw | ConvertFrom-Json
        if ([int]$result.exit_code -ne 0) {
            throw "Elevated TALOS host preparation failed: $($result.error)"
        }
        return $result
    } finally {
        foreach ($fence in $fences) {
            $fence.Dispose()
        }
        if (Test-Path -LiteralPath $resultPath) {
            Remove-Item -LiteralPath $resultPath -Force
        }
    }
}

function Test-TalosDockerLicenseAccepted {
    if (Test-TalosTruthy -Value $env:TALOS_DOCKER_DESKTOP_LICENSE_ACCEPTED) {
        return $true
    }
    if ([Console]::IsInputRedirected) {
        return $false
    }
    Write-Host 'Docker Desktop uses the Docker Subscription Service Agreement:'
    Write-Host 'https://www.docker.com/legal/docker-subscription-service-agreement/'
    $answer = Read-Host 'Type ACCEPT to install pinned Docker Desktop 4.82.0 per-user'
    return $answer -ceq 'ACCEPT'
}

function Ensure-TalosDockerDesktop {
    param(
        [Parameter(Mandatory = $true)] $Manifest,
        [Parameter(Mandatory = $true)] $Paths,
        [Parameter(Mandatory = $true)] $RuntimeFacts
    )

    $docker = $RuntimeFacts.docker_executable
    if ($null -eq $docker) {
        if (-not (Test-TalosDockerLicenseAccepted)) {
            throw 'Docker Desktop license acceptance is required. Re-run interactively or set TALOS_DOCKER_DESKTOP_LICENSE_ACCEPTED=1 after reviewing the agreement.'
        }
        $installer = Get-TalosVerifiedArtifact -Entry $Manifest.windows_x64.docker_desktop -Name 'Docker Desktop' -DownloadsRoot $Paths.downloads
        $signature = Get-AuthenticodeSignature -LiteralPath $installer
        if ([string]$signature.Status -ne 'Valid' -or
            $null -eq $signature.SignerCertificate -or
            $signature.SignerCertificate.Subject -notlike "*$($Manifest.windows_x64.docker_desktop.authenticode_subject)*") {
            throw 'Docker Desktop installer failed Authenticode verification.'
        }
        Write-Host 'Installing pinned Docker Desktop in per-user WSL 2 mode...'
        $install = Start-Process -FilePath $installer -ArgumentList @(
            'install', '--user', '--quiet', '--accept-license', '--backend=wsl-2', '--no-windows-containers'
        ) -WindowStyle Hidden -Wait -PassThru
        if ($install.ExitCode -ne 0) {
            throw "Docker Desktop installer failed with exit code $($install.ExitCode)."
        }
        $docker = Find-TalosDockerExecutable
    }
    if ($null -eq $docker) {
        throw 'Docker CLI is still unavailable after Docker Desktop installation.'
    }
    $desktop = Find-TalosDockerDesktopExecutable
    if ($null -ne $desktop) {
        Start-Process -FilePath $desktop -ArgumentList @('--minimized') -WindowStyle Hidden | Out-Null
    }
    Wait-TalosNativeHealth -TimeoutSeconds 300 -FailureMessage 'Docker Desktop did not become healthy within 300 seconds.' -Probe {
        $info = Invoke-TalosNativeCapture -Executable $docker -Arguments @('info')
        $compose = Invoke-TalosNativeCapture -Executable $docker -Arguments @('compose', 'version')
        return $info.ExitCode -eq 0 -and $compose.ExitCode -eq 0
    }
    return $docker
}

function Ensure-TalosPodmanBinaries {
    param(
        [Parameter(Mandatory = $true)] $Manifest,
        [Parameter(Mandatory = $true)] $Paths
    )

    $podmanValid = $false
    try {
        Assert-TalosPinnedPodmanExecutable -Path $Paths.podman_exe -Entry $Manifest.windows_x64.podman
        $podmanVersion = Invoke-TalosNativeCapture -Executable $Paths.podman_exe -Arguments @('--version')
        $podmanValid = $podmanVersion.ExitCode -eq 0 -and
            $podmanVersion.Output -match ('\b' + [regex]::Escape([string]$Manifest.windows_x64.podman.version) + '\b')
    } catch {
        $podmanValid = $false
    }
    if (-not $podmanValid) {
        Install-TalosZipRuntime `
            -Entry $Manifest.windows_x64.podman `
            -Name 'Podman' `
            -DownloadsRoot $Paths.downloads `
            -Destination $Paths.podman_root `
            -ArchiveRoot ([string]$Manifest.windows_x64.podman.archive_root) `
            -RequiredBinary 'usr\bin\podman.exe'
        Assert-TalosPinnedPodmanExecutable -Path $Paths.podman_exe -Entry $Manifest.windows_x64.podman
    }
    if (-not (Test-TalosArtifactFile -Path $Paths.compose_exe -Entry $Manifest.windows_x64.compose)) {
        Install-TalosFlatRuntime `
            -Entry $Manifest.windows_x64.compose `
            -Name 'Docker Compose provider' `
            -DownloadsRoot $Paths.downloads `
            -Destination $Paths.compose_exe
    }
}

function Ensure-TalosPodmanMachine {
    param(
        [Parameter(Mandatory = $true)] $Paths,
        [Parameter(Mandatory = $true)] $HostFacts,
        [Parameter(Mandatory = $true)][string] $Provider
    )

    $podman = [string]$Paths.podman_exe
    $machineName = Get-TalosPodmanMachineName
    $cpuMaximum = [Math]::Max(2, [int]$HostFacts.logical_processors)
    $cpuDefault = [Math]::Min(8, $cpuMaximum)
    $memoryMaximum = if ([int]$HostFacts.total_memory_mb -gt 0) {
        [Math]::Max(4096, [Math]::Min(65536, [int][Math]::Floor([int]$HostFacts.total_memory_mb * 0.75)))
    } else {
        32768
    }
    $memoryDefault = [Math]::Min(8192, $memoryMaximum)
    $cpus = Get-TalosBoundedEnvironmentInteger -Name 'TALOS_PODMAN_CPUS' -Default $cpuDefault -Minimum 2 -Maximum $cpuMaximum
    $memory = Get-TalosBoundedEnvironmentInteger -Name 'TALOS_PODMAN_MEMORY_MB' -Default $memoryDefault -Minimum 4096 -Maximum $memoryMaximum
    $disk = Get-TalosBoundedEnvironmentInteger -Name 'TALOS_PODMAN_DISK_GB' -Default 100 -Minimum 50 -Maximum 1024

    $inspect = Invoke-TalosNativeCapture -Executable $podman -Arguments @('machine', 'inspect', $machineName)
    if ($inspect.ExitCode -ne 0) {
        Write-Host "Initializing Podman Machine '$machineName' with $cpus CPU, $memory MiB RAM, and $disk GiB disk..."
        $init = Invoke-TalosNativeCapture -Executable $podman -Arguments @(
            'machine', 'init', '--provider', $Provider, '--cpus', [string]$cpus,
            '--memory', [string]$memory, '--disk-size', [string]$disk,
            '--now', '--update-connection', '--import-native-ca', $machineName
        )
        if ($init.ExitCode -ne 0) {
            throw "Podman Machine initialization failed: $($init.Output)"
        }
    } else {
        $info = Invoke-TalosPodmanConnectionCapture -Executable $podman -MachineName $machineName -Arguments @('info')
        if ($info.ExitCode -ne 0) {
            Write-Host "Starting Podman Machine '$machineName'..."
            $start = Invoke-TalosNativeCapture -Executable $podman -Arguments @('machine', 'start', '--no-info', $machineName)
            if ($start.ExitCode -ne 0 -and $start.Output -notmatch '(?i)already running') {
                throw "Podman Machine start failed: $($start.Output)"
            }
        }
    }
    Wait-TalosNativeHealth -TimeoutSeconds 300 -FailureMessage 'Podman Machine did not become healthy within 300 seconds.' -Probe {
        $info = Invoke-TalosPodmanConnectionCapture -Executable $podman -MachineName $machineName -Arguments @('info')
        return $info.ExitCode -eq 0
    }
    $compose = Invoke-TalosWithComposeProvider `
        -PodmanExecutable $podman `
        -ComposeProvider $Paths.compose_exe `
        -MachineName $machineName `
        -Arguments @('version')
    if ($compose.ExitCode -ne 0) {
        throw "The pinned Docker Compose provider cannot reach Podman: $($compose.Output)"
    }
    return $machineName
}

function New-TalosRuntimeResult {
    param(
        [Parameter(Mandatory = $true)][int] $ExitCode,
        [Parameter(Mandatory = $true)][string] $Status,
        $Plan,
        [string] $Message = '',
        $Evidence = $null
    )
    return [pscustomobject]@{
        schema_version = 'talos.container-runtime.result.v1'
        exit_code = $ExitCode
        status = $Status
        plan = $Plan
        message = $Message
        evidence = $Evidence
    }
}

function Invoke-TalosWindowsRuntime {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory = $true)][string] $WorkspaceRoot,
        [Parameter(Mandatory = $true)][ValidateSet('Ensure', 'Detect', 'Doctor')][string] $Action,
        [Parameter(Mandatory = $true)][ValidateSet('auto', 'docker', 'podman')][string] $RuntimePreference,
        [Parameter(Mandatory = $true)][string] $BootstrapScriptPath
    )

    $paths = Get-TalosRuntimePaths -WorkspaceRoot $WorkspaceRoot
    $manifest = Test-TalosRuntimeManifest -ManifestPath $paths.manifest
    $hostFacts = Get-TalosHostFacts
    $runtimeFacts = Get-TalosRuntimeFacts -Paths $paths
    $plan = Resolve-TalosRuntimePlan -HostFacts $hostFacts -RuntimeFacts $runtimeFacts -Preference $RuntimePreference
    $evidence = [ordered]@{
        product_type = $hostFacts.product_type
        build = $hostFacts.build
        architecture = $hostFacts.architecture
        hyper_v_installed = $hostFacts.hyper_v_installed
        hypervisor_present = $hostFacts.hypervisor_present
        hyper_v_storage_ready = $hostFacts.hyper_v_storage_ready
        hyper_v_storage_error = $hostFacts.hyper_v_storage_error
        wsl_ready = $hostFacts.wsl_ready
        docker_installed = $runtimeFacts.docker_installed
        docker_healthy = $runtimeFacts.docker_healthy
        docker_version = $runtimeFacts.docker_version
        docker_compose_version = $runtimeFacts.docker_compose_version
        docker_compose_healthy = $runtimeFacts.docker_compose_healthy
        podman_installed = $runtimeFacts.podman_installed
        podman_healthy = $runtimeFacts.podman_healthy
        podman_version = $runtimeFacts.podman_version
        podman_compose_version = $runtimeFacts.podman_compose_version
        podman_compose_healthy = $runtimeFacts.podman_compose_healthy
        podman_hyperv_prepared = $runtimeFacts.podman_hyperv_prepared
        podman_machine_state = $runtimeFacts.podman_machine_state
    }

    if ($Action -eq 'Detect') {
        return New-TalosRuntimeResult -ExitCode 0 -Status 'detected' -Plan $plan -Evidence $evidence
    }
    if ($Action -eq 'Doctor') {
        $healthy = Test-TalosSelectedRuntimeHealthy -Kind ([string]$plan.kind) -RuntimeFacts $runtimeFacts
        return New-TalosRuntimeResult `
            -ExitCode $(if ($healthy) { 0 } else { 1 }) `
            -Status $(if ($healthy) { 'ready' } else { 'unavailable' }) `
            -Plan $plan `
            -Message $(if ($healthy) { 'Container runtime and Compose provider are healthy.' } else { $plan.reason }) `
            -Evidence $evidence
    }

    $lock = $null
    try {
        New-Item -ItemType Directory -Force -Path $paths.root | Out-Null
        $lock = Enter-TalosRuntimeLock -LockPath $paths.lock
        Write-TalosRuntimeState -Path $paths.state -Status detecting -Data @{
            selected_runtime = $plan.kind
            engine_healthy = Test-TalosSelectedRuntimeHealthy -Kind ([string]$plan.kind) -RuntimeFacts $runtimeFacts
            compose_healthy = Test-TalosSelectedRuntimeHealthy -Kind ([string]$plan.kind) -RuntimeFacts $runtimeFacts
        }
        if ($plan.action -eq 'unsupported') {
            throw $plan.reason
        }
        if ($plan.action -eq 'use') {
            Write-TalosRuntimeState -Path $paths.state -Status ready -Data @{
                selected_runtime = $plan.kind
                engine_healthy = $true
                compose_healthy = $true
                manifest_sha256 = Get-TalosLowerSha256 -Path $paths.manifest
            }
            return New-TalosRuntimeResult -ExitCode 0 -Status 'ready' -Plan $plan -Message $plan.reason -Evidence $evidence
        }

        if ($plan.kind -eq 'docker') {
            if ([bool]$plan.requires_elevation) {
                Write-TalosRuntimeState -Path $paths.state -Status host_preparation_required -Data @{
                    selected_runtime = 'docker'
                    preparation_mode = 'docker-wsl'
                    engine_healthy = $false
                    compose_healthy = $false
                }
                $prepared = Invoke-TalosElevatedChild -WorkspaceRoot $paths.workspace -BootstrapScriptPath $BootstrapScriptPath -Mode 'docker-wsl' -Paths $paths
                if ([bool]$prepared.restart_required) {
                    Write-TalosRuntimeState -Path $paths.state -Status restart_required -Data @{
                        selected_runtime = 'docker'
                        reason = 'Windows must restart once to activate WSL 2.'
                        engine_healthy = $false
                        compose_healthy = $false
                    }
                    return New-TalosRuntimeResult -ExitCode 75 -Status 'restart_required' -Plan $plan -Message 'Windows must restart once. After login, rerun ./talos up.' -Evidence $evidence
                }
            }
            Write-TalosRuntimeState -Path $paths.state -Status installing -Data @{
                selected_runtime = 'docker'; engine_healthy = $false; compose_healthy = $false
            }
            $docker = Ensure-TalosDockerDesktop -Manifest $manifest -Paths $paths -RuntimeFacts $runtimeFacts
            Write-TalosRuntimeState -Path $paths.state -Status ready -Data @{
                selected_runtime = 'docker'; engine_healthy = $true; compose_healthy = $true
                version = [string]$manifest.windows_x64.docker_desktop.version
                manifest_sha256 = Get-TalosLowerSha256 -Path $paths.manifest
            }
            return New-TalosRuntimeResult -ExitCode 0 -Status 'ready' -Plan $plan -Message "Docker is ready at $docker." -Evidence $evidence
        }

        Write-TalosRuntimeState -Path $paths.state -Status downloading -Data @{
            selected_runtime = 'podman'; engine_healthy = $false; compose_healthy = $false
        }
        Ensure-TalosPodmanBinaries -Manifest $manifest -Paths $paths
        $refreshedFacts = Get-TalosRuntimeFacts -Paths $paths
        $needsPreparation = Test-TalosPodmanHostPreparationRequired `
            -Provider ([string]$plan.machine_provider) `
            -HostFacts $hostFacts `
            -RuntimeFacts $refreshedFacts
        if ($needsPreparation) {
            $mode = if ($plan.machine_provider -eq 'hyperv') { 'podman-hyperv' } else { 'podman-wsl' }
            Write-TalosRuntimeState -Path $paths.state -Status host_preparation_required -Data @{
                selected_runtime = 'podman'; preparation_mode = $mode
                engine_healthy = $false; compose_healthy = $false
            }
            $prepared = Invoke-TalosElevatedChild -WorkspaceRoot $paths.workspace -BootstrapScriptPath $BootstrapScriptPath -Mode $mode -Paths $paths
            if ([bool]$prepared.restart_required) {
                Write-TalosRuntimeState -Path $paths.state -Status restart_required -Data @{
                    selected_runtime = 'podman'
                    reason = 'Windows must restart once to activate the selected Podman machine provider.'
                    engine_healthy = $false
                    compose_healthy = $false
                }
                return New-TalosRuntimeResult -ExitCode 75 -Status 'restart_required' -Plan $plan -Message 'Windows must restart once. After login, rerun ./talos up.' -Evidence $evidence
            }
        }
        if ($plan.machine_provider -eq 'hyperv' -and -not [bool](Get-TalosHostFacts).hypervisor_present) {
            Write-TalosRuntimeState -Path $paths.state -Status restart_required -Data @{
                selected_runtime = 'podman'
                reason = 'Windows must restart once to activate the selected Podman machine provider.'
                engine_healthy = $false
                compose_healthy = $false
            }
            return New-TalosRuntimeResult -ExitCode 75 -Status 'restart_required' -Plan $plan -Message 'Windows must restart once. After login, rerun ./talos up.' -Evidence $evidence
        }
        Write-TalosRuntimeState -Path $paths.state -Status machine_initializing -Data @{
            selected_runtime = 'podman'; provider = $plan.machine_provider
            engine_healthy = $false; compose_healthy = $false
        }
        $machine = Ensure-TalosPodmanMachine -Paths $paths -HostFacts (Get-TalosHostFacts) -Provider $plan.machine_provider
        Write-TalosRuntimeState -Path $paths.state -Status ready -Data @{
            selected_runtime = 'podman'; provider = $plan.machine_provider; machine = $machine
            engine_healthy = $true; compose_healthy = $true
            podman_version = [string]$manifest.windows_x64.podman.version
            compose_version = [string]$manifest.windows_x64.compose.version
            manifest_sha256 = Get-TalosLowerSha256 -Path $paths.manifest
        }
        return New-TalosRuntimeResult -ExitCode 0 -Status 'ready' -Plan $plan -Message "Podman Machine '$machine' is ready." -Evidence $evidence
    } catch {
        $message = $_.Exception.Message
        try {
            Write-TalosRuntimeState -Path $paths.state -Status failed -Data @{
                selected_runtime = $plan.kind
                error = $message
                engine_healthy = $false
                compose_healthy = $false
            }
        } catch {
            # Preserve the original controlled failure if state persistence also fails.
        }
        return New-TalosRuntimeResult -ExitCode 1 -Status 'failed' -Plan $plan -Message $message -Evidence $evidence
    } finally {
        if ($null -ne $lock) {
            $lock.Dispose()
        }
    }
}

Export-ModuleMember -Function @(
    'Get-TalosHostFacts',
    'Resolve-TalosRuntimePlan',
    'Test-TalosRuntimeManifest',
    'Test-TalosArtifactFile',
    'Get-TalosVerifiedArtifact',
    'Install-TalosZipRuntime',
    'Install-TalosFlatRuntime',
    'Enter-TalosRuntimeLock',
    'Write-TalosRuntimeState',
    'Invoke-TalosElevatedPreparation',
    'Invoke-TalosWindowsRuntime'
)
