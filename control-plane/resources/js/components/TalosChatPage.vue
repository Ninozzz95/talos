<script setup lang="ts">
import { computed, nextTick, onMounted, ref } from 'vue'
import { KeyRound, Loader2, MessageSquarePlus, Moon, Send, ShieldCheck, Sun } from '@lucide/vue'
import Button from './ui/Button.vue'
import Badge from './ui/Badge.vue'

type Theme = 'dark' | 'light'
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

const theme = ref<Theme>('dark')
const prompt = ref('')
const loading = ref(false)
const settingsSaved = ref(false)
const chatThreadEl = ref<HTMLElement | null>(null)
const messages = ref<ChatMessage[]>([])
const settings = ref<TalosSettings>({
    provider: 'deepseek',
    model: 'deepseek-chat',
    api_key: '',
    control_plane_url: 'http://127.0.0.1:8001',
})

const shellClass = computed(() => theme.value === 'light' ? 'talos-light' : 'talos-dark')
const themeIcon = computed(() => theme.value === 'light' ? Moon : Sun)
const canSend = computed(() => prompt.value.trim().length > 0 && !loading.value && settings.value.api_key.trim().length > 0)

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

function saveSettings() {
    localStorage.setItem('talos_settings', JSON.stringify(settings.value))
    settingsSaved.value = true
    window.setTimeout(() => {
        settingsSaved.value = false
    }, 1600)
}

function toggleTheme() {
    theme.value = theme.value === 'light' ? 'dark' : 'light'
    localStorage.setItem('talos_theme', theme.value)
}

function newChat() {
    messages.value = []
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

function summarizeJmp(mutations: unknown) {
    if (!Array.isArray(mutations) || mutations.length === 0) {
        return 'risposta diretta'
    }

    return mutations.slice(0, 3).map((mutation) => {
        if (!mutation || typeof mutation !== 'object') {
            return 'JMP'
        }

        const data = mutation as Record<string, unknown>
        const action = typeof data.action === 'string' ? data.action : 'JMP'
        const nodeId = typeof data.node_id === 'string' ? data.node_id : ''

        return nodeId ? `${action} ${nodeId}` : action
    }).join(' - ')
}

async function sendChat() {
    const message = prompt.value.trim()
    if (!message || loading.value) {
        return
    }

    if (!settings.value.api_key.trim()) {
        messages.value.push({
            role: 'system',
            label: 'Sistema',
            text: 'Salva una API key per usare la chat Kadmos reale.',
            meta: 'configurazione',
            ts: Date.now(),
        })
        await nextTick()
        scrollChat()
        return
    }

    messages.value.push({
        role: 'user',
        label: 'Tu',
        text: message,
        meta: 'Kadmos chat',
        ts: Date.now(),
    })
    prompt.value = ''
    loading.value = true
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
            messages.value.push({
                role: 'system',
                label: 'Sistema',
                text: data.error ?? 'Kadmos non ha completato la richiesta.',
                meta: response.ok ? 'validator error' : `HTTP ${response.status}`,
                ts: Date.now(),
            })
        } else {
            const mutations = Array.isArray(data.mutations) ? data.mutations : []
            messages.value.push({
                role: 'assistant',
                label: 'TALOS',
                text: data.text || 'Kadmos ha completato la richiesta.',
                meta: summarizeJmp(mutations),
                mutations,
                ts: Date.now(),
            })

            if (Array.isArray(data.errors) && data.errors.length > 0) {
                messages.value.push({
                    role: 'system',
                    label: 'Sistema',
                    text: data.errors.join('; '),
                    meta: 'validation fault',
                    ts: Date.now(),
                })
            }
        }
    } catch {
        messages.value.push({
            role: 'system',
            label: 'Sistema',
            text: 'Connection error: TALOS non ha raggiunto Kadmos.',
            meta: 'network',
            ts: Date.now(),
        })
    } finally {
        loading.value = false
        await nextTick()
        scrollChat()
    }
}

onMounted(() => {
    loadSettings()
})
</script>

<template>
    <main :class="['talos-shell flex min-h-screen flex-col', shellClass]">
        <header class="flex h-14 shrink-0 items-center justify-between border-b border-[var(--talos-border)] bg-[var(--talos-header)] px-4 md:px-6">
            <div class="flex items-center gap-3">
                <div class="inline-flex h-8 w-8 items-center justify-center rounded-md border border-[var(--talos-border)] bg-[var(--talos-panel)] text-[var(--talos-accent)]">
                    <ShieldCheck class="h-4 w-4" />
                </div>
                <div>
                    <div class="text-sm font-semibold text-[var(--talos-text)]">TALOS</div>
                    <div class="text-[11px] text-[var(--talos-muted)]">Kadmos chat</div>
                </div>
            </div>

            <div class="flex items-center gap-2">
                <Button variant="ghost" size="sm" @click="newChat">
                    <MessageSquarePlus class="h-4 w-4" />
                    New
                </Button>
                <button
                    type="button"
                    class="inline-flex h-8 w-8 items-center justify-center rounded-md border border-[var(--talos-border)] text-[var(--talos-muted)] transition hover:text-[var(--talos-text)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--talos-accent)]"
                    aria-label="Toggle theme"
                    @click="toggleTheme"
                >
                    <component :is="themeIcon" class="h-4 w-4" />
                </button>
            </div>
        </header>

        <section ref="chatThreadEl" class="flex-1 overflow-y-auto px-4 py-6 md:px-6">
            <div class="mx-auto flex min-h-full w-full max-w-[820px] flex-col">
                <div v-if="!messages.length" class="flex flex-1 flex-col items-center justify-center text-center">
                    <div class="inline-flex h-16 w-16 items-center justify-center rounded-2xl border border-[var(--talos-border)] bg-[var(--talos-panel)] text-[var(--talos-accent)]">
                        <ShieldCheck class="h-8 w-8" />
                    </div>
                    <h1 class="mt-6 text-2xl font-semibold text-[var(--talos-text)]">What workflow would you like to automate?</h1>
                    <p class="mt-3 max-w-[560px] text-sm leading-6 text-[var(--talos-muted)]">
                        Chat pulita, Kadmos reale. Scrivi il workflow: TALOS invia al motore e ti restituisce la risposta senza pannelli intorno.
                    </p>
                    <div class="mt-6 flex flex-wrap justify-center gap-2">
                        <button type="button" class="rounded-full border border-[var(--talos-border)] px-4 py-2 text-sm text-[var(--talos-muted)] transition hover:border-[var(--talos-accent)] hover:text-[var(--talos-accent)]" @click="prompt = 'Crea un workflow verificabile per controllare una API esterna.'">
                            Verifica API
                        </button>
                        <button type="button" class="rounded-full border border-[var(--talos-border)] px-4 py-2 text-sm text-[var(--talos-muted)] transition hover:border-[var(--talos-accent)] hover:text-[var(--talos-accent)]" @click="prompt = 'Analizza questi log e costruisci un piano replayable.'">
                            Analizza log
                        </button>
                        <button type="button" class="rounded-full border border-[var(--talos-border)] px-4 py-2 text-sm text-[var(--talos-muted)] transition hover:border-[var(--talos-accent)] hover:text-[var(--talos-accent)]" @click="prompt = 'Genera un DAG per leggere e validare un dataset CSV.'">
                            Genera DAG
                        </button>
                    </div>
                </div>

                <div v-else class="space-y-5">
                    <article
                        v-for="(message, index) in messages"
                        :key="message.ts + '-' + index"
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
                                <span class="font-semibold">{{ message.label }}</span>
                                <span>{{ message.meta }}</span>
                                <span>{{ formatTime(message.ts) }}</span>
                            </div>
                            <p class="whitespace-pre-wrap text-sm leading-6">{{ message.text }}</p>
                            <div v-if="message.role === 'assistant' && message.mutations?.length" class="mt-3 flex flex-wrap gap-2">
                                <Badge tone="success">{{ message.mutations.length }} JMP</Badge>
                                <Badge tone="neutral">Validated by Kadmos</Badge>
                            </div>
                        </div>
                    </article>

                    <div v-if="loading" class="flex justify-start">
                        <div class="inline-flex items-center gap-2 rounded-2xl border border-[var(--talos-border)] bg-[var(--talos-panel)] px-4 py-3 text-sm text-[var(--talos-muted)]">
                            <Loader2 class="h-4 w-4 animate-spin text-[var(--talos-accent)]" />
                            Kadmos sta elaborando...
                        </div>
                    </div>
                </div>
            </div>
        </section>

        <footer class="shrink-0 border-t border-[var(--talos-border)] bg-[var(--talos-header)] px-4 py-4 md:px-6">
            <div class="mx-auto w-full max-w-[820px]">
                <div v-if="!settings.api_key" class="mb-3 grid gap-2 rounded-md border border-[var(--talos-border)] bg-[var(--talos-panel-soft)] p-2 md:grid-cols-[28px_minmax(0,1fr)_110px]">
                    <div class="hidden h-9 items-center justify-center text-[var(--talos-muted)] md:flex">
                        <KeyRound class="h-4 w-4" />
                    </div>
                    <input
                        v-model="settings.api_key"
                        type="password"
                        class="h-9 rounded-md border border-[var(--talos-border)] bg-[var(--talos-panel)] px-3 text-sm text-[var(--talos-text)] outline-none placeholder:text-[var(--talos-muted)] focus:border-[var(--talos-accent)]"
                        placeholder="API key"
                        aria-label="Provider API key"
                    >
                    <Button variant="secondary" size="sm" @click="saveSettings">
                        {{ settingsSaved ? 'Saved' : 'Save' }}
                    </Button>
                </div>

                <div class="rounded-2xl border border-[var(--talos-border)] bg-[var(--talos-panel)] p-2 shadow-lg shadow-[var(--talos-shadow)] focus-within:border-[var(--talos-accent)]">
                    <textarea
                        v-model="prompt"
                        rows="1"
                        class="max-h-40 min-h-12 w-full resize-none border-0 bg-transparent px-3 py-3 text-sm leading-6 text-[var(--talos-text)] outline-none placeholder:text-[var(--talos-muted)]"
                        placeholder="Message Talos..."
                        aria-label="Message Talos"
                        :disabled="loading"
                        @keydown.enter.exact.prevent="sendChat"
                    />
                    <div class="flex items-center justify-between gap-3 px-2 pb-1">
                        <div class="text-xs text-[var(--talos-muted)]">
                            {{ settings.api_key ? 'Kadmos ready' : 'API key richiesta' }}
                        </div>
                        <Button size="sm" :disabled="!canSend" @click="sendChat">
                            <Send class="h-4 w-4" />
                            Send
                        </Button>
                    </div>
                </div>
            </div>
        </footer>
    </main>
</template>
