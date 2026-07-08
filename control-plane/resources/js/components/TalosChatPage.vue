<script setup lang="ts">
import { computed, nextTick, onMounted, ref } from 'vue'
import { AlertCircle, BarChart3, KeyRound, Loader2, MessageSquarePlus, Moon, RefreshCw, Send, ShieldCheck, Sun } from '@lucide/vue'
import Button from './ui/Button.vue'
import Badge from './ui/Badge.vue'
import Card from './ui/Card.vue'
import Input from './ui/Input.vue'
import ScrollArea from './ui/ScrollArea.vue'
import Select from './ui/Select.vue'
import Separator from './ui/Separator.vue'
import Textarea from './ui/Textarea.vue'
import { useTalosChat } from '../composables/useTalosChat'
import { useTalosContextVault } from '../composables/useTalosContextVault'
import { useTalosModelProfiles } from '../composables/useTalosModelProfiles'
import { useTalosSessions } from '../composables/useTalosSessions'
import { talosFetch } from '../lib/api'
import type { TalosMessage, TalosSession } from '../lib/talosTypes'

type Theme = 'dark' | 'light'
type TalosSettings = {
    api_key: string
    model_profile_id: string
    context_set_id: string
}
type MessageSource = {
    context_set_id?: string
    file_id?: string
    chunk_id?: string
    file_name?: string
    preview?: string
}

const theme = ref<Theme>('dark')
const prompt = ref('')
const sending = ref(false)
const creatingSession = ref(false)
const settingsSaved = ref(false)
const benchmarkingRunId = ref<string | null>(null)
const chatThreadEl = ref<HTMLElement | null>(null)
const uiError = ref<string | null>(null)
const settings = ref<TalosSettings>({
    api_key: '',
    model_profile_id: '',
    context_set_id: '',
})

const {
    sessions,
    activeSession,
    messages,
    loadingSessions,
    loadingMessages,
    sessionError,
    messageError,
    loadSessions,
    createSession,
    updateSessionTitle,
    selectSession,
    createMessage,
} = useTalosSessions()
const { sendPersistentChat } = useTalosChat()
const {
    modelProfiles,
    loadingModelProfiles,
    modelProfileError,
    loadModelProfiles,
    findModelProfile,
} = useTalosModelProfiles()
const {
    contextSets,
    loadingContextSets,
    contextSetError,
    loadContextSets,
} = useTalosContextVault()

const shellClass = computed(() => theme.value === 'light' ? 'talos-light' : 'talos-dark')
const themeIcon = computed(() => theme.value === 'light' ? Moon : Sun)
const selectedModelProfileId = computed({
    get: () => settings.value.model_profile_id,
    set: (value: string) => {
        settings.value.model_profile_id = value
        saveSettings(false)
    },
})
const selectedModelProfile = computed(() => findModelProfile(selectedModelProfileId.value))
const selectedContextSetId = computed({
    get: () => settings.value.context_set_id,
    set: (value: string) => {
        settings.value.context_set_id = value
        saveSettings(false)
    },
})
const selectedContextSet = computed(() => {
    return contextSets.value.find((contextSet) => contextSet.id === selectedContextSetId.value) ?? null
})
const selectedModelProfileIsUsable = computed(() => {
    return Boolean(selectedModelProfile.value && selectedModelProfile.value.status !== 'disabled' && selectedModelProfile.value.has_secret)
})
const canUseDevKey = computed(() => settings.value.api_key.trim().length > 0)
const canSend = computed(() => {
    return prompt.value.trim().length > 0 && !sending.value && (selectedModelProfileIsUsable.value || canUseDevKey.value)
})
const statusText = computed(() => {
    if (sending.value) {
        return 'Sending through Kadmos'
    }

    if (selectedModelProfile.value && selectedModelProfileIsUsable.value) {
        const contextLabel = selectedContextSet.value ? ` + ${selectedContextSet.value.name}` : ''
        return `Server-side model profile: ${selectedModelProfile.value.display_name}${contextLabel}`
    }

    if (selectedModelProfile.value && !selectedModelProfileIsUsable.value) {
        return 'Selected model profile is not usable'
    }

    if (canUseDevKey.value) {
        return 'Kadmos ready - dev-only browser key'
    }

    if (modelProfiles.value.length > 0) {
        return 'Select a server-side model profile'
    }

    if (!activeSession.value) {
        return 'Add a server-side model profile or dev-only key'
    }

    return 'Provider route unavailable'
})

function loadSettings() {
    const savedSettings = localStorage.getItem('talos_settings')
    if (savedSettings) {
        try {
            settings.value = {
                ...settings.value,
                ...JSON.parse(savedSettings),
            }
        } catch {
            localStorage.removeItem('talos_settings')
        }
    }

    const savedTheme = localStorage.getItem('talos_theme')
    if (savedTheme === 'light' || savedTheme === 'dark') {
        theme.value = savedTheme
    }
}

function saveSettings(showConfirmation = true) {
    localStorage.setItem('talos_settings', JSON.stringify(settings.value))
    if (!showConfirmation) {
        return
    }

    settingsSaved.value = true
    window.setTimeout(() => {
        settingsSaved.value = false
    }, 1600)
}

function toggleTheme() {
    theme.value = theme.value === 'light' ? 'dark' : 'light'
    localStorage.setItem('talos_theme', theme.value)
}

function scrollChat() {
    const el = chatThreadEl.value
    if (el) {
        el.scrollTop = el.scrollHeight
    }
}

function formatTime(value: string) {
    return new Date(value).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

function messageLabel(message: TalosMessage) {
    if (message.role === 'user') {
        return 'Tu'
    }

    if (message.role === 'assistant') {
        return 'TALOS'
    }

    return 'Sistema'
}

function messageMeta(message: TalosMessage) {
    if (message.role === 'user') {
        return 'persisted prompt'
    }

    const summary = message.metadata?.summary
    if (typeof summary === 'string' && summary.trim()) {
        return summary.replaceAll('_', ' ')
    }

    const faultType = message.metadata?.fault_type
    if (typeof faultType === 'string' && faultType.trim()) {
        return faultType.replaceAll('_', ' ')
    }

    return message.role === 'assistant' ? 'persisted answer' : 'system note'
}

function messageMutations(message: TalosMessage) {
    const mutations = message.metadata?.mutations
    return Array.isArray(mutations) ? mutations : []
}

function messageSources(message: TalosMessage): MessageSource[] {
    const sources = message.metadata?.used_context

    if (!Array.isArray(sources)) {
        return []
    }

    return sources.flatMap((source) => {
        if (!source || typeof source !== 'object' || Array.isArray(source)) {
            return []
        }

        return [source as MessageSource]
    })
}

function sourceLabel(source: MessageSource, index: number) {
    return source.file_name || source.chunk_id || source.file_id || `Source ${index + 1}`
}

function sourcePreview(source: MessageSource) {
    return source.preview || 'Context source attached to this answer.'
}

async function benchmarkMessageRun(message: TalosMessage) {
    if (!activeSession.value || !message.run_id || benchmarkingRunId.value) {
        return
    }

    benchmarkingRunId.value = message.run_id
    uiError.value = null

    try {
        const response = await talosFetch<{
            benchmark_group?: { id?: string; name?: string }
        }>(`/api/talos/runs/${message.run_id}/benchmark`, {
            method: 'POST',
            body: JSON.stringify({ runs: 1 }),
            validationMessage: 'TALOS could not create a benchmark for this run.',
        })

        const groupId = response.benchmark_group?.id ?? 'unknown'
        await createMessage(activeSession.value.id, {
            role: 'system',
            content: `Benchmark run created for ${message.run_id}. Group: ${groupId}. Open /dashboard to inspect persisted AVM ON/OFF lanes.`,
            run_id: message.run_id,
            metadata: {
                source: 'talos_chat_benchmark',
                benchmark_group: response.benchmark_group ?? null,
            },
        })
        await nextTick()
        scrollChat()
    } catch (error) {
        uiError.value = error instanceof Error ? error.message : 'TALOS could not benchmark this run.'
    } finally {
        benchmarkingRunId.value = null
    }
}

function titleFromPrompt(value: string) {
    const title = value.trim().replace(/\s+/g, ' ')
    if (!title) {
        return 'New chat'
    }

    return title.length > 64 ? `${title.slice(0, 61)}...` : title
}

async function startNewChat() {
    if (creatingSession.value) {
        return
    }

    creatingSession.value = true
    uiError.value = null

    try {
        await createSession('New chat')
        prompt.value = ''
        await nextTick()
        scrollChat()
    } catch (error) {
        uiError.value = error instanceof Error ? error.message : 'TALOS could not create a chat session.'
    } finally {
        creatingSession.value = false
    }
}

async function chooseSession(session: TalosSession) {
    if (activeSession.value?.id === session.id || loadingMessages.value) {
        return
    }

    uiError.value = null

    try {
        await selectSession(session)
        await nextTick()
        scrollChat()
    } catch (error) {
        uiError.value = error instanceof Error ? error.message : 'TALOS could not load this session.'
    }
}

async function ensureSessionForPrompt(message: string) {
    if (activeSession.value) {
        if (activeSession.value.title === 'New chat' && messages.value.length === 0) {
            await updateSessionTitle(activeSession.value.id, titleFromPrompt(message))
        }

        return activeSession.value
    }

    return createSession(titleFromPrompt(message))
}

async function sendChat() {
    const message = prompt.value.trim()
    if (!message || sending.value) {
        return
    }

    if (!selectedModelProfileIsUsable.value && !canUseDevKey.value) {
        uiError.value = 'Select a server-side model profile or add a provider API key. Browser keys are dev-only.'
        return
    }

    sending.value = true
    uiError.value = null
    prompt.value = ''

    try {
        const session = await ensureSessionForPrompt(message)
        await sendPersistentChat({
            sessionId: session.id,
            prompt: message,
            modelProfileId: selectedModelProfileIsUsable.value ? selectedModelProfileId.value : null,
            contextSetId: selectedContextSetId.value || null,
            apiKey: selectedModelProfileIsUsable.value ? undefined : settings.value.api_key,
            chatEndpoint: '/api/talos/chat',
            persistMessage: createMessage,
        })
        await nextTick()
        scrollChat()
    } catch (error) {
        uiError.value = error instanceof Error ? error.message : 'TALOS could not complete this chat turn.'
    } finally {
        sending.value = false
        await nextTick()
        scrollChat()
    }
}

onMounted(async () => {
    loadSettings()

    try {
        await loadModelProfiles()
    } catch (error) {
        uiError.value = error instanceof Error ? error.message : 'TALOS could not load model profiles.'
    }

    try {
        await loadContextSets()
    } catch (error) {
        uiError.value = error instanceof Error ? error.message : 'TALOS could not load context sets.'
    }

    try {
        const loadedSessions = await loadSessions()
        if (loadedSessions.length > 0) {
            await selectSession(loadedSessions[0])
            await nextTick()
            scrollChat()
        }
    } catch (error) {
        uiError.value = error instanceof Error ? error.message : 'TALOS could not load chat sessions.'
    }
})
</script>

<template>
    <main :class="['talos-shell talos-chat-layout flex min-h-screen flex-col', shellClass]">
        <header class="sticky top-0 z-30 flex h-14 shrink-0 items-center justify-between border-b border-[var(--talos-border)] bg-[var(--talos-header)]/95 px-4 backdrop-blur md:px-6">
            <div class="flex items-center gap-3">
                <div class="inline-flex h-8 w-8 items-center justify-center rounded-md border border-[var(--talos-border)] bg-[var(--talos-panel)] text-[var(--talos-accent)]">
                    <ShieldCheck class="h-4 w-4" />
                </div>
                <div>
                    <div class="text-sm font-semibold text-[var(--talos-text)]">TALOS</div>
                    <div class="text-[11px] text-[var(--talos-muted)]">Persistent chat</div>
                </div>
            </div>

            <div class="flex items-center gap-2">
                <Button variant="ghost" size="sm" :disabled="creatingSession" @click="startNewChat">
                    <Loader2 v-if="creatingSession" class="h-4 w-4 animate-spin" />
                    <MessageSquarePlus v-else class="h-4 w-4" />
                    New
                </Button>
                <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label="Toggle theme"
                    @click="toggleTheme"
                >
                    <component :is="themeIcon" class="h-4 w-4" />
                </Button>
            </div>
        </header>

        <div class="grid min-h-0 flex-1 grid-cols-1 md:grid-cols-[248px_minmax(0,1fr)]">
            <aside class="min-h-0 border-b border-[var(--talos-border)] bg-[var(--talos-sidebar)] md:border-b-0 md:border-r">
                <div class="flex h-full min-h-0 flex-col">
                    <div class="flex h-11 shrink-0 items-center justify-between border-b border-[var(--talos-border)] px-3">
                        <span class="text-xs font-semibold uppercase text-[var(--talos-muted)]">Sessions</span>
                        <Badge tone="neutral">{{ sessions.length }}</Badge>
                    </div>
                    <ScrollArea class="flex-1 p-2">
                        <div v-if="loadingSessions" class="flex items-center gap-2 px-2 py-3 text-xs text-[var(--talos-muted)]">
                            <Loader2 class="h-4 w-4 animate-spin text-[var(--talos-accent)]" />
                            Loading sessions
                        </div>
                        <div v-else-if="!sessions.length" class="px-2 py-3 text-xs leading-5 text-[var(--talos-muted)]">
                            No sessions yet. Start a new chat or send a prompt.
                        </div>
                        <button
                            v-for="session in sessions"
                            v-else
                            :key="session.id"
                            type="button"
                            class="mb-1 w-full rounded-md border px-3 py-2 text-left transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--talos-accent)]"
                            :class="activeSession?.id === session.id
                                ? 'border-[var(--talos-accent)] bg-[var(--talos-panel)] text-[var(--talos-text)]'
                                : 'border-transparent text-[var(--talos-muted)] hover:border-[var(--talos-border)] hover:bg-[var(--talos-panel-soft)] hover:text-[var(--talos-text)]'"
                            @click="chooseSession(session)"
                        >
                            <span class="block truncate text-sm font-medium">{{ session.title }}</span>
                            <span class="mt-1 block text-[11px]">{{ new Date(session.updated_at).toLocaleDateString() }}</span>
                        </button>
                    </ScrollArea>
                </div>
            </aside>

            <section ref="chatThreadEl" class="talos-chat-thread min-h-0 overflow-y-auto px-4 pb-64 pt-8 md:px-6">
                <div class="mx-auto flex min-h-full w-full max-w-3xl flex-col">
                    <div v-if="uiError || sessionError || messageError" class="mb-4 flex items-start gap-2 rounded-md border border-[var(--talos-warning-border)] bg-[var(--talos-warning-soft)] px-3 py-2 text-sm text-[var(--talos-text)]">
                        <AlertCircle class="mt-0.5 h-4 w-4 shrink-0 text-[var(--talos-accent)]" />
                        <span>{{ uiError || sessionError || messageError }}</span>
                    </div>
                    <div v-if="modelProfileError" class="mb-4 flex items-start gap-2 rounded-md border border-[var(--talos-warning-border)] bg-[var(--talos-warning-soft)] px-3 py-2 text-sm text-[var(--talos-text)]">
                        <AlertCircle class="mt-0.5 h-4 w-4 shrink-0 text-[var(--talos-accent)]" />
                        <span>{{ modelProfileError }}</span>
                    </div>
                    <div v-if="contextSetError" class="mb-4 flex items-start gap-2 rounded-md border border-[var(--talos-warning-border)] bg-[var(--talos-warning-soft)] px-3 py-2 text-sm text-[var(--talos-text)]">
                        <AlertCircle class="mt-0.5 h-4 w-4 shrink-0 text-[var(--talos-accent)]" />
                        <span>{{ contextSetError }}</span>
                    </div>

                    <div v-if="loadingMessages" class="flex flex-1 items-center justify-center text-sm text-[var(--talos-muted)]">
                        <Loader2 class="mr-2 h-4 w-4 animate-spin text-[var(--talos-accent)]" />
                        Loading messages
                    </div>

                    <div v-else-if="!messages.length" class="flex flex-1 flex-col items-center justify-center text-center">
                        <div class="inline-flex h-16 w-16 items-center justify-center rounded-2xl border border-[var(--talos-border)] bg-[var(--talos-panel)] text-[var(--talos-accent)]">
                            <ShieldCheck class="h-8 w-8" />
                        </div>
                        <h1 class="mt-6 text-2xl font-semibold text-[var(--talos-text)]">What workflow should TALOS handle?</h1>
                        <p class="mt-3 max-w-[560px] text-sm leading-6 text-[var(--talos-muted)]">
                            This chat stores sessions and messages through the TALOS control plane and routes model calls through server-side model profiles when available.
                        </p>
                        <div class="mt-6 flex flex-wrap justify-center gap-2">
                            <button type="button" class="rounded-full border border-[var(--talos-border)] px-4 py-2 text-sm text-[var(--talos-muted)] transition hover:border-[var(--talos-accent)] hover:text-[var(--talos-accent)]" @click="prompt = 'Create a verified workflow for checking an external API.'">
                                Verify API
                            </button>
                            <button type="button" class="rounded-full border border-[var(--talos-border)] px-4 py-2 text-sm text-[var(--talos-muted)] transition hover:border-[var(--talos-accent)] hover:text-[var(--talos-accent)]" @click="prompt = 'Analyze these logs and build a replayable plan.'">
                                Analyze logs
                            </button>
                            <button type="button" class="rounded-full border border-[var(--talos-border)] px-4 py-2 text-sm text-[var(--talos-muted)] transition hover:border-[var(--talos-accent)] hover:text-[var(--talos-accent)]" @click="prompt = 'Generate a DAG for reading and validating a CSV dataset.'">
                                Generate DAG
                            </button>
                        </div>
                    </div>

                    <div v-else class="space-y-5">
                        <article
                            v-for="message in messages"
                            :key="message.id"
                            class="flex"
                            :class="message.role === 'user' ? 'justify-end' : 'justify-start'"
                        >
                            <div
                                class="max-w-[760px] rounded-2xl border px-4 py-3"
                                :class="message.role === 'user'
                                    ? 'border-[var(--talos-border-strong)] bg-[var(--talos-user)] text-[var(--talos-user-text)]'
                                    : message.role === 'system'
                                        ? 'border-[var(--talos-warning-border)] bg-[var(--talos-warning-soft)] text-[var(--talos-text)]'
                                        : 'border-[var(--talos-border)] bg-[var(--talos-panel)] text-[var(--talos-text)]'"
                            >
                                <div class="mb-2 flex flex-wrap items-center gap-2 text-[11px] uppercase opacity-75">
                                    <span class="font-semibold">{{ messageLabel(message) }}</span>
                                    <span>{{ messageMeta(message) }}</span>
                                    <span>{{ formatTime(message.created_at) }}</span>
                                </div>
                                <p class="whitespace-pre-wrap text-sm leading-6">{{ message.content }}</p>
                                <div v-if="message.role === 'assistant'" class="mt-3 flex flex-wrap gap-2">
                                    <Badge v-if="messageMutations(message).length" tone="success">{{ messageMutations(message).length }} JMP</Badge>
                                    <Badge tone="neutral">Persisted</Badge>
                                    <Button
                                        v-if="message.run_id"
                                        type="button"
                                        variant="ghost"
                                        size="sm"
                                        :disabled="benchmarkingRunId === message.run_id"
                                        @click="benchmarkMessageRun(message)"
                                    >
                                        <Loader2 v-if="benchmarkingRunId === message.run_id" class="h-4 w-4 animate-spin" />
                                        <BarChart3 v-else class="h-4 w-4" />
                                        Benchmark run
                                    </Button>
                                </div>
                                <div v-if="message.role === 'assistant' && messageSources(message).length" class="mt-3 rounded-md border border-[var(--talos-border)] bg-[var(--talos-panel-soft)] p-3">
                                    <div class="text-[11px] font-semibold uppercase text-[var(--talos-muted)]">Source provenance</div>
                                    <div class="mt-2 space-y-2">
                                        <article
                                            v-for="(source, index) in messageSources(message)"
                                            :key="`${source.context_set_id ?? 'context'}-${source.chunk_id ?? source.file_id ?? index}`"
                                            class="rounded-md border border-[var(--talos-border)] bg-[var(--talos-panel)] px-3 py-2"
                                        >
                                            <div class="truncate text-xs font-semibold text-[var(--talos-text)]">{{ sourceLabel(source, index) }}</div>
                                            <p class="mt-1 text-xs leading-5 text-[var(--talos-muted)]">{{ sourcePreview(source) }}</p>
                                        </article>
                                    </div>
                                </div>
                            </div>
                        </article>

                        <div v-if="sending" class="flex justify-start">
                            <div class="inline-flex items-center gap-2 rounded-2xl border border-[var(--talos-border)] bg-[var(--talos-panel)] px-4 py-3 text-sm text-[var(--talos-muted)]">
                                <Loader2 class="h-4 w-4 animate-spin text-[var(--talos-accent)]" />
                                Kadmos is processing
                            </div>
                        </div>
                    </div>
                </div>
            </section>
        </div>

        <footer class="pointer-events-none fixed inset-x-0 bottom-8 z-40 px-4 md:bottom-12 md:left-[248px] md:px-6">
            <Card class="talos-chat-composer-shell pointer-events-auto mx-auto w-full max-w-3xl border-[var(--talos-border-strong)] bg-[var(--talos-card)]/95 p-2 shadow-[0_24px_80px_rgba(0,0,0,0.38)] backdrop-blur" :padded="false">
                <div class="grid gap-2 p-2 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto_auto]">
                    <label class="sr-only" for="talos-model-profile">Server-side model profile</label>
                    <Select
                        id="talos-model-profile"
                        v-model="selectedModelProfileId"
                        :disabled="loadingModelProfiles || !modelProfiles.length"
                        aria-label="Server-side model profile"
                    >
                        <option value="">
                            {{ loadingModelProfiles ? 'Loading model profiles...' : modelProfiles.length ? 'Use dev-only browser key' : 'No server-side model profiles' }}
                        </option>
                        <option
                            v-for="profile in modelProfiles"
                            :key="profile.id"
                            :value="profile.id"
                            :disabled="profile.status === 'disabled' || !profile.has_secret"
                        >
                            {{ profile.display_name }} - {{ profile.model }} - {{ profile.status }}
                        </option>
                    </Select>

                    <label class="sr-only" for="talos-context-set">Grounding context set</label>
                    <Select
                        id="talos-context-set"
                        v-model="selectedContextSetId"
                        :disabled="loadingContextSets || !contextSets.length"
                        aria-label="Grounding context set"
                    >
                        <option value="">
                            {{ loadingContextSets ? 'Loading context sets...' : contextSets.length ? 'No grounding context' : 'No Context Vault sets' }}
                        </option>
                        <option
                            v-for="contextSet in contextSets"
                            :key="contextSet.id"
                            :value="contextSet.id"
                            :disabled="contextSet.status !== 'available' && contextSet.status !== 'draft'"
                        >
                            {{ contextSet.name }} - {{ contextSet.status }} - {{ contextSet.sources_count ?? contextSet.sources?.length ?? 0 }} sources
                        </option>
                    </Select>

                    <Button variant="secondary" size="icon" :disabled="loadingModelProfiles || loadingContextSets" aria-label="Sync model profiles and context sets" @click="() => { loadModelProfiles(); loadContextSets() }">
                        <Loader2 v-if="loadingModelProfiles || loadingContextSets" class="h-4 w-4 animate-spin" />
                        <RefreshCw v-else class="h-4 w-4" />
                    </Button>

                    <Button
                        v-if="!selectedModelProfileIsUsable && !settings.api_key"
                        variant="outline"
                        size="icon"
                        aria-label="Provider API key dev-only"
                        @click="saveSettings"
                    >
                        <KeyRound class="h-4 w-4" />
                    </Button>
                </div>

                <div v-if="!selectedModelProfileIsUsable && !settings.api_key" class="px-2 pb-2">
                    <Input
                        v-model="settings.api_key"
                        type="password"
                        placeholder="Provider API key - dev-only"
                        aria-label="Provider API key dev-only"
                    />
                </div>

                <Separator />

                <div class="p-2">
                    <Textarea
                        v-model="prompt"
                        rows="1"
                        class="max-h-36 min-h-12 border-0 bg-transparent px-2 py-2 shadow-none focus-visible:ring-0"
                        placeholder="Message TALOS..."
                        aria-label="Message TALOS"
                        :disabled="sending"
                        @keydown.enter.exact.prevent="sendChat"
                    />
                    <div class="flex items-center justify-between gap-3 px-1 pt-2">
                        <div class="min-w-0 truncate text-xs text-[var(--talos-muted)]">
                            {{ statusText }}
                        </div>
                        <Button size="sm" :disabled="!canSend" @click="sendChat">
                            <Send class="h-4 w-4" />
                            Send
                        </Button>
                    </div>
                    <div v-if="selectedContextSet" class="px-1 pt-1 text-xs text-[var(--talos-muted)]">
                        Grounding context set: {{ selectedContextSet.name }}. Uploaded content is injected server-side as untrusted data.
                    </div>
                </div>
            </Card>
        </footer>
    </main>
</template>
