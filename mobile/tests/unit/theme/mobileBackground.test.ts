// @vitest-environment jsdom

import { describe, expect, it, vi } from 'vitest'
import { shallowMount } from '@vue/test-utils'
import { nextTick } from 'vue'

const mocks = vi.hoisted(() => ({
    resolve: vi.fn(() => ({
        decision: {
            requestedMode: 'complex', effectiveMode: 'complex', backgroundEnabled: true,
            paused: false, reason: 'enabled', degradationStage: 0,
        },
        sceneId: 'telemetry',
        sceneInput: {},
        preferences: { glow_intensity: 40 },
    })),
    motion: { mode: 'complex', background_enabled: true, interface_enabled: true, speed: 125 },
}))

vi.mock('@/motion-v6/workspaceRuntime', () => ({ resolveTalosWorkspaceMotionV6: mocks.resolve }))
vi.mock('@/stores/settings', () => ({ useSettingsStore: () => ({ state: { motion_v6: mocks.motion } }) }))
vi.mock('@/stores/theme', () => ({ useThemeStore: () => ({ state: { theme: 'telemetry', mode: 'dark' } }) }))
vi.mock('@/composables/useTalosMotionEnvironment', () => ({
    useTalosMotionEnvironment: () => ({
        prefersReducedMotion: { value: false }, documentHidden: { value: false }, lowPower: { value: false },
    }),
}))
vi.mock('@/motion-v6/productRegistry', () => ({ createTalosBrowserProductSceneRegistry: () => ({}) }))
vi.mock('@/lib/talosThemes', async (importOriginal) => {
    const original = await importOriginal<typeof import('@/lib/talosThemes')>()
    return { ...original, effectiveTalosThemeMode: () => 'dark' }
})

import TalosMobileBackground from '@/components/talos/workspace/TalosMobileBackground.vue'

describe('TalosMobileBackground', () => {
    it('mounts and resolves the motion-v6 runtime for the active theme without throwing', async () => {
        const wrapper = shallowMount(TalosMobileBackground)
        await nextTick()
        expect(wrapper.exists()).toBe(true)
        // T6.5 regression: the migration contract reads `theme_motion_v6` —
        // the old `motion_v6` key was silently ignored (background never ran).
        expect(mocks.resolve).toHaveBeenCalledWith(expect.objectContaining({
            settingsPreferences: { theme_motion_v6: mocks.motion },
        }))
        wrapper.unmount()
    })

    it('pauses the renderer when the owning chat surface yields its frame budget', async () => {
        const wrapper = shallowMount(TalosMobileBackground, { props: { paused: true } })
        await nextTick()
        expect(wrapper.findComponent({ name: 'TalosProceduralBackground' }).props('paused')).toBe(true)
        wrapper.unmount()
    })
})
