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
    /**
     * Un'esenzione del SISTEMA, non un permesso: nessuno la concede
     * all'installazione, va chiesta, e il produttore può ritirarla da solo.
     *
     * Esiste perché una sola riga la richiedeva e la stava descrivendo come
     * `install` — cioè «concessa, non toglibile» — mentre era il contrario, ed
     * era anche la riga da cui dipende tutto ciò che dura più di uno schermo
     * acceso. Una schermata permessi che rassicura sulla voce sbagliata è
     * peggio di una che non c'è.
     */
    | 'exemption'
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
        /**
         * LA riga di questa schermata, e fino al 2026-08-03 diceva il falso.
         *
         * Era `install`, con il testo «Long tasks keep going when you leave the
         * app. Granted when TALOS was installed … it cannot be turned off from
         * here.» Tutte e tre le affermazioni sono sbagliate, e sono state
         * smentite da una misura: sul OnePlus 13 una Deep Research muore tre
         * volte su tre appena si blocca lo schermo, perché ColorOS congela
         * l'app malgrado il foreground service; con l'esenzione si conclude da
         * sola in 1 min 04 s.
         *
         * Era la forma peggiore possibile di difetto in una schermata permessi:
         * rassicurava proprio sulla voce da cui dipende tutto il lavoro lungo,
         * e quindi nessuno andava a cercarla.
         */
        id: 'background',
        title: 'Running in the background',
        kind: 'exemption',
        purpose: 'Long tasks — a research, a model download — keep going after you leave the app or lock the screen. Without it the phone suspends TALOS within seconds and the work is lost; this is the one setting that decides it.',
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
 * I passi IN PIÙ che chiede questo produttore, quando ce ne sono.
 *
 * L'esenzione dal risparmio energetico è standard Android e si ottiene con un
 * intent. Su alcune interfacce non basta: ColorOS/OxygenOS ha anche l'avvio
 * automatico e le due «ottimizzazioni» che ricongelano l'app, e quelle stanno
 * in menu del produttore **senza intent pubblico**.
 *
 * Qui ci sono istruzioni e non scorciatoie, e la scelta è deliberata: i nomi
 * dei componenti OEM cambiano fra una versione e l'altra, e un collegamento
 * profondo che atterra sulla schermata sbagliata — o che lancia un'eccezione —
 * è peggio di una frase che dice dove andare. Il pulsante che apre ciò che
 * Android garantisce resta; questo è ciò che gli sta accanto.
 *
 * Elencati solo i produttori per cui abbiamo una fonte, non tutti quelli
 * immaginabili: una lista inventata farebbe cercare all'utente voci che sul suo
 * telefono non esistono, che è il modo più veloce per fargli credere di aver
 * sbagliato lui.
 */
export function talosBackgroundExtraSteps(manufacturer: string): readonly string[] {
    const maker = manufacturer.trim().toLowerCase()
    // Stessa interfaccia, tre marchi: OPPO possiede OnePlus e realme, e ColorOS
    // gira su tutti e tre.
    if (maker === 'oneplus' || maker === 'oppo' || maker === 'realme') {
        // CHIAVI, non frasi. Visto sul tablet il 2026-08-03: scritte qui, i
        // passi comparivano in inglese dentro un'app in italiano — e sono
        // proprio le istruzioni che qualcuno deve poter seguire alla lettera.
        return Object.freeze([
            'privacyPermissions.makerSteps.colorosAutoLaunch',
            'privacyPermissions.makerSteps.colorosDeepOptimisation',
            'privacyPermissions.makerSteps.colorosLockRecents',
        ])
    }
    return Object.freeze([])
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
