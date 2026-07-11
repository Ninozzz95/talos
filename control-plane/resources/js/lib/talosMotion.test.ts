import { afterEach, describe, expect, it, vi } from 'vitest'
import {
    createTalosMotionCompletionScheduler,
    createTalosRevisionedCompletionScheduler,
    talosMotionDurationStyle,
    talosWindowTransitionDurationVariable,
    resolveTalosMotion,
    resolveTalosMotionIntent,
    resolveTalosWindowTransitionDuration,
    type TalosMotionIntent,
} from './talosMotion'

afterEach(() => {
    vi.useRealTimers()
})

describe('talosMotion', () => {
    it('resolves system motion to normal when no hard override is active', () => {
        const motion = resolveTalosMotion({
            themeMotion: 'system',
            themeMotionDisabled: false,
            uiAnimationProfile: 'preset',
            prefersReducedMotion: false,
        })

        expect(motion.mode).toBe('normal')
        expect(motion.backgroundMotionEnabled).toBe(true)
        expect(motion.uiMotionEnabled).toBe(true)
    })

    it.each(['subtle', 'normal', 'cinematic'] as const)('preserves explicit %s intent', (mode) => {
        expect(resolveTalosMotion({ themeMotion: mode }).mode).toBe(mode)
    })

    it('keeps theme motion off scoped to background motion', () => {
        const motion = resolveTalosMotion({
            themeMotion: 'off',
            uiAnimationProfile: 'preset',
        })

        expect(motion.backgroundMotionEnabled).toBe(false)
        expect(motion.uiMotionEnabled).toBe(true)
        expect(resolveTalosMotionIntent('window-open', motion).enabled).toBe(true)
    })

    it('keeps the explicit background switch independent from UI motion', () => {
        const motion = resolveTalosMotion({
            themeMotion: 'cinematic',
            themeMotionDisabled: true,
            uiAnimationProfile: 'preset',
        })

        expect(motion.backgroundMotionEnabled).toBe(false)
        expect(motion.uiMotionEnabled).toBe(true)
    })

    it('makes OS reduced motion a hard override for all nonessential motion', () => {
        const motion = resolveTalosMotion({
            themeMotion: 'cinematic',
            themeMotionDisabled: false,
            uiAnimationProfile: 'preset',
            prefersReducedMotion: true,
        })

        expect(motion.backgroundMotionEnabled).toBe(false)
        expect(motion.uiMotionEnabled).toBe(false)
        expect(resolveTalosMotionIntent('window-open', motion)).toMatchObject({
            enabled: false,
            duration: 0,
            exitDuration: 0,
            transition: 'none',
        })
    })

    it('combines hard-override aliases instead of allowing a false alias to mask a true one', () => {
        const osOverride = resolveTalosMotion({
            prefersReducedMotion: false,
            osReducedMotion: true,
        })
        const backgroundOverride = resolveTalosMotion({
            themeMotionDisabled: false,
            backgroundMotionDisabled: true,
        })

        expect(osOverride.prefersReducedMotion).toBe(true)
        expect(osOverride.uiMotionEnabled).toBe(false)
        expect(osOverride.backgroundMotionEnabled).toBe(false)
        expect(backgroundOverride.backgroundMotionEnabled).toBe(false)
        expect(backgroundOverride.uiMotionEnabled).toBe(true)
    })

    it('disables UI motion without disabling background motion when the UI profile is off', () => {
        const motion = resolveTalosMotion({
            themeMotion: 'normal',
            themeMotionDisabled: false,
            uiAnimationProfile: 'off',
            prefersReducedMotion: false,
        })

        expect(motion.backgroundMotionEnabled).toBe(true)
        expect(motion.uiMotionEnabled).toBe(false)
        expect(resolveTalosMotionIntent('success-confirm', motion).transition).toBe('none')
    })

    it('uses the normative duration family for every semantic intent', () => {
        const expected: Record<TalosMotionIntent, [number, number]> = {
            'surface-enter': [167, 83],
            'surface-exit': [83, 0],
            'window-open': [250, 0],
            'window-minimize': [333, 333],
            'window-restore': [250, 0],
            'window-focus': [83, 83],
            disclosure: [167, 83],
            popover: [167, 83],
            menu: [167, 83],
            'message-insert': [167, 0],
            'activity-progress': [333, 167],
            'error-attention': [250, 0],
            'success-confirm': [333, 167],
            'theme-transition': [250, 250],
        }

        for (const [intent, [duration, exitDuration]] of Object.entries(expected) as Array<[TalosMotionIntent, [number, number]]>) {
            expect(resolveTalosMotionIntent(intent, resolveTalosMotion({}))).toMatchObject({
                enabled: true,
                duration,
                exitDuration,
            })
        }
    })

    it('resolves custom WindowLayer duration from duration scale or computed CSS', () => {
        const motion = resolveTalosMotion({ durationScale: 120 })

        expect(resolveTalosWindowTransitionDuration('opening', motion)).toBe(300)
        expect(resolveTalosWindowTransitionDuration('minimizing', motion)).toBe(400)
        expect(resolveTalosWindowTransitionDuration('opening', motion, '275ms')).toBe(275)
        expect(resolveTalosWindowTransitionDuration('restoring', motion, '0.32s')).toBe(320)
    })

    it('builds semantic duration tokens from the shared intent baseline', () => {
        expect(talosMotionDurationStyle(120)).toMatchObject({
            '--talos-motion-duration-control': '100ms',
            '--talos-motion-duration-surface-enter': '200ms',
            '--talos-motion-duration-surface-exit': '100ms',
            '--talos-motion-duration-window-open': '300ms',
            '--talos-motion-duration-window-restore': '300ms',
            '--talos-motion-duration-window-minimize': '400ms',
            '--talos-motion-duration-window-focus': '100ms',
            '--talos-motion-duration-disclosure': '200ms',
            '--talos-motion-duration-popover': '200ms',
            '--talos-motion-duration-menu': '200ms',
            '--talos-motion-duration-message-insert': '200ms',
            '--talos-motion-duration-activity-progress': '400ms',
            '--talos-motion-duration-error-attention': '300ms',
            '--talos-motion-duration-success-confirm': '400ms',
            '--talos-motion-duration-theme-transition': '300ms',
        })
    })

    it('maps window transitions to semantic CSS variables', () => {
        expect(talosWindowTransitionDurationVariable('idle')).toBeNull()
        expect(talosWindowTransitionDurationVariable('opening')).toBe('--talos-motion-duration-window-open')
        expect(talosWindowTransitionDurationVariable('restoring')).toBe('--talos-motion-duration-window-restore')
        expect(talosWindowTransitionDurationVariable('minimizing')).toBe('--talos-motion-duration-window-minimize')
        expect(talosWindowTransitionDurationVariable('expanding')).toBe('--talos-motion-duration-window-open')
    })

    it('returns zero WindowLayer duration under a hard UI override', () => {
        const motion = resolveTalosMotion({
            durationScale: 150,
            prefersReducedMotion: true,
        })

        expect(resolveTalosWindowTransitionDuration('opening', motion, '480ms')).toBe(0)
        expect(resolveTalosWindowTransitionDuration('minimizing', motion, '0.5s')).toBe(0)
        expect(resolveTalosWindowTransitionDuration('idle', resolveTalosMotion({}))).toBe(0)
    })

    it('flushes pending motion completions exactly once', () => {
        vi.useFakeTimers()
        const complete = vi.fn()
        const scheduler = createTalosMotionCompletionScheduler<string>()

        scheduler.schedule('theme', 300, complete)
        expect(scheduler.pendingCount()).toBe(1)

        scheduler.finishAll()
        vi.runAllTimers()

        expect(complete).toHaveBeenCalledTimes(1)
        expect(scheduler.pendingCount()).toBe(0)
    })

    it('lets animationend win over the fallback exactly once for the current window revision', () => {
        vi.useFakeTimers()
        const staleCompletion = vi.fn()
        const activeCompletion = vi.fn()
        const transitions = createTalosRevisionedCompletionScheduler<string>()

        const staleRevision = transitions.begin('theme')
        transitions.schedule('theme', staleRevision, 300, staleCompletion)
        const activeRevision = transitions.begin('theme')
        transitions.schedule('theme', activeRevision, 300, activeCompletion)

        expect(transitions.isCurrent('theme', staleRevision)).toBe(false)
        expect(transitions.isCurrent('theme', activeRevision)).toBe(true)

        transitions.finish('theme')
        transitions.finish('theme')
        vi.runAllTimers()

        expect(staleCompletion).not.toHaveBeenCalled()
        expect(activeCompletion).toHaveBeenCalledTimes(1)
        expect(transitions.pendingCount()).toBe(0)
    })

    it('ignores a fallback that arrives after its transition revision was cancelled', () => {
        vi.useFakeTimers()
        const complete = vi.fn()
        const transitions = createTalosRevisionedCompletionScheduler<string>()
        const revision = transitions.begin('theme')

        transitions.cancel('theme')
        transitions.schedule('theme', revision, 250, complete)
        vi.runAllTimers()

        expect(complete).not.toHaveBeenCalled()
        expect(transitions.pendingCount()).toBe(0)
    })
})
