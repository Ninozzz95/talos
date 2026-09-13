import { forgePathViolation, getPath, setPath } from './expr'
export type ForgeStateMigrationOp =
    | { op: 'rename'; from: string; to: string }
    | { op: 'delete'; path: string }
    | { op: 'setDefault'; path: string; value: unknown }
    | { op: 'mapEnum'; path: string; values: Record<string, string> }

/**
 * ⛔ Owner 2026-08-27: prima di questo fix `del()` aveva la SUA copia della
 * logica di path (`path.replace(/^\$\.?/, '')...`, leggermente diversa da
 * quella di expr.ts) e indicizzava `current[part]` senza nessuna delle due
 * difese contro la prototype pollution di expr.ts — lo stesso difetto,
 * duplicato invece di riusato. Ora riusa `forgePathViolation` (stessa
 * grammatica allowlist) invece di reimplementarla.
 */
function del(root: Record<string, unknown>, path: string): void {
    if (forgePathViolation(path)) return
    const parts = path.replace(/^\$\.?/, '').split('.').filter(Boolean); if (!parts.length) return
    let current: Record<string, unknown> = root
    for (const part of parts.slice(0, -1)) { const next = current[part]; if (!next || typeof next !== 'object' || Array.isArray(next)) return; current = next as Record<string, unknown> }
    delete current[parts.at(-1)!]
}
export function migrateForgeState(input: Record<string, unknown>, ops: readonly ForgeStateMigrationOp[]): Record<string, unknown> {
    const output = JSON.parse(JSON.stringify(input)) as Record<string, unknown>
    for (const op of ops) {
        if (op.op === 'rename') { const value = getPath(output, op.from); if (value !== undefined) { setPath(output, op.to, value); del(output, op.from) } }
        else if (op.op === 'delete') del(output, op.path)
        else if (op.op === 'setDefault') { if (getPath(output, op.path) === undefined) setPath(output, op.path, op.value) }
        else { const value = getPath(output, op.path); if (typeof value === 'string' && op.values[value] !== undefined) setPath(output, op.path, op.values[value]) }
    }
    return output
}
