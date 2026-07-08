<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { AlertCircle, CheckCircle2, KeyRound, Loader2, PlugZap, RefreshCw, Save, Trash2 } from '@lucide/vue'
import Button from '../../ui/Button.vue'
import Badge from '../../ui/Badge.vue'
import Surface from '../../ui/Surface.vue'
import {
    useTalosModelProfiles,
    type CreateTalosModelProfilePayload,
    type UpdateTalosModelProfilePayload,
} from '../../../composables/useTalosModelProfiles'
import type { TalosModelProfile } from '../../../lib/talosTypes'

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

const providerOptions: Array<{ value: TalosModelProfile['provider']; label: string }> = [
    { value: 'openai', label: 'OpenAI' },
    { value: 'deepseek', label: 'DeepSeek' },
]

const statusOptions: TalosModelProfile['status'][] = [
    'untested',
    'healthy',
    'degraded',
    'failed',
    'disabled',
]

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
    createModelProfile,
    updateModelProfile,
    deleteModelProfile,
    probeModelProfile,
} = useTalosModelProfiles()

const createForm = reactive({
    provider: 'openai' as TalosModelProfile['provider'],
    display_name: '',
    model: '',
    base_url: '',
    secret: '',
})

const editForm = reactive({
    provider: 'openai' as TalosModelProfile['provider'],
    display_name: '',
    model: '',
    base_url: '',
    status: 'untested' as TalosModelProfile['status'],
    secret: '',
})

const selectedProfileId = ref<string | null>(null)
const creatingProfile = ref(false)
const savingProfileId = ref<string | null>(null)
const probingProfileId = ref<string | null>(null)
const deletingProfileId = ref<string | null>(null)
const actionError = ref<string | null>(null)
const actionMessage = ref<string | null>(null)

const selectedProfile = computed(() => {
    return modelProfiles.value.find((profile) => profile.id === selectedProfileId.value) ?? null
})
const selectedProfileIsBusy = computed(() => {
    return selectedProfile.value ? profileIsBusy(selectedProfile.value.id) : false
})
const canCreateProfile = computed(() => {
    return Boolean(
        createForm.display_name.trim()
        && createForm.model.trim()
        && createForm.secret.trim()
        && !creatingProfile.value,
    )
})
const canUpdateProfile = computed(() => {
    return Boolean(
        selectedProfile.value
        && editForm.display_name.trim()
        && editForm.model.trim()
        && !selectedProfileIsBusy.value,
    )
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

function resetCreateForm() {
    createForm.provider = 'openai'
    createForm.display_name = ''
    createForm.model = ''
    createForm.base_url = ''
    createForm.secret = ''
}

function populateEditForm(profile: TalosModelProfile) {
    selectedProfileId.value = profile.id
    editForm.provider = profile.provider
    editForm.display_name = profile.display_name
    editForm.model = profile.model
    editForm.base_url = profile.base_url ?? ''
    editForm.status = profile.status
    editForm.secret = ''
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

function baseUrlIsLocal(profile: TalosModelProfile): boolean {
    const baseUrl = profile.base_url

    if (!baseUrl) {
        return false
    }

    try {
        const host = new URL(baseUrl).hostname.toLowerCase()

        return host === 'localhost'
            || host === '127.0.0.1'
            || host === '::1'
            || host.endsWith('.local')
    } catch {
        return false
    }
}

function capabilityAvailable(profile: TalosModelProfile, definition: typeof capabilityDefinitions[number]): boolean {
    const capabilities = asRecord(profile.capabilities)
    const probeResult = asRecord(profile.probe_result)
    const probedPolicy = asRecord(probeResult.policy)
    const directValue = booleanFromRecord(capabilities, definition.aliases)
    const probeValue = booleanFromRecord(probeResult, definition.aliases)

    if (directValue !== null) {
        return directValue
    }

    if (probeValue !== null) {
        return probeValue
    }

    if (definition.key === 'local') {
        return baseUrlIsLocal(profile)
    }

    if (definition.key === 'remote') {
        const publicPolicy = booleanFromRecord(probedPolicy, ['public_url', 'public_network'])

        if (publicPolicy !== null) {
            return publicPolicy
        }

        return !baseUrlIsLocal(profile)
    }

    return false
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

    if (!profile.has_secret) {
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

    if (profile.status === 'healthy' && hasJson && hasTools && hasRemoteOrLocalRuntime) {
        return {
            grade: 'A',
            tone: 'success',
            reason: 'Ready for typed AVM planning, tool calls, and controlled execution.',
        }
    }

    if ((profile.status === 'healthy' || profile.status === 'degraded') && hasJson && hasRemoteOrLocalRuntime) {
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

async function refreshProfiles(selectFirst = false) {
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

async function submitCreate() {
    if (!canCreateProfile.value) {
        return
    }

    creatingProfile.value = true
    actionError.value = null
    actionMessage.value = null

    const payload: CreateTalosModelProfilePayload = {
        provider: createForm.provider,
        display_name: createForm.display_name.trim(),
        model: createForm.model.trim(),
        secret: createForm.secret.trim(),
        base_url: normalizeOptionalUrl(createForm.base_url),
        status: 'untested',
    }

    try {
        const profile = await createModelProfile(payload)
        resetCreateForm()
        populateEditForm(profile)
        actionMessage.value = 'Model profile created. Secret stored server-side.'
    } catch (error) {
        actionError.value = error instanceof Error ? error.message : 'TALOS could not create this model profile.'
    } finally {
        creatingProfile.value = false
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
        status: editForm.status,
    }

    if (editForm.secret.trim()) {
        payload.secret = editForm.secret.trim()
    }

    try {
        const updatedProfile = await updateModelProfile(profile.id, payload)
        populateEditForm(updatedProfile)
        actionMessage.value = 'Model profile saved. Secret input cleared.'
    } catch (error) {
        actionError.value = error instanceof Error ? error.message : 'TALOS could not update this model profile.'
    } finally {
        savingProfileId.value = null
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

async function removeProfile(profile: TalosModelProfile) {
    if (profileIsBusy(profile.id)) {
        return
    }

    const confirmed = window.confirm(`Delete model profile "${profile.display_name}"?`)

    if (!confirmed) {
        return
    }

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
                    <h3 class="mt-1 text-base font-semibold text-[var(--talos-text)]">Server-side provider profiles</h3>
                </div>
                <Button variant="ghost" size="sm" :disabled="loadingModelProfiles" @click="refreshProfiles()">
                    <Loader2 v-if="loadingModelProfiles" class="h-4 w-4 animate-spin" />
                    <RefreshCw v-else class="h-4 w-4" />
                    Sync
                </Button>
            </div>
        </div>

        <div class="space-y-4 p-4">
            <div v-if="actionError || modelProfileError" class="flex items-start gap-2 rounded-md border border-[var(--talos-warning-border)] bg-[var(--talos-warning-soft)] px-3 py-2 text-sm text-[var(--talos-text)]">
                <AlertCircle class="mt-0.5 h-4 w-4 shrink-0 text-[var(--talos-warning)]" />
                <span>{{ actionError || modelProfileError }}</span>
            </div>

            <div v-if="actionMessage" class="flex items-start gap-2 rounded-md border border-[var(--talos-success-border)] bg-[var(--talos-success-soft)] px-3 py-2 text-sm text-[var(--talos-text)]">
                <CheckCircle2 class="mt-0.5 h-4 w-4 shrink-0 text-[var(--talos-success)]" />
                <span>{{ actionMessage }}</span>
            </div>

            <form class="space-y-3 rounded-md border border-[var(--talos-border)] bg-[var(--talos-panel-soft)] p-3" @submit.prevent="submitCreate">
                <div class="flex items-center justify-between gap-3">
                    <h4 class="text-sm font-semibold text-[var(--talos-text)]">Create profile</h4>
                    <Badge tone="neutral">secret required</Badge>
                </div>

                <div class="grid gap-2 md:grid-cols-2">
                    <label class="space-y-1">
                        <span class="text-[11px] font-semibold uppercase text-[var(--talos-muted)]">Provider</span>
                        <select
                            v-model="createForm.provider"
                            class="h-9 w-full rounded-md border border-[var(--talos-border)] bg-[var(--talos-panel)] px-3 text-sm text-[var(--talos-text)] outline-none focus:border-[var(--talos-accent)]"
                        >
                            <option v-for="provider in providerOptions" :key="provider.value" :value="provider.value">
                                {{ provider.label }}
                            </option>
                        </select>
                    </label>
                    <label class="space-y-1">
                        <span class="text-[11px] font-semibold uppercase text-[var(--talos-muted)]">Display name</span>
                        <input
                            v-model="createForm.display_name"
                            type="text"
                            class="h-9 w-full rounded-md border border-[var(--talos-border)] bg-[var(--talos-panel)] px-3 text-sm text-[var(--talos-text)] outline-none placeholder:text-[var(--talos-muted)] focus:border-[var(--talos-accent)]"
                            placeholder="Production OpenAI"
                        >
                    </label>
                </div>

                <label class="block space-y-1">
                    <span class="text-[11px] font-semibold uppercase text-[var(--talos-muted)]">Model</span>
                    <input
                        v-model="createForm.model"
                        type="text"
                        class="h-9 w-full rounded-md border border-[var(--talos-border)] bg-[var(--talos-panel)] px-3 text-sm text-[var(--talos-text)] outline-none placeholder:text-[var(--talos-muted)] focus:border-[var(--talos-accent)]"
                        placeholder="gpt-4.1-mini"
                    >
                </label>

                <label class="block space-y-1">
                    <span class="text-[11px] font-semibold uppercase text-[var(--talos-muted)]">Base URL</span>
                    <input
                        v-model="createForm.base_url"
                        type="url"
                        class="h-9 w-full rounded-md border border-[var(--talos-border)] bg-[var(--talos-panel)] px-3 text-sm text-[var(--talos-text)] outline-none placeholder:text-[var(--talos-muted)] focus:border-[var(--talos-accent)]"
                        placeholder="https://api.openai.com/v1"
                    >
                </label>

                <label class="block space-y-1">
                    <span class="text-[11px] font-semibold uppercase text-[var(--talos-muted)]">Provider secret</span>
                    <input
                        v-model="createForm.secret"
                        type="password"
                        autocomplete="new-password"
                        class="h-9 w-full rounded-md border border-[var(--talos-border)] bg-[var(--talos-panel)] px-3 text-sm text-[var(--talos-text)] outline-none placeholder:text-[var(--talos-muted)] focus:border-[var(--talos-accent)]"
                        placeholder="Stored by Laravel, never returned"
                    >
                </label>

                <Button type="submit" size="sm" class="w-full" :disabled="!canCreateProfile">
                    <Loader2 v-if="creatingProfile" class="h-4 w-4 animate-spin" />
                    <KeyRound v-else class="h-4 w-4" />
                    Create profile
                </Button>
            </form>

            <div class="overflow-hidden rounded-md border border-[var(--talos-border)]">
                <div class="grid gap-3 bg-[var(--talos-active)] px-3 py-2 text-xs font-semibold uppercase text-[var(--talos-muted)] sm:grid-cols-[minmax(0,1fr)_168px]">
                    <span>Profile</span>
                    <span class="sm:text-right">Readiness</span>
                </div>

                <div v-if="loadingModelProfiles && !modelProfiles.length" class="flex items-center gap-2 px-3 py-4 text-sm text-[var(--talos-muted)]">
                    <Loader2 class="h-4 w-4 animate-spin text-[var(--talos-accent)]" />
                    Loading model profiles
                </div>

                <div v-else-if="!modelProfiles.length" class="px-3 py-4 text-sm leading-6 text-[var(--talos-muted)]">
                    No server-side profiles returned by `/api/talos/model-profiles`.
                </div>

                <article
                    v-for="profile in modelProfiles"
                    v-else
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
                        <span class="min-w-0">
                            <span class="block truncate text-sm font-semibold text-[var(--talos-text)]">{{ profile.display_name }}</span>
                            <span class="mt-1 block truncate font-mono text-xs text-[var(--talos-muted)]">{{ profile.provider }}/{{ profile.model }}</span>
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
                        <span class="flex min-w-0 flex-col items-start gap-2 sm:items-end">
                            <Badge :tone="avmCompatibility(profile).tone">AVM compatibility {{ avmCompatibility(profile).grade }}</Badge>
                            <Badge :tone="statusTone(profile.status)">{{ profile.status }}</Badge>
                            <Badge :tone="secretTone(profile)">has_secret={{ profile.has_secret ? 'true' : 'false' }}</Badge>
                        </span>
                    </button>

                    <div class="grid gap-2 border-t border-[var(--talos-border)] bg-[var(--talos-panel)] px-3 py-2 text-xs text-[var(--talos-muted)] md:grid-cols-[minmax(0,1fr)_auto_auto]">
                        <span class="min-w-0">
                            <span class="block truncate">{{ probeSummary(profile) }}</span>
                            <span class="mt-1 block leading-5">{{ avmCompatibility(profile).reason }}</span>
                        </span>
                        <Button variant="secondary" size="sm" :disabled="profileIsBusy(profile.id) || !profile.has_secret || profile.status === 'disabled'" @click="runProbe(profile)">
                            <Loader2 v-if="probingProfileId === profile.id" class="h-4 w-4 animate-spin" />
                            <PlugZap v-else class="h-4 w-4" />
                            Probe
                        </Button>
                        <Button variant="ghost" size="sm" :disabled="profileIsBusy(profile.id)" @click="removeProfile(profile)">
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

                <div class="grid gap-2 md:grid-cols-2">
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
                    <label class="space-y-1">
                        <span class="text-[11px] font-semibold uppercase text-[var(--talos-muted)]">Status</span>
                        <select
                            v-model="editForm.status"
                            class="h-9 w-full rounded-md border border-[var(--talos-border)] bg-[var(--talos-panel)] px-3 text-sm text-[var(--talos-text)] outline-none focus:border-[var(--talos-accent)]"
                            :disabled="selectedProfileIsBusy"
                        >
                            <option v-for="status in statusOptions" :key="status" :value="status">
                                {{ status }}
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
                        class="h-9 w-full rounded-md border border-[var(--talos-border)] bg-[var(--talos-panel)] px-3 text-sm text-[var(--talos-text)] outline-none focus:border-[var(--talos-accent)]"
                        :disabled="selectedProfileIsBusy"
                    >
                </label>

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

                <Button type="submit" size="sm" class="w-full" :disabled="!canUpdateProfile">
                    <Loader2 v-if="savingProfileId === selectedProfile.id" class="h-4 w-4 animate-spin" />
                    <Save v-else class="h-4 w-4" />
                    Save profile
                </Button>
            </form>
        </div>
    </Surface>
</template>
