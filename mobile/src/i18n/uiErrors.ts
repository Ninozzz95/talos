import type { TalosMessageParameters, TalosTranslate } from '@/i18n/contracts'

export interface TalosTranslatableError {
    readonly uiMessageKey: string
    readonly uiMessageParameters?: TalosMessageParameters
}

export class TalosUiError extends Error implements TalosTranslatableError {
    readonly uiMessageKey: string
    readonly uiMessageParameters?: TalosMessageParameters

    constructor(
        code: string,
        uiMessageKey: string,
        uiMessageParameters?: TalosMessageParameters,
    ) {
        super(code)
        this.name = 'TalosUiError'
        this.uiMessageKey = uiMessageKey
        this.uiMessageParameters = uiMessageParameters
    }
}

function isTranslatable(error: unknown): error is Error & TalosTranslatableError {
    return error instanceof Error
        && 'uiMessageKey' in error
        && typeof error.uiMessageKey === 'string'
        && error.uiMessageKey.length > 0
}

export function talosTranslatableErrorMessage(
    error: unknown,
    translate: TalosTranslate,
): string | null {
    if (!isTranslatable(error)) return null
    // A COPY. `escapeParameter` is on, and vue-i18n escapes the values of the
    // object it is handed — in place. Passing the error's own parameters
    // therefore rewrites them: after one translation, `path` is no longer
    // `/storage/…` but `&#x2F;storage&#x2F;…`, for every later reader.
    //
    // It reached a user that way on 2026-08-01: the path shown beside the
    // message came out escaped even though nothing was interpolating it any
    // more, because translating the sentence had already spoiled the object it
    // came from. Translating must not modify the error it describes.
    return translate(
        error.uiMessageKey,
        error.uiMessageParameters ? { ...error.uiMessageParameters } : undefined,
    )
}

