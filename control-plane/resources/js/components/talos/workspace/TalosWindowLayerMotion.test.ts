import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const source = readFileSync(new URL('./TalosWindowLayer.vue', import.meta.url), 'utf8')
const motionSource = readFileSync(new URL('../../../composables/useTalosWindowMotion.ts', import.meta.url), 'utf8')
const appCssSource = readFileSync(new URL('../../../../css/app.css', import.meta.url), 'utf8')

describe('TalosWindowLayer Motion V6 integration', () => {
    it('routes destructive actions through the V6 lifecycle boundary', () => {
        expect(source).toContain('useTalosWindowMotion')
        expect(source).toContain("requestWindowClose(id)")
        expect(source).toContain("requestWindowMinimize(id)")
        expect(source).toContain("requestWindowFullscreen(id)")
        expect(source).not.toContain('@animationend=')
        expect(motionSource).toContain('createInteractionMotionController')
        expect(motionSource).toContain('resolveTalosInteractionMotion')
        expect(motionSource).toContain('createTalosWindowFlipPlan')
        expect(motionSource).not.toContain('createTalosRevisionedCompletionScheduler')
    })

    it('separates the positioned frame from the animated window surface', () => {
        expect(source).toContain('data-window-frame-id')
        expect(source).toMatch(/class="talos-floating-window pointer-events-auto"/)
        expect(source).toContain(':data-window-motion-state="transitionStateFor(id)"')
        expect(source).not.toMatch(/<TalosToolWindow[\s\S]{0,900}class="talos-floating-window/)
    })

    it('receives canonical V6 preferences and runtime reduced-motion policy from the workspace', () => {
        expect(source).toContain('motionPreferences: toRef(props, \'motionPreferences\')')
        expect(source).toContain('reducedMotion: toRef(props, \'reducedMotion\')')
        expect(source).toContain('fullscreenWindowIds: toRef(props, \'fullscreenWindowIds\')')
    })

    it('lets the inner desktop surface fill the persisted frame height', () => {
        expect(appCssSource).toMatch(/@media \(min-width: 1024px\)[\s\S]*?\.talos-floating-window > \.talos-tool-window\s*\{[\s\S]*?max-height:\s*none/)
    })
})
