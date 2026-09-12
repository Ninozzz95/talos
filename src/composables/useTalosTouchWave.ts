/**
 * U-14 — L'ONDA CHE PARTE DAL PUNTO DEL DITO.
 *
 * Portata dal mockup «Talos Calm Finale», `Motion.ripple` (`src/app.js:2208`).
 * Numeri MISURATI eseguendo il mockup con Playwright l'11/09/2026, non letti a
 * occhio dal sorgente:
 *
 *     SPAN.touch-wave | dur=470 ease=cubic-bezier(0.2, 0, 0, 1) fill=none
 *       {"transform":"scale(.06)","opacity":0.16} -> {"transform":"scale(1)","opacity":0}
 *
 * ⛔ PERCHÉ SERVE DEL JAVASCRIPT, se il disegno è tutto in CSS.
 * Perché la POSIZIONE dell'onda è il punto toccato, e quello il CSS non lo sa.
 * Tutto il resto — durata, curva, opacità, `prefers-reduced-motion` — sta nel
 * blocco U-14 di `style.css`. Qui c'è solo la geometria e i cancelli.
 *
 * ⛔ IL CANCELLO NON È UN `if` NOSTRO.
 * L'onda si spegne quando la spegne il motore, non quando lo decidiamo noi: si
 * legge `--talos-motion-duration-success-confirm`, che il motore porta a `0ms`
 * in quattro casi diversi e per quattro ragioni diverse
 * (`motion-v6/interaction/resolver.ts:244-248`):
 *   - `prefers-reduced-motion: reduce`  → reason `reduced_motion`
 *   - «Movimento interfaccia» spento    → reason `interface_off`
 *   - profilo del movimento su «Spento» → reason `interface_off`
 *   - categoria **Feedback** spenta     → reason `category_off`
 * L'onda è riscontro al tocco, quindi è Feedback: è la categoria giusta, ed è
 * la stessa che il mockup consultava (`prefs().motionFeedback`, `app.js:2209`).
 *
 * Se il token non c'è affatto (prove jsdom, o una superficie montata fuori
 * dalla radice della shell) NON si spegne niente: si cade sul valore di serie.
 * Un token assente è «non lo so», e «non lo so» non è «spento» — altrimenti
 * ogni prova unitaria direbbe che il movimento funziona perché non c'è.
 *
 * Fonti (lette l'11/09/2026):
 * - https://developer.mozilla.org/en-US/docs/Web/API/Element/animate
 * - https://developer.mozilla.org/en-US/docs/Web/CSS/@media/prefers-reduced-motion
 */

import { talosMotionConsentito, talosTokenGrezzo } from './useTalosCalmMotion'

/**
 * Il token che decide se l'onda esiste, e quanto dura. Categoria Feedback.
 *
 * ⛔ È un token `calm`, sulla RADICE DEL DOCUMENTO, e non il
 * `--talos-motion-duration-success-confirm` del motore: quest'onda nasce anche
 * dentro pannelli TELEPORTATI (il menu di riga), dove i token del motore non si
 * ereditano. Il valore però viene dal motore lo stesso — lo calcola
 * `resolveTalosInteractionMotion` sull'intento `success`, quindi le quattro
 * porte e la scala di durata decidono come prima.
 */
export const TALOS_WAVE_GATE_TOKEN = '--talos-motion-calm-wave'

/** Classe del cerchio. Il disegno sta nel blocco U-14 di `style.css`. */
export const TALOS_WAVE_CLASS = 'talos-touch-wave'

/**
 * Quanto dura il cerchio prima di essere tolto dal DOM, se per qualunque
 * ragione `animationend` non arriva (elemento staccato a metà, animazione
 * annullata da una ricomposizione). È il numero del mockup con un margine.
 */
const TALOS_WAVE_FALLBACK_MS = 700

export interface TalosWaveGeometry {
    /** Diametro, in px: il cerchio è quadrato. */
    size: number
    left: number
    top: number
}

export interface TalosWaveRect {
    left: number
    top: number
    width: number
    height: number
}

/**
 * La geometria del mockup, alla lettera (`app.js:2213-2214`):
 *
 *     w = max(larghezza, altezza) * 1.7
 *     left = clientX - rect.left - w/2
 *     top  = clientY - rect.top  - w/2
 *
 * Il fattore 1,7 è quello che fa arrivare l'onda al bordo più lontano anche
 * quando il dito tocca un angolo: con 1,0 un tocco sullo spigolo di una scheda
 * larga lascerebbe scoperta la diagonale, e l'onda sembrerebbe fermarsi a metà.
 *
 * Pura di proposito: è la parte che si prova come un calcolo.
 */
export function talosWaveGeometry(
    rect: TalosWaveRect,
    clientX: number,
    clientY: number,
    spread = 1.7,
): TalosWaveGeometry {
    const size = Math.max(rect.width, rect.height) * spread
    return {
        size,
        left: clientX - rect.left - size / 2,
        top: clientY - rect.top - size / 2,
    }
}

export interface TalosTouchWaveOptions {
    /**
     * Il fattore di allargamento. Di serie il 1,7 del mockup; si legge dal
     * token `--talos-motion-wave-spread` quando c'è, così resta una cosa sola.
     */
    spread?: number
}

export interface TalosTouchWaveApi {
    /** Da legare a `@pointerdown` sull'elemento che ospita l'onda. */
    onPointerDown: (event: PointerEvent) => void
    /** Toglie ogni cerchio ancora vivo. Per lo smontaggio. */
    clear: () => void
}

/**
 * Crea il gestore dell'onda.
 *
 * L'elemento che la ospita deve portare la classe `talos-wave-host`: è quella
 * che gli dà `position: relative`, `isolation: isolate` e `overflow: hidden`,
 * cioè le tre cose senza cui il cerchio o si posiziona rispetto alla pagina o
 * esce dal bordo arrotondato.
 */
export function useTalosTouchWave(options: TalosTouchWaveOptions = {}): TalosTouchWaveApi {
    const vive = new Set<HTMLElement>()

    function rimuovi(cerchio: HTMLElement): void {
        vive.delete(cerchio)
        cerchio.remove()
    }

    function onPointerDown(event: PointerEvent): void {
        const host = event.currentTarget
        if (!(host instanceof HTMLElement)) return
        // Solo il tocco principale, e solo il tasto sinistro: un secondo dito o
        // il tasto destro stanno aprendo un menu, non premendo.
        if (event.isPrimary === false || (event.button !== undefined && event.button > 0)) return
        if (!talosMotionConsentito(host, TALOS_WAVE_GATE_TOKEN)) return
        if (typeof document === 'undefined') return

        const rect = host.getBoundingClientRect()
        // Un elemento non disegnato non ha un punto da cui partire.
        if (rect.width <= 0 && rect.height <= 0) return

        const dichiarato = Number.parseFloat(talosTokenGrezzo(host, '--talos-motion-wave-spread'))
        const spread = options.spread ?? (Number.isFinite(dichiarato) && dichiarato > 0 ? dichiarato : 1.7)
        const geometria = talosWaveGeometry(rect, event.clientX, event.clientY, spread)

        const cerchio = document.createElement('span')
        cerchio.className = TALOS_WAVE_CLASS
        cerchio.setAttribute('aria-hidden', 'true')
        cerchio.style.width = `${geometria.size}px`
        cerchio.style.height = `${geometria.size}px`
        cerchio.style.left = `${geometria.left}px`
        cerchio.style.top = `${geometria.top}px`

        vive.add(cerchio)
        host.append(cerchio)

        // Due vie d'uscita, perché `animationend` non arriva se l'elemento
        // viene staccato mentre l'onda corre — e un cerchio dimenticato dentro
        // una riga è una macchia permanente.
        cerchio.addEventListener('animationend', () => rimuovi(cerchio), { once: true })
        cerchio.addEventListener('animationcancel', () => rimuovi(cerchio), { once: true })
        if (typeof window !== 'undefined') {
            window.setTimeout(() => rimuovi(cerchio), TALOS_WAVE_FALLBACK_MS)
        }
    }

    function clear(): void {
        for (const cerchio of [...vive]) rimuovi(cerchio)
    }

    return { onPointerDown, clear }
}
