/**
 * What the Doctor says, and in what order.
 *
 * How it is DIVIDED used to live here too, as `TALOS_DOCTOR_SECTIONS`. That
 * list moved into `lib/navigation/viewRegistry` — not because it was wrong, but
 * because it was right and alone: it was the one place in the app that declared
 * a screen's sections once, and every other screen went on declaring theirs
 * three times over. The register is that idea, generalised. The reasoning it
 * carried moved with it.
 *
 * Inside each segment the sections collapse, and they start CLOSED. NN/g
 * document the opposite as a real failure: WebMD expanded the first accordion
 * by default and users concluded the page was only about that, and left. What
 * is open should be what is actionable, never what happens to be first.
 */
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
 * I-09. The lock has its own health, separate from storage.
 *
 * `recovery_required` means the re-lock could not clear the plugin's stored
 * passphrase, so the next launch would open the database without asking for
 * the PIN. Everything else on this screen would look fine — the interface is
 * locked, storage may even be ready — which is exactly why this row exists.
 *
 * The underlying error can carry a database path, so it is classified rather
 * than echoed.
 */
export function talosLockDoctorRow(
    state: 'unlocked' | 'locked' | 'recovery_required',
    failure: string | null,
): TalosDoctorRow {
    return {
        id: 'lock',
        label: 'Database lock',
        value: state === 'recovery_required'
            ? `${state} · the stored key was not cleared; lock again to retry`
            : state,
        ok: state !== 'recovery_required' && failure === null,
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
