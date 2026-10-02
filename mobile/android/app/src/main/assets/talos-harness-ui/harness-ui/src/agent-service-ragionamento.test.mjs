import assert from 'node:assert/strict'
import { registerHooks } from 'node:module'
import test from 'node:test'

import { politicaRagionamentoReale } from './reasoning-policy.mjs'

/*
 * `agent-service.mjs` importa il kernel dal percorso che l'app stagia SUL TELEFONO
 * (`../../../AVM-harness/mobile/scripts/harness-talos/talosHarness.mjs`). Sul PC quel percorso non esiste: solo per
 * questo test lo si risolve verso il sorgente del kernel (`mobile/scripts/harness-talos/`, di cui la copia sul
 * telefono è il sync). Nessun cambio al codice di prodotto.
 */
const KERNEL = new URL('../../../../../../../../scripts/harness-talos/talosHarness.mjs', import.meta.url)
registerHooks({
    resolve(specificatore, contesto, prossimo) {
        if (specificatore.endsWith('AVM-harness/mobile/scripts/harness-talos/talosHarness.mjs')) return prossimo(KERNEL.href, contesto)
        return prossimo(specificatore, contesto)
    },
})
const { avviaSessione, compattaSessione } = await import('./agent-service.mjs')

/*
 * RAG-COD (24/09/2026): le sessioni e le automazioni del Codice passano da `avviaSessione`; il riassunto «Compatta
 * ora» da `compattaSessione`. Tutte e due devono consegnare al kernel il lettore del catalogo, perché la regola dei
 * modelli a ragionamento obbligatorio si applichi a ogni chiamata.
 */
const GLM = { mandatory: true, supportedEfforts: ['max', 'high', 'low'], defaultEffort: 'max' }

test('RAG-COD-09 avviaSessione consegna al kernel il lettore del catalogo (quello del server, se non se ne passa un altro)', async () => {
    const ricevuti = []
    const talosLavoraFn = async (argomenti) => {
        ricevuti.push(argomenti)
        return { comeFinita: 'concluso', giri: 1, messaggi: [], conto: {} }
    }
    const base = {
        cartella: '.', task: { consegna: 'prova' }, modello: 'z-ai/glm-5.3-flash', chiave: 'k',
        onEvento: () => {}, talosLavoraFn, leggiContestoWorkspaceFn: () => ({}),
    }
    await avviaSessione(base)
    assert.equal(ricevuti[0].politicaRagionamento, politicaRagionamentoReale)

    const propria = async () => GLM
    await avviaSessione({ ...base, politicaRagionamentoFn: propria })
    assert.equal(ricevuti[1].politicaRagionamento, propria)
})

test('RAG-COD-10 compattaSessione applica la regola anche al riassunto', async () => {
    const corpi = []
    const fetchDiRete = async (_url, opzioni) => {
        corpi.push(JSON.parse(opzioni.body))
        return {
            ok: true, status: 200,
            json: async () => ({ choices: [{ message: { role: 'assistant', content: 'riassunto' } }] }),
            text: async () => '',
        }
    }
    // P4-ter (02/10/2026): «Compatta ora» passa dalla catena del giro (kernel `compattaFuoriDalGiro`): una storia con
    // qualcosa da riassumere, e la regola del catalogo vale anche per il riassuntore.
    const storia = [
        { role: 'system', content: 's' },
        ...Array.from({ length: 4 }, (_, i) => [
            { role: 'user', content: `richiesta ${i}` },
            { role: 'assistant', content: null, tool_calls: [{ id: `c${i}`, type: 'function', function: { name: 'leggi', arguments: '{"percorso":"a"}' } }] },
            { role: 'tool', tool_call_id: `c${i}`, content: 'contenuto' },
            { role: 'assistant', content: `fatto ${i}` },
        ]).flat(),
    ]
    const esito = await compattaSessione({
        messaggiFinali: storia, modello: 'z-ai/glm-5.3-flash', chiave: 'k', fetchDiRete,
        politicaRagionamentoFn: async () => GLM,
    })
    assert.deepEqual(corpi[0].reasoning, { effort: 'max' })
    assert.ok(esito.record, 'torna un record, la storia non si tocca')
})
