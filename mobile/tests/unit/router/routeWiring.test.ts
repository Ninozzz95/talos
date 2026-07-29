import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, it, expect } from 'vitest'
import {
    preloadTalosMobileRoutes,
    TALOS_MOBILE_ROUTES,
} from '@/lib/mobileRoutes'

// Each tab route must load its real parity screen, not the old title-only placeholder.
const SCREEN_CONTRACT: Record<string, { file: string; component: string; markers: string[] }> = {
    chat: { file: 'ChatScreen.vue', component: 'ChatScreen', markers: ['data-testid="talos-chat-scroll"'] },
    chats: { file: 'ChatsScreen.vue', component: 'ChatsScreen', markers: ['data-testid="talos-chats-screen"'] },
    memory: { file: 'MemoryScreen.vue', component: 'MemoryScreen', markers: ['data-testid="talos-memory-screen"'] },
    tasks: { file: 'TasksScreen.vue', component: 'TasksScreen', markers: ['data-testid="talos-tasks-screen"'] },
    notes: { file: 'NotesScreen.vue', component: 'NotesScreen', markers: ['data-testid="talos-notes-screen"'] },
    doctor: { file: 'DoctorScreen.vue', component: 'DoctorScreen', markers: ['data-testid="talos-doctor-screen"'] },
    research: { file: 'ResearchScreen.vue', component: 'ResearchScreen', markers: ["t('stations.deepResearchTitle')"] },
    runs: { file: 'RunsScreen.vue', component: 'RunsScreen', markers: ["t('stations.runtimeCockpitTitle')"] },
    context: { file: 'ContextScreen.vue', component: 'ContextScreen', markers: ['data-testid="talos-library-search"'] },
    settings: { file: 'SettingsScreen.vue', component: 'SettingsScreen', markers: ["t('stations.settingsCenterTitle')"] },
}

describe('router wiring', () => {

    it('resolves each of the 10 tab routes to its real parity screen', async () => {
        expect(TALOS_MOBILE_ROUTES.map((r) => r.name)).toEqual(['chat', 'chats', 'memory', 'tasks', 'notes', 'doctor', 'research', 'runs', 'context', 'settings'])
        const components = await Promise.all(TALOS_MOBILE_ROUTES.map((route) => route.component()))
        for (const [index, route] of TALOS_MOBILE_ROUTES.entries()) {
            const contract = SCREEN_CONTRACT[route.name]
            const component = components[index] as { __name?: string }
            const source = readFileSync(resolve(process.cwd(), 'src/screens', contract.file), 'utf8')
            expect(component.__name, `${route.name} component`).toBe(contract.component)
            for (const marker of contract.markers) expect(source).toContain(marker)
        }
    }, 15_000)

    it('preloads every packaged station chunk exactly once, and only AFTER mount', async () => {
        const firstPreload = preloadTalosMobileRoutes()
        const secondPreload = preloadTalosMobileRoutes()

        expect(secondPreload).toBe(firstPreload)
        await firstPreload

        // Perf review 2026-07-25: the previous assertion demanded the preload be
        // awaited BEFORE mount, which is exactly the cold-start regression (792KB
        // boot-blocking instead of 505KB). The station chunks must be warmed only
        // once the shell is on screen.
        const source = readFileSync(resolve(process.cwd(), 'src/main.ts'), 'utf8')
        const mountIndex = source.indexOf(".mount('#app')")
        const preloadIndex = source.indexOf('preloadTalosMobileRoutes()', mountIndex)

        expect(mountIndex).toBeGreaterThan(-1)
        expect(source).not.toContain('await preloadTalosMobileRoutes()')
        expect(preloadIndex).toBeGreaterThan(mountIndex)
        expect(source).toMatch(/requestIdleCallback|setTimeout\(warm/)
    }, 15_000)
})
