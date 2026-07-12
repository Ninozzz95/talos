import type { TalosInteractionKeyframe, TalosInteractionMotionPlan } from './resolver'

export type InteractionAnimationHandle = Readonly<{ cancel: () => void }>
export type InteractionAnimationOptions = Readonly<{ durationMs: number; delayMs: number; easing: string }>

export type InteractionMotionPlatform = {
    animate: (
        target: unknown,
        keyframes: readonly TalosInteractionKeyframe[],
        options: InteractionAnimationOptions,
        complete: () => void,
    ) => InteractionAnimationHandle
    applyFinal: (target: unknown, style: TalosInteractionKeyframe) => void
    captureFocus: () => unknown
    restoreFocus: (focus: unknown) => void
}

export type InteractionMotionControllerOptions = Readonly<{
    onFault?: (fault: unknown) => void
}>

export type InteractionMotionRunOptions = Readonly<{
    preserveFocus?: boolean
    onComplete?: () => void
}>

export type InteractionMotionController = Readonly<{
    run: (key: string, target: unknown, plan: TalosInteractionMotionPlan, options?: InteractionMotionRunOptions) => number
    cancel: (key: string) => void
    dispose: () => void
    pendingCount: () => number
}>

type PendingTransition = {
    key: string
    revision: number
    target: unknown
    plan: TalosInteractionMotionPlan
    focus: unknown
    preserveFocus: boolean
    onComplete?: () => void
    handle: InteractionAnimationHandle | null
    handleAssigned: boolean
    finishRequested: boolean
}

export function createInteractionMotionController(
    platform: InteractionMotionPlatform,
    options: InteractionMotionControllerOptions = {},
): InteractionMotionController {
    const pending = new Map<string, PendingTransition>()
    const revisions = new Map<string, number>()
    let disposed = false

    const fault = (cause: unknown): void => {
        try { options.onFault?.(cause) } catch { /* Fault observers cannot destabilize UI state. */ }
    }

    const safeCancel = (entry: PendingTransition): void => {
        try { entry.handle?.cancel() } catch (cause) { fault(cause) }
    }

    const cancel = (key: string): void => {
        const entry = pending.get(key)
        revisions.set(key, (revisions.get(key) ?? 0) + 1)
        if (!entry) return
        pending.delete(key)
        safeCancel(entry)
    }

    const complete = (entry: PendingTransition): void => {
        if (disposed || revisions.get(entry.key) !== entry.revision || pending.get(entry.key) !== entry) return
        if (!entry.handleAssigned) {
            entry.finishRequested = true
            return
        }
        pending.delete(entry.key)
        try { platform.applyFinal(entry.target, entry.plan.finalStyle) } catch (cause) { fault(cause) } finally { safeCancel(entry) }
        if (entry.preserveFocus) {
            try { platform.restoreFocus(entry.focus) } catch (cause) { fault(cause) }
        }
        try { entry.onComplete?.() } catch (cause) { fault(cause) }
    }

    const finishWithoutAnimation = (entry: PendingTransition): void => {
        entry.handleAssigned = true
        complete(entry)
    }

    const run = (
        key: string,
        target: unknown,
        plan: TalosInteractionMotionPlan,
        runOptions: InteractionMotionRunOptions = {},
    ): number => {
        if (disposed) return revisions.get(key) ?? 0
        cancel(key)
        const revision = (revisions.get(key) ?? 0) + 1
        revisions.set(key, revision)
        let focus: unknown
        try { focus = platform.captureFocus() } catch (cause) { fault(cause) }
        const entry: PendingTransition = {
            key,
            revision,
            target,
            plan,
            focus,
            preserveFocus: runOptions.preserveFocus !== false,
            onComplete: runOptions.onComplete,
            handle: null,
            handleAssigned: false,
            finishRequested: false,
        }
        pending.set(key, entry)

        if (!plan.enabled || plan.durationMs <= 0) {
            finishWithoutAnimation(entry)
            return revision
        }

        try {
            entry.handle = platform.animate(target, plan.keyframes, {
                durationMs: plan.durationMs,
                delayMs: plan.delayMs,
                easing: plan.easing,
            }, () => complete(entry))
            entry.handleAssigned = true
            if (entry.finishRequested) complete(entry)
        } catch (cause) {
            fault(cause)
            entry.handleAssigned = true
            complete(entry)
        }
        return revision
    }

    const dispose = (): void => {
        if (disposed) return
        disposed = true
        for (const entry of pending.values()) safeCancel(entry)
        pending.clear()
        for (const key of revisions.keys()) revisions.set(key, (revisions.get(key) ?? 0) + 1)
    }

    return Object.freeze({ run, cancel, dispose, pendingCount: () => pending.size })
}

type DomDocumentLike = Pick<Document, 'activeElement'>

export function createDomInteractionMotionPlatform(documentLike?: DomDocumentLike): InteractionMotionPlatform {
    const ownerDocument = documentLike ?? globalThis.document

    return {
        animate: (target, keyframes, options, complete): InteractionAnimationHandle => {
            const element = target as Element
            if (!element || typeof element.animate !== 'function') {
                complete()
                return Object.freeze({ cancel: () => {} })
            }
            const animation = element.animate(keyframes.map((frame) => ({ ...frame })), {
                duration: options.durationMs,
                delay: options.delayMs,
                easing: options.easing,
                fill: 'both',
            })
            let active = true
            const finish = (): void => {
                if (!active) return
                active = false
                animation.removeEventListener('finish', finish)
                complete()
            }
            animation.addEventListener('finish', finish, { once: true })
            return Object.freeze({
                cancel: () => {
                    if (active) {
                        active = false
                        animation.removeEventListener('finish', finish)
                    }
                    animation.cancel()
                },
            })
        },
        applyFinal: (target, style): void => {
            const element = target as HTMLElement
            if (!element?.style) throw new TypeError('Interaction motion target must expose a style object.')
            element.style.transform = style.transform
            element.style.opacity = String(style.opacity)
        },
        captureFocus: (): unknown => ownerDocument?.activeElement ?? null,
        restoreFocus: (focus): void => {
            if (typeof focus === 'object' && focus !== null && typeof (focus as HTMLElement).focus === 'function') (focus as HTMLElement).focus({ preventScroll: true })
        },
    }
}
