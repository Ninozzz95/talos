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

    /**
     * ⛔⛔⛔ Owner 2026-08-27 — chiude il gap onestamente lasciato aperto in
     * Fase 8: questo stesso identico giro, con `tool: 'dynamic:close-with-note'`
     * invece di un built-in, lanciava SEMPRE
     * `TALOS_TOOL_AUTHORIZATION_TOOL_INVALID` — "Consenti sempre" su un tool
     * forgiato non ha mai funzionato fino ad ora. Passa dal COORDINATOR
     * vero, non dalle funzioni pure: prova che il giro intero — dalla
     * decisione sullo schermo alla scrittura del grant persistente — regge
     * per un tool del Forge tanto quanto per uno incorporato.
     */
    it('⛔ "Consenti sempre" su un tool FORGIATO persiste il grant, non lancia più', async () => {
        const operations: string[] = []
        const gate = coordinator(vi.fn(async () => {}), operations)
        await gate.suspend(await makeCheckpoint([await makeRequest({
            tool: 'dynamic:close-with-note',
            input: { id: 'forge-task-1', status: 'done', reflection: 'fatto senza intoppi' },
        })]))

        await expect(gate.decide('request-1', 'always_allow')).resolves.toBe(true)

        expect(operations).toEqual(['grant', 'ready'])
        expect(grants.grants['dynamic:close-with-note']).toMatchObject({
            tool: 'dynamic:close-with-note',
            actions: ['write'],
        })
    })

    /**
     * Owner 2026-08-02, on the device: "ho premuto consenti sempre ma il pop-up
     * non si è levato immediatamente, ho dovuto insistere".
     *
     * "Always allow" recorded the grant and then settled ONE request — the one
     * on screen — while its siblings for the same tool stayed pending, so the
     * sheet came straight back and asked a question that had just been answered.
     */
    it('TOOL-AUTH-04b settles every queued request the permanent grant already covers', async () => {
        const gate = coordinator(vi.fn(async () => {}))
        await gate.suspend(await makeCheckpoint([
            await makeRequest(),
            await makeRequest({ id: 'request-2', call_id: 'call-2' }),
            await makeRequest({ id: 'request-3', call_id: 'call-3' }),
        ]))

        await gate.decide('request-1', 'always_allow')

        const activity = (await repository.listSessionToolActivities('session-1'))[0]!
        const persisted = parseTalosToolAuthorizationCheckpoint(activity.payload.checkpoint)
        expect(persisted?.requests.map((request) => request.decision))
            .toEqual(['always_allow', 'always_allow', 'always_allow'])
    })

    it('TOOL-AUTH-04c still asks about a request the grant does not cover', async () => {
        // Same tool, but it wants an action nobody granted. That is a different
        // question, and silence is not an answer to it.
        const gate = coordinator(vi.fn(async () => {}))
        await gate.suspend(await makeCheckpoint([
            await makeRequest(),
            await makeRequest({ id: 'request-2', call_id: 'call-2', actions: ['write', 'outbound'] }),
        ]))

        await gate.decide('request-1', 'always_allow')

        const activity = (await repository.listSessionToolActivities('session-1'))[0]!
        const persisted = parseTalosToolAuthorizationCheckpoint(activity.payload.checkpoint)
        expect(persisted?.requests.map((request) => request.decision))
            .toEqual(['always_allow', 'pending'])
    })

    it('TOOL-AUTH-04d never spreads a one-off decision to its siblings', async () => {
        // "Allow once" and "deny" mean this call, not this tool.
        for (const [index, decision] of (['allow_once', 'deny'] as const).entries()) {
            const gate = coordinator(vi.fn(async () => {}))
            // A distinct checkpoint per pass: the repository refuses to file the
            // same activity id twice, which is the right thing for it to do.
            await gate.suspend(await makeCheckpoint([
                await makeRequest({ id: `request-a-${index}`, checkpoint_id: `checkpoint-${index}` }),
                await makeRequest({ id: `request-b-${index}`, call_id: 'call-2', checkpoint_id: `checkpoint-${index}` }),
            ], { id: `checkpoint-${index}` }))

            await gate.decide(`request-a-${index}`, decision)

            const activity = (await repository.listSessionToolActivities('session-1')).at(-1)!
            const persisted = parseTalosToolAuthorizationCheckpoint(activity.payload.checkpoint)
            expect(persisted?.requests.map((request) => request.decision))
                .toEqual([decision, 'pending'])
        }
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

describe('⛔⭐ l\'id del profilo modello, che ha rotto i tool su tutto OpenRouter', () => {
    /**
     * ## Il difetto, riprodotto sul Pad il 2026-08-07 con GPT-5.6 Luna
     *
     * Il validatore degli id era `/^[A-Za-z0-9][A-Za-z0-9._:-]{0,256}$/`: niente
     * barra. Ma un id OpenRouter **è** `openai/gpt-5.6-luna`, e un modello
     * locale è un percorso che comincia con `/`.
     *
     * Quindi `parseIdentity` rifiutava, il checkpoint non nasceva, e ogni
     * richiesta di consenso a uno strumento moriva con
     * `TALOS_TOOL_AUTHORIZATION_CHECKPOINT_INVALID` — cioè **nessun modello
     * OpenRouter poteva usare uno strumento che richiede il permesso**.
     *
     * L'owner l'ha visto due volte in due giorni, sempre con OpenRouter, e dal
     * codice d'errore non si poteva dire da che parte guardare: quello stesso
     * codice copriva una quindicina di cause diverse. La riga
     * `CHECKPOINT_INVALID:identity` — aggiunta poche ore prima — è ciò che ha
     * permesso di trovarlo in un minuto invece che per esclusione.
     */
    it('accetta un id con la BARRA, che è la forma di ogni modello OpenRouter', async () => {
        const identity = {
            sendId: 'send-1',
            sessionId: 'session-1',
            sessionTitle: 'Q2 plan',
            surface: 'chat' as const,
            modelProfileId: 'openai/gpt-5.6-luna',
            acceptedAt: NOW,
        }
        const request = await makeRequest({ model_profile_id: 'openai/gpt-5.6-luna' })
        const checkpoint = await makeCheckpoint([request], { send_identity: identity })

        expect(parseTalosToolAuthorizationCheckpoint(checkpoint)).not.toBeNull()
    })

    it('e un PERCORSO, che è la forma di ogni modello locale', async () => {
        const path = '/storage/emulated/0/Android/data/ai.talos/files/models/Qwen3-1.7B-Q8_0.gguf'
        const identity = {
            sendId: 'send-1',
            sessionId: 'session-1',
            sessionTitle: 'Q2 plan',
            surface: 'chat' as const,
            modelProfileId: path,
            acceptedAt: NOW,
        }
        const request = await makeRequest({ model_profile_id: path })
        const checkpoint = await makeCheckpoint([request], { send_identity: identity })

        expect(parseTalosToolAuthorizationCheckpoint(checkpoint)).not.toBeNull()
    })

    /**
     * ⛔ Ma resta limitato e senza caratteri di controllo: questo id finisce in
     * JSON e nei registri diagnostici che si copiano in una chat di supporto.
     */
    it('rifiuta un id con caratteri di controllo, o troppo lungo', async () => {
        for (const cattivo of ['openai/gpt\u0000luna', 'x'.repeat(257), '']) {
            const identity = {
                sendId: 'send-1',
                sessionId: 'session-1',
                sessionTitle: 'Q2 plan',
                surface: 'chat' as const,
                modelProfileId: cattivo,
                acceptedAt: NOW,
            }
            const request = await makeRequest({ model_profile_id: cattivo })
            const checkpoint = await makeCheckpoint([request], { send_identity: identity })
            expect(parseTalosToolAuthorizationCheckpoint(checkpoint), cattivo).toBeNull()
        }
    })

    /**
     * ⭐ E il motivo del rifiuto si LEGGE, invece di essere uno fra quindici.
     *
     * È la riga che ha trasformato «succede una cosa» in «succede questa cosa»:
     * senza, questo difetto sarebbe costato un'altra giornata.
     */
    it('dice QUALE controllo ha morso, non solo che ha morso', async () => {
        const checkpoint = await makeCheckpoint()
        const motivo: { reason: TalosCheckpointRejection | null } = { reason: null }

        parseTalosToolAuthorizationCheckpoint(
            { ...checkpoint, send_identity: { ...checkpoint.send_identity, acceptedAt: 'ieri' } },
            motivo,
        )
        expect(motivo.reason).toBe('identity')

        parseTalosToolAuthorizationCheckpoint({ ...checkpoint, runtime: 'non un oggetto' }, motivo)
        expect(motivo.reason).toBe('runtime_shape')

        // E su un checkpoint sano il motivo si azzera, invece di restare
        // l'ultimo rifiuto visto — che sarebbe un falso indizio.
        parseTalosToolAuthorizationCheckpoint(checkpoint, motivo)
        expect(motivo.reason).toBeNull()
    })

    /**
     * ⛔⭐⭐ La richiesta ORFANA, vista tre volte in una notte: la chat diceva
     * «una richiesta è in attesa» e non c'era NIENTE da toccare.
     *
     * `hydrateOne` mette il record in quarantena e lo toglie da `open` — cosa
     * giusta: un checkpoint non adottato non deve sembrare vivo. Ma `open` era
     * l'unica finestra dell'app: `pending()` vuoto, `recoveries()` vuoto, e la
     * riga in chat che annuncia l'attesa restava lì a puntare il nulla.
     *
     * Il permesso finiva in un limbo: non concedibile e non negabile. La persona
     * non poteva far altro che chiedersi cosa TALOS volesse fare al suo telefono.
     */
    it('⛔ una richiesta SCARTATA resta raggiungibile: scheda, motivo, e si chiude', async () => {
        const checkpoint = await makeCheckpoint()
        const gate = coordinator()
        await repository.appendToolActivity({
            id: checkpoint.id,
            session_id: checkpoint.session_id,
            message_id: null,
            operation: 'tool.authorization',
            status: 'pending',
            payload: {
                contract: 'talos.tool.authorization-checkpoint/1',
                // Il digest non torna: il record è integro come forma, ma il suo
                // contenuto non è più quello autorizzato.
                checkpoint: {
                    ...checkpoint,
                    requests: [{ ...checkpoint.requests[0], input: { title: 'Altro' } }],
                },
            },
            evidence: {},
            created_at: NOW,
        })

        await gate.hydrate()

        // ⛔ NON eseguibile: resta fuori da pending(), dove una decisione lo
        // cercherebbe per farlo partire.
        expect(gate.pending()).toEqual([])

        // ⭐ Ma VISIBILE, col motivo, e con lo strumento che era stato chiesto.
        const schede = gate.recoveries()
        expect(schede).toHaveLength(1)
        expect(schede[0].checkpoint_id).toBe('checkpoint-1')
        expect(schede[0].error).toBe('TALOS_TOOL_AUTHORIZATION_CHECKPOINT_INVALID')
        expect(schede[0].session_title).toBe('Q2 plan')
        expect(schede[0].tools.map((tool) => tool.tool)).toEqual(['document_create'])

        // Non c'è niente da riprendere: il digest non tornerà a tornare.
        await expect(gate.retryRecovery('checkpoint-1')).resolves.toBe(false)

        // E «Ho capito» la chiude davvero — in memoria e sul disco. Senza questo
        // la scheda tornerebbe a ogni sguardo.
        await gate.cancel('checkpoint-1')
        expect(gate.recoveries()).toEqual([])
        const attivita = await repository.listSessionToolActivities('session-1')
        expect(attivita.find((riga) => riga.id === 'checkpoint-1')?.status).toBe('cancelled')
    })

    /**
     * Il caso peggiore: il payload non si parsifica affatto. Non sappiamo quali
     * strumenti erano stati chiesti né come si chiamava la conversazione.
     *
     * ⛔ La scheda deve uscire LO STESSO. L'identità viene dal record, che c'è
     * sempre; i campi che non conosciamo restano vuoti invece di essere
     * inventati — è la stessa bugia che stiamo togliendo dalla chat.
     */
    it('⛔ scartata anche senza checkpoint leggibile: la scheda esce comunque', async () => {
        const gate = coordinator()
        await repository.appendToolActivity({
            id: 'activity-illeggibile',
            session_id: 'session-1',
            message_id: null,
            operation: 'tool.authorization',
            status: 'pending',
            payload: { contract: 'talos.tool.authorization-checkpoint/1', checkpoint: 'spazzatura' },
            evidence: {},
            created_at: NOW,
        })

        await gate.hydrate()

        const schede = gate.recoveries()
        expect(schede).toHaveLength(1)
        expect(schede[0].checkpoint_id).toBe('activity-illeggibile')
        expect(schede[0].session_id).toBe('session-1')
        expect(schede[0].tools).toEqual([])
        expect(schede[0].session_title).toBe('')
        expect(schede[0].error).toBe('TALOS_TOOL_AUTHORIZATION_CHECKPOINT_INVALID')

        await gate.cancel('activity-illeggibile')
        expect(gate.recoveries()).toEqual([])
    })
})

describe('6.4 — registraDecisioneReale, il contatore di frizione opzionale', () => {
    function coordinatorCon(registraDecisioneReale?: (
        tool: string,
        decisione: 'allow_once' | 'allow_turn' | 'always_allow' | 'deny',
        quando: string,
    ) => Promise<void>) {
        return createTalosToolAuthorizationCoordinator({
            repository,
            now: () => '2026-07-29T12:01:00.000Z',
            authorizations: () => grants,
            async grant(tool, actions) {
                grants = applyTalosToolAuthorizationGrant(grants, tool, actions, grants.revision, '2026-07-29T12:01:00.000Z')
            },
            async onReady() {},
            ...(registraDecisioneReale ? { registraDecisioneReale } : {}),
        })
    }

    it('⭐⭐⭐ PARITÀ — senza registraDecisioneReale, decide() si comporta esattamente come prima', async () => {
        const gate = coordinatorCon()
        await gate.suspend(await makeCheckpoint())
        const risultato = await gate.decide('request-1', 'allow_once')
        expect(risultato).toBe(true)
        expect(gate.pending()).toEqual([])
    })

    it('⭐⭐⭐ una decisione vera chiama registraDecisioneReale con tool/decisione/quando giusti', async () => {
        const spia = vi.fn(async () => {})
        const gate = coordinatorCon(spia)
        await gate.suspend(await makeCheckpoint())
        await gate.decide('request-1', 'allow_once')

        expect(spia).toHaveBeenCalledTimes(1)
        expect(spia).toHaveBeenCalledWith('document_create', 'allow_once', '2026-07-29T12:01:00.000Z')
    })

    it('⛔⛔ AL CONTRARIO — se registraDecisioneReale RIFIUTA, decide() riesce comunque: un contatore rotto non deve mai rompere una decisione vera', async () => {
        const cheRompeSempre = vi.fn(async () => { throw new Error('preferences non disponibile') })
        const gate = coordinatorCon(cheRompeSempre)
        await gate.suspend(await makeCheckpoint())

        const risultato = await gate.decide('request-1', 'allow_once')

        expect(risultato).toBe(true)
        expect(gate.pending()).toEqual([])
        expect(cheRompeSempre).toHaveBeenCalledTimes(1)
    })

    it('un "no" arriva al contatore come "deny", non come un\'omissione', async () => {
        const spia = vi.fn(async () => {})
        const gate = coordinatorCon(spia)
        await gate.suspend(await makeCheckpoint())
        await gate.decide('request-1', 'deny')

        expect(spia).toHaveBeenCalledWith('document_create', 'deny', '2026-07-29T12:01:00.000Z')
    })
})
