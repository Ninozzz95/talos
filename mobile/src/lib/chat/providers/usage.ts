/**
 * The counters, and only the counters.
 *
 * Every provider's usage block is a bag of accounting fields, and the contract
 * asks for numbers because that is all any consumer reads: tokens in, tokens
 * out. The providers put more in it than that — Anthropic carries nulls
 * (`cache_creation_input_tokens`), nested objects (`cache_creation`,
 * `server_tool_use`) and strings (`service_tier`); the OpenAI-compatible ones
 * vary by vendor.
 *
 * So the schemas accept anything and this drops what is not a counter, rather
 * than letting an accounting field fail the parse of an answer that has already
 * been generated and PAID FOR. Found the hard way on 2026-08-03: a deep
 * research with Sonnet 5 as author stopped at the synthesis on
 * TALOS_PROVIDER_RESPONSE_MALFORMED, because the Anthropic adapter was the one
 * place still demanding `z.record(z.string(), z.number())`. Chat never showed
 * it: chat streams and builds its own usage, and only the non-streaming path
 * parses the provider's.
 */
export function talosNumericUsage(usage: Record<string, unknown> | undefined | null): Record<string, number> | null {
    if (!usage) return null
    const entries = Object.entries(usage).filter(
        (entry): entry is [string, number] => typeof entry[1] === 'number' && Number.isFinite(entry[1]),
    )
    return entries.length ? Object.fromEntries(entries) : null
}
