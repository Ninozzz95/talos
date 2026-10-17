/*
 * K1 (S1, stress test della CLI 0.6.7, 16/10/2026) — `leggi ".env::$DATA"` leggeva il `.env` SENZA chiedere.
 * Lo stream alternato di NTFS (`nome:stream`, `::$DATA`, `:Zone.Identifier`) apre lo STESSO file, ma il nome finale non era più `.env` e la
 * classe del segreto non scattava. Cura in `segmentiDi` (path-policy.mjs): la classe si decide sul nome senza lo stream, e la lettera di un
 * disco resta. Ogni caso ha il suo verso contrario: un file innocuo con uno stream resta muto, e i percorsi con `C:` non cambiano.
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { motivoDaChiedere } from '../src/path-policy.mjs'

const CARTELLA = process.platform === 'win32' ? 'C:\\lavoro\\progetto' : '/lavoro/progetto'
const HOME = process.platform === 'win32' ? 'C:\\Users\\prova' : '/home/prova'
const radice = CARTELLA.replace(/\\/g, '/')
const DISCO = {
    [radice]: { nomi: ['.env', 'README.md', 'keys', 'src'] },
    [radice + '/keys']: { nomi: ['id_ed25519', 'id_ed25519.pub'] },
}
const elenca = (cartella) => DISCO[String(cartella).replace(/\\/g, '/')] ?? { errore: 'ENOENT' }
const chiedi = (tipo, x) => motivoDaChiedere(tipo === 'shell'
    ? { tipo, comando: x, cartella: CARTELLA, home: HOME, elenca, puntiNascosti: false }
    : { tipo, percorso: x, cartella: CARTELLA, home: HOME, elenca, puntiNascosti: false })

test('K1-01: a secret named through an NTFS alternate stream asks, for read, list and the shell', () => {
    for (const [tipo, x] of [
        ['leggi', '.env::$DATA'],
        ['leggi', '.env:Zone.Identifier'],
        ['leggi', 'keys/id_ed25519::$DATA'],
        ['leggi', `${radice}/.env::$DATA`],
        ['elenca', '.env::$DATA'],
        ['shell', 'type .env::$DATA'],
        ['shell', 'more < .env:stream'],
        ['shell', 'Get-Content -Path .env:Zone.Identifier'],
        /* relativi al disco: `C:.env` è il `.env` della cartella corrente di C: — chiedeva prima della cura e deve chiedere ancora */
        ['leggi', 'C:.env'],
        ['leggi', 'c:.env::$DATA'],
        ['shell', 'type C:.env'],
        ['shell', 'type c:.env:Zone.Identifier'],
    ]) {
        const r = chiedi(tipo, x)
        assert.ok(r, `${tipo} ${x}: must ask`)
        assert.equal(r.classe, 'segreto', `${tipo} ${x}`)
    }
})

test('K1-02: AL CONTRARIO — a harmless file with a stream stays silent, a public key stays exempt, and drive letters are kept', () => {
    for (const [tipo, x] of [
        ['leggi', 'README.md::$DATA'],
        ['leggi', 'README.md:Zone.Identifier'],
        ['leggi', 'keys/id_ed25519.pub::$DATA'],
        ['shell', 'type README.md:stream'],
        ['leggi', `${radice}/README.md`],
        ['leggi', 'C:README.md'],
        ['leggi', 'C:'],
        ['shell', 'dir C:'],
        /* la lettera del disco sta solo IN TESTA: `src/e:.env` è il file `e` con uno stream chiamato `.env`, non il segreto */
        ['leggi', 'src/e:.env'],
    ]) assert.equal(chiedi(tipo, x), null, `${tipo} ${x}: must not ask`)
    /* la lettera del disco non è uno stream: il percorso assoluto del segreto si riconosce lo stesso, senza flusso */
    assert.equal(chiedi('leggi', `${radice}/.env`)?.classe, 'segreto')
})
