import { nextTick, ref, type Readonly, type Ref } from 'vue'

export type TalosChatViewportController = {
    atLiveEdge: Readonly<Ref<boolean>>
    unseenCount: Readonly<Ref<number>>
    registerThread: (element: HTMLElement | null) => void
    registerComposer: (element: HTMLElement | null) => void
    centerMessage: (messageId: string, behavior?: ScrollBehavior) => Promise<void>
    followLatest: (behavior?: ScrollBehavior) => Promise<void>
    noteIncomingContent: () => void
}

const FALLBACK_COMPOSER_HEIGHT = 168
const LIVE_EDGE_THRESHOLD = 56

function resolvedBehavior(behavior: ScrollBehavior = 'smooth'): ScrollBehavior {
    if (typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
        return 'auto'
    }

    return behavior
}

function frame() {
    return new Promise<void>((resolve) => window.requestAnimationFrame(() => resolve()))
}

export function useTalosChatViewport(): TalosChatViewportController {
    const thread = ref<HTMLElement | null>(null)
    const composer = ref<HTMLElement | null>(null)
    const atLiveEdge = ref(true)
    const unseenCount = ref(0)
    let resizeObserver: ResizeObserver | null = null
    let observedThread: HTMLElement | null = null
    let ignoreScroll = false

    function updateLiveEdge() {
        const element = thread.value
        if (!element) return
        if (ignoreScroll) return

        const distance = element.scrollHeight - element.scrollTop - element.clientHeight
        const wasAtLiveEdge = atLiveEdge.value
        atLiveEdge.value = distance <= LIVE_EDGE_THRESHOLD
        if (atLiveEdge.value) {
            unseenCount.value = 0
        } else if (wasAtLiveEdge) {
            unseenCount.value = 0
        }
    }

    function registerThread(element: HTMLElement | null) {
        if (observedThread) {
            observedThread.removeEventListener('scroll', updateLiveEdge)
        }

        thread.value = element
        observedThread = element
        element?.addEventListener('scroll', updateLiveEdge, { passive: true })
        updateLiveEdge()
    }

    function setComposerHeight(element: HTMLElement, height: number) {
        const workspace = element.closest<HTMLElement>('.talos-workspace')
        const target = workspace ?? document.documentElement
        const measuredHeight = element.getBoundingClientRect().height || height
        target.style.setProperty('--talos-composer-height', `${Math.ceil(measuredHeight)}px`)
    }

    function registerComposer(element: HTMLElement | null) {
        resizeObserver?.disconnect()
        resizeObserver = null
        composer.value = element
        if (!element) return

        setComposerHeight(element, FALLBACK_COMPOSER_HEIGHT)
        if (typeof ResizeObserver === 'undefined') {
            setComposerHeight(element, element.getBoundingClientRect().height || FALLBACK_COMPOSER_HEIGHT)
            return
        }

        resizeObserver = new ResizeObserver(([entry]) => {
            if (entry) setComposerHeight(element, entry.contentRect.height)
        })
        resizeObserver.observe(element)
    }

    async function followLatest(behavior: ScrollBehavior = 'smooth') {
        await nextTick()
        await frame()
        const element = thread.value
        if (!element) return

        element.style.paddingBottom = ''
        element.style.removeProperty('--talos-chat-focus-top')
        ignoreScroll = true
        element.scrollTo({ top: element.scrollHeight, behavior: resolvedBehavior(behavior) })
        atLiveEdge.value = true
        unseenCount.value = 0
        window.requestAnimationFrame(() => { ignoreScroll = false })
    }

    async function centerMessage(messageId: string, behavior: ScrollBehavior = 'smooth') {
        await nextTick()
        await frame()
        const element = thread.value
        const message = element?.querySelector<HTMLElement>(`[data-message-id="${CSS.escape(messageId)}"]`)
        if (!element || !message) return

        element.style.setProperty('--talos-chat-focus-top', '0px')
        await frame()
        const composerTop = composer.value?.getBoundingClientRect().top ?? window.innerHeight
        const threadRect = element.getBoundingClientRect()
        const availableHeight = Math.max(1, Math.min(element.clientHeight, composerTop - threadRect.top))
        const targetCenter = availableHeight / 2
        let messageRect = message.getBoundingClientRect()
        let currentCenter = messageRect.top - threadRect.top + (messageRect.height / 2)
        const focusTop = Math.max(0, targetCenter - currentCenter)
        if (focusTop > 0) {
            element.style.setProperty('--talos-chat-focus-top', `${Math.ceil(focusTop)}px`)
            await frame()
            messageRect = message.getBoundingClientRect()
            currentCenter = messageRect.top - threadRect.top + (messageRect.height / 2)
        }
        element.style.paddingBottom = 'calc(var(--talos-composer-height, 168px) + env(safe-area-inset-bottom) + 48px + 50vh)'
        const nextTop = Math.max(0, element.scrollTop + currentCenter - targetCenter)

        ignoreScroll = true
        element.scrollTo({ top: nextTop, behavior: resolvedBehavior(behavior) })
        atLiveEdge.value = true
        unseenCount.value = 0
        window.requestAnimationFrame(() => { ignoreScroll = false })
    }

    function noteIncomingContent() {
        if (atLiveEdge.value) return
        unseenCount.value += 1
    }

    return {
        atLiveEdge,
        unseenCount,
        registerThread,
        registerComposer,
        centerMessage,
        followLatest,
        noteIncomingContent,
    }
}
