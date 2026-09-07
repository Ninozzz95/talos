import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const source = readFileSync(new URL('./TalosWorkspace.vue', import.meta.url), 'utf8')

describe('TalosWorkspace streaming wiring', () => {
    it('selects streaming only through the real product capability manifest', () => {
        expect(source).toContain('streamingEnabled: () => talosCapabilities.isUsable(\'chat.streaming\')')
        expect(source).toMatch(/streamingState,\s*streamingCanCancel,\s*cancelStreaming,/)
    })

    it('projects the session-owned stream into the chat surface with the effective motion policy', () => {
        expect(source).toContain(':streaming-state="streamingState"')
        expect(source).toContain(':streaming-reduced-motion="workspaceMotionV6Decision.reducedMotionApplied || workspaceUiMotionDisabled"')
    })

    it('routes the composer Stop command to the explicit server cancellation boundary', () => {
        expect(source).toContain(':streaming-active="streamingCanCancel"')
        expect(source).toContain('@cancel-stream="cancelStreaming"')
    })
})
