<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import {
    Activity,
    Command,
    MessageSquare,
    Moon,
    ShieldCheck,
    Sun,
} from '@lucide/vue'
import Button from './ui/Button.vue'
import Badge from './ui/Badge.vue'
import Surface from './ui/Surface.vue'
import TalosBenchmarkWorkbench from './talos/benchmarks/TalosBenchmarkWorkbench.vue'
import TalosModelCenter from './talos/models/TalosModelCenter.vue'
import TalosContextVault from './talos/context/TalosContextVault.vue'
import TalosRunTimeline from './talos/runs/TalosRunTimeline.vue'
import TalosToolRegistry from './talos/tools/TalosToolRegistry.vue'
import TalosMemoryManager from './talos/memory/TalosMemoryManager.vue'
import TalosResearchWorkbench from './talos/research/TalosResearchWorkbench.vue'
import TalosDocuments from './talos/documents/TalosDocuments.vue'
import TalosArtifactGallery from './talos/documents/TalosArtifactGallery.vue'
import TalosNotes from './talos/productivity/TalosNotes.vue'
import TalosTasks from './talos/productivity/TalosTasks.vue'
import TalosCalendar from './talos/productivity/TalosCalendar.vue'
import TalosEmailTriage from './talos/email/TalosEmailTriage.vue'
import TalosDoctorPanel from './talos/admin/TalosDoctorPanel.vue'
import TalosAuditLog from './talos/admin/TalosAuditLog.vue'
import TalosPolicyPanel from './talos/admin/TalosPolicyPanel.vue'
import TalosBackupPanel from './talos/admin/TalosBackupPanel.vue'
import TalosCommandPalette from './talos/shell/TalosCommandPalette.vue'
import { talosCommands } from '../lib/commandRegistry'
import type { TalosCommand } from '../lib/talosTypes'

type Theme = 'dark' | 'light'

const theme = ref<Theme>('dark')
const adminToken = ref('')
const commandPaletteOpen = ref(false)
const commandFeedback = ref('')

const apiSurface = [
    '/api/talos/runs',
    '/api/talos/runs/{id}/events',
    '/api/files/ingest',
    '/api/benchmarks/compare',
    '/api/faults/explain',
    '/api/traces/replay',
    '/api/talos/connectors',
    '/api/talos/tools',
    '/api/talos/memories',
    '/api/talos/skills',
    '/api/talos/research-reports',
    '/api/talos/documents',
    '/api/talos/artifacts',
    '/api/talos/notes',
    '/api/talos/tasks',
    '/api/talos/calendar-drafts',
    '/api/talos/email/messages',
    '/api/talos/email/drafts',
    '/api/talos/admin/doctor',
    '/api/talos/admin/policy',
    '/api/talos/admin/audit-events',
    '/api/talos/admin/backup/manifest',
]

const shellClass = computed(() => theme.value === 'light' ? 'talos-light' : 'talos-dark')
const themeIcon = computed(() => theme.value === 'light' ? Moon : Sun)

function toggleTheme() {
    theme.value = theme.value === 'light' ? 'dark' : 'light'
    localStorage.setItem('talos_theme', theme.value)
}

function loadSettings() {
    const savedTheme = localStorage.getItem('talos_theme')
    if (savedTheme === 'light' || savedTheme === 'dark') {
        theme.value = savedTheme
    }
}

function openCommandPalette() {
    commandPaletteOpen.value = true
}

function closeCommandPalette() {
    commandPaletteOpen.value = false
}

function handleKeyboard(event: KeyboardEvent) {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        openCommandPalette()
        return
    }

    if (event.key === 'Escape' && commandPaletteOpen.value) {
        event.preventDefault()
        closeCommandPalette()
    }
}

function selectCommand(commandId: TalosCommand['id']) {
    const command = talosCommands.find((item) => item.id === commandId)
    commandFeedback.value = command ? `${command.label}: ${command.description}` : 'Command selected.'
    closeCommandPalette()
}

onMounted(() => {
    loadSettings()
    window.addEventListener('keydown', handleKeyboard)
})

onBeforeUnmount(() => {
    window.removeEventListener('keydown', handleKeyboard)
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

            <div class="mt-6 space-y-3">
                <div class="text-xs font-semibold uppercase text-[var(--talos-muted)]">Runtime availability</div>
                <div class="rounded-md border border-[var(--talos-border)] bg-[var(--talos-panel-soft)] p-3">
                    <div class="flex items-center justify-between gap-3">
                        <span class="text-sm text-[var(--talos-text)]">Benchmark workbench</span>
                        <Badge tone="neutral">api-backed</Badge>
                    </div>
                    <p class="mt-2 text-xs leading-5 text-[var(--talos-muted)]">
                        Benchmark evidence reads persisted groups and lane metrics from the TALOS control-plane APIs.
                    </p>
                </div>
                <div class="rounded-md border border-[var(--talos-border)] bg-[var(--talos-panel-soft)] p-3">
                    <div class="flex items-center justify-between gap-3">
                        <span class="text-sm text-[var(--talos-text)]">Run timeline</span>
                        <Badge tone="neutral">api-backed</Badge>
                    </div>
                    <p class="mt-2 text-xs leading-5 text-[var(--talos-muted)]">
                        Execution timelines read persisted runs and events from the TALOS control-plane APIs.
                    </p>
                </div>
            </div>
        </aside>

        <main class="xl:pl-[292px]">
            <header class="sticky top-0 z-20 border-b border-[var(--talos-border)] bg-[var(--talos-header)]/95 px-4 py-3 backdrop-blur md:px-6">
                <div class="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                    <div>
                        <div class="flex items-center gap-2 text-xs font-semibold uppercase text-[var(--talos-muted)]">
                            <Activity class="h-4 w-4 text-[var(--talos-accent)]" />
                            Talos dashboard
                        </div>
                        <h2 class="mt-1 text-xl font-semibold text-[var(--talos-text)] md:text-2xl">TALOS control cockpit</h2>
                    </div>
                    <div class="flex flex-wrap items-center gap-2">
                        <a
                            href="/chat"
                            class="inline-flex h-9 items-center gap-2 rounded-md border border-[var(--talos-border)] bg-[var(--talos-panel)] px-3 text-sm font-medium text-[var(--talos-text)] transition hover:border-[var(--talos-accent)] hover:text-[var(--talos-accent)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--talos-accent)]"
                        >
                            <MessageSquare class="h-4 w-4" />
                            Open persistent chat
                        </a>
                        <Button type="button" variant="secondary" size="sm" aria-label="Open command palette" @click="openCommandPalette">
                            <Command class="h-4 w-4" />
                            Commands
                        </Button>
                    </div>
                </div>
                <div v-if="commandFeedback" class="mt-3 rounded-md border border-[var(--talos-border)] bg-[var(--talos-panel-soft)] px-3 py-2 text-xs text-[var(--talos-muted)]">
                    {{ commandFeedback }}
                </div>
            </header>

            <div
                v-if="commandPaletteOpen"
                class="fixed inset-0 z-50 bg-black/40 px-4 py-16 backdrop-blur-sm"
                role="dialog"
                aria-modal="true"
                aria-label="TALOS command palette"
                @click.self="closeCommandPalette"
            >
                <div class="mx-auto w-full max-w-2xl">
                    <TalosCommandPalette :commands="talosCommands" @selected="selectCommand" />
                </div>
            </div>

            <div class="grid gap-4 p-4 md:p-6 2xl:grid-cols-[minmax(0,1fr)_392px]">
                <section class="min-w-0 space-y-4">
                    <Surface>
                        <div class="p-4">
                            <div class="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                                <div>
                                    <div class="flex items-center gap-2 text-xs font-semibold uppercase text-[var(--talos-muted)]">
                                        <MessageSquare class="h-4 w-4 text-[var(--talos-accent)]" />
                                        Dedicated chat surface
                                    </div>
                                    <h3 class="mt-1 text-base font-semibold text-[var(--talos-text)]">Persistent chat lives on `/chat`</h3>
                                    <p class="mt-1 max-w-3xl text-sm leading-6 text-[var(--talos-muted)]">
                                        This dashboard is the control cockpit for runs, replay, benchmarks, files, tools, memory, research, admin and audit. The chat route owns persisted sessions, server-side model profiles, grounding context, source provenance and benchmark-from-answer actions.
                                    </p>
                                </div>
                                <a
                                    href="/chat"
                                    class="inline-flex h-9 shrink-0 items-center justify-center gap-2 rounded-md border border-[var(--talos-border)] bg-[var(--talos-panel)] px-3 text-sm font-medium text-[var(--talos-text)] transition hover:border-[var(--talos-accent)] hover:text-[var(--talos-accent)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--talos-accent)]"
                                >
                                    <MessageSquare class="h-4 w-4" />
                                    Open persistent chat
                                </a>
                            </div>
                        </div>
                    </Surface>

                    <TalosRunTimeline />
                    <TalosResearchWorkbench />
                    <TalosEmailTriage />
                    <TalosAuditLog :token="adminToken" />
                </section>

                <aside class="min-w-0 space-y-4">
                    <TalosModelCenter />
                    <div class="rounded-md border border-[var(--talos-border)] bg-[var(--talos-panel-soft)] p-4">
                        <div class="text-xs font-semibold uppercase text-[var(--talos-muted)]">Admin token</div>
                        <input
                            v-model="adminToken"
                            type="password"
                            class="mt-2 h-9 w-full rounded-md border border-[var(--talos-border)] bg-[var(--talos-panel)] px-3 text-sm text-[var(--talos-text)] outline-none placeholder:text-[var(--talos-muted)] focus:border-[var(--talos-accent)]"
                            placeholder="X-Talos-Api-Token"
                            aria-label="TALOS admin API token"
                        >
                    </div>
                    <TalosDoctorPanel :token="adminToken" />
                    <TalosContextVault />
                    <TalosToolRegistry />
                    <TalosMemoryManager />
                    <TalosNotes />
                    <TalosTasks />
                    <TalosCalendar />
                    <TalosDocuments />
                    <TalosArtifactGallery />

                    <TalosBenchmarkWorkbench
                        compact
                        compare-endpoint="/api/benchmarks/compare"
                        groups-endpoint="/api/talos/benchmark-groups"
                        export-endpoint="/api/talos/benchmark-groups/{id}/export"
                        :default-runs="1"
                    />

                    <TalosPolicyPanel :token="adminToken" />
                    <TalosBackupPanel :token="adminToken" />

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
