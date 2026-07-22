<script setup lang="ts">
import { nextTick, ref } from 'vue'
import { Check, MessageSquarePlus, Pencil, Trash2, X } from '@lucide/vue'
import { Button } from '@/components/ui/button'
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog'
import {
    Drawer,
    DrawerContent,
    DrawerDescription,
    DrawerHeader,
    DrawerTitle,
} from '@/components/ui/drawer'
import type { TalosLocalChatSession } from '@/repositories/chatRepository'

const props = defineProps<{
    open: boolean
    sessions: readonly TalosLocalChatSession[]
    activeSessionId: string | null
    busy: boolean
}>()

const emit = defineEmits<{
    'update:open': [open: boolean]
    'newChat': []
    'select': [sessionId: string]
    'rename': [sessionId: string, title: string]
    'delete': [sessionId: string]
}>()

const renameTarget = ref<TalosLocalChatSession | null>(null)
const renameValue = ref('')
const renameInput = ref<HTMLInputElement | null>(null)
const deleteTarget = ref<TalosLocalChatSession | null>(null)

function closeDrawer(): void {
    emit('update:open', false)
}

function startNewChat(): void {
    emit('newChat')
    closeDrawer()
}

function selectSession(sessionId: string): void {
    emit('select', sessionId)
    closeDrawer()
}

async function openRename(session: TalosLocalChatSession): Promise<void> {
    renameTarget.value = session
    renameValue.value = session.title
    await nextTick()
    renameInput.value?.select()
}

function closeRename(): void {
    renameTarget.value = null
    renameValue.value = ''
}

function submitRename(): void {
    const target = renameTarget.value
    const title = renameValue.value.trim()
    if (!target || !title || props.busy) return
    emit('rename', target.id, title)
    closeRename()
}

function closeDelete(): void {
    deleteTarget.value = null
}

function confirmDelete(): void {
    if (!deleteTarget.value || props.busy) return
    emit('delete', deleteTarget.value.id)
    closeDelete()
}
</script>

<template>
    <Drawer
        :open="props.open"
        direction="left"
        :dismissible="!props.busy"
        @update:open="emit('update:open', $event)"
    >
        <DrawerContent
            data-testid="talos-mobile-session-drawer"
            class="h-[100dvh] w-[min(88vw,24rem)] rounded-none border-r border-[var(--talos-border)] bg-[var(--talos-sidebar)] text-[var(--talos-text)]"
        >
            <DrawerHeader class="flex-row items-start gap-3 border-b border-[var(--talos-border)] px-4 pb-3 pt-[max(1rem,env(safe-area-inset-top))] text-left">
                <div class="min-w-0 flex-1">
                    <DrawerTitle class="text-base text-[var(--talos-text)]">Chats</DrawerTitle>
                    <DrawerDescription class="text-xs text-[var(--talos-muted)]">
                        {{ props.sessions.length }} {{ props.sessions.length === 1 ? 'conversation' : 'conversations' }} on this device
                    </DrawerDescription>
                </div>
                <Button type="button" size="icon-lg" variant="ghost" aria-label="Close chat history" @click="closeDrawer">
                    <X aria-hidden="true" />
                </Button>
            </DrawerHeader>

            <div class="border-b border-[var(--talos-border)] p-3">
                <Button
                    type="button"
                    class="min-h-11 w-full justify-start gap-2 bg-[var(--talos-accent)] text-[var(--talos-accent-text)]"
                    data-testid="talos-session-new-chat"
                    :disabled="props.busy"
                    @click="startNewChat"
                >
                    <MessageSquarePlus aria-hidden="true" />
                    New Chat
                </Button>
            </div>

            <div class="min-h-0 flex-1 overflow-y-auto overscroll-contain p-2 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
                <p v-if="props.sessions.length === 0" class="px-3 py-8 text-center text-sm text-[var(--talos-muted)]">
                    No chats yet.
                </p>

                <ul v-else class="space-y-1" aria-label="Chat history">
                    <li
                        v-for="session in props.sessions"
                        :key="session.id"
                        class="flex min-w-0 items-center gap-1 rounded-md border"
                        :class="session.id === props.activeSessionId
                            ? 'border-[var(--talos-accent-border)] bg-[var(--talos-accent-soft)]'
                            : 'border-transparent hover:border-[var(--talos-border)] hover:bg-[var(--talos-panel-soft)]'"
                    >
                        <button
                            type="button"
                            class="flex min-h-11 min-w-0 flex-1 items-center gap-2 rounded-md px-3 py-2 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--talos-ring)]"
                            :aria-current="session.id === props.activeSessionId ? 'page' : undefined"
                            :aria-label="`Open chat ${session.title || 'Untitled chat'}`"
                            :disabled="props.busy"
                            @click="selectSession(session.id)"
                        >
                            <Check
                                class="size-4 shrink-0"
                                :class="session.id === props.activeSessionId ? 'text-[var(--talos-accent)]' : 'invisible'"
                                aria-hidden="true"
                            />
                            <span class="min-w-0 flex-1">
                                <span class="block truncate text-sm font-medium text-[var(--talos-text)]">{{ session.title || 'Untitled chat' }}</span>
                                <span class="block truncate text-[11px] text-[var(--talos-muted)]">Persistent</span>
                            </span>
                        </button>
                        <Button
                            type="button"
                            size="icon-lg"
                            variant="ghost"
                            :aria-label="`Rename ${session.title || 'Untitled chat'}`"
                            :disabled="props.busy"
                            @click="openRename(session)"
                        >
                            <Pencil aria-hidden="true" />
                        </Button>
                        <Button
                            type="button"
                            size="icon-lg"
                            variant="ghost"
                            class="text-[var(--talos-danger)]"
                            :aria-label="`Delete ${session.title || 'Untitled chat'}`"
                            :disabled="props.busy"
                            @click="deleteTarget = session"
                        >
                            <Trash2 aria-hidden="true" />
                        </Button>
                    </li>
                </ul>
            </div>
        </DrawerContent>
    </Drawer>

    <Dialog :open="renameTarget !== null" @update:open="!$event && closeRename()">
        <DialogContent class="border border-[var(--talos-border)] bg-[var(--talos-window-bg)] text-[var(--talos-text)]">
            <DialogHeader>
                <DialogTitle>Rename chat</DialogTitle>
                <DialogDescription class="text-[var(--talos-muted)]">Choose a concise name for this conversation.</DialogDescription>
            </DialogHeader>
            <form class="space-y-4" @submit.prevent="submitRename">
                <label class="block text-xs font-medium text-[var(--talos-muted)]" for="talos-mobile-chat-name">Chat name</label>
                <input
                    id="talos-mobile-chat-name"
                    ref="renameInput"
                    v-model="renameValue"
                    aria-label="Chat name"
                    maxlength="255"
                    class="min-h-11 w-full rounded-md border border-[var(--talos-border)] bg-[var(--talos-input)] px-3 text-sm text-[var(--talos-text)] outline-none focus:ring-2 focus:ring-[var(--talos-ring)]"
                />
                <DialogFooter>
                    <Button type="button" variant="outline" @click="closeRename">Cancel</Button>
                    <Button
                        type="submit"
                        data-testid="talos-session-rename-submit"
                        :disabled="props.busy || !renameValue.trim()"
                    >
                        Save
                    </Button>
                </DialogFooter>
            </form>
        </DialogContent>
    </Dialog>

    <Dialog :open="deleteTarget !== null" @update:open="!$event && closeDelete()">
        <DialogContent class="border border-[var(--talos-border)] bg-[var(--talos-window-bg)] text-[var(--talos-text)]">
            <DialogHeader>
                <DialogTitle>Delete chat?</DialogTitle>
                <DialogDescription class="text-[var(--talos-muted)]">
                    {{ deleteTarget?.title || 'This chat' }} and its local messages will be removed from this device.
                </DialogDescription>
            </DialogHeader>
            <DialogFooter>
                <Button type="button" variant="outline" @click="closeDelete">Cancel</Button>
                <Button
                    type="button"
                    variant="destructive"
                    data-testid="talos-session-delete-confirm"
                    :disabled="props.busy"
                    @click="confirmDelete"
                >
                    Delete
                </Button>
            </DialogFooter>
        </DialogContent>
    </Dialog>
</template>
