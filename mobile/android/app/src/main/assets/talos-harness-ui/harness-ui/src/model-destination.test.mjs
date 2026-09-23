import assert from 'node:assert/strict'
import test from 'node:test'

import {
    ModelDestinationError,
    creaFetchMultiProvider,
    risolviDestinazioneModello,
    separaFonteModello,
} from './model-destination.mjs'

function depsFinte({ chiavi = {}, endpoint = {} } = {}) {
    return {
        leggiChiave: (fonte) => chiavi[fonte] ?? null,
        leggiRuntime: (fonte) => ({ endpoint: endpoint[fonte] ?? null }),
    }
}

test('separaFonteModello: nessun prefisso → openrouter, il modello passa intatto', () => {
    assert.deepEqual(separaFonteModello('deepseek/deepseek-v4-flash'), { fonte: 'openrouter', modelloRemoto: 'deepseek/deepseek-v4-flash' })
})

test('separaFonteModello: prefisso riconosciuto → spaccato sul PRIMO due punti', () => {
    assert.deepEqual(separaFonteModello('openai:gpt-5.6-luna'), { fonte: 'openai', modelloRemoto: 'gpt-5.6-luna' })
})

test('⛔ AL CONTRARIO — separaFonteModello: un due punti con una fonte NON riconosciuta resta un id OpenRouter letterale', () => {
    // Un id che avesse un ':' per un motivo suo (non capita su OpenRouter oggi, ma non si deve MAI dirottare su un provider inventato).
    assert.deepEqual(separaFonteModello('qualcosa:strano'), { fonte: 'openrouter', modelloRemoto: 'qualcosa:strano' })
})

test('⛔ AL CONTRARIO — separaFonteModello: un modello vuoto o non stringa lancia, mai un id fantasma', () => {
    assert.throws(() => separaFonteModello(''), ModelDestinationError)
    assert.throws(() => separaFonteModello(undefined), ModelDestinationError)
})

test('risolviDestinazioneModello: openai → indirizzo fisso, Bearer, modello senza prefisso', () => {
    const dest = risolviDestinazioneModello('openai:gpt-5.6-luna', depsFinte({ chiavi: { openai: 'sk-vera' } }))
    assert.equal(dest.url, 'https://api.openai.com/v1/chat/completions')
    assert.equal(dest.headers.Authorization, 'Bearer sk-vera')
    assert.equal(dest.modelloRemoto, 'gpt-5.6-luna')
})

test('risolviDestinazioneModello: deepseek → indirizzo fisso', () => {
    const dest = risolviDestinazioneModello('deepseek:deepseek-chat', depsFinte({ chiavi: { deepseek: 'sk-vera' } }))
    assert.equal(dest.url, 'https://api.deepseek.com/chat/completions')
})

test('risolviDestinazioneModello: nessun prefisso → fonte openrouter (chiamata diretta: vuole comunque una chiave, come ogni altra fonte — la fetch avvolta non arriva mai qui per questo caso, vedi sotto)', () => {
    const dest = risolviDestinazioneModello('z-ai/glm-5.3-flash', depsFinte({ chiavi: { openrouter: 'sk-or' } }))
    assert.equal(dest.fonte, 'openrouter')
})

test('risolviDestinazioneModello: ollama → indirizzo configurato + rotta di compatibilità OpenAI, mai la rotta nativa /api/chat', () => {
    const dest = risolviDestinazioneModello('ollama:llama3.2', depsFinte({ endpoint: { ollama: 'http://192.168.1.20:11434' } }))
    assert.equal(dest.url, 'http://192.168.1.20:11434/v1/chat/completions')
    assert.equal(dest.headers.Authorization, undefined) // ⛔ AL CONTRARIO: nessuna chiave configurata, nessun header Authorization inventato
})

test('risolviDestinazioneModello: ollama CON una chiave configurata (es. dietro un proxy) manda comunque un Bearer', () => {
    const dest = risolviDestinazioneModello('ollama:llama3.2', depsFinte({ endpoint: { ollama: 'http://192.168.1.20:11434' }, chiavi: { ollama: 'proxy-secret' } }))
    assert.equal(dest.headers.Authorization, 'Bearer proxy-secret')
})

test('⛔ AL CONTRARIO — ollama con una barra finale nell\'indirizzo: non produce //', () => {
    const dest = risolviDestinazioneModello('ollama:llama3.2', depsFinte({ endpoint: { ollama: 'http://192.168.1.20:11434/' } }))
    assert.equal(dest.url, 'http://192.168.1.20:11434/v1/chat/completions')
})

test('⛔ AL CONTRARIO — ollama senza indirizzo configurato: rifiutato con un motivo onesto, mai un URL a metà', () => {
    assert.throws(
        () => risolviDestinazioneModello('ollama:llama3.2', depsFinte()),
        (errore) => errore instanceof ModelDestinationError && errore.code === 'PROVIDER_RUNTIME_INVALID',
    )
})

test('⛔ AL CONTRARIO — openai senza chiave configurata: rifiutato, mai un tentativo destinato a un 401', () => {
    assert.throws(
        () => risolviDestinazioneModello('openai:gpt-5.6-luna', depsFinte()),
        (errore) => errore instanceof ModelDestinationError && errore.code === 'PROVIDER_KEY_MISSING',
    )
})

test('⛔⛔ AL CONTRARIO — anthropic: rifiutato con MODEL_PROVIDER_NOT_SUPPORTED_YET, anche con una chiave buona', () => {
    assert.throws(
        () => risolviDestinazioneModello('anthropic:claude-x', depsFinte({ chiavi: { anthropic: 'sk-ottima' } })),
        (errore) => errore instanceof ModelDestinationError && errore.code === 'MODEL_PROVIDER_NOT_SUPPORTED_YET' && errore.message.includes('/v1/messages'),
    )
})

test('⛔⛔ AL CONTRARIO — gemini: rifiutato con MODEL_PROVIDER_NOT_SUPPORTED_YET, anche con una chiave buona', () => {
    assert.throws(
        () => risolviDestinazioneModello('gemini:models/gemini-3', depsFinte({ chiavi: { gemini: 'sk-ottima' } })),
        (errore) => errore instanceof ModelDestinationError && errore.code === 'MODEL_PROVIDER_NOT_SUPPORTED_YET',
    )
})

test('⛔⛔⛔ AL CONTRARIO — local: rifiutato con MODEL_PROVIDER_NOT_SUPPORTED_YET, motivo diverso da anthropic/gemini (nessun endpoint di rete, non una traduzione mancante)', () => {
    assert.throws(
        () => risolviDestinazioneModello('local:qwen3-0.6b', depsFinte()),
        (errore) => errore instanceof ModelDestinationError
            && errore.code === 'MODEL_PROVIDER_NOT_SUPPORTED_YET'
            && errore.message.includes('ponte'),
    )
})

test('⛔ AL CONTRARIO — un prefisso non in FONTI_MODELLO non è "una fonte sconosciuta rifiutata": è un id OpenRouter letterale, col due punti dentro', () => {
    // Il ramo difensivo `!COMPATIBILI_OPENAI.includes(fonte)` dentro risolviDestinazioneModello
    // non è raggiungibile passando da separaFonteModello (che filtra già su FONTI_MODELLO) —
    // qui si prova il comportamento VERO che un chiamante osserva: nessun errore, fonte openrouter.
    const dest = risolviDestinazioneModello('xyz:qualcosa', depsFinte({ chiavi: { openrouter: 'sk-or' } }))
    assert.equal(dest.fonte, 'openrouter')
    assert.equal(dest.modelloRemoto, 'xyz:qualcosa')
})

test('risolviDestinazioneModello: dipendenze mancanti/malformate lanciano MODEL_DESTINATION_MISCONFIGURED, mai un TypeError crudo', () => {
    assert.throws(
        () => risolviDestinazioneModello('openai:gpt-5.6-luna', {}),
        (errore) => errore instanceof ModelDestinationError && errore.code === 'MODEL_DESTINATION_MISCONFIGURED',
    )
})

// ---- creaFetchMultiProvider -------------------------------------------------

function fetchRegistrante() {
    const chiamate = []
    const fn = async (url, opzioni) => {
        chiamate.push({ url, opzioni })
        return new Response(JSON.stringify({ ok: true }), { status: 200 })
    }
    fn.chiamate = chiamate
    return fn
}

test('creaFetchMultiProvider: senza dipendenze torna la fetch originale, invariata (comportamento di sempre)', () => {
    const originale = fetchRegistrante()
    const avvolta = creaFetchMultiProvider(originale, { dipendenze: null })
    assert.equal(avvolta, originale)
})

test('creaFetchMultiProvider: un modello SENZA prefisso non tocca URL/headers/corpo — zero sessioni esistenti cambiano comportamento', async () => {
    const originale = fetchRegistrante()
    const avvolta = creaFetchMultiProvider(originale, { dipendenze: depsFinte() })
    await avvolta('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: { Authorization: 'Bearer sk-or' },
        body: JSON.stringify({ model: 'z-ai/glm-5.3-flash', messages: [] }),
    })
    assert.equal(originale.chiamate.length, 1)
    assert.equal(originale.chiamate[0].url, 'https://openrouter.ai/api/v1/chat/completions')
    assert.equal(originale.chiamate[0].opzioni.headers.Authorization, 'Bearer sk-or')
})

test('creaFetchMultiProvider: un modello CON prefisso riscrive URL, headers, e il campo model nel corpo', async () => {
    const originale = fetchRegistrante()
    const avvolta = creaFetchMultiProvider(originale, { dipendenze: depsFinte({ chiavi: { openai: 'sk-vera' } }) })
    await avvolta('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: { Authorization: 'Bearer sk-or-mai-usata' },
        body: JSON.stringify({ model: 'openai:gpt-5.6-luna', messages: [{ role: 'user', content: 'ciao' }] }),
    })
    assert.equal(originale.chiamate.length, 1)
    const { url, opzioni } = originale.chiamate[0]
    assert.equal(url, 'https://api.openai.com/v1/chat/completions')
    assert.equal(opzioni.headers.Authorization, 'Bearer sk-vera')
    const corpo = JSON.parse(opzioni.body)
    assert.equal(corpo.model, 'gpt-5.6-luna')
    assert.deepEqual(corpo.messages, [{ role: 'user', content: 'ciao' }])
})

test('⛔ AL CONTRARIO — creaFetchMultiProvider: una richiesta che non è un completamento (es. ricerca web) passa INTATTA anche con un "model" per caso nel corpo', async () => {
    const originale = fetchRegistrante()
    const avvolta = creaFetchMultiProvider(originale, { dipendenze: depsFinte({ chiavi: { openai: 'sk-vera' } }) })
    await avvolta('https://api.tavily.com/search', {
        method: 'POST',
        body: JSON.stringify({ model: 'openai:gpt-5.6-luna', query: 'ciao' }),
    })
    assert.equal(originale.chiamate[0].url, 'https://api.tavily.com/search')
})

test('⛔⛔ AL CONTRARIO — creaFetchMultiProvider: un provider non servibile (chiave assente) rifiuta PRIMA di chiamare fetch — nessuna richiesta destinata a fallire parte', async () => {
    const originale = fetchRegistrante()
    const avvolta = creaFetchMultiProvider(originale, { dipendenze: depsFinte() })
    await assert.rejects(
        avvolta('https://openrouter.ai/api/v1/chat/completions', {
            method: 'POST',
            body: JSON.stringify({ model: 'openai:gpt-5.6-luna', messages: [] }),
        }),
        (errore) => errore.code === 'PROVIDER_KEY_MISSING',
    )
    assert.equal(originale.chiamate.length, 0)
})

test('⛔⛔⛔ AL CONTRARIO — creaFetchMultiProvider: un corpo non-JSON (es. multipart) non lancia, passa attraverso come sempre', async () => {
    const originale = fetchRegistrante()
    const avvolta = creaFetchMultiProvider(originale, { dipendenze: depsFinte() })
    await avvolta('https://openrouter.ai/api/v1/chat/completions', { method: 'POST', body: 'non-e-json' })
    assert.equal(originale.chiamate.length, 1)
})
