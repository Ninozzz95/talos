// @vitest-environment jsdom

import { describe, expect, it } from 'vitest'
import {
    TALOS_DOCTOR_SECTIONS,
    talosDoctorVerdict,
    splitTalosDoctorRows,
} from '@/lib/diagnostics/doctorSections'

/**
 * Owner 2026-07-26: "organizza bene anche le sezioni nel Doctor, non voglio che
 * sia troppo affollata dal punto di vista dell'interfaccia, fai in modo che ci
 * siano dei settaggi e delle tab. Insomma strutturalo in modo coerente."
 *
 * The research decided the shape (2026-07-26, logged): THREE fixed segments, no
 * overflow — Apple caps segments at ~5 on iPhone and NN/g find that when a tab
 * row scrolls "the hidden tabs become less discoverable". Three also keeps every
 * target above 48dp on a 360dp screen.
 */
describe('how the Doctor is divided', () => {
    it('has exactly three fixed segments, so the row can never scroll', () => {
        expect(TALOS_DOCTOR_SECTIONS).toHaveLength(3)
        expect(TALOS_DOCTOR_SECTIONS.map((section) => section.id))
            .toEqual(['status', 'data', 'advanced'])
    })

    it('labels them in one or two plain words', () => {
        for (const section of TALOS_DOCTOR_SECTIONS) {
            expect(section.label.split(' ').length).toBeLessThanOrEqual(2)
            // NN/g: ALL CAPS reduces legibility, and a label must predict its
            // content rather than brand it.
            expect(section.label).not.toBe(section.label.toUpperCase())
        }
    })
})

const OK = { id: 'a', label: 'Platform', value: 'native', ok: true }
const BAD = { id: 'b', label: 'Storage', value: 'error', ok: false }

describe('the one line that lets a healthy user leave', () => {
    it('says everything passed, when it did', () => {
        expect(talosDoctorVerdict([OK, { ...OK, id: 'c' }]))
            .toEqual({ ok: true, message: '2 checks passed' })
    })

    it('counts the problems instead, when there are any', () => {
        expect(talosDoctorVerdict([OK, BAD, { ...BAD, id: 'd' }]))
            .toEqual({ ok: false, message: '2 problems found' })
    })

    it('gets the singular right', () => {
        expect(talosDoctorVerdict([OK, BAD]).message).toBe('1 problem found')
        expect(talosDoctorVerdict([OK]).message).toBe('1 check passed')
    })

    it('says nothing rather than "0 checks passed" before the scan', () => {
        expect(talosDoctorVerdict([])).toEqual({ ok: true, message: '' })
    })
})

describe('what is shown and what is folded away', () => {
    it('keeps the failures out, and folds the rest into one row', () => {
        // The WebMD failure NN/g documents is expanding the FIRST item by
        // default; what must be open is what is actionable, never what happens
        // to be first.
        const split = splitTalosDoctorRows([OK, BAD, { ...OK, id: 'c' }])
        expect(split.problems.map((row) => row.id)).toEqual(['b'])
        expect(split.passing.map((row) => row.id)).toEqual(['a', 'c'])
    })

    it('preserves the scan order inside each group', () => {
        const rows = [BAD, OK, { ...BAD, id: 'z' }, { ...OK, id: 'y' }]
        const split = splitTalosDoctorRows(rows)
        expect(split.problems.map((row) => row.id)).toEqual(['b', 'z'])
        expect(split.passing.map((row) => row.id)).toEqual(['a', 'y'])
    })
})
