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
    const modo = reactive({
        daVoce: letto.daVoce,
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
        })
    } catch {
        // Sul web non c'è nessun intent che possa arrivare dopo: la barra vive
        // con quello che aveva all'apertura, ed è tutto quello che esiste lì.
    }

    const { default: TalosBarraRoot } = await import('@/components/barra/TalosBarraRoot.vue')
    createApp(TalosBarraRoot, { modo }).use(i18n).use(router).mount('#app')
    return true
}
