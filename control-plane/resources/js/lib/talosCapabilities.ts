export const TALOS_CAPABILITY_CONTRACT = 'talos.product.capabilities.v1'

export const TALOS_CAPABILITY_IDS = [
    'chat.provider',
    'browser.hmi',
    'benchmarks.avm',
    'files.ingestion',
    'models.profiles',
    'runs.replay',
    'settings.workspace',
    'chat.streaming',
    'models.local_runtime',
    'models.multi_model_orchestration',
    'speech.local_tts',
    'reasoning.visible',
    'integrations.google_workspace',
    'memory.supermemory',
] as const

export type TalosCapabilityId = typeof TALOS_CAPABILITY_IDS[number]
export type TalosCapabilityState = 'available' | 'degraded' | 'blocked' | 'planned'

export interface TalosCapabilityRecord {
    readonly id: TalosCapabilityId
    readonly state: TalosCapabilityState
    readonly reason: string | null
    readonly evidence: readonly string[]
}

export interface TalosCapabilityManifest {
    readonly contract: typeof TALOS_CAPABILITY_CONTRACT
    readonly revision: string
    readonly capabilities: readonly TalosCapabilityRecord[]
}

export const TALOS_CAPABILITY_LABELS: Readonly<Record<TalosCapabilityId, string>> = Object.freeze({
    'chat.provider': 'Provider-backed chat',
    'browser.hmi': 'Interactive browser',
    'benchmarks.avm': 'AVM benchmarks',
    'files.ingestion': 'File ingestion',
    'models.profiles': 'Provider profiles',
    'runs.replay': 'Run and replay',
    'settings.workspace': 'Workspace settings',
    'chat.streaming': 'Incremental streaming',
    'models.local_runtime': 'Local model runtime',
    'models.multi_model_orchestration': 'Multi-model orchestration',
    'speech.local_tts': 'Local text-to-speech',
    'reasoning.visible': 'Visible reasoning summaries',
    'integrations.google_workspace': 'Google Workspace',
    'memory.supermemory': 'Supermemory',
})

const STATES: readonly TalosCapabilityState[] = ['available', 'degraded', 'blocked', 'planned']
const CAPABILITY_IDS = new Set<string>(TALOS_CAPABILITY_IDS)

function isObject(value: unknown): value is Record<string, unknown> {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function hasExactKeys(value: Record<string, unknown>, expected: readonly string[]): boolean {
    const actual = Object.keys(value).sort()
    const normalizedExpected = [...expected].sort()
    return actual.length === normalizedExpected.length
        && actual.every((key, index) => key === normalizedExpected[index])
}

function parseRecord(value: unknown, index: number): TalosCapabilityRecord {
    if (!isObject(value)) {
        throw new TypeError(`Capability record [${index}] must be an object.`)
    }
    if (!hasExactKeys(value, ['id', 'state', 'reason', 'evidence'])) {
        throw new TypeError(`Capability record [${index}] must contain only id, state, reason, and evidence.`)
    }

    const id = value.id
    if (typeof id !== 'string' || !CAPABILITY_IDS.has(id)) {
        throw new TypeError(`Unknown capability identifier [${String(id)}].`)
    }

    const state = value.state
    if (typeof state !== 'string' || !STATES.includes(state as TalosCapabilityState)) {
        throw new TypeError(`Unknown capability state for [${id}].`)
    }

    const reason = value.reason
    if (state === 'available' && reason !== null) {
        throw new TypeError(`Available capability [${id}] must not include a reason.`)
    }
    if (state !== 'available' && (typeof reason !== 'string' || reason.trim() === '')) {
        throw new TypeError(`Capability [${id}] requires a non-empty reason outside available state.`)
    }

    const evidence = value.evidence
    if (!Array.isArray(evidence) || evidence.length === 0) {
        throw new TypeError(`Capability [${id}] requires registered evidence.`)
    }
    const normalizedEvidence = evidence.map((entry) => {
        if (typeof entry !== 'string' || entry.trim() === '') {
            throw new TypeError(`Capability [${id}] has invalid evidence.`)
        }
        return entry.trim()
    })
    if (new Set(normalizedEvidence).size !== normalizedEvidence.length) {
        throw new TypeError(`Capability [${id}] has duplicate evidence.`)
    }

    return Object.freeze({
        id: id as TalosCapabilityId,
        state: state as TalosCapabilityState,
        reason: reason === null ? null : reason.trim(),
        evidence: Object.freeze(normalizedEvidence),
    })
}

export function parseTalosCapabilityManifest(value: unknown): TalosCapabilityManifest {
    if (!isObject(value)) {
        throw new TypeError('Capability manifest must be an object.')
    }
    if (!hasExactKeys(value, ['contract', 'revision', 'capabilities'])) {
        throw new TypeError('Capability manifest must contain only contract, revision, and capabilities.')
    }
    if (value.contract !== TALOS_CAPABILITY_CONTRACT) {
        throw new TypeError(`Unsupported capability contract [${String(value.contract)}].`)
    }
    if (typeof value.revision !== 'string' || value.revision.trim() === '') {
        throw new TypeError('Invalid capability revision.')
    }
    if (!Array.isArray(value.capabilities)) {
        throw new TypeError('Capability manifest capabilities must be an array.')
    }

    const capabilities = value.capabilities.map(parseRecord)
    const seen = new Set<TalosCapabilityId>()
    for (const capability of capabilities) {
        if (seen.has(capability.id)) {
            throw new TypeError(`Duplicate capability identifier [${capability.id}].`)
        }
        seen.add(capability.id)
    }

    return Object.freeze({
        contract: TALOS_CAPABILITY_CONTRACT,
        revision: value.revision.trim(),
        capabilities: Object.freeze(capabilities),
    })
}
