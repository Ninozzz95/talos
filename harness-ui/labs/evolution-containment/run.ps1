# Runs only synthetic fixtures. Never starts TALOS, changes firewall policy,
# enables loopback exemptions, installs a service, or requests elevation.
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$PSNativeCommandUseErrorActionPreference = $false
if (-not $IsWindows -or -not [Environment]::Is64BitProcess) { throw 'Windows x64 / PowerShell 7 required' }
Push-Location $PSScriptRoot
$evidence = Join-Path $PSScriptRoot 'evidence'
New-Item -ItemType Directory -Force -Path $evidence | Out-Null
$manifest = [ordered]@{
    schema = 'talos.containment-spike.run.v1'
    status = 'FAIL'
    checkout = (& git rev-parse HEAD)
    os = [Environment]::OSVersion.VersionString
    architecture = [Runtime.InteropServices.RuntimeInformation]::ProcessArchitecture.ToString()
    toolchain = '1.90.0'
    inputs = @()
    binarySha256 = $null
    probeExitCode = $null
    error = $null
}
try {
    & rustc -Vv 2>&1 | Tee-Object -FilePath (Join-Path $evidence 'rustc.txt')
    if ($LASTEXITCODE -ne 0) { throw 'rustc unavailable' }
    & cargo test --frozen 2>&1 | Tee-Object -FilePath (Join-Path $evidence 'unit.log')
    if ($LASTEXITCODE -ne 0) { throw 'Unit tests failed' }
    & cargo build --release --frozen 2>&1 | Tee-Object -FilePath (Join-Path $evidence 'build.log')
    if ($LASTEXITCODE -ne 0) { throw 'Build failed' }
    foreach ($file in (Get-ChildItem src -File -Recurse | Sort-Object FullName)) {
        $manifest.inputs += @{ path = [IO.Path]::GetRelativePath($PSScriptRoot, $file.FullName); sha256 = (Get-FileHash $file.FullName -Algorithm SHA256).Hash.ToLowerInvariant() }
    }
    foreach ($file in @('Cargo.toml', 'Cargo.lock', 'rust-toolchain.toml', 'run.ps1')) {
        $manifest.inputs += @{ path = $file; sha256 = (Get-FileHash $file -Algorithm SHA256).Hash.ToLowerInvariant() }
    }
    $exe = Join-Path $PSScriptRoot 'target/release/talos-containment-spike.exe'
    $manifest.binarySha256 = (Get-FileHash $exe -Algorithm SHA256).Hash.ToLowerInvariant()
    $info = [Diagnostics.ProcessStartInfo]::new($exe)
    $info.ArgumentList.Add('--run-synthetic-probes')
    $info.UseShellExecute = $false
    $info.RedirectStandardOutput = $true
    $info.RedirectStandardError = $true
    $process = [Diagnostics.Process]::new()
    $process.StartInfo = $info
    try {
        if (-not $process.Start()) { throw 'Probe did not start' }
        $stdout = $process.StandardOutput.ReadToEndAsync()
        $stderr = $process.StandardError.ReadToEndAsync()
        if (-not $process.WaitForExit(60000)) {
            $process.Kill($true)
            $process.WaitForExit()
            throw 'Probe exceeded the 60-second outer deadline; containment NOT verified'
        }
        $out = $stdout.GetAwaiter().GetResult()
        $err = $stderr.GetAwaiter().GetResult()
        [IO.File]::WriteAllText((Join-Path $evidence 'probes.jsonl'), $out)
        [IO.File]::WriteAllText((Join-Path $evidence 'probe-stderr.txt'), $err)
        Write-Host $out
        if ($err) { Write-Host $err }
        $manifest.probeExitCode = $process.ExitCode
        if ($process.ExitCode -ne 0) { throw "Probe exited $($process.ExitCode); no success inferred from a failed launch" }
        $records = @($out -split '\r?\n' | Where-Object { $_.Trim() } | ForEach-Object { ConvertFrom-Json $_ })
        if ($records.Count -eq 0 -or $records[-1].result -ne 'PASS') { throw 'Missing final PASS record' }
        $manifest.status = 'PASS'
    } finally { $process.Dispose() }
} catch {
    $manifest.error = $_.Exception.Message
    throw
} finally {
    $manifest | ConvertTo-Json -Depth 8 | Set-Content -Encoding utf8 (Join-Path $evidence 'run.json')
    Pop-Location
}
