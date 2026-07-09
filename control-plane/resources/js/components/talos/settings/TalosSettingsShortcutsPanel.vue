<script setup lang="ts">
import { onBeforeUnmount, ref } from 'vue'
import Button from '../../ui/Button.vue'
import {
    TALOS_SHORTCUTS,
    defaultTalosShortcuts,
    shortcutConflict,
    shortcutFromKeyboardEvent,
    type TalosShortcutActionId,
} from '../../../lib/talosShortcuts'

const props = defineProps<{
    shortcuts: Record<TalosShortcutActionId, string>
}>()

const emit = defineEmits<{
    updateShortcut: [id: TalosShortcutActionId, binding: string]
    resetShortcuts: []
}>()

const capturing = ref<TalosShortcutActionId | null>(null)
const localError = ref('')

function groupedShortcuts() {
    const groups = new Map<string, typeof TALOS_SHORTCUTS>()
    for (const shortcut of TALOS_SHORTCUTS) {
        groups.set(shortcut.group, [...(groups.get(shortcut.group) ?? []), shortcut])
    }

    return [...groups.entries()].map(([label, items]) => ({ label, items }))
}

function stopCapture() {
    window.removeEventListener('keydown', captureKey, true)
    capturing.value = null
}

function startCapture(id: TalosShortcutActionId) {
    stopCapture()
    localError.value = ''
    capturing.value = id
    window.addEventListener('keydown', captureKey, true)
}

function captureKey(event: KeyboardEvent) {
    if (!capturing.value) {
        return
    }

    event.preventDefault()
    event.stopPropagation()

    if (event.key === 'Escape') {
        stopCapture()
        return
    }

    const binding = shortcutFromKeyboardEvent(event)
    if (!binding) {
        localError.value = 'TALOS ignored this key combination.'
        return
    }

    const conflict = shortcutConflict(props.shortcuts, capturing.value, binding)
    if (conflict) {
        localError.value = `${binding} is already assigned to ${conflict}.`
        return
    }

    emit('updateShortcut', capturing.value, binding)
    stopCapture()
}

function clearShortcut(id: TalosShortcutActionId) {
    localError.value = ''
    emit('updateShortcut', id, '')
}

function resetShortcut(id: TalosShortcutActionId) {
    const defaults = defaultTalosShortcuts()
    const binding = defaults[id]
    const conflict = shortcutConflict(props.shortcuts, id, binding)
    if (conflict) {
        localError.value = `${binding} is already assigned to ${conflict}.`
        return
    }

    emit('updateShortcut', id, binding)
}

onBeforeUnmount(stopCapture)
</script>

<template>
    <div class="space-y-3">
        <div class="flex flex-wrap items-start justify-between gap-3">
            <div>
                <h4 class="text-sm font-semibold text-[var(--talos-text)]">Keyboard shortcuts</h4>
                <p class="mt-1 text-xs leading-5 text-[var(--talos-muted)]">
                    Capture shortcuts locally, reject conflicts before save, and store only safe action bindings.
                </p>
            </div>
            <Button type="button" size="sm" variant="secondary" @click="emit('resetShortcuts')">Reset all</Button>
        </div>
        <div v-if="localError" class="rounded-md border border-[var(--talos-warning-border)] bg-[var(--talos-warning-soft)] px-3 py-2 text-sm text-[var(--talos-text)]">
            {{ localError }}
        </div>
        <section
            v-for="group in groupedShortcuts()"
            :key="group.label"
            class="overflow-hidden rounded-md border border-[var(--talos-border)] bg-[var(--talos-panel-soft)]"
        >
            <div class="border-b border-[var(--talos-border)] px-3 py-2 text-xs font-semibold uppercase text-[var(--talos-muted)]">
                {{ group.label }}
            </div>
            <div
                v-for="shortcut in group.items"
                :key="shortcut.id"
                :data-testid="`talos-shortcut-row-${shortcut.id}`"
                class="grid gap-2 border-b border-[var(--talos-border)] px-3 py-2 text-sm last:border-b-0 sm:grid-cols-[minmax(0,1fr)_auto_auto_auto]"
            >
                <div class="min-w-0">
                    <div class="font-medium text-[var(--talos-text)]">{{ shortcut.label }}</div>
                    <div class="text-xs text-[var(--talos-muted)]">{{ shortcut.id }}</div>
                </div>
                <kbd class="inline-flex min-w-24 items-center justify-center rounded-sm border border-[var(--talos-border)] bg-[var(--talos-panel)] px-2 py-1 text-xs text-[var(--talos-muted)]">
                    {{ shortcuts[shortcut.id] || 'Unbound' }}
                </kbd>
                <Button type="button" size="sm" variant="ghost" @click="startCapture(shortcut.id)">
                    {{ capturing === shortcut.id ? 'Press keys' : 'Set' }}
                </Button>
                <div class="flex gap-2">
                    <Button type="button" size="sm" variant="ghost" @click="clearShortcut(shortcut.id)">Clear</Button>
                    <Button type="button" size="sm" variant="ghost" @click="resetShortcut(shortcut.id)">Reset</Button>
                </div>
            </div>
        </section>
    </div>
</template>
