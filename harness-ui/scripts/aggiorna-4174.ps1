# ⭐ LA PORTA FISSA — 4174, sempre viva e sempre con l'ultimo codice.
#
# Owner 07/09: «dove posso provare in diretta e aggiornato sempre tutti i changes? scegliamo una
# porta e fissiamo quella, hai libertà di riavviare a piacimento ma non di staccare e lasciare
# staccato».
#
#   .\harness-ui\scripts\aggiorna-4174.ps1
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
# ⛔ `TALOS_OWNER_RUNTIME_MODULE` deve esserci o il kernel non è caricato e **ogni giro reale
#    fallisce** mentre `/api/v1/health` continua a rispondere 200. Il server lo scrive nel log
#    all'avvio; qui si passa sempre, e alla fine il log si legge.

$ErrorActionPreference = 'Stop'
$radice = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)   # …/AVM-harness-desktop
$harness = Join-Path $radice 'harness-ui'
$frontend = Join-Path $harness 'frontend'

# ── 1) costruisci e consegna ────────────────────────────────────────────────────────────────────
Write-Output 'costruisco il frontend…'
Push-Location $frontend
try {
  & npm run build
  if ($LASTEXITCODE -ne 0) { throw 'la build è fallita: non consegno niente' }
}
finally { Pop-Location }

Write-Output 'consegno in public/…'
Copy-Item -Path (Join-Path $frontend 'dist\*') -Destination (Join-Path $harness 'public') -Recurse -Force

# ── 2) ferma chi ascolta sulla 4174 ─────────────────────────────────────────────────────────────
foreach ($c in (Get-NetTCPConnection -LocalPort 4174 -State Listen -ErrorAction SilentlyContinue)) {
  $p = Get-Process -Id $c.OwningProcess -ErrorAction SilentlyContinue
  if ($null -eq $p) { continue }
  Write-Output ("fermo {0} pid={1} (avviato {2})" -f $p.ProcessName, $p.Id, $p.StartTime)
  Stop-Process -Id $p.Id -Force -ErrorAction SilentlyContinue
}
for ($i = 0; $i -lt 40; $i++) {
  Start-Sleep -Milliseconds 250
  if (-not (Get-NetTCPConnection -LocalPort 4174 -State Listen -ErrorAction SilentlyContinue)) { break }
}
if (Get-NetTCPConnection -LocalPort 4174 -State Listen -ErrorAction SilentlyContinue) {
  throw 'la 4174 è ancora occupata dopo 10 secondi: non riavvio alla cieca'
}

# ── 3) avvia ────────────────────────────────────────────────────────────────────────────────────
# ⛔⛔⛔ 10/09 — IL 4174 GIRAVA SU UN ALTRO KERNEL, e nessuno se ne accorgeva.
#
# Questa riga puntava a `AVM-harness\mobile\scripts\harness-talos\talosHarness.mjs`: un file di
# un'altra lane, fermo al 06/09 e **diverso** da quello del repo (350.796 byte contro 370.469).
# Era un residuo di quando il kernel non stava ancora qui dentro — vedi `config.mjs`,
# `kernelNelRepo()`: dal 07/09 il kernel canonico è `src/kernel/talosHarness.mjs` ed è il
# DEFAULT; la variabile serve a puntare ALTROVE, non a rifare il default.
#
# ⛔ Il costo, misurato oggi: le due righe di P-13 messe nel kernel del repo non arrivavano al
#   modello, e un giro vero sul 4174 aveva lo STESSO identico primo giro di prima (7.760 token
#   in entrambi i casi). Nessun errore da nessuna parte: semplicemente girava un altro file.
#
# ⇒ Si lascia decidere al default del prodotto. Se qualcuno ha già esportato la variabile per
#   lavorare sul suo kernel, la sua scelta vince: questo script non gliela porta via.
if ($env:TALOS_OWNER_RUNTIME_MODULE) {
  Write-Output ("kernel: uso quello che hai già scelto ({0})" -f $env:TALOS_OWNER_RUNTIME_MODULE)
}
else {
  $kernelDelRepo = Join-Path $harness ('src' + [IO.Path]::DirectorySeparatorChar + 'kernel' + [IO.Path]::DirectorySeparatorChar + 'talosHarness.mjs')
  if (-not (Test-Path $kernelDelRepo)) {
    throw ("il kernel del repo non c'è ({0}): senza, ogni giro reale fallirebbe in silenzio" -f $kernelDelRepo)
  }
  Write-Output ("kernel: quello del repo ({0})" -f $kernelDelRepo)
}
$log = Join-Path $harness '.talos-4174.log'
$logErrori = Join-Path $harness '.talos-4174.err.log'
Start-Process -FilePath 'C:\Program Files\nodejs\node.exe' `
  -ArgumentList 'server.mjs' -WorkingDirectory $harness -WindowStyle Hidden `
  -RedirectStandardOutput $log -RedirectStandardError $logErrori

# ── 4) e si aspetta che RISPONDA ────────────────────────────────────────────────────────────────
for ($i = 0; $i -lt 60; $i++) {
  Start-Sleep -Milliseconds 500
  try {
    $r = Invoke-WebRequest -Uri 'http://127.0.0.1:4174/api/v1/health' -UseBasicParsing -TimeoutSec 2
    if ($r.StatusCode -eq 200) {
      Write-Output ''
      Write-Output '  ✓ http://127.0.0.1:4174  — codice aggiornato, server riavviato'
      # ⛔ il log si LEGGE: un avviso all'avvio è l'unico posto dove il kernel mancante si dichiara
      if (Test-Path $logErrori) {
        $avvisi = Select-String -Path $logErrori -Pattern 'ATTENZIONE|non è impostata' -SimpleMatch:$false -ErrorAction SilentlyContinue
        if ($avvisi) { Write-Output ''; Write-Output '  ⛔ avvisi nel log:'; $avvisi | ForEach-Object { Write-Output ('     ' + $_.Line) } }
      }
      exit 0
    }
  } catch { }
}
throw 'il 4174 non ha risposto entro 30 secondi'
