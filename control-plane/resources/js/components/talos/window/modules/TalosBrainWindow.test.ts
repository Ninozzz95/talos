// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp, defineComponent, nextTick, ref } from 'vue'
import TalosBrainWindow from './TalosBrainWindow.vue'
import type { TalosWindowModuleContext } from '../../../../lib/talosWindowModuleContext'

const loadSkills = vi.fn()
const loadSkillPlanningContext = vi.fn()
const loadingMemorySkills = ref(false)
const memorySkillError = ref<string | null>(null)

vi.mock('../../../../composables/useTalosMemorySkills', () => ({
    useTalosMemorySkills: () => ({
        skills: ref([]),
        skillPlanningContext: ref(null),
        loadingMemorySkills,
        memorySkillError,
        loadSkills,
        loadSkillPlanningContext,
    }),
}))
vi.mock('../../memory/TalosMemoryManager.vue', () => ({ default: defineComponent({ template: '<div>Memory panel</div>' }) }))
vi.mock('../../memory/TalosSkillRegistry.vue', () => ({ default: defineComponent({ template: '<div>Skill registry</div>' }) }))
vi.mock('../../memory/TalosSkillAudit.vue', () => ({ default: defineComponent({ template: '<div>Skill audit</div>' }) }))

const apps: Array<ReturnType<typeof createApp>> = []
const context = {
    id: 'brain',
    activeSection: 'skills',
} as TalosWindowModuleContext

beforeEach(() => {
    loadSkills.mockReset().mockRejectedValue(new Error('Skills unavailable'))
    loadSkillPlanningContext.mockReset().mockResolvedValue({ skills: [], excluded_skills: [] })
    loadingMemorySkills.value = false
    memorySkillError.value = 'Skills unavailable'
})

afterEach(() => {
    apps.splice(0).forEach((app) => app.unmount())
    document.body.replaceChildren()
})

describe('TalosBrainWindow resource states', () => {
    it('renders an actionable error instead of a false empty skill registry', async () => {
        const host = document.createElement('div')
        document.body.append(host)
        const app = createApp(TalosBrainWindow, { context })
        apps.push(app)
        app.mount(host)
        await nextTick()
        await nextTick()

        const alert = host.querySelector('[role="alert"]')
        expect(alert?.textContent).toContain('Skills unavailable')
        expect(host.textContent).not.toContain('Skill registry')

        const retry = Array.from(host.querySelectorAll('button')).find((button) => button.textContent?.includes('Retry'))
        expect(retry).toBeTruthy()
        retry?.click()
        await nextTick()
        expect(loadSkills).toHaveBeenCalledTimes(2)
        expect(loadSkillPlanningContext).toHaveBeenCalledTimes(2)
    })
})
