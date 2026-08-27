import type { TalosChatRepository } from '@/repositories/chatRepository'
import type { TalosToolDefinition, TalosToolResult } from '@/lib/tools/registry'
import type { TalosToolSecurity } from '@/lib/tools/security'
import type { TalosScheda } from '@/lib/tools/tracciaAzione'
import type {
    ForgeCapabilityContext, ForgeCapabilityDescriptor, ForgeCapabilityRuntime, ForgeCredentialRequirement,
    ForgeCreatedRecord, ForgeModelExecutionResult, ForgeModelRequirements, ForgeModelRuntime, TalosLocalToolManifestV1,
} from './contracts'
import { defaultForgeCapability } from './capabilityCatalog'
import { executeTalosLocalTool } from './interpreter'
import { listForgeTools } from './forgeRegistryRepository'
import { dynamicToolIdFromName, toDynamicToolName } from './ids'
import { validateJsonSchemaValue } from './jsonSchema'
import { validateTalosLocalTool } from './validator'
import { zodFromJsonSchemaSubset } from './zodSchema'
import { FORGE_CAPABILITY_CHECKS } from './forgeCapabilityChecks'

export interface TalosForgeModelBinding {
    execute(op: 'classify' | 'extract' | 'summarize' | 'generate' | 'rank', input: unknown, requirements: ForgeModelRequirements, signal?: AbortSignal): Promise<ForgeModelExecutionResult>
}

function createLocalCapabilities(repository: TalosChatRepository): ForgeCapabilityRuntime {
    const handlers: Record<string, (input: any, context: ForgeCapabilityContext) => Promise<unknown>> = {
        'tasks.list': async () => repository.listTasks(),
        'tasks.create': async (input) => repository.createTask({
            id: input.id ?? `forge-task-${Date.now()}-${Math.random().toString(36).slice(2,8)}`,
            title: String(input.title ?? ''), description: input.description == null ? null : String(input.description), run_id: null,
            status: input.status === 'doing' || input.status === 'done' ? input.status : 'todo', priority: input.priority === 'low' || input.priority === 'high' ? input.priority : 'normal',
            schedule_json: null, instruction: null, content_origin: 'user', created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
        } as any),
        'tasks.setStatus': async (input) => repository.setTaskStatus(String(input.id), input.status),
        'notes.list': async () => repository.listNotes(),
        'notes.create': async (input) => repository.createNote({ id: input.id ?? `forge-note-${Date.now()}-${Math.random().toString(36).slice(2,8)}`, title: String(input.title ?? ''), content: String(input.content ?? ''), content_origin: 'user', created_at: new Date().toISOString(), updated_at: new Date().toISOString() } as any),
        'notes.update': async (input) => repository.updateNote({ id: String(input.id), ...(input.title !== undefined ? { title: String(input.title) } : {}), ...(input.content !== undefined ? { content: String(input.content) } : {}) }),
        'memory.search': async (input) => {
            const query = String(input.query ?? '').toLowerCase().trim(); const rows = await repository.listMemories()
            return rows.filter((row) => row.status === 'active' && `${row.title} ${row.content}`.toLowerCase().includes(query)).slice(0, 20)
        },
        'memory.create': async (input) => repository.createMemory({ id: input.id ?? `forge-memory-${Date.now()}-${Math.random().toString(36).slice(2,8)}`, title: String(input.title ?? ''), content: String(input.content ?? ''), kind: input.kind ?? 'procedure', scope_type: 'global', scope_id: null, status: 'active', content_origin: 'user', created_at: new Date().toISOString(), updated_at: new Date().toISOString() } as any),
    }
    return {
        describe(id: string): ForgeCapabilityDescriptor | null { return handlers[id] ? defaultForgeCapability(id) : null },
        async execute(id, input, context) {
            const handler = handlers[id]
            if (!handler) throw new Error(`TALOS_FORGE_CAPABILITY_UNAVAILABLE:${id}`)
            try {
                return await handler(input, context)
            } catch (error) {
                /*
                 * ⛔⛔ Owner 2026-08-27 — best practice confermata dalla
                 * ricerca (OWASP Secrets Management, "mai un segreto nei
                 * messaggi d'errore verso il modello"): l'errore grezzo di
                 * `repository.*` (potrebbe portare un frammento SQL, un
                 * percorso, un dettaglio interno) non deve mai finire in
                 * `evidence.forge`, che il MODELLO legge — l'unico confine
                 * dove un errore smette di essere "nostro" e diventa
                 * "esterno" è qui, dove chiamiamo il repository. Il
                 * dettaglio vero resta in console/logcat per chi
                 * diagnostica, non nel trace.
                 */
                console.error(`[forge:${id}] capability execution failed`, error)
                throw new Error(`TALOS_FORGE_CAPABILITY_EXECUTION_FAILED:${id}`)
            }
        },
    }
}

const mapRisk = (risk: 'R1'|'R2'|'R3'|'R4'): TalosToolSecurity['risk'] => risk as TalosToolSecurity['risk']

/**
 * ⛔⛔⛔ Owner 2026-08-27 — «hai anche testato quella cosa di ChatGPT? creare
 * un tool UI che ti trasforma una lista in un elemento in chat
 * interattivo?». Non l'Apps SDK di OpenAI (iframe, incompatibile con
 * ADR-001): la stessa `TalosScheda` che le sette capacità native già usano
 * (`tasksWriteTools.ts` ecc.), qui costruita per un tool FORGIATO, che oggi
 * non ne produceva mai — vedi `ForgeCreatedRecord` in `contracts.ts`.
 *
 * ⛔ Le rotte sono quelle VERE (`mobileRoutes.ts`), non inventate — `memory`
 * ne ha una (`/memory/:id`, `memory-item`) anche se la scheda nativa
 * `memory_write` non la usa: quel tool passa dalla sua astrazione `sources`,
 * che non espone l'id al chiamante; qui `repository.createMemory(...)` è
 * chiamato direttamente e l'id c'è per davvero.
 */
const FORGE_RECORD_KIND_ROUTE: Record<ForgeCreatedRecord['recordKind'], (id: string) => string> = {
    task: (id) => `/tasks/${id}`,
    note: (id) => `/notes/${id}`,
    memory: (id) => `/memory/${id}`,
}
const FORGE_RECORD_KIND_GENERE: Record<ForgeCreatedRecord['recordKind'], string> = {
    task: 'Attività', note: 'Nota', memory: 'Memoria',
}

/**
 * ⛔ Una voce sola → `creato` (la forma già esistente, zero disegno nuovo per
 * il caso comune). Più di una → `creati`. Zero voci → nessuna scheda: un
 * `undefined` qui non disegna niente, non è un'omissione.
 */
function buildForgeScheda(created: readonly ForgeCreatedRecord[]): TalosScheda | undefined {
    if (created.length === 0) return undefined
    const voci = created.map((r) => ({
        titolo: r.title,
        genere: FORGE_RECORD_KIND_GENERE[r.recordKind],
        ...(r.id ? { dove: FORGE_RECORD_KIND_ROUTE[r.recordKind](r.id) } : {}),
    }))
    if (voci.length === 1) return { tipo: 'creato' as const, titolo: voci[0].titolo, genere: voci[0].genere, ...(voci[0].dove ? { dove: voci[0].dove } : {}) }
    return { tipo: 'creati' as const, voci }
}

/**
 * ⛔⛔⛔ Owner 2026-08-27 — premesse/verify per un tool forgiato, vedi
 * `forgeCapabilityChecks.ts` per il perché del confine. Attivi SOLO
 * quando la capability raggiungibile è una sola E quel nodo passa
 * l'input del tool alla capability senza trasformarlo — altrimenti
 * l'input del tool e l'input della capability non sono dimostrabilmente
 * la stessa cosa.
 */
function isPassthroughInput(input: unknown): boolean {
    return !!input && typeof input === 'object' && !Array.isArray(input)
        && Object.keys(input as object).length === 1 && (input as { $ref?: unknown }).$ref === '$.input'
}

function findSoleCapabilityNode(manifest: TalosLocalToolManifestV1, capabilityId: string): { input: unknown } | null {
    for (const node of manifest.flow.nodes) {
        if (node.type === 'capability' && node.capability === capabilityId) return node
        if (node.type === 'foreach') {
            for (const child of node.body) {
                if (child.type === 'capability' && child.capability === capabilityId) return child
            }
        }
    }
    return null
}

function forgeChecksFor(
    manifest: TalosLocalToolManifestV1,
    capabilities: readonly string[],
    repository: TalosChatRepository,
): { premesse?: TalosToolDefinition<any>['premesse']; verify?: TalosToolDefinition<any>['verify'] } {
    if (capabilities.length !== 1) return {}
    const [capabilityId] = capabilities
    const check = FORGE_CAPABILITY_CHECKS[capabilityId!]
    if (!check) return {}
    const node = findSoleCapabilityNode(manifest, capabilityId!)
    if (!node || !isPassthroughInput(node.input)) return {}
    // ⛔ La repository si chiude qui, dal parametro — NON da `context`
    // (`TalosToolContext` in registry.ts espone solo `sessionId`/`signal`,
    // niente repository: un tentativo precedente di leggerla da lì non
    // compilava, ed è così che l'ho scoperto).
    return {
        premesse: check.premise ? async (input) => check.premise!(input, repository) : undefined,
        verify: check.verify ? async (input) => check.verify!(input, repository) : undefined,
    }
}

/**
 * ⛔⛔ Owner 2026-08-27 — credential resolver esplicito (finding critico
 * #6 della revisione: "credential requirements non sono collegate
 * all'esecuzione"). v1 non ha ancora nessuno store di credenziali
 * collegato al Forge: ogni slot dichiarato è onestamente IRRISOLVIBILE,
 * non "risolto in silenzio" o ignorato. Il seam esiste per quando un
 * vero resolver sarà collegato, senza dover toccare
 * `createInstalledDynamicTools` una seconda volta. Non passa MAI una
 * credenziale al chiamante: solo un giudizio "posso"/"non posso".
 */
export interface ForgeCredentialResolver {
    canResolve(requirement: ForgeCredentialRequirement): Promise<boolean>
}

const UNRESOLVED_CREDENTIALS: ForgeCredentialResolver = {
    async canResolve() { return false },
}

async function unresolvedCredentialSlots(manifest: TalosLocalToolManifestV1, resolver: ForgeCredentialResolver): Promise<string[]> {
    const unresolved: string[] = []
    for (const requirement of manifest.credentialRequirements) {
        if (!(await resolver.canResolve(requirement))) unresolved.push(requirement.id)
    }
    return unresolved
}

export async function createInstalledDynamicTools(options: {
    repository: TalosChatRepository
    model?: TalosForgeModelBinding | null
    credentialResolver?: ForgeCredentialResolver
}): Promise<TalosToolDefinition<never>[]> {
    const installed = await listForgeTools(); const capabilities = createLocalCapabilities(options.repository)
    const model: ForgeModelRuntime | null = options.model ? { execute: (op, input, requirements, context) => options.model!.execute(op, input, requirements, context.signal) } : null
    const credentialResolver = options.credentialResolver ?? UNRESOLVED_CREDENTIALS
    const tools: TalosToolDefinition<never>[] = []
    for (const record of installed) {
        if (!record.enabled) continue
        const validation = validateTalosLocalTool(record.manifest); if (!validation.ok) continue
        const manifest = record.manifest
        // Fail-closed: un tool con uno slot di credenziale irrisolvibile
        // non entra nella lista dei tool VIVI — non serve a niente
        // installarlo se non potrà mai eseguire, e farlo apparire
        // comunque insegnerebbe che "installato" vuol dire "funzionante".
        if ((await unresolvedCredentialSlots(manifest, credentialResolver)).length > 0) continue
        const requiredActions = validation.actions as any
        const { premesse, verify } = forgeChecksFor(manifest, validation.capabilities, options.repository)
        const tool: TalosToolDefinition<any> = {
            name: toDynamicToolName(manifest.id), title: manifest.title, description: manifest.description,
            action: (requiredActions[0] ?? 'read') as any, requiredActions,
            // Generated tools never create a blanket persistent bypass in v1.
            confirmation: validation.risk === 'R4' ? 'always' : 'policy',
            security: {
                risk: mapRisk(validation.risk),
                // ⛔ Owner 2026-08-27: "compensable" era dichiarato per
                // QUALSIASI tool di scrittura, ma in v1 nessuna capability
                // built-in ha ancora un vero undo implementato — la
                // scritta mostrata alla persona non manteneva la promessa.
                // Ora `reversibility` riflette `allWritesCompensated`
                // (calcolato da permissionSynthesis.ts), che oggi è
                // sempre falso per un flow con scritture — onesto finché
                // capabilityCatalog.ts non dichiara compensatori veri.
                reversibility: !validation.actions.includes('write')
                    ? 'read-only'
                    : validation.allWritesCompensated ? 'compensable' : 'irreversible',
                readsPrivateData: validation.capabilities.some((id) => id.startsWith('tasks.') || id.startsWith('notes.') || id.startsWith('memory.')),
                readsUntrustedContent: validation.capabilities.some((id) => id === 'web.search' || id.startsWith('notes.') || id.startsWith('memory.')),
                canTransmit: validation.actions.includes('outbound'),
            },
            input: zodFromJsonSchemaSubset(manifest.inputSchema),
            premesse,
            verify,
            async run(input, context): Promise<TalosToolResult> {
                const inputErrors = validateJsonSchemaValue(manifest.inputSchema, input); if (inputErrors.length) return { ok: false, content: inputErrors.join('; '), code: 'TALOS_FORGE_INPUT_INVALID' }
                const result = await executeTalosLocalTool(manifest, input, { capabilities, model }, { signal: context.signal })
                // ⛔ Owner 2026-08-27: costruita PRIMA del ramo ok/non-ok e
                // usata in ENTRAMBI — un `foreach` che fallisce a metà ha
                // comunque creato le voci precedenti per davvero (vedi
                // `ForgeExecutionResult.created`), e nasconderle sul ramo
                // `ok:false` sarebbe la stessa bugia del «Fatto» capovolta.
                const scheda = buildForgeScheda(result.created)
                if (result.status !== 'succeeded') return { ok: false, content: result.error?.message ?? 'Dynamic tool failed.', code: result.status === 'recovery_required' ? 'TALOS_FORGE_RECOVERY_REQUIRED' : (result.error?.code ?? 'TALOS_FORGE_FAILED'), evidence: { forge: { status: result.status, trace: result.trace } }, ...(scheda ? { scheda } : {}) }
                return { ok: true, content: typeof result.output === 'string' ? result.output : JSON.stringify(result.output), evidence: { forge: { status: result.status, tool_id: manifest.id, version: manifest.version, trace: result.trace } }, ...(scheda ? { scheda } : {}) }
            },
        }
        tools.push(tool as TalosToolDefinition<never>)
    }
    return tools
}

export async function dynamicToolEnabled(name: string): Promise<boolean> {
    const id = dynamicToolIdFromName(name); if (!id) return false
    return (await listForgeTools()).some((record) => record.manifest.id === id && record.enabled)
}
