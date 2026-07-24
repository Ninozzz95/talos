<script setup lang="ts">
import { computed, defineAsyncComponent, defineComponent, h, onBeforeUnmount, ref, watch } from 'vue'
import TalosLineLoader from '@/components/brand/TalosLineLoader.vue'
import { stabilizeStreamingTalosMarkdown } from '@/lib/streamingMarkdown'
import { useChatController } from '@/stores/chatController'

/**
 * R1-5 — the in-flight assistant reply, isolated. This component alone
 * subscribes to `streamingText`, so a token burst re-renders THIS subtree
 * only: the message list (O(n) vnode diff per chunk before this) now
 * re-renders exclusively when a message is appended. The 120ms trailing
 * throttle + fence auto-close (F5.1 progressive markdown) live here too.
 */
const controller = useChatController()
const state = controller.chat.state

const streamingText = computed(() => state.streamingText)
const sending = computed(() => state.sending)

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

const throttledStreamingMarkdown = ref('')
let streamThrottle: ReturnType<typeof setTimeout> | null = null
watch(streamingText, (text) => {
    if (!text) {
        if (streamThrottle !== null) clearTimeout(streamThrottle)
        streamThrottle = null
        throttledStreamingMarkdown.value = ''
        return
    }
    if (streamThrottle !== null) return
    streamThrottle = setTimeout(() => {
        streamThrottle = null
        throttledStreamingMarkdown.value = stabilizeStreamingTalosMarkdown(streamingText.value ?? '')
    }, 120)
    if (!throttledStreamingMarkdown.value) {
        throttledStreamingMarkdown.value = stabilizeStreamingTalosMarkdown(text)
    }
}, { immediate: true })
onBeforeUnmount(() => { if (streamThrottle !== null) clearTimeout(streamThrottle) })
</script>

<template>
    <article
        v-if="sending && streamingText"
        data-testid="talos-mobile-streaming"
        class="w-full max-w-full px-1 py-1 text-sm leading-6 text-[var(--talos-text,var(--foreground))]"
    >
        <!-- The growing text stays OUTSIDE any live region: re-announcing
             the whole reply on every token is screen-reader noise. -->
        <TalosMobileMessageContent :content="throttledStreamingMarkdown" />
        <span class="mt-1 flex items-center gap-1" aria-hidden="true">
            <span class="talos-typing-dot"></span>
            <span class="talos-typing-dot"></span>
            <span class="talos-typing-dot"></span>
        </span>
        <span class="sr-only" role="status" aria-live="polite">Receiving response</span>
    </article>
    <div
        v-else-if="sending"
        data-testid="talos-mobile-typing"
        class="max-w-[92%] self-start rounded-2xl rounded-bl-sm border border-[var(--talos-border,var(--border))] bg-[var(--talos-panel,var(--card))] px-3.5 py-2 text-sm text-[var(--talos-muted,var(--muted-foreground))]"
        role="status"
        aria-live="polite"
    >
        <!-- F4-#24 (owner): boot-logo styled loader — a line crossing 3
             empty nodes; each node fills as the line passes through it. -->
        <TalosLineLoader :width="44" />
        <span class="sr-only">Processing</span>
    </div>
</template>
