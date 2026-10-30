<script setup lang="ts">
/**
 * ⭐ LE SCHEDE DEI FORNITORI del foglio «Modello e ragionamento» (owner 27/10/2026: «Bisogna anche organizzare più provider con
 * Tab pill a scorrimento»; mockup approvato, versioni 6 e 7). Pillole che scorrono in orizzontale, con l'aggancio; lo sfondo della
 * scheda attiva scivola fino a quella toccata (col movimento ridotto salta) e la scheda si centra da sola.
 *   · Pattern APG «Tabs» (W3C): `tablist`, `tab` con `aria-selected`, il suo `id` e `aria-controls` verso il pannello (che chi
 *     monta le schede dichiara `tabpanel`, nominato dalla scheda attiva), un solo punto di tabulazione, frecce sinistra/destra,
 *     Inizio/Fine; attivazione automatica, perché passare da un fornitore all'altro non costa niente.
 *   · Un puntino segna la scheda del modello scelto quando se ne guarda un'altra.
 *   · Gli stili stanno qui (scoped): il selettore è caricato a richiesta col foglio, quindi non pesano sull'avvio (tetto CSS 240.000).
 */
import { nextTick, onMounted, ref, watch } from 'vue'
import { WandSparkles } from '@lucide/vue'
import TalosMobileProviderIcon from '@/components/models/TalosMobileProviderIcon.vue'

export interface TalosSchedaFornitore {
    /** Il fornitore (`chatgpt`, `local`, …) o `__rotte` per l'instradamento automatico. */
    readonly id: string
    readonly nome: string
    readonly quanti: number
}

const props = defineProps<{
    schede: readonly TalosSchedaFornitore[]
    attiva: string
    /** La scheda dove sta il modello (o la rotta) scelto. */
    delModello: string | null
    etichetta: string
    etichettaModelloQui: string
    /** L'id del pannello (`role="tabpanel"`) che le schede controllano. */
    pannello: string
}>()
const emit = defineEmits<{ scegli: [id: string] }>()
/** L'id di una scheda: chi monta il pannello lo usa per `aria-labelledby`. */
const talosIdScheda = (id: string) => `talos-provider-tab-${id}`

const striscia = ref<HTMLElement | null>(null)
const segno = ref({ x: 0, w: 0, pronto: false })

/** La scheda col suo id, senza selettori costruiti a mano (CSS.escape non c'è dappertutto). */
function schedaCon(id: string): HTMLElement | undefined {
    return Array.from(striscia.value?.querySelectorAll<HTMLElement>('[data-scheda]') ?? []).find((el) => el.dataset.scheda === id)
}

/** ⛔ D4 (Pad 28/10/2026): il minimo (nearest) con un margine (scroll-padding), non al centro: la prima scheda restava tagliata. */
function misura(): void {
    const el = schedaCon(props.attiva)
    if (!el) return
    segno.value = { x: el.offsetLeft, w: el.offsetWidth, pronto: el.offsetWidth > 0 }
    const ridotto = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches
    el.scrollIntoView?.({ block: 'nearest', inline: 'nearest', behavior: ridotto ? 'auto' : 'smooth' })
}
onMounted(() => { void nextTick(misura) })
watch(() => [props.attiva, props.schede.length], () => { void nextTick(misura) })

function sposta(e: KeyboardEvent, i: number): void {
    const ultimo = props.schede.length - 1
    const dove = e.key === 'ArrowRight' ? Math.min(ultimo, i + 1)
        : e.key === 'ArrowLeft' ? Math.max(0, i - 1)
            : e.key === 'Home' ? 0
                : e.key === 'End' ? ultimo
                    : -1
    if (dove < 0 || dove === i) return
    e.preventDefault()
    const id = props.schede[dove]!.id
    emit('scegli', id)
    void nextTick(() => schedaCon(id)?.focus())
}
</script>

<template>
    <div ref="striscia" class="talos-provider-tabs" role="tablist" :aria-label="etichetta" data-testid="talos-provider-tabs">
        <span
            class="talos-provider-tabs__segno"
            :class="{ 'is-pronto': segno.pronto }"
            :style="{ transform: `translateX(${segno.x}px)`, width: `${segno.w}px` }"
            aria-hidden="true"
        />
        <button
            v-for="(scheda, i) in schede"
            :key="scheda.id"
            type="button"
            role="tab"
            class="talos-pressable talos-provider-tabs__scheda"
            :class="{ 'is-attiva': scheda.id === attiva }"
            :aria-selected="scheda.id === attiva"
            :tabindex="scheda.id === attiva ? 0 : -1"
            :data-scheda="scheda.id"
            :id="talosIdScheda(scheda.id)"
            :aria-controls="pannello"
            @click="emit('scegli', scheda.id)"
            @keydown="sposta($event, i)"
        >
            <WandSparkles v-if="scheda.id === '__rotte'" class="talos-provider-tabs__bacchetta" aria-hidden="true" />
            <TalosMobileProviderIcon v-else :provider="scheda.id" class="talos-provider-tabs__icona" />
            <span>{{ scheda.nome }}</span>
            <span class="talos-provider-tabs__quanti">{{ scheda.quanti }}</span>
            <span
                v-if="scheda.id === delModello && scheda.id !== attiva"
                data-testid="talos-provider-tab-chosen"
                class="talos-provider-tabs__scelto"
                role="img"
                :aria-label="etichettaModelloQui"
            />
        </button>
    </div>
</template>

<style scoped>
.talos-provider-tabs {
    position: relative; display: flex; gap: 0.375rem; overflow-x: auto; padding: 0 0.25rem 0.25rem;
    scroll-snap-type: x proximity; scroll-padding-inline: 2rem; scrollbar-width: none; touch-action: pan-x;
}
.talos-provider-tabs::-webkit-scrollbar { display: none; }
.talos-provider-tabs__scheda {
    position: relative; z-index: 1; display: inline-flex; flex-shrink: 0; align-items: center; gap: 0.5rem;
    min-height: var(--talos-touch-target); padding: 0 0.875rem 0 0.5rem; border: 1px solid var(--talos-border); border-radius: 9999px;
    scroll-snap-align: start; color: var(--talos-muted); font-size: var(--text-sm); white-space: nowrap;
    transition: color 200ms ease, border-color 200ms ease;
}
.talos-provider-tabs__scheda.is-attiva { color: var(--talos-text); border-color: transparent; }
.talos-provider-tabs__scheda:focus-visible { outline: 2px solid var(--talos-ring, var(--talos-accent)); outline-offset: 2px; }
.talos-provider-tabs__icona { width: 1.75rem; height: 1.75rem; }
.talos-provider-tabs__bacchetta { width: 1.25rem; height: 1.25rem; margin-inline: 0.25rem; color: var(--talos-accent); }
.talos-provider-tabs__quanti { font-size: var(--text-xs); color: var(--talos-muted); font-variant-numeric: tabular-nums; }
.talos-provider-tabs__scelto {
    position: absolute; top: 0.375rem; right: 0.375rem; width: 0.375rem; height: 0.375rem; border-radius: 9999px; background: var(--talos-accent);
}
.talos-provider-tabs__segno {
    position: absolute; left: 0; top: 0; z-index: 0; height: var(--talos-touch-target); border-radius: 9999px; opacity: 0;
    background: var(--talos-accent-soft); box-shadow: inset 0 0 0 1px var(--talos-accent);
    transition: transform 320ms cubic-bezier(0.34, 1.4, 0.64, 1), width 320ms cubic-bezier(0.34, 1.4, 0.64, 1), opacity 150ms ease;
}
.talos-provider-tabs__segno.is-pronto { opacity: 1; }
/* in jsdom e prima della prima misura il segno non c'è: la scheda attiva si riconosce comunque dal testo pieno */
@media (prefers-reduced-motion: reduce) { .talos-provider-tabs__segno { transition: opacity 150ms ease; } }
</style>
