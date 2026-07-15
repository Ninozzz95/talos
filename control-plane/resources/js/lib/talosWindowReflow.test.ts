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

    it('reserves the explicit right-sidebar dock without treating a geometric right snap as dock state', () => {
        expect(resolveTalosWindowReflow(
            ['runtime'],
            { runtime: 'none' },
            'desktop',
            { runtime: { width: 840, height: 900 } },
            ['runtime'],
        )).toEqual({ mode: 'right', reserveLeft: false, reserveRight: true, leftWidth: 0, rightWidth: 420, collapseRail: false })

        expect(resolveTalosWindowReflow(
            ['notes'],
            { notes: 'right-half' },
            'desktop',
            { notes: { width: 610, height: 900 } },
            [],
        ).rightWidth).toBe(610)
    })

    it('reserves one canonical dock column when multiple differently sized windows are docked', () => {
        expect(resolveTalosWindowReflow(
            ['runtime', 'calendar'],
            { runtime: 'none', calendar: 'none' },
            'desktop',
            {
                runtime: { width: 840, height: 900 },
                calendar: { width: 860, height: 900 },
            },
            ['runtime', 'calendar'],
        )).toEqual({ mode: 'right', reserveLeft: false, reserveRight: true, leftWidth: 0, rightWidth: 420, collapseRail: false })
    })
})
