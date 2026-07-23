<script setup lang="ts">
/**
 * F3-T3 (owner #12, "Claude pattern") — dedicated chat-list page. On mobile the
 * sidebar's Chats entry navigates here (the Claude-app ergonomic); on tablet
 * the sidebar keeps its inline list. One-up over the competitor pattern: local
 * instant search plus per-row rename/delete without hidden menus — everything
 * works offline because sessions live in the local store.
 */
import { computed, nextTick, ref } from 'vue'
import { useRouter } from 'vue-router'
import { Check, MessageSquarePlus, Pencil, Search, Trash2, X } from '@lucide/vue'
import { Button } from '@/components/ui/button'
import {
    Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { useChatController } from '@/stores/chatController'
import { talosRelativeTime } from '@/lib/relativeTime'
import { talosLightImpact } from '@/services/haptics'

const router = useRouter()
const controller = useChatController()

const query = ref('')
const filtered = computed(() => {
    const needle = query.value.trim().toLowerCase()
    const sessions = controller.chat.sessions
    if (!needle) return sessions
    return sessions.filter((session) => (session.title || 'New chat').toLowerCase().includes(needle))
})

async function openSession(id: string): Promise<void> {
    void talosLightImpact()
    await controller.selectSession(id)
    void router.push({ name: 'chat' })
}

async function newChat(): Promise<void> {
    void talosLightImpact()
    await controller.newSession()
    void router.push({ name: 'chat' })
}

const renameTarget = ref<{ id: string; title: string } | null>(null)
const renameValue = ref('')
const renameInput = ref<HTMLInputElement | null>(null)
const deleteTarget = ref<{ id: string; title: string } | null>(null)

async function openRename(session: { id: string; title: string }): Promise<void> {
    renameTarget.value = session
    renameValue.value = session.title
    await nextTick()
    renameInput.value?.select()
}

async function submitRename(): Promise<void> {
    const target = renameTarget.value
    const title = renameValue.value.trim()
    if (!target || !title) return
    await controller.renameSession(target.id, title)
    renameTarget.value = null
}

async function confirmDelete(): Promise<void> {
    const target = deleteTarget.value
    if (!target) return
    await controller.deleteSession(target.id)
    deleteTarget.value = null
}
</script>

<template>
    <div class="flex min-h-full flex-col" data-testid="talos-chats-screen">
        <div class="flex items-center gap-2 px-4 pt-3">
            <div class="relative min-w-0 flex-1">
                <Search class="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[var(--talos-muted)]" aria-hidden="true" />
                <input
                    v-model="query"
                    data-testid="talos-chats-search"
                    type="search"
                    aria-label="Search chats"
                    placeholder="Search chats"
                    class="min-h-11 w-full rounded-xl border border-[var(--talos-border)] bg-[var(--talos-panel)] pl-9 pr-3 text-sm text-[var(--talos-text)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--talos-ring)]"
                >
            </div>
            <Button
                type="button"
                data-testid="talos-chats-new"
                aria-label="New chat"
                class="talos-pressable min-h-11 gap-2 rounded-xl bg-[var(--talos-accent,var(--primary))] px-3 text-sm text-[var(--talos-accent-contrast,var(--primary-foreground))]"
                @click="newChat"
            >
                <MessageSquarePlus class="size-4" aria-hidden="true" />
                New
            </Button>
        </div>

        <p v-if="!filtered.length" class="px-5 py-6 text-sm text-[var(--talos-muted)]">
            {{ query ? 'No chats match your search.' : 'No chats yet — start one above.' }}
        </p>

        <ul v-else class="mt-2 flex-1 overflow-y-auto px-2 pb-[max(1rem,env(safe-area-inset-bottom))]">
            <li
                v-for="session in filtered"
                :key="session.id"
                data-testid="talos-chats-row"
                :data-active="controller.chat.activeSession.value?.id === session.id ? 'true' : 'false'"
                class="group flex items-center gap-1 rounded-xl px-1"
                :class="controller.chat.activeSession.value?.id === session.id ? 'bg-[var(--talos-active)]' : ''"
            >
                <button
                    type="button"
                    data-testid="talos-chats-open"
                    class="talos-pressable flex min-h-13 min-w-0 flex-1 flex-col items-start justify-center rounded-xl px-2 text-left"
                    @click="openSession(session.id)"
                >
                    <span class="w-full truncate text-sm text-[var(--talos-text)]">{{ session.title || 'New chat' }}</span>
                    <span v-if="session.updated_at" class="text-[11px] text-[var(--talos-muted)]">{{ talosRelativeTime(session.updated_at) }}</span>
                </button>
                <button
                    type="button"
                    :aria-label="`Rename ${session.title || 'New chat'}`"
                    class="talos-pressable flex min-h-11 min-w-11 items-center justify-center rounded-full text-[var(--talos-muted)]"
                    @click="openRename(session)"
                >
                    <Pencil class="size-4" aria-hidden="true" />
                </button>
                <button
                    type="button"
                    :aria-label="`Delete ${session.title || 'New chat'}`"
                    class="talos-pressable flex min-h-11 min-w-11 items-center justify-center rounded-full text-[var(--talos-muted)]"
                    @click="deleteTarget = session"
                >
                    <Trash2 class="size-4" aria-hidden="true" />
                </button>
            </li>
        </ul>

        <Dialog :open="renameTarget !== null" @update:open="(open) => { if (!open) renameTarget = null }">
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
                    <Button type="button" variant="ghost" @click="renameTarget = null"><X class="size-4" aria-hidden="true" /> Cancel</Button>
                    <Button type="button" :disabled="!renameValue.trim()" @click="submitRename">
                        <Check class="size-4" aria-hidden="true" /> Save
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>

        <Dialog :open="deleteTarget !== null" @update:open="(open) => { if (!open) deleteTarget = null }">
            <DialogContent class="border-[var(--talos-border)] bg-[var(--talos-window-bg)] text-[var(--talos-text)]">
                <DialogHeader>
                    <DialogTitle>Delete chat?</DialogTitle>
                    <DialogDescription class="text-[var(--talos-muted)]">
                        This permanently removes "{{ deleteTarget?.title || 'New chat' }}" and its messages.
                    </DialogDescription>
                </DialogHeader>
                <DialogFooter>
                    <Button type="button" variant="ghost" @click="deleteTarget = null"><X class="size-4" aria-hidden="true" /> Cancel</Button>
                    <Button type="button" variant="destructive" @click="confirmDelete">
                        <Trash2 class="size-4" aria-hidden="true" /> Delete
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    </div>
</template>
