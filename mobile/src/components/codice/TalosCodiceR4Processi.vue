<script setup lang="ts">
/**
 * ⛔ K3-C3b-2a (ledger `LEDGER-K3-CODICE-COME-LA-CHAT-2026-10-15.md`): la scheda «Processi» del pannello ▤ del Codice su r4, come il
 * desktop r4 @ fc5e25d62 (`inspector.js`, `disegnaProcessi` :1135 e la riga :935-1134): filtro per testo e per stato (gli stati rari
 * solo se ci sono), «Ferma tutti» con conferma quando i vivi sono più di uno, la sezione «In sfondo» sopra gli altri, 40 righe e poi
 * «Carica altri», la riga con famiglia, descrizione (o il comando a segmenti), stato a parole, chi, ora, misura, CPU e memoria, il
 * silenzio sospetto, l'avviso della richiesta, il dettaglio a tocco. Le regole stanno in `processiR4.ts`.
 * Adattamento al telefono (owner 15/10, «Come il desktop»): il «…» apre le azioni SOTTO la riga, una per riga, invece di un menu a
 * comparsa sopra il foglio del pannello; i nomi delle famiglie, che il desktop ha solo in italiano, stanno nel dizionario del mobile.
 */
import { computed, onBeforeUnmount, reactive, ref, watch } from 'vue'
import {
    Brain, Check, ChevronDown, Clock, Code, Command, Download, Folder, GitBranch, Globe, Layers, LayoutGrid, LayoutTemplate, List,
    MoreHorizontal, Play, Shield, Square, SquareCheck, Terminal, X, Zap,
} from '@lucide/vue'
import { Button } from '@/components/ui/button'
import TalosMobileConfirmDialog from '@/components/shell/TalosMobileConfirmDialog.vue'
import { TALOS_DANGER_ACTION_CLASS } from '@/lib/dangerAction'
import { useTalosI18n } from '@/i18n'
import {
    ATTESA_FERMATA_MS_R4, ETICHETTA_AZIONE_R4, STATI_PROCESSO_R4, TESTI_RICHIESTA_R4, TETTO_PROCESSI_R4, datiProcessoR4,
    richiestaConclusaR4, statoProcessoR4, testoProcessiR4, testoRisorseR4, vociDellaRigaR4,
    type AzioneProcessoR4, type ProcessoGrezzoR4, type ProcessoR4, type RisorsaR4, type StatoProcessoR4,
} from '@/lib/harness/r4/processiR4'
import type { FamigliaR4 } from '@/lib/harness/r4/comandoShellR4'
import './codiceR4.css'

const props = defineProps<{
    /** Le righe grezze (`processiDagliEventiR4`), senza le tolte. */
    processi: ProcessoGrezzoR4[]
    azione: (azione: AzioneProcessoR4, id: string) => Promise<{ ok: true } | { ok: false; motivo: string | null }>
    caricaRisorse: () => Promise<Map<string, RisorsaR4> | null>
}>()
const { t, locale } = useTalosI18n()
const tr = (chiave: string, valori?: Record<string, unknown>) => testoProcessiR4(chiave, locale.value, valori)

const ICONA_FAMIGLIA: Record<FamigliaR4, unknown> = {
    git: GitBranch, node: Code, python: Brain, docker: LayoutGrid, test: SquareCheck, build: LayoutTemplate,
    server: Play, rete: Globe, filesystem: Folder, install: Download, shell: Terminal, generico: Command,
}
const ICONA_STATO: Record<StatoProcessoR4, unknown> = {
    'in-coda': List, 'in-avvio': Play, 'in-corso': Zap, 'in-attesa': Clock, 'in-consenso': Shield, 'in-sfondo': Layers,
    riuscito: Check, fallito: X, annullato: Square, ucciso: Square, perso: Layers, 'non-eseguito': Square, interrotto: Square,
}
const FERMABILI_O_SFONDO = new Set<StatoProcessoR4>(['in-corso', 'in-attesa', 'in-sfondo'])
const STATI_FILTRO: StatoProcessoR4[] = ['in-coda', 'in-avvio', 'in-corso', 'in-attesa', 'in-consenso', 'in-sfondo', 'riuscito', 'fallito', 'annullato', 'ucciso', 'non-eseguito', 'interrotto']
const STATI_RARI = new Set<StatoProcessoR4>(['in-coda', 'in-avvio', 'in-consenso', 'in-sfondo', 'annullato', 'ucciso', 'non-eseguito', 'interrotto'])

const filtro = ref('')
const statoVoluto = ref<'tutti' | StatoProcessoR4>('tutti')
const mostrati = ref(TETTO_PROCESSI_R4)
const annuncio = ref('')
const aperti = reactive(new Set<string>())
const menuDi = ref<string | null>(null)
const confermaAperta = ref(false)
const risorse = ref<Map<string, RisorsaR4> | null>(null)
/** La richiesta di una riga mentre viaggia (o il suo esito non riuscito): `inCorso` spegne il «…», `testo` è l'avviso a parole. */
const richieste = reactive(new Map<string, { inCorso: AzioneProcessoR4 | null; testo: string; timer: ReturnType<typeof setTimeout> | null }>())

const stato = (p: ProcessoGrezzoR4) => statoProcessoR4(p)
const testoFiltrabile = (p: ProcessoGrezzoR4) => `${p.comando || ''} ${p.descrizione || ''} ${p.famiglia || ''}`.toLowerCase()
const filtrati = computed(() => {
    const cerca = filtro.value.trim().toLowerCase()
    return props.processi.filter((p) => (!cerca || testoFiltrabile(p).includes(cerca)) && (statoVoluto.value === 'tutti' || stato(p) === statoVoluto.value))
})
const pronti = (lista: ProcessoGrezzoR4[]) => lista.map((p) => datiProcessoR4(p, locale.value))
const sfondati = computed(() => pronti(filtrati.value.filter((p) => stato(p) === 'in-sfondo')))
const altriTutti = computed(() => filtrati.value.filter((p) => stato(p) !== 'in-sfondo'))
const altri = computed(() => pronti(altriTutti.value.slice(0, mostrati.value)))
const restano = computed(() => altriTutti.value.length - altri.value.length)
const statiVisibili = computed(() => STATI_FILTRO.filter((s) => !STATI_RARI.has(s) || statoVoluto.value === s || props.processi.some((p) => stato(p) === s)))
const fermabili = computed(() => props.processi.filter((p) => FERMABILI_O_SFONDO.has(stato(p))))

function caricaAltri(): void {
    mostrati.value += TETTO_PROCESSI_R4
    annuncio.value = tr('processi.process.nowShowing', { n: Math.min(mostrati.value, props.processi.length) })
}

// ---- le richieste della riga (`richiestaDellaRiga` del desktop) ----
function avviso(id: string, testo: string, inCorso: AzioneProcessoR4 | null): void {
    const prima = richieste.get(id)
    if (prima?.timer) clearTimeout(prima.timer)
    richieste.set(id, { inCorso, testo, timer: null })
}
async function richiesta(id: string, azione: AzioneProcessoR4): Promise<void> {
    if (richieste.get(id)?.inCorso) return
    menuDi.value = null
    const testi = TESTI_RICHIESTA_R4[azione]
    avviso(id, tr(testi.parte), azione)
    let esito: { ok: true } | { ok: false; motivo: string | null }
    try { esito = await props.azione(azione, id) } catch { esito = { ok: false, motivo: null } }
    const ora = richieste.get(id)
    if (ora?.inCorso !== azione) return // l'esito vero è già arrivato mentre la richiesta viaggiava
    if (!esito.ok) {
        avviso(id, tr(testi.no, { motivo: esito.motivo || tr('processi.process.tryAgain') }), null)
        return
    }
    ora.timer = setTimeout(() => {
        if (richieste.get(id)?.inCorso === azione) avviso(id, tr(testi.muto), null)
    }, ATTESA_FERMATA_MS_R4)
}
// lo stato vero chiude la richiesta (e porta via l'avviso di una richiesta non riuscita quando la riga finisce)
watch(() => props.processi.map((p) => `${p.id}:${stato(p)}`).join('|'), (_n, vecchio) => {
    const prima = new Map((vecchio ?? '').split('|').filter(Boolean).map((v) => [v.slice(0, v.lastIndexOf(':')), v.slice(v.lastIndexOf(':') + 1)]))
    for (const p of props.processi) {
        const r = richieste.get(p.id)
        if (!r) continue
        const s = stato(p)
        if (r.inCorso && richiestaConclusaR4(r.inCorso, s)) { if (r.timer) clearTimeout(r.timer); richieste.delete(p.id) }
        else if (!r.inCorso && prima.get(p.id) !== s && !FERMABILI_O_SFONDO.has(s)) richieste.delete(p.id)
    }
})
function fermaTutti(): void {
    confermaAperta.value = false
    for (const p of fermabili.value) void richiesta(p.id, 'ferma')
}

// ---- CPU e memoria: ogni 5 s mentre la scheda è aperta, la pagina è in vista e c'è un comando vivo (la prima volta dopo 1,5 s) ----
let timerRisorse: ReturnType<typeof setTimeout> | null = null
let primaLettura = true
function programmaRisorse(): void {
    if (timerRisorse) clearTimeout(timerRisorse)
    timerRisorse = null
    if (fermabili.value.length === 0) { risorse.value = null; primaLettura = true; return }
    timerRisorse = setTimeout(async () => {
        timerRisorse = null
        if (typeof document === 'undefined' || document.visibilityState !== 'hidden') risorse.value = await props.caricaRisorse()
        primaLettura = false
        programmaRisorse()
    }, primaLettura ? 1_500 : 5_000)
}
watch(() => fermabili.value.length > 0, programmaRisorse, { immediate: true })
onBeforeUnmount(() => {
    if (timerRisorse) clearTimeout(timerRisorse)
    for (const r of richieste.values()) if (r.timer) clearTimeout(r.timer)
})

const nomeFamiglia = (f: FamigliaR4) => t(`harness.r4Family.${f}`)
const ariaComando = (p: ProcessoR4) => tr('processi.process.commandAria', { famiglia: nomeFamiglia(p.famiglia), comando: p.comando })
const fraseVuota = computed(() => (props.processi.length ? tr('processi.process.emptyNoMatch') : tr('processi.process.emptyNone')))
const risorseDi = (p: ProcessoR4) => testoRisorseR4(p, risorse.value, locale.value)
</script>

<template>
    <div data-testid="talos-codice-r4-processi" class="flex flex-col gap-2 py-3">
        <template v-if="processi.length">
            <div class="talos-codice-r4-sezione">
                <input
                    v-model="filtro"
                    type="search"
                    data-testid="talos-codice-r4-processi-filtro"
                    class="talos-codice-r4-campo"
                    :aria-label="tr('processi.process.filterLabel')"
                    :placeholder="tr('processi.process.filterPlaceholder')"
                >
            </div>
            <div class="talos-codice-r4-stati" role="group" :aria-label="tr('processi.process.statusFilterLabel')">
                <button type="button" data-stato="tutti" :aria-pressed="statoVoluto === 'tutti'" @click="statoVoluto = 'tutti'">{{ tr('processi.agents.filterAll') }}</button>
                <button
                    v-for="s in statiVisibili"
                    :key="s"
                    type="button"
                    :data-stato="s"
                    :aria-pressed="statoVoluto === s"
                    @click="statoVoluto = s"
                >{{ tr(STATI_PROCESSO_R4[s].chiave) }}</button>
            </div>
            <div v-if="fermabili.length > 1" class="talos-codice-r4-sezione">
                <button type="button" data-testid="talos-codice-r4-processi-ferma-tutti" class="talos-codice-r4-ferma-tutti" @click="confermaAperta = true">
                    {{ tr('processi.process.stopAll') }}
                </button>
            </div>
        </template>

        <template v-for="gruppo in ([['sfondo', sfondati], ['altri', altri]] as const)" :key="gruppo[0]">
            <h3
                v-if="gruppo[1].length && sfondati.length && (gruppo[0] === 'sfondo' || altri.length)"
                :id="`talos-codice-r4-processi-${gruppo[0]}`"
                class="talos-codice-r4-sezione-titolo"
            >{{ tr(gruppo[0] === 'sfondo' ? 'processi.process.backgroundSection' : 'processi.process.otherSection') }}</h3>
            <ul
                v-if="gruppo[1].length"
                role="list"
                class="flex flex-col gap-2 px-3"
                :aria-label="gruppo[0] === 'altri' && !sfondati.length ? tr('processi.process.listLabel') : undefined"
                :aria-labelledby="gruppo[0] === 'sfondo' || sfondati.length ? `talos-codice-r4-processi-${gruppo[0]}` : undefined"
            >
                <li
                    v-for="p in gruppo[1]"
                    :key="p.id ?? ''"
                    class="talos-codice-r4-processo"
                    :data-processo="p.id"
                    :data-stato="p.stato"
                    :data-famiglia="p.famiglia"
                >
                    <div class="talos-codice-r4-processo-testa">
                        <component :is="ICONA_FAMIGLIA[p.famiglia]" class="talos-codice-r4-processo-famiglia" aria-hidden="true" />
                        <p v-if="p.descrizione" class="talos-codice-r4-processo-titolo">{{ p.descrizione }}</p>
                        <p v-else class="talos-codice-r4-processo-comando" role="text" :aria-label="ariaComando(p)">
                            <template v-if="p.analisi.segmenti.length">
                                <template v-for="(s, i) in p.analisi.segmenti" :key="i">{{ i > 0 ? ' ' : '' }}<span :data-tipo="s.tipo">{{ s.testo }}</span></template>
                            </template>
                            <template v-else>—</template>
                        </p>
                        <button
                            v-if="vociDellaRigaR4(p.stato).length"
                            type="button"
                            data-azione="menu"
                            class="talos-codice-r4-processo-bottone"
                            :aria-label="tr('processi.process.actions')"
                            :aria-expanded="menuDi === p.id"
                            :disabled="Boolean(richieste.get(p.id ?? '')?.inCorso)"
                            @click="menuDi = menuDi === p.id ? null : p.id"
                        ><MoreHorizontal class="size-4" aria-hidden="true" /></button>
                        <button
                            type="button"
                            data-azione="dettaglio"
                            class="talos-codice-r4-processo-bottone"
                            :aria-label="tr(aperti.has(p.id ?? '') ? 'processi.process.hideDetails' : 'processi.process.showDetails')"
                            :aria-expanded="aperti.has(p.id ?? '')"
                            :aria-controls="`talos-codice-r4-processo-dettaglio-${p.id}`"
                            @click="aperti.has(p.id ?? '') ? aperti.delete(p.id ?? '') : aperti.add(p.id ?? '')"
                        ><ChevronDown class="size-4 transition-transform" :class="aperti.has(p.id ?? '') ? 'rotate-180' : ''" aria-hidden="true" /></button>
                    </div>
                    <div class="talos-codice-r4-processo-meta">
                        <span class="talos-codice-r4-processo-stato" :data-tono="p.tono || null">
                            <component :is="ICONA_STATO[p.stato]" class="size-3" aria-hidden="true" />{{ p.etichetta }}
                        </span>
                        <span>{{ p.chi }}</span>
                        <span v-if="p.quando !== '—'" class="font-mono">{{ p.quando }}</span>
                        <span class="flex-1" />
                        <span v-if="p.misura" class="font-mono">{{ p.misura }}</span>
                        <span v-if="risorseDi(p)" class="font-mono" :title="tr('processi.process.resourcesTitle')">{{ risorseDi(p) }}</span>
                    </div>
                    <p v-if="p.fermo" class="talos-codice-r4-processo-fermo">{{ p.fermo }}</p>
                    <p v-if="richieste.get(p.id ?? '')?.testo" role="status" class="talos-codice-r4-processo-avviso">{{ richieste.get(p.id ?? '')!.testo }}</p>
                    <ul v-if="menuDi === p.id" role="list" class="talos-codice-r4-processo-azioni">
                        <li v-for="a in vociDellaRigaR4(p.stato)" :key="a">
                            <button
                                type="button"
                                :data-azione="a"
                                class="talos-codice-r4-azione"
                                :data-pericolo="a === 'ferma' || null"
                                @click="richiesta(p.id ?? '', a)"
                            >{{ tr(ETICHETTA_AZIONE_R4[a]) }}</button>
                        </li>
                    </ul>
                    <dl v-if="aperti.has(p.id ?? '')" :id="`talos-codice-r4-processo-dettaglio-${p.id}`" class="talos-codice-r4-processo-dettaglio">
                        <div v-for="(r, i) in p.dettaglio" :key="r[0]" class="talos-codice-r4-kv" :data-classe="r[2] === 'lungo' ? 'lungo' : null">
                            <dt>{{ r[0] }}</dt><dd :class="i === 0 || r[0] === tr('processi.process.detailOutputFile') ? 'font-mono' : ''">{{ r[1] }}</dd>
                        </div>
                    </dl>
                </li>
            </ul>
        </template>

        <div v-if="restano > 0" class="talos-codice-r4-sezione">
            <button type="button" data-testid="talos-codice-r4-processi-altri" class="talos-codice-r4-ferma-tutti" @click="caricaAltri">
                {{ tr('processi.process.loadMore', { visibili: altri.length, totale: altriTutti.length }) }}
            </button>
        </div>
        <p class="sr-only" role="status">{{ annuncio }}</p>
        <p v-if="filtrati.length === 0" data-testid="talos-codice-r4-processi-vuoto" class="talos-codice-r4-nota">{{ fraseVuota }}</p>

        <TalosMobileConfirmDialog
            v-if="confermaAperta"
            :title="tr('processi.process.stopAllTitle')"
            :description="tr(fermabili.length === 1 ? 'processi.process.stopAllQuestionOne' : 'processi.process.stopAllQuestionMany', { n: fermabili.length })"
            @close="confermaAperta = false"
        >
            <p class="text-sm leading-5 text-[var(--talos-muted)]">{{ tr('processi.process.stopAllConsequence') }}</p>
            <template #footer>
                <Button type="button" variant="ghost" @click="confermaAperta = false"><X class="size-4" aria-hidden="true" /> {{ t('common.cancel') }}</Button>
                <Button
                    type="button"
                    variant="destructive"
                    :class="TALOS_DANGER_ACTION_CLASS"
                    data-testid="talos-codice-r4-processi-ferma-tutti-conferma"
                    @click="fermaTutti"
                ><Square class="size-4" aria-hidden="true" /> {{ tr('processi.process.stopAll') }}</Button>
            </template>
        </TalosMobileConfirmDialog>
    </div>
</template>
