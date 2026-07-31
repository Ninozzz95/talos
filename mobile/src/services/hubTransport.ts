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
 * Bytes back from the native layer.
 *
 * With `responseType: 'arraybuffer'` the Android plugin hands over BASE64 in a
 * string, not an ArrayBuffer — the name describes what the caller wanted, not
 * what crosses the bridge. Getting this wrong does not throw: it produces a
 * GGUF header made of the wrong bytes, which the parser then rejects as "not a
 * GGUF", blaming the model for the transport.
 */
export function talosDecodeHubBody(data: unknown): ArrayBuffer {
    if (data instanceof ArrayBuffer) return data
    if (ArrayBuffer.isView(data)) {
        const view = data as ArrayBufferView
        return view.buffer.slice(view.byteOffset, view.byteOffset + view.byteLength) as ArrayBuffer
    }
    if (typeof data !== 'string' || data === '') return new ArrayBuffer(0)
    const binary = atob(data)
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
        const headers: Record<string, string> = {}
        new Headers(init?.headers).forEach((value, name) => { headers[name] = value })

        // Binary for everything: the Hub answers JSON to the API and bytes to
        // the CDN, and one path that always decodes correctly beats two that
        // each work half the time.
        const response = await native.request({
            url,
            method,
            headers,
            data: init?.body === undefined || init.body === null ? undefined : String(init.body),
            // THE point of this file. Without it the plugin follows the 302 and
            // the signed address is never visible.
            disableRedirects: init?.redirect === 'manual',
            responseType: 'arraybuffer',
        })

        const body = talosDecodeHubBody(response.data)
        // A 204 or 304 must carry no body, and `Response` throws if given one.
        const empty = response.status === 204 || response.status === 304
        return new Response(empty || body.byteLength === 0 ? null : body, {
            status: response.status,
            headers: headersOf(response.headers),
        })
    }) as Fetch
}
