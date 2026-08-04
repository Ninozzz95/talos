import { TalosMobileProviderError } from '@/lib/chat/providerErrors'
import type {
    TalosMobileCompletionInput,
    TalosMobileCompletionResult,
    TalosMobileProviderAdapter,
    TalosMobileProviderCatalog,
    TalosProviderStreamHandlers,
} from '@/lib/chat/providerContracts'
import {
    talosLocalEngineChatPrompt,
    talosLocalEngineGenerate,
    talosLocalEngineOpen,
    talosLocalEngineStatus,
    talosLocalInstalledModels,
} from '@/services/localEngine'
import { talosToolsForOpenAi } from '@/lib/tools/registry'
import { talosNormaliseLocalToolCalls } from '@/lib/chat/localToolCalls'
import { talosModelSupportsToolCalling } from '@/lib/chat/modelToolCapabilities'

/**
 * The engine on this device, answering through the same contract as everyone
 * else.
 *
 * That is the whole design decision. A local runtime bolted in beside the send
 * path would have been simpler to write and would have created a second one:
 * two places that assemble a conversation, two that stream, two that record a
 * receipt, and every future feature written twice. Made an adapter, it inherits
 * the model picker, the abort signal, the persistence and the audit trail
 * without any of them knowing it is special.
 *
 * What it does NOT inherit is a network, and that shows in three places: there
 * is no key, no endpoint, and the transport argument is ignored. Nothing here
 * can reach anything, which is the property the app promises about local models
 * and the one place where "unused parameter" is the point rather than an
 * oversight.
 */

/** Long enough for a real answer; a phone is not the place for an unbounded one. */
const MAX_TOKENS = 1024

/**
 * Turns the conversation into what the engine expects.
 *
 * Tool turns are dropped rather than translated. A GGUF chat template knows
 * `system`, `user` and `assistant` and nothing else, so a tool result rendered
 * through it would arrive as an unlabelled block of text in the middle of the
 * conversation — worse than absent, because the model would read it as
 * something the user said.
 */
function conversationOf(input: TalosMobileCompletionInput): Array<{ role: string, content: string }> {
    const turns: Array<{ role: string, content: string }> = []
    if (input.system) turns.push({ role: 'system', content: input.system })
    for (const turn of input.turns) {
        // Only the two roles a GGUF template knows how to punctuate. The
        // compiler confirms `tool` is the only other one a turn can carry, and
        // it is exactly the one that must not be rendered.
        if (turn.role !== 'user' && turn.role !== 'assistant') continue
        const content = typeof turn.content === 'string' ? turn.content : ''
        if (content === '') continue
        turns.push({ role: turn.role, content })
    }
    return turns
}

/**
 * Quanto contesto si chiede al motore locale.
 *
 * Non chiederlo NON vuol dire «quello per cui il modello e' stato addestrato»:
 * misurato sul OnePlus Pad 3 il 2026-08-04, llama.cpp apriva a **4096** e lo
 * diceva da se' nel log — `n_ctx_seq (4096) < n_ctx_train (32768)`. Con quel
 * tetto la sintesi di una ricerca, che vale 11009 token, non entrava: il passo
 * falliva e sembrava che il modello non avesse risposto.
 *
 * 16384 e' una scelta, non un massimo: la cache KV cresce col contesto e su un
 * telefono la memoria e' il vincolo vero (~4 GB liberi a caldo sul tablet di
 * prova). Sedicimila token tengono una sintesi di ricerca con margine, e
 * costano circa la meta' del contesto pieno del modello.
 */
const TALOS_LOCAL_CONTEXT_TOKENS = 16384

/**
 * Makes sure the requested model is the one in memory.
 *
 * The engine holds one at a time, deliberately — two multi-gigabyte models on a
 * phone is how an app is killed mid-sentence. So switching models is opening
 * another, and asking first avoids paying a reload for a message that is
 * already on the right one.
 */
async function ensureLoaded(path: string): Promise<void> {
    const status = await talosLocalEngineStatus()
    if (!status.available) throw new Error('TALOS_LOCAL_ENGINE_UNAVAILABLE')
    if (status.loadedPath === path) return
    await talosLocalEngineOpen(path, { contextTokens: TALOS_LOCAL_CONTEXT_TOKENS })
}

async function run(
    input: TalosMobileCompletionInput,
    onChunk?: (text: string) => void,
): Promise<TalosMobileCompletionResult> {
    await ensureLoaded(input.model.id)
    /**
     * I tool, nella STESSA forma che ricevono i provider di rete.
     *
     * Owner 2026-08-03: «i locali devono avere le stesse possibilità dei key».
     * `talosToolsForOpenAi` è la funzione che serve già gli altri adattatori —
     * riusarla vuol dire che un tool non ha due descrizioni a seconda di chi lo
     * esegue, e la guardia `anthropicAcceptsEveryTool` continua a valere per
     * tutti.
     *
     * Il filtro sulle capacità del modello resta al suo posto: è lì che si
     * decide se questo modello può chiamare qualcosa, e non qui.
     */
    const offered = talosModelSupportsToolCalling(input.model) ? input.tools : undefined
    const tools = offered?.length ? talosToolsForOpenAi(offered) : undefined
    const prompt = await talosLocalEngineChatPrompt(conversationOf(input), tools)
    const generation = await talosLocalEngineGenerate(
        prompt,
        (delta) => { onChunk?.(delta) },
        { maxTokens: MAX_TOKENS, stopAtEndOfGeneration: true },
    )
    const normalised = talosNormaliseLocalToolCalls(generation.toolCalls)
    return {
        text: generation.text,
        model: input.model.id,
        finishReason: 'stop',
        // Nello stesso campo che usano i provider di rete, quindi nello stesso
        // cassetto: il ragionamento di un modello locale non è una cosa diversa
        // dal ragionamento di Claude, e non merita una seconda superficie.
        reasoning: generation.reasoning || undefined,
        // E lo stesso vale per le chiamate: l'esecutore a valle non deve sapere
        // da dove arrivano.
        // Normalizzate una volta sola: il formato Hermes che Qwen usa non
        // prevede un identificativo, e senza quello due chiamate nello stesso
        // turno non si sanno riappaiare ai loro risultati.
        toolCalls: normalised.length ? [...normalised] : undefined,
        // Only what was actually counted. A local run has no billing and no
        // prompt-token figure to report, and inventing one would put a number
        // in the receipt that means nothing.
        usage: { completion_tokens: generation.tokens },
    }
}

export const localAdapter: TalosMobileProviderAdapter = {
    provider: 'local',
    requiresSecret: false,
    // Neither of the two things a provider is normally asked for. This pair is
    // load-bearing: while `requiresEndpoint` was inferred from `requiresSecret`,
    // the catalogue below was never once requested.
    requiresEndpoint: false,

    /**
     * The catalogue is the disk.
     *
     * There is no remote list to fetch and no version to be behind: what can be
     * run is what has finished downloading, asked of the device every time.
     */
    async listModels(): Promise<TalosMobileProviderCatalog> {
        const { models: files, unreadable } = await talosLocalInstalledModels()
        // Nothing found AND something refused to open is not an empty disk.
        //
        // Said as an error rather than as an empty catalogue because the advice
        // is opposite: an empty disk means "download a model", and this means
        // "downloading another one will change nothing". The path travels with
        // it, because a folder nobody can name is a folder nobody can fix.
        //
        // Only when the list is empty. A folder that refuses to open beside
        // three that opened must not hide those three — the user can still run
        // what is runnable.
        if (files.length === 0 && unreadable.length > 0) {
            throw new TalosMobileProviderError({
                provider: 'local',
                operation: 'list_models',
                message: 'TALOS_LOCAL_MODELS_UNREADABLE',
                uiMessageKey: 'models.localModelsUnreadable',
                uiMessageParameters: {
                    path: unreadable[0].path,
                    reason: unreadable[0].reason,
                },
            })
        }
        return {
            provider: 'local',
            models: files.map((file) => ({
                // The path is the identity. Two models can share a filename
                // across repositories, and a name that collides would load the
                // wrong weights without anything looking wrong.
                id: file.path,
                provider: 'local' as const,
                displayName: file.name.replace(/\.gguf$/i, ''),
                chatCompatibility: 'unknown' as const,
                supportedParameters: [],
                // Text in, text out. Stated rather than left empty: a GGUF run
                // through this engine has no image path, and a picker that
                // implied otherwise would let someone attach a photo to a model
                // that will silently ignore it.
                inputModalities: ['text'],
                outputModalities: ['text'],
            })),
        }
    },

    async complete(input): Promise<TalosMobileCompletionResult> {
        return run(input)
    },

    async streamComplete(
        input,
        _credential,
        handlers: TalosProviderStreamHandlers,
    ): Promise<TalosMobileCompletionResult> {
        // The abort signal is honoured by not starting rather than by tearing
        // down a load already in flight: cancelling mid-load leaves gigabytes
        // half-mapped, and the engine's own cancel covers the part that matters,
        // which is the generation.
        if (handlers.signal?.aborted) throw new Error('TALOS_LOCAL_ABORTED')
        return run(input, handlers.onChunk)
    },
}
