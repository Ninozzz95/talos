import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, it, expect, vi } from 'vitest'

/**
 * This file resolves ten real screens and takes about seven seconds against
 * Vitest's five-second default. It has been passing on timing luck; an
 * adversarial review 2026-07-31 caught it failing intermittently once the suite
 * got faster and crowded more work into the same window. Stated, not gambled.
 */
vi.setConfig({ testTimeout: 30_000 })
import {
    preloadTalosMobileRoutes,
    TALOS_MOBILE_ROUTES,
    talosMobileParentRoute,
} from '@/lib/mobileRoutes'

// Each product route must load its real parity screen, not a title-only placeholder.
const SCREEN_CONTRACT: Record<string, { file: string; component: string; markers: string[] }> = {
    chat: { file: 'ChatScreen.vue', component: 'ChatScreen', markers: ['data-testid="talos-chat-scroll"'] },
    chats: { file: 'ChatsScreen.vue', component: 'ChatsScreen', markers: ['data-testid="talos-chats-screen"'] },
    memory: { file: 'MemoryScreen.vue', component: 'MemoryScreen', markers: ['data-testid="talos-memory-screen"'] },
    tasks: { file: 'TasksScreen.vue', component: 'TasksScreen', markers: ['data-testid="talos-tasks-screen"'] },
    notes: { file: 'NotesScreen.vue', component: 'NotesScreen', markers: ['data-testid="talos-notes-screen"'] },
    doctor: { file: 'DoctorScreen.vue', component: 'DoctorScreen', markers: ['data-testid="talos-doctor-screen"'] },
    research: { file: 'ResearchScreen.vue', component: 'ResearchScreen', markers: ["t('stations.deepResearchTitle')"] },
    context: { file: 'ContextScreen.vue', component: 'ContextScreen', markers: ['data-testid="talos-library-search"'] },
    settings: { file: 'SettingsScreen.vue', component: 'SettingsScreen', markers: ["t('stations.settingsCenterTitle')"] },
    'settings-models': { file: 'SettingsModelsScreen.vue', component: 'SettingsModelsScreen', markers: ['data-testid="settings-models-screen"'] },
    'settings-models-providers': { file: 'SettingsModelsProvidersScreen.vue', component: 'SettingsModelsProvidersScreen', markers: ['data-testid="settings-models-providers-screen"'] },
    'settings-models-catalog': { file: 'SettingsModelsCatalogScreen.vue', component: 'SettingsModelsCatalogScreen', markers: ['data-testid="settings-models-catalog-screen"'] },
    'settings-models-local': { file: 'SettingsModelsLocalScreen.vue', component: 'SettingsModelsLocalScreen', markers: ['data-testid="settings-models-local-screen"'] },
    'settings-models-local-repo': { file: 'SettingsModelsLocalRepoScreen.vue', component: 'SettingsModelsLocalRepoScreen', markers: ['data-testid="settings-models-local-repo-screen"'] },
}

describe('router wiring', () => {

    it('resolves each tab route to its real parity screen', async () => {
        // Deep Research became four surfaces on 2026-08-03 — the list, the
        // setup, the report and the two pages inside it. Only the ones with a
        // parity contract are checked here; the inner pages have their own
        // tests and no desktop counterpart to be verbatim against.
        expect(TALOS_MOBILE_ROUTES.map((r) => r.name)).toEqual([
            'chat', 'chats',
            // Ogni stazione-elenco ha ora la sua pagina di dettaglio, come la
            // Ricerca. Owner 2026-08-04: «ogni scheda apre una pagina dedicata,
            // Indietro va alla precedente, dev'essere lineare».
            // `/new` PRIMA di `/:id` ovunque: al contrario il parametro si
            // mangia «new» e il ventaglio aprirebbe una scheda inesistente.
            // Memoria e Attività hanno la loro pagina di creazione dal
            // 2026-08-06, quando il FAB della sidebar è diventato un ventaglio
            // che deve poter cominciare CIASCUNA delle cinque cose.
            'memory', 'memory-new', 'memory-item',
            'tasks', 'task-new', 'task-item',
            // `/notes/new` PRIMA di `/notes/:id`: al contrario il parametro si
            // mangia «new» e il FAB aprirebbe una nota che non esiste.
            'notes', 'note-new', 'note-item',
            'doctor',
            'research', 'research-new', 'research-report', 'research-claim', 'research-source',
            'context', 'harness', 'harness-session', 'settings',
            'settings-models', 'settings-models-providers',
            'settings-models-catalog', 'settings-models-local', 'settings-models-local-repo',
            // Il controllo del telefono: sotto le Impostazioni, non fra le stazioni.
            'settings-privilege',
        ])

        /**
         * La catena all'indietro è dichiarata, non dedotta dal percorso.
         *
         * È ciò che rende Indietro lineare: senza `parent`, una pagina aperta
         * da due posti diversi torna a quello sbagliato — il difetto che la
         * navigazione dell'owner esiste per togliere.
         */
        for (const [figlio, genitore] of [
            ['memory-item', 'memory'], ['task-item', 'tasks'], ['note-item', 'notes'], ['note-new', 'notes'],
        ] as const) {
            expect(talosMobileParentRoute(figlio, { id: 'x1' }))
                .toEqual({ name: genitore, params: {} })
        }
        const contracted = TALOS_MOBILE_ROUTES.filter((route) => SCREEN_CONTRACT[route.name])
        const components = await Promise.all(contracted.map((route) => route.component()))
        for (const [index, route] of contracted.entries()) {
            const contract = SCREEN_CONTRACT[route.name]
            const resolved = components[index] as { __name?: string, default?: { __name?: string } }
            const component = resolved.default ?? resolved
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
