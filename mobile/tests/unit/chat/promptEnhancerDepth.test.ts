// @vitest-environment jsdom

import { describe, expect, it } from 'vitest'
import {
    TALOS_PROMPT_ENHANCER_DEPTHS,
    isTalosPromptEnhancerDepth,
    talosPromptEnhancerSystemPrompt,
} from '@/lib/chat/promptEnhancerDepth'
import { TALOS_MOBILE_PROMPT_ENHANCER_SYSTEM_PROMPT } from '@/lib/chat/promptEnhancement'

const BASE = TALOS_MOBILE_PROMPT_ENHANCER_SYSTEM_PROMPT

describe('i tre livelli di riscrittura', () => {
    it('dicono al modello COSA consegnare, non quanti token spendere', () => {
        /**
         * Un limite di token che tronca a meta' frase produce un prompt rotto,
         * non un prompt conciso — e chi legge non ha modo di distinguerli.
         */
        for (const depth of TALOS_PROMPT_ENHANCER_DEPTHS) {
            const prompt = talosPromptEnhancerSystemPrompt(BASE, depth)
            expect(prompt).not.toMatch(/max_tokens|temperature/i)
            expect(prompt.length).toBeGreaterThan(BASE.length)
        }
    })

    it('sono tre istruzioni DIVERSE, non tre etichette sullo stesso testo', () => {
        const testi = TALOS_PROMPT_ENHANCER_DEPTHS.map((d) => talosPromptEnhancerSystemPrompt(BASE, d))
        expect(new Set(testi).size).toBe(3)
    })

    it('il livello sta in FONDO, dove vince sulle istruzioni generiche', () => {
        /**
         * Il prompt base dice a tutti «keep the result concise». Su ESTESO
         * quella riga e' esattamente quella da superare: l'ultima istruzione e'
         * quella che i modelli seguono quando due si sovrappongono.
         */
        const esteso = talosPromptEnhancerSystemPrompt(BASE, 'extended')
        expect(esteso.startsWith(BASE)).toBe(true)
        expect(esteso.trimEnd().endsWith('never more inventive.')).toBe(true)
    })

    it('«esteso» chiede piu accuratezza, MAI piu invenzione', () => {
        // Il prompt enhancer non deve inventare fatti: e' la promessa del
        // modulo, e il livello piu' lungo e' dove si romperebbe per primo.
        const esteso = talosPromptEnhancerSystemPrompt(BASE, 'extended')
        expect(esteso).toContain('never more inventive')
        expect(esteso).toContain('every line must come from what the user wrote')
    })

    it('rifiuta un livello che non conosce, invece di fidarsi del disco', () => {
        expect(isTalosPromptEnhancerDepth('balanced')).toBe(true)
        expect(isTalosPromptEnhancerDepth('lunghissimo')).toBe(false)
        expect(isTalosPromptEnhancerDepth(undefined)).toBe(false)
    })
})

/**
 * Il pannello delle scelte — owner 2026-08-04: «ricorda ci vuole un model e
 * effort selector, coerente stilisticamente col resto, compatto e moderno».
 */
describe('il pannello che si vede prima di riscrivere', () => {
    async function panel(props: Record<string, unknown> = {}) {
        const { mount } = await import('@vue/test-utils')
        const TalosMobileEnhancerSetup = (await import('@/components/chat/TalosMobileEnhancerSetup.vue')).default
        return mount(TalosMobileEnhancerSetup, {
            props: {
                depth: 'balanced',
                model: null,
                effort: 'low',
                models: [
                    { id: 'deepseek:chat', label: 'deepseek-v4-flash', provider: 'deepseek', efforts: [] },
                    { id: 'openai:luna', label: 'gpt-5.6-luna', provider: 'openai', efforts: ['low', 'medium', 'high'] },
                ],
                ...props,
            },
        })
    }

    it('la prima domanda è sul RISULTATO, non sulla macchina', async () => {
        /**
         * Chi apre questo pannello ha in testa «quanto me lo cambi», non «con
         * quale modello». Metterle al contrario chiede di scegliere uno
         * strumento prima di sapere cosa deve produrre.
         */
        const wrapper = await panel()
        const testo = wrapper.text()
        expect(testo.indexOf('How much to rewrite')).toBeLessThan(testo.indexOf('Who rewrites it'))
    })

    it('ogni livello porta la sua CONSEGUENZA, che cambia con la scelta', async () => {
        // Tre nomi senza conseguenza costringono a provarli tutti e tre.
        const equilibrato = await panel({ depth: 'balanced' })
        const esteso = await panel({ depth: 'extended' })
        const a = equilibrato.get('[data-testid="talos-enhancer-depth-body"]').text()
        const b = esteso.get('[data-testid="talos-enhancer-depth-body"]').text()
        expect(a).not.toBe(b)
        expect(b).toContain('never more invented')
    })

    it('«quello del compositore» è una VOCE, e si può DAVVERO scegliere', async () => {
        /**
         * Un selettore vuoto non dice cosa succede se non si sceglie.
         *
         * Il grilletto si guardava e basta, prima: e il grilletto mostra il
         * nome della voce scelta anche quando la voce non esiste piu'. Cosi'
         * una voce con valore vuoto — che reka-ui RIFIUTA, perche' la stringa
         * vuota vuol dire «nessuna scelta» — ha attraversato il cancello
         * mentre nell'app la tendina non si disegnava. Qui si apre, come fa
         * una persona, e si contano le voci che ci sono davvero dentro.
         */
        const wrapper = await panel()
        const trigger = wrapper.get('[data-testid="talos-themed-select-trigger"]').element
        for (const tipo of ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click']) {
            trigger.dispatchEvent(new window.MouseEvent(tipo, { bubbles: true, button: 0 }))
        }
        await new Promise((resolve) => setTimeout(resolve, 80))

        // Teleportate: vivono nel documento, non dentro il wrapper.
        const tendina = document.body.textContent ?? ''
        expect(tendina).toContain('The composer’s model')
        expect(tendina).toContain('gpt-5.6-luna')
    })

    it('il ragionamento compare solo dove il modello lo prevede davvero', async () => {
        // Un selettore che non governa niente è peggio di uno assente.
        const senza = await panel({ model: 'deepseek:chat' })
        expect(senza.find('[data-testid="talos-enhancer-effort"]').exists()).toBe(false)

        const con = await panel({ model: 'openai:luna' })
        expect(con.find('[data-testid="talos-enhancer-effort"]').exists()).toBe(true)
    })
})
