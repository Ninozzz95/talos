/**
 * How the Doctor is divided, and what it says first.
 *
 * Owner 2026-07-26: "non voglio che sia troppo affollata … fai in modo che ci
 * siano dei settaggi e delle tab. Insomma strutturalo in modo coerente."
 *
 * The research settled the shape. THREE fixed segments and no more: Apple caps
 * segments at about five on a phone, and NN/g find that once a tab row scrolls
 * "the hidden tabs become less discoverable" — an overflow carousel in a
 * diagnostics screen hides exactly the thing someone came to find. Three also
 * leaves every target well above 48dp on a 360dp screen.
 *
 * Inside each segment the sections collapse, and they start CLOSED. NN/g
 * document the opposite as a real failure: WebMD expanded the first accordion
 * by default and users concluded the page was only about that, and left. What
 * is open should be what is actionable, never what happens to be first.
 */
export interface TalosDoctorSection {
    id: 'status' | 'data' | 'advanced'
    label: string
    /** One line on what the segment holds. Not rendered: labels must carry it. */
    hint: string
}

export const TALOS_DOCTOR_SECTIONS: readonly TalosDoctorSection[] = [
    { id: 'status', label: 'Status', hint: 'Device checks and problems' },
    { id: 'data', label: 'Data', hint: 'Where time and space go' },
    { id: 'advanced', label: 'Advanced', hint: 'Debug switches and build' },
]

export interface TalosDoctorRow {
    id: string
    label: string
    value: string
    ok: boolean
}

export interface TalosStorageDoctorInput {
    native: boolean
    status: 'idle' | 'loading' | 'ready' | 'error'
    error: string | null
}

/**
 * An actionable storage row without reflecting arbitrary native error text.
 *
 * The copied diagnostics report already scrubs secret-shaped values at its
 * boundary, but the Doctor itself is a user surface. Keep known recovery
 * families explicit and every other native/plugin detail out of the UI.
 */
export function talosStorageDoctorRow(input: TalosStorageDoctorInput): TalosDoctorRow {
    const engine = input.native ? 'SQLCipher native' : 'sql.js web store'
    let hint = ''
    if (input.status === 'error') {
        if (/TALOS_DB_MIGRATION_PENDING/i.test(input.error ?? '')) {
            // CR-CAND-01: the boot is refusing to build a database over an
            // unrestored export. Say the chats are held. "retry local storage"
            // reads like a shrug next to an app that has gone blank.
            hint = ' · migration held; your data is kept, retry to restore'
        } else if (/No available connection for database/i.test(input.error ?? '')) {
            hint = ' · connection closed; unlock and retry'
        } else if (/TALOS_(?:CHAT_)?DB_KEY_LOCKED/i.test(input.error ?? '')) {
            hint = ' · unlock required'
        } else {
            hint = ' · retry local storage'
        }
    }
    return {
        id: 'storage',
        label: 'Encrypted local storage',
        value: `${engine} — ${input.status}${hint}`,
        ok: input.status === 'ready',
    }
}

/**
 * The single line that lets a healthy user leave without reading anything.
 *
 * The biggest anti-crowding win in the whole screen: a wall of twelve green
 * rows and a wall of twelve rows with two red ones look identical at a glance,
 * and this says which one you are looking at before you scroll.
 */
export function talosDoctorVerdict(
    rows: readonly TalosDoctorRow[],
): { ok: boolean; message: string } {
    // Before the scan there is nothing to report, and "0 checks passed" reads
    // like a failure.
    if (rows.length === 0) return { ok: true, message: '' }
    const problems = rows.filter((row) => !row.ok).length
    if (problems === 0) {
        return { ok: true, message: `${rows.length} check${rows.length === 1 ? '' : 's'} passed` }
    }
    return { ok: false, message: `${problems} problem${problems === 1 ? '' : 's'} found` }
}

/** Failures stay open; everything that passed folds into one row. */
export function splitTalosDoctorRows(rows: readonly TalosDoctorRow[]): {
    problems: TalosDoctorRow[]
    passing: TalosDoctorRow[]
} {
    return {
        problems: rows.filter((row) => !row.ok),
        passing: rows.filter((row) => row.ok),
    }
}
