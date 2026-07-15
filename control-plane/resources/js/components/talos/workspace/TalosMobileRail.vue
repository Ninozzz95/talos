<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import {
    Activity,
    BarChart3,
    BookOpen,
    CalendarDays,
    FileArchive,
    FlaskConical,
    Globe2,
    Image,
    MessageSquare,
    MessageSquarePlus,
    Menu,
    Palette,
    Settings,
} from '@lucide/vue'
import Button from '../../ui/Button.vue'
import type { TalosWindowId } from '../../../lib/talosWindowRegistry'

const props = defineProps<{
    creatingSession: boolean
    visibility: Record<string, boolean>
    activeIds?: string[]
    navigationOpen?: boolean
}>()

const emit = defineEmits<{
    newChat: []
    focusChat: []
    openNavigation: []
    openWindow: [windowId: TalosWindowId]
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
const railScroll = ref<HTMLElement | null>(null)

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
                size="icon"
                variant="ghost"
                class="min-h-11 min-w-11"
                aria-label="Chat"
                title="Chat"
                @click="emit('focusChat')"
            >
                <MessageSquare class="h-4 w-4 text-[var(--talos-accent)]" />
            </Button>
            <Button
                size="icon"
                variant="ghost"
                class="min-h-11 min-w-11"
                aria-label="Open navigation menu"
                :aria-pressed="Boolean(navigationOpen)"
                title="Navigation menu"
                @click="emit('openNavigation')"
            >
                <Menu class="h-4 w-4 text-[var(--talos-accent)]" />
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
            </div>
        </div>
        <span
            data-testid="talos-mobile-rail-edge-end"
            class="pointer-events-none absolute inset-y-0 right-0 z-10 w-5 bg-gradient-to-l from-[var(--talos-sidebar)] to-transparent"
            aria-hidden="true"
        ></span>
    </nav>
</template>
