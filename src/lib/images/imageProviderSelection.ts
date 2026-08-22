import type { TalosImageProvider } from '@/lib/images/imageGateway'

export function chooseTalosImageProvider(
    available: Partial<Record<TalosImageProvider, boolean>>,
    preferred?: string | null,
): TalosImageProvider | null {
    if (
        (preferred === 'openai' || preferred === 'gemini' || preferred === 'openrouter')
        && available[preferred] === true
    ) return preferred
    if (available.openai === true) return 'openai'
    if (available.gemini === true) return 'gemini'
    if (available.openrouter === true) return 'openrouter'
    return null
}
