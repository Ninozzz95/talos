import { ref } from 'vue'
import { talosFetch } from '../lib/api'
import type {
    TalosCalendarDraft,
    TalosFile,
    TalosGoogleAccount,
    TalosGoogleCalendar,
    TalosGoogleCalendarListResponse,
    TalosGoogleCalendarSyncResponse,
    TalosGoogleDriveFile,
    TalosGoogleDriveFilesResponse,
} from '../lib/talosTypes'

type ApiEnvelope<T> = {
    data: T
}

function connectedAccountId(accounts: TalosGoogleAccount[], requestedAccountId?: string | null) {
    if (requestedAccountId) {
        return requestedAccountId
    }

    const account = accounts.find((item) => item.provider === 'google' && item.status === 'connected')

    if (!account) {
        throw new Error('Connect Google Workspace before using this action.')
    }

    return account.id
}

export function useTalosGoogle() {
    const accounts = ref<TalosGoogleAccount[]>([])
    const driveFiles = ref<TalosGoogleDriveFile[]>([])
    const calendars = ref<TalosGoogleCalendar[]>([])
    const loading = ref(false)
    const actionMessage = ref<string | null>(null)
    const errorMessage = ref<string | null>(null)

    function beginAction() {
        loading.value = true
        errorMessage.value = null
    }

    function fail(error: unknown, fallback: string) {
        errorMessage.value = error instanceof Error ? error.message : fallback
        throw error
    }

    async function loadAccounts() {
        beginAction()

        try {
            const response = await talosFetch<ApiEnvelope<TalosGoogleAccount[]>>('/api/talos/google/accounts')
            accounts.value = response.data
            return response.data
        } catch (error) {
            return fail(error, 'TALOS could not load Google accounts.')
        } finally {
            loading.value = false
        }
    }

    async function disconnectAccount(accountId: string) {
        beginAction()
        actionMessage.value = null

        try {
            const response = await talosFetch<ApiEnvelope<TalosGoogleAccount>>('/api/talos/google/disconnect', {
                method: 'POST',
                body: JSON.stringify({ account_id: accountId }),
                validationMessage: 'TALOS rejected this Google disconnect request.',
            })
            accounts.value = [
                response.data,
                ...accounts.value.filter((account) => account.id !== response.data.id),
            ]
            actionMessage.value = `${response.data.email ?? 'Google account'} disconnected.`
            return response.data
        } catch (error) {
            return fail(error, 'TALOS could not disconnect this Google account.')
        } finally {
            loading.value = false
        }
    }

    async function loadDriveFiles(accountId?: string | null) {
        beginAction()

        try {
            const resolvedAccountId = connectedAccountId(accounts.value, accountId)
            const params = new URLSearchParams({ account_id: resolvedAccountId })
            const response = await talosFetch<ApiEnvelope<TalosGoogleDriveFilesResponse>>(`/api/talos/google/drive/files?${params.toString()}`)
            driveFiles.value = response.data.files
            return response.data
        } catch (error) {
            return fail(error, 'TALOS could not load Google Drive files.')
        } finally {
            loading.value = false
        }
    }

    async function importDriveFile(fileId: string, accountId?: string | null) {
        beginAction()
        actionMessage.value = null

        try {
            const resolvedAccountId = connectedAccountId(accounts.value, accountId)
            const response = await talosFetch<ApiEnvelope<TalosFile>>('/api/talos/google/drive/import', {
                method: 'POST',
                body: JSON.stringify({
                    account_id: resolvedAccountId,
                    file_id: fileId,
                }),
                validationMessage: 'TALOS rejected this Google Drive import.',
            })
            actionMessage.value = `Imported ${response.data.original_name} into Context Vault.`
            return response.data
        } catch (error) {
            return fail(error, 'TALOS could not import this Google Drive file.')
        } finally {
            loading.value = false
        }
    }

    async function loadCalendars(accountId?: string | null) {
        beginAction()

        try {
            const resolvedAccountId = connectedAccountId(accounts.value, accountId)
            const params = new URLSearchParams({ account_id: resolvedAccountId })
            const response = await talosFetch<ApiEnvelope<TalosGoogleCalendarListResponse>>(`/api/talos/google/calendar/calendars?${params.toString()}`)
            calendars.value = response.data.calendars
            return response.data
        } catch (error) {
            return fail(error, 'TALOS could not load Google calendars.')
        } finally {
            loading.value = false
        }
    }

    async function syncCalendar(accountId?: string | null, calendarId?: string | null) {
        beginAction()
        actionMessage.value = null

        try {
            const resolvedAccountId = connectedAccountId(accounts.value, accountId)
            const response = await talosFetch<ApiEnvelope<TalosGoogleCalendarSyncResponse>>('/api/talos/google/calendar/sync', {
                method: 'POST',
                body: JSON.stringify({
                    account_id: resolvedAccountId,
                    ...(calendarId ? { calendar_id: calendarId } : {}),
                }),
                validationMessage: 'TALOS rejected this Google Calendar sync request.',
            })
            actionMessage.value = `Synced ${response.data.synced_count} Google Calendar event${response.data.synced_count === 1 ? '' : 's'}.`
            return response.data
        } catch (error) {
            return fail(error, 'TALOS could not sync Google Calendar.')
        } finally {
            loading.value = false
        }
    }

    async function publishCalendarDraft(draftId: string, accountId?: string | null, confirmed = false, calendarId?: string | null) {
        beginAction()
        actionMessage.value = null

        try {
            const resolvedAccountId = connectedAccountId(accounts.value, accountId)
            const response = await talosFetch<ApiEnvelope<TalosCalendarDraft>>(`/api/talos/google/calendar/drafts/${encodeURIComponent(draftId)}/publish`, {
                method: 'POST',
                body: JSON.stringify({
                    account_id: resolvedAccountId,
                    confirmed,
                    ...(calendarId ? { calendar_id: calendarId } : {}),
                }),
                validationMessage: 'TALOS rejected this Google Calendar publish request.',
            })
            actionMessage.value = `Published ${response.data.title} to Google Calendar.`
            return response.data
        } catch (error) {
            return fail(error, 'TALOS could not publish this calendar draft.')
        } finally {
            loading.value = false
        }
    }

    return {
        accounts,
        driveFiles,
        calendars,
        loading,
        actionMessage,
        errorMessage,
        loadAccounts,
        disconnectAccount,
        loadDriveFiles,
        importDriveFile,
        loadCalendars,
        syncCalendar,
        publishCalendarDraft,
    }
}
