# ⭐ PUBBLICA — un comando solo, e l'ultimo passo resta tuo.
#
# Rigenera la cartella pubblicabile, la controlla, e ti dice ESATTAMENTE cosa
# incollare per spingere. Non spinge: `git push` è dell'owner, sempre.
#
#   .\scripts\pubblica.ps1            guarda e basta
#   .\scripts\pubblica.ps1 -Prepara   rigenera la copia e mostra il comando
#
# ⛔ E il comando che ti mostra usa `git -C <percorso>`, non `cd ... ; git push`.
# MISURATO il 2026-08-15: in bash i backslash di un percorso Windows vengono
# mangiati, il `cd` fallisce, e con `;` il push parte comunque — DALLA CARTELLA
# CORRENTE. Quella volta il repo di sviluppo, con dentro 392 documenti interni,
# ha tentato di spingersi su `agent-virtual-machine`. L'ha salvato solo un
# rifiuto `non-fast-forward`. Con `git -C`, se il percorso è sbagliato git si
# ferma invece di spingere da dove capita.
param([switch]$Prepara)

$ErrorActionPreference = 'Stop'
$Repo = Split-Path $PSScriptRoot -Parent
$Copia = Join-Path (Split-Path $Repo -Parent) 'AVM-PUBBLICA'
# ⛔ Il percorso in forma POSIX: è quella che la shell di Claude Code capisce.
$CopiaPosix = '/' + ($Copia -replace '^([A-Za-z]):', { $_.Groups[1].Value.ToLower() } -replace '\\', '/')

function Riga($t) { "  $t" }

if ($Prepara) {
    & (Join-Path $PSScriptRoot 'prepara-la-pubblicazione.ps1') -Esegui
    if ($LASTEXITCODE -ne 0) {
        ""; "⛔ La preparazione si è fermata. Non pubblicare finché non è verde."
        exit 1
    }
}

if (-not (Test-Path $Copia)) {
    "⛔ La cartella pubblicabile non esiste ancora."
    "   Lanciala con:  .\scripts\pubblica.ps1 -Prepara"
    exit 1
}

""
"═" * 72
"  COSA STA PER USCIRE"
"═" * 72

Push-Location $Copia
$remoto = git remote get-url origin 2>$null
$branch = git branch --show-current
$locale = git rev-parse --short HEAD 2>$null
$avanti = (git rev-list --count '@{u}..HEAD' 2>$null)
$dietro = (git rev-list --count 'HEAD..@{u}' 2>$null)
$sporco = (git status --porcelain).Count
Pop-Location

Riga "destinazione : $(if ($remoto) { $remoto } else { '⛔ NESSUN REMOTE' })"
Riga "ramo         : $branch"
Riga "commit       : $locale"
if ($avanti) { Riga "da spingere  : $avanti commit" }
if ($dietro -and [int]$dietro -gt 0) { Riga "⛔ indietro di $dietro commit: fai `git pull` prima" }
if ($sporco -gt 0) { Riga "⛔ $sporco file non committati nella copia" }

if (-not $avanti -or [int]$avanti -eq 0) {
    ""
    Riga "✓ niente da spingere: la copia è già allineata al remoto."
    exit 0
}

""
"═" * 72
"  ADESSO TOCCA A TE — incolla questo"
"═" * 72
""
"    git -C $CopiaPosix push"
""
Riga "Nella chat di Claude Code, mettici un `!` davanti:"
""
"    ! git -C $CopiaPosix push"
""
Riga "⛔ Non usare `cd <percorso> ; git push`: se il cd fallisce, il push parte"
Riga "   dalla cartella corrente e va sul repo sbagliato. Con `git -C` non può."
""
