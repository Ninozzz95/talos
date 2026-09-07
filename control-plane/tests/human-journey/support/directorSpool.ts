import { createHash, createHmac, randomUUID, timingSafeEqual } from 'node:crypto'
import { constants } from 'node:fs'
import { lstat, mkdir, open, realpath, rename, rm } from 'node:fs/promises'
import { isAbsolute, relative, resolve } from 'node:path'
import { setTimeout as sleep } from 'node:timers/promises'
import { z } from 'zod'
import {
    DirectorCheckpointSchema,
    DirectorDecisionSchema,
    HUMAN_JOURNEY_SCHEMA_VERSION,
    type DirectorCheckpoint,
    type DirectorDecision,
} from '../contracts'

const IDENTIFIER_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/
const SHA256_PATTERN = /^[a-f0-9]{64}$/
const MIN_TOKEN_BYTES = 32
const MAX_TOKEN_BYTES = 128
const MAX_JSON_BYTES = 256 * 1024
const MIN_POLL_INTERVAL_MS = 10
const MAX_POLL_INTERVAL_MS = 1_000
const MIN_TIMEOUT_MS = 100
const MAX_TIMEOUT_MS = 120_000

const sha256 = z.string().regex(SHA256_PATTERN)
const trialToken = z.string().min(1).max(256).superRefine((value, context) => {
    try {
        const decoded = Buffer.from(value, 'base64url')
        if (
            decoded.byteLength < MIN_TOKEN_BYTES
            || decoded.byteLength > MAX_TOKEN_BYTES
            || decoded.toString('base64url') !== value
        ) {
            context.addIssue({ code: 'custom', message: 'Director trial token must be canonical base64url encoding of 32-128 bytes.' })
        }
    } catch {
        context.addIssue({ code: 'custom', message: 'Director trial token must be valid base64url.' })
    }
})

export const DirectorSpoolRequestEnvelopeSchema = z.strictObject({
    contract: z.literal('talos.human_journey.director_spool_request'),
    schema_version: z.literal(HUMAN_JOURNEY_SCHEMA_VERSION),
    checkpoint: DirectorCheckpointSchema,
    request_sha256: sha256,
    trial_token_sha256: sha256,
}).superRefine((value, context) => {
    if (value.checkpoint.observation_sha256 !== hashDirectorValue(value.checkpoint.observation)) {
        context.addIssue({ code: 'custom', message: 'Director checkpoint observation hash does not match the visible observation.' })
    }
    if (value.request_sha256 !== hashDirectorValue(value.checkpoint)) {
        context.addIssue({ code: 'custom', message: 'Director request hash does not match the checkpoint.' })
    }
})
export type DirectorSpoolRequestEnvelope = z.infer<typeof DirectorSpoolRequestEnvelopeSchema>

export const DirectorSpoolResponseEnvelopeSchema = z.strictObject({
    contract: z.literal('talos.human_journey.director_spool_response'),
    schema_version: z.literal(HUMAN_JOURNEY_SCHEMA_VERSION),
    decision: DirectorDecisionSchema,
    auth_hmac_sha256: sha256,
})
export type DirectorSpoolResponseEnvelope = z.infer<typeof DirectorSpoolResponseEnvelopeSchema>

export type DirectorSpoolErrorCode =
    | 'DIRECTOR_INVALID_CONFIGURATION'
    | 'DIRECTOR_PATH_OUTSIDE_ROOT'
    | 'DIRECTOR_PATH_SYMBOLIC'
    | 'DIRECTOR_REQUEST_CONFLICT'
    | 'DIRECTOR_REQUEST_INVALID'
    | 'DIRECTOR_RESPONSE_CONFLICT'
    | 'DIRECTOR_RESPONSE_MALFORMED'
    | 'DIRECTOR_RESPONSE_TOO_LARGE'
    | 'DIRECTOR_RESPONSE_BINDING_MISMATCH'
    | 'DIRECTOR_RESPONSE_TOKEN_MISMATCH'
    | 'DIRECTOR_RESPONSE_EXPIRED'
    | 'DIRECTOR_RESPONSE_REPLAYED'
    | 'DIRECTOR_RESPONSE_TIMEOUT'
    | 'DIRECTOR_RESPONSE_CANCELLED'

export class DirectorSpoolError extends Error {
    readonly code: DirectorSpoolErrorCode

    constructor(code: DirectorSpoolErrorCode, message: string, options?: ErrorOptions) {
        super(message, options)
        this.name = 'DirectorSpoolError'
        this.code = code
    }
}

export interface DirectorSpoolOptions {
    rootDirectory: string
    trialId: string
    trialToken: string
    pollIntervalMs?: number
}

export interface DirectorSpoolPaths {
    requestDirectory: string
    requestPath: string
    responsePath: string
    responsePublishLockPath: string
    consumedResponsePath: string
    consumeLockPath: string
}

export interface DirectorDecisionWaitOptions {
    timeoutMs: number
    signal?: AbortSignal
}

export function hashDirectorValue(value: unknown): string {
    const canonical = canonicalize(value, new Set<object>())
    return createHash('sha256').update(JSON.stringify(canonical)).digest('hex')
}

export class DirectorSpool {
    private readonly rootDirectory: string
    private readonly trialId: string
    private readonly trialToken: string
    private readonly trialTokenSha256: string
    private readonly pollIntervalMs: number

    constructor(options: DirectorSpoolOptions) {
        if (typeof options.rootDirectory !== 'string' || !isAbsolute(options.rootDirectory)) {
            throw new DirectorSpoolError('DIRECTOR_INVALID_CONFIGURATION', 'Director spool root must be an absolute owned path.')
        }
        assertIdentifier(options.trialId, 'trial')
        const parsedToken = trialToken.safeParse(options.trialToken)
        if (!parsedToken.success) {
            throw new DirectorSpoolError('DIRECTOR_INVALID_CONFIGURATION', 'Director trial token is invalid.', { cause: parsedToken.error })
        }
        const pollIntervalMs = options.pollIntervalMs ?? 50
        if (!Number.isSafeInteger(pollIntervalMs) || pollIntervalMs < MIN_POLL_INTERVAL_MS || pollIntervalMs > MAX_POLL_INTERVAL_MS) {
            throw new DirectorSpoolError(
                'DIRECTOR_INVALID_CONFIGURATION',
                `Director poll interval must be an integer between ${MIN_POLL_INTERVAL_MS} and ${MAX_POLL_INTERVAL_MS} ms.`,
            )
        }

        this.rootDirectory = resolve(options.rootDirectory)
        this.trialId = options.trialId
        this.trialToken = parsedToken.data
        this.trialTokenSha256 = hashToken(parsedToken.data)
        this.pollIntervalMs = pollIntervalMs
    }

    pathsFor(requestId: string): DirectorSpoolPaths {
        assertIdentifier(requestId, 'request')
        const trialDirectory = resolve(this.rootDirectory, this.trialId)
        const requestDirectory = resolve(trialDirectory, requestId)
        assertStrictDescendant(this.rootDirectory, trialDirectory)
        assertStrictDescendant(trialDirectory, requestDirectory)

        return {
            requestDirectory,
            requestPath: resolve(requestDirectory, 'request.json'),
            responsePath: resolve(requestDirectory, 'response.json'),
            responsePublishLockPath: resolve(requestDirectory, 'response.publish.lock'),
            consumedResponsePath: resolve(requestDirectory, 'response.consumed.json'),
            consumeLockPath: resolve(requestDirectory, 'consume.lock'),
        }
    }

    async publishCheckpoint(rawCheckpoint: DirectorCheckpoint): Promise<DirectorSpoolRequestEnvelope> {
        const checkpoint = DirectorCheckpointSchema.parse(rawCheckpoint)
        if (checkpoint.trial_id !== this.trialId) {
            throw new DirectorSpoolError('DIRECTOR_REQUEST_INVALID', 'Director checkpoint trial binding is invalid.')
        }
        const envelope = DirectorSpoolRequestEnvelopeSchema.parse({
            contract: 'talos.human_journey.director_spool_request',
            schema_version: HUMAN_JOURNEY_SCHEMA_VERSION,
            checkpoint,
            request_sha256: hashDirectorValue(checkpoint),
            trial_token_sha256: this.trialTokenSha256,
        })
        if (Date.parse(checkpoint.expires_at) <= Date.now()) {
            throw new DirectorSpoolError('DIRECTOR_RESPONSE_EXPIRED', 'Director checkpoint is already expired.')
        }

        const paths = this.pathsFor(checkpoint.request_id)
        await this.prepareTrialDirectory()
        try {
            await mkdir(paths.requestDirectory, { mode: 0o700 })
        } catch (error) {
            if (isAlreadyExists(error)) {
                throw new DirectorSpoolError('DIRECTOR_REQUEST_CONFLICT', 'Director request already exists and cannot be overwritten.', { cause: error })
            }
            throw error
        }

        try {
            await assertOwnedDirectory(resolve(this.rootDirectory, this.trialId), paths.requestDirectory)
            await writeAtomicJson(paths.requestPath, envelope)
        } catch (error) {
            await rm(paths.requestDirectory, { recursive: true, force: true }).catch(() => undefined)
            throw error
        }

        return envelope
    }

    async publishDecision(
        rawRequest: DirectorSpoolRequestEnvelope,
        rawDecision: DirectorDecision,
    ): Promise<DirectorSpoolResponseEnvelope> {
        const request = DirectorSpoolRequestEnvelopeSchema.parse(rawRequest)
        const decision = DirectorDecisionSchema.parse(rawDecision)
        this.assertRequestBinding(request)
        this.assertDecisionBinding(decision, request)
        const paths = this.pathsFor(request.checkpoint.request_id)
        await this.assertPublishedRequest(paths, request)
        if (Date.now() >= Date.parse(request.checkpoint.expires_at)) {
            throw new DirectorSpoolError('DIRECTOR_RESPONSE_EXPIRED', 'Director decision cannot be published after checkpoint expiry.')
        }
        if (await pathExists(paths.consumeLockPath) || await pathExists(paths.consumedResponsePath)) {
            throw new DirectorSpoolError('DIRECTOR_RESPONSE_REPLAYED', 'Director response was already consumed or terminally fenced.')
        }

        await this.claimResponsePublisher(paths)
        if (await pathExists(paths.responsePath)) {
            throw new DirectorSpoolError('DIRECTOR_RESPONSE_CONFLICT', 'Director response already exists and cannot be overwritten.')
        }
        const response = DirectorSpoolResponseEnvelopeSchema.parse({
            contract: 'talos.human_journey.director_spool_response',
            schema_version: HUMAN_JOURNEY_SCHEMA_VERSION,
            decision,
            auth_hmac_sha256: createHmac('sha256', this.trialToken)
                .update(JSON.stringify(canonicalize(decision, new Set<object>())))
                .digest('hex'),
        })
        await writeAtomicJson(paths.responsePath, response)
        return response
    }

    async consumeDecision(
        rawRequest: DirectorSpoolRequestEnvelope,
        options: DirectorDecisionWaitOptions,
    ): Promise<DirectorDecision> {
        const request = DirectorSpoolRequestEnvelopeSchema.parse(rawRequest)
        validateTimeout(options.timeoutMs)
        this.assertRequestBinding(request)
        const paths = this.pathsFor(request.checkpoint.request_id)
        await this.assertPublishedRequest(paths, request)

        const startedAt = Date.now()
        while (true) {
            if (await pathExists(paths.consumeLockPath) || await pathExists(paths.consumedResponsePath)) {
                throw new DirectorSpoolError('DIRECTOR_RESPONSE_REPLAYED', 'Director response was already consumed or terminally fenced.')
            }
            if (options.signal?.aborted) {
                await this.claimTerminal(paths, 'cancelled')
                throw new DirectorSpoolError('DIRECTOR_RESPONSE_CANCELLED', 'Director response wait was cancelled.')
            }
            if (Date.now() >= Date.parse(request.checkpoint.expires_at)) {
                await this.claimTerminal(paths, 'expired')
                throw new DirectorSpoolError('DIRECTOR_RESPONSE_EXPIRED', 'Director response arrived after checkpoint expiry.')
            }
            if (Date.now() - startedAt >= options.timeoutMs) {
                await this.claimTerminal(paths, 'timeout')
                throw new DirectorSpoolError('DIRECTOR_RESPONSE_TIMEOUT', 'Director response wait reached its bounded timeout.')
            }

            const rawResponse = await readBoundedJsonIfPresent(paths.requestDirectory, paths.responsePath)
            if (rawResponse !== undefined) {
                const response = this.parseAndBindResponse(rawResponse, request)
                if (Date.now() >= Date.parse(request.checkpoint.expires_at)) {
                    await this.claimTerminal(paths, 'expired')
                    throw new DirectorSpoolError('DIRECTOR_RESPONSE_EXPIRED', 'Director response arrived after checkpoint expiry.')
                }
                await this.claimTerminal(paths, 'consumed')
                try {
                    await rename(paths.responsePath, paths.consumedResponsePath)
                } catch (error) {
                    throw new DirectorSpoolError(
                        'DIRECTOR_RESPONSE_REPLAYED',
                        'Director response was claimed but could not be retained as consumed evidence.',
                        { cause: error },
                    )
                }
                return response.decision
            }

            const elapsed = Date.now() - startedAt
            const remaining = Math.max(1, Math.min(
                this.pollIntervalMs,
                options.timeoutMs - elapsed,
                Date.parse(request.checkpoint.expires_at) - Date.now(),
            ))
            try {
                await sleep(remaining, undefined, { signal: options.signal })
            } catch (error) {
                if (options.signal?.aborted || isAbortError(error)) {
                    await this.claimTerminal(paths, 'cancelled')
                    throw new DirectorSpoolError('DIRECTOR_RESPONSE_CANCELLED', 'Director response wait was cancelled.', { cause: error })
                }
                throw error
            }
        }
    }

    private async prepareTrialDirectory(): Promise<void> {
        await mkdir(this.rootDirectory, { recursive: true, mode: 0o700 })
        await assertNonSymbolicDirectory(this.rootDirectory)
        const trialDirectory = resolve(this.rootDirectory, this.trialId)
        try {
            await mkdir(trialDirectory, { mode: 0o700 })
        } catch (error) {
            if (!isAlreadyExists(error)) throw error
        }
        await assertOwnedDirectory(this.rootDirectory, trialDirectory)
    }

    private assertRequestBinding(request: DirectorSpoolRequestEnvelope): void {
        if (request.checkpoint.trial_id !== this.trialId || request.trial_token_sha256 !== this.trialTokenSha256) {
            throw new DirectorSpoolError('DIRECTOR_RESPONSE_BINDING_MISMATCH', 'Director request trial or token digest binding is invalid.')
        }
    }

    private async assertPublishedRequest(paths: DirectorSpoolPaths, request: DirectorSpoolRequestEnvelope): Promise<void> {
        const trialDirectory = resolve(this.rootDirectory, this.trialId)
        await assertNonSymbolicDirectory(this.rootDirectory)
        await assertOwnedDirectory(this.rootDirectory, trialDirectory)
        await assertOwnedDirectory(trialDirectory, paths.requestDirectory)
        const raw = await readBoundedJsonIfPresent(paths.requestDirectory, paths.requestPath)
        if (raw === undefined) {
            throw new DirectorSpoolError('DIRECTOR_REQUEST_INVALID', 'Director request file is missing.')
        }
        const persisted = DirectorSpoolRequestEnvelopeSchema.safeParse(raw)
        if (!persisted.success || persisted.data.request_sha256 !== request.request_sha256) {
            throw new DirectorSpoolError('DIRECTOR_REQUEST_INVALID', 'Persisted director request does not match the consumed request.', {
                cause: persisted.success ? undefined : persisted.error,
            })
        }
    }

    private parseAndBindResponse(raw: unknown, request: DirectorSpoolRequestEnvelope): DirectorSpoolResponseEnvelope {
        const parsed = DirectorSpoolResponseEnvelopeSchema.safeParse(raw)
        if (!parsed.success) {
            throw new DirectorSpoolError('DIRECTOR_RESPONSE_MALFORMED', 'Director response failed its strict typed contract.', { cause: parsed.error })
        }
        const response = parsed.data
        const expectedHmac = createHmac('sha256', this.trialToken)
            .update(JSON.stringify(canonicalize(response.decision, new Set<object>())))
            .digest('hex')
        if (!digestsEqual(response.auth_hmac_sha256, expectedHmac)) {
            throw new DirectorSpoolError('DIRECTOR_RESPONSE_TOKEN_MISMATCH', 'Director response token-backed HMAC does not match the active trial.')
        }
        const decision = response.decision
        this.assertDecisionBinding(decision, request)
        return response
    }

    private assertDecisionBinding(decision: DirectorDecision, request: DirectorSpoolRequestEnvelope): void {
        if (
            decision.request_id !== request.checkpoint.request_id
            || decision.request_sha256 !== request.request_sha256
            || decision.observation_sha256 !== request.checkpoint.observation_sha256
            || decision.turn.checkpoint_id !== request.checkpoint.checkpoint_id
        ) {
            throw new DirectorSpoolError('DIRECTOR_RESPONSE_BINDING_MISMATCH', 'Director response hash or checkpoint binding is invalid.')
        }
    }

    private async claimResponsePublisher(paths: DirectorSpoolPaths): Promise<void> {
        let handle
        try {
            handle = await open(paths.responsePublishLockPath, 'wx', 0o600)
            await handle.writeFile(`${JSON.stringify({ claimed_at: new Date().toISOString() })}\n`, 'utf8')
            await handle.sync()
            await handle.close()
        } catch (error) {
            await handle?.close().catch(() => undefined)
            if (isAlreadyExists(error)) {
                throw new DirectorSpoolError('DIRECTOR_RESPONSE_CONFLICT', 'Director response publisher was already claimed.', { cause: error })
            }
            throw error
        }
    }

    private async claimTerminal(paths: DirectorSpoolPaths, status: 'consumed' | 'timeout' | 'cancelled' | 'expired'): Promise<void> {
        let handle
        try {
            handle = await open(paths.consumeLockPath, 'wx', 0o600)
            await handle.writeFile(`${JSON.stringify({ status, claimed_at: new Date().toISOString() })}\n`, 'utf8')
            await handle.sync()
            await handle.close()
        } catch (error) {
            await handle?.close().catch(() => undefined)
            if (isAlreadyExists(error)) {
                throw new DirectorSpoolError('DIRECTOR_RESPONSE_REPLAYED', 'Director response was already consumed or terminally fenced.', { cause: error })
            }
            throw error
        }
    }
}

function canonicalize(value: unknown, ancestors: Set<object>): unknown {
    if (value === null || typeof value === 'string' || typeof value === 'boolean') return value
    if (typeof value === 'number' && Number.isFinite(value)) return value
    if (typeof value !== 'object') throw new TypeError('Director hash input must contain only JSON values.')
    if (ancestors.has(value)) throw new TypeError('Director hash input cannot contain cycles.')

    const nextAncestors = new Set(ancestors)
    nextAncestors.add(value)
    if (Array.isArray(value)) return value.map((entry) => canonicalize(entry, nextAncestors))

    const descriptors = Object.getOwnPropertyDescriptors(value)
    const output = Object.create(null) as Record<string, unknown>
    for (const key of Object.keys(descriptors).sort()) {
        const descriptor = descriptors[key]!
        if (!descriptor.enumerable) continue
        if (!('value' in descriptor)) throw new TypeError('Director hash input cannot contain accessor properties.')
        output[key] = canonicalize(descriptor.value, nextAncestors)
    }
    return output
}

function assertIdentifier(value: string, label: string): void {
    if (typeof value !== 'string' || !IDENTIFIER_PATTERN.test(value)) {
        throw new DirectorSpoolError('DIRECTOR_PATH_OUTSIDE_ROOT', `Director ${label} identifier is invalid or traversal-capable.`)
    }
}

function assertStrictDescendant(root: string, target: string): void {
    const relation = relative(root, target)
    if (relation === '' || relation.startsWith('..') || isAbsolute(relation)) {
        throw new DirectorSpoolError('DIRECTOR_PATH_OUTSIDE_ROOT', 'Director path must remain a strict descendant of its owned root.')
    }
}

async function assertNonSymbolicDirectory(path: string): Promise<void> {
    const status = await lstat(path)
    if (status.isSymbolicLink() || !status.isDirectory()) {
        throw new DirectorSpoolError('DIRECTOR_PATH_SYMBOLIC', 'Director spool path cannot be a symbolic link, junction or non-directory.')
    }
}

async function assertOwnedDirectory(root: string, target: string): Promise<void> {
    assertStrictDescendant(root, target)
    await assertNonSymbolicDirectory(root)
    await assertNonSymbolicDirectory(target)
    const [realRoot, realTarget] = await Promise.all([realpath(root), realpath(target)])
    assertStrictDescendant(realRoot, realTarget)
}

async function writeAtomicJson(target: string, value: unknown): Promise<void> {
    const serialized = `${JSON.stringify(value)}\n`
    if (Buffer.byteLength(serialized, 'utf8') > MAX_JSON_BYTES) {
        throw new DirectorSpoolError('DIRECTOR_REQUEST_INVALID', `Director JSON exceeds ${MAX_JSON_BYTES} bytes.`)
    }
    const temporary = `${target}.${process.pid}.${randomUUID()}.tmp`
    let handle
    try {
        handle = await open(temporary, 'wx', 0o600)
        await handle.writeFile(serialized, 'utf8')
        await handle.sync()
        await handle.close()
        handle = undefined
        await rename(temporary, target)
    } catch (error) {
        await handle?.close().catch(() => undefined)
        await rm(temporary, { force: true }).catch(() => undefined)
        throw error
    }
}

async function readBoundedJsonIfPresent(root: string, target: string): Promise<unknown | undefined> {
    let status
    try {
        status = await lstat(target)
    } catch (error) {
        if (isFileNotFound(error)) return undefined
        throw error
    }
    if (status.isSymbolicLink() || !status.isFile()) {
        throw new DirectorSpoolError('DIRECTOR_PATH_SYMBOLIC', 'Director JSON input must be a regular non-symbolic file.')
    }
    const [realRoot, realTarget] = await Promise.all([realpath(root), realpath(target)])
    assertStrictDescendant(realRoot, realTarget)

    const noFollow = 'O_NOFOLLOW' in constants ? constants.O_NOFOLLOW : 0
    const handle = await open(target, constants.O_RDONLY | noFollow)
    try {
        const openedStatus = await handle.stat()
        if (!openedStatus.isFile()) {
            throw new DirectorSpoolError('DIRECTOR_PATH_SYMBOLIC', 'Director JSON input must remain a regular file after opening.')
        }
        if (openedStatus.size > MAX_JSON_BYTES) {
            throw new DirectorSpoolError('DIRECTOR_RESPONSE_TOO_LARGE', `Director JSON exceeds ${MAX_JSON_BYTES} bytes.`)
        }
        const bytes = await handle.readFile()
        if (bytes.byteLength > MAX_JSON_BYTES) {
            throw new DirectorSpoolError('DIRECTOR_RESPONSE_TOO_LARGE', `Director JSON exceeds ${MAX_JSON_BYTES} bytes.`)
        }
        try {
            return JSON.parse(bytes.toString('utf8')) as unknown
        } catch (error) {
            throw new DirectorSpoolError('DIRECTOR_RESPONSE_MALFORMED', 'Director JSON is malformed.', { cause: error })
        }
    } finally {
        await handle.close()
    }
}

function hashToken(value: string): string {
    return createHash('sha256').update(value, 'utf8').digest('hex')
}

function digestsEqual(left: string, right: string): boolean {
    const leftBytes = Buffer.from(left, 'hex')
    const rightBytes = Buffer.from(right, 'hex')
    return leftBytes.byteLength === rightBytes.byteLength && timingSafeEqual(leftBytes, rightBytes)
}

function validateTimeout(value: number): void {
    if (!Number.isSafeInteger(value) || value < MIN_TIMEOUT_MS || value > MAX_TIMEOUT_MS) {
        throw new DirectorSpoolError(
            'DIRECTOR_INVALID_CONFIGURATION',
            `Director timeout must be an integer between ${MIN_TIMEOUT_MS} and ${MAX_TIMEOUT_MS} ms.`,
        )
    }
}

async function pathExists(path: string): Promise<boolean> {
    try {
        await lstat(path)
        return true
    } catch (error) {
        if (isFileNotFound(error)) return false
        throw error
    }
}

function isFileNotFound(error: unknown): boolean {
    return error instanceof Error && 'code' in error && error.code === 'ENOENT'
}

function isAlreadyExists(error: unknown): boolean {
    return error instanceof Error && 'code' in error && error.code === 'EEXIST'
}

function isAbortError(error: unknown): boolean {
    return error instanceof Error && error.name === 'AbortError'
}
