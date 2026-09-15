import { describe, expect, it } from 'vitest'
import {
    TALOS_PERMISSIVE_MODEL_LICENCES,
    talosClassifyModelLicence,
    talosHasDeclaredPermissiveLicence,
    talosModelLicenceId,
} from '@/lib/models/licensePolicy'

describe('TALOS declared model licence policy', () => {
    it('pins the complete and exact positive allowlist', () => {
        expect([...TALOS_PERMISSIVE_MODEL_LICENCES]).toEqual([
            'apache-2.0',
            'mit',
            'bsd',
            'bsd-2-clause',
            'bsd-3-clause',
            'isc',
            'bsl-1.0',
            'cc0-1.0',
            'unlicense',
            'zlib',
        ])
    })

    it('normalises only documented case, whitespace and narrow aliases', () => {
        expect(talosModelLicenceId(['license: MIT '])).toBe('mit')
        expect(talosModelLicenceId(['license:cc0'])).toBe('cc0-1.0')
        expect(talosModelLicenceId(['license:apache2.0'])).toBe('apache-2.0')
    })

    it('lets card metadata override a conflicting tag', () => {
        expect(talosModelLicenceId(['license:apache-2.0'], 'llama3.1')).toBe('llama3.1')
        expect(talosHasDeclaredPermissiveLicence({
            tags: ['license:apache-2.0'],
            licence: 'llama3.1',
        })).toBe(false)
    })

    it.each([
        [null, 'unknown'],
        ['', 'unknown'],
        ['other', 'custom'],
        ['custom', 'custom'],
        ['openrail', 'restricted'],
        ['llama3.1', 'restricted'],
        ['cc-by-4.0', 'restricted'],
        ['gpl-3.0', 'restricted'],
        ['something-unrecognised', 'unknown'],
    ] as const)('classifies %s fail-closed as %s', (licence, expected) => {
        expect(talosClassifyModelLicence(licence)).toBe(expected)
    })

    it('accepts every allowlisted declaration and nothing absent', () => {
        for (const licence of TALOS_PERMISSIVE_MODEL_LICENCES) {
            expect(talosClassifyModelLicence(licence)).toBe('permissive-declared')
            expect(talosHasDeclaredPermissiveLicence({ licence })).toBe(true)
        }
        expect(talosHasDeclaredPermissiveLicence({ tags: [] })).toBe(false)
        expect(talosHasDeclaredPermissiveLicence({ tags: ['license:other'] })).toBe(false)
    })
})
