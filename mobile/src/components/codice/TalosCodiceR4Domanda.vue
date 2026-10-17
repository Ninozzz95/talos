<script setup lang="ts">
/**
 * ⛔ K3-AP2 (ledger `LEDGER-K3-DOMANDE-2026-10-16.md`; owner 16/10: carta nella conversazione, una domanda alla volta, parità col
 * desktop). r4 è fermo su `ask_user_question` e aspetta la persona. La carta sta sotto la riga dell'attrezzo; le regole e le parole sono
 * quelle di `components/user-question-dock.js` @ 2161afb32 (`domandeR4.ts`), la risposta passa dalla schermata (`TALOS_APPROVAZIONI_R4`).
 * L'esito lo scrive SOLO r4 (`UserQuestionResolved`): un invio riuscito tiene la carta ferma finché arriva, e allora diventa la
 * ricevuta «Decisione».
 * Scarti dal desktop: le opzioni sono pulsanti propri (`role=radio|checkbox`, niente controlli nativi: ogni tocco è un gesto
 * esplicito); l'annuncio dice che la domanda è nella conversazione; chiusa la carta il fuoco resta sulla carta, non va al compositore
 * (sul telefono aprirebbe la tastiera).
 */
import { computed, inject, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { Check, ChevronRight, MessageCircleQuestion } from '@lucide/vue'
import { Button } from '@/components/ui/button'
import { useTalosI18n } from '@/i18n'
import type { EsitoDomandaR4, VoceDomandaR4 } from '@/lib/harness/r4/domandaChiave'
import { TALOS_APPROVAZIONI_R4 } from '@/lib/harness/r4/approvazioniPonte'
import {
    annuncioDomandaR4, chiEQuandoDomandaR4, dopoLaSceltaR4, erroreInvioDomandaR4, esitoDomandaR4, idDomandaR4, messaggioRifiutoDomandaR4,
    progressoDomandaR4, pulsantiDomandaR4, revisioneDomandaR4, ricevutaDomandaR4, rispostaDallaBozzaR4, testoDomandaR4,
    type BozzaDomandaR4, type FaseDomandaR4, type PulsanteDomandaR4,
} from '@/lib/harness/r4/domandeR4'
import TalosCodiceR4ChiChiede from '@/components/codice/TalosCodiceR4ChiChiede.vue'

const props = defineProps<{ voce: VoceDomandaR4 }>()
const ponte = inject(TALOS_APPROVAZIONI_R4, null)
const { locale } = useTalosI18n()
const tr = (k: string, v?: Record<string, unknown>) => testoDomandaR4(k, locale.value, v)

const domande = computed(() => props.voce.questions)
const ids = computed(() => domande.value.map((d, i) => idDomandaR4(d, i)))
const nataInAttesa = props.voce.esito === null
const radice = ref<HTMLElement | null>(null)
const annuncio = ref('')

const fase = ref<Exclude<FaseDomandaR4, 'resolved'>>('answer')
const corrente = ref(0)
const bozza = reactive<BozzaDomandaR4>(Object.fromEntries(ids.value.map((id) => [id, { scelte: [], altro: '', testo: '' }])))
const occupata = ref(false)
const messaggio = ref('')
/** true = data da qui · false = non da qui · null = incerto (invio caduto senza status): si decide confrontando con l'esito. */
const rispostaDataQui = ref<boolean | null>(false)
const rispostaTentata = ref<{ status: string; answers?: Record<string, string | string[]> } | null>(null)
let fuocoNellaCartaAllInvio = false

const faseVista = computed<FaseDomandaR4>(() => (props.voce.esito ? 'resolved' : fase.value))
const domanda = computed(() => domande.value[corrente.value])
const idCorrente = computed(() => ids.value[corrente.value])
const pulsanti = computed(() => pulsantiDomandaR4(faseVista.value, corrente.value, domande.value.length, locale.value))
const revisione = computed(() => revisioneDomandaR4(domande.value, bozza, locale.value))
const opzioni = computed(() => (Array.isArray(domanda.value?.options) ? domanda.value.options : []))
const multipla = computed(() => domanda.value?.multiSelect === true)
const perche = (testo: unknown) => (typeof testo === 'string' && testo.trim() ? tr('chat.question.whyItMatters', { perche: testo.trim() }) : '')

// ---- la bozza resta nella sessione del browser, con la chiave e la firma del dock del desktop ----
const chiaveBozza = () => `talos.ask-draft.v1:${ponte?.sessioneId() ?? ''}:${props.voce.requestId}`
const firma = JSON.stringify(props.voce.questions)
function salvaBozza(): void {
    if (props.voce.esito) return
    try { sessionStorage.setItem(chiaveBozza(), JSON.stringify({ signature: firma, answers: rispostaDallaBozzaR4(domande.value, bozza) })) } catch { /* niente archivio: resta la bozza viva */ }
}
function riprendiBozza(): void {
    let salvata: { signature?: unknown; answers?: Record<string, unknown> } | null = null
    try {
        const grezza = sessionStorage.getItem(chiaveBozza())
        if (!grezza || grezza.length > 24_000) return
        salvata = JSON.parse(grezza)
    } catch { return }
    if (salvata?.signature !== firma || !salvata.answers || typeof salvata.answers !== 'object') return
    for (const [i, d] of domande.value.entries()) {
        const id = ids.value[i]
        const valore = salvata.answers[id]
        const etichette = (d.options ?? []).map((o) => o.label)
        if (!etichette.length) { if (typeof valore === 'string') bozza[id].testo = valore; continue }
        if (d.multiSelect === true) {
            if (!Array.isArray(valore)) continue
            bozza[id].scelte = etichette.filter((l) => valore.includes(l))
            bozza[id].altro = String(valore.find((v) => typeof v === 'string' && !etichette.includes(v)) ?? '')
            continue
        }
        if (typeof valore !== 'string') continue
        if (etichette.includes(valore)) bozza[id].scelte = [valore]
        else bozza[id].altro = valore
    }
}
watch(bozza, salvaBozza, { deep: true })

// ---- le scelte ----
function tocca(indiceOpzione: number): void {
    if (occupata.value || faseVista.value !== 'answer') return
    const etichetta = opzioni.value[indiceOpzione]?.label
    if (etichetta === undefined) return
    const b = bozza[idCorrente.value]
    if (multipla.value) {
        b.scelte = b.scelte.includes(etichetta) ? b.scelte.filter((s) => s !== etichetta) : [...b.scelte, etichetta]
        return
    }
    if (b.scelte.includes(etichetta) && !b.altro.trim()) return // un radio già spuntato non cambia: niente avanti
    b.scelte = [etichetta]
    b.altro = ''
    const passo = dopoLaSceltaR4(domande.value, bozza, corrente.value, corrente.value)
    if (passo === 'avanti') corrente.value += 1
    else if (passo === 'invia') void invia('answered')
}
function scriviAltro(valore: string): void {
    const b = bozza[idCorrente.value]
    b.altro = valore
    if (!multipla.value && valore.trim()) b.scelte = []
}

async function vaiA(indice: number): Promise<void> {
    corrente.value = Math.max(0, Math.min(domande.value.length - 1, indice))
    await nextTick()
    // senza scorrere: la cornice della schermata ha un antenato che scorre anche se nascosto (voce aperta nel ledger K3-AP3)
    radice.value?.querySelector<HTMLElement>('[data-opzione], [data-parte="libera"]')?.focus({ preventScroll: true })
}
async function azione(id: PulsanteDomandaR4['id']): Promise<void> {
    if (id === 'indietro') return vaiA(corrente.value - 1)
    if (id === 'avanti') return vaiA(corrente.value + 1)
    if (id === 'rivedi') { fase.value = 'review'; messaggio.value = ''; return }
    if (id === 'salta') { fase.value = 'skip-review'; messaggio.value = ''; return }
    if (id === 'modifica') {
        const risposte = rispostaDallaBozzaR4(domande.value, bozza)
        const primaVuota = ids.value.findIndex((x) => risposte[x] === undefined)
        fase.value = 'answer'
        messaggio.value = ''
        return vaiA(primaVuota >= 0 ? primaVuota : 0)
    }
    if (id === 'invia') return invia('answered')
    if (id === 'confermaSalto') return invia('skipped')
}

const stessaRisposta = (attesa: typeof rispostaTentata.value, vera: EsitoDomandaR4 | null): boolean => {
    if (!attesa || !vera || attesa.status !== vera.status) return false
    if (attesa.status !== 'answered') return true
    const a = attesa.answers ?? {}
    const b = vera.answers ?? {}
    const chiavi = Object.keys(a).sort()
    if (JSON.stringify(chiavi) !== JSON.stringify(Object.keys(b).sort())) return false
    return chiavi.every((k) => JSON.stringify(a[k]) === JSON.stringify(b[k]))
}

async function invia(status: 'answered' | 'skipped'): Promise<void> {
    if (!ponte || occupata.value || props.voce.esito) return
    const risposte = rispostaDallaBozzaR4(domande.value, bozza)
    if (status === 'answered' && Object.keys(risposte).length !== domande.value.length) return
    const corpo = { requestId: props.voce.requestId, status, ...(status === 'answered' ? { answers: risposte } : {}) }
    fuocoNellaCartaAllInvio = Boolean(radice.value?.contains(document.activeElement))
    occupata.value = true
    messaggio.value = tr('chat.question.waitingForServer')
    rispostaDataQui.value = true
    rispostaTentata.value = corpo
    const r = await ponte.rispondiDomanda(corpo, props.voce.figlia ? { sessionId: props.voce.figlia.sessionId } : undefined)
    if (props.voce.esito) return
    if (r.ok) {
        if (r.riconciliata) rispostaDataQui.value = stessaRisposta(corpo, r.riconciliata)
        messaggio.value = tr('chat.question.submit.received')
        return
    }
    const errore = erroreInvioDomandaR4(r.stato, messaggioRifiutoDomandaR4(r.codice, r.messaggio, locale.value), locale.value)
    messaggio.value = errore.testo
    if (errore.bloccata) { rispostaDataQui.value = null; return }
    rispostaDataQui.value = false
    occupata.value = false
    if (errore.fase === 'stale') fase.value = 'stale'
}

// ---- i tasti 1-9 con il fuoco nella carta (mai mentre si scrive) ----
function tasto(evento: KeyboardEvent): void {
    if (evento.key === 'Escape' && (fase.value === 'review' || fase.value === 'skip-review') && !occupata.value) {
        evento.preventDefault()
        void azione('modifica')
        return
    }
    if (!/^[1-9]$/u.test(evento.key) || faseVista.value !== 'answer' || occupata.value) return
    const bersaglio = evento.target as HTMLElement | null
    if (bersaglio && (bersaglio.tagName === 'TEXTAREA' || bersaglio.tagName === 'INPUT')) return
    const indice = Number(evento.key) - 1
    if (!opzioni.value[indice]) return
    evento.preventDefault()
    tocca(indice)
}

// ---- l'esito e la ricevuta ----
const altrove = computed(() => {
    const esito = props.voce.esito
    if (!esito || !nataInAttesa || esito.da === 'sistema') return false
    const qui = rispostaDataQui.value === null ? stessaRisposta(rispostaTentata.value, esito) : rispostaDataQui.value
    return !qui
})
const frase = computed(() => (props.voce.esito ? esitoDomandaR4(props.voce.esito.status, props.voce.esito.motivo, altrove.value, locale.value) : ''))
const meta = computed(() => (props.voce.esito ? chiEQuandoDomandaR4(props.voce, props.voce.esito.status, props.voce.esito, altrove.value, locale.value) : ''))
/* K3-AP3 (`chiudiDomandaDellaFiglia`): l'istantanea della figlia porta solo lo stato, mai le risposte; chi ha risposto da qui le ritrova
   nella sua carta, chi ha risposto altrove legge solo l'esito. */
const esitoDellaRicevuta = computed<EsitoDomandaR4 | null>(() => {
    const esito = props.voce.esito
    if (!esito || esito.answers || rispostaDataQui.value === false || rispostaTentata.value?.status !== esito.status) return esito
    return { ...esito, answers: rispostaTentata.value.answers }
})
const ricevuta = computed(() => (esitoDellaRicevuta.value ? ricevutaDomandaR4(domande.value, esitoDellaRicevuta.value.status, esitoDellaRicevuta.value, locale.value) : []))
const progresso = computed(() => (props.voce.esito ? frase.value : progressoDomandaR4(corrente.value, domande.value.length, locale.value)))
/** Una domanda aperta senza giro in corso a storia finita è sopravvissuta a un riavvio di r4 (decisione 29 del desktop). */
/* K3-AP3 (regressione vista sul Pad il 16/10): solo per le domande di QUESTA sessione — quella di una figlia aspetta col giro della
   figlia, e la madre ferma non dice niente su di lei (`segnalaDomandeSopravvissute` scorre solo `domandePendenti`). */
const avviso = computed(() => messaggio.value || (!props.voce.esito && !props.voce.figlia && ponte?.giroInCorso() === false ? tr('chat.question.resumedAfterRestart') : ''))

watch(() => props.voce.esito, async (esito) => {
    if (!esito) return
    try { sessionStorage.removeItem(chiaveBozza()) } catch { /* niente archivio */ }
    await nextTick()
    const attivo = document.activeElement
    if (radice.value && (radice.value.contains(attivo) || (fuocoNellaCartaAllInvio && (!attivo || attivo === document.body)))) radice.value.focus()
})

let annuncioTimer: ReturnType<typeof setTimeout> | null = null
onMounted(() => {
    if (props.voce.esito) return
    riprendiBozza()
    // la regione esiste già: il testo si scrive nel turno dopo, così il lettore di schermo lo legge (MDN, ARIA live regions)
    annuncioTimer = setTimeout(() => { annuncio.value = annuncioDomandaR4(domande.value, locale.value) }, 0)
})
onBeforeUnmount(() => { if (annuncioTimer) clearTimeout(annuncioTimer) })
</script>

<template>
    <section
        ref="radice"
        data-testid="talos-domanda"
        :data-fase="faseVista"
        :data-request="voce.requestId"
        :data-esito="voce.esito?.status"
        :data-figlia="voce.figlia?.sessionId"
        tabindex="-1"
        :aria-label="tr('chat.question.cardLabel')"
        class="talos-codice-r4-domanda w-full min-w-0 max-w-[72ch] rounded-md border px-3 py-2.5 text-[var(--talos-text)] outline-none"
        :class="voce.esito ? 'border-[var(--talos-border)] bg-[var(--talos-panel)]' : 'talos-codice-r4-domanda--attesa'"
        @keydown="tasto"
    >
        <TalosCodiceR4ChiChiede v-if="voce.figlia" :figlia="voce.figlia" />
        <p class="flex min-w-0 items-center gap-1.5 text-2xs leading-4" :class="voce.esito ? 'text-[var(--talos-muted)]' : 'text-[var(--talos-accent)]'">
            <MessageCircleQuestion class="size-3.5 shrink-0" aria-hidden="true" />
            <span data-parte="badge" class="shrink-0">{{ voce.esito ? tr('chat.question.decision') : tr(voce.figlia ? 'chat.question.badgeFromAgent' : 'chat.question.badge') }}</span>
            <span data-parte="progresso" class="min-w-0 truncate tabular-nums" :class="voce.esito ? 'text-[var(--talos-text)]' : 'text-[var(--talos-muted)]'">{{ progresso }}</span>
        </p>

        <!-- la risposta, una domanda alla volta -->
        <div v-if="faseVista === 'answer' || faseVista === 'stale'" :key="idCorrente" class="mt-1.5">
            <p :id="`domanda-${voce.requestId}-${idCorrente}`" data-parte="domanda" class="text-sm font-medium leading-5">{{ domanda.question || tr('chat.question.label') }}</p>
            <p v-if="perche(domanda.why)" data-parte="perche" class="mt-0.5 text-xs leading-5 text-[var(--talos-muted)]">{{ perche(domanda.why) }}</p>
            <template v-if="opzioni.length">
                <div
                    :role="multipla ? 'group' : 'radiogroup'"
                    :aria-labelledby="`domanda-${voce.requestId}-${idCorrente}`"
                    class="talos-codice-r4-domanda__opzioni mt-2"
                >
                    <button
                        v-for="(opzione, i) in opzioni"
                        :key="opzione.label"
                        type="button"
                        :role="multipla ? 'checkbox' : 'radio'"
                        :aria-checked="bozza[idCorrente].scelte.includes(opzione.label) ? 'true' : 'false'"
                        :data-opzione="opzione.label"
                        :disabled="occupata || faseVista === 'stale'"
                        class="talos-codice-r4-domanda__opzione"
                        @click="tocca(i)"
                    >
                        <span class="talos-codice-r4-domanda__segno" :data-forma="multipla ? 'quadro' : 'tondo'" aria-hidden="true">
                            <Check v-if="multipla && bozza[idCorrente].scelte.includes(opzione.label)" class="size-3" />
                        </span>
                        <span class="min-w-0 flex-1 text-left">
                            <span class="flex flex-wrap items-center gap-1.5">
                                <span class="text-sm leading-5">{{ opzione.label }}</span>
                                <span v-if="opzione.recommended" class="talos-codice-r4-domanda__consigliata">{{ tr('chat.question.recommended') }}</span>
                            </span>
                            <span v-if="opzione.description" class="block text-xs leading-4 text-[var(--talos-muted)]">{{ opzione.description }}</span>
                        </span>
                        <kbd v-if="i < 9" class="talos-codice-r4-domanda__tasto" aria-hidden="true">{{ i + 1 }}</kbd>
                    </button>
                </div>
                <input
                    data-parte="altro"
                    type="text"
                    maxlength="4000"
                    :value="bozza[idCorrente].altro"
                    :placeholder="tr('chat.question.other.placeholder')"
                    :aria-label="tr('chat.question.other.label')"
                    :disabled="occupata || faseVista === 'stale'"
                    class="talos-codice-r4-domanda__campo mt-1.5 min-h-touch"
                    @input="scriviAltro(($event.target as HTMLInputElement).value)"
                >
            </template>
            <textarea
                v-else
                v-model="bozza[idCorrente].testo"
                data-parte="libera"
                rows="3"
                maxlength="4000"
                :placeholder="tr('chat.question.free.placeholder')"
                :aria-label="domanda.question || tr('chat.question.free.label')"
                :disabled="occupata || faseVista === 'stale'"
                class="talos-codice-r4-domanda__campo mt-2 py-2"
            />
        </div>

        <!-- la revisione, o la conferma del salto -->
        <div v-else-if="faseVista === 'review' || faseVista === 'skip-review'" data-parte="revisione" class="mt-1.5">
            <p data-parte="titolo-revisione" class="text-sm font-medium leading-5">{{ faseVista === 'review' ? revisione.titolo : tr('chat.question.skipAll.title') }}</p>
            <dl v-if="faseVista === 'review'" class="mt-1.5 space-y-1.5">
                <div v-for="(riga, i) in revisione.righe" :key="ids[i]" data-parte="riga-revisione">
                    <dt class="text-xs leading-4 text-[var(--talos-muted)]">{{ riga.domanda }}</dt>
                    <dd class="text-sm leading-5">{{ riga.risposta }}</dd>
                </div>
            </dl>
            <p data-parte="avviso" role="status" class="mt-1.5 text-xs leading-5 text-[var(--talos-muted)]">
                {{ faseVista === 'review' ? revisione.avviso : tr('chat.question.skipAll.warning') }}
            </p>
        </div>

        <!-- la ricevuta «Decisione» -->
        <div v-else data-parte="ricevuta" class="mt-1.5">
            <p v-if="meta" data-parte="meta" class="text-2xs leading-4 text-[var(--talos-muted)]">{{ meta }}</p>
            <dl class="mt-1.5 space-y-2">
                <div v-for="riga in ricevuta" :key="riga.id" :data-domanda="riga.id">
                    <dt class="text-xs leading-4 text-[var(--talos-muted)]">{{ riga.domanda }}</dt>
                    <dd data-parte="risposta" class="text-sm font-medium leading-5">{{ riga.risposta }}</dd>
                    <dd v-if="riga.perche" class="text-2xs leading-4 text-[var(--talos-muted)]">{{ riga.perche }}</dd>
                    <dd v-if="riga.contoOfferte">
                        <details class="talos-codice-r4-domanda__offerte">
                            <summary class="min-h-touch gap-1 text-xs text-[var(--talos-muted)]">
                                <ChevronRight class="talos-codice-r4-domanda__freccia size-3.5 shrink-0" aria-hidden="true" />{{ riga.contoOfferte }}
                            </summary>
                            <ul class="space-y-1 pb-1">
                                <li
                                    v-for="offerta in riga.offerte"
                                    :key="offerta.label"
                                    data-parte="offerta"
                                    :data-etichetta="offerta.label"
                                    :data-scelta="String(offerta.scelta)"
                                    class="flex flex-wrap items-center gap-1.5 text-xs leading-5"
                                >
                                    <span>{{ offerta.label }}</span>
                                    <span v-if="offerta.consigliata" class="talos-codice-r4-domanda__consigliata">{{ tr('chat.question.recommended') }}</span>
                                    <span v-if="offerta.scelta" class="talos-codice-r4-domanda__scelta">{{ tr('chat.question.receipt.chosen') }}</span>
                                </li>
                            </ul>
                        </details>
                    </dd>
                </div>
            </dl>
            <p role="status" class="sr-only">{{ frase }}</p>
        </div>

        <p v-if="avviso && faseVista !== 'resolved'" data-parte="avviso-invio" role="status" class="mt-1.5 text-xs leading-5 text-[var(--talos-muted)]">{{ avviso }}</p>
        <div v-if="faseVista !== 'resolved' && faseVista !== 'stale'" class="talos-codice-r4-domanda__azioni mt-2">
            <Button
                v-for="p in pulsanti"
                :key="p.id"
                type="button"
                :data-azione="p.id"
                :variant="p.tono === 'primary' ? 'default' : p.tono === 'secondary' ? 'outline' : 'ghost'"
                class="min-h-touch"
                :class="p.id === 'indietro' ? 'talos-codice-r4-domanda__indietro' : ''"
                :disabled="occupata || !ponte || (p.id === 'invia' && !revisione.puoInviare)"
                @click="azione(p.id)"
            >{{ p.testo }}</Button>
        </div>
        <p data-parte="annuncio" role="status" aria-live="polite" aria-atomic="true" class="sr-only">{{ annuncio }}</p>
    </section>
</template>
