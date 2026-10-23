<script setup lang="ts">
import { computed } from 'vue'
import { useTalosI18n } from '@/i18n'
import { descriviRigaVivaR4, type StatoRigaVivaR4 } from '@/lib/harness/r4/compattazioneR4'

/*
 * ⭐ Ledger `LEDGER-RIGA-VIVA-CODICE-2026-10-21.md` — la riga viva del riassunto che il giro aspetta, sopra il compositore del Codice
 * (decisione dell'owner 21/10: si vede anche a conversazione scorsa, e Salta e Ferma stanno sotto il pollice). È la riga B1 del
 * desktop (`context-progress.js` @ f87c8f800, mockup approvato alla terza versione: UNA riga, senza riquadro, filo da 2 px in fondo).
 *
 *  · La frase che cambia di rado («Riassumo il contesto») la annuncia la regione di stato SEMPRE montata nel dock
 *    (`CodiceR4Screen.vue`, revisione avversaria 8: una regione che nasce già piena spesso non si annuncia); il percento e il tempo
 *    cambiano a ogni passo e stanno fuori, con `aria-live="off"` (MDN `status`, precedente `timer`).
 *  · `<progress>` senza `value` è indeterminato; con `value` porta `aria-valuetext` («62% · ~1 min»). Il filo a DUE tratti (in cache
 *    tenue, letto pieno) si disegna a parte, `aria-hidden`, con le larghezze in due variabili CSS.
 *  · Il resto (da leggere, in cache, trascorso, tentativo), che sul desktop sta nel suggerimento, qui è testo per chi usa lo schermo
 *    (`sr-only`, letto nell'ordine): la riga resta una.
 *  · I nomi dei pulsanti contengono la parola visibile (WCAG 2.5.3); 44 px di bersaglio.
 */
const props = defineProps<{
    stato: StatoRigaVivaR4
    /** Salta e Ferma: spenti per la compattazione chiesta a mano, che non ha un giro da fermare (desktop `aMano`). */
    azioni: boolean
    /** Lo Skip è partito e non è tornato: un clic solo. */
    saltando?: boolean
}>()
const emit = defineEmits<{ salta: []; ferma: [] }>()
const { t, locale } = useTalosI18n()
const vista = computed(() => descriviRigaVivaR4(props.stato, (chiave, valori) => t(chiave, valori), locale.value))
const percento = (x: number) => `${Math.round(Math.min(100, Math.max(0, x)) * 100) / 100}%`
const filo = computed(() => vista.value.tratti
    ? { '--talos-riga-viva-cache': percento(vista.value.tratti.cache), '--talos-riga-viva-letto': percento(vista.value.tratti.letto) }
    : undefined)
</script>

<template>
    <section
        data-testid="talos-codice-r4-riga-viva"
        class="talos-riga-viva"
        :data-fase="stato.tipo === 'progresso' ? stato.fase ?? undefined : 'inizio'"
    >
        <!-- la scala dell'app (`text-xs`, `--talos-ui-scale`): mai una grandezza assoluta (talosFontScale.test) -->
        <p class="talos-riga-viva__testo text-xs leading-5">
            <span data-testid="talos-codice-r4-riga-viva-stato" class="talos-riga-viva__stato">{{ vista.etichetta }}</span>
            <span
                v-if="vista.dettaglio"
                data-testid="talos-codice-r4-riga-viva-dettaglio"
                aria-live="off"
                class="talos-riga-viva__dettaglio"
            >{{ vista.dettaglio }}</span>
        </p>
        <span v-if="vista.titolo" data-testid="talos-codice-r4-riga-viva-titolo" class="sr-only">{{ vista.titolo }}</span>
        <span v-if="azioni" class="talos-riga-viva__azioni">
            <button
                type="button"
                data-testid="talos-codice-r4-riga-viva-salta"
                class="talos-riga-viva__azione talos-riga-viva__azione--forte talos-pressable text-xs"
                :aria-label="t('chat.compaction.live.skipLabel')"
                :disabled="saltando"
                @click="emit('salta')"
            >{{ t('chat.compaction.live.skip') }}</button>
            <button
                type="button"
                data-testid="talos-codice-r4-riga-viva-ferma"
                class="talos-riga-viva__azione talos-pressable text-xs"
                :aria-label="t('chat.compaction.live.stopLabel')"
                @click="emit('ferma')"
            >{{ t('chat.compaction.live.stop') }}</button>
        </span>
        <progress
            class="talos-riga-viva__barra"
            :aria-label="t('chat.compaction.live.barLabel')"
            :max="vista.determinato ? vista.totale ?? undefined : undefined"
            :value="vista.determinato ? vista.letti ?? undefined : undefined"
            :aria-valuetext="vista.determinato ? vista.valoreTesto : undefined"
        />
        <span v-if="vista.tratti" data-testid="talos-codice-r4-riga-viva-filo" class="talos-riga-viva__filo" aria-hidden="true" :style="filo">
            <span data-tratto="cache" /><span data-tratto="letto" />
        </span>
        <span v-else class="talos-riga-viva__filo talos-riga-viva__filo--attesa" aria-hidden="true"><span /></span>
    </section>
</template>

<style scoped>
.talos-riga-viva {
    position: relative;
    display: flex;
    align-items: center;
    gap: 0.5rem;
    min-width: 0;
    min-height: 44px;
    margin-bottom: 0.5rem;
    padding-bottom: 2px;
    color: var(--talos-muted);
    font-variant-numeric: tabular-nums;
}
/* revisione avversaria (9): a 360 px, in inglese o coi caratteri grandi il testo si accorcia coi puntini, mai sotto i pulsanti */
.talos-riga-viva__testo {
    display: flex;
    flex: 1 1 auto;
    min-width: 0;
    align-items: baseline;
    gap: 0.375rem;
    margin: 0;
    overflow: hidden;
    white-space: nowrap;
}
.talos-riga-viva__stato {
    flex: 0 1 auto;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    color: var(--talos-text);
    font-weight: 500;
}
.talos-riga-viva__dettaglio {
    flex: 0 1 auto;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
}
.talos-riga-viva__dettaglio::before {
    content: "·";
    margin-inline-end: 0.375rem;
}
.talos-riga-viva__azioni {
    display: flex;
    flex: none;
    gap: 0.25rem;
}
.talos-riga-viva__azione {
    min-width: 44px;
    min-height: 44px;
    padding-inline: 0.625rem;
    border-radius: var(--talos-radius-control, 0.5rem);
    color: var(--talos-muted);
    font-weight: 500;
}
.talos-riga-viva__azione--forte {
    color: var(--talos-accent);
    font-weight: 600;
}
.talos-riga-viva__azione:disabled {
    opacity: 0.5;
    cursor: default;
}
.talos-riga-viva__azione:focus-visible {
    outline: 2px solid var(--talos-accent);
    outline-offset: 2px;
}
/* Il `<progress>` resta per chi usa lo schermo: trasparente, sotto il filo che si vede (come sul desktop). */
.talos-riga-viva__barra {
    position: absolute;
    inset-inline: 0;
    bottom: 0;
    width: 100%;
    height: 2px;
    opacity: 0;
    pointer-events: none;
}
.talos-riga-viva__filo {
    position: absolute;
    inset-inline: 0;
    bottom: 0;
    display: flex;
    height: 2px;
    overflow: hidden;
    border-radius: 2px;
    background: color-mix(in srgb, var(--talos-border) 80%, transparent);
}
.talos-riga-viva__filo > [data-tratto="cache"] {
    width: var(--talos-riga-viva-cache, 0%);
    background: color-mix(in srgb, var(--talos-accent) 35%, transparent);
}
.talos-riga-viva__filo > [data-tratto="letto"] {
    width: var(--talos-riga-viva-letto, 0%);
    background: var(--talos-accent);
    transition: width 400ms var(--talos-motion-ease, ease-out);
}
.talos-riga-viva__filo--attesa {
    position: absolute;
}
.talos-riga-viva__filo--attesa > span {
    position: absolute;
    inset-block: 0;
    left: 0;
    width: 36%;
    border-radius: inherit;
    background: var(--talos-accent);
    animation: talos-riga-viva-scorre 1.4s ease-in-out infinite;
}
@keyframes talos-riga-viva-scorre {
    from { transform: translateX(-100%); }
    to { transform: translateX(280%); }
}
/* ⛔ Col movimento ridotto il tratto non scorre e non resta fermo fuori dal binario: occupa il filo, attenuato (come la chat). */
@media (prefers-reduced-motion: reduce) {
    .talos-riga-viva__filo--attesa > span {
        animation: none;
        transform: none;
        width: 100%;
        opacity: 0.55;
    }
    .talos-riga-viva__filo > [data-tratto="letto"] {
        transition: none;
    }
}
</style>
