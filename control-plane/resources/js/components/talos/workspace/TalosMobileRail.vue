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
    Globe2,
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
import TalosAdvancedRailGroup, { type TalosAdvancedRailItem } from './TalosAdvancedRailGroup.vue'
import type { TalosWindowId } from '../../../composables/useTalosWindows'

const props = defineProps<{
    creatingSession: boolean
    visibility: Record<string, boolean>
    advancedExpanded?: boolean
    activeIds?: string[]
}>()

const emit = defineEmits<{
    newChat: []
    openWindow: [windowId: TalosWindowId]
    toggleAdvanced: []
}>()

const mobileRailItems: Array<{ id: TalosWindowId; label: string; icon: unknown }> = [
    { id: 'runtime', label: 'Runtime', icon: Activity },
    { id: 'calendar', label: 'Calendar', icon: CalendarDays },
    { id: 'compare', label: 'Compare', icon: BarChart3 },
    { id: 'model_lab', label: 'Model Lab', icon: FlaskConical },
    { id: 'research', label: 'Deep Research', icon: BookOpen },
    { id: 'library', label: 'Library', icon: FileArchive },
    { id: 'gallery', label: 'Artifacts', icon: Image },
    { id: 'browse', label: 'Browse', icon: Globe2 },
    { id: 'settings', label: 'Settings', icon: Settings },
    { id: 'theme', label: 'Theme', icon: Palette },
]

const advancedItems: TalosAdvancedRailItem[] = [
    { id: 'tasks', label: 'Tasks', description: 'Persisted task queue.', icon: ListTodo },
    { id: 'notes', label: 'Notes', description: 'Untrusted notes with provenance.', icon: NotebookPen },
    { id: 'search', label: 'Knowledge', description: 'Persisted files, context sets and generated documents.', icon: Search },
    { id: 'brain', label: 'Brain', description: 'Memory and approved skills.', icon: Brain },
    { id: 'tools', label: 'Tools', description: 'Connector and tool registry.', icon: Wrench },
    { id: 'doctor', label: 'Doctor', description: 'Control-plane readiness.', icon: Stethoscope },
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
const visibleAdvancedItems = computed(() => advancedItems.filter((item) => item.id === 'search'
    ? props.visibility.search !== false || props.visibility.library !== false
    : props.visibility[item.id] !== false))
const activeAdvanced = computed(() => visibleAdvancedItems.value.some((item) => (props.activeIds ?? []).includes(item.id)))
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
        <TalosAdvancedRailGroup
            v-if="visibleAdvancedItems.length"
            :items="visibleAdvancedItems"
            :active-ids="activeIds ?? []"
            :collapsed="false"
            :expanded="Boolean(advancedExpanded) || activeAdvanced"
            id="talos-advanced-items-mobile"
            @toggle="emit('toggleAdvanced')"
            @open="(id) => emit('openWindow', id as TalosWindowId)"
        />
    </div>
</template>
