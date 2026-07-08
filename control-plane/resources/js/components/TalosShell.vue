<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, type Component } from 'vue'
import {
    Activity,
    BarChart3,
    Command,
    Database,
    ListTodo,
    MessageSquare,
    Moon,
    Settings,
    ShieldCheck,
    Sun,
    Wrench,
} from '@lucide/vue'
import Button from './ui/Button.vue'
import Card from './ui/Card.vue'
import Input from './ui/Input.vue'
import ScrollArea from './ui/ScrollArea.vue'
import Separator from './ui/Separator.vue'
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
type DashboardTabId = 'runtime' | 'benchmarks' | 'knowledge' | 'agents' | 'productivity' | 'admin'
type DashboardTabGroup = {
    id: DashboardTabId
    label: string
    description: string
    icon: Component
    eyebrow: string
}

const theme = ref<Theme>('dark')
const adminToken = ref('')
const commandPaletteOpen = ref(false)
const commandFeedback = ref('')
const activeDashboardTab = ref<DashboardTabId>('runtime')

const dashboardTabGroups: DashboardTabGroup[] = [
    {
        id: 'runtime',
        label: 'Runtime',
        description: 'Runs, replay, recovery and execution state.',
        icon: Activity,
        eyebrow: 'DAG operations',
    },
    {
        id: 'benchmarks',
        label: 'Benchmarks',
        description: 'AVM ON/OFF evidence, exports and fairness checks.',
        icon: BarChart3,
        eyebrow: 'Evaluation',
    },
    {
        id: 'knowledge',
        label: 'Knowledge',
        description: 'Files, Context Vault, research, documents and artifacts.',
        icon: Database,
        eyebrow: 'Grounding',
    },
    {
        id: 'agents',
        label: 'Agents',
        description: 'Tools, memory and skill planning context.',
        icon: Wrench,
        eyebrow: 'Capabilities',
    },
    {
        id: 'productivity',
        label: 'Productivity',
        description: 'Notes, tasks, calendar drafts and email triage.',
        icon: ListTodo,
        eyebrow: 'Workflows',
    },
    {
        id: 'admin',
        label: 'Admin',
        description: 'Doctor, policy, audit and backup controls.',
        icon: Settings,
        eyebrow: 'Control plane',
    },
]

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
const activeDashboardTabGroup = computed(() => {
    return dashboardTabGroups.find((group) => group.id === activeDashboardTab.value) ?? dashboardTabGroups[0]
})

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

            <Separator class="my-5" />

            <nav class="space-y-1" aria-label="TALOS dashboard sections">
                <button
                    v-for="group in dashboardTabGroups"
                    :key="group.id"
                    type="button"
                    class="flex w-full items-start gap-3 rounded-md border px-3 py-3 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--talos-ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--talos-sidebar)]"
                    :class="activeDashboardTab === group.id
                        ? 'border-[var(--talos-accent-border)] bg-[var(--talos-accent-soft)] text-[var(--talos-text)]'
                        : 'border-transparent text-[var(--talos-muted)] hover:border-[var(--talos-border)] hover:bg-[var(--talos-panel-soft)] hover:text-[var(--talos-text)]'"
                    :aria-current="activeDashboardTab === group.id ? 'page' : undefined"
                    @click="activeDashboardTab = group.id"
                >
                    <component :is="group.icon" class="mt-0.5 h-4 w-4 shrink-0 text-[var(--talos-accent)]" />
                    <span class="min-w-0">
                        <span class="block text-sm font-medium">{{ group.label }}</span>
                        <span class="mt-1 block text-xs leading-5">{{ group.description }}</span>
                    </span>
                </button>
            </nav>
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
                        <p class="mt-1 text-sm text-[var(--talos-muted)]">
                            {{ activeDashboardTabGroup.eyebrow }} - {{ activeDashboardTabGroup.description }}
                        </p>
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
                <div class="mt-3 flex gap-2 overflow-x-auto pb-1 xl:hidden" role="tablist" aria-label="TALOS dashboard sections">
                    <button
                        v-for="group in dashboardTabGroups"
                        :key="group.id"
                        type="button"
                        role="tab"
                        class="inline-flex h-9 shrink-0 items-center gap-2 rounded-md border px-3 text-sm font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--talos-ring)]"
                        :class="activeDashboardTab === group.id
                            ? 'border-[var(--talos-accent-border)] bg-[var(--talos-accent-soft)] text-[var(--talos-text)]'
                            : 'border-[var(--talos-border)] bg-[var(--talos-card)] text-[var(--talos-muted)]'"
                        :aria-selected="activeDashboardTab === group.id"
                        @click="activeDashboardTab = group.id"
                    >
                        <component :is="group.icon" class="h-4 w-4" />
                        {{ group.label }}
                    </button>
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

            <div class="p-4 md:p-6">
                <Card class="mb-4" :padded="false">
                    <div class="flex flex-col gap-4 p-4 lg:flex-row lg:items-center lg:justify-between">
                        <div>
                            <div class="flex items-center gap-2 text-xs font-semibold uppercase text-[var(--talos-muted)]">
                                <component :is="activeDashboardTabGroup.icon" class="h-4 w-4 text-[var(--talos-accent)]" />
                                {{ activeDashboardTabGroup.eyebrow }}
                            </div>
                            <h3 class="mt-1 text-base font-semibold text-[var(--talos-text)]">{{ activeDashboardTabGroup.label }}</h3>
                            <p class="mt-1 max-w-3xl text-sm leading-6 text-[var(--talos-muted)]">
                                {{ activeDashboardTabGroup.description }}
                            </p>
                        </div>
                        <a
                            href="/chat"
                            class="inline-flex h-9 shrink-0 items-center justify-center gap-2 rounded-md border border-[var(--talos-border)] bg-[var(--talos-secondary)] px-3 text-sm font-medium text-[var(--talos-text)] transition hover:bg-[var(--talos-active)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--talos-ring)]"
                        >
                            <MessageSquare class="h-4 w-4" />
                            Open persistent chat
                        </a>
                    </div>
                </Card>

                <section class="min-w-0 space-y-4" role="tabpanel" :aria-label="activeDashboardTabGroup.label">
                    <template v-if="activeDashboardTab === 'runtime'">
                        <TalosRunTimeline />
                    </template>

                    <template v-else-if="activeDashboardTab === 'benchmarks'">
                        <TalosBenchmarkWorkbench
                            compare-endpoint="/api/benchmarks/compare"
                            groups-endpoint="/api/talos/benchmark-groups"
                            export-endpoint="/api/talos/benchmark-groups/{id}/export"
                            :default-runs="1"
                        />
                    </template>

                    <template v-else-if="activeDashboardTab === 'knowledge'">
                        <TalosContextVault />
                        <TalosResearchWorkbench />
                        <TalosDocuments />
                        <TalosArtifactGallery />
                    </template>

                    <template v-else-if="activeDashboardTab === 'agents'">
                        <TalosModelCenter />
                        <TalosToolRegistry />
                        <TalosMemoryManager />
                    </template>

                    <template v-else-if="activeDashboardTab === 'productivity'">
                        <TalosNotes />
                        <TalosTasks />
                        <TalosCalendar />
                        <TalosEmailTriage />
                    </template>

                    <template v-else>
                        <Card>
                            <div class="text-xs font-semibold uppercase text-[var(--talos-muted)]">Admin token</div>
                            <Input
                                v-model="adminToken"
                                type="password"
                                class="mt-2"
                                placeholder="X-Talos-Api-Token"
                                aria-label="TALOS admin API token"
                            />
                        </Card>
                        <TalosDoctorPanel :token="adminToken" />
                        <TalosPolicyPanel :token="adminToken" />
                        <TalosBackupPanel :token="adminToken" />
                        <TalosAuditLog :token="adminToken" />

                        <Surface>
                            <div class="border-b border-[var(--talos-border)] p-4">
                                <h3 class="text-base font-semibold text-[var(--talos-text)]">API surface</h3>
                            </div>
                            <ScrollArea class="max-h-[360px] p-4">
                                <div class="space-y-2">
                                    <div v-for="endpoint in apiSurface" :key="endpoint" class="rounded-md border border-[var(--talos-border)] bg-[var(--talos-panel-soft)] px-3 py-2 font-mono text-xs text-[var(--talos-muted)]">
                                        {{ endpoint }}
                                    </div>
                                </div>
                            </ScrollArea>
                        </Surface>
                    </template>
                </section>
            </div>
        </main>
    </div>
</template>
