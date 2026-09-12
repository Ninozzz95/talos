import { onBeforeUnmount, type ObjectDirective } from 'vue'
import { TALOS_CALM_SPECS, talosCurva, talosDurataMs, talosMotionConsentito } from './useTalosCalmMotion'

const TOKEN = '--talos-motion-calm-details'

/** M15: altezza misurata; un secondo tocco riparte dall'altezza corrente. */
export function useTalosHeightDisclosure(): ObjectDirective<HTMLElement, boolean> {
    const running = new Map<HTMLElement, { animation: Animation; finish: () => void }>()
    function settle(el: HTMLElement, open: boolean): void {
        el.style.display = open ? '' : 'none'
        el.inert = !open
    }
    function toggle(el: HTMLElement, open: boolean): void {
        const start = el.style.display === 'none' ? 0 : el.getBoundingClientRect().height
        const previous = running.get(el)
        // Invalida la callback prima di cancellare: non deve chiudere una
        // categoria che la persona ha appena deciso di riaprire.
        running.delete(el)
        previous?.animation.cancel()
        previous?.finish()
        const height = el.style.height
        const overflow = el.style.overflow
        el.style.display = ''
        el.style.height = ''
        const end = open ? el.getBoundingClientRect().height : 0
        el.inert = !open
        const cleanup = () => {
            el.style.height = height
            el.style.overflow = overflow
            settle(el, open)
        }
        if (typeof el.animate !== 'function' || !talosMotionConsentito(el, TOKEN) || start === end) {
            cleanup()
            return
        }
        el.style.height = `${start}px`
        el.style.overflow = 'hidden'
        const animation = el.animate([{ height: `${start}px` }, { height: `${end}px` }], {
            duration: talosDurataMs(el, TOKEN, TALOS_CALM_SPECS.details.ms),
            easing: talosCurva(el, `${TOKEN}-ease`),
            fill: 'none',
        })
        running.set(el, { animation, finish: cleanup })
        const done = () => {
            if (running.get(el)?.animation !== animation) return
            running.delete(el)
            cleanup()
        }
        void animation.finished.then(done, done)
    }
    onBeforeUnmount(() => {
        for (const { animation, finish } of running.values()) { animation.cancel(); finish() }
        running.clear()
    })
    return {
        mounted: (el, { value }) => settle(el, value),
        updated: (el, { value, oldValue }) => { if (value !== oldValue) toggle(el, value) },
        beforeUnmount: (el) => {
            const current = running.get(el)
            running.delete(el)
            current?.animation.cancel()
            current?.finish()
        },
    }
}
