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
# ⛔ Si cerca SOLO dentro `mobile/`, l'unica cartella che viene pubblicata.
# Cercando in tutto il repo l'allarme scattava su tre `composer.json` di
# `core/` e `control-plane/` che portano l'email dell'owner come AUTORE —
# normale in open source, e comunque fuori dal pacchetto. Un allarme che
# grida su file che non escono viene ignorato, e il giorno che ne trova uno
# vero non lo legge piu' nessuno.
$conDati = git grep -lE "3B1F6DE8WTX78PET|2ea6573c|ninozz142|C:\\\\Users\\\\Antonino" -- 'mobile/*.ts' 'mobile/*.kt' 'mobile/*.java' 'mobile/*.md' 'mobile/*.json' 'mobile/*.mjs' 2>$null
if ($conDati) {
    Male "$($conDati.Count) file nominano il dispositivo o il percorso dell'owner:"
    $conDati | Select-Object -First 10 | ForEach-Object { Nota $_ }
    Nota "⚠ vanno ripuliti PRIMA di pubblicare: sono dati di una persona"
} else { Bene "nessun riferimento al dispositivo o alla persona" }

Passo "il README cita immagini che NON ci sono?"
# ⛔ Il controllo OPPOSTO a quello qui sotto, e serve tanto quanto.
#
# Quello sotto impedisce che un'immagine non firmata venga pubblicata. Questo
# impedisce che il README ne citi una ASSENTE — su GitHub diventa un riquadro
# rotto, ed è la prima cosa che una persona vede del progetto. Il caso non è
# teorico: le viste vivono in DA-APPROVARE finché l'owner non le firma, quindi
# fra «scritto nel README» e «pronta da pubblicare» c'è sempre una finestra.
$readme = Join-Path $Repo 'mobile/README.md'
if (Test-Path $readme) {
    $citate = [regex]::Matches((Get-Content $readme -Raw), 'docs/immagini/([A-Za-z0-9._-]+\.png)') |
              ForEach-Object { $_.Groups[1].Value } | Select-Object -Unique
    $assenti = $citate | Where-Object { -not (Test-Path (Join-Path $Repo "mobile/docs/immagini/$_")) }
    if ($assenti) {
        Male "$($assenti.Count) immagini citate dal README non sono in docs/immagini/:"
        $assenti | ForEach-Object {
            $dove = if (Test-Path (Join-Path $Repo "mobile/docs/immagini/DA-APPROVARE/$_")) { " (in quarantena, in attesa del sì)" } else { " (non esiste)" }
            Nota "$_$dove"
        }
        Nota "⛔ Su GitHub diventerebbero riquadri rotti."
        $bloccoImmagini = $true
    } elseif ($citate) { Bene "$($citate.Count) immagini citate dal README, tutte presenti" }
}

Passo "ogni screenshot e' stato APPROVATO dall'owner?"
# ⛔⛔ Owner 2026-08-15: «devo approvare ogni screenshot esplicitamente, senza
# il mio permesso non si pubblicano».
#
# Uno screenshot e' l'unica cosa in questo repo che nessun controllo automatico
# puo' giudicare davvero: il filtro sa cercare una email o una chiave, non sa
# vedere che sullo sfondo c'e' una cartella con dentro un nome, o che la chat
# e' nella lingua sbagliata. ⇒ L'unico giudice e' la PERSONA, e questo cancello
# si limita a non lasciar passare niente che non abbia firmato.
$cartellaImg = Join-Path $Repo 'mobile/docs/immagini'
$manifesto   = Join-Path $cartellaImg 'APPROVATE.txt'
if (Test-Path $cartellaImg) {
    $approvate = @()
    if (Test-Path $manifesto) {
        $approvate = Get-Content $manifesto | Where-Object { $_ -match '^\s*[^#\s]' } |
                     ForEach-Object { ($_ -split '\s+')[0] }
    }
    $presenti = Get-ChildItem $cartellaImg -Filter *.png -File -ErrorAction SilentlyContinue
    $nonFirmate = $presenti | Where-Object { $approvate -notcontains $_.Name }
    if ($nonFirmate) {
        Male "$($nonFirmate.Count) screenshot NON approvati in mobile/docs/immagini/:"
        $nonFirmate | ForEach-Object { Nota $_.Name }
        Nota "⛔ Non si pubblicano. Vanno mostrati all'owner e, dopo il suo si',"
        Nota "   aggiunti a mobile/docs/immagini/APPROVATE.txt"
        $bloccoImmagini = $true
    } elseif ($presenti) {
        Bene "$($presenti.Count) screenshot, tutti firmati in APPROVATE.txt"
    } else { Bene "nessuno screenshot (niente da approvare)" }

    $inAttesa = Get-ChildItem (Join-Path $cartellaImg 'DA-APPROVARE') -Filter *.png -File -ErrorAction SilentlyContinue
    if ($inAttesa) { Nota "($($inAttesa.Count) in quarantena, in attesa del si' dell'owner)" }
} else { Bene "nessuna cartella immagini" }

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

if ($bloccoImmagini -and $Esegui) {
    Titolo "MI FERMO"
    "  Ci sono screenshot che l'owner non ha approvato."
    "  ⛔ Una vetrina pubblica non si costruisce con immagini non firmate."
    exit 1
}

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

# ⛔⛔ Una copia GIA' PUBBLICATA non si butta: si aggiorna.
#
# Prima questo blocco diceva «esiste già, cancellala». Cancellarla significa
# ripartire con `git init`, cioe' con una cronologia nuova — e al push
# successivo serve un force, che su un repo pubblico riscrive la storia sotto
# ai piedi di chi l'ha clonato.
#
# ⇒ Se la cartella ha una `.git` con un `origin`, e' gia' stata pubblicata: la
# sua cronologia si conserva e i file si aggiornano. Se e' una cartella
# qualunque, resta un errore — cancellare roba di qualcun altro non e' compito
# di questo script.
$riusaCronologia = $false
$Salvataggio = $null
if (Test-Path $Destinazione) {
    $haOrigin = $false
    if (Test-Path (Join-Path $Destinazione '.git')) {
        Push-Location $Destinazione
        $haOrigin = [bool](git remote get-url origin 2>$null)
        Pop-Location
    }
    if (-not $haOrigin) {
        Male "$Destinazione esiste già e non è una copia pubblicata"
        Nota "cancellala o scegli un'altra destinazione con -Destinazione"
        exit 1
    }
    Passo "la copia è già pubblicata: ne conservo la cronologia"
    $Salvataggio = "$Destinazione-precedente"
    if (Test-Path $Salvataggio) { Remove-Item -LiteralPath $Salvataggio -Recurse -Force }
    Rename-Item -LiteralPath $Destinazione -NewName (Split-Path $Salvataggio -Leaf)
    $riusaCronologia = $true
}

# ⛔⛔ SI PUBBLICA SOLO `mobile/`, non tutta AVM. Owner 2026-08-15: «per una repo
# bella e completa cosa consigli?» — e i dati rispondono da soli:
#
#     mobile          1.545 file   600 file di test   lavorato oggi
#     control-plane   1.400 file   165 test
#     core              287 file     0 test
#     validator          80 file    10 test   fermo dal 16 luglio
#
# Solo `mobile` ha una rete di sicurezza vera (5.143 test verdi). Pubblicare
# accanto codice con zero test dice al visitatore che il progetto è disomogeneo,
# e la prima segnalazione arriverà proprio sul pezzo che non si sa difendere.
#
# ⇒ AVM resta privata e intera. Quando `control-plane` sarà pronto si pubblica
# accanto — non prima.
#
# ⛔ `git archive` prende esattamente ciò che git conosce: rispetta il
# `.gitignore` per costruzione, e non porta con sé `node_modules`, i build, né i
# documenti tolti dall'indice.
# ⛔ E `mobile/` diventa la RADICE, non una sottocartella. Con
# `AVM-PUBBLICA/mobile/README.md` GitHub non trova nessun README alla radice: chi
# arriva atterra su una pagina che non spiega niente, ed e' il difetto peggiore
# possibile in una vetrina — quello che si vede per primo.
Passo "estraggo mobile/ (che diventa la radice) e i file di licenza"
$tar = Join-Path $env:TEMP "talos-pubblica.tar"
$tarRadice = Join-Path $env:TEMP "talos-radice.tar"
# `--prefix` vuoto + il percorso `mobile`: git archive di una sottocartella la
# estrae SENZA il prefisso, cioe' esattamente appiattita.
git archive --format=tar -o $tar HEAD:mobile
$aLato = @('LICENSE', 'NOTICE', 'SECURITY.md', 'CONTRIBUTING.md',
           'CODE_OF_CONDUCT.md', 'THIRD_PARTY_NOTICES.md', '.github')
git archive --format=tar -o $tarRadice HEAD -- $aLato
if (-not (Test-Path $tar)) { Male "git archive non ha prodotto niente"; exit 1 }
Bene "archivio: $([math]::Round((Get-Item $tar).Length / 1MB, 1)) MB"

New-Item -ItemType Directory -Force $Destinazione | Out-Null
Passo "scompatto in $Destinazione"
tar -xf $tar -C $Destinazione
tar -xf $tarRadice -C $Destinazione
Remove-Item $tar, $tarRadice -Force

# ⛔ Il README parlava da dentro `mobile/`, quindi puntava a `../LICENSE`.
# Adesso e' la radice: i rimandi vanno corretti, se no il primo link che una
# persona prova e' morto.
Passo "correggo i rimandi del README, che ora e' alla radice"
$readme = Join-Path $Destinazione 'README.md'
if (Test-Path $readme) {
    $t = Get-Content $readme -Raw
    $t = $t -replace '\]\(\.\./', ']('
    $t = $t -replace 'cd mobile
?
', ''
    Set-Content $readme $t -NoNewline
    Bene "rimandi corretti"
}
$estratti = (Get-ChildItem $Destinazione -Recurse -File).Count
Bene "$estratti file"

# ⛔ La rete di sicurezza: `git archive` non dovrebbe portarsi dietro i
# documenti interni, perché non sono più tracciati. Ma «non dovrebbe» non è
# «non lo fa», e questa è l'ultima occasione per accorgersene.
Passo "controllo che NESSUN documento interno sia finito nella copia"
$intrusi = 0
foreach ($p in ($INTERNI + @('docs/superpowers'))) {
    # ⛔ I percorsi sono APPIATTITI: `mobile/docs/superpowers` diventa
    # `docs/superpowers`. Controllare il percorso vecchio non troverebbe niente
    # e direbbe «pulito» su una cartella piena.
    $corto = $p -replace '^mobile/', ''
    $pieno = Join-Path $Destinazione $corto
    if (Test-Path $pieno) {
        Male "INTRUSO: $corto è finito nella cartella pubblica"
        Remove-Item $pieno -Recurse -Force
        Nota "rimosso"
        $intrusi++
    }
}
if ($intrusi -eq 0) { Bene "nessun documento interno nella copia" }

# ⛔⛔ LA SECONDA PUBBLICAZIONE — e questo script non la sapeva fare.
#
# MISURATO 2026-08-15, un'ora dopo il primo push: la copia si ricreava sempre
# da zero con `git init`, quindi la sua cronologia era SEMPRE nuova. Al secondo
# giro il push diventava un `non-fast-forward` e l'unica via d'uscita era un
# force push — che su un repo pubblico cancella la cronologia sotto ai piedi di
# chiunque l'abbia clonato.
#
# ⇒ Se la copia era già stata pubblicata, la sua `.git` si CONSERVA: si
# aggiornano i file e si fa un commit in cima. La cronologia pubblica cresce
# invece di essere riscritta.
$gitPrecedente = $null
if ($riusaCronologia) {
    $gitPrecedente = Join-Path ([System.IO.Path]::GetTempPath()) "talos-git-$(Get-Random)"
    Move-Item (Join-Path $Salvataggio '.git') $gitPrecedente
}

Passo $(if ($gitPrecedente) { "riprendo la cronologia gia' pubblicata" } else { "inizializzo una cronologia NUOVA, senza passato" })
Set-Location $Destinazione
if ($gitPrecedente) {
    Move-Item $gitPrecedente (Join-Path $Destinazione '.git')
    git reset -q
} else {
    git init -q -b main
}
git add -A

# ⛔⛔ IL BIT DI ESECUZIONE NON VIAGGIA CON IL CONTENUTO.
#
# Copy-Item copia i byte; il permesso di esecuzione e' un attributo che su
# Windows non esiste nemmeno, e che git tiene come MODO del file (100755 contro
# 100644). Copiando e ri-aggiungendo, tutto diventa 100644.
#
# MISURATO il 2026-08-16, e a caro prezzo: il primo tag di TALOS e' morto con
#
#     ##[error]Process completed with exit code 126
#
# — «comando non eseguibile» — perche' `android/gradlew` era arrivato nel
# repository pubblicato senza il bit. Su Windows non si nota: e' il primo
# runner Linux a inciamparci, cioe' la release.
#
# ⇒ Si chiede al repository di ORIGINE quali file sono eseguibili, e si dichiara
# lo stesso nella copia. Non un elenco scritto a mano: `git ls-files -s` sa gia'
# la risposta, e resta vera quando qualcuno aggiunge uno script nuovo.
$eseguibili = @(git -C $Repo ls-files -s -- 'mobile/') |
    Where-Object { $_ -like '100755 *' } |
    ForEach-Object { ($_ -split "`t")[-1] } |
    ForEach-Object { $_.Substring('mobile/'.Length) }

if ($eseguibili.Count -gt 0) {
    foreach ($f in $eseguibili) {
        if (Test-Path (Join-Path $Destinazione $f)) { git update-index --chmod=+x -- $f }
    }
    Bene "$($eseguibili.Count) file eseguibili, dichiarati tali anche nella copia"
} else {
    Bene 'nessun file eseguibile da riportare'
}

$messaggio = if ($gitPrecedente) {
    "Sync from the development repository

The working history and the internal documents stay in the private
repository; this one carries the published state."
} else {
    "TALOS

Un assistente Android che agisce sul telefono: legge lo schermo, apre le app,
manda messaggi, e dice sempre cosa è successo davvero.

Questa è la prima pubblicazione: la cronologia di sviluppo è rimasta nel
repository privato, insieme ai documenti di lavoro."
}
# ⛔ Niente da dire? Non si fa un commit vuoto: si dice che non serve.
if ((git status --porcelain).Count -eq 0) {
    Bene "niente di nuovo da pubblicare"
} else {
    git -c user.name="antoninorizzo" -c user.email="ninozz142@gmail.com" commit -q -m $messaggio
    $commit = git rev-parse --short HEAD
    Bene $(if ($gitPrecedente) { "commit di aggiornamento: $commit" } else { "un commit solo: $commit" })
}

# ───────────────────────────────────────────────────────────────────────────
#  5. LA VERIFICA — l'originale è intatto?
# ───────────────────────────────────────────────────────────────────────────
Titolo "VERIFICA — le immagini sono ARRIVATE nella copia?"
# ⛔⛔ Il controllo di prima guarda l'ORIGINALE, e non basta.
#
# MISURATO 2026-08-15: il cancello diceva «4 immagini citate dal README, tutte
# presenti» — vero nell'originale — e la copia pubblicabile non ne conteneva
# NESSUNA. `mobile/.gitignore` aveva `*.png`, quindi non erano tracciate e la
# copia, che si costruisce dai file tracciati, le lasciava indietro.
#
# ⇒ Un controllo che guarda il posto sbagliato è peggio di nessun controllo:
# dice «✓» e chiude la domanda.
$readmeCopia = Join-Path $Destinazione 'README.md'
if (Test-Path $readmeCopia) {
    $citate = [regex]::Matches((Get-Content $readmeCopia -Raw), 'docs/immagini/([A-Za-z0-9._-]+\.png)') |
              ForEach-Object { $_.Groups[1].Value } | Select-Object -Unique
    $mancanti = $citate | Where-Object { -not (Test-Path (Join-Path $Destinazione "docs/immagini/$_")) }
    if ($mancanti) {
        Male "$($mancanti.Count) immagini citate dal README NON sono arrivate nella copia:"
        $mancanti | ForEach-Object { Nota $_ }
        Nota "⛔ Su GitHub sarebbero riquadri rotti. Controlla mobile/.gitignore."
    } elseif ($citate) { Bene "$($citate.Count) immagini, arrivate tutte nella copia" }
    else { Bene "il README non cita immagini" }
}

if ($Salvataggio -and (Test-Path $Salvataggio)) {
    Remove-Item -LiteralPath $Salvataggio -Recurse -Force
}

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
# ⛔ `$Destinazione\mobile` NON ESISTE, e questa riga lo diceva da settimane.
#    Nella copia pubblicata l'app È la radice: è tutto il senso
#    dell'appiattimento. Chi avesse seguito l'istruzione sarebbe finito in una
#    cartella che non c'è, e avrebbe concluso che la copia è rotta.
#    ⇒ Un'istruzione che manda in un posto inesistente è peggio di nessuna
#    istruzione: la prima volta la si segue, e si perde tempo a cercare l'errore
#    dalla parte sbagliata.
"          cd $Destinazione ; npm ci ; npm run typecheck ; npx vitest run"
""
"  Poi, e solo poi:"
"     git -C $Destinazione remote add origin <la repo NUOVA, mai usata prima>"
"     git -C $Destinazione push -u origin main"
""
"  ⛔ La repo di destinazione dev'essere NUOVA e mai stata un fork privato di"
"     questa: se lo fosse, tutto ciò che c'era nel fork prima della"
"     pubblicazione diventerebbe pubblico insieme (CFOR)."
""
"  Se qualcosa non va: cancella $Destinazione e rifai. L'originale non si tocca."
