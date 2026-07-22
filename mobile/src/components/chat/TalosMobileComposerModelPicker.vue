<script setup lang="ts">
import { computed, ref } from 'vue'
import { Check, FlaskConical, RefreshCw, WandSparkles } from '@lucide/vue'
import TalosMobileProviderIcon from '@/components/models/TalosMobileProviderIcon.vue'
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
}>(), {
    routingProfiles: () => [],
    selectedModelProfileId: null,
    selectedRoutingProfileId: null,
    loadingModels: false,
    loadingRoutes: false,
    refreshingModels: false,
})

const emit = defineEmits<{
    selectModelProfile: [profileId: string]
    selectModelRoutingProfile: [profileId: string]
    requestClose: []
    refreshModels: []
    openModelLab: []
}>()

const listbox = ref<HTMLElement | null>(null)
const visibleProfiles = computed(() => props.modelProfiles.filter((profile) => profile.show_in_composer))

function capabilityValue(profile: TalosMobileModelProfileView, key: string): unknown {
    return profile.capabilities?.[key]
}

function compatibilityLabel(profile: TalosMobileModelProfileView): string {
    const value = capabilityValue(profile, 'chat_compatibility')
    return typeof value === 'string' ? value : 'unknown'
}

function contextLabel(profile: TalosMobileModelProfileView): string | null {
    const value = capabilityValue(profile, 'context_length')
    if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return null
    return value >= 1000 ? `${Math.round(value / 1000)}k context` : `${value} context`
}

function modalityLabel(profile: TalosMobileModelProfileView): string | null {
    const value = capabilityValue(profile, 'input_modalities')
    if (!Array.isArray(value)) return null
    const modalities = value.filter((item): item is string => typeof item === 'string' && item.trim() !== '')
    return modalities.length ? modalities.join(' + ') : null
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
        <div
            ref="listbox"
            role="listbox"
            aria-label="Model for this conversation"
            class="max-h-[min(52dvh,22rem)] space-y-3 overflow-y-auto overscroll-contain pr-1"
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
                    Auto
                    <span class="ml-1 min-w-0 truncate text-[0.625rem] font-normal normal-case">
                        routing picks the model per turn
                    </span>
                </header>
                <p
                    v-if="loadingRoutes"
                    role="status"
                    class="px-2 py-2 text-xs text-[var(--talos-muted,var(--muted-foreground))]"
                >
                    Loading routes...
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
                    class="talos-mobile-model-option flex min-h-11 w-full items-center gap-2 rounded-md border px-2.5 py-2 text-left text-sm outline-none focus-visible:ring-2 focus-visible:ring-[var(--talos-ring,var(--ring))] disabled:cursor-not-allowed disabled:opacity-50"
                    :data-selected="profile.id === selectedRoutingProfileId ? 'true' : 'false'"
                    @click="chooseRoutingProfile(profile)"
                >
                    <WandSparkles class="size-5 shrink-0 text-[var(--talos-accent,var(--primary))]" aria-hidden="true" />
                    <span class="flex min-w-0 flex-1 flex-col">
                        <span class="truncate font-medium text-[var(--talos-text,var(--foreground))]">{{ profile.name }}</span>
                        <span class="truncate text-[0.6875rem] text-[var(--talos-muted,var(--muted-foreground))]">
                            {{ profile.lane_count }} lanes - {{ profile.status }}
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
                    Models
                </header>
                <p
                    v-if="loadingModels"
                    role="status"
                    class="px-2 py-2 text-xs text-[var(--talos-muted,var(--muted-foreground))]"
                >
                    Loading profiles...
                </p>
                <p
                    v-else-if="!visibleProfiles.length"
                    class="px-2 py-2 text-xs leading-5 text-[var(--talos-muted,var(--muted-foreground))]"
                >
                    No composer models yet - open Model Lab to add one.
                </p>
                <button
                    v-for="profile in visibleProfiles"
                    :key="profile.id"
                    type="button"
                    role="option"
                    data-talos-mobile-model-option
                    data-testid="talos-mobile-model-option"
                    :data-model-profile-id="profile.id"
                    :aria-selected="profile.id === selectedModelProfileId"
                    :disabled="!talosMobileModelProfileIsCallable(profile)"
                    class="talos-mobile-model-option flex min-h-11 w-full items-center gap-2 rounded-md border px-2.5 py-2 text-left text-sm outline-none focus-visible:ring-2 focus-visible:ring-[var(--talos-ring,var(--ring))] disabled:cursor-not-allowed disabled:opacity-50"
                    :data-selected="profile.id === selectedModelProfileId ? 'true' : 'false'"
                    @click="chooseModelProfile(profile)"
                >
                    <TalosMobileProviderIcon :provider="profile.provider" class="size-8" />
                    <span class="flex min-w-0 flex-1 flex-col">
                        <span class="truncate font-medium text-[var(--talos-text,var(--foreground))]">{{ profile.display_name }}</span>
                        <span class="truncate font-mono text-[0.6875rem] text-[var(--talos-muted,var(--muted-foreground))]">
                            {{ profile.model }} - {{ profile.status }}
                        </span>
                        <span class="truncate text-[0.6875rem] text-[var(--talos-muted,var(--muted-foreground))]">
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
            </section>
        </div>
        <footer class="mt-2 flex items-center justify-between gap-2 border-t border-[var(--talos-border,var(--border))] pt-2">
            <button
                type="button"
                aria-label="Refresh model catalog"
                :disabled="refreshingModels"
                class="inline-flex min-h-11 items-center gap-2 rounded-md px-2.5 text-xs font-medium text-[var(--talos-muted,var(--muted-foreground))] outline-none hover:bg-[var(--talos-active,var(--accent))] hover:text-[var(--talos-text,var(--foreground))] focus-visible:ring-2 focus-visible:ring-[var(--talos-ring,var(--ring))] disabled:opacity-50"
                @click="emit('refreshModels')"
            >
                <RefreshCw :class="['size-4', refreshingModels ? 'animate-spin' : '']" aria-hidden="true" />
                Refresh
            </button>
            <button
                type="button"
                aria-label="Open Model Lab"
                class="inline-flex min-h-11 items-center gap-2 rounded-md px-2.5 text-xs font-medium text-[var(--talos-text,var(--foreground))] outline-none hover:bg-[var(--talos-active,var(--accent))] focus-visible:ring-2 focus-visible:ring-[var(--talos-ring,var(--ring))]"
                @click="emit('openModelLab')"
            >
                <FlaskConical class="size-4 text-[var(--talos-accent,var(--primary))]" aria-hidden="true" />
                Model Lab
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
