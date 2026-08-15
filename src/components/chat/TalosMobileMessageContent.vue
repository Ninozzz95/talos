<script setup lang="ts">
import { computed, ref } from 'vue'
import { useTalosI18n } from '@/i18n'
import {
    renderTalosMarkdownBlock,
    splitTalosMarkdownBlocks,
    type TalosMarkdownLabels,
} from '@/lib/talosMessageMarkdown'
import { writeTalosClipboardText } from '@/services/clipboard'

// R2-10 (owner obliteration directive): the sensitive-censor mechanism is
// REMOVED, not dormant — no blur path exists for any metadata flag.
const props = defineProps<{
    content: string
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
})))

async function handleContentClick(event: MouseEvent): Promise<void> {
    const target = event.target instanceof Element
        ? event.target.closest<HTMLButtonElement>('[data-talos-copy-code]')
        : null
    if (!target) return
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
 * Short and small on purpose. 260ms is long enough to read as motion and short
 * enough not to lag behind the text; a 2px rise gives the sense of settling
 * without moving the layout under a thumb.
 */
@keyframes talos-block-in {
    from { opacity: 0; transform: translateY(2px); }
    to { opacity: 1; transform: none; }
}
/* Only while the answer is arriving — see TalosMobileStreamingReply. A block
   that has finished must never animate again, or it plays over itself when the
   finished message replaces the streaming one. */
.talos-streaming-body .talos-message-block {
    animation: talos-block-in 260ms cubic-bezier(0.22, 0.61, 0.36, 1) both;
}
@media (prefers-reduced-motion: reduce) {
    .talos-streaming-body .talos-message-block { animation: none; }
}
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
.talos-message-content a:focus-visible { border-radius: 3px; outline: 2px solid var(--talos-ring); outline-offset: 2px; }
.talos-message-content :not(pre) > code { border: 1px solid var(--talos-border); border-radius: 4px; background: var(--talos-panel); padding: 0.08rem 0.3rem; font-size: 0.84em; }
.talos-message-content .talos-code-block { min-width: 0; max-width: 100%; overflow: hidden; border: 1px solid var(--talos-code-border); border-radius: 6px; background: var(--talos-code-bg); color: var(--talos-code-text); }
.talos-message-content .talos-code-block-header { display: flex; min-height: 2rem; align-items: center; justify-content: space-between; gap: 0.75rem; border-bottom: 1px solid var(--talos-code-border); border-left: 2px solid var(--talos-code-accent); background: var(--talos-code-surface); padding: 0 0.65rem; color: var(--talos-muted); font-size: 0.8em; text-transform: uppercase; }
.talos-message-content [data-talos-copy-code] { min-height: 2.75rem; min-width: 2.75rem; border-radius: 4px; padding: 0 0.5rem; color: var(--talos-code-text); text-transform: none; }
.talos-message-content [data-talos-copy-code]:hover { background: var(--talos-code-surface); }
.talos-message-content [data-talos-copy-code]:focus-visible { outline: 2px solid var(--talos-ring); outline-offset: 1px; }
.talos-message-content pre { max-width: 100%; max-height: 24rem; overflow: auto; padding: 0.8rem; font-size: 0.89em; line-height: 1.6; }
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
