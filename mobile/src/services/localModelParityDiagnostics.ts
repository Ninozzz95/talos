import { z } from 'zod'
import { TALOS_APP_BUILD } from '@/lib/appBuild'
import type {
    TalosMobileCompletionInput,
    TalosMobileCompletionResult,
    TalosMobileProviderModel,
    TalosProviderStreamHandlers,
} from '@/lib/chat/providerContracts'
import { localAdapter } from '@/lib/chat/providers/localAdapter'
import { talosMobileHttpTransport } from '@/lib/chat/httpTransport'
import type { TalosToolDefinition } from '@/lib/tools/registry'
import {
    buildTalosLocalModelParityReport,
    talosContainsLocalProtocol,
    type TalosLocalModelParityReport,
    type TalosLocalParityCheck,
    type TalosLocalParityCheckId,
} from '@/lib/models/localModelParityDiagnostics'
import {
    talosLocalEngineStatus,
    talosLocalInstalledModels,
    talosLocalEngineTemplateCapabilities,
    type TalosLocalTemplateCapabilities,
    type TalosLocalEngineStatus,
} from '@/services/localEngine'
import { talosLocalToolTransportOf } from '@/lib/chat/localToolPromptProtocol'

const TEXT_TOKEN = 'TALOS_PARITY_TEXT_417'
const NO_TOOL_TOKEN = 'TALOS_PARITY_NO_TOOL_731'
const TOOL_TOKEN = 'TALOS_PARITY_NONCE_593'
const CANCEL_TOKEN = 'TALOS_PARITY_CANCEL_269'
const CANCEL_SLA_MS = 2_500
const PROBE_TIMEOUT_MS = 180_000
const PROBE_TIMEOUT_CODE = 'TALOS_LOCAL_PARITY_PROBE_TIMEOUT'

/** It is described to the model but never executed. */
const DIAGNOSTIC_TOOL: TalosToolDefinition<{ value: string }> = {
    name: 'talos_diagnostic_echo',
    title: 'TALOS diagnostic echo',
    description: 'Return one diagnostic value to TALOS. Use only when explicitly requested.',
    action: 'read',
    input: z.object({ value: z.string() }),
    async run() {
        throw new Error('TALOS_LOCAL_PARITY_TOOL_MUST_NOT_EXECUTE')
    },
}

interface TalosLocalParityRunnerDeps {
    complete(
        input: TalosMobileCompletionInput,
        stream?: TalosProviderStreamHandlers,
    ): Promise<TalosMobileCompletionResult>
    status(): Promise<TalosLocalEngineStatus>
    installed(): ReturnType<typeof talosLocalInstalledModels>
    templateCapabilities?(path: string): Promise<TalosLocalTemplateCapabilities | null>
    now(): number
    appBuild: string
}

const DEFAULT_DEPS: TalosLocalParityRunnerDeps = {
    complete(input, stream) {
        if (stream) {
            return localAdapter.streamComplete!(
                input,
                { apiKey: null, endpoint: null },
                stream,
            )
        }
        return localAdapter.complete(
            input,
            { apiKey: null, endpoint: null },
            talosMobileHttpTransport,
        )
    },
    status: talosLocalEngineStatus,
    installed: talosLocalInstalledModels,
    templateCapabilities: talosLocalEngineTemplateCapabilities,
    now: () => performance.now(),
    appBuild: TALOS_APP_BUILD,
}

function request(
    model: TalosMobileProviderModel,
    turns: TalosMobileCompletionInput['turns'],
    withTools = false,
): TalosMobileCompletionInput {
    return {
        model,
        turns,
        effort: 'low',
        thinking: false,
        ...(withTools ? { tools: [DIAGNOSTIC_TOOL as TalosToolDefinition<never>] } : {}),
    }
}

function check(
    id: TalosLocalParityCheckId,
    status: TalosLocalParityCheck['status'],
    started: number,
    deps: TalosLocalParityRunnerDeps,
    code: string,
): TalosLocalParityCheck {
    return { id, status, durationMs: deps.now() - started, code }
}

function clean(result: TalosMobileCompletionResult): boolean {
    return !talosContainsLocalProtocol(result.text)
        && !talosContainsLocalProtocol(result.reasoning)
}

function templateTransportFailureOf(failure: unknown): boolean {
    if (!failure || typeof failure !== 'object') return false
    const record = failure as Record<string, unknown>
    const candidates = [record.code, record.nativeCode, record.message]
    return candidates.some((value) => typeof value === 'string' && (
        /^TALOS_LLAMA_.*TEMPLATE/.test(value)
        || value === 'TALOS_LLAMA_PLAN_FAILED'
    ))
}

async function completeWithinProbeDeadline(
    deps: TalosLocalParityRunnerDeps,
    input: TalosMobileCompletionInput,
    stream: Omit<TalosProviderStreamHandlers, 'signal'>,
): Promise<TalosMobileCompletionResult> {
    const controller = new AbortController()
    let timedOut = false
    let timer: ReturnType<typeof setTimeout> | null = null
    const deadline = new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => {
            timedOut = true
            controller.abort()
            reject(new Error(PROBE_TIMEOUT_CODE))
        }, PROBE_TIMEOUT_MS)
    })
    try {
        return await Promise.race([
            deps.complete(input, { ...stream, signal: controller.signal }),
            deadline,
        ])
    } catch (failure) {
        if (timedOut) throw new Error(PROBE_TIMEOUT_CODE)
        throw failure
    } finally {
        if (timer !== null) clearTimeout(timer)
    }
}

export async function runTalosLocalModelParityDiagnostics(
    input: { model: TalosMobileProviderModel },
    deps: TalosLocalParityRunnerDeps = DEFAULT_DEPS,
): Promise<TalosLocalModelParityReport> {
    if (input.model.provider !== 'local') {
        throw new Error('TALOS_LOCAL_PARITY_REQUIRES_LOCAL_MODEL')
    }

    // Inspect the same embedded-template contract used by localAdapter before
    // any probe generation. Unknown is a valid safe fallback, never native.
    const templateCapabilities = deps.templateCapabilities
        ? await deps.templateCapabilities(input.model.id).catch(() => null)
        : null
    const toolTransport = talosLocalToolTransportOf(templateCapabilities)
    const checks: TalosLocalParityCheck[] = []
    const observed: TalosMobileCompletionResult[] = []
    const observedChunks: string[] = []

    const run = async (
        id: TalosLocalParityCheckId,
        completionInput: TalosMobileCompletionInput,
        accept: (result: TalosMobileCompletionResult) => boolean,
    ): Promise<TalosMobileCompletionResult | null> => {
        const started = deps.now()
        try {
            const result = await completeWithinProbeDeadline(deps, completionInput, {
                onChunk: (value) => observedChunks.push(value),
                onReasoning: (value) => observedChunks.push(value),
            })
            observed.push(result)
            const ok = accept(result)
            checks.push(check(
                id, ok ? 'pass' : 'fail', started, deps,
                ok ? 'TALOS_LOCAL_PARITY_OK' : `TALOS_LOCAL_PARITY_${id.toUpperCase()}_FAILED`,
            ))
            return result
        } catch (failure) {
            const timedOut = failure instanceof Error && failure.message === PROBE_TIMEOUT_CODE
            checks.push(check(
                id, 'fail', started, deps,
                timedOut
                    ? `TALOS_LOCAL_PARITY_${id.toUpperCase()}_TIMEOUT`
                    : templateTransportFailureOf(failure)
                        ? 'TALOS_LOCAL_PARITY_TEMPLATE_TRANSPORT_FAILED'
                        : `TALOS_LOCAL_PARITY_${id.toUpperCase()}_ERROR`,
            ))
            return null
        }
    }

    await run(
        'plain_text',
        request(input.model, [{
            role: 'user',
            content: `Reply with exactly ${TEXT_TOKEN} and no other text.`,
        }]),
        (result) => result.text.includes(TEXT_TOKEN)
            && !result.toolCalls?.length
            && clean(result),
    )

    await run(
        'no_false_tool',
        request(input.model, [{
            role: 'user',
            content: `Reply with exactly ${NO_TOOL_TOKEN}. Do not call any tool.`,
        }], true),
        (result) => result.text.includes(NO_TOOL_TOKEN)
            && !result.toolCalls?.length
            && clean(result),
    )

    const toolPrompt = `Call talos_diagnostic_echo exactly once with value "${TOOL_TOKEN}". Do not answer in prose.`
    const toolResult = await run(
        'tool_call',
        request(input.model, [{ role: 'user', content: toolPrompt }], true),
        (result) => {
            if (result.toolCalls?.length !== 1 || !clean(result)) return false
            const call = result.toolCalls[0]!
            if (call.name !== DIAGNOSTIC_TOOL.name) return false
            try {
                const args = DIAGNOSTIC_TOOL.input.safeParse(JSON.parse(call.arguments))
                return args.success && args.data.value === TOOL_TOKEN
            } catch { return false }
        },
    )

    const call = toolResult?.toolCalls?.length === 1 ? toolResult.toolCalls[0] : null
    if (!call || call.name !== DIAGNOSTIC_TOOL.name) {
        checks.push({
            id: 'tool_result_roundtrip', status: 'skipped', durationMs: 0,
            code: 'TALOS_LOCAL_PARITY_TOOL_CALL_PREREQUISITE',
        })
    } else {
        await run(
            'tool_result_roundtrip',
            request(input.model, [
                { role: 'user', content: toolPrompt },
                { role: 'assistant', content: toolResult?.text ?? '', toolCalls: [call] },
                {
                    role: 'tool',
                    content: `Diagnostic result: ${TOOL_TOKEN}. Reply exactly ${TOOL_TOKEN} without calling another tool.`,
                    toolCallId: call.id,
                    toolName: call.name,
                },
            ], true),
            (result) => result.text.includes(TOOL_TOKEN)
                && !result.toolCalls?.length
                && clean(result),
        )
    }

    // One aggregate invariant, not another inference: no channel observed by
    // the UI may carry the model's protocol.
    const protocolStarted = deps.now()
    const protocolClean = observed.every(clean)
        && observedChunks.every((value) => !talosContainsLocalProtocol(value))
    checks.push(check(
        'protocol_hygiene', protocolClean ? 'pass' : 'fail', protocolStarted, deps,
        protocolClean ? 'TALOS_LOCAL_PARITY_OK' : 'TALOS_LOCAL_PARITY_PROTOCOL_LEAK',
    ))

    const cancelStarted = deps.now()
    const controller = new AbortController()
    let firstChunkAt: number | null = null
    let cancelFailed = false
    let cancelTimedOut = false
    const cancelled = new Promise<never>((_resolve, reject) => {
        controller.signal.addEventListener('abort', () => {
            reject(new Error('TALOS_LOCAL_PARITY_CANCELLED'))
        }, { once: true })
    })
    const cancelTimer = setTimeout(() => {
        cancelTimedOut = true
        controller.abort()
    }, PROBE_TIMEOUT_MS)
    const generazione = deps.complete(
        request(input.model, [{
            role: 'user',
            content: `Write a long numbered explanation beginning with ${CANCEL_TOKEN}.`,
        }]),
        {
            signal: controller.signal,
            onChunk: () => {
                if (firstChunkAt !== null) return
                firstChunkAt = deps.now()
                controller.abort()
            },
        },
    )
    try {
        await Promise.race([generazione, cancelled])
    } catch {
        // An abort rejection is an expected completion of this probe.
        cancelFailed = !controller.signal.aborted || cancelTimedOut
    } finally {
        clearTimeout(cancelTimer)
    }
    // ⛔ Il segnale di abort NON è lo stop. La corsa di sopra si ferma al
    // primo segnale; qui si aspetta che la generazione si spenga DAVVERO
    // (settle del ramo abbandonato), con un tetto pari al limite dichiarato:
    // un motore che ignora lo stop — il «finto annullamento» storico — non
    // passa. Promise.race segna già il ramo perdente come gestito, quindi il
    // suo rigetto tardivo non può diventare un'unhandled rejection.
    let stopTimer: ReturnType<typeof setTimeout> | null = null
    const stopTetto = new Promise<boolean>((resolve) => {
        stopTimer = setTimeout(() => resolve(false), CANCEL_SLA_MS)
    })
    const spento = await Promise.race([
        generazione.then(() => true, () => true),
        stopTetto,
    ])
    if (stopTimer !== null) clearTimeout(stopTimer)
    const cancelDuration = deps.now() - (firstChunkAt ?? cancelStarted)
    const cancelOk = spento
        && !cancelFailed
        && firstChunkAt !== null
        && controller.signal.aborted
        && !cancelTimedOut
        && cancelDuration <= CANCEL_SLA_MS
    checks.push(check(
        'cancel', cancelOk ? 'pass' : 'fail', cancelStarted, deps,
        cancelOk ? 'TALOS_LOCAL_PARITY_OK' : 'TALOS_LOCAL_PARITY_CANCEL_FAILED',
    ))

    const [status, installed] = await Promise.all([deps.status(), deps.installed()])
    const file = installed.models.find((entry) => entry.path === input.model.id)
    return buildTalosLocalModelParityReport({
        modelPath: input.model.id,
        modelBytes: file?.bytes ?? null,
        modelModifiedAt: file?.modifiedAt ?? null,
        appBuild: deps.appBuild,
        engineBuild: status.engineBuild,
        toolTransport,
        templateCapabilities,
        checks,
    })
}
