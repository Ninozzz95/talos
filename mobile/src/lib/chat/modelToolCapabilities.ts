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
    // The on-device engine has no tool wire at all. llama.cpp returns text; the
    // structured call format the other families implement is a service-side
    // contract, and a GGUF of a few billion parameters has never agreed to one.
    // Offering schemas anyway would spend context a small model has little of,
    // to describe abilities it cannot use, and the replies would arrive as prose
    // pretending to be a call.
    if (model.provider === 'local') return false
    return model.provider !== 'openrouter'
        || model.supportedParameters.includes('tools')
}

