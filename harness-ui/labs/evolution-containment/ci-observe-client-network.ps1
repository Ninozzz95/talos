# CI-only read-only witness. The measured launcher and its children stay standard-user.
# Dot-source only from the existing disposable-VM provisioner, never from the app.
Set-StrictMode -Version Latest

function Get-ClientWitnessImage([string]$Executable) {
    if (-not ('TalosClientWitnessNative' -as [type])) {
        Add-Type -TypeDefinition @'
using System;
using System.ComponentModel;
using System.Runtime.InteropServices;
using System.Text;
public static class TalosClientWitnessNative {
    [DllImport("kernel32.dll", CharSet=CharSet.Unicode, SetLastError=true)]
    private static extern uint GetFinalPathNameByHandleW(IntPtr handle, StringBuilder path, uint size, uint flags);
    public static string NativeImage(string path) {
        using (var file = System.IO.File.OpenRead(path)) {
            var name = new StringBuilder(32768);
            uint count = GetFinalPathNameByHandleW(file.SafeFileHandle.DangerousGetHandle(), name, 32768, 2);
            if (count == 0) throw new Win32Exception(Marshal.GetLastWin32Error());
            if (count >= 32768) throw new InvalidOperationException("image path exceeds limit");
            return name.ToString();
        }
    }
}
'@
    }
    [TalosClientWitnessNative]::NativeImage($Executable)
}

function Start-ClientNetworkWitness([string]$Executable, [string]$UserSid, [string]$Directory) {
    if ($env:GITHUB_ACTIONS -ne 'true' -or $env:RUNNER_ENVIRONMENT -ne 'github-hosted') {
        throw 'Network witness only supports the disposable GitHub-hosted experiment'
    }
    $principal = [Security.Principal.WindowsPrincipal]::new([Security.Principal.WindowsIdentity]::GetCurrent())
    if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) { throw 'CI witness is not elevated' }
    if ($UserSid -notmatch '^S-1-5-21-\d+-\d+-\d+-\d+$') { throw 'Invalid fixture SID' }
    if (Test-Path -LiteralPath $Directory) { throw 'Witness output already exists' }
    New-Item -ItemType Directory -Path $Directory | Out-Null
    # No write or read grant to the temporary standard-user account or its packages.
    $acl = Get-Acl -LiteralPath $Directory
    $acl.SetSecurityDescriptorSddlForm('D:P(A;OICI;FA;;;SY)(A;OICI;FA;;;BA)')
    Set-Acl -LiteralPath $Directory -AclObject $acl
    $Executable = (Resolve-Path -LiteralPath $Executable).Path
    $sources = [ordered]@{}
    foreach ($name in @('ci-observe-client-network.ps1','ci-client-standard-user.ps1','run-client.ps1',
                       'review_client_network.py','test_client_network.py','review_network_correlation.py')) {
        $sources[$name] = (Get-FileHash -LiteralPath (Join-Path $PSScriptRoot $name) -Algorithm SHA256).Hash.ToLowerInvariant()
    }
    $selection = [ordered]@{
        schema='talos.client-network-witness.selection.v1'
        scope='windows11-arm64-x64-emulated-standard-user-ipv4-loopback'
        query_window_policy='observed-elapsed-ceiling-plus-six-seconds-max60.v1'
        selected_at_ms=[DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
        checkout=(& git rev-parse HEAD); owner_sid=$UserSid; witness_directory=$Directory
        listener_image_dos=$Executable; listener_image_nt=(Get-ClientWitnessImage $Executable)
        binary_sha256=(Get-FileHash -LiteralPath $Executable -Algorithm SHA256).Hash.ToLowerInvariant()
        source_sha256=$sources; observer_elevated=$true; measured_runtime_elevated=$false
        network_configuration_changed=$false; full_containment_verified=$false; release_ready=$false
    }
    $selection | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath (Join-Path $Directory 'selection.json') -Encoding utf8
    return $selection
}

function Complete-ClientNetworkWitness($Selection, [string]$ProbeLog, [string]$Directory) {
    $receipt = [ordered]@{
        schema='talos.client-network-witness.collection.v1'; status='FAIL'
        selection_sha256=(Get-FileHash -LiteralPath (Join-Path $Directory 'selection.json') -Algorithm SHA256).Hash.ToLowerInvariant()
        probes_sha256=$null; started_ms=[DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
        finished_ms=$null; netsh_exit_code=$null; arguments=@(); xml_sha256=$null; timewindow_seconds=$null
        observer_elevated=$true; configuration_changed=$false; error=$null
    }
    $process = $null
    try {
        $log = Get-Item -LiteralPath $ProbeLog
        if (($log.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0 -or $log.Length -gt 2097152) { throw 'Unsafe or oversized probe log' }
        $receipt.probes_sha256 = (Get-FileHash -LiteralPath $ProbeLog -Algorithm SHA256).Hash.ToLowerInvariant()
        $records = @([IO.File]::ReadAllLines($ProbeLog) | Where-Object { $_.Trim() } | ForEach-Object { ConvertFrom-Json $_ -AsHashtable })
        $observed = @($records | Where-Object { $_['diagnostic'] -eq 'broker_tcp_subjects' })
        if ($observed.Count -ne 1) { throw 'A unique broker TCP observation is required' }
        $tcp = $observed[0]
        if ($tcp['address'] -ne '127.0.0.1' -or $tcp['owner_sid'] -cne $Selection.owner_sid -or
            $tcp['listener_image_nt'] -ine $Selection.listener_image_nt -or @($tcp['subjects']).Count -ne 1) {
            throw 'TCP observation does not match the CI-owned fixture identity'
        }
        $target = $tcp['listener_port']; $source = $tcp['subjects'][0]['source_port']
        foreach ($port in @($source,$target)) {
            if (($port -isnot [long] -and $port -isnot [int]) -or $port -lt 1 -or $port -gt 65535) { throw 'Invalid numeric port' }
        }
        if ($source -eq $target) { throw 'Source aliases target' }
        if ($tcp['started_ms'] -lt $Selection.selected_at_ms -or
            $receipt.started_ms -lt $tcp['finished_ms'] -or $receipt.started_ms - $tcp['started_ms'] -gt 60000) {
            throw 'Observation falls outside the fresh, sixty-second query window'
        }
        if ((Get-FileHash -LiteralPath $Selection.listener_image_dos -Algorithm SHA256).Hash.ToLowerInvariant() -cne $Selection.binary_sha256) {
            throw 'CI-owned executable changed'
        }
        # Query only this measurement plus the five-second utility deadline
        # and one second of rounding margin. Never remove the time filter or
        # widen/retry a failed query. Invalid/too-old intervals remain failures.
        $ageMs = $receipt.started_ms - [long]$tcp['started_ms']
        $windowSeconds = [int][Math]::Ceiling($ageMs / 1000.0) + 6
        if ($windowSeconds -lt 7 -or $windowSeconds -gt 60) { throw 'Measured interval does not fit the bounded WFP window' }
        $receipt.timewindow_seconds = $windowSeconds
        $xml = Join-Path $Directory 'events.xml'
        # Arguments are individual literal values, not shell text or a candidate-supplied command.
        $query = @('wfp','show','netevents',"file=$xml",'protocol=6','localaddr=127.0.0.1',
                   'remoteaddr=127.0.0.1',"localport=$target","remoteport=$source",
                   "appid=$($Selection.listener_image_dos)","userid=$($Selection.owner_sid)","timewindow=$windowSeconds")
        $receipt.arguments = $query
        $info = [Diagnostics.ProcessStartInfo]::new((Join-Path ([Environment]::SystemDirectory) 'netsh.exe'))
        foreach ($arg in $query) { $info.ArgumentList.Add($arg) }
        $info.UseShellExecute=$false; $info.CreateNoWindow=$true; $info.WorkingDirectory=$Directory
        $info.Environment.Clear(); $info.Environment['SystemRoot']=[Environment]::GetEnvironmentVariable('SystemRoot')
        $info.RedirectStandardOutput=$true; $info.RedirectStandardError=$true
        $process = [Diagnostics.Process]::new(); $process.StartInfo=$info
        if (-not $process.Start()) { throw 'Read-only WFP witness did not start' }
        $stdout=$process.StandardOutput.ReadToEndAsync(); $stderr=$process.StandardError.ReadToEndAsync()
        if (-not $process.WaitForExit(5000)) { throw 'Read-only WFP query exceeded deadline' }
        $out=$stdout.GetAwaiter().GetResult(); $err=$stderr.GetAwaiter().GetResult()
        if ($out.Length -gt 65536 -or $err.Length -gt 65536) { throw 'Utility diagnostics exceed bounds' }
        [IO.File]::WriteAllText((Join-Path $Directory 'netsh.stdout.txt'),$out)
        [IO.File]::WriteAllText((Join-Path $Directory 'netsh.stderr.txt'),$err)
        $receipt.netsh_exit_code=$process.ExitCode
        if ($process.ExitCode -ne 0) { throw "Read-only WFP query failed with exit $($process.ExitCode)" }
        $file=Get-Item -LiteralPath $xml
        if ($file.Length -le 0 -or $file.Length -gt 524288) { throw 'Missing or oversized WFP XML' }
        $receipt.xml_sha256=(Get-FileHash -LiteralPath $xml -Algorithm SHA256).Hash.ToLowerInvariant()
        $receipt.status='COLLECTED_NOT_VERIFIED'
    } catch { $receipt.error=$_.Exception.Message }
    finally {
        if ($null -ne $process) {
            if (-not $process.HasExited) { $process.Kill($true); [void]$process.WaitForExit(10000) }
            $process.Dispose()
        }
        $receipt.finished_ms=[DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
        $receipt | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath (Join-Path $Directory 'collection.json') -Encoding utf8
    }
    # Collection alone is never a block verdict; the offline reviewer must correlate it.
}
