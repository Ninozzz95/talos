// @vitest-environment jsdom

import { afterEach, describe, expect, it } from 'vitest'
import { mount, type VueWrapper } from '@vue/test-utils'
import TalosMobilePromptEnhancerPopover from '@/components/chat/TalosMobilePromptEnhancerPopover.vue'
import type { TalosMobilePromptEnhancementResult } from '@/lib/chat/promptEnhancement'

let wrapper: VueWrapper | null = null

afterEach(() => {
    wrapper?.unmount()
    wrapper = null
})

const result: TalosMobilePromptEnhancementResult = {
    enhanced_prompt: 'Objective\n\nProduce a migration plan.\n\nAcceptance\n\n- Zero downtime',
    summary: 'Added an explicit output and acceptance criteria.',
    applied_principles: ['Clear objective', 'Structured output', 'Acceptance checks'],
    model_profile_id: 'anthropic:claude-live',
    provider: 'anthropic',
    model: 'claude-live',
    enhancement_mode: 'model',
    original_prompt: 'Plan the migration.',
}

function mountPopover(): VueWrapper {
    wrapper = mount(TalosMobilePromptEnhancerPopover, {
        attachTo: document.body,
        props: { result },
    })
    return wrapper
}

describe('TalosMobilePromptEnhancerPopover', () => {
    it('renders provenance bounded output summary principles and three explicit decisions', async () => {
        const view = mountPopover()
        const dialog = view.get('[role="dialog"]')

        expect(dialog.attributes('aria-labelledby')).toBe('talos-mobile-enhancer-title')
        expect(dialog.attributes('aria-describedby')).toBe('talos-mobile-enhancer-description')
        expect(view.get('#talos-mobile-enhancer-title').text()).toBe('Prompt enhancement preview')
        expect(view.get('[data-testid="talos-mobile-enhancement-provenance"]').text()).toContain('anthropic')
        expect(view.get('[data-testid="talos-mobile-enhancement-provenance"]').text()).toContain('claude-live')
        expect(view.get('[data-testid="talos-mobile-enhancement-output"]').text()).toContain('Zero downtime')
        expect(view.get('[data-testid="talos-mobile-enhancement-output"]').classes()).toContain('max-h-72')
        expect(view.get('#talos-mobile-enhancer-description').text()).toContain(result.summary)
        expect(view.get('[aria-label="Applied prompt principles"]').findAll('li')).toHaveLength(3)

        const decisions = view.findAll('[data-enhancement-decision]')
        expect(decisions.map((decision) => decision.text())).toEqual([
            'Cancel',
            'Insert below',
            'Replace prompt',
        ])
        expect(decisions.every((decision) => (
            decision.classes().includes('min-h-touch') && decision.classes().includes('min-w-touch')
        ))).toBe(true)

        await decisions[0]!.trigger('click')
        await decisions[1]!.trigger('click')
        await decisions[2]!.trigger('click')
        expect(view.emitted('cancel')).toHaveLength(1)
        expect(view.emitted('insert')).toHaveLength(1)
        expect(view.emitted('replace')).toHaveLength(1)
    })
})
