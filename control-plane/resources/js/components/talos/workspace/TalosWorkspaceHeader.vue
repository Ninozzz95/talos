<script setup lang="ts">
import { Command, Download } from '@lucide/vue'
import Badge from '../../ui/Badge.vue'
import Button from '../../ui/Button.vue'

const props = defineProps<{
    logoUrl: string
    workspaceSubtitle: string
    statusText: string
    temporarySession: boolean
    hasActiveSession: boolean
    exportingSession: boolean
    authenticated: boolean
    authLabel: string
    loginUrl: string
    logoutUrl: string
    csrfToken: string
}>()

const emit = defineEmits<{
    openCommands: []
    openExport: []
}>()
</script>

<template>
    <header class="relative z-20 flex min-h-14 items-center justify-between gap-3 border-b border-[var(--talos-border)] bg-[var(--talos-header)]/88 px-4 backdrop-blur md:px-5">
        <div class="min-w-0">
            <div data-testid="talos-header-brand" class="flex min-w-0 items-center gap-2">
                <span class="talos-short-logo talos-short-logo-compact" aria-hidden="true">
                    <img :src="logoUrl" alt="TALOS short logo" class="h-full w-full object-cover">
                </span>
                <h1 class="talos-orbitron-brand truncate text-base font-semibold text-[var(--talos-text)]">TALOS</h1>
            </div>
            <div class="mt-1 truncate text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--talos-muted)]">
                {{ workspaceSubtitle }}
            </div>
        </div>
        <div class="flex min-w-0 items-center gap-2">
            <div class="hidden max-w-[360px] truncate rounded-md border border-[var(--talos-border)] bg-[var(--talos-panel)] px-3 py-1.5 text-xs text-[var(--talos-muted)] md:block">
                {{ statusText }}
            </div>
            <Badge v-if="temporarySession" tone="warning">Temporary session</Badge>
            <Button type="button" variant="secondary" size="sm" aria-label="Open command palette" @click="emit('openCommands')">
                <Command class="h-4 w-4" />
                Commands
            </Button>
            <Button type="button" variant="ghost" size="sm" aria-label="Export session" :disabled="!hasActiveSession || exportingSession" @click="emit('openExport')">
                <Download class="h-4 w-4" />
                Export
            </Button>
            <form v-if="authenticated" :action="logoutUrl" method="post" class="hidden items-center gap-2 md:flex" aria-label="TALOS account">
                <input type="hidden" name="_token" :value="csrfToken">
                <span class="max-w-32 truncate rounded-md border border-[var(--talos-border)] bg-[var(--talos-panel)] px-2.5 py-1.5 text-xs text-[var(--talos-muted)]">
                    {{ authLabel }}
                </span>
                <Button type="submit" variant="ghost" size="sm">Sign out</Button>
            </form>
            <a
                v-else
                :href="loginUrl"
                class="hidden h-8 items-center justify-center rounded-md border border-[var(--talos-border)] bg-[var(--talos-secondary)] px-3 text-sm font-medium text-[var(--talos-text)] transition hover:bg-[var(--talos-active)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--talos-ring)] md:inline-flex"
            >
                Sign in
            </a>
        </div>
    </header>
</template>
