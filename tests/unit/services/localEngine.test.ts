import { beforeEach, describe, expect, it, vi } from 'vitest'

const bridge = vi.hoisted(() => ({
    open: vi.fn(),
    chatPrompt: vi.fn(),
    generate: vi.fn(),
    addListener: vi.fn(),
}))

vi.mock('@capacitor/core', () => ({
    registerPlugin: () => bridge,
}))

const {
    TalosLocalEngineGenerationError,
    TalosLocalEngineOpenError,
    talosLocalEngineChatPlan,
    talosLocalEngineGenerate,
    talosLocalEngineOpen,
    talosLocalEngineOpenWithFallback,
} = await import('@/services/localEngine')

function nativeFailure(stage: string, code = 'TALOS_LLAMA_OPEN_FAILED'): Error {
    return Object.assign(new Error(code), { code, data: { stage } })
}

describe('LOCAL-OPEN-FALLBACK-02 bounded native open fallback', () => {
    beforeEach(() => {
        bridge.open.mockReset()
        bridge.chatPrompt.mockReset()
        bridge.generate.mockReset()
        bridge.addListener.mockReset()
        bridge.addListener.mockResolvedValue({ remove: vi.fn().mockResolvedValue(undefined) })
    })

    it('retries a context allocation failure exactly once at 2048', async () => {
        bridge.open
            .mockRejectedValueOnce(nativeFailure('context'))
            .mockResolvedValueOnce({ contextTokens: 2048 })

        await expect(talosLocalEngineOpenWithFallback('/models/qwen.gguf', {
            contextTokens: 4096,
        })).resolves.toEqual({ contextTokens: 2048 })

        expect(bridge.open.mock.calls.map(([options]) => options.contextTokens)).toEqual([4096, 2048])
    })

    it.each(['path', 'model-load', 'sampler', 'unknown'] as const)(
        'does not retry a %s failure',
        async (stage) => {
            bridge.open.mockRejectedValueOnce(nativeFailure(stage))

            await expect(talosLocalEngineOpenWithFallback('/models/qwen.gguf', {
                contextTokens: 4096,
            })).rejects.toMatchObject({ stage })
            expect(bridge.open).toHaveBeenCalledTimes(1)
        },
    )

    it('normalizes legacy missing-file rejection into the stable path stage', async () => {
        bridge.open.mockRejectedValueOnce(Object.assign(
            new Error('TALOS_LLAMA_MODEL_MISSING'),
            { code: 'TALOS_LLAMA_MODEL_MISSING' },
        ))

        const failure = await talosLocalEngineOpen('/models/gone.gguf').catch((error) => error)
        expect(failure).toBeInstanceOf(TalosLocalEngineOpenError)
        expect(failure).toMatchObject({
            stage: 'path',
            nativeCode: 'TALOS_LLAMA_MODEL_MISSING',
        })
    })

    it('C45-RED-18H carries native prompt and context counts without estimating them', async () => {
        bridge.chatPrompt.mockResolvedValue({
            prompt: '<qwen prompt>',
            promptTokens: 5779,
            contextTokens: 4096,
        })

        await expect(talosLocalEngineChatPlan([{ role: 'user', content: 'Ciao' }]))
            .resolves.toEqual({
                prompt: '<qwen prompt>',
                promptTokens: 5779,
                contextTokens: 4096,
            })
    })

    it('C45-RED-18I normalizes a native context rejection instead of leaking it from the worker', async () => {
        bridge.generate.mockRejectedValue(Object.assign(
            new Error('TALOS_LLAMA_CONTEXT_REQUIRED'),
            {
                code: 'TALOS_LLAMA_CONTEXT_REQUIRED',
                data: {
                    stage: 'context-required',
                    promptTokens: 5779,
                    contextTokens: 4096,
                    requiredContextTokens: 6804,
                },
            },
        ))

        const failure = await talosLocalEngineGenerate('prompt', () => undefined, { maxTokens: 1024 })
            .catch((error) => error)
        expect(failure).toBeInstanceOf(TalosLocalEngineGenerationError)
        expect(failure).toMatchObject({
            stage: 'context-required',
            nativeCode: 'TALOS_LLAMA_CONTEXT_REQUIRED',
            promptTokens: 5779,
            contextTokens: 4096,
            requiredContextTokens: 6804,
        })
    })
})
