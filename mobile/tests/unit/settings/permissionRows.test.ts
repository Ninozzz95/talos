import { describe, expect, it } from 'vitest'
import {
    TALOS_PERMISSION_ROWS,
    talosPermissionLabel,
    talosPermissionAction,
    visibleTalosPermissionRows,
} from '@/lib/permissions/permissionRows'

/**
 * Owner 2026-07-26: "una schermata autorizzazione nelle impostazioni con tutte
 * le autorizzazioni che l'App richiede".
 *
 * The research (2026-07-27, logged) settled the shape, and most of it is about
 * what NOT to build. Android's own settings guidance says "avoid replicating
 * preferences available at the device settings level", and of twelve open-source
 * apps surveyed, not one ships a management clone of the OS permission page. So
 * this screen is TRANSPARENCY and diagnosis: what TALOS can ask for, why, what
 * the state is right now, and — only when the user taps it — a way to reach the
 * setting that governs it.
 *
 * Five states, not three. Android cannot tell "never asked" from "permanently
 * denied" through `shouldShowRequestPermissionRationale`, but Capacitor's own
 * cache can, and that distinction is the difference between a button that works
 * and a button that silently does nothing.
 */
describe('what the screen may claim', () => {
    it('never lists a permission for a feature that does not exist yet', () => {
        // The composer will one day take photos. Until it does, a row for it is
        // a promise TALOS has not kept — and Play restricts the media
        // permissions to apps whose core purpose IS broad media access.
        const names = TALOS_PERMISSION_ROWS.map((row) => row.id)
        expect(names).not.toContain('camera')
        expect(names).not.toContain('photos')
    })

    it('says plainly which rows are not permissions at all', () => {
        // Files are reached through the system picker, which needs no
        // permission; the foreground service is granted at install. Presenting
        // either as something the user can toggle would be a lie.
        const files = TALOS_PERMISSION_ROWS.find((row) => row.id === 'files')!
        expect(files.kind).toBe('none')
        const background = TALOS_PERMISSION_ROWS.find((row) => row.id === 'background')!
        expect(background.kind).toBe('install')
    })

    it('explains each one in terms of the feature and the boundary', () => {
        for (const row of TALOS_PERMISSION_ROWS) {
            // "Required for full functionality" is exactly the generic wording
            // Android's own guidance forbids.
            expect(row.purpose).not.toMatch(/full functionality|works better|improve your experience/i)
            expect(row.purpose.length).toBeGreaterThan(30)
        }
    })
})

describe('what each state is called', () => {
    it('uses the words the system itself uses', () => {
        expect(talosPermissionLabel('granted')).toBe('Allowed')
        expect(talosPermissionLabel('prompt')).toBe('Not requested')
        expect(talosPermissionLabel('prompt-with-rationale')).toBe('Not allowed')
    })

    it('blames Android for a block Android imposed', () => {
        // Lifted from Firefox: the user did this in system settings, and saying
        // so tells them where to undo it. "Denied" would read as TALOS refusing.
        expect(talosPermissionLabel('denied')).toBe('Blocked by Android')
    })
})

describe('what the button does', () => {
    it('asks, while asking still opens a dialog', () => {
        expect(talosPermissionAction('prompt')).toBe('request')
        expect(talosPermissionAction('prompt-with-rationale')).toBe('request')
    })

    it('sends you to the settings ONLY once asking is futile', () => {
        // Past a permanent denial the system dialog never appears again: a
        // button that "asks" would do nothing at all, silently.
        expect(talosPermissionAction('denied')).toBe('settings')
    })

    it('offers nothing to press when it is already allowed', () => {
        expect(talosPermissionAction('granted')).toBe('none')
    })
})

describe('which rows a given device sees', () => {
    it('hides a row the device cannot honour rather than greying it', () => {
        // Every app surveyed removes inapplicable rows. A greyed row invites a
        // tap that can never work.
        const rows = visibleTalosPermissionRows({ notifications: false, biometricHardware: false })
        expect(rows.map((row) => row.id)).not.toContain('notifications')
        expect(rows.map((row) => row.id)).not.toContain('appLock')
    })

    it('keeps everything that applies', () => {
        const rows = visibleTalosPermissionRows({ notifications: true, biometricHardware: true })
        expect(rows.map((row) => row.id)).toEqual([
            'microphone', 'notifications', 'appLock', 'files', 'background', 'network',
        ])
    })
})
