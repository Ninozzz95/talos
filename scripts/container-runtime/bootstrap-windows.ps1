[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)][string] $WorkspaceRoot,
    [Parameter(Mandatory = $true)][ValidateSet('Ensure', 'Detect', 'Doctor', 'PrepareElevated')][string] $Action,
    [ValidateSet('auto', 'docker', 'podman')][string] $RuntimePreference = 'auto',
    [ValidateSet('docker-wsl', 'podman-wsl', 'podman-hyperv')][string] $ElevatedMode,
    [string] $ResultPath,
    [string] $ExpectedBootstrapSha256,
    [string] $ExpectedModuleSha256,
    [string] $ExpectedManifestSha256,
    [string] $ExpectedPodmanSha256,
    [string] $RequestingUserSid
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'

$WorkspaceRoot = [IO.Path]::GetFullPath($WorkspaceRoot)
$ModulePath = Join-Path $PSScriptRoot 'Talos.ContainerRuntime.psm1'
$ManifestPath = Join-Path $PSScriptRoot 'manifest.json'

function Assert-TalosBootstrapFileHash {
    param(
        [Parameter(Mandatory = $true)][string] $Path,
        [Parameter(Mandatory = $true)][string] $ExpectedSha256,
        [Parameter(Mandatory = $true)][string] $Name
    )

    if ($ExpectedSha256 -notmatch '^[a-f0-9]{64}$') {
        throw "$Name integrity digest is invalid."
    }
    if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) {
        throw "$Name is missing: $Path"
    }
    $actual = (Get-FileHash -LiteralPath $Path -Algorithm SHA256).Hash.ToLowerInvariant()
    if ($actual -ne $ExpectedSha256) {
        throw "$Name changed after the elevation request was approved."
    }
}

if ($Action -eq 'PrepareElevated') {
    Assert-TalosBootstrapFileHash -Path $PSCommandPath -ExpectedSha256 $ExpectedBootstrapSha256 -Name 'TALOS bootstrap'
    Assert-TalosBootstrapFileHash -Path $ModulePath -ExpectedSha256 $ExpectedModuleSha256 -Name 'TALOS runtime module'
    Assert-TalosBootstrapFileHash -Path $ManifestPath -ExpectedSha256 $ExpectedManifestSha256 -Name 'TALOS runtime manifest'
    if (-not [string]::IsNullOrWhiteSpace($ExpectedPodmanSha256)) {
        $podmanPath = Join-Path $WorkspaceRoot '.tools\container-runtime\podman\usr\bin\podman.exe'
        Assert-TalosBootstrapFileHash -Path $podmanPath -ExpectedSha256 $ExpectedPodmanSha256 -Name 'Pinned Podman executable'
    }
}

if (-not (Test-Path -LiteralPath $ModulePath -PathType Leaf)) {
    Write-Error "TALOS container runtime module is missing: $ModulePath"
    exit 1
}
Import-Module $ModulePath -Force

function Get-TalosDoctorEvidenceValue {
    param(
        [Parameter(Mandatory = $true)] $Evidence,
        [Parameter(Mandatory = $true)][string] $Name,
        $Fallback = ''
    )

    if ($Evidence -is [Collections.IDictionary] -and $Evidence.Contains($Name)) {
        return $Evidence[$Name]
    }
    $property = $Evidence.PSObject.Properties[$Name]
    if ($null -eq $property -or $null -eq $property.Value) {
        return $Fallback
    }
    return $property.Value
}

function Write-TalosDoctorLine {
    param(
        [Parameter(Mandatory = $true)][string] $Label,
        [Parameter(Mandatory = $true)][ValidateSet('OK', 'INFO', 'WARN')][string] $Level,
        [Parameter(Mandatory = $true)][string] $Value
    )

    Write-Host ('{0,-20}{1,-5}{2}' -f $Label, $Level, $Value)
}

function Write-TalosDoctorResult {
    param([Parameter(Mandatory = $true)] $Result)

    $kind = if ($null -ne $Result.plan -and -not [string]::IsNullOrWhiteSpace([string]$Result.plan.kind)) {
        [string]$Result.plan.kind
    } else {
        'none'
    }
    $provider = if ($null -ne $Result.plan -and -not [string]::IsNullOrWhiteSpace([string]$Result.plan.machine_provider)) {
        [string]$Result.plan.machine_provider
    } else {
        'host'
    }
    Write-TalosDoctorLine -Label 'runtime selection' -Level INFO -Value $kind
    Write-TalosDoctorLine -Label 'runtime provider' -Level INFO -Value $provider

    if ($kind -eq 'podman') {
        $version = [string](Get-TalosDoctorEvidenceValue -Evidence $Result.evidence -Name podman_version -Fallback 'unavailable')
        $machineState = [string](Get-TalosDoctorEvidenceValue -Evidence $Result.evidence -Name podman_machine_state -Fallback 'unavailable')
        $engineHealthy = [bool](Get-TalosDoctorEvidenceValue -Evidence $Result.evidence -Name podman_healthy -Fallback $false)
        $composeVersion = [string](Get-TalosDoctorEvidenceValue -Evidence $Result.evidence -Name podman_compose_version -Fallback 'unavailable')
        $composeHealthy = [bool](Get-TalosDoctorEvidenceValue -Evidence $Result.evidence -Name podman_compose_healthy -Fallback $false)
        $hyperVStorageReady = [bool](Get-TalosDoctorEvidenceValue -Evidence $Result.evidence -Name hyper_v_storage_ready -Fallback $false)
        Write-TalosDoctorLine -Label 'runtime version' -Level $(if ($version -eq 'unavailable') { 'WARN' } else { 'INFO' }) -Value $version
        Write-TalosDoctorLine -Label 'machine state' -Level $(if ($machineState -eq 'running') { 'OK' } else { 'WARN' }) -Value $machineState
        if ($provider -eq 'hyperv') {
            Write-TalosDoctorLine -Label 'hyper-v storage' -Level $(if ($hyperVStorageReady) { 'OK' } else { 'WARN' }) -Value $(if ($hyperVStorageReady) { 'ready' } else { 'preparation_required' })
        }
    } else {
        $version = [string](Get-TalosDoctorEvidenceValue -Evidence $Result.evidence -Name docker_version -Fallback 'unavailable')
        $engineHealthy = [bool](Get-TalosDoctorEvidenceValue -Evidence $Result.evidence -Name docker_healthy -Fallback $false)
        $composeVersion = [string](Get-TalosDoctorEvidenceValue -Evidence $Result.evidence -Name docker_compose_version -Fallback 'unavailable')
        $composeHealthy = [bool](Get-TalosDoctorEvidenceValue -Evidence $Result.evidence -Name docker_compose_healthy -Fallback $false)
        Write-TalosDoctorLine -Label 'runtime version' -Level $(if ($version -eq 'unavailable') { 'WARN' } else { 'INFO' }) -Value $version
        Write-TalosDoctorLine -Label 'machine state' -Level $(if ($engineHealthy) { 'OK' } else { 'WARN' }) -Value 'provider_managed'
    }

    Write-TalosDoctorLine -Label 'container engine' -Level $(if ($engineHealthy) { 'OK' } else { 'WARN' }) -Value $(if ($engineHealthy) { 'healthy' } else { 'unavailable' })
    Write-TalosDoctorLine -Label 'compose provider' -Level $(if ($composeHealthy) { 'OK' } else { 'WARN' }) -Value $composeVersion
    $requiresElevation = $null -ne $Result.plan -and [bool]$Result.plan.requires_elevation
    $requiresRestart = $null -ne $Result.plan -and [bool]$Result.plan.requires_restart
    Write-TalosDoctorLine -Label 'runtime elevation' -Level $(if ($requiresElevation) { 'WARN' } else { 'OK' }) -Value $(if ($requiresElevation) { 'required' } else { 'not_required' })
    Write-TalosDoctorLine -Label 'runtime restart' -Level $(if ($requiresRestart) { 'WARN' } else { 'OK' }) -Value $(if ($requiresRestart) { 'required' } else { 'not_required' })
    if ($null -ne $Result.plan -and -not [string]::IsNullOrWhiteSpace([string]$Result.plan.reason)) {
        Write-TalosDoctorLine -Label 'runtime reason' -Level INFO -Value ([string]$Result.plan.reason)
    }
}

try {
    if ($Action -eq 'PrepareElevated') {
        if ([string]::IsNullOrWhiteSpace($ElevatedMode) -or [string]::IsNullOrWhiteSpace($ResultPath)) {
            throw 'PrepareElevated requires ElevatedMode and ResultPath.'
        }
        $result = Invoke-TalosElevatedPreparation `
            -WorkspaceRoot $WorkspaceRoot `
            -Mode $ElevatedMode `
            -ResultPath $ResultPath `
            -RequestingUserSid $RequestingUserSid
        exit [int]$result.exit_code
    }

    $result = Invoke-TalosWindowsRuntime `
        -WorkspaceRoot $WorkspaceRoot `
        -Action $Action `
        -RuntimePreference $RuntimePreference `
        -BootstrapScriptPath $PSCommandPath

    if ($Action -eq 'Detect') {
        $result | ConvertTo-Json -Depth 8
    } elseif ($Action -eq 'Doctor') {
        Write-TalosDoctorResult -Result $result
    } else {
        if (-not [string]::IsNullOrWhiteSpace([string]$result.message)) {
            if ([int]$result.exit_code -eq 0) {
                Write-Host $result.message
            } else {
                [Console]::Error.WriteLine([string]$result.message)
            }
        }
        if ($null -ne $result.plan) {
            Write-Host "Selected runtime: $($result.plan.kind) ($($result.status))"
        }
    }
    exit [int]$result.exit_code
} finally {
    Remove-Module Talos.ContainerRuntime -ErrorAction SilentlyContinue
}
