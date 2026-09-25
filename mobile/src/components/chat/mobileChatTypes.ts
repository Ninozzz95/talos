export type TalosMobileProviderId =
    | 'anthropic'
    | 'deepseek'
    | 'gemini'
    /**
     * The engine on this device. A provider like any other on purpose: the
     * model picker, the send path, the tool gate and the receipts all work
     * because everything that answers a message answers through one contract.
     * A local engine wired in beside that contract would be a second send path,
     * and every feature would then have to be written twice.
     *
     * It is the one provider with no key and no endpoint, because there is
     * nothing to reach.
     */
    | 'local'
    | 'ollama'
    | 'openai'
    | 'openrouter'

export type TalosMobileModelStatus =
    | 'untested'
    | 'healthy'
    | 'degraded'
    | 'failed'
    | 'disabled'

export interface TalosMobileModelProfileView {
    id: string
    provider: TalosMobileProviderId
    model: string
    display_name: string
    status: TalosMobileModelStatus
    has_secret: boolean
    effort_levels: string[]
    supports_thinking: boolean
    /** RAG-OBB (24/09/2026): il catalogo dice che il ragionamento non si spegne ⇒ niente «off» nel menu. */
    reasoning_mandatory?: boolean
    /** RAG-EST (24/09/2026): «Ragionamento esteso» governa qualcosa solo se il fornitore lo legge. */
    thinking_toggle?: boolean
    show_in_composer: boolean
    capabilities: Record<string, unknown> | null
    probe_ok: boolean | null
}

export type TalosMobileRoutingProfileStatus = 'enabled' | 'disabled' | 'degraded'

export interface TalosMobileRoutingProfileView {
    id: string
    name: string
    status: TalosMobileRoutingProfileStatus
    lane_count: number
}

// Debt A1: 'tool' is renderable now — it was persistable but collapsed to
// 'system', which made a tool loop impossible to show.
export type TalosMobileMessageRole = 'user' | 'assistant' | 'system' | 'tool'
export type TalosMobileMessageState = 'persisted' | 'pending' | 'failed'

export interface TalosMobileMessageView {
    id: string
    /** Defect #4: the keyset cursor for loading the page above this one. */
    ordinal?: number
    role: TalosMobileMessageRole
    content: string
    created_at: string
    state: TalosMobileMessageState
    model_profile_id: string | null
    run_id: string | null
    metadata: Record<string, unknown>
    /**
     * Canonical display projection of persisted provider reasoning.
     * Store-produced views always set it; optional keeps direct fixture and
     * extension consumers source-compatible while they migrate.
     */
    reasoning?: string | null
    attachments?: readonly TalosMobileMessageAttachmentView[]
    browserActivities?: readonly TalosMobileBrowserActivityView[]
    /**
     * GESTITA-01 (25/09/2026): per una risposta sospesa su una richiesta di permesso, l'esito di ogni strumento, letto
     * dall'attività `tool.authorization` (`lib/chat/esitoAutorizzazione.ts`). Assente finché la richiesta aspetta.
     */
    authorizationOutcome?: readonly { readonly tool: string, readonly concesso: boolean }[]
}

export interface TalosMobileBrowserActivityView {
    id: string
    operation: string
    status: 'pending' | 'succeeded' | 'failed' | 'cancelled' | 'recovery_required'
    occurred_at: string
    evidence: TalosMobileBrowserEvidenceEnvelope | null
    failure_code: 'TALOS_BROWSER_EVIDENCE_INVALID' | null
}

export interface TalosMobileMessageAttachmentView {
    id: string
    vault_file_id: string
    grant_id: string
    display_name: string
    media_type: string
    size_bytes: number
    permissions: readonly ('model.read' | 'browser.upload')[]
    grant_status: 'active' | 'revoked'
}
import type { TalosMobileBrowserEvidenceEnvelope } from '@/lib/browser/browserContracts'
