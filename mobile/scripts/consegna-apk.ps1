# ⭐ CONSEGNA L'APK — spezzato per il canale, INTATTO per chi lo installa.
#
# ⛔ LA LEZIONE CHE HA GENERATO QUESTO SCRIPT (2026-08-14).
#
# Il limite della chat è 30 MB e l'APK ne pesa ~50. La prima volta l'avevo
# risolto RIFACENDO l'APK senza compressione interna: 27,5 MB in viaggio, e
# **104,7 MB in mano all'owner**, da installare. Owner, subito: «ATTENZIONE APK
# È DI 100+ MB DI PESO».
#
# Aveva ragione: avevo ottimizzato il TRASPORTO gonfiando il PRODOTTO.
#
# ⇒ Quando un limite riguarda il **canale**, si cambia il canale — si spezza —
# non la cosa che si consegna. Qui dentro l'APK resta byte per byte quello
# costruito: stessa firma, nessun ripacchettamento.
#
# ⛔ E il NOME non è un dettaglio: la volta dopo avevo consegnato
# `TALOS-parte1.bin`, e l'owner: «mi hai dato gli apk in formato bin». Un file
# spezzato si consegna col nome che dice **come ricomporlo**.
#
# Uso:
#   .\scripts\consegna-apk.ps1                 spezza l'ultimo APK di debug
#   .\scripts\consegna-apk.ps1 -Apk <percorso> spezza quello che dici tu

param(
    [string]$Apk = 'android/app/build/outputs/apk/debug/app-debug.apk',
    [int]$VolumeMB = 29,
    [string]$Fuori = 'C:\Users\Antonino\Desktop\TALOS-APK'
)

$ErrorActionPreference = 'Stop'
function Riga($t) { Write-Host "  $t" }

$RAR = 'C:\Program Files\WinRAR\rar.exe'
if (-not (Test-Path $RAR)) { throw "WinRAR non trovato in $RAR" }
if (-not (Test-Path $Apk)) { throw "APK non trovato: $Apk" }

$info = Get-Item $Apk
$mb = [math]::Round($info.Length / 1MB, 1)
$sha = (Get-FileHash $Apk -Algorithm SHA256).Hash

""
"=" * 68
"  L'APK DA CONSEGNARE"
"=" * 68
Riga "file    : $($info.FullName)"
Riga "peso    : $mb MB"
Riga "sha256  : $sha"
Riga "scritto : $($info.LastWriteTime.ToString('yyyy-MM-dd HH:mm'))"

# La cartella di consegna si rifà da zero: un volume vecchio rimasto in giro
# verrebbe raccolto insieme ai nuovi e l'estrazione fallirebbe a metà.
if (Test-Path $Fuori) { Remove-Item $Fuori -Recurse -Force }
New-Item -ItemType Directory -Path $Fuori -Force | Out-Null

$data = Get-Date -Format 'yyyy-MM-dd'
$base = Join-Path $Fuori "TALOS-$data.rar"

""
"=" * 68
"  SPEZZATO IN VOLUMI DA $VolumeMB MB"
"=" * 68
# ⛔ -m0 = nessuna compressione: l'APK è già uno zip, comprimerlo di nuovo
#    costa minuti e non toglie niente. Qui RAR serve a SPEZZARE, non a stringere.
& $RAR a -m0 "-v${VolumeMB}m" -ep -idq $base $Apk
if ($LASTEXITCODE -ne 0) { throw "rar ha risposto $LASTEXITCODE" }

$volumi = Get-ChildItem $Fuori -Filter '*.rar' | Sort-Object Name
foreach ($v in $volumi) { Riga ("{0,-30} {1,6:N1} MB" -f $v.Name, ($v.Length / 1MB)) }

$troppoGrossi = $volumi | Where-Object { $_.Length / 1MB -gt 30 }
if ($troppoGrossi) { throw "un volume supera i 30 MB: $($troppoGrossi.Name)" }

""
"=" * 68
"  ⛔ LA VERIFICA — si riunisce DAVVERO, e torna IDENTICO"
"=" * 68
# Non «descritta»: eseguita. Estraggo i volumi in una cartella pulita e
# confronto l'impronta col file di partenza. Se non torna, non si consegna.
$prova = Join-Path $env:TEMP "talos-prova-apk-$(Get-Random)"
New-Item -ItemType Directory -Path $prova -Force | Out-Null
& $RAR x -idq $volumi[0].FullName $prova
if ($LASTEXITCODE -ne 0) { throw "l'estrazione ha risposto $LASTEXITCODE" }

$riunito = Get-ChildItem $prova -Filter '*.apk' | Select-Object -First 1
if (-not $riunito) { throw 'nessun apk dentro i volumi' }
$shaRiunito = (Get-FileHash $riunito.FullName -Algorithm SHA256).Hash

Riga "riunito : $($riunito.Name)  ($([math]::Round($riunito.Length / 1MB, 1)) MB)"
Riga "sha256  : $shaRiunito"
if ($shaRiunito -ne $sha) {
    Remove-Item $prova -Recurse -Force
    throw "⛔ LE IMPRONTE NON COINCIDONO — non consegnare niente"
}
Riga '✓ identico all originale, byte per byte'
Remove-Item $prova -Recurse -Force

""
Riga "consegna pronta in: $Fuori"
""
