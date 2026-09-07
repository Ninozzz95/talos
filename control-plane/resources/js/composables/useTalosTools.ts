import { computed, ref } from 'vue'
import { talosFetch } from '../lib/api'
import type {
    TalosConnector,
    TalosTool,
    TalosToolAction,
    TalosToolAvailability,
    TalosToolAvailabilityReason,
    TalosToolConfirmation,
    TalosToolContractV1,
    TalosToolExecutionLocation,
    TalosToolLifecycleKind,
    TalosToolPlanningContext,
    TalosToolRiskLevel,
} from '../lib/talosTypes'

type ApiEnvelope<T> = {
    data: T
}

const TOOL_ACTIONS = new Set<TalosToolAction>(['read', 'write', 'outbound'])
const TOOL_CONFIRMATIONS = new Set<TalosToolConfirmation>(['policy', 'always'])
const TOOL_LIFECYCLES = new Set<TalosToolLifecycleKind>(['bundled', 'managed_registry'])
const TOOL_LOCATIONS = new Set<TalosToolExecutionLocation>(['local_mobile', 'trusted_node', 'remote_provider'])
const TOOL_RISKS = new Set<TalosToolRiskLevel>(['low', 'medium', 'high', 'critical'])
const AVAILABILITY_REASONS = new Set<TalosToolAvailabilityReason>([
    'tool_disabled',
    'planning_disabled',
    'desktop_location_unsupported',
    'connector_disabled',
    'connector_unhealthy',
])

function invalidToolRegistryResponse(detail: string): TypeError {
    return new TypeError(`TALOS received an invalid Tool Registry response. ${detail}`)
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function assertObjectShape(
    value: unknown,
    path: string,
    allowed: readonly string[],
    required: readonly string[],
): asserts value is Record<string, unknown> {
    if (!isRecord(value)) {
        throw invalidToolRegistryResponse(`${path} must be an object.`)
    }
    const allowedKeys = new Set(allowed)
    if (Object.keys(value).some((key) => !allowedKeys.has(key))) {
        throw invalidToolRegistryResponse(`${path} contains unsupported fields.`)
    }
    if (required.some((key) => !Object.prototype.hasOwnProperty.call(value, key))) {
        throw invalidToolRegistryResponse(`${path} is missing required fields.`)
    }
}

function nonEmptyString(value: unknown, path: string): string {
    if (typeof value !== 'string' || value.trim() === '') {
        throw invalidToolRegistryResponse(`${path} must be a non-empty string.`)
    }
    return value
}

function booleanValue(value: unknown, path: string): boolean {
    if (typeof value !== 'boolean') {
        throw invalidToolRegistryResponse(`${path} must be boolean.`)
    }
    return value
}

function uniqueStringList<T extends string>(
    value: unknown,
    path: string,
    allowed?: ReadonlySet<T>,
): T[] {
    if (!Array.isArray(value) || value.length === 0) {
        throw invalidToolRegistryResponse(`${path} must be a non-empty array.`)
    }
    const result = value.map((entry, index) => {
        const item = nonEmptyString(entry, `${path}[${index}]`) as T
        if (allowed && !allowed.has(item)) {
            throw invalidToolRegistryResponse(`${path}[${index}] is unsupported.`)
        }
        return item
    })
    if (new Set(result).size !== result.length) {
        throw invalidToolRegistryResponse(`${path} must not contain duplicates.`)
    }
    return result
}

function objectSchema(value: unknown, path: string, requireObjectType = false): Record<string, unknown> {
    if (!isRecord(value)) {
        throw invalidToolRegistryResponse(`${path} must be an object schema.`)
    }
    if (requireObjectType && value.type !== 'object') {
        throw invalidToolRegistryResponse(`${path}.type must be object.`)
    }
    return value
}

function parseToolContract(value: unknown, path: string): TalosToolContractV1 {
    const required = [
        'schema_version', 'id', 'name', 'title', 'description', 'input_schema',
        'output_schema', 'capabilities', 'actions', 'risk', 'effects', 'lifecycle',
        'execution', 'enabled', 'planning_enabled',
    ] as const
    assertObjectShape(value, path, [
        ...required, 'confirmation', 'connector_id', 'annotations', 'metadata',
    ], required)

    if (value.schema_version !== 1) {
        throw invalidToolRegistryResponse(`${path}.schema_version must be 1.`)
    }
    const id = nonEmptyString(value.id, `${path}.id`)
    const name = nonEmptyString(value.name, `${path}.name`)
    if (!/^[A-Z][A-Z0-9_]*$/.test(name)) {
        throw invalidToolRegistryResponse(`${path}.name is not canonical.`)
    }
    const title = nonEmptyString(value.title, `${path}.title`)
    const description = nonEmptyString(value.description, `${path}.description`)
    const inputSchema = objectSchema(value.input_schema, `${path}.input_schema`, true)
    const outputSchema = value.output_schema === null
        ? null
        : objectSchema(value.output_schema, `${path}.output_schema`)
    const capabilities = uniqueStringList<string>(value.capabilities, `${path}.capabilities`)
    const actions = uniqueStringList<TalosToolAction>(value.actions, `${path}.actions`, TOOL_ACTIONS)

    let confirmation: TalosToolConfirmation | undefined
    if (value.confirmation !== undefined) {
        if (typeof value.confirmation !== 'string' || !TOOL_CONFIRMATIONS.has(value.confirmation as TalosToolConfirmation)) {
            throw invalidToolRegistryResponse(`${path}.confirmation is unsupported.`)
        }
        confirmation = value.confirmation as TalosToolConfirmation
    }

    if (typeof value.risk !== 'string' || !TOOL_RISKS.has(value.risk as TalosToolRiskLevel)) {
        throw invalidToolRegistryResponse(`${path}.risk is unsupported.`)
    }
    const risk = value.risk as TalosToolRiskLevel

    assertObjectShape(value.effects, `${path}.effects`, [
        'mutates_state', 'parallel_safe', 'requires_approval', 'produces_evidence',
    ], ['mutates_state', 'parallel_safe', 'requires_approval', 'produces_evidence'])
    const effects = {
        mutates_state: booleanValue(value.effects.mutates_state, `${path}.effects.mutates_state`),
        parallel_safe: booleanValue(value.effects.parallel_safe, `${path}.effects.parallel_safe`),
        requires_approval: booleanValue(value.effects.requires_approval, `${path}.effects.requires_approval`),
        produces_evidence: booleanValue(value.effects.produces_evidence, `${path}.effects.produces_evidence`),
    }
    if (effects.mutates_state && effects.parallel_safe) {
        throw invalidToolRegistryResponse(`${path}.effects cannot mark a mutating tool parallel-safe.`)
    }
    if ((risk === 'high' || risk === 'critical') && !effects.requires_approval) {
        throw invalidToolRegistryResponse(`${path}.effects must require approval for elevated risk.`)
    }

    assertObjectShape(value.lifecycle, `${path}.lifecycle`, [
        'kind', 'revision', 'integrity_sha256',
    ], ['kind', 'revision'])
    if (typeof value.lifecycle.kind !== 'string' || !TOOL_LIFECYCLES.has(value.lifecycle.kind as TalosToolLifecycleKind)) {
        throw invalidToolRegistryResponse(`${path}.lifecycle.kind is unsupported.`)
    }
    const lifecycle: TalosToolContractV1['lifecycle'] = {
        kind: value.lifecycle.kind as TalosToolLifecycleKind,
        revision: nonEmptyString(value.lifecycle.revision, `${path}.lifecycle.revision`),
    }
    if (value.lifecycle.integrity_sha256 !== undefined) {
        if (value.lifecycle.integrity_sha256 !== null
            && (typeof value.lifecycle.integrity_sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(value.lifecycle.integrity_sha256))) {
            throw invalidToolRegistryResponse(`${path}.lifecycle.integrity_sha256 is invalid.`)
        }
        lifecycle.integrity_sha256 = value.lifecycle.integrity_sha256 as string | null
    }

    assertObjectShape(value.execution, `${path}.execution`, [
        'locations', 'implementation_key',
    ], ['locations', 'implementation_key'])
    const locations = uniqueStringList<TalosToolExecutionLocation>(
        value.execution.locations,
        `${path}.execution.locations`,
        TOOL_LOCATIONS,
    )
    const implementationKey = nonEmptyString(value.execution.implementation_key, `${path}.execution.implementation_key`)
    if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,199}$/.test(implementationKey)) {
        throw invalidToolRegistryResponse(`${path}.execution.implementation_key is unsafe.`)
    }
    if (lifecycle.kind === 'managed_registry' && locations.includes('local_mobile')) {
        throw invalidToolRegistryResponse(`${path} has an unsupported lifecycle/location combination.`)
    }

    let connectorId: string | null | undefined
    if (value.connector_id !== undefined) {
        if (value.connector_id !== null && (typeof value.connector_id !== 'string' || value.connector_id.trim() === '')) {
            throw invalidToolRegistryResponse(`${path}.connector_id is invalid.`)
        }
        connectorId = value.connector_id as string | null
    }
    const annotations = value.annotations === undefined
        ? undefined
        : objectSchema(value.annotations, `${path}.annotations`)
    const metadata = value.metadata === undefined
        ? undefined
        : objectSchema(value.metadata, `${path}.metadata`)

    return {
        schema_version: 1,
        id,
        name,
        title,
        description,
        input_schema: inputSchema,
        output_schema: outputSchema,
        capabilities,
        actions,
        ...(confirmation ? { confirmation } : {}),
        risk,
        effects,
        lifecycle,
        execution: { locations, implementation_key: implementationKey },
        ...(connectorId !== undefined ? { connector_id: connectorId } : {}),
        enabled: booleanValue(value.enabled, `${path}.enabled`),
        planning_enabled: booleanValue(value.planning_enabled, `${path}.planning_enabled`),
        ...(annotations ? { annotations } : {}),
        ...(metadata ? { metadata } : {}),
    }
}

function parseAvailability(value: unknown, path: string): TalosToolAvailability {
    assertObjectShape(value, path, ['available', 'reason'], ['available', 'reason'])
    const available = booleanValue(value.available, `${path}.available`)
    if (available) {
        if (value.reason !== null) {
            throw invalidToolRegistryResponse(`${path}.reason must be null when available.`)
        }
        return { available: true, reason: null }
    }
    if (typeof value.reason !== 'string' || !AVAILABILITY_REASONS.has(value.reason as TalosToolAvailabilityReason)) {
        throw invalidToolRegistryResponse(`${path}.reason is unsupported.`)
    }
    return { available: false, reason: value.reason as TalosToolAvailabilityReason }
}

function parseTool(value: unknown, index: number): TalosTool {
    const path = `data[${index}]`
    if (!isRecord(value)) {
        throw invalidToolRegistryResponse(`${path} must be an object.`)
    }
    const contract = parseToolContract(value.contract, `${path}.contract`)
    const availability = parseAvailability(value.availability, `${path}.availability`)
    const id = nonEmptyString(value.id, `${path}.id`)
    const connectorId = value.connector_id
    if (connectorId !== null && (typeof connectorId !== 'string' || connectorId.trim() === '')) {
        throw invalidToolRegistryResponse(`${path}.connector_id is invalid.`)
    }
    if (id !== contract.id) {
        throw invalidToolRegistryResponse(`${path}.id does not match its canonical contract.`)
    }
    if (typeof value.is_enabled !== 'boolean' || typeof value.planning_enabled !== 'boolean') {
        throw invalidToolRegistryResponse(`${path} has invalid legacy state fields.`)
    }
    if (value.is_enabled !== contract.enabled || value.planning_enabled !== contract.planning_enabled) {
        throw invalidToolRegistryResponse(`${path} legacy state disagrees with its canonical contract.`)
    }
    nonEmptyString(value.name, `${path}.name`)
    nonEmptyString(value.display_name, `${path}.display_name`)
    if (value.description !== null && value.description !== undefined && typeof value.description !== 'string') {
        throw invalidToolRegistryResponse(`${path}.description is invalid.`)
    }
    objectSchema(value.input_schema, `${path}.input_schema`, true)
    if (typeof value.risk_level !== 'string' || !TOOL_RISKS.has(value.risk_level as TalosToolRiskLevel)) {
        throw invalidToolRegistryResponse(`${path}.risk_level is unsupported.`)
    }
    if (value.capability !== null && value.capability !== undefined && typeof value.capability !== 'string') {
        throw invalidToolRegistryResponse(`${path}.capability is invalid.`)
    }
    if (value.connector !== null && value.connector !== undefined && !isRecord(value.connector)) {
        throw invalidToolRegistryResponse(`${path}.connector is invalid.`)
    }
    for (const field of ['created_at', 'updated_at'] as const) {
        if (value[field] !== null && typeof value[field] !== 'string') {
            throw invalidToolRegistryResponse(`${path}.${field} is invalid.`)
        }
    }

    return { ...value, contract, availability } as TalosTool
}

function parseTools(value: unknown): TalosTool[] {
    if (!Array.isArray(value)) {
        throw invalidToolRegistryResponse('data must be an array.')
    }
    const tools = value.map(parseTool)
    const ids = tools.map((tool) => tool.id)
    if (new Set(ids).size !== ids.length) {
        throw invalidToolRegistryResponse('data contains duplicate tool identifiers.')
    }
    return tools
}

function parsePlanningContext(value: unknown): TalosToolPlanningContext {
    if (!isRecord(value)
        || typeof value.source !== 'string'
        || !isRecord(value.policy)
        || !Array.isArray(value.tools)) {
        throw invalidToolRegistryResponse('planning context is malformed.')
    }
    const excludedTools = value.excluded_tools ?? []
    if (!Array.isArray(excludedTools)) {
        throw invalidToolRegistryResponse('planning context is malformed.')
    }
    for (const [index, tool] of value.tools.entries()) {
        if (!isRecord(tool)
            || typeof tool.name !== 'string'
            || typeof tool.display_name !== 'string'
            || !isRecord(tool.input_schema)
            || typeof tool.risk_level !== 'string') {
            throw invalidToolRegistryResponse(`planning context tool [${index}] is malformed.`)
        }
        if (tool.contract !== undefined) {
            parseToolContract(tool.contract, `planning context tool [${index}].contract`)
        }
    }
    for (const [index, excluded] of excludedTools.entries()) {
        assertObjectShape(excluded, `excluded_tools[${index}]`, [
            'name', 'reason', 'error_code',
        ], ['name', 'reason'])
        nonEmptyString(excluded.name, `excluded_tools[${index}].name`)
        nonEmptyString(excluded.reason, `excluded_tools[${index}].reason`)
        if (excluded.error_code !== undefined) {
            nonEmptyString(excluded.error_code, `excluded_tools[${index}].error_code`)
        }
    }
    return { ...value, excluded_tools: excludedTools } as TalosToolPlanningContext
}

export function useTalosTools() {
    const connectors = ref<TalosConnector[]>([])
    const tools = ref<TalosTool[]>([])
    const planningContext = ref<TalosToolPlanningContext | null>(null)
    const pendingToolRegistryRequests = ref(0)
    const loadingToolRegistry = computed(() => pendingToolRegistryRequests.value > 0)
    const toolRegistryError = ref<string | null>(null)

    const planningToolNames = computed(() => new Set(
        planningContext.value?.tools.map((tool) => tool.name) ?? [],
    ))
    const planningToolIds = computed(() => new Set(
        planningContext.value?.tools
            .map((tool) => tool.contract?.id)
            .filter((id): id is string => typeof id === 'string') ?? [],
    ))
    const legacyPlanningToolNames = computed(() => new Set(
        planningContext.value?.tools
            .filter((tool) => tool.contract === undefined)
            .map((tool) => tool.name) ?? [],
    ))

    async function trackToolRegistryRequest<T>(request: () => Promise<T>) {
        pendingToolRegistryRequests.value += 1
        try {
            return await request()
        } finally {
            pendingToolRegistryRequests.value = Math.max(0, pendingToolRegistryRequests.value - 1)
        }
    }

    async function loadConnectors(includeTools = false) {
        toolRegistryError.value = null

        try {
            return await trackToolRegistryRequest(async () => {
                const query = includeTools ? '?include_tools=1' : ''
                const response = await talosFetch<ApiEnvelope<TalosConnector[]>>(`/api/talos/connectors${query}`)
                connectors.value = response.data
                return response.data
            })
        } catch (error) {
            toolRegistryError.value = error instanceof Error ? error.message : 'TALOS could not load connectors.'
            throw error
        }
    }

    async function loadTools(includeDisabled = true) {
        toolRegistryError.value = null

        try {
            return await trackToolRegistryRequest(async () => {
                const query = new URLSearchParams()
                if (includeDisabled) query.set('include_disabled', '1')
                query.set('include_bundled', '1')
                const response = await talosFetch<ApiEnvelope<unknown>>(`/api/talos/tools?${query.toString()}`)
                const parsed = parseTools(response.data)
                tools.value = parsed
                return parsed
            })
        } catch (error) {
            toolRegistryError.value = error instanceof Error ? error.message : 'TALOS could not load tools.'
            throw error
        }
    }

    async function loadPlanningContext() {
        toolRegistryError.value = null

        try {
            return await trackToolRegistryRequest(async () => {
                const response = await talosFetch<ApiEnvelope<unknown>>('/api/talos/tools/planning-context')
                const parsed = parsePlanningContext(response.data)
                planningContext.value = parsed
                return parsed
            })
        } catch (error) {
            toolRegistryError.value = error instanceof Error ? error.message : 'TALOS could not load tool planning context.'
            throw error
        }
    }

    async function refreshToolRegistry() {
        const [loadedConnectors, loadedTools, loadedContext] = await Promise.all([
            loadConnectors(),
            loadTools(true),
            loadPlanningContext(),
        ])

        return {
            connectors: loadedConnectors,
            tools: loadedTools,
            planningContext: loadedContext,
        }
    }

    return {
        connectors,
        tools,
        planningContext,
        planningToolNames,
        planningToolIds,
        legacyPlanningToolNames,
        loadingToolRegistry,
        toolRegistryError,
        loadConnectors,
        loadTools,
        loadPlanningContext,
        refreshToolRegistry,
    }
}
