<script setup lang="ts">
/**
 * ⛔ K3-C3a (ledger `LEDGER-K3-CODICE-COME-LA-CHAT-2026-10-15.md`): ⌘, la tavolozza dei comandi del Codice su r4. Come il Codice
 * di oggi (`mobile/public/harness-ui/app.js:7840`) e Happy (`CommandPaletteProvider.tsx:48-109`): ricerca in cima, voci a gruppi
 * con titolo e sottotitolo. Solo i comandi che hanno un comportamento vero su r4: Revisione, Terminale, Browser, Automazioni
 * arrivano col loro pannello.
 * K3-C Esporta e Condividi (owner 17/10): «Esporta» apre il foglio della chat, «Condividi» manda la trascrizione Markdown con un
 * tocco, e il suo sottotitolo dice cosa contiene. Leggono soltanto: valgono anche mentre il giro lavora.
 */
import { computed, nextTick, onMounted, ref, type Component } from 'vue'
import { CopyPlus, Download, GitBranch, Pencil, Play, Plus, Share2, Shrink, Stethoscope, Zap } from '@lucide/vue'
import TalosMobileComposerSheet from '@/components/chat/TalosMobileComposerSheet.vue'
import { useTalosI18n } from '@/i18n'
import './codiceR4.css'

export type ComandoCodiceR4 = 'nuova' | 'rinomina' | 'duplica' | 'riprendi' | 'compatta' | 'esporta' | 'condividi' | 'albero' | 'hook' | 'doctor'

const props = defineProps<{
    /** Falso finché la conversazione non ha una sessione su r4 (prima del primo messaggio). */
    conSessione: boolean
    /** Vero mentre un giro lavora. */
    occupato: boolean
    /**
     * ⛔ RA-11 (revisione avversariale R-M4, 21/10/2026): sulla sessione di un PC, il perché («Solo dal computer») delle voci che il PC
     * rifiuta al telefono (`soloSulPc`): spente, col perché al posto del sottotitolo. Vuoto o assente in locale.
     */
    soloDalPc?: string
}>()
const emit = defineEmits<{ close: [], comando: [comando: ComandoCodiceR4] }>()
const { t } = useTalosI18n()

interface Voce { id: ComandoCodiceR4; gruppo: 'sessione' | 'vai'; titolo: string; sottotitolo: string; icona: Component; diSessione: boolean; soloLettura?: boolean; soloSulPc?: boolean }

const VOCI = computed<Voce[]>(() => [
    // D-RM4-11 (Pad 21/10/2026): sulla sessione di un PC la sessione nuova parte dalla scelta della cartella sul computer (Q2)
    { id: 'nuova', gruppo: 'sessione', titolo: t('harness.r4CmdNew'), sottotitolo: props.soloDalPc ? t('harness.r4CmdNewOnPcHint') : t('harness.r4CmdNewHint'), icona: Plus, diSessione: false },
    { id: 'rinomina', gruppo: 'sessione', titolo: t('harness.r4CmdRename'), sottotitolo: t('harness.r4CmdRenameHint'), icona: Pencil, diSessione: true },
    { id: 'duplica', gruppo: 'sessione', titolo: t('harness.r4CmdDuplicate'), sottotitolo: t('harness.r4CmdDuplicateHint'), icona: CopyPlus, diSessione: true, soloSulPc: true },
    { id: 'riprendi', gruppo: 'sessione', titolo: t('harness.r4Resume'), sottotitolo: t('harness.r4CmdResumeHint'), icona: Play, diSessione: true },
    { id: 'compatta', gruppo: 'sessione', titolo: t('harness.r4Compact'), sottotitolo: t('harness.r4CmdCompactHint'), icona: Shrink, diSessione: true },
    { id: 'esporta', gruppo: 'sessione', titolo: t('harness.r4CmdExport'), sottotitolo: t('harness.r4CmdExportHint'), icona: Download, diSessione: true, soloLettura: true, soloSulPc: true },
    { id: 'condividi', gruppo: 'sessione', titolo: t('harness.r4CmdShare'), sottotitolo: t('harness.r4CmdShareHint'), icona: Share2, diSessione: true, soloLettura: true, soloSulPc: true },
    { id: 'albero', gruppo: 'vai', titolo: t('harness.r4Tree'), sottotitolo: t('harness.r4CmdTreeHint'), icona: GitBranch, diSessione: false },
    { id: 'hook', gruppo: 'vai', titolo: t('harness.r4Hooks'), sottotitolo: t('harness.r4CmdHooksHint'), icona: Zap, diSessione: false },
    // K3-C2b: il Doctor di r4 non dipende dalla sessione aperta
    { id: 'doctor', gruppo: 'vai', titolo: t('harness.r4Doctor'), sottotitolo: t('harness.r4CmdDoctorHint'), icona: Stethoscope, diSessione: false },
])

const cerca = ref('')
const campo = ref<HTMLInputElement | null>(null)
const trovate = computed(() => {
    const q = cerca.value.trim().toLowerCase()
    return q ? VOCI.value.filter((v) => `${v.titolo} ${v.sottotitolo}`.toLowerCase().includes(q)) : VOCI.value
})
const gruppi = computed(() => (['sessione', 'vai'] as const)
    .map((g) => ({ id: g, titolo: g === 'sessione' ? t('harness.r4GroupSession') : t('harness.r4GroupGoTo'), voci: trovate.value.filter((v) => v.gruppo === g) }))
    .filter((g) => g.voci.length > 0))
const soloSulPc = (v: Voce): boolean => Boolean(props.soloDalPc) && v.soloSulPc === true
const spenta = (v: Voce): boolean => soloSulPc(v) || (v.diSessione && (!props.conSessione || (props.occupato && !v.soloLettura)))

onMounted(() => { void nextTick(() => campo.value?.focus()) })
</script>

<template>
    <TalosMobileComposerSheet :title="$t('harness.r4Commands')" testid="talos-codice-r4-comandi-foglio" @close="emit('close')">
        <div class="px-3 pb-2">
            <input
                ref="campo"
                v-model="cerca"
                type="search"
                data-testid="talos-codice-r4-comandi-cerca"
                class="talos-codice-r4-campo"
                :placeholder="$t('harness.r4CommandsSearch')"
                :aria-label="$t('harness.r4CommandsSearch')"
                autocomplete="off"
                enterkeyhint="search"
            >
        </div>
        <p v-if="gruppi.length === 0" class="talos-codice-r4-nota" role="status">{{ $t('harness.r4CommandsNone') }}</p>
        <section v-for="gruppo in gruppi" :key="gruppo.id" :aria-label="gruppo.titolo">
            <h3 class="talos-codice-r4-gruppo">{{ gruppo.titolo }}</h3>
            <ul class="talos-codice-r4-elenco" role="list">
                <li v-for="voce in gruppo.voci" :key="voce.id">
                    <button
                        type="button"
                        class="talos-codice-r4-azione"
                        :data-comando="voce.id"
                        :disabled="spenta(voce)"
                        @click="emit('comando', voce.id)"
                    >
                        <component :is="voce.icona" class="talos-codice-r4-azione-icona" aria-hidden="true" />
                        <span class="talos-codice-r4-azione-testo">
                            <span>{{ voce.titolo }}</span>
                            <small>{{ soloSulPc(voce) ? soloDalPc : voce.sottotitolo }}</small>
                        </span>
                    </button>
                </li>
            </ul>
        </section>
    </TalosMobileComposerSheet>
</template>
