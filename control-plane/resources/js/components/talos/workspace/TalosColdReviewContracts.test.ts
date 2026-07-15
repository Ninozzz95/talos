import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const chatSource = readFileSync(new URL('./TalosChatSurface.vue', import.meta.url), 'utf8')
const liveEdgeSource = readFileSync(new URL('./TalosLiveEdgeControl.vue', import.meta.url), 'utf8')
const windowLayerSource = readFileSync(new URL('./TalosWindowLayer.vue', import.meta.url), 'utf8')
const minimizedWindowChipSource = readFileSync(new URL('../window/TalosMinimizedWindowChip.vue', import.meta.url), 'utf8')
const modelCenterSource = readFileSync(new URL('../models/TalosModelCenter.vue', import.meta.url), 'utf8')

describe('cold-review UI contracts', () => {
    it('teleports the live-edge control above chat and floating window stacking contexts', () => {
        expect(chatSource).toContain('<Teleport to="body">')
        expect(liveEdgeSource).toContain('data-testid="talos-live-edge-control"')
    })

    it('anchors minimized windows to the measured composer token', () => {
        expect(windowLayerSource).toContain('bottom-[calc(var(--talos-composer-height,168px)+1.5rem)]')
        expect(windowLayerSource).not.toContain('absolute bottom-28 left-6')
    })

    it('gives every minimized window distinct restore and close controls', () => {
        expect(windowLayerSource).toContain('<TalosMinimizedWindowChip')
        expect(windowLayerSource).toContain(':close-fault="windowActionFaultFor(id)"')
        expect(windowLayerSource).toContain('@retry-close="retryWindowClose(id)"')
        expect(minimizedWindowChipSource).toContain('talos-restore-window-${id}')
        expect(minimizedWindowChipSource).toContain('talos-close-minimized-window-${id}')
        expect(minimizedWindowChipSource).toContain(':aria-label="`Close minimized ${title}`"')
        expect(minimizedWindowChipSource).toContain('role="alert"')
    })

    it('uses a theme-owned confirmation dialog for model-profile deletion', () => {
        expect(modelCenterSource).not.toContain('window.confirm')
        expect(modelCenterSource).toContain('role="dialog"')
        expect(modelCenterSource).toContain('aria-modal="true"')
        expect(modelCenterSource).toContain('Confirm delete')
    })
})
