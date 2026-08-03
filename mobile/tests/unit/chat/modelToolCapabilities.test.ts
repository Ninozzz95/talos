import { describe, expect, it } from 'vitest'
import { talosModelSupportsToolCalling } from '@/lib/chat/modelToolCapabilities'
import type { TalosMobileProviderModel } from '@/lib/chat/providerContracts'

/**
 * Chi puo' chiamare un tool, e questa funzione non aveva un test.
 *
 * Se ne accorge adesso perche' la riga che negava i modelli locali e' stata
 * tolta e non l'ha protestato nessuno: una regola che decide meta' delle
 * capacita' dell'app e che si puo' invertire senza far diventare rosso niente
 * non e' una regola, e' un'opinione lasciata in giro.
 */
function model(over: Partial<TalosMobileProviderModel> = {}): TalosMobileProviderModel {
    return {
        id: 'x',
        provider: 'anthropic',
        label: 'X',
        supportedParameters: [],
        ...over,
    } as TalosMobileProviderModel
}

describe('chi puo chiamare un tool', () => {
    it('offre i tool ai modelli locali, che e la richiesta dell owner', () => {
        /**
         * Owner 2026-08-03: «i locali devono avere le stesse possibilita' dei
         * key». Fino a `1b085f8` era negato, e la motivazione scritta accanto
         * era vera: il prompt lo costruivamo noi con ChatML nudo, quindi
         * nessuna sintassi di chiamata poteva arrivare al modello.
         *
         * Adesso i tool entrano nel template del GGUF, la grammatica GBNF
         * vincola l'uscita e `common_chat_parse` restituisce `tool_calls`.
         * Se qualcuno rimette quella riga, questo test diventa rosso.
         */
        expect(talosModelSupportsToolCalling(model({ provider: 'local', id: '/models/x.gguf' })))
            .toBe(true)
    })

    it('su OpenRouter crede al catalogo, che e l unico a dichiararlo', () => {
        // OpenRouter pubblica `supported_parameters` per modello: li' l'assenza
        // di `tools` e' un'informazione, non un silenzio.
        expect(talosModelSupportsToolCalling(model({
            provider: 'openrouter', supportedParameters: ['tools'],
        }))).toBe(true)
        expect(talosModelSupportsToolCalling(model({
            provider: 'openrouter', supportedParameters: ['temperature'],
        }))).toBe(false)
    })

    it('non applica quella regola a chi non dichiara niente', () => {
        // Gli altri cataloghi non espongono lo stesso contratto: pretendere il
        // token anche da loro spegnerebbe percorsi che funzionano.
        for (const provider of ['anthropic', 'openai', 'gemini', 'ollama', 'deepseek'] as const) {
            expect(talosModelSupportsToolCalling(model({ provider, supportedParameters: [] })))
                .toBe(true)
        }
    })
})
