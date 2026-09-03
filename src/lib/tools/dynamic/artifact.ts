import type { TalosLocalToolManifestV1 } from './contracts'
import { scanSecrets } from './secretScanner'
import { validateTalosLocalTool } from './validator'

export interface TalosToolArtifactV1 {
    artifact: 'talos.tool-artifact.v1'
    exportedAt: string
    manifest: TalosLocalToolManifestV1
    integrity: { algorithm: 'sha256'; canonicalSha256: string | null }
    producer: { kind: 'talos-local'; deviceSignature?: string | null }
}

export function canonicalForgeJson(value: unknown): string {
    const sort = (entry: unknown): unknown => {
        if (Array.isArray(entry)) return entry.map(sort)
        if (!entry || typeof entry !== 'object') return entry
        return Object.fromEntries(Object.keys(entry as Record<string, unknown>).sort().map((key) => [key, sort((entry as Record<string, unknown>)[key])]))
    }
    return JSON.stringify(sort(value))
}

export function exportTalosToolArtifact(manifest: TalosLocalToolManifestV1, exportedAt = new Date().toISOString()): TalosToolArtifactV1 {
    const validation = validateTalosLocalTool(manifest)
    if (!validation.ok) throw new Error('TALOS_FORGE_EXPORT_INVALID_MANIFEST')
    if (scanSecrets(manifest).length) throw new Error('TALOS_FORGE_EXPORT_SECRET_FOUND')
    return { artifact: 'talos.tool-artifact.v1', exportedAt, manifest: JSON.parse(JSON.stringify(manifest)), integrity: { algorithm: 'sha256', canonicalSha256: null }, producer: { kind: 'talos-local', deviceSignature: null } }
}

export function importTalosToolArtifact(value: unknown): TalosToolArtifactV1 {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('TALOS_FORGE_IMPORT_INVALID')
    const artifact = value as TalosToolArtifactV1
    if (artifact.artifact !== 'talos.tool-artifact.v1') throw new Error('TALOS_FORGE_IMPORT_SCHEMA')
    if (scanSecrets(artifact).length) throw new Error('TALOS_FORGE_IMPORT_SECRET_FOUND')
    const validation = validateTalosLocalTool(artifact.manifest)
    if (!validation.ok) throw new Error(`TALOS_FORGE_IMPORT_MANIFEST:${validation.diagnostics.filter((d) => d.level === 'error').map((d) => d.code).join(',')}`)
    return artifact
}
