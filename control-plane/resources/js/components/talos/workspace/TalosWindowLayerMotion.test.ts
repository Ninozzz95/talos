import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const source = readFileSync(new URL('./TalosWindowLayer.vue', import.meta.url), 'utf8')
const motionSource = readFileSync(new URL('../../../composables/useTalosWindowMotion.ts', import.meta.url), 'utf8')
const appCss = readFileSync(join(process.cwd(), 'resources/css/app.css'), 'utf8')

describe('TalosWindowLayer motion integration', () => {
    it('uses semantic window duration vars with animationend-first completion and a revision-safe fallback', () => {
        expect(source).toContain('useTalosWindowMotion')
        expect(motionSource).toContain('resolveTalosWindowTransitionDuration')
        expect(motionSource).toContain('createTalosRevisionedCompletionScheduler')
        expect(motionSource).toContain('talosWindowTransitionDurationVariable')
        expect(motionSource).toContain('computedWindowDuration(state)')
        expect(motionSource).toContain('getPropertyValue(property)')
        expect(source).toContain('@animationend="handleWindowAnimationEnd(id, $event)"')
        expect(motionSource).toMatch(/event\.target !== event\.currentTarget/)
        expect(motionSource).toMatch(/requestAnimationFrame\(\(\) => window\.requestAnimationFrame\(\(\) =>/)
        expect(motionSource).toContain('transitionCompletions.finish(id)')
        expect(motionSource).toContain('transitionCompletions.isCurrent')
        expect(motionSource).not.toContain("'--talos-motion-open-duration'")
        expect(motionSource).not.toContain("'--talos-window-minimize-duration'")
    })

    it('flushes pending completions when runtime motion pauses', () => {
        expect(motionSource).toMatch(/watch\([\s\S]*talosMotion\.motionPaused[\s\S]*finishAll\(\)/)
    })

    it('uses semantic motion duration tokens for window open restore and minimize CSS', () => {
        expect(appCss).toContain('var(--talos-motion-duration-window-open)')
        expect(appCss).toContain('var(--talos-motion-duration-window-restore)')
        expect(appCss).toContain('var(--talos-motion-duration-window-minimize)')
        expect(appCss).not.toContain('var(--talos-window-transition-duration')
        expect(appCss).not.toContain('var(--talos-window-minimize-duration')
    })
})
