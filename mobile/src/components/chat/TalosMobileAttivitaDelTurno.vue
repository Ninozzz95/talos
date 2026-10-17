<script setup lang="ts">
import { computed, defineAsyncComponent } from 'vue'
import { useTalosI18n } from '@/i18n'
import TalosMobileReasoningBlock from '@/components/chat/TalosMobileReasoningBlock.vue'
import TalosMobileRunningToolRow from '@/components/chat/TalosMobileRunningToolRow.vue'
import TalosMobileTraceRow from '@/components/chat/TalosMobileTraceRow.vue'
import {
    talosSegmentiDaiConfini,
    talosSequenzaDaMetadata,
    type TalosAttrezzoDelGiro,
    type TalosConfineDelGiro,
    type TalosSegmentoDelTurno,
} from '@/lib/chat/sequenzaDelTurno'
import { talosToolActivityLabel, talosToolIconName, TALOS_TOOL_LABEL_KEYS } from '@/lib/tools/toolLabels'
import { TALOS_TOOL_ICONS } from '@/lib/tools/toolIcons'
import { nomeUmanoAttrezzoR4 } from '@/lib/harness/r4/agentiR4'

/**
 * ⭐⭐⭐ N13 — il turno dell'assistente nell'ordine in cui è successo: ragionamento, righe degli attrezzi, testo, giro dopo giro.
 *
 * Owner 02/10/2026, con la foto dal Pad: la riga «Ricerca sul web…» stava SOPRA il ragionamento. Decisioni del 09/10:
 * - le righe restano al loro posto anche a risposta finita e dopo il reload;
 * - un ragionamento per giro;
 * - solo l'ordine cronologico.
 * Modello: PocketPal (Message.tsx:340-385), che per ogni passo mette ragionamento, testo e attrezzi.
 *
 * Due modi, gli stessi pezzi:
 * - **mentre scrive** (`confini`): i giri già chiusi. La coda viva (ragionamento e testo dopo l'ultimo giro) resta alla risposta in
 *   streaming, col suo ritmo di scrittura. Le righe dell'ultimo giro sono «in corso» finché la coda è vuota (`vivo`).
 * - **messaggio salvato** (`salvata`): la sequenza del metadata. Se è storta si mostra il testo, come oggi.
 *
 * Caricato a richiesta: l'app non lo paga all'avvio.
 */
const props = defineProps<{
    confini?: readonly TalosConfineDelGiro[]
    testo?: string
    ragionamento?: string
    /** Gli attrezzi del giro in corso. Senza confini (un percorso che non li registra) si mostrano comunque, come prima. */
    attivi?: readonly TalosAttrezzoDelGiro[]
    vivo?: boolean
    salvata?: unknown
}>()

const TalosMobileMessageContent = defineAsyncComponent(() => import('@/components/chat/TalosMobileMessageContent.vue'))
const { t, locale } = useTalosI18n()

const daSalvata = computed(() => (props.salvata === undefined ? null : talosSequenzaDaMetadata(props.salvata)))

const segmenti = computed<TalosSegmentoDelTurno[]>(() => {
    if (props.salvata !== undefined) {
        return daSalvata.value ?? (props.testo ? [{ tipo: 'testo', testo: props.testo }] : [])
    }
    const confini = props.confini ?? []
    if (confini.length === 0) {
        // ⛔ SEQ-REG-PAD-01: un attrezzo senza nome (chiamata storta del modello) non diventa una riga vuota.
        const attivi = (props.attivi ?? []).filter((attrezzo) => /\S/.test(attrezzo.name))
        return attivi.length ? [{ tipo: 'attrezzi', attrezzi: attivi }] : []
    }
    // Solo i giri chiusi: la coda la scrive la risposta in streaming.
    const ultimo = confini[confini.length - 1]!
    return talosSegmentiDaiConfini(confini, (props.testo ?? '').slice(0, ultimo.testo), (props.ragionamento ?? '').slice(0, ultimo.ragionamento))
})

/**
 * La parola della riga: quella della chat se la chat conosce l'attrezzo; altrimenti il nome umano del desktop r4 (gli attrezzi del
 * Codice: «shell», «leggi», «delega_sottotask»…) con l'iniziale maiuscola, come `comeTitolo` (`legacy/app.js:9859` @ fc5).
 */
function parola(nome: string): string | undefined {
    const chiave = TALOS_TOOL_LABEL_KEYS[nome]
    if (chiave) return t(chiave)
    const umano = nomeUmanoAttrezzoR4(nome, locale.value)
    return umano ? umano.charAt(0).toLocaleUpperCase(locale.value) + umano.slice(1) : undefined
}

function riga(attrezzo: TalosAttrezzoDelGiro) {
    return {
        label: talosToolActivityLabel(attrezzo, parola(attrezzo.name)),
        icon: TALOS_TOOL_ICONS[talosToolIconName(attrezzo.name)],
    }
}

/** Le righe dell'ultimo giro sono «in corso» solo mentre scrive e finché dopo di loro non è arrivato niente. */
function inCorso(indice: number): boolean {
    if (props.salvata !== undefined) return false
    if (!(props.confini?.length)) return true
    return Boolean(props.vivo) && indice === segmenti.value.length - 1
}
</script>

<template>
    <template v-for="(segmento, indice) in segmenti" :key="`${indice}-${segmento.tipo}`">
        <TalosMobileReasoningBlock v-if="segmento.tipo === 'ragionamento'" :reasoning="segmento.testo" data-segmento="ragionamento" />
        <div v-else-if="segmento.tipo === 'testo'" class="assistant-text" data-segmento="testo">
            <TalosMobileMessageContent :content="segmento.testo" line-breaks />
        </div>
        <div
            v-else
            class="mb-0.5"
            :data-testid="inCorso(indice) ? 'talos-tool-activity' : 'talos-tool-trail'"
            data-segmento="attrezzi"
        >
            <template v-for="(attrezzo, posizione) in segmento.attrezzi" :key="`${attrezzo.name}:${attrezzo.detail ?? ''}:${posizione}`">
                <TalosMobileRunningToolRow v-if="inCorso(indice)" :label="riga(attrezzo).label">
                    <template #icon>
                        <component :is="riga(attrezzo).icon" class="size-3.5" />
                    </template>
                </TalosMobileRunningToolRow>
                <TalosMobileTraceRow v-else :label="riga(attrezzo).label" :interactive="false">
                    <template #icon>
                        <component :is="riga(attrezzo).icon" class="size-3.5" />
                    </template>
                </TalosMobileTraceRow>
            </template>
        </div>
    </template>
</template>
