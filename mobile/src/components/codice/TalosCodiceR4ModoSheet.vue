<script setup lang="ts">
/**
 * ⛔ K3 piano (ledger `LEDGER-K3-PIANO-2026-10-17.md`; owner 17/10 «Nel piede del compositore»): il foglio «Quanto può fare TALOS
 * qui» che la pillola del permesso apre, come il velo dei permessi del desktop r4 @ 701c6c0d2 (`#veloPermessi`,
 * `index.template.html:1504`; il «Modo di lavoro» di `legacy/app.js:9955`). Due gruppi radio: il modo (Lavora normalmente / Prima
 * prepara il piano) e il livello di permesso (le quattro scelte del desktop, con rischio e descrizione). Le scritture le fa chi monta
 * il foglio (`/settings`, o la prima richiesta se la sessione non c'è ancora); qui solo l'esito, con le frasi del desktop.
 * Scarti dal desktop (ledger): il modo è spento durante un giro, con la frase del desktop scritta sotto; gli esiti stanno in una riga
 * del foglio invece che in un toast; il suggerimento del chip (un `title`, che sul telefono nessuno vede) sta in cima.
 */
import { computed, nextTick, ref } from 'vue'
import TalosMobileComposerSheet from '@/components/chat/TalosMobileComposerSheet.vue'
import { useTalosI18n } from '@/i18n'
import { testoPianoR4 } from '@/lib/harness/r4/pianoR4'
import { livelliPermessoR4, type RiassuntoPermessoR4 } from '@/lib/harness/r4/permessiR4'
import { testoAutomazioniR4, testoPluraleAutomazioniR4 } from '@/lib/harness/r4/automazioniR4'
import { TETTO_AVVII_DA_SOLO_R4 } from '@/lib/harness/r4/coordinazioneR4'

type Esito = { ok: true } | { ok: false; messaggio: string }
const props = defineProps<{
    modalita: 'normale' | 'piano'
    permesso: string | null
    riassunto: RiassuntoPermessoR4
    giroInCorso: boolean
    scegliModo: (modo: 'normale' | 'piano') => Promise<Esito>
    scegliPermesso: (permesso: string) => Promise<Esito>
    /** K3 Coordinazione (`#veloPermessiCoordinazione` del desktop): lo stato della catena, e se la conversazione è partita. */
    coordinazione?: { accesa: boolean; delega: boolean; conosciuta: boolean; sessione: boolean }
    scegliCoordinazione?: (accesa: boolean) => Promise<Esito>
}>()
const emit = defineEmits<{ close: [] }>()
const { locale } = useTalosI18n()
const tr = (k: string) => testoPianoR4(k, locale.value)

const MODI = [
    { valore: 'normale' as const, chiave: 'app.plan.workNormally' },
    { valore: 'piano' as const, chiave: 'app.plan.planFirst' },
]
const livelli = computed(() => livelliPermessoR4(locale.value))
/** Le righe del suggerimento del chip, senza l'ultima («Cambia il permesso»: qui si sta già cambiando). */
const righeRiassunto = computed(() => props.riassunto.suggerimento.split('\n').slice(0, -1))
const inVolo = ref(false)
const esito = ref<{ tipo: 'ok' | 'no'; testo: string } | null>(null)

async function modo(valore: 'normale' | 'piano'): Promise<void> {
    if (inVolo.value || props.giroInCorso || valore === props.modalita) return
    inVolo.value = true
    const r = await props.scegliModo(valore)
    inVolo.value = false
    esito.value = r.ok ? { tipo: 'ok', testo: tr('app.permissions.workModeUpdated') }
        : { tipo: 'no', testo: `${tr('app.permissions.modeNotApplied')}: ${r.messaggio || tr('app.permissions.modeChangeHint')}` }
}
async function livello(valore: string): Promise<void> {
    if (inVolo.value || valore === props.permesso) return
    inVolo.value = true
    const r = await props.scegliPermesso(valore)
    inVolo.value = false
    esito.value = r.ok ? { tipo: 'ok', testo: tr('app.permissions.policyUpdated') } : { tipo: 'no', testo: `${tr('app.permissions.choiceNotApplied')}: ${r.messaggio}` }
}

/* ---- K3 Coordinazione: la sezione del foglio dei permessi del desktop (`legacy/app.js:9928-9953`) ---- */
const tc = (k: string) => testoAutomazioniR4(k, locale.value)
const coord = computed(() => props.coordinazione ?? { accesa: false, delega: false, conosciuta: true, sessione: false })
const coordFerma = computed(() => !coord.value.sessione || coord.value.delega || inVolo.value || !props.scegliCoordinazione)
// senza conversazione «Spenta» è un fatto (la prossima nasce spenta); in una catena con un anello mancante, nessuna parola
const coordStato = computed(() => (!coord.value.sessione || coord.value.conosciuta
    ? tc(coord.value.accesa ? 'app.sheets.permissions.coordinationStateOn' : 'app.sheets.permissions.coordinationStateOff') : ''))
const coordSotto = computed(() => (!coord.value.sessione ? tc('app.sheets.permissions.coordinationNoSession')
    : coord.value.delega ? tc('app.sheets.permissions.coordinationInDelegation')
        : testoPluraleAutomazioniR4('app.sheets.permissions.coordinationSubOne', 'app.sheets.permissions.coordinationSubMany', TETTO_AVVII_DA_SOLO_R4, locale.value)))
async function coordinazioneTocca(): Promise<void> {
    if (coordFerma.value || !props.scegliCoordinazione) return
    const accesa = !coord.value.accesa
    inVolo.value = true
    const r = await props.scegliCoordinazione(accesa)
    inVolo.value = false
    esito.value = r.ok ? { tipo: 'ok', testo: tc(accesa ? 'app.permissions.coordinationOn' : 'app.permissions.coordinationOff') }
        : { tipo: 'no', testo: `${tr('app.permissions.choiceNotApplied')}: ${r.messaggio}` }
}

/** Frecce dentro un gruppo radio: il fuoco passa alla riga vicina (la scelta resta un gesto esplicito: Invio o Spazio). */
async function frecce(evento: KeyboardEvent): Promise<void> {
    if (!['ArrowDown', 'ArrowUp', 'ArrowRight', 'ArrowLeft'].includes(evento.key)) return
    const gruppo = (evento.currentTarget as HTMLElement)
    const righe = [...gruppo.querySelectorAll<HTMLButtonElement>('[role="radio"]:not(:disabled)')]
    const i = righe.indexOf(document.activeElement as HTMLButtonElement)
    if (i < 0 || !righe.length) return
    evento.preventDefault()
    const passo = evento.key === 'ArrowDown' || evento.key === 'ArrowRight' ? 1 : -1
    await nextTick()
    righe[(i + passo + righe.length) % righe.length].focus()
}
</script>

<template>
    <TalosMobileComposerSheet :title="tr('modello.permissions.howMuchTalosCan')" testid="talos-codice-r4-modo-foglio" @close="emit('close')">
        <div class="flex flex-col gap-3 px-3 pb-3">
            <div data-parte="riassunto" class="text-xs leading-5 text-[var(--talos-muted)]">
                <p>{{ tr('modello.permissions.permissionsTheyApplyTo') }}</p>
                <p v-for="riga in righeRiassunto" :key="riga">{{ riga }}</p>
            </div>

            <section>
                <h3 id="talos-codice-r4-modo-titolo" class="text-sm font-medium leading-5">{{ tr('app.permissions.workModeLabel') }}</h3>
                <p class="text-xs leading-5 text-[var(--talos-muted)]">{{ tr('app.permissions.workModeHint') }}</p>
                <div role="radiogroup" aria-labelledby="talos-codice-r4-modo-titolo" class="mt-1.5 flex flex-col gap-1.5" @keydown="frecce">
                    <button
                        v-for="m in MODI"
                        :key="m.valore"
                        type="button"
                        role="radio"
                        :data-modo="m.valore"
                        :aria-checked="modalita === m.valore ? 'true' : 'false'"
                        :tabindex="modalita === m.valore ? 0 : -1"
                        :disabled="giroInCorso || inVolo"
                        class="talos-codice-r4-modo__riga"
                        @click="modo(m.valore)"
                    >
                        <span class="talos-codice-r4-domanda__segno" data-forma="tondo" aria-hidden="true" />
                        <span class="text-sm leading-5">{{ tr(m.chiave) }}</span>
                    </button>
                </div>
                <p v-if="giroInCorso" data-parte="modo-durante-il-giro" class="mt-1 text-xs leading-5 text-[var(--talos-muted)]">{{ tr('app.permissions.modeChangeHint') }}</p>
            </section>

            <section>
                <h3 id="talos-codice-r4-livello-titolo" class="text-sm font-medium leading-5">{{ tr('modello.permissions.permissionLevel') }}</h3>
                <div role="radiogroup" aria-labelledby="talos-codice-r4-livello-titolo" class="mt-1.5 flex flex-col gap-1.5" @keydown="frecce">
                    <button
                        v-for="l in livelli"
                        :key="l.valore"
                        type="button"
                        role="radio"
                        :data-livello="l.valore"
                        :aria-checked="permesso === l.valore ? 'true' : 'false'"
                        :tabindex="permesso === l.valore || (!permesso && l.consigliato) ? 0 : -1"
                        :disabled="inVolo"
                        class="talos-codice-r4-modo__riga"
                        @click="livello(l.valore)"
                    >
                        <span class="talos-codice-r4-domanda__segno" data-forma="tondo" aria-hidden="true" />
                        <span class="min-w-0 flex-1">
                            <span class="flex flex-wrap items-center gap-1.5">
                                <span class="text-sm leading-5">{{ l.titolo }}</span>
                                <span class="talos-codice-r4-modo__rischio" :data-tono="l.tono">{{ l.rischio }}</span>
                                <span v-if="l.consigliato" class="talos-codice-r4-domanda__consigliata">{{ tr('modello.permissions.recommended') }}</span>
                            </span>
                            <span class="block text-xs leading-4 text-[var(--talos-muted)]">{{ l.descrizione }}</span>
                        </span>
                    </button>
                </div>
            </section>

            <section>
                <h3 class="text-sm font-medium leading-5">{{ tc('app.sheets.permissions.coordination') }}</h3>
                <button
                    type="button"
                    role="switch"
                    data-testid="talos-codice-r4-coordinazione"
                    :aria-checked="coord.accesa ? 'true' : 'false'"
                    :disabled="coordFerma"
                    class="talos-codice-r4-modo__riga mt-1.5"
                    @click="coordinazioneTocca"
                >
                    <span class="talos-codice-r4-modo__interruttore" aria-hidden="true" />
                    <span class="min-w-0 flex-1">
                        <span class="flex flex-wrap items-center justify-between gap-1.5">
                            <span class="text-sm leading-5">{{ tc('app.sheets.permissions.coordinationTitle') }}</span>
                            <span v-if="coordStato" data-parte="stato" class="text-xs text-[var(--talos-muted)]">{{ coordStato }}</span>
                        </span>
                        <span data-parte="sotto" class="block text-xs leading-4 text-[var(--talos-muted)]">{{ coordSotto }}</span>
                    </span>
                </button>
            </section>

            <p v-if="esito?.tipo === 'ok'" role="status" data-parte="esito" class="text-xs leading-5 text-[var(--talos-success)]">{{ esito.testo }}</p>
            <p v-else-if="esito" role="alert" data-parte="esito" class="text-xs leading-5 text-[var(--talos-danger)]">{{ esito.testo }}</p>
        </div>
    </TalosMobileComposerSheet>
</template>
