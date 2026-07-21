// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest'
import { TalosApiError } from '../lib/api'
import { useTalosSettings } from './useTalosSettings'

const originalFetch = globalThis.fetch

afterEach(() => {
    globalThis.fetch = originalFetch
    vi.restoreAllMocks()
})

function jsonResponse(body: unknown, status = 200) {
    return new Response(JSON.stringify(body), {
        status,
        headers: { 'Content-Type': 'application/json' },
    })
}

describe('useTalosSettings revision contract', () => {
    it('sends the last server revision with every settings write', async () => {
        const requests: Array<Record<string, unknown>> = []
        globalThis.fetch = vi.fn(async (_input, init) => {
            if (!init?.method) {
                return jsonResponse({ data: { id: 'settings-1', revision: 4, preferences: { theme: 'forge' } } })
            }
            requests.push(JSON.parse(String(init.body)))
            return jsonResponse({ data: { id: 'settings-1', revision: 5, preferences: { theme_motion_v6: { saved: true } } } })
        }) as typeof fetch
        const settings = useTalosSettings()

        await settings.loadSettings()
        await settings.updateSettings({ preferences: { theme_motion_v6: { saved: true } } })

        expect(requests).toEqual([{
            expected_revision: 4,
            preferences: { theme_motion_v6: { saved: true } },
        }])
        expect(settings.settings.value?.revision).toBe(5)
    })

    it('adopts the authoritative conflict snapshot so an explicit retry uses its revision', async () => {
        const patchBodies: Array<Record<string, unknown>> = []
        let patchAttempt = 0
        globalThis.fetch = vi.fn(async (_input, init) => {
            if (!init?.method) {
                return jsonResponse({ data: { id: 'settings-1', revision: 7, preferences: { theme: 'forge' } } })
            }
            patchAttempt += 1
            patchBodies.push(JSON.parse(String(init.body)))
            if (patchAttempt === 1) {
                return jsonResponse({
                    message: 'Workspace settings changed in another session.',
                    code: 'TALOS_SETTINGS_REVISION_CONFLICT',
                    data: { id: 'settings-1', revision: 8, preferences: { theme: 'paper' } },
                }, 409)
            }
            return jsonResponse({ data: { id: 'settings-1', revision: 9, preferences: { theme_motion_v6: { saved: true } } } })
        }) as typeof fetch
        const settings = useTalosSettings()
        await settings.loadSettings()

        await expect(settings.updateSettings({ preferences: { theme_motion_v6: { saved: true } } }))
            .rejects.toMatchObject<TalosApiError>({ status: 409 })
        expect(settings.settings.value).toMatchObject({ revision: 8, preferences: { theme: 'paper' } })

        await settings.updateSettings({ preferences: { theme_motion_v6: { saved: true } } })
        expect(patchBodies.map((body) => body.expected_revision)).toEqual([7, 8])
        expect(settings.settings.value?.revision).toBe(9)
    })
})

describe('useTalosSettings load state', () => {
    it('settings load state transitions idle loading loaded and error without faking a loaded snapshot', async () => {
        let releaseLoad: (response: Response) => void = () => undefined
        globalThis.fetch = vi.fn(() => new Promise<Response>((resolve) => {
            releaseLoad = resolve
        })) as typeof fetch
        const settings = useTalosSettings()

        expect(settings.settingsLoadState.value).toBe('idle')

        const loading = settings.loadSettings()
        expect(settings.settingsLoadState.value).toBe('loading')

        releaseLoad(jsonResponse({ data: { id: 'settings-1', revision: 1, preferences: {} } }))
        await loading
        expect(settings.settingsLoadState.value).toBe('loaded')
        expect(settings.settings.value?.id).toBe('settings-1')

        globalThis.fetch = vi.fn(async () => jsonResponse({ message: 'boom' }, 500)) as typeof fetch
        const failing = useTalosSettings()
        expect(failing.settingsLoadState.value).toBe('idle')
        await expect(failing.loadSettings()).rejects.toBeInstanceOf(TalosApiError)
        expect(failing.settingsLoadState.value).toBe('error')
        expect(failing.settings.value).toBeNull()
    })

    it('a later successful load recovers from error', async () => {
        let attempt = 0
        globalThis.fetch = vi.fn(async () => {
            attempt += 1
            if (attempt === 1) return jsonResponse({ message: 'boom' }, 500)
            return jsonResponse({ data: { id: 'settings-1', revision: 2, preferences: {} } })
        }) as typeof fetch
        const settings = useTalosSettings()

        await expect(settings.loadSettings()).rejects.toBeInstanceOf(TalosApiError)
        expect(settings.settingsLoadState.value).toBe('error')

        await settings.loadSettings()
        expect(settings.settingsLoadState.value).toBe('loaded')
        expect(settings.settings.value?.revision).toBe(2)
    })
})
