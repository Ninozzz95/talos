<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { BarChart3, Copy, EllipsisVertical, Loader2, Pencil, RefreshCcw, RotateCcw, ShieldCheck } from '@lucide/vue'
import Button from '../../ui/Button.vue'
import Tooltip from '../../ui/Tooltip.vue'
import type { TalosMessage } from '../../../lib/talosTypes'

const props = withDefaults(defineProps<{
    message: TalosMessage
    canRetry?: boolean
    busy?: boolean
    hasEvidence?: boolean
    evidenceOpen?: boolean
    hasBenchmark?: boolean
    benchmarking?: boolean
}>(), {
    canRetry: false,
    busy: false,
    hasEvidence: false,
    evidenceOpen: false,
    hasBenchmark: false,
    benchmarking: false,
})

const emit = defineEmits<{
    copy: [message: TalosMessage]
    edit: [message: TalosMessage]
    resend: [message: TalosMessage]
    retry: [message: TalosMessage]
    toggleEvidence: [message: TalosMessage]
    benchmark: [message: TalosMessage]
}>()

const actionsRoot = ref<HTMLElement | null>(null)
const menu = ref<HTMLElement | null>(null)
const menuOpen = ref(false)
const menuId = computed(() => `talos-message-actions-${props.message.id.replace(/[^a-zA-Z0-9_-]/g, '-')}`)
const hasSecondaryCapabilities = computed(() => props.message.role === 'user'
    || (props.message.role === 'assistant' && (props.hasEvidence || props.hasBenchmark)))

function menuItems() {
    return Array.from(menu.value?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]') ?? [])
}

function focusMenuItem(index: number) {
    const items = menuItems()
    if (!items.length) return
    items[(index + items.length) % items.length]?.focus()
}

function openMenu() {
    if (!hasSecondaryCapabilities.value) return
    menuOpen.value = true
    void nextTick(() => focusMenuItem(0))
}

function closeMenu(restoreFocus = false) {
    menuOpen.value = false
    if (restoreFocus) {
        void nextTick(() => actionsRoot.value?.querySelector<HTMLButtonElement>('[aria-label="More message actions"]')?.focus())
    }
}

function toggleMenu() {
    if (menuOpen.value) {
        closeMenu()
        return
    }

    openMenu()
}

function handleMenuKeydown(event: KeyboardEvent) {
    const items = menuItems()
    const currentIndex = items.indexOf(document.activeElement as HTMLButtonElement)

    if (event.key === 'Escape') {
        event.preventDefault()
        closeMenu(true)
    } else if (event.key === 'ArrowDown') {
        event.preventDefault()
        focusMenuItem(currentIndex + 1)
    } else if (event.key === 'ArrowUp') {
        event.preventDefault()
        focusMenuItem(currentIndex - 1)
    } else if (event.key === 'Home') {
        event.preventDefault()
        focusMenuItem(0)
    } else if (event.key === 'End') {
        event.preventDefault()
        focusMenuItem(items.length - 1)
    }
}

function handleOutsideClick(event: MouseEvent) {
    if (menuOpen.value && !actionsRoot.value?.contains(event.target as Node)) {
        closeMenu()
    }
}

watch(menuOpen, (open) => {
    if (open) {
        document.addEventListener('click', handleOutsideClick)
    } else {
        document.removeEventListener('click', handleOutsideClick)
    }
})
onBeforeUnmount(() => document.removeEventListener('click', handleOutsideClick))
</script>

<template>
    <div ref="actionsRoot" class="relative flex min-h-11 flex-wrap items-center gap-1" aria-label="Message actions">
        <Tooltip content="Copy message">
            <template #default>
                <Button data-primary-action type="button" variant="ghost" size="icon" aria-label="Copy message" @click="emit('copy', message)">
                    <Copy class="h-3.5 w-3.5" />
                </Button>
            </template>
        </Tooltip>
        <Tooltip v-if="message.role === 'user'" content="Resend message">
            <template #default>
                <Button data-primary-action type="button" variant="ghost" size="icon" aria-label="Resend message" :disabled="busy" @click="emit('resend', message)">
                    <RefreshCcw class="h-3.5 w-3.5" />
                </Button>
            </template>
        </Tooltip>
        <Tooltip v-if="message.role === 'assistant'" content="Retry response">
            <template #default>
                <Button data-primary-action type="button" variant="ghost" size="icon" aria-label="Retry assistant response" :disabled="busy || !props.canRetry" @click="emit('retry', message)">
                    <RotateCcw class="h-3.5 w-3.5" />
                </Button>
            </template>
        </Tooltip>
        <Button
            v-if="hasSecondaryCapabilities"
            data-primary-action
            class="lg:hidden"
            type="button"
            variant="ghost"
            size="icon"
            aria-label="More message actions"
            aria-haspopup="menu"
            :aria-controls="menuId"
            :aria-expanded="menuOpen"
            @click="toggleMenu"
            @keydown.enter.prevent="toggleMenu"
            @keydown.space.prevent="toggleMenu"
        >
            <EllipsisVertical class="h-4 w-4" aria-hidden="true" />
        </Button>
        <div class="hidden items-center gap-1 lg:flex" data-secondary-inline>
            <Tooltip v-if="message.role === 'user'" content="Reuse prompt">
                <template #default>
                    <Button type="button" variant="ghost" size="icon" aria-label="Reuse prompt" @click="emit('edit', message)">
                        <Pencil class="h-3.5 w-3.5" />
                    </Button>
                </template>
            </Tooltip>
            <Tooltip v-if="message.role === 'assistant' && hasEvidence" :content="evidenceOpen ? 'Close evidence' : 'Open evidence'">
                <template #default>
                    <Button type="button" variant="ghost" size="icon" :aria-label="evidenceOpen ? 'Close evidence' : 'Open evidence'" :aria-expanded="evidenceOpen" @click="emit('toggleEvidence', message)">
                        <ShieldCheck class="h-3.5 w-3.5" />
                    </Button>
                </template>
            </Tooltip>
            <Tooltip v-if="message.role === 'assistant' && hasBenchmark" content="Compare AVM ON/OFF">
                <template #default>
                    <Button type="button" variant="ghost" size="icon" aria-label="Compare AVM ON/OFF" :loading="benchmarking" @click="emit('benchmark', message)">
                        <Loader2 v-if="benchmarking" class="h-3.5 w-3.5 animate-spin" />
                        <BarChart3 v-else class="h-3.5 w-3.5" />
                    </Button>
                </template>
            </Tooltip>
        </div>
        <div v-if="menuOpen" :id="menuId" ref="menu" role="menu" aria-label="More message actions" class="absolute right-0 top-full z-20 mt-1 min-w-52 rounded-md border border-[var(--talos-border)] bg-[var(--talos-card)] p-1 shadow-lg" @keydown="handleMenuKeydown">
            <button v-if="message.role === 'user'" type="button" role="menuitem" aria-label="Reuse prompt" class="flex min-h-11 w-full items-center gap-2 rounded px-3 text-left text-sm text-[var(--talos-text)] hover:bg-[var(--talos-panel-soft)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--talos-ring)]" @click="emit('edit', message); closeMenu(true)">
                <Pencil class="h-4 w-4" aria-hidden="true" />
                Reuse prompt
            </button>
            <button v-if="message.role === 'assistant' && hasEvidence" type="button" role="menuitem" :aria-label="evidenceOpen ? 'Close evidence' : 'Open evidence'" class="flex min-h-11 w-full items-center gap-2 rounded px-3 text-left text-sm text-[var(--talos-text)] hover:bg-[var(--talos-panel-soft)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--talos-ring)]" @click="emit('toggleEvidence', message); closeMenu(true)">
                <ShieldCheck class="h-4 w-4" aria-hidden="true" />
                {{ evidenceOpen ? 'Close evidence' : 'Open evidence' }}
            </button>
            <button v-if="message.role === 'assistant' && hasBenchmark" type="button" role="menuitem" aria-label="Compare AVM ON/OFF" :disabled="benchmarking" class="flex min-h-11 w-full items-center gap-2 rounded px-3 text-left text-sm text-[var(--talos-text)] hover:bg-[var(--talos-panel-soft)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--talos-ring)] disabled:pointer-events-none disabled:opacity-50" @click="emit('benchmark', message); closeMenu(true)">
                <Loader2 v-if="benchmarking" class="h-4 w-4 animate-spin" aria-hidden="true" />
                <BarChart3 v-else class="h-4 w-4" aria-hidden="true" />
                Compare AVM ON/OFF
            </button>
        </div>
    </div>
</template>
