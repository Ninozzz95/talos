import { describe, expect, it } from 'vitest'
import { talosElapsedLabel } from '@/composables/useTalosElapsed'

/**
 * Owner 2026-07-26: "metti il tempo che è passato in secondi del ragionamento e
 * dei tool sia nella riga che nel drawer".
 */
describe('how long it has been thinking, in words', () => {
    it('says nothing under a second', () => {
        // A row that flickers "0s" as it appears is noise; the reason to show a
        // clock at all is the long cases.
        expect(talosElapsedLabel(0)).toBe('')
    })

    it('counts seconds up to a minute', () => {
        expect(talosElapsedLabel(1)).toBe('1s')
        expect(talosElapsedLabel(47)).toBe('47s')
        expect(talosElapsedLabel(59)).toBe('59s')
    })

    it('switches to minutes, and drops a zero remainder', () => {
        expect(talosElapsedLabel(60)).toBe('1m')
        expect(talosElapsedLabel(95)).toBe('1m 35s')
        expect(talosElapsedLabel(120)).toBe('2m')
    })
})
