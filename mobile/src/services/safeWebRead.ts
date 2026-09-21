import { Capacitor, registerPlugin } from '@capacitor/core'

export interface TalosSafeWebReadResponse {
    status: number
    url: string
    body: string
}

/**
 * The bytes of a favicon or a preview image for a Library source card.
 *
 * Captured ONCE at save time and rendered offline forever, so this is the only
 * moment those bytes are fetched — which is what lets the sources chip show
 * real favicons without a request to every site each time a chat is opened.
 */
export interface TalosSafeWebImageResponse {
    status: number
    url: string
    contentType: string
    base64: string
}

interface TalosSafeWebBridge {
    read(input: { url: string }): Promise<unknown>
    readBytes(input: { url: string }): Promise<unknown>
}

let bridge: TalosSafeWebBridge | null = null

function plugin(): TalosSafeWebBridge {
    return (bridge ??= registerPlugin<TalosSafeWebBridge>('TalosSafeWeb'))
}

function response(value: unknown): TalosSafeWebReadResponse {
    if (!value || typeof value !== 'object') {
        throw new Error('TALOS_SAFE_WEB_RESPONSE_INVALID')
    }
    const row = value as Record<string, unknown>
    if (
        typeof row.status !== 'number'
        || !Number.isInteger(row.status)
        || typeof row.url !== 'string'
        || row.url === ''
        || typeof row.body !== 'string'
    ) {
        throw new Error('TALOS_SAFE_WEB_RESPONSE_INVALID')
    }
    return {
        status: row.status,
        url: row.url,
        body: row.body,
    }
}

/**
 * Android is the only current native product target with the DNS-pinned
 * reader. A browser fallback could re-resolve after validation, so it fails
 * closed instead of pretending to offer the same boundary.
 */
export async function readTalosSafeWebPage(url: string): Promise<TalosSafeWebReadResponse> {
    if (Capacitor.getPlatform() !== 'android') {
        throw new Error('TALOS_SAFE_WEB_READ_UNAVAILABLE')
    }
    return response(await plugin().read({ url }))
}

/**
 * Fetch an image through the same boundary as a page.
 *
 * The native side already refuses non-image content, and so does this: bytes
 * are about to be written to the device and a document arriving where an image
 * is expected should be refused twice rather than once.
 *
 * Closed off Android for the same reason as the page reader — a browser could
 * re-resolve the host after validation, so there is no honest fallback.
 */
export async function readTalosSafeWebImage(url: string): Promise<TalosSafeWebImageResponse> {
    if (Capacitor.getPlatform() !== 'android') {
        throw new Error('TALOS_SAFE_WEB_READ_UNAVAILABLE')
    }
    const value = await plugin().readBytes({ url })
    if (!value || typeof value !== 'object') {
        throw new Error('TALOS_SAFE_WEB_RESPONSE_INVALID')
    }
    const row = value as Record<string, unknown>
    if (
        typeof row.status !== 'number'
        || !Number.isInteger(row.status)
        || typeof row.url !== 'string'
        || row.url === ''
        || typeof row.contentType !== 'string'
        || typeof row.base64 !== 'string'
    ) {
        throw new Error('TALOS_SAFE_WEB_RESPONSE_INVALID')
    }
    if (!row.contentType.toLowerCase().startsWith('image/')) {
        throw new Error('TALOS_SAFE_WEB_NOT_AN_IMAGE')
    }
    return {
        status: row.status,
        url: row.url,
        contentType: row.contentType,
        base64: row.base64,
    }
}

