/**
 * ⭐⭐⭐ I PRESET PER CHIAMARE TALOS — e la riga che li rende diversi da un elenco.
 *
 * Owner 2026-08-14: «bisogna mettere dei preset per mappare l'assistente a hold
 * pulsante Power (menu accensione si sposta a Power più volume su o giù),
 * gesture angolo sinistro o destro, o altri tasti di sistema».
 *
 * ## ⛔ Ciò che questo file difende
 *
 * **Che il terzo preset NON dipenda dal ruolo di assistente.** Power e gesto
 * chiamano l'assistente predefinito, e su una ROM che non lascia sceglierne
 * nessuno — misurato sul telefono dell'owner l'11 agosto, ColorOS cinese: la
 * pagina «App assistente digitale» elencava **solo «Nessuno»** — quei due non si
 * possono avere in nessun modo. La scorciatoia di accessibilità punta al nostro
 * servizio e funziona lo stesso: è l'unica via che sopravvive a quel telefono, e
 * se un domani qualcuno la legasse al ruolo «per coerenza» la perderemmo senza
 * accorgercene.
 *
 * **Che nessuno stato dica «non si può».** Tre stati, tre mosse: `pronto`,
 * `manca-ruolo` (→ la pagina degli assistenti), `da-mettere` (→ l'accessibilità).
 *
 * **Che la schermata sia quella MISURATA.** `ACCESSIBILITY_SHORTCUT_SETTINGS`
 * risolve e si apre — e il 2026-08-14 sul Pad si è aperta **vuota**: vuole
 * argomenti che a un'app non è dato passare. Una porta che si apre sul nero è
 * peggio di una che non c'è.
 */
import { describe, expect, it } from 'vitest'
import {
    talosPannelloDeiModiAperto,
    talosPreset,
    type TalosStatoScorciatoie,
} from '@/lib/device/scorciatoie'
import { TALOS_IT_MESSAGES } from '@/i18n/locales/it'
import { TALOS_EN_MESSAGES } from '@/i18n/locales/en'

const NIENTE: TalosStatoScorciatoie = { volume: false, bottone: false, servizio: '', chiavi: {} }
const COL_VOLUME: TalosStatoScorciatoie = { ...NIENTE, volume: true }

function stato(ruolo: boolean, scorciatoie: TalosStatoScorciatoie) {
    return Object.fromEntries(talosPreset(ruolo, scorciatoie).map((v) => [v.id, v.stato]))
}

describe('i preset per chiamare TALOS', () => {
    it('senza il ruolo, i due gesti di sistema dicono che manca il ruolo', () => {
        expect(stato(false, NIENTE)).toEqual({
            accensione: 'manca-ruolo',
            gesto: 'manca-ruolo',
            home: 'manca-ruolo',
        })
    })

    /*
     * ⛔⛔ IL RUOLO NON BASTA, e questa riga è costata una misura sul telefono
     * dell'owner.
     *
     * Owner 2026-08-15: «le shortcut preset, sia accensione che volume che
     * gesto dagli angoli, non funzionano completamente». Sul OnePlus 13
     * (ColorOS, Android 16) con TALOS **già** assistente predefinito:
     *
     * ```
     *   KEYLOG_PhoneWindowManagerExtImpl: overrideInterceptKeyBeforeQueueing:
     *     KeyEvent { keyCode=KEYCODE_ASSIST, deviceId=-1 }
     *   → nessun onHandleAssist, nessun showSession
     * ```
     *
     * ColorOS intercetta e non consulta il ruolo. ⛔ E NON è colpa nostra:
     * messo Google come assistente, gli stessi gesti fanno lo stesso niente.
     *
     * ⇒ `pronto` su quelle righe era una promessa che il telefono non
     * mantiene, e chi la legge conclude che TALOS è rotto. Il ruolo è
     * necessario, non sufficiente.
     */
    it('⛔ col ruolo NON sono «pronti»: sono «da provare», perché decide il telefono', () => {
        const attuale = stato(true, NIENTE)
        expect(attuale.accensione).toBe('dipende')
        expect(attuale.gesto).toBe('dipende')
    })

    /**
     * ⛔⛔ IL PULSANTE CHE GALLEGGIA NON SI OFFRE PIU' — owner 2026-08-15:
     * «rimuovi definitivamente il pulsante flottante e il pallino di TALOS»,
     * «assicurati che siano obliterati per sempre».
     *
     * Qui c'erano due test che pretendevano una riga sua nell'elenco dei modi.
     * La riga non c'e' piu'. Ma il DATO si continua a leggere, ed e' voluto: se
     * la persona ha gia' puntato la scorciatoia di sistema sul pulsante, TALOS
     * deve saperlo — dirle «da mettere» su una cosa che ha gia' fatto e' il
     * difetto che questi test erano nati per impedire.
     *
     * ⇒ Il cancello che tiene ferma la rimozione sta in
     * `tests/unit/build/nientePallinoNienteBottone.test.ts`.
     */
    it("⛔ il pulsante non è più fra i modi offerti, ma il telefono si legge lo stesso", () => {
        const ids = talosPreset(true, { ...NIENTE, bottone: true }).map((v) => v.id)
        expect(ids).not.toContain('bottone')

        // ⛔ E la lettura non e' sparita insieme all'offerta: il campo c'e' e
        // porta il valore vero, cosi' chi lo usera' domani non ricomincia.
        const letto: TalosStatoScorciatoie = { ...NIENTE, bottone: true }
        expect(letto.bottone).toBe(true)
    })

    it('⛔⛔ i tasti del volume NON dipendono dal ruolo: è tutto il loro senso', () => {
        /*
         * Su ColorOS cinese la pagina degli assistenti elenca solo «Nessuno»:
         * il ruolo lì non si può avere. Se questo preset lo pretendesse,
         * l'unica via rimasta su quel telefono risulterebbe spenta.
         */
        expect(stato(false, COL_VOLUME).volume).toBeUndefined()
        expect(stato(true, COL_VOLUME).volume).toBeUndefined()
    })

    it('⛔ il ruolo NON accende la scorciatoia, e la scorciatoia non dà il ruolo', () => {
        // Il verso contrario: avere il ruolo non mette TALOS nella scorciatoia.
        expect(stato(true, NIENTE).volume).toBeUndefined()
        expect(stato(false, COL_VOLUME).accensione).toBe('manca-ruolo')
    })

    it('⛔ ogni preset porta a una schermata MISURATA, mai a quella vuota', () => {
        for (const voce of talosPreset(false, NIENTE)) {
            expect(voce.schermata, `il preset ${voce.id} deve portare da qualche parte`).toMatch(/^android\.settings\./)
            // Si apre e non mostra niente: misurato sul Pad il 2026-08-14.
            expect(voce.schermata).not.toBe('android.settings.ACCESSIBILITY_SHORTCUT_SETTINGS')
        }
        const perId = Object.fromEntries(talosPreset(false, NIENTE).map((v) => [v.id, v.schermata]))
        expect(perId.accensione).toBe('android.settings.VOICE_INPUT_SETTINGS')
        expect(perId.volume).toBeUndefined()
    })

    it('⛔ la scheda AVVISA che la prima volta il telefono chiede conferma', () => {
        /*
         * MISURATO sul Pad il 2026-08-14: alla prima tenuta dei due tasti
         * Android mostra la SUA finestra — «Vuoi attivare la scorciatoia per
         * TALOS — controllo del telefono?». Chi non se l'aspetta legge un
         * intoppo dove c'è una domanda, e conclude che non funziona.
         *
         * ⛔ E succede una volta sola: dopo «Attiva», la seconda tenuta ha
         * aperto la barra in ascolto (`mCurrentFocus=TalosBarraActivity`).
         */
        expect(TALOS_IT_MESSAGES.privilege.preset.volume.body).toContain('chiede conferma')
        expect(TALOS_EN_MESSAGES.privilege.preset.volume.body).toContain('asks you to confirm')
    })

    it('sono QUATTRO, e restano quattro righe distinte', () => {
        /*
         * ⛔ Accensione e gesto condividono la condizione ma non si fondono:
         * sono due gesti che una persona compie in due momenti diversi, e su
         * certe ROM uno funziona e l'altro no. Una riga sola renderebbe
         * impossibile dire QUALE non va.
         *
         * ⛔ E l'ORDINE conta: prima i tre che dipendono dal telefono, poi
         * quello che dipende solo da noi. Chi scopre che il tasto di accensione
         * non risponde deve trovare l'alternativa nella riga SUCCESSIVA, non
         * doverla cercare.
         *
         * ⛔ Erano cinque fino al 2026-08-15: il pulsante che galleggia e'
         * stato rimosso su richiesta dell'owner. Il modo che resta a chi ha una
         * ROM che intercetta tutto e' la scorciatoia del volume — e «hey
         * TALOS», che da quel giorno apre la barra 10 volte su 10.
         *
         * ⛔ E il tasto Home è una riga SUA, non un inciso dentro «gesto»:
         * owner 2026-08-15, «ho dimenticato di aggiungere anche il preset
         * pressione prolungata sul tasto home». Chi naviga a tre tasti non ha
         * nemmeno l'angolo da cui strisciare — e un inciso non si può marcare
         * «provato».
         */
        const ids = talosPreset(true, COL_VOLUME).map((v) => v.id)
        expect(ids).toEqual(['accensione', 'gesto', 'home'])
    })

    /*
     * ⛔ La riga «da provare» NON deve promettere. Il difetto era la parola
     * «Pronto» su un gesto che il telefono non gira a nessuno.
     */
    it('⛔ «da provare» non è «pronto» in nessuna delle due lingue', () => {
        expect(TALOS_IT_MESSAGES.privilege.presetState.dipende).not.toBe(
            TALOS_IT_MESSAGES.privilege.presetState.pronto,
        )
        expect(TALOS_EN_MESSAGES.privilege.presetState.dipende).not.toBe(
            TALOS_EN_MESSAGES.privilege.presetState.pronto,
        )
        // E il corpo dice a chi resta la decisione, e dove andare se non va.
        expect(TALOS_IT_MESSAGES.privilege.preset.accensione.body).toContain('il telefono a decidere')
        expect(TALOS_IT_MESSAGES.privilege.preset.accensione.body).toContain('tasti del volume')
    })
})

/**
 * ⛔⛔ IL COLLAPSE SI CHIUDE SU UN DETTAGLIO, MAI SU UN GUASTO.
 *
 * Owner 2026-08-15: «stanno diventando tante, voglio che li metti dentro un
 * collapse». Ma un pannello chiuso su una pagina dove NIENTE funziona nasconde
 * esattamente la cosa per cui la persona è arrivata li'.
 */
describe('il pannello dei modi, chiuso ma non muto', () => {
    it('⛔ se non funziona NESSUN modo, si apre da solo', () => {
        expect(talosPannelloDeiModiAperto(null, false)).toBe(true)
    })

    it('se almeno uno funziona, sta chiuso: e un dettaglio, non un guasto', () => {
        expect(talosPannelloDeiModiAperto(null, true)).toBe(false)
    })

    /*
     * ⛔ E la scelta della persona vince in TUTTI E DUE i versi. Un pannello
     * che si riapre da solo dopo che l'hai chiuso e' un pannello che non ti
     * ascolta — ed e' il difetto piu' facile da introdurre «per aiutare».
     */
    it('⛔ la mano della persona vince, anche contro la regola', () => {
        expect(talosPannelloDeiModiAperto(false, false)).toBe(false)
        expect(talosPannelloDeiModiAperto(true, true)).toBe(true)
    })
})
