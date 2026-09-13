<script setup lang="ts">
/**
 * ⛔ Owner 2026-08-27 — Tool Forge Fase 6, foglio d'importazione.
 * Struttura prima, semantica dopo — stessa regola di `validator.ts`: si
 * incolla un artefatto o un manifest nudo, si legge SEMPRE con
 * `validateTalosLocalTool` (l'unica fonte di verità, non una copia
 * duplicata della logica), e ogni diagnostico d'errore si mostra con
 * codice+messaggio prima di offrire "Installa" — mai un errore generico
 * (ricerca 27/8: la UX allo stato dell'arte per un import di manifest
 * mostra la diagnostica strutturale PRIMA di lasciar procedere, non un
 * "non valido" nudo).
 *
 * Accessibilità (ricerca 27/8, W3C ARIA19 + Reform): il contenitore degli
 * errori sta nel DOM fin dal montaggio (non compare/scompare), collegato
 * alla textarea con `aria-describedby`, e `aria-invalid` segue lo stato —
 * uno screen reader deve sapere COSA non va e DOVE, non solo che qualcosa
 * è cambiato.
 */
import { computed, ref } from 'vue'
import { useTalosI18n } from '@/i18n'
import TalosMobileComposerSheet from '@/components/chat/TalosMobileComposerSheet.vue'
import { Button } from '@/components/ui/button'
import { validateTalosLocalTool } from '@/lib/tools/dynamic/validator'
import { installForgeTool } from '@/lib/tools/dynamic/forgeRegistryRepository'
import type { ForgeDiagnostic, TalosLocalToolManifestV1 } from '@/lib/tools/dynamic/contracts'

const { t } = useTalosI18n()
const emit = defineEmits<{ close: []; imported: [title: string] }>()

const raw = ref('')
const parseError = ref<string | null>(null)
const diagnostics = ref<ForgeDiagnostic[] | null>(null)
const candidate = ref<TalosLocalToolManifestV1 | null>(null)
const busy = ref(false)
const pickingFile = ref(false)

const errorDiagnostics = computed(() => (diagnostics.value ?? []).filter((entry) => entry.level === 'error'))
const invalid = computed(() => Boolean(parseError.value) || errorDiagnostics.value.length > 0)

function describeError(cause: unknown): string {
    return cause instanceof Error && cause.message ? cause.message : String(cause)
}

function reset(): void {
    parseError.value = null
    diagnostics.value = null
    candidate.value = null
}

/**
 * Accetta sia l'artefatto intero (quello che `exportTalosToolArtifact`
 * produce, `{artifact, manifest, ...}`) sia il manifest nudo — chi incolla
 * il proprio export non deve prima spacchettarlo a mano.
 */
function validate(): void {
    reset()
    let parsed: unknown
    try {
        parsed = JSON.parse(raw.value)
    } catch {
        parseError.value = t('toolForge.importInvalidJson')
        return
    }
    if (!parsed || typeof parsed !== 'object') {
        parseError.value = t('toolForge.importInvalidJson')
        return
    }
    const envelope = parsed as { manifest?: unknown }
    const manifest = envelope.manifest && typeof envelope.manifest === 'object' ? envelope.manifest : parsed
    const result = validateTalosLocalTool(manifest)
    diagnostics.value = result.diagnostics
    if (result.ok) candidate.value = manifest as TalosLocalToolManifestV1
}

/**
 * ⛔ Owner 2026-08-27: la textarea da sola non basta — chi ha ricevuto un
 * `.talostool` come file (Libreria, allegato, download) non deve prima
 * aprirlo altrove e copiarne il testo. Stesso selettore nativo già usato
 * per riaprire un backup (`backupFile.ts:talosPickBackupFile`), stessa
 * doppia via `web-blob`/`native-uri` — non un pattern nuovo.
 */
async function importFromFile(): Promise<void> {
    reset()
    parseError.value = null
    pickingFile.value = true
    try {
        const { createNativeFilePicker } = await import('@/services/nativeFilePicker')
        const picked = await createNativeFilePicker().pickFiles()
        const file = picked[0]
        if (!file) return // annullato dalla persona — non è un errore
        let text: string
        if (file.source.kind === 'web-blob') {
            text = await file.source.blob.text()
        } else {
            const { Filesystem } = await import('@capacitor/filesystem')
            const read = await Filesystem.readFile({ path: file.source.uri, encoding: 'utf8' as never })
            if (typeof read.data !== 'string') throw new Error('TALOS_FORGE_IMPORT_FILE_UNREADABLE')
            text = read.data
        }
        raw.value = text
        validate()
    } catch (cause) {
        parseError.value = describeError(cause)
    } finally {
        pickingFile.value = false
    }
}

async function install(): Promise<void> {
    if (!candidate.value) return
    busy.value = true
    parseError.value = null
    try {
        await installForgeTool(candidate.value)
        emit('imported', candidate.value.title)
    } catch (cause) {
        parseError.value = describeError(cause)
    } finally {
        busy.value = false
    }
}
</script>

<template>
    <TalosMobileComposerSheet :title="t('toolForge.importCta')" testid="talos-tool-forge-import-sheet" @close="emit('close')">
        <div class="flex items-center justify-between gap-2">
            <label class="text-xs font-semibold uppercase tracking-wide text-[var(--talos-muted)]" for="talos-tool-forge-import-text">
                {{ t('toolForge.importCta') }}
            </label>
            <Button
                type="button"
                variant="outline"
                size="sm"
                data-testid="talos-tool-forge-import-from-file"
                :disabled="pickingFile || busy"
                @click="importFromFile"
            >
                {{ t('toolForge.importFromFile') }}
            </Button>
        </div>
        <textarea
            id="talos-tool-forge-import-text"
            v-model="raw"
            data-testid="talos-tool-forge-import-text"
            rows="8"
            class="mt-1 w-full rounded-xl border border-[var(--talos-border)] bg-[var(--talos-panel)] p-3 font-mono text-xs leading-5 text-[var(--talos-text)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--talos-ring)]"
            spellcheck="false"
            :aria-invalid="invalid"
            aria-describedby="talos-tool-forge-import-feedback"
            @input="reset"
        />

        <!-- Sempre nel DOM (non v-if sul contenitore esterno): la ricerca
             W3C ARIA19 lo richiede perché uno screen reader lo trovi. -->
        <div id="talos-tool-forge-import-feedback" role="alert" aria-atomic="true">
            <p v-if="parseError" class="mt-2 text-xs text-[var(--talos-danger,#dc5b5b)]" data-testid="talos-tool-forge-import-error">
                {{ parseError }}
            </p>

            <div v-else-if="diagnostics && errorDiagnostics.length" class="mt-2 rounded-xl border border-[var(--talos-danger,#dc5b5b)]/40 bg-[var(--talos-danger-soft)] p-3" data-testid="talos-tool-forge-import-diagnostics">
                <p class="text-xs font-semibold text-[var(--talos-danger,#dc5b5b)]">
                    {{ errorDiagnostics.length === 1 ? t('toolForge.importIssuesHeadingOne') : t('toolForge.importIssuesHeading', { n: errorDiagnostics.length }) }}
                </p>
                <ul class="mt-1.5 flex flex-col gap-1.5">
                    <li v-for="(entry, index) in errorDiagnostics" :key="index" class="text-xs leading-5 text-[var(--talos-danger,#dc5b5b)]">
                        <span class="font-mono">{{ entry.code }}</span> — {{ entry.message }}
                    </li>
                </ul>
                <p class="mt-1.5 text-2xs text-[var(--talos-muted)]">{{ t('toolForge.importFixToContinue') }}</p>
            </div>

            <p v-else-if="candidate" class="mt-2 text-xs text-[var(--talos-accent)]" data-testid="talos-tool-forge-import-valid">
                {{ t('toolForge.justImported', { title: candidate.title }) }}
            </p>
        </div>

        <div class="mt-4 flex justify-end gap-2">
            <Button type="button" variant="ghost" data-testid="talos-tool-forge-import-validate" :disabled="!raw.trim() || busy" @click="validate">
                {{ t('common.continue') }}
            </Button>
            <Button
                type="button"
                data-testid="talos-tool-forge-import-install"
                class="rounded-full"
                :disabled="!candidate || busy"
                @click="install"
            >
                {{ t('common.add') }}
            </Button>
        </div>
    </TalosMobileComposerSheet>
</template>
