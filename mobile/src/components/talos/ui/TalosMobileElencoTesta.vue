<script setup lang="ts">
/**
 * ⛔ PEZZO VERO (metodo «plug and play», owner 29/10 sera): la TESTA di una sezione a elenco, una sola per tutte, nella grammatica delle
 * Chat. È il markup di `ChatsScreen.vue:794-946` portato fuori, classe per classe:
 *   · intestazione (`TalosMobilePageHeader`) con titolo, frase e, sul telefono, il «+» quadrato a destra del titolo;
 *   · la riga degli strumenti: ricerca, lo slot `strumenti` (es. Lista/Schede della Libreria), il pulsante «Opzioni» col numero dei filtri
 *     accesi e, sul tablet, «+ Nuova X» con l'etichetta;
 *   · le schede di stato (radiogroup, frecce, indicatore che scivola), coi numeri;
 *   · la riga del conteggio, con lo slot `conteggio-fine` (es. l'icona della selezione delle Chat).
 * Destinazione: `src/components/talos/ui/TalosMobileElencoTesta.vue` (SCHEDA-DI-CONSEGNA.md, voce 2). Prima la usano Codice, Libreria
 * e Computer; poi le Chat stesse, così il markup vive in un posto solo (Hermes: un'intestazione di pagina sola, `workspace-page-header.tsx`).
 */
import { nextTick, ref, toRef } from 'vue'
import { Plus, Search, SlidersHorizontal } from '@lucide/vue'
import { Button } from '@/components/ui/button'
import TalosMobilePageHeader from '@/components/talos/ui/TalosMobilePageHeader.vue'
import { useTalosSlidingIndicator } from '@/composables/useTalosSlidingIndicator'
import { useTalosTouchWave } from '@/composables/useTalosTouchWave'

export interface TalosElencoScheda { readonly id: string; readonly label: string; readonly count: number }

const props = withDefaults(defineProps<{
    /** Il prefisso dei `data-testid` (`talos-chats`, `talos-harness`, `talos-library`…): le prove esistenti restano valide. */
    testIdPrefix: string
    titolo: string
    frase: string
    /** Il nome dell'azione principale («Nuova sessione Codice», «Collega un computer»…); vuoto = nessuna azione */
    nuovaEtichetta?: string
    /** Il testo del pulsante sul tablet («Nuova sessione»); se manca, sul tablet vale `nuovaEtichetta` */
    nuovaBreve?: string
    cercaEtichetta: string
    opzioniEtichetta: string
    /** Quanti filtri del foglio «Opzioni» sono accesi: il numero sul pulsante (come le Chat) */
    opzioniAccese?: number
    opzioniAperte?: boolean
    schedeEtichetta: string
    schede: readonly TalosElencoScheda[]
    conteggio: string
    /** Telefono o tablet: lo passa la pagina (`useTalosTabletLayout`), così il pezzo resta puro e si prova senza finestra */
    tablet?: boolean
    /**
     * E4 (owner 29/10 notte, «Col nome, come sul tablet»): l'azione porta un nome da leggere (il PC dove nasce la sessione). Anche
     * sul telefono, allora, il pulsante col testo del tablet, al più su due righe (D-MOCK-9). Di serie no: il «+» quadrato.
     */
    nuovaConNome?: boolean
}>(), { nuovaEtichetta: '', nuovaBreve: '', opzioniAccese: 0, opzioniAperte: false, tablet: false, nuovaConNome: false })

const testo = defineModel<string>('testo', { default: '' })
const scheda = defineModel<string>('scheda', { required: true })
const emit = defineEmits<{ nuova: []; opzioni: [] }>()

const gruppoSchede = ref<HTMLElement | null>(null)
useTalosSlidingIndicator(gruppoSchede, toRef(() => scheda.value))
const onda = useTalosTouchWave()

/** `ChatsScreen.vue:187-195`: le frecce scelgono la scheda vicina e le portano il fuoco */
function frecciaSchede(event: KeyboardEvent): void {
    const passo = event.key === 'ArrowRight' || event.key === 'ArrowDown' ? 1 : event.key === 'ArrowLeft' || event.key === 'ArrowUp' ? -1 : 0
    if (passo === 0 || !props.schede.length) return
    event.preventDefault()
    const indice = props.schede.findIndex((s) => s.id === scheda.value)
    const prossimo = props.schede[(indice + passo + props.schede.length) % props.schede.length]!.id
    scheda.value = prossimo
    void nextTick(() => gruppoSchede.value?.querySelector<HTMLElement>(`[data-testid="${props.testIdPrefix}-filter-${prossimo}"]`)?.focus())
}
</script>

<template>
    <TalosMobilePageHeader
        class="px-[var(--talos-space-page)] pt-[var(--talos-space-section)]"
        :title="titolo"
        :subtitle="frase"
        :sheet-title="false"
        :subtitle-testid="`${testIdPrefix}-subtitle`"
    >
        <template #action>
            <Button
                v-if="nuovaEtichetta && !tablet && !nuovaConNome"
                type="button"
                :data-testid="`${testIdPrefix}-new`"
                :aria-label="nuovaEtichetta"
                class="talos-pressable talos-wave-host size-12 shrink-0 rounded-[var(--talos-radius-control)] bg-[var(--talos-accent)] p-0 text-[var(--talos-accent-text)] hover:bg-[var(--talos-accent-hover)]"
                @click="emit('nuova')"
                @pointerdown="onda.onPointerDown"
            >
                <Plus class="size-5" aria-hidden="true" />
            </Button>
        </template>
    </TalosMobilePageHeader>

    <div class="mt-[var(--talos-space-section)] flex items-stretch gap-[var(--talos-space-inline)] px-[var(--talos-space-page)]">
        <div class="relative min-w-0 flex-1">
            <Search class="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[var(--talos-muted)]" aria-hidden="true" />
            <input
                v-model="testo"
                :data-testid="`${testIdPrefix}-search`"
                type="search"
                :aria-label="cercaEtichetta"
                :placeholder="cercaEtichetta"
                class="min-h-touch w-full rounded-[var(--talos-radius-control)] border border-[var(--talos-border)] bg-[var(--talos-panel)] pl-9 pr-3 text-sm text-[var(--talos-text)] outline-none placeholder:text-[var(--talos-muted)] focus:border-[var(--talos-accent)] focus-visible:ring-2 focus-visible:ring-[var(--talos-ring)]"
            >
        </div>
        <slot name="strumenti" />
        <Button
            type="button"
            size="icon"
            variant="ghost"
            :data-testid="`${testIdPrefix}-options`"
            :aria-label="opzioniEtichetta"
            aria-haspopup="dialog"
            :aria-expanded="opzioniAperte"
            class="relative min-h-touch min-w-touch shrink-0 rounded-[var(--talos-radius-control)] border border-[var(--talos-border)]"
            @click="emit('opzioni')"
        >
            <SlidersHorizontal class="size-5" aria-hidden="true" />
            <span
                v-if="opzioniAccese > 0"
                :data-testid="`${testIdPrefix}-options-active`"
                aria-hidden="true"
                class="absolute -right-1.5 -top-1.5 grid min-h-[var(--talos-space-section)] min-w-[var(--talos-space-section)] place-items-center rounded-full bg-[var(--talos-accent)] px-[calc(var(--talos-space-inline)/2)] text-3xs font-semibold tabular-nums text-[var(--talos-accent-contrast)]"
            >{{ opzioniAccese }}</span>
        </Button>
        <!-- E4: col nome da leggere anche sul telefono; al più metà riga e due righe (D-MOCK-9), così la ricerca resta usabile -->
        <Button
            v-if="nuovaEtichetta && (tablet || nuovaConNome)"
            type="button"
            :data-testid="`${testIdPrefix}-new`"
            :aria-label="nuovaEtichetta"
            class="talos-pressable talos-wave-host min-h-touch shrink-0 gap-2 rounded-[var(--talos-radius-control)] bg-[var(--talos-accent)] px-5 text-sm font-medium text-[var(--talos-accent-text)] hover:bg-[var(--talos-accent-hover)]"
            :class="{ 'max-w-[45%]': nuovaConNome }"
            @click="emit('nuova')"
            @pointerdown="onda.onPointerDown"
        >
            <Plus class="size-5" aria-hidden="true" />
            <span :data-testid="`${testIdPrefix}-new-label`" :class="{ 'line-clamp-2 min-w-0 whitespace-normal text-left': nuovaConNome }">{{ nuovaBreve || nuovaEtichetta }}</span>
        </Button>
    </div>

    <div
        ref="gruppoSchede"
        role="radiogroup"
        :aria-label="schedeEtichetta"
        :data-testid="`${testIdPrefix}-filters`"
        class="mx-[var(--talos-space-page)] mt-[var(--talos-space-card)] flex min-h-touch items-center gap-[var(--talos-space-inline)] overflow-x-auto border-b border-[var(--talos-border)] [scrollbar-width:none]"
        @keydown="frecciaSchede"
    >
        <button
            v-for="s in schede"
            :key="s.id"
            type="button"
            role="radio"
            :aria-checked="scheda === s.id"
            :tabindex="scheda === s.id ? 0 : -1"
            :data-testid="`${testIdPrefix}-filter-${s.id}`"
            :class="[
                'talos-pressable talos-wave-host relative inline-flex min-h-touch shrink-0 items-center gap-[var(--talos-space-inline)] whitespace-nowrap rounded-[var(--talos-radius-control)] px-[var(--talos-space-control)] text-xs',
                scheda === s.id ? 'text-[var(--talos-text)]' : 'text-[var(--talos-muted)]',
            ]"
            @click="scheda = s.id"
            @pointerdown="onda.onPointerDown"
        >
            <span>{{ s.label }}</span>
            <small class="text-2xs tabular-nums">{{ s.count }}</small>
            <span
                v-if="scheda === s.id"
                data-talos-indicator
                aria-hidden="true"
                class="talos-calm-indicator absolute bottom-0 left-[var(--talos-space-control)] right-[var(--talos-space-control)] h-[2px] rounded-full bg-[var(--talos-accent)]"
            />
        </button>
    </div>
    <div class="flex min-h-touch items-center px-[var(--talos-space-page)] text-xs text-[var(--talos-muted)]">
        <span role="status" aria-live="polite" :data-testid="`${testIdPrefix}-count`">{{ conteggio }}</span>
        <slot name="conteggio-fine" />
    </div>
</template>
