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

type NativeRequest = (request: TalosMobileHttpRequest) => Promise<{
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
                const response = await nativeRequest(request)
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
