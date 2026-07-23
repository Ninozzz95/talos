<script setup lang="ts">
import { nextTick, ref } from 'vue'
import { Check, Download, EllipsisVertical, Menu, MessageSquarePlus, Pencil, Trash2, X } from '@lucide/vue'
import { Button } from '@/components/ui/button'
import {
    Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'

// F2-T3.6 (owner, ChatGPT-style): immersive shell chrome — no solid header bar;
// floating circular pills over a light top fade for scroll continuity. LEFT =
// hamburger (sidebar). RIGHT = 3-dot chat options (New / Rename / Delete on the
// ACTIVE chat) — replaces the header New Chat, which lives in the sidebar.
const props = defineProps<{
    activeTitle: string
    busy: boolean
}>()

const emit = defineEmits<{
    openMenu: []
    newChat: []
    rename: [title: string]
    delete: []
    export: []
}>()

const optionsOpen = ref(false)
const renameOpen = ref(false)
const deleteOpen = ref(false)
const renameValue = ref('')
const renameInput = ref<HTMLInputElement | null>(null)
const optionsMenu = ref<HTMLElement | null>(null)

async function toggleOptions(): Promise<void> {
    optionsOpen.value = !optionsOpen.value
    if (optionsOpen.value) {
        await nextTick()
        optionsMenu.value?.querySelector<HTMLElement>('[role="menuitem"]')?.focus()
    }
}

async function openRename(): Promise<void> {
    optionsOpen.value = false
    renameValue.value = props.activeTitle
    renameOpen.value = true
    await nextTick()
    renameInput.value?.select()
}

function submitRename(): void {
    const title = renameValue.value.trim()
    if (!title || props.busy) return
    emit('rename', title)
    renameOpen.value = false
}

function confirmDelete(): void {
    if (props.busy) return
    emit('delete')
    deleteOpen.value = false
}
</script>

<template>
    <div data-testid="talos-mobile-immersive-chrome" class="pointer-events-none absolute inset-x-0 top-0 z-20">
        <!-- light fade for scroll continuity under the floating pills -->
        <div
            aria-hidden="true"
            class="absolute inset-x-0 top-0 h-[calc(4rem+env(safe-area-inset-top))] bg-gradient-to-b from-[var(--talos-background)] via-[var(--talos-background)]/70 to-transparent"
        />
        <div class="relative flex items-start justify-between px-3 pt-[max(0.5rem,env(safe-area-inset-top))]">
            <Button
                type="button"
                size="icon-lg"
                variant="ghost"
                aria-label="Open menu"
                class="talos-pressable pointer-events-auto min-h-11 min-w-11 rounded-full border border-[var(--talos-border)]/60 bg-[var(--talos-card)]/85 backdrop-blur"
                @click="emit('openMenu')"
            >
                <Menu aria-hidden="true" />
            </Button>

            <div class="relative pointer-events-auto" @keydown.escape="optionsOpen = false">
                <Button
                    type="button"
                    size="icon-lg"
                    variant="ghost"
                    aria-label="Chat options"
                    aria-haspopup="menu"
                    :aria-expanded="optionsOpen"
                    class="talos-pressable min-h-11 min-w-11 rounded-full border border-[var(--talos-border)]/60 bg-[var(--talos-card)]/85 backdrop-blur"
                    @click="toggleOptions"
                >
                    <EllipsisVertical aria-hidden="true" />
                </Button>
                <!-- outside-tap scrim: any tap outside the menu dismisses it -->
                <div
                    v-if="optionsOpen"
                    class="fixed inset-0 z-20"
                    aria-hidden="true"
                    @click="optionsOpen = false"
                />
                <Transition
                    enter-active-class="transition duration-150 ease-out"
                    enter-from-class="opacity-0 scale-95"
                    enter-to-class="opacity-100 scale-100"
                    leave-active-class="transition duration-100 ease-in"
                    leave-from-class="opacity-100 scale-100"
                    leave-to-class="opacity-0 scale-95"
                >
                    <div
                        v-if="optionsOpen"
                        ref="optionsMenu"
                        data-testid="talos-immersive-options"
                        role="menu"
                        aria-label="Chat options"
                        class="absolute right-0 top-full z-30 mt-2 w-48 origin-top-right rounded-xl border border-[var(--talos-border)] bg-[var(--talos-card)] p-1 shadow-[0_8px_30px_rgba(0,0,0,0.12)]"
                    >
                        <button type="button" role="menuitem" class="talos-pressable flex min-h-11 w-full items-center gap-2 rounded-lg px-2 text-left text-sm text-[var(--talos-text)] hover:bg-[var(--talos-active)]" @click="optionsOpen = false; emit('newChat')">
                            <MessageSquarePlus class="size-4 text-[var(--talos-accent)]" aria-hidden="true" /> New chat
                        </button>
                        <button type="button" role="menuitem" class="talos-pressable flex min-h-11 w-full items-center gap-2 rounded-lg px-2 text-left text-sm text-[var(--talos-text)] hover:bg-[var(--talos-active)]" @click="openRename">
                            <Pencil class="size-4 text-[var(--talos-accent)]" aria-hidden="true" /> Rename chat
                        </button>
                        <button type="button" role="menuitem" class="talos-pressable flex min-h-11 w-full items-center gap-2 rounded-lg px-2 text-left text-sm text-[var(--talos-text)] hover:bg-[var(--talos-active)]" @click="optionsOpen = false; emit('export')">
                            <Download class="size-4 text-[var(--talos-accent)]" aria-hidden="true" /> Export chat
                        </button>
                        <button type="button" role="menuitem" class="talos-pressable flex min-h-11 w-full items-center gap-2 rounded-lg px-2 text-left text-sm text-[var(--talos-danger,#dc5b5b)] hover:bg-[var(--talos-active)]" @click="optionsOpen = false; deleteOpen = true">
                            <Trash2 class="size-4" aria-hidden="true" /> Delete chat
                        </button>
                    </div>
                </Transition>
            </div>
        </div>

        <Dialog :open="renameOpen" @update:open="(open) => { if (!open) renameOpen = false }">
            <DialogContent class="border-[var(--talos-border)] bg-[var(--talos-window-bg)] text-[var(--talos-text)]">
                <DialogHeader>
                    <DialogTitle>Rename chat</DialogTitle>
                    <DialogDescription class="text-[var(--talos-muted)]">Choose a concise name for this conversation.</DialogDescription>
                </DialogHeader>
                <input
                    ref="renameInput"
                    v-model="renameValue"
                    aria-label="Chat name"
                    class="min-h-11 w-full rounded-md border border-[var(--talos-border)] bg-[var(--talos-input,var(--talos-background))] px-3 text-sm text-[var(--talos-text)] outline-none focus:border-[var(--talos-accent)]"
                    @keydown.enter.prevent="submitRename"
                >
                <DialogFooter>
                    <Button type="button" variant="ghost" @click="renameOpen = false"><X class="size-4" aria-hidden="true" /> Cancel</Button>
                    <Button type="button" :disabled="!renameValue.trim() || props.busy" @click="submitRename">
                        <Check class="size-4" aria-hidden="true" /> Save
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>

        <Dialog :open="deleteOpen" @update:open="(open) => { if (!open) deleteOpen = false }">
            <DialogContent class="border-[var(--talos-border)] bg-[var(--talos-window-bg)] text-[var(--talos-text)]">
                <DialogHeader>
                    <DialogTitle>Delete chat?</DialogTitle>
                    <DialogDescription class="text-[var(--talos-muted)]">
                        This permanently removes "{{ props.activeTitle || 'New chat' }}" and its messages.
                    </DialogDescription>
                </DialogHeader>
                <DialogFooter>
                    <Button type="button" variant="ghost" @click="deleteOpen = false"><X class="size-4" aria-hidden="true" /> Cancel</Button>
                    <Button type="button" variant="destructive" :disabled="props.busy" @click="confirmDelete">
                        <Trash2 class="size-4" aria-hidden="true" /> Delete
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    </div>
</template>
