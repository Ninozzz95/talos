import { Capacitor, CapacitorHttp } from '@capacitor/core'

/**
 * How the Hugging Face client actually reaches the network on a phone.
 *
 * It exists because of a defect that every unit test in this repository
 * certified as working. The client asked the WebView's `fetch` for
 * `redirect: 'manual'` and then read the `location` header — which cannot work:
 * per the Fetch standard a manual redirect on a non-navigation request yields
 * an OPAQUE-REDIRECT filtered response, with status 0, an empty header list and
 * a null body. So every attempt to learn where the bytes live threw, and the
 * fit verdict — the one answer this whole feature exists to give — never
 * produced a single result on a real device. The tests passed because they
 * handed the client `new Response(null, {status: 302, headers: {location}})`, a
 * shape browser `fetch` can never return.
 *
 * `CapacitorHttp` is the native path the rest of this app already standardises
 * on for exactly this reason (see `pageExtract.ts`, `anthropicClient.ts`): it
 * runs outside the WebView, so it is not subject to CORS and it can be told to
 * hand back the redirect instead of following it.
 *
 * Shaped like `fetch` on purpose. The Hub client takes a transport, so this
 * slots in with no change to the code that knows the Hub's rules — and the
 * injected-transport tests keep working untouched.
 */

/** Only the parts of a `Response` the Hub client uses; a real one is returned. */
type Fetch = typeof globalThis.fetch

function headersOf(raw: unknown): Headers {
    const headers = new Headers()
    if (!raw || typeof raw !== 'object') return headers
    for (const [name, value] of Object.entries(raw as Record<string, unknown>)) {
        // Header names arrive with whatever case the server sent; `Headers`
        // normalises, which is the entire reason for going through it rather
        // than reading the object directly.
        if (typeof value === 'string') headers.set(name, value)
        else if (Array.isArray(value)) headers.set(name, value.join(', '))
    }
    return headers
}

/**
 * Whatever the native layer handed over, turned back into a body.
 *
 * Written against the plugin's ACTUAL branches, read out of
 * `HttpRequestHandler.readData` rather than assumed:
 *
 *   if (contentType contains application/json)  -> parseJSON(...)   // an OBJECT
 *   else switch (responseType) {
 *     ARRAY_BUFFER, BLOB -> readStreamAsBase64(...)                 // a STRING
 *     default            -> readStreamAsString(...)                 // a STRING
 *   }
 *
 * The first branch is the one that matters and the one I got wrong: a JSON
 * content type IGNORES `responseType` entirely and returns a parsed object. I
 * had assumed asking for `arraybuffer` always produced base64, wrote that
 * assumption into a comment, and tested the assumption — so eleven tests passed
 * while every Hub search on the phone died with "transport": the object decoded
 * to zero bytes and `.json()` threw on an empty body.
 *
 * Same shape as the defect this file was created to fix. The lesson is the
 * same one: read the thing, do not model it.
 */
export function talosDecodeHubBody(data: unknown, isJson = false): BodyInit | null {
    if (data === null || data === undefined) return null
    if (data instanceof ArrayBuffer) return data
    if (ArrayBuffer.isView(data)) {
        const view = data as ArrayBufferView
        return view.buffer.slice(view.byteOffset, view.byteOffset + view.byteLength) as ArrayBuffer
    }
    // Already parsed by the plugin: hand it back as the text it came from, so
    // the caller's own `.json()` sees exactly what the server sent.
    if (typeof data === 'object') return JSON.stringify(data)
    if (typeof data !== 'string') return null
    if (data === '') return null
    // A JSON content type never arrives base64, whatever was asked for.
    if (isJson) return data
    return base64ToBytes(data)
}

/** Only reached for a non-JSON body that was requested as bytes. */
function base64ToBytes(value: string): ArrayBuffer {
    const binary = atob(value)
    const bytes = new Uint8Array(binary.length)
    for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index)
    return bytes.buffer
}

/**
 * A `fetch` that can see a redirect.
 *
 * @param native injected for tests; defaults to the real plugin.
 */
export function talosCreateHubTransport(
    native: typeof CapacitorHttp = CapacitorHttp,
    isNative: () => boolean = () => Capacitor.isNativePlatform(),
): Fetch {
    return (async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
        // In a browser there is no plugin and no CORS problem worth solving
        // here: the dev harness and the tests run on the real thing.
        if (!isNative()) return await globalThis.fetch(input, init)

        const url = typeof input === 'string' ? input : input.toString()
        const method = (init?.method ?? 'GET').toUpperCase()
        const sent: Record<string, string> = {}
        new Headers(init?.headers).forEach((value, name) => { sent[name] = value })

        // `arraybuffer` is asked for so the CDN's bytes arrive intact; the
        // plugin overrides it for a JSON content type and hands back a parsed
        // object instead, which `talosDecodeHubBody` is written around.
        const response = await native.request({
            url,
            method,
            headers: sent,
            data: init?.body === undefined || init.body === null ? undefined : String(init.body),
            // THE point of this file. Without it the plugin follows the 302 and
            // the signed address is never visible.
            disableRedirects: init?.redirect === 'manual',
            responseType: 'arraybuffer',
        })

        const headers = headersOf(response.headers)
        const isJson = (headers.get('content-type') ?? '').includes('json')
        const body = talosDecodeHubBody(response.data, isJson)
        // A 204 or 304 must carry no body, and `Response` throws if given one.
        const empty = response.status === 204 || response.status === 304
        return new Response(empty ? null : body, {
            status: response.status,
            headers,
        })
    }) as Fetch
}
