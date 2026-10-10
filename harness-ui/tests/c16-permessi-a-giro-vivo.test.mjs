/*
 * C16 (owner 10/10/2026, coda Codex «permessi dopo un downgrade»; audit A-B17-DOWNGRADE) — LA RADICE E I PERMESSI CAMBIATI A GIRO VIVO.
 *   Il registro ACCETTA un cambio di permessi mentre il giro lavora (`aggiornaImpostazioni`, nessun rifiuto, al contrario del modo)
 *   e lo salva; ma solo una FIGLIA rilegge i permessi a ogni chiamata (`permessiCorrentiFn`, C2-a). La radice tiene il livello
 *   d'avvio fino al giro dopo: la persona scende da «Accesso pieno» a «Chiede prima», l'interfaccia lo accetta, e i comandi
 *   successivi dello STESSO giro passano ancora senza chiedere.
 *   Hermes rilegge lo stato a ogni comando: `tools/approval.py:483-487` (`is_approval_bypass_active_for_session`, l'insieme
 *   `_session_yolo` vivo), e `/yolo` spento a turno in corso vale dal comando dopo (`gateway/slash_commands.py:938-942`).
 * Registro VERO (gli ingressi che dà alla radice) e kernel VERO (`talosLavora`), come C2-R6.
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, realpathSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createSessionRegistry } from '../src/session-registry.mjs'
import { attendiScritture } from '../src/session-store.mjs'
import { talosLavora } from '../src/kernel/talosHarness.mjs'
import { rimuoviCartellaDiProva } from './aiuto/rimuovi-cartella-di-prova.mjs'

function runtimeControllabile() {
    const runs = []
    return {
        runs,
        avviaSessioneFn(input) {
            let resolve
            const promise = new Promise((r) => { resolve = r })
            runs.push({ input, resolve })
            input.onEvento({ type: 'RunStarted', threadId: `t${runs.length}`, runId: `r${runs.length}` })
            return promise
        },
        fine(index) {
            const run = runs[index]
            if (run.finito) return
            run.finito = true
            run.input.onEvento({ type: 'RunFinished', threadId: `t${index}`, runId: `r${index}` })
            run.resolve({ ok: true, esito: { detto: 'ok', comeFinita: 'concluso', messaggiFinali: [{ role: 'user', content: 'x' }, { role: 'assistant', content: 'ok' }] } })
        },
    }
}
async function scena(t, permessi) {
    const cartellaStore = mkdtempSync(join(tmpdir(), 'talos-c16-'))
    const progetto = realpathSync.native(mkdtempSync(join(tmpdir(), 'talos-c16-progetto-')))
    const runtime = runtimeControllabile()
    const registry = createSessionRegistry({ cartellaStore, avviaSessioneFn: runtime.avviaSessioneFn,
        preparaEsecuzioneFn: () => ({ cartella: progetto, comandoProva: 'npm test', task: { id: 'task', consegna: 'lavora' } }),
        modello: 'm', chiave: 'k', cartellaEsisteFn: () => true })
    t.after(async () => {
        /* review C16 (R5): un'asserzione rossa PRIMA di `fine(0)` lasciava il giro aperto, e `chiudi` lo aspettava per sempre — la
           prova si piantava 240 s invece di diventare rossa. Alla chiusura ogni giro rimasto aperto si chiude. */
        runtime.runs.forEach((_, i) => runtime.fine(i))
        await registry.chiudi?.()
        try { await attendiScritture({ cartellaStore }) } catch { /* pulizia comunque */ }
        rimuoviCartellaDiProva(cartellaStore)
        rimuoviCartellaDiProva(progetto)
    })
    const { sessionId } = registry.avvia('task', { permessiScelto: permessi, modalitaOperativaScelta: 'normale' })
    return { registry, runtime, sessionId, progetto, input: runtime.runs[0].input }
}


/**
 * Un giro VERO del kernel con gli ingressi della radice: le chiamate date, e `fra` gira prima della seconda richiesta al modello
 * (cioè fra la prima chiamata di attrezzo e la seconda). Restituisce le domande alla persona, gli esiti e gli attrezzi offerti a
 * ogni richiesta.
 */
async function giro({ input, progetto }, { chiamate = [['shell', { comando: 'echo uno' }], ['shell', { comando: 'echo due' }]], fra = async () => {}, risposta = false } = {}) {
    const chieste = []
    const esiti = []
    const offerti = []
    let n = 0
    await talosLavora({
        cartella: progetto, task: { consegna: 'lavora' }, modello: 'f', chiave: 'k', giriMassimi: chiamate.length + 2,
        livelloAccesso: input.livelloAccesso, permessiPerAttrezzo: input.permessiPerAttrezzo,
        ...(typeof input.permessiCorrentiFn === 'function' ? { permessiCorrentiFn: input.permessiCorrentiFn } : {}),
        ambienteComandiFn: async () => ({ dove: 'windows', revisione: 0 }),
        chiediApprovazioneFn: async (azione) => { chieste.push(azione); return risposta },
        fetchDiRete: async (_url, init) => {
            offerti.push((JSON.parse(init.body).tools ?? []).map((a) => a.function?.name))
            if (n === 1) await fra()
            const c = chiamate[n++]
            const message = c ? { role: 'assistant', content: null, tool_calls: [{ id: `c${n}`, type: 'function', function: { name: c[0], arguments: JSON.stringify(c[1]) } }] } : { role: 'assistant', content: 'fatto' }
            return new Response(JSON.stringify({ choices: [{ message, finish_reason: c ? 'tool_calls' : 'stop' }] }), { headers: { 'Content-Type': 'application/json' } })
        },
        onGiro: (e) => { if (e.tipo === 'tool-esito') esiti.push(String(e.content)) },
    })
    return { chieste, esiti, offerti }
}
const cambia = (s, patch) => async () => {
    const r = await s.registry.aggiornaImpostazioni(s.sessionId, patch)
    assert.ok(!r?.erroreAvvio, `premise: the registry accepts the change while the turn works (${JSON.stringify(r)})`)
}

test('C16-01 DOWNGRADE: «Full access» → «On request» while the turn works ⇒ the NEXT command of the same turn asks, and the model is told', async (t) => {
    const s = await scena(t, 'Full access')
    assert.equal(s.input.livelloAccesso, 'accesso-pieno', 'premise: the turn started in full access')
    const { chieste, esiti } = await giro(s, { fra: cambia(s, { permessi: 'On request' }) })
    assert.match(esiti[0], /uno/, 'the first command ran in full access, as it should')
    assert.doesNotMatch(esiti[0], /\[TALOS\] The person changed/, 'nothing changed before the first call')
    assert.equal(chieste.length, 1, 'the second command asked the person')
    assert.equal(chieste[0].comando, 'echo due')
    assert.match(esiti[1], /^\[TALOS\] The person changed this session's permissions from "Full access" to "On request" while you were working\. From this call on, actions that ran without asking may now ask/)
    assert.doesNotMatch(esiti[1], /^due$/m, 'and, denied, it did not run')
    s.runtime.fine(0)
})

test('C16-02 UPGRADE: «On request» → «Full access» while the turn works ⇒ the next command runs without asking, and the model is told', async (t) => {
    const s = await scena(t, 'On request')
    const { chieste, esiti } = await giro(s, { fra: cambia(s, { permessi: 'Full access' }) })
    assert.equal(chieste.length, 1, 'only the first command asked (and was denied)')
    assert.equal(chieste[0].comando, 'echo uno')
    assert.match(esiti[1], /^\[TALOS\] The person changed this session's permissions from "On request" to "Full access".*may now be allowed/s)
    assert.match(esiti[1], /^due\r?$/m, 'the second command ran')
    s.runtime.fine(0)
})

test('C16-03 THE TOOL LIST follows the level both ways: «Read only» → «Workspace write» offers scrivi from the next request; back down removes it', async (t) => {
    const su = await scena(t, 'Read only')
    const salita = await giro(su, { chiamate: [['elenca', {}], ['elenca', {}]], fra: cambia(su, { permessi: 'Workspace write' }) })
    assert.equal(salita.offerti[0].includes('scrivi'), false, 'premise: read only does not offer scrivi')
    assert.equal(salita.offerti.at(-1).includes('scrivi'), true, 'after the upgrade the next request offers it')
    su.runtime.fine(0)
    const giu = await scena(t, 'Workspace write')
    const discesa = await giro(giu, { chiamate: [['elenca', {}], ['elenca', {}]], fra: cambia(giu, { permessi: 'Read only' }) })
    assert.equal(discesa.offerti[0].includes('scrivi'), true, 'premise: workspace write offers scrivi')
    assert.equal(discesa.offerti.at(-1).includes('scrivi'), false, 'after the downgrade the next request does not')
    giu.runtime.fine(0)
})

test('C16-04 AL CONTRARIO: no change while the turn works ⇒ no line for the model, no question, the same tools', async (t) => {
    const s = await scena(t, 'Full access')
    const { chieste, esiti, offerti } = await giro(s)
    assert.equal(chieste.length, 0)
    assert.equal(esiti.some((e) => /\[TALOS\] The person changed/.test(e)), false)
    assert.deepEqual(offerti[0], offerti.at(-1))
    s.runtime.fine(0)
})

test('C16-05 PER-TOOL: «shell: chiedi» set while the turn works in full access ⇒ the next shell command asks', async (t) => {
    const s = await scena(t, 'Full access')
    const { chieste } = await giro(s, { fra: cambia(s, { permessiPerAttrezzo: { shell: 'chiedi' } }) })
    assert.deepEqual(chieste.map((a) => a.comando), ['echo due'])
    s.runtime.fine(0)
})

test('C16-06 THE LINE: down, up, and not comparable', async () => {
    const { frasePermessiCambiati } = await import('../src/kernel/talosHarness.mjs')
    assert.match(frasePermessiCambiati('accesso-pieno', 'lettura'), /from "Full access" to "Read only".*may now ask the person first or be refused/)
    assert.match(frasePermessiCambiati('lettura', 'scrittura-progetto'), /from "Read only" to "Workspace write".*may now be allowed/)
    assert.match(frasePermessiCambiati('scrittura-area', 'scrittura-progetto'), /the rules for your actions changed/)
})

/* La carta combina il livello passato con quelli della catena, e per la radice l'anello è lei stessa col livello di ADESSO: il più
   stretto vince. Dopo un ribasso era già giusta; dopo un RIALZO diceva ancora il livello d'avvio. */
test('C16-07 THE CARD: after an upgrade, the approval card explains the level of NOW, not the one the turn started with', async (t) => {
    const s = await scena(t, 'On request')
    await cambia(s, { permessi: 'Full access', permessiPerAttrezzo: { shell: 'chiedi' } })()
    void s.input.chiediApprovazioneFn({ tipo: 'shell', toolCallId: 'c1', comando: 'echo due' })
    await new Promise((r) => setTimeout(r, 20))
    assert.equal(s.registry.domandaInAttesa(s.sessionId)?.politica?.permessi, 'Full access')
    s.runtime.fine(0)
})

/* ---- review YELLOW del desktop su d4939bcbf: le quattro promesse del commit senza una prova (R1-R4) ---- */

/** Un giro VERO del kernel senza registro: `livelli` dice il livello che `permessiCorrentiFn` restituisce a ogni chiamata. */
async function giroDiretto({ livelli, modalitaOperativa = 'normale', agentRole = 'root', chiamate = [['elenca', {}], ['elenca', {}], ['elenca', {}]] }) {
    const cartella = realpathSync.native(mkdtempSync(join(tmpdir(), 'talos-c16-diretto-')))
    const offerti = []
    const esiti = []
    let n = 0
    let letture = 0
    try {
        await talosLavora({
            cartella, task: { consegna: 'lavora' }, modello: 'f', chiave: 'k', giriMassimi: chiamate.length + 2,
            livelloAccesso: livelli[0], permessiPerAttrezzo: {}, modalitaOperativa, agentRole,
            permessiCorrentiFn: () => ({ livelloAccesso: livelli[Math.min(letture++, livelli.length - 1)], permessiPerAttrezzo: {} }),
            chiediApprovazioneFn: async () => false,
            fetchDiRete: async (_url, init) => {
                offerti.push((JSON.parse(init.body).tools ?? []).map((a) => a.function?.name))
                const c = chiamate[n++]
                const message = c ? { role: 'assistant', content: null, tool_calls: [{ id: `c${n}`, type: 'function', function: { name: c[0], arguments: JSON.stringify(c[1]) } }] } : { role: 'assistant', content: 'fatto' }
                return new Response(JSON.stringify({ choices: [{ message, finish_reason: c ? 'tool_calls' : 'stop' }] }), { headers: { 'Content-Type': 'application/json' } })
            },
            onGiro: (e) => { if (e.tipo === 'tool-esito') esiti.push(String(e.content)) },
        })
    } finally { rimuoviCartellaDiProva(cartella) }
    return { offerti, esiti }
}

test('C16-08 ONCE (R1): the [TALOS] line rides on the first call after the change, not on the ones after it', async () => {
    const { esiti } = await giroDiretto({ livelli: ['accesso-pieno', 'su-richiesta', 'su-richiesta'] })
    assert.doesNotMatch(esiti[0], /\[TALOS\] The person changed/)
    assert.match(esiti[1], /^\[TALOS\] The person changed this session's permissions from "Full access" to "On request"/)
    assert.doesNotMatch(esiti[2], /\[TALOS\] The person changed/, 'a later call does not repeat it')
})

test('C16-09 A CHILD (R2): its level drops mid-turn, its tool list stays the same (only the gate changes, as C2-a decided)', async () => {
    const { offerti, esiti } = await giroDiretto({ agentRole: 'child', livelli: ['scrittura-progetto', 'lettura', 'lettura'] })
    assert.match(esiti[1], /^\[TALOS\] The person changed/, 'premise: the child saw the change')
    assert.equal(offerti[0].includes('scrivi'), true, 'premise: workspace write offers scrivi')
    assert.deepEqual(offerti.at(-1), offerti[0])
})

test('C16-10 PLAN MODE (R3): a root in Plan whose level goes UP is not offered write tools', async () => {
    const { offerti, esiti } = await giroDiretto({ modalitaOperativa: 'piano', livelli: ['lettura', 'accesso-pieno', 'accesso-pieno'] })
    assert.match(esiti[1], /^\[TALOS\] The person changed this session's permissions from "Read only" to "Full access"/, 'premise: the change was seen')
    for (const o of offerti) {
        assert.equal(o.includes('scrivi'), false, 'Plan mode never offers scrivi')
        assert.equal(o.includes('shell'), false, 'nor the shell')
    }
})

test('C16-11 UNREADABLE (R4): an unknown permissions word mid-turn is refused at the door, and the live level does not move', async (t) => {
    /* owner 10/10 «Porta + kernel chiuso»: prima il registro accettava «Boh» e il livello vivo lo leggeva «Sola lettura»; ora la parola
       non entra. Una parola già salvata (dati vecchi) si legge ancora «Sola lettura»: PORTA-03 in permessi-porta-chiusa. */
    const s = await scena(t, 'Full access')
    assert.equal((await s.registry.aggiornaImpostazioni(s.sessionId, { permessi: 'Boh' })).code, 'PERMISSIONS_INVALID')
    assert.equal(s.input.permessiCorrentiFn().livelloAccesso, 'accesso-pieno')
})
