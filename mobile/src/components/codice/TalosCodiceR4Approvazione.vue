<script setup lang="ts">
/**
 * ⛔ K3-AP1 (ledger `LEDGER-K3-APPROVAZIONI-2026-10-16.md`; owner 16/10 «Carta nella conversazione»): r4 è fermo e chiede un permesso.
 * La carta sta nella conversazione sotto la riga dell'attrezzo, come sul desktop (`appendApprovalCard`), Hermes e Happy. Le parole
 * e i rami sono quelli del desktop (`approvazioniR4.ts`); la risposta passa dalla schermata (`TALOS_APPROVAZIONI_R4`). L'esito lo
 * scrive SOLO r4 (`ApprovalResolved`): un clic blocca i pulsanti, non chiude la carta da sé.
 */
import { computed, inject, onMounted, ref } from 'vue'
import { ShieldAlert } from '@lucide/vue'
import { Button } from '@/components/ui/button'
import { useTalosI18n } from '@/i18n'
import type { VoceApprovazioneR4 } from '@/lib/harness/r4/approvazioneChiave'
import { TALOS_APPROVAZIONI_R4 } from '@/lib/harness/r4/approvazioniPonte'
import { cartaApprovazioneR4, esitoApprovazioneR4, politicaDellaFigliaR4, testoApprovazioneR4, type SceltaApprovazioneR4 } from '@/lib/harness/r4/approvazioniR4'
import TalosCodiceR4ChiChiede from '@/components/codice/TalosCodiceR4ChiChiede.vue'
import { nomeDiRipiegoAttrezzoR4, nomeUmanoAttrezzoR4 } from '@/lib/harness/r4/agentiR4'

const props = defineProps<{ voce: VoceApprovazioneR4 }>()
const ponte = inject(TALOS_APPROVAZIONI_R4, null)
const { locale } = useTalosI18n()
const tr = (k: string, v?: Record<string, unknown>) => testoApprovazioneR4(k, locale.value, v)

/** «da un'altra finestra» solo se la carta è nata in attesa e la risposta non è partita da qui (`rispostaDaUnAltraFinestra`). */
const nataInAttesa = props.voce.esito === null
const rispostaQui = ref(false)
const inviando = ref(false)
/** Partita: i pulsanti restano spenti finché r4 non manda l'esito (come il desktop); tornano solo se l'invio non riesce. */
const partita = ref(false)
const nonInviata = ref(false)
const sempreNonSalvato = ref<string | null>(null)

/** La lista passa la voce così com'è nei metadati: qui si controlla (un `requestId` e un'`azione` oggetto, o niente carta). */
const valida = computed(() => typeof props.voce?.requestId === 'string' && Boolean(props.voce.azione) && typeof props.voce.azione === 'object')
const azione = computed<Record<string, unknown>>(() => (valida.value ? props.voce.azione : {}))
const tipo = computed(() => (typeof azione.value.tipo === 'string' ? azione.value.tipo : null))
const carta = computed(() => {
    // K3-AP3: la carta di una sotto-sessione si spiega con la politica che ha DECISO (`pending.politica`), mai con quella di qui
    if (props.voce.figlia) {
        const { politica, senzaPolitica } = politicaDellaFigliaR4(props.voce.figlia.politica)
        return cartaApprovazioneR4(azione.value, politica, locale.value, { senzaPolitica })
    }
    return cartaApprovazioneR4(azione.value, ponte?.politica() ?? { permessi: null, perAttrezzo: {} }, locale.value)
})
const esito = computed(() => (props.voce.esito
    ? esitoApprovazioneR4(props.voce.esito, { altrove: nataInAttesa && !rispostaQui.value }, locale.value)
    : null))
const tono = computed(() => (props.voce.esito ? (props.voce.esito.approvato ? 'si' : 'no') : 'attesa'))

async function rispondi(scelta: SceltaApprovazioneR4): Promise<void> {
    if (!ponte || inviando.value || partita.value) return
    inviando.value = true
    nonInviata.value = false
    rispostaQui.value = true
    const r = await ponte.rispondi(props.voce.requestId, scelta, tipo.value, props.voce.figlia ? { sessionId: props.voce.figlia.sessionId } : undefined)
    if (r.sempreNonSalvato && tipo.value) {
        const nome = nomeUmanoAttrezzoR4(tipo.value, locale.value) || nomeDiRipiegoAttrezzoR4(tipo.value)
        sempreNonSalvato.value = nome.charAt(0).toLocaleUpperCase(locale.value) + nome.slice(1)
    }
    if (!r.ok) {
        // come il desktop: la risposta non è partita, i pulsanti tornano e la carta lo dice
        rispostaQui.value = false
        nonInviata.value = true
    } else partita.value = true
    inviando.value = false
}

// una carta nata in attesa rilegge la politica: il «perché» dipende da regole che possono essere cambiate altrove
onMounted(() => { if (nataInAttesa && ponte && !props.voce.figlia) void ponte.leggiPolitica() })
</script>

<template>
    <section
        v-if="valida"
        data-testid="talos-approvazione"
        :data-tono="tono"
        :data-request="voce.requestId"
        :data-figlia="voce.figlia?.sessionId"
        class="talos-codice-r4-approvazione w-full min-w-0 max-w-[72ch] rounded-md border px-3 py-2.5 text-[var(--talos-text)]"
        :class="voce.esito ? 'border-[var(--talos-border)] bg-[var(--talos-panel)]' : 'border-[var(--talos-warning-border)] bg-[var(--talos-warning-soft)]'"
    >
        <TalosCodiceR4ChiChiede v-if="voce.figlia" :figlia="voce.figlia" />
        <p class="flex min-w-0 items-center gap-1.5 text-2xs leading-4" :class="voce.esito ? 'text-[var(--talos-muted)]' : 'text-[var(--talos-warning)]'">
            <ShieldAlert class="size-3.5 shrink-0" aria-hidden="true" />
            <span class="shrink-0">{{ carta.badge }}</span>
            <span v-if="carta.bersaglio" data-parte="bersaglio" class="min-w-0 truncate font-mono text-[var(--talos-text)]">{{ carta.bersaglio }}</span>
        </p>
        <p data-parte="perche" class="mt-1 text-sm leading-5">{{ carta.perche }}</p>
        <pre
            v-if="carta.codice"
            data-parte="codice"
            tabindex="0"
            class="talos-codice-r4-approvazione__codice mt-1.5"
            :aria-label="tr('chat.approval.exactCommand')"
        >{{ carta.codice }}</pre>
        <p v-if="carta.motivo" data-parte="motivo" class="mt-1.5 text-xs leading-5 text-[var(--talos-muted)]">{{ carta.motivo }}</p>

        <template v-if="!voce.esito">
            <div class="talos-codice-r4-approvazione__pulsanti mt-2">
                <Button
                    type="button"
                    variant="ghost"
                    data-scelta="nega"
                    class="talos-codice-r4-approvazione__nega min-h-touch"
                    :disabled="inviando || partita || !ponte"
                    @click="rispondi('nega')"
                >{{ carta.negaEtichetta }}</Button>
                <Button type="button" data-scelta="unaVolta" class="min-h-touch" :disabled="inviando || partita || !ponte" @click="rispondi('unaVolta')">{{ carta.unaVolta }}</Button>
                <Button
                    v-if="carta.terzo"
                    type="button"
                    variant="outline"
                    :data-scelta="carta.terzo.scelta"
                    class="talos-codice-r4-approvazione__terzo min-h-touch"
                    :disabled="inviando || partita || !ponte"
                    @click="rispondi(carta.terzo!.scelta)"
                >{{ carta.terzo.etichetta }}</Button>
            </div>
            <p data-parte="nota" class="mt-1.5 text-2xs leading-4 text-[var(--talos-muted)]">{{ carta.nota }}</p>
            <p v-if="nonInviata" role="alert" data-parte="non-inviata" class="mt-1 text-xs leading-5 text-[var(--talos-danger)]">{{ tr('app.approval.responseFailed') }}</p>
        </template>
        <template v-else>
            <p role="status" data-parte="esito" class="talos-codice-r4-approvazione__esito mt-2 text-sm font-medium leading-5" :data-esito="tono">{{ esito }}</p>
            <p v-if="sempreNonSalvato && voce.esito.approvato" data-parte="sempre-non-salvato" class="mt-1 text-xs leading-5 text-[var(--talos-muted)]">
                {{ tr('chat.approval.alwaysNotSaved', { attrezzo: sempreNonSalvato }) }}
            </p>
        </template>
    </section>
</template>
