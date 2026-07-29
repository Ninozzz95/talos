<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import Button from '../../ui/Button.vue'
import Chip from '../../ui/Chip.vue'
import TelemetryRule from '../../ui/TelemetryRule.vue'
import Dialog from '../../ui/dialog/Dialog.vue'
import DialogContent from '../../ui/dialog/DialogContent.vue'
import DialogDescription from '../../ui/dialog/DialogDescription.vue'
import DialogTitle from '../../ui/dialog/DialogTitle.vue'
import {
    TALOS_CAPABILITY_LABELS,
    type TalosCapabilityId,
    type TalosCapabilityManifest,
    type TalosCapabilityRecord,
    type TalosCapabilityState,
} from '../../../lib/talosCapabilities'
import type { TalosPublicLinks } from '../../../lib/talosPublicLinks'

const props = withDefaults(defineProps<{
    open: boolean
    links: TalosPublicLinks
    capabilities?: TalosCapabilityManifest | null
}>(), {
    capabilities: null,
})

const emit = defineEmits<{
    close: [outcome: 'completed' | 'skipped']
}>()

const SLIDES = [
    { station: 'WELCOME', title: 'Meet TALOS' },
    { station: 'EVIDENCE', title: 'Answers you can verify' },
    { station: 'ENGINE', title: 'Powered by AVM' },
    { station: 'MODELS', title: 'Bring your own model' },
    { station: 'BROWSER', title: 'A browser that shows its work' },
    { station: 'CONNECTED', title: 'Plugged into your world' },
] as const

const SLIDE_CAPABILITIES: Readonly<Record<number, readonly TalosCapabilityId[]>> = Object.freeze({
    0: ['chat.provider', 'files.ingestion', 'browser.hmi', 'runs.replay'],
    1: ['runs.replay', 'files.ingestion', 'browser.hmi'],
    2: ['benchmarks.avm', 'runs.replay'],
    3: ['models.profiles', 'models.local_runtime', 'models.multi_model_orchestration'],
    4: ['browser.hmi'],
    5: ['integrations.google_workspace', 'memory.supermemory', 'settings.workspace'],
})

const CAPABILITY_STATE_LABELS: Readonly<Record<TalosCapabilityState, string>> = Object.freeze({
    available: 'Available',
    degraded: 'Degraded',
    blocked: 'Blocked',
    planned: 'Roadmap',
})

const slideIndex = ref(0)
const announcement = ref('')
const outcomeEmitted = ref(false)
const nextButton = ref<{ $el?: HTMLElement } | HTMLElement | null>(null)

const slide = computed(() => SLIDES[slideIndex.value])
const isLastSlide = computed(() => slideIndex.value === SLIDES.length - 1)
const stepText = computed(() => `Step ${slideIndex.value + 1} of ${SLIDES.length}`)
const capabilitiesVerified = computed(() => props.capabilities !== null)
const slideCapabilities = computed(() => (
    (SLIDE_CAPABILITIES[slideIndex.value] ?? []).map(capabilityRecord)
))

function capabilityRecord(id: TalosCapabilityId): TalosCapabilityRecord {
    return props.capabilities?.capabilities.find((record) => record.id === id) ?? {
        id,
        state: 'blocked',
        reason: 'Capability status is absent from the verified manifest.',
        evidence: ['client:capability-record-absent'],
    }
}

function capabilityStateLabel(state: TalosCapabilityState): string {
    return CAPABILITY_STATE_LABELS[state]
}

watch(() => props.open, (open) => {
    if (open) {
        slideIndex.value = 0
        announcement.value = ''
        outcomeEmitted.value = false
    }
})

function emitOutcome(outcome: 'completed' | 'skipped') {
    if (outcomeEmitted.value) return
    outcomeEmitted.value = true
    emit('close', outcome)
}

function handleOpenUpdate(open: boolean) {
    if (!open) emitOutcome('skipped')
}

function goTo(index: number) {
    const bounded = Math.min(SLIDES.length - 1, Math.max(0, index))
    if (bounded === slideIndex.value) return
    slideIndex.value = bounded
    announcement.value = `Step ${bounded + 1} of ${SLIDES.length}: ${SLIDES[bounded].title}`
}

function handleKeydown(event: KeyboardEvent) {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
    const target = event.target as HTMLElement | null
    if (target?.closest('a, input, textarea, select, [contenteditable="true"]')) return
    event.preventDefault()
    goTo(slideIndex.value + (event.key === 'ArrowRight' ? 1 : -1))
}

function focusPrimaryControl(event: Event) {
    event.preventDefault()
    void nextTick(() => {
        const candidate = nextButton.value
        const element = candidate && '$el' in candidate ? candidate.$el : candidate
        ;(element as HTMLElement | null)?.focus()
    })
}

function preventOutsideDismiss(event: Event) {
    event.preventDefault()
}
</script>

<template>
    <Dialog :open="open" @update:open="handleOpenUpdate">
        <DialogContent
            class="talos-elev-3 w-[min(34rem,calc(100vw-1.5rem))] gap-0 border-[var(--talos-border)] bg-[var(--talos-card)] p-0 text-[var(--talos-text)]"
            data-testid="talos-intro-modal"
            :show-close="false"
            @open-auto-focus="focusPrimaryControl"
            @pointer-down-outside="preventOutsideDismiss"
            @interact-outside="preventOutsideDismiss"
            @keydown="handleKeydown"
        >
            <header class="flex items-center gap-3 border-b border-[var(--talos-border)] px-4 pt-[max(1rem,env(safe-area-inset-top))] pb-3">
                <div class="min-w-0 flex-1">
                    <TelemetryRule :label="slide.station" />
                </div>
                <span class="talos-type-caption shrink-0 text-[var(--talos-muted)]">{{ stepText }}</span>
                <Button type="button" variant="ghost" size="sm" class="shrink-0 text-[var(--talos-muted)]" @click="emitOutcome('skipped')">
                    Skip introduction
                </Button>
                <Button type="button" variant="ghost" size="icon" class="h-8 w-8 shrink-0" aria-label="Close introduction" @click="emitOutcome('skipped')">
                    <span aria-hidden="true">✕</span>
                </Button>
            </header>

            <div
                data-testid="talos-intro-scroll"
                tabindex="0"
                class="max-h-[min(60dvh,30rem)] overflow-y-auto px-4 py-4"
            >
                <Transition
                    mode="out-in"
                    enter-active-class="transition-[opacity,transform] duration-[var(--talos-motion-open-duration,160ms)] ease-out"
                    enter-from-class="opacity-0 translate-x-2"
                    enter-to-class="opacity-100 translate-x-0"
                    leave-active-class="transition-[opacity,transform] duration-[var(--talos-motion-close-duration,120ms)] ease-in"
                    leave-from-class="opacity-100 translate-x-0"
                    leave-to-class="opacity-0 -translate-x-2"
                >
                    <section :key="slideIndex" data-testid="talos-intro-slide-host" class="grid gap-3">
                        <DialogTitle class="talos-type-title text-lg text-[var(--talos-text)]">{{ slide.title }}</DialogTitle>
                        <DialogDescription class="sr-only">A short introduction to TALOS and what it can do.</DialogDescription>

                        <template v-if="slideIndex === 0">
                            <p v-if="!capabilitiesVerified" class="text-sm leading-6 text-[var(--talos-muted)]" role="status">
                                Capability status is still being verified for this workspace.
                            </p>
                            <p v-else class="text-sm leading-6 text-[var(--talos-muted)]">
                                Your AI workspace brings provider-backed chat, files, browser work and
                                replayable runs together according to the readiness shown below.
                            </p>
                        </template>

                        <template v-else-if="slideIndex === 1">
                            <p class="text-sm leading-6 text-[var(--talos-muted)]">
                                Meaningful actions leave a trail you can open: the sources behind a
                                claim, the exact page the browser saw, the files that grounded a reply.
                                When TALOS says it did something, you can watch it prove it.
                            </p>
                        </template>

                        <template v-else-if="slideIndex === 2">
                            <p class="text-sm leading-6 text-[var(--talos-muted)]">
                                Under the hood, the Agnostic Virtual Machine turns your requests into a
                                plan of verifiable steps — validated before they run, recovered when
                                they fail, and benchmarked against the same model working alone. If AVM
                                makes your model better, you'll see it in numbers, not promises.
                            </p>
                            <a
                                v-if="links.avmDeepDive"
                                :href="links.avmDeepDive"
                                target="_blank"
                                rel="noopener noreferrer"
                                class="talos-type-label inline-flex w-fit items-center gap-1 rounded-md border border-[var(--talos-accent-border)] px-3 py-1.5 text-[var(--talos-accent)] hover:bg-[var(--talos-accent-soft)]"
                            >
                                Read the AVM deep dive &amp; whitepaper →
                            </a>
                        </template>

                        <template v-else-if="slideIndex === 3">
                            <p class="text-sm leading-6 text-[var(--talos-muted)]">
                                Connect the model providers you already use: your credentials stay
                                server-side, and your conversations flow through the providers you trust.
                            </p>
                            <p class="text-sm leading-6 text-[var(--talos-muted)]">
                                <Chip code="ROADMAP" data-testid="talos-intro-roadmap-chip" class="mr-2 align-middle opacity-90" aria-hidden="true" />
                                On the roadmap: Forge-managed download and serving of open models from
                                Hugging Face and Ollama, the Zethos runtime — engineered to bring
                                10-billion-parameter models to high-end phones, with 20–30B in
                                experimental reach — and coordinated execution of up to three models in
                                concert, each one's reasoning depth tuned to the task it plays best.
                            </p>
                        </template>

                        <template v-else-if="slideIndex === 4">
                            <p class="text-sm leading-6 text-[var(--talos-muted)]">
                                When the Browser worker is ready, TALOS can read pages, capture what it
                                sees and preserve clicks or screenshots as evidence you can inspect.
                            </p>
                        </template>

                        <template v-else>
                            <p class="text-sm leading-6 text-[var(--talos-muted)]">
                                TALOS's own memory learns only what you allow, and shows you when it's
                                used. Everything lives in the sidebar stations: Cockpit, Vault, Memory,
                                Benchmarks and more.
                            </p>
                            <p class="flex flex-wrap items-center gap-1.5" aria-hidden="true">
                                <Chip code="RUN" /><Chip code="VLT" /><Chip code="MEM" /><Chip code="BNC" />
                            </p>
                            <p class="text-sm leading-6 text-[var(--talos-muted)]">
                                <Chip code="ROADMAP" data-testid="talos-intro-roadmap-chip" class="mr-2 align-middle opacity-90" aria-hidden="true" />
                                On the roadmap: long-term recall through Supermemory. Google Workspace
                                has an existing integration whose current readiness appears below.
                            </p>
                            <p class="talos-type-caption border-t border-[var(--talos-border)] pt-3 leading-5 text-[var(--talos-muted)]">
                                One more thing: TALOS is a one-person project — crafted end to end by a
                                single builder who believes AI should prove its work, not just promise
                                it. The project is free to use: you pay only for optional cloud
                                infrastructure you choose to connect. If TALOS earns a place in your
                                day, you can support the work on
                                <a v-if="links.patreon" :href="links.patreon" target="_blank" rel="noopener noreferrer" class="text-[var(--talos-accent)] underline underline-offset-2">Patreon</a>
                                <span v-else>Patreon</span>
                                or
                                <a v-if="links.kofi" :href="links.kofi" target="_blank" rel="noopener noreferrer" class="text-[var(--talos-accent)] underline underline-offset-2">Ko-fi</a>
                                <span v-else>Ko-fi</span>.
                                Thanks for being here at the start.
                            </p>
                        </template>

                        <div
                            v-if="capabilitiesVerified"
                            class="divide-y divide-[var(--talos-border)] border-y border-[var(--talos-border)]"
                            aria-label="Capability status"
                        >
                            <div
                                v-for="capability in slideCapabilities"
                                :key="capability.id"
                                :data-capability-id="capability.id"
                                class="flex items-start justify-between gap-3 py-2"
                            >
                                <div class="min-w-0">
                                    <div class="text-sm font-medium text-[var(--talos-text)]">
                                        {{ TALOS_CAPABILITY_LABELS[capability.id] }}
                                    </div>
                                    <p v-if="capability.reason" class="mt-0.5 text-xs leading-5 text-[var(--talos-muted)]">
                                        {{ capability.reason }}
                                    </p>
                                </div>
                                <Chip :code="capabilityStateLabel(capability.state)" class="shrink-0" />
                            </div>
                        </div>
                    </section>
                </Transition>
            </div>

            <footer class="flex items-center gap-2 border-t border-[var(--talos-border)] px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
                <div class="flex flex-1 items-center gap-1.5" role="group" aria-label="Introduction slides">
                    <button
                        v-for="(entry, index) in SLIDES"
                        :key="entry.station"
                        type="button"
                        data-testid="talos-intro-dot"
                        class="h-2.5 w-2.5 cursor-pointer rounded-full border border-[var(--talos-border)] transition-colors duration-[var(--talos-motion-duration-control,160ms)]"
                        :class="index === slideIndex ? 'bg-[var(--talos-accent)] border-[var(--talos-accent-border)]' : 'bg-[var(--talos-panel-soft)] hover:bg-[var(--talos-active)]'"
                        :aria-label="`Go to slide ${index + 1}: ${entry.title}`"
                        :aria-current="index === slideIndex ? 'true' : undefined"
                        @click="goTo(index)"
                    ></button>
                </div>
                <Button type="button" variant="secondary" size="sm" :disabled="slideIndex === 0" @click="goTo(slideIndex - 1)">
                    Back
                </Button>
                <Button v-if="!isLastSlide" ref="nextButton" type="button" size="sm" @click="goTo(slideIndex + 1)">
                    Next
                </Button>
                <Button v-else ref="nextButton" type="button" size="sm" @click="emitOutcome('completed')">
                    Start your first chat
                </Button>
            </footer>

            <span data-testid="talos-intro-live" aria-live="polite" class="sr-only">{{ announcement }}</span>
        </DialogContent>
    </Dialog>
</template>
