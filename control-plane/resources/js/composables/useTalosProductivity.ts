import { ref } from 'vue'
import { talosFetch } from '../lib/api'
import type { TalosCalendarDraft, TalosNote, TalosNoteRetrievalContext, TalosTask } from '../lib/talosTypes'

type ApiEnvelope<T> = {
    data: T
}

export type TalosCreateNoteInput = {
    run_id?: string | null
    scope_type?: 'global' | 'project' | 'session' | string
    scope_id?: string | null
    title: string
    content: string
    metadata?: Record<string, unknown> | null
}

export type TalosCreateTaskInput = {
    run_id?: string | null
    title: string
    description?: string | null
    status?: string | null
    priority?: string | null
    due_at?: string | null
    metadata?: Record<string, unknown> | null
}

export type TalosCreateCalendarDraftInput = {
    run_id?: string | null
    title: string
    description?: string | null
    starts_at: string
    ends_at: string
    timezone?: string | null
    attendees?: string[]
    metadata?: Record<string, unknown> | null
}

export function useTalosProductivity() {
    const notes = ref<TalosNote[]>([])
    const noteRetrievalContext = ref<TalosNoteRetrievalContext | null>(null)
    const tasks = ref<TalosTask[]>([])
    const calendarDrafts = ref<TalosCalendarDraft[]>([])
    const loadingNotes = ref(false)
    const loadingTasks = ref(false)
    const loadingCalendarDrafts = ref(false)
    const creatingNote = ref(false)
    const creatingTask = ref(false)
    const creatingCalendarDraft = ref(false)
    const confirmingCalendarDraftId = ref<string | null>(null)
    const productivityError = ref<string | null>(null)

    async function loadNotes() {
        loadingNotes.value = true
        productivityError.value = null

        try {
            const response = await talosFetch<ApiEnvelope<TalosNote[]>>('/api/talos/notes')
            notes.value = response.data
            return response.data
        } catch (error) {
            productivityError.value = error instanceof Error ? error.message : 'TALOS could not load notes.'
            throw error
        } finally {
            loadingNotes.value = false
        }
    }

    async function createNote(input: TalosCreateNoteInput) {
        creatingNote.value = true
        productivityError.value = null

        try {
            const response = await talosFetch<ApiEnvelope<TalosNote>>('/api/talos/notes', {
                method: 'POST',
                body: JSON.stringify(input),
                validationMessage: 'TALOS rejected this note.',
            })
            notes.value = [response.data, ...notes.value.filter((note) => note.id !== response.data.id)]
            return response.data
        } catch (error) {
            productivityError.value = error instanceof Error ? error.message : 'TALOS could not create this note.'
            throw error
        } finally {
            creatingNote.value = false
        }
    }

    async function loadNoteRetrievalContext(scopeType = 'global', scopeId: string | null = null) {
        loadingNotes.value = true
        productivityError.value = null
        const params = new URLSearchParams({ scope_type: scopeType })
        if (scopeId) {
            params.set('scope_id', scopeId)
        }

        try {
            const response = await talosFetch<TalosNoteRetrievalContext>(`/api/talos/notes/retrieval-context?${params.toString()}`)
            noteRetrievalContext.value = response
            return response
        } catch (error) {
            productivityError.value = error instanceof Error ? error.message : 'TALOS could not load note context.'
            throw error
        } finally {
            loadingNotes.value = false
        }
    }

    async function loadTasks() {
        loadingTasks.value = true
        productivityError.value = null

        try {
            const response = await talosFetch<ApiEnvelope<TalosTask[]>>('/api/talos/tasks')
            tasks.value = response.data
            return response.data
        } catch (error) {
            productivityError.value = error instanceof Error ? error.message : 'TALOS could not load tasks.'
            throw error
        } finally {
            loadingTasks.value = false
        }
    }

    async function createTask(input: TalosCreateTaskInput) {
        creatingTask.value = true
        productivityError.value = null

        try {
            const response = await talosFetch<ApiEnvelope<TalosTask>>('/api/talos/tasks', {
                method: 'POST',
                body: JSON.stringify(input),
                validationMessage: 'TALOS rejected this task.',
            })
            tasks.value = [response.data, ...tasks.value.filter((task) => task.id !== response.data.id)]
            return response.data
        } catch (error) {
            productivityError.value = error instanceof Error ? error.message : 'TALOS could not create this task.'
            throw error
        } finally {
            creatingTask.value = false
        }
    }

    async function loadCalendarDrafts() {
        loadingCalendarDrafts.value = true
        productivityError.value = null

        try {
            const response = await talosFetch<ApiEnvelope<TalosCalendarDraft[]>>('/api/talos/calendar-drafts')
            calendarDrafts.value = response.data
            return response.data
        } catch (error) {
            productivityError.value = error instanceof Error ? error.message : 'TALOS could not load calendar drafts.'
            throw error
        } finally {
            loadingCalendarDrafts.value = false
        }
    }

    async function createCalendarDraft(input: TalosCreateCalendarDraftInput) {
        creatingCalendarDraft.value = true
        productivityError.value = null

        try {
            const response = await talosFetch<ApiEnvelope<TalosCalendarDraft>>('/api/talos/calendar-drafts', {
                method: 'POST',
                body: JSON.stringify(input),
                validationMessage: 'TALOS rejected this calendar draft.',
            })
            calendarDrafts.value = [response.data, ...calendarDrafts.value.filter((draft) => draft.id !== response.data.id)]
            return response.data
        } catch (error) {
            productivityError.value = error instanceof Error ? error.message : 'TALOS could not create this calendar draft.'
            throw error
        } finally {
            creatingCalendarDraft.value = false
        }
    }

    async function confirmCalendarDraft(draftId: string) {
        confirmingCalendarDraftId.value = draftId
        productivityError.value = null

        try {
            const response = await talosFetch<ApiEnvelope<TalosCalendarDraft>>(`/api/talos/calendar-drafts/${draftId}/confirm`, {
                method: 'POST',
                validationMessage: 'TALOS rejected this calendar confirmation.',
            })
            calendarDrafts.value = [response.data, ...calendarDrafts.value.filter((draft) => draft.id !== response.data.id)]
            return response.data
        } catch (error) {
            productivityError.value = error instanceof Error ? error.message : 'TALOS could not confirm this calendar draft.'
            throw error
        } finally {
            confirmingCalendarDraftId.value = null
        }
    }

    return {
        notes,
        noteRetrievalContext,
        tasks,
        calendarDrafts,
        loadingNotes,
        loadingTasks,
        loadingCalendarDrafts,
        creatingNote,
        creatingTask,
        creatingCalendarDraft,
        confirmingCalendarDraftId,
        productivityError,
        loadNotes,
        createNote,
        loadNoteRetrievalContext,
        loadTasks,
        createTask,
        loadCalendarDrafts,
        createCalendarDraft,
        confirmCalendarDraft,
    }
}
