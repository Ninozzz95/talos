<script setup lang="ts">
import { Archive, CheckSquare, Copy, FolderInput, MoreHorizontal, Pencil, Square, Star, Trash2 } from '@lucide/vue'
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from '../../ui/dropdown-menu'
import { sessionChatState } from '../../../composables/useTalosSessions'
import type { TalosSession } from '../../../lib/talosTypes'

withDefaults(defineProps<{
    session: TalosSession
    inlinePortal?: boolean
}>(), {
    inlinePortal: false,
})

const emit = defineEmits<{
    rename: [session: TalosSession]
    favorite: [session: TalosSession]
    toggleSelected: [session: TalosSession]
    copy: [session: TalosSession]
    move: [session: TalosSession]
    archive: [session: TalosSession]
    delete: [session: TalosSession]
}>()
</script>

<template>
    <DropdownMenu :modal="false">
        <DropdownMenuTrigger as-child>
            <button
                type="button"
                data-talos-session-menu-trigger="true"
                class="mr-1 inline-flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center rounded-md text-[var(--talos-muted)] opacity-80 transition hover:bg-[var(--talos-panel)] hover:text-[var(--talos-text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--talos-ring)] group-hover:opacity-100"
                :aria-label="`Chat actions for ${session.title || 'Untitled chat'}`"
                @click.stop
            >
                <MoreHorizontal class="h-4 w-4" />
            </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" aria-label="Chat actions" class="w-48 text-[12px]" :portal-disabled="inlinePortal">
            <DropdownMenuItem @select="emit('rename', session)">
                <Pencil class="h-3.5 w-3.5" /> Rename
            </DropdownMenuItem>
            <DropdownMenuItem @select="emit('favorite', session)">
                <Star class="h-3.5 w-3.5" /> {{ sessionChatState(session).favorite ? 'Unfavorite' : 'Favorite' }}
            </DropdownMenuItem>
            <DropdownMenuItem @select="emit('toggleSelected', session)">
                <component :is="sessionChatState(session).selected ? CheckSquare : Square" class="h-3.5 w-3.5" /> Select
            </DropdownMenuItem>
            <DropdownMenuItem @select="emit('copy', session)">
                <Copy class="h-3.5 w-3.5" /> Copy Chat
            </DropdownMenuItem>
            <DropdownMenuItem @select="emit('move', session)">
                <FolderInput class="h-3.5 w-3.5" /> Move to folder
            </DropdownMenuItem>
            <DropdownMenuItem @select="emit('archive', session)">
                <Archive class="h-3.5 w-3.5" /> Archive
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem variant="destructive" @select="emit('delete', session)">
                <Trash2 class="h-3.5 w-3.5" /> Delete
            </DropdownMenuItem>
        </DropdownMenuContent>
    </DropdownMenu>
</template>
