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
    return translate(error.uiMessageKey, error.uiMessageParameters)
}

