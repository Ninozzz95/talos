// @vitest-environment jsdom
/**
 * LEGGERA-01..04 e PILLOLA-DETT-01..02 — owner 28/10/2026, due foto dal telefono e «Approvo» sulle proposte:
 *   · aperto, la riga sotto era troppo affollata: il nome del modello finiva «G…» schiacciato da «Molto alto» e dal tondo pieno della
 *     Libreria. Il livello diventa TACCHE (quelle del segnale: una per il primo livello del modello, quattro per l'ultimo; la parola resta
 *     per chi ascolta) e la Libreria esce dalla riga: un pallino sul «+», e si apre dal foglio del «+».
 *   · col microfono la forma cambiava e dentro il compositore compariva un secondo riquadro arancione. Ora la dettatura È il compositore:
 *     stessa cornice, nessun riquadro dentro; «ti sto sentendo» lo dice il bordo, color accento.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import TalosMobileComposer from '@/components/chat/TalosMobileComposer.vue'
import type { TalosMobileModelProfileView } from '@/components/chat/mobileChatTypes'
import { __resetSettingsStoreForTests } from '@/stores/settings'

const sol: TalosMobileModelProfileView = {
    id: 'chatgpt:gpt-6.1-sol', provider: 'chatgpt', model: 'gpt-6.1-sol', display_name: 'GPT-6.1-Sol', status: 'healthy', has_secret: true,
    effort_levels: ['off', 'low', 'medium', 'high', 'xhigh'], supports_thinking: true, show_in_composer: true, capabilities: null, probe_ok: true,
}
let w: VueWrapper | null = null
afterEach(() => { w?.unmount(); w = null; document.body.innerHTML = ''; __resetSettingsStoreForTests() })

async function monta(extra: Record<string, unknown> = {}, apri = true) {
    w = mount(TalosMobileComposer, {
        attachTo: document.body,
        global: { stubs: { teleport: true } },
        props: {
            prompt: '', modelProfiles: [sol], routingProfiles: [], selectedModelProfileId: sol.id, selectedRoutingProfileId: null,
            selectedEffort: 'xhigh', thinking: true, canSend: true, sending: false, sendDisabledReason: '', dictationSupported: true, docked: true,
            ...extra,
        },
    })
    // aperto come lo trova l'utente; mentre si detta il campo non c'è
    if (apri) await w.get('[data-testid="talos-composer-prompt"]').trigger('focus')
    return w
}
const livello = (v: VueWrapper) => v.get('[data-testid="talos-composer-model-level"]')

describe('LEGGERA la riga aperta lascia spazio al nome del modello', () => {
    /*
     * ⭐ Owner 28/10/2026: le tacche del segnale non andavano («qualcosa di più unico, capibile e leggermente più grande»). Fra tre
     * proposte (mockup su disco, `.claude/mockup/indicatore-ragionamento-2026-10-28/`) ha scelto «C»: la LANCETTA. Un quadrante di
     * 26×22: l'arco si riempie e la lancetta sale col livello (0 a sinistra per «spento», 4 a destra per l'ultimo livello del modello);
     * «Auto» è la lancetta tratteggiata sul livello che parte davvero. La parola resta per chi ascolta.
     */
    it('LEGGERA-01 il livello è una lancetta: 4 per l\'ultimo livello del modello, 1 per il primo; la parola resta per chi ascolta', async () => {
        const v = await monta()
        expect(livello(v).attributes('data-livello')).toBe('4')
        const quadrante = livello(v).get('svg')
        expect([quadrante.attributes('width'), quadrante.attributes('height')]).toEqual(['26', '22'])
        expect(quadrante.find('[data-parte="arco-pieno"]').exists()).toBe(true)
        // la traccia di fondo c'è in ogni tema: il token lo scrive il motore dei temi a runtime, la riserva copre un tema che non lo
        // definisce (revisione del Desktop, 28/10)
        expect(quadrante.get('[data-parte="traccia"]').attributes('stroke')).toBe('var(--talos-border-strong, var(--talos-border))')
        expect(quadrante.get('[data-parte="lancetta"]').attributes('stroke-dasharray')).toBeUndefined()
        expect(livello(v).get('.sr-only').text()).toBe('Extra high')
        w?.unmount()
        const basso = await monta({ selectedEffort: 'low' })
        expect(livello(basso).attributes('data-livello')).toBe('1')
        // il chip lo dice ancora intero nel suo nome
        expect(basso.get('[data-testid="talos-composer-model-chip"]').attributes('aria-label')).toContain('Low')
    })

    it('LEGGERA-02 «Auto» è la lancetta tratteggiata sul livello che parte; «spento» è a sinistra con l\'arco vuoto', async () => {
        const v = await monta({ selectedEffort: null })
        expect(livello(v).attributes('data-auto')).toBe('true')
        expect(livello(v).get('[data-parte="lancetta"]').attributes('stroke-dasharray')).toBeTruthy()
        expect(livello(v).text()).toBe('Auto')
        w?.unmount()
        const spento = await monta({ selectedEffort: 'off' })
        expect(livello(spento).attributes('data-livello')).toBe('0')
        expect(livello(spento).find('[data-parte="arco-pieno"]').exists()).toBe(false)
    })

    it('LEGGERA-03 la Libreria non sta più nella riga: c\'è un pallino sul «+» quando è accesa', async () => {
        const v = await monta({ libraryContextEnabled: true, librarySourceCount: 2 })
        expect(v.find('[data-testid="talos-composer-library-chip"]').exists()).toBe(false)
        const piu = v.get('[data-testid="talos-composer-plus"]')
        expect(piu.find('[data-testid="talos-composer-plus-dot"]').exists()).toBe(true)
        // il nome resta «Add to chat»; lo stato della Libreria lo legge chi ascolta, subito dopo
        expect(piu.attributes('aria-label')).toBe('Add to chat')
        // ⛔ Desktop 28/10: aria-describedby verso un testo nascosto, non aria-description (ARIA 1.3 in bozza, TalkBack non garantito)
        const descrizione = document.getElementById(piu.attributes('aria-describedby') ?? '')
        expect(descrizione?.textContent).toContain('Library')
        expect(descrizione?.classList.contains('sr-only')).toBe(true)
        w?.unmount()
        const spenta = await monta({ libraryContextEnabled: false })
        expect(spenta.find('[data-testid="talos-composer-plus-dot"]').exists()).toBe(false)
    })

    it('LEGGERA-04 la Libreria del prossimo messaggio si apre dal foglio del «+»', async () => {
        const v = await monta({ libraryContextEnabled: true, librarySourceCount: 1 })
        await v.get('[data-testid="talos-composer-plus"]').trigger('click')
        for (let i = 0; i < 4; i++) { await flushPromises(); await vi.dynamicImportSettled() }
        await v.get('[data-testid="talos-drawer-library-turn"]').trigger('click')
        for (let i = 0; i < 4; i++) { await flushPromises(); await vi.dynamicImportSettled() }
        expect(v.find('[data-testid="talos-library-context-sheet"]').exists()).toBe(true)
    })
})

describe('PILLOLA-DETT la dettatura è il compositore stesso', () => {
    it('PILLOLA-DETT-01 mentre si detta: la cornice dice «ascolto», dentro nessun secondo riquadro', async () => {
        const v = await monta({ dictationListening: true }, false)
        for (let i = 0; i < 4; i++) { await flushPromises(); await vi.dynamicImportSettled() }
        expect(v.get('[data-testid="talos-mobile-composer"]').classes()).toContain('is-dictating')
        const barra = v.get('[data-testid="talos-dictation-live"]')
        for (const riquadro of ['border', 'rounded-2xl', 'py-2']) expect(barra.classes(), riquadro).not.toContain(riquadro)
        expect(barra.classes().some((c) => c.startsWith('bg-['))).toBe(false)
    })

    it('PILLOLA-DETT-02 il bordo accento respira solo se il movimento è consentito', () => {
        const css = readFileSync(resolve(__dirname, '../../../src/style.css'), 'utf8')
        const i = css.indexOf('.talos-calm-composer.is-dictating {')
        expect(i).toBeGreaterThan(-1)
        expect(css.slice(i, css.indexOf('}', i))).toContain('border-color: var(--talos-accent)')
        // ⛔ Desktop 28/10: il respiro anima l'OPACITÀ di un anello disegnato una volta (`::after`), non `box-shadow`, che si ridisegnava
        // a ogni fotogramma per tutta la dettatura sui telefoni medio-bassi
        expect(css).toMatch(/@media \(prefers-reduced-motion: no-preference\) \{\s*\.talos-calm-composer\.is-dictating::after \{ animation: talosAscolto/u)
        const k = css.indexOf('@keyframes talosAscolto')
        expect(css.slice(k, css.indexOf('}', css.indexOf('{', k) + 1) + 1)).toMatch(/opacity: 1/u)
        expect(css.slice(k, css.indexOf('}', css.indexOf('{', k) + 1) + 1)).not.toContain('box-shadow')
    })
})
