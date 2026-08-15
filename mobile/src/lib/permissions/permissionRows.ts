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
    /**
     * ⭐ Un ACCESSO SPECIALE: Android lo tiene fuori dai permessi normali, in
     * «Impostazioni → App → Accesso speciale», perché è più potente di quelli.
     * Non si chiede con un dialogo: si concede a mano, una volta, sapendo cosa
     * si sta dando.
     *
     * Esiste perché due delle cose più potenti che TALOS sa fare — leggere le
     * notifiche di tutte le app, ed eseguire comandi sul telefono — non
     * comparivano in questa pagina **affatto**. Una schermata privacy che elenca
     * il microfono e tace sulla shell non è incompleta: è fuorviante.
     */
    | 'special'
    /** Not a permission at all — a capability, or a picker that needs none. */
    | 'none'

export interface TalosPermissionRow {
    id:
        | 'microphone' | 'notifications' | 'appLock' | 'files' | 'background' | 'network'
        | 'notificationAccess' | 'bridge' | 'deviceControl' | 'localModel'
        | 'contacts' | 'camera' | 'calendar' | 'mailCount' | 'location'
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
    /*
     * ⭐⭐ LA RUBRICA — owner 2026-08-13: «tutti i permessi della app necessari
     * vanno collegati nella relativa schermata nelle impostazioni di
     * autorizzazione e permessi, TUTTI».
     *
     * MISURATO lo stesso giorno: il permesso era stato dichiarato nel manifest
     * per il motore degli intent, e questa schermata non lo sapeva. Un permesso
     * che l'app chiede e che la sua pagina dei permessi non nomina è un
     * permesso che la persona scopre da un dialogo a sorpresa.
     */
    {
        id: 'contacts',
        title: 'Contacts',
        kind: 'runtime',
        purpose: 'Sending a message to someone by name. TALOS looks up the name you said and takes the number for that one message — it does not read, copy or send your address book anywhere.',
    },
    /*
     * ⭐⭐⭐ IL CALENDARIO, in lettura — 2026-08-14.
     *
     * Nasce da un difetto misurato: «che impegni ho domani?» e TALOS rispondeva
     * «non hai compiti registrati per domani», avendo guardato le PROPRIE note
     * e attività. Non è «non lo so»: è una risposta sicura e falsa sulla
     * giornata di una persona.
     *
     * ⛔ La riga dice «leggere», e lo dice perché è vero: `WRITE_CALENDAR` non
     * è nel manifest. Scrivere in agenda è un'altra decisione, in un altro
     * momento, con un'altra riga.
     */
    {
        id: 'calendar',
        title: 'Calendar',
        kind: 'runtime',
        purpose: 'Answering "what do I have tomorrow", and putting an appointment in when you ask. Reading and writing are two separate permissions, asked at different moments, and every single appointment TALOS writes is confirmed by you first. Nothing leaves the phone.',
    },
    /*
     * ⭐⭐ IL CONTATORE DI GMAIL — 2026-08-14, e non è un permesso di Android.
     *
     * Lo definisce Gmail (`com.google.android.gm.permission.READ_CONTENT_PROVIDER`)
     * ed è `dangerous`, MISURATO col telefono: `dumpsys package permission …`
     * risponde `prot=dangerous`, e col permesso solo dichiarato nel manifest il
     * provider rispondeva `SecurityException`. Cioè si chiede alla persona, come
     * il calendario — e quindi va elencato qui, dove la persona può ritrovarlo.
     *
     * ⛔ La riga dice «quanti», e lo dice perché è vero: da questa strada il
     * testo di una email non è raggiungibile. Scrivere «legge la posta» sarebbe
     * più spaventoso del vero, e chi legge una schermata di permessi merita la
     * misura esatta di ciò che sta concedendo.
     */
    {
        id: 'mailCount',
        title: 'Unread mail count',
        kind: 'runtime',
        purpose: 'Answering "how much unread mail do I have". TALOS reads Gmail’s own counter on this phone and gets a number, per account — never the sender, the subject or the text of an email, which this route cannot reach at all. Nothing leaves the phone.',
    },
    /*
     * ⛔ C'era da prima e non era elencata: `CAMERA` è dichiarata nel manifest
     * dal selettore di immagini. Trovata dallo stesso censimento.
     */
    /*
     * ⭐⭐ DOVE SEI — 2026-08-15, e la riga nasce da un difetto visto.
     *
     * Owner: «ho chiesto che ristorante mi consigli per cenare stasera e lui mi
     * ha dato una posizione completamente diversa». Il permesso era addirittura
     * RIMOSSO dal manifest: TALOS non poteva sapere dove fosse, e il modello
     * riempiva il vuoto inventando una citta'.
     *
     * ⛔ Il testo dice «nel momento in cui serve» perche' e' vero e verificabile:
     * `device_location` si chiama quando la domanda dipende dal posto, e non c'e'
     * nessun `ACCESS_BACKGROUND_LOCATION` — a app chiusa non si legge niente.
     * Una riga di permessi che promettesse meno di cosi' sarebbe falsa, e una
     * che promettesse di piu' lo sarebbe altrettanto.
     */
    {
        id: 'location',
        title: 'Where you are',
        kind: 'runtime',
        purpose: 'Answering questions about places near you — a restaurant tonight, the closest shop, how long it takes to get somewhere. TALOS reads the location at the moment it needs it, never in the background and never while it is closed, and the coordinates go no further than the answer you asked for.',
    },
    {
        id: 'camera',
        title: 'Camera',
        kind: 'runtime',
        purpose: 'Taking a photo to attach to a chat. The picture goes where you send it and nowhere else; TALOS never opens the camera on its own.',
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
    /*
     * ⛔⭐⭐ LE QUATTRO RIGHE CHE MANCAVANO, e le prime due sono le più potenti
     * che TALOS abbia.
     *
     * Questa pagina era ferma a sei voci scritte quando TALOS sapeva dettare e
     * scaricare modelli. Da allora ha imparato a leggere le notifiche di ogni
     * app, ad accendere la torcia, a cambiare il volume, e a **eseguire comandi
     * sul telefono con i privilegi della shell**.
     *
     * Nessuna di queste era qui. Una schermata privacy che elenca il microfono
     * e tace sulla shell non è incompleta: è **fuorviante**, perché chi la legge
     * conclude di aver visto tutto.
     *
     * ⇒ Le descrizioni dicono il CONFINE, non solo la funzione — è quello che
     * una persona attenta alla privacy sta davvero chiedendo — e dicono anche
     * cosa TALOS **non** può fare, perché è l'unica parte verificabile.
     */
    {
        id: 'notificationAccess',
        title: 'Reading your notifications',
        kind: 'special',
        purpose: 'Telling you what arrived and replying for you. TALOS sees the notifications of every app on this phone, including their text — this is the widest window it has into your device, and it stays closed until you open it by hand in system settings.',
    },
    {
        id: 'bridge',
        title: 'Running commands on this phone',
        kind: 'special',
        purpose: 'Doing things Android does not offer apps: listing what is installed, changing system settings, reaching parts of the phone no app can. It runs with the same powers as a computer plugged in over USB. Nothing works until you pair it once with a six-digit code you read on your own screen, and every command still passes your permission gate.',
    },
    {
        id: 'deviceControl',
        title: 'Controlling the phone',
        kind: 'none',
        purpose: 'Torch, volume, alarms, wallpaper, opening an app or a settings screen. None of these needs a permission — Android lets any app do them — so the only thing standing between a request and the action is the permission gate you control in Tools.',
    },
    {
        id: 'localModel',
        title: 'Models that run here',
        kind: 'none',
        purpose: 'A model downloaded onto this phone answers without the network. What you write to it never leaves the device — not to us, not to anyone — and it keeps working with the phone in flight mode.',
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
 * Chi ha fatto il telefono, nei due campi pubblici che Android espone.
 *
 * `manufacturer` e' chi fabbrica, `brand` e' quello che il cliente legge sulla
 * scocca: un POCO espone `Xiaomi` e `POCO`. Servono entrambi perche' un
 * firmware particolare puo' mettere il nome utile in uno solo dei due.
 *
 * **Non** c'e' la versione della ROM, ed e' una decisione: `ro.miui.*`,
 * `ro.build.version.emui` e simili sono interfacce non-SDK, ristrette da
 * Android 9, che possono sparire senza preavviso. La famiglia OEM basta a
 * scegliere le istruzioni.
 */
export interface TalosMakerIdentity {
    readonly manufacturer?: string | null
    readonly brand?: string | null
}

export type TalosMakerFamily =
    | 'coloros' | 'xiaomi' | 'samsung' | 'huawei' | 'honor' | 'vivo'
    | 'stockish' | 'unknown'

function makerToken(value?: string | null): string {
    return (value ?? '').trim().toLocaleLowerCase('en-US').replace(/[^a-z0-9]+/g, '')
}

/**
 * La famiglia, per token normalizzati e mai per `includes()`.
 *
 * Un confronto per sottostringa su marchi corti produce falsi positivi — e un
 * falso positivo qui non e' un errore visibile: e' una lista di istruzioni che
 * manda qualcuno a cercare voci che sul suo telefono non esistono, e lo fa
 * sentire in torto.
 */
export function talosResolveMakerFamily(identity: TalosMakerIdentity): TalosMakerFamily {
    const tokens = new Set([makerToken(identity.manufacturer), makerToken(identity.brand)])
    const any = (...names: string[]) => names.some((name) => tokens.has(name))

    if (any('xiaomi', 'redmi', 'poco')) return 'xiaomi'
    if (any('samsung')) return 'samsung'
    if (any('huawei')) return 'huawei'
    // Honor tiene chiavi sue: la grammatica e' quella di Huawei, ma il primo
    // livello e' «App» dove Huawei mostra «App e servizi». Una frase condivisa
    // manderebbe meta' degli utenti a cercare una voce che non c'e'.
    if (any('honor')) return 'honor'
    if (any('vivo', 'iqoo')) return 'vivo'
    if (any('oneplus', 'oppo', 'realme')) return 'coloros'
    if (any('motorola', 'nothing', 'asus', 'sony')) return 'stockish'
    return 'unknown'
}

const MAKER_STEPS: Readonly<Record<string, readonly string[]>> = Object.freeze({
    coloros: Object.freeze([
        'privacyPermissions.makerSteps.colorosAutoLaunch',
        'privacyPermissions.makerSteps.colorosDeepOptimisation',
        'privacyPermissions.makerSteps.colorosLockRecents',
    ]),
    xiaomi: Object.freeze([
        'privacyPermissions.makerSteps.xiaomiAutostart',
        'privacyPermissions.makerSteps.xiaomiUnrestricted',
        'privacyPermissions.makerSteps.xiaomiLockRecents',
    ]),
    samsung: Object.freeze([
        'privacyPermissions.makerSteps.samsungNeverSleeping',
    ]),
    huawei: Object.freeze([
        'privacyPermissions.makerSteps.huaweiAppLaunch',
        'privacyPermissions.makerSteps.huaweiManualLaunch',
        'privacyPermissions.makerSteps.huaweiLockRecents',
    ]),
    honor: Object.freeze([
        'privacyPermissions.makerSteps.honorAppLaunch',
        'privacyPermissions.makerSteps.honorManualLaunch',
        'privacyPermissions.makerSteps.honorLockRecents',
    ]),
})

/**
 * I passi IN PIU' che chiede questo produttore, quando ce ne sono.
 *
 * Chiavi i18n, mai frasi: scritte a mano nel modulo comparivano in inglese
 * dentro un'app in italiano, e sono proprio le istruzioni che qualcuno deve
 * poter seguire alla lettera.
 *
 * ## Chi c'e' e chi no, e perche'
 *
 * Dentro solo cio' che ha documentazione ufficiale localizzata e concordanza
 * fra piu' fonti: Xiaomi/Redmi/POCO, Samsung, Huawei, Honor — piu' ColorOS, che
 * c'era gia'.
 *
 * **vivo/iQOO resta FUORI**, pur avendo fonti concordanti: manca una guida
 * ufficiale vivo corrente, le voci cambiano fra Funtouch OS e OriginOS, e il
 * testo non e' stato provato alla lettera su un dispositivo. La regola e' che
 * un percorso sbagliato e' peggio di nessun percorso — chi non trova la voce
 * crede di aver sbagliato lui. Il testo candidato e' nel dossier, pronto ad
 * entrare appena qualcuno lo verifica su hardware.
 *
 * **Motorola, Nothing, ASUS e Sony restano vuoti**: usano i controlli Android
 * standard, che TALOS gia' copre. Riempire la pagina con istruzioni generiche
 * la farebbe scorrere via anche a chi ne ha bisogno.
 */
export function talosBackgroundExtraSteps(identity: TalosMakerIdentity): readonly string[] {
    return MAKER_STEPS[talosResolveMakerFamily(identity)] ?? Object.freeze([])
}

/**
 * Rows this device can actually honour.
 *
 * Hidden, never greyed: every surveyed app removes what does not apply, because
 * a greyed row invites a tap that can never work and reads as something broken.
 */
export function visibleTalosPermissionRows(
    device: {
        notifications: boolean
        biometricHardware: boolean
        /**
         * ⛔ Il ponte si mostra SOLO dove può funzionare.
         *
         * `exportKeyingMaterial` è API pubblica da Android 12: sotto, la parte
         * dell'accoppiamento non esiste. Una riga che promette una cosa
         * impossibile su questo telefono è peggio di una riga assente — manda
         * qualcuno a cercare un interruttore che non troverà, e a credere di
         * aver sbagliato lui.
         */
        bridgeSupported?: boolean
    },
): TalosPermissionRow[] {
    return TALOS_PERMISSION_ROWS.filter((row) => {
        if (row.id === 'notifications') return device.notifications
        if (row.id === 'appLock') return device.biometricHardware
        if (row.id === 'bridge') return device.bridgeSupported !== false
        return true
    })
}
