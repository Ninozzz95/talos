export type ForgeAction = 'read' | 'write' | 'outbound'
export type ForgeRisk = 'R1' | 'R2' | 'R3' | 'R4'
export type ForgeNetworkMode = 'forbidden' | 'allowlist'
export type ForgePrivacy = 'local-only' | 'local-preferred' | 'remote-allowed'

export interface ForgeCredentialRequirement {
    id: string
    kind: 'api_profile' | 'oauth_profile' | 'oauth_or_api_profile'
    purpose: string
    outboundScope: string[]
}

export interface ForgeModelRequirements {
    structuredOutput?: boolean
    minContext?: number
    privacy?: ForgePrivacy
    reasoning?: 'off' | 'low' | 'medium' | 'high'
    maxInputTokens?: number
    maxOutputTokens?: number
    fallback?: { allowed: boolean }
}

export interface ForgeCapabilityDescriptor {
    id: string
    actions: readonly ForgeAction[]
    risk: ForgeRisk
    network: 'none' | 'allowlisted'
    reversible: boolean
    maxInputBytes?: number
    /**
     * ⛔ Owner 2026-08-27: l'id della capability PRIMARIA che questa
     * compensa, se esiste. Un nodo che dichiara `compensation.capability`
     * deve puntare a una capability il cui `compensatesFor` coincide con
     * la capability primaria del nodo stesso — non basta che la
     * capability di compensazione esista, deve essere QUELLA giusta.
     */
    compensatesFor?: string
    description: string
    /**
     * ⛔ Owner 2026-08-27 — «hai anche testato quella cosa di ChatGPT? creare
     * un tool UI che ti trasforma una lista in un elemento in chat
     * interattivo?». L'Apps SDK di OpenAI la risolve con un iframe e codice
     * generato: incompatibile con ADR-001 ("mai eseguire codice influenzato
     * dal modello"). Ricerca 2026 (CopilotKit, A2UI/agentwiki.org): il
     * pattern sicuro è "Declarative Generative UI" — l'agente restituisce
     * una specifica strutturata, il frontend la disegna coi PROPRI vincoli —
     * esattamente ciò che `TalosScheda` già è, non un'architettura nuova.
     *
     * `recordKind` marca le capability il cui successo È la creazione di
     * qualcosa che resta (non un aggiornamento, non una lettura): solo le
     * tre `*.create` qui sotto lo dichiarano. L'interprete lo legge in
     * `callCapability` per aggregare `ForgeExecutionResult.created` —
     * struttura dichiarata, non indovinare dalla forma del risultato.
     */
    recordKind?: 'task' | 'note' | 'memory'
}

/**
 * ⛔ Una voce di `ForgeExecutionResult.created` — vedi `recordKind` sopra.
 * `id` è assente quando la capability non lo restituisce (`memory.create`,
 * per lo stesso motivo onesto già documentato nella scheda `creato` di
 * `memoryWriteTools.ts`: niente pulsante che non saprebbe dove andare).
 */
export interface ForgeCreatedRecord {
    capability: string
    recordKind: 'task' | 'note' | 'memory'
    id?: string
    title: string
}

export type ForgeRef = { $ref: string }
export type ForgeExpr = unknown | ForgeRef

export interface ForgeRetryPolicy {
    maxAttempts: number
    backoffMs?: number
}

export interface ForgeCompensation {
    capability: string
    input: ForgeExpr
}

export type ForgeInlineNode =
    | { type: 'set'; target: string; value: ForgeExpr }
    | { type: 'capability'; capability: string; input: ForgeExpr; target?: string; retry?: ForgeRetryPolicy; compensation?: ForgeCompensation }
    | { type: 'llm'; op: 'classify' | 'extract' | 'summarize' | 'generate' | 'rank'; input: ForgeExpr; target: string; requirements?: ForgeModelRequirements; outputSchema?: JsonSchemaSubset }

export type ForgeNode =
    | ({ id: string; type: 'set'; target: string; value: ForgeExpr; next: string })
    | ({ id: string; type: 'capability'; capability: string; input: ForgeExpr; target?: string; retry?: ForgeRetryPolicy; compensation?: ForgeCompensation; next: string })
    | ({ id: string; type: 'llm'; op: 'classify' | 'extract' | 'summarize' | 'generate' | 'rank'; input: ForgeExpr; target: string; requirements?: ForgeModelRequirements; outputSchema?: JsonSchemaSubset; next: string })
    | ({ id: string; type: 'if'; condition: ForgeCondition; then: string; else: string })
    | ({ id: string; type: 'foreach'; source: ForgeExpr; itemVar: string; indexVar?: string; maxItems: number; body: ForgeInlineNode[]; next: string })
    | ({ id: string; type: 'return'; value: ForgeExpr })
    | ({ id: string; type: 'fail'; code: string; message: string })

export interface ForgeCondition {
    left: ForgeExpr
    op: 'eq' | 'neq' | 'truthy' | 'exists' | 'contains' | 'gt' | 'gte' | 'lt' | 'lte'
    right?: ForgeExpr
}

export interface ForgeFlow {
    entry: string
    maxTransitions: number
    nodes: ForgeNode[]
}

export interface TalosLocalToolManifestV1 {
    schema: 'talos.local-tool.v1'
    id: string
    version: number
    title: string
    description: string
    createdAt: string
    parentVersion: number | null
    execution: 'declarative-flow'
    installScope: 'device'
    network: { mode: ForgeNetworkMode; domains: string[] }
    credentialRequirements: ForgeCredentialRequirement[]
    modelDefaults?: ForgeModelRequirements
    inputSchema?: JsonSchemaSubset
    outputSchema?: JsonSchemaSubset
    flow: ForgeFlow
    state?: {
        schemaVersion: number
        maxBytes: number
        fields: Record<string, JsonSchemaSubset>
    }
    triggers?: ForgeTrigger[]
    ui?: ForgeResultCardSpec
}

export interface ForgeTrigger {
    id: string
    type: 'manual' | 'schedule' | 'app-resume' | 'task-changed'
    enabled: boolean
    schedule?: { kind: 'daily'; hour: number; minute: number } | { kind: 'interval'; minutes: number }
}

export interface ForgeResultCardSpec {
    kind: 'summary'
    title: string
    primaryRef?: string
    detailRefs?: string[]
}

export interface JsonSchemaSubset {
    type?: 'object' | 'array' | 'string' | 'number' | 'integer' | 'boolean' | 'null'
    properties?: Record<string, JsonSchemaSubset>
    required?: string[]
    items?: JsonSchemaSubset
    enum?: unknown[]
    additionalProperties?: boolean
    minLength?: number
    maxLength?: number
    minimum?: number
    maximum?: number
}

export interface ForgeDiagnostic {
    level: 'error' | 'warning'
    code: string
    path: string
    message: string
}

export interface ForgeValidationResult {
    ok: boolean
    diagnostics: ForgeDiagnostic[]
    actions: readonly ForgeAction[]
    risk: ForgeRisk
    capabilities: string[]
    /** Ogni nodo di scrittura raggiungibile ha una compensazione dichiarata
     * E corretta (`compensatesFor` coincide con la capability primaria del
     * nodo) — vedi `capabilityCatalog.ts` e `permissionSynthesis.ts`. */
    allWritesCompensated: boolean
}

export interface ForgeTraceEvent {
    at: string
    node: string
    kind: string
    ok: boolean
    detail?: Record<string, unknown>
}

export interface ForgeCapabilityContext {
    executionId: string
    nodeId: string
    idempotencyKey: string
    signal?: AbortSignal
}

export interface ForgeCapabilityRuntime {
    describe(id: string): ForgeCapabilityDescriptor | null
    execute(id: string, input: unknown, context: ForgeCapabilityContext): Promise<unknown>
}

/**
 * ⛔ Owner 2026-08-27, Fase 5: prima `execute` restituiva `unknown` nudo —
 * nessuna provenienza. Il trace di un tool forgiato non poteva mai dire
 * QUALE modello/provider ha risposto davvero, a differenza del resto di
 * TALOS (`chats.model_profile_id`, i chip del modello in chat). `model`/
 * `provider` sono per il trace — mai per decidere fiducia o permessi, che
 * restano decisi dal manifest statico, non da chi ha risposto.
 */
export interface ForgeModelExecutionResult {
    value: unknown
    model?: string
    provider?: string
}

export interface ForgeModelRuntime {
    execute(
        op: 'classify' | 'extract' | 'summarize' | 'generate' | 'rank',
        input: unknown,
        requirements: ForgeModelRequirements,
        context: { executionId: string; nodeId: string; signal?: AbortSignal },
    ): Promise<ForgeModelExecutionResult>
}

export interface ForgeExecutionResult {
    status: 'succeeded' | 'failed' | 'recovery_required'
    output?: unknown
    error?: { code: string; message: string }
    trace: ForgeTraceEvent[]
    variables: Record<string, unknown>
    /**
     * ⛔ Owner 2026-08-27 — presente su OGNI esito, non solo `succeeded`: un
     * `foreach` che crea 2 attività e fallisce alla terza ha comunque scritto
     * quelle 2 sul disco (v1 non ha compensazioni reali per `*.create`, vedi
     * `capabilityCatalog.ts`) — nasconderle sarebbe la stessa bugia del
     * «Fatto» su una cosa non fatta, capovolta.
     */
    created: ForgeCreatedRecord[]
}
