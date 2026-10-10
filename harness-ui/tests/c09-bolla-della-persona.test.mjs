/*
 * C09 (owner 10/10/2026, «Come Hermes, completo») — la copia per lo schermo del messaggio della persona viaggia accanto al testo
 *   per il modello, il server la conserva (ripresa, coda, ripristino, consegna dalla coda), e il modello non la vede mai.
 *   Riprodotto dal vivo sulla 4176 prima della cura: dopo una ricarica la bolla mostrava intestazione, percorsi e contenuto dei file.
 */
import assert from 'node:assert/strict'
import { mkdtempSync } from 'node:fs'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'

import { bollaPerLaConsegna, bollaValida, TETTI_BOLLA } from '../src/bolla-della-persona.mjs'
import { createHttpApp } from '../src/http-app.mjs'
import { createSessionRegistry } from '../src/session-registry.mjs'
import { rimuoviCartellaDiProva } from './aiuto/rimuovi-cartella-di-prova.mjs'

const BOLLA = { testo: 'guarda questo', allegati: [{ tipo: 'testo', nome: 'nota.txt', percorso: 'C:\\progetto\\allegati\\nota.txt', caratteri: 42 }] }
const PER_IL_MODELLO = 'guarda questo\n\nAttachments of this message:\n- nota.txt (C:\\progetto\\allegati\\nota.txt)\n\n--- nota.txt (C:\\progetto\\allegati\\nota.txt) ---\nRIGA-DEL-FILE'

test('BOLLA-01 the server keeps only the expected shape, with caps; unknown keys drop; nothing to show is null', () => {
    assert.deepEqual(bollaValida(BOLLA), BOLLA)
    assert.deepEqual(bollaValida({ ...BOLLA, intruso: 1, allegati: [{ ...BOLLA.allegati[0], contenuto: 'byte', daBrowser: 'si' }] }), BOLLA)
    assert.equal(bollaValida({ testo: 'x'.repeat(TETTI_BOLLA.testo + 5), allegati: [] }).testo.length, TETTI_BOLLA.testo)
    assert.equal(bollaValida({ testo: 'x', allegati: Array.from({ length: 50 }, (_, i) => ({ nome: `f${i}` })) }).allegati.length, TETTI_BOLLA.allegati)
    for (const vuota of [null, undefined, 'testo', [], {}, { testo: '   ', allegati: [] }, { testo: '', allegati: [{ tipo: 'file' }] }]) assert.equal(bollaValida(vuota), null, JSON.stringify(vuota))
    assert.deepEqual(bollaValida({ testo: '', allegati: [{ percorso: 'C:\\a.txt' }] }), { testo: '', allegati: [{ percorso: 'C:\\a.txt' }] }, 'only attachments is still something to show')
})

/** Un registro vero con un giro finto per sessione: `finisci(i)` lo chiude, `input(i)` è ciò che il kernel ha ricevuto. */
function scena(t, cartellaStore = mkdtempSync(join(tmpdir(), 'talos-c09-store-'))) {
    const giri = []
    const registro = createSessionRegistry({
        cartellaStore, modello: 'm', chiave: 'k', guardaWorkspaceFn: () => () => {}, cartellaEsisteFn: () => true,
        preparaEsecuzioneFn: () => ({ cartella: cartellaStore, comandoProva: 'npm test', task: { id: 'task', consegna: 'ciao' } }),
        avviaSessioneFn: (input) => new Promise((risolvi) => {
            giri.push({ input, risolvi })
            input.onEvento({ type: 'RunStarted', threadId: 't', runId: `r${giri.length}`, input: input.task }) // come agent-service.mjs:686
        }),
    })
    const finisci = (i) => { giri[i].input.onEvento({ type: 'RunFinished', threadId: 't', runId: `r${i + 1}` }); giri[i].risolvi({ comeFinita: 'concluso' }) }
    t.after(async () => { giri.forEach((_, i) => { try { finisci(i) } catch { /* già chiuso */ } }); await registro.chiudi?.(); await new Promise((r) => setTimeout(r, 30)); rimuoviCartellaDiProva(cartellaStore) })
    return { registro, giri, finisci, cartellaStore }
}
const attesa = (ms = 30) => new Promise((r) => setTimeout(r, ms))

test('BOLLA-02 resume: the display copy rides on the turn (RunStarted.input.bolla), the model gets only the text; without one, no key', async (t) => {
    const { registro, giri, finisci } = scena(t)
    const { sessionId } = registro.avvia('task')
    await attesa(); finisci(0); await attesa()
    assert.equal(registro.resume(sessionId, PER_IL_MODELLO, [], { bolla: BOLLA }).erroreAvvio, undefined)
    await attesa()
    assert.deepEqual(giri[1].input.task.bolla, BOLLA)
    assert.equal(giri[1].input.task.consegna, PER_IL_MODELLO, 'the model text is unchanged')
    const avvio = registro.esporta(sessionId).eventi.filter((e) => e.type === 'RunStarted').at(-1)
    assert.deepEqual(avvio.input?.bolla, BOLLA)
    finisci(1); await attesa()
    assert.equal(registro.resume(sessionId, 'solo testo').erroreAvvio, undefined)
    await attesa()
    assert.equal(Object.hasOwn(giri[2].input.task, 'bolla'), false, 'AL CONTRARIO: no display copy, no key')
})

test('BOLLA-03 queue: kept with the queued message, shown in the queue state, saved, restored after a restart, and delivered with it', async (t) => {
    const cartellaStore = mkdtempSync(join(tmpdir(), 'talos-c09-coda-'))
    const prima = scena(t, cartellaStore)
    const { sessionId } = prima.registro.avvia('task')
    await attesa()
    const accodata = prima.registro.accodaMessaggio(sessionId, PER_IL_MODELLO, [], { bolla: BOLLA })
    assert.equal(accodata.ok, true)
    assert.deepEqual(accodata.coda.voci[0].bolla, BOLLA, 'the queue state carries it')
    assert.deepEqual(prima.registro.accodaMessaggio(sessionId, 'senza').coda.voci[1].bolla, undefined, 'AL CONTRARIO: a plain message has none')
    await attesa(80)
    // un altro registro sulla stessa cartella: la coda torna con la sua bolla
    const dopo = createSessionRegistry({ cartellaStore, modello: 'm', chiave: 'k', guardaWorkspaceFn: () => () => {}, cartellaEsisteFn: () => true })
    t.after(async () => { await dopo.chiudi?.() })
    await dopo.ripristina()
    const ripristinata = dopo.statoCoda?.(sessionId) ?? null
    const voci = ripristinata?.voci ?? (await dopo.leggiCoda?.(sessionId))?.voci
    assert.ok(Array.isArray(voci), 'premise: the restored queue is readable')
    assert.deepEqual(voci[0].bolla, BOLLA, 'restored with its display copy')
    // consegna dal vivo, dal kernel del primo registro
    prima.giri[0].input.codaMessaggiFn()
    const consegna = prima.registro.esporta(sessionId).eventi.find((e) => e.type === 'QueuedMessageDelivered')
    assert.equal(consegna?.testo, PER_IL_MODELLO, 'the model text is what the kernel gets')
    assert.deepEqual(consegna?.bolla, BOLLA, 'and the replay has the display copy')
})

test('BOLLA-05 (review N1) a display copy is kept only if the model text starts with its sentence: it can only drop the attachment block', async (t) => {
    assert.deepEqual(bollaPerLaConsegna(BOLLA, PER_IL_MODELLO), BOLLA)
    assert.equal(bollaPerLaConsegna({ ...BOLLA, testo: 'un\'altra frase' }, PER_IL_MODELLO), null, 'a different sentence is not kept')
    assert.deepEqual(bollaPerLaConsegna({ testo: '', allegati: BOLLA.allegati }, PER_IL_MODELLO), { testo: '', allegati: BOLLA.allegati }, 'only chips: nothing to contradict')
    const { registro, giri, finisci } = scena(t)
    const { sessionId } = registro.avvia('task')
    await attesa()
    assert.equal(registro.accodaMessaggio(sessionId, PER_IL_MODELLO, [], { bolla: { ...BOLLA, testo: 'falso' } }).coda.voci[0].bolla, undefined, 'queue: refused copy, message still queued')
    finisci(0); await attesa()
    registro.svuotaCoda(sessionId, {})
    assert.equal(registro.resume(sessionId, PER_IL_MODELLO, [], { bolla: { ...BOLLA, testo: 'falso' } }).erroreAvvio, undefined)
    await attesa()
    assert.equal(Object.hasOwn(giri.at(-1).input.task, 'bolla'), false, 'resume: refused copy, turn still starts')
})

async function server(t, registro) {
    const app = createHttpApp({ staticHandler: async () => null, sessionRegistry: registro, listaTaskDisponibili: () => [] })
    const srv = createServer(app)
    await new Promise((r) => srv.listen(0, '127.0.0.1', r))
    t.after(() => new Promise((r) => srv.close(r)))
    return `http://127.0.0.1:${srv.address().port}`
}
const post = (url, corpo) => fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corpo) })

test('BOLLA-04 HTTP: `bolla` passes the strict body validators of queue and resume; a malformed one is dropped, never an error', async (t) => {
    const { registro, giri, finisci } = scena(t)
    const base = await server(t, registro)
    const { sessionId } = registro.avvia('task')
    await attesa()
    const coda = await post(`${base}/api/v1/sessions/${sessionId}/queue`, { messaggio: PER_IL_MODELLO, bolla: BOLLA })
    assert.equal(coda.status, 200)
    assert.deepEqual((await coda.json()).data.coda.voci[0].bolla, BOLLA)
    const storta = await post(`${base}/api/v1/sessions/${sessionId}/queue`, { messaggio: 'due', bolla: 'non una bolla' })
    assert.equal(storta.status, 200, 'a malformed display copy does not break the send')
    assert.equal((await storta.json()).data.coda.voci[1].bolla, undefined)
    assert.equal((await post(`${base}/api/v1/sessions/${sessionId}/queue`, { messaggio: 'tre', intruso: 1 })).status, 400, 'AL CONTRARIO: the validator is still strict for anything else')
    registro.svuotaCoda(sessionId, {}); registro.svuotaCoda(sessionId, {})
    finisci(0); await attesa()
    const ripresa = await post(`${base}/api/v1/sessions/${sessionId}/resume`, { messaggio: PER_IL_MODELLO, bolla: BOLLA })
    assert.equal(ripresa.status, 200)
    await attesa()
    assert.deepEqual(giri.at(-1).input.task.bolla, BOLLA)
})

test('BOLLA-06 the session title in the list comes from the person\'s sentence, not from the model text; without a copy, as before', async (t) => {
    const cartellaStore = mkdtempSync(join(tmpdir(), 'talos-c09-titolo-'))
    const avvii = []
    const registro = createSessionRegistry({
        cartellaStore, modello: 'm', chiave: 'k', guardaWorkspaceFn: () => () => {}, cartellaEsisteFn: () => true,
        preparaEsecuzioneLiberaFn: (_c, { cartellaLibera, consegna }) => ({ cartella: cartellaLibera, comandoProva: 'npm test', task: { consegna, consegnaCorta: consegna.length > 80 ? `${consegna.slice(0, 77)}...` : consegna } }),
        avviaSessioneFn: (input) => { avvii.push(input); return new Promise(() => {}) },
    })
    t.after(async () => { await registro.chiudi?.({ attesaMassimaMs: 500 }); rimuoviCartellaDiProva(cartellaStore) })
    const conBolla = registro.avviaLibero({ cartellaLibera: cartellaStore, consegna: PER_IL_MODELLO, bolla: BOLLA })
    const senza = registro.avviaLibero({ cartellaLibera: cartellaStore, consegna: PER_IL_MODELLO })
    const soloChip = registro.avviaLibero({ cartellaLibera: cartellaStore, consegna: `\n\nAttachments of this message:\n- nota.txt (C:\\x\\nota.txt)`, bolla: { testo: '', allegati: [{ nome: 'nota.txt' }] } })
    await attesa()
    const titolo = (id) => registro.elenca().find((s) => s.sessionId === id)?.nome
    assert.equal(titolo(conBolla.sessionId), 'guarda questo')
    assert.equal(avvii[0].task.consegna, PER_IL_MODELLO, 'the model text is unchanged')
    assert.match(titolo(senza.sessionId), /^guarda questo/u, 'AL CONTRARIO: no copy, the title as before')
    assert.match(titolo(senza.sessionId), /Attachments/u, 'premise: before, the title carried the model text')
    assert.equal(titolo(soloChip.sessionId), 'nota.txt', 'only attachments: the file names')
})
