import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * ⭐⭐⭐ SE UNA GRAMMATICA POTRA' TENERE LE CHIAMATE — il quarto booleano.
 *
 * ## Il fatto, misurato sul Pad l'11/09/2026
 *
 * Alla domanda **«Come ti chiami»**, `Llama-3.2-3B-Instruct-Q4_0` ha risposto
 * cosi' — testo grezzo, dalla riga di diagnosi del JNI:
 *
 * ```
 * {"name": "tool_details", "parameters": {"names": "['library_list', 'web_read', …]"}}
 * {"name": "library_list", "parameters": {}}
 * ```
 *
 * Due chiamate a strumenti al posto di un nome, e `names` come **stringa** dove
 * lo schema dice `z.array(z.string()).min(1).max(8)`. Nel log della stessa
 * generazione: `formato di chat: peg-native (tool: 5, grammatica: no)`.
 *
 * In `common/chat.cpp` del sottomodulo pinnato ci sono handler dedicati per
 * gemma4, lfm2, qwen3-coder, gpt-oss, ministral, kimi e altri otto — ognuno
 * costruisce **la propria grammatica**. Per Llama 3.x non ce n'e' nessuno: si
 * cade sul percorso nativo e `params.grammar` resta vuota. Senza grammatica
 * quel valore sbagliato **puo'** nascere; con una, non potrebbe.
 *
 * ## ⛔ Perche' questa prova guarda il verso NEGATIVO
 *
 * Il difetto naturale qui e' l'ottimismo: un campo che manca trattato come
 * «probabilmente si'», o un valore non booleano accettato perche' «c'e'». Su
 * questo campo l'ottimismo significa dare attrezzi a un modello che non
 * sappiamo tenere — cioe' esattamente cio' che ha prodotto le due chiamate
 * sbagliate. ⇒ Tutto cio' che non e' un `true` esplicito vale **false**.
 */

const ponte = vi.hoisted(() => ({ templateCapabilities: vi.fn() }))

vi.mock('@capacitor/core', () => ({
    registerPlugin: () => ponte,
    Capacitor: { isNativePlatform: () => true, getPlatform: () => 'android' },
}))

vi.mock('@capacitor/preferences', () => ({
    Preferences: { get: vi.fn(async () => ({ value: null })), set: vi.fn(async () => {}) },
}))

const { talosLocalEngineTemplateCapabilities } = await import('@/services/localEngine')

async function capacita(payload: Record<string, unknown>) {
    ponte.templateCapabilities.mockResolvedValue({ capabilities: JSON.stringify(payload) })
    return talosLocalEngineTemplateCapabilities('/models/x.gguf')
}

const BASE = { supportsTools: true, supportsToolCalls: true, supportsSystemRole: true }

describe('GRAMMATICA — se le chiamate di questo modello si possono tenere', () => {
    beforeEach(() => {
        ponte.templateCapabilities.mockReset()
    })

    it('GRM-01 quando il motore dice di si, si legge si', async () => {
        expect((await capacita({ ...BASE, grammarForTools: true }))?.grammarForTools).toBe(true)
    })

    it('GRM-02 quando dice di no, si legge no', async () => {
        expect((await capacita({ ...BASE, grammarForTools: false }))?.grammarForTools).toBe(false)
    })

    /**
     * ⛔ IL TEST CHE MORDE. Un ponte piu' vecchio non manda il campo: la
     * lettura deve continuare a funzionare — le altre tre capability servono
     * comunque — ma senza promuovere il silenzio a permesso.
     */
    it('GRM-03 se il campo MANCA le altre restano leggibili, e questo vale no', async () => {
        const letto = await capacita(BASE)
        expect(letto).not.toBeNull()
        expect(letto?.supportsToolCalls).toBe(true)
        expect(letto?.grammarForTools).toBe(false)
    })

    /**
     * ⛔ La stringa `"true"` e' vera in JavaScript. Se qualcuno un giorno
     * serializzasse i booleani come testo, un `?? false` o un `Boolean(...)`
     * la farebbero passare per un si'. Qui no.
     */
    it('GRM-04 la STRINGA «true» non e un si', async () => {
        expect((await capacita({ ...BASE, grammarForTools: 'true' }))?.grammarForTools).toBe(false)
    })

    it('GRM-05 e nemmeno il numero 1', async () => {
        expect((await capacita({ ...BASE, grammarForTools: 1 }))?.grammarForTools).toBe(false)
    })

    /**
     * ⛔⛔ AL CONTRARIO, e la prova che il campo NON e' decorativo: due modelli
     * che dicono la stessa cosa su `supportsToolCalls` devono poter dire cose
     * DIVERSE qui. E' l'intero motivo per cui questo booleano esiste — se
     * qualcuno lo derivasse da `supportsToolCalls`, questa prova cade.
     */
    it('GRM-06 due modelli identici sugli attrezzi possono differire sulla grammatica', async () => {
        const vincolabile = await capacita({ ...BASE, grammarForTools: true })
        const libero = await capacita({ ...BASE, grammarForTools: false })
        expect(vincolabile?.supportsToolCalls).toBe(libero?.supportsToolCalls)
        expect(vincolabile?.grammarForTools).not.toBe(libero?.grammarForTools)
    })
})
