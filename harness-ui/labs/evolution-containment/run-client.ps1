# Local entry: never creates accounts, elevates, or changes machine policy.
# Run explicitly in a disposable Windows client environment after building.
param(
    [string]$Executable = (Join-Path $PSScriptRoot 'target/release/talos-containment-spike.exe'),
    [string]$EvidenceDirectory = (Join-Path $PSScriptRoot 'evidence-client')
)
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
if (-not $IsWindows -or -not [Environment]::Is64BitProcess) { throw 'Windows / 64-bit PowerShell required' }
$Executable = (Resolve-Path -LiteralPath $Executable).Path
$EvidenceDirectory = [IO.Path]::GetFullPath($EvidenceDirectory)
if (Test-Path -LiteralPath $EvidenceDirectory) { throw 'Refusing an existing client evidence directory' }
New-Item -ItemType Directory -Path $EvidenceDirectory | Out-Null
$manifest = [ordered]@{
    schema = 'talos.client-experiment.run.v1'
    requestedProfile = 'windows-client-standard-user.v1'
    selectedBeforeLaunchUtc = [DateTime]::UtcNow.ToString('o')
    binarySha256 = (Get-FileHash -LiteralPath $Executable -Algorithm SHA256).Hash.ToLowerInvariant()
    entrySha256 = (Get-FileHash -LiteralPath $PSCommandPath -Algorithm SHA256).Hash.ToLowerInvariant()
    nativeExitCode = $null
    status = 'NOT_EXECUTED'
    fullContainmentVerified = $false
    releaseReady = $false
    error = $null
}
$manifest | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath (Join-Path $EvidenceDirectory 'client-selection.json') -Encoding utf8
$process = $null
$exitCode = 1
try {
    $local = [Environment]::GetFolderPath([Environment+SpecialFolder]::LocalApplicationData)
    if (-not $local) { throw 'Current user LocalApplicationData is unavailable; no parent-profile fallback' }
    $info = [Diagnostics.ProcessStartInfo]::new($Executable)
    $info.ArgumentList.Add('--run-synthetic-probes')
    $info.UseShellExecute = $false
    $info.CreateNoWindow = $true
    $info.RedirectStandardOutput = $true
    $info.RedirectStandardError = $true
    $info.WorkingDirectory = $EvidenceDirectory
    $info.Environment.Clear()
    $info.Environment['SystemRoot'] = [Environment]::GetEnvironmentVariable('SystemRoot')
    $info.Environment['LOCALAPPDATA'] = $local
    $info.Environment['TEMP'] = $EvidenceDirectory
    $info.Environment['TMP'] = $EvidenceDirectory
    $info.Environment['TALOS_LAB_CLIENT_PROFILE'] = '1'
    $process = [Diagnostics.Process]::new()
    $process.StartInfo = $info
    if (-not $process.Start()) { throw 'Native client experiment did not start' }
    $stdout = $process.StandardOutput.ReadToEndAsync()
    $stderr = $process.StandardError.ReadToEndAsync()
    $timedOut = -not $process.WaitForExit(90000)
    if ($timedOut) {
        $process.Kill($true)
        if (-not $process.WaitForExit(10000)) { throw 'Process tree did not stop after outer timeout' }
    }
    $out = $stdout.GetAwaiter().GetResult()
    $err = $stderr.GetAwaiter().GetResult()
    # Fixed synthetic program, not an arbitrary candidate output transport.
    if ($out.Length -gt 4194304 -or $err.Length -gt 65536) { throw 'Client evidence exceeds experiment output bounds' }
    [IO.File]::WriteAllText((Join-Path $EvidenceDirectory 'probes.jsonl'), $out)
    [IO.File]::WriteAllText((Join-Path $EvidenceDirectory 'probe-stderr.txt'), $err)
    $manifest.nativeExitCode = $process.ExitCode
    if ($timedOut) { throw 'Client experiment exceeded its deadline; no success inferred' }
    $records = @($out -split '\r?\n' | Where-Object { $_.Trim() } | ForEach-Object { ConvertFrom-Json $_ -AsHashtable })
    if ($records.Count -lt 1 -or $records[0]['schema'] -ne 'talos.client-host-profile.v1') {
        throw 'Missing native host-profile record'
    }
    $hostProfile = $records[0]
    $hostProfile | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath (Join-Path $EvidenceDirectory 'host-profile.json') -Encoding utf8
    if ($hostProfile['accepted'] -ne $true) {
        if ($process.ExitCode -ne 78 -or $records.Count -ne 1) { throw 'Rejected host proceeded beyond preflight' }
        $manifest.status = 'HOST_PROFILE_REJECTED'
    } else {
        $manifest.status = 'CLIENT_EXECUTED_NOT_CERTIFIED'
    }
    $exitCode = $process.ExitCode
} catch {
    $manifest.error = $_.Exception.Message
    $manifest.status = 'FAIL'
    $exitCode = 1
} finally {
    if ($null -ne $process) {
        if (-not $process.HasExited) { $process.Kill($true); [void]$process.WaitForExit(10000) }
        $process.Dispose()
    }
    $manifest | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath (Join-Path $EvidenceDirectory 'client-run.json') -Encoding utf8
}
# Preserve the actual native result. Server-v2 is NEVER replayed as client PASS.
exit $exitCode
