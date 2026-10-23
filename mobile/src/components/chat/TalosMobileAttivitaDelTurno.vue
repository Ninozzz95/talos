<script setup lang="ts">
import { computed, defineAsyncComponent, reactive } from 'vue'
import { useTalosI18n } from '@/i18n'
import TalosMobileReasoningBlock from '@/components/chat/TalosMobileReasoningBlock.vue'
import TalosMobileRunningToolRow from '@/components/chat/TalosMobileRunningToolRow.vue'
import TalosMobileTraceRow from '@/components/chat/TalosMobileTraceRow.vue'
import TalosMobileGruppoAttrezzi from '@/components/chat/TalosMobileGruppoAttrezzi.vue'
import {
    talosBlocchiDelTurno,
    talosSegmentiDaiConfini,
    talosSequenzaDaMetadata,
    TALOS_SOGLIA_GRUPPO_ATTREZZI,
    type TalosAttrezzoDelGiro,
    type TalosConfineDelGiro,
    type TalosRigaDelBlocco,
    type TalosVoceDelBlocco,
    type TalosSegmentoDelTurno,
} from '@/lib/chat/sequenzaDelTurno'
import { talosToolActivityLabel, talosToolIconName } from '@/lib/tools/toolLabels'
import { TALOS_TOOL_ICONS } from '@/lib/tools/toolIcons'
import { talosParolaAttrezzo } from '@/lib/chat/parolaAttrezzo'
import { talosElapsedLabel } from '@/composables/useTalosElapsed'

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
    /**
     * ⛔ Owner 20/10/2026 (righe perse dopo le approvazioni): mentre scrive, la linea del tempo GIÀ salvata che viene prima dei
     * giri in corso (la ripresa dopo «Consenti» continua la bolla sospesa). Stesso formato di `salvata`; righe mai «in corso».
     */
    prima?: unknown
    /** Quanto è durato il turno finito (r4 `durataMs`): l'ultimo gruppo dice «Worked for X · N steps» (owner 22/10/2026). */
    durataMs?: number
}>()

const TalosMobileMessageContent = defineAsyncComponent(() => import('@/components/chat/TalosMobileMessageContent.vue'))
const { t, locale } = useTalosI18n()

/** L'indice dell'ultimo blocco di passi: solo lui dice per quanto ha lavorato il turno. */
const ultimoBloccoDiPassi = computed(() => blocchi.value.map((b) => b.tipo).lastIndexOf('attrezzi'))

/** «4 steps», o a turno finito e con la durata vera «Worked for 1m 35s · 4 steps» sull'ultimo gruppo. */
function passi(righe: readonly TalosRigaDelBlocco[], indice: number): string {
    const quanti = t('chat.toolGroupSteps', { count: righe.length })
    const secondi = Math.round((props.durataMs ?? 0) / 1000)
    if (props.salvata === undefined || indice !== ultimoBloccoDiPassi.value || !talosElapsedLabel(secondi)) return quanti
    return t('chat.toolGroupWorked', { durata: talosElapsedLabel(secondi), passi: quanti })
}

const daSalvata = computed(() => (props.salvata === undefined ? null : talosSequenzaDaMetadata(props.salvata)))
/** La parte già salvata che precede i giri in corso: vuota se non c'è o se è storta (allora si mostra solo il giro vivo). */
const daPrima = computed<TalosSegmentoDelTurno[]>(() => (props.prima === undefined ? [] : talosSequenzaDaMetadata(props.prima) ?? []))

const segmenti = computed<TalosSegmentoDelTurno[]>(() => {
    if (props.salvata !== undefined) {
        return daSalvata.value ?? (props.testo ? [{ tipo: 'testo', testo: props.testo }] : [])
    }
    return [...daPrima.value, ...segmentiVivi.value]
})

/** I segmenti del giro che sta arrivando (senza la parte già salvata, `prima`). */
const segmentiVivi = computed<TalosSegmentoDelTurno[]>(() => {
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

/** La parola della riga (`lib/chat/parolaAttrezzo.ts`: chat, poi nome umano del Codice r4). */
function parola(nome: string): string | undefined {
    return talosParolaAttrezzo(nome, t, locale.value)
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
    // La parte già salvata è conclusa.
    if (indice < daPrima.value.length) return false
    if (!(props.confini?.length)) return true
    return Boolean(props.vivo) && indice === segmenti.value.length - 1
}

/**
 * ⛔ Owner 20/10/2026 (difetto 2): i giri di attrezzi consecutivi in un blocco solo; da `TALOS_SOGLIA_GRUPPO_ATTREZZI` righe in
 * su il blocco è un gruppo che si apre al tocco (`TalosMobileGruppoAttrezzi`). Sotto la soglia resta tutto come prima.
 */
const blocchi = computed(() => talosBlocchiDelTurno(segmenti.value, inCorso))
/** I gruppi aperti, per posizione del blocco: chiusi di serie. */
const aperti = reactive(new Set<number>())

function cambia(indice: number): void {
    if (aperti.has(indice)) aperti.delete(indice)
    else aperti.add(indice)
}

/** Un gruppo serve se piega qualcosa: almeno una riga conclusa. Tutte in corso (un giro solo che corre) restano righe. */
function raggruppato(righe: readonly TalosRigaDelBlocco[]): boolean {
    return righe.length >= TALOS_SOGLIA_GRUPPO_ATTREZZI && righe.some((voce) => !voce.inCorso)
}

/**
 * Le righe a schermo: tutte se il gruppo è aperto (o non è un gruppo); chiuso, solo quelle ancora in corso, come la riga viva di
 * Hermes (`ToolRunTicker`). Le chiamate in corso sono dello stesso giro e corrono insieme, ognuna col suo orologio: si vedono
 * tutte, si piegano quelle concluse.
 */
function visibili(blocco: { righe: readonly TalosRigaDelBlocco[]; voci: readonly TalosVoceDelBlocco[] }, indice: number): readonly TalosVoceDelBlocco[] {
    if (!raggruppato(blocco.righe) || aperti.has(indice)) return blocco.voci
    // chiuso: solo gli attrezzi ancora in corso; i ragionamenti stanno dentro il gruppo (decisione owner 22/10/2026)
    return blocco.voci.filter((voce) => voce.tipo === 'attrezzo' && voce.riga.inCorso)
}

/** La riga di riassunto: ogni attrezzo con la sua parola, contato, nell'ordine in cui è comparso («Searching the web ×2, …»). */
function riassunto(righe: readonly TalosRigaDelBlocco[]): string {
    const conte = new Map<string, number>()
    for (const { attrezzo } of righe) {
        const etichetta = talosToolActivityLabel({ name: attrezzo.name, detail: null }, parola(attrezzo.name))
        conte.set(etichetta, (conte.get(etichetta) ?? 0) + 1)
    }
    return [...conte].map(([etichetta, quante]) => (quante > 1 ? `${etichetta} ×${quante}` : etichetta)).join(', ')
}
</script>

<template>
    <template v-for="(blocco, indice) in blocchi" :key="`${indice}-${blocco.tipo}`">
        <TalosMobileReasoningBlock v-if="blocco.tipo === 'ragionamento'" :reasoning="blocco.testo" data-segmento="ragionamento" />
        <div v-else-if="blocco.tipo === 'testo'" class="assistant-text" data-segmento="testo">
            <TalosMobileMessageContent :content="blocco.testo" line-breaks />
        </div>
        <div
            v-else
            class="mb-0.5"
            :data-testid="blocco.righe.some((voce) => voce.inCorso) ? 'talos-tool-activity' : 'talos-tool-trail'"
            data-segmento="attrezzi"
        >
            <TalosMobileGruppoAttrezzi
                v-if="raggruppato(blocco.righe)"
                :riassunto="riassunto(blocco.righe)"
                :passi="passi(blocco.righe, indice)"
                :vivo="blocco.righe.some((voce) => voce.inCorso)"
                :aperto="aperti.has(indice)"
                @cambia="cambia(indice)"
            >
                <template #icon>
                    <component :is="riga(blocco.righe[blocco.righe.length - 1]!.attrezzo).icon" class="size-3.5" />
                </template>
                <template v-for="(voce, posizione) in visibili(blocco, indice)" :key="`${posizione}-${voce.tipo}`">
                    <TalosMobileReasoningBlock v-if="voce.tipo === 'ragionamento'" :reasoning="voce.testo" data-segmento="ragionamento" />
                    <TalosMobileRunningToolRow v-else-if="voce.riga.inCorso" :label="riga(voce.riga.attrezzo).label" data-voce="attrezzo">
                        <template #icon>
                            <component :is="riga(voce.riga.attrezzo).icon" class="size-3.5" />
                        </template>
                    </TalosMobileRunningToolRow>
                    <TalosMobileTraceRow v-else :label="riga(voce.riga.attrezzo).label" :interactive="false" data-voce="attrezzo">
                        <template #icon>
                            <component :is="riga(voce.riga.attrezzo).icon" class="size-3.5" />
                        </template>
                    </TalosMobileTraceRow>
                </template>
            </TalosMobileGruppoAttrezzi>
            <template v-else>
                <template v-for="(voce, posizione) in blocco.voci" :key="`${posizione}-${voce.tipo}`">
                    <TalosMobileReasoningBlock v-if="voce.tipo === 'ragionamento'" :reasoning="voce.testo" data-segmento="ragionamento" />
                    <TalosMobileRunningToolRow v-else-if="voce.riga.inCorso" :label="riga(voce.riga.attrezzo).label" data-voce="attrezzo">
                        <template #icon>
                            <component :is="riga(voce.riga.attrezzo).icon" class="size-3.5" />
                        </template>
                    </TalosMobileRunningToolRow>
                    <TalosMobileTraceRow v-else :label="riga(voce.riga.attrezzo).label" :interactive="false" data-voce="attrezzo">
                        <template #icon>
                            <component :is="riga(voce.riga.attrezzo).icon" class="size-3.5" />
                        </template>
                    </TalosMobileTraceRow>
                </template>
            </template>
        </div>
    </template>
</template>
