// @vitest-environment jsdom

import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import TalosMobileReasoningBlock from '@/components/chat/TalosMobileReasoningBlock.vue'

/**
 * Owner 2026-07-26, with a screenshot of the Claude Android app:
 *
 *   "la sezione di reasoning nella chat deve essere un semplice testo in grigio
 *    o colore primario sbiadito e se clicco apre un drawer non un collapse
 *    esattamente come Claude"
 *
 * So: no card, no border, no filled background — a muted line with a leading
 * icon and a trailing chevron, and the trace itself lives in a bottom drawer.
 * In the same screenshot the tool-activity line gets the IDENTICAL treatment,
 * which is why the row is its own component rather than markup inlined here.
 *
 * The research pass (AI chat disclosure patterns, 2026) points the same way:
 * progressive disclosure — a light inline signal first, the full trace on a
 * dedicated surface — rather than an accordion that shoves the answer down the
 * screen every time it is opened.
 */
const REASONING = 'Prima considero la domanda, poi controllo la Libreria.'

function mountBlock(props: Record<string, unknown> = {}) {
    return mount(TalosMobileReasoningBlock, {
        props: { reasoning: REASONING, ...props },
        global: { stubs: { teleport: true } },
    })
}

describe('reasoning is a muted line that opens a drawer', () => {
    it('renders a plain row with no card around it', () => {
        const row = mountBlock().get('[data-testid="talos-reasoning-toggle"]')
        const classes = row.attributes('class') ?? ''
        // The card is the thing being removed: a border or a filled panel is
        // exactly what the owner asked to stop seeing.
        expect(classes).not.toMatch(/\bborder\b|\bbg-/)
        expect(row.attributes('aria-haspopup')).toBe('dialog')
    })

    it('keeps the trace OUT of the document until the row is tapped', async () => {
        const wrapper = mountBlock()
        expect(wrapper.text()).not.toContain(REASONING)
        expect(wrapper.find('[data-testid="talos-reasoning-drawer"]').exists()).toBe(false)

        await wrapper.get('[data-testid="talos-reasoning-toggle"]').trigger('click')

        expect(wrapper.find('[data-testid="talos-reasoning-drawer"]').exists()).toBe(true)
        expect(wrapper.text()).toContain(REASONING)
    })

    it('is a drawer, not an inline expansion: the row does not claim to expand', async () => {
        const wrapper = mountBlock()
        await wrapper.get('[data-testid="talos-reasoning-toggle"]').trigger('click')
        // `aria-expanded` would promise in-place content to a screen reader.
        expect(wrapper.get('[data-testid="talos-reasoning-toggle"]').attributes('aria-expanded'))
            .toBeUndefined()
    })

    it('says so while the trace is still arriving', () => {
        expect(mountBlock({ live: true }).text()).toMatch(/reasoning…|thinking/i)
    })

    it('renders nothing at all when there is no reasoning', () => {
        expect(mountBlock({ reasoning: '   ' }).find('[data-testid="talos-reasoning-toggle"]').exists())
            .toBe(false)
    })
})
