<script setup lang="ts">
import { useTalosTabletLayout } from '@/composables/useTalosTabletLayout'

/**
 * ⛔ G1 — l'intestazione delle pagine, scritta una volta sola (owner 14/10/2026: «un rifacimento di tutte le pagine
 * interne con lo stesso stile e la grammatica delle pagine libreria»; ledger `LEDGER-G1-PAGINE-INTERNE-2026-10-14.md`).
 *
 * È il blocco che Libreria, Note, Memoria, Attività, Ricerca e Chat avevano copiato uguale: il titolo, che sul tablet è più
 * grande, e una riga sola che dice che posto è — perché una pagina aperta dal menu deve dire da sola dove si è finiti.
 * L'azione principale sta nello slot `action`: ogni pagina decide se e quando mostrarla (le stazioni, solo sul telefono).
 * Le classi sono quelle delle stazioni, carattere per carattere: il passo 1 non cambia un pixel.
 */
withDefaults(defineProps<{
    title: string
    subtitle?: string
    /** Il segno che il foglio della stazione usa per nascondere il proprio titolo quando la pagina ne ha uno. */
    sheetTitle?: boolean
    subtitleTestid?: string
}>(), {
    subtitle: undefined,
    sheetTitle: true,
    subtitleTestid: undefined,
})

const { isTablet } = useTalosTabletLayout()
</script>

<template>
    <header>
        <!-- Keep the subtitle full width; only the title shares the primary action row. -->
        <div class="flex items-center justify-between gap-[var(--talos-space-section)]">
            <h1
                :data-talos-sheet-title="sheetTitle ? '' : undefined"
                :class="['font-semibold leading-[1.15] tracking-[-0.03em] text-[var(--talos-text)]', isTablet ? 'text-3xl' : 'text-2xl']"
            >
                {{ title }}
            </h1>
            <slot name="action" />
        </div>
        <p
            v-if="subtitle"
            :data-testid="subtitleTestid"
            class="mt-[var(--talos-space-inline)] text-sm leading-6 text-[var(--talos-muted)]"
        >
            {{ subtitle }}
        </p>
    </header>
</template>
