import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
    TALOS_MOBILE_ROUTES,
    talosMobileParentRoute,
} from '@/lib/mobileRoutes'

describe('Model Lab route hierarchy', () => {
    it('owns one hub, three child pages, and a deep-linkable local repository detail', () => {
        const expected = [
            ['settings-models', '/settings/models', 'settings'],
            ['settings-models-providers', '/settings/models/providers', 'settings-models'],
            ['settings-models-catalog', '/settings/models/catalog', 'settings-models'],
            ['settings-models-local', '/settings/models/local', 'settings-models'],
            ['settings-models-local-repo', '/settings/models/local/:owner/:repo', 'settings-models-local'],
        ] as const

        expect(expected.map(([name, path, parent]) => {
            const route = TALOS_MOBILE_ROUTES.find((entry) => entry.name === name)
            return [route?.name, route?.path, route?.parent]
        })).toEqual(expected)

        for (const [name] of expected) {
            const route = TALOS_MOBILE_ROUTES.find((entry) => entry.name === name)
            expect(typeof route?.component).toBe('function')
        }
        const source = readFileSync(join(process.cwd(), 'src/lib/mobileRoutes.ts'), 'utf8')
        for (const screen of ['SettingsModelsScreen', 'SettingsModelsProvidersScreen', 'SettingsModelsCatalogScreen', 'SettingsModelsLocalScreen', 'SettingsModelsLocalRepoScreen']) {
            expect(source).toContain(`import('@/screens/${screen}.vue')`)
        }
    })

    it('sends every child to the hub and the hub to Settings through the shared table', () => {
        expect(talosMobileParentRoute('settings-models')).toEqual({ name: 'settings', params: {} })
        for (const name of ['settings-models-providers', 'settings-models-catalog', 'settings-models-local']) {
            expect(talosMobileParentRoute(name)).toEqual({ name: 'settings-models', params: {} })
        }
        expect(talosMobileParentRoute('settings-models-local-repo', {
            owner: 'a publisher',
            repo: 'Qwen%20GGUF',
        })).toEqual({ name: 'settings-models-local', params: {} })
    })
})
