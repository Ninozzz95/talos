import { ref, type Ref } from 'vue'

/**
 * Le altre due porte dello stesso menu: il tasto destro e la pressione lunga.
 *
 * Owner 10/09/2026: «usa i tre puntini + dropdown… e anche azioni tasto destro
 * mouse». I tre puntini restano la porta VISIBILE — è la ragione per cui
 * `TalosRowActions` esiste e per cui la pressione lunga da sola era stata
 * scartata (un menu raggiungibile solo tenendo premuto è un menu di cui niente
 * sullo schermo dice che c'è). Queste due sono scorciatoie per chi le conosce,
 * mai l'unico modo.
 *
 * ## ⛔ Il debito che questo file dichiara
 *
 * Il posto giusto di questo codice è DENTRO `TalosRowActions`, che è il
 * componente del menu e lo userebbero anche la Libreria, le attività e la
 * memoria. Sta qui perché questo giro di lavoro aveva il permesso di toccare
 * solo le Note: metterlo là avrebbe cambiato un file condiviso mentre altre
 * sessioni ci lavorano. Va risalito appena il menu si tocca per un altro
 * motivo — e allora questo file sparisce.
 *
 * ## Perché si simula un clic invece di chiamare una funzione
 *
 * Perché `TalosRowActions` espone solo `close()`: non c'è un `open()` da
 * chiamare senza modificarlo. Il grilletto è un `<button>` vero dentro
 * `menuHost`, quindi cliccarlo apre il menu esattamente come lo aprirebbe un
 * dito — stessa posizione calcolata, stessa gestione di Indietro, stesso
 * comportamento con la tastiera. È l'unico punto in cui questo file conosce il
 * componente accanto, e conosce la cosa più stabile che ha: il suo bottone.
 */
export interface TalosNoteRowMenu {
    /** Va messo su ciò che AVVOLGE `<TalosRowActions>`: il menu si apre da lì. */
    readonly menuHost: Ref<HTMLElement | null>
    readonly onContextMenu: (event: Event) => void
    readonly onPointerDown: (event: PointerEvent) => void
    readonly onPointerEnd: () => void
    /**
     * `true` se il tocco che sta finendo era una pressione lunga, e quindi la
     * riga NON deve aprirsi.
     *
     * Senza questo, tenere premuto aprirebbe il menu e poi, al rilascio,
     * anche la nota: due cose per un gesto solo. Si CONSUMA: la domanda vale
     * una volta, per il clic che segue subito.
     */
    readonly consumeLongPress: () => boolean
}

/**
 * 500 ms: la soglia di `ViewConfiguration.getLongPressTimeout()` di Android.
 * Più corta trasforma uno scorrimento lento in un menu che si apre da solo.
 */
const LONG_PRESS_MS = 500

export function useTalosNoteRowMenu(): TalosNoteRowMenu {
    const menuHost = ref<HTMLElement | null>(null)
    let timer = 0
    let fired = false

    function openMenu(): void {
        menuHost.value?.querySelector('button')?.click()
    }

    function clear(): void {
        if (timer !== 0) {
            clearTimeout(timer)
            timer = 0
        }
    }

    return {
        menuHost,
        onContextMenu(event: Event): void {
            // Il menu del browser qui non ha niente da offrire: le voci utili
            // su una nota sono le nostre.
            event.preventDefault()
            openMenu()
        },
        onPointerDown(event: PointerEvent): void {
            // Col mouse c'è già il tasto destro: fargli anche la pressione
            // lunga vorrebbe dire che tenere premuto per selezionare del testo
            // apre un menu.
            if (event.pointerType === 'mouse') return
            fired = false
            clear()
            timer = window.setTimeout(() => {
                timer = 0
                fired = true
                openMenu()
            }, LONG_PRESS_MS)
        },
        onPointerEnd(): void {
            clear()
        },
        consumeLongPress(): boolean {
            const was = fired
            fired = false
            return was
        },
    }
}
