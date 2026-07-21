<script setup lang="ts">
import { computed, nextTick, onMounted, reactive, ref } from 'vue'
import { AlertCircle, CheckCircle2, KeyRound, Loader2, PlugZap, RadioTower, RefreshCw, Save, ShieldCheck, Trash2 } from '@lucide/vue'
import Button from '../../ui/Button.vue'
import Badge from '../../ui/Badge.vue'
import Surface from '../../ui/Surface.vue'
import TalosGuideInfoButton from '../guide/TalosGuideInfoButton.vue'
import TalosModelQuickAdd from './TalosModelQuickAdd.vue'
import TalosProviderModelCombobox from './TalosProviderModelCombobox.vue'
import TalosProviderIcon from './TalosProviderIcon.vue'
import {
    useTalosModelProfiles,
    TalosModelCatalogError,
    type UpdateTalosModelProfilePayload,
} from '../../../composables/useTalosModelProfiles'
import type { TalosModelCatalogFault, TalosModelProfile, TalosProviderModelCatalog } from '../../../lib/talosTypes'
import { talosProviderById, talosProviderCatalog } from '../../../lib/talosProviders'
import { resolveTalosCollectionState } from '../../../lib/talosCollectionState'

type BadgeTone = 'success' | 'danger' | 'warning' | 'neutral'
type CapabilityKey = 'json' | 'tools' | 'vision' | 'embeddings' | 'local' | 'remote'

type CapabilityChip = {
    key: CapabilityKey
    label: string
    available: boolean
    detail: string
    tone: BadgeTone
}

type AvmCompatibility = {
    grade: 'A' | 'B' | 'C' | 'Blocked'
    tone: BadgeTone
    reason: string
}

const providerOptions: Array<{ value: TalosModelProfile['provider']; label: string }> = talosProviderCatalog.map((provider) => ({
    value: provider.id,
    label: provider.label,
}))

const capabilityDefinitions: Array<{
    key: CapabilityKey
    label: string
    aliases: string[]
}> = [
    { key: 'json', label: 'JSON', aliases: ['json', 'json_mode', 'supports_json', 'response_format_json'] },
    { key: 'tools', label: 'Tools', aliases: ['tools', 'tool_calls', 'function_calling', 'supports_tools'] },
    { key: 'vision', label: 'Vision', aliases: ['vision', 'image_input', 'multimodal', 'supports_vision'] },
    { key: 'embeddings', label: 'Embeddings', aliases: ['embeddings', 'embedding', 'supports_embeddings'] },
    { key: 'local', label: 'Local', aliases: ['local', 'local_runtime', 'runs_local'] },
    { key: 'remote', label: 'Remote', aliases: ['remote', 'remote_provider', 'hosted'] },
]

const {
    modelProfiles,
    loadingModelProfiles,
    modelProfileError,
    loadModelProfiles,
    updateAndProbeModelProfile,
    discoverModelCatalog,
    deleteModelProfile,
    probeModelProfile,
} = useTalosModelProfiles()

const editForm = reactive({
    provider: 'openai' as TalosModelProfile['provider'],
    display_name: '',
    model: '',
    base_url: '',
    timeout_seconds: 60,
    secret: '',
})

const selectedProfileId = ref<string | null>(null)
const savingProfileId = ref<string | null>(null)
const probingProfileId = ref<string | null>(null)
const deletingProfileId = ref<string | null>(null)
const pendingDeleteProfile = ref<TalosModelProfile | null>(null)
const deleteDialog = ref<HTMLElement | null>(null)
const actionError = ref<string | null>(null)
const actionMessage = ref<string | null>(null)
const modelProfilesRequested = ref(false)
const verifyFailedProfileId = ref<string | null>(null)
const catalog = ref<TalosProviderModelCatalog | null>(null)
const loadingCatalog = ref(false)
const catalogFault = ref<TalosModelCatalogFault | null>(null)
let deleteReturnFocusTarget: HTMLElement | null = null

const catalogModels = computed(() => catalog.value?.models ?? [])
const catalogWarnings = computed(() => catalog.value?.warnings ?? [])

const selectedProfile = computed(() => {
    return modelProfiles.value.find((profile) => profile.id === selectedProfileId.value) ?? null
})
const selectedProviderDefinition = computed(() => talosProviderById(editForm.provider))
const selectedProfileIsBusy = computed(() => {
    return selectedProfile.value ? profileIsBusy(selectedProfile.value.id) : false
})
const visibleError = computed(() => actionError.value || modelProfileError.value)
const modelProfilesState = computed(() => resolveTalosCollectionState({
    itemCount: modelProfiles.value.length,
    loading: loadingModelProfiles.value,
    error: visibleError.value,
    requested: modelProfilesRequested.value,
}))
const canUpdateProfile = computed(() => {
    return Boolean(
        selectedProfile.value
        && editForm.display_name.trim()
        && editForm.model.trim()
        && !selectedProfileIsBusy.value,
    )
        && (selectedProviderDefinition.value.requiresSecret || !editForm.secret.trim())
})

function profileIsBusy(profileId: string) {
    return savingProfileId.value === profileId
        || probingProfileId.value === profileId
        || deletingProfileId.value === profileId
}

function normalizeOptionalUrl(value: string) {
    const trimmed = value.trim()
    return trimmed.length > 0 ? trimmed : null
}

function populateEditForm(profile: TalosModelProfile) {
    const identityChanged = selectedProfileId.value !== profile.id
    selectedProfileId.value = profile.id
    editForm.provider = profile.provider
    editForm.display_name = profile.display_name
    editForm.model = profile.model
    editForm.base_url = profile.base_url ?? ''
    editForm.timeout_seconds = profile.timeout_seconds
    editForm.secret = ''
    if (identityChanged) {
        catalog.value = null
        catalogFault.value = null
        verifyFailedProfileId.value = null
    }
}

function statusTone(status: TalosModelProfile['status']): BadgeTone {
    if (status === 'healthy') {
        return 'success'
    }

    if (status === 'failed') {
        return 'danger'
    }

    if (status === 'degraded') {
        return 'warning'
    }

    return 'neutral'
}

function secretTone(profile: TalosModelProfile): BadgeTone {
    return profile.has_secret ? 'success' : 'warning'
}

function secretLabel(profile: TalosModelProfile) {
    if (!talosProviderById(profile.provider).requiresSecret) {
        return 'No bearer token used.'
    }

    return profile.has_secret ? 'Secret stored server-side.' : 'Provider secret missing.'
}

function asRecord(value: unknown): Record<string, unknown> {
    return value && typeof value === 'object' && !Array.isArray(value)
        ? value as Record<string, unknown>
        : {}
}

function booleanFromRecord(record: Record<string, unknown>, aliases: string[]): boolean | null {
    for (const alias of aliases) {
        const value = record[alias]

        if (typeof value === 'boolean') {
            return value
        }

        if (typeof value === 'string') {
            const normalized = value.trim().toLowerCase()

            if (['true', 'yes', 'supported', 'enabled', 'available'].includes(normalized)) {
                return true
            }

            if (['false', 'no', 'unsupported', 'disabled', 'unavailable'].includes(normalized)) {
                return false
            }
        }
    }

    return null
}

function hasSuccessfulProbe(profile: TalosModelProfile): boolean {
    return profile.status === 'healthy' && profile.probe_result?.ok === true
}

function capabilityAvailable(profile: TalosModelProfile, definition: typeof capabilityDefinitions[number]): boolean {
    if (!hasSuccessfulProbe(profile)) {
        return false
    }

    const capabilities = asRecord(profile.capabilities)
    const verifiedValue = booleanFromRecord(capabilities, definition.aliases)

    return verifiedValue === true
}

function capabilityChips(profile: TalosModelProfile): CapabilityChip[] {
    return capabilityDefinitions.map((definition) => {
        const available = capabilityAvailable(profile, definition)

        return {
            key: definition.key,
            label: definition.label,
            available,
            detail: available ? 'available' : 'unavailable',
            tone: available ? 'success' : 'neutral',
        }
    })
}

function avmCompatibility(profile: TalosModelProfile): AvmCompatibility {
    const chips = capabilityChips(profile)
    const hasCapability = (key: CapabilityKey) => chips.some((chip) => chip.key === key && chip.available)
    const hasJson = hasCapability('json')
    const hasTools = hasCapability('tools')
    const hasRemoteOrLocalRuntime = hasCapability('remote') || hasCapability('local')

    if (talosProviderById(profile.provider).requiresSecret && !profile.has_secret) {
        return {
            grade: 'Blocked',
            tone: 'warning',
            reason: 'Provider secret is missing.',
        }
    }

    if (profile.status === 'disabled') {
        return {
            grade: 'Blocked',
            tone: 'neutral',
            reason: 'Profile is disabled.',
        }
    }

    if (profile.status === 'failed') {
        return {
            grade: 'C',
            tone: 'danger',
            reason: 'Last provider probe failed.',
        }
    }

    if (hasSuccessfulProbe(profile) && hasJson && hasTools && hasRemoteOrLocalRuntime) {
        return {
            grade: 'A',
            tone: 'success',
            reason: 'Ready for typed AVM planning, tool calls, and controlled execution.',
        }
    }

    if (hasSuccessfulProbe(profile) && hasJson && hasRemoteOrLocalRuntime) {
        return {
            grade: 'B',
            tone: profile.status === 'healthy' ? 'success' : 'warning',
            reason: 'Usable for AVM runs, but one advanced capability is missing.',
        }
    }

    return {
        grade: 'C',
        tone: 'warning',
        reason: 'Needs a successful probe and typed-output capability evidence.',
    }
}

function formatDate(value: string) {
    return new Date(value).toLocaleString([], {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
    })
}

function probeSummary(profile: TalosModelProfile) {
    const result = profile.probe_result

    if (!result) {
        return 'No probe recorded'
    }

    const ok = result.ok
    const httpStatus = result.http_status
    const latency = result.latency_ms
    const latencyText = typeof latency === 'number' ? ` - ${latency} ms` : ''

    if (typeof ok === 'boolean' && typeof httpStatus === 'number') {
        return `${ok ? 'Probe ok' : 'Probe failed'} - HTTP ${httpStatus}${latencyText}`
    }

    if (typeof ok === 'boolean') {
        return ok ? 'Probe ok' : 'Probe failed'
    }

    return 'Probe result recorded'
}

function selectProfile(profile: TalosModelProfile) {
    populateEditForm(profile)
    actionError.value = null
}

function handleQuickAdded(profile: TalosModelProfile) {
    modelProfiles.value = [
        profile,
        ...modelProfiles.value.filter((existing) => existing.id !== profile.id),
    ]
    populateEditForm(profile)
    actionError.value = null
    actionMessage.value = null
}

async function refreshProfiles(selectFirst = false) {
    modelProfilesRequested.value = true
    actionError.value = null

    try {
        const profiles = await loadModelProfiles()

        if (selectedProfileId.value && !profiles.some((profile) => profile.id === selectedProfileId.value)) {
            selectedProfileId.value = null
        }

        if ((selectFirst || !selectedProfileId.value) && profiles.length > 0) {
            populateEditForm(profiles[0])
        }
    } catch (error) {
        actionError.value = error instanceof Error ? error.message : 'TALOS could not load model profiles.'
    }
}

async function submitUpdate() {
    const profile = selectedProfile.value

    if (!profile || !canUpdateProfile.value) {
        return
    }

    savingProfileId.value = profile.id
    actionError.value = null
    actionMessage.value = null

    const payload: UpdateTalosModelProfilePayload = {
        provider: editForm.provider,
        display_name: editForm.display_name.trim(),
        model: editForm.model.trim(),
        base_url: normalizeOptionalUrl(editForm.base_url),
        timeout_seconds: Math.min(300, Math.max(5, Number(editForm.timeout_seconds) || 60)),
    }

    if (selectedProviderDefinition.value.requiresSecret && editForm.secret.trim()) {
        payload.secret = editForm.secret.trim()
    }

    verifyFailedProfileId.value = null

    try {
        const finalProfile = await updateAndProbeModelProfile(profile.id, payload)
        populateEditForm(finalProfile)
        if (finalProfile.status === 'healthy' && finalProfile.probe_result?.ok === true) {
            actionMessage.value = 'Saved and verified. Secret input cleared and ready in chat.'
        } else {
            verifyFailedProfileId.value = finalProfile.id
            actionError.value = 'Saved, but the persisted probe did not pass. Retry verification before using this profile in chat.'
        }
    } catch (error) {
        actionError.value = error instanceof Error ? error.message : 'TALOS could not save and verify this model profile.'
    } finally {
        savingProfileId.value = null
    }
}

async function retryVerify() {
    const profile = selectedProfile.value

    if (!profile || profileIsBusy(profile.id)) {
        return
    }

    probingProfileId.value = profile.id
    actionError.value = null
    actionMessage.value = null

    try {
        const probed = await probeModelProfile(profile.id)
        populateEditForm(probed)
        if (probed.status === 'healthy' && probed.probe_result?.ok === true) {
            verifyFailedProfileId.value = null
            actionMessage.value = 'Verification passed. This profile is ready in chat.'
        } else {
            verifyFailedProfileId.value = probed.id
            actionError.value = 'Verification still did not pass. Check the credential and provider model.'
        }
    } catch (error) {
        actionError.value = error instanceof Error ? error.message : 'TALOS could not verify this model profile.'
    } finally {
        probingProfileId.value = null
    }
}

async function loadCatalog() {
    const profile = selectedProfile.value

    if (!profile || loadingCatalog.value) {
        return
    }

    loadingCatalog.value = true
    catalogFault.value = null
    actionError.value = null

    try {
        catalog.value = await discoverModelCatalog(profile.id)
    } catch (error) {
        catalog.value = null
        if (error instanceof TalosModelCatalogError) {
            catalogFault.value = error.fault
        } else {
            actionError.value = error instanceof Error ? error.message : 'TALOS could not load this provider model catalog.'
        }
    } finally {
        loadingCatalog.value = false
    }
}

async function runProbe(profile: TalosModelProfile) {
    if (profileIsBusy(profile.id)) {
        return
    }

    probingProfileId.value = profile.id
    actionError.value = null
    actionMessage.value = null

    try {
        const updatedProfile = await probeModelProfile(profile.id)
        populateEditForm(updatedProfile)
        actionMessage.value = 'Probe completed.'
    } catch (error) {
        actionError.value = error instanceof Error ? error.message : 'TALOS could not probe this model profile.'
    } finally {
        probingProfileId.value = null
    }
}

function requestProfileDeletion(profile: TalosModelProfile) {
    if (profileIsBusy(profile.id)) {
        return
    }

    deleteReturnFocusTarget = document.activeElement instanceof HTMLElement ? document.activeElement : null
    pendingDeleteProfile.value = profile
    void nextTick(() => deleteDialog.value?.querySelector<HTMLElement>('[data-talos-delete-cancel]')?.focus())
}

function closeProfileDeleteDialog() {
    if (deletingProfileId.value) return

    pendingDeleteProfile.value = null
    void nextTick(() => {
        if (deleteReturnFocusTarget?.isConnected) deleteReturnFocusTarget.focus()
        deleteReturnFocusTarget = null
    })
}

function deleteDialogFocusableElements() {
    if (!deleteDialog.value) return []

    return Array.from(deleteDialog.value.querySelectorAll<HTMLElement>(
        'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
    )).filter((element) => !element.hasAttribute('hidden') && element.getAttribute('aria-hidden') !== 'true')
}

function handleDeleteDialogKeydown(event: KeyboardEvent) {
    if (event.key === 'Escape') {
        event.preventDefault()
        closeProfileDeleteDialog()
        return
    }

    if (event.key !== 'Tab') return

    const focusable = deleteDialogFocusableElements()
    const first = focusable[0]
    const last = focusable[focusable.length - 1]
    if (!first || !last) return

    if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
    } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
    }
}

async function removeProfile() {
    const profile = pendingDeleteProfile.value

    if (!profile || profileIsBusy(profile.id)) return

    deletingProfileId.value = profile.id
    actionError.value = null
    actionMessage.value = null

    try {
        await deleteModelProfile(profile.id)

        if (selectedProfileId.value === profile.id) {
            selectedProfileId.value = null
            editForm.secret = ''

            if (modelProfiles.value.length > 0) {
                populateEditForm(modelProfiles.value[0])
            }
        }

        actionMessage.value = 'Model profile deleted.'
    } catch (error) {
        actionError.value = error instanceof Error ? error.message : 'TALOS could not delete this model profile.'
    } finally {
        deletingProfileId.value = null
        closeProfileDeleteDialog()
    }
}

onMounted(() => {
    void refreshProfiles(true)
})
</script>

<template>
    <Surface>
        <div class="border-b border-[var(--talos-border)] p-4">
            <div class="flex items-start justify-between gap-3">
                <div>
                    <div class="flex items-center gap-2 text-xs font-semibold uppercase text-[var(--talos-muted)]">
                        <KeyRound class="h-4 w-4 text-[var(--talos-accent)]" />
                        Model Center
                    </div>
                    <div class="mt-1 flex items-center gap-1.5">
                        <h3 class="text-base font-semibold text-[var(--talos-text)]">Server-side provider profiles</h3>
                        <TalosGuideInfoButton guide-id="model_lab.models" compact side="bottom" />
                    </div>
                </div>
                <Button variant="ghost" size="sm" :disabled="loadingModelProfiles" @click="refreshProfiles()">
                    <Loader2 v-if="loadingModelProfiles" class="h-4 w-4 animate-spin" />
                    <RefreshCw v-else class="h-4 w-4" />
                    Sync
                </Button>
            </div>
        </div>

        <div class="space-y-4 p-4">
            <div v-if="visibleError" class="flex items-start gap-2 rounded-md border border-[var(--talos-warning-border)] bg-[var(--talos-warning-soft)] px-3 py-2 text-sm text-[var(--talos-text)]">
                <AlertCircle class="mt-0.5 h-4 w-4 shrink-0 text-[var(--talos-warning)]" />
                <span>{{ visibleError }}</span>
            </div>

            <div v-if="actionMessage" class="flex items-start gap-2 rounded-md border border-[var(--talos-success-border)] bg-[var(--talos-success-soft)] px-3 py-2 text-sm text-[var(--talos-text)]">
                <CheckCircle2 class="mt-0.5 h-4 w-4 shrink-0 text-[var(--talos-success)]" />
                <span>{{ actionMessage }}</span>
            </div>

            <TalosModelQuickAdd @created="handleQuickAdded" />

            <div class="overflow-hidden rounded-md border border-[var(--talos-border)]">
                <div class="grid gap-3 bg-[var(--talos-active)] px-3 py-2 text-xs font-semibold uppercase text-[var(--talos-muted)] sm:grid-cols-[minmax(0,1fr)_168px]">
                    <span>Profile</span>
                    <span class="sm:text-right">Readiness</span>
                </div>

                <div v-if="modelProfilesState === 'loading'" role="status" class="flex items-center gap-2 px-3 py-4 text-sm text-[var(--talos-muted)]">
                    <Loader2 class="h-4 w-4 animate-spin text-[var(--talos-accent)]" />
                    Loading model profiles
                </div>

                <div v-else-if="modelProfilesState === 'empty'" class="px-3 py-4 text-sm leading-6 text-[var(--talos-muted)]">
                    No server-side profiles returned by `/api/talos/model-profiles`.
                </div>

                <article
                    v-for="profile in modelProfiles"
                    v-else-if="modelProfilesState === 'ready'"
                    :key="profile.id"
                    class="border-t border-[var(--talos-border)]"
                >
                    <button
                        type="button"
                        class="grid w-full gap-3 px-3 py-3 text-left transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[var(--talos-accent)] sm:grid-cols-[minmax(0,1fr)_168px]"
                        :class="selectedProfileId === profile.id ? 'bg-[var(--talos-panel)]' : 'bg-[var(--talos-panel-soft)] hover:bg-[var(--talos-active)]'"
                        :disabled="deletingProfileId === profile.id"
                        @click="selectProfile(profile)"
                    >
                        <span class="flex min-w-0 items-start gap-3">
                            <TalosProviderIcon :provider="profile.provider" />
                            <span class="min-w-0">
                                <span class="block truncate text-sm font-semibold text-[var(--talos-text)]">{{ profile.display_name }}</span>
                                <span class="mt-1 block truncate font-mono text-xs text-[var(--talos-muted)]">{{ talosProviderById(profile.provider).label }} / {{ profile.model }}</span>
                                <span class="mt-2 block text-[11px] text-[var(--talos-muted)]">updated {{ formatDate(profile.updated_at) }}</span>
                                <span class="mt-3 flex flex-wrap gap-1.5">
                                    <Badge
                                        v-for="chip in capabilityChips(profile)"
                                        :key="chip.key"
                                        :tone="chip.tone"
                                        :title="`${chip.label} ${chip.detail}`"
                                    >
                                        {{ chip.available ? chip.label : `${chip.label} ${chip.detail}` }}
                                    </Badge>
                                </span>
                            </span>
                        </span>
                        <span class="flex min-w-0 flex-col items-start gap-2 sm:items-end">
                            <Badge :tone="avmCompatibility(profile).tone">AVM compatibility {{ avmCompatibility(profile).grade }}</Badge>
                            <Badge :tone="statusTone(profile.status)">{{ profile.status }}</Badge>
                            <span class="flex flex-wrap items-center gap-2 sm:justify-end">
                                <Badge :tone="secretTone(profile)">has_secret={{ profile.has_secret ? 'true' : 'false' }}</Badge>
                                <span class="text-[11px] text-[var(--talos-muted)]">{{ secretLabel(profile) }}</span>
                            </span>
                        </span>
                    </button>

                    <div class="grid gap-2 border-t border-[var(--talos-border)] bg-[var(--talos-panel)] px-3 py-2 text-xs text-[var(--talos-muted)] md:grid-cols-[minmax(0,1fr)_auto_auto]">
                        <span class="min-w-0">
                            <span class="block truncate">{{ probeSummary(profile) }}</span>
                            <span class="mt-1 block leading-5">{{ avmCompatibility(profile).reason }}</span>
                        </span>
                        <Button variant="secondary" size="sm" :disabled="profileIsBusy(profile.id) || (!profile.has_secret && talosProviderById(profile.provider).requiresSecret) || profile.status === 'disabled'" @click="runProbe(profile)">
                            <Loader2 v-if="probingProfileId === profile.id" class="h-4 w-4 animate-spin" />
                            <PlugZap v-else class="h-4 w-4" />
                            Probe
                        </Button>
                        <Button variant="ghost" size="sm" :disabled="profileIsBusy(profile.id)" @click="requestProfileDeletion(profile)">
                            <Loader2 v-if="deletingProfileId === profile.id" class="h-4 w-4 animate-spin" />
                            <Trash2 v-else class="h-4 w-4" />
                            Delete
                        </Button>
                    </div>
                </article>
            </div>

            <form v-if="selectedProfile" class="space-y-3 rounded-md border border-[var(--talos-border)] bg-[var(--talos-panel-soft)] p-3" @submit.prevent="submitUpdate">
                <div class="flex flex-wrap items-center justify-between gap-2">
                    <h4 class="text-sm font-semibold text-[var(--talos-text)]">Edit selected profile</h4>
                    <Badge :tone="secretTone(selectedProfile)">has_secret={{ selectedProfile.has_secret ? 'true' : 'false' }}</Badge>
                </div>

                <div class="grid gap-2">
                    <label class="space-y-1">
                        <span class="text-[11px] font-semibold uppercase text-[var(--talos-muted)]">Provider</span>
                        <select
                            v-model="editForm.provider"
                            class="h-9 w-full rounded-md border border-[var(--talos-border)] bg-[var(--talos-panel)] px-3 text-sm text-[var(--talos-text)] outline-none focus:border-[var(--talos-accent)]"
                            :disabled="selectedProfileIsBusy"
                        >
                            <option v-for="provider in providerOptions" :key="provider.value" :value="provider.value">
                                {{ provider.label }}
                            </option>
                        </select>
                    </label>
                </div>

                <label class="block space-y-1">
                    <span class="text-[11px] font-semibold uppercase text-[var(--talos-muted)]">Display name</span>
                    <input
                        v-model="editForm.display_name"
                        type="text"
                        class="h-9 w-full rounded-md border border-[var(--talos-border)] bg-[var(--talos-panel)] px-3 text-sm text-[var(--talos-text)] outline-none focus:border-[var(--talos-accent)]"
                        :disabled="selectedProfileIsBusy"
                    >
                </label>

                <label class="block space-y-1">
                    <span class="text-[11px] font-semibold uppercase text-[var(--talos-muted)]">Model</span>
                    <input
                        v-model="editForm.model"
                        type="text"
                        data-testid="talos-edit-model"
                        class="h-9 w-full rounded-md border border-[var(--talos-border)] bg-[var(--talos-panel)] px-3 text-sm text-[var(--talos-text)] outline-none focus:border-[var(--talos-accent)]"
                        :disabled="selectedProfileIsBusy"
                    >
                </label>

                <div class="space-y-2 rounded-md border border-[var(--talos-border)] bg-[var(--talos-panel)] p-2">
                    <div class="flex flex-wrap items-center justify-between gap-2">
                        <span class="text-[11px] font-semibold uppercase text-[var(--talos-muted)]">Provider catalog</span>
                        <Button type="button" variant="secondary" size="sm" data-testid="talos-model-load-catalog" :disabled="selectedProfileIsBusy || loadingCatalog" @click="loadCatalog">
                            <Loader2 v-if="loadingCatalog" class="h-4 w-4 animate-spin" />
                            <RadioTower v-else class="h-4 w-4" />
                            Load provider models
                        </Button>
                    </div>
                    <TalosProviderModelCombobox
                        v-if="catalog"
                        :models="catalogModels"
                        :model-value="editForm.model"
                        :loading="loadingCatalog"
                        :allow-manual-id="true"
                        @update:model-value="editForm.model = $event"
                        @refresh="loadCatalog"
                    />
                    <div v-if="catalogFault" data-testid="talos-catalog-fault" class="rounded-md border border-[var(--talos-danger-border)] bg-[var(--talos-danger-soft)] px-3 py-2 text-xs leading-5 text-[var(--talos-text)]">
                        {{ catalogFault.message }}
                    </div>
                    <ul v-if="catalogWarnings.length" class="space-y-1 text-[11px] leading-5 text-[var(--talos-muted)]">
                        <li v-for="warning in catalogWarnings" :key="warning">{{ warning }}</li>
                    </ul>
                </div>

                <label class="block space-y-1">
                    <span class="text-[11px] font-semibold uppercase text-[var(--talos-muted)]">Base URL</span>
                    <input
                        v-model="editForm.base_url"
                        type="url"
                        class="h-9 w-full rounded-md border border-[var(--talos-border)] bg-[var(--talos-panel)] px-3 text-sm text-[var(--talos-text)] outline-none placeholder:text-[var(--talos-muted)] focus:border-[var(--talos-accent)]"
                        placeholder="Use provider default"
                        :disabled="selectedProfileIsBusy"
                    >
                </label>

                <label class="block space-y-1">
                    <span class="text-[11px] font-semibold uppercase text-[var(--talos-muted)]">Timeout seconds</span>
                    <input
                        v-model.number="editForm.timeout_seconds"
                        type="number"
                        min="5"
                        max="300"
                        step="1"
                        class="h-9 w-full rounded-md border border-[var(--talos-border)] bg-[var(--talos-panel)] px-3 text-sm text-[var(--talos-text)] outline-none placeholder:text-[var(--talos-muted)] focus:border-[var(--talos-accent)]"
                        :disabled="selectedProfileIsBusy"
                    >
                </label>

                <label v-if="selectedProviderDefinition.requiresSecret" class="block space-y-1">
                    <span class="text-[11px] font-semibold uppercase text-[var(--talos-muted)]">Rotate secret</span>
                    <input
                        v-model="editForm.secret"
                        type="password"
                        autocomplete="new-password"
                        class="h-9 w-full rounded-md border border-[var(--talos-border)] bg-[var(--talos-panel)] px-3 text-sm text-[var(--talos-text)] outline-none placeholder:text-[var(--talos-muted)] focus:border-[var(--talos-accent)]"
                        placeholder="Leave blank to keep existing secret"
                        :disabled="selectedProfileIsBusy"
                    >
                </label>
                <p v-else class="rounded-md border border-[var(--talos-border)] bg-[var(--talos-panel)] px-3 py-2 text-xs leading-5 text-[var(--talos-muted)]">
                    Local providers are allowed only without bearer tokens. TALOS will clear any stored secret for this profile.
                </p>

                <Button type="submit" size="sm" class="w-full" data-testid="talos-model-save-verify" :disabled="!canUpdateProfile">
                    <Loader2 v-if="savingProfileId === selectedProfile.id" class="h-4 w-4 animate-spin" />
                    <ShieldCheck v-else class="h-4 w-4" />
                    Save &amp; verify
                </Button>

                <Button
                    v-if="verifyFailedProfileId === selectedProfile.id"
                    type="button"
                    variant="secondary"
                    size="sm"
                    class="w-full"
                    data-testid="talos-model-retry-verify"
                    :disabled="selectedProfileIsBusy"
                    @click="retryVerify"
                >
                    <Loader2 v-if="probingProfileId === selectedProfile.id" class="h-4 w-4 animate-spin" />
                    <PlugZap v-else class="h-4 w-4" />
                    Retry verification
                </Button>
            </form>

            <div v-if="pendingDeleteProfile" class="fixed inset-0 z-[110] grid place-items-center bg-black/45 p-4 backdrop-blur-[1px]" @click.self="closeProfileDeleteDialog">
                <section
                    ref="deleteDialog"
                    role="dialog"
                    aria-modal="true"
                    aria-labelledby="talos-delete-model-profile-title"
                    aria-describedby="talos-delete-model-profile-description"
                    class="w-full max-w-md rounded-md border border-[var(--talos-danger-border)] bg-[var(--talos-card)] p-4 shadow-xl"
                    @keydown="handleDeleteDialogKeydown"
                >
                    <h4 id="talos-delete-model-profile-title" class="text-base font-semibold text-[var(--talos-text)]">Delete model profile</h4>
                    <p id="talos-delete-model-profile-description" class="mt-2 text-sm leading-6 text-[var(--talos-muted)]">
                        Delete {{ pendingDeleteProfile.display_name }}? This removes its stored provider configuration.
                    </p>
                    <div class="mt-4 flex justify-end gap-2">
                        <Button data-talos-delete-cancel variant="ghost" :disabled="Boolean(deletingProfileId)" @click="closeProfileDeleteDialog">Cancel</Button>
                        <Button variant="destructive" :loading="Boolean(deletingProfileId)" @click="removeProfile">Confirm delete</Button>
                    </div>
                </section>
            </div>
        </div>
    </Surface>
</template>
