[CmdletBinding()]
param(
    [Parameter(Mandatory = $true, Position = 0)]
    [string]$WorkspacePath,

    [string]$BaseUrl = 'http://127.0.0.1:4174',

    [string]$TokenFile = '',

    [switch]$NoBrowser
)

$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'

function Assert-LoopbackBaseUrl {
    param([string]$Value)

    try {
        $uri = [Uri]$Value
    }
    catch {
        throw [InvalidOperationException]::new('TALOS non riconosce l’indirizzo del servizio locale. Reinstalla questa integrazione e riprova.')
    }

    $loopbackHosts = @('127.0.0.1', 'localhost', '::1')
    if (
        $uri.Scheme -ne 'http' -or
        $loopbackHosts -notcontains $uri.Host -or
        $uri.AbsolutePath -ne '/' -or
        $uri.Query -ne '' -or
        $uri.Fragment -ne '' -or
        $uri.UserInfo -ne ''
    ) {
        throw [InvalidOperationException]::new('TALOS accetta questo comando soltanto dal servizio locale del computer. Reinstalla questa integrazione e riprova.')
    }

    return $uri.GetLeftPart([UriPartial]::Authority).TrimEnd('/')
}

try {
    $localBaseUrl = Assert-LoopbackBaseUrl -Value $BaseUrl
    $resolvedItem = Resolve-Path -LiteralPath $WorkspacePath -ErrorAction Stop
    $resolvedPath = $resolvedItem.ProviderPath
    if (-not (Test-Path -LiteralPath $resolvedPath -PathType Container)) {
        throw [InvalidOperationException]::new('La voce scelta non è una cartella. Scegli una cartella e riprova.')
    }

    if ([string]::IsNullOrWhiteSpace($TokenFile)) {
        $TokenFile = Join-Path $PSScriptRoot '..\..\.workspace-launch-token'
    }
    if (-not (Test-Path -LiteralPath $TokenFile -PathType Leaf)) {
        throw [InvalidOperationException]::new('TALOS deve essere riavviato una volta prima di usare “Apri cartella con TALOS”. Avvia TALOS e riprova.')
    }

    $token = (Get-Content -Raw -LiteralPath $TokenFile).Trim()
    if ($token -notmatch '^[a-f0-9]{64}$') {
        throw [InvalidOperationException]::new('L’integrazione locale di TALOS non è pronta. Reinstalla questa integrazione e riprova.')
    }

    $body = @{ percorso = $resolvedPath } | ConvertTo-Json -Compress
    try {
        $response = Invoke-RestMethod `
            -Uri "$localBaseUrl/api/v1/workspace-launches" `
            -Method Post `
            -ContentType 'application/json; charset=utf-8' `
            -Headers @{ 'X-TALOS-Launcher-Token' = $token } `
            -Body $body
    }
    catch {
        throw [InvalidOperationException]::new('TALOS non risponde. Avvia l’app, attendi che sia pronta e apri di nuovo la cartella.')
    }

    $launchId = [string]$response.data.id
    if ($launchId -notmatch '^[A-Za-z0-9_-]{32}$') {
        throw [InvalidOperationException]::new('TALOS non ha preparato la cartella. Apri Doctor, controlla il servizio locale e riprova.')
    }

    $launchUrl = "$localBaseUrl/#open-workspace=$launchId"
    if ($NoBrowser) {
        [pscustomobject]@{
            url = $launchUrl
            workspaceName = [string]$response.data.nome
        } | ConvertTo-Json -Compress
    }
    else {
        Start-Process -FilePath $launchUrl
    }
}
catch {
    $message = if ($_.Exception.Message) { $_.Exception.Message } else { 'TALOS non ha aperto la cartella. Avvia l’app e riprova.' }
    if ($NoBrowser) {
        Write-Error $message
    }
    else {
        $shell = New-Object -ComObject WScript.Shell
        [void]$shell.Popup($message, 0, 'TALOS', 16)
    }
    exit 1
}
