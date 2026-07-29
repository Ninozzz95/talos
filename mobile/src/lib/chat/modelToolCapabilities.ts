import type { TalosMobileProviderModel } from '@/lib/chat/providerContracts'

/**
 * OpenRouter publishes model-level request capabilities in
 * `supported_parameters`; `tools` is its canonical function-calling token.
 *
 * Other provider catalogs do not expose the same contract, so applying this
 * absence rule globally would disable working Anthropic/OpenAI/Gemini/Ollama
 * tool paths. OpenRouter alone therefore fails closed on a missing token.
 */
export function talosModelSupportsToolCalling(model: TalosMobileProviderModel): boolean {
    return model.provider !== 'openrouter'
        || model.supportedParameters.includes('tools')
}

