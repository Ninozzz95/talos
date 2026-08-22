import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Fetching, verifying and remembering the signed catalogue.
 *
 * The two properties worth this file: nothing is believed without the
 * signature — INCLUDING the cached copy, because a cache is a file on a device
 * and files on devices get edited — and nothing is configured by default, so a
 * build with no host and no key is simply absent rather than broken.
 */
const store = vi.hoisted(() => ({
    values: new Map<string, string>(),
    verify: vi.fn(async () => true),
}))

vi.mock('@capacitor/preferences', () => ({
    Preferences: {
        get: async ({ key }: { key: string }) => ({ value: store.values.get(key) ?? null }),
        set: async ({ key, value }: { key: string; value: string }) => {
            store.values.set(key, value)
        },
    },
}))

import { talosLoadModelCatalogue } from '@/services/modelCatalogue'
import { TALOS_CATALOGUE_SCHEMA } from '@/lib/models/catalogue'

const SOURCE = { url: 'https://talos.example/catalogue.json', publicKey: 'a'.repeat(44) }

const BODY = JSON.stringify({
    schema_version: TALOS_CATALOGUE_SCHEMA,
    generated_at: '2026-07-26T10:00:00Z',
    models: [{
        id: 'gemma-3n-e4b-q4',
        file_bytes: 3_100_000_000,
        ram_working_bytes: 3_600_000_000,
        sha256: 'a'.repeat(64),
        download: { kind: 'huggingface', repo: 'google/x', file: 'model.gguf' },
        runtime: ['llamacpp'],
    }],
})

function transport(answers: Record<string, string>, fail = false): typeof globalThis.fetch {
    return (async (input: RequestInfo | URL) => {
        if (fail) throw new Error('offline')
        const url = String(input)
        const body = answers[url]
        if (body === undefined) throw new Error(`no route for ${url}`)
        return new Response(body)
    }) as typeof globalThis.fetch
}

const ROUTES = {
    [SOURCE.url]: BODY,
    [`${SOURCE.url}.sig`]: 'c2lnbmF0dXJl',
}

beforeEach(() => {
    store.values.clear()
    vi.stubGlobal('crypto', {
        subtle: {
            importKey: async () => ({}),
            verify: async () => store.verify(),
        },
    })
    store.verify.mockReset().mockResolvedValue(true)
})

describe('when nothing is configured', () => {
    /**
     * There is no host and no key in this build, and that is the honest state
     * until somebody decides both. Pointing at a placeholder would fail in a
     * way that looks like a bug rather than like an unfinished decision.
     */
    it('is absent rather than broken', async () => {
        expect(await talosLoadModelCatalogue(null, transport({}))).toEqual({ state: 'unconfigured' })
        expect(await talosLoadModelCatalogue({ url: '', publicKey: 'x' }, transport({})))
            .toEqual({ state: 'unconfigured' })
        expect(await talosLoadModelCatalogue({ url: 'https://x', publicKey: '' }, transport({})))
            .toEqual({ state: 'unconfigured' })
    })
})

describe('fetching it', () => {
    it('reads a catalogue whose detached signature verifies', async () => {
        const result = await talosLoadModelCatalogue(
            SOURCE, transport(ROUTES), new Date('2026-08-01T10:00:00Z'))

        expect(result.state).toBe('ready')
        if (result.state !== 'ready') return
        expect(result.catalogue.entries).toHaveLength(1)
        expect(result.ageDays).toBe(6)
        expect(result.fromCache).toBe(false)
    })

    it('refuses one whose signature does not', async () => {
        store.verify.mockResolvedValue(false)

        expect(await talosLoadModelCatalogue(SOURCE, transport(ROUTES)))
            .toEqual({ state: 'refused', reason: 'unverified' })
    })

    /**
     * A build whose WebView cannot do Ed25519 verifies NOTHING and accepts
     * nothing. A signature check that quietly turns itself off is worse than no
     * check at all, because it looks like one.
     */
    it('accepts nothing when the platform cannot verify', async () => {
        vi.stubGlobal('crypto', { subtle: { importKey: async () => { throw new Error('no ed25519') } } })

        expect(await talosLoadModelCatalogue(SOURCE, transport(ROUTES)))
            .toEqual({ state: 'refused', reason: 'unverified' })
    })
})

describe('remembering it', () => {
    /**
     * Offline is the normal condition for this feature: a phone in a tunnel
     * should still see what it could run. What the cache must never do is imply
     * it is current, which is why its age comes back with it.
     */
    it('falls back to the cached copy when the network cannot be reached', async () => {
        await talosLoadModelCatalogue(SOURCE, transport(ROUTES))

        const offline = await talosLoadModelCatalogue(
            SOURCE, transport({}, true), new Date('2026-08-01T10:00:00Z'))

        expect(offline.state).toBe('ready')
        if (offline.state !== 'ready') return
        expect(offline.fromCache).toBe(true)
        expect(offline.ageDays).toBe(6)
    })

    /**
     * THE one worth the file. The cached copy is re-verified on the way OUT of
     * storage — a cache is a file on a device, and files on devices get edited.
     */
    it('re-verifies the cache instead of trusting that it was checked once', async () => {
        await talosLoadModelCatalogue(SOURCE, transport(ROUTES))

        // The same bytes, but the signature no longer checks out.
        store.verify.mockResolvedValue(false)
        const tampered = await talosLoadModelCatalogue(SOURCE, transport({}, true))

        expect(tampered).toEqual({ state: 'refused', reason: 'unverified' })
    })

    /** A document that failed is not kept: it would fail again on every launch. */
    it('never caches a catalogue that did not verify', async () => {
        store.verify.mockResolvedValue(false)
        await talosLoadModelCatalogue(SOURCE, transport(ROUTES))

        store.verify.mockResolvedValue(true)
        expect(await talosLoadModelCatalogue(SOURCE, transport({}, true)))
            .toEqual({ state: 'refused', reason: 'offline' })
    })

    it('says plainly when it has nothing at all', async () => {
        expect(await talosLoadModelCatalogue(SOURCE, transport({}, true)))
            .toEqual({ state: 'refused', reason: 'offline' })
    })
})
