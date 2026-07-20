import { createHash, randomUUID } from 'node:crypto'
import { constants, type Stats } from 'node:fs'
import { lstat, mkdir, open, realpath, rename, rm } from 'node:fs/promises'
import { basename, dirname, isAbsolute, relative, resolve, sep } from 'node:path'
import {
    HUMAN_JOURNEY_SCHEMA_VERSION,
    HumanJourneyEvidenceManifestSchema,
    type HumanJourneyEvidenceManifest,
} from '../contracts'

const MAX_ARTIFACT_COUNT = 256
const MAX_CONTRACT_ARTIFACT_BYTES = 10 * 1024 * 1024 * 1024
const DEFAULT_MAX_ARTIFACT_BYTES = 512 * 1024 * 1024
const MAX_SECRET_CANARIES = 64
const MAX_SECRET_CANARY_BYTES = 1_024
const REDACTED = '[REDACTED]'

type EvidenceArtifact = HumanJourneyEvidenceManifest['artifacts'][number]

export interface HumanJourneyEvidenceCandidate {
    id: string
    kind: EvidenceArtifact['kind']
    relativePath: string
    mediaType: string
    retained: boolean
}

export interface HumanJourneyEvidenceCollectionRequest {
    trialId: string
    scenarioId: string
    artifacts: HumanJourneyEvidenceCandidate[]
    redaction: {
        applied: boolean
        notes: string[]
    }
    createdAt: string
}

export interface HumanJourneyEvidenceCollectorOptions {
    workspaceRoot: string
    artifactRoot: string
    secretCanaries: string[]
    maxArtifactBytes?: number
}

type OwnedRoots = {
    workspaceRoot: string
    artifactRoot: string
    manifestRoot: string
}

export class HumanJourneyEvidenceCollector {
    private readonly workspaceRoot: string
    private readonly artifactRoot: string
    private readonly secretCanaries: Buffer[]
    private readonly maxArtifactBytes: number

    constructor(options: HumanJourneyEvidenceCollectorOptions) {
        this.workspaceRoot = resolve(options.workspaceRoot)
        this.artifactRoot = resolve(options.artifactRoot)
        this.secretCanaries = validateSecretCanaries(options.secretCanaries)
        this.maxArtifactBytes = validateArtifactByteLimit(options.maxArtifactBytes)
    }

    async writeRedactedJson(relativePath: string, value: unknown): Promise<void> {
        validateRelativePath(relativePath)
        const roots = await this.resolveOwnedRoots()
        const targetPath = resolveCandidatePath(roots.artifactRoot, relativePath)
        await ensureOwnedParentDirectory(roots.artifactRoot, dirname(targetPath))
        await rejectSymbolicOrNonRegularTarget(targetPath)

        const canonical = `${JSON.stringify(redactCanonicalValue(value, new Set<object>()))}\n`
        const temporaryPath = resolve(dirname(targetPath), `.${basename(targetPath)}.${process.pid}.${randomUUID()}.tmp`)
        const handle = await open(temporaryPath, 'wx', 0o600)

        try {
            await handle.writeFile(canonical, 'utf8')
            await handle.sync()
            await handle.close()
            await rename(temporaryPath, targetPath)
        } catch (error) {
            await handle.close().catch(() => undefined)
            await rm(temporaryPath, { force: true }).catch(() => undefined)
            throw error
        }
    }

    async collect(request: HumanJourneyEvidenceCollectionRequest): Promise<HumanJourneyEvidenceManifest> {
        validateCandidateSet(request.artifacts)
        const roots = await this.resolveOwnedRoots()
        const artifacts: EvidenceArtifact[] = []

        for (const candidate of [...request.artifacts].sort((left, right) => lexicalCompare(left.id, right.id))) {
            const filePath = resolveCandidatePath(roots.artifactRoot, candidate.relativePath)
            await assertOwnedRegularFile(roots.artifactRoot, filePath)
            const digest = await hashAndInspectFile(filePath, this.secretCanaries, this.maxArtifactBytes)
            artifacts.push({
                id: candidate.id,
                kind: candidate.kind,
                relative_path: candidate.relativePath,
                media_type: candidate.mediaType,
                bytes: digest.bytes,
                sha256: digest.sha256,
                retained: candidate.retained,
            })
        }

        const manifest: unknown = {
            contract: 'talos.human_journey.evidence_manifest',
            schema_version: HUMAN_JOURNEY_SCHEMA_VERSION,
            trial_id: request.trialId,
            scenario_id: request.scenarioId,
            root: roots.manifestRoot,
            artifacts,
            redaction: {
                applied: request.redaction.applied,
                secret_canary_absent: true,
                notes: [...request.redaction.notes],
            },
            created_at: request.createdAt,
        }

        const parsed = HumanJourneyEvidenceManifestSchema.safeParse(manifest)
        if (!parsed.success) {
            throw new Error(`Human journey evidence manifest contract rejected output: ${parsed.error.message}`)
        }

        return parsed.data
    }

    private async resolveOwnedRoots(): Promise<OwnedRoots> {
        await rejectSymbolicPath(this.workspaceRoot, this.workspaceRoot)
        await rejectSymbolicPath(this.workspaceRoot, this.artifactRoot)

        const [workspaceRoot, artifactRoot] = await Promise.all([
            realpath(this.workspaceRoot),
            realpath(this.artifactRoot),
        ])
        const manifestRoot = slashRelative(workspaceRoot, artifactRoot)
        if (!isStrictDescendant(manifestRoot)) {
            throw new Error('Evidence artifact root must be a real directory inside the owned workspace root.')
        }

        return { workspaceRoot, artifactRoot, manifestRoot }
    }
}

function validateSecretCanaries(values: string[]): Buffer[] {
    if (!Array.isArray(values) || values.length === 0 || values.length > MAX_SECRET_CANARIES) {
        throw new Error(`secretCanaries must contain between 1 and ${MAX_SECRET_CANARIES} values.`)
    }

    const seen = new Set<string>()
    return values.map((value) => {
        if (typeof value !== 'string') {
            throw new Error('Every secret canary must be a string.')
        }
        const encoded = Buffer.from(value, 'utf8')
        if (encoded.byteLength === 0 || encoded.byteLength > MAX_SECRET_CANARY_BYTES) {
            throw new Error(`Every secret canary must contain between 1 and ${MAX_SECRET_CANARY_BYTES} UTF-8 bytes.`)
        }
        const identity = encoded.toString('hex')
        if (seen.has(identity)) {
            throw new Error('Secret canaries must be unique.')
        }
        seen.add(identity)
        return encoded
    })
}

function validateArtifactByteLimit(value: number | undefined): number {
    const limit = value ?? DEFAULT_MAX_ARTIFACT_BYTES
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > MAX_CONTRACT_ARTIFACT_BYTES) {
        throw new Error(`maxArtifactBytes must be an integer between 1 and ${MAX_CONTRACT_ARTIFACT_BYTES}.`)
    }
    return limit
}

function validateCandidateSet(candidates: HumanJourneyEvidenceCandidate[]): void {
    if (!Array.isArray(candidates) || candidates.length > MAX_ARTIFACT_COUNT) {
        throw new Error(`Evidence collection accepts at most ${MAX_ARTIFACT_COUNT} explicit artifacts.`)
    }

    const ids = new Set<string>()
    const paths = new Set<string>()
    for (const candidate of candidates) {
        validateRelativePath(candidate.relativePath)
        if (ids.has(candidate.id)) {
            throw new Error(`Duplicate artifact ID: ${candidate.id}`)
        }
        if (paths.has(candidate.relativePath)) {
            throw new Error(`Duplicate artifact path: ${candidate.relativePath}`)
        }
        ids.add(candidate.id)
        paths.add(candidate.relativePath)
    }
}

function validateRelativePath(value: string): void {
    const segments = typeof value === 'string' ? value.split('/') : []
    if (
        typeof value !== 'string'
        || value.length === 0
        || value.length > 1_024
        || value.includes('\\')
        || value.startsWith('/')
        || isAbsolute(value)
        || /^[A-Za-z]:/.test(value)
        || /[\u0000-\u001f\u007f]/.test(value)
        || segments.includes('')
        || segments.includes('.')
        || segments.includes('..')
    ) {
        throw new Error('Evidence path must be relative, slash-normalized and traversal-free.')
    }
}

function resolveCandidatePath(root: string, relativePath: string): string {
    const target = resolve(root, ...relativePath.split('/'))
    const relation = relative(root, target)
    if (!isStrictDescendant(relation)) {
        throw new Error('Evidence path must stay inside the owned artifact root.')
    }
    return target
}

async function rejectSymbolicPath(root: string, target: string): Promise<void> {
    const rootAbsolute = resolve(root)
    const targetAbsolute = resolve(target)
    const relation = relative(rootAbsolute, targetAbsolute)
    if (relation !== '' && !isStrictDescendant(relation)) {
        throw new Error('Evidence path is outside the owned root.')
    }

    const paths = [rootAbsolute]
    if (relation !== '') {
        let cursor = rootAbsolute
        for (const segment of relation.split(sep)) {
            cursor = resolve(cursor, segment)
            paths.push(cursor)
        }
    }

    for (const path of paths) {
        const status = await lstat(path)
        if (status.isSymbolicLink()) {
            throw new Error('Evidence paths may not contain a symbolic link or junction inside the owned root.')
        }
    }
}

async function assertOwnedRegularFile(root: string, target: string): Promise<void> {
    await rejectSymbolicPath(root, target)
    const status = await lstat(target)
    if (!status.isFile()) {
        throw new Error('Evidence candidates must resolve to regular files inside the owned root.')
    }

    const [realRoot, realTarget] = await Promise.all([realpath(root), realpath(target)])
    if (!isStrictDescendant(relative(realRoot, realTarget))) {
        throw new Error('Evidence file resolved outside the owned root.')
    }
}

async function ensureOwnedParentDirectory(root: string, targetDirectory: string): Promise<void> {
    const relation = relative(root, targetDirectory)
    if (relation !== '' && !isStrictDescendant(relation)) {
        throw new Error('Evidence output path is outside the owned root.')
    }

    let cursor = root
    for (const segment of relation === '' ? [] : relation.split(sep)) {
        cursor = resolve(cursor, segment)
        try {
            const status = await lstat(cursor)
            if (status.isSymbolicLink() || !status.isDirectory()) {
                throw new Error('Evidence output directories may not be symbolic links or non-directories.')
            }
        } catch (error) {
            if (!isFileNotFound(error)) throw error
            await mkdir(cursor)
            const status = await lstat(cursor)
            if (status.isSymbolicLink() || !status.isDirectory()) {
                throw new Error('Evidence output directory creation did not produce an owned directory.')
            }
        }
    }
}

async function rejectSymbolicOrNonRegularTarget(target: string): Promise<void> {
    try {
        const status = await lstat(target)
        if (status.isSymbolicLink() || !status.isFile()) {
            throw new Error('Evidence output target must be a regular file and may not be a symbolic link.')
        }
    } catch (error) {
        if (!isFileNotFound(error)) throw error
    }
}

async function hashAndInspectFile(path: string, canaries: Buffer[], maxBytes: number): Promise<{ bytes: number, sha256: string }> {
    const noFollow = 'O_NOFOLLOW' in constants ? constants.O_NOFOLLOW : 0
    const handle = await open(path, constants.O_RDONLY | noFollow)
    try {
        const status = await handle.stat()
        assertRegularFileWithinLimit(status, maxBytes)

        const hash = createHash('sha256')
        const longestCanary = Math.max(...canaries.map((canary) => canary.byteLength))
        let trailing = Buffer.alloc(0)
        let bytes = 0

        for await (const value of handle.createReadStream({ autoClose: false })) {
            const chunk = Buffer.isBuffer(value) ? value : Buffer.from(value)
            bytes += chunk.byteLength
            if (bytes > maxBytes) {
                throw new Error(`Evidence artifact exceeds the configured byte limit of ${maxBytes}.`)
            }
            hash.update(chunk)

            const searchable = trailing.byteLength === 0 ? chunk : Buffer.concat([trailing, chunk])
            if (canaries.some((canary) => searchable.indexOf(canary) !== -1)) {
                throw new Error('Evidence artifact contains a configured secret canary.')
            }
            trailing = longestCanary <= 1
                ? Buffer.alloc(0)
                : searchable.subarray(Math.max(0, searchable.byteLength - longestCanary + 1))
        }

        if (bytes !== status.size) {
            throw new Error('Evidence artifact changed while its retained bytes were being hashed.')
        }
        return { bytes, sha256: hash.digest('hex') }
    } finally {
        await handle.close().catch(() => undefined)
    }
}

function assertRegularFileWithinLimit(status: Stats, maxBytes: number): void {
    if (!status.isFile()) {
        throw new Error('Evidence candidates must be regular files.')
    }
    if (status.size > maxBytes) {
        throw new Error(`Evidence artifact exceeds the configured byte limit of ${maxBytes}.`)
    }
}

function redactCanonicalValue(value: unknown, active: Set<object>): unknown {
    if (value === null || typeof value === 'string' || typeof value === 'boolean') return value
    if (typeof value === 'number') {
        if (!Number.isFinite(value)) throw new Error('Evidence JSON may contain only finite numbers.')
        return value
    }
    if (typeof value !== 'object') {
        throw new Error('Evidence JSON may contain only JSON-compatible values.')
    }
    if (active.has(value)) {
        throw new Error('Evidence JSON may not contain cycles.')
    }

    active.add(value)
    try {
        if (Array.isArray(value)) {
            const result: unknown[] = []
            result.length = value.length
            for (let index = 0; index < value.length; index += 1) {
                const descriptor = Object.getOwnPropertyDescriptor(value, String(index))
                if (descriptor === undefined) continue
                if (!('value' in descriptor)) {
                    throw new Error('Evidence JSON may not execute accessor properties during canonicalization.')
                }
                result[index] = redactCanonicalValue(descriptor.value, active)
            }
            return result
        }

        const prototype = Object.getPrototypeOf(value)
        if (prototype !== Object.prototype && prototype !== null) {
            throw new Error('Evidence JSON objects must use a plain object prototype.')
        }

        const result = Object.create(null) as Record<string, unknown>
        const descriptors = Object.getOwnPropertyDescriptors(value)
        for (const key of Object.keys(value).sort(lexicalCompare)) {
            const descriptor = descriptors[key]
            if (descriptor === undefined || !('value' in descriptor)) {
                throw new Error('Evidence JSON may not execute accessor properties during canonicalization.')
            }
            result[key] = isSecretLikeKey(key, descriptor.value) ? REDACTED : redactCanonicalValue(descriptor.value, active)
        }
        return result
    } finally {
        active.delete(value)
    }
}

function isSecretLikeKey(key: string, value: unknown): boolean {
    const normalized = key.replace(/[^a-z0-9]/gi, '').toLowerCase()
    if (typeof value === 'number' && isTokenUsageMetricKey(normalized)) return false
    return normalized.includes('secret')
        || normalized.includes('token')
        || normalized.includes('password')
        || normalized.includes('apikey')
        || normalized.includes('authorization')
        || normalized.includes('cookie')
}

function isTokenUsageMetricKey(normalized: string): boolean {
    return /^(?:prompt|completion|provider|input|output|reasoning|cached|total)(?:token|tokens|tokencount|tokencounts)$/.test(normalized)
}

function slashRelative(from: string, to: string): string {
    return relative(from, to).split(sep).join('/')
}

function isStrictDescendant(relation: string): boolean {
    return relation !== '' && relation !== '..' && !relation.startsWith(`..${sep}`) && !isAbsolute(relation)
}

function lexicalCompare(left: string, right: string): number {
    return left < right ? -1 : left > right ? 1 : 0
}

function isFileNotFound(error: unknown): error is NodeJS.ErrnoException {
    return error instanceof Error && 'code' in error && error.code === 'ENOENT'
}
