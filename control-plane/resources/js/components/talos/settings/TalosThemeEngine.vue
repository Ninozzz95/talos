<script setup lang="ts">
import { computed, onMounted } from 'vue'
import Card from '../../ui/Card.vue'
import { useTalosSettings } from '../../../composables/useTalosSettings'

const props = defineProps<{
    theme: 'dark' | 'light'
}>()

const emit = defineEmits<{
    changeTheme: [theme: 'dark' | 'light']
}>()

const {
    settings,
    settingsError,
    settingsSavedMessage,
    loadSettings,
    updateSettings,
} = useTalosSettings()

const activeTheme = computed(() => {
    const storedTheme = settings.value?.preferences?.theme
    return storedTheme === 'light' || storedTheme === 'dark' ? storedTheme : props.theme
})

async function chooseTheme(theme: 'dark' | 'light') {
    emit('changeTheme', theme)
    await updateSettings({
        preferences: {
            ...(settings.value?.preferences ?? {}),
            theme,
        },
    }, 'Theme saved through /api/talos/settings.')
}

onMounted(async () => {
    const loaded = await loadSettings().catch(() => null)
    const theme = loaded?.preferences?.theme
    if (theme === 'light' || theme === 'dark') {
        emit('changeTheme', theme)
    }
})
</script>

<template>
    <Card>
        <h3 class="text-base font-semibold text-[var(--talos-text)]">Theme Engine</h3>
        <p class="mt-1 text-sm leading-6 text-[var(--talos-muted)]">
            Appearance is persisted through the TALOS settings API.
        </p>

        <div v-if="settingsError" class="mt-3 rounded-md border border-[var(--talos-warning-border)] bg-[var(--talos-warning-soft)] px-3 py-2 text-sm text-[var(--talos-text)]">
            {{ settingsError }}
        </div>
        <div v-if="settingsSavedMessage" class="mt-3 rounded-md border border-[var(--talos-success-border)] bg-[var(--talos-success-soft)] px-3 py-2 text-sm text-[var(--talos-text)]">
            {{ settingsSavedMessage }}
        </div>

        <div class="mt-4 grid gap-3 sm:grid-cols-2">
            <button
                type="button"
                class="rounded-md border px-3 py-3 text-left text-sm transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--talos-ring)]"
                :class="activeTheme === 'dark' ? 'border-[var(--talos-accent-border)]' : 'border-[var(--talos-border)]'"
                aria-label="AVM Dark"
                @click="chooseTheme('dark')"
            >
                <span class="mb-3 block h-12 rounded-md border border-[#27313e] bg-[#080b11]"></span>
                <span class="font-semibold text-[var(--talos-text)]">AVM Dark</span>
                <span class="mt-1 block text-xs text-[var(--talos-muted)]">Graphite workspace with execution accents.</span>
            </button>
            <button
                type="button"
                class="rounded-md border px-3 py-3 text-left text-sm transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--talos-ring)]"
                :class="activeTheme === 'light' ? 'border-[var(--talos-accent-border)]' : 'border-[var(--talos-border)]'"
                aria-label="Paper"
                @click="chooseTheme('light')"
            >
                <span class="mb-3 block h-12 rounded-md border border-[#d7dee8] bg-[#f8fafc]"></span>
                <span class="font-semibold text-[var(--talos-text)]">Paper</span>
                <span class="mt-1 block text-xs text-[var(--talos-muted)]">Bright control surface for review-heavy work.</span>
            </button>
        </div>
    </Card>
</template>
