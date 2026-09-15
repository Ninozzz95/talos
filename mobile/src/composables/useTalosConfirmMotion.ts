import { onBeforeUnmount, onMounted, type Ref } from 'vue'
import { TALOS_CALM_SPECS, talosCurva, talosDurataMs, talosMotionConsentito } from './useTalosCalmMotion'

type OriginRect = Pick<DOMRect, 'left' | 'top' | 'width' | 'height'>
let source: { rect: OriginRect; time: number } | null = null
const exits = new Set<() => void>()

/** La shell registra il controllo prima che il click monti la conferma. */
export function useTalosDialogOriginCapture(): void {
    const capture = (event: PointerEvent) => {
        if (event.isPrimary === false || event.button > 0) return
        const target = event.target instanceof Element
            ? event.target.closest('button, [role="button"], [role="menuitem"], input, a, summary') : null
        source = target ? { rect: target.getBoundingClientRect(), time: performance.now() } : null
    }
    onMounted(() => document.addEventListener('pointerdown', capture, true))
    onBeforeUnmount(() => {
        document.removeEventListener('pointerdown', capture, true)
        source = null
        for (const remove of exits) remove()
    })
}

export function talosDialogOffset(rect: OriginRect, origin?: OriginRect): { x: number; y: number } {
    const recent = origin ?? (source && source.time > performance.now() - 750 ? source.rect : null)
    return recent ? {
        x: Math.max(-70, Math.min(70, recent.left + recent.width / 2 - rect.left - rect.width / 2)),
        y: Math.max(-40, Math.min(40, recent.top + recent.height / 2 - rect.top - rect.height / 2)),
    } : { x: 0, y: 12 }
}

/**
 * I proprietari smontano la conferma con v-if, anche dopo aver confermato.
 * Una copia inerte completa l'uscita senza ritardare CRUD o tenere controlli
 * vivi dopo la chiusura. Nessun ID, ruolo o annuncio sopravvive nella copia.
 */
export function useTalosConfirmMotion(root: Ref<HTMLElement | null>, veil: Ref<HTMLElement | null>): void {
    const animations: Animation[] = []
    function animate(el: HTMLElement, frames: Keyframe[], spec: 'dialog' | 'dialog-exit' | 'veil', fallbackEase?: string): Animation | null {
        const token = `--talos-motion-calm-${spec}`
        if (typeof el.animate !== 'function' || !talosMotionConsentito(el, token)) return null
        const animation = el.animate(frames, {
            duration: talosDurataMs(el, token, TALOS_CALM_SPECS[spec].ms),
            easing: talosCurva(el, `${token}-ease`, fallbackEase),
            fill: 'none',
        })
        // Chiudere durante l'entrata cancella anche la promessa WAAPI.
        void animation.finished.catch(() => {})
        return animation
    }
    onMounted(() => {
        for (const remove of exits) remove()
        if (!root.value || !veil.value) return
        const { x, y } = talosDialogOffset(root.value.getBoundingClientRect())
        const dialog = animate(root.value, [
            { opacity: 0, transform: `translate(${x}px,${y}px) scale(.965)` },
            { opacity: 1, transform: 'translate(0) scale(1)' },
        ], 'dialog')
        const backdrop = animate(veil.value, [{ opacity: 0 }, { opacity: 1 }], 'veil', 'ease')
        if (dialog) animations.push(dialog)
        if (backdrop) animations.push(backdrop)
    })
    onBeforeUnmount(() => {
        const el = root.value
        if (!el) return
        const current = getComputedStyle(el)
        const from = { opacity: current.opacity || '1', transform: current.transform || 'none' }
        const veilOpacity = veil.value ? getComputedStyle(veil.value).opacity || '1' : '1'
        for (const animation of animations) animation.cancel()
        if (!el.isConnected || typeof el.animate !== 'function' || !talosMotionConsentito(el, '--talos-motion-calm-dialog-exit')) return
        const snapshot = el.parentElement!.cloneNode(true) as HTMLElement
        const panel = snapshot.querySelector<HTMLElement>('[role="dialog"]')!
        const backdrop = snapshot.firstElementChild as HTMLElement
        for (const node of [snapshot, ...snapshot.querySelectorAll('*')]) {
            for (const name of ['id', 'data-testid', 'autofocus', 'role', 'aria-modal', 'aria-live']) node.removeAttribute(name)
        }
        snapshot.inert = true
        snapshot.setAttribute('aria-hidden', 'true')
        snapshot.style.pointerEvents = 'none'
        document.body.append(snapshot)
        const dialog = animate(panel, [from, { opacity: 0, transform: 'translateY(6px) scale(.98)' }], 'dialog-exit', 'cubic-bezier(0.3, 0, 0.8, 0.15)')
        const fade = animate(backdrop, [{ opacity: veilOpacity }, { opacity: 0 }], 'veil', 'ease')
        const running = [dialog, fade].filter((a): a is Animation => a !== null)
        // Mantiene lo stato finale nel tratto 210–220 ms del velo.
        panel.style.opacity = '0'
        backdrop.style.opacity = '0'
        const remove = () => {
            exits.delete(remove)
            for (const animation of running) animation.cancel()
            snapshot.remove()
        }
        exits.add(remove)
        if (running.length) void Promise.allSettled(running.map((a) => a.finished)).then(remove)
        else remove()
    })
}
