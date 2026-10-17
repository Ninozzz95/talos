import { describe, expect, it, vi } from 'vitest'
import { apriCodiceR4SeDisponibile, apriCodiceSulTabletR4, ROTTA_RIPIEGO_R4 } from '@/lib/harness/r4/sceltaCodiceR4'
import { TALOS_EN_MESSAGES } from '@/i18n/locales/en'
import { TALOS_IT_MESSAGES } from '@/i18n/locales/it'

/*
 * ⛔ K4-E (ledger `LEDGER-K4E-R4-NELLA-RELEASE-2026-10-17.md`; owner 17/10 «r4 al posto, il vecchio come ripiego»): la voce «Codice»
 * (`/harness`) apre r4 quando l'APK lo porta; se r4 non parte, `/codice-r4` torna qui con `ripiego=1` e qui si resta.
 */
const router = () => ({ replace: vi.fn(async () => undefined) })

describe('quale Codice apre la voce «Codice» (K4-E)', () => {
    it('RIP-01 sul Codice vecchio senza ripiego, con r4 disponibile: si va a r4', async () => {
        const r = router()
        expect(await apriCodiceR4SeDisponibile({ rotta: { name: 'harness', query: {} }, router: r, disponibile: async () => true })).toBe(true)
        expect(r.replace).toHaveBeenCalledWith({ name: 'codice-r4' })
    })

    it('RIP-02 col ripiego si resta sul Codice vecchio, e non si chiede nemmeno se r4 c\'è', async () => {
        const r = router()
        const disponibile = vi.fn(async () => true)
        expect(await apriCodiceR4SeDisponibile({ rotta: { name: 'harness', query: { ripiego: '1' } }, router: r, disponibile })).toBe(false)
        expect(disponibile).not.toHaveBeenCalled()
        expect(r.replace).not.toHaveBeenCalled()
        expect(ROTTA_RIPIEGO_R4).toEqual({ name: 'harness', query: { ripiego: '1' } })
    })

    it('RIP-04 r4 È il Codice: il titolo è «Codice», non più l’etichetta «motore nuovo» dell’affiancamento (visto sul Pad, 17/10)', () => {
        expect([TALOS_IT_MESSAGES.harness.r4Title, TALOS_EN_MESSAGES.harness.r4Title]).toEqual(['Codice', 'Code'])
        expect([TALOS_IT_MESSAGES.harness.r4Starting, TALOS_EN_MESSAGES.harness.r4Starting]).toEqual(['Avvio del Codice…', 'Starting Code…'])
    })

    it('RIP-05 sul tablet la pagina-elenco «Codice» apre r4, non l\'ultima sessione vecchia (visto sul Pad, 17/10); senza r4 o col ripiego, come prima', async () => {
        const sessioniVecchie = vi.fn(async () => [{ id: 'vecchia-1' }, { id: 'vecchia-2' }])
        const elenco = () => ({ name: 'harness', query: {} })
        const r = router()
        await apriCodiceSulTabletR4({ rottaAttuale: elenco, router: r, disponibile: async () => true, sessioniVecchie })
        expect(r.replace).toHaveBeenCalledWith({ name: 'codice-r4' })
        expect(sessioniVecchie).not.toHaveBeenCalled()
        const senza = router()
        await apriCodiceSulTabletR4({ rottaAttuale: elenco, router: senza, disponibile: async () => false, sessioniVecchie })
        expect(senza.replace).toHaveBeenCalledWith({ name: 'harness-session', params: { id: 'vecchia-1' } })
        const ripiego = router()
        await apriCodiceSulTabletR4({ rottaAttuale: () => ({ name: 'harness', query: { ripiego: '1' } }), router: ripiego, disponibile: async () => true, sessioniVecchie: async () => [] })
        expect(ripiego.replace).toHaveBeenCalledWith({ name: 'harness-session', params: { id: 'new' } })
        // ⛔ visto sul Pad (17/10): mentre si chiedeva al ponte, `HarnessScreen` aveva già mandato a r4; la rotta letta all'inizio
        // diceva ancora `harness` e si apriva la sessione vecchia 57 ms dopo. La rotta si rilegge al momento di decidere.
        let attuale: { name: string; query: Record<string, string> } = { name: 'harness', query: {} }
        const gara = router()
        await apriCodiceSulTabletR4({
            rottaAttuale: () => attuale, router: gara,
            disponibile: async () => { attuale = { name: 'codice-r4', query: {} }; return false },
            sessioniVecchie,
        })
        expect(gara.replace).not.toHaveBeenCalled()
    })

    it('RIP-03 r4 assente, o una sessione del Codice vecchio aperta per indirizzo: si resta', async () => {
        const r = router()
        expect(await apriCodiceR4SeDisponibile({ rotta: { name: 'harness', query: {} }, router: r, disponibile: async () => false })).toBe(false)
        expect(await apriCodiceR4SeDisponibile({ rotta: { name: 'harness-session', query: {} }, router: r, disponibile: async () => true })).toBe(false)
        // un guasto del ponte non porta da nessuna parte
        expect(await apriCodiceR4SeDisponibile({ rotta: { name: 'harness', query: {} }, router: r, disponibile: async () => { throw new Error('no') } })).toBe(false)
        expect(r.replace).not.toHaveBeenCalled()
    })
})
