<script setup lang="ts">
/**
 * ⭐⭐ B3 F4-A — LA CODA DEL GIRO, sopra il compositore (24/09/2026).
 *
 * I messaggi scritti mentre TALOS risponde (Accoda nel compositore) aspettano qui. La striscia c'è solo quando la coda
 * della chat aperta ha voci, e dice tre cose, un lavoro per elemento come sul desktop (sola lettura,
 * `harness-ui/frontend/src/components/coda-messaggi.js`, 14/09):
 *   - il BADGE dice lo stato e il numero — «N in coda» / «N in pausa» — e non si accorcia mai: il 14/09 sul desktop il
 *     «(+1 altro)» in coda al testo finiva nei puntini, cioè si perdeva proprio quanti messaggi aspettano;
 *   - il TESTO mostra il messaggio: la prima voce su una riga con i puntini, intera nel `title` e a striscia espansa;
 *   - il PULSANTE dice l'azione, e la riga sotto il badge dice quando parte.
 *
 * Le azioni per voce (regole di casa, owner 10/09 e 13/09): più di due azioni su un oggetto ⇒ menu «⋯» + tasto destro
 * e pressione lunga; ciò che è nel menu NON resta anche fuori (intersezione vuota, unione completa). Fuori c'è UNA sola
 * azione, quella di `azioneVoce` (`lib/chat/codaDelGiro.ts`):
 *   - «Indirizza ora» — giro vivo qui con attrezzi: entra al prossimo confine fra attrezzi (LibreChat #14220, Codex
 *     `turn/steer`, Hermes PR #12116);
 *   - «Ferma e riparti con questo» — giro vivo qui senza attrezzi: quel confine non c'è, e il pulsante non promette un
 *     indirizzo che non esiste (D-B3-02, regola «No fake feature»);
 *   - «Invia ora» — giro fermo.
 * Nel menu: Modifica (in linea) e Togli. Il menu è `TalosRowActions`, lo stesso della sidebar e della Libreria.
 *
 * ⛔ Movimento: nessuno. La striscia compare e si espande di scatto — un cambio di stato, non una scena — quindi
 *   «riduci movimento» è rispettato per costruzione; il menu eredita l'intento `menu-open` del motore, che lo rispetta già.
 *
 * Presentazione pura: lo stato arriva per prop, le azioni escono per evento. La modifica è l'unica che deve sapere COME
 * è andata (il rifiuto si dice qui, sul campo), quindi arriva come funzione che restituisce l'esito dello store.
 */
import { computed, nextTick, ref, watch } from 'vue'
import { ChevronDown, CornerDownLeft, Pencil, Play, RotateCcw, ShipWheel, Trash2 } from '@lucide/vue'
import { Button } from '@/components/ui/button'
import { useTalosTabletLayout } from '@/composables/useTalosTabletLayout'
import { useTalosI18n } from '@/i18n'
import TalosRowActions, { type TalosRowAction } from '@/components/talos/ui/TalosRowActions.vue'
import { talosLightImpact } from '@/services/haptics'
import {
    CODA_TETTO_CARATTERI,
    CODA_TETTO_VOCI,
    type TalosCodaRifiuto,
    type TalosCodaVoce,
} from '@/lib/chat/codaDelGiro'

type TalosEsitoModifica = { ok: true } | { ok: false; rifiuto: TalosCodaRifiuto | string }

const props = defineProps<{
    voci: readonly TalosCodaVoce[]
    inPausa: boolean
    /** Da `azioneVoce({ giroVivoQui, conAttrezzi })`: una sola azione principale, uguale per tutte le voci. */
    azione: 'indirizza' | 'ferma-e-riparti' | 'invia-ora'
    /** Risponde un'ALTRA chat: questa coda parte quando quella finisce, e «Invia ora» non può partire adesso. */
    altraChatInCorso: boolean
    salvaModifica: (id: string, testo: string) => Promise<TalosEsitoModifica>
}>()

const emit = defineEmits<{
    principale: [id: string]
    togli: [id: string]
    riprendi: []
}>()

defineOptions({ name: 'TalosMobileCodaDelGiro' })

const { t, locale } = useTalosI18n()
// ⭐ 24/09/2026 (B3-STILE, owner): sul tablet i pulsanti con la scritta, sul telefono sole icone.
const { isTablet } = useTalosTabletLayout()

const espansa = ref(false)
const visibili = computed(() => (espansa.value ? props.voci : props.voci.slice(0, 1)))

const conteggio = computed(() => t(
    props.inPausa ? 'chat.queuePausedCount' : 'chat.queueCount',
    { count: props.voci.length },
))

/**
 * Quando parte, detto. ⛔ La PAUSA la decide lo Stop, l'AZIONE la decide il giro: due fatti diversi (desktop, 14/09,
 * banco 5475 — ripreso il giro con «Invia ora», la voce ancora in pausa diceva «Il giro è fermo» mentre il modello
 * lavorava). Quindi le due righe si sommano invece di escludersi.
 */
const spiegazioni = computed(() => {
    const righe: string[] = []
    if (props.inPausa) righe.push(t('chat.queueHintPaused'))
    if (props.altraChatInCorso) righe.push(t('chat.queueHintOtherChat'))
    else if (props.azione === 'indirizza') righe.push(t('chat.queueHintSteer'))
    else if (props.azione === 'ferma-e-riparti') righe.push(t('chat.queueHintStopRestart'))
    else if (!props.inPausa) righe.push(t('chat.queueHintIdle'))
    return righe
})

/**
 * «Invia ora» mentre risponde un'altra chat non può partire (l'app risponde a una conversazione alla volta): invece di
 * un pulsante che non fa niente, non c'è — e la riga sopra dice che parte quando l'altra finisce.
 */
const mostraPrincipale = computed(() => !props.altraChatInCorso)
/** L'icona dell'azione principale sul telefono: «Invia ora» ↵ come Hermes (`queue-panel.tsx`), il timone per indirizzare. */
const iconaPrincipale = computed(() => {
    if (props.azione === 'indirizza') return ShipWheel
    if (props.azione === 'ferma-e-riparti') return RotateCcw
    return CornerDownLeft
})
const etichettaPrincipale = computed(() => {
    if (props.azione === 'indirizza') return t('chat.queueSteerNow')
    if (props.azione === 'ferma-e-riparti') return t('chat.queueStopAndRestart')
    return t('chat.queueSendNow')
})

function anteprima(testo: string): string {
    const pulito = testo.replace(/\s+/g, ' ').trim()
    return pulito.length > 60 ? `${pulito.slice(0, 59).trimEnd()}…` : pulito
}

function azioniDellaVoce(voce: TalosCodaVoce): TalosRowAction[] {
    return [
        { id: 'edit', label: t('chat.queueEdit'), icon: Pencil, testId: `talos-queue-edit-${voce.id}` },
        { id: 'remove', label: t('chat.queueRemove'), icon: Trash2, danger: true, testId: `talos-queue-remove-${voce.id}` },
    ]
}

function onAzioneDelMenu(voce: TalosCodaVoce, id: string): void {
    if (id === 'edit') void apriModifica(voce)
    else if (id === 'remove') emit('togli', voce.id)
}

// ─── Modifica in linea ─────────────────────────────────────────────────────────
const inModifica = ref<string | null>(null)
const bozza = ref('')
const erroreModifica = ref('')
const salvando = ref(false)
const campoModifica = ref<HTMLTextAreaElement[] | HTMLTextAreaElement | null>(null)

function messaggioRifiuto(rifiuto: string): string {
    const numero = new Intl.NumberFormat(locale.value)
    if (rifiuto === 'troppo-lungo') return t('chat.queueRefusedTooLong', { max: numero.format(CODA_TETTO_CARATTERI) })
    if (rifiuto === 'coda-piena') return t('chat.queueRefusedFull', { max: numero.format(CODA_TETTO_VOCI) })
    if (rifiuto === 'vuoto') return t('chat.queueRefusedEmpty')
    return t('chat.queueRefusedUnavailable')
}

async function apriModifica(voce: TalosCodaVoce): Promise<void> {
    inModifica.value = voce.id
    bozza.value = voce.testo
    erroreModifica.value = ''
    // Una voce oltre la prima si modifica dove si vede: la striscia si apre.
    espansa.value = true
    await nextTick()
    const campo = Array.isArray(campoModifica.value) ? campoModifica.value[0] : campoModifica.value
    campo?.focus()
}

function chiudiModifica(): void {
    inModifica.value = null
    bozza.value = ''
    erroreModifica.value = ''
}

async function salva(): Promise<void> {
    const id = inModifica.value
    if (!id || salvando.value) return
    salvando.value = true
    erroreModifica.value = ''
    try {
        const esito = await props.salvaModifica(id, bozza.value)
        if (esito.ok) chiudiModifica()
        else erroreModifica.value = messaggioRifiuto(esito.rifiuto)
    } catch {
        erroreModifica.value = t('chat.queueRefusedUnavailable')
    } finally {
        salvando.value = false
    }
}

/*
 * Una voce che parte mentre la si modifica (il giro è finito) non c'è più da modificare: il campo si chiude. È partito
 * il testo di prima — l'unico che la persona aveva confermato.
 */
watch(() => props.voci.map((v) => v.id), (ids) => {
    if (inModifica.value && !ids.includes(inModifica.value)) chiudiModifica()
})

// ─── Pressione lunga e tasto destro: LO STESSO menu del «⋯» ─────────────────────
/*
 * Numeri e forma della sidebar (`TalosMobileSidebar.vue`, recenti, owner 12/09; mockup righe 3943-3958 e 4128):
 * scatta a 430 ms se il dito non si è mosso più di 7 px, un impulso aptico dice che è scattato, e il click che segue il
 * rilascio viene inghiottito per 650 ms — altrimenti aprirebbe o chiuderebbe la striscia sotto il menu appena aperto.
 */
const PRESSIONE_LUNGA_MS = 430
const PRESSIONE_TOLLERANZA_PX = 7
const CLICK_INGHIOTTITO_MS = 650
type MenuDiRiga = { show: (index?: number) => Promise<void>, close: () => void }
const menu = new Map<string, MenuDiRiga>()
function registraMenu(id: string, istanza: unknown): void {
    if (istanza && typeof (istanza as MenuDiRiga).show === 'function') menu.set(id, istanza as MenuDiRiga)
    else menu.delete(id)
}
let pressione: { id: string, x: number, y: number, timer: ReturnType<typeof setTimeout> } | null = null
let clickInghiottitoFinoA = 0
function apriMenu(id: string): void {
    clickInghiottitoFinoA = performance.now() + CLICK_INGHIOTTITO_MS
    void talosLightImpact()
    void menu.get(id)?.show()
}
function onPressioneInizio(id: string, event: PointerEvent): void {
    if (event.isPrimary === false || event.button !== 0) return
    annullaPressione()
    pressione = {
        id, x: event.clientX, y: event.clientY,
        timer: setTimeout(() => { pressione = null; apriMenu(id) }, PRESSIONE_LUNGA_MS),
    }
}
function onPressioneMossa(event: PointerEvent): void {
    if (!pressione) return
    if (Math.abs(event.clientX - pressione.x) > PRESSIONE_TOLLERANZA_PX
        || Math.abs(event.clientY - pressione.y) > PRESSIONE_TOLLERANZA_PX) annullaPressione()
}
function annullaPressione(): void {
    if (!pressione) return
    clearTimeout(pressione.timer)
    pressione = null
}
function onTastoDestro(id: string): void {
    if (inModifica.value === id) return
    annullaPressione()
    apriMenu(id)
}
function onTestoToccato(): void {
    if (performance.now() < clickInghiottitoFinoA) return
    espansa.value = !espansa.value
}
</script>

<template>
    <!--
        ⭐ 24/09/2026 sera (B3-STILE, owner). «Riprendi la coda» e «Invia ora» erano capsule trasparenti alte 48px, uno sopra
        l'altro. Decisioni owner: sul tablet il pulsante dell'app come il desktop (`index.template.html:579`: una riga, pulsanti
        secondari piccoli); sul telefono sole icone (Hermes, `queue-panel.tsx`); mai uno sopra l'altro. Chiusa: una riga sola,
        la spiegazione sotto. Aperta: una riga per voce e «Riprendi la coda» in fondo all'elenco.
        Dossier `.claude/ricerche/2026-09-24-pulsanti-coda-10x4.md`.
    -->
    <section
        v-if="voci.length > 0"
        data-testid="talos-queue-strip"
        :data-paused="inPausa ? 'true' : 'false'"
        :aria-label="t('chat.queueRegion')"
        class="talos-queue-strip"
        :class="{ 'is-paused': inPausa, 'is-tablet': isTablet }"
    >
        <div v-if="espansa" class="talos-queue-head">
            <!-- Il numero sta nel badge, che non si accorcia (desktop 14/09). -->
            <span data-testid="talos-queue-count" class="talos-queue-count">{{ conteggio }}</span>
            <p data-testid="talos-queue-hint" class="talos-queue-hint">
                <span v-for="(riga, indice) in spiegazioni" :key="indice" class="block">{{ riga }}</span>
            </p>
            <button
                type="button"
                data-testid="talos-queue-toggle"
                class="talos-pressable talos-queue-icon-btn"
                aria-expanded="true"
                :aria-label="t('chat.queueShowLess')"
                :title="t('chat.queueShowLess')"
                @pointerdown.prevent
                @click="espansa = false"
            >
                <ChevronDown class="size-4 rotate-180" aria-hidden="true" />
            </button>
        </div>

        <ol class="talos-queue-list" :class="{ 'is-open': espansa }">
            <li
                v-for="voce in visibili"
                :key="voce.id"
                :data-testid="`talos-queue-item-${voce.id}`"
                class="talos-queue-item"
                :class="{ 'is-riga-unica': !espansa }"
                @contextmenu.prevent="onTastoDestro(voce.id)"
            >
                <template v-if="inModifica === voce.id">
                    <div class="w-full">
                        <textarea
                            ref="campoModifica"
                            v-model="bozza"
                            rows="3"
                            :data-testid="`talos-queue-edit-field-${voce.id}`"
                            :aria-label="t('chat.queueEditLabel')"
                            :aria-invalid="erroreModifica ? 'true' : undefined"
                            :aria-describedby="erroreModifica ? `talos-queue-edit-error-${voce.id}` : undefined"
                            class="talos-queue-edit-field"
                            @keydown.escape.prevent="chiudiModifica"
                        />
                        <p
                            v-if="erroreModifica"
                            :id="`talos-queue-edit-error-${voce.id}`"
                            :data-testid="`talos-queue-edit-error-${voce.id}`"
                            role="alert"
                            class="talos-queue-edit-error"
                        >{{ erroreModifica }}</p>
                        <!-- Come «Annulla»/«Modifica» del messaggio (TalosMobileMessageEdit): il Button dell'app. -->
                        <div class="talos-queue-edit-actions">
                            <Button
                                type="button"
                                variant="outline"
                                :data-testid="`talos-queue-edit-cancel-${voce.id}`"
                                class="talos-pressable"
                                :disabled="salvando"
                                @pointerdown.prevent
                                @click="chiudiModifica"
                            >{{ t('common.cancel') }}</Button>
                            <Button
                                type="button"
                                :data-testid="`talos-queue-edit-save-${voce.id}`"
                                class="talos-pressable"
                                :disabled="salvando"
                                @pointerdown.prevent
                                @click="salva"
                            >{{ t('chat.queueSave') }}</Button>
                        </div>
                    </div>
                </template>
                <template v-else>
                    <span v-if="!espansa" data-testid="talos-queue-count" class="talos-queue-count">{{ conteggio }}</span>
                    <!-- Il tocco sul testo apre e chiude la striscia (bersaglio grande, per il pollice); per la tastiera
                         c'è il pulsante con la freccia, che è quello che dice lo stato. -->
                    <p
                        :data-testid="`talos-queue-text-${voce.id}`"
                        :title="voce.testo"
                        class="talos-queue-text"
                        :class="espansa ? 'whitespace-pre-wrap break-words' : 'truncate'"
                        @click="onTestoToccato"
                        @pointerdown="onPressioneInizio(voce.id, $event)"
                        @pointermove="onPressioneMossa"
                        @pointerup="annullaPressione"
                        @pointercancel="annullaPressione"
                        @pointerleave="annullaPressione"
                    >{{ voce.testo }}</p>
                    <!--
                        ⛔ Pad, 24/09/2026: con la tastiera aperta (appena premuto Accoda) il tocco su «Ferma e riparti»
                        toglieva il fuoco al campo, la tastiera si chiudeva, la striscia scendeva e il rilascio cadeva
                        altrove: nessun click. Come i pulsanti del compositore, qui il pointerdown non sposta il fuoco
                        (W3C Pointer Events 3: annullato, niente mousedown di compatibilità; il click resta).
                        Vale per tutte le azioni della riga, per il ⋯ del menu e per la freccia.
                    -->
                    <div class="talos-queue-actions" @pointerdown.prevent>
                        <Button
                            v-if="!espansa && inPausa"
                            type="button"
                            data-testid="talos-queue-resume"
                            class="talos-pressable talos-queue-azione"
                            :variant="isTablet ? 'outline' : 'ghost'"
                            :size="isTablet ? 'default' : 'icon'"
                            :aria-label="isTablet ? undefined : t('chat.queueResume')"
                            :title="isTablet ? undefined : t('chat.queueResume')"
                            @click="emit('riprendi')"
                        >
                            <template v-if="isTablet">{{ t('chat.queueResume') }}</template>
                            <Play v-else class="size-4" aria-hidden="true" />
                        </Button>
                        <Button
                            v-if="mostraPrincipale"
                            type="button"
                            :data-testid="`talos-queue-primary-${voce.id}`"
                            class="talos-pressable talos-queue-azione"
                            :variant="isTablet ? 'outline' : 'ghost'"
                            :size="isTablet ? 'default' : 'icon'"
                            :aria-label="isTablet ? undefined : etichettaPrincipale"
                            :title="isTablet ? undefined : etichettaPrincipale"
                            @click="emit('principale', voce.id)"
                        >
                            <template v-if="isTablet">{{ etichettaPrincipale }}</template>
                            <component :is="iconaPrincipale" v-else class="size-4" aria-hidden="true" />
                        </Button>
                        <TalosRowActions
                            :ref="(istanza) => registraMenu(voce.id, istanza)"
                            :test-id="`talos-queue-menu-${voce.id}`"
                            :label="t('chat.queueActionsFor', { text: anteprima(voce.testo) })"
                            :items="azioniDellaVoce(voce)"
                            @select="(id: string) => onAzioneDelMenu(voce, id)"
                        />
                    </div>
                    <button
                        v-if="!espansa"
                        type="button"
                        data-testid="talos-queue-toggle"
                        class="talos-pressable talos-queue-icon-btn"
                        aria-expanded="false"
                        :aria-label="t('chat.queueShowAll')"
                        :title="t('chat.queueShowAll')"
                        @pointerdown.prevent
                        @click="espansa = true"
                    >
                        <ChevronDown class="size-4" aria-hidden="true" />
                    </button>
                    <!-- Chiusa: la spiegazione sta nella voce; la griglia la mette sotto (tablet: tutta la riga; telefono:
                         accanto alle icone). B3-STILE-2, owner 24/09. -->
                    <p v-if="!espansa" data-testid="talos-queue-hint" class="talos-queue-hint is-below">
                        <span v-for="(riga, indice) in spiegazioni" :key="indice" class="block">{{ riga }}</span>
                    </p>
                </template>
            </li>
        </ol>

        <!-- Aperta e in pausa: «Riprendi la coda» vale per tutta la coda, quindi chiude l'elenco invece di stare nella
             colonna degli «Invia ora» delle singole voci (decisione owner 24/09). -->
        <div v-if="espansa && inPausa" data-testid="talos-queue-foot" class="talos-queue-foot" @pointerdown.prevent>
            <Button
                type="button"
                data-testid="talos-queue-resume"
                class="talos-pressable talos-queue-azione"
                :variant="isTablet ? 'outline' : 'ghost'"
                :size="isTablet ? 'default' : 'icon'"
                :aria-label="isTablet ? undefined : t('chat.queueResume')"
                :title="isTablet ? undefined : t('chat.queueResume')"
                @click="emit('riprendi')"
            >
                <template v-if="isTablet">{{ t('chat.queueResume') }}</template>
                <Play v-else class="size-4" aria-hidden="true" />
            </Button>
        </div>
    </section>
</template>

<style scoped>
/*
 * Sta sopra il compositore e ne prende la lingua: stesso raggio (`--talos-radius-card`), stesso bordo, stessa
 * superficie — è un pezzo del compositore, non una notifica. Il solo accento di tono è la PAUSA, con la coppia
 * avviso (`--talos-warning` su `--talos-warning-soft`: il contrasto garantito da `talosContrast.ts`), perché lì la
 * coda non parte da sola e la persona deve accorgersene. Il colore non è mai il solo segnale: la parola «in pausa» c'è.
 */
.talos-queue-strip {
    margin-bottom: var(--talos-space-inline);
    padding: var(--talos-space-inline) var(--talos-space-card, 0.75rem);
    border: 1px solid var(--talos-border);
    border-radius: var(--talos-radius-card);
    background: var(--talos-composer-surface, var(--talos-card));
    color: var(--talos-text);
}
.talos-queue-strip.is-paused { border-color: var(--talos-warning-border, var(--talos-border)); }

.talos-queue-head {
    display: flex;
    align-items: center;
    gap: var(--talos-space-inline);
}
.talos-queue-count {
    flex: none;
    padding: 0.125rem 0.5rem;
    border-radius: 999px;
    background: var(--talos-active);
    color: var(--talos-text);
    font-size: var(--text-xs);
    font-weight: 600;
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
}
.talos-queue-strip.is-paused .talos-queue-count {
    background: var(--talos-warning-soft);
    color: var(--talos-warning);
}
.talos-queue-hint {
    flex: 1 1 auto;
    min-width: 0;
    font-size: var(--text-2xs);
    line-height: 1.35;
    color: var(--talos-muted);
}

.talos-queue-list { margin-top: 0.25rem; }
/* Espansa, la coda non si prende lo schermo: scorre dentro di sé. */
.talos-queue-list.is-open { max-height: 40dvh; overflow-y: auto; overscroll-behavior: contain; }
.talos-queue-item {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0 var(--talos-space-inline);
}
.talos-queue-item + .talos-queue-item { border-top: 1px solid var(--talos-border); }
.talos-queue-text {
    flex: 1 1 10rem;
    min-width: 0;
    padding-block: 0.25rem;
    font-size: var(--text-sm);
    line-height: 1.4;
    color: var(--talos-text);
    cursor: default;
    -webkit-user-select: none;
    user-select: none;
}
/* Su un telefono stretto le azioni vanno a capo SOTTO il testo, allineate a destra: il testo non si stringe a niente. */
.talos-queue-actions {
    display: flex;
    align-items: center;
    gap: var(--talos-space-inline);
    margin-inline-start: auto;
}
/*
 * Chiusa (B3-STILE-2, owner 24/09): una griglia con aree nominate (MDN `grid-template-areas`). Tablet: UNA riga
 * (conteggio · testo · azioni · freccia) e la spiegazione sotto per tutta la larghezza. Telefono: a 375px una riga sola
 * lasciava al messaggio «Poi f…» — riga 1 conteggio · testo · freccia, riga 2 spiegazione · icone affiancate.
 */
.talos-queue-item.is-riga-unica {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) auto auto;
    grid-template-areas:
        "conteggio testo azioni freccia"
        "spiegazione spiegazione spiegazione spiegazione";
    align-items: center;
    column-gap: var(--talos-space-inline);
    row-gap: 0.125rem;
}
.talos-queue-strip:not(.is-tablet) .talos-queue-item.is-riga-unica {
    grid-template-areas:
        "conteggio testo testo freccia"
        "spiegazione spiegazione azioni azioni";
}
.is-riga-unica > .talos-queue-count { grid-area: conteggio; }
.is-riga-unica > .talos-queue-text { grid-area: testo; }
.is-riga-unica > .talos-queue-actions { grid-area: azioni; }
.is-riga-unica > .talos-queue-icon-btn { grid-area: freccia; }
.is-riga-unica > .talos-queue-hint { grid-area: spiegazione; }
.talos-queue-list:not(.is-open) { margin-top: 0; }
/* Chiusa, la spiegazione sta sotto la riga, per intero, senza farsi schiacciare dai pulsanti. */
.talos-queue-hint.is-below { margin-top: 0.125rem; }
/* Aperta e in pausa: «Riprendi la coda» chiude l'elenco. */
.talos-queue-foot {
    display: flex;
    margin-block: var(--talos-space-inline) 0.25rem;
}

/*
 * ⭐ 24/09/2026 sera (B3-STILE, owner): via la capsula trasparente alta 48px. I pulsanti sono il Button dell'app (32px:
 * contornati con la scritta sul tablet, sole icone sul telefono) e si toccano comunque a 48px — Material 3: l'aspetto può
 * essere più piccolo del bersaglio, che arriva a 48dp col margine trasparente. In verticale sempre; in orizzontale solo
 * quanto basta a non sovrapporsi al vicino (sul telefono le icone stanno a 16px: 8px per lato).
 */
.talos-queue-azione { position: relative; }
.talos-queue-azione::after {
    content: '';
    position: absolute;
    inset-block: calc((var(--talos-touch-target) - 2rem) / -2);
    inset-inline: -0.25rem;
}
.talos-queue-strip:not(.is-tablet) .talos-queue-azione::after { inset-inline: calc((var(--talos-touch-target) - 2rem) / -2); }
.talos-queue-strip:not(.is-tablet) .talos-queue-actions { gap: 1rem; }
.talos-queue-icon-btn {
    display: inline-flex;
    flex: none;
    align-items: center;
    justify-content: center;
    width: var(--talos-touch-target);
    height: var(--talos-touch-target);
    border-radius: var(--talos-radius-control);
    color: var(--talos-muted);
}
.talos-queue-icon-btn:focus-visible,
.talos-queue-edit-field:focus-visible { outline: 2px solid var(--talos-ring); outline-offset: 2px; }

.talos-queue-edit-field {
    display: block;
    width: 100%;
    margin-top: 0.25rem;
    padding: var(--talos-space-inline);
    border: 1px solid var(--talos-border-strong, var(--talos-border));
    border-radius: var(--talos-radius-control);
    background: transparent;
    color: var(--talos-text);
    font: inherit;
    font-size: var(--text-sm);
    line-height: 1.5;
    resize: vertical;
}
.talos-queue-edit-error {
    margin-top: 0.25rem;
    padding: 0.25rem var(--talos-space-inline);
    border-radius: var(--talos-radius-control);
    background: var(--talos-danger-soft);
    color: var(--talos-danger);
    font-size: var(--text-2xs);
    line-height: 1.4;
}
.talos-queue-edit-actions {
    display: flex;
    justify-content: flex-end;
    gap: var(--talos-space-inline);
    margin-block: var(--talos-space-inline) 0.25rem;
}
</style>
