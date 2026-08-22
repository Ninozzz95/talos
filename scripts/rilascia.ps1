#Requires -Version 5.1
# ═══════════════════════════════════════════════════════════════════════════
#  RILASCIA — il percorso di release, con ogni cancello dentro lo script
# ═══════════════════════════════════════════════════════════════════════════
#
#   .\scripts\rilascia.ps1 -Versione 0.1.19            ← guarda e basta
#   .\scripts\rilascia.ps1 -Versione 0.1.19 -Esegui    ← pubblica e tagga
#
# ## ⛔ Perché esiste: il 2026-08-22, e prima ancora il 16
#
# La 0.1.18 è uscita bene, ma solo perché una persona ha guardato. Lungo il
# percorso, in un pomeriggio:
#
#   1. lo script di preparazione NON PARTIVA con `powershell` (5.1): niente BOM
#      nel file, PowerShell lo leggeva come ANSI, e i caratteri ⛔/✓ rompevano
#      le stringhe a metà. Moriva in parsing;
#   2. partendo con `pwsh`, `tar` risolveva a quello di Git Bash, che legge
#      `C:\...` come HOST REMOTO ed estrae ZERO file. Ha svuotato la copia
#      pubblica e ci ha committato dentro un albero da 4 file;
#   3. e lo script stampava **FATTO** su quella cartella vuota, perché
#      controllava che l'ARCHIVIO esistesse — non che l'estrazione avesse
#      prodotto qualcosa;
#   4. il numero di serie del Pad dell'owner era dentro un file nuovo, e da
#      quattro release anche dentro il CHANGELOG già pubblicato;
#   5. e il `git push` andava scritto senza `-C`, cioè dalla cartella in cui la
#      shell si trovava — il 16/8 così sono quasi usciti 392 documenti interni.
#
# ⇒ I punti 1, 2 e 3 sono curati dentro `prepara-la-pubblicazione.ps1`. Questo
# script tiene gli altri, e soprattutto tiene **l'ordine**: nessun passo parte
# se quello prima non ha dato una prova.
#
# ## La regola che decide tutto
#
# ⛔⛔ **Ogni cancello dice COSA ha guardato, non solo che è passato.** Un `V`
# senza numero accanto è la stessa cosa di nessun controllo: il 22/8 lo script
# ha detto FATTO su una cartella vuota, e nessuno poteva accorgersene perché
# non diceva quanti file avesse visto.
#
# ⛔ E i tag vanno SOLO sul repo pubblico: le chiavi di firma stanno lì, e un
# tag sul privato accende un workflow che non può firmare e muore in 20 s.

param(
    [Parameter(Mandatory = $true)][string]$Versione,
    [switch]$Esegui,
    [string]$Repo = '',
    [string]$Copia = ''
)

$ErrorActionPreference = 'Stop'

# ⛔ I percorsi si calcolano QUI e non nei default dei parametri: in PowerShell
#    5.1 `$PSScriptRoot` è ancora vuoto quando i default vengono valutati, e lo
#    script muore su «stringa vuota» prima di dire una sola parola. Con pwsh 7
#    funzionava — cioè il difetto si vedeva solo con l'interprete che una
#    persona usa davvero digitando `powershell`.
$qui = Split-Path -Parent $MyInvocation.MyCommand.Path
if (-not $Repo)  { $Repo  = Split-Path -Parent $qui }
if (-not $Copia) { $Copia = Join-Path (Split-Path -Parent $Repo) 'AVM-PUBBLICA' }
$PSScriptRootVero = $qui
$tag = "v$Versione"

function Titolo($t) { "";  "  $t"; "  " + ('-' * 68) }
function Passo($t)  { "  .. $t" }
function Bene($t)   { "  OK  $t" }
function Male($t)   { "  NO  $t" }
function Fermo($t)  { Male $t; ""; "  ⛔ FERMO QUI. Niente e' stato pubblicato."; exit 1 }

Titolo "RILASCIO $tag  ($(if ($Esegui) { 'PUBBLICA DAVVERO' } else { 'guardo e basta' }))"

# ── 1 · l'albero di lavoro non porta roba non sua ─────────────────────────────
# ⛔ Non «pulito»: pulito NON è possibile qui (il submodule llama.cpp è sempre
#    modificato, e ci sono script ad-hoc che non sono miei). Si guarda che non
#    ci sia CODICE non committato, che è un'altra domanda.
Titolo '1 · il lavoro e tutto committato?'
$sporchi = @(git -C $Repo status --porcelain | Where-Object { $_ -notmatch '^\?\?' -and $_ -notmatch 'third_party/' })
if ($sporchi.Count -gt 0) {
    $sporchi | ForEach-Object { "     $_" }
    Fermo "$($sporchi.Count) file modificati e non committati"
}
Bene "nessun file tracciato modificato (submodule e file non tracciati esclusi, e dichiarati)"

# ── 2 · i cancelli dell'app ───────────────────────────────────────────────────
# ⛔ Si lanciano QUI e non «si presume che qualcuno li abbia lanciati». Il costo
#    è qualche minuto; il costo di non farlo è una release rotta con un tag
#    sopra, che non si può ritirare.
Titolo '2 · typecheck e test'
Passo 'npm run typecheck'
$null = & cmd /c "cd /d `"$Repo\mobile`" && npm run typecheck 2>&1"
if ($LASTEXITCODE -ne 0) { Fermo "typecheck rosso (uscita $LASTEXITCODE)" }
Bene 'typecheck pulito'

Passo 'npx vitest run'
$uscitaTest = & cmd /c "cd /d `"$Repo\mobile`" && npx vitest run 2>&1"
if ($LASTEXITCODE -ne 0) {
    $uscitaTest | Select-Object -Last 12 | ForEach-Object { "     $_" }
    Fermo "test rossi (uscita $LASTEXITCODE)"
}
$riga = $uscitaTest | Select-String -Pattern '^\s*Tests\s+' | Select-Object -Last 1
Bene "test verdi - $($riga -replace '\s+', ' ')"

# ── 3 · il CHANGELOG parla di QUESTA versione ─────────────────────────────────
# ⛔ Il workflow di release lo PRETENDE: se manca la sezione, la release non
#    esce — e se ne accorge dopo il tag, quando rimediare costa un tag nuovo.
Titolo "3 · il CHANGELOG ha la sezione $tag?"
$cl = Join-Path $Repo 'CHANGELOG.md'
if (-not (Test-Path $cl)) { Fermo "manca $cl" }
$testoCl = Get-Content $cl -Raw
if ($testoCl -notmatch "(?m)^##\s+$([regex]::Escape($tag))\s*$") {
    Fermo "$cl non ha una sezione '## $tag' - il workflow di release la pretende"
}
$righeSez = ($testoCl -split "(?m)^##\s+")[1] -split "`n"
Bene "sezione '## $tag' presente, $($righeSez.Count) righe"

# ── 4 · nessun dato personale in cio che esce ────────────────────────────────
# ⛔⛔ Il 22/8 il serial del Pad era in un file nuovo E nel CHANGELOG da quattro
#    release. Si cerca su TUTTO cio che git conosce, non su un percorso solo:
#    la prima versione di questo controllo ne aveva trovato uno su cinque.
Titolo '4 · dati personali fra i file tracciati'
# ⛔⛔ E NON TUTTO CIO' CHE NOMINA UNA PERSONA E' UNA FUGA.
#
# La prima versione bloccava anche sul NOME dell'owner, e ha trovato 16
# occorrenze — tutte legittime. `PROVENIENZA-PAROLA.md` dice «dentro un APK
# firmato da Antonino Rizzo»: e' **attribuzione della firma**, pubblica per
# costruzione, e toglierla renderebbe l'APK meno verificabile, non piu' sicuro.
# Le altre sono esempi dentro i commenti («un messaggio WhatsApp ad Antonino
# Rizzo che dice ciao»).
#
# ⇒ Un cancello che blocca ogni release viene spento al terzo falso allarme, e
# con lui se ne va la garanzia vera. Cio' che BLOCCA sono le cose che non hanno
# nessuna ragione di uscire: il serial di un dispositivo, un percorso del disco
# di una persona, un'email. Il nome si CONTA e si dice, senza fermare.
$bloccanti = @(
    @{ nome = 'serial di un dispositivo'; regex = '\b2ea6573c\b' },
    @{ nome = 'percorso sul disco';       regex = 'C:\\+Users\\+[A-Za-z]' },
    # ⛔ L'email DELL'OWNER, non «un'email». Il pattern generico
    #    `...@(gmail|outlook)\.` ha trovato otto occorrenze, tutte fixture di
    #    test — `casa@gmail.com`, `lavoro@gmail.com`. Un cancello cerca la cosa
    #    che non deve uscire, non la forma di quella cosa: cercare la forma
    #    prende le finte insieme alle vere, e chi legge impara a ignorarlo.
    @{ nome = 'email dell owner';         regex = 'ninozz[0-9]*@' }
)
$dove = @('mobile/src', 'mobile/tests', 'mobile/android/app/src', 'CHANGELOG.md', 'README.md')
$trovate = @()
foreach ($s in $bloccanti) {
    $hit = @(git -C $Repo grep -n -I -E $s.regex -- @dove 2>$null)
    if ($hit.Count -gt 0) {
        Male "$($s.nome): $($hit.Count) occorrenze"
        $hit | Select-Object -First 5 | ForEach-Object { "     $_" }
        $trovate += $hit
    }
}
if ($trovate.Count -gt 0) { Fermo "$($trovate.Count) riferimenti personali nei file che verrebbero pubblicati" }
Bene "$($bloccanti.Count) spie bloccanti cercate in $($dove.Count) percorsi, nessuna trovata"

# Il nome si conta e si dichiara: chi rilascia deve saperlo, non essere fermato.
$nomi = @(git -C $Repo grep -c -I -E '\bAntonino\s+Rizzo\b' -- @dove 2>$null)
if ($nomi.Count -gt 0) {
    Passo "il nome dell'owner compare in $($nomi.Count) file (attribuzione della firma ed esempi: non blocca)"
}

# ── 5 · costruisci la copia, e PROVA che sia piena ───────────────────────────
Titolo '5 · costruisco la copia pubblicabile'
if (-not $Esegui) {
    Passo "(guardo e basta: la copia NON viene ricostruita)"
}
else {
    if (Test-Path $Copia) {
        # ⛔ Non si cancella: si mette da parte. Una copia rotta e' l'unica prova
        #    di cosa e' andato storto, e il 22/8 e' servita a capirlo.
        $daParte = "$Copia.precedente-$(Get-Date -Format 'MMdd-HHmm')"
        Passo "metto da parte la copia esistente in $(Split-Path -Leaf $daParte)"
        Move-Item $Copia $daParte
    }
    & (Join-Path $PSScriptRootVero 'prepara-la-pubblicazione.ps1') -Esegui
    if ($LASTEXITCODE -ne 0) { Fermo "la preparazione e' fallita (uscita $LASTEXITCODE)" }
}

if (Test-Path $Copia) {
    $quanti = @(Get-ChildItem $Copia -Recurse -File -Force -ErrorAction SilentlyContinue |
                Where-Object { $_.FullName -notlike "*\.git\*" }).Count
    if ($quanti -lt 500) { Fermo "la copia ha solo $quanti file: e' vuota, non pubblicarla" }
    Bene "la copia ha $quanti file"
}
else { Fermo "la copia non esiste: $Copia" }

# ── 6 · IL CANCELLO — cosa cambierebbe DAVVERO su GitHub ─────────────────────
# ⛔⛔⛔ Questo e' il passo che il 16/8 ha impedito di pubblicare 392 documenti
#    interni, e il 22/8 ha fermato un albero da 4 file. Si confronta con
#    **origin/main**, cioe' con cio' che e' davvero pubblicato — non con l'ultimo
#    commit locale, che il 22/8 era spazzatura di un tentativo fallito.
Titolo '6 · cosa cambierebbe su GitHub'
$null = git -C $Copia fetch origin 2>&1
$testa = (git -C $Copia rev-parse HEAD).Trim()

$null = git -C $Copia merge-base --is-ancestor origin/main $testa 2>$null
if ($LASTEXITCODE -ne 0) {
    Fermo "HEAD non discende da origin/main: storie divergenti, un push riscriverebbe"
}
Bene 'HEAD discende da origin/main (avanzamento pulito, nessuna riscrittura)'

$stato = @(git -C $Copia diff --name-status origin/main $testa)
$agg  = @($stato | Where-Object { $_ -match '^A' }).Count
$mod  = @($stato | Where-Object { $_ -match '^M' }).Count
$canc = @($stato | Where-Object { $_ -match '^D' })
"     aggiunti $agg  ·  modificati $mod  ·  cancellati $($canc.Count)"
if ($canc.Count -gt 0) {
    $canc | Select-Object -First 10 | ForEach-Object { "     $_" }
    Fermo "$($canc.Count) file verrebbero CANCELLATI dal repo pubblico"
}
if ($agg + $mod -eq 0) { Fermo 'niente da pubblicare: la copia e identica a origin/main' }
Bene "nessuna cancellazione, $($agg + $mod) file cambiano"

# ── 7 · nessun documento interno nella copia ─────────────────────────────────
Titolo '7 · documenti interni nella copia'
$interni = @('.claude', '.agents', '.codex', 'AGENTS.md', 'superpowers',
             'RITORNO-', 'BRIEF-', 'CONSEGNA-', 'MEMORIA-', 'TALOS-BANCO', 'DA-PROVARE')
$dentro = @()
foreach ($i in $interni) {
    $hit = @(git -C $Copia ls-files | Where-Object { $_ -like "*$i*" })
    if ($hit.Count -gt 0) { $dentro += $hit; Male "$i : $($hit.Count) file" }
}
if ($dentro.Count -gt 0) { Fermo "$($dentro.Count) documenti interni nella copia pubblicabile" }
Bene "$($interni.Count) famiglie cercate, nessun documento interno"

# ── 8 · il tag non esiste gia ────────────────────────────────────────────────
Titolo "8 · il tag $tag e libero?"
$esistenti = @(git -C $Copia ls-remote --tags origin "refs/tags/$tag")
if ($esistenti.Count -gt 0) { Fermo "$tag esiste GIA sul remoto: un tag di release non si riscrive" }
Bene "$tag non esiste ancora sul remoto"

# ── 9 · e solo adesso ────────────────────────────────────────────────────────
Titolo '9 · pubblicare'
if (-not $Esegui) {
    ""
    "  Tutti i cancelli sono passati. Per pubblicare davvero:"
    "     .\scripts\rilascia.ps1 -Versione $Versione -Esegui"
    ""
    exit 0
}

# ⛔ SEMPRE `git -C`. Il 16/8 un `cd` fallito ha quasi spinto il repo di
#    sviluppo, coi 392 documenti interni, sul remoto pubblico.
Passo "git -C `"$Copia`" push origin HEAD:main"
git -C $Copia push origin "HEAD:main"
if ($LASTEXITCODE -ne 0) { Fermo "il push del ramo e' fallito (uscita $LASTEXITCODE)" }
Bene 'ramo pubblicato'

$messaggio = Join-Path $Repo ".claude/tag-$tag.txt"
if (Test-Path $messaggio) {
    git -C $Copia tag -a $tag -F $messaggio
}
else {
    Male "manca ${messaggio} - il tag avra' un messaggio minimo"
    git -C $Copia tag -a $tag -m "$tag"
}
if ($LASTEXITCODE -ne 0) { Fermo 'creazione del tag fallita' }

# ⛔ Il tag deve puntare a cio' che e' stato appena pubblicato, non a un
#    commit locale piu' avanti.
$suTag = (git -C $Copia rev-list -n 1 $tag).Trim()
if ($suTag -ne $testa) { Fermo "il tag punta a $suTag, ma abbiamo pubblicato $testa" }
Bene "il tag punta esattamente al commit pubblicato"

Passo "git -C `"$Copia`" push origin $tag"
git -C $Copia push origin $tag
if ($LASTEXITCODE -ne 0) { Fermo "il push del tag e' fallito (uscita $LASTEXITCODE)" }

Titolo 'PUBBLICATO'
"  ramo e tag $tag sono sul repo pubblico."
"  ⛔ Adesso guarda che la CI firmi:  gh run list --limit 2"
"     La v0.1.17 ci ha messo 12m46s. Se non esce un APK firmato, il tag c'e'"
"     e la release no - e si rimedia solo con un tag nuovo."
""
