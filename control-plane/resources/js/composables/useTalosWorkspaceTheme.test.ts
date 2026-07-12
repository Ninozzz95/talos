// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest'
import { createApp, defineComponent, h, nextTick, ref } from 'vue'
import type { TalosThemeCustomization, TalosThemeId } from '../lib/talosThemes'
import type { TalosChatBubbleScale } from '../lib/talosTypes'
import type { TalosWorkspaceSettings } from './useTalosSettings'
import { useTalosWorkspaceTheme } from './useTalosWorkspaceTheme'
import { createDefaultTalosMotionV6Preferences } from '../motion-v6/defaults'

const mounted: Array<ReturnType<typeof createApp>> = []
const originalMatchMedia = window.matchMedia
const originalConnection = Object.getOwnPropertyDescriptor(navigator, 'connection')
const originalDocumentHidden = Object.getOwnPropertyDescriptor(document, 'hidden')

afterEach(() => {
    mounted.splice(0).forEach((app) => app.unmount())
    document.body.replaceChildren()
    window.matchMedia = originalMatchMedia
    if (originalConnection) Object.defineProperty(navigator, 'connection', originalConnection)
    else delete (navigator as Navigator & { connection?: unknown }).connection
    if (originalDocumentHidden) Object.defineProperty(document, 'hidden', originalDocumentHidden)
})

function installMotionPreference(reducedMotion: boolean) {
    Object.defineProperty(document, 'hidden', {
        configurable: true,
        value: false,
    })
    window.matchMedia = vi.fn((query: string) => ({
        matches: query === '(prefers-reduced-motion: reduce)' && reducedMotion,
        media: query,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        dispatchEvent: vi.fn(),
    }) as unknown as MediaQueryList)
}

async function mountWorkspaceTheme(
    themeMotion: 'system' | 'normal' | 'cinematic',
    preferences: Record<string, unknown> = {},
    themeId: TalosThemeId = 'forge',
) {
    const container = document.createElement('div')
    container.className = 'talos-shell'
    document.body.append(container)
    const workspaceRoot = ref<HTMLElement | null>(container)
    let motion!: ReturnType<typeof useTalosWorkspaceTheme>

    const app = createApp(defineComponent({
        setup() {
            motion = useTalosWorkspaceTheme({
                theme: ref<TalosThemeId>(themeId),
                themeDraftCustomization: ref<TalosThemeCustomization | null>(null),
                workspaceSettings: ref<TalosWorkspaceSettings>({
                    id: 'settings-motion',
                    preferences: {
                        reduced_motion: false,
                        theme_motion: themeMotion,
                        theme_motion_disabled: false,
                        ui_animation_profile: 'preset',
                        ...preferences,
                    },
                }),
                workspaceRoot,
                railCollapsed: ref(false),
                railWidth: ref(272),
                bubbleScale: ref<TalosChatBubbleScale>('balanced'),
            })

            return () => h('div')
        },
    }))

    mounted.push(app)
    app.mount(container)
    await nextTick()

    return motion
}

describe('useTalosWorkspaceTheme motion precedence', () => {
    it('makes canonical V6 settings authoritative over legacy renderer preferences', async () => {
        installMotionPreference(false)
        const v6 = createDefaultTalosMotionV6Preferences()
        v6.mode = 'complex'
        v6.scene_override = 'signal'
        const motion = await mountWorkspaceTheme('normal', {
            theme_simple_animation: true,
            theme_motion_disabled: true,
            theme_motion_v6: v6,
        })
        expect(motion.motionV6Source.value).toBe('v6')
        expect(motion.motionV6Decision.value.effectiveMode).toBe('complex')
        expect(motion.motionV6SceneId.value).toBe('signal')
        expect(motion.simpleAnimation.value).toBe(false)
        expect(motion.backgroundMotionEnabled.value).toBe(true)
    })

    it('uses each preset bounded density radius and motion profile when no override exists', async () => {
        installMotionPreference(false)

        const paper = await mountWorkspaceTheme('system', {}, 'paper')
        expect(paper.shellClass.value).toContain('talos-density-spacious')
        expect(paper.shellClass.value).toContain('talos-radius-balanced')
        expect(paper.motionV6SceneId.value).toBe('paper')
        expect(paper.workspaceStyle.value['--talos-motion-duration-window-open']).toBe('365ms')

        const terminal = await mountWorkspaceTheme('system', {}, 'terminal')
        expect(terminal.shellClass.value).toContain('talos-density-compact')
        expect(terminal.shellClass.value).toContain('talos-radius-sharp')
        expect(terminal.motionV6SceneId.value).toBe('terminal')
        expect(terminal.workspaceStyle.value['--talos-motion-duration-window-open']).toBe('320ms')
    })

    it.each(['normal', 'cinematic'] as const)('treats OS reduced motion as a hard override for %s', async (themeMotion) => {
        installMotionPreference(true)

        const motion = await mountWorkspaceTheme(themeMotion)

        expect(motion.motionDisabled.value).toBe(true)
        expect(motion.uiMotionDisabled.value).toBe(true)
        expect(motion.backgroundMotionEnabled.value).toBe(false)
    })

    it('pauses workspace UI and background motion when the tab becomes hidden', async () => {
        installMotionPreference(false)
        let hidden = false
        Object.defineProperty(document, 'hidden', {
            configurable: true,
            get: () => hidden,
        })
        const motion = await mountWorkspaceTheme('normal')
        expect(motion.backgroundMotionEnabled.value).toBe(true)

        hidden = true
        document.dispatchEvent(new Event('visibilitychange'))
        await nextTick()

        expect(motion.uiMotionDisabled.value).toBe(true)
        expect(motion.backgroundMotionEnabled.value).toBe(false)
    })

    it('reduces background complexity and disables interface motion under a low-power signal', async () => {
        installMotionPreference(false)
        Object.defineProperty(navigator, 'connection', {
            configurable: true,
            value: {
                saveData: true,
                effectiveType: '4g',
                addEventListener: vi.fn(),
                removeEventListener: vi.fn(),
            },
        })

        const motion = await mountWorkspaceTheme('normal')

        expect(motion.uiMotionDisabled.value).toBe(true)
        expect(motion.motionV6Decision.value).toMatchObject({ effectiveMode: 'simple', reason: 'data_saver' })
        expect(motion.backgroundMotionEnabled.value).toBe(true)
    })

    it('feeds real renderer samples into Adaptive degradation and stable recovery', async () => {
        installMotionPreference(false)
        const v6 = createDefaultTalosMotionV6Preferences()
        v6.mode = 'adaptive'
        v6.quality = 'balanced'
        const motion = await mountWorkspaceTheme('normal', { theme_motion_v6: v6 })
        let timestampMs = 0

        for (let window = 0; window < 3; window += 1) {
            for (let frame = 0; frame < 30; frame += 1) {
                motion.recordMotionFrame({ timestampMs, frameCostMs: 13, primitiveCount: 120 })
                timestampMs += 1
            }
            await nextTick()
        }
        expect(motion.motionV6Decision.value).toMatchObject({
            degradationStage: 1,
            reason: 'performance_degraded',
        })

        for (let window = 0; window < 8; window += 1) motion.recordMotionStableWindow({ eventLoopDelayMs: 2 })
        await nextTick()
        expect(motion.motionV6Decision.value.degradationStage).toBe(0)
    })

    it('fails a renderer closed through the workspace callback instead of retrying in a loop', async () => {
        installMotionPreference(false)
        const v6 = createDefaultTalosMotionV6Preferences()
        v6.mode = 'adaptive'
        const motion = await mountWorkspaceTheme('normal', { theme_motion_v6: v6 })

        motion.recordMotionRendererFault({ effectiveMode: 'complex', reason: 'render_failed' })
        await nextTick()

        expect(motion.motionV6Decision.value).toMatchObject({
            effectiveMode: 'simple',
            reason: 'renderer_fault',
        })
        expect(motion.motionV6GovernorSnapshot.value).toMatchObject({
            rendererFault: true,
            failedEffectiveMode: 'complex',
        })
    })

    it('ignores unsafe persisted customization instead of rendering unreadable legacy state', async () => {
        installMotionPreference(false)

        const theme = await mountWorkspaceTheme('normal', {
            theme_customization: {
                background: '#ffffff',
                text: '#777777',
            },
        })

        expect(theme.workspaceStyle.value['--talos-background']).not.toBe('#ffffff')
        expect(theme.workspaceStyle.value['--talos-text']).not.toBe('#777777')
    })

    it('ignores unsafe persisted area tokens instead of rendering unreadable legacy state', async () => {
        installMotionPreference(false)

        const theme = await mountWorkspaceTheme('normal', {
            theme_area_tokens: {
                composer: {
                    background: '#000000',
                    surface: '#000000',
                    text: '#111111',
                    muted: '#222222',
                },
            },
        })

        expect(theme.workspaceStyle.value['--talos-composer-bg']).not.toBe('#000000')
        expect(theme.workspaceStyle.value['--talos-composer-surface']).not.toBe('#000000')
        expect(theme.workspaceStyle.value['--talos-composer-text']).not.toBe('#111111')
        expect(theme.workspaceStyle.value['--talos-muted']).not.toBe('#222222')
    })
})
