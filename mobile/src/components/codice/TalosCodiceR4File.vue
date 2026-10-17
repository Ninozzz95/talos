<script setup lang="ts">
/**
 * ⛔ K3-FILE (ledger `LEDGER-K3-CODICE-COME-LA-CHAT-2026-10-15.md`, owner 15/10 sera «Albero completo»): la scheda File del pannello ▤.
 * In cima i file toccati in questa sessione (com'era); sotto l'albero della cartella della sessione, come il desktop r4 @ 2161afb32
 * (`costruisciNodoAlbero`, `legacy/app.js:19378`): cartelle prima, freccia solo sulle cartelle, una cartella si apre col suo livello
 * (letto alla prima apertura), il tocco su un file ne apre l'anteprima (`GET /:id/tree/file`). La ricerca per nome cerca in tutta la
 * cartella (`GET /:id/tree/search`) con gli avvisi del desktop. Ogni livello che non si carica lo dice, con «Aggiorna».
 * Le azioni sono quelle del menu del desktop (`apriMenuAzioniFile`, `legacy/app.js:19725`), più «Sposta in…» (sul desktop si trascina):
 * il nome si controlla prima (`nomeValidoR4`), elimina chiede conferma, copia no, e ogni esito va nei toast dell'app.
 * K3-C Allegati A1 (owner 16/10): «Allega alla chat» dal menu di un file e dalla selezione (la casella `ft-check` e la barra del desktop,
 * `legacy/app.js:18270-18330`): il percorso sale alla schermata (`allega`), che lo mette nel campo come `@percorso `.
 */
import { computed, onMounted, ref, watch } from 'vue'
import { ArrowLeft, Check, ChevronDown, ChevronRight, File as IconaFile, FileCode, Folder, FolderOpen, Paperclip, RefreshCw, Square, SquareCheck, X } from '@lucide/vue'
import { useTalosI18n } from '@/i18n'
import { Button } from '@/components/ui/button'
import TalosMobileConfirmDialog from '@/components/shell/TalosMobileConfirmDialog.vue'
import TalosRowActions, { type TalosRowAction } from '@/components/talos/ui/TalosRowActions.vue'
import { useTalosMobileToasts } from '@/stores/toasts'
import { writeTalosClipboardText } from '@/services/clipboard'
import {
    cartellePerSpostareR4, categoriaFileR4, genitoreR4, nomeValidoR4, percorsoFiglioR4, riportaAperteR4, righeAlberoR4, testoFileR4,
    type RisultatoRicercaR4, type VoceAlberoR4,
} from '@/lib/harness/r4/alberoR4'
import { campoDellaMemoriaR4, creaMemoriaFileR4, type MemoriaFileR4 } from '@/lib/harness/r4/memoriaPannelloR4'
import './codiceR4.css'

type Esito<T> = ({ ok: true } & T) | { ok: false; motivo: string }
const props = defineProps<{
    caricaAlbero: (percorso: string) => Promise<Esito<{ voci: VoceAlberoR4[] }>>
    cercaFile: (ricerca: string) => Promise<Esito<{ risultati: RisultatoRicercaR4[]; avvisi: string[] }>>
    apriFile: (percorso: string) => Promise<Esito<{ contenuto: string; dimensione: number }>>
    /** Cambia a ogni giro finito: i livelli già letti si rileggono (l'agente può aver creato o tolto file). */
    giriFiniti: number
    /** Crea, rinomina, duplica, sposta, elimina (rotte /tree di r4). Senza, l'albero è in sola lettura. */
    azioneFile?: (azione: 'crea' | 'rinomina' | 'duplica' | 'sposta' | 'elimina', corpo: Record<string, unknown>) => Promise<Esito<{ percorso: string | null }>>
    /** Pad 16/10: cartelle aperte, livelli letti, scelta e ricerca, tenuti dalla schermata (la rotazione rimonta il pannello). */
    memoria?: MemoriaFileR4
}>()
/** K3-C Allegati A1: i percorsi da allegare alla chat (dal menu di un file o dalla selezione). */
const emit = defineEmits<{ allega: [percorsi: string[]] }>()
const { t, locale } = useTalosI18n()
const tr = (chiave: string, valori?: Record<string, unknown>) => testoFileR4(chiave, locale.value, valori)

// ---- l'albero ----
const memoriaLocale = creaMemoriaFileR4()
const livelli = campoDellaMemoriaR4(() => props.memoria, memoriaLocale, 'livelli')
const aperte = campoDellaMemoriaR4(() => props.memoria, memoriaLocale, 'aperte')
const errori = ref(new Map<string, string>())
const righe = computed(() => righeAlberoR4(livelli.value, aperte.value))
async function leggiLivello(percorso: string): Promise<void> {
    const esito = await props.caricaAlbero(percorso)
    const nuovi = new Map(livelli.value)
    const nuoviErrori = new Map(errori.value)
    if (esito.ok) { nuovi.set(percorso, esito.voci); nuoviErrori.delete(percorso) } else nuoviErrori.set(percorso, esito.motivo)
    livelli.value = nuovi
    errori.value = nuoviErrori
}
/** La radice e ogni cartella aperta (anche una appena aperta da un'azione, che non era ancora stata letta: misurato sul Pad). */
async function rileggiTutto(): Promise<void> {
    await Promise.all(['', ...[...aperte.value].filter((p) => p !== '')].map(leggiLivello))
}
onMounted(() => { void leggiLivello('') })
watch(() => props.giriFiniti, () => { void rileggiTutto() })

async function tocca(percorso: string, cartella: boolean): Promise<void> {
    if (!cartella) { void apri(percorso); return }
    const nuove = new Set(aperte.value)
    if (nuove.has(percorso)) { nuove.delete(percorso); aperte.value = nuove; return }
    nuove.add(percorso)
    aperte.value = nuove
    if (!livelli.value.has(percorso)) await leggiLivello(percorso)
}
const erroreRadice = computed(() => (livelli.value.has('') ? null : errori.value.get('') ?? null))

// ---- l'anteprima ----
const anteprima = ref<{ percorso: string; contenuto: string | null; dimensione: number | null; motivo: string | null } | null>(null)
async function apri(percorso: string): Promise<void> {
    anteprima.value = { percorso, contenuto: null, dimensione: null, motivo: null }
    const esito = await props.apriFile(percorso)
    if (anteprima.value?.percorso !== percorso) return
    anteprima.value = esito.ok ? { percorso, contenuto: esito.contenuto, dimensione: esito.dimensione, motivo: null } : { percorso, contenuto: null, dimensione: null, motivo: esito.motivo }
}
/** K3 Revisione: «Apri il file» della Review chiede l'anteprima qui (lo stesso visualizzatore, come `apriFileAlbero`); la richiesta si consuma. */
const daAprire = campoDellaMemoriaR4(() => props.memoria, memoriaLocale, 'daAprire')
watch(daAprire, (percorso) => {
    if (!percorso) return
    daAprire.value = null
    void apri(percorso)
}, { immediate: true })

// ---- la ricerca (in tutta la cartella, dopo una breve pausa di scrittura) ----
const ricerca = campoDellaMemoriaR4(() => props.memoria, memoriaLocale, 'ricerca')
const trovati = ref<{ ricerca: string; risultati: RisultatoRicercaR4[]; avvisi: string[] } | null>(null)
let attesa: ReturnType<typeof setTimeout> | null = null
watch(ricerca, (testo) => {
    if (attesa) clearTimeout(attesa)
    const q = testo.trim()
    if (!q) { trovati.value = null; return }
    attesa = setTimeout(async () => {
        const esito = await props.cercaFile(q)
        if (ricerca.value.trim() !== q) return
        trovati.value = esito.ok ? { ricerca: q, risultati: esito.risultati, avvisi: esito.avvisi } : { ricerca: q, risultati: [], avvisi: [esito.motivo] }
    }, 250)
})
async function apriRisultato(r: RisultatoRicercaR4): Promise<void> {
    if (!r.cartella) { void apri(r.percorso); return }
    // una cartella trovata: si apre nell'albero con tutte quelle che la contengono, e la ricerca si chiude
    const parti = r.percorso.split('/')
    const catena = parti.map((_, i) => parti.slice(0, i + 1).join('/'))
    aperte.value = new Set([...aperte.value, ...catena])
    ricerca.value = ''
    for (const p of catena) if (!livelli.value.has(p)) await leggiLivello(p)
}
const ICONE = { folder: Folder, code: FileCode, file: IconaFile }

// ---- le azioni (menu del desktop, più «Sposta in…») ----
const toasts = useTalosMobileToasts()
/** Ogni toast se ne va da solo: un esito riuscito dopo 5 s, come il desktop (`components/toast.js` TONI.riuscito); un rifiuto dopo 6 s,
 *  come gli altri rifiuti dell'app. Sul Pad, senza durata, sette toast restavano in pila sopra il foglio. */
const DURATA_RIUSCITO = 5000
const DURATA_RIFIUTO = 6000
const nomeDi = (percorso: string) => percorso.slice(percorso.lastIndexOf('/') + 1)
function vociDelMenu(percorso: string, cartella: boolean): TalosRowAction[] {
    const voce = (id: string, label: string, danger = false): TalosRowAction => ({ id, label, danger, testId: `talos-codice-r4-file-azione-${id}` })
    const crea = [voce('nuovo-file', tr('app.files.newFile')), voce('nuova-cartella', tr('app.files.newFolder'))]
    if (percorso === '') return crea
    const comuni = [voce('rinomina', tr('app.common.rename')), voce('duplica', tr('app.common.copy')), voce('sposta', t('harness.r4Files.moveTo')), voce('elimina', tr('app.common.delete'), true)]
    return cartella ? [...crea, ...comuni] : [voce('apri', tr('app.common.open')), voce('allega', tr('app.files.attachToChat')), ...comuni]
}
type Dialogo = { tipo: 'rinomina' | 'crea'; percorso: string; cartella: boolean; valore: string; errore: string | null } | { tipo: 'elimina'; percorso: string; cartella: boolean }
const dialogo = ref<Dialogo | null>(null)
const occupato = ref(false)
function scegli(percorso: string, cartella: boolean, id: string): void {
    if (id === 'apri') void apri(percorso)
    else if (id === 'allega') emit('allega', [percorso])
    else if (id === 'nuovo-file' || id === 'nuova-cartella') dialogo.value = { tipo: 'crea', percorso, cartella: id === 'nuova-cartella', valore: '', errore: null }
    else if (id === 'rinomina') dialogo.value = { tipo: 'rinomina', percorso, cartella, valore: nomeDi(percorso), errore: null }
    else if (id === 'elimina') dialogo.value = { tipo: 'elimina', percorso, cartella }
    else if (id === 'duplica') void esegui('duplica', { percorso }, (nuovo) => `${tr('app.common.copied')}: ${nuovo ? nomeDi(nuovo) : nomeDi(percorso)}`)
    else if (id === 'sposta') void apriSposta(percorso, cartella)
}
/** Un'azione su r4; se va, l'esito in un toast e l'albero si rilegge; se no, il perché in un toast. */
async function esegui(azione: 'crea' | 'rinomina' | 'duplica' | 'sposta' | 'elimina', corpo: Record<string, unknown>, frase: (nuovo: string | null) => string, dopo?: (nuovo: string | null) => void): Promise<boolean> {
    if (!props.azioneFile || occupato.value) return false
    occupato.value = true
    try {
        const esito = await props.azioneFile(azione, corpo)
        if (!esito.ok) { toasts.push({ message: esito.motivo, durationMs: DURATA_RIFIUTO }); return false }
        dopo?.(esito.percorso)
        toasts.push({ message: frase(esito.percorso), durationMs: DURATA_RIUSCITO })
        await rileggiTutto()
        return true
    } finally {
        occupato.value = false
    }
}
/** Una cartella aperta che cambia nome o posto resta aperta (con tutte le sue sottocartelle aperte). */
function riportaAperte(vecchio: string, nuovo: string | null): void {
    aperte.value = riportaAperteR4(aperte.value, vecchio, nuovo)
}
async function conferma(): Promise<void> {
    const d = dialogo.value
    if (!d) return
    if (d.tipo === 'elimina') {
        if (await esegui('elimina', { percorso: d.percorso }, () => tr('app.files.deleted'))) dialogo.value = null
        return
    }
    const controllo = nomeValidoR4(d.valore)
    if (!controllo.ok) {
        // l'aiuto del desktop per la creazione finisce con «sarà vuoto»: per un nome sbagliato (e in una rinomina) basta la regola
        d.errore = controllo.motivo === 'vuoto' ? tr('app.common.nameEmpty') : t('harness.r4Files.nameRule')
        return
    }
    const fatto = d.tipo === 'rinomina'
        ? await esegui('rinomina', { percorso: d.percorso, nuovoNome: controllo.nome }, () => tr('app.files.renamed'), (nuovo) => riportaAperte(d.percorso, nuovo))
        : await esegui('crea', { percorsoBase: d.percorso, nome: controllo.nome, tipo: d.cartella ? 'cartella' : 'file' },
            () => tr(d.cartella ? 'app.files.folderCreated' : 'app.files.fileCreated'),
            () => { if (d.percorso) aperte.value = new Set([...aperte.value, d.percorso]) })
    if (fatto) dialogo.value = null
}

// ---- K3-C Allegati A1: la selezione dei file (casella su ogni file, barra col conteggio, come il desktop) ----
const scelti = campoDellaMemoriaR4(() => props.memoria, memoriaLocale, 'scelti')
function alternaScelta(percorso: string): void {
    scelti.value = scelti.value.includes(percorso) ? scelti.value.filter((p) => p !== percorso) : [...scelti.value, percorso]
}
const plurale = (n: number, uno: string, molti: string) => tr(new Intl.PluralRules(locale.value).select(n) === 'one' ? uno : molti, { n })
const vociDellaSelezione = computed<TalosRowAction[]>(() => [
    { id: 'copia-percorsi', label: tr('app.files.selection.copyPaths'), testId: 'talos-codice-r4-file-azione-copia-percorsi' },
    { id: 'deseleziona', label: tr('app.files.selection.deselectAll'), testId: 'talos-codice-r4-file-azione-deseleziona' },
])
function allegaScelti(): void {
    if (!scelti.value.length) return
    emit('allega', [...scelti.value])
    scelti.value = []
}
async function sceltaDellaSelezione(id: string): Promise<void> {
    if (id === 'deseleziona') { scelti.value = []; return }
    const percorsi = [...scelti.value]
    try {
        await writeTalosClipboardText(percorsi.join('\n'))
        toasts.push({ message: `${tr('app.files.pathsCopied')} · ${plurale(percorsi.length, 'app.files.countOne', 'app.files.countMany')}`, durationMs: DURATA_RIUSCITO })
    } catch {
        toasts.push({ message: tr('app.common.copyFailed'), durationMs: DURATA_RIFIUTO })
    }
}

// «Sposta in…»: si sceglie la cartella scendendo dalla radice; mai la voce stessa, i suoi discendenti o la cartella dove sta già
const sposta = ref<{ percorso: string; cartella: boolean; dove: string } | null>(null)
async function apriSposta(percorso: string, cartella: boolean): Promise<void> {
    sposta.value = { percorso, cartella, dove: '' }
    if (!livelli.value.has('')) await leggiLivello('')
}
const cartelleDove = computed(() => {
    const s = sposta.value
    if (!s) return []
    const figlie = (livelli.value.get(s.dove) ?? []).filter((v) => v.cartella).map((v) => percorsoFiglioR4(s.dove, v.nome))
    return figlie.filter((c) => !(s.cartella && (c === s.percorso || c.startsWith(`${s.percorso}/`))))
})
const spostaQuiPossibile = computed(() => Boolean(sposta.value) && cartellePerSpostareR4(sposta.value!.percorso, sposta.value!.cartella, [sposta.value!.dove]).length === 1)
async function scendi(cartella: string): Promise<void> {
    if (!sposta.value) return
    sposta.value = { ...sposta.value, dove: cartella }
    if (!livelli.value.has(cartella)) await leggiLivello(cartella)
}
async function spostaQui(): Promise<void> {
    const s = sposta.value
    if (!s || !spostaQuiPossibile.value) return
    if (await esegui('sposta', { percorso: s.percorso, cartellaDestinazione: s.dove }, () => tr('app.files.moved'), (nuovo) => riportaAperte(s.percorso, nuovo))) sposta.value = null
}
</script>

<template>
    <section v-if="sposta" data-testid="talos-codice-r4-sposta" class="talos-codice-r4-anteprima">
        <div class="talos-codice-r4-anteprima-testa">
            <button
                type="button"
                class="talos-codice-r4-icona-azione"
                :aria-label="sposta.dove ? t('harness.r4Files.back') : tr('app.common.cancel')"
                @click="sposta.dove ? scendi(genitoreR4(sposta.dove)) : (sposta = null)"
            >
                <ArrowLeft class="size-4" aria-hidden="true" />
            </button>
            <span class="talos-codice-r4-anteprima-nome">{{ t('harness.r4Files.chooseFolder') }}</span>
        </div>
        <p data-testid="talos-codice-r4-sposta-dove" class="talos-codice-r4-nota" :class="{ 'font-mono': sposta.dove }">{{ sposta.dove || t('harness.r4Files.root') }}</p>
        <div class="flex flex-col">
            <button v-for="c in cartelleDove" :key="c" type="button" class="talos-codice-r4-file-riga" :data-cartella="c" @click="scendi(c)">
                <span class="talos-codice-r4-file-freccia" aria-hidden="true"><ChevronRight class="size-3.5" /></span>
                <Folder class="talos-codice-r4-file-icona" aria-hidden="true" />
                <span class="talos-codice-r4-file-nome">{{ nomeDi(c) }}</span>
            </button>
            <p v-if="cartelleDove.length === 0" class="talos-codice-r4-nota">{{ tr('app.files.noSubfolders') }}</p>
        </div>
        <div class="flex justify-end gap-2 px-3">
            <Button type="button" variant="ghost" @click="sposta = null"><X class="size-4" aria-hidden="true" /> {{ tr('app.common.cancel') }}</Button>
            <Button type="button" data-testid="talos-codice-r4-sposta-qui" :disabled="!spostaQuiPossibile || occupato" @click="spostaQui">
                <Check class="size-4" aria-hidden="true" /> {{ t('harness.r4Files.moveHere') }}
            </Button>
        </div>
    </section>
    <section v-else-if="anteprima" data-testid="talos-codice-r4-anteprima" class="talos-codice-r4-anteprima">
        <div class="talos-codice-r4-anteprima-testa">
            <button type="button" data-testid="talos-codice-r4-anteprima-indietro" class="talos-codice-r4-icona-azione" :aria-label="t('harness.r4Files.back')" @click="anteprima = null">
                <ArrowLeft class="size-4" aria-hidden="true" />
            </button>
            <span class="talos-codice-r4-anteprima-nome" :title="anteprima.percorso">{{ anteprima.percorso }}</span>
            <span v-if="anteprima.dimensione !== null" class="talos-codice-r4-sezione-destra">{{ t('harness.r4Files.size', { size: anteprima.dimensione }) }}</span>
        </div>
        <p v-if="anteprima.motivo" role="alert" class="talos-codice-r4-nota">{{ anteprima.motivo }}</p>
        <p v-else-if="anteprima.contenuto === null" class="talos-codice-r4-nota">{{ tr('app.common.loading') }}</p>
        <pre v-else class="talos-codice-r4-anteprima-testo">{{ anteprima.contenuto }}</pre>
    </section>
    <div v-else class="flex flex-col gap-2">
        <div class="talos-codice-r4-sezione">
            <input
                v-model="ricerca"
                type="search"
                data-testid="talos-codice-r4-file-cerca"
                class="talos-codice-r4-campo"
                :aria-label="t('harness.r4Files.searchLabel')"
                :placeholder="t('harness.r4Files.search')"
            >
        </div>
        <div v-if="trovati" data-testid="talos-codice-r4-file-risultati" class="flex flex-col">
            <p v-for="a in trovati.avvisi" :key="a" class="talos-codice-r4-nota">{{ a }}</p>
            <button
                v-for="r in trovati.risultati"
                :key="r.percorso"
                type="button"
                class="talos-codice-r4-file-riga"
                :data-percorso="r.percorso"
                @click="apriRisultato(r)"
            >
                <component :is="r.cartella ? Folder : ICONE[categoriaFileR4(r.nome)]" class="talos-codice-r4-file-icona" aria-hidden="true" />
                <span class="talos-codice-r4-file-nome">{{ r.nome }}</span>
                <span v-if="genitoreR4(r.percorso)" class="talos-codice-r4-file-percorso">{{ genitoreR4(r.percorso) }}</span>
            </button>
        </div>
        <template v-else>
            <p v-if="erroreRadice" data-testid="talos-codice-r4-albero-errore" role="alert" class="talos-codice-r4-nota">
                {{ tr('app.files.loadFailed') }}
                <button type="button" class="talos-codice-r4-icona-azione" :aria-label="tr('app.common.refresh')" @click="leggiLivello('')">
                    <RefreshCw class="size-4" aria-hidden="true" />
                </button>
            </p>
            <div v-if="!erroreRadice && azioneFile" class="talos-codice-r4-file-testa">
                <span class="talos-codice-r4-sezione-titolo">{{ tr('app.files.treeLabel') }}</span>
                <TalosRowActions
                    test-id="talos-codice-r4-file-azioni-"
                    :label="tr('app.files.actionsOn', { nome: t('harness.r4Files.root') })"
                    :items="vociDelMenu('', true)"
                    @select="(id: string) => scegli('', true, id)"
                />
            </div>
            <div v-if="!erroreRadice" data-testid="talos-codice-r4-albero" role="tree" class="flex flex-col" :aria-label="tr('app.files.treeLabel')">
                <template v-for="r in righe" :key="r.percorso">
                    <div class="talos-codice-r4-file-voce">
                    <button
                        type="button"
                        role="treeitem"
                        class="talos-codice-r4-file-riga"
                        :data-percorso="r.percorso"
                        :aria-level="r.livello + 1"
                        :aria-expanded="r.cartella ? Boolean(r.aperta) : undefined"
                        :style="{ paddingInlineStart: `calc(0.75rem + ${r.livello} * 1rem)` }"
                        @click="tocca(r.percorso, r.cartella)"
                    >
                        <span class="talos-codice-r4-file-freccia" aria-hidden="true">
                            <template v-if="r.cartella"><ChevronDown v-if="r.aperta" class="size-3.5" /><ChevronRight v-else class="size-3.5" /></template>
                        </span>
                        <component :is="r.cartella ? (r.aperta ? FolderOpen : Folder) : ICONE[r.categoria]" class="talos-codice-r4-file-icona" aria-hidden="true" />
                        <span class="talos-codice-r4-file-nome">{{ r.nome }}</span>
                    </button>
                    <button
                        v-if="!r.cartella"
                        type="button"
                        role="checkbox"
                        class="talos-codice-r4-icona-azione talos-codice-r4-file-scegli"
                        :data-testid="`talos-codice-r4-file-scegli-${r.percorso}`"
                        :aria-checked="scelti.includes(r.percorso) ? 'true' : 'false'"
                        :aria-label="tr('app.files.selectLabel', { nome: r.nome })"
                        @click="alternaScelta(r.percorso)"
                    >
                        <SquareCheck v-if="scelti.includes(r.percorso)" class="size-4 text-[var(--talos-accent)]" aria-hidden="true" />
                        <Square v-else class="size-4" aria-hidden="true" />
                    </button>
                    <TalosRowActions
                        v-if="azioneFile"
                        :test-id="`talos-codice-r4-file-azioni-${r.percorso}`"
                        :label="tr('app.files.actionsOn', { nome: r.nome })"
                        :items="vociDelMenu(r.percorso, r.cartella)"
                        @select="(id: string) => scegli(r.percorso, r.cartella, id)"
                    />
                    </div>
                    <p v-if="r.aperta && errori.get(r.percorso)" role="alert" class="talos-codice-r4-nota" :style="{ paddingInlineStart: `calc(0.75rem + ${r.livello + 1} * 1rem)` }">{{ tr('app.files.unreadable') }}</p>
                    <p v-else-if="r.caricamento" class="talos-codice-r4-nota" :style="{ paddingInlineStart: `calc(0.75rem + ${r.livello + 1} * 1rem)` }">{{ tr('app.common.loading') }}</p>
                </template>
            </div>
            <div v-if="scelti.length" data-testid="talos-codice-r4-file-selezione" class="talos-codice-r4-file-selezione">
                <span role="status" class="talos-codice-r4-nota min-w-0 flex-1 truncate !p-0">{{ plurale(scelti.length, 'app.files.selectedOne', 'app.files.selectedMany') }}</span>
                <Button type="button" size="sm" data-testid="talos-codice-r4-file-selezione-allega" @click="allegaScelti">
                    <Paperclip class="size-4" aria-hidden="true" /> {{ tr('app.files.attachToChat') }}
                </Button>
                <TalosRowActions
                    test-id="talos-codice-r4-file-selezione-azioni"
                    :label="tr('app.files.selectionActions')"
                    :items="vociDellaSelezione"
                    @select="(id: string) => void sceltaDellaSelezione(id)"
                />
            </div>
        </template>
    </div>
    <TalosMobileConfirmDialog
        v-if="dialogo && dialogo.tipo !== 'elimina'"
        :title="dialogo.tipo === 'rinomina' ? tr('app.sheets.renameFile.title') : tr(dialogo.cartella ? 'app.files.newFolder' : 'app.files.newFile')"
        :description="dialogo.tipo === 'rinomina' ? tr('app.files.newNameFor', { nome: nomeDi(dialogo.percorso) }) : tr(dialogo.cartella ? 'app.files.nameHintFolder' : 'app.files.nameHintFile')"
        @close="occupato ? undefined : (dialogo = null)"
    >
        <input
            v-model="dialogo.valore"
            :aria-label="dialogo.tipo === 'rinomina' ? tr('app.sheets.renameFile.newName') : tr(dialogo.cartella ? 'app.files.folderNameLabel' : 'app.files.fileNameLabel')"
            class="min-h-touch w-full rounded-md border border-[var(--talos-border)] bg-[var(--talos-input,var(--talos-background))] px-3 text-sm text-[var(--talos-text)] outline-none focus:border-[var(--talos-accent)]"
            @input="dialogo.errore = null"
            @keydown.enter.prevent="conferma"
        >
        <p v-if="dialogo.errore" role="alert" class="mt-2 text-xs text-[var(--talos-danger)]">{{ dialogo.errore }}</p>
        <template #footer>
            <Button type="button" variant="ghost" :disabled="occupato" @click="dialogo = null"><X class="size-4" aria-hidden="true" /> {{ tr('app.common.cancel') }}</Button>
            <Button type="button" :disabled="occupato" @click="conferma">
                <Check class="size-4" aria-hidden="true" /> {{ dialogo.tipo === 'rinomina' ? tr('app.common.save') : tr('app.common.create') }}
            </Button>
        </template>
    </TalosMobileConfirmDialog>
    <TalosMobileConfirmDialog
        v-if="dialogo && dialogo.tipo === 'elimina'"
        :title="tr(dialogo.cartella ? 'app.files.deleteFolder' : 'app.files.deleteFile')"
        :description="tr(dialogo.cartella ? 'app.files.deleteFolderWarning' : 'app.files.deleteFileWarning')"
        @close="occupato ? undefined : (dialogo = null)"
    >
        <p class="break-all font-mono text-xs text-[var(--talos-muted)]">{{ dialogo.percorso }}</p>
        <template #footer>
            <Button type="button" variant="ghost" :disabled="occupato" @click="dialogo = null"><X class="size-4" aria-hidden="true" /> {{ tr('app.common.cancel') }}</Button>
            <Button type="button" variant="destructive" :disabled="occupato" @click="conferma">{{ tr('app.common.delete') }}</Button>
        </template>
    </TalosMobileConfirmDialog>
</template>
