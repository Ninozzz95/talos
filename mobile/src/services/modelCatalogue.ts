import { Preferences } from '@capacitor/preferences'
import {
    talosCatalogueAgeDays,
    talosReadCatalogue,
    type TalosCatalogue,
    type TalosCatalogueRefusal,
} from '@/lib/models/catalogue'

/**
 * Fetching, verifying and remembering the signed catalogue — M8.
 *
 * The showcase is served by us rather than read from Hugging Face, and that is
 * not a matter of taste: browsing the Hub costs a request per screen against a
 * limit that is per IP ADDRESS, and a carrier puts thousands of subscribers
 * behind one. A list we serve is what stops somebody being throttled for
 * traffic that was never theirs.
 *
 * Two rules govern everything here.
 *
 * NOTHING IS BELIEVED WITHOUT THE SIGNATURE. A downloaded list is network, and
 * the network does not decide what runs on somebody's phone. That includes the
 * cached copy: it is re-verified on the way out of storage, because a cache is
 * a file on a device and files on devices get edited.
 *
 * AND NOTHING IS CONFIGURED BY DEFAULT. There is no URL and no key compiled
 * into this build. Until both are supplied the feature is simply absent — the
 * Local tab shows search and promises nothing — rather than pointing at a host
 * that does not exist yet and failing in a way that looks like a bug.
 */

const CACHE_KEY = 'talos.models.catalogue'
const CACHE_SIGNATURE_KEY = 'talos.models.catalogue.sig'

/**
 * Where the catalogue lives and which key signs it.
 *
 * EMPTY on purpose, and it is the owner's decision to fill: a host to serve it
 * and a private key to sign with, of which only the public half ever ships.
 * Baking a placeholder here would be baking a promise this build cannot keep.
 */
export interface TalosCatalogueSource {
    /** e.g. `https://…/catalogue.json`; the signature is that plus `.sig`. */
    url: string
    /** Ed25519 public key, base64, raw 32 bytes. */
    publicKey: string
}

export const TALOS_CATALOGUE_SOURCE: TalosCatalogueSource | null = null

export type TalosCatalogueState =
    | { state: 'unconfigured' }
    | { state: 'ready'; catalogue: TalosCatalogue; ageDays: number | null; fromCache: boolean }
    | { state: 'refused'; reason: TalosCatalogueRefusal | 'offline' }

function bytesOf(base64: string): Uint8Array {
    const binary = atob(base64)
    const bytes = new Uint8Array(binary.length)
    for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index)
    return bytes
}

/**
 * Ed25519, through the platform's own crypto.
 *
 * Asynchronous, so the pure reader takes a synchronous verifier and this
 * resolves the answer first — the reader stays provable without a WebCrypto
 * implementation, and the crypto stays the platform's rather than ours.
 *
 * A build whose WebView cannot do Ed25519 verifies NOTHING and therefore
 * accepts nothing. That is the correct failure: a signature check that quietly
 * turns itself off is worse than no signature check, because it looks like one.
 */
export async function talosVerifyCatalogueSignature(
    body: string,
    signature: string,
    publicKey: string,
): Promise<boolean> {
    try {
        const key = await crypto.subtle.importKey(
            'raw', bytesOf(publicKey) as BufferSource, { name: 'Ed25519' }, false, ['verify'])
        return await crypto.subtle.verify(
            { name: 'Ed25519' },
            key,
            bytesOf(signature) as BufferSource,
            new TextEncoder().encode(body) as BufferSource,
        )
    } catch {
        return false
    }
}

async function remember(body: string, signature: string): Promise<void> {
    await Preferences.set({ key: CACHE_KEY, value: body }).catch(() => undefined)
    await Preferences.set({ key: CACHE_SIGNATURE_KEY, value: signature }).catch(() => undefined)
}

async function remembered(): Promise<{ body: string; signature: string } | null> {
    try {
        const body = (await Preferences.get({ key: CACHE_KEY })).value
        const signature = (await Preferences.get({ key: CACHE_SIGNATURE_KEY })).value
        return body && signature ? { body, signature } : null
    } catch {
        return null
    }
}

/**
 * The catalogue, from the network if it can be reached and from the cache if
 * it cannot.
 *
 * A stale catalogue is still a catalogue — offline is the normal condition for
 * this feature, and a phone in a train tunnel should still be able to see what
 * it could run. What a cache must never do is imply it is current, so its age
 * comes back with it.
 */
export async function talosLoadModelCatalogue(
    source: TalosCatalogueSource | null = TALOS_CATALOGUE_SOURCE,
    transport: typeof globalThis.fetch = globalThis.fetch,
    now: Date = new Date(),
): Promise<TalosCatalogueState> {
    if (!source || source.url === '' || source.publicKey === '') return { state: 'unconfigured' }

    const verified = async (body: string, signature: string): Promise<TalosCatalogueState> => {
        const ok = await talosVerifyCatalogueSignature(body, signature, source.publicKey)
        const read = talosReadCatalogue(body, signature, () => ok)
        if (!read.ok) return { state: 'refused', reason: read.reason }
        return {
            state: 'ready',
            catalogue: read.catalogue,
            ageDays: talosCatalogueAgeDays(read.catalogue.generatedAt, now),
            fromCache: false,
        }
    }

    // Why the network attempt failed, kept so it can be reported instead of
    // being flattened into "offline". A signature that did not check out is a
    // different problem from a tunnel, and telling someone the wrong one sends
    // them to fix the wrong thing.
    let networkRefusal: TalosCatalogueRefusal | null = null

    try {
        const [body, signature] = await Promise.all([
            transport(source.url).then((response) => response.text()),
            transport(`${source.url}.sig`).then((response) => response.text()),
        ])
        const fresh = await verified(body, signature)
        // Only a document that actually verified is worth keeping: caching one
        // that failed would mean serving the failure back on every launch.
        if (fresh.state === 'ready') {
            await remember(body, signature)
            return fresh
        }
        if (fresh.state === 'refused') networkRefusal = fresh.reason as TalosCatalogueRefusal
    } catch {
        // Unreachable is not a refusal — fall through to what we already have.
    }

    // A good cache still beats a bad fetch: a catalogue that verified yesterday
    // is worth more than one that failed to verify a moment ago.
    const cached = await remembered()
    if (!cached) return { state: 'refused', reason: networkRefusal ?? 'offline' }

    // Re-verified on the way OUT of storage: a cache is a file on a device, and
    // files on devices get edited.
    const restored = await verified(cached.body, cached.signature)
    return restored.state === 'ready' ? { ...restored, fromCache: true } : restored
}
