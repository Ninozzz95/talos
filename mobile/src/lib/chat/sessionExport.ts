import { sha256 } from 'js-sha256'
import { talosMessageReasoning } from '@/lib/chat/messageReasoning'
import type {
    TalosChatAttachmentBinding,
    TalosLocalChatMessage,
    TalosLocalChatSession,
    TalosLocalToolActivity,
} from '@/repositories/chatRepository'

/**
 * F4-#16 — desktop-parity chat export, generated LOCALLY. The desktop control
 * plane's TalosSessionExportService is the reference contract: same
 * report_type strings, same format set, same redaction rule (context
 * provenance carries names + hashes, NEVER storage paths). Mobile has no runs
 * table — tool activities (browser evidence contracts) are its execution
 * record, and benchmark readiness derives from the last completed
 * user→assistant exchange.
 */
export const TALOS_MOBILE_EXPORT_FORMATS = ['json', 'markdown', 'context_manifest', 'benchmark_scenario'] as const
export type TalosMobileSessionExportFormat = typeof TALOS_MOBILE_EXPORT_FORMATS[number]

export interface TalosMobileExportAttachment extends TalosChatAttachmentBinding {
    sha256?: string | null
}

export interface TalosMobileSessionExportInput {
    session: TalosLocalChatSession
    messages: TalosLocalChatMessage[]
    activities: TalosLocalToolActivity[]
    attachments: TalosMobileExportAttachment[]
    exported_at: string
}

export interface TalosMobileBenchmarkReadiness {
    ready: boolean
    missing: string[]
    scenario?: {
        schema_version: 1
        scenario_type: 'talos_session_benchmark_scenario'
        session_id: string
        source_message_id: string
        prompt: string
        prompt_hash: string
        context_hash: string
        model: string | null
        provider: string | null
    }
}

interface TalosMobileContextManifest {
    context_sets: Array<{
        message_id: string
        sources: Array<{
            file: {
                original_name: string
                media_type: string
                size_bytes: number
                sha256: string | null
            }
            permissions: string[]
            grant_status: string
        }>
    }>
}

function sessionPayload(session: TalosLocalChatSession) {
    return {
        id: session.id,
        title: session.title,
        surface: session.surface,
        mode: session.mode,
        persistence_mode: session.persistence_mode,
        active_model_profile_id: session.active_model_profile_id,
        created_at: session.created_at,
        updated_at: session.updated_at,
    }
}

function messagePayload(message: TalosLocalChatMessage) {
    const reasoning = talosMessageReasoning(message.metadata)
    return {
        id: message.id,
        role: message.role,
        content: message.content,
        state: message.state,
        model_profile_id: message.model_profile_id,
        ordinal: message.ordinal,
        created_at: message.created_at,
        // Defect #5 (owner decision): the reasoning is persisted WITH the
        // message, so an export that dropped it would be an export of half the
        // record — and the trace is the part that explains the answer.
        ...(reasoning ? { reasoning } : {}),
    }
}

function activityPayload(activity: TalosLocalToolActivity) {
    return {
        id: activity.id,
        message_id: activity.message_id,
        operation: activity.operation,
        status: activity.status,
        evidence: activity.evidence,
        created_at: activity.created_at,
        updated_at: activity.updated_at,
    }
}

function contextManifest(input: TalosMobileSessionExportInput): TalosMobileContextManifest {
    const byMessage = new Map<string, TalosMobileExportAttachment[]>()
    for (const attachment of input.attachments) {
        const list = byMessage.get(attachment.message_id) ?? []
        list.push(attachment)
        byMessage.set(attachment.message_id, list)
    }
    return {
        context_sets: [...byMessage.entries()].map(([messageId, list]) => ({
            message_id: messageId,
            sources: list.map((attachment) => ({
                file: {
                    original_name: attachment.display_name,
                    media_type: attachment.media_type,
                    size_bytes: attachment.size_bytes,
                    sha256: attachment.sha256 ?? null,
                },
                permissions: attachment.permissions,
                grant_status: attachment.grant_status,
            })),
        })),
    }
}

function markdownTranscript(input: TalosMobileSessionExportInput): string {
    const lines = [
        '# TALOS Session Export',
        '',
        `- Session ID: ${input.session.id}`,
        `- Title: ${input.session.title}`,
        `- Exported at: ${input.exported_at}`,
        '',
        '## Messages',
    ]
    for (const message of input.messages) {
        lines.push('', `### ${message.role.toUpperCase()} - ${message.created_at}`, '', message.content)
        const reasoning = talosMessageReasoning(message.metadata)?.trim() ?? ''
        if (reasoning) {
            // Quoted, and after the answer: in a document the conclusion leads
            // and the working is shown below it.
            lines.push('', '> **Reasoning**', ...reasoning.split(/\r?\n/).map((line) => `> ${line}`))
        }
    }
    return `${lines.join('\n')}\n`
}

function splitProfileId(profileId: string | null): { provider: string | null; model: string | null } {
    if (!profileId) return { provider: null, model: null }
    const separator = profileId.indexOf(':')
    if (separator <= 0) return { provider: null, model: profileId }
    return { provider: profileId.slice(0, separator), model: profileId.slice(separator + 1) }
}

export function buildTalosMobileBenchmarkReadiness(
    input: TalosMobileSessionExportInput,
): TalosMobileBenchmarkReadiness {
    const reply = [...input.messages].reverse()
        .find((message) => message.role === 'assistant' && message.state === 'persisted')
    const prompt = reply
        ? [...input.messages].reverse()
            .find((message) => message.role === 'user' && message.ordinal < reply.ordinal)
        : undefined

    const missing: string[] = []
    if (!reply) missing.push('assistant_reply')
    if (!prompt) missing.push('prompt')
    if (missing.length > 0 || !reply || !prompt) return { ready: false, missing }

    const contextSources = contextManifest(input).context_sets
        .flatMap((set) => set.sources.map((source) => source.file.sha256 ?? source.file.original_name))
    const { provider, model } = splitProfileId(
        reply.model_profile_id ?? input.session.active_model_profile_id,
    )
    return {
        ready: true,
        missing: [],
        scenario: {
            schema_version: 1,
            scenario_type: 'talos_session_benchmark_scenario',
            session_id: input.session.id,
            source_message_id: reply.id,
            prompt: prompt.content,
            prompt_hash: sha256(prompt.content),
            context_hash: sha256(JSON.stringify(contextSources)),
            model,
            provider,
        },
    }
}

export function buildTalosMobileEvidencePack(input: TalosMobileSessionExportInput) {
    return {
        schema_version: 1 as const,
        report_type: 'talos_session_export' as const,
        export_status: 'complete' as const,
        exported_at: input.exported_at,
        available_formats: [...TALOS_MOBILE_EXPORT_FORMATS],
        session: sessionPayload(input.session),
        messages: input.messages.map(messagePayload),
        tool_activities: input.activities.map(activityPayload),
        context_manifest: contextManifest(input),
        benchmark_readiness: buildTalosMobileBenchmarkReadiness(input),
        markdown_transcript: markdownTranscript(input),
    }
}

export function buildTalosMobileMarkdownExport(input: TalosMobileSessionExportInput) {
    return {
        schema_version: 1 as const,
        report_type: 'talos_session_markdown_export' as const,
        export_status: 'complete' as const,
        content_type: 'text/markdown' as const,
        session_id: input.session.id,
        exported_at: input.exported_at,
        content: markdownTranscript(input),
    }
}

export function buildTalosMobileContextManifestExport(input: TalosMobileSessionExportInput) {
    return {
        schema_version: 1 as const,
        report_type: 'talos_context_manifest_export' as const,
        export_status: 'complete' as const,
        session_id: input.session.id,
        exported_at: input.exported_at,
        context_manifest: contextManifest(input),
    }
}

export function buildTalosMobileBenchmarkScenarioExport(input: TalosMobileSessionExportInput) {
    const readiness = buildTalosMobileBenchmarkReadiness(input)
    return {
        schema_version: 1 as const,
        report_type: 'talos_benchmark_scenario_export' as const,
        export_status: readiness.ready ? ('complete' as const) : ('blocked' as const),
        session_id: input.session.id,
        exported_at: input.exported_at,
        benchmark_readiness: readiness,
    }
}
