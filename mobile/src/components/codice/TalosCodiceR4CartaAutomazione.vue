<script setup lang="ts">
/**
 * ⛔ K3 automazioni e fornitori (ledger `LEDGER-K3-AUTOMAZIONI-FORNITORI-COORDINAZIONE-2026-10-17.md`; owner 17/10 «Approva · Annulla ora,
 * Modifica dopo», «La carta lo dice»): r4 chiede il sì quando il MODELLO crea, cambia, riprende o fa partire un'automazione, o esclude
 * e riammette un fornitore a valle. È la carta d'approvazione di casa con le parole del desktop (`appendCartaAutomazione`,
 * `legacy/app.js:15567`): badge, nome, perché, il blocco con la bozza (in testa gli avvisi e le minacce), Annulla · Approva. Per le
 * automazioni a tempo una riga del mobile: sul telefono gira solo mentre il Codice è aperto (misurato sul Pad il 17/10).
 * L'esito lo scrive SOLO r4 (`ApprovalResolved`): un tocco blocca i pulsanti, non chiude la carta da sé.
 */
import { computed, inject, ref } from 'vue'
import { CalendarClock, ShieldAlert } from '@lucide/vue'
import { Button } from '@/components/ui/button'
import { useTalosI18n } from '@/i18n'
import type { VoceApprovazioneR4 } from '@/lib/harness/r4/approvazioneChiave'
import { TALOS_APPROVAZIONI_R4 } from '@/lib/harness/r4/approvazioniPonte'
import { esitoApprovazioneR4, testoApprovazioneR4, type SceltaApprovazioneR4 } from '@/lib/harness/r4/approvazioniR4'
import {
    bloccoCartaAutomazioneR4, bloccoCartaFornitoriR4, eCartaAutomazioneR4, notaDelTelefonoR4, testiCartaAutomazioneR4, testiCartaFornitoriR4, testoAutomazioniR4,
} from '@/lib/harness/r4/automazioniR4'

const props = defineProps<{ voce: VoceApprovazioneR4 }>()
const ponte = inject(TALOS_APPROVAZIONI_R4, null)
const { t, locale } = useTalosI18n()

const automazione = computed(() => eCartaAutomazioneR4(props.voce.azione))
const testi = computed(() => (automazione.value ? testiCartaAutomazioneR4(props.voce.azione, locale.value) : testiCartaFornitoriR4(props.voce.azione, locale.value)))
const blocco = computed(() => (automazione.value ? bloccoCartaAutomazioneR4(props.voce.azione, locale.value) : bloccoCartaFornitoriR4(props.voce.azione, locale.value)))
const telefono = computed(() => notaDelTelefonoR4(props.voce.azione))

/** «da un'altra finestra» solo se la carta è nata in attesa e la risposta non è partita da qui (come la carta di casa). */
const nataInAttesa = props.voce.esito === null
const rispostaQui = ref(false)
const inviando = ref(false)
const partita = ref(false)
const nonInviata = ref(false)
const esito = computed(() => (props.voce.esito ? esitoApprovazioneR4(props.voce.esito, { altrove: nataInAttesa && !rispostaQui.value }, locale.value) : null))
const tono = computed(() => (props.voce.esito ? (props.voce.esito.approvato ? 'si' : 'no') : 'attesa'))

async function rispondi(scelta: SceltaApprovazioneR4): Promise<void> {
    if (!ponte || inviando.value || partita.value) return
    inviando.value = true
    nonInviata.value = false
    rispostaQui.value = true
    const r = await ponte.rispondi(props.voce.requestId, scelta, null)
    if (!r.ok) {
        rispostaQui.value = false
        nonInviata.value = true
    } else partita.value = true
    inviando.value = false
}
</script>

<template>
    <section
        data-testid="talos-codice-r4-carta-automazione"
        :data-tono="tono"
        :data-request="voce.requestId"
        :data-tipo="(voce.azione as { tipo?: string }).tipo"
        class="talos-codice-r4-approvazione w-full min-w-0 max-w-[72ch] rounded-md border px-3 py-2.5 text-[var(--talos-text)]"
        :class="voce.esito ? 'border-[var(--talos-border)] bg-[var(--talos-panel)]' : 'border-[var(--talos-warning-border)] bg-[var(--talos-warning-soft)]'"
    >
        <p class="flex min-w-0 items-center gap-1.5 text-2xs leading-4" :class="voce.esito ? 'text-[var(--talos-muted)]' : 'text-[var(--talos-warning)]'">
            <CalendarClock v-if="automazione" class="size-3.5 shrink-0" aria-hidden="true" />
            <ShieldAlert v-else class="size-3.5 shrink-0" aria-hidden="true" />
            <span data-parte="badge" class="shrink-0">{{ testi.badge }}</span>
            <span v-if="testi.bersaglio" data-parte="bersaglio" class="min-w-0 truncate font-mono text-[var(--talos-text)]">{{ testi.bersaglio }}</span>
        </p>
        <p data-parte="perche" class="mt-1 text-sm leading-5">{{ testi.perche }}</p>

        <div class="talos-codice-r4-automazione mt-1.5">
            <template v-for="(pezzo, i) in blocco" :key="i">
                <div
                    v-if="pezzo.tipo === 'avvisi'"
                    data-blocco="avvisi"
                    :data-di="pezzo.di"
                    :role="pezzo.ruolo ?? undefined"
                    class="talos-codice-r4-automazione__avvisi"
                    :data-pericolo="pezzo.di === 'minacce' ? 'true' : undefined"
                >
                    <p data-parte="titolo" class="text-xs font-semibold leading-5">{{ pezzo.titolo }}</p>
                    <ul class="mt-0.5 list-disc pl-4 text-xs leading-5">
                        <li v-for="riga in pezzo.righe" :key="riga.testo" :data-avviso="riga.avviso ?? undefined">{{ riga.testo }}</li>
                    </ul>
                </div>
                <div v-else-if="pezzo.tipo === 'riga'" data-blocco="riga" class="talos-codice-r4-automazione__riga">
                    <span data-parte="k" class="text-[var(--talos-muted)]">{{ pezzo.k }}</span>
                    <span data-parte="v" class="min-w-0 break-words">{{ pezzo.v }}</span>
                </div>
                <div v-else data-blocco="testo" class="talos-codice-r4-automazione__testo">
                    <span data-parte="k" class="text-sm leading-5 text-[var(--talos-muted)]">{{ pezzo.k }}</span>
                    <p data-parte="testo" class="whitespace-pre-wrap break-words text-sm leading-5">{{ pezzo.testo }}</p>
                </div>
            </template>
        </div>

        <p v-if="testi.motivo" data-parte="motivo" class="mt-1.5 text-xs leading-5 text-[var(--talos-muted)]">{{ testi.motivo }}</p>
        <p v-if="telefono" data-parte="telefono" class="mt-1 text-xs leading-5 text-[var(--talos-muted)]">{{ t('harness.r4AutomationPhoneNote') }}</p>

        <template v-if="!voce.esito">
            <div class="talos-codice-r4-approvazione__pulsanti mt-2">
                <Button type="button" variant="ghost" data-scelta="nega" class="min-h-touch" :disabled="inviando || partita || !ponte" @click="rispondi('nega')">
                    {{ testoAutomazioniR4('sezioni.automations.v2.card.cancel', locale) }}
                </Button>
                <Button type="button" data-scelta="unaVolta" class="min-h-touch" :disabled="inviando || partita || !ponte" @click="rispondi('unaVolta')">
                    {{ testoAutomazioniR4('sezioni.automations.v2.card.approve', locale) }}
                </Button>
            </div>
            <p v-if="testi.nota" data-parte="nota" class="mt-1.5 text-2xs leading-4 text-[var(--talos-muted)]">{{ testi.nota }}</p>
            <p v-if="nonInviata" role="alert" data-parte="non-inviata" class="mt-1 text-xs leading-5 text-[var(--talos-danger)]">{{ testoApprovazioneR4('app.approval.responseFailed', locale) }}</p>
        </template>
        <template v-else>
            <p v-if="testi.nota" data-parte="nota" class="mt-1.5 text-2xs leading-4 text-[var(--talos-muted)]">{{ testi.nota }}</p>
            <p role="status" data-parte="esito" class="talos-codice-r4-approvazione__esito mt-2 text-sm font-medium leading-5" :data-esito="tono">{{ esito }}</p>
        </template>
    </section>
</template>
