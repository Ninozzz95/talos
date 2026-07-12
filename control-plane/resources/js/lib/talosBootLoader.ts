export interface TalosBootScheduler {
    requestFrame: (callback: FrameRequestCallback) => number
    setDelay: (callback: () => void, delayMs: number) => unknown
    clearDelay: (handle: unknown) => void
    now: () => number
}

const TALOS_BOOT_MIN_VISIBLE_MS = 2_000
const TALOS_BOOT_EXIT_FALLBACK_MS = 480
const TALOS_BOOT_ACCENT_PATTERN = /^#[0-9a-f]{6}$/i

const defaultScheduler: TalosBootScheduler = {
    requestFrame: (callback) => window.requestAnimationFrame(callback),
    setDelay: (callback, delayMs) => window.setTimeout(callback, delayMs),
    clearDelay: (handle) => window.clearTimeout(handle as number),
    now: () => window.performance.now(),
}

const bootLoader = (): HTMLElement | null => document.querySelector<HTMLElement>('[data-talos-boot-loader="true"]')

const applyTalosBootAccent = (accent: string): boolean => {
    const normalized = accent.trim().toLowerCase()
    if (!TALOS_BOOT_ACCENT_PATTERN.test(normalized)) return false

    bootLoader()?.style.setProperty('--talos-boot-accent', normalized)
    return true
}

export const syncTalosBootAccent = (themeRoot: HTMLElement): void => {
    const accent = window.getComputedStyle(themeRoot).getPropertyValue('--talos-accent').trim()
    applyTalosBootAccent(accent)
}

export const scheduleTalosBootCompletion = (
    workspaceRoot: HTMLElement,
    scheduler: TalosBootScheduler = defaultScheduler,
): void => {
    scheduler.requestFrame(() => {
        scheduler.requestFrame(() => {
            workspaceRoot.dataset.talosAppReady = 'true'
            workspaceRoot.setAttribute('aria-busy', 'false')
            document.body.classList.remove('talos-boot-shell')

            const loader = bootLoader()
            if (!loader) return

            let removed = false
            let fallbackHandle: unknown

            const removeLoader = (): void => {
                if (removed) return
                removed = true
                loader.removeEventListener('transitionend', handleTransitionEnd)
                scheduler.clearDelay(fallbackHandle)
                loader.remove()
            }

            const handleTransitionEnd = (event: Event): void => {
                if (event.target === loader) removeLoader()
            }

            const beginExit = (): void => {
                loader.addEventListener('transitionend', handleTransitionEnd)
                fallbackHandle = scheduler.setDelay(removeLoader, TALOS_BOOT_EXIT_FALLBACK_MS)
                loader.dataset.state = 'leaving'
            }

            const remainingVisibleMs = TALOS_BOOT_MIN_VISIBLE_MS - scheduler.now()
            if (remainingVisibleMs > 0) {
                scheduler.setDelay(beginExit, remainingVisibleMs)
                return
            }

            beginExit()
        })
    })
}

export const failTalosBootLoader = (workspaceRoot: HTMLElement): void => {
    workspaceRoot.dataset.talosAppReady = 'false'
    workspaceRoot.setAttribute('aria-busy', 'false')

    const loader = bootLoader()
    if (!loader) return

    loader.dataset.state = 'failed'
    loader.setAttribute('aria-live', 'assertive')

    const status = loader.querySelector<HTMLElement>('[data-talos-boot-status]')
    if (status) status.textContent = 'TALOS could not start.'

    const timeout = loader.querySelector<HTMLElement>('[data-talos-boot-timeout]')
    if (timeout) timeout.hidden = false
}
