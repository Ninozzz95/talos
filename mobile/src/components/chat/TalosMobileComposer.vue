<script setup lang="ts">
import { computed, nextTick, ref, watch, type ComponentPublicInstance } from 'vue'
import {
    ArrowUp,
    BrainCircuit,
    Database,
    Gauge,
    Paperclip,
    SlidersHorizontal,
} from '@lucide/vue'
import TalosMobileComposerModelPicker from '@/components/chat/TalosMobileComposerModelPicker.vue'
import TalosMobileEffortPicker from '@/components/chat/TalosMobileEffortPicker.vue'
import TalosMobileProviderIcon from '@/components/models/TalosMobileProviderIcon.vue'
import { Button } from '@/components/ui/button'
import type {
    TalosMobileModelProfileView,
    TalosMobileRoutingProfileView,
} from '@/components/chat/mobileChatTypes'
import type { TalosMobileEffortLevel } from '@/lib/mobileEffort'

const props = withDefaults(defineProps<{
    prompt: string
    modelProfiles: TalosMobileModelProfileView[]
    routingProfiles?: TalosMobileRoutingProfileView[]
    selectedModelProfileId?: string | null
    selectedRoutingProfileId?: string | null
    selectedEffort: string
    thinking: boolean
    canSend: boolean
    sending: boolean
    sendDisabledReason?: string
    loadingModels?: boolean
    loadingRoutes?: boolean
}>(), {
    routingProfiles: () => [],
    selectedModelProfileId: null,
    selectedRoutingProfileId: null,
    sendDisabledReason: '',
    loadingModels: false,
    loadingRoutes: false,
})

const emit = defineEmits<{
    'update:prompt': [prompt: string]
    send: []
    selectModelProfile: [profileId: string]
    selectModelRoutingProfile: [profileId: string]
    selectEffort: [level: TalosMobileEffortLevel]
    selectThinking: [enabled: boolean]
    attach: [files: File[]]
    openContext: []
    openModelLab: []
}>()

const composerRoot = ref<HTMLElement | null>(null)
const promptField = ref<HTMLTextAreaElement | null>(null)
const attachmentInput = ref<HTMLInputElement | null>(null)
const modelTrigger = ref<ComponentPublicInstance | null>(null)
const effortTrigger = ref<ComponentPublicInstance | null>(null)
const modelPopover = ref<HTMLElement | null>(null)
const modelPickerOpen = ref(false)
const effortPickerOpen = ref(false)

const selectedProfile = computed(() => (
    props.modelProfiles.find((profile) => profile.id === props.selectedModelProfileId) ?? null
))
const selectedRoute = computed(() => (
    props.routingProfiles.find((profile) => profile.id === props.selectedRoutingProfileId) ?? null
))
const modelTitle = computed(() => {
    if (selectedRoute.value) return selectedRoute.value.name
    if (selectedProfile.value) return selectedProfile.value.display_name
    return 'No model selected'
})
const canSubmit = computed(() => (
    props.canSend && !props.sending && props.prompt.trim().length > 0
))
const statusText = computed(() => {
    if (props.sending) return 'Processing'
    return props.sendDisabledReason
})

function resizePrompt(): void {
    const field = promptField.value
    if (!field) return
    field.style.height = 'auto'
    field.style.height = `${Math.max(56, Math.min(field.scrollHeight, 192))}px`
}

function updatePrompt(event: Event): void {
    const field = event.currentTarget as HTMLTextAreaElement
    emit('update:prompt', field.value)
    resizePrompt()
}

function requestSend(value = promptField.value?.value ?? props.prompt): void {
    if (!props.canSend || props.sending || !value.trim()) return
    emit('send')
}

function onPromptKeydown(event: KeyboardEvent): void {
    if (event.key !== 'Enter' || event.shiftKey || event.isComposing) return
    event.preventDefault()
    requestSend((event.currentTarget as HTMLTextAreaElement).value)
}

async function focusInitialModelOption(): Promise<void> {
    await nextTick()
    const selected = modelPopover.value?.querySelector<HTMLButtonElement>(
        '[role="option"][aria-selected="true"]:not(:disabled)',
    )
    const first = modelPopover.value?.querySelector<HTMLButtonElement>(
        '[role="option"]:not(:disabled)',
    )
    ;(selected ?? first)?.focus()
}

async function toggleModelPicker(): Promise<void> {
    modelPickerOpen.value = !modelPickerOpen.value
    effortPickerOpen.value = false
    if (modelPickerOpen.value) await focusInitialModelOption()
}

async function toggleEffortPicker(): Promise<void> {
    effortPickerOpen.value = !effortPickerOpen.value
    modelPickerOpen.value = false
    if (effortPickerOpen.value) {
        await nextTick()
        composerRoot.value?.querySelector<HTMLButtonElement>(
            '[data-testid="talos-mobile-effort-level"][aria-pressed="true"]',
        )?.focus()
    }
}

function focusTrigger(trigger: ComponentPublicInstance | HTMLElement | null): void {
    const element = trigger instanceof HTMLElement ? trigger : (trigger?.$el as HTMLElement | undefined)
    element?.focus()
}

async function closeModelPicker(): Promise<void> {
    modelPickerOpen.value = false
    await nextTick()
    focusTrigger(modelTrigger.value)
}

async function closeEffortPicker(): Promise<void> {
    effortPickerOpen.value = false
    await nextTick()
    focusTrigger(effortTrigger.value)
}

async function selectModelProfile(profileId: string): Promise<void> {
    emit('selectModelProfile', profileId)
    await closeModelPicker()
}

async function selectRoutingProfile(profileId: string): Promise<void> {
    emit('selectModelRoutingProfile', profileId)
    await closeModelPicker()
}

async function selectEffort(level: TalosMobileEffortLevel): Promise<void> {
    emit('selectEffort', level)
    await closeEffortPicker()
}

function chooseFiles(event: Event): void {
    const input = event.currentTarget as HTMLInputElement
    const files = Array.from(input.files ?? [])
    if (files.length) emit('attach', files)
    input.value = ''
}

watch(() => props.prompt, () => nextTick(resizePrompt), { immediate: true })
</script>

<template>
    <section
        ref="composerRoot"
        data-testid="talos-mobile-composer"
        class="relative mx-3 mb-[max(0.75rem,env(safe-area-inset-bottom))] rounded-lg border border-[var(--talos-border,var(--border))] bg-[var(--talos-card,var(--card))] p-2 shadow-lg"
        aria-label="Chat composer"
    >
        <div ref="modelPopover" class="relative">
            <div
                v-if="modelPickerOpen"
                id="talos-mobile-model-picker-popover"
                class="absolute bottom-full left-0 right-0 z-40 mb-2 rounded-md border border-[var(--talos-border,var(--border))] bg-[var(--talos-card,var(--popover))] p-2 shadow-xl"
            >
                <TalosMobileComposerModelPicker
                    :model-profiles="modelProfiles"
                    :routing-profiles="routingProfiles"
                    :selected-model-profile-id="selectedModelProfileId"
                    :selected-routing-profile-id="selectedRoutingProfileId"
                    :loading-models="loadingModels"
                    :loading-routes="loadingRoutes"
                    @select-model-profile="selectModelProfile"
                    @select-model-routing-profile="selectRoutingProfile"
                    @request-close="closeModelPicker"
                />
            </div>
        </div>

        <div
            v-if="effortPickerOpen"
            id="talos-mobile-effort-picker-popover"
            class="absolute bottom-full left-2 right-2 z-40 mb-2 rounded-md border border-[var(--talos-border,var(--border))] bg-[var(--talos-card,var(--popover))] p-3 shadow-xl"
        >
            <TalosMobileEffortPicker
                :effort-levels="selectedProfile?.effort_levels ?? []"
                :selected-effort="selectedEffort"
                :supports-thinking="selectedProfile?.supports_thinking ?? false"
                :thinking="thinking"
                @select-effort="selectEffort"
                @select-thinking="emit('selectThinking', $event)"
                @request-close="closeEffortPicker"
            />
        </div>

        <div class="relative min-w-0">
            <textarea
                ref="promptField"
                :value="prompt"
                rows="2"
                aria-label="Message TALOS"
                placeholder="Message TALOS..."
                :disabled="sending"
                class="max-h-48 min-h-14 w-full resize-none overflow-y-auto bg-transparent px-2 py-2 pr-14 text-sm leading-6 text-[var(--talos-text,var(--foreground))] outline-none placeholder:text-[var(--talos-muted,var(--muted-foreground))]"
                @input="updatePrompt"
                @keydown="onPromptKeydown"
            />
            <Button
                type="button"
                size="icon"
                data-mobile-icon-only="true"
                aria-label="Send message"
                :title="sendDisabledReason || 'Send message'"
                :disabled="!canSubmit"
                class="absolute bottom-1.5 right-1.5 min-h-11 min-w-11 rounded-md bg-[var(--talos-accent,var(--primary))] text-[var(--talos-accent-contrast,var(--primary-foreground))]"
                @click="requestSend()"
            >
                <ArrowUp class="size-5" aria-hidden="true" />
            </Button>
        </div>

        <div class="mt-1 flex min-w-0 items-center justify-between gap-2 border-t border-[var(--talos-border,var(--border))] pt-2">
            <div class="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto">
                <Button
                    ref="modelTrigger"
                    type="button"
                    size="icon"
                    variant="outline"
                    data-mobile-icon-only="true"
                    aria-label="Choose model profile"
                    :title="modelTitle"
                    aria-haspopup="listbox"
                    :aria-expanded="modelPickerOpen"
                    aria-controls="talos-mobile-model-picker-popover"
                    class="min-h-11 min-w-11"
                    @click="toggleModelPicker"
                >
                    <TalosMobileProviderIcon
                        v-if="selectedProfile"
                        :provider="selectedProfile.provider"
                        class="size-7 border-0 bg-transparent"
                    />
                    <BrainCircuit v-else class="size-4" aria-hidden="true" />
                </Button>
                <Button
                    ref="effortTrigger"
                    type="button"
                    size="icon"
                    variant="outline"
                    data-mobile-icon-only="true"
                    aria-label="Choose reasoning effort"
                    :title="`Effort: ${selectedEffort}`"
                    aria-haspopup="true"
                    :aria-expanded="effortPickerOpen"
                    aria-controls="talos-mobile-effort-picker-popover"
                    class="min-h-11 min-w-11"
                    @click="toggleEffortPicker"
                >
                    <Gauge class="size-4 text-[var(--talos-accent,var(--primary))]" aria-hidden="true" />
                </Button>
                <input
                    ref="attachmentInput"
                    type="file"
                    multiple
                    class="sr-only"
                    aria-label="Attachment file input"
                    @change="chooseFiles"
                >
                <Button
                    type="button"
                    size="icon"
                    variant="outline"
                    data-mobile-icon-only="true"
                    aria-label="Attach a file"
                    title="Attach a file"
                    class="min-h-11 min-w-11"
                    @click="attachmentInput?.click()"
                >
                    <Paperclip class="size-4" aria-hidden="true" />
                </Button>
                <Button
                    type="button"
                    size="icon"
                    variant="outline"
                    data-mobile-icon-only="true"
                    aria-label="Choose grounding context"
                    title="Choose grounding context"
                    class="min-h-11 min-w-11"
                    @click="emit('openContext')"
                >
                    <Database class="size-4" aria-hidden="true" />
                </Button>
                <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    data-mobile-icon-only="true"
                    aria-label="Open Model Lab"
                    title="Open Model Lab"
                    class="min-h-11 min-w-11"
                    @click="emit('openModelLab')"
                >
                    <SlidersHorizontal class="size-4" aria-hidden="true" />
                </Button>
            </div>
        </div>

        <span class="sr-only" role="status" aria-live="polite">{{ statusText }}</span>
    </section>
</template>
