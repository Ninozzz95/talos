<script setup lang="ts">
import { Command, Download, UserRound } from '@lucide/vue'
import Badge from '../../ui/Badge.vue'
import Button from '../../ui/Button.vue'
import Tooltip from '../../ui/Tooltip.vue'

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
    openAccount: []
}>()
</script>

<template>
    <header class="talos-workspace-header relative z-20 flex min-h-14 items-center justify-between gap-1 border-b border-[var(--talos-border)] bg-[var(--talos-header)]/88 px-2 backdrop-blur sm:gap-2 sm:px-3 md:px-5">
        <div class="min-w-0 flex-1">
            <div data-testid="talos-header-brand" class="flex min-w-0 items-center gap-2">
                <span class="talos-short-logo talos-short-logo-compact" aria-hidden="true">
                    <span class="talos-short-logo-mark"></span>
                </span>
                <h1 class="talos-orbitron-brand truncate text-base font-semibold text-[var(--talos-text)]">TALOS</h1>
            </div>
            <div class="mt-1 truncate text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--talos-muted)]">
                {{ workspaceSubtitle }}
            </div>
        </div>
        <div class="flex shrink-0 items-center gap-1 sm:gap-2">
            <div class="hidden max-w-[360px] truncate rounded-md border border-[var(--talos-border)] bg-[var(--talos-panel)] px-3 py-1.5 text-xs text-[var(--talos-muted)] md:block">
                {{ statusText }}
            </div>
            <Badge v-if="temporarySession" class="hidden sm:inline-flex" tone="warning">Temporary session</Badge>
            <Tooltip content="Commands" align="end">
                <template #default="{ describedBy }">
                    <Button type="button" variant="secondary" size="sm" class="w-11 px-0 md:h-8 md:min-h-8 md:w-auto md:px-3" aria-label="Open command palette" :aria-describedby="describedBy" @click="emit('openCommands')">
                        <Command class="h-4 w-4" />
                        <span class="hidden md:inline">Commands</span>
                    </Button>
                </template>
            </Tooltip>
            <Tooltip content="Export session" align="end">
                <template #default="{ describedBy }">
                    <Button type="button" variant="ghost" size="sm" class="w-11 px-0 md:h-8 md:min-h-8 md:w-auto md:px-3" aria-label="Export session" :aria-describedby="describedBy" :disabled="!hasActiveSession || exportingSession" @click="emit('openExport')">
                        <Download class="h-4 w-4" />
                        <span class="hidden md:inline">Export</span>
                    </Button>
                </template>
            </Tooltip>
            <Tooltip v-if="authenticated" content="Account settings" align="end">
                <template #default="{ describedBy }">
                    <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        class="md:hidden"
                        :aria-label="`Open account settings for ${authLabel}`"
                        :aria-describedby="describedBy"
                        @click="emit('openAccount')"
                    >
                        <UserRound class="h-4 w-4" />
                    </Button>
                </template>
            </Tooltip>
            <form v-if="authenticated" :action="logoutUrl" method="post" class="hidden items-center gap-2 md:flex" aria-label="TALOS account">
                <input type="hidden" name="_token" :value="csrfToken">
                <button
                    type="button"
                    class="max-w-32 cursor-pointer truncate rounded-md border border-[var(--talos-border)] bg-[var(--talos-panel)] px-2.5 py-1.5 text-xs text-[var(--talos-muted)] transition hover:border-[var(--talos-accent-border)] hover:bg-[var(--talos-panel-soft)] hover:text-[var(--talos-text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--talos-ring)]"
                    :aria-label="`Open account settings for ${authLabel}`"
                    @click="emit('openAccount')"
                >
                    {{ authLabel }}
                </button>
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
