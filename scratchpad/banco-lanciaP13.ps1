# ⭐ Lancia UNA delle due corse di P-13, STACCATA dalla sessione.
#   .\lanciaP13.ps1 prima
#   .\lanciaP13.ps1 dopo
# ⛔ Una corsa da ore non sopravvive a un processo figlio della sessione: è già costato 650 clip su
#    12.000. Start-Process la stacca davvero.
param([Parameter(Mandatory=$true)][ValidateSet('prima','dopo')][string]$fase)

$banco = $PSScriptRoot
$esiti = Join-Path $banco "esiti-p13-$fase-20260910"
New-Item -ItemType Directory -Force -Path $esiti | Out-Null

$env:TALOS_HARNESS   = 'C:/Users/Antonino/Desktop/projects/AVM-harness-desktop/harness-ui/src/kernel/talosHarness.mjs'
$env:BANCO_PROVIDER  = 'openrouter'
$env:BANCO_MODELLO   = 'z-ai/glm-5.3-flash'
$env:BANCO_CORPUS    = 'storia'
$env:BANCO_ESITI     = $esiti
# ⛔ 10/09: senza questa riga il banco legge OPENROUTER_API_KEY dall'ambiente, che è REVOCATA
#   (401 «User not found»); la chiave buona sta nella custodia di sistema. harness.mjs ora la
#   legge da lì — qui non si passa nessun segreto, che finirebbe nei log di chi sta in mezzo.
if ($fase -eq 'dopo') { $env:BANCO_ELENCO_PROFONDO = '1' } else { Remove-Item Env:BANCO_ELENCO_PROFONDO -ErrorAction SilentlyContinue }

$log = Join-Path $esiti 'corsa.log'
$err = Join-Path $esiti 'corsa.err.log'
Write-Output ("fase {0} · esiti in {1}" -f $fase, $esiti)
Write-Output ("kernel  : {0}" -f $env:TALOS_HARNESS)
Write-Output ("modello : {0} · corpus {1} · elenco {2}" -f $env:BANCO_MODELLO, $env:BANCO_CORPUS, $(if ($fase -eq 'dopo') { 'ACCESO' } else { 'spento' }))

Start-Process -FilePath 'C:\Program Files\nodejs\node.exe' `
  -ArgumentList 'corsaCoding.mjs','talos','5','3' -WorkingDirectory $banco -WindowStyle Hidden `
  -RedirectStandardOutput $log -RedirectStandardError $err
Write-Output 'partita, staccata dalla sessione.'
