<script setup lang="ts">
/**
 * ⭐⭐ IL CONSENSO SI CHIEDE PRIMA, UNA VOLTA SOLA — e poi non si tocca più niente.
 *
 * ## Da dove viene
 *
 * Owner 2026-08-12, verbatim: «all'attivazione fai partire una modale che
 * avverte l'utente che questo assistente sarà autonomo… e con il suo consenso
 * modificherai tutti i permessi in accesso, accetta sempre. In questo modo non
 * abbiamo bisogno di toccare nulla durante la modalità assistente… l'assistente
 * deve essere controllato senza toccare lo schermo».
 *
 * Ha ragione, e la ragione è strutturale: una scheda di consenso che compare
 * mentre parli a mani libere **contraddice la funzione stessa**. Gemini infatti
 * non ne mostra nessuna. Il consenso non sparisce — si sposta dove costa zero:
 * prima, una volta, guardando lo schermo di proposito.
 *
 * ## Cosa scrive, e cosa NON scrive
 *
 * Scrive i tre permessi su `allow` e li registra come **scelti**. Quel secondo
 * pezzo non è un dettaglio: `talosEffectiveToolPermissions` riporta al default
 * di oggi qualunque valore che nessuno abbia scelto, e senza la registrazione
 * questo consenso verrebbe cancellato dal primo avvio successivo — un sì che
 * evapora è peggio di un sì mai chiesto.
 *
 * ⛔ E NON introduce nessun interruttore nuovo. La grammatica dei permessi è una
 * sola — `allow / ask / deny` su `read / write / outbound` — ed è una regola di
 * questo progetto: un booleano «modalità autonoma» accanto ai tre valori
 * sarebbe una seconda verità sullo stesso fatto, cioè il modo documentato in cui
 * qui i permessi si sono già rotti una volta.
 *
 * ## La forma del testo
 *
 * Tre scelte deliberate, e nessuna è estetica:
 *
 *   1. dice **cosa fa**, non «accetto i termini». Un consenso che non descrive
 *      l'azione non è informato;
 *   2. dichiara di essere una macchina che sbaglia — dal 2 agosto 2026
 *      l'Articolo 50 dell'AI Act lo pretende per gli assistenti vocali, e
 *      comunque è vero;
 *   3. nomina la strada per tornare indietro **prima** di chiedere il sì. Dopo
 *      sarebbe una nota a piè di pagina.
 */
import { computed } from 'vue'
import { useTalosI18n } from '@/i18n'
import { ShieldCheck, Undo2, Volume2 } from '@lucide/vue'

const props = defineProps<{ aperta: boolean }>()
const emit = defineEmits<{ (e: 'consenti'): void, (e: 'annulla'): void }>()

const { t } = useTalosI18n()

/**
 * ⛔ Le tre righe non sono decorazione: sono le tre promesse che il consenso
 * scambia. Se una di queste smettesse di essere vera nel codice, questo testo
 * diventerebbe una bugia — ed è per questo che stanno qui e non in un'immagine.
 */
const promesse = computed(() => [
    { icona: ShieldCheck, testo: t('autonomia.promessaAgisce') },
    { icona: Volume2, testo: t('autonomia.promessaVoce') },
    { icona: Undo2, testo: t('autonomia.promessaRevoca') },
])
</script>

<template>
    <!-- ⛔ `role="dialog"` con `aria-modal`: chi naviga con lo screen reader deve
         sapere che dietro non c'è niente da leggere finché non ha risposto. -->
    <div
        v-if="props.aperta"
        class="fondale"
        data-testid="talos-consenso-autonomia"
        role="dialog"
        aria-modal="true"
        :aria-label="t('autonomia.titolo')"
    >
        <div class="scheda">
            <h2 class="titolo">{{ t('autonomia.titolo') }}</h2>
            <p class="corpo">{{ t('autonomia.corpo') }}</p>

            <ul class="promesse">
                <li v-for="(riga, indice) in promesse" :key="indice">
                    <component :is="riga.icona" class="segno" aria-hidden="true" />
                    <span>{{ riga.testo }}</span>
                </li>
            </ul>

            <div class="comandi">
                <!-- ⛔ «Non adesso» PRIMA, e non è cortesia: il pulsante che non
                     cambia niente deve essere quello che si tocca per sbaglio. -->
                <button
                    type="button"
                    class="tondo tondo--quieto"
                    data-testid="talos-consenso-annulla"
                    @click="emit('annulla')"
                >
                    {{ t('autonomia.rifiuta') }}
                </button>
                <button
                    type="button"
                    class="tondo tondo--forte"
                    data-testid="talos-consenso-accetta"
                    @click="emit('consenti')"
                >
                    {{ t('autonomia.accetta') }}
                </button>
            </div>
        </div>
    </div>
</template>

<style scoped>
.fondale {
    position: fixed;
    inset: 0;
    z-index: 60;
    display: grid;
    place-items: center;
    padding: 20px;
    background: color-mix(in oklab, var(--background) 72%, transparent);
    backdrop-filter: blur(6px);
}
.scheda {
    width: 100%;
    max-width: 420px;
    display: flex;
    flex-direction: column;
    gap: 14px;
    padding: 22px;
    border-radius: 24px;
    background: var(--card);
    border: 1px solid color-mix(in oklab, var(--primary) 22%, var(--border));
    box-shadow: 0 24px 60px color-mix(in oklab, var(--foreground) 22%, transparent);
}
.titolo {
    margin: 0;
    font-size: var(--text-lg);
    font-weight: 650;
    color: var(--foreground);
    text-wrap: balance;
}
.corpo {
    margin: 0;
    font-size: var(--text-sm);
    line-height: 1.5;
    color: var(--muted-foreground);
}
.promesse {
    margin: 0;
    padding: 0;
    list-style: none;
    display: flex;
    flex-direction: column;
    gap: 10px;
}
.promesse li {
    display: flex;
    align-items: flex-start;
    gap: 10px;
    font-size: var(--text-sm);
    line-height: 1.45;
    color: var(--foreground);
}
.segno {
    width: 18px;
    height: 18px;
    flex: none;
    margin-top: 2px;
    color: var(--primary);
}
.comandi {
    display: flex;
    gap: 10px;
    margin-top: 4px;
}
.tondo {
    flex: 1;
    padding: 12px 14px;
    border-radius: 999px;
    font-size: var(--text-sm);
    font-weight: 600;
    border: 1px solid transparent;
    transition: background-color 160ms ease, border-color 160ms ease;
}
.tondo--quieto {
    background: transparent;
    border-color: var(--border);
    color: var(--muted-foreground);
}
.tondo--forte {
    background: var(--primary);
    color: var(--primary-foreground);
}
@media (prefers-reduced-motion: reduce) {
    .tondo { transition: none; }
}
</style>
