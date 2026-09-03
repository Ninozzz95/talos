import type {
    ForgeCapabilityRuntime, ForgeCreatedRecord, ForgeExecutionResult, ForgeInlineNode, ForgeModelRequirements,
    ForgeModelRuntime, ForgeTraceEvent, JsonSchemaSubset, TalosLocalToolManifestV1,
} from './contracts'
import { evaluateCondition, resolveExpr, setPath } from './expr'
import { validateJsonSchemaValue } from './jsonSchema'
import { validateTalosLocalTool } from './validator'
import type { ForgeCircuitBreaker } from './circuitBreaker'
import type { ForgeIdempotencyStore } from './idempotency'
import {
    DEFAULT_MAX_INPUT_BYTES, estimateForgeBytes, estimateForgeTokens,
    MAX_CAPABILITY_RESULT_BYTES, MAX_OUTPUT_BYTES, MAX_TRACE_EVENTS,
} from './limits'

class ForgeRuntimeError extends Error {
    // ⛔ Stessa regola di circuitBreaker.ts: niente proprietà-parametro sotto
    // `erasableSyntaxOnly`.
    readonly code: string
    readonly recoveryRequired: boolean
    constructor(code: string, message: string, recoveryRequired = false) {
        super(message)
        this.code = code
        this.recoveryRequired = recoveryRequired
    }
}

const wait = (ms: number, signal?: AbortSignal) => new Promise<void>((resolve, reject) => {
    // ⛔ Owner 2026-08-27, Fase 7 (avversariale — abort in OGNI fase):
    // prima si controllava SOLO l'evento 'abort' futuro. Un segnale già
    // abortito PRIMA di chiamare `wait()` non fa mai scattare quell'evento
    // — `addEventListener` su un AbortSignal già segnalato non richiama
    // l'ascoltatore in ritardo — quindi l'attesa proseguiva fino in fondo
    // come se niente fosse. Stesso controllo che il ciclo principale già
    // fa (`options.signal?.aborted` in testa al while), qui all'ingresso.
    if (signal?.aborted) return reject(new ForgeRuntimeError('FORGE_ABORTED', 'Execution aborted.'))
    if (ms <= 0) return resolve()
    const timer = setTimeout(resolve, ms)
    signal?.addEventListener('abort', () => { clearTimeout(timer); reject(new ForgeRuntimeError('FORGE_ABORTED', 'Execution aborted.')) }, { once: true })
})

function clone<T>(value: T): T { return value === undefined ? value : JSON.parse(JSON.stringify(value)) as T }

export interface ForgeInterpreterDeps {
    capabilities: ForgeCapabilityRuntime
    model?: ForgeModelRuntime | null
    now?: () => string
    /** ⛔ Owner 2026-08-27: prima non era mai importato da questo file —
     * scritto, mai chiamato. Opzionale per restare compatibile coi
     * chiamanti/test esistenti, ma quando manca il breaker semplicemente
     * non protegge niente: non è più "silenziosamente rotto", è
     * esplicitamente "non collegato qui". */
    circuitBreaker?: ForgeCircuitBreaker
    /** ⛔ Confine onesto: vedi idempotency.ts — deduplica i retry DENTRO
     * questa esecuzione, non l'effetto perso a monte della capability. */
    idempotency?: ForgeIdempotencyStore
}

interface CompensationEntry { nodeId: string; capability: string; input: unknown }

export async function executeTalosLocalTool(
    manifest: TalosLocalToolManifestV1,
    input: unknown,
    deps: ForgeInterpreterDeps,
    options: { executionId?: string; signal?: AbortSignal } = {},
): Promise<ForgeExecutionResult> {
    const validated = validateTalosLocalTool(manifest)
    if (!validated.ok) return { status: 'failed', error: { code: 'FORGE_MANIFEST_INVALID', message: validated.diagnostics.filter((d) => d.level === 'error').map((d) => `${d.path}: ${d.message}`).join('; ') }, trace: [], variables: {}, created: [] }
    const inputErrors = validateJsonSchemaValue(manifest.inputSchema, input)
    if (inputErrors.length) return { status: 'failed', error: { code: 'FORGE_INPUT_INVALID', message: inputErrors.join('; ') }, trace: [], variables: {}, created: [] }

    const executionId = options.executionId ?? `forge-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
    const now = deps.now ?? (() => new Date().toISOString())
    // Object.create(null): seconda difesa indipendente contro la prototype
    // pollution (vedi expr.ts) — anche se un path pericoloso sfuggisse alla
    // grammatica di setPath, `vars` non ha un `__proto__` accessor da
    // invocare.
    const vars: Record<string, unknown> = Object.assign(Object.create(null) as Record<string, unknown>, {
        input: clone(input), state: {}, runtime: { executionId },
    })
    const nodes = new Map(manifest.flow.nodes.map((node) => [node.id, node]))
    const trace: ForgeTraceEvent[] = []
    // ⛔ Owner 2026-08-27 — vedi `ForgeCapabilityDescriptor.recordKind` in
    // contracts.ts per il perché: qui è dove si popola, l'unico posto che
    // vede sia il descrittore (chi dichiara "questo crea qualcosa") sia il
    // risultato vero della capability, per ogni chiamata riuscita.
    const created: ForgeCreatedRecord[] = []
    const compensations: CompensationEntry[] = []
    let crossedIrreversible = false
    let transitions = 0

    // ⛔ Owner 2026-08-27: nessun tetto sugli eventi di trace prima — un
    // flow coi transizioni/retry al massimo consentito poteva comunque
    // crescere senza limite se qualcosa (una compensazione, un ciclo di
    // eventi) sfuggiva ai bound già esistenti. Difesa di riserva, non un
    // limite che l'uso normale dovrebbe mai toccare (vedi limits.ts).
    let traceLimitHit = false
    const event = (node: string, kind: string, ok: boolean, detail?: Record<string, unknown>) => {
        if (trace.length >= MAX_TRACE_EVENTS) { traceLimitHit = true; return }
        trace.push({ at: now(), node, kind, ok, ...(detail ? { detail } : {}) })
    }

    const callCapability = async (nodeId: string, capability: string, rawInput: unknown, retry: { maxAttempts: number; backoffMs?: number } | undefined): Promise<unknown> => {
        const descriptor = deps.capabilities.describe(capability)
        if (!descriptor) throw new ForgeRuntimeError('FORGE_CAPABILITY_UNAVAILABLE', `Capability ${capability} is unavailable on this device.`)
        if (!descriptor.reversible) crossedIrreversible = true

        // ⛔ Owner 2026-08-27, finding critico #3: `maxInputBytes` era
        // dichiarato (a volte) e mai controllato. Un default fail-closed
        // quando la capability non lo dichiara — mai "illimitato" per
        // omissione.
        const inputBytes = estimateForgeBytes(rawInput)
        const inputCeiling = descriptor.maxInputBytes ?? DEFAULT_MAX_INPUT_BYTES
        if (inputBytes > inputCeiling) {
            throw new ForgeRuntimeError('FORGE_INPUT_TOO_LARGE', `${capability} input is ${inputBytes} bytes; max is ${inputCeiling}.`)
        }

        // ⛔ Owner 2026-08-27: circuitBreaker.ts esisteva ma non era mai
        // importato qui — scritto, mai chiamato, come il gap
        // premesse/verify di Fase 0.
        if (deps.circuitBreaker && !deps.circuitBreaker.canRun(capability)) {
            throw new ForgeRuntimeError('FORGE_CIRCUIT_OPEN', `${capability} is temporarily disabled after repeated failures.`, true)
        }

        const idempotencyKey = `${executionId}:${nodeId}`
        // ⛔ Owner 2026-08-27, finding critico #5: deduplica un retry DENTRO
        // questa esecuzione — vedi idempotency.ts per il confine onesto di
        // cosa questo risolve e cosa no.
        const cached = await deps.idempotency?.get(idempotencyKey)
        if (cached) {
            event(nodeId, 'capability', true, { capability, attempt: 0, cached: true })
            return cached.result
        }

        const attempts = retry?.maxAttempts ?? 1
        let last: unknown
        for (let attempt = 1; attempt <= attempts; attempt++) {
            try {
                const result = await deps.capabilities.execute(capability, rawInput, {
                    executionId, nodeId,
                    // Same key on retry: a capability can deduplicate a lost response.
                    idempotencyKey,
                    signal: options.signal,
                })
                const resultBytes = estimateForgeBytes(result)
                if (resultBytes > MAX_CAPABILITY_RESULT_BYTES) {
                    throw new ForgeRuntimeError('FORGE_RESULT_TOO_LARGE', `${capability} result is ${resultBytes} bytes; max is ${MAX_CAPABILITY_RESULT_BYTES}.`)
                }
                deps.circuitBreaker?.success(capability)
                await deps.idempotency?.put(idempotencyKey, result)
                event(nodeId, 'capability', true, { capability, attempt })
                // ⛔ Owner 2026-08-27: `recordKind` è dichiarato sulla
                // capability, non indovinato dalla forma del risultato — ma
                // il risultato deve comunque avere un titolo leggibile,
                // altrimenti una scheda con un titolo vuoto sarebbe la
                // stessa bugia del «Fatto» senza dire cosa.
                if (descriptor.recordKind && result && typeof result === 'object' && !Array.isArray(result)) {
                    const row = result as Record<string, unknown>
                    if (typeof row.title === 'string' && row.title !== '') {
                        created.push({
                            capability, recordKind: descriptor.recordKind, title: row.title,
                            ...(typeof row.id === 'string' && row.id !== '' ? { id: row.id } : {}),
                        })
                    }
                }
                return result
            } catch (error) {
                last = error
                event(nodeId, 'capability', false, { capability, attempt, error: error instanceof Error ? error.message : String(error) })
                if (attempt < attempts) await wait(retry?.backoffMs ?? 0, options.signal)
            }
        }
        // Tutti i tentativi esauriti: UN fallimento per la chiamata, non
        // uno per tentativo — il breaker misura l'affidabilità della
        // capability, non quante volte questo nodo ha ritentato.
        deps.circuitBreaker?.failure(capability)
        throw last instanceof ForgeRuntimeError ? last : new ForgeRuntimeError('FORGE_CAPABILITY_FAILED', last instanceof Error ? last.message : String(last))
    }

    const callModel = async (
        nodeId: string,
        op: 'classify' | 'extract' | 'summarize' | 'generate' | 'rank',
        rawInput: unknown,
        requirements: ForgeModelRequirements | undefined,
        outputSchema: JsonSchemaSubset | undefined,
    ): Promise<unknown> => {
        if (!deps.model) throw new ForgeRuntimeError('FORGE_MODEL_UNAVAILABLE', 'No TALOS model runtime is available for this execution.')
        const merged = { ...(manifest.modelDefaults ?? {}), ...(requirements ?? {}) }

        const inputBytes = estimateForgeBytes(rawInput)
        if (inputBytes > DEFAULT_MAX_INPUT_BYTES) {
            throw new ForgeRuntimeError('FORGE_INPUT_TOO_LARGE', `LLM ${op} input is ${inputBytes} bytes; max is ${DEFAULT_MAX_INPUT_BYTES}.`)
        }
        // ⛔ Owner 2026-08-27, Fase 5: in aggiunta al tetto in byte sopra
        // (che vale sempre) — un tetto in TOKEN, applicato solo quando il
        // manifest lo dichiara. Approssimato (limits.ts spiega il perché,
        // ~10-20% di errore misurato): va bene per un tetto di sicurezza,
        // non per un budget di costo preciso.
        if (merged.maxInputTokens !== undefined) {
            const inputTokens = estimateForgeTokens(rawInput)
            if (inputTokens > merged.maxInputTokens) {
                throw new ForgeRuntimeError('FORGE_INPUT_TOKENS_EXCEEDED', `LLM ${op} input is ~${inputTokens} tokens (stimati); max is ${merged.maxInputTokens}.`)
            }
        }

        const response = await deps.model.execute(op, rawInput, merged, { executionId, nodeId, signal: options.signal })

        const resultBytes = estimateForgeBytes(response.value)
        if (resultBytes > MAX_CAPABILITY_RESULT_BYTES) {
            throw new ForgeRuntimeError('FORGE_RESULT_TOO_LARGE', `LLM ${op} result is ${resultBytes} bytes; max is ${MAX_CAPABILITY_RESULT_BYTES}.`)
        }
        if (merged.maxOutputTokens !== undefined) {
            const outputTokens = estimateForgeTokens(response.value)
            if (outputTokens > merged.maxOutputTokens) {
                throw new ForgeRuntimeError('FORGE_OUTPUT_TOKENS_EXCEEDED', `LLM ${op} output is ~${outputTokens} tokens (stimati); max is ${merged.maxOutputTokens}.`)
            }
        }
        // ⛔ Owner 2026-08-27, Fase 5: `structuredOutput` era un flag
        // dichiarativo mai controllato (finding della revisione). Ora, se
        // il nodo dichiara `outputSchema`, la risposta è validata DAVVERO
        // — `validator.ts` impone che `structuredOutput: true` richieda
        // questo campo, quindi la dichiarazione non può più essere vuota.
        if (outputSchema) {
            const errors = validateJsonSchemaValue(outputSchema, response.value)
            if (errors.length) throw new ForgeRuntimeError('FORGE_LLM_OUTPUT_INVALID', errors.join('; '))
        }

        // ⛔ Owner 2026-08-27, Fase 5: provenienza nel trace — prima
        // `execute` restituiva `unknown` nudo, senza dire QUALE modello ha
        // risposto. Mai usata per decidere fiducia/permessi: solo per chi
        // legge il trace dopo.
        event(nodeId, 'llm', true, {
            op,
            ...(response.model ? { model: response.model } : {}),
            ...(response.provider ? { provider: response.provider } : {}),
        })
        return response.value
    }

    const runInline = async (parent: string, node: ForgeInlineNode): Promise<void> => {
        if (node.type === 'set') { setPath(vars, node.target, resolveExpr(node.value, vars)); return }
        if (node.type === 'llm') { setPath(vars, node.target, await callModel(parent, node.op, resolveExpr(node.input, vars), node.requirements, node.outputSchema)); return }
        const raw = resolveExpr(node.input, vars)
        const result = await callCapability(parent, node.capability, raw, node.retry)
        if (node.target) setPath(vars, node.target, result)
        if (node.compensation) compensations.push({ nodeId: parent, capability: node.compensation.capability, input: resolveExpr(node.compensation.input, vars) })
    }

    const compensate = async (): Promise<boolean> => {
        let clean = true
        for (const entry of [...compensations].reverse()) {
            try {
                await deps.capabilities.execute(entry.capability, entry.input, { executionId, nodeId: `${entry.nodeId}:compensate`, idempotencyKey: `${executionId}:${entry.nodeId}:compensate`, signal: options.signal })
                event(entry.nodeId, 'compensation', true, { capability: entry.capability })
            } catch (error) {
                clean = false
                event(entry.nodeId, 'compensation', false, { capability: entry.capability, error: error instanceof Error ? error.message : String(error) })
            }
        }
        return clean
    }

    let current = manifest.flow.entry
    try {
        while (true) {
            if (options.signal?.aborted) throw new ForgeRuntimeError('FORGE_ABORTED', 'Execution aborted.')
            if (traceLimitHit) throw new ForgeRuntimeError('FORGE_TRACE_LIMIT', `Trace ceiling of ${MAX_TRACE_EVENTS} events exceeded.`)
            if (++transitions > manifest.flow.maxTransitions) throw new ForgeRuntimeError('FORGE_TRANSITION_LIMIT', 'Transition ceiling exceeded.')
            const node = nodes.get(current)
            if (!node) throw new ForgeRuntimeError('FORGE_NODE_MISSING', `Node ${current} not found.`)
            switch (node.type) {
                case 'set':
                    setPath(vars, node.target, resolveExpr(node.value, vars)); event(node.id, 'set', true); current = node.next; break
                case 'capability': {
                    const result = await callCapability(node.id, node.capability, resolveExpr(node.input, vars), node.retry)
                    if (node.target) setPath(vars, node.target, result)
                    if (node.compensation) compensations.push({ nodeId: node.id, capability: node.compensation.capability, input: resolveExpr(node.compensation.input, vars) })
                    current = node.next; break
                }
                case 'llm':
                    setPath(vars, node.target, await callModel(node.id, node.op, resolveExpr(node.input, vars), node.requirements, node.outputSchema)); current = node.next; break
                case 'if':
                    current = evaluateCondition(node.condition, vars) ? node.then : node.else; event(node.id, 'if', true, { next: current }); break
                case 'foreach': {
                    const source = resolveExpr(node.source, vars)
                    if (!Array.isArray(source)) throw new ForgeRuntimeError('FORGE_FOREACH_SOURCE', `Node ${node.id} expected an array.`)
                    if (source.length > node.maxItems) throw new ForgeRuntimeError('FORGE_FOREACH_LIMIT', `Node ${node.id} received ${source.length} items; max is ${node.maxItems}.`)
                    for (let i = 0; i < source.length; i++) {
                        // ⛔ Owner 2026-08-27, Fase 7 (avversariale — abort
                        // in OGNI fase): il ciclo esterno controlla
                        // `signal.aborted` solo fra un NODO e il successivo.
                        // Un `foreach` con molti elementi, ognuno con una
                        // chiamata a capability, non se ne accorgeva finché
                        // l'intero nodo non finiva — bounded da `maxItems`,
                        // non catastrofico, ma un annullamento reale
                        // aspettava fino a `maxItems` chiamate invece di
                        // fermarsi all'elemento in corso.
                        if (options.signal?.aborted) throw new ForgeRuntimeError('FORGE_ABORTED', 'Execution aborted.')
                        setPath(vars, node.itemVar, source[i]); if (node.indexVar) setPath(vars, node.indexVar, i)
                        for (const child of node.body) await runInline(node.id, child)
                    }
                    event(node.id, 'foreach', true, { count: source.length }); current = node.next; break
                }
                case 'return': {
                    const output = resolveExpr(node.value, vars)
                    const outputErrors = validateJsonSchemaValue(manifest.outputSchema, output)
                    if (outputErrors.length) throw new ForgeRuntimeError('FORGE_OUTPUT_INVALID', outputErrors.join('; '))
                    // ⛔ Owner 2026-08-27, finding critico #3: l'output finale
                    // non aveva mai un tetto — un output enorme è quello che
                    // arriva davvero al modello e al trace.
                    const outputBytes = estimateForgeBytes(output)
                    if (outputBytes > MAX_OUTPUT_BYTES) {
                        throw new ForgeRuntimeError('FORGE_OUTPUT_TOO_LARGE', `Output is ${outputBytes} bytes; max is ${MAX_OUTPUT_BYTES}.`)
                    }
                    event(node.id, 'return', true)
                    return { status: 'succeeded', output, trace, variables: vars, created }
                }
                case 'fail': throw new ForgeRuntimeError(node.code, node.message)
            }
        }
    } catch (error) {
        const runtimeError = error instanceof ForgeRuntimeError ? error : new ForgeRuntimeError('FORGE_RUNTIME_FAILED', error instanceof Error ? error.message : String(error))
        const compensated = await compensate()
        const recovery = runtimeError.recoveryRequired || crossedIrreversible || !compensated
        return { status: recovery ? 'recovery_required' : 'failed', error: { code: runtimeError.code, message: runtimeError.message }, trace, variables: vars, created }
    }
}
