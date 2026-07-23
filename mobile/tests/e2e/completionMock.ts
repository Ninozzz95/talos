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
