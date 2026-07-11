import { getCurrentScope, onScopeDispose, ref } from 'vue'
import { bindTalosPointerSession } from '../lib/talosPointerSession'
import { isTalosWindowId, type TalosWindowId, type TalosWindowPosition, type TalosWindowSize } from '../lib/talosWindowRegistry'

export type TalosWindowResizeEdge = 'top' | 'right' | 'bottom' | 'left' | 'top-right' | 'bottom-right' | 'bottom-left' | 'top-left'

export function useTalosWindowInteractions(options: {
    isDocked: (id: TalosWindowId) => boolean
    isFullscreen: (id: TalosWindowId) => boolean
    positionFor: (id: TalosWindowId) => TalosWindowPosition
    sizeFor: (id: TalosWindowId) => TalosWindowSize
    focus: (id: TalosWindowId) => void
    setPosition: (id: TalosWindowId, position: TalosWindowPosition) => void
    setBounds: (id: TalosWindowId, bounds: TalosWindowPosition & TalosWindowSize) => void
    saveLayout: () => void
}) {
    const interactingWindowId = ref<TalosWindowId | null>(null)
    let stopDragSession: (() => void) | null = null
    let stopResizeSession: (() => void) | null = null

    function stopWindowDrag() {
        const stop = stopDragSession
        stopDragSession = null
        stop?.()
    }

    function stopWindowResize() {
        const stop = stopResizeSession
        stopResizeSession = null
        stop?.()
    }

    function finishInteraction() {
        document.body.style.userSelect = ''
        interactingWindowId.value = null
        options.saveLayout()
    }

    function cancelWindowInteraction() {
        stopWindowDrag()
        stopWindowResize()
    }

    function canInteract(id: string, event: PointerEvent): id is TalosWindowId {
        return isTalosWindowId(id)
            && event.button === 0
            && !options.isDocked(id)
            && !options.isFullscreen(id)
    }

    function pointerTarget(event: PointerEvent) {
        return event.currentTarget instanceof HTMLElement ? event.currentTarget : null
    }

    function startWindowDrag(id: string, event: PointerEvent) {
        if (!canInteract(id, event)) return
        const target = pointerTarget(event)
        if (!target) return
        event.preventDefault()
        options.focus(id)

        const initialPosition = options.positionFor(id)
        const startX = event.clientX
        const startY = event.clientY
        stopWindowDrag()
        stopWindowResize()
        interactingWindowId.value = id
        document.body.style.userSelect = 'none'

        stopDragSession = bindTalosPointerSession({
            target,
            pointerId: event.pointerId,
            onMove: (moveEvent) => options.setPosition(id, {
                x: initialPosition.x + (moveEvent.clientX - startX),
                y: initialPosition.y + (moveEvent.clientY - startY),
            }),
            onFinish: () => {
                stopDragSession = null
                finishInteraction()
            },
        })
    }

    function startWindowResize(id: string, edge: TalosWindowResizeEdge, event: PointerEvent) {
        if (!canInteract(id, event)) return
        const target = pointerTarget(event)
        if (!target) return
        event.preventDefault()
        options.focus(id)

        const initialPosition = options.positionFor(id)
        const initialSize = options.sizeFor(id)
        const startX = event.clientX
        const startY = event.clientY
        stopWindowResize()
        stopWindowDrag()
        interactingWindowId.value = id
        document.body.style.userSelect = 'none'

        stopResizeSession = bindTalosPointerSession({
            target,
            pointerId: event.pointerId,
            onMove: (moveEvent) => {
                const deltaX = moveEvent.clientX - startX
                const deltaY = moveEvent.clientY - startY
                const nextPosition = { ...initialPosition }
                const nextSize = { ...initialSize }
                if (edge.includes('right')) nextSize.width = initialSize.width + deltaX
                if (edge.includes('left')) {
                    nextSize.width = initialSize.width - deltaX
                    nextPosition.x = initialPosition.x + deltaX
                }
                if (edge.includes('bottom')) nextSize.height = initialSize.height + deltaY
                if (edge.includes('top')) {
                    nextSize.height = initialSize.height - deltaY
                    nextPosition.y = initialPosition.y + deltaY
                }
                options.setBounds(id, { ...nextPosition, ...nextSize })
            },
            onFinish: () => {
                stopResizeSession = null
                finishInteraction()
            },
        })
    }

    if (getCurrentScope()) {
        onScopeDispose(() => {
            stopWindowDrag()
            stopWindowResize()
            document.body.style.userSelect = ''
        })
    }

    return {
        interactingWindowId,
        startWindowDrag,
        startWindowResize,
        cancelWindowInteraction,
        stopWindowDrag,
        stopWindowResize,
    }
}
