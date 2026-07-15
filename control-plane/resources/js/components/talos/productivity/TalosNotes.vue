<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { AlertCircle, Loader2, NotebookText, Plus, RefreshCw, ShieldAlert } from '@lucide/vue'
import Button from '../../ui/Button.vue'
import Badge from '../../ui/Badge.vue'
import Surface from '../../ui/Surface.vue'
import TalosGuideInfoButton from '../guide/TalosGuideInfoButton.vue'
import Field from '../../ui/Field.vue'
import Input from '../../ui/Input.vue'
import Textarea from '../../ui/Textarea.vue'
import { useTalosProductivity } from '../../../composables/useTalosProductivity'
import { resolveTalosCollectionState } from '../../../lib/talosCollectionState'

const {
    notes,
    noteRetrievalContext,
    loadingNotes,
    creatingNote,
    productivityError,
    loadNotes,
    createNote,
    loadNoteRetrievalContext,
} = useTalosProductivity()

const title = ref('')
const content = ref('')
const scopeId = ref('avm')
const actionError = ref<string | null>(null)
const notesRequested = ref(false)
const visibleError = computed(() => actionError.value || productivityError.value)
const notesState = computed(() => resolveTalosCollectionState({
    itemCount: notes.value.length,
    loading: loadingNotes.value,
    error: visibleError.value,
    requested: notesRequested.value,
}))
const canCreate = computed(() => title.value.trim().length > 0 && content.value.trim().length > 0 && !creatingNote.value)

async function refreshNotes() {
    notesRequested.value = true
    actionError.value = null

    try {
        await Promise.all([
            loadNotes(),
            loadNoteRetrievalContext('project', scopeId.value.trim() || 'avm'),
        ])
    } catch (error) {
        actionError.value = error instanceof Error ? error.message : 'TALOS could not refresh notes.'
    }
}

async function submitNote() {
    if (!canCreate.value) {
        return
    }

    actionError.value = null

    try {
        await createNote({
            title: title.value.trim(),
            content: content.value.trim(),
            scope_type: 'project',
            scope_id: scopeId.value.trim() || 'avm',
            metadata: { source: 'talos_notes_panel' },
        })
        title.value = ''
        content.value = ''
        await loadNoteRetrievalContext('project', scopeId.value.trim() || 'avm')
    } catch (error) {
        actionError.value = error instanceof Error ? error.message : 'TALOS could not create this note.'
    }
}

onMounted(() => {
    void refreshNotes()
})
</script>

<template>
    <Surface>
        <div class="border-b border-[var(--talos-border)] p-4">
            <div class="flex items-start justify-between gap-3">
                <div>
                    <div class="flex items-center gap-2 text-xs font-semibold uppercase text-[var(--talos-muted)]">
                        <NotebookText class="h-4 w-4 text-[var(--talos-accent)]" />
                        Notes
                    </div>
                    <div class="mt-1 flex items-center gap-1.5">
                        <h3 class="text-base font-semibold text-[var(--talos-text)]">Untrusted workspace notes</h3>
                        <TalosGuideInfoButton guide-id="rail.notes" compact side="bottom" />
                    </div>
                </div>
                <Button type="button" variant="ghost" size="sm" :disabled="loadingNotes" @click="refreshNotes">
                    <Loader2 v-if="loadingNotes" class="h-4 w-4 animate-spin" />
                    <RefreshCw v-else class="h-4 w-4" />
                    Sync
                </Button>
            </div>
        </div>

        <div class="space-y-4 p-4">
            <div v-if="visibleError" class="flex items-start gap-2 rounded-md border border-[var(--talos-warning-border)] bg-[var(--talos-warning-soft)] px-3 py-2 text-sm leading-6 text-[var(--talos-text)]">
                <AlertCircle class="mt-1 h-4 w-4 shrink-0 text-[var(--talos-warning)]" />
                <span>{{ visibleError }}</span>
            </div>

            <div class="rounded-md border border-[var(--talos-border)] bg-[var(--talos-panel-soft)] p-3">
                <div class="flex items-start gap-2 text-xs leading-5 text-[var(--talos-muted)]">
                    <ShieldAlert class="mt-0.5 h-4 w-4 shrink-0 text-[var(--talos-warning)]" />
                    <span>trust_level: {{ noteRetrievalContext?.trust_level ?? 'untrusted' }}. Notes cannot override policy or tools.</span>
                </div>
                <div class="mt-3 grid gap-2">
                    <Field id="talos-note-title" label="Note title" required>
                        <template #default="{ describedBy, invalid, required }">
                            <Input id="talos-note-title" v-model="title" :aria-describedby="describedBy" :aria-invalid="invalid" :required="required" placeholder="Note title" />
                        </template>
                    </Field>
                    <Field id="talos-note-content" label="Note content" required>
                        <template #default="{ describedBy, invalid, required }">
                            <Textarea id="talos-note-content" v-model="content" :aria-describedby="describedBy" :aria-invalid="invalid" :required="required" class="min-h-[76px]" placeholder="Note content" />
                        </template>
                    </Field>
                    <Button type="button" size="sm" :disabled="!canCreate" @click="submitNote">
                        <Loader2 v-if="creatingNote" class="h-4 w-4 animate-spin" />
                        <Plus v-else class="h-4 w-4" />
                        Add note
                    </Button>
                </div>
            </div>

            <div v-if="notesState === 'loading'" role="status" class="flex items-center gap-2 rounded-md border border-[var(--talos-border)] bg-[var(--talos-panel-soft)] px-3 py-4 text-sm text-[var(--talos-muted)]">
                <Loader2 class="h-4 w-4 animate-spin text-[var(--talos-accent)]" />
                Loading notes
            </div>

            <div v-if="notesState === 'empty'" class="rounded-md border border-[var(--talos-border)] bg-[var(--talos-panel-soft)] px-3 py-4 text-sm leading-6 text-[var(--talos-muted)]">
                No notes returned by `/api/talos/notes`.
            </div>

            <article v-for="note in notes" :key="note.id" class="rounded-md border border-[var(--talos-border)] bg-[var(--talos-panel-soft)] p-3">
                <div class="flex flex-wrap items-start justify-between gap-2">
                    <div class="min-w-0">
                        <div class="truncate text-sm font-semibold text-[var(--talos-text)]">{{ note.title }}</div>
                        <p class="mt-1 line-clamp-2 text-xs leading-5 text-[var(--talos-muted)]">{{ note.content_preview }}</p>
                    </div>
                    <Badge tone="warning">{{ note.trust_level }}</Badge>
                </div>
            </article>
        </div>
    </Surface>
</template>
