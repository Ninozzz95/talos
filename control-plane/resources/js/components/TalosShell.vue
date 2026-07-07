<script setup lang="ts">
import { computed, nextTick, onMounted, ref } from 'vue'
import {
    Activity,
    AlertTriangle,
    ArrowRight,
    CheckCircle2,
    ChevronDown,
    Clock3,
    Database,
    FileCode2,
    FileUp,
    GitBranch,
    Loader2,
    Moon,
    Play,
    RefreshCcw,
    Search,
    ShieldCheck,
    Sparkles,
    Sun,
    TerminalSquare,
} from '@lucide/vue'
import Button from './ui/Button.vue'
import Badge from './ui/Badge.vue'
import Surface from './ui/Surface.vue'

type Theme = 'dark' | 'light'
type ExecutionState = 'planning' | 'running' | 'success' | 'recalculating' | 'blocked'
type ChatMessage = {
    role: 'user' | 'assistant' | 'system'
    label: string
    text: string
    meta: string
    mutations?: unknown[]
    ts: number
}
type TalosSettings = {
    provider: string
    model: string
    api_key: string
    control_plane_url: string
}
type DagNode = {
    id: string
    type: string
    status: string
    result: string
}

const activeTab = ref<'chat' | 'context' | 'evidence' | 'sessions'>('chat')
const theme = ref<Theme>('dark')
const prompt = ref('Analizza i log caricati, trova le anomalie e produci un piano verificabile.')
const chatLoading = ref(false)
const settingsSaved = ref(false)
const chatThreadEl = ref<HTMLElement | null>(null)
const chatMessages = ref<ChatMessage[]>([])
const dagNodes = ref<DagNode[]>([])
const settings = ref<TalosSettings>({
    provider: 'deepseek',
    model: 'deepseek-chat',
    api_key: '',
    control_plane_url: 'http://127.0.0.1:8001',
})
const tabs: Array<typeof activeTab.value> = ['chat', 'context', 'evidence', 'sessions']

const contextSources = [
    { name: 'security-logs.csv', meta: '3.2M righe indicizzate', icon: Database, tone: 'success' },
    { name: 'backend-api', meta: '184 file sincronizzati', icon: FileCode2, tone: 'neutral' },
    { name: 'schema.sql', meta: '42 tabelle mappate', icon: GitBranch, tone: 'warning' },
]

const benchmarkRows = [
    { label: 'AVM ON', value: '96%', detail: 'aderenza al contratto', tone: 'success', bar: 'w-[96%]' },
    { label: 'AVM OFF Direct', value: '71%', detail: 'output non verificato', tone: 'danger', bar: 'w-[71%]' },
    { label: 'Tool Agent', value: '83%', detail: 'retry non deterministici', tone: 'warning', bar: 'w-[83%]' },
]

const glassBoxSteps: Array<{
    title: string
    state: ExecutionState
    text: string
    tech: string
    icon: typeof Search
}> = [
    {
        title: 'Strategia',
        state: 'planning',
        text: 'Pianificazione della strategia in corso...',
        tech: 'SPAWN_NODE',
        icon: GitBranch,
    },
    {
        title: 'Recupero',
        state: 'running',
        text: 'Ricerca e recupero delle informazioni esterne...',
        tech: 'HTTP_REQUEST + PENDING',
        icon: Search,
    },
    {
        title: 'Validazione',
        state: 'recalculating',
        text: 'Incongruenza rilevata. Il sistema sta ricalcolando il percorso ottimale...',
        tech: 'VALIDATION_FAULT',
        icon: RefreshCcw,
    },
    {
        title: 'Verifica',
        state: 'success',
        text: 'Operazione completata e verificata.',
        tech: 'NodeStatus: SUCCESS',
        icon: CheckCircle2,
    },
    {
        title: 'Dipendenza',
        state: 'blocked',
        text: 'In attesa del completamento dei calcoli precedenti.',
        tech: 'BLOCKED_BY_DEPENDENCY',
        icon: Clock3,
    },
]

const sessions = [
    { name: 'Refactoring backend', status: 'replayable', when: '12 min fa' },
    { name: 'Analisi log sicurezza', status: 'verified', when: 'ieri' },
    { name: 'Data quality audit', status: 'blocked', when: 'lunedi' },
]

const apiSurface = [
    '/api/files/ingest',
    '/api/benchmarks/compare',
    '/api/faults/explain',
    '/api/traces/replay',
]

const stateTone = (state: ExecutionState) => ({
    planning: 'neutral',
    running: 'neutral',
    success: 'success',
    recalculating: 'warning',
    blocked: 'neutral',
}[state])

const shellClass = computed(() => theme.value === 'light' ? 'talos-light' : 'talos-dark')
const themeIcon = computed(() => theme.value === 'light' ? Moon : Sun)
const canSendChat = computed(() => prompt.value.trim().length > 0 && !chatLoading.value && settings.value.api_key.trim().length > 0)

function toggleTheme() {
    theme.value = theme.value === 'light' ? 'dark' : 'light'
    localStorage.setItem('talos_theme', theme.value)
}

function saveSettings() {
    localStorage.setItem('talos_settings', JSON.stringify(settings.value))
    settingsSaved.value = true
    window.setTimeout(() => {
        settingsSaved.value = false
    }, 1800)
}

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

function newChat() {
    chatMessages.value = []
    dagNodes.value = []
    prompt.value = ''
    nextTick(() => scrollChat())
}

function scrollChat() {
    const el = chatThreadEl.value
    if (el) {
        el.scrollTop = el.scrollHeight
    }
}

function formatTime(ts: number) {
    return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

function parseDag(text: unknown): DagNode[] {
    if (typeof text !== 'string' || !text.trim()) {
        return []
    }

    return text.split('\n').flatMap((line) => {
        const match = line.match(/Node:\s*(\S+)\s*\|\s*Type:\s*(\S+)\s*\|\s*Status:\s*(\S+)/)
        if (!match) {
            return []
        }

        const result = line.match(/Result:\s*(.+)/)
        return [{
            id: match[1],
            type: match[2],
            status: match[3],
            result: result ? result[1].trim() : '',
        }]
    })
}

function summarizeJmp(mutations: unknown) {
    if (!Array.isArray(mutations) || mutations.length === 0) {
        return 'risposta diretta'
    }

    const summary = mutations.map((mutation) => {
        if (!mutation || typeof mutation !== 'object') {
            return 'mutation validata'
        }

        const data = mutation as Record<string, unknown>
        const action = typeof data.action === 'string' ? data.action : 'JMP'
        const nodeId = typeof data.node_id === 'string' ? data.node_id : null
        const nodeType = typeof data.node_type === 'string' ? data.node_type : null

        if (nodeId && nodeType) {
            return `${action} ${nodeId} (${nodeType})`
        }

        return action
    })

    return summary.slice(0, 3).join(' - ')
}

async function sendChat() {
    const message = prompt.value.trim()
    if (!message || chatLoading.value) {
        return
    }

    if (!settings.value.api_key.trim()) {
        chatMessages.value.push({
            role: 'system',
            label: 'Sistema',
            text: 'Inserisci e salva una API key per usare la chat Kadmos reale.',
            meta: 'settings richieste',
            ts: Date.now(),
        })
        await nextTick()
        scrollChat()
        return
    }

    chatMessages.value.push({
        role: 'user',
        label: 'Tu',
        text: message,
        meta: 'inviato a Kadmos',
        ts: Date.now(),
    })
    prompt.value = ''
    chatLoading.value = true
    await nextTick()
    scrollChat()

    try {
        const response = await fetch('/api/talos/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
            body: JSON.stringify({
                message,
                api_key: settings.value.api_key,
            }),
        })
        const data = await response.json()

        if (!response.ok || data.error) {
            chatMessages.value.push({
                role: 'system',
                label: 'Sistema',
                text: data.error ?? 'Errore durante la chiamata Kadmos.',
                meta: response.ok ? 'validator error' : `HTTP ${response.status}`,
                ts: Date.now(),
            })
        } else {
            const mutations = Array.isArray(data.mutations) ? data.mutations : []
            chatMessages.value.push({
                role: 'assistant',
                label: 'TALOS',
                text: data.text || 'Kadmos ha completato la richiesta senza testo di risposta.',
                meta: mutations.length ? summarizeJmp(mutations) : 'risposta diretta',
                mutations,
                ts: Date.now(),
            })

            const parsedDag = parseDag(data.dag)
            if (parsedDag.length > 0) {
                dagNodes.value = parsedDag
            }

            if (Array.isArray(data.errors) && data.errors.length > 0) {
                chatMessages.value.push({
                    role: 'system',
                    label: 'Sistema',
                    text: data.errors.join('; '),
                    meta: 'validation fault',
                    ts: Date.now(),
                })
            }
        }
    } catch {
        chatMessages.value.push({
            role: 'system',
            label: 'Sistema',
            text: 'Connection error: il proxy TALOS non ha raggiunto la chat Kadmos.',
            meta: 'network',
            ts: Date.now(),
        })
    } finally {
        chatLoading.value = false
        await nextTick()
        scrollChat()
    }
}

onMounted(() => {
    loadSettings()
})
</script>

<template>
    <div :class="['talos-shell min-h-screen', shellClass]">
        <aside class="fixed inset-y-0 left-0 hidden w-[292px] border-r border-[var(--talos-border)] bg-[var(--talos-sidebar)] p-4 xl:flex xl:flex-col">
            <div class="flex items-center justify-between">
                <div>
                    <div class="text-[11px] font-semibold uppercase text-[var(--talos-accent)]">Talos Glass Box</div>
                    <h1 class="mt-1 text-2xl font-semibold text-[var(--talos-text)]">Kadmos</h1>
                </div>
                <button
                    type="button"
                    class="inline-flex h-9 w-9 items-center justify-center rounded-md border border-[var(--talos-border)] text-[var(--talos-muted)] transition hover:text-[var(--talos-text)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--talos-accent)]"
                    aria-label="Toggle theme"
                    @click="toggleTheme"
                >
                    <component :is="themeIcon" class="h-4 w-4" />
                </button>
            </div>

            <div class="mt-6 rounded-md border border-[var(--talos-border)] bg-[var(--talos-panel-soft)] p-4">
                <div class="flex items-center gap-2 text-sm font-semibold text-[var(--talos-text)]">
                    <ShieldCheck class="h-4 w-4 text-[var(--talos-success)]" />
                    Glass Box
                </div>
                <p class="mt-3 text-sm leading-6 text-[var(--talos-muted)]">
                    TALOS pianifica, verifica e corregge ogni passaggio prima dell'esecuzione. L'utente vede il lavoro mentre accade; KADMOS mantiene il grafo deterministico.
                </p>
            </div>

            <nav class="mt-6 space-y-1">
                <button
                    v-for="tab in tabs"
                    :key="tab"
                    type="button"
                    class="flex h-10 w-full items-center justify-between rounded-md px-3 text-left text-sm font-medium capitalize transition"
                    :class="activeTab === tab ? 'bg-[var(--talos-active)] text-[var(--talos-text)]' : 'text-[var(--talos-muted)] hover:bg-[var(--talos-panel-soft)] hover:text-[var(--talos-text)]'"
                    @click="activeTab = tab"
                >
                    {{ tab }}
                    <ArrowRight v-if="activeTab === tab" class="h-4 w-4" />
                </button>
            </nav>

            <div class="mt-6 space-y-3">
                <div class="flex items-center justify-between text-xs font-semibold uppercase text-[var(--talos-muted)]">
                    <span>Benchmark</span>
                    <Badge tone="success">live</Badge>
                </div>
                <div v-for="row in benchmarkRows" :key="row.label" class="space-y-2">
                    <div class="flex items-center justify-between text-sm">
                        <span class="text-[var(--talos-text)]">{{ row.label }}</span>
                        <span class="font-semibold text-[var(--talos-text)]">{{ row.value }}</span>
                    </div>
                    <div class="h-2 overflow-hidden rounded-sm bg-[var(--talos-track)]">
                        <div
                            class="h-full rounded-sm"
                            :class="[row.bar, row.tone === 'success' && 'bg-[var(--talos-success)]', row.tone === 'danger' && 'bg-[var(--talos-danger)]', row.tone === 'warning' && 'bg-[var(--talos-warning)]']"
                        />
                    </div>
                </div>
            </div>

            <div class="mt-auto space-y-3 border-t border-[var(--talos-border)] pt-4">
                <div v-for="session in sessions" :key="session.name" class="flex items-center justify-between gap-3 text-sm">
                    <div class="min-w-0">
                        <div class="truncate text-[var(--talos-text)]">{{ session.name }}</div>
                        <div class="text-xs text-[var(--talos-muted)]">{{ session.when }}</div>
                    </div>
                    <Badge :tone="session.status === 'verified' ? 'success' : session.status === 'blocked' ? 'warning' : 'neutral'">
                        {{ session.status }}
                    </Badge>
                </div>
            </div>
        </aside>

        <main class="xl:pl-[292px]">
            <header class="sticky top-0 z-20 border-b border-[var(--talos-border)] bg-[var(--talos-header)]/95 px-4 py-3 backdrop-blur md:px-6">
                <div class="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                    <div>
                        <div class="flex items-center gap-2 text-xs font-semibold uppercase text-[var(--talos-muted)]">
                            <Activity class="h-4 w-4 text-[var(--talos-accent)]" />
                            Talos chat /dashboard
                        </div>
                        <h2 class="mt-1 text-xl font-semibold text-[var(--talos-text)] md:text-2xl">Chat with verified execution</h2>
                    </div>
                    <div class="flex flex-wrap items-center gap-2">
                        <Button variant="secondary" size="sm">
                            <TerminalSquare class="h-4 w-4" />
                            Kadmos CLI
                        </Button>
                        <Button variant="secondary" size="sm" @click="newChat">
                            <RefreshCcw class="h-4 w-4" />
                            New chat
                        </Button>
                        <Button variant="secondary" size="sm">
                            <FileUp class="h-4 w-4" />
                            Ingest file
                        </Button>
                        <Button size="sm">
                            <Play class="h-4 w-4" />
                            Run AVM comparison
                        </Button>
                    </div>
                </div>
            </header>

            <div class="grid gap-4 p-4 md:p-6 2xl:grid-cols-[minmax(0,1fr)_392px]">
                <section class="space-y-4">
                    <Surface>
                        <div class="grid gap-4 p-4 lg:grid-cols-[minmax(0,1fr)_300px]">
                            <label class="group flex min-h-[168px] cursor-pointer flex-col justify-between rounded-md border border-dashed border-[var(--talos-border-strong)] bg-[var(--talos-panel-soft)] p-4 transition hover:border-[var(--talos-accent)]">
                                <input type="file" class="sr-only" multiple>
                                <div>
                                    <div class="flex items-center gap-3">
                                        <span class="inline-flex h-10 w-10 items-center justify-center rounded-md bg-[var(--talos-accent-soft)] text-[var(--talos-accent)]">
                                            <FileUp class="h-5 w-5" />
                                        </span>
                                        <div>
                                            <div class="font-semibold text-[var(--talos-text)]">Dropzone massiva</div>
                                            <div class="text-sm text-[var(--talos-muted)]">Repository, CSV, log, dump SQL</div>
                                        </div>
                                    </div>
                                    <div class="mt-5 grid gap-2 sm:grid-cols-3">
                                        <div v-for="source in contextSources" :key="source.name" class="rounded-md border border-[var(--talos-border)] bg-[var(--talos-panel)] p-3">
                                            <component :is="source.icon" class="h-4 w-4 text-[var(--talos-accent)]" />
                                            <div class="mt-2 truncate text-sm font-medium text-[var(--talos-text)]">{{ source.name }}</div>
                                            <div class="mt-1 text-xs text-[var(--talos-muted)]">{{ source.meta }}</div>
                                        </div>
                                    </div>
                                </div>
                                <div class="mt-4 flex items-center justify-between text-xs text-[var(--talos-muted)]">
                                    <span>Indicizzazione pronta per /api/files/ingest</span>
                                    <ChevronDown class="h-4 w-4" />
                                </div>
                            </label>

                            <div class="rounded-md border border-[var(--talos-border)] bg-[var(--talos-panel-soft)] p-4">
                                <div class="text-sm font-semibold text-[var(--talos-text)]">Context health</div>
                                <div class="mt-4 space-y-4">
                                    <div>
                                        <div class="flex items-center justify-between text-sm">
                                            <span class="text-[var(--talos-muted)]">Coverage</span>
                                            <span class="font-medium text-[var(--talos-text)]">92%</span>
                                        </div>
                                        <div class="mt-2 h-2 rounded-sm bg-[var(--talos-track)]">
                                            <div class="h-full w-[92%] rounded-sm bg-[var(--talos-success)]" />
                                        </div>
                                    </div>
                                    <div>
                                        <div class="flex items-center justify-between text-sm">
                                            <span class="text-[var(--talos-muted)]">Resistenza errori</span>
                                            <span class="font-medium text-[var(--talos-text)]">88%</span>
                                        </div>
                                        <div class="mt-2 h-2 rounded-sm bg-[var(--talos-track)]">
                                            <div class="h-full w-[88%] rounded-sm bg-[var(--talos-accent)]" />
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </Surface>

                    <Surface>
                        <div class="border-b border-[var(--talos-border)] p-4">
                            <div class="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                                <div>
                                    <h3 class="text-base font-semibold text-[var(--talos-text)]">Chat conversation</h3>
                                    <p class="mt-1 text-sm text-[var(--talos-muted)]">La conversazione resta centrale; KADMOS mostra prove, replay e benchmark senza interrompere il flusso.</p>
                                </div>
                                <Badge tone="success">validator gate online</Badge>
                            </div>
                        </div>

                        <div class="grid gap-4 p-4 lg:grid-cols-[minmax(0,1fr)_280px]">
                            <div class="space-y-3">
                                <div ref="chatThreadEl" class="talos-chat-thread max-h-[560px] min-h-[420px] space-y-4 overflow-y-auto rounded-md border border-[var(--talos-border)] bg-[var(--talos-panel-soft)] p-4" aria-label="Chat conversation">
                                    <div v-if="!chatMessages.length" class="flex min-h-[360px] flex-col items-center justify-center px-4 text-center">
                                        <div class="inline-flex h-14 w-14 items-center justify-center rounded-md border border-[var(--talos-border)] bg-[var(--talos-panel)] text-[var(--talos-accent)]">
                                            <ShieldCheck class="h-7 w-7" />
                                        </div>
                                        <h4 class="mt-5 text-xl font-semibold text-[var(--talos-text)]">What workflow would you like to automate?</h4>
                                        <p class="mt-2 max-w-[520px] text-sm leading-6 text-[var(--talos-muted)]">
                                            La chat reale Kadmos ora vive qui: invii il prompt, il validator risponde, TALOS mostra messaggi e DAG senza uscire dalla dashboard unificata.
                                        </p>
                                        <div class="mt-5 flex flex-wrap justify-center gap-2">
                                            <button type="button" class="rounded-full border border-[var(--talos-border)] px-3 py-1.5 text-xs text-[var(--talos-muted)] transition hover:border-[var(--talos-accent)] hover:text-[var(--talos-accent)]" @click="prompt = 'Crea un workflow verificabile per controllare lo stato di una API esterna.'">
                                                Verifica una API
                                            </button>
                                            <button type="button" class="rounded-full border border-[var(--talos-border)] px-3 py-1.5 text-xs text-[var(--talos-muted)] transition hover:border-[var(--talos-accent)] hover:text-[var(--talos-accent)]" @click="prompt = 'Analizza questi log e identifica anomalie con passaggi replayable.'">
                                                Analizza log
                                            </button>
                                            <button type="button" class="rounded-full border border-[var(--talos-border)] px-3 py-1.5 text-xs text-[var(--talos-muted)] transition hover:border-[var(--talos-accent)] hover:text-[var(--talos-accent)]" @click="prompt = 'Genera un piano DAG per leggere, validare e sintetizzare un dataset CSV.'">
                                                Piano DAG
                                            </button>
                                        </div>
                                    </div>

                                    <article
                                        v-for="(message, index) in chatMessages"
                                        :key="message.ts + '-' + index"
                                        class="flex gap-3"
                                        :class="message.role === 'user' ? 'justify-end' : 'justify-start'"
                                    >
                                        <div
                                            class="max-w-[760px] rounded-md border p-4"
                                            :class="message.role === 'user'
                                                ? 'border-[var(--talos-border-strong)] bg-[var(--talos-user)] text-[var(--talos-user-text)]'
                                                : message.role === 'system'
                                                    ? 'border-[var(--talos-warning-border)] bg-[var(--talos-warning-soft)] text-[var(--talos-text)]'
                                                    : 'border-[var(--talos-border)] bg-[var(--talos-panel)] text-[var(--talos-text)]'"
                                        >
                                            <div class="mb-2 flex items-center justify-between gap-3">
                                                <span class="text-xs font-semibold uppercase">{{ message.label }}</span>
                                                <span class="text-[11px] opacity-70">{{ message.meta }} - {{ formatTime(message.ts) }}</span>
                                            </div>
                                            <p class="text-sm leading-6">{{ message.text }}</p>
                                            <div v-if="message.role === 'assistant'" class="mt-3 flex flex-wrap gap-2">
                                                <Badge tone="success">Operazione verificata</Badge>
                                                <Badge :tone="dagNodes.length ? 'success' : 'neutral'">DAG {{ dagNodes.length ? 'visibile' : 'non emesso' }}</Badge>
                                                <Badge tone="neutral">Evidence report</Badge>
                                                <Badge v-if="message.mutations?.length" tone="neutral">{{ message.mutations.length }} JMP</Badge>
                                            </div>
                                        </div>
                                    </article>

                                    <div v-if="chatLoading" class="flex justify-start">
                                        <div class="inline-flex items-center gap-2 rounded-md border border-[var(--talos-border)] bg-[var(--talos-panel)] px-4 py-3 text-sm text-[var(--talos-muted)]">
                                            <Loader2 class="h-4 w-4 animate-spin text-[var(--talos-accent)]" />
                                            Kadmos sta elaborando...
                                        </div>
                                    </div>
                                </div>

                                <div class="rounded-md border border-[var(--talos-border)] bg-[var(--talos-panel-soft)] p-4">
                                    <div class="flex items-start gap-3">
                                        <span class="mt-1 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-[var(--talos-user)] text-[var(--talos-user-text)]">N</span>
                                        <textarea
                                            v-model="prompt"
                                            @keydown.enter.exact.prevent="sendChat"
                                            class="min-h-[104px] w-full resize-none border-0 bg-transparent text-sm leading-6 text-[var(--talos-text)] outline-none"
                                            placeholder="Ask Talos"
                                            aria-label="Ask Talos"
                                            :disabled="chatLoading"
                                        />
                                    </div>
                                    <div class="mt-3 grid gap-2 border-t border-[var(--talos-border)] pt-3 md:grid-cols-[minmax(0,1fr)_120px]">
                                        <input
                                            v-model="settings.api_key"
                                            type="password"
                                            class="h-9 rounded-md border border-[var(--talos-border)] bg-[var(--talos-panel)] px-3 text-sm text-[var(--talos-text)] outline-none transition placeholder:text-[var(--talos-muted)] focus:border-[var(--talos-accent)]"
                                            placeholder="DeepSeek API key salvata da talos_settings"
                                            aria-label="Provider API key"
                                        >
                                        <Button variant="secondary" size="sm" @click="saveSettings">
                                            {{ settingsSaved ? 'Saved' : 'Save key' }}
                                        </Button>
                                    </div>
                                    <div class="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-[var(--talos-border)] pt-3">
                                        <div class="flex flex-wrap gap-2">
                                            <Badge tone="neutral">AVM ON</Badge>
                                            <Badge tone="neutral">Trace replay</Badge>
                                            <Badge :tone="settings.api_key ? 'success' : 'warning'">{{ settings.api_key ? 'Kadmos ready' : 'API key richiesta' }}</Badge>
                                        </div>
                                        <Button size="sm" :disabled="!canSendChat" @click="sendChat">
                                            <Sparkles class="h-4 w-4" />
                                            {{ chatLoading ? 'Executing' : 'Execute' }}
                                        </Button>
                                    </div>
                                </div>

                                <div class="overflow-hidden rounded-md border border-[var(--talos-border)]">
                                    <div v-for="(step, index) in glassBoxSteps" :key="step.tech" class="grid gap-3 border-b border-[var(--talos-border)] bg-[var(--talos-panel)] p-4 last:border-b-0 md:grid-cols-[44px_minmax(0,1fr)_150px]">
                                        <div class="flex h-9 w-9 items-center justify-center rounded-md bg-[var(--talos-panel-soft)] text-[var(--talos-accent)]">
                                            <Loader2 v-if="step.state === 'planning'" class="h-4 w-4 animate-spin" />
                                            <component :is="step.icon" v-else class="h-4 w-4" />
                                        </div>
                                        <div class="min-w-0">
                                            <div class="flex flex-wrap items-center gap-2">
                                                <span class="text-sm font-semibold text-[var(--talos-text)]">{{ index + 1 }}. {{ step.title }}</span>
                                                <Badge :tone="stateTone(step.state)">{{ step.state }}</Badge>
                                            </div>
                                            <p class="mt-1 text-sm leading-6 text-[var(--talos-muted)]">{{ step.text }}</p>
                                        </div>
                                        <div class="self-center rounded-sm border border-[var(--talos-border)] bg-[var(--talos-panel-soft)] px-2 py-1 font-mono text-[11px] text-[var(--talos-muted)]">
                                            {{ step.tech }}
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <div class="rounded-md border border-[var(--talos-border)] bg-[var(--talos-panel-soft)] p-4">
                                <div class="text-sm font-semibold text-[var(--talos-text)]">DAG from chat</div>
                                <div class="mt-4 overflow-hidden rounded-md border border-[var(--talos-border)]">
                                    <div class="grid grid-cols-[minmax(0,1fr)_92px] bg-[var(--talos-active)] px-3 py-2 text-xs font-semibold uppercase text-[var(--talos-muted)]">
                                        <span>node</span>
                                        <span>status</span>
                                    </div>
                                    <div v-if="!dagNodes.length" class="px-3 py-5 text-sm leading-6 text-[var(--talos-muted)]">
                                        Il prossimo workflow Kadmos mostrera qui i nodi reali prodotti dalla vecchia chat migrata nella dashboard unificata.
                                    </div>
                                    <div
                                        v-for="node in dagNodes"
                                        :key="node.id"
                                        class="grid grid-cols-[minmax(0,1fr)_92px] gap-3 border-t border-[var(--talos-border)] px-3 py-3 text-sm"
                                    >
                                        <div class="min-w-0">
                                            <div class="truncate font-mono text-xs text-[var(--talos-text)]">{{ node.id }}</div>
                                            <div class="mt-1 truncate text-xs text-[var(--talos-muted)]">{{ node.type }}</div>
                                            <div v-if="node.result" class="mt-1 line-clamp-2 text-xs text-[var(--talos-muted)]">{{ node.result }}</div>
                                        </div>
                                        <Badge :tone="node.status === 'SUCCESS' ? 'success' : node.status === 'FAILED' ? 'danger' : node.status === 'RUNNING' ? 'warning' : 'neutral'">
                                            {{ node.status }}
                                        </Badge>
                                    </div>
                                </div>
                                <Button class="mt-4 w-full" variant="secondary" size="sm">
                                    <Activity class="h-4 w-4" />
                                    Open evidence
                                </Button>
                            </div>
                        </div>
                    </Surface>
                </section>

                <aside class="space-y-4">
                    <Surface>
                        <div class="border-b border-[var(--talos-border)] p-4">
                            <h3 class="text-base font-semibold text-[var(--talos-text)]">AVM comparison</h3>
                            <p class="mt-1 text-sm text-[var(--talos-muted)]">Stesso scenario, stesso evaluator, governance diversa.</p>
                        </div>
                        <div class="divide-y divide-[var(--talos-border)]">
                            <div v-for="row in benchmarkRows" :key="row.label" class="p-4">
                                <div class="flex items-center justify-between">
                                    <Badge :tone="row.tone">{{ row.label }}</Badge>
                                    <span class="text-2xl font-semibold text-[var(--talos-text)]">{{ row.value }}</span>
                                </div>
                                <div class="mt-3 h-2 overflow-hidden rounded-sm bg-[var(--talos-track)]">
                                    <div
                                        class="h-full rounded-sm"
                                        :class="[row.bar, row.tone === 'success' && 'bg-[var(--talos-success)]', row.tone === 'danger' && 'bg-[var(--talos-danger)]', row.tone === 'warning' && 'bg-[var(--talos-warning)]']"
                                    />
                                </div>
                                <div class="mt-2 text-sm text-[var(--talos-muted)]">{{ row.detail }}</div>
                            </div>
                        </div>
                    </Surface>

                    <Surface>
                        <div class="border-b border-[var(--talos-border)] p-4">
                            <h3 class="text-base font-semibold text-[var(--talos-text)]">Failure policy</h3>
                        </div>
                        <div class="space-y-3 p-4">
                            <div class="rounded-md border border-[var(--talos-warning-border)] bg-[var(--talos-warning-soft)] p-3">
                                <div class="flex items-center gap-2 text-sm font-semibold text-[var(--talos-text)]">
                                    <AlertTriangle class="h-4 w-4 text-[var(--talos-warning)]" />
                                    Elaborazione protetta
                                </div>
                                <p class="mt-2 text-sm leading-6 text-[var(--talos-muted)]">
                                    L'elaborazione viene interrotta quando un ramo mette a rischio l'integrita dei dati.
                                </p>
                            </div>
                            <div class="font-mono text-xs text-[var(--talos-muted)]">
                                HMI-first -> retry controllato -> replay verificabile
                            </div>
                        </div>
                    </Surface>

                    <Surface>
                        <div class="border-b border-[var(--talos-border)] p-4">
                            <h3 class="text-base font-semibold text-[var(--talos-text)]">API surface</h3>
                        </div>
                        <div class="space-y-2 p-4">
                            <div v-for="endpoint in apiSurface" :key="endpoint" class="rounded-sm border border-[var(--talos-border)] bg-[var(--talos-panel-soft)] px-3 py-2 font-mono text-xs text-[var(--talos-muted)]">
                                {{ endpoint }}
                            </div>
                        </div>
                    </Surface>
                </aside>
            </div>
        </main>
    </div>
</template>
