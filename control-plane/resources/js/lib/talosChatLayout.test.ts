import { describe, expect, it } from 'vitest'
import {
    TALOS_DEFAULT_CHAT_LAYOUT,
    TALOS_MOBILE_WINDOW_PRESENTATION_OPTIONS,
    sanitizeTalosChatLayout,
} from './talosChatLayout'

describe('TALOS chat and responsive window layout preferences', () => {
    it('uses canonical numeric message scale and the full composer by default', () => {
        expect(TALOS_DEFAULT_CHAT_LAYOUT).toMatchObject({
            message_scale: 1,
            composer_mode: 'full',
        })
        expect(TALOS_DEFAULT_CHAT_LAYOUT).not.toHaveProperty('bubble_scale')
    })

    it('accepts canonical numeric scale without retaining the legacy field', () => {
        expect(sanitizeTalosChatLayout({
            message_scale: 1.25,
            bubble_scale: 'compact',
        })).toMatchObject({ message_scale: 1.25 })
        expect(sanitizeTalosChatLayout({ message_scale: 1.25 })).not.toHaveProperty('bubble_scale')
    })

    it('maps legacy bubble labels at the read boundary without inventing a write field', () => {
        expect(sanitizeTalosChatLayout({ bubble_scale: 'compact' }).message_scale).toBe(0.875)
        expect(sanitizeTalosChatLayout({ bubble_scale: 'balanced' }).message_scale).toBe(1)
        expect(sanitizeTalosChatLayout({ bubble_scale: 'expanded' }).message_scale).toBe(1.15)
        expect(sanitizeTalosChatLayout({ bubble_scale: 'wide' }).message_scale).toBe(1)
    })

    it('fails malformed canonical values closed to the numeric default', () => {
        for (const message_scale of [NaN, Infinity, '1.2', 0.7, 1.5, 0.875]) {
            expect(sanitizeTalosChatLayout({ message_scale }).message_scale).toBe(1)
        }
    })

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
