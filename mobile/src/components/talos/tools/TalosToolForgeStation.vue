<script setup lang="ts">
/**
 * ⛔⛔⛔ Owner 2026-08-27 — Tool Forge Fase 6, la stazione VERA. Sostituisce
 * la bozza di Fase 1 (29 righe, stringhe fisse, tre bottoni piatti per
 * riga). Grammatica presa da `TasksScreen.vue` — la stessa app non deve
 * rispondere in modo diverso allo stesso dito: `TalosRowActions` per il
 * menu di riga, `TalosMobileConfirmDialog` per le conferme,
 * `TalosMobileComposerSheet` (già generico, nonostante il nome — vedi i
 * suoi altri usi in `TalosBarraRoot.vue`/`TalosMobileSourcesChip.vue`) per
 * i due fogli, `writeTalosClipboardText` per l'esportazione (non
 * `navigator.clipboard` nudo, che fallisce in silenzio su nativo).
 *
 * Il rischio riusa `chat.plan.risk.*` — la stessa frase già mostrata
 * quando TALOS chiede conferma di un piano, non una sigla R0-R4 da
 * imparare una seconda volta. Confermato dal mockup approvato il 27/8.
 */
import { onMounted, ref } from 'vue'
import { useTalosI18n } from '@/i18n'
import { Wrench } from '@lucide/vue'
import { Button } from '@/components/ui/button'
import TalosRowActions, { type TalosRowAction } from '@/components/talos/ui/TalosRowActions.vue'
import TalosMobileConfirmDialog from '@/components/shell/TalosMobileConfirmDialog.vue'
import TalosToolForgeImportSheet from '@/components/talos/tools/TalosToolForgeImportSheet.vue'
import TalosToolForgeDetailSheet from '@/components/talos/tools/TalosToolForgeDetailSheet.vue'
import {
    listForgeTools, removeForgeTool, setForgeToolEnabled, type ForgeInstalledRecord,
} from '@/lib/tools/dynamic/forgeRegistryRepository'
import { validateTalosLocalTool } from '@/lib/tools/dynamic/validator'
import { writeTalosClipboardText } from '@/services/clipboard'

const { t } = useTalosI18n()

const tools = ref<ForgeInstalledRecord[]>([])
const error = ref<string | null>(null)
const notice = ref<string | null>(null)
const busyId = ref<string | null>(null)
const importOpen = ref(false)
const detailTool = ref<ForgeInstalledRecord | null>(null)
const deleteTarget = ref<ForgeInstalledRecord | null>(null)

function describeError(cause: unknown): string {
    return cause instanceof Error && cause.message ? cause.message : String(cause)
}

async function refresh(): Promise<void> {
    try {
        tools.value = await listForgeTools()
    } catch (cause) {
        error.value = describeError(cause)
    }
}
onMounted(refresh)

/**
 * ⛔ Nessuno store di credenziali è collegato al Forge ancora
 * (`talosIntegration.ts`, `UNRESOLVED_CREDENTIALS`) — ogni tool che
 * dichiara uno slot è onestamente irrisolvibile oggi. Se un giorno un
 * resolver vero risolve qualcosa, questo controllo va allineato a lui,
 * non lasciato indietro a mostrare bloccato un tool che funziona.
 */
function isBlocked(record: ForgeInstalledRecord): boolean {
    return record.manifest.credentialRequirements.length > 0
}

function riskOf(record: ForgeInstalledRecord): string {
    return validateTalosLocalTool(record.manifest).risk
}

async function toggle(record: ForgeInstalledRecord): Promise<void> {
    error.value = null
    busyId.value = record.manifest.id
    try {
        await setForgeToolEnabled(record.manifest.id, !record.enabled)
        await refresh()
    } catch (cause) {
        error.value = describeError(cause)
    } finally {
        busyId.value = null
    }
}

function menuFor(record: ForgeInstalledRecord): TalosRowAction[] {
    return [
        { id: 'history', label: t('toolForge.historyNamed', { title: record.manifest.title }), testId: 'talos-tool-forge-action-history' },
        { id: 'export', label: t('toolForge.exportNamed', { title: record.manifest.title }), testId: 'talos-tool-forge-action-export' },
        { id: 'delete', label: t('toolForge.deleteNamed', { title: record.manifest.title }), danger: true, testId: 'talos-tool-forge-action-delete' },
    ]
}

function act(record: ForgeInstalledRecord, action: string): void {
    if (action === 'history') detailTool.value = record
    else if (action === 'export') void exportTool(record)
    else deleteTarget.value = record
}

async function exportTool(record: ForgeInstalledRecord): Promise<void> {
    error.value = null; notice.value = null
    try {
        const { exportTalosToolArtifact } = await import('@/lib/tools/dynamic/artifact')
        const artifact = exportTalosToolArtifact(record.manifest)
        await writeTalosClipboardText(JSON.stringify(artifact, null, 2))
        notice.value = t('common.copied')
    } catch (cause) {
        error.value = describeError(cause)
    }
}

async function confirmDelete(): Promise<void> {
    if (!deleteTarget.value) return
    const id = deleteTarget.value.manifest.id
    deleteTarget.value = null
    error.value = null
    try {
        await removeForgeTool(id)
        await refresh()
    } catch (cause) {
        error.value = describeError(cause)
    }
}

async function onImported(title: string): Promise<void> {
    importOpen.value = false
    notice.value = t('toolForge.importSuccess', { title })
    await refresh()
}

async function onRolledBack(version: number): Promise<void> {
    detailTool.value = null
    notice.value = t('toolForge.rollbackSuccess', { version })
    await refresh()
}

async function onDetailDeleted(): Promise<void> {
    detailTool.value = null
    await refresh()
}
</script>

<template>
    <div
        class="flex min-h-full flex-col gap-3 px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3"
        data-testid="talos-tool-forge-station"
    >
        <p class="text-xs leading-5 text-[var(--talos-muted)]">{{ t('toolForge.intro') }}</p>

        <!-- ⛔ Owner 2026-08-27, trovato sul dispositivo: la frase dice
             «N installati», ma passava `enabledCount` (gli ABILITATI) — con
             2 installati e 1 solo abilitato avrebbe mentito, dicendo «1
             installato». `pendingCount` sotto non aveva né etichetta né un
             posto nella frase: un numero nudo, senza dire cosa contava. -->
        <p v-if="tools.length" class="text-xs text-[var(--talos-muted)]" data-testid="talos-tool-forge-summary">
            {{ tools.length === 1 ? t('toolForge.installedSummaryOne') : t('toolForge.installedSummary', { n: tools.length }) }}
        </p>

        <p v-if="error" role="alert" class="text-xs text-[var(--talos-danger,#dc5b5b)]">{{ error }}</p>
        <p v-if="notice" role="status" class="text-xs text-[var(--talos-accent)]">{{ notice }}</p>

        <!-- Vuoto: l'invito è a IMPORTARE, non a "creare" — v1 non genera
             manifest dal nulla (ADR-001, nessun codice generato dal modello). -->
        <div v-if="!tools.length" class="flex flex-1 flex-col items-center justify-center gap-3 px-6 py-10 text-center">
            <span class="flex size-14 items-center justify-center rounded-2xl bg-[var(--talos-accent)]/15 text-[var(--talos-accent)]" aria-hidden="true">
                <Wrench class="size-6" />
            </span>
            <h2 class="text-base font-bold">{{ t('toolForge.emptyTitle') }}</h2>
            <p class="max-w-[26ch] text-sm text-[var(--talos-muted)]">{{ t('toolForge.emptyBody') }}</p>
            <Button type="button" data-testid="talos-tool-forge-import-cta" class="mt-1 rounded-full" @click="importOpen = true">
                {{ t('toolForge.importCta') }}
            </Button>
        </div>

        <ul v-else data-testid="talos-tool-forge-list" class="flex flex-col gap-2">
            <li
                v-for="record in tools"
                :key="record.manifest.id"
                data-testid="talos-tool-forge-row"
                :data-enabled="record.enabled ? 'true' : 'false'"
                :data-blocked="isBlocked(record) ? 'true' : 'false'"
                class="rounded-2xl border border-[var(--talos-border)] bg-[var(--talos-panel)]/70 p-3"
                :class="isBlocked(record) ? 'opacity-70' : ''"
            >
                <div class="flex items-start gap-2">
                    <div class="min-w-0 flex-1">
                        <h3 class="text-sm font-semibold text-[var(--talos-text)]">{{ record.manifest.title }}</h3>
                        <p class="mt-0.5 line-clamp-2 text-xs leading-5 text-[var(--talos-muted)]">{{ record.manifest.description }}</p>
                        <p class="mt-1 font-mono text-2xs text-[var(--talos-muted)]">
                            {{ record.manifest.id }} · {{ t('toolForge.versionLabel', { version: record.manifest.version }) }}
                        </p>
                    </div>

                    <!-- Il tocco primario: interruttore vero, non un
                         terzo bottone in fila con gli altri. -->
                    <!-- Bersaglio tattile 48dp (min-h-touch/min-w-touch — la
                         grammatica sola del progetto, `touchTargetContract.test.ts`)
                         attorno a un binario visivo più stretto: lo switch
                         resta riconoscibile, il dito ha comunque 48dp. -->
                    <button
                        v-if="!isBlocked(record)"
                        type="button"
                        role="switch"
                        :aria-checked="record.enabled"
                        :aria-label="record.enabled ? t('toolForge.disableNamed', { title: record.manifest.title }) : t('toolForge.enableNamed', { title: record.manifest.title })"
                        data-testid="talos-tool-forge-toggle"
                        :disabled="busyId === record.manifest.id"
                        class="talos-pressable flex min-h-touch min-w-touch shrink-0 items-center justify-center rounded-full disabled:opacity-50"
                        @click="toggle(record)"
                    >
                        <span
                            aria-hidden="true"
                            class="relative h-6 w-10 rounded-full border border-[var(--talos-border)] transition-colors"
                            :class="record.enabled ? 'bg-[var(--talos-accent)]' : 'bg-[var(--talos-panel-soft)]'"
                        >
                            <span
                                class="absolute top-0.5 left-0.5 size-5 rounded-full bg-[var(--talos-window-bg)] shadow transition-transform"
                                :class="record.enabled ? 'translate-x-4' : 'translate-x-0'"
                            />
                        </span>
                    </button>
                    <span v-else class="mt-1 shrink-0 text-[var(--talos-muted)]" aria-hidden="true">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
                    </span>

                    <TalosRowActions
                        :items="menuFor(record)"
                        :label="t('tasks.actionsNamed', { title: record.manifest.title })"
                        test-id="talos-tool-forge-row-actions"
                        @select="act(record, $event)"
                    />
                </div>

                <!-- ⛔ Owner 2026-08-27, trovato sul dispositivo: `--talos-danger`
                     vale `#fee2e2` (quasi bianco) — è garantito leggibile SOLO
                     come TESTO sopra `--talos-danger-soft`, mai come sfondo
                     proprio, nemmeno attenuato. `TalosRowActions.vue` lo
                     documenta già; qui l'avevo rifatto a mano invece di
                     riusare il token vero. -->
                <p v-if="isBlocked(record)" class="mt-2 inline-flex items-center gap-1 rounded-full bg-[var(--talos-danger-soft)] px-2 py-0.5 text-2xs font-semibold text-[var(--talos-danger,#dc5b5b)]" data-testid="talos-tool-forge-blocked">
                    {{ t('toolForge.blockedCredential') }}
                </p>
                <p v-else class="mt-2 text-xs leading-5 text-[var(--talos-muted)]" data-testid="talos-tool-forge-risk">
                    {{ t(`chat.plan.risk.${riskOf(record)}`) }}
                </p>
            </li>
        </ul>

        <Button
            v-if="tools.length"
            type="button"
            variant="outline"
            data-testid="talos-tool-forge-import-secondary"
            class="rounded-full"
            @click="importOpen = true"
        >
            {{ t('toolForge.importCta') }}
        </Button>

        <TalosToolForgeImportSheet
            v-if="importOpen"
            @close="importOpen = false"
            @imported="onImported"
        />

        <TalosToolForgeDetailSheet
            v-if="detailTool"
            :record="detailTool"
            @close="detailTool = null"
            @rolled-back="onRolledBack"
            @deleted="onDetailDeleted"
        />

        <TalosMobileConfirmDialog
            v-if="deleteTarget"
            :title="t('toolForge.deleteTitle', { title: deleteTarget.manifest.title })"
            :description="t('toolForge.deleteBody')"
            @close="deleteTarget = null"
        >
            <div class="flex justify-end gap-2 pt-2">
                <Button type="button" variant="ghost" @click="deleteTarget = null">{{ t('common.cancel') }}</Button>
                <Button
                    type="button"
                    variant="destructive"
                    data-testid="talos-tool-forge-delete-confirm"
                    @click="confirmDelete"
                >{{ t('common.delete') }}</Button>
            </div>
        </TalosMobileConfirmDialog>
    </div>
</template>
