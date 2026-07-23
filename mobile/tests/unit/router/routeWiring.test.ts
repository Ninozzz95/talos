import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, it, expect } from 'vitest'
import {
    asyncRouteComponent,
    preloadTalosMobileRoutes,
    TALOS_MOBILE_ROUTES,
} from '@/lib/mobileRoutes'

// Each tab route must load its real parity screen, not the old title-only placeholder.
const SCREEN_CONTRACT: Record<string, { file: string; component: string; markers: string[] }> = {
    chat: { file: 'ChatScreen.vue', component: 'ChatScreen', markers: ['TALOS', 'What claim should we benchmark?'] },
    chats: { file: 'ChatsScreen.vue', component: 'ChatsScreen', markers: ['Search chats'] },
    memory: { file: 'MemoryScreen.vue', component: 'MemoryScreen', markers: ['untrusted disclosed context'] },
    research: { file: 'ResearchScreen.vue', component: 'ResearchScreen', markers: ['Deep Research V3'] },
    runs: { file: 'RunsScreen.vue', component: 'RunsScreen', markers: ['Runtime cockpit'] },
    context: { file: 'ContextScreen.vue', component: 'ContextScreen', markers: ['Library'] },
    settings: { file: 'SettingsScreen.vue', component: 'SettingsScreen', markers: ['Settings Center'] },
}

describe('router wiring', () => {
    it('keeps station screens as literal lazy route imports without Vue async-component wrapping', () => {
        const source = readFileSync(resolve(process.cwd(), 'src/lib/mobileRoutes.ts'), 'utf8')

        for (const screen of ['Research', 'Runs', 'Context', 'Settings']) {
            expect(source).not.toContain(`import ${screen}Screen from '@/screens/${screen}Screen.vue'`)
            expect(source).toContain(`() => import('@/screens/${screen}Screen.vue')`)
        }
        expect(source).not.toContain('defineAsyncComponent')
        for (const route of TALOS_MOBILE_ROUTES) {
            expect(asyncRouteComponent(route)).toBe(route.component)
        }
    })

    it('resolves each of the 7 tab routes to its real parity screen', async () => {
        expect(TALOS_MOBILE_ROUTES.map((r) => r.name)).toEqual(['chat', 'chats', 'memory', 'research', 'runs', 'context', 'settings'])
        const components = await Promise.all(TALOS_MOBILE_ROUTES.map((route) => route.component()))
        for (const [index, route] of TALOS_MOBILE_ROUTES.entries()) {
            const contract = SCREEN_CONTRACT[route.name]
            const component = components[index] as { __name?: string }
            const source = readFileSync(resolve(process.cwd(), 'src/screens', contract.file), 'utf8')
            expect(component.__name, `${route.name} component`).toBe(contract.component)
            for (const marker of contract.markers) expect(source).toContain(marker)
        }
    }, 15_000)

    it('preloads every packaged station chunk once before exposing the interactive shell', async () => {
        const firstPreload = preloadTalosMobileRoutes()
        const secondPreload = preloadTalosMobileRoutes()

        expect(secondPreload).toBe(firstPreload)
        await firstPreload

        const source = readFileSync(resolve(process.cwd(), 'src/main.ts'), 'utf8')
        const preloadIndex = source.indexOf('await preloadTalosMobileRoutes()')
        const mountIndex = source.indexOf("createApp(App).use(router).mount('#app')")

        expect(preloadIndex).toBeGreaterThan(-1)
        expect(mountIndex).toBeGreaterThan(preloadIndex)
    }, 15_000)
})
