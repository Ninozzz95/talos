export type TalosValidationErrors = Record<string, string[]>

export type TalosApiErrorOptions = {
    status?: number
    statusText?: string
    details?: unknown
    validationErrors?: TalosValidationErrors
    responseText?: string
    cause?: unknown
}

export class TalosApiError extends Error {
    status?: number
    statusText?: string
    details?: unknown
    validationErrors?: TalosValidationErrors
    responseText?: string

    constructor(message: string, options: TalosApiErrorOptions = {}) {
        super(message)
        this.name = 'TalosApiError'
        this.status = options.status
        this.statusText = options.statusText
        this.details = options.details
        this.validationErrors = options.validationErrors
        this.responseText = options.responseText

        if (options.cause) {
            this.cause = options.cause
        }
    }
}

export type TalosFetchOptions = RequestInit & {
    validationMessage?: string
    networkMessage?: string
}

function isJsonResponse(response: Response) {
    return response.headers.get('content-type')?.toLowerCase().includes('application/json') ?? false
}

function isValidationErrors(value: unknown): value is TalosValidationErrors {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        return false
    }

    return Object.values(value).every((messages) => (
        Array.isArray(messages) && messages.every((message) => typeof message === 'string')
    ))
}

async function parseResponseBody(response: Response) {
    if (response.status === 204) {
        return { data: undefined, text: '' }
    }

    if (isJsonResponse(response)) {
        const text = await response.text()

        if (!text.trim()) {
            return { data: undefined, text }
        }

        try {
            return { data: JSON.parse(text) as unknown, text }
        } catch {
            return { data: undefined, text }
        }
    }

    const text = await response.text()
    return { data: text, text }
}

function messageFromPayload(payload: unknown, fallback: string) {
    if (payload && typeof payload === 'object' && 'message' in payload) {
        const message = (payload as { message?: unknown }).message

        if (typeof message === 'string' && message.trim()) {
            return message
        }
    }

    if (typeof payload === 'string' && payload.trim()) {
        return payload
    }

    return fallback
}

export async function talosFetch<T>(input: RequestInfo | URL, options: TalosFetchOptions = {}): Promise<T> {
    const headers = new Headers(options.headers)

    if (!headers.has('Accept')) {
        headers.set('Accept', 'application/json')
    }

    if (options.body && typeof options.body === 'string' && !headers.has('Content-Type')) {
        headers.set('Content-Type', 'application/json')
    }

    let response: Response

    try {
        response = await fetch(input, {
            ...options,
            headers,
        })
    } catch (error) {
        throw new TalosApiError(
            options.networkMessage ?? 'TALOS could not reach the control plane. Check your connection and try again.',
            { cause: error },
        )
    }

    const { data, text } = await parseResponseBody(response)

    if (response.ok) {
        return data as T
    }

    const validationErrors = data && typeof data === 'object' && 'errors' in data && isValidationErrors((data as { errors?: unknown }).errors)
        ? (data as { errors: TalosValidationErrors }).errors
        : undefined

    if (response.status === 422) {
        throw new TalosApiError(
            messageFromPayload(data, options.validationMessage ?? 'The request did not pass TALOS validation.'),
            {
                status: response.status,
                statusText: response.statusText,
                details: data,
                validationErrors,
                responseText: text,
            },
        )
    }

    throw new TalosApiError(
        messageFromPayload(data, `TALOS request failed with HTTP ${response.status}.`),
        {
            status: response.status,
            statusText: response.statusText,
            details: data,
            responseText: text,
        },
    )
}
