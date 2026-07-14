import interact from 'interactjs'
import { getCurrentScope, onScopeDispose, ref } from 'vue'
import {
    resolveTalosWindowTileBounds,
    resolveTalosWindowTileTarget,
    type TalosWindowRect,
    type TalosWindowTileAreas,
    type TalosWindowTileBounds,
    type TalosWindowTileTarget,
} from '../lib/talosWindowTilePolicy'
import { type TalosWindowId } from '../lib/talosWindowRegistry'

export type TalosInteractEvent = {
    clientX: number
    clientY: number
    dx: number
    dy: number
    deltaRect?: { left: number; top: number; width: number; height: number }
    interaction?: { stop: () => void }
}

export type TalosInteractListenerMap = {
    start: (event: TalosInteractEvent) => void
    move: (event: TalosInteractEvent) => void
    end: (event: TalosInteractEvent) => void
}

type TalosInteractActionConfig = {
    listeners: TalosInteractListenerMap
    allowFrom?: string
    ignoreFrom?: string
    edges?: Record<string, string>
    modifiers?: unknown[]
}

type TalosInteractable = {
    draggable: (config: TalosInteractActionConfig) => TalosInteractable
    resizable: (config: TalosInteractActionConfig) => TalosInteractable
    unset: () => void
}

export type TalosInteractFactory = (element: HTMLElement) => TalosInteractable

type ActiveInteraction = {
    id: TalosWindowId
    kind: 'drag' | 'resize'
    bounds: TalosWindowTileBounds
    restoreBounds: TalosWindowTileBounds
    stop: (() => void) | null
}

export type TalosWindowInteractionState = Readonly<{
    id: TalosWindowId
    kind: ActiveInteraction['kind']
    active: boolean
}>

function roundBounds(bounds: TalosWindowTileBounds): TalosWindowTileBounds {
    return {
        x: Math.round(bounds.x),
        y: Math.round(bounds.y),
        width: Math.round(bounds.width),
        height: Math.round(bounds.height),
    }
}

function defaultInteractFactory(element: HTMLElement): TalosInteractable {
    return interact(element) as unknown as TalosInteractable
}

export function useTalosWindowInteractions(options: {
    isDocked: (id: TalosWindowId) => boolean
    isFullscreen: (id: TalosWindowId) => boolean
    tileTargetFor: (id: TalosWindowId) => TalosWindowTileTarget
    boundsFor: (id: TalosWindowId) => TalosWindowTileBounds
    restoreBoundsFor: (id: TalosWindowId) => TalosWindowTileBounds | null
    stageRect: () => TalosWindowRect | null
    tileAreas: () => TalosWindowTileAreas
    focus: (id: TalosWindowId) => void
    setBounds: (id: TalosWindowId, bounds: TalosWindowTileBounds) => void
    tile: (
        id: TalosWindowId,
        target: Exclude<TalosWindowTileTarget, 'none'>,
        restoreBounds: TalosWindowTileBounds,
    ) => void
    untile: (id: TalosWindowId, bounds: TalosWindowTileBounds) => void
    saveLayout: () => void
    onInteractionChange?: (state: TalosWindowInteractionState) => void
    interactFactory?: TalosInteractFactory
}) {
    const interactingWindowId = ref<TalosWindowId | null>(null)
    const interactingWindowKind = ref<ActiveInteraction['kind'] | null>(null)
    const previewTarget = ref<TalosWindowTileTarget>('none')
    const previewBounds = ref<TalosWindowTileBounds | null>(null)
    const interactables = new Map<TalosWindowId, { element: HTMLElement; interactable: TalosInteractable }>()
    const factory = options.interactFactory ?? defaultInteractFactory
    let active: ActiveInteraction | null = null
    let physicalPointer: { x: number; y: number } | null = null
    let physicalPointerObserved = false

    function clearPreview() {
        previewTarget.value = 'none'
        previewBounds.value = null
    }

    function canInteract(id: TalosWindowId) {
        return !options.isDocked(id) && !options.isFullscreen(id)
    }

    function restoredBoundsUnderPointer(id: TalosWindowId, event: TalosInteractEvent) {
        const current = options.boundsFor(id)
        const restore = options.restoreBoundsFor(id)
        if (!restore || current.width <= 0 || current.height <= 0) return current
        const horizontalRatio = Math.min(1, Math.max(0, (event.clientX - current.x) / current.width))
        const titleOffset = Math.min(48, Math.max(0, event.clientY - current.y))
        return roundBounds({
            x: event.clientX - (restore.width * horizontalRatio),
            y: event.clientY - titleOffset,
            width: restore.width,
            height: restore.height,
        })
    }

    function begin(id: TalosWindowId, kind: ActiveInteraction['kind'], event: TalosInteractEvent) {
        if (!canInteract(id)) return false
        const tileTarget = options.tileTargetFor(id)
        if (kind === 'resize' && tileTarget !== 'none' && tileTarget !== 'left-half' && tileTarget !== 'right-half') return false
        cancelWindowInteraction()
        options.focus(id)
        let bounds = { ...options.boundsFor(id) }
        if (kind === 'drag' && options.tileTargetFor(id) !== 'none') {
            bounds = restoredBoundsUnderPointer(id, event)
            options.untile(id, bounds)
        }
        active = {
            id,
            kind,
            bounds,
            restoreBounds: { ...bounds },
            stop: event.interaction?.stop ?? null,
        }
        physicalPointer = { x: event.clientX, y: event.clientY }
        physicalPointerObserved = false
        interactingWindowId.value = id
        interactingWindowKind.value = kind
        options.onInteractionChange?.({ id, kind, active: true })
        document.body.style.userSelect = 'none'
        return true
    }

    function updatePreview(pointer: { x: number; y: number }) {
        const stage = options.stageRect()
        if (!stage) {
            clearPreview()
            return
        }
        const target = resolveTalosWindowTileTarget({
            pointer,
            stage,
            previousTarget: previewTarget.value,
        })
        previewTarget.value = target
        previewBounds.value = resolveTalosWindowTileBounds(target, options.tileAreas())
    }

    function finish(commitTile: boolean) {
        const interaction = active
        if (!interaction) return
        const target = previewTarget.value
        active = null
        physicalPointer = null
        physicalPointerObserved = false
        interactingWindowId.value = null
        interactingWindowKind.value = null
        options.onInteractionChange?.({ id: interaction.id, kind: interaction.kind, active: false })
        document.body.style.userSelect = ''
        clearPreview()
        if (commitTile && interaction.kind === 'drag' && target !== 'none') {
            options.tile(interaction.id, target, interaction.restoreBounds)
        } else {
            options.saveLayout()
        }
    }

    function dragListeners(id: TalosWindowId): TalosInteractListenerMap {
        return {
            start: (event) => { begin(id, 'drag', event) },
            move: (event) => {
                if (!active || active.id !== id || active.kind !== 'drag') return
                active.bounds = roundBounds({
                    ...active.bounds,
                    x: active.bounds.x + event.dx,
                    y: active.bounds.y + event.dy,
                })
                options.setBounds(id, active.bounds)
                updatePreview(physicalPointerObserved && physicalPointer
                    ? physicalPointer
                    : { x: event.clientX, y: event.clientY })
            },
            end: () => finish(true),
        }
    }

    function resizeListeners(id: TalosWindowId): TalosInteractListenerMap {
        return {
            start: (event) => { begin(id, 'resize', event) },
            move: (event) => {
                if (!active || active.id !== id || active.kind !== 'resize' || !event.deltaRect) return
                active.bounds = roundBounds({
                    x: active.bounds.x + event.deltaRect.left,
                    y: active.bounds.y + event.deltaRect.top,
                    width: active.bounds.width + event.deltaRect.width,
                    height: active.bounds.height + event.deltaRect.height,
                })
                options.setBounds(id, active.bounds)
            },
            end: () => finish(false),
        }
    }

    function unbindWindowFrame(id: TalosWindowId) {
        const bound = interactables.get(id)
        if (!bound) return
        bound.interactable.unset()
        interactables.delete(id)
    }

    function bindWindowFrame(id: TalosWindowId, element: HTMLElement | null) {
        const existing = interactables.get(id)
        if (existing?.element === element) return
        unbindWindowFrame(id)
        if (!element) return

        const dragModifiers = options.interactFactory
            ? []
            : [interact.modifiers.restrictRect({ restriction: 'parent', endOnly: true })]
        const resizeModifiers = options.interactFactory
            ? []
            : [
                interact.modifiers.restrictEdges({ outer: 'parent', endOnly: false }),
                interact.modifiers.restrictSize({ min: { width: 280, height: 220 } }),
            ]
        const interactable = factory(element)
            .draggable({
                allowFrom: '.talos-window-drag-handle',
                ignoreFrom: 'button, a, input, textarea, select, [contenteditable="true"]',
                modifiers: dragModifiers,
                listeners: dragListeners(id),
            })
            .resizable({
                edges: {
                    left: '.talos-window-resize-left, .talos-window-resize-top-left, .talos-window-resize-bottom-left',
                    right: '.talos-window-resize-right, .talos-window-resize-top-right, .talos-window-resize-bottom-right',
                    top: '.talos-window-resize-top, .talos-window-resize-top-left, .talos-window-resize-top-right',
                    bottom: '.talos-window-resize-bottom, .talos-window-resize-bottom-left, .talos-window-resize-bottom-right',
                },
                modifiers: resizeModifiers,
                listeners: resizeListeners(id),
            })
        interactables.set(id, { element, interactable })
    }

    function cancelWindowInteraction() {
        const interaction = active
        if (!interaction) return
        interaction.stop?.()
        finish(false)
    }

    function handleKeydown(event: KeyboardEvent) {
        if (event.key !== 'Escape' || !active) return
        event.preventDefault()
        event.stopPropagation()
        cancelWindowInteraction()
    }

    function handlePhysicalPointerMove(event: PointerEvent) {
        if (!active || active.kind !== 'drag') return
        physicalPointer = { x: event.clientX, y: event.clientY }
        physicalPointerObserved = true
        updatePreview(physicalPointer)
    }

    document.addEventListener('keydown', handleKeydown)
    document.addEventListener('pointermove', handlePhysicalPointerMove, { capture: true })
    if (getCurrentScope()) {
        onScopeDispose(() => {
            cancelWindowInteraction()
            for (const id of [...interactables.keys()]) unbindWindowFrame(id)
            document.removeEventListener('keydown', handleKeydown)
            document.removeEventListener('pointermove', handlePhysicalPointerMove, { capture: true })
            document.body.style.userSelect = ''
        })
    }

    return {
        interactingWindowId,
        interactingWindowKind,
        previewTarget,
        previewBounds,
        bindWindowFrame,
        unbindWindowFrame,
        cancelWindowInteraction,
    }
}
