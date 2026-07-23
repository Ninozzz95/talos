<script setup lang="ts">
/**
 * F2-T6 — TALOS intro modal, mobile adaptation of the frozen desktop v3 spec
 * (`docs/superpowers/specs/2026-07-19-talos-intro-modal-design.md`).
 * Mobile-truth claim classification: AVM execution is desktop-Available but
 * mobile-ROADMAP; provider keys live in the device Keystore (never claimed
 * server-side); stations list reflects the real mobile stations. Only the
 * current slide is mounted; every close path emits exactly one outcome.
 * Loaded via defineAsyncComponent by App.vue — completed users never pay the chunk.
 */
import { computed, onMounted, ref } from 'vue'
import { ArrowLeft, ArrowRight, X } from '@lucide/vue'
import { Button } from '@/components/ui/button'
import type { TalosMobileIntroOutcome } from '@/stores/settings'

const emit = defineEmits<{
    close: [outcome: TalosMobileIntroOutcome]
}>()

interface IntroSlide {
    key: string
    label: string
    title: string
    status: string
    body: string
    roadmap?: string
}

const SLIDES: IntroSlide[] = [
    {
        key: 'welcome',
        label: 'WELCOME',
        title: 'Meet TALOS',
        status: 'Available',
        body: 'Your AI workspace with a working memory, a toolbox, and a conscience. '
            + 'TALOS doesn’t just answer — it works: it reads your files, browses the web, '
            + 'runs your models, and keeps a verifiable record of the work it does.',
    },
    {
        key: 'evidence',
        label: 'EVIDENCE',
        title: 'Answers you can verify',
        status: 'Available',
        body: 'Meaningful actions leave a trail you can open: the sources behind a claim, '
            + 'the exact page the browser saw, the files that grounded a reply. '
            + 'When TALOS says it did something, you can watch it prove it.',
    },
    {
        key: 'engine',
        label: 'ENGINE',
        title: 'Powered by AVM',
        status: 'Available on desktop',
        body: 'On the TALOS desktop workspace, the Agnostic Virtual Machine turns requests into '
            + 'a plan of verifiable steps — validated before they run, recovered when they fail, '
            + 'and benchmarked against the same model working alone.',
        roadmap: 'On the roadmap: AVM plan execution and benchmarking on this device, '
            + 'synced with your desktop workspace.',
    },
    {
        key: 'models',
        label: 'MODELS',
        title: 'Bring your own model',
        status: 'Available',
        body: 'Connect the model providers you already use: your API keys live in your '
            + 'device’s secure Keystore — never in plain storage, and never leaving your phone '
            + 'except to the provider you call.',
        roadmap: 'On the roadmap: Forge-managed download and serving of open models from '
            + 'Hugging Face and Ollama, the Zethos runtime — engineered to bring '
            + '10-billion-parameter models to high-end phones, with 20–30B in experimental '
            + 'reach — and coordinated execution of up to three models in concert, each one’s '
            + 'reasoning depth tuned to the task it plays best.',
    },
    {
        key: 'browser',
        label: 'BROWSER',
        title: 'A browser that shows its work',
        status: 'Available',
        body: 'TALOS browses the real web for you: it reads pages, captures what it sees, '
            + 'and asks before doing anything consequential. Every page visit becomes '
            + 'evidence you can inspect.',
    },
    {
        key: 'connected',
        label: 'CONNECTED',
        title: 'Plugged into your world',
        status: 'Available + Roadmap',
        body: 'Everything lives in the app’s stations: Chat, Research, Runs and Context — '
            + 'the same workspace language as TALOS on desktop.',
        roadmap: 'On the roadmap: TALOS memory on this device, Calendar, Drive and Gmail '
            + 'through Google Workspace, and long-term recall through Supermemory.',
    },
]

const CLOSING_NOTE = 'One more thing: TALOS is a one-person project — crafted end to end by a '
    + 'single builder who believes AI should prove its work, not just promise it. The project is '
    + 'free to use: you pay only for optional cloud infrastructure you choose to connect. '
    + 'Thanks for being here at the start.'

const index = ref(0)
const slide = computed(() => SLIDES[index.value])
const root = ref<HTMLElement | null>(null)
// Directional slide-fade: forward enters from the right, back from the left.
const direction = ref<'forward' | 'back'>('forward')
const enterFromClass = computed(() => direction.value === 'forward'
    ? 'opacity-0 translate-x-6'
    : 'opacity-0 -translate-x-6')

onMounted(() => {
    root.value?.focus()
})

function next(): void {
    if (index.value < SLIDES.length - 1) {
        direction.value = 'forward'
        index.value += 1
    }
}

function back(): void {
    if (index.value > 0) {
        direction.value = 'back'
        index.value -= 1
    }
}

// Basic horizontal swipe on what is visually a paged carousel.
let pointerStartX: number | null = null
function onPointerDown(event: PointerEvent): void {
    pointerStartX = event.clientX
}
function onPointerUp(event: PointerEvent): void {
    if (pointerStartX === null) return
    const delta = event.clientX - pointerStartX
    pointerStartX = null
    if (Math.abs(delta) < 48) return
    if (delta < 0) next()
    else back()
}

function onKeydown(event: KeyboardEvent): void {
    const target = event.target as HTMLElement | null
    const interactive = target?.closest('a, input, textarea, select')
    if (event.key === 'Escape') {
        emit('close', 'skipped')
        return
    }
    if (interactive) return
    if (event.key === 'ArrowRight') next()
    else if (event.key === 'ArrowLeft') back()
}
</script>

<template>
    <div
        ref="root"
        data-testid="talos-intro-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="talos-intro-title"
        aria-describedby="talos-intro-body"
        tabindex="-1"
        class="fixed inset-0 z-[70] flex flex-col bg-[var(--talos-background)] pt-[max(1rem,env(safe-area-inset-top))] pb-[max(1rem,env(safe-area-inset-bottom))] outline-none"
        @keydown="onKeydown"
    >
        <header class="flex items-center justify-between px-5 pb-2">
            <p class="talos-orbitron-brand text-xs uppercase tracking-[0.3em] text-[var(--talos-accent,var(--primary))]">TALOS</p>
            <Button
                type="button"
                size="icon"
                variant="ghost"
                data-mobile-icon-only="true"
                aria-label="Close introduction"
                class="talos-pressable min-h-11 min-w-11 rounded-full"
                @click="emit('close', 'skipped')"
            >
                <X class="size-5" aria-hidden="true" />
            </Button>
        </header>

        <section
            class="flex min-h-0 flex-1 flex-col overflow-y-auto px-6"
            aria-live="polite"
            @pointerdown="onPointerDown"
            @pointerup="onPointerUp"
        >
            <Transition
                mode="out-in"
                enter-active-class="transition duration-200 ease-out"
                :enter-from-class="enterFromClass"
                enter-to-class="opacity-100 translate-x-0"
                leave-active-class="transition duration-150 ease-in"
                leave-from-class="opacity-100 translate-x-0"
                leave-to-class="opacity-0"
            >
                <div :key="index">
                    <p class="text-[11px] uppercase tracking-[0.25em] text-[var(--talos-muted,var(--muted-foreground))]">
                        Step {{ index + 1 }} of {{ SLIDES.length }} &middot; {{ slide.label }}
                    </p>
                    <h1 id="talos-intro-title" class="mt-3 text-2xl font-semibold leading-tight text-[var(--talos-text,var(--foreground))]">
                        {{ slide.title }}
                    </h1>
                    <p class="mt-1 text-[11px] font-medium uppercase tracking-wide text-[var(--talos-accent,var(--primary))]">
                        {{ slide.status }}
                    </p>
                    <p id="talos-intro-body" class="mt-4 text-[15px] leading-7 text-[var(--talos-text,var(--foreground))]">
                        {{ slide.body }}
                    </p>
                    <p
                        v-if="slide.roadmap"
                        class="mt-4 rounded-xl border border-[var(--talos-border,var(--border))] bg-[var(--talos-panel,var(--card))]/60 p-3 text-sm leading-6 text-[var(--talos-muted,var(--muted-foreground))]"
                    >
                        <span class="mr-2 inline-block rounded border border-current px-1.5 py-0.5 font-mono text-[10px] tracking-wider">ROADMAP</span>
                        {{ slide.roadmap }}
                    </p>
                    <p
                        v-if="index === SLIDES.length - 1"
                        class="mt-5 text-[13px] leading-6 text-[var(--talos-muted,var(--muted-foreground))]"
                    >
                        {{ CLOSING_NOTE }}
                    </p>
                </div>
            </Transition>
        </section>

        <footer class="px-5 pt-3">
            <!-- Decorative pager dots: "Step X of 6" already announces progress. -->
            <div class="flex items-center justify-center gap-2 pb-4" aria-hidden="true">
                <span
                    v-for="(item, dotIndex) in SLIDES"
                    :key="item.key"
                    data-testid="talos-intro-dot"
                    :aria-current="dotIndex === index ? 'step' : undefined"
                    class="size-1.5 rounded-full transition-colors duration-200"
                    :class="dotIndex === index
                        ? 'bg-[var(--talos-accent,var(--primary))]'
                        : 'bg-[var(--talos-border,var(--border))]'"
                />
            </div>
            <div class="flex items-center gap-2">
                <!-- Back slot is always reserved (invisible on slide 1) so
                     "Skip introduction" never jumps when it appears. -->
                <Button
                    type="button"
                    size="icon"
                    variant="outline"
                    data-mobile-icon-only="true"
                    aria-label="Back"
                    :class="index > 0 ? '' : 'invisible'"
                    class="talos-pressable min-h-11 min-w-11 rounded-full"
                    @click="back"
                >
                    <ArrowLeft class="size-4" aria-hidden="true" />
                </Button>
                <Button
                    v-if="index < SLIDES.length - 1"
                    type="button"
                    variant="ghost"
                    class="talos-pressable min-h-11 flex-1 text-sm text-[var(--talos-muted,var(--muted-foreground))]"
                    aria-label="Skip introduction"
                    @click="emit('close', 'skipped')"
                >
                    Skip introduction
                </Button>
                <Button
                    v-if="index < SLIDES.length - 1"
                    type="button"
                    size="icon"
                    data-mobile-icon-only="true"
                    aria-label="Next"
                    class="talos-pressable min-h-11 min-w-11 rounded-full bg-[var(--talos-accent,var(--primary))] text-[var(--talos-accent-contrast,var(--primary-foreground))]"
                    @click="next"
                >
                    <ArrowRight class="size-4" aria-hidden="true" />
                </Button>
                <Button
                    v-else
                    type="button"
                    data-testid="talos-intro-cta"
                    class="talos-pressable min-h-12 flex-1 rounded-full bg-[var(--talos-accent,var(--primary))] text-sm font-medium text-[var(--talos-accent-contrast,var(--primary-foreground))]"
                    @click="emit('close', 'completed')"
                >
                    Start your first chat
                </Button>
            </div>
        </footer>
    </div>
</template>
