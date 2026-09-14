<script setup lang="ts">
import { useTalosTouchWave } from '@/composables/useTalosTouchWave'
import TalosMobileLibraryArt from '@/components/talos/library/TalosMobileLibraryArt.vue'
import TalosRowActions, { type TalosRowAction } from '@/components/talos/ui/TalosRowActions.vue'
import type { TalosSavedLinkRow } from '@/lib/vaultLibrary'

/**
 * Un link salvato, come scheda — U-20, nella forma del mockup «Talos Calm
 * Finale».
 *
 * Owner 2026-07-30: i link vivevano in un ramo tutto loro, quindi l'interruttore
 * griglia/elenco — che sta nel ramo dei file — non li raggiungeva, e scegliere
 * «griglia» guardando i link non faceva assolutamente niente.
 *
 * Resta un componente **diverso** dalla scheda di un file: una scheda di file
 * porta la selezione multipla e l'anello di selezione, che per un indirizzo non
 * hanno significato. Quello che condividono davvero — il raggruppamento per chat,
 * il **riquadro d'anteprima** e ora il **menu ⋯** — è condiviso
 * (`libraryGrouping.ts`, `TalosMobileLibraryArt.vue`, `TalosRowActions.vue`).
 *
 * ## ⛔ L'anteprima di un indirizzo sono la favicon e il titolo
 *
 * Per un file l'anteprima è il contenuto; per una pagina web è **di chi è** e
 * **di cosa parla**. La favicon viene catturata quando il link si salva e si
 * legge dal disco, quindi mostrarla non costa una richiesta — e quando manca il
 * mappamondo non è un fallimento, è un sito che non ne ha una.
 *
 * ## ⛔ Owner 14/09/2026: «apri fuori» entra nel menu ⋯
 *
 * La scheda apre **la copia che TALOS ha conservato** — leggibile anche senza
 * rete. La pagina vera nel browser della persona era un secondo bottone
 * nell'angolo, l'unica scheda della Libreria con un'azione fuori dal menu. Ora
 * il link ha lo stesso ⋯ di un file — Apri nel browser, Allega al messaggio,
 * Salva sul telefono, Elimina — e un'azione sta in un posto solo: riga e menu
 * non si ripetono.
 *
 * La riga di dettaglio dice il **dominio**, e la chat solo quando la Libreria è
 * raggruppata per chat (owner): niente data.
 */
withDefaults(defineProps<{
    row: TalosSavedLinkRow
    /** Captured at save time; absent means the Globe, which is not a failure. */
    faviconUrl?: string | null
    /** La chat di provenienza, solo col raggruppamento per chat acceso. */
    originLabel?: string | null
    actions: readonly TalosRowAction[]
    actionsLabel: string
}>(), { faviconUrl: null, originLabel: null })

const emit = defineEmits<{
    openCopy: []
    action: [action: string]
}>()

/** L'onda al tocco: `talos-wave-host` dà il posto, questo dà il punto. */
const onda = useTalosTouchWave()
</script>

<template>
    <div
        :data-testid="`talos-library-link-tile-${row.fileId}`"
        data-talos-saved-link-tile
        role="listitem"
        class="relative flex min-w-0 flex-col overflow-hidden rounded-[var(--talos-radius-card)] border border-[var(--talos-border)] bg-[var(--talos-card)]"
    >
        <button
            type="button"
            class="talos-pressable talos-pressable-row talos-wave-host flex min-w-0 flex-col text-left focus-visible:ring-2 focus-visible:ring-[var(--talos-ring)]"
            :aria-label="$t('library.openSavedCopyOf', { title: row.title })"
            @click="emit('openCopy')"
            @pointerdown="onda.onPointerDown"
        >
            <TalosMobileLibraryArt
                :link-title="row.title"
                :favicon-url="faviconUrl"
            />
            <!-- `pr-12`: i tre puntini stanno sopra questo angolo. -->
            <span class="flex min-w-0 flex-col p-[var(--talos-space-card)] pr-12 md:p-[var(--talos-space-page)] md:pr-12">
                <strong class="line-clamp-2 text-sm font-medium leading-[1.6] text-[var(--talos-text)]">
                    {{ row.title }}
                </strong>
                <small class="mt-[var(--talos-space-inline)] truncate text-xs text-[var(--talos-muted)]">
                    {{ row.host }}<template v-if="originLabel"> · {{ originLabel }}</template>
                </small>
            </span>
        </button>

        <div class="absolute bottom-1 right-1 z-[2]">
            <TalosRowActions
                :label="actionsLabel"
                :test-id="`talos-library-link-actions-${row.fileId}`"
                :items="actions"
                @select="(action) => emit('action', action)"
            />
        </div>
    </div>
</template>
