import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
    TALOS_MOBILE_QUANTISATION_ORDER,
    talosEstimateGgufBytesFromParameters,
    talosSelectMobileBrowseVariant,
} from '@/lib/models/browseVariant'

interface QwenFixture {
    id: string
    gguf: { total: number, totalFileSize: number }
    siblings: Array<{ rfilename: string }>
}

const qwen = JSON.parse(readFileSync(resolve(
    process.cwd(),
    'tests/fixtures/huggingface/qwen35-4b-list.json',
), 'utf8')) as QwenFixture

const qwenInput = () => ({
    id: qwen.id,
    parameters: qwen.gguf.total,
    siblings: qwen.siblings.map((row) => ({
        path: row.rfilename,
        sizeBytes: null,
        sha256: null,
    })),
})

describe('the representative mobile variant', () => {
    it('uses a stable mobile ranking rather than sibling order', () => {
        expect(TALOS_MOBILE_QUANTISATION_ORDER).toEqual([
            'Q4_K_M', 'Q4_K_S', 'Q4_1', 'Q4_0', 'IQ4_XS', 'IQ4_NL', 'UD-Q4_K_XL',
        ])

        expect(talosSelectMobileBrowseVariant(qwenInput())).toMatchObject({
            quantisation: 'Q4_K_M',
            paths: ['Qwen3.5-4B-Q4_K_M.gguf'],
        })
    })

    it('never uses repository totalFileSize as the Q4 file size', () => {
        const variant = talosSelectMobileBrowseVariant(qwenInput())

        expect(variant).toEqual({
            quantisation: 'Q4_K_M',
            paths: ['Qwen3.5-4B-Q4_K_M.gguf'],
            fileBytes: 2_523_450_778,
            workingBytes: 3_154_313_473,
            sha256: null,
            source: 'parameter-estimate',
            estimated: true,
        })
        expect(variant?.fileBytes).not.toBe(qwen.gguf.totalFileSize)
    })

    it('uses exact LFS bytes only when they are genuinely present', () => {
        const input = qwenInput()
        input.siblings = input.siblings.map((row) => row.path.endsWith('Q4_K_M.gguf')
            ? {
                ...row,
                sizeBytes: 2_740_937_888,
                sha256: '00fe7986ff5f6b463e62455821146049db6f9313603938a70800d1fb69ef11a4',
            }
            : row)

        expect(talosSelectMobileBrowseVariant(input)).toEqual({
            quantisation: 'Q4_K_M',
            paths: ['Qwen3.5-4B-Q4_K_M.gguf'],
            fileBytes: 2_740_937_888,
            workingBytes: 3_426_172_360,
            sha256: '00fe7986ff5f6b463e62455821146049db6f9313603938a70800d1fb69ef11a4',
            source: 'sibling-lfs',
            estimated: false,
        })
    })

    it('sums a complete split set instead of offering one shard as a model', () => {
        const variant = talosSelectMobileBrowseVariant({
            id: 'owner/model-32B-GGUF',
            parameters: 32_000_000_000,
            siblings: [
                { path: 'model-Q4_K_M-00001-of-00002.gguf', sizeBytes: 10, sha256: 'a'.repeat(64) },
                { path: 'model-Q4_K_M-00002-of-00002.gguf', sizeBytes: 20, sha256: 'b'.repeat(64) },
            ],
        })

        expect(variant).toMatchObject({
            paths: [
                'model-Q4_K_M-00001-of-00002.gguf',
                'model-Q4_K_M-00002-of-00002.gguf',
            ],
            fileBytes: 30,
            source: 'sibling-lfs',
            sha256: null,
        })
    })

    it('rejects non-contiguous or mixed-total split sets', () => {
        expect(talosSelectMobileBrowseVariant({
            id: 'owner/model-32B-GGUF',
            parameters: 32_000_000_000,
            siblings: [
                { path: 'model-Q4_K_M-00000-of-00002.gguf', sizeBytes: 10, sha256: null },
                { path: 'model-Q4_K_M-00002-of-00002.gguf', sizeBytes: 20, sha256: null },
            ],
        })).toBeNull()

        expect(talosSelectMobileBrowseVariant({
            id: 'owner/model-32B-GGUF',
            parameters: 32_000_000_000,
            siblings: [
                { path: 'model-Q4_K_M-00001-of-00002.gguf', sizeBytes: 10, sha256: null },
                { path: 'model-Q4_K_M-00002-of-00003.gguf', sizeBytes: 20, sha256: null },
            ],
        })).toBeNull()
    })

    it('ignores a shorter metadata sibling that merely names Q4_K_M', () => {
        expect(talosSelectMobileBrowseVariant({
            id: 'owner/model-4B-GGUF',
            parameters: 4_000_000_000,
            siblings: [
                { path: 'a-Q4_K_M.json', sizeBytes: 10, sha256: null },
                { path: 'actual-Q4_K_M.gguf', sizeBytes: 20, sha256: null },
            ],
        })?.paths).toEqual(['actual-Q4_K_M.gguf'])
    })

    it('breaks equal-length ties by Unicode code units, not device locale', () => {
        expect(talosSelectMobileBrowseVariant({
            id: 'owner/model-4B-GGUF',
            parameters: 4_000_000_000,
            siblings: [
                { path: 'a-Q4_K_M.gguf', sizeBytes: 20, sha256: null },
                { path: 'Z-Q4_K_M.gguf', sizeBytes: 10, sha256: null },
            ],
        })?.paths).toEqual(['Z-Q4_K_M.gguf'])
    })

    it('falls back to a declared name estimate and otherwise returns unknown', () => {
        expect(talosSelectMobileBrowseVariant({
            id: 'owner/model-3B-GGUF',
            parameters: null,
            siblings: [{ path: 'model-Q4_K_M.gguf', sizeBytes: null, sha256: null }],
        })).toMatchObject({ fileBytes: 1_800_000_000, source: 'name-estimate', estimated: true })

        expect(talosSelectMobileBrowseVariant({
            id: 'owner/model-GGUF',
            parameters: null,
            siblings: [{ path: 'model-Q4_K_M.gguf', sizeBytes: null, sha256: null }],
        })).toBeNull()
    })
})

describe('GGUF byte estimates', () => {
    it('derives bytes from independent parameter and quantisation facts', () => {
        expect(talosEstimateGgufBytesFromParameters(3_000_000_000, 'Q4_K_M'))
            .toBe(1_800_000_000)
        expect(talosEstimateGgufBytesFromParameters(3_000_000_000, 'not-a-quant'))
            .toBeNull()
        expect(talosEstimateGgufBytesFromParameters(Number.NaN, 'Q4_K_M'))
            .toBeNull()
    })
})
