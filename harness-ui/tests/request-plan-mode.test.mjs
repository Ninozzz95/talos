/*
 * ⛔⛔⛔ Rilievo 3 dell'owner (audit ZIP revisione, 28/09/2026; piano 0.1.19 §1.7, decisione D3
 * «Piano su richiesta del modello = attrezzo del modello + fascia») — la modalità Piano non
 * era attivabile SU RICHIESTA DEL MODELLO: `modalitaOperativa` si cambiava solo dalla pill, e
 * `aggiornaImpostazioni` rifiuta a sessione viva («si cambia fra un giro e l'altro»).
 *
 * Cura: attrezzo `request_plan_mode` nel kernel (offerto al root in NORMALE, mai in Piano), che
 * ACCODA il cambio: il modello lo chiama, l'esito dice «it will be active from the next turn»,
 * e la patch `modalitaOperativa:'piano'` si applica alla FINE del giro (dove la guard la
 * accetta), con evento `talos.impostazioni-sessione` motivo `'piano-richiesto-dal-modello'` —
 * la stessa forma di `rispondiPiano` (motivo `'piano-approvato'`).
 *
 * Ricerca prima della cura (fonti con data, 28/09): opencode `packages/opencode/src/tool/
 * plan-enter.txt` (clone 2026-09-24) — «Use this tool to suggest switching to plan agent when
 * the user's request would benefit from planning before implementation… This tool will ask
 * the user if they want to switch to plan agent»: il MODELLO propone il cambio, la persona
 * vede. Claude Code non ha un attrezzo equivalente (il plan mode lo accende la persona,
 * shift+tab): la fascia che dichiara il cambio a schermo è la nostra parte in più, decisa
 * dall'owner in D3. Il cambio ritardato fra un giro e l'altro è il vincolo del nostro
 * `aggiornaImpostazioni` (la guard 409 resta, non si tocca).
 *
 * ⛔ Queste prove girano nei DUE VERSI: l'attrezzo c'è in Normale e la patch arriva a fine
 * giro col suo evento; e i confini tengono (niente in Piano, niente ai figli, niente senza
 * canale, il motivo rifiutato si dice, e durante il giro NON cambia niente).
 */

import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { talosLavora } from '../src/kernel/talosHarness.mjs';
import { createSessionRegistry } from '../src/session-registry.mjs';
import { rimuoviCartellaDiProva } from './aiuto/rimuovi-cartella-di-prova.mjs';

/* ────────────────── il finto fornitore (kernel) e la sessione controllabile (registro) ────────────────── */

const enc = new TextEncoder();
const sse = (fotogrammi) => new Response(new ReadableStream({
    start(c) {
        for (const f of fotogrammi) c.enqueue(enc.encode(`data: ${JSON.stringify(f)}\n\n`));
        c.enqueue(enc.encode('data: [DONE]\n\n'));
        c.close();
    },
}));
const chiamata = (nome, argomenti = {}, id = `call_${nome}`) => () => sse([
    { choices: [{ delta: { tool_calls: [{ index: 0, id, function: { name: nome, arguments: JSON.stringify(argomenti) } }] } }] },
]);
const testoFinale = () => sse([{ choices: [{ delta: { content: 'finito' } }] }]);

function cartellaDiProva(t) {
    const cartella = mkdtempSync(join(tmpdir(), 'talos-rpm-'))
    t.after(() => rimuoviCartellaDiProva(cartella))
    return cartella
}

async function giro(cartella, chiamate, opzioni = {}) {
    let n = 0
    const offerti = []
    const esito = await talosLavora({
        cartella, task: { consegna: 'pianifica' }, modello: 'x', chiave: 'y', onDelta: () => {},
        fetchDiRete: async (indirizzo, richieste = {}) => {
            try { offerti.push(...(JSON.parse(richieste.body ?? '{}').tools ?? []).map((t) => t.function?.name).filter(Boolean)) } catch { /* corpo non leggibile */ }
            if (n < chiamate.length) return chiamate[n++]()
            return testoFinale()
        },
        ...opzioni,
    })
    return { esiti: esito.messaggiFinali.filter((m) => m.role === 'tool').map((m) => m.content), offerti: [...new Set(offerti)] }
}

/** Una sessione controllabile: l'avvio finto cattura l'input del kernel, la fine la decide il test. */
function sessioneControllabile() {
    let risolviAttesa
    const attesa = new Promise((risolvi) => { risolviAttesa = risolvi })
    let onEventoCatturato = null
    let inputCatturato = null
    return {
        avviaSessioneFn: async (input) => {
            inputCatturato = input
            onEventoCatturato = input.onEvento
            input.onEvento({ type: 'RunStarted', threadId: 't1', runId: 'r1' })
            return attesa
        },
        concludi(eventoFinale, risultato = { ok: true, esito: { detto: 'fatto', comeFinita: 'concluso', messaggiFinali: [{ role: 'user', content: 'pianifica per favore' }, { role: 'assistant', content: 'fatto' }] } }) {
            onEventoCatturato(eventoFinale)
            risolviAttesa(risultato)
        },
        get ultimoInput() { return inputCatturato },
    }
}

/** Il task finto del catalogo (come `preparaEsecuzioneFinta` della suite del registro). */
const TASK_FINTO = 'task-rpm'
function preparaEsecuzioneFinta(taskId) {
    if (taskId !== TASK_FINTO) throw new Error(`Task non ammesso: ${taskId}`)
    return { cartella: '/tmp/x', comandoProva: 'npm test', task: { id: taskId, consegna: 'c' } }
}

/* ─────────────────────────── il catalogo e i confini, dal kernel vero ─────────────────────────── */

test('⭐⭐⭐ RPM-01 — `request_plan_mode` si offre al root in Normale', async (t) => {
    const { offerti } = await giro(cartellaDiProva(t), [], { strumentiEstesi: ['request_plan_mode'], onRichiestaPianoFn: async () => ({ ok: true }) })
    assert.ok(offerti.includes('request_plan_mode'), `offerto al root che chiede di pianificare: ${offerti.join(', ')}`)
})

test('⭐⭐⭐ RPM-02 — in Piano NON si offre: il Piano non chiede di entrare nel Piano', async (t) => {
    const { offerti } = await giro(cartellaDiProva(t), [], {
        strumentiEstesi: ['request_plan_mode'], onRichiestaPianoFn: async () => ({ ok: true }), modalitaOperativa: 'piano',
    })
    assert.ok(!offerti.includes('request_plan_mode'), 'già in Piano: l\'attrezzo non ha senso')
})

test('⛔ RPM-03, AL CONTRARIO — a una figlia non si offre: il modo lo chiede chi parla con la persona', async (t) => {
    const { offerti } = await giro(cartellaDiProva(t), [], { strumentiEstesi: ['request_plan_mode'], onRichiestaPianoFn: async () => ({ ok: true }), agentRole: 'child' })
    assert.ok(!offerti.includes('request_plan_mode'))
})

test('⛔ RPM-04, AL CONTRARIO — senza canale (`onRichiestaPianoFn` assente) non si offre', async (t) => {
    const { offerti } = await giro(cartellaDiProva(t), [], { strumentiEstesi: ['request_plan_mode'] })
    assert.ok(!offerti.includes('request_plan_mode'), 'meglio assente che rotto')
})

/* ─────────────────────────────────── il dispatch del kernel ─────────────────────────────────── */

test('⭐⭐⭐ RPM-05 — la chiamata torna la frase del piano: il cambio è dal PROSSIMO giro', async (t) => {
    const viste = []
    const { esiti } = await giro(cartellaDiProva(t), [chiamata('request_plan_mode')], {
        strumentiEstesi: ['request_plan_mode'],
        onRichiestaPianoFn: async () => { viste.push(1); return { ok: true } },
    })
    assert.equal(viste.length, 1, 'il canale è stato chiamato')
    assert.equal(esiti[0], 'Plan mode requested: it will be active from the next turn. Prepare the plan; `present_plan` will be available then.',
        'la frase del piano §1.7, parola per parola')
})

test('⛔ RPM-06, AL CONTRARIO — un rifiuto del canale si dice, non diventa un «requested» finto', async (t) => {
    const { esiti } = await giro(cartellaDiProva(t), [chiamata('request_plan_mode')], {
        strumentiEstesi: ['request_plan_mode'],
        onRichiestaPianoFn: async () => ({ ok: false, motivo: 'the session is already in Plan mode.' }),
    })
    assert.match(esiti[0], /already in Plan mode/, `il motivo vero, ricevuto: ${esiti[0]}`)
    assert.ok(!/Plan mode requested/.test(esiti[0]), 'un rifiuto non è una richiesta riuscita')
})

test('⭐ RPM-07 — il giro DOPO: in Piano `present_plan` è disponibile (la fine della catena)', async (t) => {
    const { offerti } = await giro(cartellaDiProva(t), [], {
        strumentiEstesi: ['present_plan'], modalitaOperativa: 'piano', presentaPianoFn: async () => ({}),
    })
    assert.ok(offerti.includes('present_plan'), 'la patch a fine giro accende il modo: e il modo accende l\'attrezzo')
})

/* ────────────── il registro: la patch a FINE GIRO, l'evento col suo motivo, il giro dopo ────────────── */

test('⭐⭐⭐ RPM-08 — DURANTE il giro non cambia niente; a FINE giro la patch, l\'evento, e il giro dopo è Piano', async (t) => {
    const finta = sessioneControllabile()
    const registro = createSessionRegistry({ avviaSessioneFn: finta.avviaSessioneFn, preparaEsecuzioneFn: preparaEsecuzioneFinta, modello: 'm', chiave: 'k', cartellaStore: cartellaDiProva(t) })
    const { sessionId } = registro.avvia(TASK_FINTO)
    const input = finta.ultimoInput
    assert.ok(input.strumentiEstesi.includes('request_plan_mode'), 'la lista di serie lo nomina')
    assert.equal(typeof input.onRichiestaPianoFn, 'function', 'e il canale c\'è, per il root')

    /* DURANTE il giro: la richiesta si incoda, il modo NON cambia, l'evento NON esiste ancora */
    assert.deepEqual(await input.onRichiestaPianoFn(), { ok: true })
    assert.equal(registro.esporta(sessionId).eventi.some((e) => e?.name === 'talos.impostazioni-sessione' && e.value?.motivo === 'piano-richiesto-dal-modello'), false,
        'la guard del cambio a metà giro resta: niente evento prima della fine')

    /* FINE giro: la patch con il suo evento, la stessa forma di rispondiPiano */
    finta.concludi({ type: 'RunFinished' })
    await registro.attendiAssestamento(sessionId)
    const evento = registro.esporta(sessionId).eventi.find((e) => e?.name === 'talos.impostazioni-sessione' && e.value?.motivo === 'piano-richiesto-dal-modello')
    assert.ok(evento, 'l\'evento a fine giro, col motivo del piano §1.7')
    assert.equal(evento.value.modalitaOperativa, 'piano')

    /* IL GIRO DOPO: il modo è Piano e present_plan entra nella lista del kernel */
    registro.resume(sessionId, 'ecco il piano')
    const dopo = finta.ultimoInput
    assert.equal(dopo.modalitaOperativa, 'piano', 'la patch ha attraversato la fine del giro')
    assert.ok(dopo.strumentiEstesi.includes('present_plan'), 'e il modo nuovo accende l\'attrezzo del piano')
    finta.concludi({ type: 'RunFinished' })
})

test('⛔ RPM-09, AL CONTRARIO — chiedere due volte nello stesso giro è idempotente: UNA patch, UN evento', async (t) => {
    const finta = sessioneControllabile()
    const registro = createSessionRegistry({ avviaSessioneFn: finta.avviaSessioneFn, preparaEsecuzioneFn: preparaEsecuzioneFinta, modello: 'm', chiave: 'k', cartellaStore: cartellaDiProva(t) })
    const { sessionId } = registro.avvia(TASK_FINTO)
    const input = finta.ultimoInput
    await input.onRichiestaPianoFn()
    assert.deepEqual(await input.onRichiestaPianoFn(), { ok: true }, 'la seconda non è un errore')
    finta.concludi({ type: 'RunFinished' })
    await registro.attendiAssestamento(sessionId)
    const eventi = registro.esporta(sessionId).eventi.filter((e) => e?.name === 'talos.impostazioni-sessione' && e.value?.motivo === 'piano-richiesto-dal-modello')
    assert.equal(eventi.length, 1, 'una richiesta accodata una volta: un evento solo')
    finta.concludi({ type: 'RunFinished' })
})
