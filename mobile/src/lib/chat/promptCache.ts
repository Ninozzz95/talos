/**
 * Paying once for the part of the prompt that never changes.
 *
 * Owner 2026-07-27 asked for speed, tokens and reasoning "al massimo del
 * potenziale con tecnologie upstreamabili". Measured on this build, the stable
 * prefix of every request is ~2,099 tokens, and 1,823 of them — 87% — are the
 * nine tool schemas. In the agent loop that prefix is re-sent on every round:
 * four rounds means paying for it four times and, worse, waiting for it to be
 * prefilled four times.
 *
 * The four providers do not agree on how to avoid that, so this module holds
 * the differences in one place:
 *
 *  - Anthropic (https://platform.claude.com/docs/en/docs/build-with-claude/prompt-caching)
 *    caches nothing unless asked. Up to 4 breakpoints; a read costs 0.1x and a
 *    5-minute write 1.25x; the minimum is 512 tokens on Opus 5 and 1,024 on
 *    Sonnet 5. Invalidation runs tools -> system -> messages, so changing a
 *    tool definition throws away everything.
 *  - OpenAI (https://developers.openai.com/api/docs/guides/prompt-caching)
 *    caches automatically above 1,024 tokens, and `prompt_cache_key` routes
 *    requests that share a prefix to the same cache.
 *  - Gemini (https://ai.google.dev/gemini-api/docs/caching) caches implicitly
 *    from 2,048 tokens (4,096 on the 3.x models) with nothing to send — it only
 *    asks that the common content come first, which it already does here.
 *  - DeepSeek (https://api-docs.deepseek.com/guides/kv_cache) caches on disk
 *    automatically, best-effort, and reports what it hit.
 *
 * The one thing they all need is a byte-stable prefix, which this build already
 * has: the system prompt carries no timestamp, and memory and Library context
 * are injected into the LAST user turn — the end, where varying content belongs.
 */

/** Where Anthropic is told to cut. `ephemeral` is the only documented type. */
const BREAKPOINT = { type: 'ephemeral' as const }

/**
 * Mark the tool list so all of it is cached as one prefix.
 *
 * The last tool carries the breakpoint: "all tools defined before and including
 * that tool are cached as a single prefix". This is the biggest single win here
 * — the schemas are 87% of what repeats.
 */
export function withTalosAnthropicToolCache(tools: readonly unknown[]): unknown[] {
    if (tools.length === 0) return []
    return tools.map((tool, index) => (
        index === tools.length - 1 && tool !== null && typeof tool === 'object'
            ? { ...tool as Record<string, unknown>, cache_control: BREAKPOINT }
            : tool
    ))
}

/**
 * Mark the end of the conversation as it stands, so the NEXT request — the next
 * round of the agent loop, or the next message — reads everything up to here
 * instead of re-sending it at full price.
 *
 * Only a text block can carry the mark: an image cannot, and a breakpoint on a
 * block whose content varies never hits anyway. The mark goes on the last
 * cacheable block of the last message; if there is none, nothing is marked and
 * the request behaves exactly as before.
 */
export function withTalosAnthropicMessageCache(
    messages: readonly unknown[],
): unknown[] {
    for (let index = messages.length - 1; index >= 0; index -= 1) {
        const message = messages[index]
        if (message === null || typeof message !== 'object') continue
        const content = (message as { content?: unknown }).content
        if (!Array.isArray(content) || content.length === 0) continue
        const blockIndex = lastCacheableBlock(content)
        if (blockIndex === -1) continue
        const marked = content.map((block, position) => (
            position === blockIndex
                ? { ...block as Record<string, unknown>, cache_control: BREAKPOINT }
                : block
        ))
        return messages.map((entry, position) => (
            position === index
                ? { ...message as Record<string, unknown>, content: marked }
                : entry
        ))
    }
    return [...messages]
}

function lastCacheableBlock(content: readonly unknown[]): number {
    for (let index = content.length - 1; index >= 0; index -= 1) {
        const block = content[index]
        if (block === null || typeof block !== 'object') continue
        const type = (block as { type?: unknown }).type
        // Thinking blocks cannot carry the mark, and an empty text block is not
        // cacheable at all.
        if (type === 'text' && typeof (block as { text?: unknown }).text === 'string'
            && (block as { text: string }).text !== '') return index
        if (type === 'tool_result' || type === 'tool_use') return index
    }
    return -1
}

/**
 * The routing hint OpenAI uses to send requests that share a long common prefix
 * to the same cache.
 *
 * It is keyed on the PREFIX — the system prompt and the tool names — rather
 * than on a conversation. That is what the key is actually for, and it means
 * two different chats with the same tools warm the same cache instead of each
 * paying to fill its own. It also keeps the session id on this device, where a
 * conversation identifier belongs.
 *
 * A digest, never the text: what goes to the provider is eight characters that
 * mean nothing on the other side.
 */
export function talosPromptCacheKey(prefixSeed: string | null | undefined): string | undefined {
    if (!prefixSeed) return undefined
    let hash = 2166136261
    for (let index = 0; index < prefixSeed.length; index += 1) {
        hash ^= prefixSeed.charCodeAt(index)
        hash = Math.imul(hash, 16777619)
    }
    return `talos-${(hash >>> 0).toString(36)}`
}

export interface TalosCacheUsage {
    /** Prefix tokens that came from a cache, at a fraction of the price. */
    readTokens: number
    /** Prefix tokens written into a cache for the next request to read. */
    writeTokens: number
}

/**
 * What actually happened, in the four dialects the providers report it in.
 *
 * This is the half that makes the claim checkable: without it "caching is on"
 * is something the owner would have to take on faith, and the Doctor would show
 * a number that never moves.
 */
export function readTalosCacheUsage(
    usage: Record<string, unknown> | null | undefined,
): TalosCacheUsage | null {
    if (!usage) return null
    const nested = usage.prompt_tokens_details
    const cachedNested = nested !== null && typeof nested === 'object'
        ? numberAt(nested as Record<string, unknown>, 'cached_tokens')
        : 0
    const readTokens = numberAt(usage, 'cache_read_input_tokens') // Anthropic
        + numberAt(usage, 'prompt_cache_hit_tokens') // DeepSeek
        + numberAt(usage, 'cached_tokens') // OpenAI, flattened
        + cachedNested // OpenAI, as sent
        + numberAt(usage, 'cachedContentTokenCount') // Gemini
        + numberAt(usage, 'totalCachedTokens') // Gemini, newer field
    const writeTokens = numberAt(usage, 'cache_creation_input_tokens')
        + numberAt(usage, 'cache_write_tokens')
    if (readTokens === 0 && writeTokens === 0) return null
    return { readTokens, writeTokens }
}

function numberAt(source: Record<string, unknown>, key: string): number {
    const value = source[key]
    return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : 0
}
