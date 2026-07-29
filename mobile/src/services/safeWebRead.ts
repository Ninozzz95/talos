import { Capacitor, registerPlugin } from '@capacitor/core'

export interface TalosSafeWebReadResponse {
    status: number
    url: string
    body: string
}

interface TalosSafeWebBridge {
    read(input: { url: string }): Promise<unknown>
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

