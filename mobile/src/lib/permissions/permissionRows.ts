/**
 * Everything TALOS can ask the device for, why, and where it stands.
 *
 * Owner 2026-07-26: "una schermata autorizzazione nelle impostazioni con tutte
 * le autorizzazioni che l'App richiede".
 *
 * The research settled most of this by saying what NOT to build. Android's own
 * settings guidance is "avoid replicating preferences available at the device
 * settings level", and of twelve open-source apps surveyed not one ships a
 * management clone of the OS permission page — the OS is always the final word,
 * and a second set of switches that pretend otherwise is a lie waiting to
 * happen. So this is TRANSPARENCY and diagnosis: what can be asked for, what it
 * buys, what the state is right now, and — only when the user taps it — a way
 * to reach the setting that governs it.
 *
 * The rows are grouped by PURPOSE, never by `Manifest.permission`. Every app
 * that renders permissions does it this way, because "RECORD_AUDIO" is not a
 * thing anyone wants; dictation is.
 */
export type TalosPermissionState =
    | 'granted'
    /** Never asked: the system dialog will appear. */
    | 'prompt'
    /** Denied once: the dialog will still appear, with a rationale first. */
    | 'prompt-with-rationale'
    /** Permanently denied: the dialog will NEVER appear again. */
    | 'denied'

export type TalosPermissionKind =
    /** Asked at the moment of use; the user can say no. */
    | 'runtime'
    /** Granted at install. Android never asks, and neither can we. */
    | 'install'
    /** Not a permission at all — a capability, or a picker that needs none. */
    | 'none'

export interface TalosPermissionRow {
    id: 'microphone' | 'notifications' | 'appLock' | 'files' | 'background' | 'network'
    title: string
    kind: TalosPermissionKind
    /**
     * One or two sentences: the feature it powers, what TALOS does with the
     * data INCLUDING the boundary, and what is lost without it when that is not
     * obvious. Never "required for full functionality" — Android's own guidance
     * calls a generic message a defect, and the boundary is the thing a
     * privacy-minded reader is actually asking about.
     */
    purpose: string
}

export const TALOS_PERMISSION_ROWS: readonly TalosPermissionRow[] = [
    {
        id: 'microphone',
        title: 'Microphone',
        kind: 'runtime',
        purpose: 'Dictation. Your voice becomes text on this device, and the audio is never stored or sent anywhere.',
    },
    {
        id: 'notifications',
        title: 'Notifications',
        kind: 'runtime',
        // Factually load-bearing: the foreground service runs either way, so
        // claiming long tasks need this would be false.
        purpose: 'Progress for long tasks. Without it those tasks still run — you just will not see how far along they are.',
    },
    {
        id: 'appLock',
        title: 'App lock',
        kind: 'none',
        purpose: 'Unlocking TALOS with your fingerprint or face. The key stays in the device’s secure hardware and never reaches TALOS itself.',
    },
    {
        id: 'files',
        title: 'Files you choose',
        kind: 'none',
        purpose: 'Attaching documents. TALOS can only open the files you pick in the system chooser; it has no access to the rest of your storage.',
    },
    {
        id: 'background',
        title: 'Running in the background',
        kind: 'install',
        purpose: 'Long tasks keep going when you leave the app. Granted when TALOS was installed — Android does not ask for this one, and it cannot be turned off from here.',
    },
    {
        id: 'network',
        title: 'Network access',
        kind: 'install',
        purpose: 'Reaching the AI provider you configured. Nothing is sent anywhere else, and nothing leaves the device until you send a message.',
    },
]

/**
 * The state, in the words the system itself uses.
 *
 * "Blocked by Android" rather than "Denied" is taken from Firefox: the user did
 * this in system settings, and naming the actor tells them where to undo it.
 * "Denied" reads as TALOS refusing them something.
 */
export function talosPermissionLabel(state: TalosPermissionState): string {
    switch (state) {
        case 'granted': return 'Allowed'
        case 'prompt': return 'Not requested'
        case 'prompt-with-rationale': return 'Not allowed'
        case 'denied': return 'Blocked by Android'
    }
}

/**
 * What the button on the row should do — and it turns on exactly one condition.
 *
 * Past a permanent denial the system dialog never appears again, so a button
 * that "asks" would do nothing at all, silently. That is the single worst
 * outcome on this screen, and the reason the five states exist.
 */
export function talosPermissionAction(state: TalosPermissionState): 'request' | 'settings' | 'none' {
    if (state === 'granted') return 'none'
    return state === 'denied' ? 'settings' : 'request'
}

/**
 * Rows this device can actually honour.
 *
 * Hidden, never greyed: every surveyed app removes what does not apply, because
 * a greyed row invites a tap that can never work and reads as something broken.
 */
export function visibleTalosPermissionRows(
    device: { notifications: boolean; biometricHardware: boolean },
): TalosPermissionRow[] {
    return TALOS_PERMISSION_ROWS.filter((row) => {
        if (row.id === 'notifications') return device.notifications
        if (row.id === 'appLock') return device.biometricHardware
        return true
    })
}
