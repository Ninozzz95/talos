import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createMemoryChatRepository } from '@/repositories/memoryChatRepository'
import type { TalosChatRepository } from '@/repositories/chatRepository'
import {
    createTalosToolAuthorizationCoordinator,
    parseTalosToolAuthorizationCheckpoint,
    type TalosToolAuthorizationCheckpointV1,
} from '@/lib/tools/toolAuthorizationCheckpoint'
import {
    TALOS_EMPTY_TOOL_AUTHORIZATIONS,
    applyTalosToolAuthorizationGrant,
    digestTalosToolAuthorizationInput,
    type TalosToolAuthorizationGrantsV1,
    type TalosToolAuthorizationRequestV1,
} from '@/lib/tools/toolAuthorizations'

const NOW = '2026-07-29T12:00:00.000Z'

let repository: TalosChatRepository
let grants: TalosToolAuthorizationGrantsV1

async function makeRequest(
    patch: Partial<TalosToolAuthorizationRequestV1> = {},
): Promise<TalosToolAuthorizationRequestV1> {
    const input = patch.input ?? { title: 'Q2', body: 'Verified.' }
    return {
        schema_version: 1,
        id: 'request-1',
        checkpoint_id: 'checkpoint-1',
        session_id: 'session-1',
        send_id: 'send-1',
        model_profile_id: 'anthropic:claude-live',
        call_id: 'call-1',
        tool: 'document_create',
        actions: ['write'],
        input,
        input_digest: await digestTalosToolAuthorizationInput(input),
        allow_persistent: true,
        decision: 'pending',
        created_at: NOW,
        decided_at: null,
        ...patch,
    }
}

async function makeCheckpoint(
    requests?: TalosToolAuthorizationRequestV1[],
    patch: Partial<TalosToolAuthorizationCheckpointV1> = {},
): Promise<TalosToolAuthorizationCheckpointV1> {
    const resolvedRequests = requests ?? [await makeRequest()]
    return {
        schema_version: 1,
        id: 'checkpoint-1',
        session_id: 'session-1',
        send_identity: {
            sendId: 'send-1',
            sessionId: 'session-1',
            sessionTitle: 'Q2 plan',
            surface: 'chat',
            modelProfileId: 'anthropic:claude-live',
            acceptedAt: NOW,
        },
        runtime: {
            profile_id: 'anthropic:claude-live',
            provider: 'anthropic',
            model: 'claude-live',
        },
        loop: {
            schema_version: 1,
            stage: 'before_tools',
            turns: [{ role: 'user', content: 'Create the Q2 report' }],
            completion: {
                text: 'I can create that.',
                toolCalls: [{
                    id: 'call-1',
                    name: 'document_create',
                    arguments: { title: 'Q2', body: 'Verified.' },
                }],
            },
        },
        phase: 'before_tools',
        requests: resolvedRequests,
        created_at: NOW,
        updated_at: NOW,
        ...patch,
    }
}

async function createSession(): Promise<void> {
    await repository.createSession({
        id: 'session-1',
        title: 'Q2 plan',
        active_model_profile_id: 'anthropic:claude-live',
        created_at: NOW,
    })
}

function coordinator(onReady = vi.fn(async () => {}), operations: string[] = []) {
    return createTalosToolAuthorizationCoordinator({
        repository,
        now: () => '2026-07-29T12:01:00.000Z',
        authorizations: () => grants,
        async grant(tool, actions) {
            operations.push('grant')
            grants = applyTalosToolAuthorizationGrant(
                grants,
                tool,
                actions,
                grants.revision,
                '2026-07-29T12:01:00.000Z',
            )
        },
        async onReady(checkpoint) {
            operations.push('ready')
            await onReady(checkpoint)
        },
    })
}

beforeEach(async () => {
    repository = createMemoryChatRepository({
        now: () => '2026-07-29T12:01:00.000Z',
    })
    grants = TALOS_EMPTY_TOOL_AUTHORIZATIONS
    await createSession()
})

describe('talos.tool.authorization-checkpoint/1', () => {
    it('TOOL-AUTH-13 parses a valid bounded checkpoint and rejects cross-owner requests', async () => {
        const checkpoint = await makeCheckpoint()
        expect(parseTalosToolAuthorizationCheckpoint(checkpoint)).toEqual(checkpoint)

        expect(parseTalosToolAuthorizationCheckpoint({
            ...checkpoint,
            requests: [{
                ...checkpoint.requests[0],
                session_id: 'other-session',
            }],
        })).toBeNull()
    })

    /**
     * I-05. `hydrate()` guards a checkpoint it cannot PARSE — that record is
     * quarantined and the loop continues. What it did not guard was
     * `announceReady()`, and the consumer behind it throws: the controller
     * validates the serialised runtime and raises
     * TALOS_TOOL_AUTHORIZATION_RUNTIME_INVALID when a field is missing.
     *
     * That throw escaped the loop, escaped hydrate(), and `performInit()`
     * awaits hydrate() — so ONE bad record stopped the whole app from starting,
     * taking every valid checkpoint after it down as well.
     *
     * The trigger is not corruption, it is upgrading. The validator requires
     * fields that did not exist in earlier builds, so a checkpoint written by a
     * previous version of TALOS throws on the first launch of the new one. The
     * owner installs APKs over each other; a pending authorisation at the wrong
     * moment is an app that no longer opens.
     *
     * One record failing must cost that record, and nothing else.
     */
    it('I-05 a checkpoint whose consumer throws is quarantined beside a valid one', async () => {
        const failing = await makeCheckpoint([], {
            id: 'checkpoint-legacy',
            phase: 'before_model',
        })
        const healthy = await makeCheckpoint([], {
            id: 'checkpoint-current',
            phase: 'before_model',
            created_at: '2026-07-29T12:00:01.000Z',
        })
        const announced: string[] = []
        const gate = coordinator(vi.fn(async (checkpoint: TalosToolAuthorizationCheckpointV1) => {
            if (checkpoint.id === 'checkpoint-legacy') {
                // Exactly what controllerRuntimeFromCheckpoint() does to a
                // record written before a runtime field existed.
                throw new Error('TALOS_TOOL_AUTHORIZATION_RUNTIME_INVALID')
            }
            announced.push(checkpoint.id)
        }))
        for (const checkpoint of [failing, healthy]) {
            await repository.appendToolActivity({
                id: checkpoint.id,
                session_id: checkpoint.session_id,
                message_id: null,
                operation: 'tool.authorization',
                status: 'pending',
                payload: {
                    contract: 'talos.tool.authorization-checkpoint/1',
                    checkpoint,
                },
                evidence: {},
                created_at: checkpoint.created_at,
            })
        }

        // The app has to start.
        await expect(gate.hydrate()).resolves.toBeUndefined()

        // The healthy record behind the poisoned one was still delivered.
        expect(announced).toEqual(['checkpoint-current'])

        // And the poisoned one is parked where it can be seen, not retried.
        const activities = await repository.listSessionToolActivities('session-1')
        const quarantined = activities.find((activity) => activity.id === 'checkpoint-legacy')
        expect(quarantined?.status).toBe('recovery_required')
        // The reason is recorded; the raw payload is not echoed into evidence.
        expect(JSON.stringify(quarantined?.evidence)).toContain('TALOS_TOOL_AUTHORIZATION')
    })

    it('TOOL-AUTH-09 rejects a checkpoint whose encrypted input does not match its digest', async () => {
        const checkpoint = await makeCheckpoint()
        const parsed = parseTalosToolAuthorizationCheckpoint({
            ...checkpoint,
            requests: [{
                ...checkpoint.requests[0],
                input: { title: 'Different' },
            }],
        })

        expect(parsed).not.toBeNull()
        const gate = coordinator()
        await repository.appendToolActivity({
            id: checkpoint.id,
            session_id: checkpoint.session_id,
            message_id: null,
            operation: 'tool.authorization',
            status: 'pending',
            payload: {
                contract: 'talos.tool.authorization-checkpoint/1',
                checkpoint: parsed!,
            },
            evidence: {},
            created_at: NOW,
        })

        await gate.hydrate()

        expect(gate.pending()).toEqual([])
        expect((await repository.listSessionToolActivities('session-1'))[0]?.status)
            .toBe('recovery_required')
    })

    it('TOOL-AUTH-13 persists one suspended round and restores its pending requests after reload', async () => {
        const first = coordinator()
        const checkpoint = await makeCheckpoint()

        await first.suspend(checkpoint)

        expect(first.pending()).toEqual([
            expect.objectContaining({
                request_id: 'request-1',
                checkpoint_id: 'checkpoint-1',
                session_id: 'session-1',
                tool: 'document_create',
                actions: ['write'],
                input: { title: 'Q2', body: 'Verified.' },
            }),
        ])

        const reloaded = coordinator()
        await reloaded.hydrate()
        expect(reloaded.pending()).toEqual(first.pending())
    })

    it('TOOL-AUTH-10 waits for every independent decision before resuming the round', async () => {
        const onReady = vi.fn(async () => {})
        const gate = coordinator(onReady)
        const second = await makeRequest({
            id: 'request-2',
            call_id: 'call-2',
            tool: 'generate_image',
            actions: ['write', 'outbound'],
            input: { prompt: 'Q2 cover' },
            input_digest: await digestTalosToolAuthorizationInput({ prompt: 'Q2 cover' }),
        })
        await gate.suspend(await makeCheckpoint([
            await makeRequest(),
            second,
        ]))

        await gate.decide('request-1', 'allow_once')
        expect(onReady).not.toHaveBeenCalled()
        expect(gate.pending().map((row) => row.request_id)).toEqual(['request-2'])

        await gate.decide('request-2', 'deny')
        expect(onReady).toHaveBeenCalledTimes(1)
        expect(onReady).toHaveBeenCalledWith(expect.objectContaining({
            id: 'checkpoint-1',
            requests: [
                expect.objectContaining({ decision: 'allow_once' }),
                expect.objectContaining({ decision: 'deny' }),
            ],
        }))
        expect(gate.pending()).toEqual([])
    })

    it('TOOL-AUTH-04 persists the exact permanent grant before making the checkpoint runnable', async () => {
        const operations: string[] = []
        const gate = coordinator(vi.fn(async () => {}), operations)
        await gate.suspend(await makeCheckpoint())

        await gate.decide('request-1', 'always_allow')

        expect(operations).toEqual(['grant', 'ready'])
        expect(grants.grants.document_create).toMatchObject({
            tool: 'document_create',
            actions: ['write'],
        })
        const activity = (await repository.listSessionToolActivities('session-1'))[0]!
        const persisted = parseTalosToolAuthorizationCheckpoint(activity.payload.checkpoint)
        expect(persisted?.requests[0]).toMatchObject({
            decision: 'always_allow',
            decided_at: '2026-07-29T12:01:00.000Z',
        })
    })

    it('TOOL-AUTH-14 never auto-resumes a running-tools recovery checkpoint', async () => {
        const onReady = vi.fn(async () => {})
        const gate = coordinator(onReady)
        const checkpoint = await makeCheckpoint([
            await makeRequest({ decision: 'allow_once', decided_at: NOW }),
        ], { phase: 'running_tools' })
        await repository.appendToolActivity({
            id: checkpoint.id,
            session_id: checkpoint.session_id,
            message_id: null,
            operation: 'tool.authorization',
            status: 'recovery_required',
            payload: {
                contract: 'talos.tool.authorization-checkpoint/1',
                checkpoint,
            },
            evidence: {},
            created_at: NOW,
        })

        await gate.hydrate()

        expect(onReady).not.toHaveBeenCalled()
        expect(gate.pending()).toEqual([])
    })

    it('TOOL-AUTH-25 exposes uncertain work for explicit retry or cancel only', async () => {
        const onReady = vi.fn(async () => {})
        const gate = coordinator(onReady)
        const checkpoint = await makeCheckpoint([
            await makeRequest({ decision: 'allow_once', decided_at: NOW }),
        ], { phase: 'running_tools' })
        await repository.appendToolActivity({
            id: checkpoint.id,
            session_id: checkpoint.session_id,
            message_id: null,
            operation: 'tool.authorization',
            status: 'recovery_required',
            payload: {
                contract: 'talos.tool.authorization-checkpoint/1',
                checkpoint,
            },
            evidence: {},
            created_at: NOW,
        })

        await gate.hydrate()

        expect(gate.recoveries()).toEqual([{
            checkpoint_id: 'checkpoint-1',
            session_id: 'session-1',
            session_title: 'Q2 plan',
            model_profile_id: 'anthropic:claude-live',
            tools: [{
                tool: 'document_create',
                actions: ['write'],
            }],
            created_at: NOW,
            updated_at: NOW,
        }])
        expect(onReady).not.toHaveBeenCalled()

        expect(await gate.retryRecovery('checkpoint-1')).toBe(true)
        expect(onReady).toHaveBeenCalledTimes(1)

        await gate.cancel('checkpoint-1')
        expect(gate.recoveries()).toEqual([])
        expect((await repository.listSessionToolActivities('session-1'))[0]?.status)
            .toBe('cancelled')
    })

    it('TOOL-AUTH-15 safely resumes a persisted before-model checkpoint without another decision', async () => {
        const onReady = vi.fn(async () => {})
        const gate = coordinator(onReady)
        const checkpoint = await makeCheckpoint([
            await makeRequest({ decision: 'allow_once', decided_at: NOW }),
        ], {
            phase: 'before_model',
            loop: {
                schema_version: 1,
                stage: 'before_model',
                turns: [
                    { role: 'user', content: 'Create the Q2 report' },
                    {
                        role: 'tool',
                        toolCallId: 'call-1',
                        toolName: 'document_create',
                        content: 'created',
                    },
                ],
            },
        })
        await repository.appendToolActivity({
            id: checkpoint.id,
            session_id: checkpoint.session_id,
            message_id: null,
            operation: 'tool.authorization',
            status: 'pending',
            payload: {
                contract: 'talos.tool.authorization-checkpoint/1',
                checkpoint,
            },
            evidence: {},
            created_at: NOW,
        })

        await gate.hydrate()

        expect(onReady).toHaveBeenCalledTimes(1)
        expect(onReady).toHaveBeenCalledWith(expect.objectContaining({
            id: 'checkpoint-1',
            phase: 'before_model',
        }))
    })

    it('P1-CTX-AGENT-07 atomically persists refreshed runtime with the before-model loop', async () => {
        const gate = coordinator()
        await gate.suspend(await makeCheckpoint())
        await gate.decide('request-1', 'allow_once')
        await gate.markRunningTools('checkpoint-1')

        const refreshedRuntime = {
            profile_id: 'anthropic:claude-live',
            provider: 'anthropic',
            model: 'claude-live',
            library_policy: {
                scope: 'turn',
                revision: 1,
                mode: 'smart_relevant_v1',
                transmitted_file_ids: ['contract-file'],
            },
        }
        await gate.saveBeforeModel('checkpoint-1', {
            schema_version: 1,
            stage: 'before_model',
            turns: [{
                role: 'tool',
                toolCallId: 'call-1',
                toolName: 'library_context_policy_update',
                content: 'TALOS_LIBRARY_CONTEXT:\nCONTRACT_SENTINEL',
            }],
        }, refreshedRuntime)

        const activity = (await repository.listSessionToolActivities('session-1'))
            .find((row) => row.operation === 'tool.authorization')
        const persisted = parseTalosToolAuthorizationCheckpoint(
            activity?.payload.checkpoint,
        )
        expect(persisted).toMatchObject({
            phase: 'before_model',
            runtime: refreshedRuntime,
        })
        expect(JSON.stringify(persisted?.loop)).toContain('CONTRACT_SENTINEL')
    })
})
