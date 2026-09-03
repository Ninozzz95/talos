import type { ForgeDiagnostic, ForgeFlow, ForgeInlineNode, ForgeNode, ForgeValidationResult, TalosLocalToolManifestV1 } from './contracts'
import { isForgeSlug } from './ids'
import { scanSecrets } from './secretScanner'
import { defaultForgeCapability } from './capabilityCatalog'
import { synthesizeForgePolicy } from './permissionSynthesis'
import { collectForgeRefPaths, forgePathViolation } from './expr'
import { talosLocalToolManifestV1Schema } from './manifestZodSchema'
import { estimateForgeBytes, MAX_MANIFEST_BYTES } from './limits'

const MAX_NODES = 64
const MAX_INLINE = 16
const MAX_TRANSITIONS = 256
const MAX_FOREACH = 100
const DOMAIN = /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/i

function diag(diagnostics: ForgeDiagnostic[], level: ForgeDiagnostic['level'], code: string, path: string, message: string): void {
    diagnostics.push({ level, code, path, message })
}

function nextTargets(node: ForgeNode): string[] {
    switch (node.type) {
        case 'set': case 'capability': case 'llm': case 'foreach': return [node.next]
        case 'if': return [node.then, node.else]
        default: return []
    }
}

function validateRetry(node: { retry?: { maxAttempts: number; backoffMs?: number } }, path: string, diagnostics: ForgeDiagnostic[]): void {
    if (!node.retry) return
    if (!Number.isInteger(node.retry.maxAttempts) || node.retry.maxAttempts < 1 || node.retry.maxAttempts > 3) {
        diag(diagnostics, 'error', 'FORGE_RETRY_BOUNDS', `${path}.retry.maxAttempts`, 'Retry attempts must be 1..3.')
    }
    if (node.retry.backoffMs !== undefined && (!Number.isInteger(node.retry.backoffMs) || node.retry.backoffMs < 0 || node.retry.backoffMs > 5000)) {
        diag(diagnostics, 'error', 'FORGE_RETRY_BACKOFF', `${path}.retry.backoffMs`, 'Backoff must be 0..5000ms.')
    }
}

function validateCapability(node: Extract<ForgeNode | ForgeInlineNode, {type:'capability'}>, path: string, manifest: TalosLocalToolManifestV1, diagnostics: ForgeDiagnostic[]): void {
    const descriptor = defaultForgeCapability(node.capability)
    if (!descriptor) {
        diag(diagnostics, 'error', 'FORGE_CAPABILITY_UNKNOWN', `${path}.capability`, `Unknown capability ${node.capability}.`)
        return
    }
    if (descriptor.network === 'allowlisted' && manifest.network.mode !== 'allowlist') {
        diag(diagnostics, 'error', 'FORGE_NETWORK_NOT_DECLARED', path, `${node.capability} requires explicit network allow-listing.`)
    }
    if (node.compensation && !descriptor.reversible) {
        diag(diagnostics, 'error', 'FORGE_INVALID_COMPENSATION', `${path}.compensation`, 'Irreversible capability cannot claim compensation.')
    }
    if (node.compensation) {
        const compensator = defaultForgeCapability(node.compensation.capability)
        if (!compensator) {
            diag(diagnostics, 'error', 'FORGE_COMPENSATION_UNKNOWN', `${path}.compensation.capability`, 'Unknown compensation capability.')
        } else if (compensator.compensatesFor !== node.capability) {
            // ⛔ Owner 2026-08-27: prima bastava che la capability di
            // compensazione ESISTESSE — una scrittura poteva dichiarare
            // arbitrariamente una capability non correlata (finding
            // critico #4). Ora deve essere registrata come compensatrice
            // DI QUESTA capability, in capabilityCatalog.ts.
            diag(diagnostics, 'error', 'FORGE_COMPENSATION_MISMATCH', `${path}.compensation.capability`, `${node.compensation.capability} does not compensate ${node.capability}.`)
        }
    }
    validateRetry(node, path, diagnostics)
}

/**
 * ⛔⛔ Owner 2026-08-27 — la metà del difetto che `expr.ts` non copre da
 * sola: la grammatica sicura protegge chi RISOLVE un path a runtime, ma un
 * manifest con un `target`/`$ref` pericoloso deve essere rifiutato PRIMA,
 * all'installazione, con un diagnostico — non scoperto la prima volta che
 * il tool gira. Cammina lo stesso albero di `resolveExpr`/`collectForgeRefPaths`,
 * ma per produrre diagnostici invece di lanciare.
 */
/**
 * ⛔ Owner 2026-08-27 — `writable` distingue un path che il DAG LEGGE (un
 * `$ref`, sempre `false`) da uno che il DAG SCRIVE (un `target`/`itemVar`/
 * `indexVar`, sempre `true`). Solo il secondo può violare
 * `RESERVED_WRITE_ROOTS` (expr.ts): un manifest che punta un target a
 * `$.input.*`/`$.runtime.*` ora si rifiuta QUI, all'installazione, non la
 * prima volta che gira — stesso principio del resto di questo file
 * (struttura pericolosa rifiutata con un diagnostico pulito, mai scoperta
 * a runtime).
 */
function validatePath(path: string, contextPath: string, code: string, diagnostics: ForgeDiagnostic[], options: { writable?: boolean } = {}): void {
    const violation = forgePathViolation(path, options)
    if (violation) diag(diagnostics, 'error', code, contextPath, `Unsafe path: ${violation}`)
}

function validateExprPaths(expr: unknown, contextPath: string, diagnostics: ForgeDiagnostic[]): void {
    for (const ref of collectForgeRefPaths(expr)) validatePath(ref, contextPath, 'FORGE_REF_UNSAFE', diagnostics)
}

function validateNodePaths(node: ForgeNode | ForgeInlineNode, path: string, diagnostics: ForgeDiagnostic[]): void {
    switch (node.type) {
        case 'set':
            validatePath(node.target, `${path}.target`, 'FORGE_TARGET_UNSAFE', diagnostics, { writable: true })
            validateExprPaths(node.value, `${path}.value`, diagnostics)
            break
        case 'capability':
            if (node.target) validatePath(node.target, `${path}.target`, 'FORGE_TARGET_UNSAFE', diagnostics, { writable: true })
            validateExprPaths(node.input, `${path}.input`, diagnostics)
            if (node.compensation) validateExprPaths(node.compensation.input, `${path}.compensation.input`, diagnostics)
            break
        case 'llm':
            validatePath(node.target, `${path}.target`, 'FORGE_TARGET_UNSAFE', diagnostics, { writable: true })
            validateExprPaths(node.input, `${path}.input`, diagnostics)
            break
        case 'if':
            validateExprPaths(node.condition.left, `${path}.condition.left`, diagnostics)
            if (node.condition.right !== undefined) validateExprPaths(node.condition.right, `${path}.condition.right`, diagnostics)
            break
        case 'foreach':
            validateExprPaths(node.source, `${path}.source`, diagnostics)
            // itemVar/indexVar diventano segmenti di path in setPath a runtime
            // (interpreter.ts): stessa grammatica, un path di un solo segmento,
            // e la STESSA restrizione di scrittura di ogni altro target.
            validatePath(node.itemVar, `${path}.itemVar`, 'FORGE_VAR_UNSAFE', diagnostics, { writable: true })
            if (node.indexVar) validatePath(node.indexVar, `${path}.indexVar`, 'FORGE_VAR_UNSAFE', diagnostics, { writable: true })
            node.body.forEach((child, childIndex) => validateNodePaths(child, `${path}.body[${childIndex}]`, diagnostics))
            break
        case 'return':
            validateExprPaths(node.value, `${path}.value`, diagnostics)
            break
        case 'fail':
            break
    }
}

/**
 * ⛔ Owner 2026-08-27, Fase 5 — finding della revisione: "structuredOutput
 * è un requisito dichiarativo, non un controllo effettivo". `dichiarare`
 * di volere output strutturato senza dire QUALE struttura è una promessa
 * vuota — `interpreter.ts` non ha niente da validare senza uno schema.
 * Da qui in poi il manifest non installa se manca.
 */
function validateLlm(node: Extract<ForgeNode | ForgeInlineNode, { type: 'llm' }>, path: string, diagnostics: ForgeDiagnostic[]): void {
    if (node.requirements?.structuredOutput === true && !node.outputSchema) {
        diag(diagnostics, 'error', 'FORGE_LLM_STRUCTURED_OUTPUT_MISSING_SCHEMA', path, 'structuredOutput: true requires outputSchema.')
    }
}

function validateFlow(flow: ForgeFlow, manifest: TalosLocalToolManifestV1, diagnostics: ForgeDiagnostic[]): void {
    if (!Number.isInteger(flow.maxTransitions) || flow.maxTransitions < 1 || flow.maxTransitions > MAX_TRANSITIONS) {
        diag(diagnostics, 'error', 'FORGE_TRANSITION_BOUNDS', '$.flow.maxTransitions', `Must be 1..${MAX_TRANSITIONS}.`)
    }
    if (!Array.isArray(flow.nodes) || flow.nodes.length === 0 || flow.nodes.length > MAX_NODES) {
        diag(diagnostics, 'error', 'FORGE_NODE_BOUNDS', '$.flow.nodes', `Node count must be 1..${MAX_NODES}.`)
        return
    }
    const map = new Map<string, ForgeNode>()
    flow.nodes.forEach((node, index) => {
        const path = `$.flow.nodes[${index}]`
        if (!isForgeSlug(node.id)) diag(diagnostics, 'error', 'FORGE_NODE_ID', `${path}.id`, 'Invalid node id.')
        if (map.has(node.id)) diag(diagnostics, 'error', 'FORGE_NODE_DUPLICATE', `${path}.id`, 'Duplicate node id.')
        map.set(node.id, node)
        validateNodePaths(node, path, diagnostics)
        if (node.type === 'capability') validateCapability(node, path, manifest, diagnostics)
        if (node.type === 'llm') validateLlm(node, path, diagnostics)
        if (node.type === 'foreach') {
            if (!Number.isInteger(node.maxItems) || node.maxItems < 1 || node.maxItems > MAX_FOREACH) {
                diag(diagnostics, 'error', 'FORGE_FOREACH_BOUNDS', `${path}.maxItems`, `maxItems must be 1..${MAX_FOREACH}.`)
            }
            if (node.body.length > MAX_INLINE) diag(diagnostics, 'error', 'FORGE_INLINE_BOUNDS', `${path}.body`, `Inline body max ${MAX_INLINE}.`)
            node.body.forEach((child, childIndex) => {
                if (child.type === 'capability') validateCapability(child, `${path}.body[${childIndex}]`, manifest, diagnostics)
                if (child.type === 'llm') validateLlm(child, `${path}.body[${childIndex}]`, diagnostics)
            })
        }
    })
    if (!map.has(flow.entry)) diag(diagnostics, 'error', 'FORGE_ENTRY_MISSING', '$.flow.entry', 'Entry node is missing.')
    for (const node of flow.nodes) for (const target of nextTargets(node)) {
        if (!map.has(target)) diag(diagnostics, 'error', 'FORGE_EDGE_MISSING', `$.flow.nodes.${node.id}`, `Edge target ${target} is missing.`)
    }
    // DAG only. Runtime loops are represented only by bounded foreach.
    const visiting = new Set<string>(), visited = new Set<string>()
    const visit = (id: string) => {
        if (visiting.has(id)) { diag(diagnostics, 'error', 'FORGE_CYCLE', `$.flow.nodes.${id}`, 'Cycles/recursion are forbidden.'); return }
        if (visited.has(id)) return
        const node = map.get(id); if (!node) return
        visiting.add(id); nextTargets(node).forEach(visit); visiting.delete(id); visited.add(id)
    }
    visit(flow.entry)
    for (const id of map.keys()) if (!visited.has(id)) diag(diagnostics, 'warning', 'FORGE_UNREACHABLE_NODE', `$.flow.nodes.${id}`, 'Node is unreachable from entry.')
}

/**
 * ⛔⛔ Owner 2026-08-27 — struttura PRIMA, semantica dopo (vedi
 * manifestZodSchema.ts). Il parametro è `unknown` di proposito, non più
 * `TalosLocalToolManifestV1`: quel tipo era una promessa del compilatore
 * su dati che arrivano da fuori (`.talostool` importato, un record
 * riletto da Preferences) — un cast che sembra un controllo senza esserlo.
 * Ora chi chiama passa quello che ha davvero, e riceve indietro un
 * risultato che dice se e perché non va, invece di un'eccezione a metà
 * strada dentro un campo nidificato.
 */
export function validateTalosLocalTool(candidate: unknown): ForgeValidationResult {
    const diagnostics: ForgeDiagnostic[] = []
    const parsed = talosLocalToolManifestV1Schema.safeParse(candidate)
    if (!parsed.success) {
        for (const issue of parsed.error.issues) {
            diag(diagnostics, 'error', 'FORGE_MANIFEST_STRUCTURE', `$.${issue.path.join('.')}`, issue.message)
        }
        return { ok: false, diagnostics, actions: [], risk: 'R1', capabilities: [], allWritesCompensated: false }
    }
    const manifest = parsed.data

    // ⛔ Owner 2026-08-27, finding critico #3 della revisione: nessun tetto
    // sulla dimensione del manifest era applicato. 64 KB (limits.ts) è
    // largo per un DSL dichiarativo bounded — un manifest più grande sta
    // usando la struttura per portare dati arbitrari, non per descrivere
    // un tool.
    const manifestBytes = estimateForgeBytes(manifest)
    if (manifestBytes > MAX_MANIFEST_BYTES) {
        diag(diagnostics, 'error', 'FORGE_MANIFEST_TOO_LARGE', '$', `Manifest is ${manifestBytes} bytes; max is ${MAX_MANIFEST_BYTES}.`)
    }

    if (!isForgeSlug(manifest.id)) diag(diagnostics, 'error', 'FORGE_ID', '$.id', 'Tool id must be a 3..64 lowercase slug.')
    if (manifest.version < 1) diag(diagnostics, 'error', 'FORGE_VERSION', '$.version', 'Version must be a positive integer.')
    if (!manifest.title.trim() || manifest.title.length > 120) diag(diagnostics, 'error', 'FORGE_TITLE', '$.title', 'Title must be 1..120 characters.')
    if (!manifest.description.trim() || manifest.description.length > 1000) diag(diagnostics, 'error', 'FORGE_DESCRIPTION', '$.description', 'Description must be 1..1000 characters.')
    if (manifest.network.mode === 'forbidden' && manifest.network.domains.length > 0) {
        diag(diagnostics, 'error', 'FORGE_NETWORK_CONTRADICTION', '$.network', 'Forbidden network mode cannot contain domains.')
    }
    if (manifest.network.mode === 'allowlist') {
        manifest.network.domains.forEach((domain, index) => {
            if (!DOMAIN.test(domain) || domain.includes('*')) {
                diag(diagnostics, 'error', 'FORGE_DOMAIN_INVALID', `$.network.domains[${index}]`, 'Use an exact DNS hostname; wildcards are forbidden in v1.')
            }
        })
    }
    manifest.credentialRequirements.forEach((requirement, index) => {
        if (!isForgeSlug(requirement.id)) diag(diagnostics, 'error', 'FORGE_CREDENTIAL_ID', `$.credentialRequirements[${index}].id`, 'Invalid credential slot id.')
        for (const domain of requirement.outboundScope) {
            if (!manifest.network.domains.includes(domain)) {
                diag(diagnostics, 'error', 'FORGE_CREDENTIAL_SCOPE', `$.credentialRequirements[${index}].outboundScope`, `${domain} is not in the tool network allow-list.`)
            }
        }
    })
    scanSecrets(manifest).forEach((finding) => diag(diagnostics, 'error', 'FORGE_SECRET_FOUND', finding.path, finding.reason))
    validateFlow(manifest.flow, manifest, diagnostics)
    const synthesized = synthesizeForgePolicy(manifest.flow, defaultForgeCapability)
    if (manifest.network.mode === 'forbidden' && synthesized.actions.includes('outbound')) {
        diag(diagnostics, 'error', 'FORGE_OUTBOUND_FORBIDDEN', '$.flow', 'Reachable graph requires outbound while network mode is forbidden.')
    }
    return {
        ok: !diagnostics.some((entry) => entry.level === 'error'),
        diagnostics,
        actions: synthesized.actions,
        risk: synthesized.risk,
        capabilities: synthesized.capabilities,
        allWritesCompensated: synthesized.allWritesCompensated,
    }
}
