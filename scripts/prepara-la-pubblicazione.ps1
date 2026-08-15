# ═══════════════════════════════════════════════════════════════════════════
#  PREPARARE LA PUBBLICAZIONE — senza toccare NIENTE di quello che abbiamo
# ═══════════════════════════════════════════════════════════════════════════
#
# Owner 2026-08-15: «a me interessa solo che i documenti rimangano sul disco,
# QUESTO disco… considerando che questa sarà una repo open source, e predisponiti
# per ciò».
#
# ## ⛔ PERCHÉ QUESTO SCRIPT E NON `ripulisci-la-storia.ps1`
#
# La prima idea era riscrivere la cronologia con `git filter-repo` e spingere a
# forza. La ricerca del 2026-08-15 (Truffle Security, «Securely Open-Sourcing on
# GitHub») dice che è la strada sbagliata, e per tre ragioni misurate:
#
#   1. **Lo squash non cancella niente.** «Git removed references to your
#      squashed commit data, but did not delete anything. These are dangling
#      commits… if you know the commit's SHA-1 hash, you can still access it.»
#
#   2. **Nemmeno il force push.** Gli oggetti restano sui server di GitHub e
#      sono raggiungibili da chi conosce l'hash.
#
#   3. **I fork privati (CFOR).** «Any data committed to the private fork before
#      the original upstream repository was made public, is also public.»
#
# ⇒ La loro raccomandazione primaria, alla lettera: cancellare `.git`,
# `git init` da zero, spingere su una repo NUOVA. Nessun oggetto della storia
# vecchia esiste mai lì — non c'è niente da recuperare perché non c'è mai stato.
#
# ## Cosa fa questo script
#
# Costruisce ACCANTO una cartella pubblicabile. La repo di lavoro non viene
# toccata: né la sua cronologia, né i suoi documenti, né il suo `.git`.
#
#   AVM/            ← resta ESATTAMENTE com'è. 1.400 commit, 97 ricerche, tutto.
#   AVM-PUBBLICA/   ← nuova: i soli file, un commit, nessun passato.
#
# ⛔ Rollback: non serve. Se qualcosa non va, si cancella `AVM-PUBBLICA` e si
# rifà. È tutto il vantaggio di non toccare l'originale.
#
# ## Come si usa
#
#   .\scripts\prepara-la-pubblicazione.ps1            ← guarda e basta
#   .\scripts\prepara-la-pubblicazione.ps1 -Esegui    ← costruisce la cartella
#
param(
    [switch]$Esegui,
    [string]$Repo = "C:\Users\Antonino\Desktop\projects\AVM",
    [string]$Destinazione = "C:\Users\Antonino\Desktop\projects\AVM-PUBBLICA"
)

$ErrorActionPreference = 'Stop'

# ⛔ Gli stessi percorsi del `.gitignore`. Se i due elenchi divergono, un
# documento interno finisce nella cartella pubblica senza che nessuno lo veda.
$INTERNI = @(
    'mobile/docs/superpowers',
    'docs/superpowers',
    '.claude',
    '.agents',
    '.codex',
    'AGENTS.md',
    'docs/demo',
    'mobile/docs/release-recovery.md',
    'DA-PROVARE-TU.md'
)

function Titolo($t) { ""; "═" * 72; "  $t"; "═" * 72 }
function Passo($t) { "  → $t" }
function Bene($t) { "  ✓ $t" }
function Male($t) { "  ⛔ $t" }
function Nota($t) { "     $t" }

Titolo $(if ($Esegui) { "COSTRUISCO LA CARTELLA PUBBLICABILE" } else { "GUARDO E BASTA — non tocco niente" })

Set-Location $Repo

# ───────────────────────────────────────────────────────────────────────────
#  1. CHE COSA USCIREBBE, e cosa resta dov'è
# ───────────────────────────────────────────────────────────────────────────
Passo "conto quello che NON deve uscire di qui"
$interniSuDisco = 0
foreach ($p in $INTERNI) {
    $pieno = Join-Path $Repo $p
    if (-not (Test-Path $pieno)) { continue }
    if ((Get-Item $pieno) -is [System.IO.DirectoryInfo]) {
        $n = (Get-ChildItem $pieno -Recurse -File -ErrorAction SilentlyContinue).Count
    } else { $n = 1 }
    $interniSuDisco += $n
    "      {0,-40} {1,4} file" -f $p, $n
}
Bene "$interniSuDisco file interni — restano tutti in $Repo"

Passo "conto quello che verrebbe pubblicato"
$tracciati = (git ls-files | Measure-Object -Line).Lines
Bene "$tracciati file tracciati"

# ───────────────────────────────────────────────────────────────────────────
#  2. ⛔ I CONTROLLI DI SICUREZZA — prima di tutto il resto
# ───────────────────────────────────────────────────────────────────────────
Titolo "CONTROLLI DI SICUREZZA"

Passo "cerco file di credenziali fra i tracciati"
$sospetti = git ls-files | Where-Object { $_ -match '\.env$|secret|credential|\.key$|\.pem$|keystore|\.jks$' }
if ($sospetti) {
    foreach ($s in $sospetti) { Nota $s }
    Nota "⚠ vanno guardati a uno a uno: `.env.example` va bene, `.env` no"
} else { Bene "nessun file di credenziali" }

Passo "cerco chiavi API in chiaro"
$conChiavi = git grep -lE "sk-[a-zA-Z0-9]{20,}|AIza[0-9A-Za-z_-]{30,}|ghp_[a-zA-Z0-9]{30,}" 2>$null
if ($conChiavi) {
    foreach ($c in $conChiavi) { Nota $c }
    Nota "⚠ verifica che siano FINTE (fixture di test) e non vere"
} else { Bene "nessuna chiave in chiaro" }

Passo "cerco il dispositivo dell'owner e i suoi dati"
$conDati = git grep -lE "3B1F6DE8WTX78PET|2ea6573c|ninozz142|C:\\\\Users\\\\Antonino" -- '*.ts' '*.kt' '*.java' '*.md' '*.json' '*.mjs' 2>$null
if ($conDati) {
    Male "$($conDati.Count) file nominano il dispositivo o il percorso dell'owner:"
    $conDati | Select-Object -First 10 | ForEach-Object { Nota $_ }
    Nota "⚠ vanno ripuliti PRIMA di pubblicare: sono dati di una persona"
} else { Bene "nessun riferimento al dispositivo o alla persona" }

# ───────────────────────────────────────────────────────────────────────────
#  3. LE COSE CHE UNA REPO OPEN SOURCE DEVE AVERE
# ───────────────────────────────────────────────────────────────────────────
Titolo "COSA MANCA PER ESSERE UNA REPO OPEN SOURCE"

$obbligatori = @{
    'LICENSE'            = 'senza, nessuno può usare il codice legalmente: senza licenza vale il copyright pieno'
    'CONTRIBUTING.md'    = 'come si propone una modifica'
    'CODE_OF_CONDUCT.md' = 'GitHub lo mostra e i contributori lo cercano'
    'SECURITY.md'        = 'dove si segnala una falla senza scriverla in pubblico'
}
foreach ($f in $obbligatori.Keys | Sort-Object) {
    if (Test-Path (Join-Path $Repo $f)) { Bene "$f c'è" }
    else { Male "$f MANCA — $($obbligatori[$f])" }
}

Passo "la licenza è dichiarata nei package.json?"
$senzaLicenza = @()
foreach ($pj in @('package.json', 'mobile/package.json')) {
    $pieno = Join-Path $Repo $pj
    if (-not (Test-Path $pieno)) { continue }
    $j = Get-Content $pieno -Raw | ConvertFrom-Json
    if (-not $j.license) { $senzaLicenza += $pj }
}
if ($senzaLicenza) { foreach ($s in $senzaLicenza) { Male "$s non dichiara `"license`"" } }
else { Bene "tutti i package.json dichiarano la licenza" }

if (-not $Esegui) {
    Titolo "NON HO TOCCATO NIENTE"
    "  Per costruire la cartella pubblicabile:"
    "     .\scripts\prepara-la-pubblicazione.ps1 -Esegui"
    ""
    "  ⛔ Quella cartella sarà una COPIA. $Repo non viene toccata:"
    "     né la cronologia, né i documenti, né il .git."
    exit 0
}

# ───────────────────────────────────────────────────────────────────────────
#  4. LA COSTRUZIONE
# ───────────────────────────────────────────────────────────────────────────
Titolo "COSTRUZIONE"

if (Test-Path $Destinazione) {
    Male "$Destinazione esiste già"
    Nota "cancellala o scegli un'altra destinazione con -Destinazione"
    exit 1
}

# ⛔ Si copiano SOLO i file tracciati, non la cartella. `git archive` prende
# esattamente ciò che git conosce — quindi rispetta il `.gitignore` per
# costruzione, e non porta con sé `node_modules`, i build, né i documenti che
# abbiamo appena tolto dall'indice.
Passo "estraggo i soli file tracciati con git archive"
$tar = Join-Path $env:TEMP "talos-pubblica.tar"
git archive --format=tar -o $tar HEAD
if (-not (Test-Path $tar)) { Male "git archive non ha prodotto niente"; exit 1 }
Bene "archivio: $([math]::Round((Get-Item $tar).Length / 1MB, 1)) MB"

New-Item -ItemType Directory -Force $Destinazione | Out-Null
Passo "scompatto in $Destinazione"
tar -xf $tar -C $Destinazione
Remove-Item $tar -Force
$estratti = (Get-ChildItem $Destinazione -Recurse -File).Count
Bene "$estratti file"

# ⛔ La rete di sicurezza: `git archive` non dovrebbe portarsi dietro i
# documenti interni, perché non sono più tracciati. Ma «non dovrebbe» non è
# «non lo fa», e questa è l'ultima occasione per accorgersene.
Passo "controllo che NESSUN documento interno sia finito nella copia"
$intrusi = 0
foreach ($p in $INTERNI) {
    $pieno = Join-Path $Destinazione $p
    if (Test-Path $pieno) {
        Male "INTRUSO: $p è finito nella cartella pubblica"
        Remove-Item $pieno -Recurse -Force
        Nota "rimosso"
        $intrusi++
    }
}
if ($intrusi -eq 0) { Bene "nessun documento interno nella copia" }

Passo "inizializzo una cronologia NUOVA, senza passato"
Set-Location $Destinazione
git init -q -b main
git add -A
git -c user.name="antoninorizzo" -c user.email="ninozz142@gmail.com" commit -q -m "TALOS

Un assistente Android che agisce sul telefono: legge lo schermo, apre le app,
manda messaggi, e dice sempre cosa è successo davvero.

Questa è la prima pubblicazione: la cronologia di sviluppo è rimasta nel
repository privato, insieme ai documenti di lavoro."
$commit = git rev-parse --short HEAD
Bene "un commit solo: $commit"

# ───────────────────────────────────────────────────────────────────────────
#  5. LA VERIFICA — l'originale è intatto?
# ───────────────────────────────────────────────────────────────────────────
Titolo "VERIFICA — l'originale è intatto?"

Set-Location $Repo
$dopoInterni = 0
foreach ($p in $INTERNI) {
    $pieno = Join-Path $Repo $p
    if (-not (Test-Path $pieno)) { continue }
    if ((Get-Item $pieno) -is [System.IO.DirectoryInfo]) {
        $dopoInterni += (Get-ChildItem $pieno -Recurse -File -ErrorAction SilentlyContinue).Count
    } else { $dopoInterni++ }
}
if ($dopoInterni -eq $interniSuDisco) { Bene "i $dopoInterni documenti interni sono ancora qui, intatti" }
else { Male "prima $interniSuDisco, adesso $dopoInterni — QUALCOSA È CAMBIATO" }

$commitOra = (git rev-list --all --count)
Bene "la cronologia originale ha ancora $commitOra commit"

Titolo "FATTO — e adesso tocca a te"
"  La cartella pubblicabile è in:"
"     $Destinazione"
""
"  ⛔ PRIMA di pubblicarla:"
"     1. leggi i controlli di sicurezza qui sopra e sistema quello che segnalano"
"     2. aggiungi LICENSE, CONTRIBUTING.md, CODE_OF_CONDUCT.md, SECURITY.md"
"     3. rileggi il README con gli occhi di chi arriva e non sa niente"
"     4. prova che si compili da zero:"
"          cd $Destinazione\mobile ; npm ci ; npm run typecheck ; npx vitest run"
""
"  Poi, e solo poi:"
"     cd $Destinazione"
"     git remote add origin <la repo NUOVA, mai usata prima>"
"     git push -u origin main"
""
"  ⛔ La repo di destinazione dev'essere NUOVA e mai stata un fork privato di"
"     questa: se lo fosse, tutto ciò che c'era nel fork prima della"
"     pubblicazione diventerebbe pubblico insieme (CFOR)."
""
"  Se qualcosa non va: cancella $Destinazione e rifai. L'originale non si tocca."
