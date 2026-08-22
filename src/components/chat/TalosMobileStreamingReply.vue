<script setup lang="ts">
import { computed, defineAsyncComponent, defineComponent, h, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { useTalosI18n } from '@/i18n'
import TalosLineLoader from '@/components/brand/TalosLineLoader.vue'
import TalosMobileReasoningBlock from '@/components/chat/TalosMobileReasoningBlock.vue'
import TalosMobileRunningToolRow from '@/components/chat/TalosMobileRunningToolRow.vue'
import {
    BookMarked,
    Clock,
    AudioLines,
    Download,
    FileText,
    Flashlight,
    Globe,
    Image as ImageIcon,
    ListTodo,
    MapPin,
    Mail,
    NotebookPen,
    Smartphone,
    Sparkles,
    Play,
    Telescope,
    Volume2,
    Wrench,
} from '@lucide/vue'
import {
    talosToolActivityLabel,
    talosToolIconName,
    TALOS_TOOL_LABEL_KEYS,
    type TalosToolIconName,
} from '@/lib/tools/toolLabels'
import { stabilizeStreamingTalosMarkdown } from '@/lib/streamingMarkdown'
import { useTalosTypewriterReveal } from '@/composables/useTalosTypewriterReveal'
import { useTalosSmoothReveal } from '@/composables/useTalosSmoothReveal'
import { useChatController } from '@/stores/chatController'
import { useSettingsStore } from '@/stores/settings'

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
 *    straight into the DOM as small inline fragments, appended to the last
 *    rendered block so it flows inline instead of jumping to a new line.
 * The caret rides at the end of that tail, so it sits exactly where the next
 * letter will appear.
 */
const controller = useChatController()
const state = controller.chat.state
const { t } = useTalosI18n()

const streamingText = computed(() => state.streamingText ?? '')
// The tool block: what TALOS is doing right now, in the user's words rather
// than the wire names. Silence while a model searches your Library looks
// identical to a hang — and four identical rows saying `web_read` are barely
// better, which is why the label carries the page or the query.
const TOOL_ICONS: Record<TalosToolIconName, unknown> = {
    library: BookMarked,
    note: NotebookPen,
    task: ListTodo,
    memory: Sparkles,
    clock: Clock,
    web: Globe,
    research: Telescope,
    // Il telefono ha i suoi segni: dargli quello del web o dei modelli direbbe
    // una cosa falsa su cosa sta succedendo.
    phone: Smartphone,
    place: MapPin,
    torch: Flashlight,
    volume: Volume2,
    // ⛔ Play e non un altoparlante: il volume ha gia' il suo segno, e due
    // strumenti diversi con lo stesso disegno raccontano la stessa cosa
    // mentre ne stanno facendo due.
    audio: Play,
    voice: AudioLines,
    document: FileText,
    // ⛔ La busta e non il foglio: contare la posta non è leggere un documento,
    // e due attrezzi con lo stesso disegno raccontano la stessa cosa mentre ne
    // stanno facendo due.
    mail: Mail,
    image: ImageIcon,
    download: Download,
    tool: Wrench,
}

const runningTools = computed(() => controller.toolActivity.value.map((activity) => ({
    key: `${activity.name}:${activity.detail ?? ''}`,
    label: talosToolActivityLabel(
        activity,
        TALOS_TOOL_LABEL_KEYS[activity.name]
            ? t(TALOS_TOOL_LABEL_KEYS[activity.name]!)
            : undefined,
    ),
    icon: TOOL_ICONS[talosToolIconName(activity.name)],
})))
// Defect #5: reasoning streams on its own channel, so it can appear before the
// first letter of the answer — which is exactly when it is most useful.
const streamingReasoning = computed(() => state.streamingReasoning ?? '')/**
 * Stesso motivo del blocco ragionamento: al `v-if` serve sapere se c'è
 * qualcosa, non ottenere una copia ripulita della traccia intera a ogni
 * aggiornamento.
 */
const haRagionamento = computed(() => /\S/.test(streamingReasoning.value))
/**
 * Only while the in-flight reply belongs to the conversation on screen.
 *
 * Owner 2026-07-26: leaving a chat generating and opening a new one made a
 * message appear there by itself — the other chat's reply, rendered by a global
 * field. The answer still lands in the right conversation when it finishes;
 * what was wrong was showing it anywhere at all.
 */
const sending = computed(() => state.sending
    && state.streamingSessionId !== null
    && state.streamingSessionId === controller.chat.activeSession.value?.id)

/**
 * Owner 2026-07-26: a second way for the answer to arrive — "un'animazione più
 * smooth con un leggero fade in, pulitissima".
 *
 * Typewriter PACES the reveal on a frame clock, which is what makes it feel
 * mechanical to some eyes. Fade does not pace at all: the text appears at the
 * model's own speed and each new letter simply eases in. So the choice is not
 * cosmetic — it changes whether TALOS holds text back.
 */
const settings = useSettingsStore()
const fadeMode = computed(() => settings.state.shell.streaming_animation === 'fade')

/**
 * BOTH modes are paced now.
 *
 * Owner 2026-07-26: fade "non è smooth". The cause was this line: fade mode
 * rendered `streamingText` directly, at NETWORK cadence — and SSE chunks arrive
 * in lumps, so the fade had lumps to dissolve. The research found that every
 * credible implementation decouples the two cadences; the fade is the second
 * half of the effect, never the first.
 *
 * Typewriter keeps its own reveal (it is a different intent: a mechanical
 * clock). Fade gets the adaptive smoother, which follows the model's real speed
 * instead of imposing one.
 */
const reducedMotion = typeof window !== 'undefined'
    && typeof window.matchMedia === 'function'
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches

const { revealed: typed } = useTalosTypewriterReveal(streamingText)
const { revealed: smoothed } = useTalosSmoothReveal(streamingText, {
    // Reduced motion kills BOTH the fade and the pacing: text marching across
    // the screen is itself the animation, so removing only the fade is half a
    // fix.
    paced: () => !reducedMotion,
    settled: () => !sending.value,
})
const revealed = computed(() => (fadeMode.value ? smoothed.value : typed.value))

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
const TAB = String.fromCharCode(9)

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
    // Owner 2026-07-26: "l'animazione smooth fade non funziona, c'è ancora il
    // prompt cursore". It was still there because the caret is painted by the
    // tail machinery regardless of mode — and a blinking cursor IS the
    // typewriter. Fade means the text simply appears; nothing points at where
    // the next letter will land.
    if (!caretEl && !fadeMode.value) {
        caretEl = document.createElement('span')
        caretEl.className = 'talos-stream-caret'
        caretEl.setAttribute('data-testid', 'talos-stream-caret')
        caretEl.setAttribute('aria-hidden', 'true')
    }
    if (tailHost.parentElement !== target) target.append(tailHost)
    if (caretEl && caretEl.parentElement !== tailHost) tailHost.append(caretEl)
    return tailHost
}

function appendChars(host: HTMLElement, text: string): void {
    /**
     * Batch each delivered fragment at whitespace boundaries.
     *
     * Fade normally arrives on whole-word boundaries. Typewriter can deliver a
     * smaller frame slice, so claiming every node is a whole word would be
     * false; the throttled Markdown prefix absorbs these temporary tail nodes
     * every 110 ms and keeps the live DOM bounded.
     *
     * The trailing space goes INSIDE the span rather than beside it: a
     * whitespace-only span fragments copied text and makes a link's underline
     * appear before its words.
     */
    let word = ''
    const flush = (): void => {
        if (word === '') return
        const span = document.createElement('span')
        span.className = fadeMode.value ? 'talos-stream-char talos-stream-char--fade' : 'talos-stream-char'
        span.textContent = word
        host.insertBefore(span, caretEl ?? null)
        word = ''
    }
    for (const char of text) {
        if (char === NEWLINE) {
            // A newline is block structure, not part of a word: it must be a
            // real text node or the line never breaks.
            flush()
            host.insertBefore(document.createTextNode(char), caretEl ?? null)
            continue
        }
        word += char
        if (char === ' ' || char === TAB) flush()
    }
    flush()
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
        v-if="sending && (revealed || haRagionamento || runningTools.length)"
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
            <TalosMobileRunningToolRow
                v-for="entry in runningTools"
                :key="entry.key"
                :label="entry.label"
            >
                <template #icon>
                    <component :is="entry.icon" class="size-3.5" />
                </template>
            </TalosMobileRunningToolRow>
        </div>
        <TalosMobileReasoningBlock v-if="streamingReasoning" :reasoning="streamingReasoning" live />
        <!-- Owner 2026-07-27: "si compenetra con le parole già renderizzate".
             The entrance animation is scoped HERE, to the streaming body, and
             deliberately not to the finished message. Both render the same
             component, so when a reply finalises the list creates fresh
             elements — and every block would animate in at once, over text that
             was already on screen. Fading while it arrives is the effect; fading
             again once it has arrived is the bug. -->
        <div class="talos-streaming-body">
            <TalosMobileMessageContent :content="parsedMarkdown" />
        </div>
        <span class="sr-only" role="status" aria-live="polite">{{ $t('chat.receivingResponse') }}</span>
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
        <span class="sr-only">{{ $t('chat.processing') }}</span>
    </div>
</template>
