<script setup lang="ts">
/**
 * ⛔ K3-C3b-2b (ledger `LEDGER-K3-CODICE-COME-LA-CHAT-2026-10-15.md`): la scheda «Agenti» del pannello ▤ del Codice su r4, come il
 * desktop r4 @ fc5e25d62 (`inspector.js`, `disegnaAgenti` :1466-1730): con più richieste che hanno delegato gli agenti stanno in
 * gruppi per richiesta («Questa richiesta» / «Richiesta delle {ora}» col testo, «N agenti · M di N terminati»), la più recente in
 * cima e aperta, le altre ripiegate; una ricerca o un filtro apre tutto. La riga: compito corto, stato a parole, descrizione,
 * attrezzo in corso, ora d'avvio, figli, quello che ha fatto, le collisioni. Tocco = apre la conversazione della delega.
 * Scelte dell'owner (15/10, «Elenco a gruppi»): ricerca e filtro per stato solo oltre 10 agenti; il menu «…» della delega e il
 * diagramma dopo. Le regole stanno in `agentiR4.ts`.
 */
import { computed, reactive, ref } from 'vue'
import { Bot, ChevronDown, ChevronRight } from '@lucide/vue'
import { useTalosI18n } from '@/i18n'
import {
    contoDellaRichiestaR4, conteggioAgentiR4, conteggioInteroR4, etichettaDelegaR4, gruppiAgentiR4, nomeDellAgenteR4, nomeDiRipiegoAttrezzoR4, nomeUmanoAttrezzoR4, oraBreveR4,
    pluraleAgentiR4, senzaInganniSuPiuRigheR4, statoDelegaR4, testoAgentiR4, troncaR4,
    type AgenteDelPannelloR4, type StatoDelegaR4,
} from '@/lib/harness/r4/agentiR4'
import './codiceR4.css'

const props = defineProps<{
    agenti: AgenteDelPannelloR4[]
    /** Il perché dell'ultima lettura non riuscita (gli agenti restano quelli di prima), o `null`. */
    errore: string | null
}>()
const emit = defineEmits<{ apri: [sessionId: string] }>()
const { locale } = useTalosI18n()
const tr = (k: string, v?: Record<string, unknown>) => testoAgentiR4(k, locale.value, v)
const tn = (uno: string, molti: string, n: number, v?: Record<string, unknown>) => pluraleAgentiR4(uno, molti, n, locale.value, v)

/** Oltre quanti agenti compaiono ricerca e filtro (scelta dell'owner del 15/10: «solo oltre una certa quantità»). */
const SOGLIA_FILTRI = 10
const PER_PAGINA = 25
const FILTRI: [string, string][] = [['tutti', 'processi.agents.filterAll'], ['in-corso', 'processi.agents.filterActive'], ['attesa', 'processi.agents.filterWaiting'],
    ['fallita', 'processi.agents.filterErrors'], ['conclusa', 'processi.agents.filterFinished'], ['interrotta', 'processi.agents.filterStopped'],
    ['in-pausa', 'processi.agents.filterPaused'], ['ignoto', 'processi.agents.filterUnavailable']]
const RARI = new Set(['ignoto', 'interrotta', 'in-pausa'])

const cerca = ref('')
const valore = ref<'tutti' | StatoDelegaR4>('tutti')
const pagina = ref(0)
const richiesteAperte = reactive(new Map<string, boolean>())

const conFiltri = computed(() => props.agenti.length > SOGLIA_FILTRI)
const filtrati = computed(() => {
    const q = conFiltri.value ? cerca.value.toLocaleLowerCase().trim() : ''
    const voluto = conFiltri.value ? valore.value : 'tutti'
    return props.agenti.filter((a) => (!q || `${a.nome || ''} ${a.taskCorto || ''} ${a.task || ''} ${a.modello || ''}`.toLocaleLowerCase().includes(q))
        && (voluto === 'tutti' || statoDelegaR4(a) === voluto))
})
const cercando = computed(() => conFiltri.value && (Boolean(cerca.value.trim()) || valore.value !== 'tutti'))
const raggruppati = computed(() => gruppiAgentiR4(props.agenti, filtrati.value))
const aperta = (id: string) => cercando.value || (richiesteAperte.has(id) ? richiesteAperte.get(id)! : id === raggruppati.value?.piuRecente)
/** Le righe che si vedono (gli agenti di una richiesta ripiegata non occupano pagine), poi la pagina. */
const visibili = computed(() => (raggruppati.value ? filtrati.value.filter((a) => aperta(a.richiesta!.id)) : filtrati.value))
const ultimaPagina = computed(() => Math.max(0, Math.ceil(visibili.value.length / PER_PAGINA) - 1))
const inizio = computed(() => Math.min(pagina.value, ultimaPagina.value) * PER_PAGINA)
const inPagina = computed(() => new Set(visibili.value.slice(inizio.value, inizio.value + PER_PAGINA)))
const statiVisibili = computed(() => FILTRI.filter(([v]) => !RARI.has(v) || valore.value === v || props.agenti.some((a) => statoDelegaR4(a) === v)))

function apriRichiesta(id: string): void {
    richiesteAperte.set(id, !aperta(id))
    pagina.value = 0
}
const titoloGruppo = (r: NonNullable<AgenteDelPannelloR4['richiesta']>) => {
    const titolo = r.corrente ? tr('agenti.workflow.requestThis') : tr('agenti.workflow.requestAt', { ora: oraBreveR4(r.at, locale.value) })
    return r.testo ? `${titolo} · ${r.testo}` : titolo
}
// L3-15 (r4 2161afb32 `disegnaAgenti`, invariato a 701c6c0d2): «terminati» come il diagramma, e «· N da controllare» se qualcuno non è andato bene
const contoGruppo = (agenti: AgenteDelPannelloR4[]) => {
    const { terminati: finiti, daControllare } = contoDellaRichiestaR4(agenti)
    return `${tn('agenti.graph.agentOne', 'agenti.graph.agentMany', agenti.length, { n: conteggioAgentiR4(agenti.length, locale.value) })} · ${finiti === agenti.length
        ? tr('agenti.workflow.requestAllDone') : tr('agenti.graph.finishedOf', { fatti: finiti, totale: agenti.length })}${daControllare ? ` · ${tr('agenti.graph.toCheck', { n: daControllare })}` : ''}`
}

// la riga — pin r4 701c6c0d2 (L3-17, `disegnaAgenti` @ 701): il NOME dell'agente; il compito anche quando r4 toglie `task` uguale a `taskCorto`
const nome = (a: AgenteDelPannelloR4) => troncaR4(nomeDellAgenteR4(a) || tr('agenti.agent.noTaskRecorded'), 52)
const descrizione = (a: AgenteDelPannelloR4) => senzaInganniSuPiuRigheR4(a.task || a.taskCorto || '') || a.modello || ''
const tono = (a: AgenteDelPannelloR4) => ({ fallita: 'danger', conclusa: 'success', 'in-pausa': 'warning', interrotta: 'warning' } as Record<string, string>)[statoDelegaR4(a)] ?? null
function meta(a: AgenteDelPannelloR4): string[] {
    const m: string[] = []
    const attrezzo = a.attivita?.attrezzoCorrente
    if (attrezzo) m.push(nomeUmanoAttrezzoR4(attrezzo, locale.value) ?? nomeDiRipiegoAttrezzoR4(attrezzo))
    if (a.avviataAlle) m.push(tr('processi.agents.startedAt', { ora: oraBreveR4(a.avviataAlle, locale.value) }))
    if (Number.isSafeInteger(a.numeroFigli)) m.push(tn('processi.agents.childOne', 'processi.agents.childMany', a.numeroFigli))
    return m
}
function fatto(a: AgenteDelPannelloR4): string | null {
    const ev = a.evidenzaDelega && typeof a.evidenzaDelega === 'object' ? a.evidenzaDelega : null
    if (!ev) return null
    const chiamate = Number(ev.toolCalls || 0), scritture = Number(ev.scritture || 0)
    return `${tn('processi.agents.callsOne', 'processi.agents.callsMany', chiamate, { n: conteggioInteroR4(chiamate, locale.value) })} · ${tn('processi.agents.writesOne', 'processi.agents.writesMany', scritture, { n: conteggioInteroR4(scritture, locale.value) })}`
}
function collisione(a: AgenteDelPannelloR4): string | null {
    const file = [...new Set((Array.isArray(a.collisioni) ? a.collisioni : []).map((c: { percorso?: string }) => c.percorso))]
    if (!file.length) return null
    return file.length === 1 ? tr('processi.agents.collisionOne', { file: file[0] }) : tr('processi.agents.collisionMany', { file: file.join(', ') })
}
const etichettaApri = (a: AgenteDelPannelloR4) => tr('processi.agents.openConversationOf', { nome: nomeDellAgenteR4(a) || tr('processi.agents.noTaskShort') })
</script>

<template>
    <div data-testid="talos-codice-r4-agenti" class="flex flex-col gap-2 py-3">
        <template v-if="conFiltri">
            <div class="talos-codice-r4-sezione">
                <input
                    v-model="cerca"
                    type="search"
                    data-testid="talos-codice-r4-agenti-cerca"
                    class="talos-codice-r4-campo"
                    :aria-label="tr('processi.agents.searchLabel')"
                    :placeholder="tr('processi.agents.searchPlaceholder')"
                    @input="pagina = 0"
                >
            </div>
            <div class="talos-codice-r4-stati" role="group" :aria-label="tr('processi.agents.statusFilterLabel')">
                <button
                    v-for="[v, chiave] in statiVisibili"
                    :key="v"
                    type="button"
                    :data-stato="v"
                    :aria-pressed="valore === v"
                    @click="valore = v as typeof valore; pagina = 0"
                >{{ tr(chiave) }}</button>
            </div>
        </template>
        <p v-if="errore || conFiltri" role="status" class="talos-codice-r4-nota" data-testid="talos-codice-r4-agenti-conto">
            {{ errore ? tr('processi.agents.staleData', { errore }) : tr('processi.agents.countAllLevels', { n: conteggioAgentiR4(filtrati.length, locale), totale: conteggioAgentiR4(agenti.length, locale) }) }}
        </p>

        <div v-if="!agenti.length" data-testid="talos-codice-r4-agenti-vuoto" class="talos-codice-r4-sezione">
            <h3>{{ tr('processi.agents.emptyTitle') }}</h3>
            <p class="talos-codice-r4-nota !px-0">{{ tr('processi.agents.emptyText') }}</p>
        </div>
        <p v-else-if="!filtrati.length" class="talos-codice-r4-nota">{{ tr('agenti.delegations.noAgentForFilters') }}</p>

        <template v-for="blocco in (raggruppati ? raggruppati.gruppi : [{ richiesta: null, agenti: filtrati }])" :key="blocco.richiesta?.id ?? 'tutti'">
            <button
                v-if="blocco.richiesta"
                type="button"
                class="talos-codice-r4-agenti-richiesta"
                :data-richiesta-id="blocco.richiesta.id"
                :aria-expanded="aperta(blocco.richiesta.id)"
                :title="blocco.richiesta.testo || titoloGruppo(blocco.richiesta)"
                @click="apriRichiesta(blocco.richiesta.id)"
            >
                <ChevronDown class="size-4 flex-none transition-transform" :class="aperta(blocco.richiesta.id) ? '' : '-rotate-90'" aria-hidden="true" />
                <span class="min-w-0 flex-1">
                    <span class="talos-codice-r4-agenti-richiesta-titolo">{{ titoloGruppo(blocco.richiesta) }}</span>
                    <span class="talos-codice-r4-agenti-richiesta-conto">{{ contoGruppo(blocco.agenti) }}</span>
                </span>
            </button>
            <ul v-if="!blocco.richiesta || aperta(blocco.richiesta.id)" role="list" class="flex flex-col gap-2 px-3">
                <li v-for="a in blocco.agenti.filter((x) => inPagina.has(x))" :key="a.sessionId">
                    <button
                        type="button"
                        class="talos-codice-r4-agente"
                        :data-sessione-figlia="a.sessionId"
                        :data-stato="statoDelegaR4(a)"
                        :aria-label="etichettaApri(a)"
                        @click="a.sessionId && emit('apri', a.sessionId)"
                    >
                        <span class="talos-codice-r4-agente-testa">
                            <Bot class="talos-codice-r4-processo-famiglia" aria-hidden="true" />
                            <b class="min-w-0 flex-1">{{ nome(a) }}</b>
                            <span class="talos-codice-r4-agente-stato" :data-tono="tono(a)">{{ etichettaDelegaR4(a, locale) }}</span>
                            <ChevronRight class="size-4 flex-none text-[var(--talos-muted)]" aria-hidden="true" />
                        </span>
                        <span v-if="descrizione(a)" class="talos-codice-r4-agente-compito">{{ descrizione(a) }}</span>
                        <span v-if="meta(a).length" class="talos-codice-r4-processo-meta"><span v-for="m in meta(a)" :key="m">{{ m }}</span></span>
                        <span v-if="fatto(a)" class="talos-codice-r4-kv"><span>{{ tr('processi.agents.rowDone') }}</span><span class="font-mono">{{ fatto(a) }}</span></span>
                        <span v-if="collisione(a)" class="talos-codice-r4-processo-fermo">{{ collisione(a) }}</span>
                    </button>
                </li>
            </ul>
        </template>

        <nav v-if="visibili.length > 25" class="talos-codice-r4-agenti-pagine" :aria-label="tr('processi.agents.pagesLabel')">
            <button type="button" :disabled="inizio === 0" :aria-label="tr('processi.agents.previousPage')" @click="pagina = Math.max(0, pagina - 1)">{{ tr('agenti.delegations.previous') }}</button>
            <span class="font-mono">{{ tr('agenti.delegations.pageRange', { da: conteggioAgentiR4(inizio + 1, locale), a: conteggioAgentiR4(Math.min(inizio + 25, visibili.length), locale), totale: conteggioAgentiR4(visibili.length, locale) }) }}</span>
            <button type="button" :disabled="inizio / 25 >= ultimaPagina" :aria-label="tr('processi.agents.nextPage')" @click="pagina = Math.min(ultimaPagina, pagina + 1)">{{ tr('agenti.delegations.next') }}</button>
        </nav>
    </div>
</template>
