<script setup lang="ts">
/**
 * ⭐ J3 (24/10/2026) — LA PILLOLA DEL RAGIONAMENTO, accanto a quella del modello. Owner 24/10 (anomalia 4 di Marco): «Pillola sua,
 * come Hermes»; mockup approvato `MOCKUP-PILLOLA-RAGIONAMENTO-2026-10-24.html`; parità col desktop `79ac6dc46` + `c6d1cbff2`.
 *   · Cervello + livello + ▾. Senza una scelta dice «Auto»; il suggerimento e il nome accessibile dicono «Automatico».
 *   · Il menu è `TalosMobileReasoningMenu`, caricato solo all'apertura (J3-bis: tetti del pacchetto d'avvio).
 *   · Nascosta quando il modello non riceve un livello (`statoPillolaRagionamento`, regola portata dal desktop).
 *   · Dopo una scelta (J3-bis, Desktop): col DITO il fuoco resta sulla pillola, perché il campo aprirebbe la tastiera; con mouse,
 *     penna o tastiera torna al compositore (`scelto`), come il desktop e Hermes `reasoning-pill.tsx:74-80`.
 * ⛔ Owner 24/10 (`compositore-unico-chat-codice-24-10`): la monta SOLO `TalosMobileComposer`, cioè Chat e Codice insieme.
 */
import { computed, defineAsyncComponent, onBeforeUnmount, ref, watch } from 'vue'
import { Brain, ChevronDown } from '@lucide/vue'
import { useTalosI18n } from '@/i18n'
import type { FiloRagionamento } from '@/lib/chat/pillolaRagionamento'
import { statoPillolaRagionamento, type ProfiloDellaPillola } from '@/lib/chat/statoPillolaRagionamento'
import type { TalosMobileEffortLevel } from '@/lib/mobileEffort'

const TalosMobileReasoningMenu = defineAsyncComponent(() => import('@/components/chat/TalosMobileReasoningMenu.vue'))

const props = withDefaults(defineProps<{
    profile: ProfiloDellaPillola | null
    modelName: string
    /** Il livello scelto nel lessico del telefono; `null` = nessuna scelta («Auto»). */
    selectedEffort: string | null
    /** La mappa del filo (A9) quando chi monta il compositore ce l'ha; il telefono oggi non ne ha. */
    wire?: FiloRagionamento | null
}>(), { wire: null })

const emit = defineEmits<{
    selectEffort: [level: TalosMobileEffortLevel]
    /** Una scelta fatta senza il dito: chi monta la pillola rimette il fuoco nel campo di testo. */
    chosen: []
    /** PILL-TOCCO-01 (J3-ter): il menu aperto tiene il compositore espanso, come il fuoco dentro di lui. */
    openChange: [aperto: boolean]
}>()

const { t } = useTalosI18n()
const stato = computed(() => statoPillolaRagionamento({ profilo: props.profile, scelto: props.selectedEffort, filo: props.wire }))

const nomeDelLivello = (livello: string) => t(`chat.effort${livello.charAt(0).toUpperCase()}${livello.slice(1)}`)
const nota = computed(() => {
    const n = stato.value.nota
    if (!n) return ''
    const valori: Record<string, string> = {}
    if ('scelto' in n) valori.scelto = nomeDelLivello(n.scelto)
    if ('inviato' in n) valori.inviato = nomeDelLivello(n.inviato)
    return t(`chat.${n.chiave}`, valori)
})
const voci = computed(() => stato.value.voci.map((v) => ({ ...v, etichetta: nomeDelLivello(v.valore) })))
const nomeIntero = computed(() => (stato.value.mostrato ? nomeDelLivello(stato.value.mostrato) : t('chat.reasoningAutomatic')))
/** Nella pillola «Auto»: «Automatico» è la parola intera del suggerimento (desktop c6d1cbff2). */
const etichetta = computed(() => (stato.value.mostrato ? nomeDelLivello(stato.value.mostrato) : t('chat.reasoningAutoShort')))
/** Come Hermes (`reasoning-pill.tsx:55-60`) e il desktop: il suggerimento dice anche che cosa parte, quando non è il livello scelto. */
const titolo = computed(() => `${t('chat.reasoningLevel')}: ${nomeIntero.value}${nota.value ? `. ${nota.value}` : ''}`)

const pillola = ref<HTMLButtonElement | null>(null)
const aperto = ref<'scelta' | 'ultima' | null>(null)

function apri(daDove: 'scelta' | 'ultima' = 'scelta'): void {
    if (aperto.value || stato.value.nascosta) return
    aperto.value = daDove
    document.addEventListener('pointerdown', fuori, true)
}

/*
 * ⛔ PILL-TOCCO-01 (J3-ter): il fuoco si sposta PRIMA che il menu si smonti. Una voce col fuoco che sparisce fa scattare, sul
 * WebView, un `focusout` verso nessuno: il compositore lo leggeva come «il fuoco è uscito» e si richiudeva, pillola compresa.
 */
function chiudi(alPulsante = false): void {
    if (!aperto.value) return
    if (alPulsante) pillola.value?.focus()
    aperto.value = null
    document.removeEventListener('pointerdown', fuori, true)
}

function fuori(e: Event): void {
    const dove = e.target as Element | null
    if (pillola.value?.contains(dove) || dove?.closest?.('[data-testid="talos-reasoning-menu"]')) return
    chiudi()
}

function scegli(valore: string, conIlDito: boolean): void {
    emit('selectEffort', valore as TalosMobileEffortLevel)
    if (!conIlDito) emit('chosen')
    chiudi(conIlDito)
}

function tastiPillola(e: KeyboardEvent): void {
    if (e.key === 'ArrowDown') { e.preventDefault(); apri() }
    else if (e.key === 'ArrowUp') { e.preventDefault(); apri('ultima') }
}

watch(() => stato.value.nascosta, (nascosta) => { if (nascosta) chiudi() })
watch(aperto, (a) => emit('openChange', a !== null))
onBeforeUnmount(() => {
    document.removeEventListener('pointerdown', fuori, true)
    if (aperto.value) emit('openChange', false)
})
</script>

<template>
    <button
        v-if="!stato.nascosta"
        ref="pillola"
        type="button"
        data-testid="talos-composer-reasoning-pill"
        :data-livello="stato.mostrato ?? 'auto'"
        :aria-label="titolo"
        :title="titolo"
        aria-haspopup="menu"
        :aria-expanded="aperto ? 'true' : 'false'"
        class="talos-pressable talos-model-chip talos-reasoning-pill min-h-touch"
        style="max-width: 8.75rem"
        @pointerdown.prevent
        @click="aperto ? chiudi(true) : apri()"
        @keydown="tastiPillola"
    >
        <Brain class="size-4 shrink-0" aria-hidden="true" />
        <span data-testid="talos-composer-reasoning-pill-label">{{ etichetta }}</span>
        <ChevronDown class="size-3.5 shrink-0" aria-hidden="true" />
    </button>
    <TalosMobileReasoningMenu
        v-if="aperto && !stato.nascosta"
        :voci="voci"
        :model-name="modelName"
        :nota="nota"
        :da-dove="aperto"
        @scegli="scegli"
        @chiudi="chiudi"
    />
</template>
