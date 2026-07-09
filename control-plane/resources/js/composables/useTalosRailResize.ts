import { onBeforeUnmount, type Ref } from 'vue'

export function useTalosRailResize(
    railCollapsed: Ref<boolean>,
    railWidth: Ref<number>,
    minWidth = 204,
    maxWidth = 304,
) {
    let stopRailResizeListeners: (() => void) | null = null

    function stopRailResize() {
        if (stopRailResizeListeners) {
            stopRailResizeListeners()
            stopRailResizeListeners = null
        }
    }

    function startRailResize(event: PointerEvent) {
        if (railCollapsed.value || event.button !== 0) {
            return
        }
        event.preventDefault()
        const startX = event.clientX
        const startWidth = railWidth.value
        stopRailResize()
        document.body.style.userSelect = 'none'
        const handleMove = (moveEvent: PointerEvent) => {
            railWidth.value = Math.min(maxWidth, Math.max(minWidth, startWidth + (moveEvent.clientX - startX)))
        }
        const stop = () => {
            window.removeEventListener('pointermove', handleMove)
            window.removeEventListener('pointerup', stop)
            window.removeEventListener('pointercancel', stop)
            document.body.style.userSelect = ''
        }
        window.addEventListener('pointermove', handleMove)
        window.addEventListener('pointerup', stop)
        window.addEventListener('pointercancel', stop)
        stopRailResizeListeners = stop
    }

    onBeforeUnmount(stopRailResize)

    return {
        startRailResize,
        stopRailResize,
    }
}
