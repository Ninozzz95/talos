import assert from 'node:assert/strict'
import test from 'node:test'

import { creaLettorePoliticaRagionamento } from './reasoning-policy.mjs'

/*
 * RAG-COD (24/09/2026): il catalogo OpenRouter, letto una volta, dice per ogni modello se il ragionamento si può
 * spegnere e quali livelli accetta. Forma misurata il 24/09 su `GET https://openrouter.ai/api/v1/models`.
 */
const CATALOGO = {
    data: [
        {
            id: 'z-ai/glm-5.3-flash',
            reasoning: { mandatory: true, default_enabled: true, supported_efforts: ['max', 'high', 'low'], default_effort: 'max' },
        },
        {
            id: 'openai/gpt-5.5',
            reasoning: { mandatory: false, default_enabled: true, supported_efforts: ['xhigh', 'high', 'medium', 'low', 'none'], default_effort: 'medium' },
        },
        { id: 'vendor/senza-oggetto' },
        { id: 'vendor/forma-strana', reasoning: 'non un oggetto' },
    ],
}

function sportello(risposte) {
    const chiamate = []
    return {
        chiamate,
        fetch: async (url, opzioni) => {
            chiamate.push({ url, opzioni })
            const r = risposte[Math.min(chiamate.length - 1, risposte.length - 1)]
            if (r instanceof Error) throw r
            return { ok: r.ok ?? true, status: r.status ?? 200, json: async () => r.corpo }
        },
    }
}

test('RAG-COD-05 legge il catalogo una volta, senza chiave, e risponde per ogni modello', async () => {
    const rete = sportello([{ corpo: CATALOGO }])
    const politica = creaLettorePoliticaRagionamento({ fetchDiRete: rete.fetch })
    assert.deepEqual(await politica('z-ai/glm-5.3-flash'),
        { mandatory: true, supportedEfforts: ['max', 'high', 'low'], defaultEffort: 'max' })
    assert.deepEqual(await politica('openrouter:openai/gpt-5.5'),
        { mandatory: false, supportedEfforts: ['xhigh', 'high', 'medium', 'low', 'none'], defaultEffort: 'medium' })
    assert.equal(await politica('vendor/senza-oggetto'), null)
    assert.equal(await politica('vendor/forma-strana'), null)
    assert.equal(await politica('vendor/sconosciuto'), null)
    assert.equal(rete.chiamate.length, 1, 'una lettura sola per tutte le domande')
    assert.equal(rete.chiamate[0].url, 'https://openrouter.ai/api/v1/models')
    assert.equal(rete.chiamate[0].opzioni?.headers?.Authorization, undefined, 'il catalogo è pubblico: la chiave non esce')
})

test('RAG-COD-06 un modello di un altro fornitore non tocca la rete', async () => {
    const rete = sportello([{ corpo: CATALOGO }])
    const politica = creaLettorePoliticaRagionamento({ fetchDiRete: rete.fetch })
    assert.equal(await politica('openai:gpt-5.6-luna'), null)
    assert.equal(await politica('ollama:llama3.2'), null)
    assert.equal(await politica(''), null)
    assert.equal(rete.chiamate.length, 0)
})

test('RAG-COD-07 un catalogo irraggiungibile dà null, e si riprova solo dopo la pausa', async () => {
    let adesso = 1_000
    const rete = sportello([new Error('rete giù'), { ok: false, status: 503, corpo: {} }, { corpo: CATALOGO }])
    const politica = creaLettorePoliticaRagionamento({ fetchDiRete: rete.fetch, ora: () => adesso, attesaDopoErroreMs: 60_000 })
    assert.equal(await politica('z-ai/glm-5.3-flash'), null)
    assert.equal(await politica('z-ai/glm-5.3-flash'), null)
    assert.equal(rete.chiamate.length, 1, 'niente martellamento durante la pausa')
    adesso += 60_000
    assert.equal(await politica('z-ai/glm-5.3-flash'), null, 'uno stato HTTP non riuscito vale come errore')
    adesso += 60_000
    assert.equal((await politica('z-ai/glm-5.3-flash'))?.mandatory, true)
    assert.equal(rete.chiamate.length, 3)
})

test('RAG-COD-08 dopo la validità si rilegge; se la rilettura fallisce si tiene il catalogo vecchio', async () => {
    let adesso = 0
    const rete = sportello([{ corpo: CATALOGO }, new Error('rete giù')])
    const politica = creaLettorePoliticaRagionamento({ fetchDiRete: rete.fetch, ora: () => adesso, validitaMs: 1_000 })
    assert.equal((await politica('z-ai/glm-5.3-flash'))?.mandatory, true)
    adesso = 5_000
    assert.equal((await politica('z-ai/glm-5.3-flash'))?.mandatory, true)
    assert.equal(rete.chiamate.length, 2)
})
