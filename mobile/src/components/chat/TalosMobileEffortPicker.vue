<script setup lang="ts">
/**
 * ⭐ IL PIEDE DEL RAGIONAMENTO del foglio «Modello e ragionamento» (owner 27/10/2026: mockup del compositore approvato, versione 6;
 * poi «tutto il piede molto più compatto in altezza e senza scritte inutili»). UNA riga: cervello · slider · livello · occhio.
 *   · Voci, livello mostrato e nota vengono dalla regola del desktop portata col J3 (`statoPillolaRagionamento`, desktop `c6d1cbff2`),
 *     non dalla scala del telefono: così restano «Auto» (nessuna scelta) e la nota A9 su ciò che parte davvero.
 *   · «Auto»: il pollice sta VUOTO sul livello che parte (o su «alto», come il J3), il livello dice «Auto».
 *   · La nota A9 c'è solo quando c'è qualcosa da dire (posto proposto nel ledger, in attesa del sì dell'owner sulla v7 del mockup).
 *   · Nella Chat il ragionamento esteso segue il livello (acceso con un livello, spento con «Off», J3-bis); nel Codice
 *     (`thinkingSeparate` falso) il livello basta.
 *   · Un modello che un livello non lo riceve (sul dispositivo): niente slider; «Ragionamento esteso» col suo interruttore se il
 *     modello ce l'ha, altrimenti la nota che lo dice.
 *   · «Mostra ragionamento» (sola vista, A14): un'icona-interruttore senza testo a schermo, col nome per chi ascolta lo schermo
 *     (posto proposto nel ledger, in attesa del sì dell'owner sulla v7 del mockup).
 *   · Il livello a schermo è aria-hidden: a chi ascolta lo dice il pollice (aria-valuetext), con «Auto» «Automatico · <livello>».
 */
import { computed } from 'vue'
import { Brain, Eye, EyeOff } from '@lucide/vue'
import TalosThemedSegmentedSlider from '@/components/talos/ui/TalosThemedSegmentedSlider.vue'
import TalosThemedSwitch from '@/components/talos/ui/TalosThemedSwitch.vue'
import { useTalosI18n } from '@/i18n'
import type { FiloRagionamento } from '@/lib/chat/pillolaRagionamento'
import { statoPillolaRagionamento, type ProfiloDellaPillola } from '@/lib/chat/statoPillolaRagionamento'
import type { TalosMobileEffortLevel } from '@/lib/mobileEffort'
import { useSettingsStore } from '@/stores/settings'

const props = withDefaults(defineProps<{
    profile: ProfiloDellaPillola | null
    /** Il livello scelto nel lessico del telefono; `null` = nessuna scelta («Auto»). */
    selectedEffort: string | null
    /** La mappa del filo (A9) quando chi monta il foglio ce l'ha. */
    wire?: FiloRagionamento | null
    thinking: boolean
    supportsThinking: boolean
    /** Vero nella Chat: il ragionamento esteso è un comando a sé e segue il livello. */
    thinkingSeparate?: boolean
}>(), { wire: null, thinkingSeparate: true })

const emit = defineEmits<{
    selectEffort: [level: TalosMobileEffortLevel]
    selectThinking: [enabled: boolean]
}>()

const { t } = useTalosI18n()
const settings = useSettingsStore()

const stato = computed(() => statoPillolaRagionamento({ profilo: props.profile, scelto: props.selectedEffort, filo: props.wire }))
const nomeDelLivello = (livello: string) => t(`chat.effort${livello.charAt(0).toUpperCase()}${livello.slice(1)}`)
const opzioni = computed(() => stato.value.voci.map((v) => ({ value: v.valore, label: nomeDelLivello(v.valore), testId: 'talos-mobile-effort-level' })))

/** Dove sta il pollice: il livello scelto; senza scelta quello che parte (A9), poi «alto», poi il primo — come il J3. */
const valore = computed(() => {
    const voci = stato.value.voci
    if (stato.value.mostrato) return stato.value.mostrato
    const nota = stato.value.nota
    const parte = nota && 'inviato' in nota ? voci.find((v) => v.valore === nota.inviato) : undefined
    return (parte ?? voci.find((v) => v.valore === 'high') ?? voci[0])?.valore ?? 'off'
})
const auto = computed(() => stato.value.mostrato === null)
const livello = computed(() => (auto.value ? t('chat.reasoningAutoShort') : nomeDelLivello(valore.value)))
const testoValore = computed(() => (auto.value ? `${t('chat.reasoningAutomatic')} · ${nomeDelLivello(valore.value)}` : ''))

const nota = computed(() => {
    const n = stato.value.nota
    if (!n) return ''
    const valori: Record<string, string> = {}
    if ('scelto' in n) valori.scelto = nomeDelLivello(n.scelto)
    if ('inviato' in n) valori.inviato = nomeDelLivello(n.inviato)
    return t(`chat.${n.chiave}`, valori)
})

function scegli(livelloScelto: string): void {
    const voce = stato.value.voci.find((v) => v.valore === livelloScelto)
    if (!voce) return
    emit('selectEffort', voce.valore as TalosMobileEffortLevel)
    const acceso = voce.valore !== 'off'
    if (props.thinkingSeparate && props.supportsThinking && acceso !== props.thinking) emit('selectThinking', acceso)
}

const mostraRagionamento = computed(() => settings.state.shell.show_reasoning !== false)
function alternaMostra(): void { void settings.setShell({ show_reasoning: !mostraRagionamento.value }) }
</script>

<template>
    <div v-if="profile" data-testid="talos-mobile-effort-picker" class="talos-effort-foot">
        <div class="talos-effort-foot__riga">
            <Brain class="talos-effort-foot__cervello" aria-hidden="true" />
            <template v-if="!stato.nascosta">
                <TalosThemedSegmentedSlider
                    test-id="talos-mobile-effort-slider"
                    class="talos-effort-foot__pista"
                    :model-value="valore"
                    :options="opzioni"
                    :ariaLabel="$t('chat.reasoningEffortLevels')"
                    senza-nomi
                    :vuoto="auto"
                    :testo-valore="testoValore"
                    @update:model-value="scegli"
                />
                <span data-testid="talos-mobile-effort-selected" class="talos-effort-foot__livello" aria-hidden="true">{{ livello }}</span>
            </template>
            <template v-else-if="supportsThinking">
                <span class="talos-effort-foot__nome">{{ $t('chat.extendedThinking') }}</span>
                <TalosThemedSwitch
                    test-id="talos-mobile-thinking-toggle"
                    :model-value="thinking"
                    :aria-label="$t('chat.extendedThinking')"
                    @update:model-value="emit('selectThinking', $event)"
                />
            </template>
            <span v-else class="talos-effort-foot__nome talos-effort-foot__tenue">{{ $t('chat.noReasoningSetting') }}</span>
            <button
                type="button"
                role="switch"
                data-testid="talos-mobile-show-reasoning"
                class="talos-pressable talos-effort-foot__occhio"
                :aria-checked="mostraRagionamento"
                :aria-label="$t('chat.showReasoning')"
                @click="alternaMostra"
            >
                <Eye v-if="mostraRagionamento" class="talos-effort-foot__icona" aria-hidden="true" />
                <EyeOff v-else class="talos-effort-foot__icona" aria-hidden="true" />
            </button>
        </div>
        <p v-if="nota" data-testid="talos-mobile-effort-note" class="talos-effort-foot__nota">{{ nota }}</p>
    </div>
</template>

<style scoped>
.talos-effort-foot__riga { display: flex; min-height: 3rem; align-items: center; gap: 0.25rem; }
.talos-effort-foot__cervello { width: 1.25rem; height: 1.25rem; flex-shrink: 0; color: var(--talos-muted); }
.talos-effort-foot__pista { flex: 1; min-width: 0; }
.talos-effort-foot__livello { flex-shrink: 0; min-width: 4.5rem; color: var(--talos-accent); font-size: var(--text-sm); font-weight: 600; text-align: end; }
.talos-effort-foot__nome { flex: 1; min-width: 0; padding-inline: 0.5rem; font-size: var(--text-sm); }
.talos-effort-foot__tenue { color: var(--talos-muted); font-size: var(--text-xs); }
.talos-effort-foot__occhio {
    display: inline-flex; flex-shrink: 0; width: var(--talos-touch-target); height: var(--talos-touch-target); align-items: center;
    justify-content: center; border-radius: 9999px; color: var(--talos-muted);
}
.talos-effort-foot__occhio[aria-checked="true"] { color: var(--talos-text); }
.talos-effort-foot__occhio:focus-visible { outline: 2px solid var(--talos-ring, var(--talos-accent)); outline-offset: 2px; }
.talos-effort-foot__icona { width: 1.125rem; height: 1.125rem; }
.talos-effort-foot__nota { margin: -0.25rem 0 0.25rem 1.75rem; color: var(--talos-muted); font-size: var(--text-xs); line-height: 1rem; }
</style>
