#requires -Version 7.0
[CmdletBinding()]
param(
    [Parameter(Mandatory)][string]$Installer,
    [string]$InstallDir,
    [string]$ReportPath = (Join-Path $PSScriptRoot '../.prove/R04-ci-smoke.json')
)
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
if (-not $IsWindows) { throw 'Lo smoke NSIS richiede Windows.' }

function Attendi-Condizione([scriptblock]$Prova, [int]$Secondi, [string]$Errore) {
    $scadenza = [DateTime]::UtcNow.AddSeconds($Secondi)
    do {
        if (& $Prova) { return }
        Start-Sleep -Milliseconds 200
    } while ([DateTime]::UtcNow -lt $scadenza)
    throw $Errore
}

function Processi-Installati([string]$Cartella) {
    $prefisso = [IO.Path]::GetFullPath($Cartella).TrimEnd('\') + '\'
    foreach ($processo in Get-Process -ErrorAction Stop) {
        $percorso = $processo.Path
        if (-not $percorso -and $processo.ProcessName -eq 'TALOS' -and -not $processo.HasExited) {
            throw 'Impossibile leggere il percorso di un processo TALOS: controllo residui non affidabile.'
        }
        if ($percorso -and $percorso.StartsWith($prefisso, [StringComparison]::OrdinalIgnoreCase)) {
            [pscustomobject]@{ ProcessId = $processo.Id; Name = $processo.ProcessName; ExecutablePath = $percorso }
        }
    }
}

function Registrazioni-Talos {
    if (Test-Path -LiteralPath $registro) {
        Get-ChildItem -LiteralPath $registro -ErrorAction Stop | Get-ItemProperty | Where-Object {
            $_.PSObject.Properties['DisplayName'] -and $_.DisplayName -eq 'TALOS'
        }
    }
}

function Esegui-Installer([string]$File, [string]$Argomenti) {
    $p = Start-Process -FilePath $File -ArgumentList $Argomenti -PassThru -WindowStyle Hidden
    if (-not $p.WaitForExit(120000)) {
        $p.Kill($true)
        throw 'Installer/disinstallatore oltre il limite di 120 secondi.'
    }
    if ($p.ExitCode -ne 0) { throw "Installer/disinstallatore terminato con codice $($p.ExitCode)." }
}

$Installer = (Resolve-Path -LiteralPath $Installer).Path
$overrideDestinazione = -not [string]::IsNullOrEmpty($InstallDir)
if (-not $overrideDestinazione) { $InstallDir = Join-Path $env:LOCALAPPDATA 'Programs/talos-desktop' }
if (-not [IO.Path]::IsPathFullyQualified($InstallDir) -or $InstallDir -match '["\r\n]') { throw 'InstallDir deve essere un percorso assoluto senza virgolette o righe nuove.' }
$InstallDir = [IO.Path]::GetFullPath($InstallDir).TrimEnd('\')
$ReportPath = [IO.Path]::GetFullPath($ReportPath)
$registro = 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall'
$registrati = @(Registrazioni-Talos)
if ($registrati.Count -gt 0) { throw 'R04-PREFLIGHT: installazione TALOS presente nel registro; non la modifico.' }
foreach ($dir in @($InstallDir, (Join-Path $env:LOCALAPPDATA 'Programs/TALOS'), (Join-Path $env:LOCALAPPDATA 'Programs/talos-desktop'))) {
    if (Test-Path -LiteralPath $dir) { throw "R04-PREFLIGHT: cartella già presente: $dir" }
}
$collegamenti = @(
    (Join-Path ([Environment]::GetFolderPath('DesktopDirectory')) 'TALOS.lnk'),
    (Join-Path ([Environment]::GetFolderPath('Programs')) 'TALOS.lnk')
)
foreach ($file in $collegamenti) { if (Test-Path -LiteralPath $file) { throw "R04-PREFLIGHT: collegamento già presente: $file" } }
if (@(Processi-Installati $InstallDir).Count -gt 0) { throw 'R04-PREFLIGHT: processo TALOS preesistente.' }

$prova = Join-Path ([IO.Path]::GetTempPath()) ('talos-r04-' + [Guid]::NewGuid().ToString('N'))
$dati = Join-Path $prova 'dati'
$reportApp = Join-Path $prova 'app.json'
New-Item -ItemType Directory -Path $dati -Force | Out-Null
New-Item -ItemType Directory -Path (Split-Path -Parent $ReportPath) -Force | Out-Null
Set-Content -LiteralPath (Join-Path $dati 'da-conservare.txt') -Value 'Dati della prova R-04.' -Encoding utf8
$cronometro = [Diagnostics.Stopwatch]::StartNew()
$misure = [ordered]@{
    schema = 'talos.desktop.ci-smoke.v1'; data = [DateTime]::UtcNow.ToString('o'); completato = $false
    installer = $Installer; installerByte = (Get-Item -LiteralPath $Installer).Length
    installerSha256 = (Get-FileHash -LiteralPath $Installer -Algorithm SHA256).Hash.ToLowerInvariant()
    installazione = $InstallDir; overrideDestinazione = $overrideDestinazione; dati = $dati
    sistema = [Environment]::OSVersion.VersionString; powershell = $PSVersionTable.PSVersion.ToString()
}
$errori = [Collections.Generic.List[string]]::new()
$tentata = $false
try {
    $tentata = $true
    $fase = [Diagnostics.Stopwatch]::StartNew()
    # NSIS: /D deve essere ultimo e non racchiuso tra virgolette, anche con spazi.
    $argomenti = '/S' + $(if ($overrideDestinazione) { ' /D=' + $InstallDir } else { '' })
    Esegui-Installer $Installer $argomenti
    $misure.installazioneMs = $fase.ElapsedMilliseconds
    $exe = Join-Path $InstallDir 'TALOS.exe'
    if (-not (Test-Path -LiteralPath $exe -PathType Leaf)) { throw 'EXE installato assente nel percorso atteso; verificare InstallLocation NSIS.' }
    $helper = Join-Path $PSScriptRoot 'ci-smoke-installed.mjs'
    $node = (Get-Command node.exe -CommandType Application).Source
    $argomentiNode = '"' + $helper + '" "' + $exe + '" "' + $dati + '" "' + $reportApp + '"'
    $p = Start-Process -FilePath $node -ArgumentList $argomentiNode -WindowStyle Hidden -PassThru
    if (-not $p.WaitForExit(180000)) { $p.Kill($true); throw 'Smoke Electron oltre il limite di 180 secondi.' }
    if (Test-Path -LiteralPath $reportApp) { $misure.app = Get-Content -LiteralPath $reportApp -Raw | ConvertFrom-Json }
    if ($p.ExitCode -ne 0 -or -not $misure.Contains('app') -or -not $misure.app.completato) { throw 'Smoke Electron fallito: vedere app nel rapporto.' }
    Attendi-Condizione { @(Processi-Installati $InstallDir).Count -eq 0 } 15 'R04-PROCESSI: processi rimasti dopo la chiusura.'
} catch { $errori.Add($_.Exception.Message) }
finally {
    if ($tentata) {
        try {
            $residui = @(Processi-Installati $InstallDir)
            if ($residui.Count -gt 0) {
                $errori.Add('R04-PROCESSI: necessaria pulizia forzata dei processi della sola installazione di prova.')
                $residui | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
            }
            $uninstaller = Join-Path $InstallDir 'Uninstall TALOS.exe'
            if (-not (Test-Path -LiteralPath $uninstaller -PathType Leaf)) { throw 'Disinstallatore assente dopo il tentativo di installazione.' }
            $fase = [Diagnostics.Stopwatch]::StartNew()
            Esegui-Installer $uninstaller '/S'
            # Il disinstallatore NSIS si copia in %TEMP% e prosegue da lì: il processo lanciato esce
            # subito, prima che file, collegamenti e voce di registro siano tolti (NSIS, Chapter 3.2.1,
            # opzione `_?=`, consultato il 13/09/2026). 13/09: con TALOS.exe già sparito dopo 4 s i
            # collegamenti erano ancora lì un istante — controllati subito, falso rosso. Si aspetta la
            # fine di TUTTA la pulizia, con una sola scadenza.
            Attendi-Condizione { -not (Test-Path -LiteralPath (Join-Path $InstallDir 'TALOS.exe')) } 60 'Disinstallazione incompleta: TALOS.exe presente.'
            Attendi-Condizione { @(Processi-Installati $InstallDir).Count -eq 0 } 20 'R04-PROCESSI: processi rimasti dopo la disinstallazione.'
            Attendi-Condizione { @($collegamenti | Where-Object { Test-Path -LiteralPath $_ }).Count -eq 0 } 30 'Collegamenti residui dopo la disinstallazione.'
            Attendi-Condizione { @(Registrazioni-Talos).Count -eq 0 } 30 'Voce di disinstallazione rimasta nel registro.'
            $misure.disinstallazioneMs = $fase.ElapsedMilliseconds
            $misure.processiResidui = @(Processi-Installati $InstallDir | Select-Object ProcessId, Name)
            $misure.collegamentiResidui = @($collegamenti | Where-Object { Test-Path -LiteralPath $_ })
            $misure.registroRimosso = (@(Registrazioni-Talos).Count -eq 0)
            $misure.datiConservati = Test-Path -LiteralPath (Join-Path $dati 'da-conservare.txt')
            if (-not $misure.datiConservati) { throw 'La disinstallazione ha rimosso i dati utente della prova.' }
            $misure.disinstallato = $true
        } catch { $errori.Add($_.Exception.Message) }
    }
    $misure.durataMs = $cronometro.ElapsedMilliseconds
    $misure.errori = @($errori.ToArray())
    $misure.completato = $errori.Count -eq 0
    $misure | ConvertTo-Json -Depth 10 | Set-Content -LiteralPath $ReportPath -Encoding utf8
    if ($env:GITHUB_STEP_SUMMARY) {
        $riepilogo = "`n### Smoke dell'installer`n`nEsito: $($misure.completato). Durata totale: $($misure.durataMs) ms.`n"
        foreach ($voce in @('installazioneMs', 'disinstallazioneMs')) { if ($misure.Contains($voce)) { $riepilogo += "`n- ${voce}: $($misure[$voce]) ms" } }
        if ($misure.Contains('app') -and $misure.app.completato) { $riepilogo += "`n- Avvio e pagina pronta: $($misure.app.avvioMs) ms; chiusura: $($misure.app.chiusuraMs) ms; health con cookie: $($misure.app.healthConCookie)." }
        if ($misure.Contains('app') -and $misure.app.completato -and $misure.app.PSObject.Properties['memoriaRiposo']) {
            $m = $misure.app.memoriaRiposo
            $riepilogo += "`n- RAM a riposo ($($m.riposoMs) ms dopo la pagina pronta): guscio $([math]::Round($m.guscioByte / 1MB)) MiB su $(@($m.processiGuscio).Count) processi, backend $([math]::Round($m.figlioByte / 1MB)) MiB, totale $([math]::Round($m.totaleByte / 1MB)) MiB."
        }
        Add-Content -LiteralPath $env:GITHUB_STEP_SUMMARY -Value $riepilogo -Encoding utf8
    }
}
if ($errori.Count -gt 0) { throw ("Smoke fallito. Rapporto: $ReportPath. " + ($errori -join ' ')) }
Write-Output "Smoke riuscito. Rapporto: $ReportPath; durata $($misure.durataMs) ms."
