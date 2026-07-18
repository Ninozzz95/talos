[CmdletBinding()]
param()

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'

$Root = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..'))
$ModulePath = Join-Path $Root 'scripts\container-runtime\Talos.ContainerRuntime.psm1'
$ManifestPath = Join-Path $Root 'scripts\container-runtime\manifest.json'
$BootstrapPath = Join-Path $Root 'scripts\container-runtime\bootstrap-windows.ps1'
$TempRoot = Join-Path ([IO.Path]::GetTempPath()) ('talos-runtime-contract-' + [Guid]::NewGuid().ToString('N'))

function Assert-True([bool] $Condition, [string] $Message) {
    if (-not $Condition) {
        throw $Message
    }
}

function Assert-Equal($Expected, $Actual, [string] $Message) {
    if ($Expected -ne $Actual) {
        throw "$Message Expected '$Expected', got '$Actual'."
    }
}

function Assert-Throws([scriptblock] $Action, [string] $Pattern, [string] $Message) {
    $didThrow = $false
    try {
        & $Action
    } catch {
        $didThrow = $true
        if ($_.Exception.Message -notmatch $Pattern) {
            throw "$Message Unexpected error: $($_.Exception.Message)"
        }
    }
    if (-not $didThrow) {
        throw "$Message Expected an exception matching '$Pattern'."
    }
}

function Get-TestSha256([byte[]] $Bytes) {
    $algorithm = [Security.Cryptography.SHA256]::Create()
    try {
        return ([BitConverter]::ToString($algorithm.ComputeHash($Bytes))).Replace('-', '').ToLowerInvariant()
    } finally {
        $algorithm.Dispose()
    }
}

function New-HostFacts(
    [int] $ProductType = 3,
    [int] $Build = 17763,
    [string] $Architecture = 'AMD64',
    [bool] $HyperVInstalled = $true,
    [bool] $HypervisorPresent = $true,
    [bool] $HyperVStorageReady = $true,
    [bool] $WslReady = $false
) {
    return [pscustomobject]@{
        is_windows = $true
        product_type = $ProductType
        build = $Build
        architecture = $Architecture
        hyper_v_installed = $HyperVInstalled
        hypervisor_present = $HypervisorPresent
        hyper_v_storage_ready = $HyperVStorageReady
        wsl_ready = $WslReady
        logical_processors = 8
        total_memory_mb = 16384
    }
}

function New-RuntimeFacts(
    [bool] $DockerInstalled = $false,
    [bool] $DockerHealthy = $false,
    [bool] $PodmanInstalled = $false,
    [bool] $PodmanHealthy = $false,
    [bool] $PodmanHyperVPrepared = $false
) {
    return [pscustomobject]@{
        docker_installed = $DockerInstalled
        docker_healthy = $DockerHealthy
        podman_installed = $PodmanInstalled
        podman_healthy = $PodmanHealthy
        podman_hyperv_prepared = $PodmanHyperVPrepared
    }
}

function New-ArtifactEntry(
    [string] $Archive,
    [string] $Contents,
    [string] $Url = 'https://github.com/talos-fixture/artifact.bin'
) {
    $bytes = [Text.Encoding]::UTF8.GetBytes($Contents)
    $sha = Get-TestSha256 $bytes
    return [pscustomobject]@{
        version = 'test'
        url = $Url
        sha256 = $sha
        bytes = $bytes.Length
        archive = $Archive
    }
}

function New-ZipFixture([string] $Path, [hashtable] $Entries) {
    Add-Type -AssemblyName System.IO.Compression
    Add-Type -AssemblyName System.IO.Compression.FileSystem
    $stream = [IO.File]::Open($Path, [IO.FileMode]::CreateNew, [IO.FileAccess]::ReadWrite, [IO.FileShare]::None)
    try {
        $archive = [IO.Compression.ZipArchive]::new($stream, [IO.Compression.ZipArchiveMode]::Create, $true)
        try {
            foreach ($name in $Entries.Keys) {
                $entry = $archive.CreateEntry($name)
                $writer = New-Object IO.StreamWriter($entry.Open(), (New-Object Text.UTF8Encoding($false)))
                try {
                    $writer.Write([string]$Entries[$name])
                } finally {
                    $writer.Dispose()
                }
            }
        } finally {
            $archive.Dispose()
        }
    } finally {
        $stream.Dispose()
    }
}

try {
    New-Item -ItemType Directory -Path $TempRoot | Out-Null
    Assert-True (Test-Path -LiteralPath $ModulePath -PathType Leaf) 'Runtime module is missing.'
    Assert-True (Test-Path -LiteralPath $ManifestPath -PathType Leaf) 'Runtime manifest is missing.'
    Assert-True (Test-Path -LiteralPath $BootstrapPath -PathType Leaf) 'Windows runtime bootstrap entry point is missing.'
    Import-Module $ModulePath -Force

    $manifest = Test-TalosRuntimeManifest -ManifestPath $ManifestPath
    Assert-Equal 'talos.container-runtime.manifest.v1' $manifest.schema_version 'Manifest schema mismatch.'
    Assert-Equal '4.82.0' $manifest.windows_x64.docker_desktop.version 'Docker Desktop pin mismatch.'
    Assert-Equal '6.0.1' $manifest.windows_x64.podman.version 'Podman pin mismatch.'
    Assert-Equal '5.1.4' $manifest.windows_x64.compose.version 'Compose pin mismatch.'
    Assert-Equal 45108736 $manifest.windows_x64.podman.binary_bytes 'Podman executable byte pin mismatch.'
    Assert-Equal '1ca3b88816a4f217d00a557c76dd279094185fda4122029b74eb5714dcef34f7' $manifest.windows_x64.podman.binary_sha256 'Podman executable digest pin mismatch.'

    $pathShadowRoot = Join-Path $TempRoot 'path-shadow'
    New-Item -ItemType Directory -Path $pathShadowRoot | Out-Null
    [IO.File]::WriteAllText((Join-Path $pathShadowRoot 'powershell.exe'), 'not a system executable', (New-Object Text.ASCIIEncoding))
    $previousPath = $env:PATH
    try {
        $env:PATH = $pathShadowRoot + [IO.Path]::PathSeparator + $previousPath
        $systemPowerShell = & (Get-Module Talos.ContainerRuntime) {
            Get-TalosWindowsSystemExecutablePath -RelativePath 'WindowsPowerShell\v1.0\powershell.exe'
        }
        Assert-Equal ([IO.Path]::GetFullPath((Join-Path ([Environment]::SystemDirectory) 'WindowsPowerShell\v1.0\powershell.exe'))) $systemPowerShell 'Elevation must ignore PATH-shadowed PowerShell.'
    } finally {
        $env:PATH = $previousPath
    }
    $runtimeModuleSource = Get-Content -LiteralPath $ModulePath -Raw
    Assert-True (-not $runtimeModuleSource.Contains("Start-Process -FilePath 'powershell.exe'")) 'The elevated launcher must not resolve PowerShell through PATH.'
    Assert-True ($runtimeModuleSource.Contains("Get-TalosWindowsSystemExecutablePath -RelativePath 'wsl.exe'")) 'WSL preparation must resolve the protected system executable.'

    $requestingSid = [Security.Principal.WindowsIdentity]::GetCurrent().User.Value
    $hyperVGrant = & (Get-Module Talos.ContainerRuntime) {
        param($UserSid)
        Get-TalosHyperVAccessGrant -RequestingUserSid $UserSid
    } $requestingSid
    Assert-Equal 'S-1-5-32-578' $hyperVGrant.group_sid.Value 'Hyper-V access must target the built-in group SID.'
    Assert-Equal $requestingSid $hyperVGrant.user_sid.Value 'Hyper-V access must target the original TALOS caller.'
    Assert-Throws {
        & (Get-Module Talos.ContainerRuntime) {
            Get-TalosHyperVAccessGrant -RequestingUserSid '..\Administrators'
        }
    } '(?i)(SID|security identifier)' 'The requesting identity must be a validated Windows SID.'

    $grantCapture = @{}
    $grantChanged = & (Get-Module Talos.ContainerRuntime) {
        param($UserSid, $Capture)
        Ensure-TalosHyperVRequestingUserAccess `
            -RequestingUserSid $UserSid `
            -MemberLookup { param($GroupSid) return @() } `
            -MemberAdd {
                param($GroupSid, $UserSidText)
                if ($UserSidText -isnot [string]) {
                    throw 'Windows PowerShell 5.1 requires a textual SID for LocalPrincipal binding.'
                }
                $Capture.group = $GroupSid.Value
                $Capture.user = $UserSidText
            }
    } $requestingSid $grantCapture
    Assert-True $grantChanged 'A missing requesting user must be granted Hyper-V access.'
    Assert-Equal 'S-1-5-32-578' $grantCapture.group 'Hyper-V membership writer used the wrong group.'
    Assert-Equal $requestingSid $grantCapture.user 'Hyper-V membership writer used the credentialed admin instead of the caller.'
    $grantAlreadyPresent = & (Get-Module Talos.ContainerRuntime) {
        param($UserSid)
        Ensure-TalosHyperVRequestingUserAccess `
            -RequestingUserSid $UserSid `
            -MemberLookup { param($GroupSid) return @([Security.Principal.SecurityIdentifier]::new($UserSid)) } `
            -MemberAdd { throw 'An existing Hyper-V member must not be added twice.' }
    } $requestingSid
    Assert-True (-not $grantAlreadyPresent) 'Existing Hyper-V membership must be idempotent.'

    $staleTokenPrepStatus = [pscustomobject]@{
        ExitCode = 0
        Output = "Hyper-V vsock registry entries:`n- Key: fixture`nCurrent user is NOT a member"
    }
    $preparedFromPersistedMembership = & (Get-Module Talos.ContainerRuntime) {
        param($Capture)
        Test-TalosPodmanHyperVPrepared -StatusCapture $Capture -PersistedMembership $true
    } $staleTokenPrepStatus
    Assert-True $preparedFromPersistedMembership 'Persisted Hyper-V membership must suppress repeated pre-reboot UAC.'
    $unpreparedWithoutMembership = & (Get-Module Talos.ContainerRuntime) {
        param($Capture)
        Test-TalosPodmanHyperVPrepared -StatusCapture $Capture -PersistedMembership $false
    } $staleTokenPrepStatus
    Assert-True (-not $unpreparedWithoutMembership) 'A stale token without persisted membership must remain unprepared.'
    $missingVsockStatus = [pscustomobject]@{ ExitCode = 0; Output = 'No vsock registry entries' }
    $unpreparedWithoutVsock = & (Get-Module Talos.ContainerRuntime) {
        param($Capture)
        Test-TalosPodmanHyperVPrepared -StatusCapture $Capture -PersistedMembership $true
    } $missingVsockStatus
    Assert-True (-not $unpreparedWithoutVsock) 'Persisted membership must not hide missing Podman VSock preparation.'

    # ACR-WIN-027: Podman delegates Hyper-V VM creation without an explicit
    # configuration path, so missing Get-VMHost defaults must be prepared first.
    $storageFixture = Join-Path $TempRoot 'hyperv-storage'
    $virtualMachinePath = Join-Path $storageFixture 'VirtualMachines'
    $virtualHardDiskPath = Join-Path $storageFixture 'HardDisks'
    $missingStoragePlan = & (Get-Module Talos.ContainerRuntime) {
        param($VmPath, $VhdPath)
        Resolve-TalosHyperVStoragePlan `
            -VirtualMachinePath $VmPath `
            -VirtualHardDiskPath $VhdPath
    } $virtualMachinePath $virtualHardDiskPath
    Assert-True (-not $missingStoragePlan.ready) 'Missing configured Hyper-V directories must not be reported ready.'
    Assert-Equal 2 @($missingStoragePlan.missing_paths).Count 'Both missing configured Hyper-V directories must be planned.'

    $createdStorage = @(& (Get-Module Talos.ContainerRuntime) {
        param($Plan)
        Ensure-TalosHyperVStoragePaths -StoragePlan $Plan
    } $missingStoragePlan)
    Assert-Equal 2 $createdStorage.Count 'Storage preparation must report only directories it created.'
    Assert-True (Test-Path -LiteralPath $virtualMachinePath -PathType Container) 'Configured Hyper-V VM directory was not created.'
    Assert-True (Test-Path -LiteralPath $virtualHardDiskPath -PathType Container) 'Configured Hyper-V VHD directory was not created.'
    $idempotentStorage = @(& (Get-Module Talos.ContainerRuntime) {
        param($VmPath, $VhdPath)
        $plan = Resolve-TalosHyperVStoragePlan -VirtualMachinePath $VmPath -VirtualHardDiskPath $VhdPath
        Ensure-TalosHyperVStoragePaths -StoragePlan $plan
    } $virtualMachinePath $virtualHardDiskPath)
    Assert-Equal 0 $idempotentStorage.Count 'Existing configured Hyper-V directories must remain untouched.'

    Assert-Throws {
        & (Get-Module Talos.ContainerRuntime) {
            Resolve-TalosHyperVStoragePlan `
                -VirtualMachinePath '\\server\share\talos-vms' `
                -VirtualHardDiskPath 'C:\Talos\Disks'
        }
    } '(?i)(local|UNC|drive)' 'UNC Hyper-V storage must fail before host mutation.'
    Assert-Throws {
        & (Get-Module Talos.ContainerRuntime) {
            Resolve-TalosHyperVStoragePlan `
                -VirtualMachinePath 'relative\talos-vms' `
                -VirtualHardDiskPath 'C:\Talos\Disks'
        }
    } '(?i)(absolute|local|drive)' 'Relative Hyper-V storage must fail before host mutation.'
    $fileStorageTarget = Join-Path $storageFixture 'not-a-directory'
    [IO.File]::WriteAllText($fileStorageTarget, 'fixture', (New-Object Text.UTF8Encoding($false)))
    Assert-Throws {
        & (Get-Module Talos.ContainerRuntime) {
            param($FilePath, $DirectoryPath)
            Resolve-TalosHyperVStoragePlan `
                -VirtualMachinePath $FilePath `
                -VirtualHardDiskPath $DirectoryPath
        } $fileStorageTarget $virtualHardDiskPath
    } '(?i)(directory|file)' 'A file at a configured Hyper-V storage path must fail before mutation.'

    $storageOnlyHostFacts = New-HostFacts `
        -HyperVInstalled $true `
        -HypervisorPresent $true `
        -HyperVStorageReady $false
    $storageOnlyRuntimeFacts = New-RuntimeFacts `
        -PodmanInstalled $true `
        -PodmanHyperVPrepared $true
    $storagePreparationRequired = & (Get-Module Talos.ContainerRuntime) {
        param($HostFacts, $RuntimeFacts)
        Test-TalosPodmanHostPreparationRequired `
            -Provider hyperv `
            -HostFacts $HostFacts `
            -RuntimeFacts $RuntimeFacts
    } $storageOnlyHostFacts $storageOnlyRuntimeFacts
    Assert-True $storagePreparationRequired 'Missing Hyper-V default storage must be prepared before machine init.'
    $storageOnlyPlan = Resolve-TalosRuntimePlan `
        -HostFacts $storageOnlyHostFacts `
        -RuntimeFacts $storageOnlyRuntimeFacts `
        -Preference podman
    Assert-True $storageOnlyPlan.requires_elevation 'Storage-only Hyper-V preparation must use the existing UAC boundary.'
    Assert-True (-not $storageOnlyPlan.requires_restart) 'Storage-only Hyper-V preparation must not invent another restart.'

    $storageOnlyRestart = & (Get-Module Talos.ContainerRuntime) {
        Test-TalosHyperVRestartRequired `
            -FeatureChanged $false `
            -AccessChanged $false `
            -HypervisorPresent $true
    }
    Assert-True (-not $storageOnlyRestart) 'Storage-only preparation must continue without restart.'
    $accessRestart = & (Get-Module Talos.ContainerRuntime) {
        Test-TalosHyperVRestartRequired `
            -FeatureChanged $false `
            -AccessChanged $true `
            -HypervisorPresent $true
    }
    Assert-True $accessRestart 'New Hyper-V group membership must preserve the session refresh fence.'

    $integritySnapshot = & (Get-Module Talos.ContainerRuntime) {
        param($Bootstrap, $Module, $Manifest)
        Get-TalosElevationIntegritySnapshot -BootstrapPath $Bootstrap -ModulePath $Module -ManifestPath $Manifest
    } $BootstrapPath $ModulePath $ManifestPath
    Assert-Equal (Get-TestSha256 ([IO.File]::ReadAllBytes($BootstrapPath))) $integritySnapshot.bootstrap_sha256 'Bootstrap integrity snapshot mismatch.'
    Assert-Equal (Get-TestSha256 ([IO.File]::ReadAllBytes($ModulePath))) $integritySnapshot.module_sha256 'Runtime module integrity snapshot mismatch.'
    Assert-Equal (Get-TestSha256 ([IO.File]::ReadAllBytes($ManifestPath))) $integritySnapshot.manifest_sha256 'Runtime manifest integrity snapshot mismatch.'

    $integrityStdout = Join-Path $TempRoot 'integrity.stdout.log'
    $integrityStderr = Join-Path $TempRoot 'integrity.stderr.log'
    $integrityResult = Join-Path $TempRoot 'integrity-result.json'
    $integrityProcess = Start-Process `
        -FilePath ([IO.Path]::GetFullPath((Join-Path ([Environment]::SystemDirectory) 'WindowsPowerShell\v1.0\powershell.exe'))) `
        -ArgumentList @(
            '-NoLogo', '-NoProfile', '-ExecutionPolicy', 'Bypass',
            '-File', $BootstrapPath,
            '-WorkspaceRoot', $Root,
            '-Action', 'PrepareElevated',
            '-ElevatedMode', 'podman-hyperv',
            '-ResultPath', $integrityResult,
            '-ExpectedBootstrapSha256', ('0' * 64),
            '-ExpectedModuleSha256', $integritySnapshot.module_sha256,
            '-ExpectedManifestSha256', $integritySnapshot.manifest_sha256
        ) `
        -Wait `
        -PassThru `
        -RedirectStandardOutput $integrityStdout `
        -RedirectStandardError $integrityStderr
    $integrityOutput = ((Get-Content -LiteralPath $integrityStdout -Raw) + "`n" + (Get-Content -LiteralPath $integrityStderr -Raw))
    Assert-True ($integrityProcess.ExitCode -ne 0) 'The elevated entry point must reject a changed bootstrap before host mutation.'
    Assert-True ($integrityOutput -match 'changed after the elevation request') 'The elevated integrity failure must remain actionable.'
    Assert-True (-not (Test-Path -LiteralPath $integrityResult)) 'Integrity rejection must occur before an elevated result or host mutation is produced.'

    $fencedPath = Join-Path $TempRoot 'elevation-fence.txt'
    [IO.File]::WriteAllText($fencedPath, 'trusted bytes', (New-Object Text.UTF8Encoding($false)))
    $fences = @(& (Get-Module Talos.ContainerRuntime) {
        param($Path)
        Enter-TalosFileReadFences -Paths @($Path)
    } $fencedPath)
    try {
        Assert-Throws {
            $writer = [IO.File]::Open($fencedPath, [IO.FileMode]::Open, [IO.FileAccess]::Write, [IO.FileShare]::None)
            $writer.Dispose()
        } '(?i)(access|process|used|utilizz)' 'Elevation inputs must remain immutable while consent is pending.'
    } finally {
        foreach ($fence in $fences) {
            $fence.Dispose()
        }
    }

    $pinnedPodmanFixture = Join-Path $TempRoot 'podman.exe'
    $pinnedPodmanBytes = [Text.Encoding]::UTF8.GetBytes('pinned podman fixture')
    [IO.File]::WriteAllBytes($pinnedPodmanFixture, $pinnedPodmanBytes)
    $pinnedPodmanEntry = [pscustomobject]@{
        binary_bytes = $pinnedPodmanBytes.Length
        binary_sha256 = Get-TestSha256 $pinnedPodmanBytes
    }
    & (Get-Module Talos.ContainerRuntime) {
        param($Path, $Entry)
        Assert-TalosPinnedPodmanExecutable -Path $Path -Entry $Entry
    } $pinnedPodmanFixture $pinnedPodmanEntry
    [IO.File]::WriteAllText($pinnedPodmanFixture, 'tampered podman fixture', (New-Object Text.UTF8Encoding($false)))
    Assert-Throws {
        & (Get-Module Talos.ContainerRuntime) {
            param($Path, $Entry)
            Assert-TalosPinnedPodmanExecutable -Path $Path -Entry $Entry
        } $pinnedPodmanFixture $pinnedPodmanEntry
    } '(?i)(pinned|digest|byte)' 'Elevated Podman must reject an extracted executable that no longer matches the manifest.'

    $repairRoot = Join-Path $TempRoot 'podman-repair'
    $repairDownloads = Join-Path $repairRoot 'downloads'
    New-Item -ItemType Directory -Path $repairDownloads -Force | Out-Null
    $repairPodmanContents = 'verified podman executable'
    $repairPodmanBytes = [Text.Encoding]::UTF8.GetBytes($repairPodmanContents)
    $repairArchive = Join-Path $repairDownloads 'podman-fixture.zip'
    New-ZipFixture -Path $repairArchive -Entries @{ 'payload/usr/bin/podman.exe' = $repairPodmanContents }
    $repairComposeContents = 'verified compose executable'
    $repairComposeBytes = [Text.Encoding]::UTF8.GetBytes($repairComposeContents)
    $repairComposeDownload = Join-Path $repairDownloads 'compose-fixture.exe'
    [IO.File]::WriteAllBytes($repairComposeDownload, $repairComposeBytes)
    $repairManifest = [pscustomobject]@{
        windows_x64 = [pscustomobject]@{
            podman = [pscustomobject]@{
                version = 'fixture'
                url = 'https://github.com/talos-fixture/podman-fixture.zip'
                sha256 = (Get-FileHash -LiteralPath $repairArchive -Algorithm SHA256).Hash.ToLowerInvariant()
                bytes = (Get-Item -LiteralPath $repairArchive).Length
                binary_sha256 = Get-TestSha256 $repairPodmanBytes
                binary_bytes = $repairPodmanBytes.Length
                archive = 'podman-fixture.zip'
                archive_root = 'payload'
            }
            compose = [pscustomobject]@{
                version = 'fixture'
                url = 'https://github.com/talos-fixture/compose-fixture.exe'
                sha256 = Get-TestSha256 $repairComposeBytes
                bytes = $repairComposeBytes.Length
                archive = 'compose-fixture.exe'
            }
        }
    }
    $repairPaths = [pscustomobject]@{
        downloads = $repairDownloads
        podman_root = Join-Path $repairRoot 'podman'
        podman_exe = Join-Path $repairRoot 'podman\usr\bin\podman.exe'
        compose_exe = Join-Path $repairRoot 'compose\docker-compose.exe'
    }
    & (Get-Module Talos.ContainerRuntime) {
        param($Manifest, $Paths)
        Ensure-TalosPodmanBinaries -Manifest $Manifest -Paths $Paths
    } $repairManifest $repairPaths
    & (Get-Module Talos.ContainerRuntime) {
        Set-Item -Path Function:script:Invoke-TalosNativeCapture -Value {
            return [pscustomobject]@{ ExitCode = 0; Output = 'podman version fixture' }
        }
    }
    [IO.File]::WriteAllText($repairPaths.podman_exe, 'tampered', (New-Object Text.UTF8Encoding($false)))
    & (Get-Module Talos.ContainerRuntime) {
        param($Manifest, $Paths)
        Ensure-TalosPodmanBinaries -Manifest $Manifest -Paths $Paths
    } $repairManifest $repairPaths
    Assert-Equal $repairPodmanContents ([IO.File]::ReadAllText($repairPaths.podman_exe)) 'Tampered Podman must be restored from the verified cached archive.'
    Import-Module $ModulePath -Force

    $composeProbePath = Join-Path $TempRoot 'compose-version-fixture.cmd'
    $composeProbeScript = @'
@echo off
if "%1" == "version" (
  echo Docker Compose version v5.1.4
  exit /b 0
)
exit /b 9
'@
    [IO.File]::WriteAllText($composeProbePath, $composeProbeScript, (New-Object Text.ASCIIEncoding))
    $runtimeModule = Get-Module Talos.ContainerRuntime
    $composeFacts = & $runtimeModule {
        param($Executable)
        Get-TalosComposeProviderFacts -Executable $Executable
    } $composeProbePath
    Assert-True $composeFacts.healthy 'Compose provider version probe must not require an engine socket.'
    Assert-Equal 'Docker Compose version v5.1.4' $composeFacts.version 'Compose provider version probe mismatch.'

    $previousMachine = $env:TALOS_PODMAN_MACHINE
    try {
        Remove-Item Env:TALOS_PODMAN_MACHINE -ErrorAction SilentlyContinue
        $defaultMachine = & $runtimeModule { Get-TalosPodmanMachineName }
        Assert-Equal 'talos-machine' $defaultMachine 'Podman machine default must be TALOS-owned.'
        $env:TALOS_PODMAN_MACHINE = 'talos-enterprise'
        $configuredMachine = & $runtimeModule { Get-TalosPodmanMachineName }
        Assert-Equal 'talos-enterprise' $configuredMachine 'Configured Podman machine name mismatch.'
    } finally {
        if ($null -eq $previousMachine) {
            Remove-Item Env:TALOS_PODMAN_MACHINE -ErrorAction SilentlyContinue
        } else {
            $env:TALOS_PODMAN_MACHINE = $previousMachine
        }
    }

    $podmanProbePath = Join-Path $TempRoot 'podman-connection-fixture.cmd'
    $podmanProbeLog = Join-Path $TempRoot 'podman-connection-fixture.log'
    $podmanProbeScript = @'
@echo off
echo %*>>"%TALOS_PODMAN_TEST_LOG%"
if "%1" == "machine" (
  echo running
  exit /b 0
)
if "%1" == "--connection" (
  echo connected
  exit /b 0
)
exit /b 9
'@
    [IO.File]::WriteAllText($podmanProbePath, $podmanProbeScript, (New-Object Text.ASCIIEncoding))
    $previousPodmanLog = $env:TALOS_PODMAN_TEST_LOG
    try {
        $env:TALOS_PODMAN_TEST_LOG = $podmanProbeLog
        $machineState = & $runtimeModule {
            param($Executable)
            Get-TalosPodmanMachineState -Executable $Executable -MachineName 'talos-enterprise'
        } $podmanProbePath
        Assert-Equal 'running' $machineState 'Configured Podman machine state mismatch.'
        $connectionProbe = & $runtimeModule {
            param($Executable)
            Invoke-TalosPodmanConnectionCapture -Executable $Executable -MachineName 'talos-enterprise' -Arguments @('info')
        } $podmanProbePath
        Assert-Equal 0 $connectionProbe.ExitCode 'Configured Podman connection probe should succeed.'
        $podmanProbeCalls = Get-Content -LiteralPath $podmanProbeLog
        Assert-True ($podmanProbeCalls -contains 'machine inspect --format {{.State}} talos-enterprise') 'Machine state probe did not name the TALOS machine.'
        Assert-True ($podmanProbeCalls -contains '--connection talos-enterprise info') 'Podman health probe did not bind the TALOS connection.'
    } finally {
        if ($null -eq $previousPodmanLog) {
            Remove-Item Env:TALOS_PODMAN_TEST_LOG -ErrorAction SilentlyContinue
        } else {
            $env:TALOS_PODMAN_TEST_LOG = $previousPodmanLog
        }
    }

    Assert-Throws {
        & $runtimeModule {
            $source = [IO.MemoryStream]::new([byte[]](1, 2, 3, 4, 5))
            $destination = [IO.MemoryStream]::new()
            try {
                Copy-TalosBoundedStream -Source $source -Destination $destination -ExpectedBytes 4 -TimeoutSeconds 5
            } finally {
                $destination.Dispose()
                $source.Dispose()
            }
        }
    } 'exceeded the pinned manifest size' 'Artifact streaming must abort on the first excess byte.'

    Assert-Throws {
        & $runtimeModule {
            $source = [IO.MemoryStream]::new([byte[]](1, 2, 3))
            $destination = [IO.MemoryStream]::new()
            try {
                Copy-TalosBoundedStream -Source $source -Destination $destination -ExpectedBytes 4 -TimeoutSeconds 5
            } finally {
                $destination.Dispose()
                $source.Dispose()
            }
        }
    } 'ended before the pinned manifest size' 'Artifact streaming must reject a truncated body.'

    $detectResult = Invoke-TalosWindowsRuntime `
        -WorkspaceRoot $Root `
        -Action Detect `
        -RuntimePreference auto `
        -BootstrapScriptPath $BootstrapPath
    Assert-Equal 0 $detectResult.exit_code 'Read-only runtime detection must succeed.'
    Assert-Equal 'detected' $detectResult.status 'Read-only runtime detection status mismatch.'
    Assert-True ($null -ne $detectResult.plan) 'Runtime detection must expose the selected plan.'
    foreach ($field in @(
        'docker_version',
        'docker_compose_version',
        'docker_compose_healthy',
        'podman_version',
        'podman_compose_version',
        'podman_compose_healthy',
        'podman_machine_state',
        'hyper_v_storage_ready'
    )) {
        Assert-True ($detectResult.evidence.Contains($field)) "Runtime detection evidence is missing '$field'."
    }

    $serverPlan = Resolve-TalosRuntimePlan `
        -HostFacts (New-HostFacts -HyperVInstalled $false -HypervisorPresent $false) `
        -RuntimeFacts (New-RuntimeFacts) `
        -Preference auto
    Assert-Equal 'podman' $serverPlan.kind 'Windows Server must select Podman.'
    Assert-Equal 'install' $serverPlan.action 'Missing Podman must be installed.'
    Assert-True $serverPlan.requires_elevation 'Hyper-V preparation must require elevation.'
    Assert-True $serverPlan.requires_restart 'Missing Hyper-V must require a controlled restart.'

    $preparedHostFacts = New-HostFacts -HyperVInstalled $true -HypervisorPresent $false
    $preparedRuntimeFacts = New-RuntimeFacts -PodmanInstalled $true -PodmanHyperVPrepared $true
    $preparedAwaitingRestart = & (Get-Module Talos.ContainerRuntime) {
        param($HostFacts, $RuntimeFacts)
        Test-TalosPodmanHostPreparationRequired -Provider hyperv -HostFacts $HostFacts -RuntimeFacts $RuntimeFacts
    } $preparedHostFacts $preparedRuntimeFacts
    Assert-True (-not $preparedAwaitingRestart) 'Prepared Hyper-V waiting for reboot must not request UAC again.'
    $missingRuntimeFacts = New-RuntimeFacts -PodmanInstalled $true -PodmanHyperVPrepared $false
    $missingHyperVPreparation = & (Get-Module Talos.ContainerRuntime) {
        param($HostFacts, $RuntimeFacts)
        Test-TalosPodmanHostPreparationRequired -Provider hyperv -HostFacts $HostFacts -RuntimeFacts $RuntimeFacts
    } $preparedHostFacts $missingRuntimeFacts
    Assert-True $missingHyperVPreparation 'Missing Podman Hyper-V preparation must retain the UAC boundary.'

    $workstationPlan = Resolve-TalosRuntimePlan `
        -HostFacts (New-HostFacts -ProductType 1 -Build 22631 -WslReady $true) `
        -RuntimeFacts (New-RuntimeFacts) `
        -Preference auto
    Assert-Equal 'docker' $workstationPlan.kind 'Supported Windows workstation must select Docker.'
    Assert-Equal 'install' $workstationPlan.action 'Missing Docker Desktop must be installed.'
    Assert-True $workstationPlan.requires_license 'Docker Desktop install must require explicit license acceptance.'
    Assert-True (-not $workstationPlan.requires_restart) 'Ready WSL must not invent a restart requirement.'

    $existingDockerPlan = Resolve-TalosRuntimePlan `
        -HostFacts (New-HostFacts) `
        -RuntimeFacts (New-RuntimeFacts -DockerInstalled $true -DockerHealthy $true) `
        -Preference auto
    Assert-Equal 'docker' $existingDockerPlan.kind 'Healthy Docker must remain preferred.'
    Assert-Equal 'use' $existingDockerPlan.action 'Healthy Docker must never be replaced.'
    Assert-True (-not $existingDockerPlan.requires_license) 'An existing healthy Docker runtime must not prompt for a new license acceptance.'

    $forcedPodmanPlan = Resolve-TalosRuntimePlan `
        -HostFacts (New-HostFacts -ProductType 1 -Build 22631 -WslReady $true) `
        -RuntimeFacts (New-RuntimeFacts -DockerInstalled $true -DockerHealthy $true -PodmanInstalled $true -PodmanHealthy $true -PodmanHyperVPrepared $true) `
        -Preference podman
    Assert-Equal 'podman' $forcedPodmanPlan.kind 'Explicit Podman selection must not fall back to Docker.'
    Assert-Equal 'use' $forcedPodmanPlan.action 'Healthy forced Podman should be used.'

    $forcedDockerServerPlan = Resolve-TalosRuntimePlan `
        -HostFacts (New-HostFacts) `
        -RuntimeFacts (New-RuntimeFacts) `
        -Preference docker
    Assert-Equal 'unsupported' $forcedDockerServerPlan.action 'Missing Docker Desktop on Windows Server must fail closed.'

    $forcedPodmanDoctorHealth = & $runtimeModule {
        param($Facts)
        Test-TalosSelectedRuntimeHealthy -Kind podman -RuntimeFacts $Facts
    } (New-RuntimeFacts -DockerInstalled $true -DockerHealthy $true -PodmanInstalled $true -PodmanHealthy $false)
    Assert-True (-not $forcedPodmanDoctorHealth) 'Healthy Docker must not promote a forced unhealthy Podman runtime.'

    $forcedDockerDoctorHealth = & $runtimeModule {
        param($Facts)
        Test-TalosSelectedRuntimeHealthy -Kind docker -RuntimeFacts $Facts
    } (New-RuntimeFacts -DockerInstalled $true -DockerHealthy $false -PodmanInstalled $true -PodmanHealthy $true)
    Assert-True (-not $forcedDockerDoctorHealth) 'Healthy Podman must not promote a forced unhealthy Docker runtime.'

    $oldWorkstationPlan = Resolve-TalosRuntimePlan `
        -HostFacts (New-HostFacts -ProductType 1 -Build 19044 -WslReady $true) `
        -RuntimeFacts (New-RuntimeFacts) `
        -Preference auto
    Assert-Equal 'unsupported' $oldWorkstationPlan.action 'Unsupported Windows builds must fail before download.'

    $armPlan = Resolve-TalosRuntimePlan `
        -HostFacts (New-HostFacts -Architecture 'ARM64') `
        -RuntimeFacts (New-RuntimeFacts) `
        -Preference auto
    Assert-Equal 'unsupported' $armPlan.action 'The x64 manifest must not be used on ARM64.'

    Assert-Throws {
        Resolve-TalosRuntimePlan -HostFacts (New-HostFacts) -RuntimeFacts (New-RuntimeFacts) -Preference invalid
    } 'TALOS_CONTAINER_RUNTIME' 'Invalid runtime preference must fail closed.'

    $invalidManifestPath = Join-Path $TempRoot 'invalid-manifest.json'
    $invalidManifest = Get-Content -LiteralPath $ManifestPath -Raw | ConvertFrom-Json
    $invalidManifest.windows_x64.podman.url = 'https://example.com/podman.zip'
    [IO.File]::WriteAllText($invalidManifestPath, ($invalidManifest | ConvertTo-Json -Depth 10), (New-Object Text.UTF8Encoding($false)))
    Assert-Throws {
        Test-TalosRuntimeManifest -ManifestPath $invalidManifestPath
    } 'untrusted download origin' 'Manifest must reject an untrusted origin.'

    $invalidManifest.windows_x64.podman.url = 'https://github.com/podman.zip'
    $invalidManifest.windows_x64.podman.sha256 = 'invalid'
    [IO.File]::WriteAllText($invalidManifestPath, ($invalidManifest | ConvertTo-Json -Depth 10), (New-Object Text.UTF8Encoding($false)))
    Assert-Throws {
        Test-TalosRuntimeManifest -ManifestPath $invalidManifestPath
    } 'invalid SHA-256' 'Manifest must reject an invalid digest.'

    $invalidManifest.windows_x64.podman.sha256 = '0' * 64
    $invalidManifest.windows_x64.podman.archive = '..\podman.zip'
    [IO.File]::WriteAllText($invalidManifestPath, ($invalidManifest | ConvertTo-Json -Depth 10), (New-Object Text.UTF8Encoding($false)))
    Assert-Throws {
        Test-TalosRuntimeManifest -ManifestPath $invalidManifestPath
    } 'local archive filename' 'Manifest must reject an escaping archive path.'

    $artifactPath = Join-Path $TempRoot 'artifact.bin'
    [IO.File]::WriteAllText($artifactPath, 'good', (New-Object Text.UTF8Encoding($false)))
    $artifactEntry = New-ArtifactEntry -Archive 'artifact.bin' -Contents 'good'
    Assert-True (Test-TalosArtifactFile -Path $artifactPath -Entry $artifactEntry) 'Exact artifact bytes and digest should validate.'
    [IO.File]::WriteAllText($artifactPath, 'bad!', (New-Object Text.UTF8Encoding($false)))
    Assert-True (-not (Test-TalosArtifactFile -Path $artifactPath -Entry $artifactEntry)) 'Wrong artifact bytes must fail validation.'

    $freshDownloads = Join-Path $TempRoot 'fresh-downloads'
    $freshEntry = New-ArtifactEntry -Archive 'fresh.bin' -Contents 'fresh-runtime'
    $freshValues = @(Get-TalosVerifiedArtifact `
        -Entry $freshEntry `
        -Name 'fresh fixture' `
        -DownloadsRoot $freshDownloads `
        -DownloadAction {
            param($Uri, $Destination)
            [IO.File]::WriteAllText($Destination, 'fresh-runtime', (New-Object Text.UTF8Encoding($false)))
            Write-Output 'transport-success-noise'
        })
    Assert-Equal 1 $freshValues.Count 'A fresh download must return exactly one value to its caller.'
    Assert-True ($freshValues[0] -is [string]) 'A fresh download must return a typed artifact path.'
    Assert-Equal (Join-Path $freshDownloads 'fresh.bin') $freshValues[0] 'A fresh download must return only its promoted artifact path.'

    $badDownloads = Join-Path $TempRoot 'bad-downloads'
    $badInstall = Join-Path $TempRoot 'bad-install.bin'
    Assert-Throws {
        Get-TalosVerifiedArtifact `
            -Entry $artifactEntry `
            -Name 'fixture' `
            -DownloadsRoot $badDownloads `
            -DownloadAction { param($Uri, $Destination) [IO.File]::WriteAllText($Destination, 'bad!', (New-Object Text.UTF8Encoding($false))) }
    } 'failed SHA-256 verification' 'Checksum failure must abort acquisition.'
    Assert-True (-not (Test-Path -LiteralPath $badInstall)) 'Checksum failure must not create an installed binary.'
    Assert-True (-not (Test-Path -LiteralPath (Join-Path $badDownloads 'artifact.bin'))) 'Checksum failure must not leave a promoted download.'

    $zipDownloads = Join-Path $TempRoot 'zip-downloads'
    New-Item -ItemType Directory -Path $zipDownloads | Out-Null
    $unsafeZipPath = Join-Path $zipDownloads 'unsafe.zip'
    New-ZipFixture -Path $unsafeZipPath -Entries @{
        '../escape.txt' = 'escape'
        'payload/podman.exe' = 'binary'
    }
    $unsafeBytes = [IO.File]::ReadAllBytes($unsafeZipPath)
    $unsafeEntry = [pscustomobject]@{
        version = 'test'
        url = 'https://github.com/talos-fixture/unsafe.zip'
        sha256 = Get-TestSha256 $unsafeBytes
        bytes = $unsafeBytes.Length
        archive = 'unsafe.zip'
    }
    $unsafeDestination = Join-Path $TempRoot 'unsafe-runtime'
    Assert-Throws {
        Install-TalosZipRuntime `
            -Entry $unsafeEntry `
            -Name 'unsafe fixture' `
            -DownloadsRoot $zipDownloads `
            -Destination $unsafeDestination `
            -ArchiveRoot 'payload' `
            -RequiredBinary 'podman.exe'
    } 'unsafe path' 'Unsafe zip entries must be rejected before extraction.'
    Assert-True (-not (Test-Path -LiteralPath $unsafeDestination)) 'Unsafe zip must not create the runtime destination.'

    $safeZipPath = Join-Path $zipDownloads 'safe.zip'
    New-ZipFixture -Path $safeZipPath -Entries @{
        'payload/podman.exe' = 'new-runtime'
        'payload/gvproxy.exe' = 'helper'
    }
    $safeBytes = [IO.File]::ReadAllBytes($safeZipPath)
    $safeEntry = [pscustomobject]@{
        version = 'test'
        url = 'https://github.com/talos-fixture/safe.zip'
        sha256 = Get-TestSha256 $safeBytes
        bytes = $safeBytes.Length
        archive = 'safe.zip'
    }
    $safeDestination = Join-Path $TempRoot 'safe-runtime'
    New-Item -ItemType Directory -Path $safeDestination | Out-Null
    [IO.File]::WriteAllText((Join-Path $safeDestination 'old.txt'), 'old', (New-Object Text.UTF8Encoding($false)))
    Install-TalosZipRuntime `
        -Entry $safeEntry `
        -Name 'safe fixture' `
        -DownloadsRoot $zipDownloads `
        -Destination $safeDestination `
        -ArchiveRoot 'payload' `
        -RequiredBinary 'podman.exe'
    Assert-Equal 'new-runtime' ([IO.File]::ReadAllText((Join-Path $safeDestination 'podman.exe'))) 'Atomic install must promote the verified runtime.'
    Assert-True (-not (Test-Path -LiteralPath (Join-Path $safeDestination 'old.txt'))) 'Atomic install must replace the old runtime directory.'

    $lockPath = Join-Path $TempRoot 'bootstrap.lock'
    $lock = Enter-TalosRuntimeLock -LockPath $lockPath
    try {
        Assert-Throws {
            $secondLock = Enter-TalosRuntimeLock -LockPath $lockPath
            if ($null -ne $secondLock) { $secondLock.Dispose() }
        } 'already running' 'A concurrent bootstrap must fail without mutation.'
    } finally {
        $lock.Dispose()
    }

    $statePath = Join-Path $TempRoot 'state.json'
    Assert-Throws {
        Write-TalosRuntimeState -Path $statePath -Status ready -Data @{ engine_healthy = $false; compose_healthy = $true }
    } 'cannot be marked ready' 'Partial health must never be promoted to ready.'
    Write-TalosRuntimeState -Path $statePath -Status ready -Data @{ engine_healthy = $true; compose_healthy = $true; selected_runtime = 'podman' }
    $state = Get-Content -LiteralPath $statePath -Raw | ConvertFrom-Json
    Assert-Equal 'talos.container-runtime.state.v1' $state.schema_version 'Runtime state schema mismatch.'
    Assert-Equal 'ready' $state.status 'Healthy runtime should be persisted as ready.'

    $doctorFixture = Join-Path $TempRoot 'doctor-wrapper'
    New-Item -ItemType Directory -Path $doctorFixture | Out-Null
    Copy-Item -LiteralPath $BootstrapPath -Destination (Join-Path $doctorFixture 'bootstrap-windows.ps1')
    $doctorModule = @'
function Invoke-TalosWindowsRuntime {
    return [pscustomobject]@{
        exit_code = 1
        status = 'unavailable'
        message = 'No healthy container runtime is available.'
        plan = [pscustomobject]@{
            kind = 'podman'
            action = 'start'
            reason = 'Podman is installed but not ready.'
            machine_provider = 'hyperv'
            requires_license = $false
            requires_elevation = $true
            requires_restart = $true
        }
        evidence = [ordered]@{
            docker_installed = $false
            docker_healthy = $false
            docker_version = ''
            docker_compose_version = ''
            docker_compose_healthy = $false
            podman_installed = $true
            podman_healthy = $false
            podman_version = 'podman version 6.0.1'
            podman_compose_version = 'Docker Compose version v5.1.4'
            podman_compose_healthy = $true
            podman_hyperv_prepared = $false
            podman_machine_state = 'not_initialized'
            hyper_v_storage_ready = $true
        }
    }
}
function Invoke-TalosElevatedPreparation { throw 'Doctor must never mutate the host.' }
Export-ModuleMember -Function Invoke-TalosWindowsRuntime, Invoke-TalosElevatedPreparation
'@
    [IO.File]::WriteAllText(
        (Join-Path $doctorFixture 'Talos.ContainerRuntime.psm1'),
        $doctorModule,
        (New-Object Text.UTF8Encoding($false))
    )
    $doctorStdout = Join-Path $doctorFixture 'doctor.stdout.log'
    $doctorStderr = Join-Path $doctorFixture 'doctor.stderr.log'
    $doctorProcess = Start-Process `
        -FilePath 'powershell.exe' `
        -ArgumentList @(
            '-NoLogo',
            '-NoProfile',
            '-ExecutionPolicy', 'Bypass',
            '-File', (Join-Path $doctorFixture 'bootstrap-windows.ps1'),
            '-WorkspaceRoot', $Root,
            '-Action', 'Doctor',
            '-RuntimePreference', 'podman'
        ) `
        -Wait `
        -PassThru `
        -RedirectStandardOutput $doctorStdout `
        -RedirectStandardError $doctorStderr
    $doctorOutput = ((Get-Content -LiteralPath $doctorStdout -Raw) + "`n" + (Get-Content -LiteralPath $doctorStderr -Raw))
    Assert-Equal 1 $doctorProcess.ExitCode 'An unhealthy Doctor result must remain nonzero.'
    foreach ($expectedLine in @(
        'runtime selection   INFO podman',
        'runtime provider    INFO hyperv',
        'runtime version     INFO podman version 6.0.1',
        'machine state       WARN not_initialized',
        'container engine    WARN unavailable',
        'compose provider    OK   Docker Compose version v5.1.4',
        'hyper-v storage     OK   ready',
        'runtime elevation   WARN required',
        'runtime restart     WARN required'
    )) {
        Assert-True ($doctorOutput.Contains($expectedLine)) "Doctor output is missing '$expectedLine'."
    }

    $restartFixture = Join-Path $TempRoot 'restart-wrapper'
    New-Item -ItemType Directory -Path $restartFixture | Out-Null
    Copy-Item -LiteralPath $BootstrapPath -Destination (Join-Path $restartFixture 'bootstrap-windows.ps1')
    $restartModule = @'
function Invoke-TalosWindowsRuntime {
    return [pscustomobject]@{
        exit_code = 75
        status = 'restart_required'
        message = 'Windows must restart once. After login, rerun ./talos up.'
        plan = [pscustomobject]@{ kind = 'podman' }
        evidence = [ordered]@{}
    }
}
function Invoke-TalosElevatedPreparation { throw 'Ensure fixture must not elevate.' }
Export-ModuleMember -Function Invoke-TalosWindowsRuntime, Invoke-TalosElevatedPreparation
'@
    [IO.File]::WriteAllText(
        (Join-Path $restartFixture 'Talos.ContainerRuntime.psm1'),
        $restartModule,
        (New-Object Text.UTF8Encoding($false))
    )
    $restartStdout = Join-Path $restartFixture 'restart.stdout.log'
    $restartStderr = Join-Path $restartFixture 'restart.stderr.log'
    $restartProcess = Start-Process `
        -FilePath ([IO.Path]::GetFullPath((Join-Path ([Environment]::SystemDirectory) 'WindowsPowerShell\v1.0\powershell.exe'))) `
        -ArgumentList @(
            '-NoLogo', '-NoProfile', '-ExecutionPolicy', 'Bypass',
            '-File', (Join-Path $restartFixture 'bootstrap-windows.ps1'),
            '-WorkspaceRoot', $Root,
            '-Action', 'Ensure',
            '-RuntimePreference', 'podman'
        ) `
        -Wait `
        -PassThru `
        -RedirectStandardOutput $restartStdout `
        -RedirectStandardError $restartStderr
    $restartOutput = ((Get-Content -LiteralPath $restartStdout -Raw) + "`n" + (Get-Content -LiteralPath $restartStderr -Raw))
    Assert-Equal 75 $restartProcess.ExitCode 'Restart-required must preserve the stable process exit code.'
    Assert-True ($restartOutput.Contains('Windows must restart once.')) 'Restart-required must remain human-readable.'
    Assert-True (-not $restartOutput.Contains('WriteErrorException')) 'Controlled runtime failures must not leak a PowerShell error stack.'

    Write-Output 'Windows adaptive container runtime contract passed'
} finally {
    Remove-Module Talos.ContainerRuntime -ErrorAction SilentlyContinue
    if (Test-Path -LiteralPath $TempRoot) {
        $normalizedTemp = [IO.Path]::GetFullPath([IO.Path]::GetTempPath()).TrimEnd([IO.Path]::DirectorySeparatorChar) + [IO.Path]::DirectorySeparatorChar
        $normalizedTarget = [IO.Path]::GetFullPath($TempRoot)
        if ($normalizedTarget.StartsWith($normalizedTemp, [StringComparison]::OrdinalIgnoreCase)) {
            [IO.Directory]::Delete($normalizedTarget, $true)
        }
    }
}
