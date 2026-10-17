// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { CHIAVE_BENVENUTO_CHATGPT, CHIAVE_CONSUMI_CHATGPT, creaConsumiChatgpt } from '@/services/chatgptConsumi'

/**
 * N15 fetta 8 (mobile, 13/10/2026) — il conto LOCALE dell'uso del piano (mockup approvato: «Contato da TALOS su questo
 * telefono») e il benvenuto una volta per account. ⛔ Qui non c'è nessun numero di OpenAI: il piano non pubblica i suoi limiti
 * (indicazione del desktop del 13/10), quindi si conta solo ciò che è partito da questo telefono, e lo si dice.
 */
const ORA = 60 * 60 * 1000
function deposito(iniziale: Record<string, string> = {}) {
    const voci = new Map(Object.entries(iniziale))
    return {
        voci,
        getItem: (k: string) => voci.get(k) ?? null,
        setItem: (k: string, v: string) => { voci.set(k, v) },
        removeItem: (k: string) => { voci.delete(k) },
    }
}

describe('N15 — il conto locale dell uso del piano ChatGPT', () => {
    it('N15-CONS-01: due finestre — ultime 5 ore e ultimi 7 giorni — con richieste e token; ciò che è più vecchio non conta', () => {
        let ora = 100 * 24 * ORA
        const consumi = creaConsumiChatgpt({ deposito: deposito(), clock: () => ora })
        consumi.registra(1000)              // 8 giorni fa: fuori da tutto
        ora += 8 * 24 * ORA - 6 * ORA
        consumi.registra(2000)              // 6 ore fa: solo nei 7 giorni
        ora += 5 * ORA
        consumi.registra(300)               // 1 ora fa
        consumi.registra(null)              // un giro senza conto dei token è comunque una richiesta
        ora += ORA
        expect(consumi.riassunto()).toEqual({ ore5: { richieste: 2, token: 300 }, giorni7: { richieste: 3, token: 2300 } })
    })

    it('N15-CONS-02: resta fra un avvio e l altro, butta ciò che ha più di 7 giorni, e un deposito rotto non ferma la chat', () => {
        let ora = 50 * 24 * ORA
        const d = deposito()
        creaConsumiChatgpt({ deposito: d, clock: () => ora }).registra(500)
        ora += 8 * 24 * ORA
        const dopo = creaConsumiChatgpt({ deposito: d, clock: () => ora })
        dopo.registra(40)
        expect(dopo.riassunto().giorni7).toEqual({ richieste: 1, token: 40 })
        expect(JSON.parse(d.voci.get(CHIAVE_CONSUMI_CHATGPT)!)).toHaveLength(1)
        // ⛔ mai un token d'accesso, un indirizzo o un testo: solo istanti e numeri
        expect(d.voci.get(CHIAVE_CONSUMI_CHATGPT)).toMatch(/^\[\[\d+,\d+\]\]$/)

        const rotto = creaConsumiChatgpt({ deposito: deposito({ [CHIAVE_CONSUMI_CHATGPT]: '{non json' }), clock: () => ora })
        expect(rotto.riassunto().giorni7).toEqual({ richieste: 0, token: 0 })
        const cheLancia = { getItem: () => { throw new Error('no') }, setItem: () => { throw new Error('no') }, removeItem: () => { throw new Error('no') } }
        const muto = creaConsumiChatgpt({ deposito: cheLancia, clock: () => ora })
        expect(() => muto.registra(10)).not.toThrow()
        expect(muto.riassunto().ore5).toEqual({ richieste: 0, token: 0 })

        dopo.azzera()
        expect(dopo.riassunto().giorni7).toEqual({ richieste: 0, token: 0 })
        expect(d.voci.has(CHIAVE_CONSUMI_CHATGPT)).toBe(false)
    })

    it('N15-CONS-03: il benvenuto è da mostrare una volta per ACCOUNT, e l indirizzo non resta scritto in chiaro', async () => {
        const d = deposito()
        const consumi = creaConsumiChatgpt({ deposito: d, clock: () => 0 })
        expect(await consumi.benvenutoDaMostrare('Tu@Example.com')).toBe(true)
        await consumi.segnaBenvenuto('Tu@Example.com')
        expect(await consumi.benvenutoDaMostrare('tu@example.com')).toBe(false)
        expect(await consumi.benvenutoDaMostrare('altro@example.com')).toBe(true)
        expect(d.voci.get(CHIAVE_BENVENUTO_CHATGPT)).not.toContain('example.com')
        // l'uscita azzera il conto ma NON il benvenuto: lo stesso account non lo rivede
        consumi.azzera()
        expect(await consumi.benvenutoDaMostrare('tu@example.com')).toBe(false)
    })
})
