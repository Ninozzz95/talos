import { describe, expect, it } from 'vitest'
import {
    TALOS_PERMISSION_ROWS,
    talosBackgroundExtraSteps,
    talosResolveMakerFamily,
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
    /*
     * ⭐ «Un giorno» È ARRIVATO — 2026-08-13.
     *
     * Questo test diceva: «The composer will one day take photos. Until it
     * does, a row for it is a promise TALOS has not kept». Quel giorno è
     * passato senza che nessuno tornasse qui: la fotocamera è nel cassetto del
     * compositore (`TalosMobileComposerDrawer.vue`) e nella barra
     * (`barra.attachCamera`), e `CAMERA` è dichiarata nel manifest.
     *
     * ⇒ Da promessa non mantenuta è diventata il difetto opposto: un permesso
     * che l'app chiede davvero e che la sua pagina non nominava. Owner
     * 2026-08-13: «tutti i permessi della app necessari vanno collegati nella
     * relativa schermata, TUTTI».
     *
     * ⛔ `photos` resta fuori, e per la ragione originale: Play riserva i
     * permessi media alle app il cui scopo È l'accesso alla galleria, e il
     * selettore di sistema non ne ha bisogno.
     */
    it('lista la fotocamera perché ORA la funzione esiste, e non i media', () => {
        const names = TALOS_PERMISSION_ROWS.map((row) => row.id)
        expect(names).toContain('camera')
        expect(names).not.toContain('photos')
    })

    it('says plainly which rows are not permissions at all', () => {
        // Files are reached through the system picker, which needs no
        // permission. Presenting that as something the user can toggle would be
        // a lie.
        const files = TALOS_PERMISSION_ROWS.find((row) => row.id === 'files')!
        expect(files.kind).toBe('none')

        /**
         * `background` era qui, e diceva `install`.
         *
         * Questo test codificava la stessa affermazione falsa della schermata —
         * «concessa all'installazione, non toglibile» — e quindi la difendeva
         * invece di sorvegliarla. Il permesso `FOREGROUND_SERVICE` in effetti è
         * concesso all'installazione; solo che **non basta**, ed è l'esenzione
         * dal risparmio energetico a decidere se il lavoro lungo arriva in
         * fondo. Misurato sul OnePlus 13 il 2026-08-03: senza, tre morti su tre.
         *
         * La riga vive adesso nel gruppo qui sotto, come `exemption`.
         */
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
        /*
         * ⭐ Dodici, non dieci — 2026-08-13: `contacts` e `camera`.
         *
         * `contacts` è nuovo (il motore degli intent risolve un nome in un
         * numero); `camera` mancava da prima ed è stata trovata dal censimento
         * chiesto dall'owner: «tutti i permessi della app necessari vanno
         * collegati nella relativa schermata, TUTTI».
         *
         * ⛔ L'ordine È il contenuto: le due nuove stanno dopo le notifiche e
         * prima del blocco app, cioè fra i permessi che Android fa concedere a
         * runtime — non in fondo, dove le voci non sono permessi affatto.
         */
        /*
         * ⭐ Tredici dal 2026-08-14: `calendar`, in LETTURA.
         *
         * Nasce da un difetto misurato: «che impegni ho domani?» e TALOS
         * rispondeva «non hai compiti registrati», avendo guardato le PROPRIE
         * note. Non è «non lo so»: è una risposta sicura e falsa sulla giornata
         * di una persona.
         *
         * ⛔ Sta fra `contacts` e `camera` perché l'ordine è il contenuto: è un
         * permesso di runtime che riguarda **dati della persona**, e va letto
         * accanto agli altri della stessa famiglia. `WRITE_CALENDAR` non c'è, e
         * quando arriverà avrà la sua riga: leggere e scrivere sono due
         * decisioni.
         */
        /*
         * ⭐ Quattordici dal 2026-08-14: `mailCount`, il contatore di Gmail.
         *
         * ⛔ È un permesso `dangerous` che **Android non definisce**: lo
         * definisce Gmail (MISURATO: `dumpsys package permission …` →
         * `prot=dangerous`). Si chiede con lo stesso dialogo e si revoca dalla
         * stessa pagina, quindi sta con gli altri di runtime — e sta dopo
         * `calendar` perché è l'ultimo arrivato della stessa famiglia: dati
         * della persona, letti e basta.
         */
        expect(rows.map((row) => row.id)).toEqual([
            'microphone', 'notifications', 'contacts', 'calendar', 'mailCount', 'location', 'camera',
            'appLock', 'files', 'background', 'network',
            'notificationAccess', 'bridge', 'deviceControl', 'localModel',
        ])
    })

    /**
     * ⛔⭐⭐ LE DUE COSE PIÙ POTENTI CHE TALOS SA FARE NON POSSONO MANCARE DA QUI.
     *
     * Fino al 2026-08-09 questa pagina elencava sei voci scritte quando TALOS
     * sapeva dettare e scaricare modelli. Nel frattempo aveva imparato a leggere
     * le notifiche di **ogni app** e a **eseguire comandi sul telefono coi
     * privilegi della shell** — e nessuna delle due compariva.
     *
     * ⇒ Una schermata privacy che elenca il microfono e tace sulla shell non è
     * incompleta: è **fuorviante**, perché chi la legge conclude di aver visto
     * tutto. Questa prova esiste perché non possa succedere di nuovo in
     * silenzio: chi toglie una di quelle due righe deve passare di qui.
     */
    it('⛔ le due capacità piu POTENTI ci sono, e sono marcate come accesso speciale', () => {
        const rows = visibleTalosPermissionRows({ notifications: true, biometricHardware: true })
        const speciali = rows.filter((row) => row.kind === 'special').map((row) => row.id)

        expect(speciali).toContain('notificationAccess')
        expect(speciali).toContain('bridge')
        /*
         * ⛔ LA FINESTRA SOPRA LE ALTRE APP NON C'E' PIU', ed e' rimasta qui
         * mezza giornata: aggiunta il 2026-08-15 per il pallino del rientro,
         * tolta lo stesso giorno quando l'owner ha chiesto di obliterare
         * pallino e pulsante flottante.
         *
         * ⇒ Il controllo diventa il suo contrario, e per la stessa ragione per
         * cui era nato: questa schermata elenca cio' che l'app puo' fare
         * DAVVERO. Lasciare `overlay` dopo aver tolto le finestre direbbe a chi
         * legge che TALOS puo' stare sopra le altre app — e non puo' piu'.
         * Il cancello sta in `tests/unit/build/nientePallinoNienteBottone.test.ts`.
         */
        expect(speciali).not.toContain('overlay')
    })

    /**
     * ⛔ Il ponte si mostra solo dove può funzionare: `exportKeyingMaterial` è
     * API pubblica da Android 12. Una riga che promette l'impossibile manda
     * qualcuno a cercare un interruttore che non troverà, e a credere di aver
     * sbagliato lui.
     */
    it('⛔ il PONTE sparisce dove non puo funzionare, e il resto resta', () => {
        const rows = visibleTalosPermissionRows({
            notifications: true,
            biometricHardware: true,
            bridgeSupported: false,
        })

        expect(rows.map((row) => row.id)).not.toContain('bridge')
        // E non si porta via le altre: e' una riga sola a sparire.
        expect(rows.map((row) => row.id)).toContain('notificationAccess')
        expect(rows.map((row) => row.id)).toContain('deviceControl')
    })

    /**
     * ⛔ Ogni riga deve dire il CONFINE, non solo la funzione: è quello che una
     * persona attenta alla privacy sta davvero chiedendo. Una descrizione corta
     * è quasi sempre una che dice cosa fa e tace su dove si ferma.
     */
    it('⛔ ogni riga dice anche dove TALOS si ferma', () => {
        for (const row of TALOS_PERMISSION_ROWS) {
            expect(row.purpose.length, `${row.id} troppo corta per dire un confine`)
                .toBeGreaterThan(80)
            expect(row.purpose, `${row.id} usa una formula generica`)
                .not.toMatch(/required for full functionality|necessario per il funzionamento/i)
        }
    })
})

describe('la riga che decide se il lavoro lungo arriva in fondo', () => {
    /**
     * Owner 2026-08-03. La riga diceva: «Long tasks keep going when you leave
     * the app. Granted when TALOS was installed - Android does not ask for this
     * one, and it cannot be turned off from here.» Tutte e tre le affermazioni
     * false, e smentite da una misura: sul OnePlus 13 una Deep Research muore
     * tre volte su tre appena si blocca lo schermo, malgrado il foreground
     * service; con l esenzione si conclude da sola in 1 min 04 s.
     *
     * Era la forma peggiore di difetto in una schermata permessi: rassicurava
     * proprio sulla voce da cui dipende tutto il lavoro lungo, quindi nessuno
     * andava a cercarla.
     */
    it('non e concessa all installazione, e non lo dice piu', () => {
        const row = TALOS_PERMISSION_ROWS.find((entry) => entry.id === 'background')!
        expect(row.kind).toBe('exemption')
        expect(row.kind).not.toBe('install')
        expect(row.purpose).not.toContain('Granted when TALOS was installed')
        expect(row.purpose).not.toContain('cannot be turned off')
    })

    it('riconosce le famiglie per token, mai per sottostringa', () => {
        // Un confronto per sottostringa su marchi corti produce falsi positivi,
        // e qui un falso positivo non e' un errore visibile: e' una lista che
        // manda qualcuno a cercare voci che sul suo telefono non esistono.
        const casi: Array<[{ manufacturer: string, brand: string }, string]> = [
            [{ manufacturer: 'Xiaomi', brand: 'Xiaomi' }, 'xiaomi'],
            [{ manufacturer: 'XIAOMI', brand: 'POCO' }, 'xiaomi'],
            [{ manufacturer: ' Xiaomi ', brand: 'Redmi' }, 'xiaomi'],
            [{ manufacturer: 'samsung', brand: 'Samsung' }, 'samsung'],
            [{ manufacturer: 'HUAWEI', brand: 'HUAWEI' }, 'huawei'],
            [{ manufacturer: 'HONOR', brand: 'HONOR' }, 'honor'],
            [{ manufacturer: 'vivo', brand: 'iQOO' }, 'vivo'],
            [{ manufacturer: 'OnePlus', brand: 'OnePlus' }, 'coloros'],
            [{ manufacturer: 'realme', brand: 'realme' }, 'coloros'],
            [{ manufacturer: 'motorola', brand: 'motorola' }, 'stockish'],
            [{ manufacturer: 'Acme', brand: 'Acme' }, 'unknown'],
        ]
        for (const [identity, atteso] of casi) {
            expect(talosResolveMakerFamily(identity)).toBe(atteso)
        }
    })

    it('usa il MARCHIO quando il produttore non basta', () => {
        // Un POCO espone `MANUFACTURER=Xiaomi` e `BRAND=POCO`. Il marchio serve
        // da rete quando un firmware particolare mette il nome utile in uno
        // solo dei due campi.
        expect(talosResolveMakerFamily({ manufacturer: 'sconosciuto', brand: 'POCO' }))
            .toBe('xiaomi')
        expect(talosResolveMakerFamily({})).toBe('unknown')
    })

    it('da i passi ai produttori che hanno una fonte, e chiavi mai frasi', () => {
        for (const identity of [
            { manufacturer: 'oneplus', brand: 'oneplus' },
            { manufacturer: 'Xiaomi', brand: 'Redmi' },
            { manufacturer: 'samsung', brand: 'samsung' },
            { manufacturer: 'huawei', brand: 'huawei' },
            { manufacturer: 'HONOR', brand: 'HONOR' },
        ]) {
            const passi = talosBackgroundExtraSteps(identity)
            expect(passi.length).toBeGreaterThan(0)
            for (const key of passi) expect(key.startsWith('privacyPermissions.makerSteps.')).toBe(true)
        }
    })

    it('tiene Huawei e Honor SEPARATI', () => {
        // La grammatica e' la stessa, ma il primo livello e' «App» su Honor
        // dove Huawei mostra «App e servizi». Una frase condivisa manderebbe
        // meta' degli utenti a cercare una voce che non c'e'.
        const huawei = talosBackgroundExtraSteps({ manufacturer: 'huawei', brand: 'huawei' })
        const honor = talosBackgroundExtraSteps({ manufacturer: 'honor', brand: 'honor' })
        expect(honor).not.toEqual(huawei)
    })

    it('tace dove non c e verifica, invece di riempire la pagina', () => {
        /**
         * vivo/iQOO ha fonti concordanti ma nessuna guida ufficiale corrente e
         * nessuna prova su hardware: le voci cambiano fra Funtouch OS e
         * OriginOS. Un percorso sbagliato e' peggio di nessun percorso — chi non
         * trova la voce crede di aver sbagliato lui.
         *
         * Motorola, Nothing, ASUS e Sony usano i controlli Android standard,
         * che TALOS gia' copre.
         */
        expect(talosBackgroundExtraSteps({ manufacturer: 'vivo', brand: 'iQOO' })).toEqual([])
        for (const maker of ['motorola', 'nothing', 'asus', 'sony', 'acme']) {
            expect(talosBackgroundExtraSteps({ manufacturer: maker, brand: maker })).toEqual([])
        }
    })

    it('raggruppa Xiaomi, Redmi e POCO sotto gli stessi passi', () => {
        const xiaomi = talosBackgroundExtraSteps({ manufacturer: 'Xiaomi', brand: 'Xiaomi' })
        expect(talosBackgroundExtraSteps({ manufacturer: 'Xiaomi', brand: 'Redmi' })).toEqual(xiaomi)
        expect(talosBackgroundExtraSteps({ manufacturer: 'Xiaomi', brand: 'POCO' })).toEqual(xiaomi)
    })
})
