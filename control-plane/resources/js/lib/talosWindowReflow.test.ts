import { describe, expect, it } from 'vitest'
import { resolveTalosWindowReflow } from './talosWindowReflow'

describe('TALOS window-to-chat reflow policy', () => {
    it('collapses the rail and reserves the left half for a visible left-snapped window', () => {
        expect(resolveTalosWindowReflow(
            ['theme'],
            { theme: 'left-half' },
            'desktop',
            { theme: { width: 720, height: 900 } },
        )).toEqual({ mode: 'left', reserveLeft: true, reserveRight: false, leftWidth: 720, rightWidth: 0, collapseRail: true })
    })

    it('reserves the right half without forcing the rail closed', () => {
        expect(resolveTalosWindowReflow(
            ['notes'],
            { notes: 'right-half' },
            'desktop',
            { notes: { width: 540, height: 900 } },
        )).toEqual({ mode: 'right', reserveLeft: false, reserveRight: true, leftWidth: 0, rightWidth: 540, collapseRail: false })
    })

    it('derives both sides deterministically and ignores hidden or non-desktop windows', () => {
        expect(resolveTalosWindowReflow(
            ['theme', 'notes'],
            { theme: 'left-half', notes: 'right-half', tasks: 'left-half' },
            'desktop',
            { theme: { width: 480, height: 900 }, notes: { width: 520, height: 900 } },
        )).toEqual({ mode: 'both', reserveLeft: true, reserveRight: true, leftWidth: 480, rightWidth: 520, collapseRail: true })
        expect(resolveTalosWindowReflow(
            ['theme'],
            { theme: 'left-half' },
            'mobile',
            { theme: { width: 480, height: 900 } },
        )).toEqual({ mode: 'none', reserveLeft: false, reserveRight: false, leftWidth: 0, rightWidth: 0, collapseRail: false })
    })

    it('tracks the live width of the visible snapped pane so chat can reflow with its divider', () => {
        const sizes = { theme: { width: 610, height: 900 } }
        expect(resolveTalosWindowReflow(['theme'], { theme: 'left-half' }, 'desktop', sizes).leftWidth).toBe(610)

        sizes.theme.width = 748
        expect(resolveTalosWindowReflow(['theme'], { theme: 'left-half' }, 'desktop', sizes).leftWidth).toBe(748)
    })
})
