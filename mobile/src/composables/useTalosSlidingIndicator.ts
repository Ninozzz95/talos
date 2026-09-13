/**
 * U-14 — IL FILO CHE SCORRE SOTTO LA SCELTA ATTIVA.
 *
 * Portato dal mockup «Talos Calm Finale», `Motion.animateIndicators`
 * (`src/app.js:1908`). Numeri MISURATI eseguendo il mockup con Playwright
 * l'11/09/2026, cambiando filtro nella stazione Note:
 *
 *     SPAN.motion-indicator line | dur=300 ease=cubic-bezier(0.22, 0.8, 0.24, 1)
 *       {"transform":"translateX(-73.4375px) scaleX(0.669)"} -> {"transform":"translateX(0) scaleX(1)"}
 *
 * ⛔ IL PUNTO NON È CHE IL FILO SI ANIMA. È CHE SI SPOSTA.
 * Oggi nell'app il filo sotto il filtro attivo è uno `<span>` con un `v-if`:
 * sparisce da una voce e riappare su un'altra. Due eventi separati, e chi
 * guarda non impara niente. Un filo che SCIVOLA dice da dove si è arrivati —
 * è l'unica parte di questa animazione che porta informazione, e il mockup
 * la ottiene con due sole trasformazioni: uno spostamento e uno stiramento.
 *
 * Lo stiramento (`scaleX`) è ciò che rende la cosa credibile quando le due voci
 * hanno larghezze diverse: senza, il filo scivolerebbe mantenendo la larghezza
 * nuova fin dal primo fotogramma, e si leggerebbe come un salto.
 *
 * ⛔ LA DURATA NON È 300 MS: È QUELLA CHE DICE IL MOTORE.
 * L'intento è `tab-change`, categoria **Navigazione** — che è letteralmente
 * quello che sta succedendo. 300 ms è il valore di SERIE, quello del mockup,
 * usato solo dove il motore non ha scritto.
 *
 * Fonti (lette l'11/09/2026):
 * - Element.animate, opzioni di timing, `fill`:
 *   https://developer.mozilla.org/en-US/docs/Web/API/Element/animate
 * - prefers-reduced-motion:
 *   https://developer.mozilla.org/en-US/docs/Web/CSS/@media/prefers-reduced-motion
 */

import { nextTick, onScopeDispose, watch, type Ref, type WatchSource } from 'vue'
import { talosCurva, talosDurataMs, talosMotionConsentito } from './useTalosCalmMotion'

/** Il token che governa durata e cancello. Categoria Navigazione. */
export const TALOS_INDICATOR_TOKEN = '--talos-motion-calm-indicator'
export const TALOS_INDICATOR_EASE_TOKEN = '--talos-motion-ease-tab-change'

/** Il numero del mockup, misurato. Vale dove il motore non ha scritto. */
export const TALOS_INDICATOR_SERIE_MS = 300

/** L'attributo che marca il filo dentro il gruppo. */
export const TALOS_INDICATOR_ATTR = 'data-talos-indicator'

export interface TalosIndicatorRect {
    left: number
    width: number
}

/**
 * Le due pose del filo: da dov'era, a dov'è.
 *
 * Pura di proposito — è la parte che si prova come un calcolo, senza un
 * browser di mezzo. Torna `null` quando non c'è niente da animare: il filo non
 * si è mosso e non è cambiato di larghezza, e allora animarlo sarebbe un
 * fotogramma sprecato che a schermo si legge come uno sfarfallio.
 */
export function talosIndicatorFrames(
    prima: TalosIndicatorRect,
    dopo: TalosIndicatorRect,
): Keyframe[] | null {
    if (!(prima.width > 0) || !(dopo.width > 0)) return null
    const dx = prima.left - dopo.left
    const k = prima.width / dopo.width
    // Mezzo pixel e l'1% di larghezza: sotto queste soglie nessun occhio vede
    // la differenza, e l'animazione costerebbe solo un fotogramma.
    if (Math.abs(dx) < 0.5 && Math.abs(k - 1) < 0.01) return null
    return [
        { transform: `translateX(${dx}px) scaleX(${k})` },
        { transform: 'translateX(0) scaleX(1)' },
    ]
}

function filoDi(gruppo: HTMLElement | null): HTMLElement | null {
    if (!gruppo) return null
    const filo = gruppo.querySelector(`[${TALOS_INDICATOR_ATTR}]`)
    return filo instanceof HTMLElement ? filo : null
}

function rettangolo(filo: HTMLElement | null): TalosIndicatorRect | null {
    if (!filo || typeof filo.getBoundingClientRect !== 'function') return null
    const r = filo.getBoundingClientRect()
    if (!(r.width > 0)) return null
    return { left: r.left, width: r.width }
}

export interface TalosSlidingIndicatorApi {
    /** Toglie l'animazione in corso, se c'è. Per lo smontaggio. */
    stop: () => void
}

/**
 * Fa scivolare il filo del gruppo ogni volta che `sorgente` cambia.
 *
 * Il gruppo è l'elemento con `role="radiogroup"` (o le tab); dentro, la voce
 * attiva porta uno `<span data-talos-indicator>`. Non serve che sia sempre lo
 * stesso nodo: il `v-if` di Vue può distruggerlo e ricrearlo altrove, perché
 * quello che si misura sono i due RETTANGOLI, non l'identità dell'elemento.
 *
 * ⛔ L'ordine conta. Il rettangolo di partenza si prende in un watcher `pre`,
 * cioè PRIMA che Vue ricomponga: dopo, il filo vecchio non esiste più e non
 * c'è modo di sapere da dove veniva.
 */
export function useTalosSlidingIndicator(
    gruppo: Ref<HTMLElement | null>,
    sorgente: WatchSource<unknown>,
): TalosSlidingIndicatorApi {
    let corsa: Animation | null = null

    function stop(): void {
        if (corsa && corsa.playState !== 'finished') corsa.cancel()
        corsa = null
    }

    watch(
        sorgente,
        async () => {
            const host = gruppo.value
            if (!host) return
            const prima = rettangolo(filoDi(host))
            await nextTick()
            // Il gruppo può essere sparito mentre Vue ricomponeva.
            if (!gruppo.value) return
            const filo = filoDi(gruppo.value)
            const dopo = rettangolo(filo)
            if (!prima || !dopo || !filo) return
            if (!talosMotionConsentito(filo, TALOS_INDICATOR_TOKEN)) return
            if (typeof filo.animate !== 'function') return

            const frames = talosIndicatorFrames(prima, dopo)
            if (!frames) return

            stop()
            corsa = filo.animate(frames, {
                duration: talosDurataMs(filo, TALOS_INDICATOR_TOKEN, TALOS_INDICATOR_SERIE_MS),
                easing: talosCurva(filo, TALOS_INDICATOR_EASE_TOKEN),
                // `none`: a riposo il filo deve stare esattamente dov'è la voce
                // attiva, scritto dal CSS. Con `forwards` resterebbe appeso a
                // una trasformazione nostra, e il primo cambio di larghezza
                // della pagina lo lascerebbe fuori posto.
                fill: 'none',
            })
            corsa.finished.then(() => { corsa = null }, () => { corsa = null })
        },
        { flush: 'pre' },
    )

    onScopeDispose(stop)

    return { stop }
}
