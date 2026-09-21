// @vitest-environment jsdom

import { describe, expect, it } from 'vitest'
import {
    talosLockDoctorRow,
    talosStorageDoctorRow,
    talosDoctorVerdict,
    splitTalosDoctorRows, talosDoctorFoldLabel,
} from '@/lib/diagnostics/doctorSections'

/**
 * How the Doctor is DIVIDED is now asserted in
 * `tests/unit/navigation/viewRegistry.test.ts`, where the section list went
 * when the register absorbed it. The owner's ask and the three-segment research
 * moved with the tests, and got stricter on the way: they used to check an
 * English label nothing rendered, and now check both shipped catalogues.
 *
 * What stays here is what the Doctor SAYS: the rows, the verdict, the split.
 */

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

describe('the encrypted-storage check', () => {
    it('keeps the healthy engine and state concise', () => {
        expect(talosStorageDoctorRow({
            native: true,
            status: 'ready',
            error: null,
        })).toEqual({
            id: 'storage',
            label: 'Encrypted local storage',
            value: 'SQLCipher native — ready',
            ok: true,
        })
    })

    it('P0 explains a missing native connection without copying the raw plugin error', () => {
        const row = talosStorageDoctorRow({
            native: true,
            status: 'error',
            error: 'Local chat storage is unavailable. Query: No available connection for database talos_mobile',
        })

        expect(row.value).toBe('SQLCipher native — error · connection closed; unlock and retry')
        expect(row.value).not.toContain('talos_mobile')
        expect(row.ok).toBe(false)
    })

    it('P0 distinguishes a locked key and never leaks unrelated native text', () => {
        expect(talosStorageDoctorRow({
            native: true,
            status: 'error',
            error: 'TALOS_DB_KEY_LOCKED: protected secret-value-that-must-not-render',
        }).value).toBe('SQLCipher native — error · unlock required')

        expect(talosStorageDoctorRow({
            native: false,
            status: 'error',
            error: 'unexpected path C:\\private\\owner.db',
        }).value).toBe('sql.js web store — error · retry local storage')
    })

    /**
     * I-09. A re-lock that could not clear the plugin's stored passphrase
     * leaves the database openable without the PIN on the next launch. The
     * app itself looks fine — the screen is locked, storage may even be
     * 'ready' — so nothing else on this screen would ever say otherwise.
     */
    it('P1-DB-LOCK-05 reports a lock that did not fully engage, without echoing the raw error', () => {
        expect(talosLockDoctorRow('locked', null)).toEqual({
            id: 'lock',
            label: 'Database lock',
            value: 'locked',
            ok: true,
        })
        expect(talosLockDoctorRow('unlocked', null).ok).toBe(true)

        const row = talosLockDoctorRow(
            'recovery_required',
            'connection close refused for /data/user/0/ai.talos/databases/talos_mobile.db',
        )
        expect(row.value).toBe('recovery_required · the stored key was not cleared; lock again to retry')
        expect(row.value).not.toContain('/data/user/0')
        expect(row.ok).toBe(false)
    })

    /**
     * CR-CAND-01. Failing closed on a pending migration is only half an
     * answer: a user staring at a blank app needs to know the chats still
     * exist. "retry local storage" reads like a shrug — this row has to say
     * the data is held, or the fix just changes how the loss feels.
     */
    it('P0-DB-MIGRATION-05 says the data is held when a migration is blocking the boot', () => {
        const row = talosStorageDoctorRow({
            native: true,
            status: 'error',
            error: 'TALOS_DB_MIGRATION_PENDING: your data is safe in the migration file but could not be restored (Error: UNIQUE constraint failed on chat_messages).',
        })

        expect(row.value).toBe('SQLCipher native — error · migration held; your data is kept, retry to restore')
        expect(row.value).not.toContain('chat_messages')
        expect(row.ok).toBe(false)
    })
})

describe('l etichetta della piega dice il conto SOLO quando il verdetto non lo porta gia', () => {
    /*
     * ⛔ I DUE VERSI, e il primo e' quello che il difetto occupava.
     *
     * Owner 2026-08-09: «18 controlli superati» compariva due volte a due
     * centimetri di distanza, verdetto sopra e piega sotto. Nessuno provava il
     * caso tutto-verde, che e' proprio quello in cui i due numeri coincidono.
     *
     * E la regola d'oro dello stesso giorno: ogni funzione si prova anche al
     * contrario. Qui il contrario e' «con dei problemi», dove il conto NON e'
     * un doppione ma un'informazione che nessun altro porta.
     */
    it('tutto verde: e una PORTA, non un secondo conteggio', () => {
        expect(talosDoctorFoldLabel({ problems: 0, passing: 18, open: false }))
            .toEqual({ key: 'doctor.showChecks' })
        expect(talosDoctorFoldLabel({ problems: 0, passing: 18, open: true }))
            .toEqual({ key: 'doctor.hideChecks' })
    })

    it('con problemi: il conto SERVE, perche il verdetto dice altro', () => {
        expect(talosDoctorFoldLabel({ problems: 3, passing: 15, open: false }))
            .toEqual({ key: 'doctor.checksPassedMany', count: 15 })
        expect(talosDoctorFoldLabel({ problems: 1, passing: 1, open: true }))
            .toEqual({ key: 'doctor.checksPassedOne', count: 1 })
    })
})
