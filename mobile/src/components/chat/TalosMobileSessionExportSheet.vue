<script setup lang="ts">
import { computed, ref } from 'vue'
import { Braces, Download, FileJson, FileText, Share2 } from '@lucide/vue'
import TalosMobileComposerSheet from '@/components/chat/TalosMobileComposerSheet.vue'
import {
    buildTalosMobileBenchmarkScenarioExport,
    buildTalosMobileContextManifestExport,
    buildTalosMobileEvidencePack,
    buildTalosMobileMarkdownExport,
    type TalosMobileSessionExportFormat,
    type TalosMobileSessionExportInput,
} from '@/lib/chat/sessionExport'
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

const formats: Array<{
    format: TalosMobileSessionExportFormat
    label: string
    action: string
    detail: string
}> = [
    {
        format: 'json',
        label: 'JSON evidence pack',
        action: 'Export JSON evidence pack',
        detail: 'Messages, tool activity evidence, grounding sources, and benchmark readiness.',
    },
    {
        format: 'markdown',
        label: 'Markdown transcript',
        action: 'Export Markdown transcript',
        detail: 'Human-readable transcript for reports and handoff.',
    },
    {
        format: 'context_manifest',
        label: 'Context manifest',
        action: 'Export Context manifest',
        detail: 'Grounding source names, hashes, and permissions without storage paths.',
    },
    {
        format: 'benchmark_scenario',
        label: 'Benchmark scenario',
        action: 'Export Benchmark scenario',
        detail: 'Benchmark-ready scenario only when a completed exchange exists.',
    },
]

const exporting = ref(false)
const error = ref<string | null>(null)
const generated = ref<{ format: TalosMobileSessionExportFormat; reportType: string; content: string; benchmarkReady: boolean } | null>(null)

const sessionTitle = computed(() => controller.chat.activeSession.value?.title ?? 'No active session')
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
    if (exporting.value) return
    exporting.value = true
    error.value = null
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

async function share(): Promise<void> {
    if (!lastArtifact || exporting.value) return
    error.value = null
    try {
        await deliverTalosSessionExport(lastArtifact)
    } catch (cause) {
        error.value = cause instanceof Error && cause.message ? cause.message : String(cause)
    }
}
</script>

<template>
    <TalosMobileComposerSheet title="Export chat" testid="talos-export-sheet" @close="emit('close')">
        <p class="px-1 text-xs leading-5 text-[var(--talos-muted)]">
            <span class="font-semibold text-[var(--talos-text)]">{{ sessionTitle }}</span> —
            artifacts are generated on this device with context provenance and no storage paths.
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
                        :disabled="!hasSession || exporting"
                        class="talos-pressable flex min-h-11 items-center gap-1.5 rounded-full bg-[var(--talos-accent,var(--primary))] px-3 text-sm text-[var(--talos-accent-contrast,var(--primary-foreground))] disabled:opacity-50"
                        @click="generate(entry.format)"
                    >
                        <Download class="size-4" aria-hidden="true" />
                        Generate
                    </button>
                </div>
            </article>
        </div>

        <p v-if="error" role="alert" class="px-1 text-xs leading-5 text-[var(--talos-danger,#dc5b5b)]">{{ error }}</p>

        <section v-if="generated" class="rounded-2xl border border-[var(--talos-border)] bg-[var(--talos-panel)]/70 p-3">
            <div class="flex flex-wrap items-center justify-between gap-2">
                <div class="min-w-0">
                    <div class="text-[11px] font-semibold uppercase tracking-wide text-[var(--talos-muted)]">Export preview</div>
                    <div class="mt-0.5 truncate text-sm font-semibold text-[var(--talos-text)]">{{ generated.reportType }}</div>
                </div>
                <span
                    v-if="generated.benchmarkReady"
                    class="rounded-full bg-[var(--talos-success,#3f9d6b)]/15 px-2 py-0.5 text-[11px] font-semibold text-[var(--talos-success,#3f9d6b)]"
                >Benchmark ready</span>
            </div>
            <pre
                data-testid="talos-session-export-preview"
                class="mt-2 max-h-64 overflow-auto whitespace-pre-wrap rounded-xl border border-[var(--talos-border)] bg-[var(--talos-background)] p-3 text-xs leading-5 text-[var(--talos-muted)]"
            >{{ generated.content }}</pre>
            <button
                type="button"
                data-testid="talos-export-share"
                :disabled="exporting"
                class="talos-pressable mt-3 flex min-h-11 w-full items-center justify-center gap-2 rounded-full bg-[var(--talos-accent,var(--primary))] text-sm text-[var(--talos-accent-contrast,var(--primary-foreground))] disabled:opacity-50"
                @click="share"
            >
                <Share2 class="size-4" aria-hidden="true" />
                Share / Save
            </button>
        </section>
    </TalosMobileComposerSheet>
</template>
