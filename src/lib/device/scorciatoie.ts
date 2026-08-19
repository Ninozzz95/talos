import { registerPlugin } from '@capacitor/core'

/**
 * ⭐⭐⭐ COME SI CHIAMA TALOS — i preset, con lo stato VERO del telefono.
 *
 * Owner 2026-08-14: «bisogna mettere dei preset per mappare l'assistente a hold
 * pulsante Power (menu accensione si sposta a Power più volume su o giù),
 * gesture angolo sinistro o destro, o altri tasti di sistema».
 *
 * ## ⛔ Cosa un'app PUÒ, e cosa non può — e perché la differenza è tutto
 *
 * **Power tenuto premuto e gesto d'angolo non sono nostri.** Chiamano
 * l'assistente predefinito del telefono, e l'unico modo onesto di finirci dentro
 * è **prendere il ruolo**. Un interruttore nostro che promettesse di mappare il
 * tasto di accensione sarebbe un pulsante morto — il difetto che questo progetto
 * insegue da settimane.
 *
 * **La scorciatoia di accessibilità sì.** I due tasti del volume tenuti premuti
 * (e il pulsante che galleggia) possono puntare a un servizio di accessibilità,
 * e TALOS ne ha uno. MISURATO sul Pad il 2026-08-14:
 * `accessibility_shortcut_target_service` è **vuoto** — la casella è libera.
 *
 * ## ⛔ Lo stato si LEGGE, non si ricorda
 *
 * Nessun valore salvato da noi: le due chiavi le scrive il sistema quando la
 * persona sceglie, e le può cambiare in qualunque momento senza passare da qui.
 * Un interruttore che ricordasse la nostra ultima mossa direbbe «acceso» su una
 * scorciatoia tolta la settimana scorsa — la stessa regola dei permessi, che
 * non si mettono mai in cache.
 */
export interface TalosStatoScorciatoie {
    /** TALOS è nella scorciatoia dei due tasti del volume. */
    readonly volume: boolean
    /** TALOS è nel pulsante di accessibilità che galleggia. */
    /**
     * ⛔ LETTO, e da qui in poi MAI OFFERTO — owner 2026-08-15: «rimuovi
     * definitivamente il pulsante flottante… assicurati che sia obliterato per
     * sempre».
     *
     * Il campo resta perche' e' un fatto vero del telefono: la scorciatoia di
     * sistema puo' ancora essere puntata li' dalla persona, e leggerlo serve a
     * NON dire «da mettere» a chi ce l'ha gia'. Ma TALOS non lo propone piu' in
     * nessuna schermata, e il cancello in
     * `tests/unit/build/niente-pallino-niente-bottone.test.ts` lo impedisce.
     */
    readonly bottone: boolean
    /** Il componente del nostro servizio, per la diagnostica. */
    readonly servizio: string
    /**
     * Le chiavi di sistema, GREZZE — `null` compreso.
     *
     * ⛔ `assist_long_press_home_enabled` è di Android; `assistant_screen_type` e
     * `disable_google_asssist_power_wakeup` le definisce ColorOS e possono non
     * esistere. Chi disegna dice «non lo so» invece di tradurre un'assenza in
     * uno spento: sono ROM diverse, non un fatto nostro.
     */
    readonly chiavi: Readonly<Record<string, string | null>>
}

interface PonteScorciatoie {
    scorciatoie(): Promise<TalosStatoScorciatoie>
}

const Ponte = registerPlugin<PonteScorciatoie>('TalosPrivilege')

/**
 * Com'è messa la scorciatoia adesso.
 *
 * ⛔ Fallisce CHIUSO: fuori da Android, o se il ponte non risponde, torna «non
 * c'è». Dire di sì per un errore di lettura manderebbe la persona a tenere
 * premuti due tasti che non fanno niente.
 */
export async function talosLeggiScorciatoie(): Promise<TalosStatoScorciatoie> {
    try {
        const esito = await Ponte.scorciatoie()
        return {
            volume: esito.volume === true,
            bottone: esito.bottone === true,
            servizio: typeof esito.servizio === 'string' ? esito.servizio : '',
            chiavi: esito.chiavi ?? {},
        }
    }
    catch {
        return { volume: false, bottone: false, servizio: '', chiavi: {} }
    }
}

/**
 * Gli stati di un preset, e sono QUATTRO perché portano a quattro cose diverse.
 *
 * - `pronto` — funziona adesso, e lo sappiamo perché la casella la scriviamo noi;
 * - `dipende` — il ruolo c'è, ma **è il telefono a decidere** se quel gesto lo
 *   gira all'assistente. Da provare;
 * - `manca-ruolo` — dipende dal ruolo di assistente, che TALOS non ha;
 * - `da-mettere` — la strada c'è e la casella è libera: la persona ci mette
 *   TALOS con un tocco nella schermata di sistema.
 *
 * ⛔ Nessuno stato dice «non si può»: ognuno porta a una mossa.
 *
 * ## ⛔⛔ Perché `dipende` esiste — MISURATO sul OnePlus 13 il 2026-08-15
 *
 * Owner: «le shortcut preset, sia accensione che volume che gesto dagli angoli,
 * non funzionano completamente». Sul suo OnePlus 13 (ColorOS, Android 16), con
 * TALOS **già** assistente predefinito e con testo-schermo e screenshot
 * concessi:
 *
 * ```
 *   KEYLOG_PhoneWindowManagerExtImpl: overrideInterceptKeyBeforeQueueing:
 *     KeyEvent { keyCode=KEYCODE_ASSIST, deviceId=-1 }
 *   → nessun onHandleAssist, nessun showSession: TALOS non riceve NIENTE
 * ```
 *
 * ColorOS intercetta la chiamata e **non consulta il ruolo Android**. Non è un
 * difetto nostro: rimesso il ruolo a Google, gli stessi gesti fanno
 * esattamente lo stesso.
 *
 * ⇒ Dire `pronto` su quelle due righe era una **promessa che il telefono non
 * mantiene**, e la persona conclude che TALOS è rotto. Il ruolo è una
 * condizione NECESSARIA, non sufficiente, e la riga adesso lo dice.
 */
export type TalosStatoPreset = 'pronto' | 'dipende' | 'manca-ruolo' | 'da-mettere'

export interface TalosPreset {
    readonly id: 'accensione' | 'gesto' | 'home' | 'volume'
    readonly stato: TalosStatoPreset
    /**
     * La schermata di sistema che porta a compierlo — misurata sul Pad, non
     * dedotta:
     * - `android.settings.VOICE_INPUT_SETTINGS` → `Settings$ManageAssistActivity`
     * - `android.settings.ACCESSIBILITY_SETTINGS` → `Settings$AccessibilitySettingsActivity`
     *
     * ⛔ NON `android.settings.ACCESSIBILITY_SHORTCUT_SETTINGS`: quella
     * risolve, si apre, e MISURATO il 2026-08-14 è **una pagina vuota** — vuole
     * argomenti che a un'app non è dato passare. Una porta che si apre sul nero
     * è peggio di una porta che non c'è.
     */
    readonly schermata: string
}

/**
 * ⛔⛔ QUANDO IL PANNELLO DEI MODI SI APRE DA SOLO.
 *
 * Owner 2026-08-15: «stanno diventando tante, voglio che li metti dentro un
 * collapse». Giusto: sono cinque modi più il ruolo, e sei paragrafi aperti sono
 * un muro anche quando ognuno è breve.
 *
 * ⛔ Ma un pannello si chiude su un DETTAGLIO, non su un guasto. Se non
 * funziona **nessun** modo di chiamare TALOS, quella non è una sezione da
 * ripiegare: è la ragione per cui la persona è arrivata su questa pagina, e
 * trovarla chiusa vuol dire cercarla. ⇒ Chiuso quando almeno uno funziona,
 * aperto quando nessuno.
 *
 * ⛔ E la scelta della persona VINCE sempre, in tutti e due i versi: `toccato`
 * a `null` vuol dire «non l'ha ancora deciso lei». Un pannello che si riapre da
 * solo dopo che l'hai chiuso è un pannello che non ti ascolta.
 *
 * Sta qui e non nella schermata perché è una REGOLA, e le regole si provano
 * senza montare una pagina.
 */
export function talosPannelloDeiModiAperto(
    toccato: boolean | null,
    qualcunoFunziona: boolean,
): boolean {
    return toccato ?? !qualcunoFunziona
}

/**
 * I preset, calcolati dai fatti — mai da un valore salvato.
 *
 * ⛔ `accensione` e `gesto` sono DUE righe e non una, anche se dipendono dallo
 * stesso ruolo: sono due gesti diversi che una persona compie in due momenti
 * diversi, e su alcune ROM uno funziona e l'altro no. Fonderle in «i gesti di
 * sistema» renderebbe impossibile dire QUALE non va.
 */
export function talosPreset(
    ruoloTenuto: boolean,
    scorciatoie: TalosStatoScorciatoie,
): readonly TalosPreset[] {
    return [
        /*
         * ⛔ `dipende`, non `pronto`: il ruolo è NECESSARIO, non sufficiente.
         * Misurato sul OnePlus 13 — vedi `TalosStatoPreset`.
         */
        {
            id: 'accensione',
            stato: ruoloTenuto ? 'dipende' : 'manca-ruolo',
            schermata: 'android.settings.VOICE_INPUT_SETTINGS',
        },
        {
            id: 'gesto',
            stato: ruoloTenuto ? 'dipende' : 'manca-ruolo',
            schermata: 'android.settings.VOICE_INPUT_SETTINGS',
        },
        /*
         * ⛔ IL TASTO HOME È UNA RIGA SUA — owner 2026-08-15: «ho dimenticato di
         * aggiungere anche il preset pressione prolungata sul tasto home».
         *
         * Stava dentro il corpo di `gesto` come inciso («o il tasto Home tenuto
         * premuto, se usi i tre tasti»), ed era la stessa fusione che questo
         * file vieta due righe più su: **sono due gesti che una persona compie
         * in due momenti diversi**, e chi usa i tre tasti non ha nemmeno
         * l'angolo da cui strisciare. Un inciso non si può marcare «provato».
         */
        {
            id: 'home',
            stato: ruoloTenuto ? 'dipende' : 'manca-ruolo',
            schermata: 'android.settings.VOICE_INPUT_SETTINGS',
        },
        {
            /*
             * ⛔ L'unico che NON dipende dal ruolo: la scorciatoia di
             * accessibilità punta al nostro servizio, non all'assistente
             * predefinito. Vale anche su una ROM che di assistenti non ne
             * offre nessuno — ed è il motivo per cui questo preset esiste.
             */
            id: 'volume',
            stato: scorciatoie.volume ? 'pronto' : 'da-mettere',
            schermata: 'android.settings.ACCESSIBILITY_SETTINGS',
        },
    ].filter((preset) => preset.id !== 'volume') as TalosPreset[]
}
