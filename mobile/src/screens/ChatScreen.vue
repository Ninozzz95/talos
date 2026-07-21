<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import TalosMobileComposer from '@/components/chat/TalosMobileComposer.vue'
import TalosMobileMessageList from '@/components/chat/TalosMobileMessageList.vue'
import { useChatController } from '@/stores/chatController'

// Chat is the base surface: a scrollable thread (brand hero when empty) over a
// bottom-docked composer. Local-first — the composer talks to the provider directly
// from the device via the controller (key from the OS keystore). Mirrors the desktop
// TalosComposerDock bottom dock (fixed + safe-area + reserved scroll padding).
const router = useRouter()
const controller = useChatController()
const { profiles, selectedModelId, effort, thinking, canSend, sendDisabledReason, chat, selectModel, selectEffort, setThinking, init } = controller

const prompt = ref('')
const composerWrap = ref<HTMLElement | null>(null)
let heightObserver: ResizeObserver | null = null

const welcome = {
    headline: 'What claim should we benchmark?',
    body: 'Turn a prompt into comparable AVM ON/OFF evidence with matching model, context, evaluator, and logs.',
}

function publishComposerHeight(): void {
    const el = composerWrap.value
    if (!el) return
    const height = Math.ceil(el.getBoundingClientRect().height) || 180
    document.documentElement.style.setProperty('--talos-composer-height', `${height}px`)
}

function onSend(): void {
    const text = prompt.value
    prompt.value = ''
    void controller.send(text)
}

onMounted(() => {
    void init()
    publishComposerHeight()
    if (typeof ResizeObserver !== 'undefined' && composerWrap.value) {
        heightObserver = new ResizeObserver(() => publishComposerHeight())
        heightObserver.observe(composerWrap.value)
    }
})
onBeforeUnmount(() => {
    heightObserver?.disconnect()
    heightObserver = null
})
</script>

<template>
    <section
        data-testid="mobile-screen"
        aria-label="Chat"
        class="relative flex h-full min-h-0 flex-1 flex-col bg-[var(--talos-background)]"
    >
        <div class="flex-1 overflow-y-auto overscroll-contain" data-testid="talos-chat-scroll">
            <div class="flex min-h-full flex-col pb-[calc(var(--talos-composer-height,180px)+env(safe-area-inset-bottom)+1.5rem)]">
                <!-- Empty state: brand hero + welcome -->
                <div
                    v-if="chat.messages.length === 0"
                    class="flex flex-1 flex-col items-center justify-center px-4 py-10 text-center"
                    data-testid="talos-empty-brand"
                >
                    <span class="talos-short-logo talos-short-logo-hero talos-chat-brand-logo" aria-hidden="true">
                        <span class="talos-short-logo-mark"></span>
                    </span>
                    <span class="talos-orbitron-brand mt-2 text-4xl font-semibold text-[var(--talos-text)] sm:text-5xl">TALOS</span>
                    <h1 class="mt-6 text-2xl font-semibold text-[var(--talos-text)]">{{ welcome.headline }}</h1>
                    <p class="mt-3 max-w-[560px] text-sm leading-6 text-[var(--talos-muted)]">{{ welcome.body }}</p>
                </div>

                <!-- Conversation -->
                <TalosMobileMessageList
                    v-else
                    :messages="chat.messages"
                    :sending="chat.state.sending"
                />
            </div>
        </div>

        <div ref="composerWrap" class="fixed inset-x-0 bottom-0 z-40">
            <TalosMobileComposer
                :prompt="prompt"
                :model-profiles="profiles"
                :selected-model-profile-id="selectedModelId"
                :selected-effort="effort"
                :thinking="thinking"
                :can-send="canSend"
                :sending="chat.state.sending"
                :send-disabled-reason="sendDisabledReason"
                @update:prompt="prompt = $event"
                @send="onSend"
                @select-model-profile="selectModel"
                @select-effort="selectEffort"
                @select-thinking="setThinking"
                @open-model-lab="router.push('/settings')"
            />
        </div>
    </section>
</template>
