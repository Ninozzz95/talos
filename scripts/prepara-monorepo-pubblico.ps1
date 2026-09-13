#requires -Version 7.0
<#
R-05b: due prodotti, una storia pubblica. Nessuna rete, fetch o push.
Il Repo viene letto esclusivamente da HEAD. La Copia viene modificata soltanto
dopo i cancelli sul candidato locale. Il solo commit automatico e' il riordino.
.gitmodules cambia nel secondo commit: altrimenti il primo non sarebbe R100.
Le prove e i candidati restano in Temp; non vengono cancellati automaticamente.
#>
[CmdletBinding()]
param(
    [string]$Repo = (Split-Path -Parent $PSScriptRoot),
    [string]$Copia = 'C:\Users\Antonino\Desktop\projects\AVM-PUBBLICA',
    [switch]$Esegui,
    [switch]$Riordina
)
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
$tempo = [Diagnostics.Stopwatch]::StartNew()
$script:tar = Join-Path $env:SystemRoot 'System32/tar.exe'
$script:licenza = '0d96a4ff68ad6d4b6f1f30f713b18d5184912ba8dd389f86aa7710db079abcb0'
$script:inclusioni = @(
    'LICENSE', 'NOTICE', 'THIRD_PARTY_NOTICES.md', '.gitattributes', '.github',
    'README-MONOREPO.md', '.gitignore-pubblico',
    'harness-ui/server.mjs', 'harness-ui/src', 'harness-ui/public',
    'harness-ui/frontend', 'harness-ui/desktop', 'harness-ui/scripts',
    'harness-ui/tests', 'harness-ui/contracts', 'harness-ui/package.json',
    'harness-ui/package-lock.json', 'harness-ui/README.md',
    'harness-ui/THIRD_PARTY_NOTICES.md', 'context-engine',
    # 13/09, primo giro del job sui runner: `labs/feature-flags.json` è CONFIGURAZIONE del prodotto
    # (config.mjs lo legge per TALOS_LABS); senza, il server dice «(nessuno: file assente)» e il
    # test W0-04 è rosso. Esce SOLO quel file, non la cartella labs/.
    'harness-ui/labs/feature-flags.json'
)
$script:radice = @('LICENSE', 'NOTICE', 'THIRD_PARTY_NOTICES.md', '.gitattributes',
    '.github', '.gitmodules', 'CHANGELOG.md', 'CODE_OF_CONDUCT.md')
$script:gestiti = @('LICENSE', 'NOTICE', 'THIRD_PARTY_NOTICES.md', '.gitattributes', 'README.md', '.gitignore')
# 13/09, review: l'unico `dist` che DEVE uscire. Non e' un artefatto: e' «il codice vero
# dell'app, compilato», importato da harness-ui/src/kernel/talosHarness.mjs:76 (spostarlo
# rompe tre file di test al caricamento). Ogni altro segmento `dist` resta vietato.
$script:ammessi = @('harness-ui/src/kernel/dist/kernelPerIlBanco.js', 'harness-ui/labs/feature-flags.json')
$script:vietati = '(^|/)(\.claude|\.agents|\.codex|scratchpad|AGENTS\.md|\.chat-images|mockup-originale|labs|benchmarks|node_modules|\.prove|\.staging|dist|test-results|test-results-context)(/|$)'
# 13/09, review: senza «tre/gli/sugli harness» — nel desktop «harness» e' il nome del prodotto
# (harness-ui, sessioni dell'harness) e quelle tre forme fermavano 44 righe di commenti nostri
# che parlano del prodotto, non della ricerca. Restano i nomi del banco e dei concorrenti.
$script:ricerca = 'aider|prime-agent|TALOS-BANCO|corsaCoding|sconto-fedelta|scorta-minima|banco di coding|corsaDiCoding|falsifica\.mjs'

function Scrivi([string]$Testo) { Write-Host $Testo }
function Git([string]$Dove, [string[]]$Argomenti, [switch]$VuotoOK) {
    $info = [Diagnostics.ProcessStartInfo]::new('git')
    $info.UseShellExecute = $false; $info.CreateNoWindow = $true
    $info.RedirectStandardOutput = $true; $info.RedirectStandardError = $true
    $info.StandardOutputEncoding = [Text.UTF8Encoding]::new($false)
    $info.Environment['GIT_OPTIONAL_LOCKS'] = '0'
    $info.Environment['GIT_TERMINAL_PROMPT'] = '0'
    # Nessun cambio globale di safe.directory o configurazione dell'owner.
    foreach ($a in @('-c', "safe.directory=$Dove", '-c', 'core.quotePath=false', '-C', $Dove) + $Argomenti) {
        $info.ArgumentList.Add($a)
    }
    $processo = [Diagnostics.Process]::Start($info)
    $out = $processo.StandardOutput.ReadToEndAsync(); $err = $processo.StandardError.ReadToEndAsync()
    $processo.WaitForExit(); $codice = $processo.ExitCode
    $testo = $out.GetAwaiter().GetResult(); $errore = $err.GetAwaiter().GetResult(); $processo.Dispose()
    if ($codice -ne 0 -and -not ($VuotoOK -and $codice -eq 1)) {
        throw "Git fallito in $Dove ($($Argomenti[0]), uscita $codice): $errore"
    }
    return $testo.TrimEnd("`r", "`n")
}
function Percorso-Sicuro([string]$Base, [string]$Relativo) {
    if ([IO.Path]::IsPathRooted($Relativo) -or $Relativo -match '(^|/)\.\.(/|$)|[\x00-\x1f]') { throw "Percorso non sicuro: $Relativo" }
    $full = [IO.Path]::GetFullPath((Join-Path $Base $Relativo))
    if (-not $full.StartsWith($Base.TrimEnd('\', '/') + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) {
        throw "Percorso esterno alla destinazione: $Relativo"
    }
    $p = $full
    while ($p.Length -gt $Base.Length) {
        if ((Test-Path -LiteralPath $p) -and ((Get-Item -LiteralPath $p -Force).Attributes -band [IO.FileAttributes]::ReparsePoint)) {
            throw "Percorso con giunzione/link non consentito: $p"
        }
        $p = Split-Path -Parent $p
    }
    return $full
}
function Leggi-Albero([string]$Dove, [string]$Rif = 'HEAD', [string[]]$Percorsi = @()) {
    $raw = Git $Dove (@('ls-tree', '-r', '-z', '-l', $Rif, '--') + $Percorsi)
    foreach ($r in $raw.Split([char]0, [StringSplitOptions]::RemoveEmptyEntries)) {
        if ($r -notmatch '^(\d+) (blob|commit) ([0-9a-f]+)\s+(-|\d+)\t(.+)$') { throw "Voce Git non gestita: $r" }
        [pscustomobject]@{ Mode = $Matches[1]; Tipo = $Matches[2]; Oid = $Matches[3];
            Byte = $(if ($Matches[4] -eq '-') { 0L } else { [long]$Matches[4] }); Nome = $Matches[5] }
    }
}
function Disposizione([string]$Dove) {
    if (Test-Path -LiteralPath (Join-Path $Dove 'mobile/package.json')) {
        if (Test-Path -LiteralPath (Join-Path $Dove 'package.json')) { throw 'BLOCCO DISPOSIZIONE: entrambe le radici mobile presenti.' }
        return 'monorepo'
    }
    if (Test-Path -LiteralPath (Join-Path $Dove 'package.json')) { return 'mobile alla radice' }
    throw 'BLOCCO DISPOSIZIONE: package.json mobile assente.'
}
function Verifica-Provenienza([string]$Dove) {
    $visti = @{}
    for ($n = 0; $n -lt 8; $n++) {
        $origine = Git $Dove @('remote', 'get-url', 'origin')
        if ($origine -match '^(git@github\.com:Ninozzz95/talos(?:\.git)?|https://github\.com/Ninozzz95/talos(?:\.git)?/?|ssh://git@github\.com/Ninozzz95/talos(?:\.git)?)$') {
            Scrivi "OK PROVENIENZA: origin di $Dove identifica Ninozzz95/talos (sola lettura, nessun fetch)."; return
        }
        if (-not [IO.Path]::IsPathRooted($origine) -or -not (Test-Path -LiteralPath $origine)) { throw "BLOCCO PROVENIENZA: origin non riconosciuto: $origine" }
        $Dove = [IO.Path]::GetFullPath($origine)
        if ($visti.ContainsKey($Dove)) { throw 'BLOCCO PROVENIENZA: ciclo di cloni locali.' }
        $visti[$Dove] = $true
    }
    throw 'BLOCCO PROVENIENZA: catena locale troppo lunga.'
}
function Spie([string]$Dove) {
    $blocchi = 0
    foreach ($s in @(
        @{ Id = 'SERIAL'; Regex = '\b2ea6573c\b' },
        # 13/09, review: si cerca il percorso DELL'OWNER, non la forma «C:\Users\qualcuno»:
        # 19 file di test e fixture usano esempi (`C:\Users\esempio`) e la forma generica li
        # fermava tutti — stessa lezione dell'email in rilascia.ps1 («cercare la forma prende
        # le finte insieme alle vere, e chi legge impara a ignorarlo»). grep e' gia' -i.
        @{ Id = 'PERCORSO'; Regex = 'C:\\+Users\\+Antonino' },
        @{ Id = 'EMAIL'; Regex = 'ninozz[0-9]*@' }
    )) {
        # -a include anche file classificati binari; -l evita di stampare i dati.
        $nomi = @( (Git $Dove @('grep', '--cached', '-a', '-l', '-z', '-i', '-E', $s.Regex, '--') -VuotoOK).Split([char]0, [StringSplitOptions]::RemoveEmptyEntries) )
        Scrivi "$($s.Id): git -C '$Dove' grep --cached su TUTTO l'albero, $($nomi.Count) file."
        if ($nomi.Count) { $blocchi++; Scrivi "BLOCCO $($s.Id):"; $nomi | ForEach-Object { Scrivi "  $_" } }
    }
    return $blocchi
}
function Controlla-Copia([string]$Dove) {
    Verifica-Provenienza $Dove
    $up = Git $Dove @('rev-parse', '--abbrev-ref', '@{u}')
    if ($up -ne 'origin/main') { throw "BLOCCO UPSTREAM: atteso origin/main, trovato $up." }
    $base = Git $Dove @('rev-parse', 'origin/main'); $head = Git $Dove @('rev-parse', 'HEAD')
    $status = Git $Dove @('status', '--porcelain=v1', '--untracked-files=all')
    $statePath = Git $Dove @('rev-parse', '--path-format=absolute', '--git-path', 'r05b-preparazione.json')
    $ripresa = $false
    if (Test-Path -LiteralPath $statePath) {
        $s = Get-Content -LiteralPath $statePath -Raw | ConvertFrom-Json
        $ripresa = $s.versione -eq 1 -and $s.base -eq $base -and $s.head -eq $head -and
            $s.albero -eq (Git $Dove @('write-tree')) -and
            -not (Git $Dove @('diff', '--name-only')) -and
            -not (Git $Dove @('ls-files', '--others', '--exclude-standard'))
    }
    if ($status -and -not $ripresa) {
        $null = Spie $Dove
        Scrivi $status
        throw 'BLOCCO PULIZIA: modifiche non riconosciute; nessuna viene scartata.'
    }
    if ($head -ne $base -and -not $ripresa) { throw "BLOCCO ALLINEAMENTO: HEAD=$head, origin/main=$base. Nessun fetch automatico." }
    Scrivi "OK COPIA: git status e @{u} su $Dove; HEAD=$head; origin/main=$base; preparazione riconosciuta=$ripresa."
    return [pscustomobject]@{ Base = $base; Head = $head; Stato = $statePath; Ripresa = $ripresa; Status = $status }
}
function Riordina-Mobile([string]$Dove) {
    $vecchiModuli = [IO.File]::ReadAllBytes((Join-Path $Dove '.gitmodules'))
    $spostamenti = @((Git $Dove @('ls-tree', '--name-only', '-z', 'HEAD')).Split([char]0, [StringSplitOptions]::RemoveEmptyEntries) |
        Where-Object { $_ -notin $script:radice })
    $null = New-Item -ItemType Directory -Path (Join-Path $Dove 'mobile')
    foreach ($p in $spostamenti) {
        $null = Percorso-Sicuro $Dove $p; $null = Percorso-Sicuro $Dove "mobile/$p"
        $null = Git $Dove @('mv', '--', $p, "mobile/$p")
    }
    # git mv puo' aver aggiornato .gitmodules: il commit puro conserva il blob.
    [IO.File]::WriteAllBytes((Join-Path $Dove '.gitmodules'), $vecchiModuli)
    $null = Git $Dove @('add', '--', '.gitmodules')
    $raw = Git $Dove @('diff', '--cached', '--raw', '-M100%', '--abbrev=40')
    $righe = @($raw -split "`n" | Where-Object { $_ })
    if (-not $righe.Count) { throw 'BLOCCO R100: riordino vuoto.' }
    foreach ($r in $righe) {
        if ($r -notmatch '^:(\d+) (\d+) ([a-f0-9]+) ([a-f0-9]+) R100\t' -or $Matches[1] -ne $Matches[2] -or $Matches[3] -ne $Matches[4]) {
            throw "BLOCCO R100: mode/blob non identici: $r"
        }
    }
    Scrivi "OK R100: $($righe.Count) rinomine; zero byte e zero mode cambiati nell'indice di $Dove."
    $prova = Git $Dove @('rev-parse', '--path-format=absolute', '--git-path', 'r05b-rinomine.txt')
    [IO.File]::WriteAllText($prova, (Git $Dove @('diff', '--cached', '-M100%', '--stat')) + "`n" + $raw, [Text.UTF8Encoding]::new($false))
    return (Git $Dove @('write-tree'))
}
function Esporta-Snapshot([string]$Dove, [string]$Export, [object[]]$File) {
    $destinati = @{}
    foreach ($f in $File) {
        $nome = switch ($f.Nome) { 'README-MONOREPO.md' { 'README.md' }; '.gitignore-pubblico' { '.gitignore' }; default { $f.Nome } }
        $destinati[$nome] = $f
    }
    foreach ($f in @(Leggi-Albero $Dove (Git $Dove @('write-tree')))) {
        if (($f.Nome -match '^(harness-ui|context-engine|\.github)/' -or $f.Nome -in $script:gestiti) -and -not $destinati.ContainsKey($f.Nome)) {
            $null = Percorso-Sicuro $Dove $f.Nome
            Scrivi "SNAPSHOT rimosso nella sola copia: $($f.Nome)"
            $null = Git $Dove @('rm', '-f', '--', $f.Nome)
        }
    }
    foreach ($nome in $destinati.Keys) {
        $f = $destinati[$nome]; $dest = Percorso-Sicuro $Dove $nome
        $null = New-Item -ItemType Directory -Force -Path (Split-Path -Parent $dest)
        [IO.File]::Copy((Join-Path $Export $f.Nome), $dest, $true)
    }
    # Stage solo le radici gestite, mai mobile, CHANGELOG o documenti conservati.
    $null = Git $Dove (@('add', '-f', '-A', '--', 'harness-ui', 'context-engine', '.github') + $script:gestiti)
    foreach ($nome in $destinati.Keys) {
        if ($destinati[$nome].Mode -eq '100755') { $null = Git $Dove @('update-index', '--chmod=+x', '--', $nome) }
    }
    $mod = Join-Path $Dove '.gitmodules'
    $testo = [IO.File]::ReadAllText($mod)
    $testo = [regex]::Replace($testo, '(?m)^([\t ]*path[\t ]*=[\t ]*)([^\r\n]+)', {
        param($m)
        $valore = $m.Groups[2].Value.Trim()
        if (-not $valore.StartsWith('mobile/')) { $valore = 'mobile/' + $valore }
        return $m.Groups[1].Value + $valore
    })
    [IO.File]::WriteAllText($mod, $testo, [Text.UTF8Encoding]::new($false))
    $null = Git $Dove @('add', '--', '.gitmodules')
}
function Verifica-Immagini([string]$Dove, [string]$Readme, [hashtable]$Tracciati) {
    $p = Join-Path $Dove $Readme
    if (-not (Test-Path -LiteralPath $p)) { Scrivi "BLOCCO IMMAGINI: README assente: $Readme"; return 1 }
    $s = [IO.File]::ReadAllText($p)
    $url = [Collections.Generic.List[string]]::new()
    foreach ($m in [regex]::Matches($s, '(?i)(?:src|srcset)\s*=\s*["'']([^"'']+)["'']')) {
        foreach ($u in $m.Groups[1].Value.Split(',')) { $url.Add(($u.Trim() -split '\s+')[0]) }
    }
    foreach ($m in [regex]::Matches($s, '!\[[^\]]*\]\(\s*<?([^\s)>]+)')) { $url.Add($m.Groups[1].Value) }
    $defs = @{}
    foreach ($m in [regex]::Matches($s, '(?m)^\s*\[([^\]]+)\]:\s*<?([^\s>]+)')) { $defs[$m.Groups[1].Value] = $m.Groups[2].Value }
    foreach ($m in [regex]::Matches($s, '!\[([^\]]*)\]\[([^\]]*)\]')) {
        $key = $m.Groups[2].Value; if (-not $key) { $key = $m.Groups[1].Value }
        if ($defs.ContainsKey($key)) { $url.Add($defs[$key]) } else { Scrivi "BLOCCO IMMAGINI: riferimento [$key] non definito in $Readme"; return 1 }
    }
    $errori = 0; $locali = 0
    foreach ($u in @($url | Sort-Object -Unique)) {
        if ($u -match '^(https?://|data:|//|#)') { continue }
        $locali++
        $rel = [Uri]::UnescapeDataString(($u -split '[?#]')[0])
        $baseReadme = Split-Path -Parent $p
        $full = [IO.Path]::GetFullPath((Join-Path $baseReadme $rel))
        $relRepo = [IO.Path]::GetRelativePath($Dove, $full).Replace('\', '/')
        if (-not $Tracciati.ContainsKey($relRepo) -or -not (Test-Path -LiteralPath $full -PathType Leaf)) {
            Scrivi "BLOCCO IMMAGINI: $Readme -> $u non presente nel tracciato di $Dove"; $errori++
        }
    }
    Scrivi "IMMAGINI: $Readme, $locali riferimenti locali controllati nella copia; $errori assenti."
    return $errori
}
function Cancelli([string]$Dove, [string]$Base) {
    $errori = Spie $Dove
    $tree = Git $Dove @('write-tree'); $files = @(Leggi-Albero $Dove $tree); $tracciati = @{}
    foreach ($f in $files) { $tracciati[$f.Nome] = $true }
    # 13/09, review: i blob GIA' pubblici in origin/main (la mobile rilasciata, anche dopo la
    # rinomina in mobile/: stesso blob) non si giudicano di nuovo qui — i cancelli di percorso e
    # di parole valgono per cio' che ENTRA. Misurato: il primo giro bloccava
    # mobile/android/app/src/main/assets/talos-harness-ui/kernel/dist/kernelPerIlBanco.js,
    # pubblico da settimane. Le spie (serial, percorsi, email) restano su tutto l'albero.
    $esistenti = @{}; $oidDi = @{}
    foreach ($f in @(Leggi-Albero $Dove $Base)) { $esistenti[$f.Oid] = $true }
    foreach ($f in $files) { $oidDi[$f.Nome] = $f.Oid }
    foreach ($f in $files | Where-Object { -not $esistenti.ContainsKey($_.Oid) -and (($_.Nome -match $script:vietati -and $_.Nome -notin $script:ammessi) -or $_.Mode -eq '120000') }) {
        Scrivi "BLOCCO PERCORSI: $($f.Nome) (mode $($f.Mode))"; $errori++
    }
    Scrivi "PERCORSI: tutti i $($files.Count) elementi dell'indice della copia (ammessi esplicitamente: $($script:ammessi -join ', '))."
    # 13/09, review: 4174 e' la PORTA PREDEFINITA del prodotto (harness-ui/src/config.mjs), non un
    # dato personale: si conta e si dichiara, non blocca. Cio' che non deve uscire (percorsi,
    # email, serial) lo cercano le spie sopra.
    $porte = @((Git $Dove @('grep', '--cached', '-a', '-l', '-z', '4174', '--', 'harness-ui') -VuotoOK).Split([char]0, [StringSplitOptions]::RemoveEmptyEntries))
    $testPorta = @($porte | Where-Object { $_ -match '^harness-ui/(tests/|frontend/tests/)' })
    Scrivi "PORTA: 4174 citata in $($porte.Count) file di harness-ui ($($testPorta.Count) nei test), porta predefinita del prodotto: conteggio non bloccante."
    # 13/09, review: una parola che origin/main contiene GIA' non puo' «trapelare» — misurato:
    # `TALOS-BANCO` sta in 13 file pubblici e `aider` in 6 (il kernel e i sorgenti harness-ui
    # dentro gli asset dell'APK rilasciato). Quelle si contano e si dichiarano; bloccano solo le
    # parole che il pubblico non ha mai visto. L'elenco si ricalcola a ogni giro sul Base vero.
    $giaPubbliche = @(); $ancoraSegrete = @()
    foreach ($parola in ($script:ricerca -split '\|')) {
        $hit = Git $Dove @('grep', '-a', '-l', '-i', '-E', $parola, $Base, '--') -VuotoOK
        if ($hit) { $giaPubbliche += $parola } else { $ancoraSegrete += $parola }
    }
    Scrivi "RICERCA: parole gia' in origin/main, non bloccanti: $(if ($giaPubbliche) { $giaPubbliche -join ', ' } else { 'nessuna' }); parole mai pubblicate, bloccanti: $($ancoraSegrete -join ', ')."
    $regexRicerca = $ancoraSegrete -join '|'
    if (-not $regexRicerca) { $regexRicerca = '(?!x)x' }
    $parole = @((Git $Dove @('grep', '--cached', '-a', '-l', '-z', '-i', '-E', $regexRicerca, '--') -VuotoOK).Split([char]0, [StringSplitOptions]::RemoveEmptyEntries) |
        Where-Object { $_ -match '\.(ts|tsx|js|mjs|kt|java|md)$' -and
            ($_ -match '^(mobile/(src|tests|docs|android/app/src/main/java)/|harness-ui/(src|frontend/src|desktop|tests)/|context-engine/src/)' -or $_ -match '(^|/)(README|CHANGELOG)\.md$') -and
            $_ -notmatch '(^|/)(vendor|third_party|upstream|node_modules)/' })
    $parole = @($parole | Where-Object { -not ($oidDi.ContainsKey($_) -and $esistenti.ContainsKey($oidDi[$_])) })
    foreach ($p in $parole) { Scrivi "BLOCCO RICERCA: $p"; $errori++ }
    Scrivi "RICERCA: file nostri mobile src/tests/docs/Java, README/CHANGELOG, desktop src/frontend/src/desktop/tests e context-engine/src: $($parole.Count) file."
    $owner = Git $Dove @('grep', '--cached', '-a', '-i', '-c', '-E', 'Antonino|Ninozzz95', '--') -VuotoOK
    $righeOwner = 0
    foreach ($r in ($owner -split "`n")) { if ($r -match ':(\d+)$') { $righeOwner += [int]$Matches[1] } }
    Scrivi "OWNER: $righeOwner righe con Antonino o Ninozzz95 nel tracciato completo, conteggio non bloccante."
    foreach ($f in $files | Where-Object { $_.Byte -gt 5MB }) {
        if ($esistenti.ContainsKey($f.Oid)) { Scrivi "PESO ESISTENTE: $($f.Nome), $($f.Byte) byte (blob gia' in origin/main)." }
        else { Scrivi "BLOCCO PESO: $($f.Nome), $($f.Byte) byte, nuovo blob sopra 5 MiB."; $errori++ }
    }
    Scrivi "PESO: dimensione di ogni blob staged confrontata con origin/main=$Base."
    $errori += Verifica-Immagini $Dove 'README.md' $tracciati
    $errori += Verifica-Immagini $Dove 'mobile/README.md' $tracciati
    $hash = (Get-FileHash -LiteralPath (Join-Path $Dove 'LICENSE') -Algorithm SHA256).Hash.ToLowerInvariant()
    if ($hash -ne $script:licenza) { Scrivi "BLOCCO LICENZA: SHA256 LICENSE=$hash"; $errori++ }
    else { Scrivi "OK LICENZA: LICENSE della copia, SHA256=$hash." }
    $moduli = Git $Dove @('config', '-f', '.gitmodules', '--get-regexp', '^submodule\..*\.path$')
    $paths = @($moduli -split "`n" | ForEach-Object { ($_ -split ' ', 2)[1] })
    foreach ($f in $files | Where-Object { $_.Mode -eq '160000' }) {
        if ($f.Nome -notin $paths) { Scrivi "BLOCCO SOTTOMODULI: $($f.Nome) senza path in .gitmodules"; $errori++ }
    }
    foreach ($path in $paths) {
        if (-not @($files | Where-Object { $_.Mode -eq '160000' -and $_.Nome -eq $path }).Count) {
            Scrivi "BLOCCO SOTTOMODULI: $path non corrisponde a un gitlink"; $errori++
        }
    }
    Scrivi "SOTTOMODULI: $($paths.Count) path della copia verificati contro i gitlink; nessun download."
    return $errori
}
function Riepilogo([string]$Dove, [string]$Base, [object[]]$Esportati) {
    $tree = Git $Dove @('write-tree'); $files = @(Leggi-Albero $Dove $tree)
    foreach ($g in $files | Group-Object { if ($_.Nome.Contains('/')) { $_.Nome.Split('/')[0] } else { '(radice)' } } | Sort-Object Name) {
        $byte = ($g.Group | Measure-Object Byte -Sum).Sum
        Scrivi "ALBERO $($g.Name): $($g.Count) elementi, $byte byte."
    }
    foreach ($g in $Esportati | Group-Object { if ($_.Nome.Contains('/')) { $_.Nome.Split('/')[0] } else { '(radice)' } } | Sort-Object Name) {
        Scrivi "ESPORTATI $($g.Name): $($g.Count) file, $(($g.Group | Measure-Object Byte -Sum).Sum) byte da HEAD."
    }
    $stat = Git $Dove @('diff', '-M100%', '--stat', $Base)
    $p = Git $Dove @('rev-parse', '--path-format=absolute', '--git-path', 'r05b-diff-stat.txt')
    [IO.File]::WriteAllText($p, $stat, [Text.UTF8Encoding]::new($false))
    Scrivi "DIFF: git -C '$Dove' diff -M100% --stat origin/main; dettaglio completo: $p"
    Scrivi (($stat -split "`n")[-1])
}

try {
    $Repo = [IO.Path]::GetFullPath($Repo).TrimEnd('\', '/')
    $Copia = [IO.Path]::GetFullPath($Copia).TrimEnd('\', '/')
    if ($Repo -eq $Copia -or $Copia.StartsWith("$Repo\", [StringComparison]::OrdinalIgnoreCase) -or $Repo.StartsWith("$Copia\", [StringComparison]::OrdinalIgnoreCase)) {
        throw 'BLOCCO DESTINAZIONE: sorgente e copia devono essere repository separati, non annidati.'
    }
    foreach ($p in @($Repo, $Copia)) {
        if ((Git $p @('rev-parse', '--show-toplevel')).Replace('/', '\') -ine $p.Replace('/', '\')) { throw "BLOCCO DESTINAZIONE: $p non e' la radice Git." }
        $null = Percorso-Sicuro (Split-Path -Parent $p) (Split-Path -Leaf $p)
    }
    if (-not (Test-Path -LiteralPath $script:tar)) { throw 'tar.exe di Windows assente; non usare tar di Git Bash.' }
    $stato = Controlla-Copia $Copia
    $layout = Disposizione $Copia; Scrivi "DISPOSIZIONE: $layout."
    if ($layout -eq 'mobile alla radice' -and -not $Riordina) { throw 'BLOCCO RIORDINO: occorre -Riordina per la prima migrazione.' }
    $headRepo = Git $Repo @('rev-parse', 'HEAD')
    $selezionati = @(Leggi-Albero $Repo 'HEAD' $script:inclusioni)
    foreach ($p in $script:inclusioni) {
        if (-not @($selezionati | Where-Object { $_.Nome -eq $p -or $_.Nome.StartsWith("$p/") }).Count) {
            throw "BLOCCO SORGENTE: $p assente da HEAD=$headRepo. I file di lavoro non vengono esportati; far registrare il commit all'owner."
        }
    }
    foreach ($f in $selezionati) {
        $null = Percorso-Sicuro $Repo $f.Nome
        if ($f.Mode -notin @('100644', '100755')) { throw "BLOCCO SORGENTE: tipo non esportabile $($f.Mode), $($f.Nome)." }
    }
    Scrivi "SORGENTE: git archive HEAD=$headRepo -- inclusioni esplicite, $($selezionati.Count) file; mobile privata mai letta."
    $banco = Join-Path ([IO.Path]::GetTempPath()) ('r05b-candidato-' + [Guid]::NewGuid().ToString('N'))
    $null = New-Item -ItemType Directory -Path $banco
    $candidato = Join-Path $banco 'copia'; $export = Join-Path $banco 'export'
    $null = New-Item -ItemType Directory -Path $export
    Scrivi "CANDIDATO: $candidato"
    $null = Git $Copia @('clone', '--no-hardlinks', '--no-checkout', '--', $Copia, $candidato)
    $null = Git $candidato @('config', 'core.autocrlf', 'false')
    $null = Git $candidato @('config', 'core.hooksPath', '.git/r05b-no-hooks')
    $null = Git $candidato @('checkout', '--detach', $stato.Head)
    $null = Git $candidato @('update-ref', 'refs/remotes/origin/main', $stato.Base)
    if ($layout -eq 'mobile alla radice') { $null = Riordina-Mobile $candidato }
    $archivio = Join-Path $banco 'privato.tar'
    $null = Git $Repo (@('archive', '--format=tar', '-o', $archivio, 'HEAD', '--') + $script:inclusioni)
    & $script:tar -xf $archivio -C $export
    if ($LASTEXITCODE -ne 0) { throw 'Estrazione tar.exe di Windows fallita.' }
    foreach ($f in $selezionati) {
        if (-not (Test-Path -LiteralPath (Join-Path $export $f.Nome) -PathType Leaf)) { throw "BLOCCO ARCHIVE: $($f.Nome) non estratto (export-ignore?)." }
    }
    Esporta-Snapshot $candidato $export $selezionati
    $errori = Cancelli $candidato $stato.Base
    Riepilogo $candidato $stato.Base $selezionati
    if ($errori) { throw "BLOCCO PUBBLICAZIONE: $errori rilievi. Copia intatta; candidato e prove conservati in $banco. Nessun commit." }
    Scrivi 'OK CANCELLI: intero candidato verificato.'
    if (-not $Esegui) { Scrivi 'GUARDA E BASTA: Repo e Copia intatti; anteprima costruita soltanto in Temp.'; exit 0 }
    # Secondo controllo: nessuna modifica concorrente viene coperta dal risultato.
    $ora = Controlla-Copia $Copia
    if ($ora.Head -ne $stato.Head -or $ora.Status -cne $stato.Status) { throw 'BLOCCO CONCORRENZA: la copia e cambiata durante i cancelli.' }
    if ($headRepo -ne (Git $Repo @('rev-parse', 'HEAD'))) { throw 'BLOCCO CONCORRENZA: HEAD sorgente cambiato.' }
    $treeCandidato = Git $candidato @('write-tree')
    if ($stato.Ripresa -and (Git $Copia @('write-tree')) -eq $treeCandidato) {
        Scrivi 'IDEMPOTENZA: stesso albero preparato; zero modifiche e zero commit.'
    } else {
        if ($layout -eq 'mobile alla radice') {
            $null = Riordina-Mobile $Copia
            # Unico commit automatico; nessun hook di terze parti, firma o rete.
            $null = Git $Copia @('-c', 'core.hooksPath=.git/r05b-no-hooks', '-c', 'commit.gpgSign=false', 'commit', '-m', 'riordino: la app mobile in mobile/, in vista del monorepo')
            Scrivi (Git $Copia @('diff', '-M100%', '--shortstat', 'HEAD~1', 'HEAD'))
            Scrivi 'COMMIT RIORDINO: creato dopo i cancelli; .gitmodules aggiornato nel secondo commit da approvare.'
        }
        Esporta-Snapshot $Copia $export $selezionati
        if ((Git $Copia @('write-tree')) -ne $treeCandidato) { throw 'BLOCCO CONFRONTO: indice destinazione diverso dal candidato verificato; nessun commit desktop.' }
    }
    $nuovoStato = @{ versione = 1; base = $stato.Base; head = (Git $Copia @('rev-parse', 'HEAD')); sorgente = $headRepo; albero = $treeCandidato }
    [IO.File]::WriteAllText($stato.Stato, ($nuovoStato | ConvertTo-Json), [Text.UTF8Encoding]::new($false))
    $messaggio = Git $Copia @('rev-parse', '--path-format=absolute', '--git-path', 'R05B-COMMIT-DESKTOP.txt')
    [IO.File]::WriteAllText($messaggio, "pubblico: TALOS desktop e radice del monorepo AGPL-3.0-only`n`nAggiunge harness-ui e context-engine dai sorgenti tracciati, la guida ai due prodotti e i workflow comuni. Aggiorna i path dei sottomoduli mobile; conserva storia, tag e contenuti mobile rilasciati.`n", [Text.UTF8Encoding]::new($false))
    $qc = "'" + $Copia.Replace("'", "''") + "'"; $qm = "'" + $messaggio.Replace("'", "''") + "'"
    Scrivi 'COMANDI DA REVISIONARE E LANCIARE A MANO (mai eseguiti dallo script):'
    Scrivi "git -C $qc commit --file $qm"
    Scrivi "git -C $qc push"
} catch {
    Scrivi $_.Exception.Message
    exit 1
} finally {
    Scrivi "DURATA: $($tempo.ElapsedMilliseconds) ms."
}
