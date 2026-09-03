<script setup lang="ts">
/**
 * ⛔ Owner 2026-08-27 — Tool Forge Fase 6, foglio di dettaglio: storia
 * delle versioni + rollback + registro immutabile + eliminazione. Un solo
 * foglio, non tre, perché sono la stessa domanda ("cosa è successo a
 * questo tool, e posso tornare indietro?") vista da tre angoli.
 */
import { computed, onMounted, ref } from 'vue'
import { useTalosI18n } from '@/i18n'
import { Button } from '@/components/ui/button'
import TalosMobileComposerSheet from '@/components/chat/TalosMobileComposerSheet.vue'
import TalosMobileConfirmDialog from '@/components/shell/TalosMobileConfirmDialog.vue'
import {
    listForgeAudit, removeForgeTool, rollbackForgeTool,
    type ForgeAuditEntry, type ForgeInstalledRecord,
} from '@/lib/tools/dynamic/forgeRegistryRepository'
import { validateTalosLocalTool } from '@/lib/tools/dynamic/validator'

const props = defineProps<{ record: ForgeInstalledRecord }>()
const emit = defineEmits<{ close: []; 'rolled-back': [version: number]; deleted: [] }>()

const { t } = useTalosI18n()

const audit = ref<ForgeAuditEntry[]>([])
const auditError = ref<string | null>(null)
const auditLoading = ref(true)
const busy = ref(false)
const error = ref<string | null>(null)
const rollbackConfirmOpen = ref(false)
const deleteConfirmOpen = ref(false)

const risk = computed(() => validateTalosLocalTool(props.record.manifest).risk)
const previousVersion = computed(() => {
    const versions = props.record.previousVersions
    return versions.length ? versions[versions.length - 1] : null
})

function describeError(cause: unknown): string {
    return cause instanceof Error && cause.message ? cause.message : String(cause)
}

function formatAt(value: string): string {
    const date = new Date(value)
    return Number.isNaN(date.getTime()) ? value : date.toLocaleString()
}

onMounted(async () => {
    try {
        audit.value = await listForgeAudit(props.record.manifest.id)
    } catch (cause) {
        auditError.value = describeError(cause)
    } finally {
        auditLoading.value = false
    }
})

async function confirmRollback(): Promise<void> {
    rollbackConfirmOpen.value = false
    if (!previousVersion.value) return
    busy.value = true
    error.value = null
    try {
        await rollbackForgeTool(props.record.manifest.id)
        emit('rolled-back', previousVersion.value.version)
    } catch (cause) {
        error.value = describeError(cause)
        busy.value = false
    }
}

async function confirmDelete(): Promise<void> {
    deleteConfirmOpen.value = false
    busy.value = true
    error.value = null
    try {
        await removeForgeTool(props.record.manifest.id)
        emit('deleted')
    } catch (cause) {
        error.value = describeError(cause)
        busy.value = false
    }
}
</script>

<template>
    <TalosMobileComposerSheet :title="record.manifest.title" testid="talos-tool-forge-detail-sheet" @close="emit('close')">
        <p class="text-sm leading-5 text-[var(--talos-muted)]">{{ record.manifest.description }}</p>
        <p class="mt-1 font-mono text-2xs text-[var(--talos-muted)]">
            {{ record.manifest.id }} · {{ t('toolForge.versionLabel', { version: record.manifest.version }) }}
        </p>
        <p class="mt-2 text-xs leading-5 text-[var(--talos-muted)]" data-testid="talos-tool-forge-detail-risk">
            {{ t(`chat.plan.risk.${risk}`) }}
        </p>

        <p v-if="error" role="alert" class="mt-2 text-xs text-[var(--talos-danger,#dc5b5b)]">{{ error }}</p>

        <!-- Rollback: solo se esiste una versione precedente da cui tornare. -->
        <section class="mt-4">
            <h3 class="text-xs font-semibold uppercase tracking-wide text-[var(--talos-muted)]">{{ t('toolForge.rollbackAction') }}</h3>
            <p v-if="!previousVersion" class="mt-1 text-xs text-[var(--talos-muted)]" data-testid="talos-tool-forge-no-rollback">
                {{ t('toolForge.noHistory') }}
            </p>
            <template v-else>
                <p class="mt-1 text-xs text-[var(--talos-muted)]">
                    {{ t('toolForge.versionLabel', { version: previousVersion.version }) }}
                </p>
                <Button
                    type="button"
                    variant="outline"
                    class="mt-2 rounded-full"
                    data-testid="talos-tool-forge-rollback-cta"
                    :disabled="busy"
                    @click="rollbackConfirmOpen = true"
                >
                    {{ t('toolForge.rollbackCta') }}
                </Button>
            </template>
        </section>

        <!-- Registro: append-only, per costruzione (talos_forge_audit). -->
        <section class="mt-4">
            <h3 class="text-xs font-semibold uppercase tracking-wide text-[var(--talos-muted)]">{{ t('toolForge.auditHeading') }}</h3>
            <p v-if="auditLoading" class="mt-1 text-xs text-[var(--talos-muted)]">{{ t('common.loading') }}</p>
            <p v-else-if="auditError" role="alert" class="mt-1 text-xs text-[var(--talos-danger,#dc5b5b)]">{{ auditError }}</p>
            <p v-else-if="!audit.length" class="mt-1 text-xs text-[var(--talos-muted)]" data-testid="talos-tool-forge-no-audit">
                {{ t('toolForge.noAudit') }}
            </p>
            <ul v-else class="mt-1.5 flex flex-col gap-1.5" data-testid="talos-tool-forge-audit-list">
                <li v-for="(entry, index) in audit" :key="index" class="flex items-baseline justify-between gap-2 text-xs">
                    <span class="text-[var(--talos-text)]">{{ t(`toolForge.audit.${entry.kind}`) }}</span>
                    <span class="shrink-0 text-[var(--talos-muted)]">{{ formatAt(entry.at) }}</span>
                </li>
            </ul>
        </section>

        <Button
            type="button"
            variant="destructive"
            data-testid="talos-tool-forge-detail-delete"
            class="mt-4 w-full"
            :disabled="busy"
            @click="deleteConfirmOpen = true"
        >
            {{ t('common.delete') }}
        </Button>

        <TalosMobileConfirmDialog
            v-if="rollbackConfirmOpen"
            :title="t('toolForge.rollbackConfirmTitle', { title: record.manifest.title, version: previousVersion?.version ?? 0 })"
            :description="t('toolForge.rollbackConfirmBody')"
            @close="rollbackConfirmOpen = false"
        >
            <div class="flex justify-end gap-2 pt-2">
                <Button type="button" variant="ghost" @click="rollbackConfirmOpen = false">{{ t('common.cancel') }}</Button>
                <Button type="button" data-testid="talos-tool-forge-rollback-confirm" @click="confirmRollback">{{ t('toolForge.rollbackCta') }}</Button>
            </div>
        </TalosMobileConfirmDialog>

        <TalosMobileConfirmDialog
            v-if="deleteConfirmOpen"
            :title="t('toolForge.deleteTitle', { title: record.manifest.title })"
            :description="t('toolForge.deleteBody')"
            @close="deleteConfirmOpen = false"
        >
            <div class="flex justify-end gap-2 pt-2">
                <Button type="button" variant="ghost" @click="deleteConfirmOpen = false">{{ t('common.cancel') }}</Button>
                <Button
                    type="button"
                    variant="destructive"
                    data-testid="talos-tool-forge-detail-delete-confirm"
                    @click="confirmDelete"
                >{{ t('common.delete') }}</Button>
            </div>
        </TalosMobileConfirmDialog>
    </TalosMobileComposerSheet>
</template>
