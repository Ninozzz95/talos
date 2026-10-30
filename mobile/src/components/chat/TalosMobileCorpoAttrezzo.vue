<script setup lang="ts">
/**
 * ⛔ T8 (censimento «Avvisi ed errori», punto c; mockup approvato dal Desktop il 27/10/2026, forma A): il corpo della riga d'attrezzo
 * aperta, come sul PC — argomenti, la frase del NO del kernel sopra il suo testo, la riga d'esito di un comando fallito, «Output» e
 * «Diagnostica», il taglio a 200 righe. I pezzi e le parole sono di `corpoAttrezzoR4` (port del PC @ r4 79ea996de); qui il disegno.
 *
 * Il riquadro scorre dentro di sé oltre ~14rem (Hermes `max-h-56`, `index.css:841` del PC) e, finché sotto c'è altro, sfuma in fondo
 * per 24px (punto 3 del Desktop: una riga tagliata a metà senza segno era un difetto). Caricato a richiesta: solo quando si apre.
 */
import { computed, onBeforeUnmount, onMounted, reactive, ref } from 'vue'
import { ChevronRight } from '@lucide/vue'
import { useTalosI18n } from '@/i18n'
import { corpoAttrezzoR4 } from '@/lib/harness/r4/corpoAttrezzoR4'
import type { ChiamataApribileR4 } from '@/lib/harness/r4/corpoApribileR4'

const props = defineProps<{ chiamata: ChiamataApribileR4 }>()
const { locale } = useTalosI18n()
const pezzi = computed(() => corpoAttrezzoR4(props.chiamata, locale.value))

/** I valori lunghi aperti a richiesta (per posizione del pezzo): chiusi di serie, come sul PC. */
const lunghiAperti = reactive(new Set<number>())

const riquadro = ref<HTMLElement | null>(null)
/** Vero finché sotto c'è altro da leggere: la sfumatura in fondo lo dice. */
const altroSotto = ref(false)
function misura(): void {
    const el = riquadro.value
    altroSotto.value = Boolean(el && el.scrollHeight - el.scrollTop - el.clientHeight > 1)
}
let osservatore: ResizeObserver | null = null
onMounted(() => {
    misura()
    if (typeof ResizeObserver !== 'undefined' && riquadro.value) {
        osservatore = new ResizeObserver(misura)
        osservatore.observe(riquadro.value)
    }
})
onBeforeUnmount(() => osservatore?.disconnect())
</script>

<template>
    <div class="corpo" data-testid="talos-tool-body">
        <div
            ref="riquadro"
            class="riquadro"
            tabindex="0"
            :data-altro-sotto="altroSotto ? 'true' : 'false'"
            @scroll.passive="misura"
        >
            <template v-for="(p, i) in pezzi" :key="i">
                <p v-if="p.tipo === 'no'" class="frase" data-pezzo="no">{{ p.frase }}</p>
                <p v-else-if="p.tipo === 'esito'" class="mono forte" data-pezzo="esito">{{ p.riga }}</p>
                <div v-else-if="p.tipo === 'argomento'" class="piccolo" :class="p.forma === 'lungo' ? 'riga-lunga' : ''" data-pezzo="argomento">
                    <span class="tenue">{{ `${p.etichetta}: ` }}</span>
                    <span v-if="p.forma === 'riga'" class="mono forte">{{ p.valore }}</span>
                    <template v-else-if="p.forma === 'lungo'">
                        <!-- il `<details>` del PC (`app.js:16206`): quanto è grande, e si apre solo se lo chiedi -->
                        <button
                            type="button"
                            class="lungo tenue"
                            data-testid="talos-tool-arg-long"
                            :aria-expanded="lunghiAperti.has(i) ? 'true' : 'false'"
                            @click="lunghiAperti.has(i) ? lunghiAperti.delete(i) : lunghiAperti.add(i)"
                        >
                            <ChevronRight class="freccia" :class="lunghiAperti.has(i) ? 'girata' : ''" aria-hidden="true" />{{ p.caratteri }}
                        </button>
                        <pre v-if="lunghiAperti.has(i)" class="mono forte">{{ p.valore }}</pre>
                    </template>
                    <pre v-else class="mono forte">{{ p.valore }}</pre>
                </div>
                <pre v-else-if="p.tipo === 'argomentiGrezzi'" class="mono forte" data-pezzo="argomenti">{{ p.testo }}</pre>
                <div v-else-if="p.tipo === 'flusso'" data-pezzo="flusso">
                    <p class="piccolo tenue">{{ p.etichetta }}</p>
                    <pre class="mono forte">{{ p.testo }}</pre>
                    <p v-if="p.tagliato" class="piccolo tenue">{{ p.tagliato }}</p>
                </div>
                <div v-else data-pezzo="blocco">
                    <pre class="mono tenue">{{ p.testo }}</pre>
                    <p v-if="p.tagliato" class="piccolo tenue">{{ p.tagliato }}</p>
                </div>
            </template>
        </div>
    </div>
</template>

<!-- CSS del componente, non classi globali: il corpo arriva solo quando una riga si apre, e il foglio d'avvio non lo paga. -->
<style scoped>
.corpo { margin: 0 0 0.375rem 0.4375rem; border-left: 1px solid var(--talos-border); padding-left: 0.625rem; }
.riquadro {
    max-height: 14rem; overflow: auto; overscroll-behavior: contain; display: flex; flex-direction: column; gap: 0.375rem;
    border-radius: var(--talos-radius-control); background: var(--talos-panel-soft); padding: 0.5rem 0.625rem;
}
/* punto 3 del Desktop: finché sotto c'è altro, 24px di sfumatura in fondo dicono che il testo continua */
.riquadro[data-altro-sotto='true'] { mask-image: linear-gradient(to bottom, black calc(100% - 24px), transparent); }
.frase { font-size: var(--text-xs); line-height: 1.375; color: var(--talos-text); }
.piccolo { font-size: var(--text-2xs); line-height: 1.55; }
.mono { font-family: var(--talos-font-mono); font-size: var(--text-2xs); line-height: 1.55; white-space: pre-wrap; overflow-wrap: anywhere; margin: 0; }
.forte { color: var(--talos-text); }
.tenue { color: var(--talos-muted); }
/* il valore lungo si apre col dito: 44px di bersaglio, la stessa freccia delle righe. Etichetta e pulsante sulla stessa linea
   (Pad 27/10: col pulsante alto 44px l'etichetta scendeva sotto la sua linea); il valore aperto va a capo su tutta la larghezza. */
.riga-lunga { display: flex; flex-wrap: wrap; align-items: center; }
.riga-lunga > pre { flex-basis: 100%; }
.lungo { display: inline-flex; min-height: 2.75rem; align-items: center; gap: 0.25rem; font: inherit; background: none; border: 0; padding: 0; }
.freccia { width: 0.75rem; height: 0.75rem; flex-shrink: 0; transition: transform 150ms; }
.freccia.girata { transform: rotate(90deg); }
@media (prefers-reduced-motion: reduce) { .freccia { transition: none; } }
</style>
