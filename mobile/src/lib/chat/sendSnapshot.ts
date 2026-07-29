import type { TalosLocalChatSurface } from '@/repositories/chatRepository'

/**
 * Identity fixed at send acceptance.
 *
 * It is deliberately provider-neutral: provider adapters receive it through
 * the controller-owned runtime, but they never become the source of session
 * ownership or navigation state.
 */
export interface TalosChatSendIdentity {
    readonly sendId: string
    readonly sessionId: string
    readonly sessionTitle: string
    readonly surface: TalosLocalChatSurface
    readonly modelProfileId: string | null
    readonly acceptedAt: string
}

/**
 * Store-owned preparation input. `runtime` is captured synchronously after the
 * target session is known; the preparer may enrich that exact send-scoped value
 * through asynchronous retrieval without consulting navigation state again.
 */
export interface TalosChatSendPreparationContext<Runtime> {
    readonly identity: Readonly<TalosChatSendIdentity>
    readonly text: string
    readonly metadata: Readonly<Record<string, unknown>>
    readonly attachments: readonly unknown[]
    readonly signal: AbortSignal
    readonly runtime: Runtime
}

/** Result carried unchanged from preparation into the completion invocation. */
export interface TalosChatSendPreparation<Runtime> {
    readonly runtime: Runtime
    readonly metadata?: Readonly<Record<string, unknown>>
}

export function createTalosChatSendIdentity(
    input: TalosChatSendIdentity,
): Readonly<TalosChatSendIdentity> {
    return Object.freeze({ ...input })
}
