import { CapacitorHttp } from '@capacitor/core'

export type TalosMobileHttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'

export interface TalosMobileHttpRequest {
    method: TalosMobileHttpMethod
    url: string
    headers?: Record<string, string>
    data?: unknown
    params?: Record<string, string>
    connectTimeout?: number
    readTimeout?: number
}

export interface TalosMobileHttpResponse {
    status: number
    data: unknown
    headers?: Record<string, string>
}

export interface TalosMobileHttpTransport {
    request(request: TalosMobileHttpRequest): Promise<TalosMobileHttpResponse>
}

/**
 * ⛔⛔ `disableRedirects` e OBBLIGATORIO nel tipo, non facoltativo.
 *
 * Facoltativo significherebbe che si puo costruire una richiesta nativa senza,
 * e allora il confine dipenderebbe da chi si ricorda di metterlo. Cosi non
 * compila: e il tipo a non lasciare passare la forma sbagliata, e non serve un
 * controllo a runtime che qualcuno prima o poi toglie.
 */
type NativeRequest = (
    request: TalosMobileHttpRequest & { disableRedirects: true },
) => Promise<{
    status: number
    data: unknown
    headers?: Record<string, string>
}>

export function createTalosMobileHttpTransport(
    nativeRequest: NativeRequest = (request) => CapacitorHttp.request(request),
): TalosMobileHttpTransport {
    return {
        async request(request) {
            try {
                /*
                 * ⛔⛔ E il ponte nativo non li segue nemmeno lui.
                 *
                 * Si impone QUI e non si legge da `request`: un confine che chi
                 * chiama puo spegnere non e un confine. Il binding di Capacitor
                 * espone `disableRedirects`, quindi non serve un involucro
                 * nativo nostro — c'era gia, e nessuno lo usava.
                 */
                const response = await nativeRequest({ ...request, disableRedirects: true })
                return {
                    status: response.status,
                    data: response.data,
                    ...(response.headers ? { headers: response.headers } : {}),
                }
            } catch (error) {
                throw new Error(error instanceof Error && error.message ? error.message : 'Network request failed')
            }
        },
    }
}

export const talosMobileHttpTransport = createTalosMobileHttpTransport()
