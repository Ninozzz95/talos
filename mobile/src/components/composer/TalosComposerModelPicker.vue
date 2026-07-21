<script setup lang="ts">
import { ref } from 'vue'
import { Check, WandSparkles } from '@lucide/vue'
import {
    talosModelProfileIsCallable,
    type TalosModelProfile,
    type TalosModelRoutingProfile,
} from '@/lib/talosModels'

// Mirror of the desktop workspace/TalosComposerModelPicker.vue: a themed listbox —
// never a native <select> — so options honor --talos-* tokens on the dark surface.
withDefaults(defineProps<{
    modelProfiles: TalosModelProfile[]
    modelRoutingProfiles: TalosModelRoutingProfile[]
    selectedModelProfileId: string
    selectedModelRoutingProfileId: string
    loadingModelProfiles?: boolean
    loadingModelRoutingProfiles?: boolean
}>(), {
    loadingModelProfiles: false,
    loadingModelRoutingProfiles: false,
})

const emit = defineEmits<{
    selectModelProfile: [profileId: string]
    selectModelRoutingProfile: [profileId: string]
}>()

const listbox = ref<HTMLElement | null>(null)

const ROW_BASE = 'group flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm outline-none transition-colors focus-visible:ring-2 focus-visible:ring-[var(--talos-accent)] disabled:cursor-not-allowed disabled:opacity-50'

function rowClass(selected: boolean): string {
    return `${ROW_BASE} ${selected ? 'bg-[var(--talos-active)]' : 'hover:bg-[var(--talos-active)]'}`
}

function routingIsSelectable(profile: TalosModelRoutingProfile): boolean {
    return profile.status === 'enabled' && profile.lanes.length > 0
}

function chooseModelProfile(profile: TalosModelProfile): void {
    if (!talosModelProfileIsCallable(profile)) return
    emit('selectModelProfile', profile.id)
}

function chooseRoutingProfile(profile: TalosModelRoutingProfile): void {
    if (!routingIsSelectable(profile)) return
    emit('selectModelRoutingProfile', profile.id)
}

// Roving focus across enabled rows so arrow keys traverse both sections.
function moveFocus(current: EventTarget | null, delta: number): void {
    if (!listbox.value) return
    const options = Array.from(listbox.value.querySelectorAll<HTMLButtonElement>('[data-talos-model-option]:not(:disabled)'))
    if (!options.length) return
    const index = current instanceof HTMLElement ? options.indexOf(current as HTMLButtonElement) : -1
    const next = options[(index + delta + options.length) % options.length] ?? options[0]
    next?.focus()
}

function onListKeydown(event: KeyboardEvent): void {
    if (event.key === 'ArrowDown') {
        event.preventDefault()
        moveFocus(event.target, 1)
    } else if (event.key === 'ArrowUp') {
        event.preventDefault()
        moveFocus(event.target, -1)
    }
}
</script>

<template>
    <div class="talos-composer-model-picker" data-testid="talos-composer-model-picker">
        <div
            ref="listbox"
            role="listbox"
            aria-label="Model for this conversation"
            class="max-h-[min(48vh,320px)] space-y-3 overflow-y-auto pr-1"
            @keydown="onListKeydown"
        >
            <section
                v-if="modelRoutingProfiles.length || loadingModelRoutingProfiles"
                aria-labelledby="talos-model-picker-auto-heading"
                class="space-y-1"
            >
                <header
                    id="talos-model-picker-auto-heading"
                    class="flex items-center gap-1.5 px-1 text-xs font-semibold uppercase tracking-wide text-[var(--talos-muted)]"
                >
                    <WandSparkles class="h-3.5 w-3.5 text-[var(--talos-accent)]" />
                    Auto
                    <span class="ml-1 truncate text-[10px] font-normal normal-case tracking-normal text-[var(--talos-muted)]">
                        routing picks the model per turn
                    </span>
                </header>
                <button
                    v-for="profile in modelRoutingProfiles"
                    :key="profile.id"
                    type="button"
                    role="option"
                    data-talos-model-option
                    :data-routing-profile-id="profile.id"
                    :aria-selected="profile.id === selectedModelRoutingProfileId"
                    :disabled="!routingIsSelectable(profile)"
                    :class="rowClass(profile.id === selectedModelRoutingProfileId)"
                    @click="chooseRoutingProfile(profile)"
                >
                    <span class="flex min-w-0 flex-1 flex-col">
                        <span class="truncate font-medium text-[var(--talos-text)]">{{ profile.name }}</span>
                        <span class="truncate text-[11px] text-[var(--talos-muted)]">{{ profile.lanes.length }} lanes · {{ profile.status }}</span>
                    </span>
                    <Check v-if="profile.id === selectedModelRoutingProfileId" class="h-4 w-4 shrink-0 text-[var(--talos-accent)]" />
                </button>
            </section>

            <section aria-labelledby="talos-model-picker-models-heading" class="space-y-1">
                <header
                    id="talos-model-picker-models-heading"
                    class="px-1 text-xs font-semibold uppercase tracking-wide text-[var(--talos-muted)]"
                >
                    Models
                </header>
                <p v-if="loadingModelProfiles" class="px-2 py-1.5 text-xs text-[var(--talos-muted)]">
                    Loading profiles…
                </p>
                <p v-else-if="!modelProfiles.length" class="px-2 py-1.5 text-xs leading-5 text-[var(--talos-muted)]">
                    No composer models yet — open Model Lab to add one.
                </p>
                <button
                    v-for="profile in modelProfiles"
                    :key="profile.id"
                    type="button"
                    role="option"
                    data-talos-model-option
                    :data-model-profile-id="profile.id"
                    :aria-selected="profile.id === selectedModelProfileId"
                    :disabled="!talosModelProfileIsCallable(profile)"
                    :class="rowClass(profile.id === selectedModelProfileId)"
                    @click="chooseModelProfile(profile)"
                >
                    <span class="flex min-w-0 flex-1 flex-col">
                        <span class="truncate font-medium text-[var(--talos-text)]">{{ profile.display_name }}</span>
                        <span class="truncate font-mono text-[11px] text-[var(--talos-muted)]">{{ profile.model }} · {{ profile.status }}</span>
                    </span>
                    <Check v-if="profile.id === selectedModelProfileId" class="h-4 w-4 shrink-0 text-[var(--talos-accent)]" />
                </button>
            </section>
        </div>
    </div>
</template>
