import { nextTick, ref } from 'vue'
import { describe, expect, it, vi } from 'vitest'
import { createDefaultTalosMotionV6Preferences } from '../motion-v6/defaults'
import type { TalosWorkspaceSettings, UpdateTalosSettingsPayload } from './useTalosSettings'
import { useTalosThemeMotionV6Editor } from './useTalosThemeMotionV6Editor'

function settings(preferences: Record<string, unknown> = {}): TalosWorkspaceSettings {
    return {
        id: 'motion-v6-editor',
        preferences,
    }
}

function harness(preferences: Record<string, unknown> = {}) {
    const settingsRef = ref<TalosWorkspaceSettings | null>(settings(preferences))
    const updateSettings = vi.fn(async (payload: UpdateTalosSettingsPayload) => {
        const next = settings({
            ...settingsRef.value?.preferences,
            ...payload.preferences,
        })
        settingsRef.value = next
        return next
    })
    const changed = vi.fn()
    const editor = useTalosThemeMotionV6Editor({
        settings: settingsRef,
        updateSettings,
        onSettingsChanged: changed,
        environment: () => ({
            workspaceBackgroundAllowed: true,
            workspaceInterfaceMotionAllowed: true,
            prefersReducedMotion: false,
            documentHidden: false,
            saveData: false,
            rendererFault: false,
            failedEffectiveMode: null,
            frameP95Ms: null,
            frameSampleSufficient: false,
        }),
    })
    return { changed, editor, settingsRef, updateSettings }
}

describe('useTalosThemeMotionV6Editor', () => {
    it('hydrates a detached draft from canonical V6 settings', () => {
        const persisted = createDefaultTalosMotionV6Preferences()
        persisted.mode = 'complex'
        persisted.speed = 135
        const h = harness({ theme_motion_v6: persisted })

        expect(h.editor.draft.value).toEqual(persisted)
        expect(h.editor.draft.value).not.toBe(persisted)
        expect(h.editor.lastKnownGood.value).toEqual(persisted)
        expect(h.editor.source.value).toBe('v6')
        expect(h.editor.dirty.value).toBe(false)
    })

    it('hydrates an existing V6 payload without glow as a canonical glow-off draft', () => {
        const persisted = createDefaultTalosMotionV6Preferences() as Record<string, unknown>
        delete persisted.glow_intensity

        const h = harness({ theme_motion_v6: persisted })

        expect(h.editor.source.value).toBe('v6')
        expect(h.editor.draft.value.glow_intensity).toBe(0)
        expect(h.editor.error.value).toBe('')
        expect(h.editor.dirty.value).toBe(false)
    })

    it('migrates legacy preferences for editing without writing during hydration', () => {
        const h = harness({
            theme_motion: 'cinematic',
            theme_simple_animation: false,
            ui_animation_profile: 'expressive',
        })

        expect(h.editor.source.value).toBe('legacy')
        expect(h.editor.draft.value).toMatchObject({
            mode: 'complex',
            speed: 140,
            intensity: 85,
            interface: { profile: 'expressive' },
        })
        expect(h.updateSettings).not.toHaveBeenCalled()
    })

    it('updates the live draft without issuing a PATCH', () => {
        const h = harness()
        h.editor.updateTopLevel('mode', 'simple')
        h.editor.updateTopLevel('speed', 155)
        h.editor.updateInterface('profile', 'custom')
        h.editor.updateCategory('windows', false)

        expect(h.editor.draft.value).toMatchObject({ mode: 'simple', speed: 155 })
        expect(h.editor.draft.value.interface).toMatchObject({
            profile: 'custom',
            categories: expect.objectContaining({ windows: false }),
        })
        expect(h.editor.dirty.value).toBe(true)
        expect(h.updateSettings).not.toHaveBeenCalled()
    })

    it('preserves a dirty draft when unrelated settings refresh externally', async () => {
        const h = harness()
        h.editor.updateTopLevel('speed', 155)

        h.settingsRef.value = settings({ theme: 'paper', account_locale: 'it' })
        await nextTick()

        expect(h.editor.draft.value.speed).toBe(155)
        expect(h.editor.dirty.value).toBe(true)
        expect(h.editor.error.value).toBe('')
    })

    it('preserves a dirty draft and reports a concurrent Motion V6 refresh', async () => {
        const h = harness()
        h.editor.updateTopLevel('speed', 155)
        const external = createDefaultTalosMotionV6Preferences()
        external.speed = 120

        h.settingsRef.value = settings({ theme_motion_v6: external })
        await nextTick()

        expect(h.editor.draft.value.speed).toBe(155)
        expect(h.editor.lastKnownGood.value.speed).toBe(120)
        expect(h.editor.dirty.value).toBe(true)
        expect(h.editor.error.value).toContain('changed in another settings surface')
    })

    it('saves only the exact V6 preference delta and commits after ACK', async () => {
        const h = harness({ theme: 'claudius', theme_customization: { font: 'manrope' } })
        h.editor.updateTopLevel('mode', 'complex')
        h.editor.updateTopLevel('depth', 82)

        expect(await h.editor.save()).toBe(true)

        expect(h.updateSettings).toHaveBeenCalledWith({
            preferences: {
                theme_motion_v6: expect.objectContaining({ mode: 'complex', depth: 82 }),
            },
        }, 'Motion settings saved.')
        const payload = h.updateSettings.mock.calls[0][0].preferences as Record<string, unknown>
        expect(Object.keys(payload)).toEqual(['theme_motion_v6'])
        expect(payload).not.toHaveProperty('theme_customization')
        expect(h.editor.lastKnownGood.value).toMatchObject({ mode: 'complex', depth: 82 })
        expect(h.editor.dirty.value).toBe(false)
        expect(h.changed).toHaveBeenCalledOnce()
    })

    it('rolls back to lastKnownGood and retains an explicit retry after rejection', async () => {
        const h = harness()
        h.editor.updateTopLevel('mode', 'complex')
        h.editor.updateTopLevel('speed', 180)
        h.updateSettings.mockRejectedValueOnce(new Error('network unavailable'))

        expect(await h.editor.save()).toBe(false)
        expect(h.editor.draft.value).toEqual(h.editor.lastKnownGood.value)
        expect(h.editor.error.value).toBe('network unavailable')
        expect(h.editor.canRetry.value).toBe(true)

        expect(await h.editor.retry()).toBe(true)
        expect(h.editor.draft.value).toMatchObject({ mode: 'complex', speed: 180 })
        expect(h.editor.canRetry.value).toBe(false)
    })

    it('ignores stale ACKs from an older revision', async () => {
        const h = harness()
        const resolvers: Array<(value: TalosWorkspaceSettings) => void> = []
        h.updateSettings.mockImplementation((payload) => new Promise((resolve) => {
            resolvers.push(() => resolve(settings(payload.preferences)))
        }))

        h.editor.updateTopLevel('speed', 120)
        const first = h.editor.save()
        h.editor.updateTopLevel('speed', 160)
        const second = h.editor.save()
        resolvers[1](settings({ theme_motion_v6: { ...h.editor.draft.value, speed: 160 } }))
        await second
        resolvers[0](settings({ theme_motion_v6: { ...h.editor.draft.value, speed: 120 } }))
        await first

        expect(h.editor.lastKnownGood.value.speed).toBe(160)
        expect(h.editor.draft.value.speed).toBe(160)
        expect(h.editor.saveRevision.value).toBe(2)
    })

    it('resets background and interface domains independently', () => {
        const h = harness()
        h.editor.updateTopLevel('mode', 'complex')
        h.editor.updateTopLevel('speed', 190)
        h.editor.updateTopLevel('glow_intensity', 80)
        h.editor.updateInterface('profile', 'expressive')
        h.editor.updateInterface('duration_scale', 140)
        h.editor.resetBackground()

        expect(h.editor.draft.value).toMatchObject({ mode: 'adaptive', speed: 100, glow_intensity: 0 })
        expect(h.editor.draft.value.interface).toMatchObject({ profile: 'expressive', duration_scale: 140 })

        h.editor.updateTopLevel('speed', 175)
        h.editor.resetInterface()
        expect(h.editor.draft.value.speed).toBe(175)
        expect(h.editor.draft.value.interface).toEqual(createDefaultTalosMotionV6Preferences().interface)
    })

    it('resets the complete motion policy to canonical defaults without persisting implicitly', () => {
        const persisted = createDefaultTalosMotionV6Preferences()
        persisted.mode = 'complex'
        persisted.background_enabled = false
        persisted.interface_enabled = false
        persisted.scene_override = 'noir'
        persisted.speed = 180
        persisted.intensity = 95
        persisted.density = 145
        persisted.depth = 90
        persisted.trails = 80
        persisted.contrast = 90
        persisted.parallax = 75
        persisted.quality = 'high'
        persisted.fps_cap = 60
        persisted.dpr_cap = 2
        persisted.pause_when_hidden = false
        persisted.respect_data_saver = false
        persisted.interface = {
            profile: 'custom',
            duration_scale: 145,
            intensity: 95,
            easing: 'cinematic',
            stagger: 110,
            categories: {
                windows: false,
                surfaces: false,
                navigation: false,
                composer: false,
                messages: false,
                feedback: false,
            },
        }
        const h = harness({ theme_motion_v6: persisted })

        h.editor.resetAll()

        expect(h.editor.draft.value).toEqual(createDefaultTalosMotionV6Preferences())
        expect(h.editor.dirty.value).toBe(true)
        expect(h.updateSettings).not.toHaveBeenCalled()
    })

    it('exposes truthful requested and effective renderer diagnostics', async () => {
        const h = harness()
        h.editor.updateTopLevel('mode', 'adaptive')
        await nextTick()
        expect(h.editor.runtimeDecision.value).toMatchObject({
            requestedMode: 'adaptive',
            effectiveMode: 'complex',
            reason: 'requested',
        })
    })
})
