<script setup lang="ts">
import { ExternalLink } from '@lucide/vue'
import { useTalosTouchWave } from '@/composables/useTalosTouchWave'
import TalosMobileLibraryArt from '@/components/talos/library/TalosMobileLibraryArt.vue'
import type { TalosSavedLinkRow } from '@/lib/vaultLibrary'

/**
 * Un link salvato, come scheda — U-20, nella forma del mockup «Talos Calm
 * Finale».
 *
 * Owner 2026-07-30: i link vivevano in un ramo tutto loro, quindi l'interruttore
 * griglia/elenco — che sta nel ramo dei file — non li raggiungeva, e scegliere
 * «griglia» guardando i link non faceva assolutamente niente.
 *
 * Resta un componente **diverso** dalla scheda di un file, e per la stessa
 * ragione di sempre: una scheda di file porta la selezione multipla, il menu
 * delle azioni e lo stato del contesto, e un indirizzo non ha significato per
 * nessuna delle tre. Un template solo per entrambi sarebbe fatto di `v-if` e
 * si leggerebbe peggio di due. Quello che condividono davvero — il
 * raggruppamento per chat e ora il **riquadro d'anteprima** — è condiviso
 * (`libraryGrouping.ts`, `TalosMobileLibraryArt.vue`).
 *
 * ## ⛔ L'anteprima di un indirizzo sono la favicon e il titolo
 *
 * Per un file l'anteprima è il contenuto; per una pagina web è **di chi è** e
 * **di cosa parla**. La favicon viene catturata quando il link si salva e si
 * legge dal disco, quindi mostrarla non costa una richiesta — e quando manca il
 * mappamondo non è un fallimento, è un sito che non ne ha una.
 *
 * ## ⛔ Due azioni, e sono le due giuste
 *
 * La scheda apre **la copia che TALOS ha conservato** — la metà che l'owner ha
 * già, leggibile anche senza rete. Il bottone separato apre **la pagina vera**
 * nel browser della persona, coi suoi cookie. Sono due destinazioni diverse, non
 * due modi di fare la stessa cosa, e per questo sono due bersagli: nasconderne
 * una in un menu vorrebbe dire scegliere al posto suo quale delle due conta.
 */
withDefaults(defineProps<{
    row: TalosSavedLinkRow
    savedAtLabel: string
    /** Captured at save time; absent means the Globe, which is not a failure. */
    faviconUrl?: string | null
}>(), { faviconUrl: null })

const emit = defineEmits<{
    openCopy: []
    openBrowser: []
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
            <!-- `pr-12`: il bottone del browser sta sopra questo angolo. -->
            <span class="flex min-w-0 flex-col p-[var(--talos-space-card)] pr-12 md:p-[var(--talos-space-page)] md:pr-12">
                <strong class="line-clamp-2 text-sm font-medium leading-[1.6] text-[var(--talos-text)]">
                    {{ row.title }}
                </strong>
                <small class="mt-[var(--talos-space-inline)] truncate text-xs text-[var(--talos-muted)]">
                    {{ row.host }} · {{ savedAtLabel }}
                </small>
            </span>
        </button>
        <!--
            La favicon della scheda è dentro `TalosMobileLibraryArt`; questo
            `data-testid` resta qui, sul bottone, perché è quello che i test
            interrogano per sapere se la scheda offre la pagina vera.
        -->
        <button
            type="button"
            data-testid="talos-library-link-open"
            class="talos-pressable talos-wave-host absolute bottom-1 right-1 flex min-h-touch min-w-touch items-center justify-center rounded-full text-[var(--talos-muted)] focus-visible:ring-2 focus-visible:ring-[var(--talos-ring)]"
            :aria-label="$t('library.openHostInBrowser', { host: row.host })"
            @click="emit('openBrowser')"
            @pointerdown="onda.onPointerDown"
        >
            <ExternalLink class="size-4" aria-hidden="true" />
        </button>
    </div>
</template>
