<script setup lang="ts">
import { computed } from 'vue'
import { useTalosI18n } from '@/i18n'
import { Check, Database } from '@lucide/vue'
import TalosThemedFilter from '@/components/talos/ui/TalosThemedFilter.vue'
import TalosMobileComposerSheet from '@/components/chat/TalosMobileComposerSheet.vue'
import TalosMobileLibraryFileGlyph from '@/components/talos/library/TalosMobileLibraryFileGlyph.vue'
import type { TalosLocalVaultFile } from '@/repositories/chatRepository'
import {
    TALOS_LIBRARY_CONTEXT_MODES,
    type TalosLibraryContextMode,
    type TalosLibraryTurnOverride,
} from '@/lib/chat/libraryPolicy'

const props = defineProps<{
    effectiveEnabled: boolean
    effectiveMode: TalosLibraryContextMode
    override: TalosLibraryTurnOverride | null
    files: readonly TalosLocalVaultFile[]
}>()

const emit = defineEmits<{
    close: []
    'update:override': [override: TalosLibraryTurnOverride | null]
}>()

type TurnModeValue = 'inherit' | 'off' | TalosLibraryContextMode

const modeValue = computed<TurnModeValue>(() => {
    if (props.override?.enabled === false) return 'off'
    return props.override?.mode ?? 'inherit'
})

const { t } = useTalosI18n()

const modeOptions = computed<Array<{ value: TurnModeValue; label: string }>>(() => [
    { value: 'inherit', label: 'library.contextInheritChat' },
    { value: 'off', label: 'library.contextOffForTurn' },
    { value: 'broad_compat_v1', label: 'aiDefaults.libraryModes.broad' },
    { value: 'smart_relevant_v1', label: 'aiDefaults.libraryModes.smart' },
    { value: 'ask_before_use_v1', label: 'aiDefaults.libraryModes.ask' },
    { value: 'agentic_on_demand_v1', label: 'aiDefaults.libraryModes.onDemand' },
])

const modeFilterOptions = computed(() => modeOptions.value.map((option) => ({
    value: option.value,
    // Resolved here, because the shared filter takes a name and not a key.
    label: t(option.label),
    testId: `talos-library-turn-mode-${option.value}`,
})))

/** Appearance stays here; the radiogroup grammar belongs to the primitive. */
function modeOptionClass(selected: boolean): string {
    const base = 'talos-pressable flex min-h-12 w-full items-center gap-3 rounded-xl border px-3 text-left text-sm'
    return selected
        ? `${base} border-[var(--talos-accent)] bg-[var(--talos-accent-soft)] text-[var(--talos-text)]`
        : `${base} border-[var(--talos-border)] text-[var(--talos-muted)]`
}

function chooseMode(value: string): void {
    const found = modeOptions.value.find((option) => option.value === value)
    if (found) setMode(found.value)
}

function uniqueIds(values: readonly string[] | undefined): string[] {
    return [...new Set((values ?? []).filter((value) => value.trim() !== ''))]
}

function publish(candidate: TalosLibraryTurnOverride): void {
    const included = uniqueIds(candidate.included_file_ids)
    const excluded = uniqueIds(candidate.excluded_file_ids)
    const blocked = new Set(excluded)
    const normalized: TalosLibraryTurnOverride = {}
    if (typeof candidate.enabled === 'boolean') normalized.enabled = candidate.enabled
    if (candidate.mode) normalized.mode = candidate.mode
    if (included.length > 0) {
        normalized.included_file_ids = included.filter((id) => !blocked.has(id))
    } else if (candidate.included_file_ids !== undefined) {
        normalized.included_file_ids = []
    }
    if (excluded.length > 0) normalized.excluded_file_ids = excluded
    else if (candidate.excluded_file_ids !== undefined) normalized.excluded_file_ids = []
    if (candidate.consent_granted === true) normalized.consent_granted = true
    emit('update:override', Object.keys(normalized).length > 0 ? normalized : null)
}

function setMode(value: TurnModeValue): void {
    const candidate = { ...(props.override ?? {}) }
    delete candidate.enabled
    delete candidate.mode
    delete candidate.consent_granted
    if (value === 'off') candidate.enabled = false
    else if ((TALOS_LIBRARY_CONTEXT_MODES as readonly string[]).includes(value)) {
        candidate.enabled = true
        candidate.mode = value as TalosLibraryContextMode
    }
    publish(candidate)
}

/**
 * Le tre scelte per un file, con i test-id che le due vecchie portavano.
 *
 * `include` ed `exclude` restano gli stessi identificativi: la grammatica
 * cambia, i selettori puntati su quei comandi no — altrimenti l'adozione si
 * legge come una regressione.
 */
function fileStateOptions(file: { id: string, display_name: string }) {
    return [
        { value: 'automatic', label: t('library.contextAutomatic'), testId: `talos-library-turn-auto-${file.id}` },
        { value: 'included', label: t('library.contextIncluded'), testId: `talos-library-turn-include-${file.id}` },
        { value: 'excluded', label: t('library.contextExcluded'), testId: `talos-library-turn-exclude-${file.id}` },
    ]
}

/** Compatto: tre voci su una riga stretta, sotto il nome del file. */
function fileStateOptionClass(selected: boolean): string {
    const base = 'talos-pressable min-h-9 rounded-full border px-2.5 text-2xs'
    return selected
        ? `${base} border-[var(--talos-accent)] bg-[var(--talos-accent-soft)] text-[var(--talos-text)]`
        : `${base} border-[var(--talos-border)] text-[var(--talos-muted)]`
}

function fileState(fileId: string): 'automatic' | 'included' | 'excluded' {
    if (props.override?.excluded_file_ids?.includes(fileId)) return 'excluded'
    if (props.override?.included_file_ids?.includes(fileId)) return 'included'
    return 'automatic'
}

function setFileState(fileId: string, state: 'automatic' | 'included' | 'excluded'): void {
    const included = uniqueIds(props.override?.included_file_ids).filter((id) => id !== fileId)
    const excluded = uniqueIds(props.override?.excluded_file_ids).filter((id) => id !== fileId)
    if (state === 'included') included.push(fileId)
    if (state === 'excluded') excluded.push(fileId)
    publish({
        ...(props.override ?? {}),
        included_file_ids: included,
        excluded_file_ids: excluded,
    })
}
</script>

<template>
    <TalosMobileComposerSheet
        :title="$t('library.contextForNextMessage')"
        testid="talos-library-context-sheet"
        @close="emit('close')"
    >
        <p class="text-xs leading-5 text-[var(--talos-muted)]">
            {{ $t('library.contextForNextMessageBody') }}
        </p>

        <section>
            <h3 class="text-xs font-semibold uppercase tracking-wide text-[var(--talos-muted)]">
                {{ $t('library.modeForNextMessage') }}
            </h3>
            <!-- One mode among several: a radiogroup. It was a stack of buttons
                 each carrying `aria-pressed`, which says nothing about choosing
                 one putting the others down. -->
            <TalosThemedFilter
                group-class="mt-2 grid gap-2"
                :model-value="modeValue"
                :options="modeFilterOptions"
                :group-label="$t('library.modeForNextMessage')"
                :option-class="modeOptionClass"
                @update:model-value="chooseMode"
            >
                <template #option="{ option, selected }">
                    <Database class="size-4 shrink-0 text-[var(--talos-accent)]" aria-hidden="true" />
                    <span class="min-w-0 flex-1">{{ option.label }}</span>
                    <Check v-if="selected" class="size-4 shrink-0 text-[var(--talos-accent)]" aria-hidden="true" />
                </template>
            </TalosThemedFilter>
        </section>

        <section v-if="files.length">
            <h3 class="text-xs font-semibold uppercase tracking-wide text-[var(--talos-muted)]">
                {{ $t('library.sourcesForNextMessage') }}
            </h3>
            <p class="mt-1 text-2xs leading-4 text-[var(--talos-muted)]">
                {{ $t('library.sourcesForNextMessageBody') }}
            </p>
            <ul class="mt-2 space-y-2">
                <li
                    v-for="file in files"
                    :key="file.id"
                    class="flex min-w-0 items-center gap-2 rounded-xl border border-[var(--talos-border)] p-2"
                >
                    <span class="flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-[var(--talos-panel)]">
                        <TalosMobileLibraryFileGlyph :file="file" />
                    </span>
                    <span class="min-w-0 flex-1">
                        <span class="block truncate text-xs font-medium text-[var(--talos-text)]">
                            {{ file.display_name }}
                        </span>
                        <!--
                            TRE stati, quindi un radiogroup — non due
                            interruttori indipendenti.

                            Erano due bottoni con `aria-pressed`: un lettore di
                            schermo diceva «pulsante, non premuto» due volte e
                            mai «automatico, 1 di 3». E guardandoli, su
                            «automatico» sembravano semplicemente due comandi
                            spenti: lo stato corrente non era da nessuna parte
                            se non in una riga di testo accanto.

                            Sotto il nome e non di fianco: tre scelte accanto a
                            un nome di file non ci stanno su un telefono, e
                            comprimerle vorrebbe dire tre bersagli che si
                            sbagliano.
                        -->
                        <TalosThemedFilter
                            group-class="mt-1.5 flex gap-1"
                            :model-value="fileState(file.id)"
                            :options="fileStateOptions(file)"
                            :group-label="$t('library.contextForNamed', { name: file.display_name })"
                            :option-class="fileStateOptionClass"
                            @update:model-value="(value) => setFileState(file.id, value as 'automatic' | 'included' | 'excluded')"
                        />
                    </span>
                </li>
            </ul>
        </section>

        <button
            v-if="override"
            type="button"
            data-testid="talos-library-turn-reset"
            class="talos-pressable min-h-12 w-full rounded-xl border border-[var(--talos-border)] px-3 text-sm text-[var(--talos-muted)]"
            @click="emit('update:override', null)"
        >
            {{ $t('library.clearNextMessageOverride') }}
        </button>
    </TalosMobileComposerSheet>
</template>
