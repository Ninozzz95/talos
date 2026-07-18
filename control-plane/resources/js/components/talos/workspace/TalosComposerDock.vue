<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import { Loader2 } from '@lucide/vue'
import Button from '../../ui/Button.vue'
import Select from '../../ui/Select.vue'
import TalosPromptEnhancerPopover from '../chat/TalosPromptEnhancerPopover.vue'
import TalosSlimComposer from '../chat/TalosSlimComposer.vue'
import type { TalosChatViewportController } from '../../../composables/useTalosChatViewport'
import type { TalosPromptEnhancementResult } from '../../../composables/useTalosPromptEnhancement'
import { talosModelProfileIsCallable } from '../../../lib/talosProviders'
import type { TalosBrowserCurrentPage, TalosBrowserMode, TalosCommand, TalosComposerMode, TalosContextSet, TalosModelProfile, TalosModelRoutingProfile } from '../../../lib/talosTypes'

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
    loadingModelProfiles: boolean
    loadingModelRoutingProfiles: boolean
    loadingContextSets: boolean
    promptEnhancementResult: TalosPromptEnhancementResult | null
    enhancingPrompt: boolean
    promptEnhancementError: string | null
    visibility: Record<string, boolean>
}>(), {
    devBrowserEvidence: false,
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
}>()

const composerPrompt = computed({
    get: () => props.prompt,
    set: (value: string) => emit('updatePrompt', value),
})
const composerRoot = ref<HTMLElement | null>(null)

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
            <Transition name="talos-popover" @leave="completePopoverLeave">
                <div
                    v-if="modelPopoverOpen"
                    data-testid="talos-model-popover"
                    data-talos-composer-overlay
                    role="dialog"
                    aria-label="Model selection"
                    class="talos-composer-popover talos-model-popover pointer-events-auto absolute bottom-full left-1/2 mb-3 w-full max-w-[min(420px,calc(100vw-2rem))] -translate-x-1/2 rounded-md talos-elev-2 p-3"
                >
                <div class="text-xs font-semibold uppercase text-[var(--talos-muted)]">Model profile</div>
                <label class="sr-only" for="talos-workspace-model-profile">Server-side model profile</label>
                <Select
                    id="talos-workspace-model-profile"
                    :model-value="selectedModelProfileId"
                    class="mt-2"
                    :disabled="loadingModelProfiles || !modelProfiles.length"
                    aria-label="Server-side model profile"
                    @update:model-value="(value) => emit('selectModelProfile', String(value))"
                >
                    <option value="">{{ loadingModelProfiles ? 'Loading profiles' : 'Choose profile' }}</option>
                    <option
                        v-for="profile in modelProfiles"
                        :key="profile.id"
                        :value="profile.id"
                        :disabled="!talosModelProfileIsCallable(profile)"
                    >
                        {{ profile.display_name }} - {{ profile.model }} - {{ profile.status }}
                    </option>
                </Select>
                <div class="mt-3 text-xs font-semibold uppercase text-[var(--talos-muted)]">Routing profile</div>
                <label class="sr-only" for="talos-workspace-model-routing-profile">Model routing profile</label>
                <Select
                    id="talos-workspace-model-routing-profile"
                    :model-value="selectedModelRoutingProfileId"
                    class="mt-2"
                    :disabled="loadingModelRoutingProfiles || !modelRoutingProfiles.length"
                    aria-label="Model routing profile"
                    @update:model-value="(value) => emit('selectModelRoutingProfile', String(value))"
                >
                    <option value="">{{ loadingModelRoutingProfiles ? 'Loading routes' : 'No routing profile' }}</option>
                    <option
                        v-for="profile in modelRoutingProfiles"
                        :key="profile.id"
                        :value="profile.id"
                        :disabled="profile.status !== 'enabled' || profile.lanes.length === 0"
                    >
                        {{ profile.name }} - {{ profile.lanes.length }} lanes - {{ profile.status }}
                    </option>
                </Select>
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
                v-model:prompt="composerPrompt"
                :commands="commands"
                :can-send="canSend"
                :sending="sending"
                :status-text="statusText"
                :model-label="modelLabel"
                :model-provider="modelProvider"
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
                :send-disabled-reason="sendDisabledReason"
                :enhancer-disabled-reason="enhancerDisabledReason"
                :visibility="visibility"
                @send="emit('send')"
                @open-model="emit('openModel')"
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
            />
        </div>
    </div>
</template>
