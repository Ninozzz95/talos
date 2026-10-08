/*
 * Ticket C-005, terzo giro (08/10/2026): un glob sul NOME di un segreto passava, fuori da una cartella segreta.
 * Segnalato dal bugfixer del desktop, riprodotto qui su una shell vera: `cat .e?v`, `cat .en*`, `cat ./.e*v`, `cat .en[v]`,
 * `cat .en{v,}`, `cat cert.p?m` stampano `.env` / `cert.pem` e TALOS non chiedeva, perché `eNomeSegreto` leggeva il pezzo come
 * TESTO (`.e?v` non finisce con `.pem`, non è `.env`). Era il difetto che la ricerca di giugno 2026 chiama GuardFall: l'agente
 * ispeziona il testo, la shell espande DOPO.
 *
 * La cura espande il glob come fa la shell, sui file veri della cartella di lavoro, e guarda i nomi che combaciano. Qui il disco
 * è finto (`elenca`) perché ogni caso sia deterministico su ogni sistema; GL-14 usa il disco vero.
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { motivoDaChiedere, TETTI_GLOB_SEGRETI } from '../src/path-policy.mjs'
import { rimuoviCartellaDiProva } from './aiuto/rimuovi-cartella-di-prova.mjs'

const CARTELLA = process.platform === 'win32' ? 'C:\\lavoro\\progetto' : '/lavoro/progetto'
const HOME = process.platform === 'win32' ? 'C:\\Users\\prova' : '/home/prova'
const radice = CARTELLA.replace(/\\/g, '/')

/* Il disco finto: cartella -> nomi. Una cartella assente risponde ENOENT, come il disco vero. */
const fabbricaElenca = (albero, chiamate = []) => (cartella) => {
    const chiave = String(cartella).replace(/\\/g, '/')
    chiamate.push(chiave)
    if (chiave in albero) {
        const voce = albero[chiave]
        return voce instanceof Error ? { errore: voce.code } : { nomi: voce }
    }
    return { errore: 'ENOENT' }
}
const CON_SEGRETI = {
    [radice]: ['.env', '.git', 'README.md', 'src', 'cert.pem', 'id_rsa', 'id_rsa.pub', '.npmrc', '.ssh', 'package.json'],
    [radice + '/src']: ['index.ts', 'util.ts'],
    [radice + '/.ssh']: ['id_ed25519', 'known_hosts'],
}
const PULITO = {
    [radice]: ['README.md', 'src', 'package.json', 'notes.txt', '.gitignore'],
    [radice + '/src']: ['index.ts', 'util.ts', 'style.css'],
}
const chiede = (comando, { albero = CON_SEGRETI, puntiNascosti = false, chiamate } = {}) =>
    motivoDaChiedere({ tipo: 'shell', comando, cartella: CARTELLA, home: HOME, elenca: fabbricaElenca(albero, chiamate), puntiNascosti })
const nome = (risposta) => (risposta ? risposta.percorso.replace(/\\/g, '/') : null)

test('GL-1: i glob del bugfixer, uno per uno, chiedono e nominano il file vero', () => {
    const attesi = [
        ['cat .e?v', '.env'], ['cat .en[v]', '.env'], ['cat .en*', '.env'], ['cat ./.e*v', './.env'],
        ['cat cert.p?m', 'cert.pem'], ['cat cert.p*', 'cert.pem'], ['cat cert.[p]em', 'cert.pem'],
        ['cat id_r?a', 'id_rsa'], ['cat id_rs[a]', 'id_rsa'], ['cat .npm?c', '.npmrc'], ['cat .git-cred*', null],
        /* una stella in coda combacia anche con zero lettere: il nome intero è già consumato quando si arriva alla stella */
        ['cat .env*', '.env'], ['cat cert.pem*', 'cert.pem'], ['cat .npmrc**', '.npmrc'],
    ]
    for (const [comando, atteso] of attesi) {
        const risposta = chiede(comando)
        if (atteso === null) { assert.equal(risposta, null, `${comando}: nessun file combacia, nessuna domanda`); continue }
        assert.ok(risposta, `${comando}: deve chiedere`)
        assert.equal(risposta.classe, 'segreto', comando)
        assert.equal(nome(risposta), atteso, `${comando}: il percorso è il file che la shell leggerebbe`)
    }
})

test('GL-2: le graffe non vogliono il disco: `.en{v,}` è `.env` per la shell, ma la virgola spezzava il pezzo', () => {
    const chiamate = []
    const risposta = chiede('cat .en{v,}', { albero: PULITO, chiamate })
    assert.ok(risposta, 'chiede anche in una cartella dove .env NON esiste: la shell stampa il nome scritto')
    assert.equal(nome(risposta), '.env')
    assert.deepEqual(chiamate, [], 'nessuna lettura del disco per un nome letterale')
    assert.equal(nome(chiede('cat cert.{pem,txt}', { albero: PULITO })), 'cert.pem')
    assert.equal(chiede('cat notes.{txt,md}', { albero: PULITO }), null)
})

test('GL-3: la regola del punto iniziale: in una shell POSIX `*` non prende `.env`, in cmd e PowerShell sì', () => {
    const SOLO_PUNTO = { [radice]: ['.env', 'README.md', 'src'] }
    assert.equal(chiede('cat *', { albero: SOLO_PUNTO, puntiNascosti: false }), null)
    assert.equal(chiede('cat ?env', { albero: SOLO_PUNTO, puntiNascosti: false }), null)
    assert.equal(nome(chiede('cat *', { albero: SOLO_PUNTO, puntiNascosti: true })), '.env')
    assert.equal(nome(chiede('cat ?env', { albero: SOLO_PUNTO, puntiNascosti: true })), '.env')
    /* il punto scritto prende sempre il file nascosto */
    assert.equal(nome(chiede('cat .*', { albero: SOLO_PUNTO, puntiNascosti: false })), '.env')
})

test('GL-4: un glob in una CARTELLA: `.s?h/id_*` e `*/.env`', () => {
    assert.equal(nome(chiede('cat .s?h/id_*')), '.ssh/id_ed25519')
    const ANNIDATO = { [radice]: ['pacchetto', 'README.md'], [radice + '/pacchetto']: ['.env', 'index.js'] }
    // un glob in una cartella con `.env` scritto per intero in fondo chiedeva già prima: resta una domanda, con il pezzo come scritto
    assert.equal(chiede('cat */.env', { albero: ANNIDATO })?.classe, 'segreto')
    assert.equal(nome(chiede('cat */.en?', { albero: ANNIDATO })), 'pacchetto/.env', 'qui il nome finale è un glob e serve il disco')
    assert.equal(chiede('cat */index.js', { albero: ANNIDATO }), null)
})

test('GL-5: gli stessi comandi in una cartella senza segreti non fanno nessuna domanda', () => {
    for (const comando of ['ls *', 'cat *.md', 'cat src/*.ts', 'wc -l src/*', 'cat README.m?', 'cat [Rr]EADME*', 'rm src/*.css', 'git add -- src/*.ts', 'grep -rn "TODO.*" src']) {
        assert.equal(chiede(comando, { albero: PULITO }), null, comando)
        assert.equal(chiede(comando, { albero: PULITO, puntiNascosti: true }), null, `${comando} (punti nascosti)`)
    }
})

test('GL-6: il glob extglob: `@(a|b)`, `?(x)`, `+(x)`, `*(x)`', () => {
    assert.equal(nome(chiede('cat .e@(nv|xx)')), '.env')
    assert.equal(nome(chiede('cat .en+(v)')), '.env')
    assert.equal(chiede('cat .env?(x)')?.classe, 'segreto', 'chiedeva già prima (il nome finale è `.env` più un carattere di pattern)')
    assert.equal(nome(chiede('cat .en*(v)')), '.env')
    assert.equal(nome(chiede('cat cert.p@(em|fx)')), 'cert.pem')
    assert.equal(chiede('cat READ@(ME|YOU).md', { albero: PULITO }), null)
})

test('GL-7: la chiave pubblica è esente anche attraverso un glob; la privata no', () => {
    const SOLO_PUBBLICA = { [radice]: ['id_rsa.pub', 'README.md'] }
    assert.equal(chiede('cat id_*', { albero: SOLO_PUBBLICA }), null)
    assert.equal(chiede('cat *.pub', { albero: SOLO_PUBBLICA }), null)
    assert.equal(chiede('cat id_r?a.p[u]b', { albero: SOLO_PUBBLICA }), null)
    assert.equal(nome(chiede('cat id_*')), 'id_rsa', 'con la privata accanto, chiede per quella')
})

test('GL-8: maiuscole e minuscole: il pattern `.EN*` prende `.env` (conservativo: chiede di più, mai di meno)', () => {
    assert.equal(nome(chiede('cat .EN*')), '.env')
    assert.equal(nome(chiede('type CERT.P?M')), 'cert.pem')
})

test('GL-9: il pezzo tra virgolette è comunque un glob per PowerShell: lo si guarda lo stesso', () => {
    assert.equal(nome(chiede('Get-Content ".en*"')), '.env')
    assert.equal(nome(chiede("Get-Content '.e?v'")), '.env')
    assert.equal(nome(chiede('cat --file=.en*')), '.env')
})

test('GL-10: il nome che la shell leggerebbe è quello della domanda, così «consenti per la sessione» vale per `.env` e per `.en*`', () => {
    const per_glob = chiede('cat .en*')
    const per_nome = chiede('cat .env')
    assert.equal(nome(per_glob), nome(per_nome))
})

test('GL-11: i limiti: troppe cartelle, o una cartella illeggibile, chiedono per prudenza; ENOENT non chiede', () => {
    const ILLEGGIBILE = { [radice]: ['a', 'b'], [radice + '/a']: Object.assign(new Error('x'), { code: 'EACCES' }) }
    const r = chiede('cat */x*', { albero: ILLEGGIBILE })
    assert.ok(r, 'una cartella che non si legge non è una prova che sia vuota')
    assert.equal(r.classe, 'segreto')
    const MANCANTE = { [radice]: ['a', 'b'] }
    assert.equal(chiede('cat */x*', { albero: MANCANTE }), null, 'a e b non sono cartelle (ENOENT/ENOTDIR): il glob non combacia con niente')
    const molte = Array.from({ length: TETTI_GLOB_SEGRETI.cartelle + 20 }, (_, i) => `d${i}`)
    const FITTO = { [radice]: molte }
    for (const d of molte) FITTO[radice + '/' + d] = ['f.txt']
    const r2 = chiede('cat */*/*', { albero: FITTO })
    assert.ok(r2, 'oltre il tetto di cartelle da aprire il pattern non si può dichiarare innocuo')
})

test('GL-12: leggi e elenca sono percorsi LETTERALI (nessuna shell li espande): non si legge il disco e non si chiede', () => {
    const chiamate = []
    const elenca = fabbricaElenca(CON_SEGRETI, chiamate)
    assert.equal(motivoDaChiedere({ tipo: 'leggi', percorso: '.e?v', cartella: CARTELLA, home: HOME, elenca, puntiNascosti: true }), null)
    assert.equal(motivoDaChiedere({ tipo: 'elenca', percorso: '.en*', cartella: CARTELLA, home: HOME, elenca, puntiNascosti: true }), null)
    assert.deepEqual(chiamate, [])
})

test('GL-13: senza una cartella un pezzo relativo non si può espandere (il comportamento di prima), ma uno assoluto o con ~ sì', () => {
    const chiamate = []
    const casa = HOME.replace(/\\/g, '/')
    const elenca = fabbricaElenca({ [casa]: ['.ssh', 'Documenti'], [casa + '/.ssh']: ['id_ed25519'] }, chiamate)
    assert.equal(motivoDaChiedere({ tipo: 'shell', comando: 'cat .e?v', home: HOME, elenca }), null)
    const r = motivoDaChiedere({ tipo: 'shell', comando: 'cat ~/.ss?/id_*', cartella: CARTELLA, home: HOME, elenca })
    assert.ok(r)
    assert.match(nome(r), /\.ssh\/id_ed25519$/u)
})

test('GL-13b: un percorso assoluto che parte dalla radice si espande dalla radice, non dalla cartella di lavoro', () => {
    const elenca = fabbricaElenca({ '/srv': ['.ssh', 'sito'], '/srv/.ssh': ['id_rsa', 'known_hosts'] })
    const r = motivoDaChiedere({ tipo: 'shell', comando: 'cat /srv/.s?h/id_*', cartella: CARTELLA, home: HOME, elenca, puntiNascosti: false })
    assert.ok(r)
    assert.equal(nome(r), '/srv/.ssh/id_rsa')
    assert.equal(motivoDaChiedere({ tipo: 'shell', comando: 'cat /srv/s?to/*', cartella: CARTELLA, home: HOME, elenca, puntiNascosti: false }), null)
})

test('GL-14: sul disco vero: un file `.env` nella cartella di lavoro, `cat .e?v` chiede e `cat *.md` no', () => {
    const cartella = mkdtempSync(join(tmpdir(), 'talos-gl14-'))
    try {
        writeFileSync(join(cartella, '.env'), 'CANARINO=non-un-segreto\n')
        writeFileSync(join(cartella, 'note.md'), '# note\n')
        const reale = (comando, puntiNascosti = false) => motivoDaChiedere({ tipo: 'shell', comando, cartella, home: HOME, puntiNascosti })
        assert.equal(nome(reale('cat .e?v')), '.env')
        assert.equal(nome(reale('cat .en[v]')), '.env')
        assert.equal(reale('cat *.md'), null)
        assert.equal(reale('cat *'), null, 'POSIX: la stella non prende il file col punto')
        assert.equal(nome(reale('type *', true)), '.env', 'cmd/PowerShell: la stella prende anche il file col punto')
    } finally { rimuoviCartellaDiProva(cartella) }
})

test('GL-15: `?` è UN carattere e non zero o molti; `@(x)` è obbligatorio, `?(x)` no', () => {
    assert.equal(chiede('cat .e?'), null, '`.e?` sono tre lettere: nessun file')
    assert.equal(nome(chiede('cat .e??')), '.env')
    assert.equal(chiede('cat .e???'), null, '`.e???` sono cinque lettere: nessun file')
    assert.equal(chiede('cat .env?'), null, '`.env?` vuole una quinta lettera')
    assert.equal(chiede('cat cert.p@(x)em'), null, '`@(x)` vuole una x')
    assert.equal(nome(chiede('cat cert.p?(x)em')), 'cert.pem', '`?(x)` ammette zero x')
    assert.equal(nome(chiede('cat cert.p*(x)em')), 'cert.pem')
})

test('GL-16: un pattern fatto per bloccare una espressione regolare non blocca il controllo (algoritmo a due puntatori)', () => {
    const lungo = 'a'.repeat(250)
    const A = { [radice]: [lungo, lungo + 'b', 'README.md'] }
    const inizio = performance.now()
    assert.equal(chiede('cat *a*a*a*a*a*a*a*a*a*a*a*c', { albero: A }), null)
    assert.equal(chiede('cat *a*a*a*a*a*a*a*a*a*a*a*b', { albero: A }), null, 'combacia, ma non è un segreto')
    const solo = performance.now() - inizio
    assert.ok(solo < 500, `${solo} ms`)
    const E = { [radice]: ['a'.repeat(240) + '.pem'] }
    assert.equal(nome(chiede('cat *a*a*a*a*a*a*a*a*.p?m', { albero: E })), 'a'.repeat(240) + '.pem')
})

test('GL-17: una cartella grande non fa chiedere: `rm *.log` con migliaia di file e nessun segreto non apre nessuna domanda', () => {
    const file = Array.from({ length: 3000 }, (_, i) => `f${i}.log`)
    assert.equal(chiede('rm *.log', { albero: { [radice]: file } }), null)
    assert.equal(chiede('rm f1*.log', { albero: { [radice]: file }, puntiNascosti: true }), null)
})

test('GL-18: oltre il tetto di nomi da esaminare, chiede per prudenza', () => {
    const tanti = Array.from({ length: TETTI_GLOB_SEGRETI.nomi + 100 }, (_, i) => `n${i}`)
    const r = chiede('cat n*', { albero: { [radice]: tanti } })
    assert.ok(r)
    assert.equal(r.percorso, 'n*')
})

test('GL-19: il corpo di un heredoc è testo, non un comando: gli asterischi lì dentro non aprono cartelle (Windows: la stella prende `.env`)', () => {
    const python = "python - <<'PY'\nfrom modulo import *\ndef f(*args, **kw): return args\nPY"
    assert.equal(chiede(python, { puntiNascosti: true }), null)
    const readme = 'cat > README.md <<EOF\n* una voce\n* una seconda voce\nEOF'
    assert.equal(chiede(readme, { puntiNascosti: true }), null)
    /* ma: se alimenta una shell il corpo è un programma, e se espande `$(..)` si esegue */
    assert.equal(nome(chiede("bash <<'X'\ncat .e?v\nX")), '.env')
    assert.equal(nome(chiede('cat <<EOF\n$(cat .e?v)\nEOF')), '.env')
    assert.equal(nome(chiede('cat <<EOF\n`cat .e?v`\nEOF')), '.env')
    /* un heredoc che non si chiude non si tocca */
    assert.equal(nome(chiede("python - <<'PY'\ncat .e?v")), '.env')
    /* e la riga dopo il delimitatore torna a essere un comando */
    assert.equal(nome(chiede("python - <<'PY'\nx = 1\nPY\ncat .e?v")), '.env')
})

test('GL-22: se il passo dei glob si rompe per un motivo imprevisto, il cancello CHIEDE invece di lanciare o di tacere', () => {
    const r = motivoDaChiedere({ tipo: 'shell', comando: 'cat .e?v', cartella: CARTELLA, home: HOME, elenca: () => { throw new Error('imprevisto') }, puntiNascosti: false })
    assert.ok(r)
    assert.equal(r.classe, 'segreto')
    assert.equal(r.percorso, 'cat .e?v')
})

test('GL-21: la stessa cartella si apre una volta sola per comando: mille e duecento parole con la stella non esauriscono il tetto', () => {
    const chiamate = []
    assert.equal(chiede('cat ' + Array.from({ length: 1200 }, () => 'zz*').join(' '), { albero: PULITO, chiamate }), null)
    assert.equal(chiamate.length, 1)
})

test('GL-20: troppe alternative nelle graffe chiedono per prudenza; poche si espandono tutte', () => {
    const molte = 'cat f{' + Array.from({ length: 80 }, (_, i) => String(i)).join(',') + '}.txt'
    const r = chiede(molte, { albero: PULITO })
    assert.ok(r)
    assert.equal(nome(chiede('cat {a,b}{c,.env}', { albero: PULITO })), 'a.env', 'prodotto di graffe: ac, a.env, bc, b.env; `a.env` finisce con `.env`')
    assert.equal(chiede('cat {a,b}{c,d}.txt', { albero: PULITO }), null)
})
