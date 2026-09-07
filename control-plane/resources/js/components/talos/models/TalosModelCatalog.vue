<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { Eye, EyeOff, Loader2, RefreshCw, Search } from '@lucide/vue'
import Surface from '../../ui/Surface.vue'
import Button from '../../ui/Button.vue'
import Badge from '../../ui/Badge.vue'
import TalosProviderIcon from './TalosProviderIcon.vue'
import TalosGuideInfoButton from '../guide/TalosGuideInfoButton.vue'
import { useTalosModelProfiles } from '../../../composables/useTalosModelProfiles'
import { talosProviderById, talosProviderCatalog } from '../../../lib/talosProviders'
import { talosComposerEffortLadder, talosEffortLabel, talosProfileVisibleInComposer } from '../../../lib/talosEffort'
import type { TalosModelProfile } from '../../../lib/talosTypes'

const {
    modelProfiles,
    loadingModelProfiles,
    modelProfileError,
    loadModelProfiles,
    setModelProfileComposerVisibility,
} = useTalosModelProfiles()

const providerFilter = ref<string>('all')
const search = ref('')
const togglingProfileId = ref<string | null>(null)
const actionError = ref<string | null>(null)

const providerFilters = computed(() => {
    const present = new Set(modelProfiles.value.map((profile) => profile.provider))
    return [
        { id: 'all', label: 'All providers' },
        ...talosProviderCatalog
            .filter((provider) => present.has(provider.id))
            .map((provider) => ({ id: provider.id, label: provider.label })),
    ]
})

const visibleProfiles = computed(() => {
    const needle = search.value.trim().toLowerCase()
    return modelProfiles.value.filter((profile) => {
        if (providerFilter.value !== 'all' && profile.provider !== providerFilter.value) return false
        if (!needle) return true
        return profile.display_name.toLowerCase().includes(needle)
            || profile.model.toLowerCase().includes(needle)
            || profile.provider.toLowerCase().includes(needle)
    })
})

function capability(profile: TalosModelProfile, key: string): boolean {
    const bag = profile.capabilities
    if (!bag || typeof bag !== 'object' || Array.isArray(bag)) return false
    return (bag as Record<string, unknown>)[key] === true
}

function contextWindow(profile: TalosModelProfile): number | null {
    const bag = profile.capabilities as Record<string, unknown> | null | undefined
    const value = bag && typeof bag === 'object' ? bag.context_window : null
    return typeof value === 'number' && value > 0 ? value : null
}

type CompatFlag = { label: string; tone: 'success' | 'warning' | 'neutral' }

function chatCompat(profile: TalosModelProfile): CompatFlag {
    if (profile.status === 'healthy' && profile.probe_result?.ok === true) {
        return { label: 'Chat ready', tone: 'success' }
    }
    if (profile.status === 'failed' || profile.status === 'disabled') {
        return { label: 'Not a chat model', tone: 'neutral' }
    }
    return { label: 'Unverified — probe', tone: 'warning' }
}

function effortLadder(profile: TalosModelProfile) {
    return talosComposerEffortLadder(profile)
}

async function toggleVisibility(profile: TalosModelProfile) {
    if (togglingProfileId.value) return
    togglingProfileId.value = profile.id
    actionError.value = null
    try {
        await setModelProfileComposerVisibility(profile.id, !talosProfileVisibleInComposer(profile))
    } catch (error) {
        actionError.value = error instanceof Error ? error.message : 'TALOS could not update composer visibility.'
    } finally {
        togglingProfileId.value = null
    }
}

const visibleError = computed(() => actionError.value || modelProfileError.value)

onMounted(() => {
    if (modelProfiles.value.length === 0) void loadModelProfiles().catch(() => undefined)
})
</script>

<template>
    <Surface>
        <div class="border-b border-[var(--talos-border)] p-4">
            <div class="flex items-start justify-between gap-3">
                <div>
                    <div class="text-xs font-semibold uppercase text-[var(--talos-muted)]">Provider catalog</div>
                    <div class="mt-1 flex items-center gap-1.5">
                        <h3 class="text-base font-semibold text-[var(--talos-text)]">Models, effort and composer visibility</h3>
                        <TalosGuideInfoButton guide-id="model_lab.models" compact side="bottom" />
                    </div>
                </div>
                <Button variant="ghost" size="sm" :disabled="loadingModelProfiles" @click="loadModelProfiles()">
                    <Loader2 v-if="loadingModelProfiles" class="h-4 w-4 animate-spin" />
                    <RefreshCw v-else class="h-4 w-4" />
                    Sync
                </Button>
            </div>

            <div class="mt-3 flex flex-wrap items-center gap-2">
                <button
                    v-for="filter in providerFilters"
                    :key="filter.id"
                    type="button"
                    data-testid="talos-catalog-provider"
                    :data-provider="filter.id"
                    :aria-pressed="providerFilter === filter.id"
                    class="inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-medium transition-colors"
                    :class="providerFilter === filter.id
                        ? 'border-[var(--talos-accent-border)] bg-[var(--talos-accent-soft)] text-[var(--talos-accent)]'
                        : 'border-[var(--talos-border)] bg-[var(--talos-panel)] text-[var(--talos-muted)] hover:bg-[var(--talos-active)]'"
                    @click="providerFilter = filter.id"
                >
                    <TalosProviderIcon v-if="filter.id !== 'all'" :provider="filter.id" class="h-4 w-4 border-0 bg-transparent" />
                    {{ filter.label }}
                </button>
                <label class="ml-auto flex h-9 min-w-[12rem] flex-1 items-center gap-2 rounded-md border border-[var(--talos-border)] bg-[var(--talos-panel)] px-2 sm:max-w-xs">
                    <Search class="h-4 w-4 shrink-0 text-[var(--talos-muted)]" aria-hidden="true" />
                    <input
                        v-model="search"
                        type="text"
                        aria-label="Search catalog models"
                        placeholder="Search models"
                        class="h-full min-w-0 flex-1 border-0 bg-transparent text-sm text-[var(--talos-text)] outline-none placeholder:text-[var(--talos-muted)]"
                    >
                </label>
            </div>
        </div>

        <div class="space-y-3 p-4" data-testid="talos-model-catalog">
            <div v-if="visibleError" role="alert" class="rounded-md border border-[var(--talos-warning-border)] bg-[var(--talos-warning-soft)] px-3 py-2 text-sm text-[var(--talos-text)]">
                {{ visibleError }}
            </div>

            <div v-if="loadingModelProfiles && modelProfiles.length === 0" role="status" class="flex items-center gap-2 px-1 py-4 text-sm text-[var(--talos-muted)]">
                <Loader2 class="h-4 w-4 animate-spin text-[var(--talos-accent)]" />
                Loading provider catalog
            </div>

            <p v-else-if="visibleProfiles.length === 0" class="px-1 py-4 text-sm leading-6 text-[var(--talos-muted)]">
                No provider models match this filter.
            </p>

            <div v-else class="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                <article
                    v-for="profile in visibleProfiles"
                    :key="profile.id"
                    data-testid="talos-catalog-card"
                    :data-profile-id="profile.id"
                    :data-visible="talosProfileVisibleInComposer(profile) ? 'true' : 'false'"
                    class="flex flex-col gap-2 rounded-md border border-[var(--talos-border)] bg-[var(--talos-panel-soft)] p-3"
                >
                    <div class="flex items-start justify-between gap-2">
                        <div class="flex min-w-0 items-start gap-2">
                            <TalosProviderIcon :provider="profile.provider" />
                            <div class="min-w-0">
                                <div class="truncate text-sm font-semibold text-[var(--talos-text)]">{{ profile.display_name }}</div>
                                <div class="truncate font-mono text-[11px] text-[var(--talos-muted)]">{{ talosProviderById(profile.provider).label }} · {{ profile.model }}</div>
                            </div>
                        </div>
                        <button
                            type="button"
                            data-testid="talos-catalog-visibility-toggle"
                            :aria-pressed="talosProfileVisibleInComposer(profile)"
                            :aria-label="talosProfileVisibleInComposer(profile) ? `Hide ${profile.display_name} from composer` : `Show ${profile.display_name} in composer`"
                            :title="talosProfileVisibleInComposer(profile) ? 'Visible in composer' : 'Hidden from composer'"
                            class="grid h-8 w-8 shrink-0 place-items-center rounded-md border border-[var(--talos-border)] text-[var(--talos-muted)] hover:bg-[var(--talos-active)] disabled:opacity-50"
                            :disabled="togglingProfileId === profile.id"
                            @click="toggleVisibility(profile)"
                        >
                            <Loader2 v-if="togglingProfileId === profile.id" class="h-4 w-4 animate-spin" />
                            <Eye v-else-if="talosProfileVisibleInComposer(profile)" class="h-4 w-4 text-[var(--talos-accent)]" />
                            <EyeOff v-else class="h-4 w-4" />
                        </button>
                    </div>

                    <div class="flex flex-wrap items-center gap-1.5">
                        <Badge :tone="chatCompat(profile).tone" data-testid="talos-catalog-compat">{{ chatCompat(profile).label }}</Badge>
                        <Badge v-if="contextWindow(profile)" tone="neutral">{{ Math.round(contextWindow(profile)! / 1000) }}k context</Badge>
                        <Badge v-if="capability(profile, 'vision')" tone="neutral">Vision</Badge>
                        <Badge v-if="capability(profile, 'tools')" tone="neutral">Tools</Badge>
                        <Badge v-if="profile.supports_thinking" tone="neutral">Thinking</Badge>
                    </div>

                    <div>
                        <div class="text-[11px] font-semibold uppercase text-[var(--talos-muted)]">Effort</div>
                        <div class="mt-1 flex flex-wrap gap-1">
                            <span
                                v-for="level in effortLadder(profile)"
                                :key="level"
                                data-testid="talos-catalog-effort"
                                :data-effort-level="level"
                                class="rounded-md border border-[var(--talos-border)] bg-[var(--talos-panel)] px-2 py-0.5 text-[11px] font-medium text-[var(--talos-muted)]"
                            >
                                {{ talosEffortLabel(level) }}
                            </span>
                        </div>
                    </div>
                </article>
            </div>
        </div>
    </Surface>
</template>
