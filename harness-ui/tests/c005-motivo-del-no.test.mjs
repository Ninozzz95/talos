/*
 * ⛔⛔ Ticket C-005 (CLI, 01/10/2026), portato sul desktop dentro C2 il 07/10/2026 — IL MOTIVO DEL «NO» ARRIVA AL MODELLO.
 *   `rispondiApprovazione` risolveva solo un booleano e il modello leggeva sempre «the owner did not approve this action.»,
 *   anche quando nessuna persona era stata interpellata (la CLI non interattiva risponde da sola, e sa perché).
 *   ⛔ E la risposta si legge FAIL-CLOSED: approva solo `true`. Un valore «vero» che non è `true` (l'oggetto col motivo, una
 *   stringa) è un no — prima `if (!approvato)` avrebbe letto l'oggetto come un SÌ.
 *   Prese dal file `c005-falsi-positivi-e-motivo.test.mjs` della CLI SENZA i casi 056 (superati da F007-B), con il motivo di
 *   serie in inglese (K3) e la forma del desktop: il quarto argomento è un oggetto di opzioni, la stringa della CLI resta valida.
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { esitoApprovazione, talosLavora, verificaPermessoScrittura } from '../src/kernel/talosHarness.mjs'
import { createSessionRegistry } from '../src/session-registry.mjs'
import { rimuoviCartellaDiProva } from './aiuto/rimuovi-cartella-di-prova.mjs'

const CARTELLA = process.platform === 'win32' ? 'C:\\lavoro\\progetto' : '/lavoro/progetto'
const azione = { tipo: 'scrivi', percorso: 'a.txt' }
const chiedi = (risposta) => verificaPermessoScrittura(azione, { livelloAccesso: 'su-richiesta', chiediApprovazioneFn: async () => risposta, cartella: CARTELLA })

test('C005-MOTIVO-AL-MODELLO: un no col motivo restituisce quel motivo', async () => {
    const esito = await chiedi({ approvato: false, motivo: 'TALOS did not run this: no one can approve it in this non-interactive run.' })
    assert.equal(esito.consentito, false)
    assert.equal(esito.motivo, 'TALOS did not run this: no one can approve it in this non-interactive run.')
})

test('C005-SOLO-TRUE-APPROVA: ogni risposta che non è true è un no, col motivo di sempre', async () => {
    assert.equal((await chiedi(true)).consentito, true)
    for (const risposta of [false, undefined, null, 'si', 1, { approvato: true }, { approvato: true, motivo: 'not a no' }, { approvato: false }, { approvato: false, motivo: '   ' }]) {
        const esito = await chiedi(risposta)
        assert.equal(esito.consentito, false, JSON.stringify(risposta))
        assert.equal(esito.motivo, 'the owner did not approve this action.', JSON.stringify(risposta))
    }
    assert.deepEqual(esitoApprovazione({ approvato: false, motivo: '  x  ' }), { approvato: false, motivo: 'x' })
})

function sessioneConApprovazione() {
    let catturata
    return {
        avviaSessioneFn: async (input) => {
            catturata = input.chiediApprovazioneFn
            input.onEvento({ type: 'RunStarted', threadId: 't1', runId: 'r1' })
            return new Promise(() => {})
        },
        get chiediApprovazioneFn() { return catturata },
    }
}
const preparaEsecuzioneFinta = (taskId) => ({ cartella: '/tmp/x', comandoProva: 'npm test', task: { id: taskId, consegna: 'c' } })

async function unaDomanda() {
    const finta = sessioneConApprovazione()
    const registro = createSessionRegistry({ avviaSessioneFn: finta.avviaSessioneFn, preparaEsecuzioneFn: preparaEsecuzioneFinta, modello: 'm', chiave: 'k', cartellaEsisteFn: () => true })
    const { sessionId } = registro.avvia('task-vero', { permessiScelto: 'On request' })
    const ricevuti = []
    registro.iscriviti(sessionId, (e) => ricevuti.push(e))
    const promessa = finta.chiediApprovazioneFn({ tipo: 'shell', comando: 'npm test' })
    await Promise.resolve()
    const richiesta = ricevuti.find((e) => e.type === 'ApprovalRequested')
    return { registro, sessionId, ricevuti, promessa, requestId: richiesta.requestId }
}

test('C005-MOTIVO-DAL-REGISTRO: il motivo del no arriva al kernel, come stringa (CLI) o nelle opzioni (desktop); senza motivo resta false', async () => {
    const casi = [
        ['Denied: not interactive.', { approvato: false, motivo: 'Denied: not interactive.' }],
        [{ motivo: 'Denied: not interactive.' }, { approvato: false, motivo: 'Denied: not interactive.' }],
        [undefined, false], ['   ', false], [{}, false],
    ]
    for (const [quarto, atteso] of casi) {
        const { registro, sessionId, ricevuti, promessa, requestId } = await unaDomanda()
        assert.deepEqual(registro.rispondiApprovazione(sessionId, requestId, false, quarto), { ok: true }, JSON.stringify(quarto))
        assert.deepEqual(await promessa, atteso, JSON.stringify(quarto))
        assert.equal(ricevuti.find((e) => e.type === 'ApprovalResolved').approvato, false, 'l\'evento resta un booleano')
    }
})

test('C005-MOTIVO-DAL-REGISTRO: un sì resta true anche se arriva un motivo', async () => {
    for (const quarto of ['ignorato', { motivo: 'ignorato' }]) {
        const { registro, sessionId, promessa, requestId } = await unaDomanda()
        registro.rispondiApprovazione(sessionId, requestId, true, quarto)
        assert.equal(await promessa, true)
    }
})

/* La conferma di root in WSL (F009) legge la stessa risposta: un no col motivo, o un valore vero che non è `true`, non esegue
   NIENTE. Impalcatura presa dalla CLI (che l'aveva presa da tests/rev-f009-utente-wsl.test.mjs del desktop). */
function fornitore(chiamate) {
    let n = 0
    return async () => {
        const c = chiamate[n]
        n++
        const message = c
            ? { role: 'assistant', content: null, tool_calls: [{ id: `c${n}`, type: 'function', function: { name: c[0], arguments: JSON.stringify(c[1]) } }] }
            : { role: 'assistant', content: 'fatto' }
        return new Response(JSON.stringify({ choices: [{ message, finish_reason: c ? 'tool_calls' : 'stop' }] }), { headers: { 'Content-Type': 'application/json' } })
    }
}
async function giroComeRoot(t, risposta) {
    const cartella = mkdtempSync(join(tmpdir(), 'talos-c005-root-'))
    t.after(() => rimuoviCartellaDiProva(cartella))
    const eseguiti = [], esiti = []
    /* Sul desktop la domanda di root la fa «Scrive nel progetto», che arriva al kernel SENZA livello (come `giro(…, 'nessuno')`
       in tests/rev-f009-utente-wsl.test.mjs); la CLI la provava con 'accesso-pieno', che qui non chiede più. */
    await talosLavora({
        cartella, task: { consegna: 'lavora' }, modello: 'f', chiave: 'k', giriMassimi: 4,
        fetchDiRete: fornitore([['shell', { comando: 'echo ciao' }]]),
        onGiro: (e) => { if (e.tipo === 'tool-esito') esiti.push(String(e.content)) },
        chiediApprovazioneFn: async () => risposta,
        eseguiComandoSandboxatoFn: async (comando) => { eseguiti.push(comando); return { codice: 0, testo: 'ciao', enforcement: 'wsl2', wsl: { utente: 'root', root: true, disco: { montaggio: '/mnt/c', metadata: false } } } },
        consensiSessione: {},
        rootWslDelComandoFn: async () => ({ distro: 'Ubuntu', utente: 'root' }),
    })
    return { eseguiti, esiti }
}

test('C005-SOLO-TRUE-APPROVA anche per root in WSL: un no col motivo o un «si» non eseguono niente', async (t) => {
    for (const risposta of [{ approvato: false, motivo: 'Denied: not interactive.' }, 'si', { approvato: true }]) {
        const { eseguiti, esiti } = await giroComeRoot(t, risposta)
        assert.equal(eseguiti.length, 0, JSON.stringify(risposta))
        assert.match(esiti[0], /did not confirm it/u)
    }
    assert.equal((await giroComeRoot(t, true)).eseguiti.length, 1, 'un sì vero esegue')
})
