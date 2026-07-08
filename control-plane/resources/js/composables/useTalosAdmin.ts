import { ref } from 'vue'
import { talosFetch } from '../lib/api'
import type {
    TalosAuditEvent,
    TalosBackupManifest,
    TalosDoctorReport,
    TalosPolicyStatus,
    TalosRestoreValidation,
} from '../lib/talosTypes'

type ApiEnvelope<T> = {
    data: T
}

function tokenHeaders(token: string) {
    return {
        'X-Talos-Api-Token': token,
    }
}

export function useTalosAdmin() {
    const doctorReport = ref<TalosDoctorReport | null>(null)
    const auditEvents = ref<TalosAuditEvent[]>([])
    const policyStatus = ref<TalosPolicyStatus | null>(null)
    const backupManifest = ref<TalosBackupManifest | null>(null)
    const restoreValidation = ref<TalosRestoreValidation | null>(null)
    const loadingAdmin = ref(false)
    const adminError = ref<string | null>(null)

    async function loadDoctor(token: string) {
        loadingAdmin.value = true
        adminError.value = null

        try {
            doctorReport.value = await talosFetch<TalosDoctorReport>('/api/talos/admin/doctor', {
                headers: tokenHeaders(token),
            })
            return doctorReport.value
        } catch (error) {
            adminError.value = error instanceof Error ? error.message : 'TALOS could not load doctor status.'
            throw error
        } finally {
            loadingAdmin.value = false
        }
    }

    async function loadAuditEvents(token: string, eventType = '') {
        loadingAdmin.value = true
        adminError.value = null
        const params = new URLSearchParams()
        if (eventType.trim()) {
            params.set('event_type', eventType.trim())
        }

        try {
            const response = await talosFetch<ApiEnvelope<TalosAuditEvent[]>>(`/api/talos/admin/audit-events?${params.toString()}`, {
                headers: tokenHeaders(token),
            })
            auditEvents.value = response.data
            return response.data
        } catch (error) {
            adminError.value = error instanceof Error ? error.message : 'TALOS could not load audit events.'
            throw error
        } finally {
            loadingAdmin.value = false
        }
    }

    async function loadPolicy(token: string) {
        loadingAdmin.value = true
        adminError.value = null

        try {
            const response = await talosFetch<ApiEnvelope<TalosPolicyStatus>>('/api/talos/admin/policy', {
                headers: tokenHeaders(token),
            })
            policyStatus.value = response.data
            return response.data
        } catch (error) {
            adminError.value = error instanceof Error ? error.message : 'TALOS could not load policy status.'
            throw error
        } finally {
            loadingAdmin.value = false
        }
    }

    async function loadBackupManifest(token: string) {
        loadingAdmin.value = true
        adminError.value = null

        try {
            backupManifest.value = await talosFetch<TalosBackupManifest>('/api/talos/admin/backup/manifest', {
                headers: tokenHeaders(token),
            })
            return backupManifest.value
        } catch (error) {
            adminError.value = error instanceof Error ? error.message : 'TALOS could not load backup manifest.'
            throw error
        } finally {
            loadingAdmin.value = false
        }
    }

    async function validateRestore(token: string, manifest: TalosBackupManifest) {
        loadingAdmin.value = true
        adminError.value = null

        try {
            const response = await talosFetch<ApiEnvelope<TalosRestoreValidation>>('/api/talos/admin/backup/validate-restore', {
                method: 'POST',
                headers: tokenHeaders(token),
                body: JSON.stringify({
                    schema_version: manifest.schema_version,
                    dry_run: true,
                    domains: manifest.domains,
                }),
                validationMessage: 'TALOS rejected this backup restore manifest.',
            })
            restoreValidation.value = response.data
            return response.data
        } catch (error) {
            adminError.value = error instanceof Error ? error.message : 'TALOS could not validate backup restore.'
            throw error
        } finally {
            loadingAdmin.value = false
        }
    }

    return {
        doctorReport,
        auditEvents,
        policyStatus,
        backupManifest,
        restoreValidation,
        loadingAdmin,
        adminError,
        loadDoctor,
        loadAuditEvents,
        loadPolicy,
        loadBackupManifest,
        validateRestore,
    }
}
