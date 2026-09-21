<script setup lang="ts">
import { onMounted, ref, watch } from 'vue'
import { ChevronLeft, ChevronRight, X } from '@lucide/vue'
import { useTalosI18n } from '@/i18n'

/**
 * ⭐⭐⭐ GUARDARE UN PDF DENTRO TALOS.
 *
 * ## Il difetto, misurato sul Pad il 2026-08-17
 *
 * TALOS genera un PDF, lo salva in Libreria, e la scheda lo mostra col nome e
 * il peso — «TALOS in tre righe.pdf · Documento · 10 KB». Toccandola non
 * succede **niente**: è un'etichetta muta. L'owner: «il PDF bisogna poterlo
 * visualizzare dentro la app».
 *
 * ## ⛔ Perché il renderer di Android e non una libreria
 *
 * Cercato prima di scrivere, e la scelta ha dei numeri dietro:
 *
 * | strada | costo |
 * |---|---|
 * | `PdfRenderer` del framework | **0 byte** di APK, 0 dipendenze |
 * | AndroidPdfViewer / Pdfium | ~16 MB di `.so`, una copia per architettura |
 * | pdf.js dentro la WebView | megabyte di JS **nel grafo d'avvio**, che ha un tetto di 605.000 byte |
 *
 * ⇒ La terza sarebbe stata la più comoda da scrivere e l'unica che non
 * possiamo permetterci: quel tetto esiste perché il motore locale gira su
 * questo telefono, e un visualizzatore non è una ragione per alzarlo.
 *
 * ## ⛔ Ed è scritto UNA volta
 *
 * Stessa ragione del visualizzatore di immagini, e l'owner l'ha già detta
 * almeno due volte: «i due component devono essere esattamente identici con
 * gli stessi controlli». Qualunque superficie mostri un PDF monta questo.
 */
const props = defineProps<{
    /** Il `content://` o il percorso del file, come la Libreria lo conserva. */
    percorso: string
    /** Il nome vero: entra nel titolo e in ogni nome accessibile. */
    nome: string
}>()

const emit = defineEmits<{ chiudi: [] }>()

const { t } = useTalosI18n()

const pagina = ref(0)
const pagine = ref(0)
const immagine = ref<string | null>(null)
const caricando = ref(false)
/**
 * ⛔ Il motivo si TIENE, e non è pedanteria: «non si apre» e «non è un PDF»
 * portano a due frasi diverse per chi legge. Un visualizzatore che mostra un
 * riquadro vuoto senza dire perché è la stessa bugia del segno «Fatto» su una
 * cosa non fatta.
 */
const motivo = ref<string | null>(null)

async function rendi(quale: number): Promise<void> {
    if (caricando.value) return
    caricando.value = true
    motivo.value = null
    try {
        const { TalosDeviceBridge } = await import('@/lib/device/devicePlugin')
        /*
         * ⛔ La larghezza la decide lo SCHERMO, non una costante: su un tablet
         * un valore da telefono esce sgranato, e su un telefono un valore da
         * tablet è memoria buttata. `devicePixelRatio` c'è perché la pagina
         * renda alla densità vera.
         */
        const larghezza = Math.round(
            Math.min(window.innerWidth, 1400) * Math.min(window.devicePixelRatio || 1, 2),
        )
        const esito = await TalosDeviceBridge.renderizzaPdf({
            percorso: props.percorso,
            pagina: quale,
            larghezza,
        })
        if (esito.done === true && typeof esito.png === 'string') {
            immagine.value = esito.png
            pagine.value = esito.pagine ?? 1
            // ⛔ Si prende la pagina che il nativo dice di aver reso, non quella
            // chiesta: lui la limita all'intervallo vero, e credere alla nostra
            // farebbe mostrare «pagina 9 di 3».
            pagina.value = esito.pagina ?? quale
        } else {
            immagine.value = null
            motivo.value = esito.reason ?? 'sconosciuto'
        }
    } catch (e) {
        immagine.value = null
        motivo.value = e instanceof Error ? e.name : 'sconosciuto'
    } finally {
        caricando.value = false
    }
}

onMounted(() => { void rendi(0) })
watch(() => props.percorso, () => { pagina.value = 0; void rendi(0) })

const vaiA = (quale: number): void => {
    if (quale < 0 || quale >= pagine.value || quale === pagina.value) return
    void rendi(quale)
}
</script>

<template>
    <div
        class="fixed inset-0 z-[80] flex flex-col bg-[var(--talos-background)]"
        role="dialog"
        aria-modal="true"
        :aria-label="props.nome"
        data-testid="talos-pdf-viewer"
    >
        <header class="flex items-center gap-2 px-4 py-3">
            <p class="min-w-0 flex-1 truncate text-sm text-[var(--talos-text)]">{{ props.nome }}</p>
            <button
                type="button"
                class="talos-pressable min-h-touch rounded-full px-3"
                :aria-label="t('common.close')"
                data-testid="talos-pdf-viewer-close"
                @click="emit('chiudi')"
            >
                <X class="size-5" aria-hidden="true" />
            </button>
        </header>

        <div class="flex min-h-0 flex-1 items-center justify-center overflow-auto px-3 py-2">
            <!--
                ⛔⛔ PAGINA-CHE-NON-CI-STA-01 — c'era solo `max-w-full`.

                Una pagina è alta più che larga, e un vincolo sulla sola
                LARGHEZZA non la fa entrare: su un tablet in orizzontale la
                pagina esce sotto e si legge scorrendo, che per la PRIMA
                occhiata a un documento è la cosa sbagliata — un PDF si apre
                per vedere che cos'è, non per leggerne il quinto di sopra.

                ⇒ `max-h-full` accanto a `max-w-full`, e `object-contain` che
                decide quale dei due morde: la pagina intera entra sempre,
                nelle sue proporzioni, in verticale e in orizzontale. Restano
                `w-auto h-auto` perché una pagina piccola non venga gonfiata
                oltre i pixel che ha davvero.
            -->
            <img
                v-if="immagine"
                :src="immagine"
                :alt="props.nome"
                class="h-auto max-h-full w-auto max-w-full object-contain"
                data-testid="talos-pdf-viewer-pagina"
            >
            <!--
                ⛔ Il motivo SI DICE. Un riquadro vuoto lascia credere che il
                documento sia vuoto, che è un'altra cosa da «non sono riuscito
                ad aprirlo» — e manda a cercare un difetto nel posto sbagliato.
            -->
            <p
                v-else-if="motivo"
                class="px-6 text-center text-sm text-[var(--talos-muted)]"
                data-testid="talos-pdf-viewer-errore"
            >{{ t('library.pdfNonSiApre') }}</p>
            <p
                v-else
                class="text-sm text-[var(--talos-muted)]"
                data-testid="talos-pdf-viewer-attesa"
            >{{ t('common.loading') }}</p>
        </div>

        <!--
            ⛔ Le frecce ci sono SOLO con più di una pagina: due comandi spenti
            sotto un documento di una pagina sola sono rumore che sembra un
            guasto.
        -->
        <footer
            v-if="pagine > 1"
            class="flex items-center justify-center gap-4 px-4 py-3"
            data-testid="talos-pdf-viewer-pagine"
        >
            <button
                type="button"
                class="talos-pressable min-h-touch rounded-full px-3 disabled:opacity-40"
                :disabled="pagina <= 0 || caricando"
                :aria-label="t('library.pdfPrecedente')"
                data-testid="talos-pdf-viewer-prima"
                @click="vaiA(pagina - 1)"
            >
                <ChevronLeft class="size-5" aria-hidden="true" />
            </button>
            <span class="text-sm text-[var(--talos-muted)]">{{ pagina + 1 }} / {{ pagine }}</span>
            <button
                type="button"
                class="talos-pressable min-h-touch rounded-full px-3 disabled:opacity-40"
                :disabled="pagina >= pagine - 1 || caricando"
                :aria-label="t('library.pdfSuccessiva')"
                data-testid="talos-pdf-viewer-dopo"
                @click="vaiA(pagina + 1)"
            >
                <ChevronRight class="size-5" aria-hidden="true" />
            </button>
        </footer>
    </div>
</template>
