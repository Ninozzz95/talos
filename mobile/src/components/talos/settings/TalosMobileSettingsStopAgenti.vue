<script setup lang="ts">
/**
 * «Ferma tutto» (owner 29/10/2026): la preferenza `stopConSottoAgenti` nelle Impostazioni, per dispositivo. PEZZO VERO: va in
 * `src/components/talos/settings/TalosMobileSettingsStopAgenti.vue`, montato in «Preferenze AI» (`TalosMobileSettingsAiDefaultsPanel.vue`,
 * dopo il tono `:124-136`): è lì che il telefono tiene come si comporta l'assistente (tono, visione, Libreria, salvataggio dei file).
 * Il valore sta in `settings.state.shell.stop_con_sotto_agenti` (`stores/settings.ts:132`, `TalosMobileShellPreferences`, scritto con
 * `settings.setShell`, come `image_attachment_consent` in `CodiceR4Screen.vue:876-877`).
 * ⛔ Nessun pezzo nuovo:
 *   · l'etichetta e la riga d'aiuto = quelle del tono (`TalosMobileSettingsAiDefaultsPanel.vue:125` e `:133-135`);
 *   · la scelta fra tre = il gruppo radio delle Impostazioni, quello della Lingua (`TalosMobileSettingsLanguagePanel.vue:53-77`: righe da
 *     64 px col ✓ d'accento a destra). Non la tendina del tono: tre scelte che si leggono tutte insieme, senza aprire un menu.
 */
import { computed } from 'vue'
import { Check } from '@lucide/vue'
import { useTalosI18n } from '@/i18n'
import { scelteImpostazioneStopR4, testoFermaTuttoR4, type PreferenzaStopR4 } from '@/lib/harness/r4/fermaTuttoR4'

const props = defineProps<{ modelValue: PreferenzaStopR4; disabled?: boolean }>()
const emit = defineEmits<{ 'update:modelValue': [valore: PreferenzaStopR4] }>()
const { locale } = useTalosI18n()
const scelte = computed(() => scelteImpostazioneStopR4(locale.value))
const titolo = computed(() => testoFermaTuttoR4('impostazioni.titolo', locale.value))

/** Le frecce del gruppo radio (APG): la scelta segue il fuoco, come i gruppi radio dell'app. */
function frecce(e: KeyboardEvent): void {
    const passo = e.key === 'ArrowDown' || e.key === 'ArrowRight' ? 1 : e.key === 'ArrowUp' || e.key === 'ArrowLeft' ? -1 : 0
    if (!passo) return
    e.preventDefault()
    const i = scelte.value.findIndex((s) => s.valore === props.modelValue)
    const prossima = scelte.value[(i + passo + scelte.value.length) % scelte.value.length]!
    emit('update:modelValue', prossima.valore)
    void Promise.resolve().then(() => (e.currentTarget as HTMLElement | null)?.querySelector<HTMLElement>(`[data-stop-agenti="${prossima.valore}"]`)?.focus())
}
</script>

<template>
    <section data-testid="talos-settings-stop-agenti">
        <span id="talos-settings-stop-agenti-titolo" class="text-xs font-semibold uppercase text-[var(--talos-muted)]">{{ titolo }}</span>
        <div
            role="radiogroup"
            aria-labelledby="talos-settings-stop-agenti-titolo"
            aria-describedby="talos-settings-stop-agenti-aiuto"
            class="mt-2 overflow-hidden rounded-2xl border border-[var(--talos-border)] bg-[var(--talos-panel)]/70"
            @keydown="frecce"
        >
            <button
                v-for="s in scelte"
                :key="s.valore"
                type="button"
                role="radio"
                :data-stop-agenti="s.valore"
                :aria-checked="modelValue === s.valore"
                :tabindex="modelValue === s.valore ? 0 : -1"
                :disabled="disabled"
                class="talos-pressable flex min-h-16 w-full items-center gap-3 border-b border-[var(--talos-border)] px-4 py-3 text-left last:border-b-0 disabled:opacity-60"
                @click="emit('update:modelValue', s.valore)"
            >
                <span class="min-w-0 flex-1 text-sm font-medium text-[var(--talos-text)]">{{ s.etichetta }}</span>
                <Check v-if="modelValue === s.valore" class="size-5 shrink-0 text-[var(--talos-accent)]" aria-hidden="true" />
            </button>
        </div>
        <span id="talos-settings-stop-agenti-aiuto" class="mt-1 block text-xs leading-5 text-[var(--talos-muted)]">{{ testoFermaTuttoR4('impostazioni.aiuto', locale) }}</span>
    </section>
</template>
