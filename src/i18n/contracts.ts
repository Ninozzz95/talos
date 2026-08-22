export type TalosLocaleMode = 'system' | 'en' | 'it'
export type TalosSupportedLocale = Exclude<TalosLocaleMode, 'system'>
export type TalosMessageParameters = Record<string, string | number>
export type TalosTranslate = (key: string, parameters?: TalosMessageParameters) => string

export type TalosMessageTree = {
    readonly [key: string]: string | TalosMessageTree
}

export type TalosTranslatedMessages<T> = {
    readonly [Key in keyof T]: T[Key] extends string
        ? string
        : T[Key] extends TalosMessageTree
            ? TalosTranslatedMessages<T[Key]>
            : never
}

export interface TalosLocalizationState {
    mode: TalosLocaleMode
    locale: TalosSupportedLocale
    systemLocale: TalosSupportedLocale
    switching: boolean
    ready: boolean
    error: string | null
}
