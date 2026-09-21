import type { ForgeCondition, ForgeExpr, ForgeRef } from './contracts'

export function isForgeRef(value: unknown): value is ForgeRef {
    return !!value && typeof value === 'object' && !Array.isArray(value)
        && Object.keys(value as object).length === 1
        && typeof (value as ForgeRef).$ref === 'string'
}

/**
 * ⛔⛔⛔ Owner 2026-08-27 — prototype pollution CONFERMATA, non ipotetica.
 *
 * `setPath`/`getPath` indicizzavano `current[part]` senza NESSUN controllo
 * sui segmenti. Un manifest con un `target`/`$ref` tipo `__proto__.polluted`
 * scriveva letteralmente su `Object.prototype` — non del tool forgiato, di
 * TUTTA la pagina WebView in quel processo (verificato leggendo il codice,
 * non testato in produzione). Ricerca 2026: lodash ha ancora CVE di
 * prototype pollution nel 2026 (CVE-2026-2950) nonostante anni di patch a
 * `merge`/`set` — un bypass storico è passato per path array-wrapped che
 * scavalcavano un denylist testuale. ⇒ Due difese indipendenti, non una
 * sola (OWASP Prototype Pollution Prevention Cheat Sheet): una grammatica
 * ALLOWLIST (non solo un denylist di parole) qui sotto, E oggetti a
 * prototipo nullo in `setPath` — se una delle due avesse un buco, l'altra
 * tiene comunque.
 *
 * I path del DSL sono SEMPRE statici, scritti nel manifest a tempo di
 * installazione (`ForgeRef.$ref` è una stringa letterale nel JSON, mai
 * costruita da una variabile a runtime) — quindi `validator.ts` è la difesa
 * PRIMARIA (rifiuta il manifest con un diagnostico pulito). Questa è la
 * difesa di riserva: se qualcosa sfuggisse alla validazione, l'interprete
 * si rifiuta comunque di toccare un segmento pericoloso.
 */
const MAX_PATH_SEGMENTS = 16
const MAX_SEGMENT_LENGTH = 64
const SAFE_SEGMENT = /^[A-Za-z0-9_-]+$/
/** Nomi che su un oggetto con prototipo normale non sono chiavi qualunque. */
const FORBIDDEN_SEGMENTS: ReadonlySet<string> = new Set([
    '__proto__', 'constructor', 'prototype',
    '__defineGetter__', '__defineSetter__', '__lookupGetter__', '__lookupSetter__',
])
/**
 * ⛔⛔ Owner 2026-08-27 — confrontando col pacchetto "hardened final"
 * dell'owner: `input`/`runtime` sono scritti UNA VOLTA sola, all'avvio
 * dell'esecuzione (`Object.assign(..., {input, state, runtime})` in
 * interpreter.ts), e da lì in poi sono dati di sola lettura per il DAG —
 * ma `setPath` non lo imponeva. Un `set`/`capability`/`llm`.target, o un
 * `foreach.itemVar`/`indexVar` chiamato letteralmente `input` o `runtime`,
 * poteva sovrascriverli A META' ESECUZIONE: il primo corrompe il valore
 * che ogni `$ref: '$.input.*'} successivo legge, il secondo può riscrivere
 * `runtime.executionId` — la stessa chiave usata per l'idempotenza. Non
 * dimostrato sfruttabile qui, ma la stessa disciplina "due difese
 * indipendenti" applicata al resto del file: `$.state.*` resta l'unica
 * radice scrivibile da un manifest.
 */
const RESERVED_WRITE_ROOTS: ReadonlySet<string> = new Set(['input', 'runtime'])

function rawSegments(path: string): string[] {
    const normalized = path.startsWith('$.') ? path.slice(2) : path === '$' ? '' : path
    return normalized.split('.').filter(Boolean)
}

/**
 * Perché un path è rifiutato, o `null` se è sicuro. Non lancia: è la forma
 * che `validator.ts` usa per produrre un diagnostico pulito invece di far
 * esplodere l'installazione — lo stesso principio per cui `outboundScope`
 * mancante non deve lanciare un'eccezione non gestita.
 */
export function forgePathViolation(path: string, options: { writable?: boolean } = {}): string | null {
    const parts = rawSegments(path)
    if (parts.length > MAX_PATH_SEGMENTS) return `path exceeds ${MAX_PATH_SEGMENTS} segments`
    for (const part of parts) {
        if (part.length > MAX_SEGMENT_LENGTH) return `segment "${part}" exceeds ${MAX_SEGMENT_LENGTH} characters`
        if (!SAFE_SEGMENT.test(part)) return `segment "${part}" must be alphanumeric, "_" or "-" only`
        if (FORBIDDEN_SEGMENTS.has(part)) return `segment "${part}" is forbidden`
    }
    if (options.writable && parts[0] && RESERVED_WRITE_ROOTS.has(parts[0])) {
        return `"${parts[0]}" is read-only; write to "state" instead`
    }
    return null
}

/** La forma che lancia — usata dal runtime, dove un path pericoloso non è
 * più un errore d'installazione recuperabile: è già troppo tardi. */
function segments(path: string, options: { writable?: boolean } = {}): string[] {
    const violation = forgePathViolation(path, options)
    if (violation) throw new Error(`TALOS_FORGE_PATH_UNSAFE:${violation}`)
    return rawSegments(path)
}

export function getPath(root: unknown, path: string): unknown {
    if (path === '$') return root
    let current: unknown = root
    for (const segment of segments(path)) {
        if (current === null || typeof current !== 'object') return undefined
        if (Array.isArray(current) && /^\d+$/.test(segment)) { current = current[Number(segment)]; continue }
        // ⛔ Owner 2026-08-27, confronto col pacchetto "hardened final":
        // senza `hasOwnProperty`, un segmento come `toString` (non nella
        // denylist a nomi fissi sopra, perché di per sé non pericoloso da
        // SCRIVERE) restituiva silenziosamente `Object.prototype.toString`
        // — una funzione, non `undefined` — per qualunque oggetto che non
        // avesse quella chiave propria. Di sola lettura, non sfruttabile
        // per inquinare il prototipo, ma un valore sbagliato restituito
        // senza errore è comunque un difetto: la catena del prototipo non
        // è mai un posto dove `$ref` dovrebbe poter guardare.
        if (!Object.prototype.hasOwnProperty.call(current, segment)) return undefined
        current = (current as Record<string, unknown>)[segment]
    }
    return current
}

export function setPath(root: Record<string, unknown>, path: string, value: unknown): void {
    const parts = segments(path, { writable: true })
    if (parts.length === 0) throw new Error('TALOS_FORGE_SET_ROOT_FORBIDDEN')
    let current: Record<string, unknown> = root
    for (const part of parts.slice(0, -1)) {
        const existing = current[part]
        // Object.create(null): anche se un segmento pericoloso sfuggisse
        // alla grammatica sopra, un contenitore senza prototipo non ha un
        // `__proto__` accessor da invocare — la seconda difesa indipendente.
        if (!existing || typeof existing !== 'object' || Array.isArray(existing)) {
            current[part] = Object.create(null) as Record<string, unknown>
        }
        current = current[part] as Record<string, unknown>
    }
    current[parts[parts.length - 1]!] = value
}

/**
 * Ogni `$ref` raggiungibile dentro un'espressione, per la validazione a
 * tempo d'installazione (`validator.ts`) — stessa forma ricorsiva di
 * `resolveExpr`, ma raccoglie i path invece di risolverli contro `vars`.
 */
export function collectForgeRefPaths(expr: ForgeExpr, into: string[] = []): string[] {
    if (isForgeRef(expr)) { into.push(expr.$ref); return into }
    if (Array.isArray(expr)) { for (const entry of expr) collectForgeRefPaths(entry, into); return into }
    if (expr && typeof expr === 'object') {
        for (const value of Object.values(expr as Record<string, unknown>)) collectForgeRefPaths(value, into)
        return into
    }
    return into
}

export function resolveExpr(expr: ForgeExpr, vars: Record<string, unknown>): unknown {
    if (isForgeRef(expr)) return getPath(vars, expr.$ref)
    if (Array.isArray(expr)) return expr.map((entry) => resolveExpr(entry, vars))
    if (expr && typeof expr === 'object') {
        return Object.fromEntries(Object.entries(expr as Record<string, unknown>)
            .map(([key, value]) => [key, resolveExpr(value, vars)]))
    }
    return expr
}

export function evaluateCondition(condition: ForgeCondition, vars: Record<string, unknown>): boolean {
    const left = resolveExpr(condition.left, vars)
    const right = resolveExpr(condition.right, vars)
    switch (condition.op) {
        case 'eq': return Object.is(left, right)
        case 'neq': return !Object.is(left, right)
        case 'truthy': return Boolean(left)
        case 'exists': return left !== undefined && left !== null
        case 'contains': return typeof left === 'string'
            ? left.includes(String(right ?? ''))
            : Array.isArray(left) ? left.some((entry) => Object.is(entry, right)) : false
        case 'gt': return typeof left === 'number' && typeof right === 'number' && left > right
        case 'gte': return typeof left === 'number' && typeof right === 'number' && left >= right
        case 'lt': return typeof left === 'number' && typeof right === 'number' && left < right
        case 'lte': return typeof left === 'number' && typeof right === 'number' && left <= right
    }
}
