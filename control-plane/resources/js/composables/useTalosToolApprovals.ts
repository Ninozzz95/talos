import { ref, type Ref } from 'vue'
import { talosFetch } from '../lib/api'
import type { TalosPendingToolApproval } from '../lib/talosTypes'
import type { TalosChatProxyResponse } from './useTalosChat'

type ApiEnvelope<T> = { data: T }

const sha256Pattern = /^sha256:[a-f0-9]{64}$/
const unsafeFileNamePattern = /[\\/\u0000-\u001f\u007f]/

function record(value: unknown): Record<string, unknown> | null {
    return value && typeof value === 'object' && !Array.isArray(value)
        ? value as Record<string, unknown>
        : null
}

function requiredString(value: unknown) {
    return typeof value === 'string' && value.trim() ? value.trim() : null
}

function optionalString(value: unknown) {
    return value === null ? null : requiredString(value)
}

export function normalizePendingToolApprovals(value: unknown): TalosPendingToolApproval[] {
    if (!Array.isArray(value)) return []

    return value.flatMap((candidate) => {
        const data = record(candidate)
        const target = record(data?.target)
        const id = requiredString(data?.id)
        const turnId = requiredString(data?.turn_id)
        const runId = requiredString(data?.run_id)
        const planHash = requiredString(data?.plan_hash)
        const browserSessionId = requiredString(data?.browser_session_id)
        const snapshotArtifactId = requiredString(data?.snapshot_artifact_id)
        const snapshotId = requiredString(data?.snapshot_id)
        const evidenceHash = requiredString(data?.evidence_hash)
        const expectedEffect = requiredString(data?.expected_effect)
        const targetRef = requiredString(target?.ref)
        const targetRole = requiredString(target?.role)
        const targetName = requiredString(target?.name)
        const stateVersion = data?.state_version
        const status = data?.status
        const actionable = data?.actionable
        const staleReason = optionalString(data?.stale_reason)
        const url = optionalString(data?.url)
        const title = optionalString(data?.title)
        const isClick = data?.tool_name === 'browser_click'
            && data?.risk === 'high'
            && data?.capability === 'browser.write'
        const isUpload = data?.tool_name === 'browser_file_upload'
            && data?.risk === 'critical'
            && data?.capability === 'browser.upload'
        const rawFiles = Array.isArray(data?.files) ? data.files : []
        const files = rawFiles.flatMap((candidateFile) => {
            const file = record(candidateFile)
            const fileId = requiredString(file?.file_id)
            const name = requiredString(file?.name)
            const mimeType = requiredString(file?.mime_type)
            const sha256 = requiredString(file?.sha256)
            const sizeBytes = file?.size_bytes
            if (!fileId || !name || name === '.' || name === '..' || unsafeFileNamePattern.test(name)
                || !mimeType || !sha256 || !sha256Pattern.test(sha256)
                || !Number.isInteger(sizeBytes) || (sizeBytes as number) < 1) return []
            return [{ file_id: fileId, name, mime_type: mimeType, size_bytes: sizeBytes as number, sha256 }]
        })

        if (!id || !turnId || !runId || (!isClick && !isUpload)
            || (status !== 'pending' && status !== 'stale')
            || typeof actionable !== 'boolean'
            || (status === 'pending' && (!actionable || staleReason !== null))
            || (status === 'stale' && (actionable || !staleReason))
            || !planHash || !sha256Pattern.test(planHash)
            || !browserSessionId || !snapshotArtifactId || !snapshotId
            || !evidenceHash || !sha256Pattern.test(evidenceHash)
            || !Number.isInteger(stateVersion) || (stateVersion as number) < 0
            || !expectedEffect || !targetRef || !targetRole || !targetName
            || typeof target?.visible !== 'boolean'
            || (data?.url !== null && url === null)
            || (data?.title !== null && title === null)
            || (isUpload && status === 'pending' && rawFiles.length === 0)
            || (isUpload && rawFiles.length !== files.length)
            || (isClick && rawFiles.length > 0)) {
            return []
        }

        const base = {
            id,
            turn_id: turnId,
            run_id: runId,
            status,
            actionable,
            stale_reason: staleReason,
            plan_hash: planHash,
            browser_session_id: browserSessionId,
            snapshot_artifact_id: snapshotArtifactId,
            snapshot_id: snapshotId,
            state_version: stateVersion as number,
            evidence_hash: evidenceHash,
            expected_effect: expectedEffect,
            target: {
                ref: targetRef,
                role: targetRole,
                name: targetName,
                visible: target.visible,
            },
            url,
            title,
        }

        return isUpload
            ? [{ ...base, tool_name: 'browser_file_upload' as const, risk: 'critical' as const, capability: 'browser.upload' as const, files }]
            : [{ ...base, tool_name: 'browser_click' as const, risk: 'high' as const, capability: 'browser.write' as const }]
    })
}

export function useTalosToolApprovals(activeSessionId: Ref<string | null>) {
    const pendingApprovals = ref<TalosPendingToolApproval[]>([])
    const decidingApprovalIds = ref<string[]>([])
    const approvalError = ref<string | null>(null)
    let hydrationRevision = 0

    function replacePendingApprovals(value: unknown) {
        pendingApprovals.value = normalizePendingToolApprovals(value)
    }

    async function hydratePendingApprovals(sessionId = activeSessionId.value) {
        const revision = ++hydrationRevision
        approvalError.value = null
        if (!sessionId) {
            pendingApprovals.value = []
            return []
        }

        try {
            const response = await talosFetch<ApiEnvelope<unknown>>(`/api/talos/sessions/${encodeURIComponent(sessionId)}/pending-tool-approvals`)
            if (revision !== hydrationRevision || activeSessionId.value !== sessionId) return pendingApprovals.value
            replacePendingApprovals(response.data)
            return pendingApprovals.value
        } catch (error) {
            if (revision !== hydrationRevision || activeSessionId.value !== sessionId) return pendingApprovals.value
            pendingApprovals.value = []
            approvalError.value = error instanceof Error
                ? error.message
                : 'TALOS could not load pending browser approvals.'
            throw error
        }
    }

    async function decideToolApproval(approval: TalosPendingToolApproval, decision: 'approve' | 'reject') {
        const operationSessionId = activeSessionId.value
        if (!operationSessionId) {
            throw new Error('Select the chat that owns this browser approval before continuing.')
        }
        if (!approval.actionable || approval.status !== 'pending') {
            throw new Error('This browser approval is stale and cannot be executed.')
        }
        const current = pendingApprovals.value.find((candidate) => candidate.id === approval.id)
        if (!current || current.plan_hash !== approval.plan_hash || current.turn_id !== approval.turn_id) {
            throw new Error('This browser approval is no longer the active request.')
        }
        if (decidingApprovalIds.value.includes(approval.id)) {
            throw new Error('This browser approval is already being processed.')
        }

        decidingApprovalIds.value = [...decidingApprovalIds.value, approval.id]
        approvalError.value = null
        try {
            const response = await talosFetch<TalosChatProxyResponse>(
                `/api/talos/agent-turns/${encodeURIComponent(approval.turn_id)}/approvals/${encodeURIComponent(approval.id)}`,
                {
                    method: 'POST',
                    body: JSON.stringify({ decision, plan_hash: approval.plan_hash }),
                    validationMessage: 'TALOS could not apply this browser approval.',
                },
            )
            if (activeSessionId.value === operationSessionId) {
                replacePendingApprovals(response.pending_approvals ?? [])
            }
            return response
        } catch (error) {
            if (activeSessionId.value === operationSessionId) {
                approvalError.value = error instanceof Error
                    ? error.message
                    : 'TALOS could not apply this browser approval.'
            }
            throw error
        } finally {
            decidingApprovalIds.value = decidingApprovalIds.value.filter((id) => id !== approval.id)
        }
    }

    function clearPendingApprovals() {
        hydrationRevision += 1
        pendingApprovals.value = []
        decidingApprovalIds.value = []
        approvalError.value = null
    }

    return {
        pendingApprovals,
        decidingApprovalIds,
        approvalError,
        replacePendingApprovals,
        hydratePendingApprovals,
        decideToolApproval,
        clearPendingApprovals,
    }
}
