/*
 * ⛔⛔⛔ F-020 / F-014 / F-015 (secondo stress test della CLI, 03/10/2026; owner: «Come Claude Code, completo»; proposta
 * approvata dal desktop il 03/10). Causa misurata sui dati veri della sessione dell'audit (TALOS-CLI/sessions/2303abbb….jsonl):
 * uno Stop alle 17:44:25 con una voce `agent-dialogue` in coda mise la coda `inPausa:true`; i risultati di due figli arrivati
 * dopo (17:48, 17:50) restarono lì per sempre — `codaMessaggiFn` non dà niente a una coda in pausa e un `resume` della persona
 * non la scioglieva (solo `accodaMessaggio` lo faceva). Il padre non poteva nemmeno sapere che i figli avevano finito.
 *
 *   K1 — un messaggio della persona (`resume` con testo) scioglie la pausa, la stessa regola di `accodaMessaggio`;
 *   K2 — uno Stop mette in pausa solo ciò che ha scritto la persona; risultati e domande dei figli no, e uno Stop della persona
 *        ammette il risveglio coi risultati (Claude Code, interactive-mode: Esc «keeps what you queued and sends it right away»);
 *   K3 — `list_children` (sola lettura) e `stop_child` per il modello, come Codex `list_agents`/`interrupt_agent`
 *        (`core/src/tools/handlers/multi_agents_spec.rs` @c73775f);
 *   K4 — `compito` tagliato nell'involucro del risultato lo dice con «…».
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createSessionRegistry } from '../src/session-registry.mjs'
import { attendiScritture } from '../src/session-store.mjs'
import { talosLavora, migraPermessiPerAttrezzo } from '../src/kernel/talosHarness.mjs'
import { rimuoviCartellaDiProva } from './aiuto/rimuovi-cartella-di-prova.mjs'

function runtimeControllabile() {
    const runs = []
    return {
        runs,
        avviaSessioneFn(input) {
            let resolve
            const promise = new Promise((r) => { resolve = r })
            const index = runs.length
            runs.push({ input, resolve })
            input.onEvento({ type: 'RunStarted', threadId: `t${index}`, runId: `r${index}` })
            return promise
        },
        fine(index, esito = 'concluso') {
            const run = runs[index]
            run.input.onEvento({ type: esito === 'concluso' ? 'RunFinished' : 'RunError', threadId: `t${index}`, runId: `r${index}`, ...(esito === 'fermato' ? { code: 'fermato' } : {}) })
            run.resolve({ ok: esito === 'concluso', esito: { detto: `risposta ${index}`, comeFinita: esito,
                messaggiFinali: [{ role: 'user', content: 'avvia le figlie' }, { role: 'assistant', content: `risposta ${index}` }] } })
        },
    }
}

async function scena(t, { consegna = 'avvia le figlie' } = {}) {
    const cartellaStore = mkdtempSync(join(tmpdir(), 'talos-figli-coda-'))
    const runtime = runtimeControllabile()
    const registry = createSessionRegistry({ cartellaStore, avviaSessioneFn: runtime.avviaSessioneFn,
        preparaEsecuzioneFn: () => ({ cartella: '/tmp/x', comandoProva: 'npm test', task: { id: 'task', consegna } }),
        modello: 'm', chiave: 'k', cartellaEsisteFn: () => true })
    t.after(async () => {
        await registry.chiudi?.()
        try { await attendiScritture({ cartellaStore }) } catch { /* pulizia comunque */ }
        rimuoviCartellaDiProva(cartellaStore)
    })
    const { sessionId } = registry.avvia('task')
    return { registry, runtime, sessionId }
}
const pausa = (registry, sessionId) => registry.statoCoda(sessionId).inPausa

// ─────────────────────────────── K2 — lo Stop non ferma i figli ───────────────────────────────

test('K2: uno Stop con in coda solo il risultato di un figlio NON mette in pausa, e il padre si risveglia con lui', async (t) => {
    const { registry, runtime, sessionId } = await scena(t)
    await runtime.runs[0].input.onDelega('figlia', '/tmp/uno')
    runtime.fine(0)
    await registry.attendiAssestamento(sessionId)
    runtime.fine(1)
    assert.equal(registry.ferma(sessionId), true)
    assert.equal(pausa(registry, sessionId), false, 'il risultato di un figlio non è una parola della persona: non si ferma')
    await t.waitFor(() => assert.equal(runtime.runs.length, 3, 'il padre si risveglia col risultato'))
    assert.equal(runtime.runs[2].input.task.origine, 'delega')
})

test('K2: uno Stop durante il giro del padre, poi il figlio finisce: niente pausa, il padre si risveglia col risultato', async (t) => {
    const { registry, runtime, sessionId } = await scena(t)
    await runtime.runs[0].input.onDelega('figlia', '/tmp/uno')
    assert.equal(registry.ferma(sessionId), true)
    runtime.fine(0, 'fermato')
    await registry.attendiAssestamento(sessionId)
    runtime.fine(1)
    await t.waitFor(() => assert.equal(runtime.runs.length, 3, 'uno Stop della persona ammette il risveglio coi figli'))
    assert.equal(pausa(registry, sessionId), false)
})

test('K2: uno Stop col risultato del figlio GIÀ in coda (padre al lavoro) non mette in pausa, e il padre si risveglia', async (t) => {
    const { registry, runtime, sessionId } = await scena(t)
    await runtime.runs[0].input.onDelega('figlia', '/tmp/uno')
    runtime.fine(1)
    await t.waitFor(() => assert.equal(registry.statoCoda(sessionId).voci.length, 1, 'il risultato aspetta: il padre è nel suo giro'))
    assert.equal(registry.ferma(sessionId), true)
    assert.equal(pausa(registry, sessionId), false, 'in coda ci sono solo risultati di figli: niente pausa')
    runtime.fine(0, 'fermato')
    await t.waitFor(() => assert.equal(runtime.runs.length, 3))
})

test('K2 AL CONTRARIO: un turno FALLITO (non fermato dalla persona) lascia i risultati in coda, senza risveglio (F-010-FAILED-PARENT)', async (t) => {
    const { registry, runtime, sessionId } = await scena(t)
    await runtime.runs[0].input.onDelega('figlia', '/tmp/uno')
    runtime.fine(0, 'errore')
    await registry.attendiAssestamento(sessionId)
    runtime.fine(1)
    await new Promise((r) => setTimeout(r, 80))
    assert.equal(runtime.runs.length, 2)
    assert.equal(registry.statoCoda(sessionId).voci.length, 1)
})

test('K2 AL CONTRARIO: uno Stop con un messaggio DELLA PERSONA in coda la mette ancora in pausa (Hermes `haltRun`)', async (t) => {
    const { registry, runtime, sessionId } = await scena(t)
    assert.equal(registry.accodaMessaggio(sessionId, 'poi fai anche questo').ok, true)
    assert.equal(registry.ferma(sessionId), true)
    assert.equal(pausa(registry, sessionId), true)
    runtime.fine(0, 'fermato')
})

// ─────────────────────────────── K1 — un messaggio della persona scioglie la pausa ───────────────────────────────

test('K1: dopo uno Stop con la coda in pausa, un messaggio della persona (resume) la scioglie', async (t) => {
    const { registry, runtime, sessionId } = await scena(t)
    assert.equal(registry.accodaMessaggio(sessionId, 'poi fai anche questo').ok, true)
    registry.ferma(sessionId)
    runtime.fine(0, 'fermato')
    await registry.attendiAssestamento(sessionId)
    assert.equal(pausa(registry, sessionId), true)
    const ripresa = registry.resume(sessionId, 'riprendi da dove eri')
    assert.equal(ripresa.erroreAvvio, undefined, ripresa.erroreAvvio)
    assert.equal(pausa(registry, sessionId), false, 'la persona ha ripreso a parlare: la coda torna a scorrere')
    runtime.fine(1)
})

test('K1 AL CONTRARIO: una ripresa rifiutata lascia la pausa com\'era', async (t) => {
    const { registry, runtime, sessionId } = await scena(t)
    assert.equal(registry.accodaMessaggio(sessionId, 'poi fai anche questo').ok, true)
    registry.ferma(sessionId)
    assert.equal(pausa(registry, sessionId), true)
    const rifiutata = registry.resume(sessionId, 'ancora in corso')
    assert.ok(rifiutata.erroreAvvio, 'il giro è ancora aperto: la ripresa si rifiuta')
    assert.equal(pausa(registry, sessionId), true)
    runtime.fine(0, 'fermato')
})

// ─────────────────────────────── K4 — il compito tagliato lo dice ───────────────────────────────

test('K4: nell\'involucro del risultato un compito oltre 240 caratteri finisce con «…»; uno corto resta intero', async (t) => {
    const lungo = 'Raccogli ALMENO 40 riferimenti reali in 4 gruppi da 10: '.repeat(8).trim()
    const { registry, runtime, sessionId } = await scena(t)
    await runtime.runs[0].input.onDelega(lungo, '/tmp/uno')
    await runtime.runs[0].input.onDelega('compito corto', '/tmp/due')
    runtime.fine(0)
    await registry.attendiAssestamento(sessionId)
    runtime.fine(1)
    runtime.fine(2)
    await t.waitFor(() => assert.equal(runtime.runs.length, 4))
    const compiti = runtime.runs[3].input.task.risultatiDelega.map((r) => JSON.parse(r.testo.slice(r.testo.indexOf('{'))).compito)
    const tagliato = compiti.find((c) => c.startsWith('Raccogli'))
    assert.ok(tagliato.endsWith('…'), `il taglio si dichiara: «${tagliato.slice(-20)}»`)
    assert.ok(tagliato.length <= 241)
    assert.ok(compiti.includes('compito corto'))
})

// ─────────────────────────────── K3 — il padre vede e ferma i figli ───────────────────────────────

test('K3: list_children dice per ogni figlio diretto stato, compito e se il risultato aspetta in coda', async (t) => {
    const { registry, runtime, sessionId } = await scena(t)
    await runtime.runs[0].input.onDelega('figlia che lavora', '/tmp/uno')
    await runtime.runs[0].input.onDelega('figlia che finisce', '/tmp/due')
    runtime.fine(2)
    await new Promise((r) => setTimeout(r, 20))
    const elenco = await runtime.runs[0].input.listChildrenFn({})
    assert.equal(elenco.items.length, 2)
    const lavora = elenco.items.find((c) => c.task === 'figlia che lavora')
    const finita = elenco.items.find((c) => c.task === 'figlia che finisce')
    assert.equal(lavora.state, 'running')
    assert.equal(lavora.result, 'none')
    assert.equal(finita.state, 'finished')
    assert.equal(finita.result, 'waiting', 'il padre è ancora nel suo giro: il risultato aspetta in coda')
    assert.equal(typeof lavora.childId, 'string')
    assert.equal(elenco.queue_paused, undefined, 'C5: the busta says queue_paused only when the queue is really stopped')
    runtime.fine(0)
    runtime.fine(1)
})

test('K3: stop_child ferma un figlio diretto che lavora e dice lo stato di prima; un id non suo si rifiuta', async (t) => {
    const { registry, runtime, sessionId } = await scena(t)
    await runtime.runs[0].input.onDelega('figlia', '/tmp/uno')
    const elenco = await runtime.runs[0].input.listChildrenFn({})
    const childId = elenco.items[0].childId
    const fermata = await runtime.runs[0].input.stopChildFn({ childId })
    assert.deepEqual({ childId: fermata.childId, previous: fermata.previous, stopped: fermata.stopped }, { childId, previous: 'running', stopped: true })
    assert.equal(runtime.runs[1].input.segnaleStop.aborted, true, 'il giro del figlio è davvero fermato')
    assert.equal(runtime.runs[0].input.segnaleStop.aborted, false, 'il padre continua')
    const estranea = await runtime.runs[0].input.stopChildFn({ childId: sessionId })
    assert.equal(estranea.code, 'AGENT_CONTROL_FORBIDDEN')
    runtime.fine(1, 'fermato')
    runtime.fine(0)
})

/* ⛔ Review del desktop su 9985e1931 (03/10): `stopChild` passava da `ferma`, che segnava «fermata dalla persona» — così il figlio
   fermato dal MODELLO si risvegliava col risultato del nipote e ripartiva, il contrario di ciò che il padre aveva chiesto. */
test('K3: un figlio fermato dal modello (stop_child) NON riparte quando il nipote fermato consegna il suo esito', async (t) => {
    const { registry, runtime } = await scena(t)
    assert.equal((await runtime.runs[0].input.onDelega('figlio', '/tmp/uno')).esito, 'avviato')
    const nipote = await runtime.runs[1].input.onDelega('nipote', '/tmp/due')
    assert.equal(nipote.esito, 'avviato', JSON.stringify(nipote))
    const childId = (await runtime.runs[0].input.listChildrenFn({})).items[0].childId
    const fermata = await runtime.runs[0].input.stopChildFn({ childId })
    assert.equal(fermata.stopped, true)
    assert.equal(runtime.runs[2].input.segnaleStop.aborted, true, 'anche il nipote è fermato')
    runtime.fine(2, 'fermato')
    await new Promise((r) => setTimeout(r, 80))
    runtime.fine(1, 'fermato')
    await registry.attendiAssestamento(childId)
    await new Promise((r) => setTimeout(r, 80))
    assert.equal(runtime.runs.length, 3, 'nessun giro nuovo per il figlio fermato dal padre')
    runtime.fine(0)
})

/* Il cablaggio nel kernel: offerti, eseguiti, e il permesso dell'attrezzo vale per azione (C5: child_control). */
function reteDiRisposte(...risposte) {
    const chiamate = []
    return {
        chiamate,
        fetch: async (url, opzioni) => {
            const indice = chiamate.length
            chiamate.push({ corpo: JSON.parse(opzioni.body) })
            const scelta = risposte[Math.min(indice, risposte.length - 1)]
            return { ok: true, status: 200, json: async () => ({ choices: [{ message: scelta }], usage: { prompt_tokens: 10, completion_tokens: 5 } }), text: async () => '' }
        },
    }
}
const chiama = (nome, argomenti) => ({ role: 'assistant', content: null, tool_calls: [{ id: 'call_1', function: { name: nome, arguments: JSON.stringify(argomenti) } }] })
const CONCLUSO = { role: 'assistant', content: 'fatto', tool_calls: [] }

async function giroKernel(t, nome, argomenti, extra = {}) {
    const cartella = mkdtempSync(join(tmpdir(), 'talos-figli-kernel-'))
    t.after(() => rimuoviCartellaDiProva(cartella))
    const rete = reteDiRisposte(chiama(nome, argomenti), CONCLUSO)
    const chiamati = []
    await talosLavora({
        cartella, task: { consegna: 'controlla i figli' }, modello: 'x', chiave: 'y', fetchDiRete: rete.fetch,
        strumentiEstesi: ['list_children', 'child_control', 'ask_child'], // C5: era stop_child
        listChildrenFn: async (a) => { chiamati.push(['list', a]); return { children: [{ childId: 'c1', state: 'running' }], queuePaused: false } },
        stopChildFn: async (a) => { chiamati.push(['stop', a]); return { childId: a.childId, previous: 'running', stopped: true } },
        ...extra,
    })
    const offerti = (rete.chiamate[0]?.corpo.tools ?? []).map((x) => x.function?.name)
    const esito = rete.chiamate[1]?.corpo.messages.find((m) => m.role === 'tool')?.content ?? ''
    return { offerti, esito, chiamati }
}

/* C5 (owner 10/10/2026; contratto §2 e §7): `stop_child`, `pause_child` e `resume_child` sono UN attrezzo, `child_control` con
   `action`. Le regole di K3 e della C3 tappa 4 restano azione per azione: il permesso per azione (`child_control:stop`, con ripiego
   sulla chiave di prima, vince la più stretta), la carta col tipo di sempre, e in Piano niente ripresa. */
test('K3: il kernel offre list_children e child_control e li esegue (stop)', async (t) => {
    const lista = await giroKernel(t, 'list_children', {})
    assert.ok(lista.offerti.includes('list_children') && lista.offerti.includes('child_control'), lista.offerti.join(','))
    assert.equal(lista.offerti.includes('stop_child'), false, 'the old name is no longer offered')
    assert.match(lista.esito, /"childId":"c1"/u)
    const stop = await giroKernel(t, 'child_control', { childId: 'c1', action: 'stop' })
    assert.deepEqual(stop.chiamati, [['stop', { childId: 'c1' }]])
    assert.match(stop.esito, /"stopped":true/u)
})

test('K3: in Piano list_children e child_control restano (stop e pausa non toccano il disco); ask_child no', async (t) => {
    const lista = await giroKernel(t, 'list_children', {}, { modalitaOperativa: 'piano' })
    assert.ok(lista.offerti.includes('list_children') && lista.offerti.includes('child_control'), lista.offerti.join(','))
    assert.equal(lista.offerti.includes('ask_child'), false)
    assert.match(lista.esito, /"childId":"c1"/u)
    const stopInPiano = await giroKernel(t, 'child_control', { childId: 'c1', action: 'stop' }, { modalitaOperativa: 'piano' })
    assert.match(stopInPiano.esito, /"stopped":true/u)
})

test('K3: child_control stop rispetta il permesso — «nega» sulla chiave nuova O su quella di prima rifiuta senza fermare niente', async (t) => {
    for (const permessiPerAttrezzo of [{ 'child_control:stop': 'nega' }, { stop_child: 'nega' }, { 'child_control:stop': 'sempre', stop_child: 'nega' }]) {
        const stop = await giroKernel(t, 'child_control', { childId: 'c1', action: 'stop' }, { permessiPerAttrezzo })
        assert.match(stop.esito, /^REFUSED\. the action "stop" of child_control is turned off/u, JSON.stringify(permessiPerAttrezzo))
        assert.deepEqual(stop.chiamati, [])
    }
    // al contrario: il «nega» di UN'azione non tocca le altre
    const pausa = await giroKernel(t, 'child_control', { childId: 'c1', action: 'pause' },
        { ...CONTROLLI_PAUSA, permessiPerAttrezzo: { 'child_control:stop': 'nega' } })
    assert.match(pausa.esito, /"paused":true/u)
})

test('K3: senza nessun canale (nessun registro) i due attrezzi non si offrono', async (t) => {
    const cartella = mkdtempSync(join(tmpdir(), 'talos-figli-kernel-'))
    t.after(() => rimuoviCartellaDiProva(cartella))
    const rete = reteDiRisposte(CONCLUSO)
    await talosLavora({ cartella, task: { consegna: 'x' }, modello: 'x', chiave: 'y', fetchDiRete: rete.fetch, strumentiEstesi: ['list_children', 'child_control'] })
    const offerti = (rete.chiamate[0]?.corpo.tools ?? []).map((x) => x.function?.name)
    assert.equal(offerti.includes('list_children') || offerti.includes('child_control'), false)
})

/* C3 tappa 4 (owner 09/10): le due porte — il modello ha gli stessi controlli della persona sulle sue figlie. In Piano la pausa sì
   (non tocca il disco), la ripresa no (riparte un lavoro). C5: le tre azioni in `child_control`. */
const CONTROLLI_PAUSA = {
    pauseChildFn: async (a) => ({ childId: a.childId, previous: 'running', paused: true }),
    resumeChildFn: async (a) => ({ childId: a.childId, previous: 'paused', resumed: true }),
}
test('C3-K3-PAUSA: child_control pauses and resumes; in Plan the resume is refused and never reaches the registry', async (t) => {
    const estesi = { strumentiEstesi: ['list_children', 'child_control'], ...CONTROLLI_PAUSA }
    const pausa = await giroKernel(t, 'child_control', { childId: 'c1', action: 'pause' }, estesi)
    assert.match(pausa.esito, /"paused":true/u)
    const ripresa = await giroKernel(t, 'child_control', { childId: 'c1', action: 'resume' }, estesi)
    assert.match(ripresa.esito, /"resumed":true/u)
    let riprese = 0
    const inPiano = await giroKernel(t, 'child_control', { childId: 'c1', action: 'resume' },
        { ...estesi, resumeChildFn: async () => { riprese += 1; return { resumed: true } }, modalitaOperativa: 'piano' })
    assert.match(inPiano.esito, /^REFUSED\. In Plan mode a child can be stopped or paused, not resumed/u)
    assert.equal(riprese, 0, 'resuming restarts work: not in Plan')
    const pausaInPiano = await giroKernel(t, 'child_control', { childId: 'c1', action: 'pause' }, { ...estesi, modalitaOperativa: 'piano' })
    assert.match(pausaInPiano.esito, /"paused":true/u, 'pausing does not touch the disk')
})

test('C3-K3-PAUSA (the other way): «deny» refuses with nothing paused; a missing channel or a wrong action is said', async (t) => {
    let chiamate = 0
    const contato = { pauseChildFn: async () => { chiamate += 1; return { paused: true } }, resumeChildFn: CONTROLLI_PAUSA.resumeChildFn }
    const negata = await giroKernel(t, 'child_control', { childId: 'c1', action: 'pause' },
        { strumentiEstesi: ['child_control'], ...contato, permessiPerAttrezzo: { pause_child: 'nega' } })
    assert.match(negata.esito, /^REFUSED\. the action "pause" of child_control is turned off/u)
    assert.equal(chiamate, 0)
    const senzaCanale = await giroKernel(t, 'child_control', { childId: 'c1', action: 'resume' }, { strumentiEstesi: ['child_control'] })
    assert.match(senzaCanale.esito, /^REFUSED\. child_control resume requires a parent channel\./u)
    const sbagliata = await giroKernel(t, 'child_control', { childId: 'c1', action: 'kill' })
    assert.match(sbagliata.esito, /^REFUSED\. child_control needs action "stop", "pause" or "resume" \(got "kill"\)/u)
    assert.deepEqual(sbagliata.chiamati, [])
})

test('C5: a model calling stop_child (from history) gets the new name and how to call it, and nothing runs', async (t) => {
    const vecchio = await giroKernel(t, 'stop_child', { childId: 'c1' })
    assert.equal(vecchio.esito, 'stop_child was replaced by child_control. Call child_control with arguments like {"childId": "…", "action": "stop"}. Nothing was done.')
    assert.deepEqual(vecchio.chiamati, [])
})

test('C5: saved choices on the old names move to the per-ACTION keys, and a «nega» is never lost', () => {
    assert.deepEqual(migraPermessiPerAttrezzo({ stop_child: 'nega', pause_child: 'chiedi', resume_child: 'sempre', shell: 'chiedi' }),
        { shell: 'chiedi', 'child_control:stop': 'nega', 'child_control:pause': 'chiedi', 'child_control:resume': 'sempre' })
    // al contrario: una scelta già sulla chiave nuova vince la migrazione
    assert.deepEqual(migraPermessiPerAttrezzo({ stop_child: 'nega', 'child_control:stop': 'sempre' }), { 'child_control:stop': 'sempre' })
})

test('C5: «chiedi» on an action shows the approval card with its usual type (pause_child), and a «no» pauses nothing', async (t) => {
    const carte = []
    let pause = 0
    const r = await giroKernel(t, 'child_control', { childId: 'c1', action: 'pause' }, {
        pauseChildFn: async () => { pause += 1; return { paused: true } },
        permessiPerAttrezzo: { 'child_control:pause': 'chiedi' },
        chiediApprovazioneFn: async (azione) => { carte.push(azione.tipo); return { consentito: false, motivo: 'the person said no.' } },
    })
    assert.deepEqual(carte, ['pause_child'], 'the card keeps the type the interface already knows')
    assert.equal(pause, 0)
    assert.match(r.esito, /^REFUSED\./u)
})
