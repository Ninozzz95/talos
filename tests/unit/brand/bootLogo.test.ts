// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import TalosBootLogo from '@/components/brand/TalosBootLogo.vue'

const SOURCE = readFileSync(
    resolve(process.cwd(), 'src/components/brand/TalosBootLogo.vue'),
    'utf8',
)

describe('TalosBootLogo (animated intro)', () => {
    beforeEach(() => vi.useFakeTimers())
    afterEach(() => vi.useRealTimers())

    it('renders the hex frame, all stroke-draw edges, and igniting nodes + wordmark', () => {
        const wrapper = mount(TalosBootLogo)
        expect(wrapper.find('[data-testid="talos-boot-logo"]').exists()).toBe(true)
        expect(wrapper.find('svg .hex').exists()).toBe(true)
        expect(wrapper.findAll('svg .edge').length).toBeGreaterThanOrEqual(4)
        expect(wrapper.findAll('svg .node').length).toBeGreaterThanOrEqual(5)
        expect(wrapper.text()).toContain('TALOS')
    })

    it('does not reveal the app until the complete one-shot mark has rested', async () => {
        const wrapper = mount(TalosBootLogo)
        expect(wrapper.emitted('done')).toBeUndefined()

        vi.advanceTimersByTime(1_499)
        expect(wrapper.get('[data-testid="talos-boot-logo"]').attributes('data-leaving'))
            .toBe('false')
        expect(wrapper.emitted('done')).toBeUndefined()

        vi.advanceTimersByTime(1)
        await wrapper.vm.$nextTick()
        expect(wrapper.get('[data-testid="talos-boot-logo"]').attributes('data-leaving'))
            .toBe('true')
        expect(wrapper.emitted('done')).toBeUndefined()

        vi.advanceTimersByTime(499)
        expect(wrapper.emitted('done')).toBeUndefined()
        vi.advanceTimersByTime(1)
        expect(wrapper.emitted('done')).toBeTruthy()
    })

    it('uses only compositor-friendly finite motion and keeps the assembled mark', () => {
        const edgeRule = SOURCE.match(/\.edge\s*\{(?<body>[\s\S]*?)\}/)?.groups?.body ?? ''
        const edgeFrames = SOURCE.match(
            /@keyframes talosBootFlow\s*\{(?<body>[\s\S]*?)\n\}/,
        )?.groups?.body ?? ''
        const nodeFrames = SOURCE.match(
            /@keyframes talosBootIgnite\s*\{(?<body>[\s\S]*?)\n\}/,
        )?.groups?.body ?? ''

        expect(edgeRule).toContain('will-change: transform, opacity')
        expect(edgeRule).not.toMatch(/stroke-dash/)
        expect(edgeFrames).toContain('transform: scaleY(1)')
        expect(edgeFrames).toMatch(/100%\s*\{[^}]*opacity:\s*1/)
        expect(edgeFrames).not.toMatch(/stroke-dash|filter|fill|stroke-width/)
        expect(nodeFrames).toMatch(/100%\s*\{[^}]*opacity:\s*1/)
        expect(nodeFrames).not.toMatch(/filter|fill|stroke-width|transform/)
        expect(SOURCE).not.toMatch(/talosBoot(?:Flow|Ignite)[^;]*\binfinite\b/)
    })

    it('settles edge and node motion under prefers-reduced-motion', () => {
        const reducedMotion = SOURCE.slice(
            SOURCE.indexOf('@media (prefers-reduced-motion: reduce)'),
        )
        expect(reducedMotion).toMatch(/\.edge,\s*\.node\s*\{[\s\S]*animation:\s*none !important/)
        expect(reducedMotion).toContain('transform: scaleY(1)')
        expect(reducedMotion).toContain('opacity: 1')
    })
})
