<script setup lang="ts">
import { computed, defineAsyncComponent, defineComponent, h, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import TalosLineLoader from '@/components/brand/TalosLineLoader.vue'
import TalosMobileReasoningBlock from '@/components/chat/TalosMobileReasoningBlock.vue'
import TalosMobileTraceRow from '@/components/chat/TalosMobileTraceRow.vue'
import { Globe } from '@lucide/vue'
import { stabilizeStreamingTalosMarkdown } from '@/lib/streamingMarkdown'
import { useTalosTypewriterReveal } from '@/composables/useTalosTypewriterReveal'
import { useChatController } from '@/stores/chatController'

/**
 * R1-5 — the in-flight assistant reply, isolated. This component alone
 * subscribes to `streamingText`, so a token burst re-renders THIS subtree only.
 *
 * Owner 2026-07-25: "il rendering del messaggio progressivo è troppo scattante…
 * ogni lettera stampata in modo fluido… stile typewriter con mini prompt alla
 * fine". Two halves:
 *  - PACING: characters are revealed on a frame clock, not at chunk-arrival
 *    pace (see lib/typewriterPacing.ts).
 *  - PAINTING: markdown re-parsing costs 4–16ms — impossible at 60fps — so the
 *    parsed prefix stays throttled while the freshly revealed TAIL is written
 *    straight into the DOM, one character span per letter, appended to the last
 *    rendered block so it flows inline instead of jumping to a new line.
 * The caret rides at the end of that tail, so it sits exactly where the next
 * letter will appear.
 */
const controller = useChatController()
const state = controller.chat.state

const streamingText = computed(() => state.streamingText ?? '')
// The tool block: what TALOS is doing right now, in the user's words rather
// than the wire names. Silence while a model searches your Library looks
// identical to a hang.
const TOOL_LABELS: Record<string, string> = {
    library_search: 'Searching your Library',
    library_read: 'Reading a document',
    notes_list: 'Looking at your notes',
    tasks_list: 'Looking at your tasks',
    memory_search: 'Checking what it remembers',
    time_now: 'Checking the time',
}
const runningTools = computed(() => controller.toolActivity.value
    .map((name) => TOOL_LABELS[name] ?? name))
// Defect #5: reasoning streams on its own channel, so it can appear before the
// first letter of the answer — which is exactly when it is most useful.
const streamingReasoning = computed(() => state.streamingReasoning ?? '')
const sending = computed(() => state.sending)

const { revealed } = useTalosTypewriterReveal(streamingText)

const PlainMessage = defineComponent({
    props: { content: { type: String, required: true } },
    setup(plainProps) {
        return () => h('p', { class: 'whitespace-pre-wrap break-words [overflow-wrap:anywhere]' }, plainProps.content)
    },
})
const TalosMobileMessageContent = defineAsyncComponent({
    loader: () => import('@/components/chat/TalosMobileMessageContent.vue'),
    delay: 0,
    loadingComponent: PlainMessage,
})

// The markdown prefix: throttled on purpose (measured 4–16ms per parse).
const parsedSource = ref('')
const parsedMarkdown = ref('')
let parseThrottle: ReturnType<typeof setTimeout> | null = null

function parseNow(text: string): void {
    parsedSource.value = text
    parsedMarkdown.value = stabilizeStreamingTalosMarkdown(text)
}

watch(revealed, (text) => {
    if (!text) {
        if (parseThrottle !== null) clearTimeout(parseThrottle)
        parseThrottle = null
        parsedSource.value = ''
        parsedMarkdown.value = ''
        return
    }
    if (!parsedMarkdown.value) parseNow(text)
    if (parseThrottle !== null) return
    parseThrottle = setTimeout(() => {
        parseThrottle = null
        parseNow(revealed.value)
    }, 110)
}, { immediate: true })

const NEWLINE = String.fromCharCode(10)

// ---- the smooth tail -------------------------------------------------------
const contentHost = ref<HTMLElement | null>(null)
let tailHost: HTMLElement | null = null
let caretEl: HTMLElement | null = null
let paintedTail = ''

// SF-MINOR: void and table-structural elements cannot hold the tail — letters
// appended into an <hr> or a <tr> are simply never painted.
const TAIL_REFUSED = new Set(['HR', 'BR', 'IMG', 'INPUT', 'TABLE', 'THEAD', 'TBODY', 'TFOOT', 'TR', 'COL', 'COLGROUP'])

/** The deepest last block, so the tail continues the current line. */
function tailTarget(): HTMLElement | null {
    // SF-CRITICAL: the markdown renderer is a lazy chunk. While it loads there
    // is no `.talos-message-content`, and falling back to the <article> put the
    // tail inside the sr-only aria-live region — orphaned there for the rest of
    // the reply, re-announcing the whole text on every frame.
    const root = contentHost.value?.querySelector<HTMLElement>('.talos-message-content')
    if (!root) return null
    let node: HTMLElement = root
    for (;;) {
        const children = [...node.children].filter((child) => child !== tailHost)
        const last = children.at(-1) as HTMLElement | undefined
        if (!last || TAIL_REFUSED.has(last.tagName)) return node
        // Inside a fence the tail belongs to the <code>, never after the <pre>.
        if (last.tagName === 'PRE') return last.querySelector('code') ?? last
        node = last
    }
}

function ensureTail(): HTMLElement | null {
    const target = tailTarget()
    if (!target) return null
    if (!tailHost) {
        tailHost = document.createElement('span')
        tailHost.className = 'talos-stream-tail'
        tailHost.setAttribute('data-testid', 'talos-stream-tail')
    }
    if (!caretEl) {
        caretEl = document.createElement('span')
        caretEl.className = 'talos-stream-caret'
        caretEl.setAttribute('data-testid', 'talos-stream-caret')
        caretEl.setAttribute('aria-hidden', 'true')
    }
    if (tailHost.parentElement !== target) target.append(tailHost)
    if (caretEl.parentElement !== tailHost) tailHost.append(caretEl)
    return tailHost
}

function appendChars(host: HTMLElement, text: string): void {
    for (const char of text) {
        if (char === '\n' || char === ' ' || char === '\t') {
            host.insertBefore(document.createTextNode(char), caretEl)
            continue
        }
        // One span per letter: the ONLY node that animates is the new one, so
        // the text already on screen never re-lays-out or re-animates.
        const span = document.createElement('span')
        span.className = 'talos-stream-char'
        span.textContent = char
        host.insertBefore(span, caretEl)
    }
}

function syncTail(): void {
    if (!sending.value) return
    const pending = revealed.value.slice(parsedSource.value.length)
    // SF-MAJOR: everything after a newline is BLOCK syntax (`- `, `## `, `|`,
    // `---`). Painted as raw text into the previous block it shows the markers
    // and lands in the wrong container (inside the last <li>, the last <td>)
    // until the next parse moves it. Let the parse own it right away instead.
    if (pending.includes(NEWLINE)) {
        if (parseThrottle !== null) clearTimeout(parseThrottle)
        parseThrottle = null
        parseNow(revealed.value)
        return
    }
    const host = ensureTail()
    if (!host) return
    const tail = pending
    if (tail === paintedTail) return
    if (!tail.startsWith(paintedTail)) {
        // The parse absorbed the tail (or the reply reset): start it over.
        while (host.firstChild && host.firstChild !== caretEl) host.firstChild.remove()
        paintedTail = ''
    }
    appendChars(host, tail.slice(paintedTail.length))
    paintedTail = tail
}

watch(revealed, () => { void nextTick(syncTail) }, { immediate: true })
watch(parsedMarkdown, () => {
    // v-html replaces the subtree, but a tail injected OUTSIDE it (or into a
    // node the new render kept) would survive — remove it explicitly.
    tailHost?.remove()
    tailHost = null
    caretEl = null
    paintedTail = ''
    void nextTick(syncTail)
})

onBeforeUnmount(() => {
    if (parseThrottle !== null) clearTimeout(parseThrottle)
    tailHost = null
    caretEl = null
})
</script>

<template>
    <article
        v-if="sending && (revealed || streamingReasoning.trim() || runningTools.length)"
        ref="contentHost"
        data-testid="talos-mobile-streaming"
        class="w-full max-w-full px-1 py-1 leading-6 text-[var(--talos-text,var(--foreground))]"
    >
        <!-- The growing text stays OUTSIDE any live region: re-announcing
             the whole reply on every token is screen-reader noise. -->
        <!-- Owner 2026-07-26: in the Claude screenshot the tool line and the
             reasoning line are the SAME muted row. These used to be bordered
             chips, which sat next to a borderless reasoning row and looked like
             two different features. -->
        <div v-if="runningTools.length" data-testid="talos-tool-activity" class="mb-0.5">
            <TalosMobileTraceRow
                v-for="label in runningTools"
                :key="label"
                :label="`${label}…`"
                live
                :interactive="false"
            >
                <template #icon>
                    <Globe class="size-3.5" />
                </template>
            </TalosMobileTraceRow>
        </div>
        <TalosMobileReasoningBlock v-if="streamingReasoning" :reasoning="streamingReasoning" live />
        <TalosMobileMessageContent :content="parsedMarkdown" />
        <span class="sr-only" role="status" aria-live="polite">Receiving response</span>
    </article>
    <!-- Owner 2026-07-25: while waiting there is NO container — just the mark.
         It disappears the instant the first letter is painted. -->
    <div
        v-else-if="sending"
        data-testid="talos-mobile-typing"
        class="self-start px-1 py-1 text-[var(--talos-muted,var(--muted-foreground))]"
        role="status"
        aria-live="polite"
    >
        <!-- F4-#24 (owner): boot-logo styled loader — a line crossing 3
             empty nodes; each node fills as the line passes through it. -->
        <TalosLineLoader :width="44" />
        <span class="sr-only">Processing</span>
    </div>
</template>
