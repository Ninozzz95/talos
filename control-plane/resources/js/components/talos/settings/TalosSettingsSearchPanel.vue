<script setup lang="ts">
import Input from '../../ui/Input.vue'
import Select from '../../ui/Select.vue'

type SearchPreferences = {
    provider: string
    results_per_query: number
    url: string
    fallback: string
    deep_research: {
        max_tokens: number
        extract_timeout: number
        extract_parallel: number
        timeout: number
    }
}

defineProps<{
    search: SearchPreferences
}>()

const emit = defineEmits<{
    updateSearch: [preferences: Partial<Omit<SearchPreferences, 'deep_research'>>]
    updateDeepResearch: [preferences: Partial<SearchPreferences['deep_research']>]
}>()
</script>

<template>
    <div class="grid gap-3 md:grid-cols-2">
        <label class="block">
            <span class="text-xs font-semibold uppercase text-[var(--talos-muted)]">Provider</span>
            <Select :model-value="search.provider" class="mt-2" aria-label="Search provider" @update:model-value="(value) => emit('updateSearch', { provider: String(value) })">
                <option value="searxng">SearXNG self-hosted</option>
                <option value="duckduckgo">DuckDuckGo fallback</option>
                <option value="disabled">Disabled</option>
            </Select>
        </label>
        <label class="block">
            <span class="text-xs font-semibold uppercase text-[var(--talos-muted)]">Results per query</span>
            <Input :model-value="search.results_per_query" class="mt-2" type="number" min="1" max="20" aria-label="Results per query" @update:model-value="(value) => emit('updateSearch', { results_per_query: Number(value) })" />
        </label>
        <label class="block md:col-span-2">
            <span class="text-xs font-semibold uppercase text-[var(--talos-muted)]">Endpoint URL</span>
            <Input :model-value="search.url" class="mt-2" placeholder="http://localhost:8080" aria-label="Search endpoint URL" @update:model-value="(value) => emit('updateSearch', { url: String(value) })" />
        </label>
        <label class="block">
            <span class="text-xs font-semibold uppercase text-[var(--talos-muted)]">Fallback provider</span>
            <Select :model-value="search.fallback" class="mt-2" aria-label="Search fallback provider" @update:model-value="(value) => emit('updateSearch', { fallback: String(value) })">
                <option value="duckduckgo">DuckDuckGo</option>
                <option value="none">None</option>
            </Select>
        </label>
    </div>
    <div class="rounded-md border border-[var(--talos-border)] bg-[var(--talos-panel-soft)] p-3">
        <div class="text-sm font-semibold text-[var(--talos-text)]">Deep Research budgets</div>
        <div class="mt-3 grid gap-3 md:grid-cols-2">
            <Input :model-value="search.deep_research.max_tokens" type="number" min="1024" aria-label="Deep research max tokens" @update:model-value="(value) => emit('updateDeepResearch', { max_tokens: Number(value) })" />
            <Input :model-value="search.deep_research.extract_timeout" type="number" min="10" aria-label="Deep research extract timeout" @update:model-value="(value) => emit('updateDeepResearch', { extract_timeout: Number(value) })" />
            <Input :model-value="search.deep_research.extract_parallel" type="number" min="1" max="10" aria-label="Deep research extract parallelism" @update:model-value="(value) => emit('updateDeepResearch', { extract_parallel: Number(value) })" />
            <Input :model-value="search.deep_research.timeout" type="number" min="60" aria-label="Deep research timeout" @update:model-value="(value) => emit('updateDeepResearch', { timeout: Number(value) })" />
        </div>
    </div>
</template>
