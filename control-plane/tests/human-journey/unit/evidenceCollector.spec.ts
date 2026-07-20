import { expect, test } from '@playwright/test'
import { createHash } from 'node:crypto'
import { mkdtemp, mkdir, readFile, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { HumanJourneyEvidenceManifestSchema } from '../contracts'
import {
    HumanJourneyEvidenceCollector,
    type HumanJourneyEvidenceCandidate,
} from '../evidence/HumanJourneyEvidenceCollector'

const timestamp = '2026-07-20T12:00:00.000Z'
let temporaryRoot = ''
let workspaceRoot = ''
let artifactRoot = ''

test.beforeEach(async () => {
    temporaryRoot = await mkdtemp(join(tmpdir(), 'talos-hj-evidence-'))
    workspaceRoot = join(temporaryRoot, 'workspace')
    artifactRoot = join(workspaceRoot, '.talos', 'run-001')
    await mkdir(artifactRoot, { recursive: true })
})

test.afterEach(async () => {
    if (temporaryRoot !== '') await rm(temporaryRoot, { recursive: true, force: true })
})

function candidate(id: string, relativePath: string, kind: HumanJourneyEvidenceCandidate['kind'] = 'artifact'): HumanJourneyEvidenceCandidate {
    return {
        id,
        kind,
        relativePath,
        mediaType: kind === 'screenshot' ? 'image/png' : 'application/json',
        retained: true,
    }
}

function collector(options: { secretCanaries?: string[], maxArtifactBytes?: number } = {}) {
    return new HumanJourneyEvidenceCollector({
        workspaceRoot,
        artifactRoot,
        secretCanaries: options.secretCanaries ?? ['HJ_SECRET_CANARY_4f0b8a77'],
        maxArtifactBytes: options.maxArtifactBytes,
    })
}

function request(artifacts: HumanJourneyEvidenceCandidate[]) {
    return {
        trialId: 'trial-001',
        scenarioId: 'BROWSER-NATURAL-001',
        artifacts,
        redaction: {
            applied: true,
            notes: ['Structured exports redact secret-like keys before retention.'],
        },
        createdAt: timestamp,
    }
}

test('hashes exact retained bytes and emits a strict deterministic manifest', async () => {
    const reportBytes = Buffer.from('{"ok":true}\n', 'utf8')
    const screenshotBytes = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
    await mkdir(join(artifactRoot, 'reports'), { recursive: true })
    await mkdir(join(artifactRoot, 'screenshots'), { recursive: true })
    await writeFile(join(artifactRoot, 'reports', 'trial.json'), reportBytes)
    await writeFile(join(artifactRoot, 'screenshots', 'frame.png'), screenshotBytes)

    const manifest = await collector().collect(request([
        candidate('z-report', 'reports/trial.json', 'report'),
        candidate('a-frame', 'screenshots/frame.png', 'screenshot'),
    ]))

    expect(HumanJourneyEvidenceManifestSchema.parse(manifest)).toEqual(manifest)
    expect(manifest.root).toBe('.talos/run-001')
    expect(manifest.artifacts.map((artifact) => artifact.id)).toEqual(['a-frame', 'z-report'])
    expect(manifest.artifacts[0]).toMatchObject({
        relative_path: 'screenshots/frame.png',
        bytes: screenshotBytes.byteLength,
        sha256: createHash('sha256').update(screenshotBytes).digest('hex'),
    })
    expect(manifest.artifacts[1]).toMatchObject({
        relative_path: 'reports/trial.json',
        bytes: reportBytes.byteLength,
        sha256: createHash('sha256').update(reportBytes).digest('hex'),
    })
    expect(manifest.redaction.secret_canary_absent).toBe(true)
})

test('writes canonical JSON while recursively redacting secret-like keys without mutating the caller value', async () => {
    const value = {
        account: 'synthetic@example.test',
        nested: {
            api_key: 'sk-test-secret',
            accessToken: 'token-value',
            activeTokenDigestValue: 'embedded-token-value',
            cookieJar: ['cookie-value'],
            safe: [{ password: 'hidden', result: 'visible' }],
        },
    }
    const original = structuredClone(value)
    const evidence = collector({ secretCanaries: ['sk-test-secret', 'token-value', 'embedded-token-value', 'cookie-value', 'hidden'] })

    await evidence.writeRedactedJson('exports/session.json', value)
    const bytes = await readFile(join(artifactRoot, 'exports', 'session.json'), 'utf8')
    const parsed = JSON.parse(bytes) as Record<string, unknown>
    const manifest = await evidence.collect(request([candidate('session-export', 'exports/session.json', 'talos_export')]))

    expect(value).toEqual(original)
    expect(bytes.endsWith('\n')).toBe(true)
    expect(bytes).not.toMatch(/sk-test-secret|token-value|embedded-token-value|cookie-value|hidden/)
    expect(parsed).toEqual({
        account: 'synthetic@example.test',
        nested: {
            accessToken: '[REDACTED]',
            activeTokenDigestValue: '[REDACTED]',
            api_key: '[REDACTED]',
            cookieJar: '[REDACTED]',
            safe: [{ password: '[REDACTED]', result: 'visible' }],
        },
    })
    expect(manifest.artifacts[0]?.kind).toBe('talos_export')
})

test('evidence JSON preserves finite token-usage metrics but redacts credential token keys', async () => {
    const value = {
        metrics: {
            provider_tokens: 48,
            promptTokens: 32,
            completion_tokens: 16,
            input_tokens: 30,
            outputTokens: 18,
        },
        credentials: {
            accessToken: 'credential-token-value',
            tokenDigest: 'credential-token-digest',
        },
    }
    const evidence = collector({ secretCanaries: ['credential-token-value', 'credential-token-digest'] })

    await evidence.writeRedactedJson('reports/usage.json', value)
    const parsed = JSON.parse(await readFile(join(artifactRoot, 'reports', 'usage.json'), 'utf8'))

    expect(parsed.metrics).toEqual(value.metrics)
    expect(parsed.credentials).toEqual({ accessToken: '[REDACTED]', tokenDigest: '[REDACTED]' })
})

test('preserves own prototype-named data without prototype mutation and rejects accessors', async () => {
    const value = Object.create(null) as Record<string, unknown>
    value.__proto__ = 'plain-data'
    value.visible = true
    Object.defineProperty(value, 'internal', { enumerable: false, value: 'not-json-data' })

    await collector().writeRedactedJson('exports/prototype.json', value)
    const parsed = JSON.parse(await readFile(join(artifactRoot, 'exports', 'prototype.json'), 'utf8')) as Record<string, unknown>
    expect(Object.hasOwn(parsed, '__proto__')).toBe(true)
    expect(parsed.__proto__).toBe('plain-data')
    expect(Object.hasOwn(parsed, 'internal')).toBe(false)

    const accessor = Object.defineProperty({}, 'computed', {
        enumerable: true,
        get: () => 'must-not-run',
    })
    await expect(collector().writeRedactedJson('exports/accessor.json', accessor)).rejects.toThrow(/accessor/i)

    let arrayAccessorCalls = 0
    const arrayAccessor: unknown[] = []
    Object.defineProperty(arrayAccessor, '0', {
        enumerable: true,
        get: () => {
            arrayAccessorCalls += 1
            return 'must-not-run'
        },
    })
    arrayAccessor.length = 1
    await expect(collector().writeRedactedJson('exports/array-accessor.json', arrayAccessor)).rejects.toThrow(/accessor/i)
    expect(arrayAccessorCalls).toBe(0)
})

test('rejects traversal, absolute paths and duplicate artifact identities before reading bytes', async () => {
    await writeFile(join(artifactRoot, 'one.json'), '{}')

    for (const relativePath of ['../outside.json', '/absolute.json', 'C:/absolute.json', 'nested\\file.json']) {
        await expect(collector().collect(request([candidate('bad-path', relativePath)]))).rejects.toThrow(/relative|path/i)
    }
    await expect(collector().collect(request([
        candidate('same-id', 'one.json'),
        candidate('same-id', 'two.json'),
    ]))).rejects.toThrow(/duplicate artifact id/i)
    await expect(collector().collect(request([
        candidate('one', 'one.json'),
        candidate('two', 'one.json'),
    ]))).rejects.toThrow(/duplicate artifact path/i)
})

test('rejects a junction escape and never follows evidence outside the owned root', async () => {
    const outside = join(temporaryRoot, 'outside')
    await mkdir(outside, { recursive: true })
    await writeFile(join(outside, 'secret.json'), '{"outside":true}')
    await symlink(outside, join(artifactRoot, 'escape'), process.platform === 'win32' ? 'junction' : 'dir')

    await expect(collector().collect(request([candidate('escaped', 'escape/secret.json')]))).rejects.toThrow(/symbolic link|owned root/i)
})

test('rejects retained bytes containing any configured secret canary', async () => {
    await writeFile(join(artifactRoot, 'leak.log'), 'safe-prefix HJ_SECRET_CANARY_4f0b8a77 safe-suffix')

    await expect(collector().collect(request([{
        ...candidate('leaked-log', 'leak.log', 'log'),
        mediaType: 'text/plain',
    }]))).rejects.toThrow(/secret canary/i)
})

test('rejects a secret canary split across stream chunks', async () => {
    const canary = 'HJ_BOUNDARY_CANARY_77c4'
    const prefix = Buffer.alloc((64 * 1024) - 7, 0x61)
    await writeFile(join(artifactRoot, 'boundary.log'), Buffer.concat([prefix, Buffer.from(canary, 'utf8')]))

    await expect(collector({ secretCanaries: [canary] }).collect(request([{
        ...candidate('boundary-log', 'boundary.log', 'log'),
        mediaType: 'text/plain',
    }]))).rejects.toThrow(/secret canary/i)
})

test('rejects files over the configured per-artifact byte bound', async () => {
    await writeFile(join(artifactRoot, 'large.json'), '123456789')

    await expect(collector({ maxArtifactBytes: 8 }).collect(request([
        candidate('large-artifact', 'large.json'),
    ]))).rejects.toThrow(/byte limit/i)
})

test('rejects malformed media types through the final strict manifest boundary', async () => {
    await writeFile(join(artifactRoot, 'one.json'), '{}')

    await expect(collector().collect(request([{
        ...candidate('bad-media', 'one.json'),
        mediaType: 'not a media type',
    }]))).rejects.toThrow(/manifest contract/i)
})
