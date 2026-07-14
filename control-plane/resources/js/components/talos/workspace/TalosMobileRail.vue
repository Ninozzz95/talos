<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
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
    MessageSquare,
    MessageSquarePlus,
    NotebookPen,
    Palette,
    Search,
    Settings,
    Stethoscope,
    Wrench,
} from '@lucide/vue'
import Button from '../../ui/Button.vue'
import TalosGuideInfoButton from '../guide/TalosGuideInfoButton.vue'
import TalosAdvancedRailGroup, { type TalosAdvancedRailItem } from './TalosAdvancedRailGroup.vue'
import type { TalosWindowId } from '../../../lib/talosWindowRegistry'

const props = defineProps<{
    creatingSession: boolean
    visibility: Record<string, boolean>
    advancedExpanded?: boolean
    activeIds?: string[]
    historyOpen?: boolean
}>()

const emit = defineEmits<{
    newChat: []
    openHistory: []
    openWindow: [windowId: TalosWindowId]
    toggleAdvanced: []
}>()

const mobileRailItems: Array<{ id: TalosWindowId; label: string; guideId: string; icon: unknown }> = [
    { id: 'runtime', label: 'Runtime', guideId: 'rail.runtime', icon: Activity },
    { id: 'calendar', label: 'Calendar', guideId: 'rail.calendar', icon: CalendarDays },
    { id: 'compare', label: 'Compare', guideId: 'rail.compare', icon: BarChart3 },
    { id: 'model_lab', label: 'Model Lab', guideId: 'rail.model_lab', icon: FlaskConical },
    { id: 'research', label: 'Deep Research', guideId: 'rail.research', icon: BookOpen },
    { id: 'library', label: 'Library', guideId: 'rail.library', icon: FileArchive },
    { id: 'gallery', label: 'Artifacts', guideId: 'rail.gallery', icon: Image },
    { id: 'browse', label: 'Browse', guideId: 'rail.browse', icon: Globe2 },
    { id: 'settings', label: 'Settings', guideId: 'rail.settings', icon: Settings },
    { id: 'theme', label: 'Theme', guideId: 'rail.theme', icon: Palette },
]

const advancedItems: TalosAdvancedRailItem[] = [
    { id: 'tasks', label: 'Tasks', description: 'Persisted task queue.', guideId: 'rail.tasks', icon: ListTodo },
    { id: 'notes', label: 'Notes', description: 'Untrusted notes with provenance.', guideId: 'rail.notes', icon: NotebookPen },
    { id: 'search', label: 'Knowledge', description: 'Persisted files, context sets and generated documents.', guideId: 'rail.search', icon: Search },
    { id: 'brain', label: 'Brain', description: 'Memory and approved skills.', guideId: 'rail.brain', icon: Brain },
    { id: 'tools', label: 'Tools', description: 'Connector and tool registry.', guideId: 'rail.tools', icon: Wrench },
    { id: 'doctor', label: 'Doctor', description: 'Control-plane readiness.', guideId: 'rail.doctor', icon: Stethoscope },
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
const railScroll = ref<HTMLElement | null>(null)
const advancedGroup = ref<{ focusDisclosure: () => void } | null>(null)

function openAdvancedItem(id: string) {
    advancedGroup.value?.focusDisclosure()
    emit('openWindow', id as TalosWindowId)
    if (props.advancedExpanded) {
        emit('toggleAdvanced')
    }
}

watch(
    () => (props.activeIds ?? []).join('|'),
    async () => {
        await nextTick()
        const activeItem = railScroll.value?.querySelector<HTMLElement>('[data-mobile-rail-item][aria-pressed="true"]')

        if (typeof activeItem?.scrollIntoView === 'function') {
            activeItem.scrollIntoView({ block: 'nearest', inline: 'nearest' })
        }
    },
)
</script>

<template>
    <nav
        class="talos-mobile-rail relative z-10 border-b border-[var(--talos-border)] bg-[var(--talos-sidebar)]/82 lg:hidden"
        aria-label="TALOS workspace rail"
        data-overflow-affordance="true"
    >
        <span
            data-testid="talos-mobile-rail-edge-start"
            class="pointer-events-none absolute inset-y-0 left-0 z-10 w-5 bg-gradient-to-r from-[var(--talos-sidebar)] to-transparent"
            aria-hidden="true"
        ></span>
        <div ref="railScroll" class="talos-mobile-rail-scroll flex gap-2 overflow-x-auto px-3 py-2">
            <Button v-if="visibility.new_chat !== false" size="icon" class="min-h-11 min-w-11" :disabled="creatingSession" aria-label="New Chat" title="New Chat" @click="emit('newChat')">
                <MessageSquarePlus class="h-4 w-4" />
            </Button>
            <Button
                v-if="visibility.chats !== false"
                size="icon"
                variant="ghost"
                class="min-h-11 min-w-11"
                aria-label="Open chat history"
                :aria-pressed="Boolean(historyOpen)"
                title="Chat history"
                @click="emit('openHistory')"
            >
                <MessageSquare class="h-4 w-4 text-[var(--talos-accent)]" />
            </Button>
            <div
                v-for="item in visibleMobileRailItems"
                :key="item.id"
                class="inline-flex shrink-0 items-center gap-0.5"
            >
                <Button
                    data-mobile-rail-item
                    size="icon"
                    variant="ghost"
                    class="min-h-11 min-w-11"
                    :aria-label="item.label"
                    :aria-pressed="(activeIds ?? []).includes(item.id)"
                    :title="item.label"
                    @click="emit('openWindow', item.id)"
                >
                    <component :is="item.icon" class="h-4 w-4 text-[var(--talos-accent)]" />
                </Button>
                <TalosGuideInfoButton :guide-id="item.guideId" side="bottom" />
            </div>
            <TalosAdvancedRailGroup
                v-if="visibleAdvancedItems.length"
                ref="advancedGroup"
                :items="visibleAdvancedItems"
                :active-ids="activeIds ?? []"
                :collapsed="false"
                :expanded="Boolean(advancedExpanded)"
                id="talos-advanced-items-mobile"
                @toggle="emit('toggleAdvanced')"
                @open="openAdvancedItem"
            />
        </div>
        <span
            data-testid="talos-mobile-rail-edge-end"
            class="pointer-events-none absolute inset-y-0 right-0 z-10 w-5 bg-gradient-to-l from-[var(--talos-sidebar)] to-transparent"
            aria-hidden="true"
        ></span>
    </nav>
</template>
