// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import TalosCodiceR4Header from '@/components/codice/TalosCodiceR4Header.vue'

/*
 * ⛔ K3-C1 (ledger `LEDGER-K3-CODICE-COME-LA-CHAT-2026-10-15.md`). Owner 15/10: l'header del Codice torna («← · titolo ⌄ · ⌘ · ▤ ·
 * •••»), sistemato per il telefono: «Tre in vista + Altro», con Riprendi, Compatta e Doctor nel menu «•••». A fette e senza
 * comandi finti: in questa fetta ←, il titolo e «•••» con Riprendi e Compatta, che dietro hanno le rotte vere di r4.
 */
afterEach(() => { document.body.innerHTML = '' })

const testata = (props: Record<string, unknown> = {}) => mount(TalosCodiceR4Header, {
    attachTo: document.body,
    props: { titolo: 'Leggi NOTA.md e dimmi cosa dice', occupato: false, ...props },
})

describe('l\'header del Codice su r4 (K3-C1)', () => {
    it('HDR-01 la riga ha ←, il titolo e «•••»; niente ⌘, ▤ né ⌄ finché non hanno un comportamento vero', () => {
        const w = testata()
        expect(w.get('[data-testid="talos-codice-r4-indietro"]').attributes('aria-label')).toBe('Back')
        expect(w.get('[data-testid="talos-codice-r4-titolo"]').text()).toBe('Leggi NOTA.md e dimmi cosa dice')
        expect(w.get('[data-testid="talos-codice-r4-altro"]').attributes('aria-label')).toBe('More actions')
        // ⌄ (dettagli) è arrivato in K3-C2 (HDR-07), ⌘ in K3-C3a (HDR-09), ▤ in K3-C3b (HDR-11)
        for (const b of w.findAll('button')) expect(b.classes()).toContain('min-h-touch')
        w.unmount()
    })

    it('HDR-02 ← emette indietro', async () => {
        const w = testata()
        await w.get('[data-testid="talos-codice-r4-indietro"]').trigger('click')
        expect(w.emitted('indietro')).toHaveLength(1)
        w.unmount()
    })

    it('HDR-03 «•••» apre il foglio con Riprendi e Compatta, che emettono i loro eventi e chiudono il foglio', async () => {
        const w = testata()
        await w.get('[data-testid="talos-codice-r4-altro"]').trigger('click')
        await flushPromises()
        const foglio = () => document.body.querySelector('[data-testid="talos-codice-r4-azioni"]')
        expect(foglio()).not.toBeNull()
        expect(foglio()!.textContent).toContain('Resume the session')
        expect(foglio()!.textContent).toContain('Compact the context')
        document.body.querySelector<HTMLElement>('[data-testid="talos-codice-r4-riprendi"]')!.click()
        await flushPromises()
        expect(w.emitted('riprendi')).toHaveLength(1)
        expect(foglio()).toBeNull()
        await w.get('[data-testid="talos-codice-r4-altro"]').trigger('click')
        await flushPromises()
        document.body.querySelector<HTMLElement>('[data-testid="talos-codice-r4-compatta"]')!.click()
        await flushPromises()
        expect(w.emitted('compatta')).toHaveLength(1)
        w.unmount()
    })

    it('HDR-12 Esporta e Condividi nel foglio «Altro»: emettono, con l’avviso sotto Condividi; senza sessione spenti, col giro acceso no', async () => {
        const w = testata({ conSessione: true, occupato: true })
        await w.get('[data-testid="talos-codice-r4-altro"]').trigger('click')
        await flushPromises()
        expect(document.body.querySelector('[data-testid="talos-codice-r4-condividi"]')!.textContent)
            .toContain('The transcript also holds the tool output and the files read: check it before sending it.')
        for (const id of ['esporta', 'condividi']) expect(document.body.querySelector(`[data-testid="talos-codice-r4-${id}"]`)!.hasAttribute('disabled'), id).toBe(false)
        document.body.querySelector<HTMLElement>('[data-testid="talos-codice-r4-condividi"]')!.click()
        await flushPromises()
        expect(w.emitted('condividi')).toHaveLength(1)
        await w.get('[data-testid="talos-codice-r4-altro"]').trigger('click')
        await flushPromises()
        document.body.querySelector<HTMLElement>('[data-testid="talos-codice-r4-esporta"]')!.click()
        await flushPromises()
        expect(w.emitted('esporta')).toHaveLength(1)
        w.unmount()
        const senza = testata({ conSessione: false })
        await senza.get('[data-testid="talos-codice-r4-altro"]').trigger('click')
        await flushPromises()
        for (const id of ['esporta', 'condividi']) expect(document.body.querySelector(`[data-testid="talos-codice-r4-${id}"]`)!.hasAttribute('disabled'), id).toBe(true)
        senza.unmount()
    })

    it('HDR-04 mentre il giro lavora Riprendi e Compatta sono spente', async () => {
        const w = testata({ occupato: true })
        await w.get('[data-testid="talos-codice-r4-altro"]').trigger('click')
        await flushPromises()
        for (const id of ['talos-codice-r4-riprendi', 'talos-codice-r4-compatta'])
            expect(document.body.querySelector(`[data-testid="${id}"]`)!.hasAttribute('disabled'), id).toBe(true)
        w.unmount()
    })

    /*
     * Owner 15/10 sera: «compatto solo nella versione telefonino portrait; nel tablet … rimane com'è». Sotto i 640 px «•••» col menu;
     * da 640 px in su ▷ Riprendi e ⊞ Compatta in vista e niente «•••» (Tailwind `sm:`). jsdom non valuta le media query: si
     * provano le classi, il resto lo provano le foto in tre viste.
     */
    it('HDR-06 largo: ▷ e ⊞ in vista e «•••» nascosto; stretto: il contrario', async () => {
        const w = testata()
        const riprendi = w.get('[data-testid="talos-codice-r4-riprendi-in-vista"]')
        const compatta = w.get('[data-testid="talos-codice-r4-compatta-in-vista"]')
        for (const b of [riprendi, compatta]) expect(b.classes()).toEqual(expect.arrayContaining(['hidden', 'sm:inline-flex', 'min-h-touch']))
        expect(w.get('[data-testid="talos-codice-r4-altro"]').classes()).toContain('sm:hidden')
        expect(riprendi.attributes('aria-label')).toBe('Resume the session')
        expect(compatta.attributes('aria-label')).toBe('Compact the context')
        await riprendi.trigger('click')
        await compatta.trigger('click')
        expect(w.emitted('riprendi')).toHaveLength(1)
        expect(w.emitted('compatta')).toHaveLength(1)
        w.unmount()
        const occupata = testata({ occupato: true })
        expect(occupata.get('[data-testid="talos-codice-r4-riprendi-in-vista"]').attributes('disabled')).toBeDefined()
        occupata.unmount()
    })

    // K3-C2: il titolo apre dettagli e albero della sessione (⌄), su tutte le larghezze.
    it('HDR-07 il titolo è un pulsante con ⌄ che apre i dettagli', async () => {
        const w = testata()
        const dettagli = w.get('[data-testid="talos-codice-r4-dettagli"]')
        expect(dettagli.element.tagName).toBe('BUTTON')
        expect(dettagli.attributes('aria-haspopup')).toBe('dialog')
        expect(dettagli.text()).toContain('Leggi NOTA.md e dimmi cosa dice')
        expect(dettagli.find('svg').exists()).toBe(true)
        await dettagli.trigger('click')
        expect(w.emitted('dettagli')).toHaveLength(1)
        w.unmount()
    })

    // K3-C2: gli hook del progetto: nel menu sul telefono, «•••» in vista sul tablet (com'è il Codice di oggi).
    // K3-C2b: da 640 px «•••» in vista apre «Doctor e hook» (come `control` del Codice di oggi), non più gli hook diretti.
    it('HDR-08 «Hook del progetto»: voce del menu sul telefono e nel «•••» in vista da 640 px', async () => {
        const w = testata()
        const inVista = w.get('[data-testid="talos-codice-r4-altro-in-vista"]')
        expect(inVista.classes()).toEqual(expect.arrayContaining(['hidden', 'sm:inline-flex', 'min-h-touch']))
        // K3-C Esporta e Condividi (17/10): il foglio ha anche Esporta e Condividi, quindi si chiama «Altro» come il suo titolo
        expect(inVista.attributes('aria-label')).toBe('More actions')
        expect(inVista.attributes('aria-haspopup')).toBe('dialog')
        await inVista.trigger('click')
        await flushPromises()
        document.body.querySelector<HTMLElement>('[data-testid="talos-codice-r4-hook"]')!.click()
        await flushPromises()
        expect(w.emitted('hook')).toHaveLength(1)
        await w.get('[data-testid="talos-codice-r4-altro"]').trigger('click')
        await flushPromises()
        document.body.querySelector<HTMLElement>('[data-testid="talos-codice-r4-hook"]')!.click()
        await flushPromises()
        expect(w.emitted('hook')).toHaveLength(2)
        w.unmount()
    })

    // K3-C2b: «Doctor» nel menu «•••» (telefono e tablet); Riprendi e Compatta nel menu solo sul telefono (sul tablet sono in vista).
    it('HDR-10 «Doctor» nel menu «•••»; sul tablet il menu non ripete Riprendi e Compatta', async () => {
        const w = testata()
        await w.get('[data-testid="talos-codice-r4-altro-in-vista"]').trigger('click')
        await flushPromises()
        const doctor = document.body.querySelector<HTMLElement>('[data-testid="talos-codice-r4-doctor"]')!
        expect(doctor.textContent).toContain('Doctor')
        for (const id of ['talos-codice-r4-riprendi', 'talos-codice-r4-compatta'])
            expect(document.body.querySelector(`[data-testid="${id}"]`)!.closest('li')!.className).toContain('sm:hidden')
        doctor.click()
        await flushPromises()
        expect(w.emitted('doctor')).toHaveLength(1)
        expect(document.body.querySelector('[data-testid="talos-codice-r4-azioni"]')).toBeNull()
        w.unmount()
    })

    // K3-C3b-1 (owner 15/10): ▤ in vista su tutte le larghezze, dopo ⌘ — telefono «← · titolo ⌄ · ⌘ · ▤ · •••», tablet «… · ⌘ · ▤»
    it('HDR-11 ▤ in vista sempre, dopo ⌘ e prima di «•••»; dice se il pannello è aperto e lo apre o chiude', async () => {
        const w = testata({ pannelloAperto: true })
        const pannello = w.get('[data-testid="talos-codice-r4-pannello"]')
        expect(pannello.classes()).toEqual(expect.arrayContaining(['inline-flex', 'min-h-touch']))
        expect(pannello.classes()).not.toContain('hidden')
        expect(pannello.attributes('aria-label')).toBe('Session panel')
        expect(pannello.attributes('aria-expanded')).toBe('true')
        await pannello.trigger('click')
        expect(w.emitted('pannello')).toHaveLength(1)
        const ordine = w.findAll('button').map((b) => b.attributes('data-testid'))
        expect(ordine.indexOf('talos-codice-r4-pannello')).toBe(ordine.indexOf('talos-codice-r4-comandi') + 1)
        expect(ordine.indexOf('talos-codice-r4-pannello')).toBeLessThan(ordine.indexOf('talos-codice-r4-altro'))
        w.unmount()
        expect(testata().get('[data-testid="talos-codice-r4-pannello"]').attributes('aria-expanded')).toBe('false')
    })

    // K3-C3a: ⌘ in vista su tutte le larghezze (owner: «Tre in vista + Altro» sul telefono), apre la tavolozza.
    it('HDR-09 ⌘ in vista sempre, dopo il titolo; apre i comandi', async () => {
        const w = testata()
        const comandi = w.get('[data-testid="talos-codice-r4-comandi"]')
        expect(comandi.classes()).toEqual(expect.arrayContaining(['inline-flex', 'min-h-touch']))
        expect(comandi.classes()).not.toContain('hidden')
        expect(comandi.attributes('aria-label')).toBe('Commands')
        expect(comandi.attributes('aria-haspopup')).toBe('dialog')
        await comandi.trigger('click')
        expect(w.emitted('comandi')).toHaveLength(1)
        // l'ordine del Codice di oggi sul tablet: ••• ▷ ⊞ ⌘
        const ordine = w.findAll('button').map((b) => b.attributes('data-testid'))
        expect(ordine.indexOf('talos-codice-r4-comandi')).toBeGreaterThan(ordine.indexOf('talos-codice-r4-compatta-in-vista'))
        expect(ordine.indexOf('talos-codice-r4-comandi')).toBeLessThan(ordine.indexOf('talos-codice-r4-altro'))
        w.unmount()
    })

    it('HDR-05 la cornice del foglio si nasconde per il Codice su r4, e lo scorrimento del corpo non si blocca', () => {
        const app = readFileSync(resolve(__dirname, '..', '..', '..', 'src', 'App.vue'), 'utf8')
        // RA-09 (21/10/2026): segue anche `computer-codice` (FIL-05)
        expect(app).toMatch(/:hide-chrome="stationLocksBodyScroll \|\| activeRoute === 'codice-r4'[ "]/u)
        const riga = app.split('\n').find((r) => r.includes('const stationLocksBodyScroll'))
        expect(riga).not.toContain('codice-r4')
        vi.restoreAllMocks()
    })
})
