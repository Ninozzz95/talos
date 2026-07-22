<script setup lang="ts">
import { onBeforeUnmount, ref } from 'vue'
import {
    TALOS_SHORTCUTS,
    defaultTalosShortcuts,
    shortcutConflict,
    shortcutFromKeyboardEvent,
    type TalosShortcutActionId,
} from '@/lib/talosShortcuts'
import { useSettingsStore } from '@/stores/settings'

const settings = useSettingsStore()
const capturing = ref<TalosShortcutActionId | null>(null)
const localError = ref('')

function groupedShortcuts() {
    const groups = new Map<string, typeof TALOS_SHORTCUTS>()
    for (const shortcut of TALOS_SHORTCUTS) {
        groups.set(shortcut.group, [...(groups.get(shortcut.group) ?? []), shortcut])
    }
    return [...groups.entries()].map(([label, items]) => ({ label, items }))
}

function stopCapture(): void {
    window.removeEventListener('keydown', captureKey, true)
    capturing.value = null
}

function startCapture(id: TalosShortcutActionId): void {
    stopCapture()
    localError.value = ''
    capturing.value = id
    window.addEventListener('keydown', captureKey, true)
}

function captureKey(event: KeyboardEvent): void {
    if (!capturing.value) return
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
    const conflict = shortcutConflict(settings.state.keyboard_shortcuts, capturing.value, binding)
    if (conflict) {
        localError.value = `${binding} is already assigned to ${conflict}.`
        return
    }
    void settings.setShortcut(capturing.value, binding)
    stopCapture()
}

function clearShortcut(id: TalosShortcutActionId): void {
    localError.value = ''
    void settings.setShortcut(id, '')
}

function resetShortcut(id: TalosShortcutActionId): void {
    const binding = defaultTalosShortcuts()[id]
    const conflict = shortcutConflict(settings.state.keyboard_shortcuts, id, binding)
    if (conflict) {
        localError.value = `${binding} is already assigned to ${conflict}.`
        return
    }
    void settings.setShortcut(id, binding)
}

onBeforeUnmount(stopCapture)
</script>

<template>
    <div class="space-y-4">
        <div class="flex flex-wrap items-start justify-between gap-3">
            <div>
                <h4 class="text-sm font-semibold text-[var(--talos-text)]">Keyboard shortcuts</h4>
                <p class="mt-1 text-xs leading-5 text-[var(--talos-muted)]">
                    Hardware-keyboard bindings are validated locally and conflicts are rejected before persistence.
                </p>
            </div>
            <button
                type="button"
                class="min-h-11 rounded-md border border-[var(--talos-border)] px-3 text-sm text-[var(--talos-text)]"
                @click="settings.resetShortcuts()"
            >Reset all</button>
        </div>

        <p v-if="localError" role="alert" class="rounded-md border border-[var(--talos-warning-border)] bg-[var(--talos-warning-soft)] px-3 py-2 text-sm text-[var(--talos-text)]">
            {{ localError }}
        </p>

        <section v-for="group in groupedShortcuts()" :key="group.label" class="border-t border-[var(--talos-border)]">
            <h5 class="py-2 text-xs font-semibold uppercase text-[var(--talos-muted)]">{{ group.label }}</h5>
            <div
                v-for="shortcut in group.items"
                :key="shortcut.id"
                :data-testid="`talos-shortcut-row-${shortcut.id}`"
                class="grid gap-2 border-t border-[var(--talos-border)] py-3 sm:grid-cols-[minmax(0,1fr)_auto]"
            >
                <div class="min-w-0">
                    <div class="font-medium text-[var(--talos-text)]">{{ shortcut.label }}</div>
                    <div class="text-xs text-[var(--talos-muted)]">{{ shortcut.id }}</div>
                </div>
                <kbd class="inline-flex min-h-9 min-w-24 items-center justify-center rounded-sm border border-[var(--talos-border)] bg-[var(--talos-panel)] px-2 text-xs text-[var(--talos-muted)]">
                    {{ settings.state.keyboard_shortcuts[shortcut.id] || 'Unbound' }}
                </kbd>
                <div class="col-span-full flex flex-wrap gap-2">
                    <button
                        type="button"
                        :aria-label="`Set ${shortcut.label} shortcut`"
                        class="min-h-11 rounded-md border border-[var(--talos-border)] px-3 text-sm text-[var(--talos-text)]"
                        @click="startCapture(shortcut.id)"
                    >{{ capturing === shortcut.id ? 'Press keys' : 'Set' }}</button>
                    <button type="button" class="min-h-11 px-2 text-sm text-[var(--talos-muted)]" @click="clearShortcut(shortcut.id)">Clear</button>
                    <button type="button" class="min-h-11 px-2 text-sm text-[var(--talos-muted)]" @click="resetShortcut(shortcut.id)">Reset</button>
                </div>
            </div>
        </section>
    </div>
</template>

