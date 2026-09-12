/**
 * U-20 — LE MINIATURE DELLA LIBRERIA, dal lato di chi disegna.
 *
 * `services/talosThumbnailStore.ts` sa generare e conservare; qui c'è la sola
 * cosa che riguarda la pagina: **quali file sono a schermo adesso**, **quanto è
 * larga una scheda** e **in che stato è ciascuna anteprima**.
 *
 * ## ⛔ Gli stati sono TRE, e il terzo è quello che si dimentica
 *
 *   `in-caricamento`  la si sta facendo — un posto che si riempirà
 *   `pronta`          eccola
 *   `nessuna`         non se ne può fare una, e non è un guasto
 *
 * Due soli — «c'è» e «non c'è» — costringerebbero la scheda a mostrare il glifo
 * del formato durante l'attesa e poi a sostituirlo con l'immagine: uno
 * sfarfallio su ogni file, a ogni apertura. E soprattutto renderebbero
 * indistinguibili «aspetta un momento» e «questo file un'anteprima non ce l'ha»,
 * che per chi guarda sono due cose diverse: della prima si aspetta la fine,
 * della seconda no.
 *
 * ## ⛔ Perché non riusa `useTalosVaultThumbnails`
 *
 * Quello esiste, funziona, ed è condiviso con la galleria di una chat
 * (`TalosMobileChatMediaPanel.vue`). Fa però una cosa diversa: object URL in
 * memoria, **solo immagini**, niente disco, niente coda, due stati. Riscriverlo
 * sotto i piedi di un'altra superficie mentre un altro agente ci lavora accanto
 * è esattamente il modo in cui due sessioni si sovrascrivono a vicenda.
 *
 * 🔜 **Debito dichiarato**: quando la Libreria sarà verificata sul Pad, la
 * galleria della chat dovrebbe passare di qui — guadagnerebbe le anteprime dei
 * PDF e la cache su disco, e resterebbe **una** implementazione invece di due.
 * Va chiesto all'owner, perché tocca una superficie che non è questa.
 *
 * Fonti lette il 12/09/2026:
 * - https://developer.mozilla.org/en-US/docs/Web/API/ResizeObserver — la
 *   larghezza vera di un elemento, senza un `resize` sulla finestra che non
 *   scatta quando è la griglia a cambiare colonne.
 * - https://vuejs.org/api/composition-api-lifecycle.html#onbeforeunmount
 */

import { onBeforeUnmount, onMounted, ref, shallowRef, watch, type Ref } from 'vue'
import {
    talosThumbnailKey,
    talosThumbnailKeyPrefix,
    talosThumbnailKind,
    talosThumbnailWidthPx,
    TALOS_THUMBNAIL_MIN_PX,
} from '@/lib/library/libraryThumbnails'
import {
    createTalosThumbnailStore,
    type TalosThumbnailStore,
} from '@/services/talosThumbnailStore'
import type { TalosLocalVaultFile } from '@/repositories/chatRepository'

export type TalosThumbnailState = 'loading' | 'ready' | 'none'

export interface TalosLibraryThumbnails {
    /** L'indirizzo dell'anteprima, quando c'è. */
    url: (file: TalosLocalVaultFile) => string | null
    /** In che stato è l'anteprima di questo file. */
    state: (file: TalosLocalVaultFile) => TalosThumbnailState
    /** L'elemento da misurare per sapere quanto è larga una scheda. */
    misura: Ref<HTMLElement | null>
    /** Il file è stato eliminato: via la sua miniatura, dal disco e da qui. */
    forget: (fileId: string) => Promise<void>
}

export interface TalosLibraryThumbnailsOptions {
    /** Sostituibile nei test; di serie quello vero. */
    store?: TalosThumbnailStore
    /** I byte del file originale. */
    readBytes: (fileId: string) => Promise<Uint8Array | null>
    /** Quante generare per giro di lista. Oltre, si aspetta il giro dopo. */
    perGiro?: number
}

/**
 * Quante anteprime si chiedono per volta.
 *
 * ⛔ Non è una preferenza estetica: la coda del negozio è seriale, ma la
 * RICHIESTA no — chiedere cinquanta miniature insieme riempie la coda di lavoro
 * per file che intanto sono usciti dallo schermo perché la persona ha scritto
 * nella ricerca. Si chiede a lotti, e ogni lotto riparte dalla lista com'è
 * ADESSO, non da com'era quando è partito il primo.
 */
const PER_GIRO = 6

export function useTalosLibraryThumbnails(
    files: Ref<readonly TalosLocalVaultFile[]>,
    options: TalosLibraryThumbnailsOptions,
): TalosLibraryThumbnails {
    const store = options.store ?? createTalosThumbnailStore({ readBytes: options.readBytes })
    const perGiro = options.perGiro ?? PER_GIRO

    /** Indirizzo per chiave di contenuto: cambia il file, cambia la chiave. */
    const indirizzi = shallowRef<Record<string, string>>({})
    /** Le chiavi già tentate, riuscite o no: non si ritenta all'infinito. */
    const tentate = new Set<string>()
    const misura = ref<HTMLElement | null>(null)
    const larghezzaPx = ref(talosThumbnailWidthPx(TALOS_THUMBNAIL_MIN_PX, 1))

    let smontato = false
    let giroInCorso = false

    function aggiornaLarghezza(): void {
        /*
         * ⛔ Si misura la prima SCHEDA, non la griglia.
         *
         * La miniatura deve entrare in una scheda, e quante schede stiano su una
         * riga lo decide il CSS con `auto-fill`: da qui non si sa, e dedurlo
         * contando le colonne vorrebbe dire riscrivere in TypeScript la regola
         * che sta nel foglio di stile — due verità che divergono alla prima
         * modifica. Il primo figlio è una scheda vera, già disposta dal browser.
         * Senza figli (lista vuota) resta il contenitore, che è comunque un
         * limite superiore onesto.
         */
        const contenitore = misura.value
        const elemento = contenitore?.firstElementChild ?? contenitore
        const css = elemento?.getBoundingClientRect?.().width ?? 0
        const densita = typeof window !== 'undefined' ? window.devicePixelRatio : 1
        const prossima = talosThumbnailWidthPx(css, densita)
        /*
         * ⛔ Si aggiorna solo per scarti veri. La larghezza di una scheda cambia
         * di un pixel a ogni comparsa della barra di scorrimento, e una chiave
         * che dipendesse da quel pixel rigenererebbe tutto per niente. La
         * miniatura viene comunque adattata al riquadro con `object-contain`:
         * un 12% di differenza in più o in meno non si vede.
         */
        if (Math.abs(prossima - larghezzaPx.value) / larghezzaPx.value > 0.12) {
            larghezzaPx.value = prossima
        }
    }

    async function giro(): Promise<void> {
        if (giroInCorso || smontato) return
        giroInCorso = true
        try {
            // ⛔ Il `while` rilegge `files.value` ogni volta: la lista che si
            // sta guardando è quella di adesso, non quella di quando il giro è
            // partito. Cambiare filtro durante una generazione non deve
            // lasciare in coda venti file che non c'entrano più.
            for (;;) {
                if (smontato) return
                const daFare = files.value
                    .filter((file) => {
                        const kind = talosThumbnailKind(file)
                        if (kind !== 'image' && kind !== 'pdf') return false
                        return !tentate.has(talosThumbnailKey(file))
                    })
                    .slice(0, perGiro)
                if (daFare.length === 0) return
                for (const file of daFare) {
                    if (smontato) return
                    const key = talosThumbnailKey(file)
                    tentate.add(key)
                    const url = await store.thumbnailFor(file, larghezzaPx.value)
                    if (smontato) return
                    if (url) indirizzi.value = { ...indirizzi.value, [key]: url }
                }
            }
        } finally {
            giroInCorso = false
        }
    }

    watch(files, () => { void giro() }, { immediate: true, deep: false })
    watch(larghezzaPx, () => {
        /*
         * La scheda è cambiata di misura per davvero (rotazione, tablet che
         * apre la barra laterale). Le miniature già su disco restano valide —
         * sono ritagliate, non deformate — quindi non si butta niente: si
         * riapre solo la porta ai file che non erano ancora riusciti, perché
         * ora potrebbero entrare in un budget diverso.
         */
        void giro()
    })

    /*
     * ⛔ La larghezza si OSSERVA, non si deduce da un `resize` della finestra:
     * su un tablet la griglia cambia colonne quando si apre la barra laterale,
     * e la finestra non si muove di un pixel
     * (https://developer.mozilla.org/en-US/docs/Web/API/ResizeObserver,
     * letta il 12/09/2026).
     *
     * L'osservatore si tiene in una variabile di questa chiusura e si spegne
     * nell'unico `onBeforeUnmount` qui sotto. Registrarne uno annidato dentro
     * `onMounted` funzionerebbe — Vue lega ogni hook all'istanza attiva
     * (https://vuejs.org/api/composition-api-lifecycle.html, letta il
     * 12/09/2026) — ma due punti di spegnimento sono due punti da ricordare.
     */
    let osservatore: ResizeObserver | null = null

    onMounted(() => {
        aggiornaLarghezza()
        if (typeof ResizeObserver === 'undefined' || !misura.value) return
        osservatore = new ResizeObserver(() => aggiornaLarghezza())
        osservatore.observe(misura.value)
    })

    onBeforeUnmount(() => {
        smontato = true
        osservatore?.disconnect()
        osservatore = null
        store.release()
    })

    return {
        url(file) {
            return indirizzi.value[talosThumbnailKey(file)] ?? store.cached(file)
        },
        state(file) {
            const kind = talosThumbnailKind(file)
            if (kind !== 'image' && kind !== 'pdf') return 'none'
            const key = talosThumbnailKey(file)
            if (indirizzi.value[key]) return 'ready'
            /*
             * ⛔ «Tentata e senza indirizzo» è `nessuna`, non `in-caricamento`.
             * È il caso del file corrotto, e lasciarlo su «in-caricamento»
             * significherebbe un posto vuoto che gira per sempre — la bugia
             * peggiore fra le tre, perché promette qualcosa che non arriverà.
             */
            return tentate.has(key) ? 'none' : 'loading'
        },
        misura,
        async forget(fileId) {
            await store.forget(fileId)
            /*
             * ⛔ Il prefisso lo calcola `talosThumbnailKeyPrefix`, non una
             * interpolazione scritta qui: l'`id` dentro la chiave è SANIFICATO,
             * e confrontarlo con quello grezzo funzionerebbe per tutti gli id
             * normali e fallirebbe in silenzio proprio su quelli strani —
             * lasciando la miniatura di un file eliminato a schermo.
             */
            const prefisso = talosThumbnailKeyPrefix(fileId)
            const prossimi = { ...indirizzi.value }
            for (const key of Object.keys(prossimi)) {
                if (key.startsWith(prefisso)) { delete prossimi[key]; tentate.delete(key) }
            }
            indirizzi.value = prossimi
        },
    }
}
