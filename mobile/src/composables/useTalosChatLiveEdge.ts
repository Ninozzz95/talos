import { ref, type Ref } from 'vue'

/**
 * F5-#28 — live-edge follow policy for the chat scroll. The old anchoring
 * used a 120px "scrolled up" threshold, which races the finger during a
 * dense stream: every token re-anchored before the drag could clear the
 * threshold. The contract here is gesture-sovereign:
 *   - an ACTIVE touch blocks auto-scroll outright;
 *   - ANY upward user scroll (not caused by our own markAutoScroll target)
 *     detaches the follow immediately;
 *   - re-attachment is explicit: the user reaches the bottom again, or taps
 *     the back-to-bottom pill (`rejoin`).
 */
export interface TalosChatScrollMetrics {
    scrollTop: number
    scrollHeight: number
    clientHeight: number
}

export interface TalosChatLiveEdge {
    followLive: Ref<boolean>
    showPill: Ref<boolean>
    touchStart(): void
    touchEnd(): void
    onScroll(metrics: TalosChatScrollMetrics): void
    markAutoScroll(top: number): void
    canAutoScroll(): boolean
    rejoin(): void
}

const AT_BOTTOM_PX = 24
const PILL_DISTANCE_PX = 160
const AUTO_SCROLL_TOLERANCE_PX = 8
const UPWARD_JITTER_PX = 2

export function createTalosChatLiveEdge(): TalosChatLiveEdge {
    const followLive = ref(true)
    const showPill = ref(false)
    let touchActive = false
    let lastScrollTop = 0
    let autoScrollTarget: number | null = null

    function onScroll(metrics: TalosChatScrollMetrics): void {
        const distance = metrics.scrollHeight - metrics.scrollTop - metrics.clientHeight
        const isAuto = autoScrollTarget !== null
            && Math.abs(metrics.scrollTop - autoScrollTarget) <= AUTO_SCROLL_TOLERANCE_PX
        const userWentUp = !isAuto && metrics.scrollTop < lastScrollTop - UPWARD_JITTER_PX
        if (userWentUp) {
            // The detach wins over the at-bottom re-attach within the SAME
            // event: near the edge a few upward pixels still mean "stop".
            followLive.value = false
        } else if (distance <= AT_BOTTOM_PX) {
            followLive.value = true
        }
        showPill.value = !followLive.value && distance > PILL_DISTANCE_PX
        lastScrollTop = metrics.scrollTop
        if (isAuto) autoScrollTarget = null
    }

    return {
        followLive,
        showPill,
        touchStart() { touchActive = true },
        touchEnd() { touchActive = false },
        onScroll,
        markAutoScroll(top: number) {
            autoScrollTarget = top
        },
        canAutoScroll() {
            return followLive.value && !touchActive
        },
        rejoin() {
            followLive.value = true
            showPill.value = false
        },
    }
}
