import { readonly, ref, type Ref } from 'vue'
import type { TalosTranslate } from '@/i18n/contracts'
import { normalizeComposerDraft, normalizeComposerDraftScope } from '@/repositories/chatRepository'

export interface TalosMobileComposerDraftPort {
    load(scopeId: string): Promise<string>
    save(scopeId: string, draft: string): Promise<void>
}

export interface TalosMobileComposerDraftOptions extends TalosMobileComposerDraftPort {
    translate: TalosTranslate
    debounceMs?: number
    maxWaitMs?: number
}

export interface TalosMobileComposerDraftController {
    readonly prompt: Ref<string>
    readonly scope: Readonly<Ref<string>>
    readonly error: Readonly<Ref<string | null>>
    activateScope(scopeId: string): Promise<void>
    updatePrompt(value: string): void
    flush(): Promise<boolean>
    clear(): Promise<boolean>
    dispose(): Promise<void>
}

function actionableDraftError(error: unknown, translate: TalosTranslate): string {
    const detail = error instanceof Error && error.message
        ? error.message
        : translate('common.unknown')
    return translate('chat.draftSaveFailed', { detail })
}

export function createTalosMobileComposerDraftController(
    options: TalosMobileComposerDraftOptions,
): TalosMobileComposerDraftController {
    const prompt = ref('')
    const scope = ref('new')
    const error = ref<string | null>(null)
    const volatileDrafts = new Map<string, string>()
    const debounceMs = Math.max(0, options.debounceMs ?? 250)
    const maxWaitMs = Math.max(debounceMs, options.maxWaitMs ?? 2_000)
    let initialized = false
    let persistedValue = ''
    let scopeRevision = 0
    let editRevision = 0
    let debounceTimer: ReturnType<typeof setTimeout> | null = null
    let maxWaitTimer: ReturnType<typeof setTimeout> | null = null
    let writeQueue: Promise<void> = Promise.resolve()

    function clearTimers(): void {
        if (debounceTimer !== null) clearTimeout(debounceTimer)
        if (maxWaitTimer !== null) clearTimeout(maxWaitTimer)
        debounceTimer = null
        maxWaitTimer = null
    }

    async function write(scopeId: string, value: string): Promise<boolean> {
        let succeeded = false
        writeQueue = writeQueue.catch(() => undefined).then(async () => {
            try {
                await options.save(scopeId, value)
                volatileDrafts.delete(scopeId)
                if (scope.value === scopeId && prompt.value === value) persistedValue = value
                error.value = null
                succeeded = true
            } catch (cause) {
                volatileDrafts.set(scopeId, value)
                error.value = actionableDraftError(cause, options.translate)
            }
        })
        await writeQueue
        return succeeded
    }

    async function flush(): Promise<boolean> {
        clearTimers()
        if (!initialized || prompt.value === persistedValue) return true
        const targetScope = scope.value
        const targetValue = normalizeComposerDraft(prompt.value)
        return write(targetScope, targetValue)
    }

    function schedule(): void {
        if (!initialized) return
        if (debounceTimer !== null) clearTimeout(debounceTimer)
        debounceTimer = setTimeout(() => { void flush() }, debounceMs)
        if (maxWaitTimer === null) maxWaitTimer = setTimeout(() => { void flush() }, maxWaitMs)
    }

    async function activateScope(scopeId: string): Promise<void> {
        const nextScope = normalizeComposerDraftScope(scopeId)
        if (initialized && nextScope === scope.value) return
        if (initialized) await flush()
        const revision = ++scopeRevision
        const editsAtStart = editRevision
        const promptAtStart = prompt.value
        const wasInitialized = initialized
        scope.value = nextScope
        const volatile = volatileDrafts.get(nextScope)
        try {
            const loaded = volatile ?? normalizeComposerDraft(await options.load(nextScope))
            if (revision !== scopeRevision) return
            if (editRevision === editsAtStart && (wasInitialized || promptAtStart === '')) {
                prompt.value = loaded
            }
            persistedValue = loaded
            initialized = true
            error.value = null
            if (prompt.value !== persistedValue) schedule()
        } catch (cause) {
            if (revision !== scopeRevision) return
            initialized = true
            error.value = actionableDraftError(cause, options.translate)
        }
    }

    function updatePrompt(value: string): void {
        editRevision += 1
        prompt.value = normalizeComposerDraft(value)
        schedule()
    }

    async function clear(): Promise<boolean> {
        prompt.value = ''
        return flush()
    }

    async function dispose(): Promise<void> {
        scopeRevision += 1
        await flush()
        clearTimers()
    }

    return {
        prompt,
        scope: readonly(scope),
        error: readonly(error),
        activateScope,
        updatePrompt,
        flush,
        clear,
        dispose,
    }
}
