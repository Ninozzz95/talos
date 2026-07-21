/**
 * The reactive controller that ties the tested pieces together for the UI:
 * model catalog + per-provider keystore secrets → composer profiles; selection +
 * effort/thinking; the chat store; and the completion that reads the selected key from
 * the OS keystore at send time (never cached in persisted state). Injectable deps make
 * it unit-testable; `useChatController()` is the app-wide singleton over the real deps.
 */
import { computed, reactive, readonly, ref, type ComputedRef, type Ref } from 'vue'
import { talosMobileModelProfiles } from '@/lib/mobileModelCatalog'
import { clampMobileEffort, mobileEffortLadderFromLevels, type TalosMobileEffortLevel } from '@/lib/mobileEffort'
import { talosMobileModelProfileIsCallable, TALOS_MOBILE_PROVIDERS } from '@/lib/mobileProviders'
import {
    clearProviderKey as realClearKey,
    getProviderKey as realGetKey,
    hasProviderKey as realHasKey,
    setProviderKey as realSetKey,
} from '@/services/secureKeyStore'
import { capacitorHttpTransport, type HttpTransport } from '@/lib/chat/anthropicClient'
import { buildChatCompletion } from '@/lib/chat/chatCompletion'
import { createChatStore, type ChatCompletion, type ChatStore } from '@/stores/chat'
import type { TalosMobileModelProfileView } from '@/components/chat/mobileChatTypes'

const TALOS_SYSTEM_PROMPT = 'You are TALOS, a precise engineering copilot. Answer directly and concisely.'

export interface ChatControllerDeps {
    hasKey: (provider: string) => Promise<boolean>
    getKey: (provider: string) => Promise<string | null>
    setKey: (provider: string, key: string) => Promise<void>
    clearKey: (provider: string) => Promise<void>
    transport: HttpTransport
}

const realDeps: ChatControllerDeps = {
    hasKey: realHasKey,
    getKey: realGetKey,
    setKey: realSetKey,
    clearKey: realClearKey,
    transport: capacitorHttpTransport,
}

export interface ChatController {
    readonly profiles: ComputedRef<TalosMobileModelProfileView[]>
    readonly selectedModelId: Ref<string | null>
    readonly selectedProfile: ComputedRef<TalosMobileModelProfileView | null>
    readonly effort: Ref<TalosMobileEffortLevel>
    readonly effortLadder: ComputedRef<TalosMobileEffortLevel[]>
    readonly thinking: Ref<boolean>
    readonly canSend: ComputedRef<boolean>
    readonly sendDisabledReason: ComputedRef<string>
    readonly chat: ChatStore
    readonly secrets: Readonly<Record<string, boolean>>
    init(): Promise<void>
    refreshSecrets(): Promise<void>
    selectModel(id: string): void
    selectEffort(level: TalosMobileEffortLevel): void
    setThinking(enabled: boolean): void
    saveKey(provider: string, key: string): Promise<void>
    removeKey(provider: string): Promise<void>
    send(text: string): Promise<void>
}

export function createChatController(deps: ChatControllerDeps = realDeps): ChatController {
    const secrets = reactive<Record<string, boolean>>(
        Object.fromEntries(TALOS_MOBILE_PROVIDERS.map((provider) => [provider.id, false])),
    )
    const selectedModelId = ref<string | null>(null)
    const effort = ref<TalosMobileEffortLevel>('high')
    const thinking = ref(false)

    const profiles = computed(() => talosMobileModelProfiles((provider) => secrets[provider] === true))
    const selectedProfile = computed(() =>
        profiles.value.find((profile) => profile.id === selectedModelId.value) ?? null,
    )
    const effortLadder = computed(() => mobileEffortLadderFromLevels(selectedProfile.value?.effort_levels))
    const canSend = computed(() =>
        talosMobileModelProfileIsCallable(selectedProfile.value) && !chat.state.sending,
    )
    const sendDisabledReason = computed(() => {
        if (!selectedProfile.value) return 'Select a model'
        if (!talosMobileModelProfileIsCallable(selectedProfile.value)) {
            return `Add your ${selectedProfile.value.provider} API key in Settings`
        }
        return ''
    })

    const complete: ChatCompletion = async (turns) => {
        const profile = selectedProfile.value
        const apiKey = profile ? await deps.getKey(profile.provider) : null
        return buildChatCompletion(
            () => ({ profile, apiKey, effort: effort.value, thinking: thinking.value, system: TALOS_SYSTEM_PROMPT }),
            deps.transport,
        )(turns)
    }
    const chat = createChatStore(complete)

    function ensureSelection(): void {
        if (selectedModelId.value && profiles.value.some((profile) => profile.id === selectedModelId.value)) return
        const callable = profiles.value.find((profile) => talosMobileModelProfileIsCallable(profile))
        selectedModelId.value = (callable ?? profiles.value[0])?.id ?? null
    }

    async function refreshSecrets(): Promise<void> {
        await Promise.all(
            TALOS_MOBILE_PROVIDERS.map(async (provider) => {
                secrets[provider.id] = await deps.hasKey(provider.id)
            }),
        )
        ensureSelection()
    }

    async function init(): Promise<void> {
        await refreshSecrets()
        effort.value = clampMobileEffort(selectedProfile.value?.effort_levels, effort.value)
    }

    function selectModel(id: string): void {
        selectedModelId.value = id
        effort.value = clampMobileEffort(selectedProfile.value?.effort_levels, effort.value)
        if (!selectedProfile.value?.supports_thinking) thinking.value = false
    }
    function selectEffort(level: TalosMobileEffortLevel): void {
        effort.value = level
    }
    function setThinking(enabled: boolean): void {
        thinking.value = enabled
    }
    async function saveKey(provider: string, key: string): Promise<void> {
        await deps.setKey(provider, key)
        await refreshSecrets()
    }
    async function removeKey(provider: string): Promise<void> {
        await deps.clearKey(provider)
        await refreshSecrets()
    }
    async function send(text: string): Promise<void> {
        await chat.send(text)
    }

    return {
        profiles,
        selectedModelId,
        selectedProfile,
        effort,
        effortLadder,
        thinking,
        canSend,
        sendDisabledReason,
        chat,
        secrets: readonly(secrets),
        init,
        refreshSecrets,
        selectModel,
        selectEffort,
        setThinking,
        saveKey,
        removeKey,
        send,
    }
}

let singleton: ChatController | null = null
export function useChatController(): ChatController {
    if (!singleton) singleton = createChatController()
    return singleton
}

export function __resetChatControllerForTests(): void {
    singleton = null
}
