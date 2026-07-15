import { beforeEach, describe, expect, it, vi } from 'vitest'
import { talosFetch } from '../lib/api'
import { useTalosMemorySkills } from './useTalosMemorySkills'

vi.mock('../lib/api', async (importOriginal) => ({
    ...await importOriginal<typeof import('../lib/api')>(),
    talosFetch: vi.fn(),
}))

const talosFetchMock = vi.mocked(talosFetch)

describe('useTalosMemorySkills concurrent state', () => {
    beforeEach(() => {
        talosFetchMock.mockReset()
    })

    it('stays loading until every concurrent resource request settles', async () => {
        let resolveSkills!: (value: { data: [] }) => void
        let resolvePlanning!: (value: { data: { skills: []; excluded_skills: [] } }) => void
        const skillsRequest = new Promise<{ data: [] }>((resolve) => { resolveSkills = resolve })
        const planningRequest = new Promise<{ data: { skills: []; excluded_skills: [] } }>((resolve) => { resolvePlanning = resolve })
        talosFetchMock.mockImplementation(async (url) => {
            if (url === '/api/talos/skills?include_disabled=1') return await skillsRequest as never
            if (url === '/api/talos/skills/planning-context') return await planningRequest as never
            throw new Error(`Unhandled request: ${url}`)
        })
        const memorySkills = useTalosMemorySkills()

        const skills = memorySkills.loadSkills(true)
        const planning = memorySkills.loadSkillPlanningContext()
        expect(memorySkills.loadingMemorySkills.value).toBe(true)

        resolveSkills({ data: [] })
        await skills
        expect(memorySkills.loadingMemorySkills.value).toBe(true)

        resolvePlanning({ data: { skills: [], excluded_skills: [] } })
        await planning
        expect(memorySkills.loadingMemorySkills.value).toBe(false)
    })
})
