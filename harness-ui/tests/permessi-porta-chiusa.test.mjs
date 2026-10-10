/*
 * Riga del bugfixer (10/10/2026, owner «Porta + kernel chiuso») — UNA PAROLA DI PERMESSO SCONOSCIUTA.
 *   Prima: le rotte HTTP la rifiutavano, il registro no (`aggiornaImpostazioni(id, {permessi:'Boh'})` → `{ok:true}`), e
 *   `livelloDaPermessi('Boh')` dava `undefined`, che il kernel legge come NESSUN vincolo. Ora: la porta del registro la rifiuta
 *   (avvio e cambio) e una parola già salvata (dati vecchi) si legge «Sola lettura». ⛔ Il kernel NON cambia in questo commit:
 *   la CLI e molte prove gli passano parole che non sono livelli (le parole della pillola, «completo») col senso di «nessun
 *   vincolo», e chiuderle è una decisione dell'owner. Come Hermes (`gateway/hosted_room_execution_policy.py:53-55` rifiuta; `tools/approval_context.py:208-222`
 *   ripiega sulla modalità più stretta).
 */
import assert from 'node:assert/strict'
import { existsSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'

import { createSessionRegistry, SCHEMA_SESSIONE } from '../src/session-registry.mjs'
import { talosLavora } from '../src/kernel/talosHarness.mjs'
import { rimuoviCartellaDiProva } from './aiuto/rimuovi-cartella-di-prova.mjs'

const PAROLE = ['Read only', 'Research', 'On request', 'Workspace write', 'Full access']

function registroDiProva(t, cartellaStore = mkdtempSync(join(tmpdir(), 'talos-porta-'))) {
    const avviati = []
    const registro = createSessionRegistry({
        cartellaStore, modello: 'm', chiave: 'k', cartellaEsisteFn: () => true, guardaWorkspaceFn: () => () => {},
        preparaEsecuzioneFn: () => ({ cartella: cartellaStore, comandoProva: 'npm test', task: { id: 'task', consegna: 'lavora' } }),
        avviaSessioneFn: async (input) => {
            avviati.push(input)
            input.onEvento({ type: 'RunStarted', threadId: 't', runId: `r${avviati.length}` })
            input.onEvento({ type: 'RunFinished', threadId: 't', runId: `r${avviati.length}` })
            return { comeFinita: 'concluso' }
        },
    })
    t.after(async () => {
        await registro.chiudi?.()
        await new Promise((r) => setTimeout(r, 50))
        rimuoviCartellaDiProva(cartellaStore)
    })
    return { registro, avviati, cartellaStore }
}

test('PORTA-01 AVVIO: an unknown word is refused before any run starts; the five words and «not chosen» start', async (t) => {
    const { registro, avviati } = registroDiProva(t)
    for (const parola of ['Boh', 'Super Admin', 'full access', 42]) {
        const esito = registro.avvia('task', { permessiScelto: parola })
        assert.equal(esito.code, 'PERMISSIONS_INVALID', String(parola))
        assert.match(esito.erroreAvvio, /"Read only", "Research", "On request", "Workspace write", "Full access"/)
    }
    assert.equal(avviati.length, 0, 'no run for a refused word')
    for (const parola of [...PAROLE, null]) {
        const esito = registro.avvia('task', { permessiScelto: parola })
        assert.equal(esito.erroreAvvio, undefined, String(parola))
    }
    assert.equal(avviati.length, PAROLE.length + 1)
    assert.equal(avviati.at(-1).livelloAccesso, 'scrittura-progetto', 'not chosen = Workspace write, as always')
})

test('PORTA-02 CAMBIO: an unknown word, and null, are refused and the session keeps its permissions; the five words pass', async (t) => {
    const { registro } = registroDiProva(t)
    const { sessionId } = registro.avvia('task', { permessiScelto: 'Read only' })
    await new Promise((r) => setTimeout(r, 20))
    for (const parola of ['Boh', null, '', 'read only']) {
        const esito = await registro.aggiornaImpostazioni(sessionId, { permessi: parola })
        assert.equal(esito.code, 'PERMISSIONS_INVALID', JSON.stringify(parola))
        assert.equal(registro.elenca().find((s) => s.sessionId === sessionId).permessi, 'Read only', 'unchanged')
    }
    for (const parola of PAROLE) assert.deepEqual(await registro.aggiornaImpostazioni(sessionId, { permessi: parola }), { ok: true }, parola)
})

test('PORTA-03 DATO VECCHIO: a session saved with an unknown word restarts «Read only»; without a word, «Workspace write»', async (t) => {
    const cartellaStore = mkdtempSync(join(tmpdir(), 'talos-porta-vecchia-'))
    const righe = (id, permessi) => [
        { tipo: 'intestazione', schema: SCHEMA_SESSIONE, sessionId: id, taskId: 'libero:x', cartella: cartellaStore, task: { consegna: 'vecchia', consegnaCorta: 'vecchia' },
            avviataAlle: '2026-10-01T10:00:00.000Z', modello: 'm', ...(permessi === undefined ? {} : { permessi }), modalitaOperativa: 'normale' },
        { tipo: 'impostazioni-sessione', modello: 'm', modelloPlanner: null, reasoning: null, ...(permessi === undefined ? {} : { permessi }), modalitaOperativa: 'normale', permessiPerAttrezzo: null, modelId: 'm' },
        { type: 'RunStarted', threadId: 't1', runId: 'r1', _sequenza: 1 },
        { type: 'RunFinished', threadId: 't1', runId: 'r1', _sequenza: 2 },
    ].map((r) => JSON.stringify(r)).join('\n') + '\n'
    writeFileSync(join(cartellaStore, 'sess-boh.jsonl'), righe('sess-boh', 'Boh'))
    writeFileSync(join(cartellaStore, 'sess-senza.jsonl'), righe('sess-senza', undefined))
    const { registro, avviati } = registroDiProva(t, cartellaStore)
    await registro.ripristina()
    assert.equal(registro.elenca().find((s) => s.sessionId === 'sess-boh')?.permessi, 'Boh', 'premise: the old word was restored as it is')
    assert.equal(registro.resume('sess-boh', 'continua').erroreAvvio, undefined)
    assert.equal(avviati.at(-1).livelloAccesso, 'lettura', 'an unknown saved word opens nothing')
    assert.equal(registro.resume('sess-senza', 'continua').erroreAvvio, undefined)
    assert.equal(avviati.at(-1).livelloAccesso, 'scrittura-progetto', 'no word = the default of always')
    await new Promise((r) => setTimeout(r, 50)) // il giro della ripresa si chiude
    const fork = registro.forka('sess-boh')
    assert.equal(fork.erroreAvvio, undefined, 'a fork of the old session is not refused at the door')
    assert.equal(registro.elenca().find((s) => s.sessionId === fork.sessionId)?.permessi, 'Read only', 'it inherits the word closed')
})

/** Un giro vero del kernel: quali attrezzi offre, e che cosa succede a una scrittura. */
async function giro(t, livelloAccesso) {
    const cartella = mkdtempSync(join(tmpdir(), 'talos-porta-kernel-'))
    t.after(() => rimuoviCartellaDiProva(cartella))
    let offerti = null
    let n = 0
    const r = await talosLavora({
        cartella, task: { consegna: 'scrivi' }, modello: 'f', chiave: 'k', giriMassimi: 3,
        ...(livelloAccesso === 'ASSENTE' ? {} : { livelloAccesso }),
        fetchDiRete: async (_url, init) => {
            offerti ??= (JSON.parse(init.body).tools ?? []).map((a) => a.function?.name)
            const message = n++ === 0
                ? { role: 'assistant', content: null, tool_calls: [{ id: 'c1', type: 'function', function: { name: 'scrivi', arguments: JSON.stringify({ percorso: 'a.txt', contenuto: 'x' }) } }] }
                : { role: 'assistant', content: 'fatto' }
            return new Response(JSON.stringify({ choices: [{ message, finish_reason: n === 1 ? 'tool_calls' : 'stop' }] }), { headers: { 'Content-Type': 'application/json' } })
        },
    })
    return { offerti, esito: String(r.messaggiFinali.find((m) => m.role === 'tool')?.content ?? ''), scritto: existsSync(join(cartella, 'a.txt')) }
}

test('PORTA-05 IL KERNEL NON CAMBIA: an ABSENT level stays as always (the bench passes none) and a real level is kept', async (t) => {
    for (const livello of ['ASSENTE', 'scrittura-progetto', 'accesso-pieno']) {
        const { offerti, scritto } = await giro(t, livello)
        assert.equal(offerti.includes('scrivi'), true, `${livello}: scrivi is offered`)
        assert.equal(scritto, true, `${livello}: the file was written`)
    }
})
