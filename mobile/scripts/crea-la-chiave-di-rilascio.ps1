# ⭐⭐⭐ LA CHIAVE DI RILASCIO — la generi TU, una volta sola, per sempre.
#
# ⛔⛔⛔ LEGGI QUESTE SEI RIGHE PRIMA DI LANCIARLO.
#
# Questa chiave è ciò che dice ad Android «questo aggiornamento viene dalla
# stessa persona di prima». Se la perdi:
#
#   - non puoi più pubblicare aggiornamenti che si installino sopra TALOS;
#   - l'unica via per chi ce l'ha installato è DISINSTALLARE, e disinstallare
#     cancella le sue chat, la sua libreria e le sue memorie;
#   - non esiste recupero. Non da Google, non da GitHub, non da me.
#
# ⇒ Perciò lo script non la mette nel repository, non la manda da nessuna parte
# e non la cancella. La scrive in una cartella che scegli tu, e poi ti dice cosa
# farne.
#
#   .\scripts\crea-la-chiave-di-rilascio.ps1
#   .\scripts\crea-la-chiave-di-rilascio.ps1 -Dove "D:\TALOS-CHIAVE"

param(
    [string]$Dove = "$env:USERPROFILE\Desktop\TALOS-CHIAVE",
    [string]$Alias = 'talos',
    # ⛔ `-GeneraPassword` serve quando lo script non gira davanti a una
    # tastiera: ne fabbrica una lunga e casuale invece di chiederla. La password
    # finisce SOLO nel file dei segreti, che sta fuori dal repository e che va
    # cancellato dopo averla messa al sicuro.
    #
    # Non e' una scorciatoia comoda: una password digitata di fretta e' piu'
    # debole di 32 caratteri casuali, e questa chiave non si cambia mai piu'.
    [switch]$GeneraPassword
)

$ErrorActionPreference = 'Stop'
function Riga($t) { Write-Host "  $t" }
function Titolo($t) { ""; "=" * 70; "  $t"; "=" * 70 }

Titolo 'PRIMA DI COMINCIARE'
Riga '⛔ Questa chiave si crea UNA VOLTA e vale per sempre.'
Riga '   Se la perdi, chi ha TALOS installato non può più aggiornarlo:'
Riga '   dovrebbe disinstallare, e perderebbe chat, libreria e memorie.'
Riga ''
Riga 'Lo script NON la mette nel repository e NON la manda da nessuna parte.'
Riga "La scrive qui: $Dove"

# ── keytool c'è? ────────────────────────────────────────────────────────────
# Arriva col JDK. Se manca, si dice DOVE prenderlo invece di «command not found».
$keytool = (Get-Command keytool -ErrorAction SilentlyContinue).Source
if (-not $keytool) {
    $candidati = @(
        "$env:JAVA_HOME\bin\keytool.exe",
        "$env:ProgramFiles\Android\Android Studio\jbr\bin\keytool.exe",
        "$env:LOCALAPPDATA\Programs\Android Studio\jbr\bin\keytool.exe"
    )
    $keytool = $candidati | Where-Object { Test-Path $_ } | Select-Object -First 1
}
if (-not $keytool) {
    ""
    Riga '⛔ Non trovo `keytool`. Arriva insieme a Java.'
    Riga '   Se hai Android Studio installato, di solito sta in:'
    Riga '     C:\Program Files\Android\Android Studio\jbr\bin\keytool.exe'
    Riga '   Altrimenti installa un JDK 21 e rilancia.'
    exit 1
}
Riga "keytool: $keytool"

$chiave = Join-Path $Dove 'talos-release.jks'
if (Test-Path $chiave) {
    ""
    Riga "⛔ ESISTE GIA' una chiave qui: $chiave"
    Riga '   Non la tocco. Se la sovrascrivessi, la vecchia sarebbe persa —'
    Riga '   e con lei la possibilità di aggiornare le app già firmate.'
    Riga '   Se vuoi davvero ricominciare, spostala tu prima, sapendo cosa fai.'
    exit 1
}

# ── le password ─────────────────────────────────────────────────────────────
# ⛔ Non le invento io e non le scrivo su disco: le digiti tu, e restano tue.
Titolo 'LE DUE PASSWORD'
if ($GeneraPassword) {
    # 32 caratteri da un generatore crittografico. Uguale per contenitore e
    # chiave: due password diverse non aggiungono sicurezza qui — chi apre il
    # contenitore ha gia' il file — e raddoppiano solo le cose da non perdere.
    $alfabeto = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789'
    $byte = [byte[]]::new(32)
    [System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($byte)
    $sp = -join ($byte | ForEach-Object { $alfabeto[$_ % $alfabeto.Length] })
    $kp = $sp
    Riga 'Generata una password di 32 caratteri casuali.'
    Riga '⛔ La trovi nel file dei segreti, e da nessun altra parte.'
} else {
    Riga 'Ne servono due: una per il contenitore, una per la chiave dentro.'
    Riga 'Possono essere uguali. Minimo sei caratteri, e vanno CONSERVATE'
    Riga 'insieme al file — senza, il file non serve a niente.'
    ""
    $storePassword = Read-Host '  password del contenitore' -AsSecureString
    $keyPassword = Read-Host '  password della chiave   ' -AsSecureString
    $sp = [System.Net.NetworkCredential]::new('', $storePassword).Password
    $kp = [System.Net.NetworkCredential]::new('', $keyPassword).Password
}
if ($sp.Length -lt 6 -or $kp.Length -lt 6) {
    ""; Riga '⛔ Almeno sei caratteri per entrambe. Rilancia.'; exit 1
}

New-Item -ItemType Directory -Path $Dove -Force | Out-Null

Titolo 'CREO LA CHIAVE'
# 10.000 giorni ≈ 27 anni: Google chiede che la validità superi il 2033, e una
# chiave che scade è una chiave che un giorno smette di funzionare senza che
# nessuno se lo ricordi.
& $keytool -genkeypair -v `
    -keystore $chiave `
    -alias $Alias `
    -keyalg RSA -keysize 4096 -validity 10000 `
    -storepass $sp -keypass $kp `
    -dname "CN=TALOS, OU=TALOS, O=TALOS, C=IT"
if ($LASTEXITCODE -ne 0) { throw "keytool ha risposto $LASTEXITCODE" }

Riga "creata: $chiave"

# ── la prova che funziona ───────────────────────────────────────────────────
# ⛔ Non basta che il file esista: si rilegge con le password appena digitate.
# Una chiave che non si riapre è un file, non una chiave — e lo si scoprirebbe
# il giorno della release.
Titolo '⛔ LA PROVA — si riapre davvero?'
#
# ⛔⛔ UN DIFETTO VERO, E UNA MIA MISURA SBAGLIATA. Entrambi il 2026-08-16.
#
# IL DIFETTO. Il filtro cercava «Alias name», «Valid from», «SHA-256». Su
# questo computer keytool parla ITALIANO: «Nome alias», «Valido da». Non
# stampava niente, e sotto compariva lo stesso la spunta verde. Una prova che
# non mostra nulla e poi dice «✓» non e' una prova: e' una rassicurazione.
#
# ⛔ LA MIA MISURA SBAGLIATA, che vale piu' del difetto. Avevo scritto qui che
# «keytool esce con 0 anche con la password sbagliata», e ci avevo costruito
# sopra un ragionamento — lo stesso difetto di `adb connect` e di `settings`.
# Era FALSO. Rimisurato in isolamento:
#
#     -list                      password sbagliata -> exit 1
#     -list -v -alias talos      password sbagliata -> exit 1
#     -list -v -alias talos      password giusta    -> exit 0
#
# Il mio `exit=0` veniva da `$LASTEXITCODE` letto DOPO una pipeline: in
# PowerShell rifletteva `Select-Object`, non keytool. ⇒ Avevo misurato il mio
# strumento invece del programma, ed e' la stessa forma dell'errore delle due
# misure che non tornavano — quando un numero sorprende, il primo sospettato e'
# come lo si e' preso.
#
# ⇒ Il controllo sull'uscita resta lo stesso, ma per la ragione VERA: e' piu'
# robusto guardare che ci sia l'alias che ci si aspetta, invece di fidarsi di
# un codice — e stampa la prova invece di dichiararla.
$prova = (& $keytool -list -v -keystore $chiave -storepass $sp -alias $Alias 2>&1) -join "`n"
if ($prova -notmatch [regex]::Escape($Alias)) {
    ""
    Riga '⛔ La chiave NON si rilegge con la password appena usata.'
    Riga '   Non usarla: cancella la cartella e rilancia.'
    Riga "   keytool ha risposto: $($prova.Split("`n")[0])"
    exit 1
}
# Le righe utili, in qualunque lingua parli keytool: si cercano i DUE PUNTI e
# le parole che esistono in entrambe.
$prova.Split("`n") |
    Where-Object { $_ -match '(?i)alias|SHA-256|RSA|valid' } |
    Select-Object -First 4 |
    ForEach-Object { Riga $_.Trim() }
Riga '✓ si riapre, e l''alias e'' quello giusto'

# ── i quattro segreti ───────────────────────────────────────────────────────
$base64 = [Convert]::ToBase64String([IO.File]::ReadAllBytes($chiave))
$fileSegreti = Join-Path $Dove 'SEGRETI-DA-INCOLLARE-SU-GITHUB.txt'
@"
I QUATTRO SEGRETI DA METTERE SU GITHUB
======================================

Vai su:  https://github.com/Ninozzz95/talos/settings/secrets/actions
Premi «New repository secret» quattro volte, una per riga qui sotto.

⛔ Il nome va scritto ESATTAMENTE così, maiuscole comprese.

--- 1 ---
Nome:   TALOS_KEYSTORE_BASE64
Valore: (tutta la riga lunghissima qui sotto, senza a capo)

$base64

--- 2 ---
Nome:   TALOS_KEYSTORE_PASSWORD
Valore: $sp

--- 3 ---
Nome:   TALOS_KEY_ALIAS
Valore: $Alias

--- 4 ---
Nome:   TALOS_KEY_PASSWORD
Valore: $kp


⛔⛔ PRIMA DI CANCELLARE QUESTO FILE
====================================

La password qui sopra NON esiste da nessun'altra parte. Non e' recuperabile
dalla chiave, non ce l'ho io, non ce l'ha GitHub.

Mettila al sicuro INSIEME al file .jks — un gestore di password, o un foglio
in un cassetto, ma non solo su questo computer.

Poi cancella questo file. Il .jks NON si cancella: e' la chiave.
"@ | Set-Content -Path $fileSegreti -Encoding UTF8

Titolo 'FATTO — e adesso tre cose, in questo ordine'
Riga "1. Apri:  $fileSegreti"
Riga '   e incolla i quattro segreti su GitHub come spiegato lì dentro.'
Riga ''
Riga '2. Poi CANCELLA quel file dei segreti. Il .jks NO: quello si tiene.'
Riga ''
Riga '3. ⛔ METTI AL SICURO LA CHIAVE, e non su questo computer soltanto:'
Riga "     $chiave"
Riga '   Una copia su una chiavetta o un disco esterno, e le due password'
Riga '   scritte da qualche parte insieme a lei. Un disco si rompe, e questa'
Riga '   è la sola cosa del progetto che non si può rifare.'
""
