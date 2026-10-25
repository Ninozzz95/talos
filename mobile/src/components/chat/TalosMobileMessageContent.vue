<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref } from 'vue'
import { useTalosI18n } from '@/i18n'
import {
    renderTalosMarkdownBlock,
    splitTalosMarkdownBlocks,
    type TalosMarkdownLabels,
} from '@/lib/talosMessageMarkdown'
import { writeTalosClipboardText } from '@/services/clipboard'
import { deliverTalosSessionExport } from '@/services/sessionExportDelivery'
import TalosRowActions, { type TalosRowAction } from '@/components/talos/ui/TalosRowActions.vue'
import {
    contenutoDelFile,
    estensioneDellaLingua,
    nomeDelFile,
    nomeDellaLingua,
    tipoDelContenuto,
    type TalosFormatoDelFile,
} from '@/lib/chat/bloccoDiCodice'

// R2-10 (owner obliteration directive): the sensitive-censor mechanism is
// REMOVED, not dormant — no blur path exists for any metadata flag.
const props = defineProps<{
    content: string
    allowExternalImages?: boolean
    /** ACAPO (25/09/2026): testo scritto dal modello — un a capo singolo resta un a capo. */
    lineBreaks?: boolean
}>()

const { t } = useTalosI18n()
const copyStatus = ref('')
const markdownLabels = computed<TalosMarkdownLabels>(() => ({
    completedTask: t('messageMarkdown.completedTask'),
    openTask: t('messageMarkdown.openTask'),
    scrollableTable: t('messageMarkdown.scrollableTable'),
    image: t('messageMarkdown.image'),
    externalImageOmitted: t('messageMarkdown.externalImageOmitted'),
    code: t('messageMarkdown.code'),
    copyCode: t('messageMarkdown.copyCode'),
    copy: t('common.copy'),
    codeMore: t('messageMarkdown.codeMore'),
    truncatedMessage: t('messageMarkdown.truncated'),
}))
/**
 * Rendered BLOCK BY BLOCK, not as one document.
 *
 * Owner 2026-07-27: the streaming reveal was already paced and the fade still
 * was not smooth. This was why — a single `v-html` for the whole message, so
 * every re-parse while an answer streams destroyed and rebuilt the entire body
 * nine times a second, snapping anything mid-fade.
 *
 * With `v-memo` keyed on the block's own source, a block whose text has not
 * changed is not re-rendered at all: while an answer streams that is every
 * block except the last. Keys are the INDEX, deliberately — keying by content
 * would unmount and remount a block the moment a character landed in it, which
 * is the very churn this removes.
 */
const blocks = computed(() => splitTalosMarkdownBlocks(props.content))
/**
 * Parsed once per block, not once per keystroke.
 *
 * `v-memo` stopped the DOM churn but every block still went through markdown-it
 * on every update — a twenty-block answer at nine updates a second is a hundred
 * and eighty parses a second on a phone, and all but one produce exactly the
 * string already on screen. Only the last block changes while an answer streams.
 */
const renderedBlocks = computed(() => blocks.value.map(source => renderTalosMarkdownBlock(source, {
    labels: markdownLabels.value,
    lineBreaks: props.lineBreaks === true,
    allowExternalImages: props.allowExternalImages === true,
})))

// ---- blocchi di codice: menu ⋯, Comprimi, Scarica (bozzetto approvato dall'owner il 23/10, specifica unica col desktop) ----
/*
 * Il ⋯ nasce nell'HTML del blocco (`talosMessageMarkdown.ts`, fence); il menu è UNO per messaggio, `TalosRowActions` ancorato a
 * quel pulsante, lo stesso menu della barra laterale e della Libreria. Le voci: «Download as .<ext>», Markdown, testo, poi
 * «Collapse» solo sopra 40 righe. Il tocco prolungato sulla TESTATA apre lo stesso menu; sul codice no (lì si seleziona).
 */
const RIGHE_DA_COMPRIMERE = 40
const menuBlocco = ref<InstanceType<typeof TalosRowActions> | null>(null)
const bloccoAperto = ref<HTMLElement | null>(null)
const ancoraMenu = ref<HTMLElement | null>(null)

const righeDelBlocco = (blocco: HTMLElement) => Number(blocco.dataset.righe ?? 0)
const titoloMenu = computed(() => {
    const blocco = bloccoAperto.value
    if (!blocco) return ''
    const lingua = nomeDellaLingua(blocco.dataset.lingua ?? '')
    const count = righeDelBlocco(blocco)
    // singolare e plurale come sul desktop: «1 lines» non deve esistere
    const forma = count === 1 ? 'One' : 'Many'
    return lingua
        ? t(`messageMarkdown.codeMenuTitle${forma}`, { language: lingua, count })
        : t(`messageMarkdown.codeMenuTitlePlain${forma}`, { count })
})
const vociMenu = computed<TalosRowAction[]>(() => {
    const blocco = bloccoAperto.value
    if (!blocco) return []
    const estensione = estensioneDellaLingua(blocco.dataset.lingua ?? '')
    const voci: TalosRowAction[] = [
        // se il file della lingua è già .txt resta solo «Scarica come testo (.txt)» (Desktop 24/10, stessa regola)
        ...(estensione === 'txt' ? [] : [{ id: 'lingua', label: t('messageMarkdown.downloadAs', { ext: estensione }) }]),
        { id: 'md', label: t('messageMarkdown.downloadMarkdown') },
        { id: 'txt', label: t('messageMarkdown.downloadText') },
    ]
    // dove il <pre> ha già un tetto suo (chi usa questo contenuto può darglielo), «Comprimi» non cambierebbe niente
    const pre = blocco.querySelector('pre')
    const tettoProprio = pre ? !['', 'none'].includes(getComputedStyle(pre).maxHeight) : false
    if (righeDelBlocco(blocco) > RIGHE_DA_COMPRIMERE && !blocco.hasAttribute('data-compresso') && !tettoProprio) {
        voci.push({ id: 'comprimi', label: t('messageMarkdown.collapse'), separata: true })
    }
    return voci
})

async function apriMenu(pulsante: HTMLElement): Promise<void> {
    if ((pulsante as HTMLButtonElement).disabled) return
    bloccoAperto.value = pulsante.closest<HTMLElement>('.talos-code-block')
    ancoraMenu.value = pulsante
    await nextTick()
    await menuBlocco.value?.show()
}

/** Il codice GREZZO del blocco: il testo del `<code>`, non l'HTML; a capo normalizzati, senza l'a capo che markdown-it aggiunge in fondo. */
const codiceDelBlocco = (blocco: HTMLElement) => (blocco.querySelector('code')?.textContent ?? '').replace(/\r\n?/g, '\n').replace(/\n$/, '')

function comprimi(blocco: HTMLElement): void {
    blocco.setAttribute('data-compresso', '')
    const mostra = document.createElement('button')
    mostra.type = 'button'
    mostra.setAttribute('data-talos-code-expand', '')
    const count = righeDelBlocco(blocco)
    mostra.textContent = t(count === 1 ? 'messageMarkdown.showAllLinesOne' : 'messageMarkdown.showAllLinesMany', { count })
    blocco.append(mostra)
    // il fuoco va dove si continua, mai sul body (revisione del Desktop 23/10): dopo «Comprimi», su «Mostra tutte»
    mostra.focus()
}

function espandi(pulsante: HTMLElement): void {
    const blocco = pulsante.closest('.talos-code-block')
    blocco?.removeAttribute('data-compresso')
    pulsante.remove()
    // il pulsante premuto sparisce: il fuoco torna sul ⋯ dello stesso blocco
    blocco?.querySelector<HTMLElement>('[data-talos-code-menu]')?.focus()
}

async function scarica(blocco: HTMLElement, formato: TalosFormatoDelFile): Promise<void> {
    const lingua = blocco.dataset.lingua ?? ''
    const fileName = nomeDelFile(blocco.dataset.info ?? '', lingua, new Date(), formato)
    try {
        await deliverTalosSessionExport({
            fileName,
            // il BOM segue il file finale, non solo la lingua csv
            content: contenutoDelFile(codiceDelBlocco(blocco), lingua, formato, fileName),
            contentType: tipoDelContenuto(formato),
        })
    } catch (errore) {
        copyStatus.value = t('messageMarkdown.downloadFailed', { detail: errore instanceof Error ? errore.message : String(errore) })
    }
}

function sceltaDalMenu(id: string): void {
    const blocco = bloccoAperto.value
    if (!blocco) return
    if (id === 'comprimi') comprimi(blocco)
    else void scarica(blocco, id as TalosFormatoDelFile)
}

/* Tocco prolungato sulla testata (mai sul codice): stessa durata dei Recenti della barra laterale. */
const TOCCO_LUNGO_MS = 500
let toccoLungo: number | null = null
function annullaToccoLungo(): void {
    if (toccoLungo !== null) window.clearTimeout(toccoLungo)
    toccoLungo = null
}
function onPressione(event: PointerEvent): void {
    const testa = event.target instanceof Element ? event.target.closest<HTMLElement>('.talos-code-block-header') : null
    if (!testa) return
    // Il gesto della testata è del blocco, mai del messaggio: risalendo, l'`article` armava anche il suo tocco prolungato e si
    // aprivano due menu insieme (revisione del Desktop 23/10: col fuoco su «Chiedi di nuovo», un Invio faceva partire un giro).
    // Sempre, anche sui pulsanti e mentre il blocco arriva, quando qui non si apre niente.
    event.stopPropagation()
    if ((event.target as Element).closest('button')) return
    annullaToccoLungo()
    toccoLungo = window.setTimeout(() => {
        toccoLungo = null
        const pulsante = testa.querySelector<HTMLElement>('[data-talos-code-menu]')
        if (pulsante) void apriMenu(pulsante)
    }, TOCCO_LUNGO_MS)
}
onBeforeUnmount(annullaToccoLungo)

/** Sulla testata il menu contestuale di sistema non parte: il gesto lì apre il menu del blocco, uno solo (BLOCCO-UI-15). */
function onMenuContestuale(event: MouseEvent): void {
    if (event.target instanceof Element && event.target.closest('.talos-code-block-header')) {
        event.preventDefault()
        event.stopPropagation()
    }
}

async function handleContentClick(event: MouseEvent): Promise<void> {
    const menu = event.target instanceof Element ? event.target.closest<HTMLElement>('[data-talos-code-menu]') : null
    if (menu) {
        event.preventDefault()
        await apriMenu(menu)
        return
    }
    const mostra = event.target instanceof Element ? event.target.closest<HTMLElement>('[data-talos-code-expand]') : null
    if (mostra) {
        espandi(mostra)
        return
    }
    const target = event.target instanceof Element
        ? event.target.closest<HTMLButtonElement>('[data-talos-copy-code]')
        : null
    // spento mentre il blocco arriva (specifica 2: Copia ed Esporta restano spenti finché il codice non è intero)
    if (!target || target.disabled) return
    const code = (target.closest('.talos-code-block')?.querySelector('code')?.textContent ?? '')
        .replace(/\r\n?/g, '\n')
    try {
        await writeTalosClipboardText(code)
        target.textContent = t('common.copied')
        copyStatus.value = t('messageMarkdown.codeCopied')
        window.setTimeout(() => {
            if (target.isConnected) target.textContent = t('common.copy')
            copyStatus.value = ''
        }, 1600)
    } catch {
        copyStatus.value = t('messageMarkdown.codeCopyFailed')
    }
}
</script>

<template>
    <div
        data-testid="talos-mobile-message-content"
        class="talos-message-content min-w-0 max-w-full"
        @click="handleContentClick"
        @pointerdown="onPressione"
        @pointerup="annullaToccoLungo"
        @pointercancel="annullaToccoLungo"
        @pointermove="annullaToccoLungo"
        @contextmenu="onMenuContestuale"
    >
        <div
            v-for="(html, index) in renderedBlocks"
            :key="index"
            v-memo="[blocks[index], html]"
            class="talos-message-block"
            v-html="html"
        />
    </div>
    <span class="sr-only" role="status" aria-live="polite">{{ copyStatus }}</span>
    <TalosRowActions
        ref="menuBlocco"
        :label="t('messageMarkdown.codeMore')"
        :items="vociMenu"
        :ancora="ancoraMenu"
        :titolo="titoloMenu"
        @select="sceltaDalMenu"
    />
</template>

<style>
/* Inherit the list-level chat text size (Small/Default/Large); nested rules
   use em so headings/code/tables scale with it. */
/**
 * A block does not appear, it arrives.
 *
 * Owner 2026-07-27, asked twice: "l'animazione di rendering della risposta non
 * e smooth. Claude la fa in maniera fantastica". Pacing the characters was only
 * half of it — there was no animation at all, so each finished paragraph
 * snapped into place at full opacity.
 *
 * The animation runs on element CREATION, which is exactly the right trigger:
 * a new block is a new element, while the block currently being written updates
 * in place and so never re-runs it. Without that, the streaming block would
 * restart its own fade on every character and strobe.
 *
 * Fase 4: durata Calm di 184 ms, risolta dal motore e dalle preferenze;
 * resta il piccolo ingresso di 2 px dei blocchi progressivi, senza spostare
 * il layout sotto il dito.
 */
@keyframes talos-block-in {
    from { opacity: 0; transform: translateY(2px); }
    to { opacity: 1; transform: none; }
}
/* Only while the answer is arriving — see TalosMobileStreamingReply. A block
   that has finished must never animate again, or it plays over itself when the
   finished message replaces the streaming one. */
.talos-streaming-body .talos-message-block {
    animation: talos-block-in var(--talos-motion-calm-answer, 184ms) cubic-bezier(0.22, 0.61, 0.36, 1) both;
}
@media (prefers-reduced-motion: reduce) {
    .talos-streaming-body .talos-message-block { animation: none; }
}
/* D-VIS-1 (Pad, 23/10): col tetto di 24rem il blocco che arriva restava fermo alle prime righe (scrollTop 0) mentre il
   codice cresceva sotto. Come Jan (StreamingCode, RenderMarkdown.tsx:89-95): finché arriva, il blocco cresce e la lista
   che segue il fondo mostra l'ultima riga. Dal 23/10 sera (blocchi di codice, bozzetto approvato) il tetto non c'è più
   nemmeno a messaggio finito: questa regola resta come garanzia per lo streaming. */
.talos-streaming-body .talos-message-content pre { max-height: none; }
.talos-message-content { overflow-wrap: anywhere; font-size: 1em; line-height: 1.625; }
.talos-message-content > :first-child { margin-top: 0; }
.talos-message-content > :last-child { margin-bottom: 0; }
.talos-message-content p,
.talos-message-content ul,
.talos-message-content ol,
.talos-message-content blockquote,
.talos-message-content .talos-message-table-scroll,
.talos-message-content .talos-code-block { margin: 0.7rem 0; }
.talos-message-content h2,
.talos-message-content h3,
.talos-message-content h4 { margin: 1rem 0 0.45rem; font-weight: 650; line-height: 1.35; }
.talos-message-content h2 { font-size: 1.28em; }
.talos-message-content h3 { font-size: 1.14em; }
.talos-message-content h4 { font-size: 1.06em; }
.talos-message-content ul,
.talos-message-content ol { padding-left: 1.35rem; }
.talos-message-content ul { list-style: disc; }
.talos-message-content ol { list-style: decimal; }
.talos-message-content li + li { margin-top: 0.25rem; }
.talos-message-content blockquote { border-left: 3px solid var(--talos-border-strong); padding-left: 0.8rem; color: var(--talos-muted); }
.talos-message-content a { color: var(--talos-accent); text-decoration: underline; text-underline-offset: 3px; }
/*
 * ⛔⛔ UN LINK NELLA BOLLA DELLA PERSONA ERA INVISIBILE.
 *
 * MISURATO sul Pad il 2026-08-20, con il colore calcolato letto dalla pagina:
 *
 *   colore del link  rgb(192, 139, 60)
 *   sfondo della bolla  rgb(192, 139, 60)
 *
 * Identici. Contrasto 1:1. Il testo c'era nel DOM — un <a> regolare, con la
 * sua sottolineatura — e a schermo si leggeva «Leggi questa pagina:» e poi
 * niente. Vale per OGNI indirizzo che una persona scrive o incolla.
 *
 * ⇒ Dentro la bolla il link prende il colore del testo della bolla: la
 * sottolineatura basta a dire che e' un link, e il colore dell'accento su
 * uno sfondo d'accento non e' un colore.
 */
[data-message-kind="user"] .talos-message-content a { color: currentColor; }
.talos-message-content a:focus-visible { border-radius: 3px; outline: 2px solid var(--talos-ring); outline-offset: 2px; }
.talos-message-content img { display: block; max-width: 100%; height: auto; margin: 0.7rem 0; border-radius: var(--talos-radius-control); }
/* Bug in coda 24/10/2026: a capo la pillola era una scatola tagliata (`slice`); con `clone` ogni pezzo ha bordo e angoli suoi.
   MDN (21/07/2026): non ancora Baseline, quindi anche col prefisso; Open WebUI `src/app.css:535`. */
.talos-message-content :not(pre) > code { border: 1px solid var(--talos-border); border-radius: 4px; background: var(--talos-panel); padding: 0.08rem 0.3rem; font-size: 0.84em; -webkit-box-decoration-break: clone; box-decoration-break: clone; }
/*
 * Blocchi di codice, bozzetto approvato dall'owner il 23/10 (specifica unica col desktop; ricerca del Desktop
 * `RICERCA-BLOCCHI-CODICE-2026-10-23.md`, schema di Open WebUI `CodeBlock.svelte:447/473`): il blocco è INTERO (via il tetto di
 * 24rem) e la testata resta ferma in cima all'area dei messaggi finché il blocco è a schermo. `overflow: clip`, mai `hidden`:
 * `hidden` fa del blocco un contenitore di scorrimento e lo sticky della testata si aggancerebbe a lui (MDN overflow, caniuse
 * `overflow: clip`, WebView 90+); lo stesso vale per OGNI antenato fino allo scorrimento (BLOCCO-UI-14). Sotto le pillole
 * immersive non diamo uno scostamento (BLOCCO-STICKY-01; `--talos-code-header-top` resta come aggancio, 0 di serie). Che la
 * testata si fermi sotto il padding dello scorrimento è un comportamento OSSERVATO sul Pad (WebView Chromium, vc169), non
 * garantito: la specifica misura lo sticky dalla scrollport (CSS Positioned Layout 3, ED 14/05/2026, §3.4) e i browser col
 * padding del contenitore non sono uniformi (CSSWG #3352). Per questo a ogni WebView nuova la testata ferma si riprova dal vivo
 * (caso fisso del collaudo). Il fondo della testata è OPACO: il codice le scorre sotto.
 */
.talos-message-content .talos-code-block { position: relative; min-width: 0; max-width: 100%; overflow: clip; border: 1px solid var(--talos-code-border); border-radius: 6px; background: var(--talos-code-bg); color: var(--talos-code-text); }
.talos-message-content .talos-code-block-header { position: sticky; top: var(--talos-code-header-top, 0px); z-index: 1; display: flex; min-height: 2rem; align-items: center; gap: 0.25rem; border-bottom: 1px solid var(--talos-code-border); border-left: 2px solid var(--talos-code-accent); background: linear-gradient(var(--talos-code-surface), var(--talos-code-surface)), var(--talos-code-bg); padding: 0 0.35rem 0 0.65rem; color: var(--talos-muted); font-size: 0.8em; text-transform: uppercase; user-select: none; -webkit-user-select: none; }
/* Owner 24/10 (foto 08:41): con la testata ferma il codice spuntava sopra di lei, sotto il velo delle pillole. La fascia sopra la
   testata è piena del colore della chat (lo stesso del velo, `--talos-background`). Copre anche il bordo sinistro della testata
   (-2px) e il blocco la taglia al suo bordo interno (`overflow: clip`): quando la testata è al suo posto la fascia cade fuori dal
   blocco e non si vede, quando è ferma copre solo il codice del blocco, mai il messaggio sopra o il testo dopo (BLOCCO-UI-17). */
.talos-message-content .talos-code-block-header::before { content: ''; position: absolute; bottom: 100%; left: -2px; right: 0; height: calc(3.5rem + env(safe-area-inset-top)); background: var(--talos-background); pointer-events: none; }
.talos-message-content .talos-code-block-header > span { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.talos-message-content [data-talos-copy-code],
.talos-message-content [data-talos-code-menu] { min-height: 2.75rem; min-width: 2.75rem; border-radius: 4px; padding: 0 0.5rem; color: var(--talos-code-text); text-transform: none; }
.talos-message-content [data-talos-code-menu] { font-size: 1.15em; letter-spacing: 0.05em; }
.talos-message-content [data-talos-copy-code]:hover,
.talos-message-content [data-talos-code-menu]:hover { background: var(--talos-code-surface); }
.talos-message-content [data-talos-copy-code]:focus-visible,
.talos-message-content [data-talos-code-menu]:focus-visible { outline: 2px solid var(--talos-ring); outline-offset: 1px; }
.talos-message-content [data-talos-copy-code]:disabled,
.talos-message-content [data-talos-code-menu]:disabled { opacity: 0.45; }
.talos-message-content pre { max-width: 100%; overflow-x: auto; padding: 0.8rem; font-size: 0.89em; line-height: 1.6; }
/* Compresso («Collapse», solo sopra 40 righe): le prime 12 righe, una sfumatura, e «Show all {n} lines» che lo riapre. */
.talos-message-content .talos-code-block[data-compresso] pre { max-height: calc(12 * 1.6em + 0.8rem); overflow: hidden; -webkit-mask-image: linear-gradient(to bottom, #000 70%, transparent); mask-image: linear-gradient(to bottom, #000 70%, transparent); }
.talos-message-content [data-talos-code-expand] { display: block; min-height: 2.75rem; margin: 0 auto 0.6rem; border: 1px solid var(--talos-code-border); border-radius: 999px; padding: 0 1rem; color: var(--talos-code-text); font-size: 0.85em; }
.talos-message-content [data-talos-code-expand]:focus-visible { outline: 2px solid var(--talos-ring); outline-offset: 1px; }
.talos-message-content pre:focus-visible,
.talos-message-content .talos-message-table-scroll:focus-visible { outline: 2px solid var(--talos-ring); outline-offset: -2px; }
.talos-message-content .talos-message-table-scroll { min-width: 0; max-width: 100%; overflow-x: auto; border: 1px solid var(--talos-border); border-radius: 6px; }
.talos-message-content table { width: 100%; min-width: 28rem; border-collapse: collapse; font-size: 0.91em; }
/*
 * ⛔ `overflow-wrap: anywhere` sta sul contenitore per gli URL lunghi, e nelle
 * celle diventa un difetto: MISURATO 2026-08-15 su un confronto a quattro
 * colonne, le intestazioni si leggevano «Dimensi / on», «Reasoni / ng /
 * Architec / ture». Non è testo che va a capo: sono parole tagliate a metà.
 *
 * ⇒ Nelle celle si torna alla regola normale — si va a capo agli spazi — e si
 * dà a ogni colonna una larghezza minima. La tabella è già dentro un
 * contenitore che scorre: meglio scorrere che spezzare una parola.
 */
.talos-message-content th,
.talos-message-content td {
    border-bottom: 1px solid var(--talos-border);
    padding: 0.5rem 0.65rem;
    text-align: left;
    vertical-align: top;
    min-width: 8rem;
    overflow-wrap: normal;
    word-break: normal;
}
/* Un'intestazione è un nome di colonna: sta su una riga, o la tabella scorre. */
.talos-message-content th { background: var(--talos-panel-soft); font-weight: 650; white-space: nowrap; }
.talos-message-content tr:last-child td { border-bottom: 0; }
.talos-message-content .talos-task-marker { display: inline-flex; width: 1rem; justify-content: center; color: var(--talos-success); }
.talos-message-content .talos-external-image-omitted { color: var(--talos-muted); font-style: italic; }
</style>
