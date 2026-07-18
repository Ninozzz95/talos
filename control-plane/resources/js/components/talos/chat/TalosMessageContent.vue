<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import { renderTalosMarkdown } from '../../../lib/talosMessageMarkdown'

const props = withDefaults(defineProps<{
    content: string
    sensitive?: boolean
    censorEnabled?: boolean
}>(), {
    sensitive: false,
    censorEnabled: true,
})

const copyStatus = ref('')
const contentRoot = ref<HTMLElement | null>(null)
const rendered = computed(() => renderTalosMarkdown(props.content))

function applyCensor() {
    if (!props.censorEnabled || !contentRoot.value) return
    void import('../../../lib/talosSensitiveCensor').then(({ censorSensitiveText }) => {
        if (props.censorEnabled && contentRoot.value) censorSensitiveText(contentRoot.value)
    }).catch(() => undefined)
}

onMounted(applyCensor)
watch(rendered, () => {
    void nextTick(applyCensor)
})

function fallbackCopyText(value: string) {
    const textarea = document.createElement('textarea')
    textarea.value = value
    textarea.setAttribute('readonly', 'true')
    textarea.style.position = 'fixed'
    textarea.style.left = '-9999px'
    document.body.appendChild(textarea)
    textarea.select()

    try {
        return document.execCommand('copy')
    } finally {
        document.body.removeChild(textarea)
    }
}

async function handleContentClick(event: MouseEvent) {
    const target = event.target instanceof Element ? event.target.closest<HTMLButtonElement>('[data-talos-copy-code]') : null
    if (!target) return
    const code = (target.closest('.talos-code-block')?.querySelector('code')?.textContent ?? '').replace(/\r\n?/g, '\n')

    try {
        if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(code)
        else if (!fallbackCopyText(code)) throw new Error('Clipboard API unavailable.')
        target.textContent = 'Copied'
        copyStatus.value = 'Code copied.'
        window.setTimeout(() => {
            if (target.isConnected) target.textContent = 'Copy'
            copyStatus.value = ''
        }, 1600)
    } catch {
        copyStatus.value = 'Code copy failed.'
    }
}
</script>

<template>
    <div
        ref="contentRoot"
        data-testid="talos-message-content"
        class="talos-message-content min-w-0 max-w-full"
        :class="sensitive ? 'talos-sensitive-output' : ''"
        @click="handleContentClick"
        v-html="rendered.html"
    />
    <span class="sr-only" role="status" aria-live="polite">{{ copyStatus }}</span>
</template>

<style>
.talos-message-content {
    overflow-wrap: anywhere;
    font-size: 0.875rem;
    line-height: 1.625;
}

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
.talos-message-content h2 { font-size: 1.125rem; }
.talos-message-content h3 { font-size: 1rem; }
.talos-message-content h4 { font-size: 0.925rem; }
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
.talos-message-content .talos-code-block-header { display: flex; min-height: 2rem; align-items: center; justify-content: space-between; gap: 0.75rem; border-bottom: 1px solid var(--talos-code-border); border-left: 2px solid var(--talos-code-accent); background: var(--talos-code-surface); padding: 0 0.65rem; color: var(--talos-muted); font-size: 0.7rem; text-transform: uppercase; }
.talos-message-content [data-talos-copy-code] { min-height: 1.75rem; border-radius: 4px; padding: 0 0.5rem; color: var(--talos-code-text); text-transform: none; }
.talos-message-content [data-talos-copy-code]:hover { background: var(--talos-code-surface); }
.talos-message-content [data-talos-copy-code]:focus-visible { outline: 2px solid var(--talos-ring); outline-offset: 1px; }
.talos-message-content pre { max-width: 100%; max-height: 24rem; overflow: auto; padding: 0.8rem; font-size: 0.78rem; line-height: 1.6; }
.talos-message-content pre:focus-visible,
.talos-message-content .talos-message-table-scroll:focus-visible { outline: 2px solid var(--talos-ring); outline-offset: -2px; }
.talos-message-content .talos-message-table-scroll { min-width: 0; max-width: 100%; overflow-x: auto; border: 1px solid var(--talos-border); border-radius: 6px; }
.talos-message-content table { width: 100%; min-width: 28rem; border-collapse: collapse; font-size: 0.8rem; }
.talos-message-content th,
.talos-message-content td { border-bottom: 1px solid var(--talos-border); padding: 0.5rem 0.65rem; text-align: left; vertical-align: top; }
.talos-message-content th { background: var(--talos-panel-soft); font-weight: 650; }
.talos-message-content tr:last-child td { border-bottom: 0; }
.talos-message-content .talos-task-marker { display: inline-flex; width: 1rem; justify-content: center; color: var(--talos-success); }
</style>
