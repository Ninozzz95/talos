<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useTalosI18n } from '@/i18n'
import { Check, FlaskConical, RefreshCw, WandSparkles } from '@lucide/vue'
import TalosMobileProviderIcon from '@/components/models/TalosMobileProviderIcon.vue'
import { ChevronDown, Search } from '@lucide/vue'
import {
    groupTalosModelsByProvider,
    talosModelGroupsOpenByDefault,
} from '@/lib/chat/modelPickerGrouping'
import type {
    TalosMobileModelProfileView,
    TalosMobileRoutingProfileView,
} from '@/components/chat/mobileChatTypes'
import { talosMobileModelProfileIsCallable } from '@/lib/mobileProviders'

const props = withDefaults(defineProps<{
    modelProfiles: TalosMobileModelProfileView[]
    routingProfiles?: TalosMobileRoutingProfileView[]
    selectedModelProfileId?: string | null
    selectedRoutingProfileId?: string | null
    loadingModels?: boolean
    loadingRoutes?: boolean
    refreshingModels?: boolean
    /**
     * Why the list may be short: one already-translated sentence per provider
     * that failed to answer.
     *
     * Without it this panel had one empty state for every reason — 'no models
     * available, add one in the Model Lab' — and said it just as loudly when
     * discovery had FAILED. On a tablet holding a two-gigabyte model in a
     * folder the app could not open, that sentence sent the search in the
     * wrong direction for three rounds. Advice given confidently for the
     * wrong situation is worse than no advice.
     */
    discoveryProblems?: ReadonlyArray<{ message: string, detail?: string | null }>
    /**
     * ⭐ 3/9 — avm-03, dal vivo (item 2): questo picker si monta due volte
     * nello stesso foglio "Model & reasoning" (TalosMobileModelEffortDrawer.vue
     * — il catalogo principale, e la lista dell'esecutore sotto "EXECUTOR
     * MODEL"), e la SUA header interna diceva sempre lo stesso "MODELS"
     * generico in entrambi i casi — la seconda comparsa non diceva di essere
     * la lista dell'esecutore. Pre-tradotta (non una chiave i18n) perché chi
     * la monta decide il testo esatto; `undefined` mantiene l'header di
     * sempre per il catalogo principale, zero cambio lì.
     */
    modelsSectionLabel?: string
}>(), {
    routingProfiles: () => [],
    selectedModelProfileId: null,
    selectedRoutingProfileId: null,
    loadingModels: false,
    loadingRoutes: false,
    refreshingModels: false,
    discoveryProblems: () => [],
    modelsSectionLabel: undefined,
})

const emit = defineEmits<{
    selectModelProfile: [profileId: string]
    selectModelRoutingProfile: [profileId: string]
    requestClose: []
    refreshModels: []
    openModelLab: []
}>()

const { t } = useTalosI18n()
const listbox = ref<HTMLElement | null>(null)
const visibleProfiles = computed(() => props.modelProfiles.filter((profile) => profile.show_in_composer))

/**
 * Owner 2026-07-27: with a provider like OpenRouter the list became "una lista
 * infinita". Past a couple of dozen entries a flat list stops being a list and
 * becomes a scroll, and the model you want is never the one on screen.
 */
const modelQuery = ref('')
const searching = computed(() => modelQuery.value.trim() !== '')
const modelGroups = computed(() => groupTalosModelsByProvider(
    visibleProfiles.value,
    modelQuery.value,
))

/**
 * Which groups are open. Seeded from the arrangement, then owned by the user.
 *
 * `null` means "not yet touched", so the defaults keep applying while the
 * search narrows — once a header is tapped, that choice stands.
 */
const openedGroups = ref<string[] | null>(null)
const openGroups = computed(() => openedGroups.value
    ?? talosModelGroupsOpenByDefault(
        modelGroups.value,
        props.selectedModelProfileId ?? null,
        searching.value,
    ))

function toggleGroup(provider: string): void {
    const current = openGroups.value
    openedGroups.value = current.includes(provider)
        ? current.filter((entry) => entry !== provider)
        : [...current, provider]
}

// A new search is a new question: the user's collapse choices were about the
// previous set of results and should not survive it.
watch(modelQuery, () => { openedGroups.value = null })

function capabilityValue(profile: TalosMobileModelProfileView, key: string): unknown {
    return profile.capabilities?.[key]
}

function compatibilityLabel(profile: TalosMobileModelProfileView): string {
    const value = capabilityValue(profile, 'chat_compatibility')
    if (value === 'supported') return t('chat.compatibilitySupported')
    if (value === 'unsupported') return t('chat.compatibilityUnsupported')
    return typeof value === 'string' ? value : t('common.unknown').toLocaleLowerCase()
}

function contextLabel(profile: TalosMobileModelProfileView): string | null {
    const value = capabilityValue(profile, 'context_length')
    if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return null
    const formatted = value >= 1000 ? `${Math.round(value / 1000)}k` : String(value)
    return t('chat.contextValue', { value: formatted })
}

function modalityLabel(profile: TalosMobileModelProfileView): string | null {
    const value = capabilityValue(profile, 'input_modalities')
    if (!Array.isArray(value)) return null
    const modalities = value.filter((item): item is string => typeof item === 'string' && item.trim() !== '')
    const localized = modalities.map((modality) => {
        const key = `chat.modality${modality.charAt(0).toUpperCase()}${modality.slice(1)}`
        return t(key)
    })
    return localized.length ? localized.join(' + ') : null
}

function statusLabel(status: string): string {
    if (status === 'enabled') return t('chat.statusEnabled')
    if (status === 'disabled') return t('chat.statusDisabled')
    return status
}

function routingIsSelectable(profile: TalosMobileRoutingProfileView): boolean {
    return profile.status === 'enabled' && profile.lane_count > 0
}

function chooseModelProfile(profile: TalosMobileModelProfileView): void {
    if (!talosMobileModelProfileIsCallable(profile)) return
    emit('selectModelProfile', profile.id)
}

function chooseRoutingProfile(profile: TalosMobileRoutingProfileView): void {
    if (!routingIsSelectable(profile)) return
    emit('selectModelRoutingProfile', profile.id)
}

function enabledOptions(): HTMLButtonElement[] {
    if (!listbox.value) return []
    return Array.from(listbox.value.querySelectorAll<HTMLButtonElement>(
        '[data-talos-mobile-model-option]:not(:disabled)',
    ))
}

function focusAt(index: number): void {
    const options = enabledOptions()
    if (!options.length) return
    options[(index + options.length) % options.length]?.focus()
}

function moveFocus(target: EventTarget | null, delta: number): void {
    const options = enabledOptions()
    if (!options.length) return
    const current = target instanceof HTMLElement ? options.indexOf(target as HTMLButtonElement) : -1
    focusAt(current + delta)
}

function onListKeydown(event: KeyboardEvent): void {
    if (event.key === 'ArrowDown') {
        event.preventDefault()
        moveFocus(event.target, 1)
        return
    }
    if (event.key === 'ArrowUp') {
        event.preventDefault()
        moveFocus(event.target, -1)
        return
    }
    if (event.key === 'Home') {
        event.preventDefault()
        focusAt(0)
        return
    }
    if (event.key === 'End') {
        event.preventDefault()
        focusAt(-1)
        return
    }
    if (event.key === 'Escape') {
        event.preventDefault()
        emit('requestClose')
    }
}
</script>

<template>
    <div
        class="talos-mobile-model-picker"
        data-testid="talos-mobile-composer-model-picker"
    >
        <!--
            ⛔ `max-h` sì, `min-h` NO.

            Il tetto serve: con 413 modelli di OpenRouter aperti la lista deve
            smettere di crescere e cominciare a scorrere.

            Il pavimento no, e costava un buco. Con `min-h-[40dvh]` su uno
            schermo da 2400 px la lista occupava 960 px anche quando conteneva
            tre righe da 400: 560 px di nero fra l'ultimo provider e la riga
            «Refresh · Model Lab», cioè un quarto dello schermo. Owner
            2026-08-15, guardando la vista: «c'è tanto spazio tra openrouter e
            zona refresh/model lab».

            ⇒ Un pannello si adatta a quello che contiene. Il vuoto non era
            respiro: era un pavimento pensato per la lista aperta, applicato
            anche quando è chiusa.
        -->
        <div
            ref="listbox"
            role="listbox"
            :aria-label="$t('chat.modelForConversation')"
            class="max-h-[70dvh] space-y-3 overflow-y-auto overscroll-contain pr-1"
            @keydown="onListKeydown"
        >
            <section
                v-if="routingProfiles.length || loadingRoutes"
                role="group"
                aria-labelledby="talos-mobile-model-picker-auto"
                class="space-y-1"
            >
                <header
                    id="talos-mobile-model-picker-auto"
                    class="flex items-center gap-1.5 px-1 text-xs font-semibold uppercase text-[var(--talos-muted,var(--muted-foreground))]"
                >
                    <WandSparkles class="size-3.5 text-[var(--talos-accent,var(--primary))]" aria-hidden="true" />
                    {{ $t('chat.autoRouting') }}
                    <span class="ml-1 min-w-0 truncate text-3xs font-normal normal-case">
                        {{ $t('chat.autoRoutingDetail') }}
                    </span>
                </header>
                <p
                    v-if="loadingRoutes"
                    role="status"
                    class="px-2 py-2 text-xs text-[var(--talos-muted,var(--muted-foreground))]"
                >
                    {{ $t('chat.loadingRoutes') }}
                </p>
                <button
                    v-for="profile in routingProfiles"
                    :key="profile.id"
                    type="button"
                    role="option"
                    data-talos-mobile-model-option
                    data-testid="talos-mobile-model-route-option"
                    :data-routing-profile-id="profile.id"
                    :aria-selected="profile.id === selectedRoutingProfileId"
                    :disabled="!routingIsSelectable(profile)"
                    class="talos-mobile-model-option flex min-h-touch w-full items-center gap-2 rounded-md border px-2.5 py-2 text-left text-sm outline-none focus-visible:ring-2 focus-visible:ring-[var(--talos-ring,var(--ring))] disabled:cursor-not-allowed disabled:opacity-50"
                    :data-selected="profile.id === selectedRoutingProfileId ? 'true' : 'false'"
                    @click="chooseRoutingProfile(profile)"
                >
                    <WandSparkles class="size-5 shrink-0 text-[var(--talos-accent,var(--primary))]" aria-hidden="true" />
                    <span class="flex min-w-0 flex-1 flex-col">
                        <span class="truncate font-medium text-[var(--talos-text,var(--foreground))]">{{ profile.name }}</span>
                        <span class="truncate text-2xs text-[var(--talos-muted,var(--muted-foreground))]">
                            {{ $t('chat.routeLaneStatus', { count: profile.lane_count, status: statusLabel(profile.status) }) }}
                        </span>
                    </span>
                    <Check
                        v-if="profile.id === selectedRoutingProfileId"
                        class="size-4 shrink-0 text-[var(--talos-accent,var(--primary))]"
                        aria-hidden="true"
                    />
                </button>
            </section>

            <section
                role="group"
                aria-labelledby="talos-mobile-model-picker-models"
                class="space-y-1"
            >
                <header
                    id="talos-mobile-model-picker-models"
                    class="px-1 text-xs font-semibold uppercase text-[var(--talos-muted,var(--muted-foreground))]"
                >
                    {{ modelsSectionLabel || $t('chat.models') }}
                </header>
                <p
                    v-if="loadingModels"
                    role="status"
                    class="px-2 py-2 text-xs text-[var(--talos-muted,var(--muted-foreground))]"
                >
                    {{ $t('chat.loadingProfiles') }}
                </p>
                <template v-else-if="!visibleProfiles.length">
                    <!-- A failure is reported as a failure. The generic hint is
                         only right when discovery actually succeeded and found
                         nothing. -->
                    <div
                        v-for="problem in discoveryProblems"
                        :key="problem.message"
                        role="alert"
                        data-testid="talos-model-discovery-problem"
                        class="px-2 py-2 text-xs leading-5 text-[var(--talos-danger,var(--destructive))]"
                    >
                        <p>{{ problem.message }}</p>
                        <!-- The evidence, on its own line and in monospace. It
                             is kept out of the sentence because interpolated
                             parameters are HTML-escaped, and a path through that
                             escaping reads `&#x2F;storage&#x2F;…` — which is
                             what a user was actually shown before this. Rendered
                             as text, never as markup. -->
                        <p
                            v-if="problem.detail"
                            data-testid="talos-model-discovery-detail"
                            class="mt-1 break-all font-mono text-2xs text-[var(--talos-muted,var(--muted-foreground))]"
                        >
                            {{ problem.detail }}
                        </p>
                    </div>
                    <p
                        v-if="!discoveryProblems.length"
                        class="px-2 py-2 text-xs leading-5 text-[var(--talos-muted,var(--muted-foreground))]"
                    >
                        {{ $t('chat.noComposerModels') }}
                    </p>
                </template>
                <label v-if="visibleProfiles.length > 6" class="relative mb-1 block px-1">
                    <Search class="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-[var(--talos-muted,var(--muted-foreground))]" aria-hidden="true" />
                    <input
                        v-model="modelQuery"
                        type="search"
                        inputmode="search"
                        data-testid="talos-model-search"
                        :aria-label="$t('chat.searchModels')"
                        :placeholder="$t('chat.searchModels')"
                        class="min-h-touch w-full rounded-lg border border-[var(--talos-border)] bg-[var(--talos-panel)] pl-8 pr-2 text-sm text-[var(--talos-text)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--talos-ring)]"
                    >
                </label>

                <p
                    v-if="searching && !modelGroups.length"
                    class="px-2 py-2 text-xs text-[var(--talos-muted,var(--muted-foreground))]"
                >
                    {{ $t('chat.noModelMatches', { query: modelQuery.trim() }) }}
                </p>

                <div v-for="group in modelGroups" :key="group.provider" :data-model-group="group.provider">
                    <button
                        type="button"
                        :data-testid="`talos-model-group-${group.provider}`"
                        :aria-expanded="openGroups.includes(group.provider)"
                        class="talos-pressable flex min-h-touch w-full items-center gap-2 rounded-md px-2 text-left"
                        @click="toggleGroup(group.provider)"
                    >
                        <TalosMobileProviderIcon :provider="group.provider" class="size-5" />
                        <span class="text-xs font-semibold uppercase tracking-wide text-[var(--talos-muted,var(--muted-foreground))]">
                            {{ group.provider }}
                        </span>
                        <span class="text-2xs text-[var(--talos-muted,var(--muted-foreground))]">{{ group.profiles.length }}</span>
                        <ChevronDown
                            class="ml-auto size-4 transition-transform"
                            :class="openGroups.includes(group.provider) ? '' : '-rotate-90'"
                            aria-hidden="true"
                        />
                    </button>
                    <div v-show="openGroups.includes(group.provider)" class="space-y-1 pl-1">
                <button
                    v-for="profile in group.profiles"
                    :key="profile.id"
                    type="button"
                    role="option"
                    data-talos-mobile-model-option
                    data-testid="talos-mobile-model-option"
                    :data-model-profile-id="profile.id"
                    :aria-selected="profile.id === selectedModelProfileId"
                    :disabled="!talosMobileModelProfileIsCallable(profile)"
                    class="talos-mobile-model-option flex min-h-touch w-full items-center gap-2 rounded-md border px-2.5 py-2 text-left text-sm outline-none focus-visible:ring-2 focus-visible:ring-[var(--talos-ring,var(--ring))] disabled:cursor-not-allowed disabled:opacity-50"
                    :data-selected="profile.id === selectedModelProfileId ? 'true' : 'false'"
                    @click="chooseModelProfile(profile)"
                >
                    <TalosMobileProviderIcon :provider="profile.provider" class="size-8" />
                    <span class="flex min-w-0 flex-1 flex-col">
                        <span class="truncate font-medium text-[var(--talos-text,var(--foreground))]">{{ profile.display_name }}</span>
                        <span class="truncate font-mono text-2xs text-[var(--talos-muted,var(--muted-foreground))]">
                            {{ profile.model }} - {{ statusLabel(profile.status) }}
                        </span>
                        <span class="truncate text-2xs text-[var(--talos-muted,var(--muted-foreground))]">
                            {{ compatibilityLabel(profile) }}
                            <template v-if="contextLabel(profile)"> - {{ contextLabel(profile) }}</template>
                            <template v-if="modalityLabel(profile)"> - {{ modalityLabel(profile) }}</template>
                        </span>
                    </span>
                    <Check
                        v-if="profile.id === selectedModelProfileId"
                        class="size-4 shrink-0 text-[var(--talos-accent,var(--primary))]"
                        aria-hidden="true"
                    />
                </button>
                    </div>
                </div>
            </section>
        </div>
        <footer class="mt-2 flex items-center justify-between gap-2 border-t border-[var(--talos-border,var(--border))] pt-2">
            <button
                type="button"
                :aria-label="$t('chat.refreshModelCatalog')"
                :disabled="refreshingModels"
                class="inline-flex min-h-touch items-center gap-2 rounded-md px-2.5 text-xs font-medium text-[var(--talos-muted,var(--muted-foreground))] outline-none hover:bg-[var(--talos-active,var(--accent))] hover:text-[var(--talos-text,var(--foreground))] focus-visible:ring-2 focus-visible:ring-[var(--talos-ring,var(--ring))] disabled:opacity-50"
                @click="emit('refreshModels')"
            >
                <RefreshCw :class="['size-4', refreshingModels ? 'animate-spin' : '']" aria-hidden="true" />
                {{ $t('chat.refresh') }}
            </button>
            <button
                type="button"
                :aria-label="$t('chat.openModelLab')"
                class="inline-flex min-h-touch items-center gap-2 rounded-md px-2.5 text-xs font-medium text-[var(--talos-text,var(--foreground))] outline-none hover:bg-[var(--talos-active,var(--accent))] focus-visible:ring-2 focus-visible:ring-[var(--talos-ring,var(--ring))]"
                @click="emit('openModelLab')"
            >
                <FlaskConical class="size-4 text-[var(--talos-accent,var(--primary))]" aria-hidden="true" />
                {{ $t('navigation.modelLab') }}
            </button>
        </footer>
    </div>
</template>

<style scoped>
.talos-mobile-model-option {
    border-color: var(--talos-border, var(--border));
    background: var(--talos-panel, var(--card));
    color: var(--talos-text, var(--foreground));
}

.talos-mobile-model-option:not(:disabled):hover,
.talos-mobile-model-option[data-selected="true"] {
    background: var(--talos-active, var(--accent));
}
</style>
