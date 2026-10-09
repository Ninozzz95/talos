# ⭐ LA PORTA FISSA — 4174, sempre viva e sempre con l'ultimo codice.
#
# Owner 07/09: «dove posso provare in diretta e aggiornato sempre tutti i changes? scegliamo una
# porta e fissiamo quella, hai libertà di riavviare a piacimento ma non di staccare e lasciare
# staccato».
#
#   .\harness-ui\scripts\aggiorna-4174.ps1
#   .\harness-ui\scripts\aggiorna-4174.ps1 -WhatIf     # a secco: dice cosa farebbe, non tocca niente
#
# Fa le tre cose in fila e non se ne dimentica nessuna: costruisce il frontend, lo consegna in
# `public/`, riavvia il server. Poi dichiara che risponde — «avviato» si dice quando risponde, non
# quando si è lanciato il comando.
#
# ⛔ Perché esiste, e perché fa TUTTE e tre le cose: il frontend si vede con un refresh (il server
#    legge `public/` dal disco a ogni richiesta), ma il SERVER no — una modifica in `harness-ui/src`
#    resta invisibile finché il processo non riparte. Farle a mano significa, prima o poi,
#    guardare uno schermo che mostra il codice di mezz'ora fa e non capire perché.
#
# ⛔⛔⛔ 06/9, la trappola già pagata: la versione precedente AVVIAVA senza FERMARE. Il processo
#    vecchio restava sulla porta, il nuovo moriva subito perché la 4174 era occupata, e per ore ho
#    creduto di riavviare senza riavviare mai. L'ho scoperto confrontando l'ora di avvio del
#    processo (14:18) con l'ora delle mie modifiche. Da lì: prima si ferma chi ascolta, si aspetta
#    che la porta si liberi DAVVERO, poi si avvia.
#
# ⛔⛔⛔ F3, onda 2 di F2 (24/09/2026), decisione 8 dell'owner — LO STOP È GENTILE. `Stop-Process -Force` è
#    `TerminateProcess`: Node non riceve niente e la coda di scrittura del negozio delle sessioni muore a
#    metà («'SIGTERM' is not supported on Windows», doc `process` di Node letta il 24/09/2026; Hermes
#    `gateway/run.py:5011` «On Windows SIGTERM is TerminateProcess»). Da oggi: PRIMA la rotta
#    `POST /api/v1/admin/shutdown` col gettone che il server scrive in `.spegnimento-gettone` nella cartella
#    dei journal (`config.cartellaStore`, `server.mjs`), che chiude il registro (fence + flush) e poi il server; si aspetta fino a 10 s che
#    il processo esca; `-Force` SOLO dopo — la stessa finestra di Hermes (`run.py:5180`, «Up to 10s for
#    SIGTERM, then SIGKILL»). Senza gettone (server vecchio, file assente) si dice e si passa al `-Force`.
# ⛔ `-WhatIf` (SupportsShouldProcess, Microsoft Learn «Everything you wanted to know about ShouldProcess»,
#    letta il 24/09/2026): ogni passo che cambia qualcosa — build e consegna, POST di spegnimento, `-Force`,
#    avvio — passa da `ShouldProcess`; a secco si stampa e basta, e il 4174 vivo non viene toccato.
#
# ⛔ `TALOS_OWNER_RUNTIME_MODULE` deve esserci o il kernel non è caricato e **ogni giro reale
#    fallisce** mentre `/api/v1/health` continua a rispondere 200. Il server lo scrive nel log
#    all'avvio; qui si passa sempre, e alla fine il log si legge.

[CmdletBinding(SupportsShouldProcess)]
param(
  [int]$Porta = 4174,
  [int]$AttesaUscitaSecondi = 10
)

$ErrorActionPreference = 'Stop'
$radice = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)   # …/AVM-harness-desktop
$harness = Join-Path $radice 'harness-ui'
$frontend = Join-Path $harness 'frontend'
# La cartella dei journal: `TALOS_HARNESS_UI_SESSIONS_DIR` se c'è. Il gettone sta lì (gitignorata, dell'utente).
# ⛔ 07/10/2026, decisione dell'owner — il 4174 scrive in `%APPDATA%\TALOS\sessions`, lo stesso archivio dell'app installata, come il
#   processo del 06/10 avviato a mano con quella variabile. Senza questa riga il lanciatore ripartiva su `.sessions-store` accanto a
#   server.mjs (75 vecchie sessioni di sviluppo, fino al 04/10): dopo un riavvio l'owner si è trovato un elenco diverso da quello che
#   usava. Una scelta esplicita nella shell continua a vincere.
if (-not $env:TALOS_HARNESS_UI_SESSIONS_DIR -and $env:APPDATA) {
  $env:TALOS_HARNESS_UI_SESSIONS_DIR = Join-Path (Join-Path $env:APPDATA 'TALOS') 'sessions'
}
$cartellaStore = if ($env:TALOS_HARNESS_UI_SESSIONS_DIR) { $env:TALOS_HARNESS_UI_SESSIONS_DIR } else { Join-Path $harness '.sessions-store' }
Write-Output ("archivio delle sessioni: {0}" -f $cartellaStore)
# ⛔⛔ 09/10/2026 — un gettone PER PORTA (`server.mjs`): la cartella è condivisa con l'app installata dal 07/10, e col nome unico
#   l'ultimo server partito vinceva ⇒ 401 ⇒ -Force (visto il 09/10 alle 00:22). Il nome vecchio resta SOLO come ripiego di
#   transizione, per un server partito prima di questa cura; lo si dice, perché se intanto è partita l'app può essere suo.
$fileGettone = Join-Path $cartellaStore ('.spegnimento-gettone-{0}' -f $Porta)
if (-not (Test-Path $fileGettone)) {
  $vecchio = Join-Path $cartellaStore '.spegnimento-gettone'
  if (Test-Path $vecchio) {
    Write-Output ("nessun gettone per la porta {0}: uso il nome vecchio {1} (server partito prima della cura del 09/10; se nel frattempo e' partita l'app installata puo' essere il suo, e lo stop gentile rispondera' 401)" -f $Porta, $vecchio)
    $fileGettone = $vecchio
  }
}

# ── 1) costruisci e consegna ────────────────────────────────────────────────────────────────────
if ($PSCmdlet.ShouldProcess($frontend, 'npm run build e consegna in public/')) {
  Write-Output 'costruisco il frontend…'
  Push-Location $frontend
  try {
    & npm run build
    if ($LASTEXITCODE -ne 0) { throw 'la build è fallita: non consegno niente' }
  }
  finally { Pop-Location }

  Write-Output 'consegno in public/…'
  Copy-Item -Path (Join-Path $frontend 'dist\*') -Destination (Join-Path $harness 'public') -Recurse -Force
}

# ── 2) ferma chi ascolta sulla porta: prima gentile, poi -Force ─────────────────────────────────
$inAscolto = @()
foreach ($c in (Get-NetTCPConnection -LocalPort $Porta -State Listen -ErrorAction SilentlyContinue)) {
  $p = Get-Process -Id $c.OwningProcess -ErrorAction SilentlyContinue
  if ($null -ne $p -and -not ($inAscolto | Where-Object { $_.Id -eq $p.Id })) { $inAscolto += $p }
}
foreach ($p in $inAscolto) {
  Write-Output ("in ascolto: {0} pid={1} (avviato {2})" -f $p.ProcessName, $p.Id, $p.StartTime)
  $gentile = $false
  if (Test-Path $fileGettone) {
    $gettone = (Get-Content -Path $fileGettone -Raw -ErrorAction SilentlyContinue).Trim()
    if ($gettone -and $PSCmdlet.ShouldProcess(("pid={0}" -f $p.Id), ("POST http://127.0.0.1:{0}/api/v1/admin/shutdown col gettone (stop gentile)" -f $Porta))) {
      try {
        $r = Invoke-WebRequest -Uri ("http://127.0.0.1:{0}/api/v1/admin/shutdown" -f $Porta) -Method Post -Headers @{ 'x-talos-shutdown-token' = $gettone } -UseBasicParsing -TimeoutSec 5
        if ($r.StatusCode -eq 202) { $gentile = $true; Write-Output '  stop gentile accettato: aspetto che il processo esca…' }
        else { Write-Output ("  la rotta di spegnimento ha risposto {0}: passo al -Force" -f $r.StatusCode) }
      } catch {
        Write-Output ("  la rotta di spegnimento non ha risposto ({0}): passo al -Force" -f $_.Exception.Message)
      }
    }
  } else {
    Write-Output ("  nessun gettone in {0} (server vecchio o cartella dati diversa): passo al -Force" -f $fileGettone)
  }
  if ($gentile) {
    # ⛔ Fino a $AttesaUscitaSecondi: il registro svuota la coda (tetto interno 10 s) e poi il server chiude da solo.
    if (-not $p.WaitForExit($AttesaUscitaSecondi * 1000)) {
      Write-Output ("  ⛔ non è uscito entro {0} s: -Force" -f $AttesaUscitaSecondi)
    } else {
      Write-Output ("  uscito in modo pulito (pid={0})" -f $p.Id)
    }
  }
  if (-not $p.HasExited -and $PSCmdlet.ShouldProcess(("pid={0}" -f $p.Id), 'Stop-Process -Force')) {
    Stop-Process -Id $p.Id -Force -ErrorAction SilentlyContinue
  }
}
if ($WhatIfPreference) { Write-Output 'a secco (-WhatIf): niente fermato, niente costruito, niente avviato.'; exit 0 }
for ($i = 0; $i -lt 40; $i++) {
  Start-Sleep -Milliseconds 250
  if (-not (Get-NetTCPConnection -LocalPort $Porta -State Listen -ErrorAction SilentlyContinue)) { break }
}
if (Get-NetTCPConnection -LocalPort $Porta -State Listen -ErrorAction SilentlyContinue) {
  throw ("la {0} è ancora occupata dopo 10 secondi: non riavvio alla cieca" -f $Porta)
}

# ── 3) avvia ────────────────────────────────────────────────────────────────────────────────────
# ⛔⛔⛔ 10/09 — IL 4174 GIRAVA SU UN ALTRO KERNEL, e nessuno se ne accorgeva.
#
# Il kernel canonico resta `src/kernel/talosHarness.mjs`. Dal 15/09 il desktop passa però per un
# adapter sottile (`talosHarness.desktop-hotfix.mjs`) che corregge esclusivamente i finding del
# banco black-box senza spostare il metro di TALOS-BANCO e senza toccare il mobile. Una scelta
# esplicita dell'owner continua a vincere.
# ⛔⛔⛔ 05/10/2026, owner (incidente «il 4174 girava su un altro kernel», seconda volta): una
# TALOS_OWNER_RUNTIME_MODULE avanzata di sessione Windows puntava alla copia INSTALLATA
# (Programs\TALOS\resources) e la porta fissa ha girato per giorni con un kernel senza le ultime
# cure, mentre bundle e server erano freschi. Una scelta esplicita dell'owner vale SOLO se resta
# dentro questo repo: fuori, si ignora con avviso e si usa l'adapter del repo (contratto della
# porta: «sempre con l'ultimo codice»).
$kernelRichiesto = $env:TALOS_OWNER_RUNTIME_MODULE
$prefissoRepo = $radice.TrimEnd('\') + '\'
$kernelFuoriRepo = [bool]($kernelRichiesto -and -not ([IO.Path]::GetFullPath($kernelRichiesto)).StartsWith($prefissoRepo, [StringComparison]::OrdinalIgnoreCase))
if ($kernelRichiesto -and -not $kernelFuoriRepo) {
  Write-Output ("kernel: uso quello che hai già scelto ({0})" -f $kernelRichiesto)
}
else {
  if ($kernelFuoriRepo) {
    Write-Output ("kernel: ATTENZIONE — TALOS_OWNER_RUNTIME_MODULE punta fuori dal repo ({0}); la ignoro e uso l'adapter del repo" -f $kernelRichiesto)
  }
  $kernelDelRepo = Join-Path $harness ('src' + [IO.Path]::DirectorySeparatorChar + 'kernel' + [IO.Path]::DirectorySeparatorChar + 'talosHarness.mjs')
  $kernelDesktop = Join-Path $harness ('src' + [IO.Path]::DirectorySeparatorChar + 'kernel' + [IO.Path]::DirectorySeparatorChar + 'talosHarness.desktop-hotfix.mjs')
  if (-not (Test-Path $kernelDelRepo)) {
    throw ("il kernel del repo non c'è ({0}): senza, ogni giro reale fallirebbe in silenzio" -f $kernelDelRepo)
  }
  if (-not (Test-Path $kernelDesktop)) {
    throw ("l'adapter desktop black-box non c'è ({0}): non avvio una 4174 che sembri aggiornata ma non lo sia" -f $kernelDesktop)
  }
  $env:TALOS_OWNER_RUNTIME_MODULE = $kernelDesktop
  Write-Output ("kernel desktop: adapter black-box ({0}); base canonica ({1})" -f $kernelDesktop, $kernelDelRepo)
}

# ⭐ 25/09/2026, decisione owner «Ripristina quello in uso» — IL REGISTRO DEI WORKFLOW DEL 4174.
#
# Senza una cartella dati (`config.mjs` `parseWorkflowDataRoot`) il server parte col registro SPENTO: il modello non vede
# l'attrezzo per proporre un workflow, e il Workflow non si può verificare a vista sul 4174. Dal 23/09 la cartella era
# `%LOCALAPPDATA%\TALOS-integrazione-r4\workflows` (`.claude/RIPRESA-SESSIONE.md`), ma viveva SOLO nell'ambiente degli script
# di consegna: il 24/09 pomeriggio uno script nuovo non la passava più e il registro si è spento senza un errore.
# ⇒ Adesso sta QUI, nel lanciatore versionato. Una scelta esplicita dell'owner vince, come per il kernel; il figlio la
#    eredita come eredita `TALOS_OWNER_RUNTIME_MODULE` qui sopra.
# ⛔ Fuori dal worktree: il progetto predefinito del 4174 è l'intero `AVM-integrazione-r4` (`config.mjs:597-600`) e il
#    registro rifiuta di stare dentro un progetto (`store.mjs` `validateLocation`). Separata da `%APPDATA%\TALOS`, dove
#    tiene i suoi l'app installata (`desktop/runtime.mjs`) — come `HERMES_HOME`, `CODEX_HOME`, `.vscode-oss` e la nostra
#    Preview (ricerca: `.claude/RICERCA-REGISTRO-WORKFLOW-4174-2026-09-25.md`).
if ($env:TALOS_HARNESS_UI_WORKFLOW_DIR) {
  Write-Output ("registro Workflow: uso quello che hai già scelto ({0})" -f $env:TALOS_HARNESS_UI_WORKFLOW_DIR)
}
elseif ($env:TALOS_DESKTOP_DATA_DIR) {
  Write-Output ("registro Workflow: nella cartella dati che hai già scelto ({0})" -f $env:TALOS_DESKTOP_DATA_DIR)
}
elseif (-not $env:LOCALAPPDATA) {
  Write-Output '  ⛔ registro Workflow SPENTO: LOCALAPPDATA non è impostata, e non scelgo una cartella a caso'
}
else {
  $env:TALOS_HARNESS_UI_WORKFLOW_DIR = Join-Path (Join-Path $env:LOCALAPPDATA 'TALOS-integrazione-r4') 'workflows'
  Write-Output ("registro Workflow: {0}" -f $env:TALOS_HARNESS_UI_WORKFLOW_DIR)
}
# ⛔⛔⛔ F-ENV-12 (04/10/2026) — LA PORTA SI IMPONE ANCHE AL FIGLIO.
# L'app TALOS installata vive con `TALOS_HARNESS_UI_PORT` impostato nel proprio ambiente (es. 62337): se la
# consegna parte da quell'ambiente, il figlio eredita la variabile, legge la porta dell'app INVECE di `-Porta`,
# prova a bindarsi lì e muore («PortaInUsoError: La porta 62337 è già in uso») lasciando il 4174 giù, incidente
# del 04/10/2026. Da qui la variabile viene SEMPRE riscritta col valore del parametro, subito prima dell'avvio:
# l'ambiente dell'app non può più vincere.
$env:TALOS_HARNESS_UI_PORT = [string]$Porta

$log = Join-Path $harness '.talos-4174.log'
$logErrori = Join-Path $harness '.talos-4174.err.log'
if ($PSCmdlet.ShouldProcess('server.mjs', ("avvio sulla {0}" -f $Porta))) {
  Start-Process -FilePath 'C:\Program Files\nodejs\node.exe' `
    -ArgumentList 'server.mjs' -WorkingDirectory $harness -WindowStyle Hidden `
    -RedirectStandardOutput $log -RedirectStandardError $logErrori
}

# ── 4) e si aspetta che RISPONDA ────────────────────────────────────────────────────────────────
for ($i = 0; $i -lt 60; $i++) {
  Start-Sleep -Milliseconds 500
  try {
    $r = Invoke-WebRequest -Uri ("http://127.0.0.1:{0}/api/v1/health" -f $Porta) -UseBasicParsing -TimeoutSec 2
    if ($r.StatusCode -eq 200) {
      Write-Output ''
      Write-Output ("  ✓ http://127.0.0.1:{0}  — codice aggiornato, server riavviato" -f $Porta)
      # ⛔ il log si LEGGE: un avviso all'avvio è l'unico posto dove il kernel mancante si dichiara
      if (Test-Path $logErrori) {
        $avvisi = Select-String -Path $logErrori -Pattern 'ATTENZIONE|non è impostata' -SimpleMatch:$false -ErrorAction SilentlyContinue
        if ($avvisi) { Write-Output ''; Write-Output '  ⛔ avvisi nel log:'; $avvisi | ForEach-Object { Write-Output ('     ' + $_.Line) } }
      }
      exit 0
    }
  } catch { }
}
throw ("il {0} non ha risposto entro 30 secondi" -f $Porta)
