import { describe, expect, it, vi } from 'vitest'
import {
    resumeTalosAgentLoop,
    runTalosAgentLoop,
    type TalosAgentLoopCheckpointV1,
} from '@/lib/tools/agentLoop'
import type { TalosToolCall } from '@/stores/chat'

const firstCall: TalosToolCall = {
    id: 'call-1',
    name: 'library_search',
    arguments: JSON.stringify({ query: 'Q2' }),
}
const secondCall: TalosToolCall = {
    id: 'call-2',
    name: 'document_create',
    arguments: JSON.stringify({ title: 'Q2', body: 'Verified.' }),
}

describe('durable agent-loop authorization interrupts', () => {
    it('TOOL-AUTH-01 suspends an unresolved call without executing it or making another provider request', async () => {
        const complete = vi.fn(async () => ({
            text: 'I need permission to create that.',
            finishReason: 'tool_calls',
            toolCalls: [secondCall],
        }))
        const execute = vi.fn(async () => ({ ok: true, content: 'must not run' }))

        const outcome = await runTalosAgentLoop(
            [{ role: 'user', content: 'Create Q2' }],
            {
                complete,
                execute,
                preflight: async (call) => ({
                    status: 'authorization_required',
                    request: { callId: call.id, tool: call.name },
                }),
            },
        )

        expect(complete).toHaveBeenCalledTimes(1)
        expect(execute).not.toHaveBeenCalled()
        expect(outcome.text).toBe('I need permission to create that.')
        expect(outcome.suspension).toMatchObject({
            requests: [{ callId: 'call-2', tool: 'document_create' }],
            checkpoint: {
                schema_version: 1,
                stage: 'before_tools',
                rounds: 1,
                stoppedByLimit: false,
                spoken: ['I need permission to create that.'],
                completion: {
                    toolCalls: [secondCall],
                },
            },
        })
    })

    it('TOOL-AUTH-10 executes none of a mixed parallel round before every decision exists', async () => {
        const execute = vi.fn(async () => ({ ok: true, content: 'must not run' }))

        const outcome = await runTalosAgentLoop(
            [{ role: 'user', content: 'Research and make Q2' }],
            {
                complete: vi.fn(async () => ({
                    text: '',
                    toolCalls: [firstCall, secondCall],
                })),
                execute,
                preflight: async (call) => call.id === firstCall.id
                    ? { status: 'ready' as const }
                    : {
                        status: 'authorization_required' as const,
                        request: { callId: call.id, tool: call.name },
                    },
                maxParallel: 2,
            },
        )

        expect(execute).not.toHaveBeenCalled()
        expect(outcome.suspension?.requests).toEqual([
            { callId: 'call-2', tool: 'document_create' },
        ])
    })

    it('TOOL-AUTH-11 resumes the exact round, preserves call order, and checkpoints results before provider egress', async () => {
        const initial = await runTalosAgentLoop(
            [{ role: 'user', content: 'Research and make Q2' }],
            {
                complete: async () => ({
                    text: 'Working.',
                    toolCalls: [firstCall, secondCall],
                }),
                execute: vi.fn(async () => ({ ok: false, content: 'must not run' })),
                preflight: async (call) => ({
                    status: 'authorization_required',
                    request: { callId: call.id },
                }),
            },
        )
        const checkpoint = initial.suspension!.checkpoint
        const events: string[] = []
        let beforeModel: TalosAgentLoopCheckpointV1 | null = null
        const complete = vi.fn(async (turns) => {
            events.push('provider')
            expect(turns.slice(-2)).toEqual([
                {
                    role: 'tool',
                    content: 'result-call-1',
                    toolCallId: 'call-1',
                    toolName: 'library_search',
                },
                {
                    role: 'tool',
                    content: 'result-call-2',
                    toolCallId: 'call-2',
                    toolName: 'document_create',
                },
            ])
            return { text: 'Done.' }
        })

        const outcome = await resumeTalosAgentLoop(checkpoint, {
            complete,
            preflight: async () => ({ status: 'ready' }),
            execute: async (call) => {
                events.push(`execute:${call.id}`)
                // Deliberately make the first slower; output order must remain provider order.
                if (call.id === 'call-1') await Promise.resolve()
                return { ok: true, content: `result-${call.id}` }
            },
            onBeforeModelCheckpoint: async (saved) => {
                events.push('checkpoint')
                beforeModel = saved
            },
            maxParallel: 2,
        })

        expect(outcome.text).toBe('Working.\n\nDone.')
        expect(complete).toHaveBeenCalledTimes(1)
        expect(events.indexOf('checkpoint')).toBeGreaterThan(events.indexOf('execute:call-1'))
        expect(events.indexOf('checkpoint')).toBeGreaterThan(events.indexOf('execute:call-2'))
        expect(events.indexOf('provider')).toBeGreaterThan(events.indexOf('checkpoint'))
        expect(beforeModel).toMatchObject({
            schema_version: 1,
            stage: 'before_model',
            rounds: 1,
            spoken: ['Working.'],
            executed: [
                { call: firstCall, ok: true },
                { call: secondCall, ok: true },
            ],
        })
    })

    it('TOOL-AUTH-15 resumes a before-model checkpoint without rerunning any tool', async () => {
        const beforeModel: TalosAgentLoopCheckpointV1 = {
            schema_version: 1,
            stage: 'before_model',
            turns: [
                { role: 'user', content: 'Create Q2' },
                {
                    role: 'assistant',
                    content: 'Working.',
                    toolCalls: [secondCall],
                },
                {
                    role: 'tool',
                    content: 'created',
                    toolCallId: 'call-2',
                    toolName: 'document_create',
                },
            ],
            completion: null,
            spoken: ['Working.'],
            executed: [{ call: secondCall, ok: true }],
            rounds: 1,
            stoppedByLimit: false,
            messageAttachments: [],
        }
        const execute = vi.fn(async () => ({ ok: true, content: 'duplicate' }))
        const complete = vi.fn(async () => ({ text: 'Done after restart.' }))

        const outcome = await resumeTalosAgentLoop(beforeModel, {
            complete,
            execute,
            preflight: async () => ({ status: 'ready' }),
        })

        expect(execute).not.toHaveBeenCalled()
        expect(complete).toHaveBeenCalledTimes(1)
        expect(outcome.text).toBe('Working.\n\nDone after restart.')
    })
})
