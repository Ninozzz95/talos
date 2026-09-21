import { describe, expect, it, vi } from 'vitest'
import { runTalosLocalModelParityDiagnostics } from '@/services/localModelParityDiagnostics'
import type {
    TalosMobileCompletionInput,
    TalosMobileCompletionResult,
} from '@/lib/chat/providerContracts'

const MODEL = {
    id: '/models/gemma.gguf',
    provider: 'local' as const,
    displayName: 'Gemma',
    chatCompatibility: 'unknown' as const,
    supportedParameters: [],
    inputModalities: ['text'],
    outputModalities: ['text'],
}

describe('runner reale di parità locale', () => {
    it('prova testo, falsi positivi, tool, risultato, protocollo e cancel senza executor', async () => {
        let now = 0
        const complete = vi.fn(async (
            input: TalosMobileCompletionInput,
            stream?: { onChunk(text: string): void, signal?: AbortSignal },
        ): Promise<TalosMobileCompletionResult> => {
            now += 10
            const user = input.turns.at(-1)?.content ?? ''
            if (user.includes('TALOS_PARITY_TEXT_')) {
                stream?.onChunk('TALOS_PARITY_TEXT_417')
                return { text: 'TALOS_PARITY_TEXT_417', model: MODEL.id }
            }
            if (user.includes('TALOS_PARITY_NO_TOOL_')) {
                stream?.onChunk('TALOS_PARITY_NO_TOOL_731')
                return { text: 'TALOS_PARITY_NO_TOOL_731', model: MODEL.id }
            }
            if (input.turns.some((turn) => turn.role === 'tool')) {
                stream?.onChunk('TALOS_PARITY_NONCE_593')
                return { text: 'TALOS_PARITY_NONCE_593', model: MODEL.id }
            }
            if (user.includes('talos_diagnostic_echo')) {
                return {
                    text: '', model: MODEL.id,
                    toolCalls: [{
                        id: 'diag_1', name: 'talos_diagnostic_echo',
                        arguments: '{"value":"TALOS_PARITY_NONCE_593"}',
                    }],
                }
            }
            if (user.includes('TALOS_PARITY_CANCEL_')) {
                stream?.onChunk('inizio')
                expect(stream?.signal?.aborted).toBe(true)
                return { text: 'inizio', model: MODEL.id }
            }
            throw new Error(`unexpected diagnostic prompt: ${user}`)
        })

        const report = await runTalosLocalModelParityDiagnostics({ model: MODEL }, {
            complete,
            status: async () => ({
                available: true, backends: 'CPU', loadedPath: MODEL.id,
                shape: null, kvCacheType: 'f16', engineBuild: 'llama-test',
            }),
            installed: async () => ({
                models: [{ path: MODEL.id, name: 'gemma.gguf', bytes: 123, modifiedAt: 7 }],
                unreadable: [],
            }),
            now: () => now,
            appBuild: 'R-test',
        })

        expect(report.verdict).toBe('compatible')
        expect(report.checks.map((entry) => [entry.id, entry.status])).toEqual([
            ['plain_text', 'pass'],
            ['no_false_tool', 'pass'],
            ['tool_call', 'pass'],
            ['tool_result_roundtrip', 'pass'],
            ['protocol_hygiene', 'pass'],
            ['cancel', 'pass'],
        ])
        // Il runner passa definizioni al modello ma non chiama mai `run`: non
        // legge memoria, file, rete o dispositivo e non crea consenso finto.
        expect(complete).toHaveBeenCalledTimes(5)
    })

    it('classifica il TOOL_CODE come contaminazione anche se il modello parla', async () => {
        const report = await runTalosLocalModelParityDiagnostics({ model: MODEL }, {
            complete: async () => ({
                text: 'TOOL_CODE\ntool: memory_search\nargs:\nquery: x',
                model: MODEL.id,
            }),
            status: async () => ({
                available: true, backends: 'CPU', loadedPath: MODEL.id,
                shape: null, kvCacheType: 'f16', engineBuild: 'llama-test',
            }),
            installed: async () => ({
                models: [{ path: MODEL.id, name: 'gemma.gguf', bytes: 123, modifiedAt: 7 }],
                unreadable: [],
            }),
            now: () => 0,
            appBuild: 'R-test',
        })

        expect(report.verdict).toBe('incompatible')
        expect(report.checks.find((entry) => entry.id === 'protocol_hygiene')?.status)
            .toBe('fail')
    })

    it('LOCAL-PARITY-TEMPLATE-TRANSPORT-06 rende rosso un errore del renderer', async () => {
        const report = await runTalosLocalModelParityDiagnostics({ model: MODEL }, {
            complete: async () => { throw new Error('TALOS_LLAMA_PLAN_FAILED') },
            templateCapabilities: async () => ({
                supportsTools: false,
                supportsToolCalls: false,
                supportsSystemRole: true,
            }),
            status: async () => ({
                available: true, backends: 'CPU', loadedPath: MODEL.id,
                shape: null, kvCacheType: 'f16', engineBuild: 'llama-test',
            }),
            installed: async () => ({
                models: [{ path: MODEL.id, name: 'gemma.gguf', bytes: 123, modifiedAt: 7 }],
                unreadable: [],
            }),
            now: () => 0,
            appBuild: 'R-test',
        })

        expect(report.toolTransport).toBe('prompt-json-v1')
        expect(report.templateCapabilities).toEqual({
            supportsTools: false, supportsToolCalls: false, supportsSystemRole: true,
        })
        expect(report.checks.find((entry) => entry.id === 'plain_text')).toMatchObject({
            status: 'fail', code: 'TALOS_LOCAL_PARITY_TEMPLATE_TRANSPORT_FAILED',
        })
        expect(report.verdict).toBe('incompatible')
    })

    it('interrompe una prova che non produce mai una risposta', async () => {
        vi.useFakeTimers()
        try {
            let callCount = 0
            const complete = vi.fn(async (
                input: TalosMobileCompletionInput,
                stream?: { onChunk(text: string): void, signal?: AbortSignal },
            ): Promise<TalosMobileCompletionResult> => {
                callCount += 1
                if (callCount === 1) return new Promise(() => {})
                const user = input.turns.at(-1)?.content ?? ''
                if (user.includes('TALOS_PARITY_NO_TOOL_')) {
                    return { text: 'TALOS_PARITY_NO_TOOL_731', model: MODEL.id }
                }
                if (input.turns.some((turn) => turn.role === 'tool')) {
                    return { text: 'TALOS_PARITY_NONCE_593', model: MODEL.id }
                }
                if (user.includes('talos_diagnostic_echo')) {
                    return {
                        text: '', model: MODEL.id,
                        toolCalls: [{
                            id: 'diag_1', name: 'talos_diagnostic_echo',
                            arguments: '{"value":"TALOS_PARITY_NONCE_593"}',
                        }],
                    }
                }
                stream?.onChunk('inizio')
                return { text: 'inizio', model: MODEL.id }
            })
            const task = runTalosLocalModelParityDiagnostics({ model: MODEL }, {
                complete,
                status: async () => ({
                    available: true, backends: 'CPU', loadedPath: MODEL.id,
                    shape: null, kvCacheType: 'f16', engineBuild: 'llama-test',
                }),
                installed: async () => ({
                    models: [{ path: MODEL.id, name: 'gemma.gguf', bytes: 123, modifiedAt: 7 }],
                    unreadable: [],
                }),
                now: () => Date.now(),
                appBuild: 'R-test',
            })

            await vi.advanceTimersByTimeAsync(180_000)
            const report = await task

            expect(report.checks.find((entry) => entry.id === 'plain_text')).toMatchObject({
                status: 'fail',
                code: 'TALOS_LOCAL_PARITY_PLAIN_TEXT_TIMEOUT',
            })
            expect(complete.mock.calls[0]?.[1]?.signal?.aborted).toBe(true)
        } finally {
            vi.useRealTimers()
        }
    }, 1_000)

    it('fallisce cancel quando il motore si spegne oltre il limite dichiarato', async () => {
        vi.useFakeTimers()
        try {
            let callCount = 0
            const complete = vi.fn(async (
                input: TalosMobileCompletionInput,
                stream?: { onChunk(text: string): void, signal?: AbortSignal },
            ): Promise<TalosMobileCompletionResult> => {
                callCount += 1
                const user = input.turns.at(-1)?.content ?? ''
                if (user.includes('TALOS_PARITY_TEXT_')) {
                    stream?.onChunk('TALOS_PARITY_TEXT_417')
                    return { text: 'TALOS_PARITY_TEXT_417', model: MODEL.id }
                }
                if (user.includes('TALOS_PARITY_NO_TOOL_')) {
                    stream?.onChunk('TALOS_PARITY_NO_TOOL_731')
                    return { text: 'TALOS_PARITY_NO_TOOL_731', model: MODEL.id }
                }
                if (input.turns.some((turn) => turn.role === 'tool')) {
                    stream?.onChunk('TALOS_PARITY_NONCE_593')
                    return { text: 'TALOS_PARITY_NONCE_593', model: MODEL.id }
                }
                if (user.includes('talos_diagnostic_echo')) {
                    return {
                        text: '', model: MODEL.id,
                        toolCalls: [{
                            id: 'diag_1', name: 'talos_diagnostic_echo',
                            arguments: '{"value":"TALOS_PARITY_NONCE_593"}',
                        }],
                    }
                }
                // ⛔ Motore che IGNORA lo stop: il primo chunk arriva e il
                // segnale di abort parte, ma la generazione si spegne soltanto
                // molto oltre il limite dichiarato — il «finto annullamento»
                // storico, quello che la sonda deve saper vedere.
                stream?.onChunk('inizio')
                return new Promise((resolve) => {
                    setTimeout(() => resolve({ text: 'inizio …lungo', model: MODEL.id }), 30_000)
                })
            })
            const task = runTalosLocalModelParityDiagnostics({ model: MODEL }, {
                complete,
                status: async () => ({
                    available: true, backends: 'CPU', loadedPath: MODEL.id,
                    shape: null, kvCacheType: 'f16', engineBuild: 'llama-test',
                }),
                installed: async () => ({
                    models: [{ path: MODEL.id, name: 'gemma.gguf', bytes: 123, modifiedAt: 7 }],
                    unreadable: [],
                }),
                now: () => Date.now(),
                appBuild: 'R-test',
            })

            // Oltre il tetto di stop (2.500 ms): la generazione non è ancora
            // spenta, quindi la prova deve dichiararlo.
            await vi.advanceTimersByTimeAsync(3_000)
            const report = await task

            expect(report.checks.find((entry) => entry.id === 'cancel')).toMatchObject({
                status: 'fail',
                code: 'TALOS_LOCAL_PARITY_CANCEL_FAILED',
            })
            expect(report.verdict).toBe('incompatible')
        } finally {
            vi.useRealTimers()
        }
    }, 5_000)
})
