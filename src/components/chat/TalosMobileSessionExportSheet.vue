<script setup lang="ts">
import { computed, ref } from 'vue'
import { useTalosI18n } from '@/i18n'
import { Braces, Copy, Database, Download, FileJson, FileText, Share2 } from '@lucide/vue'
import TalosMobileComposerSheet from '@/components/chat/TalosMobileComposerSheet.vue'
import {
    buildTalosMobileBenchmarkScenarioExport,
    buildTalosMobileContextManifestExport,
    buildTalosMobileEvidencePack,
    buildTalosMobileMarkdownExport,
    type TalosMobileSessionExportFormat,
    type TalosMobileSessionExportInput,
} from '@/lib/chat/sessionExport'
import { writeTalosClipboardText } from '@/services/clipboard'
import { deliverTalosSessionExport } from '@/services/sessionExportDelivery'
import { useChatController } from '@/stores/chatController'

/**
 * F4-#16 — "Export chat" sheet from the immersive 3-dot menu. Desktop parity:
 * the same four artifacts as TalosExportDialog (JSON evidence pack, Markdown
 * transcript, Context manifest, Benchmark scenario), generated locally and
 * delivered via the system share sheet (native) or download (web).
 */
const emit = defineEmits<{ close: [] }>()

const controller = useChatController()
const { t } = useTalosI18n()

const formats = computed<Array<{
    format: TalosMobileSessionExportFormat
    label: string
    action: string
    detail: string
}>>(() => [
    {
        format: 'json',
        label: t('export.jsonLabel'),
        action: t('export.jsonAction'),
        detail: t('export.jsonDetail'),
    },
    {
        format: 'markdown',
        label: t('export.markdownLabel'),
        action: t('export.markdownAction'),
        detail: t('export.markdownDetail'),
    },
    {
        format: 'context_manifest',
        label: t('export.contextLabel'),
        action: t('export.contextAction'),
        detail: t('export.contextDetail'),
    },
    {
        format: 'benchmark_scenario',
        label: t('export.benchmarkLabel'),
        action: t('export.benchmarkAction'),
        detail: t('export.benchmarkDetail'),
    },
])

const exporting = ref(false)
const error = ref<string | null>(null)
const generated = ref<{ format: TalosMobileSessionExportFormat; reportType: string; content: string; benchmarkReady: boolean } | null>(null)
const copyingMarkdown = ref(false)
const markdownCopied = ref(false)
const copyStatus = ref('')

const sessionTitle = computed(() => controller.chat.activeSession.value?.title ?? t('export.noActiveSession'))
const hasSession = computed(() => controller.chat.activeSession.value !== null)

function artifactFor(format: TalosMobileSessionExportFormat, input: TalosMobileSessionExportInput) {
    switch (format) {
        case 'json': {
            const pack = buildTalosMobileEvidencePack(input)
            return { reportType: pack.report_type, content: JSON.stringify(pack, null, 2), contentType: 'application/json', extension: 'json', benchmarkReady: pack.benchmark_readiness.ready }
        }
        case 'markdown': {
            const markdown = buildTalosMobileMarkdownExport(input)
            return { reportType: markdown.report_type, content: markdown.content, contentType: 'text/markdown', extension: 'md', benchmarkReady: false }
        }
        case 'context_manifest': {
            const manifest = buildTalosMobileContextManifestExport(input)
            return { reportType: manifest.report_type, content: JSON.stringify(manifest, null, 2), contentType: 'application/json', extension: 'json', benchmarkReady: false }
        }
        case 'benchmark_scenario': {
            const scenario = buildTalosMobileBenchmarkScenarioExport(input)
            return { reportType: scenario.report_type, content: JSON.stringify(scenario, null, 2), contentType: 'application/json', extension: 'json', benchmarkReady: scenario.benchmark_readiness.ready }
        }
    }
}

let lastArtifact: { fileName: string; content: string; contentType: string } | null = null

async function generate(format: TalosMobileSessionExportFormat): Promise<void> {
    if (exporting.value || copyingMarkdown.value) return
    exporting.value = true
    error.value = null
    savedToLibrary.value = false
    markdownCopied.value = false
    copyStatus.value = ''
    try {
        const snapshot = await controller.chat.exportSnapshot()
        const input: TalosMobileSessionExportInput = { ...snapshot, exported_at: new Date().toISOString() }
        const artifact = artifactFor(format, input)
        const stamp = input.exported_at.replace(/[:.]/g, '-')
        lastArtifact = {
            fileName: `talos-${format}-${stamp}.${artifact.extension}`,
            content: artifact.content,
            contentType: artifact.contentType,
        }
        generated.value = {
            format,
            reportType: artifact.reportType,
            content: artifact.content,
            benchmarkReady: artifact.benchmarkReady,
        }
    } catch (cause) {
        error.value = cause instanceof Error && cause.message ? cause.message : String(cause)
    } finally {
        exporting.value = false
    }
}

async function copyMarkdownTranscript(): Promise<void> {
    const content = generated.value?.format === 'markdown'
        ? generated.value.content
        : ''
    if (!content || copyingMarkdown.value) return

    copyingMarkdown.value = true
    markdownCopied.value = false
    copyStatus.value = ''
    error.value = null
    try {
        // Copy the canonical snapshot already visible in the preview. Rebuilding
        // here would give the timestamp another value and make "Copy" differ
        // from what the owner inspected.
        await writeTalosClipboardText(content)
        markdownCopied.value = true
        copyStatus.value = t('export.markdownCopiedStatus')
    } catch {
        error.value = t('export.markdownCopyFailed')
    } finally {
        copyingMarkdown.value = false
    }
}

async function share(): Promise<void> {
    if (!lastArtifact || exporting.value) return
    error.value = null
    try {
        await deliverTalosSessionExport(lastArtifact)
    } catch (cause) {
        error.value = cause instanceof Error && cause.message ? cause.message : String(cause)
    }
}

const savingToLibrary = ref(false)
const savedToLibrary = ref(false)
async function saveToLibrary(): Promise<void> {
    if (!lastArtifact || savingToLibrary.value) return
    error.value = null
    savingToLibrary.value = true
    try {
        await controller.attachments.saveGenerated({
            name: lastArtifact.fileName,
            mediaType: lastArtifact.contentType,
            text: lastArtifact.content,
        }, {
            // A transcript the USER asked for, not something a model made. No
            // model is named because none is responsible for it, and naming one
            // would be a false history in a file that is handed to people.
            model: null,
            provider: null,
        })
        savedToLibrary.value = true
    } catch (cause) {
        // Never surface a raw TALOS_* code (e.g. a very long export exceeding the
        // text cap) — the Library save has a friendly fallback like the rest of
        // the attachment surface.
        const raw = cause instanceof Error && cause.message ? cause.message : String(cause)
        error.value = /^TALOS_[A-Z0-9_]+$/.test(raw)
            ? t('export.tooLarge')
            : (raw || t('export.saveFailed'))
    } finally {
        savingToLibrary.value = false
    }
}
</script>

<template>
    <TalosMobileComposerSheet :title="$t('chat.exportChat')" testid="talos-export-sheet" @close="emit('close')">
        <p class="px-1 text-xs leading-5 text-[var(--talos-muted)]">
            <span class="font-semibold text-[var(--talos-text)]">{{ sessionTitle }}</span> —
            {{ $t('export.localArtifactDetail') }}
        </p>

        <div class="space-y-2">
            <article
                v-for="entry in formats"
                :key="entry.format"
                class="rounded-2xl border border-[var(--talos-border)] bg-[var(--talos-panel)]/70 p-3"
            >
                <div class="flex items-start gap-2">
                    <FileJson v-if="entry.format === 'json' || entry.format === 'benchmark_scenario'" class="mt-0.5 size-4 shrink-0 text-[var(--talos-accent)]" aria-hidden="true" />
                    <FileText v-else-if="entry.format === 'markdown'" class="mt-0.5 size-4 shrink-0 text-[var(--talos-accent)]" aria-hidden="true" />
                    <Braces v-else class="mt-0.5 size-4 shrink-0 text-[var(--talos-accent)]" aria-hidden="true" />
                    <div class="min-w-0 flex-1">
                        <div class="text-sm font-semibold text-[var(--talos-text)]">{{ entry.label }}</div>
                        <p class="mt-0.5 text-xs leading-5 text-[var(--talos-muted)]">{{ entry.detail }}</p>
                    </div>
                    <button
                        type="button"
                        :aria-label="entry.action"
                        :disabled="!hasSession || exporting || copyingMarkdown"
                        class="talos-pressable flex min-h-touch items-center gap-1.5 rounded-full bg-[var(--talos-accent,var(--primary))] px-3 text-sm text-[var(--talos-accent-contrast,var(--primary-foreground))] disabled:opacity-50"
                        @click="generate(entry.format)"
                    >
                        <Download class="size-4" aria-hidden="true" />
                        {{ $t('export.generate') }}
                    </button>
                </div>
            </article>
        </div>

        <p v-if="error" role="alert" class="px-1 text-xs leading-5 text-[var(--talos-danger,#dc5b5b)]">{{ error }}</p>

        <section v-if="generated" class="rounded-2xl border border-[var(--talos-border)] bg-[var(--talos-panel)]/70 p-3">
            <div class="flex flex-wrap items-center justify-between gap-2">
                <div class="min-w-0">
                    <div class="text-2xs font-semibold uppercase tracking-wide text-[var(--talos-muted)]">{{ $t('export.preview') }}</div>
                    <div class="mt-0.5 truncate text-sm font-semibold text-[var(--talos-text)]">{{ generated.reportType }}</div>
                </div>
                <span
                    v-if="generated.benchmarkReady"
                    class="rounded-full bg-[var(--talos-success,#3f9d6b)]/15 px-2 py-0.5 text-2xs font-semibold text-[var(--talos-success,#3f9d6b)]"
                >{{ $t('export.benchmarkReady') }}</span>
            </div>
            <pre
                data-testid="talos-session-export-preview"
                class="mt-2 max-h-64 overflow-auto whitespace-pre-wrap rounded-xl border border-[var(--talos-border)] bg-[var(--talos-background)] p-3 text-xs leading-5 text-[var(--talos-muted)]"
            >{{ generated.content }}</pre>
            <button
                v-if="generated.format === 'markdown'"
                type="button"
                :aria-label="$t('export.copyMarkdown')"
                :disabled="copyingMarkdown"
                class="talos-pressable mt-3 flex min-h-touch w-full items-center justify-center gap-2 rounded-full border border-[var(--talos-border)] text-sm text-[var(--talos-text)] disabled:opacity-60"
                @click="copyMarkdownTranscript"
            >
                <Copy class="size-4 text-[var(--talos-accent)]" aria-hidden="true" />
                {{ copyingMarkdown
                    ? $t('export.copyingMarkdown')
                    : (markdownCopied ? $t('export.copiedMarkdown') : $t('export.copyMarkdown')) }}
            </button>
            <span
                data-testid="talos-export-copy-status"
                class="sr-only"
                role="status"
                aria-live="polite"
            >{{ copyStatus }}</span>
            <button
                type="button"
                data-testid="talos-export-share"
                :disabled="exporting"
                class="talos-pressable mt-3 flex min-h-touch w-full items-center justify-center gap-2 rounded-full bg-[var(--talos-accent,var(--primary))] text-sm text-[var(--talos-accent-contrast,var(--primary-foreground))] disabled:opacity-50"
                @click="share"
            >
                <Share2 class="size-4" aria-hidden="true" />
                {{ $t('export.shareSave') }}
            </button>
            <button
                type="button"
                data-testid="talos-export-save-library"
                :disabled="savingToLibrary || savedToLibrary"
                class="talos-pressable mt-2 flex min-h-touch w-full items-center justify-center gap-2 rounded-full border border-[var(--talos-border)] text-sm text-[var(--talos-text)] disabled:opacity-60"
                @click="saveToLibrary"
            >
                <Database class="size-4 text-[var(--talos-accent)]" aria-hidden="true" />
                {{ savedToLibrary ? $t('export.savedToLibrary') : $t('chat.saveToLibrary') }}
            </button>
        </section>
    </TalosMobileComposerSheet>
</template>
