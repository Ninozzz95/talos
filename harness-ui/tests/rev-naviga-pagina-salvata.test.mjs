/*
 * Politica di taglio F006/F07/T04/B02 (audit 28-29/09), decisione owner 01/10/2026 «Come Hermes»: una pagina di `naviga`
 * oltre 4.000 caratteri si salva INTERA nella cartella della SESSIONE (owner 01/10: «per sessione, come Claude Code»,
 * cancellata con la sessione), il modello vede testa e coda sui confini di riga, e un'intestazione IN TESTA gli dice che
 * TALOS ha tagliato, quanto ha mostrato, dove sta la pagina e la chiamata `leggi` esatta per il mezzo — che si legge
 * senza chiedere il permesso.
 * Hermes `tools/web_tools_truncate.py:86-125` (`_truncate_with_footer`: 75% testa / 25% coda sui confini di riga, testo
 * intero salvato, `read_file … offset=<righe della testa + 2> limit=200`); Claude Code: la cartella `tool-results` della
 * sessione «Tool result files are allowed for reading» (eseguibile 2.1.283).
 */
import test from 'node:test'
import { togliConfiniDati } from '../src/kernel/confine-dati.mjs'
import assert from 'node:assert/strict'
import { existsSync, linkSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { talosLavora, uscitaUtile } from '../src/kernel/talosHarness.mjs'
import { cartellaPagineWebDi, eliminaSessionePersistita } from '../src/session-store.mjs'
import { avviaSessione } from '../src/agent-service.mjs'
import { rimuoviCartellaDiProva } from './aiuto/rimuovi-cartella-di-prova.mjs'

const URL_LUNGA = 'https://esempio.test/pagina-lunga'

function cartella(t, nome = 'talos-naviga-') {
    // ⛔ PR pubblica #45 (01/10/2026): sul runner di GitHub la Temp è `C:\Users\RUNNER~1\…` (nome corto 8.3) e `realpath` la
    //   espande: `eUnaPaginaSalvata` vedeva due percorsi diversi e chiedeva il permesso (il verso sicuro). La cartella di prova
    //   è quella canonica, come la cartella dati dell'app installata (sempre un percorso lungo).
    const c = realpathSync.native(mkdtempSync(join(tmpdir(), nome)))
    t.after(() => rimuoviCartellaDiProva(c))
    return c
}

/* Un workspace e, FUORI da lui, una cartella delle pagine sotto una cartella NASCOSTA (come `.sessions-store` sul desktop):
   è proprio il caso in cui `leggi` chiederebbe il permesso. */
function scena(t) {
    const radice = cartella(t)
    const workspace = join(radice, 'progetto')
    mkdirSync(workspace)
    const pagine = join(radice, '.sessions-store', 'pagine-web', 'sessione-1')
    return { radice, workspace, pagine }
}

/* Un fornitore che fa UNA chiamata per richiesta; `prossima(n, esiti)` la decide guardando gli esiti già arrivati. */
function fornitore(prossima, esiti) {
    let n = 0
    return async () => {
        const c = prossima(n, esiti)
        n++
        const message = c
            ? { role: 'assistant', content: null, tool_calls: [{ id: `c${n}`, type: 'function', function: { name: c[0], arguments: JSON.stringify(c[1]) } }] }
            : { role: 'assistant', content: 'fatto' }
        return new Response(JSON.stringify({ choices: [{ message, finish_reason: c ? 'tool_calls' : 'stop' }] }), { headers: { 'Content-Type': 'application/json' } })
    }
}

async function giro({ workspace, pagine, corpo, prossima, onPaginaLetta }) {
    const esiti = []
    const chieste = []
    await talosLavora({
        cartella: workspace, task: { consegna: 'leggi la pagina' }, modello: 'f', chiave: 'k', giriMassimi: 6,
        cacheWeb: { around: async (d) => ({ value: { stato: 200, url: d.url, corpo }, fromCache: false }) },
        fetchDiRete: fornitore(prossima, esiti),
        onGiro: (e) => { if (e.tipo === 'tool-esito') esiti.push(togliConfiniDati(String(e.content))) },
        chiediApprovazioneFn: async (a) => { chieste.push(a); return false },
        ...(pagine === undefined ? {} : { cartellaPagineWeb: pagine }),
        ...(onPaginaLetta ? { onPaginaLetta } : {}),
    })
    return { esiti, chieste }
}

const soloNaviga = (n) => (n === 0 ? ['naviga', { url: URL_LUNGA }] : null)
/* 300 righe di 40 caratteri (con l'a capo): 12.000 caratteri, ben oltre i 4.000 */
const PAGINA_A_RIGHE = Array.from({ length: 300 }, (_, i) => `riga ${String(i + 1).padStart(3, '0')} ` + 'x'.repeat(29)).join('\n') + '\n'
const intestazione = /^HTTP 200 · https:\/\/esempio\.test\/pagina-lunga\n\[TALOS cut this page: (\d+) characters, showing (\d+) at the start and (\d+) at the end\. The full page is saved at "([^"]+)"\. Read the omitted middle with leggi percorso="([^"]+)" (offset|byteOffset)=(\d+)/u

test('NAV-SAVE-01: la pagina lunga si salva intera, e l intestazione dice quanto è stato mostrato e da dove riprendere', async (t) => {
    const { workspace, pagine } = scena(t)
    const { esiti } = await giro({ workspace, pagine, corpo: PAGINA_A_RIGHE, prossima: soloNaviga })
    const m = intestazione.exec(esiti[0])
    assert.ok(m, esiti[0].slice(0, 400))
    const [, n, testa, coda, salvata, perLeggere, unita, dove] = m
    assert.equal(Number(n), PAGINA_A_RIGHE.length)
    assert.ok(Number(testa) + Number(coda) <= 4000, 'testa + coda dentro il limite')
    assert.ok(Number(testa) > 2 * Number(coda), 'come Hermes: tre quarti in testa')
    assert.equal(perLeggere, salvata)
    assert.equal(unita, 'offset')
    assert.equal(readFileSync(salvata, 'utf8'), PAGINA_A_RIGHE, 'la copia è la pagina intera')
    assert.deepEqual(readdirSync(pagine), [salvata.slice(pagine.length + 1)], 'un file solo, nella cartella della sessione')
    // ciò che segue l'intestazione è la testa esatta, poi la coda esatta
    const corpoMostrato = esiti[0].slice(esiti[0].indexOf(']\n') + 2)
    assert.ok(corpoMostrato.startsWith(PAGINA_A_RIGHE.slice(0, Number(testa))))
    assert.ok(corpoMostrato.endsWith(PAGINA_A_RIGHE.slice(PAGINA_A_RIGHE.length - Number(coda))))
    // la riga indicata è la prima che la testa NON ha mostrato
    const righe = PAGINA_A_RIGHE.split('\n')
    const primaNonMostrata = righe[Number(dove) - 1]
    assert.ok(!PAGINA_A_RIGHE.slice(0, Number(testa)).includes(primaNonMostrata))
    assert.ok(PAGINA_A_RIGHE.slice(0, Number(testa)).endsWith(righe[Number(dove) - 2]))
})

test('NAV-SAVE-02: la chiamata leggi dell intestazione, eseguita com è, legge il mezzo SENZA chiedere il permesso', async (t) => {
    const { workspace, pagine } = scena(t)
    const { esiti, chieste } = await giro({ workspace, pagine, corpo: PAGINA_A_RIGHE, prossima: (n, e) => {
        if (n === 0) return ['naviga', { url: URL_LUNGA }]
        if (n === 1) { const m = intestazione.exec(e[0]); return ['leggi', { percorso: m[5], offset: Number(m[7]) }] }
        return null
    } })
    assert.deepEqual(chieste, [], 'nessuna richiesta di permesso per la pagina salvata')
    const dove = Number(intestazione.exec(esiti[0])[7])
    assert.doesNotMatch(esiti[1], /^REFUSED/u)
    assert.ok(esiti[1].includes(PAGINA_A_RIGHE.split('\n')[dove - 1]), esiti[1].slice(0, 300))
})

test('NAV-SAVE-03: al contrario, un altro file nella stessa cartella nascosta fuori dal progetto CHIEDE ancora', async (t) => {
    const { radice, workspace, pagine } = scena(t)
    const altro = join(radice, '.sessions-store', 'altro.txt')
    mkdirSync(join(radice, '.sessions-store'), { recursive: true })
    writeFileSync(altro, 'non è una pagina salvata\n')
    const { esiti, chieste } = await giro({ workspace, pagine, corpo: PAGINA_A_RIGHE, prossima: (n) => (n === 0 ? ['leggi', { percorso: altro }] : null) })
    assert.equal(chieste.length, 1)
    assert.match(esiti[0], /^REFUSED\./u)
})

test('NAV-SAVE-04: una pagina corta resta com era, e non si salva niente', async (t) => {
    const { workspace, pagine } = scena(t)
    const corta = 'una pagina breve\n'.repeat(10)
    const { esiti } = await giro({ workspace, pagine, corpo: corta, prossima: soloNaviga })
    assert.equal(esiti[0], `HTTP 200 · ${URL_LUNGA}\n${corta}`)
    assert.equal(existsSync(pagine) && readdirSync(pagine).length > 0, false)
})

test('NAV-SAVE-05: senza la cartella delle pagine (banco, CLI, mobile) l uscita è bit per bit quella di prima', async (t) => {
    const { workspace } = scena(t)
    const { esiti } = await giro({ workspace, pagine: undefined, corpo: PAGINA_A_RIGHE, prossima: soloNaviga })
    assert.equal(esiti[0], `HTTP 200 · ${URL_LUNGA}\n${uscitaUtile(PAGINA_A_RIGHE, 4_000, 0.25)}`)
})

test('NAV-SAVE-06: una pagina su UNA riga sola (minificata) indica byteOffset, e quella chiamata riprende dal punto esatto', async (t) => {
    const { workspace, pagine } = scena(t)
    const minificata = Array.from({ length: 1200 }, (_, i) => `<p>${String(i).padStart(4, '0')}</p>`).join('') // 13.200 caratteri, nessun a capo
    const { esiti, chieste } = await giro({ workspace, pagine, corpo: minificata, prossima: (n, e) => {
        if (n === 0) return ['naviga', { url: URL_LUNGA }]
        if (n === 1) { const m = intestazione.exec(e[0]); return ['leggi', { percorso: m[5], byteOffset: Number(m[7]) }] }
        return null
    } })
    const m = intestazione.exec(esiti[0])
    assert.ok(m, esiti[0].slice(0, 400))
    assert.equal(m[6], 'byteOffset')
    assert.equal(Number(m[7]), Number(m[2]), 'pagina ASCII: il byte dopo la testa è il carattere dopo la testa')
    assert.deepEqual(chieste, [])
    assert.ok(esiti[1].includes(minificata.slice(Number(m[2]), Number(m[2]) + 200)), esiti[1].slice(0, 300))
})

test('NAV-SAVE-07: se la pagina non si può salvare lo dice, e non promette una chiamata che fallirebbe', async (t) => {
    const { radice, workspace } = scena(t)
    const nonUnaCartella = join(radice, 'un-file')
    writeFileSync(nonUnaCartella, 'occupato')
    const { esiti } = await giro({ workspace, pagine: join(nonUnaCartella, 'sotto'), corpo: PAGINA_A_RIGHE, prossima: soloNaviga })
    assert.match(esiti[0], /^HTTP 200 · https:\/\/esempio\.test\/pagina-lunga\n\[TALOS cut this page: \d+ characters, showing \d+ at the start and \d+ at the end\. The full page could not be saved, so the omitted middle cannot be read: open a more specific address for it\.\]\n/u)
    assert.doesNotMatch(esiti[0], /leggi percorso=/u)
})

test('NAV-SAVE-08: un collegamento fisico dentro la cartella delle pagine verso un file di fuori CHIEDE il permesso', async (t) => {
    const { radice, workspace, pagine } = scena(t)
    mkdirSync(pagine, { recursive: true })
    const segreto = join(radice, '.ssh-finto', 'chiave.txt')
    mkdirSync(join(radice, '.ssh-finto'))
    writeFileSync(segreto, 'SEGRETO\n')
    const dentro = join(pagine, 'esempio.test-0123456789.txt')
    linkSync(segreto, dentro)
    const { esiti, chieste } = await giro({ workspace, pagine, corpo: PAGINA_A_RIGHE, prossima: (n) => (n === 0 ? ['leggi', { percorso: dentro }] : null) })
    assert.equal(chieste.length, 1, 'un file con due nomi non è una pagina salvata da TALOS')
    assert.doesNotMatch(esiti[0], /SEGRETO/u)
})

test('NAV-SAVE-09: un collegamento simbolico dentro la cartella delle pagine CHIEDE il permesso', async (t) => {
    const { radice, workspace, pagine } = scena(t)
    mkdirSync(pagine, { recursive: true })
    const segreto = join(radice, '.ssh-finto', 'chiave.txt')
    mkdirSync(join(radice, '.ssh-finto'))
    writeFileSync(segreto, 'SEGRETO\n')
    const dentro = join(pagine, 'esempio.test-abcdef0123.txt')
    try { symlinkSync(segreto, dentro, 'file') } catch (e) {
        if (e.code === 'EPERM') { t.skip('questo Windows non crea collegamenti simbolici senza privilegi'); return }
        throw e
    }
    const { esiti, chieste } = await giro({ workspace, pagine, corpo: PAGINA_A_RIGHE, prossima: (n) => (n === 0 ? ['leggi', { percorso: dentro }] : null) })
    assert.equal(chieste.length, 1)
    assert.doesNotMatch(esiti[0], /SEGRETO/u)
})

test('NAV-SAVE-12: una giunzione dentro la cartella delle pagine porta fuori, e lì `leggi` CHIEDE il permesso', async (t) => {
    const { radice, workspace, pagine } = scena(t)
    mkdirSync(pagine, { recursive: true })
    const fuori = join(radice, '.ssh-finto')
    mkdirSync(fuori)
    writeFileSync(join(fuori, 'chiave.txt'), 'SEGRETO\n')
    symlinkSync(fuori, join(pagine, 'giunzione'), 'junction')
    const attraverso = join(pagine, 'giunzione', 'chiave.txt')
    const { esiti, chieste } = await giro({ workspace, pagine, corpo: PAGINA_A_RIGHE, prossima: (n) => (n === 0 ? ['leggi', { percorso: attraverso }] : null) })
    assert.equal(chieste.length, 1, 'il percorso reale non sta nella cartella delle pagine')
    assert.doesNotMatch(esiti[0], /SEGRETO/u)
})

test('NAV-SAVE-13: se la cartella delle pagine È una giunzione verso fuori, nessun file «dentro» passa senza chiedere', async (t) => {
    const { radice, workspace, pagine } = scena(t)
    const fuori = join(radice, '.ssh-finto')
    mkdirSync(fuori)
    writeFileSync(join(fuori, 'chiave.txt'), 'SEGRETO\n')
    mkdirSync(join(pagine, '..'), { recursive: true })
    symlinkSync(fuori, pagine, 'junction')
    const { esiti, chieste } = await giro({ workspace, pagine, corpo: PAGINA_A_RIGHE, prossima: (n) => (n === 0 ? ['leggi', { percorso: join(pagine, 'chiave.txt') }] : null) })
    assert.equal(chieste.length, 1, 'un collegamento sulla strada della cartella')
    assert.doesNotMatch(esiti[0], /SEGRETO/u)
})

test('NAV-SAVE-10: nella ricerca approfondita la finestra della ricerca vince, e non si salva niente', async (t) => {
    const { workspace, pagine } = scena(t)
    const { esiti } = await giro({ workspace, pagine, corpo: PAGINA_A_RIGHE, prossima: soloNaviga, onPaginaLetta: async () => 'FINESTRA DELLA RICERCA' })
    assert.equal(esiti[0], `HTTP 200 · ${URL_LUNGA}\nFINESTRA DELLA RICERCA`)
    assert.equal(existsSync(pagine), false)
})

test('NAV-SAVE-11: la stessa pagina riaperta dà la STESSA uscita, byte per byte (la cache del prompt del fornitore)', async (t) => {
    const { workspace, pagine } = scena(t)
    const { esiti } = await giro({ workspace, pagine, corpo: PAGINA_A_RIGHE, prossima: (n) => (n < 2 ? ['naviga', { url: URL_LUNGA }] : null) })
    assert.equal(esiti[1], esiti[0])
    assert.equal(readdirSync(pagine).length, 1)
})

test('NAV-STORE-01: eliminare una sessione cancella le SUE pagine, e solo le sue', async (t) => {
    const store = cartella(t, 'talos-store-pagine-')
    writeFileSync(join(store, 'uno.jsonl'), '{}\n')
    writeFileSync(join(store, 'due.jsonl'), '{}\n')
    for (const id of ['uno', 'due']) {
        mkdirSync(cartellaPagineWebDi(store, id), { recursive: true })
        writeFileSync(join(cartellaPagineWebDi(store, id), 'p.txt'), id)
    }
    assert.equal(cartellaPagineWebDi(store, 'uno'), join(store, 'pagine-web', 'uno'))
    await eliminaSessionePersistita({ cartellaStore: store, sessionId: 'uno' })
    assert.equal(existsSync(join(store, 'uno.jsonl')), false)
    assert.equal(existsSync(cartellaPagineWebDi(store, 'uno')), false)
    assert.equal(readFileSync(join(cartellaPagineWebDi(store, 'due'), 'p.txt'), 'utf8'), 'due')
    assert.equal(existsSync(join(store, 'due.jsonl')), true)
    await eliminaSessionePersistita({ cartellaStore: store, sessionId: 'mai-esistita' })
})

test('NAV-STORE-02: una giunzione dentro le pagine si stacca, la cartella a cui punta NON si svuota', async (t) => {
    const store = cartella(t, 'talos-store-giunzione-')
    const fuori = cartella(t, 'talos-fuori-')
    writeFileSync(join(fuori, 'prezioso.txt'), 'resta')
    writeFileSync(join(store, 'uno.jsonl'), '{}\n')
    mkdirSync(cartellaPagineWebDi(store, 'uno'), { recursive: true })
    symlinkSync(fuori, join(cartellaPagineWebDi(store, 'uno'), 'giunzione'), 'junction')
    await eliminaSessionePersistita({ cartellaStore: store, sessionId: 'uno' })
    assert.equal(existsSync(cartellaPagineWebDi(store, 'uno')), false)
    assert.equal(readFileSync(join(fuori, 'prezioso.txt'), 'utf8'), 'resta')
})

test('NAV-STORE-03: se le pagine non si possono togliere, la sessione NON si cancella e l errore è quello della cancellazione', async (t) => {
    const store = cartella(t, 'talos-store-rm-')
    writeFileSync(join(store, 'uno.jsonl'), '{}\n')
    await assert.rejects(
        eliminaSessionePersistita({ cartellaStore: store, sessionId: 'uno' }, { rmFn: async () => { throw Object.assign(new Error('occupato'), { code: 'EBUSY' }) } }),
        (e) => e.code === 'SESSION_STORE_DELETE_FAILED')
    assert.equal(existsSync(join(store, 'uno.jsonl')), true)
})

test('NAV-WIRE-01: il registro dà a ogni sessione la SUA cartella delle pagine, e agent-service la porta al kernel', async (t) => {
    const { createSessionRegistry } = await import('../src/session-registry.mjs')
    const store = cartella(t, 'talos-registro-pagine-')
    const runs = []
    const avviaSessioneFn = (input) => {
        let risolvi
        const promessa = new Promise((r) => { risolvi = r })
        const i = runs.length
        runs.push({ input, risolvi })
        input.onEvento({ type: 'RunStarted', threadId: `t${i}`, runId: `r${i}` })
        return promessa
    }
    const fine = (i) => { runs[i].input.onEvento({ type: 'RunFinished', threadId: `t${i}`, runId: `r${i}` }); runs[i].risolvi({ ok: true, esito: { detto: 'ok', comeFinita: 'concluso', messaggiFinali: [] } }) }
    const registro = createSessionRegistry({ avviaSessioneFn, modello: 'm', chiave: 'k', cartellaEsisteFn: () => true, cartellaStore: store,
        preparaEsecuzioneFn: () => ({ cartella: '/tmp/x', comandoProva: 'npm test', task: { id: 'task', consegna: 'lavora' } }) })
    const { sessionId } = registro.avvia('task')
    assert.equal(runs[0].input.cartellaPagineWeb, join(store, 'pagine-web', sessionId))
    fine(0)
    await registro.attendiAssestamento(sessionId)
    await registro.chiudi?.()
    const senzaStore = createSessionRegistry({ avviaSessioneFn, modello: 'm', chiave: 'k', cartellaEsisteFn: () => true,
        preparaEsecuzioneFn: () => ({ cartella: '/tmp/x', comandoProva: 'npm test', task: { id: 'task', consegna: 'lavora' } }) })
    const altra = senzaStore.avvia('task')
    assert.equal(runs[1].input.cartellaPagineWeb, null, 'senza negozio delle sessioni non c è dove salvare')
    fine(1)
    await senzaStore.attendiAssestamento(altra.sessionId)
    await senzaStore.chiudi?.()

    let visto
    await avviaSessione({ cartella: '/tmp/x', task: { consegna: 'prova' }, modello: 'm', chiave: 'k', onEvento: () => {},
        cartellaPagineWeb: 'C:/dati/pagine-web/s1',
        talosLavoraFn: async (input) => { visto = input; return { comeFinita: 'concluso', detto: 'fatto' } } })
    assert.equal(visto.cartellaPagineWeb, 'C:/dati/pagine-web/s1')
})
