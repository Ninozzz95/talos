<script setup lang="ts">
import { computed } from 'vue'
import {
    Activity,
    BarChart3,
    BookOpen,
    Brain,
    CalendarDays,
    ChevronLeft,
    ChevronRight,
    FileArchive,
    FlaskConical,
    Image,
    ListTodo,
    MessageSquarePlus,
    Moon,
    NotebookPen,
    Palette,
    Search,
    Settings,
    Stethoscope,
    Sun,
    Wrench,
} from '@lucide/vue'
import Button from '../../ui/Button.vue'
import { talosThemeIsLight, type TalosThemeId } from '../../../lib/talosThemes'

type RailItem = {
    id: string
    label: string
    description: string
    icon: unknown
    disabledReason?: string
}

const emit = defineEmits<{
    open: [id: string]
    newChat: []
    toggleTheme: []
    collapse: []
    expand: []
    resizeStart: [event: PointerEvent]
}>()

const primaryItems: RailItem[] = [
    { id: 'runtime', label: 'Runtime', description: 'Runs, replay and recovery.', icon: Activity },
    { id: 'search', label: 'Knowledge', description: 'Persisted files, context sets and generated documents.', icon: Search },
    { id: 'brain', label: 'Brain', description: 'Memory and approved skills.', icon: Brain },
    { id: 'calendar', label: 'Calendar', description: 'Calendar drafts.', icon: CalendarDays },
    { id: 'compare', label: 'Compare', description: 'AVM ON/OFF benchmark evidence.', icon: BarChart3 },
    { id: 'model_lab', label: 'Model Lab', description: 'Cookbook previews, provider profiles and probes.', icon: FlaskConical },
    { id: 'research', label: 'Deep Research', description: 'Research reports and claims.', icon: BookOpen },
    { id: 'gallery', label: 'Artifacts', description: 'Run artifacts and previews.', icon: Image },
    { id: 'library', label: 'Library', description: 'Documents and file context.', icon: FileArchive },
    { id: 'notes', label: 'Notes', description: 'Untrusted notes with provenance.', icon: NotebookPen },
    { id: 'tasks', label: 'Tasks', description: 'Persisted task queue.', icon: ListTodo },
]

const systemItems: RailItem[] = [
    { id: 'settings', label: 'Settings', description: 'Workspace setup and appearance.', icon: Settings },
    { id: 'theme', label: 'Theme', description: 'Local theme switcher.', icon: Palette },
    { id: 'doctor', label: 'Doctor', description: 'Control-plane readiness.', icon: Stethoscope },
    { id: 'tools', label: 'Tools', description: 'Connector and tool registry.', icon: Wrench },
]

const props = defineProps<{
    activeIds: string[]
    theme: TalosThemeId
    creatingSession?: boolean
    collapsed?: boolean
    width: number
    visibility: Record<string, boolean>
}>()

const railStyle = computed(() => ({
    width: `${props.collapsed ? 64 : props.width}px`,
}))
const lightThemeActive = computed(() => talosThemeIsLight(props.theme))
const visiblePrimaryItems = computed(() => primaryItems.filter((item) => {
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

    return props.visibility[item.id] !== false
}))
const visibleSystemItems = computed(() => systemItems.filter((item) => {
    if (item.id === 'settings') {
        return props.visibility.settings_button !== false
    }

    return props.visibility[item.id] !== false
}))
</script>

<template>
    <aside
        class="talos-left-rail relative z-30 hidden h-screen shrink-0 border-r border-[var(--talos-border)] bg-[var(--talos-sidebar)] py-2 lg:flex lg:flex-col"
        :class="collapsed ? 'px-2' : 'px-2.5'"
        :style="railStyle"
        aria-label="TALOS workspace rail"
    >
        <div class="flex items-center gap-2 px-1" :class="collapsed ? 'justify-center' : 'justify-between'">
            <div v-if="!collapsed && visibility.brand_name !== false" class="min-w-0">
                <div class="text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--talos-accent)]">AVM</div>
                <div class="text-base font-semibold leading-5 text-[var(--talos-text)]">TALOS</div>
            </div>
            <div v-if="!collapsed && visibility.brand_name !== false" class="talos-short-logo talos-short-logo-compact">
                <span class="talos-short-logo-mark"></span>
            </div>
            <button
                type="button"
                class="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-[var(--talos-border)] bg-[var(--talos-panel)] text-[var(--talos-muted)] transition hover:text-[var(--talos-text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--talos-ring)]"
                :aria-label="collapsed ? 'Expand sidebar' : 'Collapse sidebar'"
                @click="collapsed ? emit('expand') : emit('collapse')"
            >
                <ChevronRight v-if="collapsed" class="h-4 w-4" />
                <ChevronLeft v-else class="h-4 w-4" />
            </button>
        </div>

        <Button
            v-if="visibility.new_chat !== false"
            class="mt-3 w-full"
            :class="collapsed ? 'justify-center px-0' : 'justify-start'"
            size="sm"
            :disabled="creatingSession"
            aria-label="New Chat"
            @click="emit('newChat')"
        >
            <MessageSquarePlus class="h-4 w-4" />
            <span v-if="!collapsed">New Chat</span>
        </Button>

        <nav class="mt-3 min-h-0 flex-1 space-y-0.5 overflow-y-auto pr-1" aria-label="TALOS modules">
            <button
                v-for="item in visiblePrimaryItems"
                :key="item.id"
                type="button"
                class="group flex w-full items-center rounded-md border text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--talos-ring)]"
                :class="[
                    collapsed ? 'justify-center px-0 py-2' : 'gap-2.5 px-2 py-1.5',
                    activeIds.includes(item.id)
                        ? 'border-[var(--talos-accent-border)] bg-[var(--talos-accent-soft)] text-[var(--talos-text)]'
                        : 'border-transparent text-[var(--talos-muted)] hover:border-[var(--talos-border)] hover:bg-[var(--talos-panel-soft)] hover:text-[var(--talos-text)]',
                ]"
                :aria-pressed="activeIds.includes(item.id)"
                :aria-label="item.label"
                :title="item.disabledReason || item.description"
                :disabled="Boolean(item.disabledReason)"
                @click="emit('open', item.id)"
            >
                <component :is="item.icon" class="h-4 w-4 shrink-0 text-[var(--talos-accent)]" />
                <span v-if="!collapsed" class="min-w-0">
                    <span class="block truncate text-[13px] font-medium">{{ item.label }}</span>
                    <span class="sr-only">{{ item.description }}</span>
                </span>
            </button>
        </nav>

        <div class="mt-2 border-t border-[var(--talos-border)] pt-2">
            <div class="space-y-0.5">
                <button
                    v-for="item in visibleSystemItems"
                    :key="item.id"
                    type="button"
                    class="flex w-full items-center rounded-md border border-transparent text-left text-[13px] text-[var(--talos-muted)] transition hover:border-[var(--talos-border)] hover:bg-[var(--talos-panel-soft)] hover:text-[var(--talos-text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--talos-ring)]"
                    :class="collapsed ? 'justify-center px-0 py-2' : 'gap-2.5 px-2 py-1.5'"
                    :aria-pressed="activeIds.includes(item.id)"
                    :aria-label="item.label"
                    :title="item.description"
                    @click="emit('open', item.id)"
                >
                    <component :is="item.icon" class="h-4 w-4 shrink-0 text-[var(--talos-accent)]" />
                    <span v-if="!collapsed" class="truncate">{{ item.label }}</span>
                </button>
            </div>

            <button
                v-if="visibility.theme !== false"
                type="button"
                class="mt-2 flex w-full items-center rounded-md border border-[var(--talos-border)] bg-[var(--talos-panel)] py-2 text-[13px] text-[var(--talos-text)] transition hover:border-[var(--talos-accent)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--talos-ring)]"
                :class="collapsed ? 'justify-center px-0' : 'justify-between px-2.5'"
                aria-label="Toggle theme"
                @click="emit('toggleTheme')"
            >
                <span v-if="!collapsed">Theme</span>
                <Moon v-if="lightThemeActive" class="h-4 w-4" />
                <Sun v-else class="h-4 w-4" />
            </button>
        </div>
        <button
            v-if="!collapsed"
            type="button"
            class="absolute -right-1 top-0 hidden h-full w-2 cursor-col-resize rounded-full border-0 bg-transparent outline-none transition hover:bg-[var(--talos-accent)]/30 focus-visible:bg-[var(--talos-accent)]/30 lg:block"
            aria-label="Resize sidebar"
            @pointerdown.prevent="emit('resizeStart', $event)"
        ></button>
    </aside>
</template>
