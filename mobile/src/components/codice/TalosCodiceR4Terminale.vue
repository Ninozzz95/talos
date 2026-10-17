<script setup lang="ts">
/**
 * ⛔ K3-TERM T3 (ledger `LEDGER-K3-TERMINALE-2026-10-16.md`): la vista Terminale del Codice su r4. Owner 16/10: si scrive
 * direttamente nel terminale (xterm 6.0.0, come il desktop e Hermes), con una barra dei tasti su una riga sopra la tastiera; più
 * schede come il desktop (`legacy/app.js:15783-16260` @ `2161afb32`). xterm si carica solo qui (import dinamico): il pacchetto
 * d'avvio non lo porta. Una xterm per scheda, creata la prima volta che la scheda diventa attiva e tenuta finché la scheda c'è.
 */
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, Plus, RotateCw, X } from '@lucide/vue'
import { useTalosI18n } from '@/i18n'
import type { ClienteTerminaleR4, SchedaTerminaleR4 } from '@/composables/useTerminaleR4'
import { useTerminaleR4 } from '@/composables/useTerminaleR4'
import {
    SCHEDE_MASSIME_R4,
    TASTI_TERMINALE_R4,
    conModificatoriR4,
    frasiAvvioFallitoR4,
    sequenzaTastoR4,
    testoTerminaleR4,
    titoloSchedaR4,
} from '@/lib/harness/r4/terminaleR4'
import { attaccaImeR4 } from '@/lib/harness/r4/imeAndroidR4'
import type { Terminal } from '@xterm/xterm'
import type { FitAddon } from '@xterm/addon-fit'

const props = defineProps<{ sessioneId: string; cliente: ClienteTerminaleR4 }>()
const { locale } = useTalosI18n()
const tr = (chiave: string, valori?: Record<string, unknown>) => testoTerminaleR4(chiave, locale.value, valori)

const t = useTerminaleR4({ sessioneId: () => props.sessioneId, cliente: props.cliente })
const schede = t.schede
const attiva = t.attiva

interface Schermo { term: Terminal; fit: FitAddon; cols: number; rows: number; scrittaUscita: boolean; staccaIme: () => void }
const schermi = new Map<string, Schermo>()
const contenitori = new Map<string, HTMLElement>()
const area = ref<HTMLElement | null>(null)
const modificatori = ref({ ctrl: false, alt: false })
/** Le frecce con le icone dell'app: i glifi ← → del carattere a spaziatura fissa uscivano più piccoli e più bassi di ↑ ↓ (foto del Pad, 16/10). */
const ICONE_TASTI: Record<string, typeof ArrowLeft> = { sinistra: ArrowLeft, giu: ArrowDown, su: ArrowUp, destra: ArrowRight }

let xterm: Promise<{ Terminal: typeof Terminal; FitAddon: typeof FitAddon }> | null = null
function caricaXterm() {
    xterm ??= Promise.all([import('@xterm/xterm'), import('@xterm/addon-fit'), import('@xterm/xterm/css/xterm.css')])
        .then(([x, f]) => ({ Terminal: x.Terminal, FitAddon: f.FitAddon }))
    return xterm
}

/** I colori dei blocchi di codice della chat (`--talos-code-*`), letti dal tema: il terminale segue chiaro e scuro come il resto. */
function tema() {
    const s = area.value ? getComputedStyle(area.value) : null
    const v = (nome: string, riserva: string) => s?.getPropertyValue(nome).trim() || riserva
    return {
        background: v('--talos-code-bg', v('--talos-window-bg', '#111318')),
        foreground: v('--talos-code-text', v('--talos-text', '#e6e6e6')),
        cursor: v('--talos-accent', '#d6a14a'),
        selectionBackground: v('--talos-accent-soft', 'rgba(214,161,74,0.3)'),
        fontFamily: v('--talos-font-mono', 'ui-monospace, monospace'),
    }
}

function ridimensionaAttiva() {
    const id = attiva.value
    const s = id ? schermi.get(id) : null
    if (!s) return
    try { s.fit.fit() } catch { /* contenitore nascosto: si rifà quando torna visibile */ }
    if (s.term.cols !== s.cols || s.term.rows !== s.rows) {
        s.cols = s.term.cols
        s.rows = s.term.rows
        void t.ridimensiona(s.cols, s.rows)
    }
}

async function prepara(terminalId: string) {
    let s = schermi.get(terminalId)
    if (!s) {
        const { Terminal: T, FitAddon: F } = await caricaXterm()
        await nextTick()
        const el = contenitori.get(terminalId)
        if (!el || schermi.has(terminalId)) return
        const colori = tema()
        const term = new T({
            fontFamily: colori.fontFamily,
            fontSize: 13,
            cursorBlink: true,
            scrollback: 5000,
            theme: { background: colori.background, foreground: colori.foreground, cursor: colori.cursor, selectionBackground: colori.selectionBackground },
        })
        const fit = new F()
        term.loadAddon(fit)
        term.open(el)
        // TERM-IME: la tastiera Android (keyCode 229) passa dalla nostra cura, non dal diff di xterm 6.0.0 (xterm #3600)
        const staccaIme = attaccaImeR4(term)
        term.onData((dati) => {
            const m = modificatori.value
            const testo = m.ctrl || m.alt ? conModificatoriR4(dati, m) : dati
            if (m.ctrl || m.alt) modificatori.value = { ctrl: false, alt: false }
            void t.scrivi(testo)
        })
        s = { term, fit, cols: 0, rows: 0, scrittaUscita: false, staccaIme }
        schermi.set(terminalId, s)
    }
    const schermo = s
    await t.collega(terminalId, { scrivi: (testo) => schermo.term.write(testo), azzera: () => { schermo.term.reset(); schermo.scrittaUscita = false } })
    ridimensionaAttiva()
}

function tasto(id: string) {
    if (id === 'ctrl' || id === 'alt') {
        modificatori.value = { ...modificatori.value, [id]: !modificatori.value[id] }
        return
    }
    const s = attiva.value ? schermi.get(attiva.value) : null
    if (!s) return
    const seq = sequenzaTastoR4(id, { cursoreApplicazione: s.term.modes.applicationCursorKeysMode })
    if (seq) s.term.input(seq, true)
    s.term.focus()
}

async function nuova() { await t.nuova() }
async function chiudi(id: string) {
    const s = schermi.get(id)
    s?.staccaIme()
    s?.term.dispose()
    schermi.delete(id)
    await t.chiudi(id)
}
function ricollega() { if (attiva.value) void prepara(attiva.value) }

function registra(id: string, el: unknown) {
    if (el instanceof HTMLElement) contenitori.set(id, el)
    else contenitori.delete(id)
}

/** Shell uscita o mai partita: la frase del desktop anche dentro il terminale, come `[shell chiusa, codice N]` del desktop. */
watch(schede, (elenco) => {
    for (const s of elenco) {
        const schermo = schermi.get(s.terminalId)
        if (!schermo || schermo.scrittaUscita || s.stato !== 'terminato') continue
        const frase = s.erroreAvvio ? frasiAvvioFallitoR4(s.erroreAvvio, locale.value) : tr('app.terminal.shellClosed', { codice: s.codiceUscita ?? '?' })
        schermo.term.write(`\r\n[${frase}]\r\n`)
        schermo.scrittaUscita = true
    }
}, { deep: true })

watch(attiva, (id) => {
    if (!id) return
    if (!schermi.has(id)) void prepara(id)
    else void nextTick(() => { ridimensionaAttiva(); schermi.get(id)?.term.focus() })
})

const ETICHETTA_STATO: Record<SchedaTerminaleR4['stato'], string> = {
    attesa: 'processi.terminal.stateWaiting',
    connessione: 'processi.terminal.stateConnecting',
    connesso: 'processi.terminal.stateConnected',
    terminato: 'processi.terminal.stateShellClosed',
    disconnesso: 'processi.terminal.stateDisconnected',
}
const corrente = computed(() => schede.value.find((s) => s.terminalId === attiva.value) ?? null)
const piede = computed(() => {
    const s = corrente.value
    if (!s) return ''
    if (s.erroreAvvio) return frasiAvvioFallitoR4(s.erroreAvvio, locale.value)
    const cartella = s.cartella.split('/').filter(Boolean).pop() ?? ''
    const stato = tr(ETICHETTA_STATO[s.stato]) + (s.stato === 'connesso' && s.ripreso ? ` · ${tr('app.terminal.shellResumed')}` : '')
    return [tr('processi.terminal.openedByYou'), cartella, stato].filter(Boolean).join(' · ')
})
const puoAprire = computed(() => schede.value.length < SCHEDE_MASSIME_R4)

let osservatore: ResizeObserver | null = null
onMounted(async () => {
    if (typeof ResizeObserver === 'function' && area.value) {
        osservatore = new ResizeObserver(() => ridimensionaAttiva())
        osservatore.observe(area.value)
    }
    await t.carica()
})
onBeforeUnmount(() => {
    osservatore?.disconnect()
    for (const s of schermi.values()) { s.staccaIme(); s.term.dispose() }
    schermi.clear()
    void t.distruggi()
})

defineExpose({ ridimensionaAttiva })
</script>

<template>
    <section data-testid="talos-codice-r4-terminale" class="talos-codice-r4-terminale">
        <div class="talos-codice-r4-terminale-testa">
            <div class="talos-codice-r4-terminale-schede" role="tablist" :aria-label="tr('mobile.schede.label')">
                <div
                    v-for="s in schede"
                    :key="s.terminalId"
                    class="talos-codice-r4-terminale-linguetta"
                    :data-attiva="s.terminalId === attiva"
                >
                    <button
                        type="button"
                        role="tab"
                        data-testid="talos-codice-r4-terminale-scheda"
                        :data-stato="s.stato"
                        :aria-selected="s.terminalId === attiva"
                        class="talos-codice-r4-terminale-scheda"
                        @click="attiva = s.terminalId"
                    >
                        <span class="talos-codice-r4-terminale-pallino" :data-stato="s.stato" aria-hidden="true" />
                        <span class="truncate">{{ titoloSchedaR4(s, schede, locale) }}</span>
                    </button>
                    <button
                        type="button"
                        :data-testid="`talos-codice-r4-terminale-chiudi-${s.terminalId}`"
                        class="talos-codice-r4-terminale-chiudi"
                        :aria-label="`${tr('processi.terminal.close')}: ${titoloSchedaR4(s, schede, locale)}`"
                        @click="void chiudi(s.terminalId)"
                    >
                        <X class="size-3.5" aria-hidden="true" />
                    </button>
                </div>
            </div>
            <button
                v-if="schede.length"
                type="button"
                data-testid="talos-codice-r4-terminale-piu"
                class="talos-codice-r4-terminale-piu"
                :disabled="!puoAprire"
                :aria-label="puoAprire ? tr('processi.terminal.newTab') : tr('processi.terminal.tooManyTabs', { n: SCHEDE_MASSIME_R4 })"
                @click="void nuova()"
            >
                <Plus class="size-4" aria-hidden="true" />
            </button>
        </div>

        <div ref="area" class="talos-codice-r4-terminale-area">
            <div v-if="!schede.length" data-testid="talos-codice-r4-terminale-vuoto" class="talos-codice-r4-terminale-vuoto">
                <p class="font-medium text-[var(--talos-text)]">{{ tr('processi.terminal.noTabs') }}</p>
                <p>{{ tr('app.terminal.pressNew') }}</p>
                <button type="button" data-testid="talos-codice-r4-terminale-nuova" class="talos-codice-r4-terminale-nuova" @click="void nuova()">
                    <Plus class="size-4" aria-hidden="true" /> {{ tr('processi.terminal.new') }}
                </button>
            </div>
            <div
                v-for="s in schede"
                v-show="s.terminalId === attiva"
                :key="s.terminalId"
                :ref="(el) => registra(s.terminalId, el)"
                role="tabpanel"
                class="talos-codice-r4-terminale-schermo"
            />
        </div>

        <p v-if="corrente" data-testid="talos-codice-r4-terminale-piede" class="talos-codice-r4-terminale-piede" role="status">
            <span class="min-w-0 truncate">{{ piede }}</span>
            <button
                v-if="corrente.stato === 'disconnesso'"
                type="button"
                data-testid="talos-codice-r4-terminale-ricollega"
                class="talos-codice-r4-terminale-ricollega"
                @click="ricollega"
            >
                <RotateCw class="size-3.5" aria-hidden="true" /> {{ tr('mobile.ricollega') }}
            </button>
        </p>

        <div v-if="corrente" class="talos-codice-r4-tasti" role="toolbar" :aria-label="tr('mobile.tasti.label')">
            <button
                v-for="k in TASTI_TERMINALE_R4"
                :key="k.id"
                type="button"
                :data-testid="`talos-codice-r4-tasto-${k.id}`"
                class="talos-codice-r4-tasto"
                :aria-label="tr(`mobile.tasti.${k.id}`)"
                :aria-pressed="k.modificatore ? modificatori[k.id as 'ctrl' | 'alt'] : undefined"
                :title="k.modificatore ? tr('mobile.tasti.premuto', { tasto: k.etichetta }) : undefined"
                @mousedown.prevent
                @click="tasto(k.id)"
            >
                <component :is="ICONE_TASTI[k.id]" v-if="ICONE_TASTI[k.id]" class="size-4" aria-hidden="true" />
                <template v-else>{{ k.etichetta }}</template>
            </button>
        </div>
    </section>
</template>
