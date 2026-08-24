<script setup lang="ts">
/**
 * Model Lab Blocco 4 — il ledger di provenienza, mostrato.
 *
 * Componente di SOLA presentazione: riceve le righe già calcolate da
 * `talosResourceLedger()` (fit.ts), lette da `set.examination.ledger` nello
 * store — non chiama `talosResourceLedger` da solo, che vorrebbe di nuovo
 * `model`/`device`/`context`, cioè esattamente lo stato che lo store già
 * possiede e ricalcola in `talosRicalcolaEsaminati` quando context o cache KV
 * cambiano. Un componente che duplicasse quella chiamata rischierebbe di
 * mostrare un numero diverso da quello che `talosModelFit` ha già deciso per
 * lo stesso set — la stessa disciplina di parità già custodita da
 * `kvCacheTypeOverrideParity.test.ts` per la tabella byte-per-elemento.
 */
import { computed } from 'vue'
import { useTalosI18n } from '@/i18n'
import { talosFormatBytes } from '@/lib/models/presentation'
import type { TalosResourceLedgerRow } from '@/lib/models/fit'

const props = defineProps<{
    rows: readonly TalosResourceLedgerRow[]
}>()

const { t } = useTalosI18n()

const ROW_LABEL_KEY: Record<TalosResourceLedgerRow['label'], string> = {
    weights: 'localModels.ledger.weights',
    kvCache: 'localModels.ledger.kvCache',
    compute: 'localModels.ledger.compute',
    runtime: 'localModels.ledger.runtime',
    safetyMargin: 'localModels.ledger.safetyMargin',
    totalRuntime: 'localModels.ledger.totalRuntime',
    availableRam: 'localModels.ledger.availableRam',
    margin: 'localModels.ledger.margin',
}

const PROVENANCE_LABEL_KEY: Record<TalosResourceLedgerRow['provenance'], string> = {
    exact: 'localModels.ledger.provenanceExact',
    predicted: 'localModels.ledger.provenancePredicted',
    policy: 'localModels.ledger.provenancePolicy',
}

/**
 * Colore per provenienza — solo i tre token già nel tema (talosThemes.ts),
 * mai un quarto inventato: questo ledger ha tre sole provenienze reali
 * (`TalosResourceLedgerProvenance` in fit.ts), non le quattro del mockup
 * originale (Blocco 0.4 del piano aveva già scartato 'demo-input': non
 * esiste in produzione, il device è sempre misurato).
 *
 * 'exact' = misurato per davvero (success). 'predicted' = un'ipotesi su un
 * tipo di cache forzato (info, non warning: non è un problema, è solo meno
 * diretto di una misura). 'policy' = una costante nostra, non specifica al
 * modello (muted).
 */
const PROVENANCE_TONE: Record<TalosResourceLedgerRow['provenance'], { fg: string, bg: string, border: string }> = {
    exact: {
        fg: 'var(--talos-success)',
        bg: 'var(--talos-success-soft)',
        border: 'var(--talos-success-border)',
    },
    predicted: {
        fg: 'var(--talos-info)',
        bg: 'var(--talos-info-soft)',
        border: 'var(--talos-info-border)',
    },
    policy: {
        fg: 'var(--talos-muted)',
        bg: 'transparent',
        border: 'var(--talos-border)',
    },
}

const rows = computed(() => props.rows.map((row) => ({
    key: row.label,
    label: t(ROW_LABEL_KEY[row.label]),
    // ⛔ talosFormatBytes clampa i numeri negativi a "0 B" (progettata per
    // ricevere sempre una grandezza, mai un segno — lo stesso motivo per
    // cui talos-models-set fa già Math.abs() prima di chiamarla). `margin`
    // può essere negativo (un deficit reale): il segno si porta a parte,
    // non lo si perde dentro la funzione di formattazione.
    formatted: talosFormatBytes(Math.abs(row.bytes)),
    negative: row.bytes < 0,
    provenance: row.provenance,
    provenanceLabel: t(PROVENANCE_LABEL_KEY[row.provenance]),
    tone: PROVENANCE_TONE[row.provenance],
})))
</script>

<template>
    <div data-testid="talos-model-resource-ledger" class="flex flex-col gap-[calc(var(--talos-space-inline)/2)]">
        <p class="font-mono text-3xs uppercase tracking-wider text-[var(--talos-muted)]">{{ t('localModels.ledgerTitle') }}</p>
        <ul class="min-w-0 divide-y divide-[var(--talos-border)]">
            <li
                v-for="row in rows"
                :key="row.key"
                :data-testid="`talos-ledger-row-${row.key}`"
                class="flex min-w-0 items-center justify-between gap-[var(--talos-space-inline)] py-[calc(var(--talos-space-inline)/2)] text-2xs"
            >
                <span class="truncate text-[var(--talos-muted)]">{{ row.label }}</span>
                <span class="flex shrink-0 items-center gap-[calc(var(--talos-space-inline)/2)]">
                    <span
                        class="tabular-nums"
                        :class="row.negative ? 'text-[var(--talos-danger)]' : 'text-[var(--talos-text)]'"
                    >{{ row.negative ? '−' : '' }}{{ row.formatted }}</span>
                    <span
                        :data-testid="`talos-ledger-provenance-${row.key}`"
                        class="rounded-[var(--talos-radius-control)] border px-[calc(var(--talos-space-inline)/2)] py-px font-mono text-3xs uppercase tracking-wide"
                        :style="{ color: row.tone.fg, backgroundColor: row.tone.bg, borderColor: row.tone.border }"
                    >{{ row.provenanceLabel }}</span>
                </span>
            </li>
        </ul>
    </div>
</template>
