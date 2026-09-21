[CmdletBinding()]
param(
    [switch]$Unregister,

    [string]$BaseUrl = 'http://127.0.0.1:4174',

    [string]$RegistryRoot = 'HKCU:\Software\Classes'
)

$ErrorActionPreference = 'Stop'

function Assert-SafeRegistryRoot {
    param([string]$Value)

    if ($Value -notmatch '^HKCU:\\Software\\Classes(?:\\|$)') {
        throw [InvalidOperationException]::new('La registrazione deve restare nelle preferenze del tuo account Windows.')
    }
}

function Assert-LoopbackBaseUrl {
    param([string]$Value)

    try { $uri = [Uri]$Value }
    catch { throw [InvalidOperationException]::new('L’indirizzo locale di TALOS non è valido.') }
    if (
        $uri.Scheme -ne 'http' -or
        @('127.0.0.1', 'localhost', '::1') -notcontains $uri.Host -or
        $uri.AbsolutePath -ne '/' -or
        $uri.Query -ne '' -or
        $uri.Fragment -ne '' -or
        $uri.UserInfo -ne ''
    ) {
        throw [InvalidOperationException]::new('Questa integrazione può aprire soltanto il servizio TALOS locale.')
    }
    return $uri.GetLeftPart([UriPartial]::Authority).TrimEnd('/')
}

Assert-SafeRegistryRoot -Value $RegistryRoot

$verbs = @(
    [pscustomobject]@{
        Path = Join-Path $RegistryRoot 'Directory\shell\Talos.OpenWorkspace'
        Label = 'Apri cartella con TALOS'
        Placeholder = '%1'
    },
    [pscustomobject]@{
        Path = Join-Path $RegistryRoot 'Directory\Background\shell\Talos.OpenWorkspace'
        Label = 'Apri questa cartella in TALOS'
        Placeholder = '%V'
    }
)

if ($Unregister) {
    foreach ($verb in $verbs) {
        if (Test-Path -LiteralPath $verb.Path) {
            Remove-Item -LiteralPath $verb.Path -Recurse -Force
        }
    }
    Write-Output '“Apri cartella con TALOS” è stato rimosso dal menu di Windows.'
    exit 0
}

$localBaseUrl = Assert-LoopbackBaseUrl -Value $BaseUrl
$launcher = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot 'open-with-talos.ps1')).ProviderPath
$powershell = Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe'

foreach ($verb in $verbs) {
    $commandPath = Join-Path $verb.Path 'command'
    New-Item -Path $commandPath -Force | Out-Null
    New-ItemProperty -LiteralPath $verb.Path -Name 'MUIVerb' -PropertyType String -Value $verb.Label -Force | Out-Null
    $command = '"{0}" -NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File "{1}" -BaseUrl "{2}" -WorkspacePath "{3}"' -f `
        $powershell, $launcher, $localBaseUrl, $verb.Placeholder
    Set-Item -LiteralPath $commandPath -Value $command
}

Write-Output '“Apri cartella con TALOS” è disponibile nel menu delle cartelle di Windows.'
Write-Output 'Su Windows 11, durante lo sviluppo, può trovarsi sotto “Mostra altre opzioni”.'
