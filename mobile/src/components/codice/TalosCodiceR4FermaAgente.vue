<script setup lang="ts">
/**
 * «Ferma» nella scheda Agenti (owner 29/10 notte): la parte BASSA della riga di un agente, sotto il suo contenuto — la conferma nella riga
 * e l'esito. PEZZO VERO: va in `src/components/codice/TalosCodiceR4FermaAgente.vue`, dentro ogni riga di `TalosCodiceR4Agenti.vue`
 * (`:125-142`, la riga diventa contenitore: vedi `SCHEDA-DI-CONSEGNA.md`, voce 3). Lo stato lo tiene la scheda (`fermaAgente.ts`).
 * ⛔ Nessun pezzo nuovo (owner 29/10: niente finestra, la conferma NELLA riga):
 *   · la conferma è quella del Centro download, che chiede «Annullare lo scaricamento?» dentro la riga del modello
 *     (`components/shell/TalosMobileDownloadCenterTrigger.vue:247-268`): riquadro col bordo, la frase in piccolo, due pulsanti affiancati da
 *     44 px, a sinistra quello che lascia com'è, a destra quello rosso (la terna del pericolo, la stessa di `TALOS_DANGER_ACTION_CLASS`,
 *     `lib/dangerAction.ts:25-31`); la domanda in testa con la riga «cosa» della nota dello Stop (`TalosCodiceR4Fermato.vue:28`);
 *   · «Lo fermo…» è la riga in corso dell'app (`TalosRigaInCorso`, compatta, la rotella), coi secondi solo dopo 2 s (UI-110,
 *     `useTalosSogliaSecondi`);
 *   · «Fermato», «Aveva già finito…» e il perché di un fallimento sono le righe d'esito dei Processi (`TalosCodiceR4Processi.vue:245-246`).
 */
import { computed } from 'vue'
import { useTalosI18n } from '@/i18n'
import TalosRigaInCorso from '@/components/chat/TalosRigaInCorso.vue'
import { useTalosSogliaSecondi } from '@/composables/useTalosSogliaSecondi'
import { testoFermaAgenteR4, type StatoRigaAgenteR4 } from '@/lib/harness/r4/fermaAgenteR4'
import '@/components/codice/codiceR4.css'

const props = defineProps<{ stato: StatoRigaAgenteR4; nome: string }>()
const emit = defineEmits<{ annulla: []; conferma: [] }>()
const { locale } = useTalosI18n()
const tr = (k: Parameters<typeof testoFermaAgenteR4>[0]) => testoFermaAgenteR4(k, locale.value)
const inCorso = computed(() => (props.stato.esito?.tipo === 'in-corso' ? props.stato.esito : null))
const soglia = useTalosSogliaSecondi({ attivo: () => inCorso.value !== null, inizio: () => inCorso.value?.dal ?? null })
const idTitolo = computed(() => `talos-ferma-agente-${props.nome.replace(/[^\w-]+/gu, '-')}`)
</script>

<template>
    <div
        v-if="stato.conferma"
        role="group"
        :aria-labelledby="idTitolo"
        data-testid="talos-codice-r4-agente-conferma"
        class="mt-[var(--talos-space-inline)] rounded-[var(--talos-radius-control)] border border-[var(--talos-border)] p-[var(--talos-space-control)]"
    >
        <p :id="idTitolo" class="text-sm font-medium leading-5">{{ tr('conferma.titolo') }}</p>
        <p class="mt-1 text-2xs leading-4 text-[var(--talos-muted)]">{{ tr('conferma.domanda') }} {{ tr('conferma.conseguenza') }}</p>
        <div class="mt-[var(--talos-space-inline)] grid grid-cols-2 gap-[var(--talos-space-inline)]">
            <button
                type="button"
                data-testid="talos-codice-r4-agente-annulla"
                class="talos-pressable min-h-touch rounded-[var(--talos-radius-control)] border border-[var(--talos-border)] px-[var(--talos-space-control)] text-xs"
                @click="emit('annulla')"
            >{{ tr('conferma.annulla') }}</button>
            <button
                type="button"
                data-testid="talos-codice-r4-agente-ferma"
                :aria-label="`${tr('conferma.ferma')}: ${nome}`"
                class="talos-pressable min-h-touch rounded-[var(--talos-radius-control)] border border-[var(--talos-danger-border)] bg-[var(--talos-danger-soft)] px-[var(--talos-space-control)] text-xs font-semibold text-[var(--talos-danger)]"
                @click="emit('conferma')"
            >{{ tr('conferma.ferma') }}</button>
        </div>
    </div>
    <div v-else-if="inCorso" data-testid="talos-codice-r4-agente-in-corso" class="mt-1">
        <TalosRigaInCorso :key="soglia.chiave.value" compatta segno="giro" :testo="tr('esito.inCorso')" :inizio="soglia.inizio.value" />
    </div>
    <p v-else-if="stato.esito?.tipo === 'fatto'" role="status" data-testid="talos-codice-r4-agente-esito" data-esito="fatto" class="talos-codice-r4-processo-avviso">{{ tr('esito.fatto') }}</p>
    <p v-else-if="stato.esito?.tipo === 'gia-finito'" role="status" data-testid="talos-codice-r4-agente-esito" data-esito="gia-finito" class="talos-codice-r4-processo-avviso">{{ tr('esito.giaFinito') }}</p>
    <p v-else-if="stato.esito?.tipo === 'errore'" role="alert" data-testid="talos-codice-r4-agente-esito" data-esito="errore" class="talos-codice-r4-processo-fermo">{{ stato.esito.messaggio }}</p>
</template>
