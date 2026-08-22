import { describe, expect, it } from 'vitest'
import { talosGroupGgufFiles } from '@/lib/models/ggufSet'
import type { TalosHuggingFaceFile } from '@/lib/models/huggingFace'

/**
 * What a person actually chooses.
 *
 * A repository is a flat list of files and a large model is several of them.
 * Showing the files — which is what these apps do — invites someone to
 * download a third of a model over mobile data and find out at load time.
 */
function file(path: string, sizeBytes: number, extra: Partial<TalosHuggingFaceFile> = {}): TalosHuggingFaceFile {
    return {
        path,
        sizeBytes,
        sha256: 'a'.repeat(64),
        xetHash: null,
        security: null,
        ...extra,
    }
}

describe('grouping a repository into models', () => {
    it('offers one row per quantisation, smallest first', () => {
        const sets = talosGroupGgufFiles([
            file('Qwen3-4B-Q8_0.gguf', 4_000_000_000),
            file('Qwen3-4B-Q4_K_M.gguf', 2_500_000_000),
            file('Qwen3-4B-Q2_K.gguf', 1_600_000_000),
        ])

        expect(sets.map((set) => set.quantisation)).toEqual(['Q2_K', 'Q4_K_M', 'Q8_0'])
    })

    it('C45-RED-14B preserves a backend-specific suffix instead of drawing duplicate labels', () => {
        const sets = talosGroupGgufFiles([
            file('LFM2-350M-Q4_K_M.gguf', 229_309_376),
            file('LFM2-350M-Q4_K_M-hip-optimized.gguf', 254_958_528),
        ])

        expect(sets.map((set) => ({ label: set.label, path: set.paths[0] }))).toEqual([
            { label: 'Q4_K_M', path: 'LFM2-350M-Q4_K_M.gguf' },
            { label: 'Q4_K_M · HIP optimized', path: 'LFM2-350M-Q4_K_M-hip-optimized.gguf' },
        ])
    })

    /**
     * THE rule. Three shards are one model, and the number the phone must find
     * room for is their sum — the size of one shard is not a smaller model, it
     * is a broken one.
     */
    it('treats a split model as one model of the whole size', () => {
        const sets = talosGroupGgufFiles([
            file('Qwen3-30B-Q4_K_M-00002-of-00003.gguf', 5_000_000_000),
            file('Qwen3-30B-Q4_K_M-00001-of-00003.gguf', 5_000_000_000),
            file('Qwen3-30B-Q4_K_M-00003-of-00003.gguf', 4_000_000_000),
        ])

        expect(sets).toHaveLength(1)
        expect(sets[0]!.totalBytes).toBe(14_000_000_000)
        expect(sets[0]!.incomplete).toBe(false)
        expect(sets[0]!.paths).toEqual([
            'Qwen3-30B-Q4_K_M-00001-of-00003.gguf',
            'Qwen3-30B-Q4_K_M-00002-of-00003.gguf',
            'Qwen3-30B-Q4_K_M-00003-of-00003.gguf',
        ])
    })

    /**
     * And a set missing a piece is named as such rather than offered. Any two
     * of three shards are not a small model; they are nothing, and the failure
     * would arrive after ten gigabytes.
     */
    it('refuses to pretend an incomplete set is a model', () => {
        const sets = talosGroupGgufFiles([
            file('big-Q4_K_M-00001-of-00003.gguf', 5_000_000_000),
            file('big-Q4_K_M-00003-of-00003.gguf', 4_000_000_000),
        ])

        expect(sets[0]!.incomplete).toBe(true)
        expect(sets[0]!.expectedShards).toBe(3)
        expect(sets[0]!.foundShards).toBe(2)
    })

    /** Two quantisations, both split, must not become one twelve-piece model. */
    it('keeps two split models apart', () => {
        const sets = talosGroupGgufFiles([
            file('m-Q4_K_M-00001-of-00002.gguf', 3_000_000_000),
            file('m-Q4_K_M-00002-of-00002.gguf', 3_000_000_000),
            file('m-Q8_0-00001-of-00002.gguf', 5_000_000_000),
            file('m-Q8_0-00002-of-00002.gguf', 5_000_000_000),
        ])

        expect(sets).toHaveLength(2)
        expect(sets.map((set) => set.totalBytes)).toEqual([6_000_000_000, 10_000_000_000])
    })

    /** A repository holds a README and a config too; neither is a model. */
    it('ignores everything that is not a GGUF', () => {
        const sets = talosGroupGgufFiles([
            file('README.md', 4_000),
            file('config.json', 900),
            file('model-Q4_K_M.gguf', 2_000_000_000),
        ])

        expect(sets.map((set) => set.paths[0])).toEqual(['model-Q4_K_M.gguf'])
    })

    /**
     * A file the repository publishes no hash for cannot be verified. That is a
     * fact about the repository, carried so the screen can say it — never a
     * reason to skip checking the pieces that can be.
     */
    it('carries a missing hash as a fact rather than hiding it', () => {
        const sets = talosGroupGgufFiles([
            file('m-00001-of-00002.gguf', 1_000, { sha256: 'b'.repeat(64) }),
            file('m-00002-of-00002.gguf', 1_000, { sha256: null }),
        ])

        expect(sets[0]!.sha256).toEqual(['b'.repeat(64), null])
    })

    /**
     * A clean shard beside a flagged one is not a clean model — the WORST
     * verdict governs, not the first.
     *
     * This took the first non-null verdict, which is the exact opposite
     * whenever the first shard is clean: a flagged second shard hid behind it,
     * while the comment two lines above promised otherwise. Found by an
     * adversarial review, 2026-08-01.
     */
    it('lets one flagged piece govern the whole set, even behind a clean one', () => {
        const sets = talosGroupGgufFiles([
            file('m-00001-of-00002.gguf', 1_000, { security: 'safe' }),
            file('m-00002-of-00002.gguf', 1_000, { security: 'unsafe' }),
        ])

        expect(sets[0]!.security).toBe('unsafe')
    })

    it('still reports a wholly clean set as clean', () => {
        const sets = talosGroupGgufFiles([
            file('m-00001-of-00002.gguf', 1_000, { security: 'safe' }),
            file('m-00002-of-00002.gguf', 1_000, { security: 'safe' }),
        ])

        expect(sets[0]!.security).toBe('safe')
    })

    /** Silence means the Hub has not looked. That is not a pass and not a warning. */
    it('says nothing when nothing was scanned', () => {
        expect(talosGroupGgufFiles([file('m.gguf', 1_000, { security: null })])[0]!.security)
            .toBeNull()
    })

    /**
     * Each piece's OWN length, not just the sum.
     *
     * The download job fetches one file at a time, and handing it the set total
     * for the first shard is what made it run past the end of that file, read
     * the 416 as "changed upstream" and delete everything.
     */
    it('carries every piece length, not only their total', () => {
        const sets = talosGroupGgufFiles([
            file('m-00002-of-00003.gguf', 5_000_000_000),
            file('m-00001-of-00003.gguf', 5_000_000_000),
            file('m-00003-of-00003.gguf', 4_000_000_000),
        ])

        expect(sets[0]!.sizes).toEqual([5_000_000_000, 5_000_000_000, 4_000_000_000])
        expect(sets[0]!.sizes.reduce((sum, size) => sum + size, 0)).toBe(sets[0]!.totalBytes)
    })

    /** Quantisations published one folder down are still one model each. */
    it('groups files that live in subfolders', () => {
        const sets = talosGroupGgufFiles([
            file('Q4_K_M/m-00001-of-00002.gguf', 1_000),
            file('Q4_K_M/m-00002-of-00002.gguf', 1_000),
            file('Q8_0/m.gguf', 3_000),
        ])

        expect(sets).toHaveLength(2)
        expect(sets[0]!.paths).toHaveLength(2)
    })

    it('has nothing to say about a repository with no GGUF in it', () => {
        expect(talosGroupGgufFiles([file('pytorch_model.bin', 5_000_000_000)])).toEqual([])
    })
})
