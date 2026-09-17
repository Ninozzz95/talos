# CI ONLY: creates one expiring non-administrator fixture account in a disposable
# GitHub-hosted VM. The product/local entry never provisions an account.
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$PSNativeCommandUseErrorActionPreference = $false
if (-not $IsWindows -or $env:GITHUB_ACTIONS -ne 'true' -or $env:RUNNER_ENVIRONMENT -ne 'github-hosted') {
    throw 'Account fixture permitted only in an explicit disposable GitHub-hosted job'
}
$principal = [Security.Principal.WindowsPrincipal]::new([Security.Principal.WindowsIdentity]::GetCurrent())
if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) { throw 'CI provisioner is not administrator' }
$evidence = Join-Path $PSScriptRoot 'evidence-client-ci'
if (Test-Path -LiteralPath $evidence) { throw 'Client CI evidence already exists' }
New-Item -ItemType Directory -Path $evidence | Out-Null
$receipt = [ordered]@{
    schema='talos.client-ci-fixture.v1'; checkout=(& git rev-parse HEAD)
    provisionerElevated=$true; accountCreated=$false; accountRemoved=$false
    profileRemoved=$false; temporaryTreeRemoved=$false; elevatedControlRejected=$false
    clientNativeExit=$null; fullContainmentVerified=$false; releaseReady=$false
    cleanupErrors=@(); error=$null
}
$root = Join-Path $env:SystemDrive ('TALOSClient.' + [Guid]::NewGuid().ToString('N'))
$name = 'tlab' + [Guid]::NewGuid().ToString('N').Substring(0,12)
$user = $null
$child = $null
$nativeExit = 1
function Set-FixtureAcl([string]$Path, [string]$Sddl) {
    $acl = Get-Acl -LiteralPath $Path
    $acl.SetSecurityDescriptorSddlForm($Sddl)
    Set-Acl -LiteralPath $Path -AclObject $acl
}
try {
    # Password is synthetic, in-memory only, never written to output/arguments.
    $random = [Security.Cryptography.RandomNumberGenerator]::GetBytes(32)
    $secret = ConvertTo-SecureString ('Aa1!' + [Convert]::ToBase64String($random)) -AsPlainText -Force
    $user = New-LocalUser -Name $name -Password $secret -AccountExpires ([DateTime]::Now.AddHours(1)) -Description 'Disposable TALOS CI fixture'
    $receipt.accountCreated = $true
    $sid = $user.SID.Value
    $users = Get-LocalGroup -SID 'S-1-5-32-545'
    if (@(Get-LocalGroupMember -Group $users | Where-Object { $_.SID.Value -eq $sid }).Count -eq 0) {
        Add-LocalGroupMember -Group $users -Member $user
    }
    $admins = Get-LocalGroup -SID 'S-1-5-32-544'
    if (@(Get-LocalGroupMember -Group $admins | Where-Object { $_.SID.Value -eq $sid }).Count -ne 0) { throw 'Fixture accidentally has administrator membership' }
    New-Item -ItemType Directory -Path $root | Out-Null
    Set-FixtureAcl $root "D:P(A;OICI;FA;;;SY)(A;OICI;FA;;;BA)(A;OICI;0x1200a9;;;$sid)"
    $work = Join-Path $root 'work'
    New-Item -ItemType Directory -Path $work | Out-Null
    Set-FixtureAcl $work "D:P(A;OICI;FA;;;SY)(A;OICI;FA;;;BA)(A;OICI;0x1301bf;;;$sid)"
    $exe = Join-Path $root 'probe.exe'
    $entry = Join-Path $root 'run-client.ps1'
    Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'target/release/talos-containment-spike.exe') -Destination $exe
    Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'run-client.ps1') -Destination $entry
    foreach ($file in @($exe,$entry)) { Set-FixtureAcl $file "D:P(A;;FA;;;SY)(A;;FA;;;BA)(A;;0x1200a9;;;$sid)" }
    $pwsh = Join-Path $PSHOME 'pwsh.exe'
    $negative = Join-Path $root 'elevated-control'
    & $pwsh -NoLogo -NoProfile -NonInteractive -File $entry -Executable $exe -EvidenceDirectory $negative
    $negativeExit = $LASTEXITCODE
    $negativeReport = Get-Content -LiteralPath (Join-Path $negative 'client-run.json') -Raw | ConvertFrom-Json
    if ($negativeExit -ne 78 -or $negativeReport.status -ne 'HOST_PROFILE_REJECTED') { throw 'Elevated negative control was not rejected before probes' }
    $receipt.elevatedControlRejected = $true
    Copy-Item -LiteralPath $negative -Destination (Join-Path $evidence 'elevated-control') -Recurse
    $out = Join-Path $work 'standard-user'
    $credential = [PSCredential]::new("$env:COMPUTERNAME\$name", $secret)
    $arguments = "-NoLogo -NoProfile -NonInteractive -File `"$entry`" -Executable `"$exe`" -EvidenceDirectory `"$out`""
    $child = Start-Process -FilePath $pwsh -ArgumentList $arguments -Credential $credential -LoadUserProfile -WorkingDirectory $work -PassThru
    if (-not $child.WaitForExit(120000)) { $child.Kill($true); [void]$child.WaitForExit(10000); throw 'Standard-user entry exceeded deadline' }
    $receipt.clientNativeExit = $child.ExitCode
    $nativeExit = $child.ExitCode
    Copy-Item -LiteralPath $out -Destination (Join-Path $evidence 'standard-user') -Recurse
    $profile = Get-Content -LiteralPath (Join-Path $out 'host-profile.json') -Raw | ConvertFrom-Json
    if ($profile.accepted -ne $true -or $profile.standard_user -ne $true -or $profile.scope -ne 'windows11-arm64-x64-emulated') {
        throw 'Measured client profile does not match this CI experiment'
    }
    $receipt.binarySha256 = (Get-FileHash -LiteralPath $exe -Algorithm SHA256).Hash.ToLowerInvariant()
} catch {
    $receipt.error = $_.Exception.Message
    $nativeExit = 1
} finally {
    if ($null -ne $child) {
        if (-not $child.HasExited) { $child.Kill($true); [void]$child.WaitForExit(10000) }
        $child.Dispose()
    }
    if ($null -ne $user) {
        # Only the exact SID created above is eligible for removal.
        try {
            $profileObjects = @(Get-CimInstance Win32_UserProfile -Filter "SID='$($user.SID.Value)'")
            foreach ($profileObject in $profileObjects) {
                if ($profileObject.Special -or $profileObject.Loaded) { throw 'Fixture profile is special or still loaded' }
                $profileObject | Remove-CimInstance
            }
            $receipt.profileRemoved = @(Get-CimInstance Win32_UserProfile -Filter "SID='$($user.SID.Value)'").Count -eq 0
        } catch { $receipt.cleanupErrors += "profile: $($_.Exception.Message)" }
        try { Remove-LocalUser -SID $user.SID; $receipt.accountRemoved = $true }
        catch { $receipt.cleanupErrors += "account: $($_.Exception.Message)" }
    }
    try {
        if (Test-Path -LiteralPath $root) { Remove-Item -LiteralPath $root -Recurse -Force }
        $receipt.temporaryTreeRemoved = -not (Test-Path -LiteralPath $root)
    } catch { $receipt.cleanupErrors += "tree: $($_.Exception.Message)" }
    $receipt | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath (Join-Path $evidence 'ci-fixture.json') -Encoding utf8
}
if ($receipt.cleanupErrors.Count -ne 0) { throw 'Disposable fixture cleanup incomplete; see ci-fixture.json' }
# Native FAIL remains FAIL. Collection is not an OS containment certificate.
exit $nativeExit
