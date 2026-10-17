// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import TalosCodiceR4ComandiSheet from '@/components/codice/TalosCodiceR4ComandiSheet.vue'
import TalosCodiceR4RinominaSheet from '@/components/codice/TalosCodiceR4RinominaSheet.vue'
import { TALOS_EN_MESSAGES } from '@/i18n/locales/en'
import { TALOS_IT_MESSAGES } from '@/i18n/locales/it'

/*
 * ⛔ K3-C3a (ledger `LEDGER-K3-CODICE-COME-LA-CHAT-2026-10-15.md`): ⌘, la tavolozza dei comandi del Codice su r4. Come il Codice di
 * oggi (`app.js:7840`) e Happy (`CommandPaletteProvider.tsx:48-109`): ricerca in cima, voci a gruppi con titolo e sottotitolo. Solo
 * i comandi che hanno un comportamento vero su r4.
 */
afterEach(() => { document.body.innerHTML = '' })
const voci = () => [...document.body.querySelectorAll('[data-comando]')].map((e) => e.getAttribute('data-comando'))

async function tavolozza(props: Record<string, unknown> = {}) {
    const w = mount(TalosCodiceR4ComandiSheet, { attachTo: document.body, props: { conSessione: true, occupato: false, ...props } })
    await flushPromises()
    return w
}

describe('la tavolozza dei comandi (K3-C3a)', () => {
    it('CMD-01 i comandi veri, a gruppi, con titolo e sottotitolo; nessun comando senza comportamento', async () => {
        const w = await tavolozza()
        // K3-C2b: «Doctor» nel gruppo «Vai a» (CMD-07)
        // K3-C Esporta e Condividi (owner 17/10): Esporta e Condividi nel gruppo Sessione
        expect(voci()).toEqual(['nuova', 'rinomina', 'duplica', 'riprendi', 'compatta', 'esporta', 'condividi', 'albero', 'hook', 'doctor'])
        const testo = document.body.textContent ?? ''
        for (const parola of ['Session', 'Go to', 'New session', 'Rename', 'Duplicate into a new session', 'Session tree', 'Project hooks', 'Export', 'Share'])
            expect(testo, parola).toContain(parola)
        for (const assente of ['Review', 'Terminal', 'Browser', 'Automations']) expect(testo, assente).not.toContain(assente)
        w.unmount()
    })

    it('CMD-02 la ricerca filtra su titolo e sottotitolo; senza risultati lo dice', async () => {
        const w = await tavolozza()
        const campo = document.body.querySelector<HTMLInputElement>('[data-testid="talos-codice-r4-comandi-cerca"]')!
        // nelle prove i testi sono in inglese: «tree» sta nel titolo di «Session tree»
        campo.value = 'tree'
        campo.dispatchEvent(new Event('input'))
        await flushPromises()
        expect(voci()).toEqual(['albero'])
        // e nel sottotitolo: «branch» sta solo in quello di «Duplicate into a new session»
        campo.value = 'branch'
        campo.dispatchEvent(new Event('input'))
        await flushPromises()
        expect(voci()).toEqual(['duplica'])
        campo.value = 'zzzz'
        campo.dispatchEvent(new Event('input'))
        await flushPromises()
        expect(voci()).toEqual([])
        expect(document.body.textContent).toContain('No command found.')
        w.unmount()
    })

    it('CMD-03 toccando una voce emette il comando', async () => {
        const w = await tavolozza()
        document.body.querySelector<HTMLElement>('[data-comando="duplica"]')!.click()
        expect(w.emitted('comando')).toEqual([['duplica']])
        w.unmount()
    })

    it('CMD-04 senza sessione e mentre il giro lavora le voci della sessione sono spente; «Nuova sessione» no', async () => {
        for (const props of [{ conSessione: false }, { occupato: true }]) {
            const w = await tavolozza(props)
            for (const id of ['rinomina', 'duplica', 'riprendi', 'compatta'])
                expect(document.body.querySelector(`[data-comando="${id}"]`)!.hasAttribute('disabled'), `${id} ${JSON.stringify(props)}`).toBe(true)
            expect(document.body.querySelector('[data-comando="nuova"]')!.hasAttribute('disabled')).toBe(false)
            // K3-C Esporta e Condividi: leggono soltanto; servono una sessione, non un giro fermo
            for (const id of ['esporta', 'condividi'])
                expect(document.body.querySelector(`[data-comando="${id}"]`)!.hasAttribute('disabled'), `${id} ${JSON.stringify(props)}`).toBe('conSessione' in props)
            w.unmount()
            document.body.innerHTML = ''
        }
    })
})

describe('rinomina (K3-C3a)', () => {
    it('CMD-05 il campo parte dal titolo; «Save» spento se vuoto o uguale; salva il nome nuovo', async () => {
        const w = mount(TalosCodiceR4RinominaSheet, { attachTo: document.body, props: { titolo: 'Leggi NOTA.md' } })
        await flushPromises()
        const campo = document.body.querySelector<HTMLInputElement>('[data-testid="talos-codice-r4-rinomina-campo"]')!
        const salva = () => document.body.querySelector<HTMLButtonElement>('[data-testid="talos-codice-r4-rinomina-salva"]')!
        expect(campo.value).toBe('Leggi NOTA.md')
        expect(salva().disabled).toBe(true)
        campo.value = '   '
        campo.dispatchEvent(new Event('input'))
        await flushPromises()
        expect(salva().disabled).toBe(true)
        campo.value = 'La nota del modulo'
        campo.dispatchEvent(new Event('input'))
        await flushPromises()
        expect(salva().disabled).toBe(false)
        salva().click()
        expect(w.emitted('salva')).toEqual([['La nota del modulo']])
        w.unmount()
    })

    /**
     * ⛔ K3-C3a2 (owner 15/10: «Tenerlo, testo onesto»): `forka()` di r4 (`session-registry.mjs:10269` @ 99ffa3d38) semina la
     * storia e AVVIA SUBITO un giro (`giroNonDellaPersona`): una richiesta in più al modello, che può costare. Il sottotitolo lo dice.
     */
    it('CMD-06 il sottotitolo di Duplica dice che è un ramo e che TALOS risponde di nuovo con una richiesta in più', () => {
        expect(TALOS_IT_MESSAGES.harness.r4CmdDuplicateHint).toBe('Un ramo con la stessa storia: TALOS risponde di nuovo (una richiesta in più)')
        expect(TALOS_EN_MESSAGES.harness.r4CmdDuplicateHint).toBe('A branch with the same history: TALOS answers again (one more request)')
    })
})
