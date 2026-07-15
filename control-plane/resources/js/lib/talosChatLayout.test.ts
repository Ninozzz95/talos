import { describe, expect, it } from 'vitest'
import {
    TALOS_DEFAULT_CHAT_LAYOUT,
    TALOS_MOBILE_WINDOW_PRESENTATION_OPTIONS,
    sanitizeTalosChatLayout,
} from './talosChatLayout'

describe('TALOS chat and responsive window layout preferences', () => {
    it('defaults invalid or missing mobile presentation to the upstream Drawer', () => {
        expect(TALOS_DEFAULT_CHAT_LAYOUT.mobile_window_presentation).toBe('drawer')
        expect(sanitizeTalosChatLayout(null).mobile_window_presentation).toBe('drawer')
        expect(sanitizeTalosChatLayout({ mobile_window_presentation: 'side-sheet' }).mobile_window_presentation).toBe('drawer')
    })

    it('accepts only the canonical Drawer and fullscreen Dialog modes', () => {
        expect(TALOS_MOBILE_WINDOW_PRESENTATION_OPTIONS).toEqual([
            { value: 'drawer', label: 'Drawer' },
            { value: 'fullscreen', label: 'Fullscreen modal' },
        ])
        expect(sanitizeTalosChatLayout({ mobile_window_presentation: 'drawer' }).mobile_window_presentation).toBe('drawer')
        expect(sanitizeTalosChatLayout({ mobile_window_presentation: 'fullscreen' }).mobile_window_presentation).toBe('fullscreen')
    })
})
