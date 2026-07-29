<script setup lang="ts">
import { ref, watch } from 'vue'
import {
    Grid2X2,
    List,
    RefreshCw,
    RotateCcw,
    Search,
    Trash2,
} from '@lucide/vue'
import Button from '../../ui/Button.vue'
import Tooltip from '../../ui/Tooltip.vue'
import TalosThemedSelect from '../ui/TalosThemedSelect.vue'
import type { TalosLibraryKind, TalosLibraryOrigin } from '../../../lib/talosLibrary'
import type { TalosLibraryViewMode } from '../../../composables/useTalosLibrary'

const props = defineProps<{
    kind: TalosLibraryKind | null
    origin: TalosLibraryOrigin | null
    search: string | null
    viewMode: TalosLibraryViewMode
    selectedCount: number
    removing: boolean
    loading: boolean
}>()

const emit = defineEmits<{
    applyFilters: [filters: {
        kind: TalosLibraryKind | null
        origin: TalosLibraryOrigin | null
        search: string | null
    }]
    'update:viewMode': [value: TalosLibraryViewMode]
    refresh: []
    requestRemove: []
}>()

const localSearch = ref(props.search ?? '')
const originItems = [
    { value: 'uploaded', label: 'Uploaded' },
    { value: 'generated', label: 'Generated' },
    { value: 'browser', label: 'Browser' },
    { value: 'search', label: 'Search' },
]
const kinds: Array<{ value: TalosLibraryKind | null; label: string }> = [
    { value: null, label: 'All' },
    { value: 'image', label: 'Images' },
    { value: 'file', label: 'Files' },
    { value: 'link', label: 'Links' },
]

watch(() => props.search, (value) => {
    localSearch.value = value ?? ''
})

function normalizedSearch(): string | null {
    const normalized = localSearch.value.trim().replace(/\s+/g, ' ')
    return normalized || null
}

function applyKind(kind: TalosLibraryKind | null) {
    emit('applyFilters', {
        kind,
        origin: props.origin,
        search: normalizedSearch(),
    })
}

function applyOrigin(value: string) {
    emit('applyFilters', {
        kind: props.kind,
        origin: value === '' ? null : value as TalosLibraryOrigin,
        search: normalizedSearch(),
    })
}

function applySearch() {
    emit('applyFilters', {
        kind: props.kind,
        origin: props.origin,
        search: normalizedSearch(),
    })
}

function reset() {
    localSearch.value = ''
    emit('applyFilters', { kind: null, origin: null, search: null })
}
</script>

<template>
    <div class="space-y-3 border-b border-[var(--talos-border)] bg-[var(--talos-surface-1)] px-4 py-3">
        <div class="flex flex-wrap items-center gap-2">
            <div
                role="group"
                aria-label="Library type"
                class="flex min-h-10 items-center gap-1 rounded-md border border-[var(--talos-border)] bg-[var(--talos-panel-soft)] p-1"
            >
                <button
                    v-for="option in kinds"
                    :key="option.label"
                    type="button"
                    :data-testid="`talos-library-kind-${option.value ?? 'all'}`"
                    :aria-pressed="kind === option.value"
                    class="min-h-8 rounded px-3 text-xs font-medium text-[var(--talos-muted)] transition-colors hover:text-[var(--talos-text)] aria-pressed:bg-[var(--talos-active)] aria-pressed:text-[var(--talos-text)]"
                    @click="applyKind(option.value)"
                >
                    {{ option.label }}
                </button>
            </div>

            <div class="w-40">
                <TalosThemedSelect
                    :model-value="origin ?? ''"
                    :items="originItems"
                    none-label="All origins"
                    aria-label="Library origin"
                    @update:model-value="applyOrigin"
                />
            </div>

            <form class="flex min-w-52 flex-1 items-center gap-2" role="search" @submit.prevent="applySearch">
                <label class="relative min-w-0 flex-1">
                    <span class="sr-only">Search Library</span>
                    <Search class="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--talos-muted)]" />
                    <input
                        v-model="localSearch"
                        aria-label="Search Library"
                        type="search"
                        maxlength="200"
                        placeholder="Search title, source, or content"
                        class="h-10 w-full rounded-md border border-[var(--talos-border)] bg-[var(--talos-panel)] pl-9 pr-3 text-sm text-[var(--talos-text)] outline-none placeholder:text-[var(--talos-muted)] focus-visible:border-[var(--talos-accent)] focus-visible:ring-2 focus-visible:ring-[var(--talos-ring-soft)]"
                    >
                </label>
                <Button type="submit" variant="secondary" size="sm">Search</Button>
            </form>
        </div>

        <div class="flex flex-wrap items-center justify-between gap-2">
            <div class="flex items-center gap-1">
                <Tooltip content="List view">
                    <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        aria-label="List view"
                        :aria-pressed="viewMode === 'list'"
                        class="aria-pressed:bg-[var(--talos-active)]"
                        @click="emit('update:viewMode', 'list')"
                    >
                        <List class="h-4 w-4" />
                    </Button>
                </Tooltip>
                <Tooltip content="Grid view">
                    <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        aria-label="Grid view"
                        :aria-pressed="viewMode === 'grid'"
                        class="aria-pressed:bg-[var(--talos-active)]"
                        @click="emit('update:viewMode', 'grid')"
                    >
                        <Grid2X2 class="h-4 w-4" />
                    </Button>
                </Tooltip>
                <Tooltip content="Refresh Library">
                    <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        aria-label="Refresh Library"
                        :disabled="loading"
                        @click="emit('refresh')"
                    >
                        <RefreshCw class="h-4 w-4" :class="loading ? 'animate-spin' : ''" />
                    </Button>
                </Tooltip>
                <Tooltip content="Reset filters">
                    <Button
                        data-testid="talos-library-reset"
                        type="button"
                        variant="ghost"
                        size="icon"
                        aria-label="Reset Library filters"
                        @click="reset"
                    >
                        <RotateCcw class="h-4 w-4" />
                    </Button>
                </Tooltip>
            </div>

            <Button
                v-if="selectedCount > 0"
                data-testid="talos-library-remove-selected"
                type="button"
                variant="destructive"
                size="sm"
                :loading="removing"
                @click="emit('requestRemove')"
            >
                <Trash2 class="h-4 w-4" />
                Remove {{ selectedCount }}
            </Button>
        </div>
    </div>
</template>
