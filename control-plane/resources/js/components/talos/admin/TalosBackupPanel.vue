<script setup lang="ts">
import { computed, ref } from 'vue'
import { AlertCircle, Archive, Loader2, ShieldCheck } from '@lucide/vue'
import Button from '../../ui/Button.vue'
import Badge from '../../ui/Badge.vue'
import TalosGuideInfoButton from '../guide/TalosGuideInfoButton.vue'
import Surface from '../../ui/Surface.vue'
import { useTalosAdmin } from '../../../composables/useTalosAdmin'
import { resolveTalosCollectionState } from '../../../lib/talosCollectionState'

const props = defineProps<{
    token: string
}>()

const {
    backupManifest,
    restoreValidation,
    loadingAdmin,
    adminError,
    loadBackupManifest,
    validateRestore,
} = useTalosAdmin()

const localError = ref<string | null>(null)
const manifestRequested = ref(false)
const visibleError = computed(() => localError.value || adminError.value)
const manifestState = computed(() => resolveTalosCollectionState({
    itemCount: backupManifest.value ? 1 : 0,
    loading: loadingAdmin.value,
    error: visibleError.value,
    requested: manifestRequested.value,
}))

async function refreshManifest() {
    manifestRequested.value = true
    localError.value = null

    try {
        await loadBackupManifest(props.token)
    } catch (error) {
        localError.value = error instanceof Error ? error.message : 'TALOS could not load backup manifest.'
    }
}

async function validateDryRun() {
    if (!backupManifest.value) {
        return
    }

    localError.value = null

    try {
        await validateRestore(props.token, backupManifest.value)
    } catch (error) {
        localError.value = error instanceof Error ? error.message : 'TALOS could not validate restore manifest.'
    }
}
</script>

<template>
    <Surface>
        <div class="border-b border-[var(--talos-border)] p-4">
            <div class="flex items-start justify-between gap-3">
                <div>
                    <div class="flex items-center gap-2 text-xs font-semibold uppercase text-[var(--talos-muted)]">
                        <Archive class="h-4 w-4 text-[var(--talos-accent)]" />
                        Backup
                    </div>
                    <div class="mt-1 flex items-center gap-1.5">
                        <h3 class="text-base font-semibold text-[var(--talos-text)]">Dry-run restore policy</h3>
                        <TalosGuideInfoButton guide-id="doctor.backup" compact side="bottom" />
                    </div>
                </div>
                <Button type="button" variant="ghost" size="sm" aria-label="Load backup manifest" title="Load backup manifest" :disabled="loadingAdmin || !token" @click="refreshManifest">
                    <Loader2 v-if="loadingAdmin" class="h-4 w-4 animate-spin" />
                    <Archive v-else class="h-4 w-4" />
                </Button>
            </div>
        </div>

        <div class="space-y-3 p-4">
            <div v-if="visibleError" class="flex items-start gap-2 rounded-md border border-[var(--talos-warning-border)] bg-[var(--talos-warning-soft)] px-3 py-2 text-sm leading-6 text-[var(--talos-text)]">
                <AlertCircle class="mt-1 h-4 w-4 shrink-0 text-[var(--talos-warning)]" />
                <span>{{ visibleError }}</span>
            </div>

            <div v-if="manifestState === 'loading'" role="status" class="flex items-center gap-2 rounded-md border border-[var(--talos-border)] bg-[var(--talos-panel-soft)] px-3 py-4 text-sm text-[var(--talos-muted)]">
                <Loader2 class="h-4 w-4 animate-spin text-[var(--talos-accent)]" />
                Loading backup manifest
            </div>

            <div v-if="manifestState === 'idle'" class="rounded-md border border-[var(--talos-border)] bg-[var(--talos-panel-soft)] px-3 py-4 text-sm leading-6 text-[var(--talos-muted)]">
                Enter an admin token and load the persisted backup manifest.
            </div>

            <div v-if="manifestState === 'empty'" class="rounded-md border border-[var(--talos-border)] bg-[var(--talos-panel-soft)] px-3 py-4 text-sm leading-6 text-[var(--talos-muted)]">
                The backup endpoint returned no manifest. Retry and inspect Audit if it repeats.
            </div>

            <div v-if="manifestState === 'ready'" class="flex flex-wrap gap-2">
                <Badge tone="neutral">{{ backupManifest?.schema_version }}</Badge>
                <Badge tone="warning">dry_run_required {{ backupManifest?.restore_policy.dry_run_required }}</Badge>
            </div>

            <div v-if="manifestState === 'ready'" class="max-h-[180px] overflow-auto rounded-md border border-[var(--talos-border)] bg-[var(--talos-panel-soft)] p-3">
                <div class="flex flex-wrap gap-2">
                    <Badge v-for="(_, domain) in backupManifest.domains" :key="domain" tone="neutral">{{ domain }}</Badge>
                </div>
            </div>

            <Button type="button" size="sm" class="w-full" :disabled="!backupManifest || loadingAdmin" @click="validateDryRun">
                <Loader2 v-if="loadingAdmin" class="h-4 w-4 animate-spin" />
                <ShieldCheck v-else class="h-4 w-4" />
                Validate restore dry-run
            </Button>

            <div v-if="restoreValidation" class="rounded-md border border-[var(--talos-success-border)] bg-[var(--talos-success-soft)] px-3 py-2 text-sm leading-6 text-[var(--talos-text)]">
                Restore validation compatible: {{ restoreValidation.compatible }}
            </div>
        </div>
    </Surface>
</template>
