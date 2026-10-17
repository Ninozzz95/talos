// @vitest-environment node
import { describe, expect, it, vi } from 'vitest'
import { CHIAVE_ACCESSO_APERTO, riprendiAccessoRimasto, tieniIlSegnoDellAccesso } from '@/services/chatgptRipresa'

/**
 * N15 fetta 11 (mobile, 13/10/2026) — la ripresa di un accesso rimasto a metà ALL'AVVIO dell'app. Se Android ricrea
 * l'attività mentre la scheda di ChatGPT è davanti, l'app riparte dalla chat: prima la ripresa partiva solo dal riquadro
 * di OpenAI, quindi l'accesso restava a metà finché la persona non tornava là. Ora un segno nelle preferenze (nessun
 * segreto: solo «c'è un accesso aperto») dice all'avvio di riprenderlo; senza segno all'avvio non si carica niente.
 */
function deposito(iniziale: Record<string, string> = {}) {
    const voci = new Map(Object.entries(iniziale))
    return { voci, getItem: (k: string) => voci.get(k) ?? null, setItem: (k: string, v: string) => { voci.set(k, v) }, removeItem: (k: string) => { voci.delete(k) } }
}
function servizio(esito: unknown) {
    let inCorso = false
    const ascoltatori = new Set<() => void>()
    return {
        imposta: (v: boolean) => { inCorso = v; for (const f of ascoltatori) f() },
        stato: vi.fn(async () => ({ accessoInCorso: inCorso })),
        quandoCambia: vi.fn((f: () => void) => { ascoltatori.add(f); return () => { ascoltatori.delete(f) } }),
        riprendi: vi.fn(async () => esito),
    }
}

describe('N15 — la ripresa dell accesso all avvio dell app', () => {
    it('N15-RIP-01: mentre un accesso è aperto resta un segno nelle preferenze; quando finisce il segno si toglie', async () => {
        const d = deposito()
        const s = servizio(null)
        tieniIlSegnoDellAccesso(s, d)
        expect(d.voci.has(CHIAVE_ACCESSO_APERTO)).toBe(false)
        s.imposta(true)
        await vi.waitFor(() => expect(d.voci.has(CHIAVE_ACCESSO_APERTO)).toBe(true))
        // ⛔ nessun segreto: solo un «c'è»
        expect(d.voci.get(CHIAVE_ACCESSO_APERTO)).toBe('1')
        s.imposta(false)
        await vi.waitFor(() => expect(d.voci.has(CHIAVE_ACCESSO_APERTO)).toBe(false))
    })

    it('N15-RIP-02: all avvio, col segno, l accesso si riprende; riuscito ⇒ la chat rilegge il piano e la persona lo sa; il segno si toglie', async () => {
        const d = deposito({ [CHIAVE_ACCESSO_APERTO]: '1' })
        const s = servizio({ ok: true, email: 'x@y.z', pianoAbilitato: true })
        const quandoCollegato = vi.fn(async () => {})
        const avvisa = vi.fn()
        const esito = await riprendiAccessoRimasto({ servizio: s, deposito: d, quandoCollegato, avvisa })
        expect(esito).toMatchObject({ ok: true })
        expect(s.riprendi).toHaveBeenCalledTimes(1)
        expect(quandoCollegato).toHaveBeenCalledTimes(1)
        expect(avvisa).toHaveBeenCalledWith('collegato', null)
        expect(d.voci.has(CHIAVE_ACCESSO_APERTO)).toBe(false)
    })

    it('N15-RIP-03: una ripresa che finisce male si dice col suo codice; «annullato» e «niente da riprendere» non dicono niente', async () => {
        const male = servizio({ ok: false, codice: 'CHATGPT_TEMPO_SCADUTO' })
        const avvisa = vi.fn()
        const quandoCollegato = vi.fn(async () => {})
        await riprendiAccessoRimasto({ servizio: male, deposito: deposito({ [CHIAVE_ACCESSO_APERTO]: '1' }), quandoCollegato, avvisa })
        expect(avvisa).toHaveBeenCalledWith('fallito', 'CHATGPT_TEMPO_SCADUTO')
        expect(quandoCollegato).not.toHaveBeenCalled()

        for (const esito of [null, { ok: false, codice: 'CHATGPT_ACCESSO_ANNULLATO' }]) {
            const zitto = vi.fn()
            const d = deposito({ [CHIAVE_ACCESSO_APERTO]: '1' })
            await riprendiAccessoRimasto({ servizio: servizio(esito), deposito: d, quandoCollegato, avvisa: zitto })
            expect(zitto).not.toHaveBeenCalled()
            expect(d.voci.has(CHIAVE_ACCESSO_APERTO)).toBe(false)
        }
    })

    it('N15-RIP-04: il deposito che non risponde lascia il segno (si riprova al prossimo avvio) e non lo spaccia per un fallimento', async () => {
        const d = deposito({ [CHIAVE_ACCESSO_APERTO]: '1' })
        const avvisa = vi.fn()
        await riprendiAccessoRimasto({ servizio: servizio({ ok: false, codice: 'CHATGPT_CUSTODIA_ILLEGGIBILE' }), deposito: d, quandoCollegato: vi.fn(async () => {}), avvisa })
        expect(d.voci.has(CHIAVE_ACCESSO_APERTO)).toBe(true)
        expect(avvisa).not.toHaveBeenCalled()
    })

    it('N15-RIP-05 AL CONTRARIO: senza segno non si riprende niente (all avvio normale non si tocca il Keystore)', async () => {
        const s = servizio({ ok: true, email: null, pianoAbilitato: true })
        const esito = await riprendiAccessoRimasto({ servizio: s, deposito: deposito(), quandoCollegato: vi.fn(async () => {}), avvisa: vi.fn() })
        expect(esito).toBeNull()
        expect(s.riprendi).not.toHaveBeenCalled()
    })
})
