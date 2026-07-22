<script setup lang="ts">
import { computed, defineAsyncComponent, nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import { Loader2 } from '@lucide/vue'
import Button from '../../ui/Button.vue'
import Select from '../../ui/Select.vue'
import TalosPromptEnhancerPopover from '../chat/TalosPromptEnhancerPopover.vue'
import TalosSlimComposer from '../chat/TalosSlimComposer.vue'
import type { TalosChatViewportController } from '../../../composables/useTalosChatViewport'
import type { TalosPromptEnhancementResult } from '../../../composables/useTalosPromptEnhancement'
import type { TalosBrowserCurrentPage, TalosBrowserMode, TalosCommand, TalosComposerMode, TalosContextSet, TalosModelProfile, TalosModelRoutingProfile } from '../../../lib/talosTypes'
import { talosUrlHost } from '../../../lib/talosUrlDetect'

// Lives behind the model popover's v-if, so it is loaded on demand and kept
// out of the initial app chunk (the composer sits in the static entry closure).
const TalosComposerModelPicker = defineAsyncComponent(() => import('./TalosComposerModelPicker.vue'))

const props = withDefaults(defineProps<{
    prompt: string
    browserContext?: { host: string; title: string } | null
    browserMode: TalosBrowserMode
    browseSetupFault?: string | null
    attachments?: Array<{ id: string; file_id: string | null; grant_id: string | null; name: string; status: string; failure_reason: string | null }>
    vaultFiles?: Array<{ id: string; original_name: string; status: string }>
    vaultPickerLoading?: boolean
    lastUserPrompt?: string | null
    browserCurrentPage?: TalosBrowserCurrentPage | null
    devBrowserEvidence?: boolean
    composerMode: TalosComposerMode
    viewport: TalosChatViewportController
    commands: TalosCommand[]
    canSend: boolean
    sending: boolean
    statusText: string
    modelLabel: string
    modelProvider?: string | null
    contextLabel: string
    temporaryMode: boolean
    sendDisabledReason: string
    enhancerDisabledReason: string
    modelPopoverOpen: boolean
    contextPopoverOpen: boolean
    modelProfiles: TalosModelProfile[]
    modelRoutingProfiles: TalosModelRoutingProfile[]
    contextSets: TalosContextSet[]
    selectedModelProfileId: string
    selectedModelRoutingProfileId: string
    selectedContextSetId: string
    selectedContextSet: TalosContextSet | null
    selectedEffort?: string
    thinking?: boolean
    effortLevels?: string[]
    supportsThinking?: boolean
    loadingModelProfiles: boolean
    loadingModelRoutingProfiles: boolean
    loadingContextSets: boolean
    promptEnhancementResult: TalosPromptEnhancementResult | null
    enhancingPrompt: boolean
    promptEnhancementError: string | null
    visibility: Record<string, boolean>
    dictationStatus?: string
    dictationSupported?: boolean
    autoBrowseUrl?: string | null
}>(), {
    devBrowserEvidence: false,
    selectedEffort: 'high',
    thinking: false,
    effortLevels: () => [],
    supportsThinking: false,
    dictationStatus: 'idle',
    dictationSupported: false,
    autoBrowseUrl: null,
})

const emit = defineEmits<{
    updatePrompt: [prompt: string]
    send: []
    openModel: []
    openContext: []
    openSettings: []
    toggleTemporary: []
    enhance: []
    slashCommand: [id: TalosCommand['id']]
    browseOpen: [url: string | null]
    selectModelProfile: [profileId: string]
    selectModelRoutingProfile: [profileId: string]
    selectEffort: [level: string]
    selectThinking: [enabled: boolean]
    selectContextSet: [contextSetId: string]
    refreshModelAndContext: []
    openModelLab: []
    openLibrary: []
    replacePromptWithEnhanced: []
    insertEnhancedPromptBelow: []
    clearPromptEnhancement: []
    detachBrowserContext: []
    enableBrowse: []
    disableBrowse: []
    stopBrowse: []
    restartBrowse: []
    captureScreenshot: []
    captureSnapshot: []
    closePopovers: []
    attachFiles: [files: File[]]
    attachVaultFile: [fileId: string]
    removeAttachment: [id: string]
    openVaultPicker: []
    toggleDictation: []
    acceptAutoBrowse: []
    dismissAutoBrowse: []
}>()

const composerPrompt = computed({
    get: () => props.prompt,
    set: (value: string) => emit('updatePrompt', value),
})
const autoBrowseHost = computed(() => (props.autoBrowseUrl ? talosUrlHost(props.autoBrowseUrl) : ''))
const composerRoot = ref<HTMLElement | null>(null)
const slimComposer = ref<InstanceType<typeof TalosSlimComposer> | null>(null)

function focusPrompt() {
    slimComposer.value?.focusPrompt()
}

defineExpose({ focusPrompt })

function enhancementOverlayOpen() {
    return Boolean(props.promptEnhancementResult || props.enhancingPrompt || props.promptEnhancementError)
}

function closeComposerOverlays(restoreFocus = false) {
    let focusLabel: string | null = null
    if (props.modelPopoverOpen) focusLabel = 'Choose model profile'
    else if (props.contextPopoverOpen) focusLabel = 'Choose grounding context'
    else if (enhancementOverlayOpen()) focusLabel = 'Improve prompt'

    emit('closePopovers')
    if (enhancementOverlayOpen()) emit('clearPromptEnhancement')

    if (restoreFocus && focusLabel) {
        void nextTick(() => composerRoot.value?.querySelector<HTMLButtonElement>(`[aria-label="${focusLabel}"]`)?.focus())
    }
}

function handleDocumentPointerDown(event: PointerEvent) {
    if (!props.modelPopoverOpen && !props.contextPopoverOpen && !enhancementOverlayOpen()) return
    const target = event.target instanceof Element ? event.target : null
    if (target?.closest('.talos-chat-composer-shell, [data-talos-composer-overlay]')) return
    closeComposerOverlays(false)
}

function handleDocumentKeydown(event: KeyboardEvent) {
    if (event.key !== 'Escape' || (!props.modelPopoverOpen && !props.contextPopoverOpen && !enhancementOverlayOpen())) return
    event.preventDefault()
    event.stopImmediatePropagation()
    closeComposerOverlays(true)
}

function completePopoverLeave(element: Element, done: () => void) {
    requestAnimationFrame(() => {
        const animations = element.getAnimations()
        if (animations.length === 0) {
            done()
            return
        }

        void Promise.allSettled(animations.map((animation) => animation.finished)).then(() => done())
    })
}

onMounted(() => {
    props.viewport.registerComposer(composerRoot.value)
    document.addEventListener('pointerdown', handleDocumentPointerDown)
    document.addEventListener('keydown', handleDocumentKeydown)
})
onBeforeUnmount(() => {
    props.viewport.registerComposer(null)
    document.removeEventListener('pointerdown', handleDocumentPointerDown)
    document.removeEventListener('keydown', handleDocumentKeydown)
})
</script>

<template>
    <div ref="composerRoot" class="talos-composer-area pointer-events-none fixed inset-x-0 bottom-[max(0.75rem,env(safe-area-inset-bottom))] z-40 px-4 lg:left-[var(--talos-rail-width)] lg:px-6">
        <div class="relative">
            <div v-if="browserContext" data-testid="talos-browser-context-chip" class="pointer-events-auto mx-auto mb-2 flex w-full max-w-[820px] items-center justify-between gap-3 border border-[var(--talos-warning-border)] bg-[var(--talos-warning-soft)] px-3 py-2 text-xs text-[var(--talos-text)]">
                <span class="min-w-0 truncate"><strong>Browse evidence</strong> <span class="text-[var(--talos-muted)]">{{ browserContext.host }} - {{ browserContext.title }}</span></span>
                <Button size="sm" variant="ghost" aria-label="Detach browser evidence" @click="emit('detachBrowserContext')">Detach</Button>
            </div>
            <div v-if="autoBrowseUrl" data-testid="talos-auto-browse-prompt" class="pointer-events-auto mx-auto mb-2 flex w-full max-w-[820px] items-center justify-between gap-3 rounded-md border border-[var(--talos-accent-border)] bg-[var(--talos-accent-soft)] px-3 py-2 text-xs text-[var(--talos-text)]">
                <span class="min-w-0 truncate"><strong>Browse this link?</strong> <span class="text-[var(--talos-muted)]">{{ autoBrowseHost }}</span></span>
                <span class="flex shrink-0 items-center gap-1">
                    <Button size="sm" @click="emit('acceptAutoBrowse')">Enable Browse</Button>
                    <Button size="sm" variant="ghost" aria-label="Dismiss browse suggestion" @click="emit('dismissAutoBrowse')">Dismiss</Button>
                </span>
            </div>
            <Transition name="talos-popover" @leave="completePopoverLeave">
                <div
                    v-if="modelPopoverOpen"
                    data-testid="talos-model-popover"
                    data-talos-composer-overlay
                    role="dialog"
                    aria-label="Model selection"
                    class="talos-composer-popover talos-model-popover pointer-events-auto absolute bottom-full left-1/2 mb-3 w-full max-w-[min(420px,calc(100vw-2rem))] -translate-x-1/2 rounded-md talos-elev-2 p-3"
                >
                <div class="text-xs font-semibold uppercase text-[var(--talos-muted)]">Model for this conversation</div>
                <TalosComposerModelPicker
                    class="mt-2"
                    :model-profiles="modelProfiles"
                    :model-routing-profiles="modelRoutingProfiles"
                    :selected-model-profile-id="selectedModelProfileId"
                    :selected-model-routing-profile-id="selectedModelRoutingProfileId"
                    :loading-model-profiles="loadingModelProfiles"
                    :loading-model-routing-profiles="loadingModelRoutingProfiles"
                    @select-model-profile="(value) => emit('selectModelProfile', value)"
                    @select-model-routing-profile="(value) => emit('selectModelRoutingProfile', value)"
                />
                <div class="mt-3 flex justify-between gap-2">
                    <Button size="sm" variant="ghost" @click="emit('refreshModelAndContext')">Refresh</Button>
                    <Button size="sm" @click="emit('openModelLab')">Model Lab</Button>
                </div>
                </div>
            </Transition>

            <Transition name="talos-popover" @leave="completePopoverLeave">
                <div
                    v-if="contextPopoverOpen"
                    data-testid="talos-context-popover"
                    data-talos-composer-overlay
                    role="dialog"
                    aria-label="Grounding context selection"
                    class="talos-composer-popover talos-context-popover pointer-events-auto absolute bottom-full left-1/2 mb-3 w-full max-w-[min(420px,calc(100vw-2rem))] -translate-x-1/2 rounded-md talos-elev-2 p-3"
                >
                <div class="text-xs font-semibold uppercase text-[var(--talos-muted)]">Grounding context</div>
                <label class="sr-only" for="talos-workspace-context-set">Grounding context set</label>
                <Select
                    id="talos-workspace-context-set"
                    :model-value="selectedContextSetId"
                    class="mt-2"
                    :disabled="loadingContextSets || !contextSets.length"
                    aria-label="Grounding context set"
                    @update:model-value="(value) => emit('selectContextSet', String(value))"
                >
                    <option value="">{{ loadingContextSets ? 'Loading context' : 'No grounding context' }}</option>
                    <option
                        v-for="contextSet in contextSets"
                        :key="contextSet.id"
                        :value="contextSet.id"
                        :disabled="contextSet.status !== 'available' && contextSet.status !== 'draft'"
                    >
                        {{ contextSet.name }} - {{ contextSet.status }} - {{ contextSet.sources_count ?? contextSet.sources?.length ?? 0 }} sources
                    </option>
                </Select>
                <p v-if="selectedContextSet" class="mt-2 text-xs leading-5 text-[var(--talos-muted)]">
                    Uploaded content is injected server-side as untrusted data.
                </p>
                <div class="mt-3 flex justify-between gap-2">
                    <Button size="sm" variant="ghost" @click="emit('refreshModelAndContext')">Refresh</Button>
                    <Button size="sm" @click="emit('openLibrary')">Library</Button>
                </div>
                </div>
            </Transition>

            <Transition name="talos-popover" @leave="completePopoverLeave">
                <div
                    v-if="promptEnhancementResult"
                    data-testid="talos-enhancement-popover"
                    data-talos-composer-overlay
                    role="dialog"
                    aria-label="Prompt enhancement preview"
                    class="talos-composer-popover pointer-events-auto absolute bottom-full left-1/2 mb-3 w-full max-w-[min(560px,calc(100vw-2rem))] -translate-x-1/2"
                >
                    <TalosPromptEnhancerPopover
                        :result="promptEnhancementResult"
                        @replace="emit('replacePromptWithEnhanced')"
                        @insert="emit('insertEnhancedPromptBelow')"
                        @cancel="emit('clearPromptEnhancement')"
                    />
                </div>

                <div
                    v-else-if="enhancingPrompt || promptEnhancementError"
                    data-testid="talos-enhancement-status-popover"
                    data-talos-composer-overlay
                    role="status"
                    aria-live="polite"
                    class="talos-composer-popover pointer-events-auto absolute bottom-full left-1/2 mb-3 w-full max-w-[min(560px,calc(100vw-2rem))] -translate-x-1/2 rounded-md talos-elev-2 p-3 text-sm text-[var(--talos-text)]"
                >
                    <div v-if="enhancingPrompt" class="flex items-center gap-2 text-[var(--talos-muted)]">
                        <Loader2 class="h-4 w-4 animate-spin text-[var(--talos-accent)]" />
                        Enhancing prompt
                    </div>
                    <div v-else class="flex items-start justify-between gap-3">
                        <span>{{ promptEnhancementError }}</span>
                        <Button size="sm" variant="ghost" @click="emit('clearPromptEnhancement')">Cancel</Button>
                    </div>
                </div>
            </Transition>

            <TalosSlimComposer
                ref="slimComposer"
                v-model:prompt="composerPrompt"
                :commands="commands"
                :can-send="canSend"
                :sending="sending"
                :status-text="statusText"
                :model-label="modelLabel"
                :model-provider="modelProvider"
                :selected-effort="selectedEffort"
                :thinking="thinking"
                :effort-levels="effortLevels"
                :supports-thinking="supportsThinking"
                :context-label="contextLabel"
                :temporary-mode="temporaryMode"
                :browser-mode="browserMode"
                :browse-setup-fault="browseSetupFault"
                :last-user-prompt="lastUserPrompt"
                :attachments="attachments"
                :vault-files="vaultFiles"
                :vault-picker-loading="vaultPickerLoading"
                :browser-current-page="browserCurrentPage"
                :dev-browser-evidence="devBrowserEvidence"
                :composer-mode="composerMode"
                :dictation-status="dictationStatus"
                :dictation-supported="dictationSupported"
                :send-disabled-reason="sendDisabledReason"
                :enhancer-disabled-reason="enhancerDisabledReason"
                :visibility="visibility"
                @send="emit('send')"
                @open-model="emit('openModel')"
                @select-effort="emit('selectEffort', $event)"
                @select-thinking="emit('selectThinking', $event)"
                @open-context="emit('openContext')"
                @open-settings="emit('openSettings')"
                @toggle-temporary="emit('toggleTemporary')"
                @enhance="emit('enhance')"
                @slash-command="emit('slashCommand', $event)"
                @browse-open="emit('browseOpen', $event)"
                @enable-browse="emit('enableBrowse')"
                @disable-browse="emit('disableBrowse')"
                @stop-browse="emit('stopBrowse')"
                @restart-browse="emit('restartBrowse')"
                @capture-screenshot="emit('captureScreenshot')"
                @capture-snapshot="emit('captureSnapshot')"
                @attach-files="emit('attachFiles', $event)"
                @attach-vault-file="emit('attachVaultFile', $event)"
                @remove-attachment="emit('removeAttachment', $event)"
                @open-vault-picker="emit('openVaultPicker')"
                @toggle-dictation="emit('toggleDictation')"
            />
        </div>
    </div>
</template>
