// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils'

vi.mock('@/services/chatgptAccesso', () => ({ talosChatgpt: () => { throw new Error('le prove passano il servizio come proprietà') } }))
vi.mock('@/services/inAppBrowserService', () => ({ openTalosLinkOnce: vi.fn(async () => true) }))

import TalosMobileChatgptAccesso from '@/components/talos/models/TalosMobileChatgptAccesso.vue'

/**
 * N15 fetta 6 (mobile, 13/10/2026) — l'interfaccia del mockup approvato dall'owner il 12/10, nel pannello di OpenAI.
 * Il servizio è finto: ciò che si prova è che cosa vede e che cosa può fare la persona in ogni stato.
 */
// Il benvenuto è un foglio portato nel corpo della pagina: ogni prova smonta il suo riquadro, così non resta a quella dopo.
enableAutoUnmount(afterEach)
const CONSUMI = 'https://chatgpt.com/settings/usage'
function servizio(iniziale: { collegato: boolean, email?: string | null, pianoAbilitato?: boolean }) {
    let stato = { collegato: iniziale.collegato, email: iniziale.email ?? null, pianoAbilitato: iniziale.pianoAbilitato ?? iniziale.collegato,
        scadeAlle: null as number | null, accessoInCorso: false, consumi: CONSUMI }
    let chiudi: (v: unknown) => void = () => {}
    return {
        imposta: (nuovo: Partial<typeof stato>) => { stato = { ...stato, ...nuovo } },
        torna: (esito: unknown) => chiudi(esito),
        stato: vi.fn(async () => stato),
        accedi: vi.fn(() => new Promise<any>((ok) => { chiudi = ok })),
        annulla: vi.fn(async () => { chiudi({ ok: false, codice: 'CHATGPT_ACCESSO_ANNULLATO' }) }),
        esci: vi.fn(async () => { stato = { ...stato, collegato: false, pianoAbilitato: false }; return { revocaConfermata: true } }),
    }
}
const t = (w: ReturnType<typeof mount>, id: string) => w.find(`[data-testid="${id}"]`)
/** Il conto locale e il benvenuto: di serie «già letto», così le prove dell'accesso non vedono il foglio. */
function conto(daMostrare = false) {
    let visto = !daMostrare
    return { benvenutoDaMostrare: vi.fn(async () => !visto), segnaBenvenuto: vi.fn(async () => { visto = true }), azzera: vi.fn() }
}
const nelCorpo = (id: string) => document.body.querySelector<HTMLElement>(`[data-testid="${id}"]`)

describe('N15 — «Continue with ChatGPT» nel pannello di OpenAI', () => {
    it('N15-UI-01: non collegato → pulsante; in attesa → stato e «Cancel sign-in»; riuscito → account, «Manage usage», uscita', async () => {
        const s = servizio({ collegato: false })
        const apri = vi.fn(async () => true)
        const w = mount(TalosMobileChatgptAccesso, { props: { servizio: s, apri } })
        await flushPromises()
        expect(t(w, 'talos-chatgpt-status').text()).toBe('Not connected')
        expect(t(w, 'talos-chatgpt-continue').text()).toBe('Continue with ChatGPT')
        await t(w, 'talos-chatgpt-continue').trigger('click')
        expect(t(w, 'talos-chatgpt-waiting').exists()).toBe(true)
        expect(t(w, 'talos-chatgpt-continue').exists()).toBe(false)
        expect(t(w, 'talos-chatgpt-cancel').text()).toBe('Cancel sign-in')
        s.imposta({ collegato: true, email: 'x@y.z', pianoAbilitato: true })
        s.torna({ ok: true, email: 'x@y.z', pianoAbilitato: true })
        await flushPromises()
        expect(t(w, 'talos-chatgpt-status').text()).toBe('Connected')
        expect(t(w, 'talos-chatgpt-email').text()).toBe('x@y.z')
        // i modelli del piano sono nella chat (fetta 5): lo dice, e dice dove
        expect(t(w, 'talos-chatgpt-in-chat').text()).toBe('Its models are in the model picker, under ChatGPT.')
        await t(w, 'talos-chatgpt-manage').trigger('click')
        expect(apri).toHaveBeenCalledWith(CONSUMI)
    })

    it('N15-UI-02: annullare non è un errore; un guasto vero si dice a parole, e uno ignoto dice il suo codice', async () => {
        const s = servizio({ collegato: false })
        const w = mount(TalosMobileChatgptAccesso, { props: { servizio: s } })
        await flushPromises()
        await t(w, 'talos-chatgpt-continue').trigger('click')
        await t(w, 'talos-chatgpt-cancel').trigger('click')
        await flushPromises()
        expect(s.annulla).toHaveBeenCalled()
        expect(t(w, 'talos-chatgpt-error').exists()).toBe(false)
        expect(t(w, 'talos-chatgpt-continue').exists()).toBe(true)

        await t(w, 'talos-chatgpt-continue').trigger('click')
        s.torna({ ok: false, codice: 'CHATGPT_BROWSER' })
        await flushPromises()
        expect(t(w, 'talos-chatgpt-error').text()).toBe('The browser tab could not be opened.')
        await t(w, 'talos-chatgpt-continue').trigger('click')
        s.torna({ ok: false, codice: 'CHATGPT_QUALCOSA_DI_NUOVO' })
        await flushPromises()
        expect(t(w, 'talos-chatgpt-error').text()).toContain('CHATGPT_QUALCOSA_DI_NUOVO')
    })

    it('N15-UI-03: l uscita chiede conferma, con due azioni una sotto l altra; «Stay connected» non scollega', async () => {
        const s = servizio({ collegato: true, email: 'x@y.z' })
        const w = mount(TalosMobileChatgptAccesso, { props: { servizio: s } })
        await flushPromises()
        await t(w, 'talos-chatgpt-disconnect').trigger('click')
        const conferma = t(w, 'talos-chatgpt-confirm')
        expect(conferma.classes()).toContain('flex-col')
        await t(w, 'talos-chatgpt-disconnect-no').trigger('click')
        expect(s.esci).not.toHaveBeenCalled()
        expect(t(w, 'talos-chatgpt-email').exists()).toBe(true)
        await t(w, 'talos-chatgpt-disconnect').trigger('click')
        await t(w, 'talos-chatgpt-disconnect-yes').trigger('click')
        await flushPromises()
        expect(s.esci).toHaveBeenCalledTimes(1)
        expect(t(w, 'talos-chatgpt-status').text()).toBe('Not connected')
        expect(t(w, 'talos-chatgpt-continue').exists()).toBe(true)
    })

    /**
     * N15-UI-07 (fetta 8) — il benvenuto del mockup approvato: una volta sola per account, dopo un accesso che ha abilitato
     * il piano. «Ho capito» lo segna come letto; un secondo accesso dello stesso account non lo rimostra. L'uscita azzera il
     * conto locale (era di quell'account).
     */
    it('N15-UI-07: dopo un accesso riuscito col piano compare il benvenuto UNA volta; «Got it» lo chiude e lo segna; l uscita azzera il conto', async () => {
        const s = servizio({ collegato: false })
        const c = conto(true)
        const w = mount(TalosMobileChatgptAccesso, { props: { servizio: s, consumi: c }, attachTo: document.body })
        await flushPromises()
        expect(nelCorpo('talos-chatgpt-welcome')).toBeNull()
        await t(w, 'talos-chatgpt-continue').trigger('click')
        s.imposta({ collegato: true, email: 'x@y.z', pianoAbilitato: true })
        s.torna({ ok: true, email: 'x@y.z', pianoAbilitato: true })
        await flushPromises()
        expect(c.benvenutoDaMostrare).toHaveBeenCalledWith('x@y.z')
        expect(nelCorpo('talos-chatgpt-welcome')!.textContent).toContain('Eligible usage in this app uses your ChatGPT plan.')
        nelCorpo('talos-chatgpt-welcome-ok')!.click()
        await flushPromises()
        expect(c.segnaBenvenuto).toHaveBeenCalledWith('x@y.z')
        expect(nelCorpo('talos-chatgpt-welcome')).toBeNull()

        // uscita: il conto locale si azzera
        await t(w, 'talos-chatgpt-disconnect').trigger('click')
        await t(w, 'talos-chatgpt-disconnect-yes').trigger('click')
        await flushPromises()
        expect(c.azzera).toHaveBeenCalledTimes(1)
        // secondo accesso dello stesso account: già letto, niente foglio
        await t(w, 'talos-chatgpt-continue').trigger('click')
        s.imposta({ collegato: true, email: 'x@y.z', pianoAbilitato: true })
        s.torna({ ok: true, email: 'x@y.z', pianoAbilitato: true })
        await flushPromises()
        expect(nelCorpo('talos-chatgpt-welcome')).toBeNull()
        w.unmount()
    })

    it('N15-UI-08: un accesso riuscito SENZA il piano non mostra il benvenuto (non lo sta usando)', async () => {
        const s = servizio({ collegato: false })
        const c = conto(true)
        const w = mount(TalosMobileChatgptAccesso, { props: { servizio: s, consumi: c }, attachTo: document.body })
        await flushPromises()
        await t(w, 'talos-chatgpt-continue').trigger('click')
        s.imposta({ collegato: true, email: 'x@y.z', pianoAbilitato: false })
        s.torna({ ok: true, email: 'x@y.z', pianoAbilitato: false })
        await flushPromises()
        expect(nelCorpo('talos-chatgpt-welcome')).toBeNull()
        expect(c.benvenutoDaMostrare).not.toHaveBeenCalled()
        w.unmount()
    })

    it('N15-UI-04: accesso riuscito SENZA il piano → lo dice e offre di abilitarlo (consenso esplicito), mai da solo', async () => {
        const s = servizio({ collegato: true, email: 'x@y.z', pianoAbilitato: false })
        const w = mount(TalosMobileChatgptAccesso, { props: { servizio: s } })
        await flushPromises()
        expect(w.text()).toContain('not enabled')
        // ⛔ senza il piano i modelli NON ci sono: non lo si promette
        expect(t(w, 'talos-chatgpt-in-chat').exists()).toBe(false)
        expect(s.accedi).not.toHaveBeenCalled()
        await t(w, 'talos-chatgpt-enable').trigger('click')
        expect(s.accedi).toHaveBeenCalledWith({ consenso: true })
    })

    /**
     * ⛔ N15-UI-05 — revisione 13/10/2026 (E1). «In attesa» viveva solo dentro il riquadro, che si smonta quando la sezione di
     * OpenAI si richiude: riaprendola si vedeva «Continue with ChatGPT» senza «Annulla», con l'accesso, la porta e la
     * notifica ancora vivi; e un accesso che riusciva intanto non compariva. Ora l'attesa si legge dal servizio
     * (`accessoInCorso`) e il riquadro si aggiorna quando il servizio dice che qualcosa è cambiato.
     */
    it('N15-UI-05: rimontato durante un accesso → ancora «in attesa» con «Cancel sign-in»; quando l accesso finisce si aggiorna da solo', async () => {
        const s = servizio({ collegato: false })
        const ascoltatori = new Set<(esito?: unknown) => void>()
        const vivo = Object.assign(s, { quandoCambia: vi.fn((f: (esito?: unknown) => void) => { ascoltatori.add(f); return () => { ascoltatori.delete(f) } }) })
        const primo = mount(TalosMobileChatgptAccesso, { props: { servizio: vivo } })
        await flushPromises()
        await t(primo, 'talos-chatgpt-continue').trigger('click')
        s.imposta({ accessoInCorso: true })
        primo.unmount()
        expect(ascoltatori.size).toBe(0) // chi si smonta smette di ascoltare

        const w = mount(TalosMobileChatgptAccesso, { props: { servizio: vivo } })
        await flushPromises()
        expect(t(w, 'talos-chatgpt-waiting').exists()).toBe(true)
        expect(t(w, 'talos-chatgpt-continue').exists()).toBe(false)
        await t(w, 'talos-chatgpt-cancel').trigger('click')
        expect(s.annulla).toHaveBeenCalledTimes(1)
        // l'accesso (partito dal riquadro di prima) riesce: il servizio lo dice a chi c'è adesso
        s.imposta({ accessoInCorso: false, collegato: true, email: 'x@y.z', pianoAbilitato: true })
        for (const f of ascoltatori) f({ ok: true, email: 'x@y.z', pianoAbilitato: true })
        await flushPromises()
        expect(t(w, 'talos-chatgpt-waiting').exists()).toBe(false)
        expect(t(w, 'talos-chatgpt-status').text()).toBe('Connected')
        expect(w.emitted('cambiato')).toBeTruthy()
        // e un accesso che finisce male si dice a chi c'è adesso, con la sua frase
        s.imposta({ accessoInCorso: false, collegato: false })
        for (const f of ascoltatori) f({ ok: false, codice: 'CHATGPT_ASCOLTO_INTERROTTO' })
        await flushPromises()
        expect(t(w, 'talos-chatgpt-error').text()).toBe('The sign-in listener was interrupted before ChatGPT answered. Try again.')
    })

    /**
     * ⛔ N15-UI-06 — revisione 13/10/2026 (A5). Dopo un'attività ricreata la pagina è nuova: il riquadro chiede al servizio
     * di riprendere l'accesso rimasto a metà, al montaggio e ogni volta che la pagina torna visibile. Niente da riprendere
     * (il caso normale) non mostra niente.
     */
    it('N15-UI-06: al montaggio e al ritorno in primo piano si riprende un accesso rimasto a metà; il suo guasto si dice, il «niente» no', async () => {
        const s = servizio({ collegato: false })
        const riprendi = vi.fn<() => Promise<unknown>>(async () => null)
        const w = mount(TalosMobileChatgptAccesso, { props: { servizio: Object.assign(s, { riprendi }) } })
        await flushPromises()
        expect(riprendi).toHaveBeenCalledTimes(1)
        expect(t(w, 'talos-chatgpt-error').exists()).toBe(false)
        riprendi.mockResolvedValueOnce({ ok: false, codice: 'CHATGPT_CUSTODIA_ILLEGGIBILE' })
        document.dispatchEvent(new Event('visibilitychange'))
        await flushPromises()
        expect(riprendi).toHaveBeenCalledTimes(2)
        expect(t(w, 'talos-chatgpt-error').text()).toBe('The secure storage on this device did not answer. Nothing was changed: try again.')
        w.unmount()
        document.dispatchEvent(new Event('visibilitychange'))
        expect(riprendi).toHaveBeenCalledTimes(2)
    })
})
