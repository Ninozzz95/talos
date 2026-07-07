$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $PSScriptRoot
$node = Join-Path $root '.tools\node\node.exe'
$php = Join-Path $root '.tools\php\php.exe'
$validatorDir = Join-Path $root 'validator'
$coreDir = Join-Path $root 'core'
$port = if ($env:KADMOS_CONTRACT_VALIDATOR_PORT) { [int]$env:KADMOS_CONTRACT_VALIDATOR_PORT } else { 3010 }
$baseUrl = "http://127.0.0.1:$port"

if (!(Test-Path $node)) { $node = 'node' }
if (!(Test-Path $php)) { $php = 'php' }

$process = $null
$previousPort = $env:PORT
$previousHost = $env:HOST
try {
    $env:PORT = "$port"
    $env:HOST = '127.0.0.1'

    $process = Start-Process `
        -FilePath $node `
        -ArgumentList @('.\dist\server.js') `
        -WorkingDirectory $validatorDir `
        -PassThru `
        -WindowStyle Hidden `
        -RedirectStandardOutput (Join-Path $validatorDir 'contract-validator.out.log') `
        -RedirectStandardError (Join-Path $validatorDir 'contract-validator.err.log')

    $healthy = $false
    foreach ($attempt in 1..40) {
        try {
            $response = Invoke-RestMethod -Uri "$baseUrl/health" -Method Get -TimeoutSec 1
            if ($response.status -eq 'ok') {
                $healthy = $true
                break
            }
        } catch {
            Start-Sleep -Milliseconds 250
        }
    }

    if (!$healthy) {
        throw "Validator did not become healthy at $baseUrl"
    }

    Write-Host "Validator started at $baseUrl"
    $env:KADMOS_CONTRACT_VALIDATOR_URL = $baseUrl
    & $php (Join-Path $coreDir 'tests\Contract\ValidatorContractTest.php')
    if ($LASTEXITCODE -ne 0) {
        exit $LASTEXITCODE
    }
} finally {
    if ($null -eq $previousPort) { Remove-Item Env:\PORT -ErrorAction SilentlyContinue } else { $env:PORT = $previousPort }
    if ($null -eq $previousHost) { Remove-Item Env:\HOST -ErrorAction SilentlyContinue } else { $env:HOST = $previousHost }

    if ($process -and !$process.HasExited) {
        Stop-Process -Id $process.Id -Force
        Write-Host "Validator stopped"
    }
}
