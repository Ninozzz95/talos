<script setup lang="ts">
import { computed, nextTick, reactive, ref, watch } from 'vue'
import { AlertCircle, CheckCircle2, ChevronDown, Loader2, Plus, RadioTower, ShieldCheck } from '@lucide/vue'
import Button from '../../ui/Button.vue'
import Badge from '../../ui/Badge.vue'
import TalosProviderIcon from './TalosProviderIcon.vue'
import TalosProviderModelCombobox from './TalosProviderModelCombobox.vue'
import TalosModelAdvancedOptions from './TalosModelAdvancedOptions.vue'
import {
    talosProviderById,
    talosProviderCatalog,
    type TalosProviderDefinition,
    type TalosProviderId,
} from '../../../lib/talosProviders'
import {
    useTalosModelProfiles,
    TalosModelCatalogError,
    type CreateTalosModelProfilePayload,
    type DiscoverDraftModelCatalogPayload,
} from '../../../composables/useTalosModelProfiles'
import type { TalosModelCatalogFault, TalosModelProfile, TalosProviderModelCatalog } from '../../../lib/talosTypes'

const emit = defineEmits<{
    created: [profile: TalosModelProfile]
}>()

const {
    createAndProbeModelProfile,
    discoverDraftModelCatalog,
} = useTalosModelProfiles()

const selectedProviderId = ref<TalosProviderId>('openai')
const advancedOpen = ref(false)
const discovering = ref(false)
const addingProfile = ref(false)
const actionError = ref<string | null>(null)
const actionMessage = ref<string | null>(null)
const catalog = ref<TalosProviderModelCatalog | null>(null)
const discoveryFault = ref<TalosModelCatalogFault | null>(null)
const attemptedDiscovery = ref(false)

const form = reactive({
    secret: '',
    displayName: '',
    model: '',
    baseUrl: '',
    timeoutSeconds: talosProviderById('openai').defaultTimeoutSeconds,
    capabilities: { ...talosProviderById('openai').capabilities },
})

const selectedProvider = computed(() => talosProviderById(selectedProviderId.value))
const remoteSecretReady = computed(() => !selectedProvider.value.requiresSecret || form.secret.trim().length > 0)
const effectiveModel = computed(() => form.model.trim() || selectedProvider.value.defaultModel)
const effectiveBaseUrl = computed(() => form.baseUrl.trim() || selectedProvider.value.defaultBaseUrl)
const catalogModels = computed(() => catalog.value?.models ?? [])
const canDiscover = computed(() => remoteSecretReady.value && !discovering.value && !addingProfile.value)
const canAddProfile = computed(() => remoteSecretReady.value
    && form.model.trim().length > 0
    && !discovering.value
    && !addingProfile.value)
const discoveryWarnings = computed(() => catalog.value?.warnings ?? [])
// The credential identity that a discovered catalog belongs to. When it
// changes, the stale catalog and any selection must be discarded.
const credentialFingerprint = computed(() => JSON.stringify({
    provider: selectedProviderId.value,
    secret: selectedProvider.value.requiresSecret ? form.secret.trim() : '',
    baseUrl: effectiveBaseUrl.value,
}))

function resetDiscovery() {
    catalog.value = null
    discoveryFault.value = null
    attemptedDiscovery.value = false
    form.model = ''
}

watch(selectedProviderId, (providerId) => {
    const provider = talosProviderById(providerId)
    form.secret = ''
    form.displayName = ''
    form.model = ''
    form.baseUrl = provider.baseUrlVisibleByDefault ? provider.defaultBaseUrl : ''
    form.timeoutSeconds = provider.defaultTimeoutSeconds
    form.capabilities = { ...provider.capabilities }
    advancedOpen.value = provider.baseUrlVisibleByDefault
    actionError.value = null
    actionMessage.value = null
    resetDiscovery()
}, { immediate: true })

watch(credentialFingerprint, () => {
    actionMessage.value = null
    // A changed provider/key/base URL invalidates the discovered catalog.
    if (attemptedDiscovery.value || catalog.value || form.model) {
        resetDiscovery()
    }
})

function payload(provider: TalosProviderDefinition): CreateTalosModelProfilePayload {
    const request: CreateTalosModelProfilePayload = {
        provider: provider.id,
        display_name: form.displayName.trim() || `${provider.label} quick profile`,
        model: effectiveModel.value,
        base_url: effectiveBaseUrl.value,
        timeout_seconds: Math.min(300, Math.max(5, Number(form.timeoutSeconds) || provider.defaultTimeoutSeconds)),
        capabilities: { ...form.capabilities },
    }

    if (provider.requiresSecret) {
        request.secret = form.secret.trim()
    }

    return request
}

async function discoverModels() {
    if (!canDiscover.value) {
        return
    }

    discovering.value = true
    actionError.value = null
    actionMessage.value = null
    discoveryFault.value = null

    const provider = selectedProvider.value
    const request: DiscoverDraftModelCatalogPayload = { provider: provider.id }
    if (provider.requiresSecret) {
        request.secret = form.secret.trim()
    }
    if (form.baseUrl.trim()) {
        request.base_url = form.baseUrl.trim()
    }

    try {
        const discovered = await discoverDraftModelCatalog(request)
        catalog.value = discovered
        attemptedDiscovery.value = true
        actionMessage.value = discovered.complete
            ? `Discovered ${discovered.models.length} models. Select one to save.`
            : `Discovered ${discovered.models.length} models (partial catalog). Select one to save.`
    } catch (error) {
        catalog.value = null
        form.model = ''
        attemptedDiscovery.value = true
        if (error instanceof TalosModelCatalogError) {
            discoveryFault.value = error.fault
        } else {
            actionError.value = error instanceof Error ? error.message : 'TALOS could not discover provider models.'
        }
    } finally {
        discovering.value = false
    }
}

async function testAndAdd() {
    if (!canAddProfile.value) {
        return
    }

    addingProfile.value = true
    actionError.value = null
    actionMessage.value = null

    try {
        const provider = selectedProvider.value
        const profile = await createAndProbeModelProfile(payload(provider))

        emit('created', profile)
        form.secret = ''
        resetDiscovery()
        await nextTick()
        actionMessage.value = profile.status === 'healthy' && profile.probe_result?.ok === true
            ? 'Profile saved and verified. It is ready in chat.'
            : 'Profile saved, but its persisted probe is not healthy yet.'
        if (profile.status !== 'healthy' || profile.probe_result?.ok !== true) {
            actionError.value = 'Review the persisted probe result before using this profile in chat.'
        }
    } catch (error) {
        actionError.value = error instanceof Error ? error.message : 'TALOS could not add this provider profile.'
    } finally {
        addingProfile.value = false
    }
}
</script>

<template>
    <section class="space-y-3 rounded-md border border-[var(--talos-border)] bg-[var(--talos-panel-soft)] p-3" data-testid="talos-model-quick-add">
        <div class="flex flex-wrap items-start justify-between gap-3">
            <div>
                <h4 class="text-sm font-semibold text-[var(--talos-text)]">Provider-first model setup</h4>
                <p class="mt-1 max-w-2xl text-xs leading-5 text-[var(--talos-muted)]">
                    Choose a provider, add only the required credential, test the adapter, then persist a server-side profile.
                </p>
            </div>
            <Badge tone="success">server-side secrets</Badge>
        </div>

        <div v-if="actionError" class="flex items-start gap-2 rounded-md border border-[var(--talos-warning-border)] bg-[var(--talos-warning-soft)] px-3 py-2 text-sm text-[var(--talos-text)]">
            <AlertCircle class="mt-0.5 h-4 w-4 shrink-0 text-[var(--talos-warning)]" />
            <span>{{ actionError }}</span>
        </div>

        <div v-if="actionMessage" class="flex items-start gap-2 rounded-md border border-[var(--talos-success-border)] bg-[var(--talos-success-soft)] px-3 py-2 text-sm text-[var(--talos-text)]">
            <CheckCircle2 class="mt-0.5 h-4 w-4 shrink-0 text-[var(--talos-success)]" />
            <span>{{ actionMessage }}</span>
        </div>

        <div class="grid gap-2 xl:grid-cols-3">
            <button
                v-for="provider in talosProviderCatalog"
                :key="provider.id"
                type="button"
                :aria-label="`Choose ${provider.label} provider`"
                class="flex min-h-[116px] items-start gap-3 rounded-md border p-3 text-left transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--talos-accent)]"
                :class="selectedProviderId === provider.id ? 'border-[var(--talos-accent-border)] bg-[var(--talos-active)]' : 'border-[var(--talos-border)] bg-[var(--talos-panel)] hover:bg-[var(--talos-active)]'"
                @click="selectedProviderId = provider.id"
            >
                <TalosProviderIcon :provider="provider.id" />
                <span class="min-w-0">
                    <span class="flex flex-wrap items-center gap-2 text-sm font-semibold text-[var(--talos-text)]">
                        {{ provider.label }}
                        <Badge :tone="provider.requiresSecret ? 'neutral' : 'success'">
                            {{ provider.requiresSecret ? 'remote key' : 'local no key' }}
                        </Badge>
                    </span>
                    <span class="mt-1 block text-xs leading-5 text-[var(--talos-muted)]">{{ provider.description }}</span>
                    <span class="mt-2 block truncate font-mono text-[11px] text-[var(--talos-muted)]">{{ provider.defaultModel }}</span>
                </span>
            </button>
        </div>

        <div class="grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto]">
            <div class="space-y-2">
                <label v-if="selectedProvider.requiresSecret" class="block space-y-1">
                    <span class="text-[11px] font-semibold uppercase text-[var(--talos-muted)]">Provider API key</span>
                    <input
                        v-model="form.secret"
                        type="password"
                        autocomplete="new-password"
                        data-testid="talos-provider-secret"
                        class="h-10 w-full rounded-md border border-[var(--talos-border)] bg-[var(--talos-panel)] px-3 text-sm text-[var(--talos-text)] outline-none placeholder:text-[var(--talos-muted)] focus:border-[var(--talos-accent)]"
                        placeholder="Stored by Laravel, never returned"
                    >
                </label>
                <label v-else class="block space-y-1">
                    <span class="text-[11px] font-semibold uppercase text-[var(--talos-muted)]">Local endpoint</span>
                    <input
                        v-model="form.baseUrl"
                        type="url"
                        class="h-10 w-full rounded-md border border-[var(--talos-border)] bg-[var(--talos-panel)] px-3 text-sm text-[var(--talos-text)] outline-none placeholder:text-[var(--talos-muted)] focus:border-[var(--talos-accent)]"
                        :placeholder="selectedProvider.defaultBaseUrl"
                    >
                </label>
                <p class="flex items-start gap-2 text-xs leading-5 text-[var(--talos-muted)]">
                    <ShieldCheck class="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--talos-accent)]" />
                    <span>{{ selectedProvider.policyNote }}</span>
                </p>
            </div>

            <div class="flex flex-wrap items-end gap-2 lg:justify-end">
                <Button type="button" variant="secondary" size="sm" data-testid="talos-model-discover" :disabled="!canDiscover" @click="discoverModels">
                    <Loader2 v-if="discovering" class="h-4 w-4 animate-spin" />
                    <RadioTower v-else class="h-4 w-4" />
                    Discover models
                </Button>
                <Button
                    type="button"
                    size="sm"
                    data-testid="talos-model-add"
                    :disabled="!canAddProfile"
                    :title="canAddProfile ? 'Save this provider profile server-side' : 'Discover and select a provider model before saving'"
                    @click="testAndAdd"
                >
                    <Loader2 v-if="addingProfile" class="h-4 w-4 animate-spin" />
                    <Plus v-else class="h-4 w-4" />
                    Add profile
                </Button>
                <Button type="button" variant="ghost" size="sm" @click="advancedOpen = !advancedOpen">
                    <ChevronDown class="h-4 w-4 transition" :class="advancedOpen ? 'rotate-180' : ''" />
                    Advanced options
                </Button>
            </div>
        </div>

        <div v-if="attemptedDiscovery" class="space-y-2">
            <span class="text-[11px] font-semibold uppercase text-[var(--talos-muted)]">Provider model</span>
            <TalosProviderModelCombobox
                :models="catalogModels"
                :model-value="form.model"
                :loading="discovering"
                :allow-manual-id="true"
                @update:model-value="form.model = $event"
                @refresh="discoverModels"
            />
            <div v-if="discoveryFault" data-testid="talos-discovery-fault" class="rounded-md border border-[var(--talos-danger-border)] bg-[var(--talos-danger-soft)] px-3 py-2 text-xs leading-5 text-[var(--talos-text)]">
                {{ discoveryFault.message }}
                <span v-if="discoveryFault.retryable" class="block text-[var(--talos-muted)]">
                    You can retry this discovery{{ discoveryFault.retry_after_seconds ? ` after ${discoveryFault.retry_after_seconds}s` : '' }}.
                </span>
            </div>
            <ul v-if="discoveryWarnings.length" class="space-y-1 text-[11px] leading-5 text-[var(--talos-muted)]">
                <li v-for="warning in discoveryWarnings" :key="warning">{{ warning }}</li>
            </ul>
        </div>

        <TalosModelAdvancedOptions
            v-if="advancedOpen"
            :provider="selectedProvider"
            :display-name="form.displayName"
            :model="form.model"
            :base-url="form.baseUrl"
            :timeout-seconds="form.timeoutSeconds"
            :capabilities="form.capabilities"
            :disabled="testingDraft || addingProfile"
            @update:display-name="form.displayName = $event"
            @update:model="form.model = $event"
            @update:base-url="form.baseUrl = $event"
            @update:timeout-seconds="form.timeoutSeconds = $event"
            @update:capabilities="form.capabilities = $event"
        />
    </section>
</template>
