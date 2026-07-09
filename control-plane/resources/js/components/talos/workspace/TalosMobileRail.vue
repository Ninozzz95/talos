<script setup lang="ts">
import { computed } from 'vue'
import {
    Activity,
    BarChart3,
    BookOpen,
    Brain,
    CalendarDays,
    FileArchive,
    FlaskConical,
    Image,
    ListTodo,
    MessageSquarePlus,
    NotebookPen,
    Palette,
    Search,
    Settings,
    Stethoscope,
    Wrench,
} from '@lucide/vue'
import Button from '../../ui/Button.vue'
import type { TalosWindowId } from '../../../composables/useTalosWindows'

const props = defineProps<{
    creatingSession: boolean
    visibility: Record<string, boolean>
}>()

const emit = defineEmits<{
    newChat: []
    openWindow: [windowId: TalosWindowId]
}>()

const mobileRailItems: Array<{ id: TalosWindowId; label: string; icon: unknown }> = [
    { id: 'runtime', label: 'Runtime', icon: Activity },
    { id: 'search', label: 'Knowledge', icon: Search },
    { id: 'brain', label: 'Brain', icon: Brain },
    { id: 'calendar', label: 'Calendar', icon: CalendarDays },
    { id: 'compare', label: 'Compare', icon: BarChart3 },
    { id: 'model_lab', label: 'Model Lab', icon: FlaskConical },
    { id: 'research', label: 'Deep Research', icon: BookOpen },
    { id: 'library', label: 'Library', icon: FileArchive },
    { id: 'gallery', label: 'Artifacts', icon: Image },
    { id: 'notes', label: 'Notes', icon: NotebookPen },
    { id: 'tasks', label: 'Tasks', icon: ListTodo },
    { id: 'settings', label: 'Settings', icon: Settings },
    { id: 'theme', label: 'Theme', icon: Palette },
    { id: 'doctor', label: 'Doctor', icon: Stethoscope },
    { id: 'tools', label: 'Tools', icon: Wrench },
]

const visibleMobileRailItems = computed(() => mobileRailItems.filter((item) => {
    if (item.id === 'search') {
        return props.visibility.search !== false || props.visibility.library !== false
    }
    if (item.id === 'model_lab') {
        return props.visibility.models !== false || props.visibility.cookbook !== false
    }
    if (item.id === 'research') {
        return props.visibility.deep_research !== false
    }
    if (item.id === 'gallery') {
        return props.visibility.gallery !== false
    }
    if (item.id === 'library') {
        return props.visibility.library !== false
    }
    if (item.id === 'settings') {
        return props.visibility.settings_button !== false
    }

    return props.visibility[item.id] !== false
}))
</script>

<template>
    <div
        class="relative z-10 flex gap-2 overflow-x-auto border-b border-[var(--talos-border)] bg-[var(--talos-sidebar)]/82 px-3 py-2 lg:hidden"
        aria-label="TALOS workspace rail"
    >
        <Button v-if="visibility.new_chat !== false" size="icon" :disabled="creatingSession" aria-label="New Chat" title="New Chat" @click="emit('newChat')">
            <MessageSquarePlus class="h-4 w-4" />
        </Button>
        <Button
            v-for="item in visibleMobileRailItems"
            :key="item.id"
            size="icon"
            variant="ghost"
            :aria-label="item.label"
            :title="item.label"
            @click="emit('openWindow', item.id)"
        >
            <component :is="item.icon" class="h-4 w-4 text-[var(--talos-accent)]" />
        </Button>
    </div>
</template>
