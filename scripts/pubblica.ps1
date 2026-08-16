# ⭐ PUBBLICA — un comando solo, e il via resta tuo.
#
# Rigenera la cartella pubblicabile, la controlla, e mostra ESATTAMENTE il
# comando per spingere. Non spinge da sé: il push si CHIEDE, ogni volta.
#
# ⛔ Regola cambiata il 2026-08-16 — prima era «MAI PUSH», adesso l'owner ha
# detto: «sei autorizzato a fare push, ma sempre solo dopo la mia
# autorizzazione». Il gesto che conta è la conferma del PreToolUse hook
# (.claude/hooks/mai-push.mjs), non una frase in un messaggio.
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
"  PRONTO — ma il via lo dai tu"
"═" * 72
""
"    git -C $CopiaPosix push"
""
Riga "Dal 2026-08-16 questo comando può lanciarlo anche Claude, ma SOLO dopo che"
Riga "gliel'hai autorizzato per questo push: te lo chiede dicendo cosa esce, e"
Riga "l'hook lo ferma finché non confermi tu."
""
Riga "Se preferisci lanciarlo tu, nella chat mettici un `!` davanti:"
""
"    ! git -C $CopiaPosix push"
""
Riga "⛔ In nessuno dei due casi si usa `cd <percorso> ; git push`: se il cd"
Riga "   fallisce, il push parte dalla cartella corrente e va sul repo sbagliato."
Riga "   Con `git -C` non può — e l'hook nega la forma sciolta."
""
