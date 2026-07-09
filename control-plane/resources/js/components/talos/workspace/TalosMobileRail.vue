<script setup lang="ts">
import Button from '../../ui/Button.vue'
import type { TalosWindowId } from '../../../composables/useTalosWindows'

defineProps<{
    creatingSession: boolean
}>()

const emit = defineEmits<{
    newChat: []
    openWindow: [windowId: TalosWindowId]
}>()

const mobileRailItems: Array<{ id: TalosWindowId; label: string }> = [
    { id: 'runtime', label: 'Runtime' },
    { id: 'search', label: 'Knowledge' },
    { id: 'brain', label: 'Brain' },
    { id: 'calendar', label: 'Calendar' },
    { id: 'compare', label: 'Compare' },
    { id: 'model_lab', label: 'Model Lab' },
    { id: 'research', label: 'Deep Research' },
    { id: 'library', label: 'Library' },
    { id: 'gallery', label: 'Artifacts' },
    { id: 'notes', label: 'Notes' },
    { id: 'tasks', label: 'Tasks' },
    { id: 'settings', label: 'Settings' },
    { id: 'theme', label: 'Theme' },
    { id: 'doctor', label: 'Doctor' },
]
</script>

<template>
    <div
        class="relative z-10 flex gap-2 overflow-x-auto border-b border-[var(--talos-border)] bg-[var(--talos-sidebar)]/82 px-3 py-2 lg:hidden"
        aria-label="TALOS workspace rail"
    >
        <Button size="sm" :disabled="creatingSession" @click="emit('newChat')">New Chat</Button>
        <Button
            v-for="item in mobileRailItems"
            :key="item.id"
            size="sm"
            variant="ghost"
            @click="emit('openWindow', item.id)"
        >
            {{ item.label }}
        </Button>
    </div>
</template>
