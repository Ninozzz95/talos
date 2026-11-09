/*
 * Fase 8 «Impostazioni dalla chat» (owner 01/11/2026) — `app_settings` lungo TUTTO il filo (lezione del 17/10 e del 21/10: un'opzione nuova
 * si è persa due volte nell'inoltro campo per campo): dalla rotta vera `POST /api/v1/sessions` al registro, al servizio, al kernel vero con
 * un fornitore finto, fino all'impostazione cambiata nella conversazione e all'evento della sessione con l'origine «modello».
 * E il lato finestra del canale: il flusso del PC porta l'evento, la finestra risponde, la persona annulla.
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdir, mkdtemp } from 'node:fs/promises'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { talosLavora } from '../src/kernel/talosHarness.mjs'
import { createSessionRegistry } from '../src/session-registry.mjs'
import { createHttpApp } from '../src/http-app.mjs'
import { avviaSessione } from '../src/agent-service.mjs'
import { creaServizioImpostazioni } from '../src/impostazioni/servizio-impostazioni.mjs'
import { creaCopiaFinestra } from '../src/impostazioni/copia-finestra.mjs'
import { creaFonteSessione } from '../src/impostazioni/fonti-impostazioni.mjs'
import { rimuoviCartellaDiProvaAttesa } from './aiuto/rimuovi-cartella-di-prova.mjs'

async function ascolta(t, opzioni) {
    const server = createServer(createHttpApp({ senzaGettone: 'prove', staticHandler: async () => null, ...opzioni }))
    await new Promise((ok, ko) => { server.once('error', ko); server.listen(0, '127.0.0.1', ok) })
    t.after(() => new Promise((ok) => { server.closeAllConnections?.(); server.close(() => ok()) }))
    return `http://127.0.0.1:${server.address().port}`
}
const enc = new TextEncoder()
const flusso = (fotogrammi) => new Response(new ReadableStream({ start(ctl) { for (const x of fotogrammi) ctl.enqueue(enc.encode(`data: ${JSON.stringify(x)}\n\n`)); ctl.enqueue(enc.encode('data: [DONE]\n\n')); ctl.close() } }))
const chiamata = (id, argomenti) => flusso([{ choices: [{ delta: { tool_calls: [{ index: 0, id, function: { name: 'app_settings', arguments: JSON.stringify(argomenti) } }] } }] }])

async function giroVero(t, { impostazioniFn }) {
    const radice = await mkdtemp(join(tmpdir(), 'talos-imp-filo-'))
    t.after(() => rimuoviCartellaDiProvaAttesa(radice))
    const progetto = join(radice, 'progetto')
    await mkdir(progetto, { recursive: true })
    const f = { offerti: [], corpi: [], chiamate: 0 }
    let registro = null
    const impostazioniApp = impostazioniFn(() => registro)
    f.fetchDiRete = async (_url, init) => {
        const corpo = init?.body ?? '{}'
        f.corpi.push(corpo)
        f.offerti.push((JSON.parse(corpo).tools ?? []).map((a) => a.function?.name).filter(Boolean))
        const n = f.chiamate++
        if (n === 0) return chiamata('call-list', { action: 'list', section: 'conversation' })
        if (n === 1) {
            const rev = Number(/Revision (\d+)/u.exec(corpo)?.[1])
            return chiamata('call-set', { action: 'set', expected_revision: rev, changes: [{ key: 'conversation.reasoningEffort', value: 'low' }] })
        }
        return flusso([{ choices: [{ delta: { content: 'Fatto.' } }] }])
    }
    registro = createSessionRegistry({
        modello: 'm', chiave: 'k', guardaWorkspaceFn: () => () => {}, ...(impostazioniApp ? { impostazioniApp } : {}),
        preparaEsecuzioneFn: (taskId) => ({ cartella: progetto, comandoProva: 'npm test', task: { id: taskId, consegna: 'metti lo sforzo basso' } }),
        avviaSessioneFn: (input) => avviaSessione({ ...input, talosLavoraFn: (k) => talosLavora({ ...k, fetchDiRete: f.fetchDiRete }) }),
    })
    const base = await ascolta(t, { sessionRegistry: registro, listaTaskDisponibili: () => [{ id: 'sconto-a-scaglioni', progetto: 'p', difficolta: 1, consegnaCorta: 'x' }] })
    const risposta = await fetch(`${base}/api/v1/sessions`, { method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ taskId: 'sconto-a-scaglioni', permessi: 'Full access', reasoning: { effort: 'high' } }) })
    assert.equal(risposta.status, 200)
    const { sessionId } = (await risposta.json()).data
    const eventi = []
    t.after(registro.iscriviti(sessionId, (e) => eventi.push(e)))
    const inizio = Date.now()
    while (!eventi.some((e) => e.type === 'RunFinished' || e.type === 'RunError') && Date.now() - inizio < 10_000) await new Promise((r) => setTimeout(r, 20))
    return { f, registro, sessionId, eventi }
}

test('IMP-FILO-01: dalla rotta vera al kernel vero — il modello legge le impostazioni, cambia lo sforzo, e l\'evento della sessione dice «modello»', async (t) => {
    const { f, registro, sessionId, eventi } = await giroVero(t, {
        impostazioniFn: (registroFn) => creaServizioImpostazioni({ fonti: { sessione: creaFonteSessione(registroFn) }, copiaFinestra: creaCopiaFinestra() }),
    })
    const diagnosi = JSON.stringify(eventi.map((e) => (e.type === 'RunError' ? `${e.code}: ${e.message}` : e.name ?? e.type)))
    const lista = eventi.find((e) => e.type === 'ToolCallResult' && e.toolCallId === 'call-list')
    assert.ok(lista, diagnosi)
    assert.match(lista.content, /- conversation\.reasoningEffort = "high"/u)
    const set = eventi.find((e) => e.type === 'ToolCallResult' && e.toolCallId === 'call-set')
    assert.ok(set, diagnosi)
    assert.match(set.content, /^conversation\.reasoningEffort: "high" → "low" \(this conversation\)\. Receipt set-/u)
    assert.match(set.content, /Full access: done without asking the person\./u, 'costo in Accesso pieno: niente carta, e l\'esito lo dice')
    assert.equal(registro.impostazioniCorrenti(sessionId).reasoning.effort, 'low')
    const cambio = eventi.find((e) => e.name === 'talos.impostazioni-sessione' && e.value?.origine?.tipo === 'modello')
    assert.ok(cambio, 'l\'evento della sessione porta l\'origine «modello»')
    assert.deepEqual(cambio.value.origine, { tipo: 'modello', sessionId, dispositivoId: null })
    assert.ok(f.offerti[0].includes('app_settings') || f.corpi[0].includes('app_settings'), 'offerto davanti o dal ponte')
})

test('IMP-FILO-02 (CLI 3): un servizio non pronto (nessuna fonte) non lega l\'ospite — l\'attrezzo non c\'è, nemmeno nel ponte', async (t) => {
    const { f } = await giroVero(t, { impostazioniFn: () => creaServizioImpostazioni({}) })
    for (const corpo of f.corpi) assert.doesNotMatch(JSON.stringify(JSON.parse(corpo).tools ?? []), /app_settings/u)
    assert.match(f.corpi[1], /app_settings is not available in this session|is not available/u, 'chiamato lo stesso: un rifiuto onesto')
})

test('IMP-ROTTE-01: le rotte della finestra — guardia d\'origine, catalogo, copia, flusso del PC con l\'evento, risposta della finestra, Annulla della persona', async (t) => {
    const copia = creaCopiaFinestra()
    const servizio = creaServizioImpostazioni({ copiaFinestra: copia, attesaFinestraMs: 2_000 })
    const base = await ascolta(t, { impostazioniApp: servizio })
    const origine = { origin: base, 'content-type': 'application/json' }
    assert.equal((await fetch(`${base}/api/v1/app-settings/catalog`)).status, 403, 'senza origine né gettone')
    const catalogo = (await (await fetch(`${base}/api/v1/app-settings/catalog`, { headers: origine })).json()).data
    assert.ok(catalogo.voci.some((v) => v.key === 'appearance.theme' && v.where === 'window'))
    assert.equal(catalogo.voci.some((v) => v.key === 'conversation.model'), false, 'senza la fonte della conversazione la voce non c\'è')
    const scritta = await fetch(`${base}/api/v1/app-settings/window`, { method: 'POST', headers: origine, body: JSON.stringify({ valori: { themePreset: 'calm' } }) })
    assert.equal((await scritta.json()).data.revisione, 1)
    assert.equal((await fetch(`${base}/api/v1/app-settings/window`, { method: 'POST', headers: origine, body: JSON.stringify({ altro: 1 }) })).status, 400)
    /* il flusso del PC: l'evento arriva alla finestra, che risponde */
    const ferma = new AbortController()
    t.after(() => ferma.abort())
    const sse = await fetch(`${base}/api/v1/remote/events`, { headers: { origin: base }, signal: ferma.signal })
    assert.equal(sse.status, 200)
    const lettore = sse.body.getReader()
    const fn = servizio.perLaSessione({ sessionId: null })
    const rev = Number(/Revision (\d+)/u.exec((await fn('app_settings', { action: 'list', section: 'appearance' }, { fase: 'esegui' })).testo)[1])
    const inCorso = fn('app_settings', { action: 'set', expected_revision: rev, changes: [{ key: 'appearance.theme', value: 'paper' }] }, { fase: 'esegui' })
    let testo = ''
    let evento = null
    const limite = Date.now() + 3_000
    while (!evento && Date.now() < limite) {
        const { value, done } = await lettore.read()
        if (done) break
        testo += new TextDecoder().decode(value)
        for (const blocco of testo.split('\n\n')) {
            const dati = blocco.split('\n').find((l) => l.startsWith('data: '))
            if (!dati) continue
            const e = JSON.parse(dati.slice(6))
            if (e.type === 'talos.impostazioni-finestra') evento = e
        }
    }
    assert.ok(evento, testo)
    assert.equal(evento.destinatario, 'finestre-pc')
    assert.deepEqual(evento.valori, { themePreset: 'paper' })
    const applicata = await fetch(`${base}/api/v1/app-settings/window/applied`, { method: 'POST', headers: origine, body: JSON.stringify({ richiestaId: evento.richiestaId, applicati: { themePreset: 'paper' } }) })
    assert.deepEqual((await applicata.json()).data, { accettata: true })
    const esito = await inCorso
    assert.match(esito.testo, /The open window applied it\./u)
    /* l'Annulla della persona */
    const receiptId = /Receipt (set-\w+)/u.exec(esito.testo)[1]
    const cambi = (await (await fetch(`${base}/api/v1/app-settings/changes`, { headers: origine })).json()).data.ricevute
    assert.equal(cambi[0].id, receiptId)
    const annulla = await fetch(`${base}/api/v1/app-settings/undo`, { method: 'POST', headers: origine, body: JSON.stringify({ receiptId }) })
    assert.equal(annulla.status, 200)
    assert.equal((await copia.leggi()).valori.themePreset, 'calm')
    const ancora = await fetch(`${base}/api/v1/app-settings/undo`, { method: 'POST', headers: origine, body: JSON.stringify({ receiptId }) })
    assert.equal(ancora.status, 409)
    assert.equal((await ancora.json()).error?.code ?? null, 'SETTINGS_UNDO_REFUSED')
    ferma.abort()
})

test('IMP-ROTTE-02: senza servizio le rotte dicono 503, e il flusso del PC resta com\'era (503 senza remoto né notifiche)', async (t) => {
    const base = await ascolta(t, {})
    const origine = { origin: base }
    assert.equal((await fetch(`${base}/api/v1/app-settings/catalog`, { headers: origine })).status, 503)
    assert.equal((await fetch(`${base}/api/v1/remote/events`, { headers: origine })).status, 503)
})
