<script setup lang="ts">
/**
 * ⛔ K3 piano (ledger `LEDGER-K3-PIANO-2026-10-17.md`; owner 17/10 «Carta + modo Normale/Piano»): il piano che TALOS presenta in Piano
 * (`present_plan`). La carta sta nella conversazione sotto la riga dell'attrezzo, come la carta d'approvazione e quella delle domande;
 * è UNA per piano e si aggiorna sul posto a ogni revisione (`eventiR4.ts`, decisione D4 del desktop). Parole e rami sono quelli di
 * `plan-artifact.js` del desktop r4 @ 701c6c0d2 (`pianoR4.ts`): le quattro scelte, la correzione fino a 4.000 caratteri, la ricevuta.
 * L'esito lo scrive SOLO r4 (`talos.plan`): un tocco spegne le scelte finché non arriva, e le riaccende solo se l'invio non riesce.
 */
import { computed, defineAsyncComponent, inject, nextTick, ref, watch } from 'vue'
import { ClipboardList } from '@lucide/vue'
import { Button } from '@/components/ui/button'
import { useTalosI18n } from '@/i18n'
import type { DecisionePianoR4, VocePianoR4 } from '@/lib/harness/r4/pianoChiave'
import { TALOS_APPROVAZIONI_R4 } from '@/lib/harness/r4/approvazioniPonte'
import { cartaPianoR4, CORREZIONE_MASSIMA_R4, erroreDecisionePianoR4, ricevutaPianoR4 } from '@/lib/harness/r4/pianoR4'

const TalosMobileMessageContent = defineAsyncComponent(() => import('@/components/chat/TalosMobileMessageContent.vue'))
const props = defineProps<{ voce: VocePianoR4 }>()
const ponte = inject(TALOS_APPROVAZIONI_R4, null)
const { locale } = useTalosI18n()

const carta = computed(() => cartaPianoR4(props.voce.proposta, locale.value))
const ricevuta = computed(() => ricevutaPianoR4(props.voce.proposta, props.voce.esito, locale.value))
const chiusa = computed(() => ricevuta.value.applicata)

/** In volo dal tocco alla risposta; `partita` resta vera dopo un sì del server, finché r4 non manda l'esito. */
const inviando = ref<DecisionePianoR4 | null>(null)
const partita = ref(false)
const errore = ref('')
const correzioneAperta = ref(false)
const correzione = ref('')
const pulsanteCorrezione = ref<HTMLButtonElement | null>(null)
const campo = ref<HTMLTextAreaElement | null>(null)
const spente = computed(() => inviando.value !== null || partita.value || !ponte)

// una revisione nuova è un'altra domanda: si riparte da capo
watch(() => [props.voce.proposta.revision, props.voce.proposta.requestId], () => {
    inviando.value = null
    partita.value = false
    errore.value = ''
    correzioneAperta.value = false
    correzione.value = ''
})

async function decidi(decisione: DecisionePianoR4, feedback?: string): Promise<void> {
    const { requestId, hash } = props.voce.proposta
    if (spente.value || !requestId || !hash || !ponte) return
    errore.value = ''
    inviando.value = decisione
    const esito = await ponte.decidiPiano({ requestId, decisione, hash, ...(feedback ? { feedback } : {}) })
    inviando.value = null
    if (esito.ok) { partita.value = true; return }
    errore.value = erroreDecisionePianoR4(esito.errore, locale.value)
}

async function apriCorrezione(si: boolean): Promise<void> {
    correzioneAperta.value = si
    await nextTick()
    if (si) campo.value?.focus()
    else pulsanteCorrezione.value?.focus()
}
function tocca(decisione: DecisionePianoR4): void {
    if (decisione === 'continua-a-pianificare') { void apriCorrezione(!correzioneAperta.value); return }
    void decidi(decisione)
}
function inviaCorrezione(): void {
    void decidi('continua-a-pianificare', correzione.value.trim().slice(0, CORREZIONE_MASSIMA_R4))
}
const nuova = computed(() => (props.voce.esito?.status === 'approved' ? props.voce.esito.nuovaSessionId ?? null : null))
</script>

<template>
    <section
        data-testid="talos-codice-r4-piano"
        :data-piano-id="voce.proposta.planId"
        :data-revisione="voce.proposta.revision"
        :data-stato="voce.esito?.status ?? voce.proposta.status"
        tabindex="-1"
        :aria-label="chiusa ? ricevuta.ariaLabel ?? undefined : carta.ariaLabel"
        class="talos-codice-r4-piano w-full min-w-0 max-w-[72ch] rounded-md border text-[var(--talos-text)] outline-none"
        :class="chiusa || !carta.approvabile ? 'border-[var(--talos-border)] bg-[var(--talos-panel)]' : 'talos-codice-r4-piano--attesa'"
    >
        <div class="flex min-w-0 items-center gap-2 px-3 pt-2.5">
            <ClipboardList class="size-4 shrink-0" :class="chiusa ? 'text-[var(--talos-muted)]' : 'text-[var(--talos-accent)]'" aria-hidden="true" />
            <h3 data-parte="titolo" class="min-w-0 flex-1 truncate text-sm font-semibold leading-5">{{ chiusa ? ricevuta.titolo : carta.titolo }}</h3>
            <span data-parte="stato" class="talos-codice-r4-piano__stato" :data-tono="chiusa ? voce.esito?.status : carta.approvabile ? 'attesa' : 'neutro'">{{ chiusa ? ricevuta.stato : carta.stato }}</span>
        </div>

        <div data-parte="corpo" tabindex="0" :aria-label="carta.corpoLabel" class="talos-codice-r4-piano__corpo mt-1.5">
            <TalosMobileMessageContent v-if="voce.proposta.text" :content="voce.proposta.text" line-breaks />
            <p v-else class="text-sm leading-5 text-[var(--talos-muted)]">{{ carta.corpoSenzaPiano }}</p>
        </div>

        <div class="px-3 pb-2.5">
            <!-- la ricevuta: la scrive l'evento del server, uguale in ogni finestra e dopo un ricaricamento -->
            <div v-if="chiusa" data-parte="ricevuta" role="status" class="mt-2">
                <p data-parte="frase" class="text-sm leading-5">{{ ricevuta.frase }}</p>
                <p v-if="ricevuta.correzione" data-parte="correzione-ricevuta" class="mt-1 text-sm italic leading-5 text-[var(--talos-muted)]">{{ ricevuta.correzione }}</p>
                <p v-if="ricevuta.meta" data-parte="meta" class="mt-1 text-2xs leading-4 tabular-nums text-[var(--talos-muted)]">{{ ricevuta.meta }}</p>
                <Button
                    v-if="ricevuta.apri && nuova && ponte"
                    type="button"
                    variant="secondary"
                    data-azione="apri-nuova"
                    class="mt-2 min-h-touch"
                    @click="ponte.apriFiglia(nuova)"
                >{{ ricevuta.apri }}</Button>
            </div>

            <!-- le quattro scelte, nell'ordine dell'owner: ogni riga dice che cosa succede -->
            <div
                v-else-if="carta.approvabile"
                data-parte="scelte"
                role="group"
                :aria-label="carta.gruppoLabel ?? undefined"
                :aria-busy="inviando ? 'true' : undefined"
                class="mt-2"
            >
                <p data-parte="domanda" class="text-xs font-medium leading-5 text-[var(--talos-muted)]">{{ carta.domanda }}</p>
                <div class="talos-codice-r4-piano__scelte mt-1">
                    <template v-for="scelta in carta.scelte" :key="scelta.decisione">
                        <button
                            :ref="(el) => { if (scelta.espandibile) pulsanteCorrezione = el as HTMLButtonElement | null }"
                            type="button"
                            :data-decisione="scelta.decisione"
                            :data-in-volo="inviando === scelta.decisione ? 'true' : undefined"
                            :aria-expanded="scelta.espandibile ? correzioneAperta : undefined"
                            :disabled="spente"
                            class="talos-codice-r4-piano__scelta"
                            @click="tocca(scelta.decisione)"
                        >
                            <span class="block text-sm font-medium leading-5">{{ scelta.titolo }}</span>
                            <span class="block text-xs leading-4 text-[var(--talos-muted)]">{{ scelta.descrizione }}</span>
                        </button>
                        <div v-if="scelta.espandibile && correzioneAperta && carta.correzione" data-parte="correzione" class="talos-codice-r4-piano__correzione">
                            <label :for="`piano-correzione-${voce.proposta.requestId}`" class="text-xs font-medium leading-5">{{ carta.correzione.etichetta }}</label>
                            <textarea
                                :id="`piano-correzione-${voce.proposta.requestId}`"
                                :ref="(el) => { campo = el as HTMLTextAreaElement | null }"
                                v-model="correzione"
                                :rows="carta.correzione.righe"
                                :maxlength="carta.correzione.massimo"
                                :placeholder="carta.correzione.segnaposto"
                                :disabled="spente"
                                class="talos-codice-r4-domanda__campo mt-1 py-2"
                            />
                            <div class="mt-1.5 flex flex-wrap justify-end gap-2">
                                <Button type="button" variant="ghost" data-azione="annulla" class="min-h-touch" :disabled="spente" @click="apriCorrezione(false)">{{ carta.correzione.pulsanti[0] }}</Button>
                                <Button type="button" data-azione="invia-correzione" class="min-h-touch" :disabled="spente" @click="inviaCorrezione">{{ carta.correzione.pulsanti[1] }}</Button>
                            </div>
                        </div>
                    </template>
                </div>
                <p v-if="errore" role="alert" data-parte="errore" class="mt-1.5 text-xs leading-5 text-[var(--talos-danger)]">{{ errore }}</p>
            </div>

            <p v-else data-parte="piede" class="mt-2 text-xs leading-5 text-[var(--talos-muted)]">{{ carta.piede }}</p>
        </div>
    </section>
</template>
