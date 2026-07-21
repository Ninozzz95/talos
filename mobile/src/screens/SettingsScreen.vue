<script setup lang="ts">
import {
    Database, Save, Bot, BrainCircuit, Search, Globe2, Wrench, Mail, Bell, Palette, Keyboard, User, Shield, Settings,
} from '@lucide/vue'
import TalosMobileScreen from '@/components/shell/TalosMobileScreen.vue'

// Exact settings tab list (labels + lucide icons) from the desktop Settings Center.
const tabs = [
    { label: 'Models', icon: Bot },
    { label: 'AI Defaults', icon: BrainCircuit },
    { label: 'Search', icon: Search },
    { label: 'Browser', icon: Globe2 },
    { label: 'Integrations', icon: Wrench },
    { label: 'Email', icon: Mail },
    { label: 'Reminders', icon: Bell },
    { label: 'Appearance', icon: Palette },
    { label: 'Shortcuts', icon: Keyboard },
    { label: 'Account', icon: User },
    { label: 'Agent Tools', icon: Shield, group: 'Admin' },
    { label: 'System', icon: Settings, group: 'Admin' },
]
</script>

<template>
    <TalosMobileScreen title="Settings Center" eyebrow="Protected preferences">
        <template #eyebrow-icon>
            <Database class="h-4 w-4 text-[var(--talos-accent)]" aria-hidden="true" />
        </template>
        <div class="flex items-center justify-between gap-2">
            <p class="text-sm leading-6 text-[var(--talos-muted)]">Workspace defaults, model behavior and operator preferences.</p>
            <button type="button" disabled class="inline-flex items-center gap-2 rounded-md border border-[var(--talos-border)] px-3 py-2 text-sm text-[var(--talos-muted)] opacity-60">
                <Save class="h-4 w-4" aria-hidden="true" /> Save settings
            </button>
        </div>
        <nav aria-label="Settings categories" class="mt-4 flex flex-col gap-1">
            <span
                v-for="tab in tabs"
                :key="tab.label"
                class="flex items-center gap-2 rounded-md px-3 py-2 text-sm text-[var(--talos-muted)]"
            >
                <component :is="tab.icon" class="h-4 w-4 text-[var(--talos-accent)]" aria-hidden="true" />
                {{ tab.label }}
                <span v-if="tab.group" class="ml-auto text-[10px] font-semibold uppercase tracking-wide text-[var(--talos-muted)]">{{ tab.group }}</span>
            </span>
        </nav>
    </TalosMobileScreen>
</template>
