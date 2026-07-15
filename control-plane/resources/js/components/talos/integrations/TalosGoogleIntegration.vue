<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { AlertCircle, CheckCircle2, ExternalLink, Loader2, RefreshCw, Unplug } from '@lucide/vue'
import Badge from '../../ui/Badge.vue'
import Button from '../../ui/Button.vue'
import { useTalosGoogle } from '../../../composables/useTalosGoogle'
import { resolveTalosCollectionState } from '../../../lib/talosCollectionState'
import type { TalosGoogleAccount } from '../../../lib/talosTypes'

type BadgeTone = 'success' | 'danger' | 'warning' | 'neutral'

const {
    accounts,
    loading,
    actionMessage,
    errorMessage,
    loadAccounts,
    disconnectAccount,
} = useTalosGoogle()

const googleAccounts = computed(() => accounts.value.filter((account) => account.provider === 'google'))
const accountsRequested = ref(false)
const accountsState = computed(() => resolveTalosCollectionState({
    itemCount: googleAccounts.value.length,
    loading: loading.value,
    error: errorMessage.value,
    requested: accountsRequested.value,
}))

function statusTone(status: string): BadgeTone {
    if (status === 'connected') {
        return 'success'
    }

    if (status === 'revoked') {
        return 'danger'
    }

    if (status === 'error') {
        return 'warning'
    }

    return 'neutral'
}

function scopeLabel(scope: string) {
    if (scope.endsWith('/drive.file')) {
        return 'Drive file access'
    }

    if (scope.endsWith('/calendar.events.readonly')) {
        return 'Calendar read'
    }

    if (scope.endsWith('/calendar.events') || scope.endsWith('/calendar')) {
        return 'Calendar write'
    }

    return scope.replace('https://www.googleapis.com/auth/', '')
}

function formatDate(value?: string | null) {
    if (!value) {
        return 'Not synced yet'
    }

    return new Date(value).toLocaleString([], {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
    })
}

async function refreshAccounts() {
    accountsRequested.value = true
    await loadAccounts().catch(() => null)
}

async function revoke(account: TalosGoogleAccount) {
    await disconnectAccount(account.id).catch(() => null)
}

onMounted(() => {
    void refreshAccounts()
})
</script>

<template>
    <section class="rounded-md border border-[var(--talos-border)] bg-[var(--talos-panel-soft)] p-3">
        <div class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
                <div class="text-sm font-semibold text-[var(--talos-text)]">Google Workspace</div>
                <p class="mt-1 text-xs leading-5 text-[var(--talos-muted)]">
                    OAuth is handled by Laravel. TALOS only displays account capability and sync state here.
                </p>
            </div>
            <div class="flex flex-wrap items-center gap-2">
                <a
                    href="/integrations/google/redirect"
                    class="inline-flex h-8 items-center justify-center gap-2 rounded-md border border-[var(--talos-accent-border)] bg-[var(--talos-accent)] px-3 text-sm font-medium text-[var(--talos-accent-text)] shadow-sm transition hover:bg-[var(--talos-accent-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--talos-ring)]"
                >
                    <ExternalLink class="h-4 w-4" />
                    Connect Google
                </a>
                <Button type="button" size="sm" variant="secondary" :disabled="loading" @click="refreshAccounts">
                    <Loader2 v-if="loading" class="h-4 w-4 animate-spin" />
                    <RefreshCw v-else class="h-4 w-4" />
                    Refresh
                </Button>
            </div>
        </div>

        <div v-if="errorMessage" class="mt-3 flex items-start gap-2 rounded-md border border-[var(--talos-warning-border)] bg-[var(--talos-warning-soft)] px-3 py-2 text-sm leading-6 text-[var(--talos-text)]">
            <AlertCircle class="mt-1 h-4 w-4 shrink-0 text-[var(--talos-warning)]" />
            <span>{{ errorMessage }}</span>
        </div>
        <div v-if="actionMessage" class="mt-3 flex items-start gap-2 rounded-md border border-[var(--talos-success-border)] bg-[var(--talos-success-soft)] px-3 py-2 text-sm leading-6 text-[var(--talos-text)]">
            <CheckCircle2 class="mt-1 h-4 w-4 shrink-0 text-[var(--talos-success)]" />
            <span>{{ actionMessage }}</span>
        </div>

         <div v-if="accountsState === 'loading'" role="status" class="mt-3 flex items-center gap-2 rounded-md border border-[var(--talos-border)] bg-[var(--talos-panel)] px-3 py-3 text-sm text-[var(--talos-muted)]">
            <Loader2 class="h-4 w-4 animate-spin text-[var(--talos-accent)]" />
            Loading Google accounts
        </div>

         <div v-else-if="accountsState === 'empty'" class="mt-3 rounded-md border border-[var(--talos-border)] bg-[var(--talos-panel)] px-3 py-4 text-sm leading-6 text-[var(--talos-muted)]">
            No connected Google account returned by `/api/talos/google/accounts`.
        </div>

         <div v-else-if="accountsState === 'ready'" class="mt-3 grid gap-2">
            <article v-for="account in googleAccounts" :key="account.id" class="rounded-md border border-[var(--talos-border)] bg-[var(--talos-panel)] p-3">
                <div class="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                    <div class="min-w-0">
                        <div class="flex flex-wrap items-center gap-2">
                            <span class="truncate text-sm font-semibold text-[var(--talos-text)]">{{ account.email ?? account.display_name ?? account.provider_account_id }}</span>
                            <Badge :tone="statusTone(account.status)">{{ account.status }}</Badge>
                        </div>
                        <div v-if="account.display_name" class="mt-1 text-xs text-[var(--talos-muted)]">{{ account.display_name }}</div>
                        <div class="mt-1 text-xs text-[var(--talos-muted)]">Last sync {{ formatDate(account.last_used_at) }}</div>
                        <div v-if="account.last_error" class="mt-2 text-xs leading-5 text-[var(--talos-warning)]">{{ account.last_error }}</div>
                    </div>
                    <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        :disabled="loading || account.status !== 'connected'"
                        @click="revoke(account)"
                    >
                        <Unplug class="h-4 w-4" />
                        Disconnect
                    </Button>
                </div>
                <div class="mt-3 flex flex-wrap gap-2">
                    <Badge v-for="scope in account.scopes" :key="scope" tone="neutral">{{ scopeLabel(scope) }}</Badge>
                    <Badge v-if="!account.scopes.length" tone="warning">No scopes returned</Badge>
                </div>
            </article>
        </div>
    </section>
</template>
