import type { TalosMessageTree, TalosSupportedLocale } from '@/i18n/contracts'
import { TALOS_EN_MESSAGES } from '@/i18n/locales/en'
import { TALOS_IT_MESSAGES } from '@/i18n/locales/it'

type Parameters = Record<string, string | number>

function messageAt(messages: TalosMessageTree, key: string): string {
    let current: string | TalosMessageTree = messages
    for (const segment of key.split('.')) {
        if (typeof current === 'string' || !(segment in current)) return key
        current = current[segment]!
    }
    return typeof current === 'string' ? current : key
}

export function talosTestT(
    locale: TalosSupportedLocale = 'en',
): (key: string, parameters?: Parameters) => string {
    const messages = locale === 'it' ? TALOS_IT_MESSAGES : TALOS_EN_MESSAGES
    return (key, parameters) => {
        let result = messageAt(messages, key)
        for (const [name, value] of Object.entries(parameters ?? {})) {
            result = result.replaceAll(`{${name}}`, String(value))
        }
        return result
    }
}

