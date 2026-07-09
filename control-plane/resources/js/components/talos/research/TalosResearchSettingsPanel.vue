<script setup lang="ts">
import type { TalosModelProfile } from '../../../lib/talosTypes'

export type TalosResearchSettings = {
    rounds: number
    format: 'briefing' | 'report' | 'table'
    search_engine: 'searxng' | 'duckduckgo' | 'none'
    endpoint: 'local' | 'remote' | 'manual'
    model_profile_id: string | null
}

const props = defineProps<{
    settings: TalosResearchSettings
    modelProfiles: TalosModelProfile[]
    disabled?: boolean
}>()

const emit = defineEmits<{
    update: [settings: TalosResearchSettings]
}>()

function updateSetting<Key extends keyof TalosResearchSettings>(key: Key, value: TalosResearchSettings[Key]) {
    emit('update', {
        ...props.settings,
        [key]: value,
    })
}
</script>

<template>
    <section class="grid gap-3 rounded-md border border-[var(--talos-border)] bg-[var(--talos-panel-soft)] p-3">
        <div class="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
            <label class="grid gap-1">
                <span class="text-xs font-semibold uppercase text-[var(--talos-muted)]">Rounds</span>
                <select
                    class="h-9 rounded-md border border-[var(--talos-border)] bg-[var(--talos-panel)] px-3 text-sm text-[var(--talos-text)] outline-none focus:border-[var(--talos-accent)]"
                    aria-label="Rounds selector"
                    :value="String(settings.rounds)"
                    :disabled="disabled"
                    @change="updateSetting('rounds', Number(($event.target as HTMLSelectElement).value))"
                >
                    <option value="1">1 round</option>
                    <option value="2">2 rounds</option>
                    <option value="3">3 rounds</option>
                </select>
            </label>

            <label class="grid gap-1">
                <span class="text-xs font-semibold uppercase text-[var(--talos-muted)]">Format</span>
                <select
                    class="h-9 rounded-md border border-[var(--talos-border)] bg-[var(--talos-panel)] px-3 text-sm text-[var(--talos-text)] outline-none focus:border-[var(--talos-accent)]"
                    aria-label="Format selector"
                    :value="settings.format"
                    :disabled="disabled"
                    @change="updateSetting('format', ($event.target as HTMLSelectElement).value as TalosResearchSettings['format'])"
                >
                    <option value="briefing">Briefing</option>
                    <option value="report">Long report</option>
                    <option value="table">Evidence table</option>
                </select>
            </label>

            <label class="grid gap-1">
                <span class="text-xs font-semibold uppercase text-[var(--talos-muted)]">Search engine</span>
                <select
                    class="h-9 rounded-md border border-[var(--talos-border)] bg-[var(--talos-panel)] px-3 text-sm text-[var(--talos-text)] outline-none focus:border-[var(--talos-accent)]"
                    aria-label="Search engine selector"
                    :value="settings.search_engine"
                    :disabled="disabled"
                    @change="updateSetting('search_engine', ($event.target as HTMLSelectElement).value as TalosResearchSettings['search_engine'])"
                >
                    <option value="searxng">SearXNG</option>
                    <option value="duckduckgo">DuckDuckGo</option>
                    <option value="none">Manual sources only</option>
                </select>
            </label>

            <label class="grid gap-1">
                <span class="text-xs font-semibold uppercase text-[var(--talos-muted)]">Endpoint</span>
                <select
                    class="h-9 rounded-md border border-[var(--talos-border)] bg-[var(--talos-panel)] px-3 text-sm text-[var(--talos-text)] outline-none focus:border-[var(--talos-accent)]"
                    aria-label="Endpoint selector"
                    :value="settings.endpoint"
                    :disabled="disabled"
                    @change="updateSetting('endpoint', ($event.target as HTMLSelectElement).value as TalosResearchSettings['endpoint'])"
                >
                    <option value="local">Local</option>
                    <option value="remote">Remote</option>
                    <option value="manual">Manual review</option>
                </select>
            </label>

            <label class="grid gap-1">
                <span class="text-xs font-semibold uppercase text-[var(--talos-muted)]">Model</span>
                <select
                    class="h-9 rounded-md border border-[var(--talos-border)] bg-[var(--talos-panel)] px-3 text-sm text-[var(--talos-text)] outline-none focus:border-[var(--talos-accent)]"
                    aria-label="Model selector"
                    :value="settings.model_profile_id ?? ''"
                    :disabled="disabled"
                    @change="updateSetting('model_profile_id', ($event.target as HTMLSelectElement).value || null)"
                >
                    <option value="">Workspace default</option>
                    <option v-for="profile in modelProfiles" :key="profile.id" :value="profile.id">
                        {{ profile.display_name }}
                    </option>
                </select>
            </label>
        </div>
    </section>
</template>
