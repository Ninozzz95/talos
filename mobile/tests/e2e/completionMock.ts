/**
 * F2-T4 — shared completion mock for OpenAI-compatible routes. The app now
 * attempts native fetch streaming first (`stream: true`): serving SSE to that
 * request exercises the REAL streaming path end-to-end and keeps one POST per
 * turn; buffered (`stream: false`) requests get the classic JSON body, which
 * also covers the transparent fallback path when a spec forces it.
 */
export interface FulfillPayload {
    status: number
    contentType: string
    body: string
}

function isOpenAiResponsesRequest(request: Record<string, unknown>): boolean {
    return Array.isArray(request.input)
}

function responsesSse(...events: Array<Record<string, unknown>>): FulfillPayload {
    return {
        status: 200,
        contentType: 'text/event-stream',
        body: `${events.map((event) => `data: ${JSON.stringify(event)}`).join('\n\n')}\n\n`,
    }
}

/** Gemini variant: SSE for `:streamGenerateContent?alt=sse`, JSON otherwise. */
export function geminiCompletionFulfill(
    url: string,
    responseJson: string,
    streamText: string,
): FulfillPayload {
    if (url.includes(':streamGenerateContent')) {
        const delta = JSON.stringify({ candidates: [{ content: { parts: [{ text: streamText }] } }] })
        return {
            status: 200,
            contentType: 'text/event-stream',
            body: `data: ${delta}\n\n`,
        }
    }
    return { status: 200, contentType: 'application/json', body: responseJson }
}

export function openAiCompletionFulfill(
    request: Record<string, unknown>,
    model: string,
    content: string,
): FulfillPayload {
    if (isOpenAiResponsesRequest(request)) {
        if (request.stream === true) {
            return responsesSse(
                { type: 'response.output_text.delta', delta: content },
                {
                    type: 'response.completed',
                    response: {
                        status: 'completed',
                        usage: { input_tokens: 8, output_tokens: 8, total_tokens: 16 },
                    },
                },
            )
        }
        return {
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
                model,
                status: 'completed',
                output: [{
                    id: 'msg_e2e_text',
                    type: 'message',
                    status: 'completed',
                    role: 'assistant',
                    content: [{ type: 'output_text', text: content, annotations: [] }],
                }],
            }),
        }
    }
    if (request.stream === true) {
        const delta = JSON.stringify({ choices: [{ delta: { content } }] })
        const done = JSON.stringify({ choices: [{ delta: {}, finish_reason: 'stop' }] })
        return {
            status: 200,
            contentType: 'text/event-stream',
            body: `data: ${delta}\n\ndata: ${done}\n\ndata: [DONE]\n\n`,
        }
    }
    return {
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
            model,
            choices: [{ finish_reason: 'stop', message: { content } }],
        }),
    }
}

export function openAiToolCallFulfill(
    request: Record<string, unknown>,
    name: string,
    args: Record<string, unknown>,
): FulfillPayload {
    const argumentsJson = JSON.stringify(args)
    if (isOpenAiResponsesRequest(request)) {
        const item = {
            id: 'fc_e2e_tool_call',
            type: 'function_call',
            status: 'completed',
            call_id: 'call-e2e-web-search',
            name,
            arguments: argumentsJson,
        }
        if (request.stream === true) {
            return responsesSse(
                { type: 'response.output_item.done', output_index: 0, item },
                {
                    type: 'response.completed',
                    response: {
                        status: 'completed',
                        usage: { input_tokens: 8, output_tokens: 8, total_tokens: 16 },
                    },
                },
            )
        }
        return {
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({ status: 'completed', output: [item] }),
        }
    }

    const call = {
        index: 0,
        id: 'call-e2e-web-search',
        type: 'function',
        function: { name, arguments: argumentsJson },
    }
    if (request.stream === true) {
        const delta = JSON.stringify({ choices: [{ delta: { tool_calls: [call] } }] })
        const done = JSON.stringify({ choices: [{ delta: {}, finish_reason: 'tool_calls' }] })
        return {
            status: 200,
            contentType: 'text/event-stream',
            body: `data: ${delta}\n\ndata: ${done}\n\ndata: [DONE]\n\n`,
        }
    }
    return {
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
            choices: [{
                finish_reason: 'tool_calls',
                message: { role: 'assistant', content: null, tool_calls: [call] },
            }],
        }),
    }
}
