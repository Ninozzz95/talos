import { createApp, reactive, type Plugin } from 'vue'
import { router } from '@/router'
import { talosModoBarraDa, talosModoBarraDalLancio } from '@/lib/barra/modoBarra'

/**
 * ⭐⭐ L'AVVIO DELLA BARRA — e sta in un file suo per una ragione MISURATA.
 *
 * Questo codice serve a una apertura su cento: quando TALOS viene chiamato da
 * fuori. Messo dentro `main.ts` finiva nel grafo d'avvio, che ha un tetto, e il
 * tetto l'ha sfondato: **601.765 byte contro 600.600**. Cioè ogni persona che
 * apre l'app dall'icona pagava, a ogni avvio, il codice della barra che non
 * sta usando.
 *
 * Da qui in poi lo paga solo chi la barra la apre davvero. `main.ts` chiede
 * questo modulo con un `import()`, cioè un file locale dentro l'APK — e in
 * cambio del suo caricamento si toglie di mezzo tutto il resto: la radice
 * della barra, il suo foglio di stile, le sue icone.
 *
 * ⛔ Il prezzo va detto: un `import()` in più prima di montare, su ogni avvio.
 * Su un asset locale è una lettura da disco, e la si misura in `main.ts` col
 * cronometro che scrive `talos.barra lancio` — se un giorno costasse davvero,
 * si legge invece di sospettarlo.
 */
export async function talosAvviaLaBarra(i18n: Plugin): Promise<boolean> {
    const letto = await talosModoBarraDalLancio()
    if (!letto) return false

    /*
     * ⛔ Lo sfondo va tolto a MANO, e a tutta la catena.
     *
     * `style.css` dipinge `body`, e sotto una finestra dichiarata trasparente
     * un solo anello opaco cancella l'app sottostante — cioè esattamente il
     * difetto che l'owner ha bocciato («posso interagire con lui mentre faccio
     * altre cose»). L'altra metà la fa `TalosBarraActivity`, che rende
     * trasparenti la finestra E la WebView: servono tutte e due.
     */
    document.documentElement.dataset.talosBarra = '1'
    document.documentElement.style.background = 'transparent'
    document.body.style.background = 'transparent'
    const radice = document.getElementById('app')
    if (radice) radice.style.background = 'transparent'

    /*
     * ⛔ Monta una RADICE DIVERSA, non una rotta dell'app.
     *
     * La shell tiene in piedi sidebar, navigazione e stazioni: pagarla per una
     * casella di testo che vive dieci secondi renderebbe lenta ad aprirsi
     * proprio la funzione il cui unico scopo è non farti aspettare. ⛔ Ma la
     * CHAT è la stessa — `useChatController()` è un oggetto condiviso, quindi
     * memoria, cronologia e strumenti sono quelli veri, non una copia.
     */
    /*
     * ⛔⛔ IL CONTESTO ARRIVA IN DUE TEMPI, e il modo deve essere REATTIVO.
     *
     * Misurato in logcat l'11 agosto: il sistema chiama `onShow` (dove apriamo
     * la barra) PRIMA di `onHandleAssist` (dove conta i nodi). Alla prima
     * apertura il numero è zero per forza; quello vero arriva un attimo dopo,
     * con un secondo intent sulla stessa activity — `onNewIntent`, che Capacitor
     * consegna qui come `appUrlOpen`.
     *
     * Se `modo` fosse un oggetto immobile, la spia resterebbe per sempre sul
     * numero sbagliato: era esattamente il difetto a schermo — «non vedo la
     * schermata» con 403 nodi nel log.
     */
    /**
     * ⛔⛔ IL TIMBRO DELL'APERTURA DA CUI SIAMO PARTITI — e si parte da QUELLO,
     * non da `null`.
     *
     * MISURATO il 12 agosto, con un solo gesto dell'assistente:
     *
     *     barra: accendo l'ascolto (chiamata nuova (2))
     *
     * Due, su una apertura sola. Il confronto col timbro c'era già e non poteva
     * scattare: partendo da `null`, la PRIMA consegna di `appUrlOpen` non aveva
     * niente con cui confrontarsi e contava sempre una chiamata in più. Ed è
     * proprio quella la consegna duplicata di Capacitor (issue #971): lo stesso
     * indirizzo con cui l'app è partita, già letto qui sopra in `letto`.
     *
     * ⇒ Si semina con l'apertura del lancio. Da lì in poi il confronto ha
     * qualcosa da confrontare, ed è l'unica riga che rende vero il commento
     * scritto sotto.
     */
    let ultimaApertura: string | null = letto.apertura

    const modo = reactive({
        /*
         * ⭐⭐ IL NUMERO DELLA CHIAMATA, e non è un dettaglio contabile.
         *
         * L'activity della barra è `singleTask`: dalla seconda apertura in poi
         * non si monta niente, arriva solo un indirizzo nuovo. Chi ascolta il
         * MODO non può accorgersi di una chiamata nuova guardando i valori —
         * misurato sul Pad l'11 agosto: riaperta dalla tendina dopo il gesto,
         * `daVoce` andava da `true` a `true`, il watch non scattava, e la barra
         * restava muta. Un contatore invece cambia SEMPRE, ed è la sola cosa
         * che distingue «è cambiato un dato» da «mi hanno chiamato di nuovo».
         */
        chiamata: 1,
        daVoce: letto.daVoce,
        bloccata: letto.bloccata,
        bargeIn: letto.bargeIn,
        contesto: { nodi: letto.contesto.nodi, immagine: letto.contesto.immagine },
    })

    try {
        const { App } = await import('@capacitor/app')
        await App.addListener('appUrlOpen', (evento) => {
            const aggiornato = talosModoBarraDa(evento.url)
            // ⛔ Un indirizzo che non è il nostro non deve poter azzerare il
            // contesto: fallisce chiuso, lasciando l'ultimo numero buono.
            if (!aggiornato) return
            modo.contesto.nodi = aggiornato.contesto.nodi
            modo.contesto.immagine = aggiornato.contesto.immagine
            /*
             * ⛔⛔ E ANCHE `daVoce`, che prima restava quello della PRIMA
             * apertura. Misurato sul Pad l'11 agosto: chiamata la barra col
             * gesto (che ascolta) e poi riaperta dalla tendina, l'orlo diceva
             * `fermo` — e viceversa. Causa: l'activity è `singleTask`, quindi
             * dalla seconda volta in poi non si monta niente di nuovo, arriva
             * solo questo evento. Aggiornare il contesto e non il modo voleva
             * dire che la barra ricordava per sempre COME era stata aperta la
             * prima volta.
             */
            modo.daVoce = aggiornato.daVoce
            modo.bloccata = aggiornato.bloccata
            modo.bargeIn = aggiornato.bargeIn
            /*
             * ⛔⛔ UNA CONSEGNA IN PIÙ NON È UNA CHIAMATA IN PIÙ.
             *
             * Capacitor consegna lo STESSO intent due volte a freddo: una da
             * `getLaunchUrl()` (l'indirizzo con cui siamo partiti, già letto in
             * `letto`) e una qui. Contarle entrambe faceva credere alla barra di
             * essere stata chiamata due volte, e la seconda «chiamata» spegneva
             * l'ascolto appena partito: owner 2026-08-11, «dico "ciao mi senti"
             * e mi stampa solo "mi senti"».
             *
             * Il timbro `apertura` lo mette l'Activity a ogni intent (vedi
             * `TalosBarraActivity.timbraLApertura`): stesso intent, stesso
             * timbro. Così due consegne della stessa apertura aggiornano i dati
             * — che possono essere migliorati, il contesto arriva in ritardo —
             * ma NON contano come una chiamata nuova.
             */
            if (aggiornato.apertura !== null && aggiornato.apertura === ultimaApertura) return
            ultimaApertura = aggiornato.apertura
            modo.chiamata += 1
        })
    } catch {
        // Sul web non c'è nessun intent che possa arrivare dopo: la barra vive
        // con quello che aveva all'apertura, ed è tutto quello che esiste lì.
    }

    const { default: TalosBarraRoot } = await import('@/components/barra/TalosBarraRoot.vue')
    createApp(TalosBarraRoot, { modo }).use(i18n).use(router).mount('#app')
    void suonaIlCampanello()
    return true
}

/**
 * ⭐⭐ IL CAMPANELLO: «adesso puoi disegnarmi».
 *
 * ## ⛔ Il difetto che uccide, misurato sui fotogrammi
 *
 * Owner 2026-08-11, con un video del suo schermo: «un lampeggio nero poco prima
 * che la barra entra… solo all'inizio, deve sparire». Dal 132° al 148°
 * fotogramma — **455 ms** — lo schermo era un rettangolo pieno `#1e1f22`, che
 * non è un colore di sistema: è `--talos-background`, il fondo della NOSTRA
 * app. Alla prima apertura la WebView dipinge la pagina col suo fondo normale,
 * e le righe qui sopra la rendono trasparente solo dopo.
 *
 * ⇒ L'activity tiene fermo il disegno finché non suoniamo. Quando suoniamo, il
 * PRIMO frame è già quello giusto: non c'è nessun fotogramma da nascondere.
 *
 * ⛔ Si suona DOPO il mount e dentro un `requestAnimationFrame`: prima del
 * primo giro di disegno il DOM esiste ma non è ancora stato steso, e un
 * campanello anticipato riaprirebbe la porta proprio sul frame sbagliato.
 *
 * ⛔ E fallisce in SILENZIO: se il plugin non c'è — sul web, o in una build
 * futura senza — l'activity si sblocca da sola col suo tetto. Un errore qui
 * lascerebbe una barra montata e invisibile, che è il difetto peggiore dei due.
 */
async function suonaIlCampanello(): Promise<void> {
    await new Promise<void>((risolvi) => {
        requestAnimationFrame(() => requestAnimationFrame(() => resolveSubito(risolvi)))
    })
    try {
        const { registerPlugin } = await import('@capacitor/core')
        await registerPlugin<{ pronta(): Promise<void> }>('TalosBarra').pronta()
    } catch {
        // Nessun ponte: l'activity si disegna da sola allo scadere del tetto.
    }
}

/** Esiste solo per non annidare una funzione dentro due `requestAnimationFrame`. */
function resolveSubito(risolvi: () => void): void {
    risolvi()
}
