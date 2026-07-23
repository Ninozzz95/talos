<script setup lang="ts">
import { nextTick, ref } from 'vue'
import {
    Activity, BookOpen, Check, FileArchive, FlaskConical, MessageSquarePlus, MessageSquareText,
    Pencil, Settings, Trash2, X,
} from '@lucide/vue'
import { Button } from '@/components/ui/button'
import {
    Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import {
    Drawer, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle,
} from '@/components/ui/drawer'
import type { TalosLocalChatSession } from '@/repositories/chatRepository'
import type { TalosMobileRouteName } from '@/lib/mobileRoutes'

// F1-T3 (D5/D6): the full-width hamburger sidebar — the Claude chat-first
// pattern: [New chat] -> Recents (sessions, rename/delete parity with the
// session drawer it supersedes) -> Tools -> Settings pinned at the bottom.
const props = defineProps<{
    open: boolean
    sessions: readonly TalosLocalChatSession[]
    activeSessionId: string | null
    busy: boolean
    creatingSession: boolean
}>()

const emit = defineEmits<{
    'update:open': [open: boolean]
    newChat: []
    select: [sessionId: string]
    rename: [sessionId: string, title: string]
    delete: [sessionId: string]
    navigate: [route: TalosMobileRouteName]
    openModelLab: []
    openSettings: []
}>()

const TOOLS: Array<{ label: string; route: TalosMobileRouteName; icon: unknown }> = [
    { label: 'Research', route: 'research', icon: BookOpen },
    { label: 'Cockpit', route: 'runs', icon: Activity },
    { label: 'Library', route: 'context', icon: FileArchive },
]

const renameTarget = ref<TalosLocalChatSession | null>(null)
const renameValue = ref('')
const renameInput = ref<HTMLInputElement | null>(null)
const deleteTarget = ref<TalosLocalChatSession | null>(null)

function sessionTitle(session: TalosLocalChatSession): string {
    return session.title || 'Untitled chat'
}

async function openRename(session: TalosLocalChatSession): Promise<void> {
    renameTarget.value = session
    renameValue.value = session.title
    await nextTick()
    renameInput.value?.select()
}

function submitRename(): void {
    const target = renameTarget.value
    const title = renameValue.value.trim()
    if (!target || !title || props.busy) return
    emit('rename', target.id, title)
    renameTarget.value = null
    renameValue.value = ''
}

function confirmDelete(): void {
    if (!deleteTarget.value || props.busy) return
    emit('delete', deleteTarget.value.id)
    deleteTarget.value = null
}
</script>

<template>
    <Drawer
        :open="props.open"
        direction="left"
        :dismissible="!props.busy"
        @update:open="emit('update:open', $event)"
    >
        <!-- F3-T1 (owner #5): the vendored DrawerContent forces w-3/4 +
             sm:max-w-sm via direction variants that outrank plain w-full —
             override with the SAME variants so full-width really applies. -->
        <DrawerContent
            data-testid="talos-mobile-sidebar"
            class="h-[100dvh] w-full max-w-none rounded-none border-0 bg-[var(--talos-sidebar)] text-[var(--talos-text)] data-[vaul-drawer-direction=left]:w-full data-[vaul-drawer-direction=left]:max-w-none data-[vaul-drawer-direction=left]:rounded-none data-[vaul-drawer-direction=left]:border-0 data-[vaul-drawer-direction=left]:sm:max-w-none"
        >
            <DrawerHeader class="flex-row items-center gap-3 border-b border-[var(--talos-border)] px-4 pb-3 pt-[max(1rem,env(safe-area-inset-top))] text-left">
                <div class="min-w-0 flex-1">
                    <DrawerTitle class="talos-orbitron-brand text-base tracking-[0.2em] text-[var(--talos-text)]">TALOS</DrawerTitle>
                    <DrawerDescription class="text-xs text-[var(--talos-muted)]">Chats, tools and settings</DrawerDescription>
                </div>
                <Button type="button" size="icon-lg" variant="ghost" class="min-h-11 min-w-11" aria-label="Close menu" @click="emit('update:open', false)">
                    <X aria-hidden="true" />
                </Button>
            </DrawerHeader>

            <div class="flex min-h-0 flex-1 flex-col">
                <div class="px-3 pt-3">
                    <Button
                        type="button"
                        variant="outline"
                        data-testid="talos-sidebar-new-chat"
                        class="w-full justify-start gap-2 border-[var(--talos-border)] text-[var(--talos-text)]"
                        :disabled="props.creatingSession"
                        @click="emit('newChat')"
                    >
                        <MessageSquarePlus class="size-4 text-[var(--talos-accent)]" aria-hidden="true" />
                        New chat
                    </Button>
                </div>

                <!-- F3-T3 (owner #12, Claude pattern): on phones the Chats entry
                     opens the dedicated list page; tablets keep the inline list. -->
                <div class="px-3 pt-2 md:hidden">
                    <button
                        type="button"
                        data-testid="talos-sidebar-chats-entry"
                        class="talos-pressable flex min-h-12 w-full items-center gap-2 rounded-xl border border-[var(--talos-border)] px-3 text-left text-sm font-medium text-[var(--talos-text)] hover:bg-[var(--talos-active)]"
                        @click="emit('navigate', 'chats')"
                    >
                        <MessageSquareText class="size-4 text-[var(--talos-accent)]" aria-hidden="true" />
                        <span class="min-w-0 flex-1 truncate">Chats</span>
                        <span class="text-xs text-[var(--talos-muted)]">{{ props.sessions.length }}</span>
                    </button>
                </div>

                <span class="flex-1 md:hidden" aria-hidden="true" />

                <nav
                    data-testid="talos-sidebar-recents"
                    aria-label="Recent chats"
                    class="hidden min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 py-3 md:block"
                >
                    <p class="px-1 pb-1 text-[11px] font-semibold uppercase tracking-wide text-[var(--talos-muted)]">Recents</p>
                    <p class="px-1 pb-2 text-xs text-[var(--talos-muted)]">
                        {{ props.sessions.length }} conversation{{ props.sessions.length === 1 ? '' : 's' }} on this device
                    </p>
                    <p v-if="!props.sessions.length" class="px-1 py-2 text-sm text-[var(--talos-muted)]">No chats yet.</p>
                    <ul v-else class="space-y-0.5" aria-label="Chat history">
                        <li v-for="session in props.sessions" :key="session.id" class="group flex items-center gap-1">
                            <button
                                type="button"
                                :aria-label="`Open chat ${sessionTitle(session)}`"
                                :aria-current="session.id === props.activeSessionId ? 'page' : undefined"
                                class="talos-pressable min-h-11 min-w-0 flex-1 truncate rounded-md px-2 text-left text-sm"
                                :class="session.id === props.activeSessionId
                                    ? 'bg-[var(--talos-active)] text-[var(--talos-text)]'
                                    : 'text-[var(--talos-text)] hover:bg-[var(--talos-active)]'"
                                @click="emit('select', session.id)"
                            >
                                {{ sessionTitle(session) }}
                            </button>
                            <Button type="button" size="icon" variant="ghost" :aria-label="`Rename ${sessionTitle(session)}`" @click="openRename(session)">
                                <Pencil class="size-3.5" aria-hidden="true" />
                            </Button>
                            <Button type="button" size="icon" variant="ghost" :aria-label="`Delete ${sessionTitle(session)}`" @click="deleteTarget = session">
                                <Trash2 class="size-3.5" aria-hidden="true" />
                            </Button>
                        </li>
                    </ul>
                </nav>

                <nav
                    data-testid="talos-sidebar-tools"
                    aria-label="Tools"
                    class="border-t border-[var(--talos-border)] px-3 py-3"
                >
                    <p class="px-1 pb-1 text-[11px] font-semibold uppercase tracking-wide text-[var(--talos-muted)]">Tools</p>
                    <ul class="space-y-0.5">
                        <li v-for="tool in TOOLS" :key="tool.route">
                            <button
                                type="button"
                                :aria-label="`Open ${tool.label}`"
                                class="talos-pressable flex min-h-11 w-full items-center gap-2 rounded-md px-2 text-left text-sm text-[var(--talos-text)] hover:bg-[var(--talos-active)]"
                                @click="emit('navigate', tool.route)"
                            >
                                <component :is="tool.icon" class="size-4 text-[var(--talos-accent)]" aria-hidden="true" />
                                {{ tool.label }}
                            </button>
                        </li>
                        <li>
                            <button
                                type="button"
                                aria-label="Open Model Lab"
                                class="talos-pressable flex min-h-11 w-full items-center gap-2 rounded-md px-2 text-left text-sm text-[var(--talos-text)] hover:bg-[var(--talos-active)]"
                                @click="emit('openModelLab')"
                            >
                                <FlaskConical class="size-4 text-[var(--talos-accent)]" aria-hidden="true" />
                                Model Lab
                            </button>
                        </li>
                    </ul>
                </nav>

                <div
                    data-testid="talos-sidebar-settings"
                    class="border-t border-[var(--talos-border)] px-3 py-2 pb-[max(0.75rem,env(safe-area-inset-bottom))]"
                >
                    <button
                        type="button"
                        aria-label="Open Settings"
                        class="talos-pressable flex min-h-11 w-full items-center gap-2 rounded-md px-2 text-left text-sm text-[var(--talos-text)] hover:bg-[var(--talos-active)]"
                        @click="emit('openSettings')"
                    >
                        <Settings class="size-4 text-[var(--talos-accent)]" aria-hidden="true" />
                        Settings
                    </button>
                </div>
            </div>

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
                        class="h-10 w-full rounded-md border border-[var(--talos-border)] bg-[var(--talos-input,var(--talos-background))] px-3 text-sm text-[var(--talos-text)] outline-none focus:border-[var(--talos-accent)]"
                        @keydown.enter.prevent="submitRename"
                    >
                    <DialogFooter>
                        <Button type="button" variant="ghost" @click="renameTarget = null"><X class="size-4" aria-hidden="true" /> Cancel</Button>
                        <Button type="button" data-testid="talos-session-rename-submit" :disabled="!renameValue.trim() || props.busy" @click="submitRename">
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
                            This permanently removes "{{ deleteTarget ? sessionTitle(deleteTarget) : '' }}" and its messages.
                        </DialogDescription>
                    </DialogHeader>
                    <DialogFooter>
                        <Button type="button" variant="ghost" @click="deleteTarget = null"><X class="size-4" aria-hidden="true" /> Cancel</Button>
                        <Button type="button" variant="destructive" data-testid="talos-session-delete-confirm" :disabled="props.busy" @click="confirmDelete">
                            <Trash2 class="size-4" aria-hidden="true" /> Delete
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </DrawerContent>
    </Drawer>
</template>
