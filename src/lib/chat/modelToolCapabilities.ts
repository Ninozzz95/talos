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
    /**
     * Il motore locale ADESSO il cablaggio ce l'ha, e la negazione se ne va per
     * ultima — che è l'unico ordine sensato.
     *
     * Diceva: «llama.cpp returns text; the structured call format the other
     * families implement is a service-side contract, and a GGUF of a few
     * billion parameters has never agreed to one». Era vero finché il prompt lo
     * costruivamo noi con ChatML nudo. Non lo è più:
     *
     *  - i tool entrano in `common_chat_templates_apply`, quindi arrivano al
     *    modello nella sintassi su cui QUEL modello è stato addestrato — la
     *    conosce il template del GGUF, non noi;
     *  - la grammatica GBNF che il template restituisce vincola l'uscita, e
     *    **pigra**: si accende solo sui punti d'innesco, altrimenti il modello
     *    sarebbe costretto a chiamare un tool anche per rispondere «ciao»;
     *  - `common_chat_parse` restituisce `tool_calls` già separate, con lo
     *    stesso parser che ha applicato il template.
     *
     * Owner 2026-08-03: «i locali devono avere le stesse possibilità dei key».
     * Un'app local-first in cui il modello locale è l'unico che non può fare
     * niente contraddice la propria premessa.
     */
    return model.provider !== 'openrouter'
        || model.supportedParameters.includes('tools')
}

