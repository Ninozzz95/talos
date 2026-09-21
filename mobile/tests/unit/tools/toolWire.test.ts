import { describe, expect, it } from 'vitest'
import {
    createAnthropicToolCallAccumulator,
    createGeminiToolCallAccumulator,
    createOpenAiToolCallAccumulator,
    parseAnthropicToolCalls,
    parseOllamaToolCalls,
    parseOpenAiToolCalls,
} from '@/lib/tools/wire'

/**
 * Four wire formats, one internal representation. These tests exist because a
 * half-received streaming call is the sharpest failure available here: executing
 * `{"query": "fatt` would either throw or, worse, validate against a lenient
 * schema and run the wrong thing.
 */
describe('streaming accumulation', () => {
    it('OpenAI: one call split across deltas is reassembled in order', () => {
        const accumulator = createOpenAiToolCallAccumulator()
        accumulator.push({ choices: [{ delta: { tool_calls: [{ index: 0, id: 'call_1', function: { name: 'library_search', arguments: '{"qu' } }] } }] })
        accumulator.push({ choices: [{ delta: { tool_calls: [{ index: 0, function: { arguments: 'ery":"fattura"}' } }] } }] })
        expect(accumulator.calls()).toEqual([
            { id: 'call_1', name: 'library_search', arguments: '{"query":"fattura"}' },
        ])
    })

    it('OpenAI: two parallel calls stay separate and keep their order', () => {
        const accumulator = createOpenAiToolCallAccumulator()
        accumulator.push({ choices: [{ delta: { tool_calls: [
            { index: 0, id: 'a', function: { name: 'library_search', arguments: '{}' } },
            { index: 1, id: 'b', function: { name: 'time_now', arguments: '{}' } },
        ] } }] })
        expect(accumulator.calls().map((call) => call.name)).toEqual(['library_search', 'time_now'])
    })

    it('OpenAI: a stream with no tool calls produces none', () => {
        const accumulator = createOpenAiToolCallAccumulator()
        accumulator.push({ choices: [{ delta: { content: 'ciao' } }] })
        expect(accumulator.calls()).toEqual([])
    })

    it('Anthropic: content_block_start then input_json_delta fragments', () => {
        const accumulator = createAnthropicToolCallAccumulator()
        accumulator.push({ type: 'content_block_start', index: 1, content_block: { type: 'tool_use', id: 'toolu_1', name: 'library_read' } })
        accumulator.push({ type: 'content_block_delta', index: 1, delta: { type: 'input_json_delta', partial_json: '{"id"' } })
        accumulator.push({ type: 'content_block_delta', index: 1, delta: { type: 'input_json_delta', partial_json: ':"d1"}' } })
        expect(accumulator.calls()).toEqual([
            { id: 'toolu_1', name: 'library_read', arguments: '{"id":"d1"}' },
        ])
    })

    it('Anthropic: a tool with no input still produces valid JSON, not an empty string', () => {
        const accumulator = createAnthropicToolCallAccumulator()
        accumulator.push({ type: 'content_block_start', index: 0, content_block: { type: 'tool_use', id: 't', name: 'time_now' } })
        expect(accumulator.calls()).toEqual([{ id: 't', name: 'time_now', arguments: '{}' }])
    })

    it('Anthropic: text blocks never become tool calls', () => {
        const accumulator = createAnthropicToolCallAccumulator()
        accumulator.push({ type: 'content_block_start', index: 0, content_block: { type: 'text' } })
        accumulator.push({ type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'ciao' } })
        expect(accumulator.calls()).toEqual([])
    })

    it('Gemini: functionCall parts carry the whole call and get a stable handle', () => {
        const accumulator = createGeminiToolCallAccumulator()
        accumulator.push({ candidates: [{ content: { parts: [
            { text: 'cerco' },
            { functionCall: { name: 'library_search', args: { query: 'fattura' } } },
        ] } }] })
        expect(accumulator.calls()).toEqual([
            { id: 'library_search-0', name: 'library_search', arguments: '{"query":"fattura"}' },
        ])
    })
})

describe('buffered parsing', () => {
    it('OpenAI: arguments stay the string the provider sent', () => {
        expect(parseOpenAiToolCalls({
            tool_calls: [{ id: 'call_9', function: { name: 'tasks_list', arguments: '{"status":"open"}' } }],
        })).toEqual([{ id: 'call_9', name: 'tasks_list', arguments: '{"status":"open"}' }])
    })

    it('Anthropic: an already-parsed object is serialised losslessly', () => {
        expect(parseAnthropicToolCalls([
            { type: 'text', text: 'guardo' },
            { type: 'tool_use', id: 'toolu_2', name: 'memory_search', input: { query: 'preferenze', limit: 3 } },
        ])).toEqual([
            { id: 'toolu_2', name: 'memory_search', arguments: '{"query":"preferenze","limit":3}' },
        ])
    })

    it('Ollama: object arguments, and a name is required', () => {
        expect(parseOllamaToolCalls({
            tool_calls: [
                { function: { name: 'notes_list', arguments: { limit: 5 } } },
                { function: {} },
            ],
        })).toEqual([{ id: 'notes_list-0', name: 'notes_list', arguments: '{"limit":5}' }])
    })

    it('a response with no calls is an empty list, not a crash', () => {
        expect(parseOpenAiToolCalls({ content: 'ciao' })).toEqual([])
        expect(parseAnthropicToolCalls(undefined)).toEqual([])
        expect(parseOllamaToolCalls(null)).toEqual([])
    })
})
