/*
 * Ticket C-005, v5 (08/10/2026). Due segnalazioni del bugfixer del desktop sulla v4, riprodotte qui prima della cura:
 * 1. LA QUOTATURA ricompone il nome: `cat .e""nv`, `.e''nv`, `.e\nv`, `".e"nv`, `.e${X}nv` stampano `.env` in una bash vera e il cancello taceva.
 *    La shell toglie apici ed escape e sostituisce le variabili DOPO che TALOS ha letto il testo (classe GuardFall).
 * 2. IL COSTO: la seconda passata della v4 elencava le cartelle in modo sincrono; su un albero con node_modules `cat * /* /* /* /.e*` (senza spazi)
 *    teneva fermo il processo 481 ms. Ora c'è un tetto di TEMPO (100 ms, orologio iniettabile) oltre al quale si chiede, e un segmento che non è
 *    l'ultimo apre solo cartelle.
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { motivoDaChiedere } from '../src/path-policy.mjs'

const CARTELLA = process.platform === 'win32' ? 'C:\\lavoro\\progetto' : '/lavoro/progetto'
const HOME = process.platform === 'win32' ? 'C:\\Users\\prova' : '/home/prova'
const radice = CARTELLA.replace(/\\/g, '/')
const fabbricaElenca = (albero, chiamate = []) => (cartella) => {
    const chiave = String(cartella).replace(/\\/g, '/')
    chiamate.push(chiave)
    if (chiave in albero) return albero[chiave]
    return { errore: 'ENOENT' }
}
const DISCO = { [radice]: { nomi: ['.env', 'cert.pem', 'README.md', 'src', 'id_rsa.pub'] }, [radice + '/src']: { nomi: ['index.ts'] } }
const chiede = (comando, { albero = DISCO, puntiNascosti = false, chiamate, orologio } = {}) =>
    motivoDaChiedere({ tipo: 'shell', comando, cartella: CARTELLA, home: HOME, elenca: fabbricaElenca(albero, chiamate), puntiNascosti, ...(orologio ? { orologio } : {}) })
const nome = (r) => (r ? r.percorso.replace(/\\/g, '/') : null)

test('Q-1: le forme che la shell ricompone in `.env` (o `cert.pem`) chiedono, col nome del file vero', () => {
    const bs = String.fromCharCode(92)
    const casi = [
        ['cat .e""nv', '.env'], ["cat .e''nv", '.env'], [`cat .e${bs}nv`, '.env'], ['cat ".e"nv', '.env'], ['cat .e"n"v', '.env'], [`cat ".e"'n'v`, '.env'],
        ["cat .e$'n'v", '.env'], [`cat .e${bs}\nnv`, '.env'], [`cat $'${bs}x2eenv'`, '.env'], [`cat $'${bs}056env'`, '.env'], ['type .e^nv', '.env'],
        ['cat cert.p""em', 'cert.pem'], ['cat FOO=".e"nv', '.env'],
    ]
    for (const [comando, atteso] of casi) assert.equal(nome(chiede(comando)), atteso, comando)
})

test('Q-2: una sostituzione che il testo non dice vale come un jolly che prende anche il punto: `.e${X}nv`, `${X}env`, `.e$(printf n)v`', () => {
    for (const comando of ['cat .e${X}nv', 'cat ${X}env', 'cat .e$(printf n)v', 'cat .e`echo n`v', 'cat .e$Xv', 'cat cert$SUFFISSO']) {
        const r = chiede(comando)
        assert.ok(r, `${comando}: deve chiedere`)
        assert.equal(r.classe, 'segreto', comando)
        assert.ok(!r.percorso.includes('\uE000'), `${comando}: il jolly non si mostra mai alla persona`)
    }
})

test('Q-3: le parole che sono SOLO una sostituzione, le chiamate e i testi normali restano muti (con `.env` e `cert.pem` nella cartella)', () => {
    for (const comando of ['cat $FILE', 'cat "$FILE"', 'echo "$HOME"', 'git commit -m "fix: $MSG"', 'cat "README.md"', "printf '%s\\n' \"$X\"",
        'node -e "x.pem()"', 'python -c "print(s.key())"', 'node -e x.pem()', 'node -e x.pem() "con un apice, così il passo delle parole parte"', 'echo "hello world"', 'ls "src"/*.ts', 'echo ${#ARR[@]}', 'cd "$(git rev-parse --show-toplevel)"']) {
        assert.equal(chiede(comando, { puntiNascosti: true }), null, comando)
    }
})

test('Q-4: i comandi DENTRO `$(..)` e fra apici inversi si esaminano come comandi, anche annidati e fra doppi apici', () => {
    assert.equal(nome(chiede('echo $(cat .e?v)')), '.env')
    assert.equal(nome(chiede('x=`cat cert.p?m`')), 'cert.pem')
    assert.equal(nome(chiede('echo "$(echo $(cat .en*))"')), '.env')
    assert.equal(nome(chiede("echo '$(cat .e?v)'")), null, 'fra apici singoli non si esegue niente')
    const profondo = 'echo $(a $(b $(c $(d $(e cat .e?v)))))'
    assert.ok(chiede(profondo, { albero: {} }), 'oltre quattro livelli si chiede per prudenza')
})

test('T-1: il tetto di TEMPO — speso, si chiede; con un orologio fermo no', () => {
    const albero = { [radice]: { nomi: ['a', 'b', 'c'] }, [radice + '/a']: { nomi: ['x.txt'] }, [radice + '/b']: { nomi: ['y.txt'] }, [radice + '/c']: { nomi: ['z.txt'] } }
    let adesso = 0
    const lento = () => { adesso += 60; return adesso }
    assert.ok(chiede('cat */*.txt', { albero, orologio: lento }), 'tre cartelle a 60 ms l\u0027una superano i 100 ms')
    assert.equal(chiede('cat */*.txt', { albero, orologio: () => 0 }), null)
    /* quando si chiede per prudenza su una parola con una sostituzione, la persona vede `…`, mai il carattere interno */
    adesso = 0
    const r = chiede('cat */${X}.txt', { albero, orologio: lento })
    assert.ok(r)
    assert.ok(!r.percorso.includes('\uE000') && r.percorso.includes('…'), r.percorso)
})

test('T-2: un segmento che non è l\u0027ultimo apre solo cartelle (i file non si elencano)', () => {
    const albero = { [radice]: { nomi: ['pacchetto', 'a.txt', 'b.txt', 'c.txt'], cartelle: new Set(['pacchetto']) }, [radice + '/pacchetto']: { nomi: ['.env'], cartelle: new Set() } }
    const chiamate = []
    assert.equal(nome(chiede('cat */.en?', { albero, chiamate })), 'pacchetto/.env')
    assert.deepEqual(chiamate, [radice, radice + '/pacchetto'])
    /* senza l'informazione sul tipo (un elenco che non la dà) si prova tutto, come prima */
    const senzaTipo = { [radice]: { nomi: ['pacchetto', 'a.txt'] }, [radice + '/pacchetto']: { nomi: ['.env'] } }
    const tutte = []
    assert.equal(nome(chiede('cat */.en?', { albero: senzaTipo, chiamate: tutte })), 'pacchetto/.env')
    assert.equal(tutte.length, 3)
})
