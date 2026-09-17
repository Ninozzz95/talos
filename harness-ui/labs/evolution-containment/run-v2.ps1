# Opt-in, fresh v2 experiment. Native v1 and its artifacts remain unchanged.
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$PSNativeCommandUseErrorActionPreference = $false
if (-not $IsWindows -or -not [Environment]::Is64BitProcess) { throw 'Windows x64 / PowerShell 7 required' }
Push-Location $PSScriptRoot
try {
    & python -m unittest -v test_containment_v2
    if ($LASTEXITCODE -ne 0) { throw 'V2 contract tests failed; no native experiment started' }
    & python review_containment_v2.py begin evidence
    if ($LASTEXITCODE -ne 0) { throw 'V2 preselection failed; old evidence is never overwritten' }
    # The native runner persists FAIL on its old numeric network criterion.
    # Catching it is not acceptance: the independent v2 evaluator must check
    # every native gate, exact exit/manifest, correlation and source inventory.
    try { & ./run.ps1 } catch { Write-Host "Legacy runner result retained: $($_.Exception.Message)" }
    & python review_containment_v2.py fresh evidence
    if ($LASTEXITCODE -ne 0) { throw 'V2 contract rejected the measurement; see evidence' }
} finally { Pop-Location }
