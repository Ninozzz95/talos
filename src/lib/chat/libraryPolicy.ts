import {
    selectLibraryDocsForInjection,
    selectRelevantLibraryDocsForInjection,
    type LibraryDoc,
    type LibraryInjectionOptions,
    type RelevantLibraryInjectionOptions,
} from '@/lib/chat/libraryContext'
import {
    normalizeTalosLibrarySearchText,
    talosLibrarySearchTerms,
} from '@/lib/librarySearchText'

export const TALOS_LIBRARY_CONTEXT_MODES = [
    'broad_compat_v1',
    'smart_relevant_v1',
    'ask_before_use_v1',
    'agentic_on_demand_v1',
] as const

export type TalosLibraryContextMode = typeof TALOS_LIBRARY_CONTEXT_MODES[number]

export interface TalosLibraryContextPolicyV1 {
    schema_version: 1
    revision: number
    enabled: boolean
    mode: TalosLibraryContextMode
    included_file_ids: string[]
    excluded_file_ids: string[]
    updated_at: string | null
}

export interface TalosSessionLibraryContextPolicyV1 {
    schema_version: 1
    revision: number
    enabled: boolean | null
    mode: TalosLibraryContextMode | null
    included_file_ids: string[]
    excluded_file_ids: string[]
    updated_at: string | null
}

export interface TalosLibraryContextPolicyPatch {
    enabled?: boolean
    mode?: TalosLibraryContextMode
    included_file_ids?: readonly string[]
    excluded_file_ids?: readonly string[]
}

export interface TalosSessionLibraryContextPolicyPatch {
    enabled?: boolean | null
    mode?: TalosLibraryContextMode | null
    included_file_ids?: readonly string[]
    excluded_file_ids?: readonly string[]
}

export interface TalosLibraryTurnOverride {
    enabled?: boolean
    mode?: TalosLibraryContextMode
    included_file_ids?: readonly string[]
    excluded_file_ids?: readonly string[]
    /** One-turn affirmative result from the explicit ask-before-use surface. */
    consent_granted?: boolean
}

export interface TalosEffectiveLibraryContextPolicy {
    enabled: boolean
    mode: TalosLibraryContextMode
    included_file_ids: readonly string[]
    excluded_file_ids: readonly string[]
    global_revision: number
    session_revision: number
    source: 'legacy' | 'global' | 'session' | 'turn'
}

export interface TalosLibraryPolicyReceipt {
    schema_version: 1
    mode: TalosLibraryContextMode
    candidate_file_ids: string[]
    transmitted_file_ids: string[]
    excluded_file_ids: string[]
    reason:
        | 'disabled'
        | 'broad_compat'
        | 'smart_relevant'
        | 'awaiting_consent'
        | 'consent_granted'
        | 'agentic_on_demand'
}

export interface TalosLibraryDocumentRelevance {
    file_id: string
    lexical_score: number
}

export interface TalosLibraryAnswerGuardTrace {
    contract: 'talos.library-answer-guard/1'
    outcome: 'corrected' | 'abstained'
    correction_attempts: 1
    first_draft_score: number
    correction_score: number
}

export interface TalosLibraryContextDecision {
    policy: TalosEffectiveLibraryContextPolicy
    candidates: LibraryDoc[]
    transmitted: LibraryDoc[]
    /** Optional only for durable checkpoints created before R8-E. */
    document_relevance?: TalosLibraryDocumentRelevance[]
    requires_consent: boolean
    receipt: TalosLibraryPolicyReceipt
}

export class TalosLibraryPolicyConflictError extends Error {
    readonly expectedRevision: number
    readonly actualRevision: number

    constructor(expectedRevision: number, actualRevision: number) {
        super(`TALOS_LIBRARY_POLICY_REVISION_CONFLICT:${expectedRevision}:${actualRevision}`)
        this.name = 'TalosLibraryPolicyConflictError'
        this.expectedRevision = expectedRevision
        this.actualRevision = actualRevision
    }
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isMode(value: unknown): value is TalosLibraryContextMode {
    return typeof value === 'string'
        && (TALOS_LIBRARY_CONTEXT_MODES as readonly string[]).includes(value)
}

function revisionOf(value: unknown): number {
    return typeof value === 'number'
        && Number.isSafeInteger(value)
        && value >= 0
        && value <= Number.MAX_SAFE_INTEGER
        ? value
        : 0
}

function timestampOf(value: unknown): string | null {
    return typeof value === 'string' && value.length > 0 && value.length <= 64
        ? value
        : null
}

function fileIds(value: unknown): string[] {
    if (!Array.isArray(value)) return []
    const ids: string[] = []
    const seen = new Set<string>()
    for (const candidate of value) {
        if (typeof candidate !== 'string') continue
        const id = candidate.trim()
        if (id === '' || id.length > 512 || seen.has(id)) continue
        seen.add(id)
        ids.push(id)
        if (ids.length >= 256) break
    }
    return ids
}

function scopeIds(
    includedValue: unknown,
    excludedValue: unknown,
): { included: string[]; excluded: string[] } {
    const excluded = fileIds(excludedValue)
    const blocked = new Set(excluded)
    return {
        included: fileIds(includedValue).filter((id) => !blocked.has(id)),
        excluded,
    }
}

function disabledPolicy(revision: number, updatedAt: string | null): TalosLibraryContextPolicyV1 {
    return {
        schema_version: 1,
        revision,
        enabled: false,
        mode: 'broad_compat_v1',
        included_file_ids: [],
        excluded_file_ids: [],
        updated_at: updatedAt,
    }
}

export function parseTalosLibraryContextPolicy(
    value: unknown,
): TalosLibraryContextPolicyV1 | null {
    if (value === undefined || value === null) return null
    if (!isRecord(value)) return disabledPolicy(0, null)
    const revision = revisionOf(value.revision)
    const updatedAt = timestampOf(value.updated_at)
    if (
        value.schema_version !== 1
        || typeof value.enabled !== 'boolean'
        || !isMode(value.mode)
    ) {
        return disabledPolicy(revision, updatedAt)
    }
    const ids = scopeIds(value.included_file_ids, value.excluded_file_ids)
    return {
        schema_version: 1,
        revision,
        enabled: value.enabled,
        mode: value.mode,
        included_file_ids: ids.included,
        excluded_file_ids: ids.excluded,
        updated_at: updatedAt,
    }
}

export function parseTalosSessionLibraryContextPolicy(
    value: unknown,
): TalosSessionLibraryContextPolicyV1 | null {
    if (value === undefined || value === null) return null
    if (!isRecord(value)) {
        return {
            schema_version: 1,
            revision: 0,
            enabled: false,
            mode: 'broad_compat_v1',
            included_file_ids: [],
            excluded_file_ids: [],
            updated_at: null,
        }
    }
    const enabled = value.enabled === null || value.enabled === undefined
        ? null
        : typeof value.enabled === 'boolean' ? value.enabled : false
    const mode = value.mode === null || value.mode === undefined
        ? null
        : isMode(value.mode) ? value.mode : 'broad_compat_v1'
    const valid = value.schema_version === 1
        && (value.mode === null || value.mode === undefined || isMode(value.mode))
        && (
            value.enabled === null
            || value.enabled === undefined
            || typeof value.enabled === 'boolean'
        )
    const ids = scopeIds(value.included_file_ids, value.excluded_file_ids)
    return {
        schema_version: 1,
        revision: revisionOf(value.revision),
        enabled: valid ? enabled : false,
        mode: valid ? mode : 'broad_compat_v1',
        included_file_ids: valid ? ids.included : [],
        excluded_file_ids: valid ? ids.excluded : [],
        updated_at: timestampOf(value.updated_at),
    }
}

function appendUnique(target: string[], values: readonly string[]): void {
    const seen = new Set(target)
    for (const value of values) {
        if (seen.has(value)) continue
        seen.add(value)
        target.push(value)
    }
}

export function resolveTalosLibraryContextPolicy(input: {
    legacy_enabled: boolean
    global_policy?: TalosLibraryContextPolicyV1 | null
    session_policy?: TalosSessionLibraryContextPolicyV1 | null
    turn_override?: TalosLibraryTurnOverride | null
}): TalosEffectiveLibraryContextPolicy {
    const global = input.global_policy ?? null
    const session = input.session_policy ?? null
    const turn = input.turn_override ?? null
    let enabled = global?.enabled ?? input.legacy_enabled
    let mode = global?.mode ?? 'broad_compat_v1'
    let source: TalosEffectiveLibraryContextPolicy['source'] = global ? 'global' : 'legacy'
    const included: string[] = []
    const excluded: string[] = []
    if (global) {
        appendUnique(included, global.included_file_ids)
        appendUnique(excluded, global.excluded_file_ids)
    }
    if (session) {
        if (session.enabled !== null) enabled = session.enabled
        if (session.mode !== null) mode = session.mode
        appendUnique(included, session.included_file_ids)
        appendUnique(excluded, session.excluded_file_ids)
        source = 'session'
    }
    if (turn) {
        if (typeof turn.enabled === 'boolean') enabled = turn.enabled
        if (turn.mode) mode = turn.mode
        appendUnique(included, fileIds(turn.included_file_ids))
        appendUnique(excluded, fileIds(turn.excluded_file_ids))
        source = 'turn'
    }
    const blocked = new Set(excluded)
    return {
        enabled,
        mode,
        included_file_ids: included.filter((id) => !blocked.has(id)),
        excluded_file_ids: excluded,
        global_revision: global?.revision ?? 0,
        session_revision: session?.revision ?? 0,
        source,
    }
}

export function applyTalosLibraryContextPolicyPatch(
    current: TalosLibraryContextPolicyV1,
    patch: TalosLibraryContextPolicyPatch,
    expectedRevision: number,
    updatedAt: string,
): TalosLibraryContextPolicyV1 {
    if (expectedRevision !== current.revision) {
        throw new TalosLibraryPolicyConflictError(expectedRevision, current.revision)
    }
    const excluded = patch.excluded_file_ids === undefined
        ? [...current.excluded_file_ids]
        : fileIds(patch.excluded_file_ids)
    const blocked = new Set(excluded)
    const included = (
        patch.included_file_ids === undefined
            ? [...current.included_file_ids]
            : fileIds(patch.included_file_ids)
    ).filter((id) => !blocked.has(id))
    return {
        schema_version: 1,
        revision: current.revision + 1,
        enabled: patch.enabled ?? current.enabled,
        mode: patch.mode ?? current.mode,
        included_file_ids: included,
        excluded_file_ids: excluded,
        updated_at: updatedAt,
    }
}

export function applyTalosSessionLibraryContextPolicyPatch(
    current: TalosSessionLibraryContextPolicyV1,
    patch: TalosSessionLibraryContextPolicyPatch,
    expectedRevision: number,
    updatedAt: string,
): TalosSessionLibraryContextPolicyV1 {
    if (expectedRevision !== current.revision) {
        throw new TalosLibraryPolicyConflictError(expectedRevision, current.revision)
    }
    const excluded = patch.excluded_file_ids === undefined
        ? [...current.excluded_file_ids]
        : fileIds(patch.excluded_file_ids)
    const blocked = new Set(excluded)
    const included = (
        patch.included_file_ids === undefined
            ? [...current.included_file_ids]
            : fileIds(patch.included_file_ids)
    ).filter((id) => !blocked.has(id))
    return {
        schema_version: 1,
        revision: current.revision + 1,
        enabled: patch.enabled === undefined ? current.enabled : patch.enabled,
        mode: patch.mode === undefined ? current.mode : patch.mode,
        included_file_ids: included,
        excluded_file_ids: excluded,
        updated_at: updatedAt,
    }
}

export function buildTalosLibraryTopicAnchor(
    history: readonly { role: string; content: string }[],
    currentQuery: string,
): string {
    const current = currentQuery.trim().slice(0, 800)
    const prior = history
        .filter((turn) => turn.role === 'user')
        .map((turn) => turn.content.trim())
        .filter((content) => content !== '' && content !== current)
        .slice(-3)
        .map((content) => content.slice(0, 600))
    if (prior.length === 0) return current
    return `${current}\n${prior.join('\n')}`.slice(0, 1_600)
}

const ANSWER_STOPWORDS = new Set([
    'a', 'about', 'an', 'and', 'are', 'at', 'explain', 'in', 'is', 'it', 'me', 'of', 'on',
    'one', 'please', 'second', 'tell', 'that', 'the', 'this', 'to', 'what', 'which', 'yes',
    'che', 'con', 'da', 'di', 'e', 'gli', 'il', 'la', 'mi', 'nel', 'per', 'poi', 'quella',
    'quello', 'secondo', 'si', 'sì', 'spiegami', 'parlami', 'un', 'una',
    'ce', 'celui-ci', 'de', 'des', 'du', 'en', 'et', 'explique', 'la', 'le', 'les', 'moi',
    'oui', 'un', 'une',
])
const LEXICAL_EDGE_PUNCTUATION = /^[\p{P}\p{S}]+|[\p{P}\p{S}]+$/gu

function canonicalLexicalTerm(term: string): string {
    return term.replace(LEXICAL_EDGE_PUNCTUATION, '')
}

function meaningfulLexicalTerms(value: string): string[] {
    return [...new Set(talosLibrarySearchTerms(value)
        .map(canonicalLexicalTerm)
        .filter((term) => term !== '' && !ANSWER_STOPWORDS.has(term)))]
}

function fieldLexicalTerms(value: string): string[] {
    const normalized = normalizeTalosLibrarySearchText(value)
    if (normalized === '') return []
    return normalized
        .split(' ')
        .map(canonicalLexicalTerm)
        .filter((term) => term !== '')
}

function isWithinOneLexicalEdit(left: string, right: string): boolean {
    if (left === right) return true
    if (Math.abs(left.length - right.length) > 1) return false
    let leftIndex = 0
    let rightIndex = 0
    let edits = 0
    while (leftIndex < left.length && rightIndex < right.length) {
        if (left[leftIndex] === right[rightIndex]) {
            leftIndex += 1
            rightIndex += 1
            continue
        }
        edits += 1
        if (edits > 1) return false
        if (left.length === right.length) {
            leftIndex += 1
            rightIndex += 1
        } else if (left.length > right.length) {
            leftIndex += 1
        } else {
            rightIndex += 1
        }
    }
    if (leftIndex < left.length || rightIndex < right.length) edits += 1
    return edits <= 1
}

function lexicalTermsMatch(queryTerm: string, fieldTerm: string): boolean {
    return queryTerm === fieldTerm
        || (
            Math.min(queryTerm.length, fieldTerm.length) >= 5
            && isWithinOneLexicalEdit(queryTerm, fieldTerm)
        )
}

function scoreTalosLibraryLexicalFields(
    query: string,
    fields: readonly { text: string | null | undefined; weight?: number }[],
): number {
    const terms = meaningfulLexicalTerms(query)
    if (terms.length === 0) return 0
    const prepared = fields.map((field) => ({
        terms: fieldLexicalTerms(field.text ?? ''),
        weight: field.weight === undefined ? 1 : Math.max(0, field.weight),
    }))
    let score = 0
    for (const term of terms) {
        const frequency = prepared.reduce((total, field) => (
            total + field.terms.filter((candidate) => lexicalTermsMatch(term, candidate)).length
                * field.weight
        ), 0)
        if (frequency > 0) score += frequency / (frequency + 1.5)
    }
    return score
}

function scoreTalosLibraryDocument(query: string, document: LibraryDoc): number {
    return scoreTalosLibraryLexicalFields(query, [
        { text: document.displayName, weight: 3 },
        { text: document.text },
    ])
}

function forcedBroadSelection(
    docs: readonly LibraryDoc[],
    selected: LibraryDoc[],
    options: LibraryInjectionOptions,
    forcedIds: readonly string[],
): LibraryDoc[] {
    const selectedIds = new Set(selected.map((doc) => doc.id))
    const forced = new Set(forcedIds)
    const result = [...selected]
    for (const doc of docs) {
        if (!forced.has(doc.id) || selectedIds.has(doc.id)) continue
        if (result.length >= options.maxDocs) result.pop()
        result.push(doc)
        selectedIds.add(doc.id)
    }
    return result
}

export function selectTalosLibraryContext(
    docs: readonly LibraryDoc[],
    options: {
        policy: TalosEffectiveLibraryContextPolicy
        query: string
        consent_granted?: boolean
        scoreAdapter?: RelevantLibraryInjectionOptions['scoreAdapter']
    } & Pick<LibraryInjectionOptions, 'charBudget' | 'maxDocs' | 'perDocChars'>,
): TalosLibraryContextDecision {
    const excluded = new Set(options.policy.excluded_file_ids)
    const eligible = docs.filter((doc) => !excluded.has(doc.id))
    let candidates: LibraryDoc[] = []
    let transmitted: LibraryDoc[] = []
    let requiresConsent = false
    let reason: TalosLibraryPolicyReceipt['reason'] = 'disabled'

    if (options.policy.enabled) {
        const injection = {
            query: options.query,
            charBudget: options.charBudget,
            maxDocs: options.maxDocs,
            perDocChars: options.perDocChars,
        }
        if (options.policy.mode === 'broad_compat_v1') {
            candidates = forcedBroadSelection(
                eligible,
                selectLibraryDocsForInjection(eligible, injection),
                injection,
                options.policy.included_file_ids,
            )
            transmitted = candidates
            reason = 'broad_compat'
        } else if (
            options.policy.mode === 'smart_relevant_v1'
            || options.policy.mode === 'ask_before_use_v1'
        ) {
            candidates = selectRelevantLibraryDocsForInjection(eligible, {
                ...injection,
                forcedFileIds: options.policy.included_file_ids,
                excludedFileIds: options.policy.excluded_file_ids,
                scoreAdapter: options.scoreAdapter,
            })
            if (options.policy.mode === 'ask_before_use_v1') {
                requiresConsent = candidates.length > 0 && options.consent_granted !== true
                transmitted = options.consent_granted === true ? candidates : []
                reason = options.consent_granted === true ? 'consent_granted' : 'awaiting_consent'
            } else {
                transmitted = candidates
                reason = 'smart_relevant'
            }
        } else {
            reason = 'agentic_on_demand'
        }
    }
    const documentRelevance = options.policy.mode === 'broad_compat_v1'
        ? candidates.map((document) => ({
            file_id: document.id,
            lexical_score: scoreTalosLibraryDocument(options.query, document),
        }))
        : []

    return {
        policy: options.policy,
        candidates,
        transmitted,
        document_relevance: documentRelevance,
        requires_consent: requiresConsent,
        receipt: {
            schema_version: 1,
            mode: options.policy.mode,
            candidate_file_ids: candidates.map((doc) => doc.id),
            transmitted_file_ids: transmitted.map((doc) => doc.id),
            excluded_file_ids: [...options.policy.excluded_file_ids],
            reason,
        },
    }
}

export function shouldGuardTalosBroadLibraryAnswer(
    decision: Readonly<TalosLibraryContextDecision>,
    topicAnchor: string,
): boolean {
    if (
        !decision.policy.enabled
        || decision.policy.mode !== 'broad_compat_v1'
        || decision.transmitted.length === 0
    ) return false
    const turns = topicAnchor
        .split(/\r?\n/u)
        .map((turn) => turn.trim())
        .filter(Boolean)
    if (turns.length < 2) return false
    const currentQuery = turns[0] ?? ''
    if (meaningfulLexicalTerms(currentQuery).length > 6) return false
    if (decision.transmitted.some((document) =>
        scoreTalosLibraryDocument(currentQuery, document) > 0,
    )) return false
    const transmittedIds = new Set(decision.transmitted.map((document) => document.id))
    return (decision.document_relevance ?? []).some((entry) =>
        transmittedIds.has(entry.file_id) && entry.lexical_score === 0,
    )
}

export function assessTalosLibraryAnswerRelevance(
    topicAnchor: string,
    answer: string,
): { relevant: boolean; score: number } {
    const score = scoreTalosLibraryLexicalFields(topicAnchor, [{ text: answer }])
    return { relevant: score > 0, score }
}
