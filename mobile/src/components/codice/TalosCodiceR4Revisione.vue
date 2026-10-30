<script setup lang="ts">
/**
 * ⛔ K3 Revisione (ledger `LEDGER-K3-REVISIONE-2026-10-17.md`; owner 17/10 «Revisione»): la vista «Review» del Codice su r4, come
 * `#schermoReview` del desktop r4 @ 701c6c0d2 (`index.template.html:789-832`, `components/review.js`, `renderRealReviewList`,
 * `renderReviewFile`). I file sono quelli che la sessione ha scritto (una voce per percorso, dal pannello); il diff è quello
 * dell'ULTIMA scrittura di ogni file, col suo «prima».
 * Adattamenti dichiarati (ledger): le linguette sono quelle del Terminale (BC-63 del desktop: «lo stesso component tab di
 * terminale»), il menu della linguetta diventa il «…» nella testa del diff con le stesse tre voci vere, le copie dicono l'esito
 * nei toast dell'app. Le azioni «fase 3» del desktop (Accetta, Apri nell'editor, Scarta) sono nascoste anche lì: qui non ci sono.
 */
import { computed, nextTick, ref, watch } from 'vue'
import { Copy, FileDiff, EllipsisVertical } from '@lucide/vue'
import { useTalosI18n } from '@/i18n'
import type { FileR4 } from '@/lib/harness/r4/pannelloR4'
import {
    avvisoSimboliR4, etichettaFileReviewR4, riassuntoReviewR4, suggerimentoFileR4, testaDiffR4, testoCopiatiR4, testoDiffCompletoR4,
    testoDiffDiUnFileR4, testoRevisioneR4,
} from '@/lib/harness/r4/revisioneR4'
import { writeTalosClipboardText } from '@/services/clipboard'
import { useTalosMobileToasts } from '@/stores/toasts'

const props = defineProps<{
    file: FileR4[]
    /** Il percorso dell'ultima scrittura: è il file che si mostra (come `reviewDaDisegnareDopoLaStoria` e `renderReviewFile`). */
    ultimoFile: string | null
    /** «Apri il file» vuole una sessione da cui leggerlo (`puoAprire: () => Boolean(state.realSession.id)`). */
    puoAprire: boolean
}>()
const emit = defineEmits<{ apri: [percorso: string] }>()
const { locale } = useTalosI18n()
const tr = (chiave: string, valori?: Record<string, unknown>) => testoRevisioneR4(chiave, locale.value, valori)
const toasts = useTalosMobileToasts()
/** Come le copie della scheda File: un esito riuscito se ne va dopo 5 s, un rifiuto dopo 6 s. */
const DURATA_RIUSCITO = 5_000
const DURATA_RIFIUTO = 6_000

/** Il file scelto: quello dell'ultima scrittura, finché la persona non ne tocca un altro; una scrittura nuova lo riporta lì. */
const scelto = ref<string | null>(props.ultimoFile)
watch(() => props.ultimoFile, (ultimo) => { if (ultimo) scelto.value = ultimo })
const voce = computed(() => props.file.find((f) => f.path === scelto.value) ?? props.file.at(-1) ?? null)
const testa = computed(() => (voce.value ? testaDiffR4(voce.value, locale.value) : null))
const avviso = computed(() => (voce.value ? avvisoSimboliR4(voce.value, locale.value) : null))
const riassunto = computed(() => (props.file.length ? riassuntoReviewR4(props.file, locale.value) : ''))
const menuAperto = ref(false)
watch(scelto, () => { menuAperto.value = false })

const linguette = ref<HTMLElement | null>(null)
const linguettaDi = (percorso: string) => [...(linguette.value?.querySelectorAll<HTMLElement>('[data-file]') ?? [])].find((b) => b.dataset.file === percorso)
/* Visto sul Pad (telefono, 17/10): la linguetta scelta restava tagliata in fondo alla striscia. Come `tieniInVistaScheda` del desktop
   (F6-1, 26/09): il file scelto scorre in vista, senza muovere la pagina. */
watch(() => voce.value?.path, async (percorso) => {
    if (!percorso) return
    await nextTick()
    linguettaDi(percorso)?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' })
}, { flush: 'post' })
async function scegli(percorso: string, fuoco = false): Promise<void> {
    scelto.value = percorso
    if (!fuoco) return
    await nextTick()
    linguettaDi(percorso)?.focus()
}
/** La tastiera delle schede (APG «Tabs»): frecce, Inizio e Fine; il file scelto segue il fuoco. */
function tasto(evento: KeyboardEvent, indice: number): void {
    const n = props.file.length
    const verso: Record<string, number> = { ArrowRight: indice + 1, ArrowLeft: indice - 1, Home: 0, End: n - 1 }
    if (!(evento.key in verso)) return
    evento.preventDefault()
    void scegli(props.file[(verso[evento.key] + n) % n].path, true)
}

async function copia(testo: string, riuscita: string): Promise<void> {
    try {
        await writeTalosClipboardText(testo)
        toasts.push({ message: riuscita, durationMs: DURATA_RIUSCITO })
    } catch {
        toasts.push({ message: tr('app.common.copyFailed'), durationMs: DURATA_RIFIUTO })
    }
}
const nomeDi = (percorso: string) => percorso.split('/').pop() ?? percorso
const azioni = computed(() => {
    const v = voce.value
    if (!v) return []
    return [
        { id: 'apri', testo: tr('varie.review.menu.open'), attiva: props.puoAprire, fai: () => emit('apri', v.path) },
        { id: 'copia-percorso', testo: tr('varie.review.menu.copyPath'), attiva: true, fai: () => copia(v.path, tr('app.common.pathCopied')) },
        { id: 'copia-diff', testo: tr('varie.review.menu.copyDiff'), attiva: (v.code?.length ?? 0) > 0, fai: () => copia(testoDiffDiUnFileR4(v, locale.value), tr('app.review.diffCopied', { nome: nomeDi(v.path) })) },
    ]
})
function scegliAzione(a: { attiva: boolean; fai: () => unknown }): void {
    if (!a.attiva) return
    menuAperto.value = false
    void a.fai()
}
const copiaTutti = () => copia(testoDiffCompletoR4(props.file, locale.value), testoCopiatiR4(props.file.length, locale.value))
</script>

<template>
    <section data-testid="talos-codice-r4-revisione" class="talos-codice-r4-revisione">
        <div v-if="!file.length" data-testid="talos-codice-r4-revisione-vuoto" class="talos-codice-r4-revisione-vuoto">
            <FileDiff class="size-6 text-[var(--talos-muted)]" aria-hidden="true" />
            <h3 class="text-md font-medium text-[var(--talos-text)]">{{ tr('modello.review.noFileWrittenSo') }}</h3>
            <p class="max-w-[42ch] text-sm leading-5 text-[var(--talos-muted)]">{{ tr('modello.review.whenTalosWritesOr') }}</p>
        </div>
        <template v-else>
            <div class="talos-codice-r4-terminale-testa">
                <div ref="linguette" class="talos-codice-r4-terminale-schede" role="tablist" :aria-label="tr('modello.review.changedFiles')">
                    <div
                        v-for="(f, i) in file"
                        :key="f.path"
                        class="talos-codice-r4-terminale-linguetta"
                        :data-attiva="f.path === voce?.path"
                    >
                        <button
                            type="button"
                            role="tab"
                            :data-file="f.path"
                            :aria-selected="f.path === voce?.path"
                            :tabindex="f.path === voce?.path ? 0 : -1"
                            aria-controls="talos-codice-r4-revisione-diff"
                            :title="suggerimentoFileR4(f, locale)"
                            class="talos-codice-r4-terminale-scheda talos-codice-r4-revisione-scheda"
                            @click="scegli(f.path)"
                            @keydown="tasto($event, i)"
                        >
                            <span data-parte="nome" class="truncate font-mono">{{ etichettaFileReviewR4(f, file) }}</span>
                            <span class="talos-codice-r4-revisione-piu">+{{ f.aggiunte }}</span>
                            <span v-if="f.rimozioni > 0" class="talos-codice-r4-revisione-meno">−{{ f.rimozioni }}</span>
                        </button>
                    </div>
                </div>
                <span data-testid="talos-codice-r4-revisione-sommario" class="talos-codice-r4-revisione-sommario" :title="riassunto">{{ riassunto }}</span>
                <button
                    type="button"
                    data-azione="copia-tutti"
                    class="talos-codice-r4-terminale-piu"
                    :aria-label="tr('modello.review.copyTheDiffs')"
                    :title="tr('modello.review.copyAllDiffsTo')"
                    @click="copiaTutti"
                >
                    <Copy class="size-4" aria-hidden="true" />
                </button>
            </div>

            <article v-if="voce && testa" id="talos-codice-r4-revisione-diff" role="tabpanel" class="talos-codice-r4-revisione-diff">
                <header data-testid="talos-codice-r4-revisione-testa" class="talos-codice-r4-revisione-testa">
                    <span data-parte="percorso" class="min-w-0 flex-1 truncate font-mono" :title="testa.percorso">{{ testa.percorso }}</span>
                    <span data-parte="piu" class="talos-codice-r4-revisione-piu">{{ testa.piu }}</span>
                    <span v-if="testa.meno" data-parte="meno" class="talos-codice-r4-revisione-meno">{{ testa.meno }}</span>
                    <span v-if="testa.giro" data-parte="giro" class="shrink-0 font-mono text-[var(--talos-muted)]">{{ testa.giro }}</span>
                    <button
                        type="button"
                        data-azione="menu"
                        class="talos-codice-r4-icona-azione"
                        :aria-label="tr('varie.review.menu.label')"
                        aria-haspopup="menu"
                        :aria-expanded="menuAperto"
                        @click="menuAperto = !menuAperto"
                    >
                        <EllipsisVertical class="size-4" aria-hidden="true" />
                    </button>
                </header>
                <div v-if="menuAperto" role="menu" :aria-label="tr('varie.review.menu.label')" class="talos-codice-r4-processo-azioni">
                    <button
                        v-for="a in azioni"
                        :key="a.id"
                        type="button"
                        role="menuitem"
                        :data-azione="a.id"
                        :aria-disabled="a.attiva ? undefined : 'true'"
                        class="talos-codice-r4-azione"
                        :class="a.attiva ? '' : 'opacity-50'"
                        @click="scegliAzione(a)"
                    >{{ a.testo }}</button>
                </div>
                <div v-if="avviso" data-testid="talos-codice-r4-revisione-avviso" role="note" class="talos-codice-r4-revisione-avviso">
                    <span class="talos-codice-r4-revisione-badge">{{ avviso.badge }}</span>
                    <div class="min-w-0">
                        <p class="font-medium">{{ avviso.titolo }}</p>
                        <p class="break-words font-mono text-[var(--talos-muted)]">{{ avviso.elenco }}</p>
                    </div>
                </div>
                <div data-testid="talos-codice-r4-revisione-righe" class="talos-codice-r4-revisione-righe">
                    <div class="talos-codice-r4-revisione-righe-dentro">
                        <div v-for="(r, i) in voce.code ?? []" :key="i" :data-tipo="r[0]" class="talos-codice-r4-revisione-riga">{{ r[1] }}</div>
                    </div>
                </div>
            </article>
        </template>
    </section>
</template>
