/**
 * U-14 / X2 — LA CASELLA CHE SI SPUNTA.
 *
 * Portata dal mockup «Talos Calm Finale», `checkTask` (`src/app.js:2194`).
 * Due animazioni, non una, e fanno due lavori diversi:
 *
 *     settle(control, .84 → 1, scale, 320)      il riquadro rimbalza
 *     animate(path, strokeDashoffset 22 → 0, 200)  il segno SI DISEGNA
 *
 * ⛔ IL SEGNO CHE SI DISEGNA È LA PARTE CHE PORTA INFORMAZIONE.
 * Un quadrato che cambia colore dice «adesso è diverso». Un segno che viene
 * tracciato dice «l'ho appena fatto io, con questo dito» — ed è la sola
 * differenza fra un riscontro e un ridisegno. Per questo il tratto si fa solo
 * quando si SPUNTA: togliendo la spunta non c'è niente da disegnare, e
 * ridisegnare il segno mentre sparisce sarebbe un riscontro che contraddice il
 * risultato.
 *
 * ## ⛔ Perché una molla del mockup diventa una curva qui
 *
 * `settle` del mockup è una molla criticamente smorzata: parte, rallenta, si
 * ferma, e **non supera mai il bersaglio**. La curva d'entrata dell'app
 * (`cubic-bezier(0.22, 0.8, 0.24, 1)`) ha esattamente quella forma — veloce
 * subito, assestamento lungo, nessun rimbalzo oltre l'1. La differenza è nei
 * fotogrammi intermedi, non in ciò che si vede; e una molla in JavaScript per
 * ogni tocco su ogni casella è il costo che l'inventario del movimento aveva
 * già rifiutato di pagare per la pressione (debito S16). Scostamento
 * dichiarato, non dimenticato.
 *
 * ## ⛔ Perché la durata si RICAVA invece di essere scritta
 *
 * Perché nessun token del motore vale 320 ms, e inventarne uno qui vorrebbe
 * dire toccare la tabella degli spec U-14 (`composables/useTalosCalmMotion.ts`),
 * che questo lavoro non può riscrivere. Ma un numero fisso sarebbe peggio: il
 * cursore «Durata transizioni» non lo toccherebbe, ed è esattamente il difetto
 * che il cancello `SHELL-CSS-02` ha già trovato una volta sull'onda del tocco.
 *
 * ⇒ Si legge il token dell'onda — `--talos-motion-calm-wave`, categoria
 * **Feedback**, la stessa a cui appartiene una casella che risponde a un dito —
 * e si ricava il FATTORE che il motore sta applicando adesso
 * (`risolto / 470`, dove 470 è il numero di serie di quella voce). Le due
 * durate del mockup passano da lì. Così:
 *
 *   - i quattro spegnimenti del motore decidono come per tutto il resto
 *     (riduzione di sistema, interruttore, profilo, categoria Feedback);
 *   - la scala di durata scelta dall'utente allunga anche questa;
 *   - i numeri che si vedono alle preferenze di serie sono 320 e 200, quelli
 *     del mockup.
 *
 * 🔜 Debito dichiarato nel rapporto: due voci (`check` 320, `check-draw` 200)
 * andrebbero nella tabella U-14, e questa divisione sparirebbe.
 *
 * Fonti (lette il 12/09/2026):
 * - https://developer.mozilla.org/en-US/docs/Web/API/Element/animate
 * - https://developer.mozilla.org/en-US/docs/Web/CSS/@media/prefers-reduced-motion
 */

import {
    TALOS_CALM_EASE,
    talosCurva,
    talosDurataMs,
    talosMotionConsentito,
} from '@/composables/useTalosCalmMotion'

/** Il token che fa da cancello e da metro. Categoria Feedback. */
export const TALOS_CHECK_GATE_TOKEN = '--talos-motion-calm-wave'
export const TALOS_CHECK_EASE_TOKEN = '--talos-motion-ease'

/** I numeri del mockup, misurati. Valgono dove il motore non ha scritto. */
export const TALOS_CHECK_SERIE_MS = 320
export const TALOS_CHECK_DRAW_SERIE_MS = 200
/** Il numero di serie della voce letta come metro (l'onda del tocco). */
export const TALOS_CHECK_GATE_SERIE_MS = 470

/** La lunghezza del tratto del segno di spunta, come nel mockup. */
export const TALOS_CHECK_DASH = 22

/**
 * Il fattore che il motore sta applicando, letto da un token già risolto.
 *
 * Pura di proposito: è la parte che si prova come un calcolo. `1` quando il
 * token non c'è — un token assente vuol dire «non lo so», e «non lo so» non è
 * «spento», altrimenti ogni prova unitaria direbbe che il movimento funziona
 * proprio perché non c'è niente da misurare.
 */
export function talosCheckFattore(risolto: number, serie = TALOS_CHECK_GATE_SERIE_MS): number {
    if (!Number.isFinite(risolto) || risolto <= 0 || serie <= 0) return 1
    return risolto / serie
}

/** Le due durate, dal fattore. Arrotondate: i millisecondi sono interi. */
export function talosCheckDurate(fattore: number): { spring: number, draw: number } {
    return {
        spring: Math.round(TALOS_CHECK_SERIE_MS * fattore),
        draw: Math.round(TALOS_CHECK_DRAW_SERIE_MS * fattore),
    }
}

export interface TalosTaskCheckMotionOptions {
    /** Il riquadro che rimbalza. */
    control: HTMLElement | null
    /** Il tratto del segno. Assente quando si sta TOGLIENDO la spunta. */
    stroke?: SVGPathElement | null
    /** Vero se l'attività è appena diventata completata. */
    completata: boolean
}

/**
 * Fa rimbalzare la casella, e disegna il segno se è appena stata spuntata.
 *
 * Non lancia mai: un riscontro che rompe il gesto a cui risponde è peggio di
 * un riscontro che non c'è. `Element.animate` non esiste in jsdom né nei
 * browser più vecchi, e la funzione se ne accorge invece di darlo per scontato.
 */
export function talosAnimaSpunta(options: TalosTaskCheckMotionOptions): void {
    const { control, stroke, completata } = options
    if (!control) return
    if (!talosMotionConsentito(control, TALOS_CHECK_GATE_TOKEN)) return
    if (typeof control.animate !== 'function') return

    const fattore = talosCheckFattore(
        talosDurataMs(control, TALOS_CHECK_GATE_TOKEN, TALOS_CHECK_GATE_SERIE_MS),
    )
    const durate = talosCheckDurate(fattore)
    const curva = talosCurva(control, TALOS_CHECK_EASE_TOKEN, TALOS_CALM_EASE)

    try {
        control.animate(
            [{ transform: 'scale(0.84)' }, { transform: 'scale(1)' }],
            // `fill: 'none'`: a riposo la casella deve stare esattamente com'è
            // scritta nel CSS. Con `forwards` resterebbe appesa a una
            // trasformazione nostra, e il primo ridisegno la lascerebbe fuori
            // misura senza che nessuno capisca perché.
            { duration: durate.spring, easing: curva, fill: 'none' },
        )
    } catch { /* un riscontro non può rompere il gesto a cui risponde */ }

    if (!completata || !stroke || typeof stroke.animate !== 'function') return
    try {
        stroke.animate(
            [{ strokeDashoffset: String(TALOS_CHECK_DASH) }, { strokeDashoffset: '0' }],
            { duration: durate.draw, easing: curva, fill: 'none' },
        )
    } catch { /* idem */ }
}
