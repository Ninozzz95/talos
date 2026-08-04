import { describe, expect, it, vi } from 'vitest'
import {
    TALOS_CATALOGUE_SCHEMA,
    talosCatalogueAgeDays,
    talosReadCatalogue,
    talosRecommendFromCatalogue,
} from '@/lib/models/catalogue'
import type { TalosDeviceCapacity } from '@/lib/models/fit'

/**
 * The signed catalogue — M8.
 *
 * Two properties are worth this whole file. It is UNTRUSTED until the signature
 * verifies, because a downloaded list is network and the network does not get
 * to decide what runs on somebody's phone. And it carries the memory a model
 * actually needs, so a phone can be answered offline, from cache, without
 * spending a megabyte of header read per model against a rate limit that is
 * shared with everyone behind the same carrier.
 */
const GIB = 1024 ** 3

function entry(over: Record<string, unknown> = {}) {
    return {
        id: 'gemma-3n-e4b-q4',
        family: 'gemma-3n',
        display_name: 'Gemma 3n E4B',
        publisher: 'Google',
        license: 'gemma-terms',
        params_b: 4.0,
        quantization: 'Q4_K_M',
        file_bytes: 3_100_000_000,
        sha256: 'a'.repeat(64),
        download: { kind: 'huggingface', repo: 'google/gemma-3n-e4b-gguf', file: 'model.gguf' },
        runtime: ['llamacpp', 'webgpu'],
        context_tokens: 32768,
        ram_working_bytes: 3_600_000_000,
        reference_speed: [{ soc: 'sm8650', engine: 'llamacpp', tokens_per_second: 11.4 }],
        tags: ['mobile-first', 'recommended'],
        added_at: '2026-06-01T00:00:00Z',
        popularity: 0.87,
        ...over,
    }
}

function document(over: Record<string, unknown> = {}): string {
    return JSON.stringify({
        schema_version: TALOS_CATALOGUE_SCHEMA,
        generated_at: '2026-07-26T10:00:00Z',
        signature: 'a-real-signature',
        models: [entry()],
        ...over,
    })
}

const SIG = 'a-detached-signature'
const accepts = () => true
const rejects = () => false

describe('the signature, which comes first', () => {
    it('reads a document that verifies', () => {
        const result = talosReadCatalogue(document(), SIG, accepts)

        expect(result.ok).toBe(true)
        if (!result.ok) return
        expect(result.catalogue.entries).toHaveLength(1)
        expect(result.catalogue.entries[0]!.ramWorkingBytes).toBe(3_600_000_000)
    })

    it('refuses a document nobody signed', () => {
        const result = talosReadCatalogue(document(), null, accepts)

        expect(result).toEqual({ ok: false, reason: 'unsigned' })
    })

    it('refuses a signature that does not check out', () => {
        expect(talosReadCatalogue(document(), SIG, rejects)).toEqual({ ok: false, reason: 'unverified' })
    })

    /**
     * No verifier means nothing CAN be verified, which means refusal. An app
     * that reads an unverifiable list "just this once" has no signature
     * requirement at all.
     */
    it('fails closed when there is nothing to verify with', () => {
        expect(talosReadCatalogue(document(), SIG, null)).toEqual({ ok: false, reason: 'unverified' })
    })

    /**
     * And the version is checked AFTER the signature. Deciding anything on
     * unverified bytes — even which parser to use — is deciding on the
     * network's say-so.
     */
    it('checks the signature before it reads the schema version', () => {
        const verify = vi.fn(() => false)

        const result = talosReadCatalogue(document({ schema_version: 99 }), SIG, verify)

        expect(verify).toHaveBeenCalled()
        expect(result).toEqual({ ok: false, reason: 'unverified' })
    })

    it('refuses a schema it was not written against', () => {
        expect(talosReadCatalogue(document({ schema_version: 99 }), SIG, accepts))
            .toEqual({ ok: false, reason: 'unsupported-schema' })
    })

    it('refuses something that is not a document at all', () => {
        expect(talosReadCatalogue('not json', SIG, accepts)).toEqual({ ok: false, reason: 'malformed' })
        expect(talosReadCatalogue('[]', SIG, accepts)).toEqual({ ok: false, reason: 'malformed' })
    })
})

describe('the rows', () => {
    /**
     * A row with no working-memory figure cannot be judged against a phone, and
     * offering it anyway would be offering a guess dressed as a catalogue entry.
     */
    it('drops a row that cannot be judged, and says how many', () => {
        const result = talosReadCatalogue(document({
            models: [entry(), entry({ ram_working_bytes: undefined }), entry({ sha256: undefined })],
        }), SIG, accepts)

        expect(result.ok).toBe(true)
        if (!result.ok) return
        expect(result.catalogue.entries).toHaveLength(1)
        expect(result.catalogue.droppedEntries).toBe(2)
    })

    /**
     * One bad row does not take the catalogue off every phone at once. The
     * signature already vouched for the bytes, so a malformed row is a
     * publishing mistake rather than an attack.
     */
    it('keeps the rest of a signed document when one row is wrong', () => {
        const result = talosReadCatalogue(document({
            models: [entry({ id: 'bad', file_bytes: undefined }), entry({ id: 'good' })],
        }), SIG, accepts)

        expect(result.ok).toBe(true)
        if (!result.ok) return
        expect(result.catalogue.entries.map((row) => row.id)).toEqual(['good'])
    })

    it('keeps reference speeds as measurements on named hardware', () => {
        const result = talosReadCatalogue(document(), SIG, accepts)

        expect(result.ok).toBe(true)
        if (!result.ok) return
        expect(result.catalogue.entries[0]!.referenceSpeed)
            .toEqual([{ soc: 'sm8650', engine: 'llamacpp', tokensPerSecond: 11.4 }])
    })

    /** A speed with no hardware attached is not a measurement, it is a claim. */
    it('discards a reference speed that names no hardware', () => {
        const result = talosReadCatalogue(document({
            models: [entry({ reference_speed: [{ engine: 'llamacpp', tokens_per_second: 40 }] })],
        }), SIG, accepts)

        expect(result.ok).toBe(true)
        if (!result.ok) return
        expect(result.catalogue.entries[0]!.referenceSpeed).toEqual([])
    })
})

describe('how old the cache is', () => {
    /**
     * A stale catalogue is still a catalogue — offline is the normal condition
     * for this feature. What it must not do is imply it is current.
     */
    it('says how many days ago it was true', () => {
        expect(talosCatalogueAgeDays('2026-07-26T10:00:00Z', new Date('2026-08-01T10:00:00Z')))
            .toBe(6)
        expect(talosCatalogueAgeDays('2026-08-01T09:00:00Z', new Date('2026-08-01T10:00:00Z')))
            .toBe(0)
    })

    /** A phone with a wrong clock must not report a catalogue from the future. */
    it('never reports a negative age', () => {
        expect(talosCatalogueAgeDays('2026-09-01T00:00:00Z', new Date('2026-08-01T00:00:00Z')))
            .toBe(0)
    })

    it('says nothing when the date cannot be read', () => {
        expect(talosCatalogueAgeDays('', new Date())).toBeNull()
        expect(talosCatalogueAgeDays('whenever', new Date())).toBeNull()
    })
})

describe('what to put in front of this phone', () => {
    const phone: TalosDeviceCapacity = {
        totalRamBytes: 8 * GIB,
        availableRamBytes: 5 * GIB,
        lowMemoryThresholdBytes: 512 * 1024 ** 2,
        freeStorageBytes: 40 * GIB,
        memoryBandwidthBytesPerSecond: 40 * GIB,
        thermal: 'none',
        abiSupported: true,
    }

    function models() {
        const result = talosReadCatalogue(document({
            models: [
                entry({ id: 'tiny', ram_working_bytes: 1 * GIB, file_bytes: 0.7 * GIB }),
                entry({ id: 'huge', ram_working_bytes: 20 * GIB, file_bytes: 18 * GIB }),
                entry({ id: 'big', ram_working_bytes: 4 * GIB, file_bytes: 3 * GIB }),
            ],
        }), SIG, accepts)
        if (!result.ok) throw new Error('fixture failed to parse')
        return result.catalogue.entries
    }

    /**
     * The biggest model a phone can actually hold is the best one it can run,
     * so burying it under three smaller ones helps nobody.
     */
    it('offers the largest that fits, first', () => {
        const ranked = talosRecommendFromCatalogue(models(), phone)

        expect(ranked.map((row) => row.entry.id)).toEqual(['big', 'tiny', 'huge'])
        expect(ranked[0]!.fits).toBe(true)
        expect(ranked[2]!.fits).toBe(false)
    })

    /**
     * And it answers from the catalogue's own figures — no header read, no Hub
     * request. That is what makes a recommendation possible offline, from
     * cache, without spending against a rate limit shared with a whole carrier.
     */
    it('judges memory from the working figure, never the file size', () => {
        const ranked = talosRecommendFromCatalogue(
            [{ ...models()[0]!, fileBytes: 100, ramWorkingBytes: 20 * GIB }], phone)

        expect(ranked[0]!.fits).toBe(false)
    })

    it('refuses everything native on a phone that is not 64-bit ARM', () => {
        const ranked = talosRecommendFromCatalogue(models(), { ...phone, abiSupported: false })

        // Only the entries that also declare a WebGPU runtime survive.
        expect(ranked.every((row) => row.entry.runtime.includes('webgpu'))).toBe(true)
    })

    it('will not recommend a model there is no room on disk for', () => {
        const ranked = talosRecommendFromCatalogue(models(), { ...phone, freeStorageBytes: 1 * GIB })

        expect(ranked.find((row) => row.entry.id === 'big')!.fits).toBe(false)
        expect(ranked.find((row) => row.entry.id === 'big')!.capacity.state).toBe('storage-blocked')
    })

    it('uses the one-gibibyte reserve instead of comparing the bare file', () => {
        const fileBytes = 3 * GIB
        const onlySevenHundredMibLeft = fileBytes + 700 * 1024 ** 2
        const ranked = talosRecommendFromCatalogue(
            [{ ...models()[0]!, fileBytes, ramWorkingBytes: 2 * GIB }],
            { ...phone, freeStorageBytes: onlySevenHundredMibLeft },
        )

        expect(ranked[0]!.fits).toBe(false)
        expect(ranked[0]!.capacity).toMatchObject({
            state: 'storage-blocked',
            limit: 'storage',
            missingBytes: 324 * 1024 ** 2,
        })
    })

    it('does not recommend when storage could not be measured', () => {
        const ranked = talosRecommendFromCatalogue(models(), { ...phone, freeStorageBytes: null })

        expect(ranked.every((row) => row.fits === false)).toBe(true)
        expect(ranked.every((row) => row.capacity.state === 'unknown')).toBe(true)
    })
})
