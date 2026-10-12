/*
 * F-E-001 (S1, stress test della CLI 0.5.5, 12/10/2026) — una sessione nata in una cartella raggiunta col nome corto di Windows
 * (`C:\Users\me\DOWNLO~1\…`) dentro un isolamento chiudeva di colpo l'intero processo (0xC0000409): il realpath nativo lì è rifiutato
 * (o ricade su quello JavaScript, che lascia il nome corto senza errore), `formaLunga` tornava il percorso com'era e fs.watch
 * riceveva il nome corto — l'assert di libuv `!_wcsnicmp(filename, dir, dirlen)` (src/win/fs-event.c:72, libuv #5010).
 * Owner 12/10 («tutte e due»): il nome lungo si ricostruisce per identità del file; se non si prova, la cartella non si sorveglia.
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { lstatSync, readdirSync } from 'node:fs'
import { win32 } from 'node:path'
import { creaGestoreWorkspaceWatcher, formaLungaPerLaSorveglianza } from '../src/workspace-watcher.mjs'

const bs = String.fromCharCode(92)
const p = (...pezzi) => pezzi.join(bs)
const rifiuto = () => { throw Object.assign(new Error('EPERM: operation not permitted, realpath'), { code: 'EPERM' }) }

/* Un disco finto: `voci` = cartella → nomi lunghi; `identita` = percorso → numero del file (il nome corto e quello lungo portano lo stesso). */
function discoFinto({ voci, identita, realpathNativo = rifiuto }) {
    const chiave = (percorso) => win32.normalize(percorso).toLowerCase()
    const elenco = new Map(Object.entries(voci).map(([k, v]) => [chiave(k), v]))
    const numeri = new Map(Object.entries(identita).map(([k, v]) => [chiave(k), v]))
    return {
        realpathNativo,
        elenca(cartella) {
            const nomi = elenco.get(chiave(cartella))
            if (!nomi) throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' })
            return nomi
        },
        identita(percorso) {
            const numero = numeri.get(chiave(percorso))
            if (numero === undefined) throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' })
            return { ino: BigInt(numero), dev: 7n }
        },
    }
}

const CASA = p('C:', 'Users', 'me')
const CORTA = p(CASA, 'DOWNLO~1', `prog-${process.pid}`)
const LUNGA = p(CASA, 'Downloads', `prog-${process.pid}`)
const discoDiCasa = (extra = {}) => discoFinto({
    voci: { [CASA]: ['Documents', 'Downloads', 'Desktop'] },
    identita: { [p(CASA, 'DOWNLO~1')]: 41, [p(CASA, 'Downloads')]: 41, [p(CASA, 'Documents')]: 40, [p(CASA, 'Desktop')]: 42 },
    ...extra,
})

function gestoreCheRegistra(opzioni) {
    const osservate = []
    const watcher = { on() { return watcher }, close() {} }
    const gestore = creaGestoreWorkspaceWatcher({ watchFn(cartella) { osservate.push(cartella); return watcher }, ...opzioni })
    return { gestore, osservate }
}

test('F-E-001-01: with the native realpath refused, the watcher receives the LONG name found by file identity', () => {
    const { gestore, osservate } = gestoreCheRegistra({ piattaforma: 'win32', disco: discoDiCasa() })
    const stop = gestore.guardaWorkspace(CORTA, () => {})
    try {
        assert.deepEqual(osservate, [LUNGA])
    } finally {
        stop()
    }
})

test('F-E-001-02: a realpath that answers WITHOUT an error but keeps the short name (the JavaScript fallback) is expanded too', () => {
    const disco = discoDiCasa({ realpathNativo: (cartella) => cartella })
    assert.equal(formaLungaPerLaSorveglianza(CORTA, { piattaforma: 'win32', disco }), LUNGA)
})

test('F-E-001-03: a short name that cannot be proven is NOT watched — no watcher, and the session keeps a working unsubscribe', () => {
    const casi = {
        'two entries share the identity': discoFinto({
            voci: { [CASA]: ['Downloads', 'Download2'] },
            identita: { [p(CASA, 'DOWNLO~1')]: 41, [p(CASA, 'Downloads')]: 41, [p(CASA, 'Download2')]: 41 },
        }),
        'no entry has the identity': discoFinto({
            voci: { [CASA]: ['Documents'] },
            identita: { [p(CASA, 'DOWNLO~1')]: 41, [p(CASA, 'Documents')]: 40 },
        }),
        'the filesystem gives no identity (ino 0)': discoFinto({
            // una voce sola: senza il controllo sullo zero sarebbe «l'unica corrispondenza» e passerebbe per provata
            voci: { [CASA]: ['Downloads'] },
            identita: { [p(CASA, 'DOWNLO~1')]: 0, [p(CASA, 'Downloads')]: 0 },
        }),
        'the parent folder cannot be listed': discoFinto({ voci: {}, identita: { [p(CASA, 'DOWNLO~1')]: 41 } }),
    }
    for (const [nome, disco] of Object.entries(casi)) {
        assert.equal(formaLungaPerLaSorveglianza(CORTA, { piattaforma: 'win32', disco }), null, nome)
        const { gestore, osservate } = gestoreCheRegistra({ piattaforma: 'win32', disco })
        const stop = gestore.guardaWorkspace(CORTA, () => { throw new Error('never called') })
        assert.deepEqual(osservate, [], `${nome}: fs.watch must not receive the short name`)
        assert.equal(typeof stop, 'function', nome)
        assert.doesNotThrow(() => stop(), nome)
    }
})

test('F-E-001-04: AL CONTRARIO — what is not an 8.3 name stays watched as before', () => {
    // una cartella che si chiama davvero `note~1` è già il suo nome lungo
    const letterale = p(CASA, 'note~1', `prog-${process.pid}`)
    const disco = discoFinto({ voci: { [CASA]: ['note~1', 'Downloads'] }, identita: { [p(CASA, 'note~1')]: 50, [p(CASA, 'Downloads')]: 41 } })
    assert.equal(formaLungaPerLaSorveglianza(letterale, { piattaforma: 'win32', disco }), letterale)
    // …anche dove il filesystem non dà identità (ino 0): il nome è nell'elenco, non serve altro
    const senzaIdentita = discoFinto({ voci: { [CASA]: ['note~1', 'Downloads'] }, identita: { [p(CASA, 'note~1')]: 0, [p(CASA, 'Downloads')]: 0 } })
    assert.equal(formaLungaPerLaSorveglianza(letterale, { piattaforma: 'win32', disco: senzaIdentita }), letterale)

    // senza segmenti corti il disco non si interroga nemmeno: una cartella inesistente si osserva com'è (i watcher finti dei test)
    const muto = { realpathNativo: rifiuto, elenca() { throw new Error('not asked') }, identita() { throw new Error('not asked') } }
    const senzaCorti = p('C:', 'workspace', `talos-${process.pid}`)
    assert.equal(formaLungaPerLaSorveglianza(senzaCorti, { piattaforma: 'win32', disco: muto }), senzaCorti)

    // quando il realpath nativo risponde col nome lungo, vale quello
    const nativo = discoDiCasa({ realpathNativo: () => LUNGA })
    assert.equal(formaLungaPerLaSorveglianza(CORTA, { piattaforma: 'win32', disco: nativo }), LUNGA)

    // fuori da Windows `~1` è un nome qualunque e libuv non fa quel confronto
    for (const piattaforma of ['linux', 'darwin', 'android']) {
        const { gestore, osservate } = gestoreCheRegistra({ piattaforma, disco: muto })
        const cartella = `/home/me/DOWNLO~1/prog-${process.pid}-${piattaforma}`
        const stop = gestore.guardaWorkspace(cartella, () => {})
        try { assert.deepEqual(osservate, [cartella], piattaforma) } finally { stop() }
    }
})

test('F-E-001-05: on the REAL disk, `C:\\PROGRA~1` becomes `C:\\Program Files` without the native realpath', (t) => {
    const corta = p('C:', 'PROGRA~1')
    let esiste = false
    try { esiste = process.platform === 'win32' && lstatSync(corta).isDirectory() } catch { esiste = false }
    if (!esiste) return t.skip('this volume has no 8.3 name for Program Files')
    const disco = { realpathNativo: rifiuto, elenca: (cartella) => readdirSync(cartella), identita: (percorso) => lstatSync(percorso, { bigint: true }) }
    assert.equal(formaLungaPerLaSorveglianza(corta, { piattaforma: 'win32', disco }), p('C:', 'Program Files'))
    assert.equal(formaLungaPerLaSorveglianza(p(corta, 'nodejs'), { piattaforma: 'win32', disco }), p('C:', 'Program Files', 'nodejs'))
})
