<script setup lang="ts">
/**
 * Backup e ripristino — la superficie.
 *
 * ## Le due regole che governano ogni riga di questa schermata
 *
 * 1. **Prima si dice, poi si scrive.** L'import non parte: apre il file, mostra
 *    cosa contiene e quante righe **sovrascriverà**, e aspetta. È il piano (D15)
 *    applicato al backup.
 *
 *    ⛔ Correzione a me stesso: avevo scritto «nessun export in circolazione lo
 *    fa», ed è falso. Agora ha `previewImport(uri)` — verificato nel loro
 *    sorgente il 2026-08-07. Quello che resta nostro è più stretto, e va detto
 *    così: il piano **riga per riga con il conteggio delle sovrascritture**, e
 *    la verifica delle impronte e del troncamento.
 * 2. **Si dice cosa c'è dentro prima di chiedere la passphrase.** Il manifesto
 *    viaggia in chiaro apposta: chiedere la password e poi rispondere «guarda,
 *    è di un'altra versione» è un giro sprecato.
 */
import { computed, ref } from 'vue'
import { useTalosI18n } from '@/i18n'
import { Button } from '@/components/ui/button'
import { AlertTriangle, Check, Download, Upload } from '@lucide/vue'
import type { TalosBackupRestorePlan, TalosBackupStrategy } from '@/lib/backup/bundle'

const { t } = useTalosI18n()

const busy = ref(false)
const error = ref<string | null>(null)
const done = ref<string | null>(null)

/* ── esportare ───────────────────────────────────────────────────────────── */
const passphrase = ref('')
const includeKeys = ref(false)

async function esporta(): Promise<void> {
    if (busy.value) return
    busy.value = true
    error.value = null
    done.value = null
    try {
        const [{ talosCreateBackupBundle, talosVerifyBackupBundle }, { talosBackupSourcesFrom },
            { talosBackupFileName, talosBackupFileText, talosSaveBackupFile },
            { talosBackupDeps }] = await Promise.all([
            import('@/services/backupExport'),
            import('@/services/backupWiring'),
            import('@/services/backupFile'),
            import('@/services/backupDeps'),
        ])

        const bundle = await talosCreateBackupBundle(
            talosBackupSourcesFrom(await talosBackupDeps()),
            { includeProviderKeys: includeKeys.value },
        )
        /*
         * ⭐ Si rilegge PRIMA di consegnarlo. «L'ho scritto» e «l'ho riletto e
         * torna» sono due frasi diverse, e solo la seconda è una verifica.
         */
        const verifica = await talosVerifyBackupBundle(bundle)
        if (!verifica.ok) {
            throw new Error(t('backup.errorUnverified', { sections: verifica.mismatched.join(', ') }))
        }

        const nome = talosBackupFileName(bundle.manifest.createdAt)
        const testo = await talosBackupFileText(bundle, passphrase.value)
        // ⛔ SAF: il file va DOVE LO METTE L'UTENTE, fuori dal mondo dell'app —
        // quindi sopravvive alla disinstallazione, che è il caso per cui esiste.
        const scritto = await talosSaveBackupFile(nome, testo)
        // Chiudere il selettore non è un guasto: è una decisione.
        if (!scritto.saved) { busy.value = false; return }

        const righe = Object.values(bundle.manifest.sections)
            .reduce((totale, sezione) => totale + (sezione?.count ?? 0), 0)
        done.value = t('backup.exported', {
            name: nome,
            rows: righe,
            size: Math.max(1, Math.round(scritto.bytes / 1024)),
        })
        passphrase.value = ''
    } catch (cause) {
        error.value = cause instanceof Error ? cause.message : String(cause)
    } finally {
        busy.value = false
    }
}

/* ── ripristinare ────────────────────────────────────────────────────────── */
/** Il file scelto col selettore di sistema: nome e testo, tenuti insieme. */
const scelto = ref<{ name: string, text: string } | null>(null)
const passphraseImport = ref('')
const strategy = ref<TalosBackupStrategy>('merge')
const piano = ref<TalosBackupRestorePlan | null>(null)
/** Il file aperto, tenuto fra il piano e la conferma: non si riapre due volte. */
let apertoPerConferma: unknown = null

const totali = computed(() => {
    if (!piano.value) return { willWrite: 0, willOverwrite: 0 }
    return piano.value.steps.reduce(
        (totale, passo) => ({
            willWrite: totale.willWrite + passo.willWrite,
            willOverwrite: totale.willOverwrite + passo.willOverwrite,
        }),
        { willWrite: 0, willOverwrite: 0 },
    )
})

/** Apre il selettore di sistema e legge la parte IN CHIARO, senza passphrase. */
async function scegliFile(): Promise<void> {
    if (busy.value) return
    busy.value = true
    error.value = null
    done.value = null
    piano.value = null
    try {
        const { talosPickBackupFile, talosReadBackupHeader } = await import('@/services/backupFile')
        const file = await talosPickBackupFile()
        if (!file) return
        // Si legge la testa PRIMA di chiedere la passphrase: se il file non è
        // nostro, o è di un'altra versione, dirlo adesso risparmia un giro.
        talosReadBackupHeader(file.text)
        scelto.value = file
    } catch (cause) {
        error.value = cause instanceof Error ? cause.message : String(cause)
    } finally {
        busy.value = false
    }
}

/** Apre il file e calcola il piano. NON scrive niente. */
async function preparaRipristino(): Promise<void> {
    if (busy.value || scelto.value === null) return
    busy.value = true
    error.value = null
    done.value = null
    piano.value = null
    try {
        const [{ talosOpenBackupFile }, { talosOpenBackup, talosPlanBackupRestore },
            { talosBackupSinksFrom }, { talosBackupDeps }] = await Promise.all([
            import('@/services/backupFile'),
            import('@/services/backupImport'),
            import('@/services/backupWiring'),
            import('@/services/backupDeps'),
        ])
        const file = await talosOpenBackupFile(scelto.value.text, passphraseImport.value)
        const aperto = await talosOpenBackup(file)
        apertoPerConferma = aperto
        piano.value = await talosPlanBackupRestore(
            aperto,
            talosBackupSinksFrom(await talosBackupDeps()),
            strategy.value,
        )
    } catch (cause) {
        error.value = cause instanceof Error ? cause.message : String(cause)
    } finally {
        busy.value = false
    }
}

/** Scrive. Solo dopo che il piano è stato mostrato e approvato. */
async function confermaRipristino(): Promise<void> {
    if (busy.value || piano.value === null || apertoPerConferma === null) return
    busy.value = true
    error.value = null
    try {
        const [{ talosApplyBackupRestore }, { talosBackupSinksFrom }, { talosBackupDeps }] =
            await Promise.all([
                import('@/services/backupImport'),
                import('@/services/backupWiring'),
                import('@/services/backupDeps'),
            ])
        const scritte = await talosApplyBackupRestore(
            apertoPerConferma as never,
            talosBackupSinksFrom(await talosBackupDeps()),
            strategy.value,
        )
        const totale = Object.values(scritte).reduce((somma, n) => somma + (n ?? 0), 0)
        done.value = t('backup.restored', { rows: totale })
        piano.value = null
        apertoPerConferma = null
        passphraseImport.value = ''
    } catch (cause) {
        error.value = cause instanceof Error ? cause.message : String(cause)
    } finally {
        busy.value = false
    }
}
</script>

<template>
    <div class="flex flex-col gap-5 px-1 pb-4" data-testid="talos-settings-backup-panel">

        <!-- ── esportare ─────────────────────────────────────────────────── -->
        <section class="flex flex-col gap-3 rounded-2xl border border-[var(--talos-border)] bg-[var(--talos-panel)]/60 p-4">
            <h3 class="flex items-center gap-2 text-sm font-semibold text-[var(--talos-text)]">
                <Download class="size-4 text-[var(--talos-accent)]" aria-hidden="true" />
                {{ t('backup.exportTitle') }}
            </h3>

            <label class="flex flex-col gap-1">
                <span class="text-xs text-[var(--talos-muted)]">{{ t('backup.passphrase') }}</span>
                <input
                    v-model="passphrase"
                    type="password"
                    data-testid="talos-backup-passphrase"
                    :placeholder="t('backup.passphrasePlaceholder')"
                    class="min-h-12 rounded-xl border border-[var(--talos-border)] bg-[var(--talos-card)] px-3 text-sm text-[var(--talos-text)] outline-none focus:border-[var(--talos-accent)]"
                >
                <span class="text-2xs leading-4 text-[var(--talos-muted)]">{{ t('backup.passphraseHint') }}</span>
            </label>

            <!-- ⛔ Le chiavi sono FUORI per difetto: un backup senza chiavi si
                 appoggia ovunque, uno con le chiavi È una chiave. -->
            <label class="talos-pressable flex min-h-touch items-start gap-3 rounded-xl px-1 py-2 text-left">
                <input v-model="includeKeys" type="checkbox" data-testid="talos-backup-include-keys" class="mt-1 size-4 shrink-0 accent-[var(--talos-accent)]">
                <span class="flex min-w-0 flex-col">
                    <span class="text-sm text-[var(--talos-text)]">{{ t('backup.includeKeys') }}</span>
                    <span class="text-2xs leading-4 text-[var(--talos-muted)]">{{ t('backup.includeKeysHint') }}</span>
                </span>
            </label>

            <Button
                type="button"
                data-testid="talos-backup-export"
                :disabled="busy || passphrase.length === 0"
                @click="esporta"
            >{{ busy ? t('backup.working') : t('backup.exportAction') }}</Button>
        </section>

        <!-- ── ripristinare ──────────────────────────────────────────────── -->
        <section class="flex flex-col gap-3 rounded-2xl border border-[var(--talos-border)] bg-[var(--talos-panel)]/60 p-4">
            <h3 class="flex items-center gap-2 text-sm font-semibold text-[var(--talos-text)]">
                <Upload class="size-4 text-[var(--talos-accent)]" aria-hidden="true" />
                {{ t('backup.restoreTitle') }}
            </h3>

            <Button
                type="button"
                variant="ghost"
                data-testid="talos-backup-pick"
                :disabled="busy"
                @click="scegliFile"
            >{{ scelto ? scelto.name : t('backup.chooseFile') }}</Button>

            <label v-if="scelto" class="flex flex-col gap-1">
                <span class="text-xs text-[var(--talos-muted)]">{{ t('backup.passphrase') }}</span>
                <input
                    v-model="passphraseImport"
                    type="password"
                    data-testid="talos-backup-import-passphrase"
                    class="min-h-12 rounded-xl border border-[var(--talos-border)] bg-[var(--talos-card)] px-3 text-sm text-[var(--talos-text)] outline-none focus:border-[var(--talos-accent)]"
                >
            </label>

            <div v-if="scelto" class="flex flex-wrap gap-2">
                <button
                    v-for="modo in (['merge', 'replace', 'skip'] as TalosBackupStrategy[])"
                    :key="modo"
                    type="button"
                    :data-testid="`talos-backup-strategy-${modo}`"
                    :aria-pressed="strategy === modo"
                    class="talos-pressable min-h-12 rounded-full px-3 text-sm"
                    :class="strategy === modo
                        ? 'bg-[var(--talos-accent)] text-[var(--talos-accent-contrast,var(--primary-foreground))]'
                        : 'border border-[var(--talos-border)] text-[var(--talos-muted)]'"
                    @click="strategy = modo; piano = null"
                >{{ t(`backup.strategy.${modo}`) }}</button>
            </div>

            <Button
                v-if="scelto"
                type="button"
                variant="ghost"
                data-testid="talos-backup-plan"
                :disabled="busy || passphraseImport.length === 0"
                @click="preparaRipristino"
            >{{ busy ? t('backup.working') : t('backup.planAction') }}</Button>

            <!-- ⭐ Il piano: cosa succederà, PRIMA che succeda. -->
            <div
                v-if="piano"
                data-testid="talos-backup-plan-result"
                class="flex flex-col gap-2 rounded-xl border border-[var(--talos-border)] bg-[var(--talos-card)] p-3"
            >
                <p class="text-xs text-[var(--talos-muted)]">
                    {{ t('backup.planFrom', { device: piano.manifest.deviceModel ?? '—', date: piano.manifest.createdAt.slice(0, 10) }) }}
                </p>
                <ul class="flex flex-col gap-1">
                    <li v-for="passo in piano.steps" :key="passo.section" class="flex items-baseline justify-between gap-2 text-xs">
                        <span class="text-[var(--talos-text)]">{{ t(`backup.sections.${passo.section}`) }}</span>
                        <span class="font-mono text-2xs text-[var(--talos-muted)]">
                            +{{ passo.willWrite }}<template v-if="passo.willOverwrite > 0"> · <span class="text-[var(--talos-danger,#dc5b5b)]">↻{{ passo.willOverwrite }}</span></template>
                        </span>
                    </li>
                </ul>
                <p
                    v-if="totali.willOverwrite > 0"
                    class="flex items-start gap-2 text-xs text-[var(--talos-danger,#dc5b5b)]"
                >
                    <AlertTriangle class="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                    {{ t('backup.willOverwrite', { count: totali.willOverwrite }) }}
                </p>
                <Button
                    type="button"
                    data-testid="talos-backup-confirm"
                    :disabled="busy"
                    :class="totali.willOverwrite > 0 ? 'bg-[var(--talos-danger,#dc5b5b)] text-white' : ''"
                    @click="confermaRipristino"
                >{{ t('backup.confirmAction', { count: totali.willWrite }) }}</Button>
            </div>
        </section>

        <p v-if="error" role="alert" data-testid="talos-backup-error" class="text-xs text-[var(--talos-danger,#dc5b5b)]">{{ error }}</p>
        <p v-if="done" aria-live="polite" data-testid="talos-backup-done" class="flex items-start gap-2 text-xs text-[var(--talos-text)]">
            <Check class="mt-0.5 size-4 shrink-0 text-[var(--talos-accent)]" aria-hidden="true" />{{ done }}
        </p>
    </div>
</template>
