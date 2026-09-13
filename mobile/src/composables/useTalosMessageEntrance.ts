import { onBeforeUnmount, type ObjectDirective } from 'vue'
import { TALOS_CALM_SPECS, TALOS_ENTRATA_MASSIMA, talosCurva, talosDurataMs, talosMotionConsentito } from './useTalosCalmMotion'

const TOKEN = '--talos-motion-calm-message-row'
// rowEntrance r.3456 ne ammette otto, entro il tetto comune degli elenchi.
const LIMIT = Math.min(8, TALOS_ENTRATA_MASSIMA)

/**
 * Una sola osservazione per riga persistita, nel primo layout utile (dopo lo
 * scroll della chat). Le righe fuori vista vengono subito dimenticate: una
 * conversazione lunga non anima entrando nella viewport a ogni scroll.
 * Nessuna lettura sincrona di geometria per ogni messaggio, nessun watcher
 * sul contenuto o sui token in streaming.
 */
export function useTalosMessageEntrance(): ObjectDirective<HTMLElement, string> {
    let observer: IntersectionObserver | null = null
    const seen = new WeakSet<HTMLElement>()
    const animations = new Map<HTMLElement, Animation>()
    function observe(el: HTMLElement, state: string): void {
        if (state !== 'persisted' || seen.has(el)) return
        seen.add(el)
        if (typeof IntersectionObserver !== 'function' || typeof el.animate !== 'function') return
        observer ??= new IntersectionObserver((entries) => {
            let count = 0
            for (const entry of entries) {
                const target = entry.target as HTMLElement
                observer?.unobserve(target)
                if (!entry.isIntersecting || !target.isConnected || count >= LIMIT) continue
                if (!talosMotionConsentito(target, TOKEN)) continue
                count++
                const animation = target.animate([
                    { opacity: 0, transform: 'translateY(10px)' },
                    { opacity: 1, transform: 'translateY(0)' },
                ], {
                    duration: talosDurataMs(target, TOKEN, TALOS_CALM_SPECS['message-row'].ms),
                    easing: talosCurva(target, `${TOKEN}-ease`),
                    fill: 'none',
                })
                animations.set(target, animation)
                const done = () => { if (animations.get(target) === animation) animations.delete(target) }
                void animation.finished.then(done, done)
            }
        })
        observer.observe(el)
    }
    onBeforeUnmount(() => {
        observer?.disconnect()
        for (const animation of animations.values()) animation.cancel()
        animations.clear()
    })
    return {
        mounted: (el, { value }) => observe(el, value),
        updated: (el, { value, oldValue }) => { if (value !== oldValue) observe(el, value) },
        beforeUnmount: (el) => {
            observer?.unobserve(el)
            animations.get(el)?.cancel()
            animations.delete(el)
        },
    }
}
