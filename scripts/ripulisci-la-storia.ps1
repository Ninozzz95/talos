# ═══════════════════════════════════════════════════════════════════════════
#  RIPULIRE LA STORIA — e non perdere niente sul disco
# ═══════════════════════════════════════════════════════════════════════════
#
# Owner 2026-08-15: «a me interessa solo che i documenti rimangano sul disco,
# QUESTO disco. Voglio che mi fai uno script che prevede tutto, anche rollback o
# altro».
#
# Toglie dalla CRONOLOGIA di git tutti i documenti interni — ricerche, specifiche,
# taccuini, competenze degli agenti — lasciandoli intatti sul disco, e potendo
# tornare indietro in ogni momento.
#
# ## ⛔ IL RISCHIO VERO, che va capito prima di lanciarlo
#
# `git filter-repo` riscrive OGNI commit e poi fa un checkout. Un file che era
# tracciato e sparisce dalla storia **sparisce anche dal disco**. I nostri
# documenti oggi sono fuori dall'indice (commit `5c6e12a4`), quindi in teoria
# sono al sicuro — ma «in teoria» non basta per un gesto irreversibile.
#
# ⇒ Questo script li copia PRIMA, li riconta DOPO, e se ne manca uno solo si
# ferma e li rimette.
#
# ## Cosa NON fa
#
# ⛔ Non fa `git push`. La pubblicazione è dell'owner, sempre. Alla fine dice
# esattamente quale comando lanciare, e cosa comporta.
#
# ## Come si usa
#
#   .\scripts\ripulisci-la-storia.ps1              ← PROVA A VUOTO: non tocca nulla
#   .\scripts\ripulisci-la-storia.ps1 -Esegui      ← fa sul serio
#   .\scripts\ripulisci-la-storia.ps1 -Rollback    ← torna com'era
#
param(
    [switch]$Esegui,
    [switch]$Rollback,
    [string]$Repo = "C:\Users\Antonino\Desktop\projects\AVM"
)

$ErrorActionPreference = 'Stop'

# ⛔ Il rifugio sta FUORI dalla repo: dentro, un `filter-repo` o un `clean` lo
# porterebbe via insieme al resto. È il punto di tutto lo script.
$RIFUGIO = "C:\Users\Antonino\Desktop\projects\AVM-RIFUGIO"

# I percorsi che escono dalla storia. ⛔ Sono gli stessi del `.gitignore`: se uno
# dei due elenchi cambia e l'altro no, la storia e l'indice divergono.
$INTERNI = @(
    'mobile/docs/superpowers',
    'docs/superpowers',
    '.claude',
    '.agents',
    'AGENTS.md',
    'docs/demo',
    'mobile/docs/release-recovery.md'
)

function Titolo($t) { ""; "═" * 70; "  $t"; "═" * 70 }
function Passo($t) { "  → $t" }
function Bene($t) { "  ✓ $t" }
function Male($t) { "  ⛔ $t" }

# ───────────────────────────────────────────────────────────────────────────
#  ROLLBACK — si mette per primo, perché è quello che serve quando le cose
#  vanno storte e non si ha voglia di leggere.
# ───────────────────────────────────────────────────────────────────────────
if ($Rollback) {
    Titolo "ROLLBACK — si torna com'era"

    $bundle = Join-Path $RIFUGIO "prima-della-pulizia.bundle"
    $docs = Join-Path $RIFUGIO "documenti"

    if (-not (Test-Path $bundle)) {
        Male "non trovo la copia in $bundle"
        Male "senza quella non si torna indietro: fermati e chiedi aiuto"
        exit 1
    }

    Passo "la copia c'è: $([math]::Round((Get-Item $bundle).Length / 1MB, 1)) MB"

    # ⛔ Non si sovrascrive la cartella attuale: si ricostruisce ACCANTO, e la
    # sostituzione la fa la persona. Un rollback che cancella da solo il lavoro
    # di dopo è un secondo disastro sul primo.
    $ricostruita = "$Repo-RIPRISTINATA"
    if (Test-Path $ricostruita) {
        Male "$ricostruita esiste già: spostala o cancellala prima"
        exit 1
    }

    Passo "ricostruisco la repo da zero in $ricostruita"
    git clone $bundle $ricostruita 2>&1 | Out-Null
    if (-not (Test-Path (Join-Path $ricostruita ".git"))) {
        Male "il clone non è riuscito"
        exit 1
    }
    Bene "repo ricostruita, con TUTTA la cronologia di prima"

    if (Test-Path $docs) {
        Passo "rimetto i documenti al loro posto"
        Copy-Item -Path (Join-Path $docs "*") -Destination $ricostruita -Recurse -Force
        Bene "documenti ripristinati"
    }

    ""
    "  Adesso, a mano e con calma:"
    "    1. controlla $ricostruita"
    "    2. quando sei sicuro, rinominala al posto di $Repo"
    ""
    "  ⛔ Se avevi già fatto `push --force`, il ramo remoto ha ancora la storia"
    "     nuova: va rispinto da qui, sempre con --force."
    exit 0
}

# ───────────────────────────────────────────────────────────────────────────
#  1. I CONTROLLI PRIMA — tutti, e prima di toccare qualsiasi cosa
# ───────────────────────────────────────────────────────────────────────────
Titolo $(if ($Esegui) { "PULIZIA DELLA STORIA — sul serio" } else { "PROVA A VUOTO — non tocco niente" })

Set-Location $Repo

Passo "controllo che git sia pulito"
$sporco = git status --porcelain 2>&1 | Where-Object { $_ -notmatch '^\?\?' }
if ($sporco) {
    Male "ci sono modifiche non committate:"
    $sporco | Select-Object -First 8 | ForEach-Object { "      $_" }
    Male "committa o metti da parte prima: filter-repo pretende un albero pulito"
    exit 1
}
Bene "albero di lavoro pulito"

Passo "controllo che git-filter-repo ci sia"
$hoFilterRepo = $false
try { git filter-repo --help 2>&1 | Out-Null; $hoFilterRepo = ($LASTEXITCODE -eq 0) } catch { }
if (-not $hoFilterRepo) {
    Male "git-filter-repo non è installato"
    "      si installa con:  pipx install git-filter-repo"
    "      oppure:           pip install --user git-filter-repo"
    if ($Esegui) { exit 1 }
    "      (prova a vuoto: proseguo lo stesso per mostrarti il resto)"
} else {
    Bene "git-filter-repo disponibile"
}

Passo "conto i documenti che devono restare sul disco"
$primaFile = @()
foreach ($p in $INTERNI) {
    $pieno = Join-Path $Repo $p
    if (Test-Path $pieno) {
        if ((Get-Item $pieno) -is [System.IO.DirectoryInfo]) {
            $primaFile += Get-ChildItem $pieno -Recurse -File | ForEach-Object { $_.FullName }
        } else { $primaFile += (Get-Item $pieno).FullName }
    }
}
Bene "$($primaFile.Count) file interni sul disco, adesso"

Passo "guardo quanta cronologia riscriverei"
$commitToccati = (git log --oneline --all -- $INTERNI 2>&1 | Measure-Object -Line).Lines
$commitTotali = (git rev-list --all --count 2>&1)
"      $commitToccati commit su $commitTotali toccano quei percorsi"
"      ⛔ ma filter-repo riscrive TUTTI e ${commitTotali}: cambiano tutti gli hash"

# ───────────────────────────────────────────────────────────────────────────
#  2. COSA USCIREBBE — si guarda prima di decidere
# ───────────────────────────────────────────────────────────────────────────
Titolo "COSA USCIREBBE DALLA CRONOLOGIA"
foreach ($p in $INTERNI) {
    $n = (git log --all --oneline -- $p 2>&1 | Measure-Object -Line).Lines
    $f = (git ls-files $p 2>&1 | Measure-Object -Line).Lines
    "  {0,-38} {1,4} commit  {2,4} file ancora nell'indice" -f $p, $n, $f
}

if (-not $Esegui) {
    ""
    "  ⛔ PROVA A VUOTO: non ho toccato niente."
    ""
    "  Per farlo sul serio:   .\scripts\ripulisci-la-storia.ps1 -Esegui"
    "  Per tornare indietro:  .\scripts\ripulisci-la-storia.ps1 -Rollback"
    exit 0
}

# ───────────────────────────────────────────────────────────────────────────
#  3. LA COPIA DI SICUREZZA — prima di toccare qualsiasi cosa
# ───────────────────────────────────────────────────────────────────────────
Titolo "COPIA DI SICUREZZA"

New-Item -ItemType Directory -Force $RIFUGIO | Out-Null

# ⛔ Un BUNDLE, non una copia della cartella: un bundle contiene tutta la
# cronologia di tutti i rami in un file solo, e si riclona. Copiare `.git/` a
# mano su Windows lascia indietro i file aperti.
$bundle = Join-Path $RIFUGIO "prima-della-pulizia.bundle"
Passo "salvo TUTTA la cronologia in un bundle"
git bundle create $bundle --all 2>&1 | Out-Null
if (-not (Test-Path $bundle)) { Male "il bundle non è stato creato: mi fermo"; exit 1 }
Bene "bundle: $([math]::Round((Get-Item $bundle).Length / 1MB, 1)) MB"

Passo "copio i documenti interni fuori dalla repo"
$docs = Join-Path $RIFUGIO "documenti"
New-Item -ItemType Directory -Force $docs | Out-Null
foreach ($p in $INTERNI) {
    $sorgente = Join-Path $Repo $p
    if (-not (Test-Path $sorgente)) { continue }
    $dest = Join-Path $docs $p
    New-Item -ItemType Directory -Force (Split-Path $dest -Parent) | Out-Null
    Copy-Item $sorgente $dest -Recurse -Force
}
$copiati = (Get-ChildItem $docs -Recurse -File).Count
if ($copiati -lt $primaFile.Count) {
    Male "copiati $copiati su $($primaFile.Count): la copia è incompleta, mi fermo"
    exit 1
}
Bene "$copiati file al sicuro in $docs"

# ───────────────────────────────────────────────────────────────────────────
#  4. LA PULIZIA
# ───────────────────────────────────────────────────────────────────────────
Titolo "RISCRITTURA DELLA CRONOLOGIA"

$argomenti = @('filter-repo', '--invert-paths', '--force')
foreach ($p in $INTERNI) { $argomenti += @('--path', $p) }

Passo "git $($argomenti -join ' ')"
& git @argomenti
if ($LASTEXITCODE -ne 0) {
    Male "filter-repo ha fallito. La repo può essere a metà: usa -Rollback"
    exit 1
}
Bene "cronologia riscritta"

# ───────────────────────────────────────────────────────────────────────────
#  5. LA VERIFICA — è la ragione per cui questo script esiste
# ───────────────────────────────────────────────────────────────────────────
Titolo "VERIFICA — i documenti sono ancora sul disco?"

$dopoFile = @()
foreach ($p in $INTERNI) {
    $pieno = Join-Path $Repo $p
    if (Test-Path $pieno) {
        if ((Get-Item $pieno) -is [System.IO.DirectoryInfo]) {
            $dopoFile += Get-ChildItem $pieno -Recurse -File | ForEach-Object { $_.FullName }
        } else { $dopoFile += (Get-Item $pieno).FullName }
    }
}

"  prima: $($primaFile.Count) file"
"  dopo:  $($dopoFile.Count) file"

if ($dopoFile.Count -lt $primaFile.Count) {
    Male "NE MANCANO $($primaFile.Count - $dopoFile.Count): li rimetto dalla copia"
    Copy-Item -Path (Join-Path $docs "*") -Destination $Repo -Recurse -Force
    $riparati = 0
    foreach ($p in $INTERNI) {
        $pieno = Join-Path $Repo $p
        if (Test-Path $pieno) {
            if ((Get-Item $pieno) -is [System.IO.DirectoryInfo]) {
                $riparati += (Get-ChildItem $pieno -Recurse -File).Count
            } else { $riparati++ }
        }
    }
    if ($riparati -ge $primaFile.Count) { Bene "rimessi tutti: $riparati file" }
    else { Male "ne mancano ancora: la copia è in $docs, vanno rimessi a mano" }
} else {
    Bene "nessun documento perso"
}

Passo "controllo che la cronologia sia davvero pulita"
$rimasti = (git log --all --oneline -- $INTERNI 2>&1 | Measure-Object -Line).Lines
if ($rimasti -eq 0) { Bene "zero commit nominano ancora quei percorsi" }
else { Male "$rimasti commit li nominano ancora: qualcosa non ha funzionato" }

# ───────────────────────────────────────────────────────────────────────────
#  6. E ADESSO — quello che tocca alla persona
# ───────────────────────────────────────────────────────────────────────────
Titolo "FATTO — e cosa resta da fare a MANO"

"  ⛔ filter-repo ha SCOLLEGATO il remote, di proposito: serve a non spingere"
"     per sbaglio una storia riscritta. Va rimesso a mano."
""
"  1. controlla che il codice sia intero:"
"       cd mobile ; npm run typecheck ; npx vitest run"
""
"  2. rimetti il remote:"
"       git remote add origin <indirizzo della repo>"
""
"  3. e SOLO quando sei sicuro, spingi:"
"       git push --force origin lane/talos-mobile"
""
"  ⛔ Il push forzato è irreversibile lato server, e:"
"     · chi ha già clonato o forkato mantiene i file vecchi"
"     · le PR aperte si rompono, i link ai commit vecchi muoiono"
"     · GitHub tiene gli oggetti orfani ancora per un po': per cancellarli"
"       davvero va aperta una richiesta al loro supporto"
""
"  Se qualcosa non torna:  .\scripts\ripulisci-la-storia.ps1 -Rollback"
"  La copia è in:          $RIFUGIO"
