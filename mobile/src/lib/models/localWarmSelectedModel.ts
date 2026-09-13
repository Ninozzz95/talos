import { talosLocalEngineLazy } from '@/services/localEngineLazy'

/**
 * P3-1 — raccoglie i segnali ambientali e decide se aprire un modello
 * locale in anticipo, quando `chatController.selectModel` lo chiama su
 * una scelta esplicita.
 *
 * ## Perché vive fuori da `chatController.ts`
 *
 * Non per stile: `scripts/verify-initial-chunk.mjs` misura i byte REALI
 * del chunk d'avvio, e questo file — con i suoi import e i suoi commenti
 * — pesava abbastanza da far sforare il tetto (613.261 contro 613.000,
 * misurato). `chatController.ts` è nel grafo statico (importato sia da
 * `main.ts` sia direttamente da `App.vue` e da ogni schermata), quindi
 * qualunque cosa scritta lì dentro pesa sull'avvio anche se ESEGUE i suoi
 * import in modo pigro — è il testo della funzione stessa a contare, non
 * solo cosa fa quando gira. Spostare il corpo qui, dietro un `import()`
 * dal punto di chiamata, è lo stesso pattern già in uso in questo file
 * per il comando manuale del sondaggio GPU (vedi `localEngineProbeRun.ts`).
 *
 * La DECISIONE resta in `localWarmTrigger.ts` (puro, i suoi test a sé);
 * questa funzione la esegue, non la duplica.
 *
 * ## ⛔⛔⛔ 2026-09-10 — e la esegue DICENDOLO
 *
 * Fino a oggi questa funzione era muta su ogni ramo: il cancello poteva
 * respingere, l'apertura poteva fallire, il ponte poteva mancare, e a
 * schermo non cambiava niente in nessuno dei tre casi. Il 10/09 il modello
 * è risultato freddo due minuti dopo essere stato scelto (32,0 s alla
 * prima parola contro i 351 ms di PocketPal) e **nessuna delle tre
 * spiegazioni era distinguibile dalle altre**, perché tutte producono lo
 * stesso silenzio. Owner, stesso giorno: «PocketPal carica il modello
 * locale appena clicchi per selezionarlo… la dobbiamo fare anche noi anche
 * con uno spinner o background».
 *
 * ### Cosa fa PocketPal, letto nel loro codice (2026-09-10)
 *
 * `a-ghorbani/pocketpal-ai`, `src/store/ModelStore.ts` — `initContext(model)`
 * parte alla scelta e lo stato che l'interfaccia legge sono **due campi
 * soli**: `isContextLoading: boolean` e `loadingModel: Model | undefined`.
 * La percentuale ESISTE nel ponte (`initLlama` accetta
 * `use_progress_callback: true` con una callback `(_progress: number)`) ed
 * è **commentata e inutilizzata**: a schermo mostrano un indicatore
 * indeterminato, non una barra. ⇒ Non stiamo rinunciando a qualcosa che il
 * concorrente ha: stiamo facendo la stessa cosa, e la barra vera resta un
 * debito onesto per entrambi.
 *
 * ### Perché indeterminato anche da noi, e non è pigrizia
 *
 * Perché una barra sarebbe una bugia: il nostro `open()` nativo non emette
 * avanzamento, quindi qualunque percentuale sarebbe inventata. La guida UX
 * corrente (uxtigers.com, *Progress Indicators Ease the Wait*, e Material
 * sui progress indicators) dice che oltre i 10 s serve un indicatore
 * DETERMINATO — ed è giusto, ed è per questo che il debito è registrato con
 * la riga da cambiare: `llama_model_params.progress_callback` esiste in
 * llama.cpp (float 0..1, più `progress_callback_user_data`, verificato il
 * 2026-09-10), e wiring quello si ottiene una barra vera. Sta in JNI, cioè
 * fuori da questa consegna. Finché non c'è, ciò che si può dire con
 * onestà è **che sta caricando, quale modello, e quanto è costato quando
 * ha finito** — mai una percentuale finta.
 *
 * ### E il tempo dell'apertura si dice SEPARATO
 *
 * «Pronto in 31 secondi» non è «31 secondi alla prima parola». Sono due
 * misure diverse — il disco e il motore — e confonderle fa sembrare lento
 * il motore quando è lento il disco. La riga delle metriche della chat
 * misura la seconda; questo avviso misura la prima, e le tiene distinte.
 */

/**
 * ⛔ Sotto questa soglia non si mostra NIENTE.
 *
 * Un modello già in memoria torna in pochi millisecondi, e un avviso che
 * compare e sparisce nello stesso battito è peggio di nessun avviso: è
 * rumore che insegna a ignorare gli avvisi veri. La stessa guida che
 * chiede un indicatore per le attese lunghe dice di non metterne uno per
 * ciò che finisce subito. 400 ms è il punto in cui una persona comincia a
 * chiedersi se ha toccato davvero.
 */
const SOGLIA_AVVISO_MS = 400

/** Sotto questo tempo l'apertura non era un'attesa, e nominarne i secondi è pedanteria. */
const SOGLIA_SECONDI_DETTI_MS = 2_000

/**
 * ⛔⛔ NON RIFIUTA MAI, e non è pignoleria.
 *
 * Il chiamante è `void import(…).then(…)` in `chatController.selectModel`:
 * senza `.catch`, qualunque rifiuto di qui diventa una Promise non gestita —
 * cioè un guasto che non compare da nessuna parte, che è esattamente la
 * malattia che questa consegna sta curando. Il `.catch` non può stare lassù
 * (ogni byte scritto in `chatController.ts` pesa sul grafo d'avvio, e il
 * margine è di 172 byte su 622.500), quindi sta qui — dove per giunta è più
 * giusto: chi sa cos'è andato storto è chi ci stava provando.
 */
export async function talosWarmSelectedLocalModel(path: string): Promise<void> {
    try {
        await apriInAnticipo(path)
    } catch {
        // Un'ottimizzazione non rompe mai la scelta del modello. Il primo
        // messaggio aprirà nel percorso normale, come se questa non esistesse.
    }
}

async function apriInAnticipo(path: string): Promise<void> {
    const [
        { talosMeasureDevice },
        { talosWhyNotWarmLocalModel },
        { talosShortModelLabel },
        { talosSetLocalWarmState },
        { useTalosMobileToasts },
        { talosT },
        motore,
    ] = await Promise.all([
        import('@/services/deviceCapacity'),
        import('@/lib/models/localWarmTrigger'),
        import('@/lib/models/modelLabel'),
        import('@/lib/models/localWarmState'),
        import('@/stores/toasts'),
        import('@/i18n'),
        talosLocalEngineLazy(),
    ])

    // ⛔ Il NOME, mai il percorso: quaranta caratteri di cartelle sotto un
    // avviso sono la stessa riga enorme che l'owner ha già bocciato una volta
    // sotto le risposte (vedi `modelLabel.ts`).
    const modello = talosShortModelLabel(path)
    const toasts = useTalosMobileToasts()

    const device = await talosMeasureDevice()
    const rifiuto = talosWhyNotWarmLocalModel({
        thermal: device?.thermal ?? null,
        availableRamBytes: device?.availableRamBytes ?? null,
        lowMemoryThresholdBytes: device?.lowMemoryThresholdBytes ?? null,
    })
    if (rifiuto) {
        /*
         * ⛔⛔ IL CANCELLO NON SI TOGLIE, SI DICHIARA.
         *
         * Non aprire un modello da un gigabyte e mezzo su un telefono che sta
         * già scottando è una scelta giusta e resta. Quello che era sbagliato
         * è che la persona non poteva saperlo: vedeva solo che il primo
         * messaggio ci metteva mezzo minuto, e non c'era modo di collegare le
         * due cose. La frase dice anche cosa succederà lo stesso — il modello
         * si aprirà al primo messaggio — perché «non caricato» senza «ma
         * funzionerà» si legge come un guasto.
         */
        talosSetLocalWarmState({
            phase: 'skipped',
            model: modello,
            path,
            openMs: null,
            refusal: rifiuto,
            withoutMeasuredProfiles: false,
        })
        toasts.push({
            message: talosT(`models.localWarm.skipped.${rifiuto}`, { model: modello }),
            durationMs: 10_000,
        })
        return
    }

    talosSetLocalWarmState({
        phase: 'opening',
        model: modello,
        path,
        openMs: null,
        refusal: null,
        withoutMeasuredProfiles: false,
    })

    /*
     * L'avviso arriva in ritardo apposta — vedi `SOGLIA_AVVISO_MS`. Il
     * temporizzatore si spegne comunque nel `finally`: un avviso «sto
     * caricando» che sopravvive alla fine del caricamento sarebbe la stessa
     * bugia, al contrario.
     */
    let avviso: number | null = null
    const timer = setTimeout(() => {
        avviso = toasts.push({ message: talosT('models.localWarm.loading', { model: modello }) })
    }, SOGLIA_AVVISO_MS)

    try {
        const esito = await motore.talosWarmLocalModel(path)
        if (esito.opened) {
            talosSetLocalWarmState({
                phase: 'ready',
                model: modello,
                path,
                openMs: esito.ms,
                refusal: null,
                withoutMeasuredProfiles: esito.withoutMeasuredProfiles,
            })
            // ⛔ Solo se qualcuno ha davvero aspettato: annunciare «pronto» a
            // chi non ha visto nessuna attesa è rumore.
            if (avviso !== null) {
                toasts.push({
                    message: esito.ms >= SOGLIA_SECONDI_DETTI_MS
                        ? talosT('models.localWarm.readySlow', {
                            model: modello,
                            seconds: Math.round(esito.ms / 1000),
                        })
                        : talosT('models.localWarm.ready', { model: modello }),
                    durationMs: 6_000,
                })
            }
            return
        }
        if (esito.why === 'already-open') {
            talosSetLocalWarmState({
                phase: 'ready',
                model: modello,
                path,
                openMs: null,
                refusal: null,
                withoutMeasuredProfiles: false,
            })
            return
        }
        /*
         * ⛔ `engine-absent` e `failed` si dicono con la STESSA frase, e non
         * per pigrizia: per chi legge sono lo stesso fatto — «l'anticipo non
         * c'è stato, il modello si aprirà quando scrivi» — e distinguerli a
         * schermo vorrebbe dire nominare il motore, cioè un nome tecnico che
         * non spiega niente a chi lo legge. La distinzione resta nello stato,
         * dove serve a chi ripara.
         */
        talosSetLocalWarmState({
            phase: 'failed',
            model: modello,
            path,
            openMs: null,
            refusal: null,
            withoutMeasuredProfiles: false,
        })
        if (avviso !== null) {
            toasts.push({
                message: talosT('models.localWarm.failed', { model: modello }),
                durationMs: 10_000,
            })
        }
    } finally {
        clearTimeout(timer)
        if (avviso !== null) toasts.dismiss(avviso)
    }
}
