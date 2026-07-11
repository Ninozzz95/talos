export type TalosPointerSessionEndReason = 'pointerup' | 'pointercancel' | 'lostpointercapture' | 'blur' | 'escape' | 'manual'

export function bindTalosPointerSession(options: {
    target: HTMLElement
    pointerId: number
    onMove: (event: PointerEvent) => void
    onFinish: (reason: TalosPointerSessionEndReason) => void
}) {
    let finished = false

    const finish = (reason: TalosPointerSessionEndReason) => {
        if (finished) return
        finished = true
        window.removeEventListener('pointermove', handleMove)
        window.removeEventListener('pointerup', handlePointerUp)
        window.removeEventListener('pointercancel', handlePointerCancel)
        window.removeEventListener('blur', handleBlur)
        document.removeEventListener('keydown', handleKeydown)
        options.target.removeEventListener('lostpointercapture', handleLostPointerCapture)
        try {
            if (options.target.hasPointerCapture?.(options.pointerId)) {
                options.target.releasePointerCapture(options.pointerId)
            }
        } catch {
            // Pointer capture can already be gone after browser-level cancellation.
        }
        options.onFinish(reason)
    }

    const handleMove = (event: PointerEvent) => {
        if (event.pointerId === options.pointerId) options.onMove(event)
    }
    const handlePointerUp = (event: PointerEvent) => {
        if (event.pointerId === options.pointerId) finish('pointerup')
    }
    const handlePointerCancel = (event: PointerEvent) => {
        if (event.pointerId === options.pointerId) finish('pointercancel')
    }
    const handleLostPointerCapture = (event: PointerEvent) => {
        if (event.pointerId === options.pointerId) finish('lostpointercapture')
    }
    const handleBlur = () => finish('blur')
    const handleKeydown = (event: KeyboardEvent) => {
        if (event.key === 'Escape') {
            event.preventDefault()
            event.stopPropagation()
            finish('escape')
        }
    }

    window.addEventListener('pointermove', handleMove)
    window.addEventListener('pointerup', handlePointerUp)
    window.addEventListener('pointercancel', handlePointerCancel)
    window.addEventListener('blur', handleBlur)
    document.addEventListener('keydown', handleKeydown)
    options.target.addEventListener('lostpointercapture', handleLostPointerCapture)
    try {
        options.target.setPointerCapture?.(options.pointerId)
    } catch {
        // The session remains guarded by window-level listeners when capture is unavailable.
    }

    return () => finish('manual')
}
