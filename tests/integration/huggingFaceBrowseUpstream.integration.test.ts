import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { talosCreateHuggingFaceClient } from '@/lib/models/huggingFace'
import { talosModelHasQ4Variant, talosModelIsChatCapable } from '@/lib/models/browseFilters'
import { talosHasDeclaredPermissiveLicence } from '@/lib/models/licensePolicy'

const enabled = process.env.TALOS_RUN_HF_UPSTREAM === '1'
const OPENAPI_SHA256 = '92e1d8823c21541a993b28d0453b868bd0e42099d1090746a97ac3b84a8489f1'

const VOLATILE_DEFAULTS = [
    '/paths/~1api~1agentic~1provisioning~1resources/post/requestBody/content/application~1json/schema/anyOf/1/properties/configuration/properties/name/default',
    '/paths/~1api~1organizations~1{name}~1billing~1usage-by-inference-session/get/parameters/2/schema/default',
    '/paths/~1api~1organizations~1{name}~1billing~1usage-by-resource-group/get/parameters/2/schema/default',
    '/paths/~1api~1settings~1billing~1usage-by-inference-session/get/parameters/1/schema/default',
] as const

function fixture<T>(name: string): T {
    return JSON.parse(readFileSync(resolve(
        process.cwd(),
        `tests/fixtures/huggingface/${name}`,
    ), 'utf8')) as T
}

function replacePointer(document: unknown, pointer: string, value: string): void {
    const parts = pointer.slice(1).split('/').map((part) => (
        part.replace(/~1/gu, '/').replace(/~0/gu, '~')
    ))
    let cursor = document as Record<string, unknown> | unknown[]
    for (const part of parts.slice(0, -1)) {
        cursor = Array.isArray(cursor)
            ? cursor[Number(part)] as Record<string, unknown> | unknown[]
            : cursor[part] as Record<string, unknown> | unknown[]
    }
    const tail = parts.at(-1)!
    if (Array.isArray(cursor)) cursor[Number(tail)] = value
    else cursor[tail] = value
}

function canonical(value: unknown): unknown {
    if (Array.isArray(value)) return value.map(canonical)
    if (!value || typeof value !== 'object') return value
    return Object.fromEntries(Object.entries(value as Record<string, unknown>)
        // Canonical JSON uses a deterministic Unicode code-unit order. A
        // locale collation reorders punctuation and makes the hash depend on
        // the machine running the gate.
        .sort(([left], [right]) => left < right ? -1 : (left > right ? 1 : 0))
        .map(([key, child]) => [key, canonical(child)]))
}

describe.skipIf(!enabled)('Hugging Face browse contract, live', () => {
    it('matches the canonical OpenAPI pin after replacing four volatile defaults', async () => {
        const response = await fetch('https://huggingface.co/.well-known/openapi.json')
        expect(response.status).toBe(200)
        const document = await response.json() as Record<string, unknown>
        VOLATILE_DEFAULTS.forEach((pointer, index) => replacePointer(
            document,
            pointer,
            index === 0 ? '<volatile-random-name>' : '<volatile-current-time>',
        ))
        const digest = createHash('sha256')
            .update(JSON.stringify(canonical(document)))
            .digest('hex')

        expect(document.openapi).toBe('3.1.0')
        expect((document.info as Record<string, unknown>).version).toBe('0.0.1')
        expect(digest).toBe(OPENAPI_SHA256)
    }, 30_000)

    it('keeps browse bytes estimated and verifies exact pinned paths separately', async () => {
        const qwen = fixture<{
            id: string
            sha: string
            gguf: { totalFileSize: number }
            siblings: Array<{ rfilename: string }>
        }>('qwen35-4b-list.json')
        const qwen32 = fixture<Array<{ path: string, lfs: { size: number, oid: string } }>>(
            'qwen25-32b-paths-info.json')
        const llama70 = fixture<Array<{ path: string, lfs: { size: number, oid: string } }>>(
            'llama31-70b-paths-info.json')
        const client = talosCreateHuggingFaceClient({ fetch })

        const models = await client.searchModels(qwen.id, 20)
        const model = models.find((candidate) => candidate.id === qwen.id)
        expect(model).toBeDefined()
        expect(model!.revision).toBe(qwen.sha)
        expect(model!.gguf?.repositoryFileBytes).toBe(qwen.gguf.totalFileSize)
        expect(model!.browseVariant).toMatchObject({
            quantisation: 'Q4_K_M',
            paths: [qwen.siblings.find((row) => row.rfilename.endsWith('Q4_K_M.gguf'))!.rfilename],
            source: 'parameter-estimate',
            estimated: true,
        })
        expect(model!.browseVariant?.fileBytes).not.toBe(qwen.gguf.totalFileSize)
        expect(model!.hasChatTemplate).toBe(true)
        expect(model!.tags).toContain('conversational')
        expect(talosModelIsChatCapable(model!)).toBe(true)
        expect(talosModelHasQ4Variant(model!)).toBe(true)
        expect(model!.licence).toBe('apache-2.0')
        expect(talosHasDeclaredPermissiveLicence(model!)).toBe(true)
        expect(model!.downloads).toBeGreaterThan(0)
        expect(model!.downloadsAllTime).toEqual(expect.any(Number))

        for (const [repo, revision, expected] of [
            ['unsloth/Qwen3.5-4B-GGUF', qwen.sha, {
                path: 'Qwen3.5-4B-Q4_K_M.gguf',
                size: 2_740_937_888,
                oid: '00fe7986ff5f6b463e62455821146049db6f9313603938a70800d1fb69ef11a4',
            }],
            ['bartowski/Qwen2.5-32B-Instruct-GGUF', '2116cbb385b8ce3a4d28cf3bf1cd2039a55821a6', {
                path: qwen32[0]!.path,
                size: qwen32[0]!.lfs.size,
                oid: qwen32[0]!.lfs.oid,
            }],
            ['bartowski/Meta-Llama-3.1-70B-Instruct-GGUF', '83fb6e83d0a8aada42d499259bc929d922e9a558', {
                path: llama70[0]!.path,
                size: llama70[0]!.lfs.size,
                oid: llama70[0]!.lfs.oid,
            }],
        ] as const) {
            const [file] = await client.pathsInfo(repo, revision, [expected.path])
            expect(file).toMatchObject({
                path: expected.path,
                sizeBytes: expected.size,
                sha256: expected.oid,
            })
        }
    }, 60_000)

    it('does not turn a pinned text-generation model into Chat without evidence', async () => {
        const client = talosCreateHuggingFaceClient({ fetch })
        const models = await client.searchModels('antirez/deepseek-v4-gguf', 20)
        const model = models.find((candidate) => candidate.id === 'antirez/deepseek-v4-gguf')

        expect(model).toBeDefined()
        expect(model!.revision).toBe('e7f04037032990db0346398d249baf9fb9df1ccc')
        expect(model!.task).toBe('text-generation')
        expect(model!.tags).not.toContain('conversational')
        expect(model!.hasChatTemplate).toBe(false)
        expect(talosModelIsChatCapable(model!)).toBe(false)
        expect(model!.licence).toBe('mit')
        expect(talosHasDeclaredPermissiveLicence(model!)).toBe(true)
    }, 30_000)
})
