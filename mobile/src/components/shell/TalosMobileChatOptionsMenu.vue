<script setup lang="ts">
import { nextTick, ref } from 'vue'
import { Check, Download, EllipsisVertical, Images, MessageSquarePlus, Pencil, Trash2, X } from '@lucide/vue'
import { Button } from '@/components/ui/button'
import TalosMobileConfirmDialog from '@/components/shell/TalosMobileConfirmDialog.vue'
import TalosMobileDeleteChatDialog from '@/components/shell/TalosMobileDeleteChatDialog.vue'
import type { TalosSessionCleanupPlan } from '@/lib/chat/sessionCleanup'

/**
 * The 3-dot chat-options menu (New / Rename / Export / Delete on the ACTIVE
 * chat) + its device-proven confirm dialogs. Extracted so the immersive chrome
 * AND the classic header (owner 2026-07-24: "i 3 puntini anche nell'header
 * versione non immersive") share ONE implementation.
 */
const props = withDefaults(defineProps<{
    activeTitle: string
    busy: boolean
    /** Pill styling on the immersive chrome; plain ghost in the solid header. */
    pill?: boolean
    /**
     * False before a chat exists — sessions are created lazily, so this is the
     * state of a fresh install and of "deleted the last chat". The entry used to
     * render anyway and do nothing at all when tapped.
     */
    canOpenMedia?: boolean
    /** What this chat would take from the Library (owner 2026-07-26). */
    cleanupPlan?: TalosSessionCleanupPlan
}>(), {
    pill: false,
    canOpenMedia: true,
    // Empty means "nothing to offer": the checkbox stays hidden, which is the
    // right behaviour for a surface that has not wired the plan yet.
    cleanupPlan: () => ({ documents: [], sources: [] }),
})

const emit = defineEmits<{
    newChat: []
    rename: [title: string]
    delete: [{ deleteMedia: boolean }]
    export: []
    /** Owner 2026-07-26: this chat's media gallery. */
    media: []
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

function confirmDelete(choice: { deleteMedia: boolean }): void {
    // The dialog stays up and spins; it emits `close` once `busy` falls back,
    // so the user sees the deletion happen instead of a list that has not
    // changed yet.
    emit('delete', choice)
}
</script>

<template>
    <div class="relative pointer-events-auto" @keydown.escape="optionsOpen = false">
        <Button
            type="button"
            size="icon-lg"
            variant="ghost"
            aria-label="Chat options"
            aria-haspopup="menu"
            :aria-expanded="optionsOpen"
            class="talos-pressable min-h-11 min-w-11"
            :class="pill ? 'rounded-full border border-[var(--talos-border)]/60 bg-[var(--talos-card)]/85 backdrop-blur' : ''"
            @click="toggleOptions"
        >
            <EllipsisVertical aria-hidden="true" />
        </Button>
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
                data-testid="talos-chat-options-menu"
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
                <!-- Owner 2026-07-26: reachable from the menu in BOTH header
                     modes. Tapping the title only works in the solid header —
                     the immersive chrome renders no title at all, and it is the
                     default, so the menu is the entry that always exists. -->
                <button v-if="props.canOpenMedia" type="button" role="menuitem" data-testid="talos-chat-options-media" class="talos-pressable flex min-h-11 w-full items-center gap-2 rounded-lg px-2 text-left text-sm text-[var(--talos-text)] hover:bg-[var(--talos-active)]" @click="optionsOpen = false; emit('media')">
                    <Images class="size-4 text-[var(--talos-accent)]" aria-hidden="true" /> Media in this chat
                </button>
                <button type="button" role="menuitem" class="talos-pressable flex min-h-11 w-full items-center gap-2 rounded-lg px-2 text-left text-sm text-[var(--talos-text)] hover:bg-[var(--talos-active)]" @click="optionsOpen = false; emit('export')">
                    <Download class="size-4 text-[var(--talos-accent)]" aria-hidden="true" /> Export chat
                </button>
                <button type="button" role="menuitem" class="talos-pressable flex min-h-11 w-full items-center gap-2 rounded-lg px-2 text-left text-sm text-[var(--talos-danger,#dc5b5b)] hover:bg-[var(--talos-active)]" @click="optionsOpen = false; deleteOpen = true">
                    <Trash2 class="size-4" aria-hidden="true" /> Delete chat
                </button>
            </div>
        </Transition>

        <TalosMobileConfirmDialog
            v-if="renameOpen"
            title="Rename chat"
            description="Choose a concise name for this conversation."
            @close="renameOpen = false"
        >
            <input
                ref="renameInput"
                v-model="renameValue"
                aria-label="Chat name"
                class="min-h-11 w-full rounded-md border border-[var(--talos-border)] bg-[var(--talos-input,var(--talos-background))] px-3 text-sm text-[var(--talos-text)] outline-none focus:border-[var(--talos-accent)]"
                @keydown.enter.prevent="submitRename"
            >
            <template #footer>
                <Button type="button" variant="ghost" @click="renameOpen = false"><X class="size-4" aria-hidden="true" /> Cancel</Button>
                <Button type="button" :disabled="!renameValue.trim() || props.busy" @click="submitRename">
                    <Check class="size-4" aria-hidden="true" /> Save
                </Button>
            </template>
        </TalosMobileConfirmDialog>

        <TalosMobileDeleteChatDialog
            v-if="deleteOpen"
            :title="props.activeTitle"
            :plan="props.cleanupPlan"
            :busy="props.busy"
            @close="deleteOpen = false"
            @confirm="confirmDelete"
        />
    </div>
</template>
