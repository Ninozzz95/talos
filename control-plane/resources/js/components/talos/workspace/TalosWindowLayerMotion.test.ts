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

    it('mounts the upstream frame adapter and one semantic snap preview', () => {
        expect(source).toContain('TalosWindowSnapPreview')
        expect(source).toContain('bindWindowFrame')
        expect(source).toContain(':data-window-tile-target=')
        expect(source).not.toContain('@drag-start="startWindowDrag"')
        expect(source).not.toContain('@resize-start="startWindowResize"')
    })

    it('receives canonical V6 preferences and runtime reduced-motion policy from the workspace', () => {
        expect(source).toContain('motionPreferences: toRef(props, \'motionPreferences\')')
        expect(source).toContain('reducedMotion: toRef(props, \'reducedMotion\')')
        expect(source).toContain('fullscreenWindowIds: toRef(props, \'fullscreenWindowIds\')')
    })

    it('lets the inner desktop surface fill the persisted frame height', () => {
        expect(appCssSource).toMatch(/@media \(min-width: 1024px\)[\s\S]*?\.talos-floating-window > \.talos-tool-window\s*\{[\s\S]*?max-height:\s*none/)
    })

    it('renders a theme-aware snap ghost and preserves the shared divider on both half-screen tiles', () => {
        const previewRule = appCssSource.match(/\.talos-window-snap-preview\s*\{([^}]*)\}/)?.[1] ?? ''
        expect(previewRule).toContain('--talos-snap-preview-x')
        expect(previewRule).toContain('--talos-snap-preview-y')
        expect(previewRule).toContain('--talos-snap-preview-width')
        expect(previewRule).toContain('--talos-snap-preview-height')
        expect(appCssSource).toMatch(/\.talos-window-snap-preview\s*\{[\s\S]*?var\(--talos-accent\)/)
        expect(appCssSource).toMatch(/\.talos-floating-window-fullscreen > \.talos-tool-window\s*\{[\s\S]*?border-radius:\s*0/)
        expect(appCssSource).not.toMatch(/data-window-tile-target="left-half"[^}]*border-right-width:\s*0/)
        expect(appCssSource).not.toMatch(/data-window-tile-target="right-half"[^}]*border-left-width:\s*0/)
        expect(appCssSource).toMatch(/data-window-tile-target="left-half"[^}]*> \.talos-tool-window[\s\S]*?border-radius:\s*0/)
        expect(appCssSource).toMatch(/data-window-tile-target="right-half"[^}]*> \.talos-tool-window[\s\S]*?border-radius:\s*0/)
    })

    it('keeps Peek content crisp while making only appearance surfaces translucent', () => {
        expect(source).toContain('useTalosWindowPeek')
        expect(source).toContain(':peek-available="canPeek(id)"')
        expect(source).toContain(':peeking="isPeeked(id)"')
        expect(appCssSource).toMatch(/\.talos-tool-window-peek\s*\{[\s\S]*?55%[\s\S]*?backdrop-filter:\s*none/)
        expect(appCssSource).not.toMatch(/\.talos-tool-window-peek\s*\{[^}]*opacity:/)
    })
})
